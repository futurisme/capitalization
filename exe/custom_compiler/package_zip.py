#!/usr/bin/env python3
"""
Creates reproducible, ultra-lightweight ZIP distributions of /exe:
  1) public/downloads/CapLab13_Windows11_Native.zip (served by web app)
  2) exe/CapLab13_Windows11_Native.zip (local package inside /exe)
Always recompiles & verifies exe/game.exe using the custom PE64 compiler first.
"""

from __future__ import annotations

import pathlib
import zipfile

import shutil
from custom_pe64_compiler import compile_casm_to_pe64
from verify_pe64 import verify_pe64


EXCLUDED_DIRS = {".toolchain", "build", "build_native", "build_cl", "__pycache__", "dist"}
EXCLUDED_SUFFIXES = {".zip", ".pyc"}


def build_and_package(root: pathlib.Path) -> None:
    exe_dir = root / "exe"
    game_src = exe_dir / "builder" / "game_src.casm"
    game_exe = exe_dir / "game.exe"

    compile_casm_to_pe64(game_src, game_exe)
    verify_pe64(game_exe)

    # Mirror custom-setup-agent to public/exe/custom_setup_agent for direct website /exe access
    agent_src = exe_dir / "custom_setup_agent" / "SetupAgent.ps1"
    if agent_src.exists():
        agent_pub = root / "public" / "exe" / "custom_setup_agent" / "SetupAgent.ps1"
        agent_pub.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(agent_src, agent_pub)

    targets = [
        root / "public" / "downloads" / "CapLab13_Windows11_Native.zip",
        root / "public" / "exe" / "CapLab13_Windows11_Native.zip",
        exe_dir / "CapLab13_Windows11_Native.zip",
    ]
    for t in targets:
        t.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(t, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for item in sorted(exe_dir.rglob("*")):
                if item.is_dir():
                    continue
                rel = item.relative_to(exe_dir)
                if any(part in EXCLUDED_DIRS for part in rel.parts):
                    continue
                if item.suffix.lower() in EXCLUDED_SUFFIXES:
                    continue
                arcname = pathlib.PurePosixPath("CapLab13_Windows11") / rel.as_posix()
                zf.write(item, str(arcname))
        print(f"[ZIP Ready] {t} ({t.stat().st_size} bytes)")


if __name__ == "__main__":
    build_and_package(pathlib.Path(__file__).resolve().parents[2])
