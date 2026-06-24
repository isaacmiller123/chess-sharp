#!/usr/bin/env python3
"""
fetch_engines.py — download + verify the Stockfish engine binary (v0).

Implements docs/architecture.md §6 with the review's provenance assertion:
download a PINNED Stockfish release, extract the .exe, then UCI-PROBE it to
confirm it actually runs (verify by `uci`/`uciok`, not by filename).

v0 fetches Stockfish only. lc0 + Maia (human-feel play) are deferred to Loop 2.

Stdlib only (urllib + zipfile + subprocess). Output is git-ignored:
  resources/engine/win/stockfish.exe

Override the microarch with SF_VARIANT (e.g. x86-64, x86-64-bmi2). Default
x86-64-avx2 runs on any CPU from ~2013 on and is much faster than baseline.
"""
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TAG = "sf_18"
VARIANT = os.environ.get("SF_VARIANT", "x86-64-avx2")
ASSET = f"stockfish-windows-{VARIANT}.zip"
URL = f"https://github.com/official-stockfish/Stockfish/releases/download/{TAG}/{ASSET}"

TMP = os.path.join(ROOT, "data", "tmp")
OUT_DIR = os.path.join(ROOT, "resources", "engine", "win")
EXE = os.path.join(OUT_DIR, "stockfish.exe")


def download(url: str, dest: str) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "offline-chess-trainer-setup"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f, length=1 << 20)


def extract_exe(zip_path: str, dest_exe: str) -> None:
    with zipfile.ZipFile(zip_path) as z:
        exe_member = next((n for n in z.namelist() if n.lower().endswith(".exe")), None)
        if not exe_member:
            sys.exit(f"no .exe inside {zip_path}")
        with z.open(exe_member) as src, open(dest_exe, "wb") as out:
            shutil.copyfileobj(src, out)


def uci_probe(exe: str) -> str:
    """Run the binary, exchange UCI, assert uciok. Returns the engine id line."""
    p = subprocess.Popen(
        [exe], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, encoding="utf-8",
    )
    out, _ = p.communicate(input="uci\nisready\nquit\n", timeout=30)
    if "uciok" not in out:
        sys.exit(f"UCI probe FAILED — no 'uciok' in engine output:\n{out[:500]}")
    id_line = next((ln for ln in out.splitlines() if ln.startswith("id name")), "id name <unknown>")
    return id_line.replace("id name ", "").strip()


def main():
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    t0 = time.time()

    zip_path = os.path.join(TMP, ASSET)
    print(f"downloading {URL}", flush=True)
    download(URL, zip_path)
    print(f"  got {os.path.getsize(zip_path) // 1024 // 1024} MB in {time.time() - t0:.0f}s", flush=True)

    if os.path.exists(EXE):
        os.remove(EXE)
    extract_exe(zip_path, EXE)
    os.remove(zip_path)
    print(f"extracted -> {EXE} ({os.path.getsize(EXE) // 1024 // 1024} MB)", flush=True)

    engine_id = uci_probe(EXE)
    print(f"UCI probe OK -> {engine_id}")
    print(f"DONE in {time.time() - t0:.0f}s")
    # TODO(packaging): also fetch the corresponding GPL source tarball into
    # resources/licenses/stockfish-src-sf_18.tar.gz for offline GPLv3 §6 compliance.


if __name__ == "__main__":
    main()
