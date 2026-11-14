#!/usr/bin/env python3
"""
Structural & Binary Verifier for Custom-Compiled Windows 11 PE32+ Binaries.
Audits DOS/PE headers, CheckSum, section table, Import Directory / IAT slots,
and embedded RT_MANIFEST resource XML without relying on external tools.
"""

from __future__ import annotations

import pathlib
import struct
import sys

from custom_pe64_compiler import compute_pe_checksum


def rva_to_offset(rva: int, sections: list) -> int:
    for name, vsize, s_rva, rsize, roff, _ in sections:
        span = max(vsize, rsize)
        if s_rva <= rva < s_rva + span:
            return roff + (rva - s_rva)
    raise ValueError(f"RVA 0x{rva:X} does not map into any PE section")


def read_cstr(buf: bytes, off: int) -> str:
    end = buf.index(0, off)
    return buf[off:end].decode("ascii")


def verify_pe64(exe_path: pathlib.Path) -> None:
    raw = exe_path.read_bytes()
    assert raw[:2] == b"MZ", "Missing MZ header"
    e_lfanew = struct.unpack_from("<I", raw, 0x3C)[0]
    assert raw[e_lfanew:e_lfanew + 4] == b"PE\x00\x00", "Missing PE signature"

    coff_off = e_lfanew + 4
    machine, num_sec, _, _, _, opt_size, chars = struct.unpack_from("<HHIIIHH", raw, coff_off)
    assert machine == 0x8664, f"Expected AMD64 (0x8664), got 0x{machine:X}"
    assert opt_size == 0xF0, f"Expected PE32+ OptionalHeader (240), got {opt_size}"
    assert (chars & 0x0022) == 0x0022, "Missing EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE"

    opt_off = coff_off + 20
    magic = struct.unpack_from("<H", raw, opt_off)[0]
    assert magic == 0x020B, f"Expected PE32+ magic 0x020B, got 0x{magic:X}"

    entry_rva = struct.unpack_from("<I", raw, opt_off + 16)[0]
    stored_sum = struct.unpack_from("<I", raw, opt_off + 64)[0]
    subsystem, dll_chars = struct.unpack_from("<HH", raw, opt_off + 68)
    assert subsystem == 2, f"Expected WINDOWS_GUI (2), got {subsystem}"
    assert (dll_chars & 0x8160) == 0x8160, "Missing HIGH_ENTROPY_VA | DYNAMIC_BASE | NX_COMPAT"

    calc_sum = compute_pe_checksum(bytearray(raw), opt_off + 64)
    assert stored_sum == calc_sum, f"Checksum mismatch: stored=0x{stored_sum:X} calc=0x{calc_sum:X}"

    dd_off = opt_off + 112
    imp_rva, imp_size = struct.unpack_from("<II", raw, dd_off + 8)
    rsrc_rva, rsrc_size = struct.unpack_from("<II", raw, dd_off + 16)
    assert imp_rva != 0 and imp_size > 0, "Missing Import Directory"
    assert rsrc_rva != 0 and rsrc_size > 0, "Missing Resource Directory"

    sec_off = opt_off + 240
    sections = []
    for i in range(num_sec):
        n8, vsize, s_rva, rsize, roff, _, _, _, _, schars = struct.unpack_from(
            "<8sIIIIIIHHI", raw, sec_off + i * 40
        )
        name = n8.rstrip(b"\x00").decode("ascii")
        assert roff + rsize <= len(raw), f"Section {name} raw bounds exceed file"
        sections.append((name, vsize, s_rva, rsize, roff, schars))

    # Check entrypoint sits in executable .text section
    text_sec = sections[0]
    assert text_sec[0] == ".text" and (text_sec[5] & 0x20000020) == 0x20000020
    assert text_sec[2] <= entry_rva < text_sec[2] + text_sec[1], "Entrypoint outside .text"

    # Verify Import Directory DLLs & functions
    imp_off = rva_to_offset(imp_rva, sections)
    imported: dict[str, list[str]] = {}
    cursor = imp_off
    while True:
        ilt_rva, _, _, name_rva, iat_rva = struct.unpack_from("<IIIII", raw, cursor)
        if ilt_rva == 0 and name_rva == 0:
            break
        dll = read_cstr(raw, rva_to_offset(name_rva, sections))
        funcs = []
        ilt_off = rva_to_offset(ilt_rva, sections)
        iat_off = rva_to_offset(iat_rva, sections)
        idx = 0
        while True:
            ilt_val = struct.unpack_from("<Q", raw, ilt_off + idx * 8)[0]
            iat_val = struct.unpack_from("<Q", raw, iat_off + idx * 8)[0]
            assert ilt_val == iat_val, "ILT/IAT initial mismatch"
            if ilt_val == 0:
                break
            hint_off = rva_to_offset(ilt_val, sections)
            funcs.append(read_cstr(raw, hint_off + 2))
            idx += 1
        imported[dll] = funcs
        cursor += 20

    assert imported == {
        "KERNEL32.dll": ["GetModuleFileNameW", "GetFileAttributesW", "ExitProcess"],
        "SHELL32.dll": ["ShellExecuteW"],
        "USER32.dll": ["MessageBoxW"],
    }, f"Unexpected import table: {imported}"

    # Verify .rsrc RT_MANIFEST (24 -> 1 -> 1033)
    rsrc_off = rva_to_offset(rsrc_rva, sections)
    type_id, type_off = struct.unpack_from("<II", raw, rsrc_off + 16)
    assert type_id == 24 and (type_off & 0x80000000), "Missing RT_MANIFEST directory"
    name_id, name_off = struct.unpack_from("<II", raw, rsrc_off + (type_off & 0x7FFFFFFF) + 16)
    assert name_id == 1 and (name_off & 0x80000000), "Missing manifest ID 1"
    lang_id, data_entry_rel = struct.unpack_from("<II", raw, rsrc_off + (name_off & 0x7FFFFFFF) + 16)
    assert lang_id == 1033 and not (data_entry_rel & 0x80000000), "Missing manifest Lang 1033"

    data_rva, data_sz, _, _ = struct.unpack_from("<IIII", raw, rsrc_off + data_entry_rel)
    manifest_off = rva_to_offset(data_rva, sections)
    manifest_xml = raw[manifest_off:manifest_off + data_sz].decode("utf-8")
    assert 'level="requireAdministrator"' in manifest_xml, "Missing requireAdministrator in manifest"
    assert "PerMonitorV2" in manifest_xml, "Missing PerMonitorV2 in manifest"
    assert "SegmentHeap" in manifest_xml, "Missing SegmentHeap in manifest"

    print(
        f"[VERIFIED PE32+] {exe_path} ({len(raw)} bytes) | "
        f"Imports={sum(len(v) for v in imported.values())} | "
        f"Manifest=requireAdministrator | CheckSum=0x{stored_sum:08X}"
    )


if __name__ == "__main__":
    target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("exe/game.exe")
    verify_pe64(target)
