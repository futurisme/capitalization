#!/usr/bin/env python3
"""
CapLab 13 Independent x86_64 Macro-Assembler & Windows 11 PE32+ Linker
-----------------------------------------------------------------------
100% zero-third-party custom compiler/linker built strictly on Python stdlib.
Assembles .casm (CapLab x64 Assembly) directly into hardened Windows 11
PE32+ executables with:
  - PE32+ (AMD64) Headers + Standard PE Checksum
  - ASLR (HIGH_ENTROPY_VA | DYNAMIC_BASE) + NX_COMPAT
  - .text (RIP-relative x86_64 machine code)
  - .rdata (Import Directory Table, ILT, Hint/Name Table, IAT, UTF-16LE strings)
  - .data (BSS-backed zero-initialized RW static buffers)
  - .rsrc (Embedded Win32 RT_MANIFEST with requireAdministrator & Win11 settings)
"""

from __future__ import annotations

import pathlib
import re
import struct
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


def align_up(value: int, alignment: int) -> int:
    return (value + alignment - 1) & ~(alignment - 1)


def compute_pe_checksum(pe_bytes: bytearray, checksum_offset: int) -> int:
    struct.pack_into("<I", pe_bytes, checksum_offset, 0)
    if len(pe_bytes) % 2 != 0:
        pe_bytes.append(0)

    acc = 0
    for i in range(0, len(pe_bytes), 2):
        word = pe_bytes[i] | (pe_bytes[i + 1] << 8)
        acc += word
        acc = (acc & 0xFFFF) + (acc >> 16)
    acc = (acc & 0xFFFF) + (acc >> 16)
    return (acc + len(pe_bytes)) & 0xFFFFFFFF


REG64 = {
    "rax": 0, "rcx": 1, "rdx": 2, "rbx": 3,
    "rsp": 4, "rbp": 5, "rsi": 6, "rdi": 7,
    "r8": 8,  "r9": 9,  "r10": 10, "r11": 11,
    "r12": 12, "r13": 13, "r14": 14, "r15": 15,
}
REG32 = {
    "eax": 0, "ecx": 1, "edx": 2, "ebx": 3,
    "esp": 4, "ebp": 5, "esi": 6, "edi": 7,
    "r8d": 8, "r9d": 9, "r10d": 10, "r11d": 11,
    "r12d": 12, "r13d": 13, "r14d": 14, "r15d": 15,
}
REG16 = {
    "ax": 0, "cx": 1, "dx": 2, "bx": 3,
    "sp": 4, "bp": 5, "si": 6, "di": 7,
}


def rex_byte(w: int = 0, r: int = 0, x: int = 0, b: int = 0) -> bytes:
    val = 0x40 | (w << 3) | ((r >> 3) << 2) | ((x >> 3) << 1) | (b >> 3)
    return bytes([val]) if val != 0x40 else b""


def modrm(mod: int, reg: int, rm: int) -> int:
    return ((mod & 3) << 6) | ((reg & 7) << 3) | (rm & 7)


@dataclass
class Fixup:
    offset_in_text: int
    kind: str          # "rel32_code", "rip_sym"
    target: str
    instr_end: int


@dataclass
class ProgramIR:
    subsystem: int = 2  # 2 = WINDOWS_GUI, 3 = WINDOWS_CUI
    manifest_xml: str = ""
    imports: Dict[str, List[str]] = field(default_factory=dict)
    wstrings: Dict[str, str] = field(default_factory=dict)
    data_buffers: Dict[str, int] = field(default_factory=dict)
    text_lines: List[Tuple[int, str]] = field(default_factory=list)


def unescape_string(raw: str) -> str:
    return (
        raw.replace("\\\\", "\\")
        .replace('\\"', '"')
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
        .replace("\\0", "\0")
    )


def parse_int(token: str) -> int:
    token = token.strip()
    if token.lower().startswith("0x"):
        return int(token, 16)
    return int(token, 10)


def parse_casm(source: str) -> ProgramIR:
    ir = ProgramIR()
    section = ""
    manifest_lines: List[str] = []
    in_manifest = False

    for lineno, raw_line in enumerate(source.splitlines(), start=1):
        if in_manifest:
            if raw_line.strip() == ".end_manifest":
                ir.manifest_xml = "\n".join(manifest_lines)
                in_manifest = False
            else:
                manifest_lines.append(raw_line)
            continue

        # Strip comments outside string literals
        line = raw_line
        in_q = False
        esc = False
        for idx, ch in enumerate(line):
            if esc:
                esc = False
                continue
            if ch == "\\" and in_q:
                esc = True
                continue
            if ch == '"':
                in_q = not in_q
                continue
            if ch == ";" and not in_q:
                line = line[:idx]
                break

        stripped = line.strip()
        if not stripped:
            continue

        if stripped == ".manifest":
            in_manifest = True
            continue
        if stripped.startswith(".subsystem "):
            val = stripped.split(None, 1)[1].strip().upper()
            ir.subsystem = 2 if val in ("GUI", "WINDOWS_GUI", "2") else 3
            continue
        if stripped in (".imports", ".rdata", ".data", ".text"):
            section = stripped
            continue

        if section == ".imports":
            m = re.match(r'^([A-Za-z0-9_.\-]+)\s*:\s*(.+)$', stripped)
            if not m:
                raise SyntaxError(f"Line {lineno}: invalid .imports syntax: {stripped}")
            dll = m.group(1).strip()
            funcs = [f.strip() for f in m.group(2).split(",") if f.strip()]
            ir.imports.setdefault(dll, []).extend(funcs)
        elif section == ".rdata":
            m = re.match(r'^([A-Za-z0-9_]+)\s+wstring\s+"((?:[^"\\]|\\.)*)"$', stripped)
            if not m:
                raise SyntaxError(f"Line {lineno}: invalid .rdata wstring syntax: {stripped}")
            ir.wstrings[m.group(1)] = unescape_string(m.group(2))
        elif section == ".data":
            m = re.match(r'^([A-Za-z0-9_]+)\s+resb\s+(\S+)$', stripped)
            if not m:
                raise SyntaxError(f"Line {lineno}: invalid .data syntax: {stripped}")
            ir.data_buffers[m.group(1)] = parse_int(m.group(2))
        elif section == ".text":
            ir.text_lines.append((lineno, stripped))
        else:
            raise SyntaxError(f"Line {lineno}: statement outside section: {stripped}")

    return ir


def assemble_text(lines: List[Tuple[int, str]]) -> Tuple[bytearray, Dict[str, int], List[Fixup]]:
    code = bytearray()
    labels: Dict[str, int] = {}
    fixups: List[Fixup] = []

    def emit(b: bytes) -> None:
        code.extend(b)

    def split_operands(op_str: str) -> List[str]:
        parts: List[str] = []
        depth = 0
        cur: List[str] = []
        for ch in op_str:
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
            if ch == "," and depth == 0:
                parts.append("".join(cur).strip())
                cur = []
            else:
                cur.append(ch)
        if cur:
            parts.append("".join(cur).strip())
        return parts

    for lineno, stmt in lines:
        if stmt.endswith(":"):
            lbl = stmt[:-1].strip()
            if lbl in labels:
                raise SyntaxError(f"Line {lineno}: duplicate label {lbl}")
            labels[lbl] = len(code)
            continue

        parts = stmt.split(None, 1)
        mnem = parts[0].lower()
        ops = split_operands(parts[1]) if len(parts) > 1 else []

        if mnem == "ret" and not ops:
            emit(b"\xC3")
        elif mnem == "nop" and not ops:
            emit(b"\x90")
        elif mnem == "push" and len(ops) == 1 and ops[0] in REG64:
            r = REG64[ops[0]]
            if r >= 8:
                emit(b"\x41")
            emit(bytes([0x50 + (r & 7)]))
        elif mnem == "pop" and len(ops) == 1 and ops[0] in REG64:
            r = REG64[ops[0]]
            if r >= 8:
                emit(b"\x41")
            emit(bytes([0x58 + (r & 7)]))
        elif mnem == "sub" and len(ops) == 2 and ops[0] in REG64:
            r = REG64[ops[0]]
            imm = parse_int(ops[1])
            emit(rex_byte(w=1, b=r))
            if -128 <= imm <= 127:
                emit(bytes([0x83, modrm(3, 5, r)]) + struct.pack("<b", imm))
            else:
                emit(bytes([0x81, modrm(3, 5, r)]) + struct.pack("<i", imm))
        elif mnem == "add" and len(ops) == 2 and ops[0] in REG64:
            r = REG64[ops[0]]
            imm = parse_int(ops[1])
            emit(rex_byte(w=1, b=r))
            if -128 <= imm <= 127:
                emit(bytes([0x83, modrm(3, 0, r)]) + struct.pack("<b", imm))
            else:
                emit(bytes([0x81, modrm(3, 0, r)]) + struct.pack("<i", imm))
        elif mnem == "xor" and len(ops) == 2 and ops[0] in REG32 and ops[1] in REG32:
            dst, src = REG32[ops[0]], REG32[ops[1]]
            emit(rex_byte(w=0, r=src, b=dst))
            emit(bytes([0x31, modrm(3, src, dst)]))
        elif mnem == "xor" and len(ops) == 2 and ops[0] in REG64 and ops[1] in REG64:
            dst, src = REG64[ops[0]], REG64[ops[1]]
            emit(rex_byte(w=1, r=src, b=dst))
            emit(bytes([0x31, modrm(3, src, dst)]))
        elif mnem == "test" and len(ops) == 2 and ops[0] in REG16 and ops[1] in REG16:
            dst, src = REG16[ops[0]], REG16[ops[1]]
            emit(bytes([0x66, 0x85, modrm(3, src, dst)]))
        elif mnem == "test" and len(ops) == 2 and ops[0] in REG32 and ops[1] in REG32:
            dst, src = REG32[ops[0]], REG32[ops[1]]
            emit(rex_byte(w=0, r=src, b=dst))
            emit(bytes([0x85, modrm(3, src, dst)]))
        elif mnem == "test" and len(ops) == 2 and ops[0] in REG64 and ops[1] in REG64:
            dst, src = REG64[ops[0]], REG64[ops[1]]
            emit(rex_byte(w=1, r=src, b=dst))
            emit(bytes([0x85, modrm(3, src, dst)]))
        elif mnem == "cmp" and len(ops) == 2 and ops[0] in REG16:
            dst = REG16[ops[0]]
            imm = parse_int(ops[1])
            if -128 <= imm <= 127:
                emit(bytes([0x66, 0x83, modrm(3, 7, dst)]) + struct.pack("<b", imm))
            else:
                emit(bytes([0x66, 0x81, modrm(3, 7, dst)]) + struct.pack("<H", imm & 0xFFFF))
        elif mnem == "cmp" and len(ops) == 2 and ops[0] in REG32:
            dst = REG32[ops[0]]
            imm = parse_int(ops[1])
            emit(rex_byte(w=0, b=dst))
            if -128 <= imm <= 127:
                emit(bytes([0x83, modrm(3, 7, dst)]) + struct.pack("<b", imm))
            else:
                emit(bytes([0x81, modrm(3, 7, dst)]) + struct.pack("<I", imm & 0xFFFFFFFF))
        elif mnem == "cmp" and len(ops) == 2 and ops[0] in REG64:
            dst = REG64[ops[0]]
            imm = parse_int(ops[1])
            emit(rex_byte(w=1, b=dst))
            if -128 <= imm <= 127:
                emit(bytes([0x83, modrm(3, 7, dst)]) + struct.pack("<b", imm))
            else:
                emit(bytes([0x81, modrm(3, 7, dst)]) + struct.pack("<i", imm))
        elif mnem == "mov" and len(ops) == 2:
            dst_s, src_s = ops[0], ops[1]
            if dst_s in REG64 and src_s in REG64:
                d, s = REG64[dst_s], REG64[src_s]
                emit(rex_byte(w=1, r=s, b=d))
                emit(bytes([0x89, modrm(3, s, d)]))
            elif dst_s in REG32:
                d = REG32[dst_s]
                imm = parse_int(src_s)
                emit(rex_byte(w=0, b=d))
                emit(bytes([0xB8 + (d & 7)]) + struct.pack("<I", imm & 0xFFFFFFFF))
            elif dst_s in REG16 and src_s.startswith("[") and src_s.endswith("]"):
                base_s = src_s[1:-1].strip()
                if base_s not in REG64 or REG64[base_s] in (4, 5, 12, 13):
                    raise SyntaxError(f"Line {lineno}: unsupported base in {stmt}")
                d, b = REG16[dst_s], REG64[base_s]
                emit(b"\x66" + rex_byte(w=0, r=d, b=b) + bytes([0x8B, modrm(0, d, b)]))
            elif dst_s.startswith("[") and dst_s.endswith("]") and src_s in REG16:
                base_s = dst_s[1:-1].strip()
                if base_s not in REG64 or REG64[base_s] in (4, 5, 12, 13):
                    raise SyntaxError(f"Line {lineno}: unsupported base in {stmt}")
                b, s = REG64[base_s], REG16[src_s]
                emit(b"\x66" + rex_byte(w=0, r=s, b=b) + bytes([0x89, modrm(0, s, b)]))
            elif dst_s.startswith("word [") and dst_s.endswith("]"):
                base_s = dst_s[6:-1].strip()
                imm = parse_int(src_s)
                b = REG64[base_s]
                if b in (4, 5, 12, 13):
                    raise SyntaxError(f"Line {lineno}: unsupported base in {stmt}")
                emit(b"\x66" + rex_byte(w=0, b=b) + bytes([0xC7, modrm(0, 0, b)]) + struct.pack("<H", imm & 0xFFFF))
            elif dst_s.startswith("qword [rsp + ") and dst_s.endswith("]") and src_s in REG64:
                disp = parse_int(dst_s[len("qword [rsp + "):-1])
                s = REG64[src_s]
                emit(rex_byte(w=1, r=s))
                emit(bytes([0x89, modrm(1, s, 4), 0x24]) + struct.pack("<b", disp))
            elif dst_s.startswith("dword [rsp + ") and dst_s.endswith("]"):
                disp = parse_int(dst_s[len("dword [rsp + "):-1])
                imm = parse_int(src_s)
                emit(bytes([0xC7, modrm(1, 0, 4), 0x24]) + struct.pack("<bI", disp, imm & 0xFFFFFFFF))
            elif dst_s.startswith("qword [rsp + ") and dst_s.endswith("]"):
                disp = parse_int(dst_s[len("qword [rsp + "):-1])
                imm = parse_int(src_s)
                emit(b"\x48" + bytes([0xC7, modrm(1, 0, 4), 0x24]) + struct.pack("<bi", disp, imm))
            else:
                raise SyntaxError(f"Line {lineno}: unsupported mov form: {stmt}")
        elif mnem == "lea" and len(ops) == 2 and ops[0] in REG64:
            dst = REG64[ops[0]]
            rhs = ops[1]
            m_rip = re.match(r'^\[rip\s*\+\s*([A-Za-z0-9_]+)\]$', rhs)
            m_off = re.match(r'^\[([A-Za-z0-9_]+)\s*\+\s*(\S+)\]$', rhs)
            if m_rip:
                emit(rex_byte(w=1, r=dst))
                emit(bytes([0x8D, modrm(0, dst, 5)]))
                fix_off = len(code)
                emit(b"\x00\x00\x00\x00")
                fixups.append(Fixup(fix_off, "rip_sym", m_rip.group(1), len(code)))
            elif m_off and m_off.group(1) in REG64:
                base = REG64[m_off.group(1)]
                disp = parse_int(m_off.group(2))
                if base in (4, 12):
                    raise SyntaxError(f"Line {lineno}: rsp/r12 unsupported here")
                emit(rex_byte(w=1, r=dst, b=base))
                emit(bytes([0x8D, modrm(1, dst, base)]) + struct.pack("<b", disp))
            else:
                raise SyntaxError(f"Line {lineno}: unsupported lea form: {stmt}")
        elif mnem in ("jmp", "jz", "je", "jnz", "jne", "jbe", "ja") and len(ops) == 1:
            opcodes = {
                "jmp": b"\xE9",
                "jz":  b"\x0F\x84", "je":  b"\x0F\x84",
                "jnz": b"\x0F\x85", "jne": b"\x0F\x85",
                "jbe": b"\x0F\x86", "ja":  b"\x0F\x87",
            }
            emit(opcodes[mnem])
            fix_off = len(code)
            emit(b"\x00\x00\x00\x00")
            fixups.append(Fixup(fix_off, "rel32_code", ops[0], len(code)))
        elif mnem == "call" and len(ops) == 1:
            target = ops[0]
            m_iat = re.match(r'^\[rip\s*\+\s*([A-Za-z0-9_]+)\]$', target)
            if m_iat:
                emit(b"\xFF\x15")
                fix_off = len(code)
                emit(b"\x00\x00\x00\x00")
                fixups.append(Fixup(fix_off, "rip_sym", m_iat.group(1), len(code)))
            else:
                emit(b"\xE8")
                fix_off = len(code)
                emit(b"\x00\x00\x00\x00")
                fixups.append(Fixup(fix_off, "rel32_code", target, len(code)))
        else:
            raise SyntaxError(f"Line {lineno}: unrecognized instruction: {stmt}")

    return code, labels, fixups


def build_rsrc_section(rsrc_rva: int, manifest_bytes: bytes) -> bytes:
    """
    Constructs a standard PE .rsrc tree:
      Root Dir -> RT_MANIFEST (24) -> ID 1 -> Lang 1033 -> DataEntry -> manifest XML
    """
    # Layout sizes:
    # 0x00: Root dir (16 + 8 = 24)
    # 0x18: Type 24 dir (16 + 8 = 24)
    # 0x30: ID 1 dir (16 + 8 = 24)
    # 0x48: Data entry (16)
    # 0x58: Manifest bytes
    data_offset = 0x58
    data_rva = rsrc_rva + data_offset

    def dir_hdr(num_id: int) -> bytes:
        return struct.pack("<IIHHHH", 0, 0, 0, 0, 0, num_id)

    def dir_entry(entry_id: int, offset: int, is_dir: bool) -> bytes:
        return struct.pack("<II", entry_id, (0x80000000 | offset) if is_dir else offset)

    buf = bytearray()
    buf += dir_hdr(1) + dir_entry(24, 0x18, True)
    buf += dir_hdr(1) + dir_entry(1, 0x30, True)
    buf += dir_hdr(1) + dir_entry(1033, 0x48, False)
    buf += struct.pack("<IIII", data_rva, len(manifest_bytes), 0, 0)
    buf += manifest_bytes
    return bytes(buf)


def compile_casm_to_pe64(source_path: pathlib.Path, out_path: pathlib.Path) -> None:
    ir = parse_casm(source_path.read_text(encoding="utf-8"))
    text_code, labels, fixups = assemble_text(ir.text_lines)

    if "_start" not in labels:
        raise ValueError("Missing _start entry label in .text")

    SECTION_ALIGN = 0x1000
    FILE_ALIGN = 0x200
    IMAGE_BASE = 0x0000000140000000

    # Section RVAs
    text_rva = 0x1000
    text_vsize = len(text_code)
    text_rsize = align_up(text_vsize, FILE_ALIGN)

    rdata_rva = text_rva + align_up(max(1, text_vsize), SECTION_ALIGN)

    # Build .rdata (Import Directory, ILT, IAT, Strings, UTF-16LE literals)
    dll_names = list(ir.imports.keys())
    num_dlls = len(dll_names)
    idt_size = (num_dlls + 1) * 20

    total_funcs = sum(len(v) for v in ir.imports.values())
    ilt_size = (total_funcs + num_dlls) * 8
    iat_offset = idt_size + ilt_size
    iat_size = ilt_size

    # Reserve UTF-16LE string offsets after IAT
    cursor = align_up(iat_offset + iat_size, 8)
    sym_rvas: Dict[str, int] = {}

    rdata_strings = bytearray()
    for sym_name, text_val in ir.wstrings.items():
        while len(rdata_strings) % 2 != 0:
            rdata_strings.append(0)
        sym_rvas[sym_name] = rdata_rva + cursor + len(rdata_strings)
        rdata_strings.extend((text_val + "\0").encode("utf-16-le"))

    hint_base_offset = cursor + len(rdata_strings)
    hint_base_offset = align_up(hint_base_offset, 2)
    hint_blob = bytearray()
    dll_name_rvas: Dict[str, int] = {}
    func_hint_rvas: Dict[Tuple[str, str], int] = {}

    for dll in dll_names:
        dll_name_rvas[dll] = rdata_rva + hint_base_offset + len(hint_blob)
        hint_blob.extend(dll.encode("ascii") + b"\x00")
        if len(hint_blob) % 2 != 0:
            hint_blob.append(0)
        for fn in ir.imports[dll]:
            func_hint_rvas[(dll, fn)] = rdata_rva + hint_base_offset + len(hint_blob)
            hint_blob.extend(b"\x00\x00" + fn.encode("ascii") + b"\x00")
            if len(hint_blob) % 2 != 0:
                hint_blob.append(0)

    rdata_buf = bytearray(hint_base_offset + len(hint_blob))
    # Populate wstrings
    str_start = cursor
    rdata_buf[str_start:str_start + len(rdata_strings)] = rdata_strings
    rdata_buf[hint_base_offset:hint_base_offset + len(hint_blob)] = hint_blob

    # Populate Import Directory Table, ILT, and IAT
    ilt_cursor = idt_size
    iat_cursor = iat_offset
    for i, dll in enumerate(dll_names):
        ilt_rva = rdata_rva + ilt_cursor
        iat_rva = rdata_rva + iat_cursor
        struct.pack_into(
            "<IIIII", rdata_buf, i * 20,
            ilt_rva, 0, 0, dll_name_rvas[dll], iat_rva
        )
        for fn in ir.imports[dll]:
            sym_rvas[fn] = rdata_rva + iat_cursor
            hint_rva = func_hint_rvas[(dll, fn)]
            struct.pack_into("<Q", rdata_buf, ilt_cursor, hint_rva)
            struct.pack_into("<Q", rdata_buf, iat_cursor, hint_rva)
            ilt_cursor += 8
            iat_cursor += 8
        # Null terminator for this DLL's ILT/IAT
        ilt_cursor += 8
        iat_cursor += 8

    rdata_vsize = len(rdata_buf)
    rdata_rsize = align_up(rdata_vsize, FILE_ALIGN)

    # .data section
    data_rva = rdata_rva + align_up(max(1, rdata_vsize), SECTION_ALIGN)
    data_cursor = 0
    for buf_name, buf_bytes in ir.data_buffers.items():
        data_cursor = align_up(data_cursor, 16)
        sym_rvas[buf_name] = data_rva + data_cursor
        data_cursor += buf_bytes
    data_vsize = max(16, data_cursor)
    data_buf = bytearray(data_vsize)
    data_rsize = align_up(data_vsize, FILE_ALIGN)

    # .rsrc section
    rsrc_rva = data_rva + align_up(max(1, data_vsize), SECTION_ALIGN)
    manifest_bytes = ir.manifest_xml.strip().encode("utf-8") + b"\n"
    rsrc_buf = build_rsrc_section(rsrc_rva, manifest_bytes)
    rsrc_vsize = len(rsrc_buf)
    rsrc_rsize = align_up(rsrc_vsize, FILE_ALIGN)

    # Patch RIP-relative and local relative fixups in .text
    for fx in fixups:
        if fx.kind == "rel32_code":
            if fx.target not in labels:
                raise ValueError(f"Unresolved code label: {fx.target}")
            rel = labels[fx.target] - fx.instr_end
            struct.pack_into("<i", text_code, fx.offset_in_text, rel)
        elif fx.kind == "rip_sym":
            if fx.target not in sym_rvas:
                raise ValueError(f"Unresolved symbol: {fx.target}")
            instr_end_rva = text_rva + fx.instr_end
            disp = sym_rvas[fx.target] - instr_end_rva
            struct.pack_into("<i", text_code, fx.offset_in_text, disp)

    # Headers layout
    e_lfanew = 0x80
    num_sections = 4
    size_of_headers = align_up(e_lfanew + 4 + 20 + 240 + num_sections * 40, FILE_ALIGN)
    size_of_image = rsrc_rva + align_up(max(1, rsrc_vsize), SECTION_ALIGN)

    text_raw_off = size_of_headers
    rdata_raw_off = text_raw_off + text_rsize
    data_raw_off = rdata_raw_off + rdata_rsize
    rsrc_raw_off = data_raw_off + data_rsize
    total_file_size = rsrc_raw_off + rsrc_rsize

    pe = bytearray(total_file_size)

    # DOS Header + tiny DOS stub
    struct.pack_into("<H", pe, 0x00, 0x5A4D)  # "MZ"
    struct.pack_into("<I", pe, 0x3C, e_lfanew)
    dos_msg = b"\x0E\x1F\xBA\x0E\x00\xB4\x09\xCD\x21\xB8\x01\x4C\xCD\x21CapLab13 Win64 PE\r\n$"
    pe[0x40:0x40 + len(dos_msg)] = dos_msg

    # PE Signature
    pe[e_lfanew:e_lfanew + 4] = b"PE\x00\x00"

    # COFF File Header (20 bytes)
    coff_off = e_lfanew + 4
    struct.pack_into(
        "<HHIIIHH", pe, coff_off,
        0x8664,       # Machine = AMD64
        num_sections,
        0x6916A000,   # Reproducible timestamp (Nov 2026)
        0, 0,         # PointerToSymbolTable, NumberOfSymbols
        0x00F0,       # SizeOfOptionalHeader (240)
        0x0022,       # Characteristics: EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE
    )

    # Optional Header PE32+ (240 bytes)
    opt_off = coff_off + 20
    entry_rva = text_rva + labels["_start"]
    struct.pack_into(
        "<HBBIIIII", pe, opt_off,
        0x020B,       # Magic = PE32+
        13, 0,        # Linker 13.0
        text_rsize,
        rdata_rsize + data_rsize + rsrc_rsize,
        0,
        entry_rva,
        text_rva,
    )
    struct.pack_into(
        "<QIIHHHHHHIIIIHHQQQQII", pe, opt_off + 24,
        IMAGE_BASE,
        SECTION_ALIGN,
        FILE_ALIGN,
        10, 0,        # OS 10.0 (Windows 10/11)
        13, 0,        # Image 13.0
        6, 0,         # Subsystem 6.0
        0,            # Win32VersionValue
        size_of_image,
        size_of_headers,
        0,            # CheckSum (patched at end)
        ir.subsystem, # 2 = WINDOWS_GUI, 3 = WINDOWS_CUI
        0x8160,       # HIGH_ENTROPY_VA | DYNAMIC_BASE | NX_COMPAT | TERMINAL_SERVER_AWARE
        0x100000, 0x1000,
        0x100000, 0x1000,
        0,
        16,
    )

    # Data Directories (16 entries * 8 bytes = 128 bytes) at opt_off + 112
    dd_off = opt_off + 112
    # [1] Import Directory
    struct.pack_into("<II", pe, dd_off + 1 * 8, rdata_rva, idt_size)
    # [2] Resource Directory
    struct.pack_into("<II", pe, dd_off + 2 * 8, rsrc_rva, rsrc_vsize)
    # [12] IAT Directory
    struct.pack_into("<II", pe, dd_off + 12 * 8, rdata_rva + iat_offset, iat_size)

    # Section Headers (4 * 40 bytes)
    sec_off = opt_off + 240
    sections = [
        (b".text\x00\x00\x00",  text_vsize,  text_rva,  text_rsize,  text_raw_off,  0x60000020),
        (b".rdata\x00\x00",     rdata_vsize, rdata_rva, rdata_rsize, rdata_raw_off, 0x40000040),
        (b".data\x00\x00\x00",  data_vsize,  data_rva,  data_rsize,  data_raw_off,  0xC0000040),
        (b".rsrc\x00\x00\x00",  rsrc_vsize,  rsrc_rva,  rsrc_rsize,  rsrc_raw_off,  0x40000040),
    ]
    for idx, (name8, vsize, rva, rsize, roff, chars) in enumerate(sections):
        struct.pack_into(
            "<8sIIIIIIHHI", pe, sec_off + idx * 40,
            name8, vsize, rva, rsize, roff, 0, 0, 0, 0, chars
        )

    # Copy Section Raw Data
    pe[text_raw_off:text_raw_off + len(text_code)] = text_code
    pe[rdata_raw_off:rdata_raw_off + len(rdata_buf)] = rdata_buf
    pe[data_raw_off:data_raw_off + len(data_buf)] = data_buf
    pe[rsrc_raw_off:rsrc_raw_off + len(rsrc_buf)] = rsrc_buf

    # Patch PE CheckSum
    checksum = compute_pe_checksum(pe, opt_off + 64)
    struct.pack_into("<I", pe, opt_off + 64, checksum)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(pe)
    print(
        f"[CapLab Custom PE64 Compiler] Built {out_path} ({len(pe)} bytes, "
        f"entry=0x{entry_rva:04X}, checksum=0x{checksum:08X})"
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: custom_pe64_compiler.py <input.casm> <output.exe>", file=sys.stderr)
        sys.exit(2)
    compile_casm_to_pe64(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
