#!/usr/bin/env python3.14
"""
Fetch the AI4Bharat Aksharantar Odia (`ori`) transliteration pairs.

    https://huggingface.co/datasets/ai4bharat/Aksharantar/resolve/main/ori.zip

Ungated and public, so a plain HTTPS GET with `urllib` is enough — no
`huggingface_hub`, no `datasets`, no pip. The URL 302-redirects to a CDN;
`urllib` follows that on its own.

The script is idempotent: an already-downloaded archive of the right size is
left alone. After extraction it prints the discovered file layout and a few
sample records, so the on-disk format is documented by the tool that reads it
rather than by a comment that can drift.

Licence: Aksharantar is released under CC-BY / CC0 by AI4Bharat. See
`core/data/PROVENANCE.md`, which `build_lexicon.py` writes.

Usage:
    python3 download.py            # download + extract + describe
    python3 download.py --force    # re-download even if present
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

URL = "https://huggingface.co/datasets/ai4bharat/Aksharantar/resolve/main/ori.zip"

#: Verified content-length of the archive, in bytes. A download that misses
#: this is a redirect page or a truncated stream, not the dataset.
EXPECTED_BYTES = 9_518_458

#: How far the actual size may drift before we complain. The file is a fixed
#: release artifact, so this is deliberately tight.
SIZE_TOLERANCE = 0.02

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
ZIP_PATH = RAW / "ori.zip"
EXTRACT_DIR = RAW / "ori"

#: Some CDNs reject the stock urllib agent.
USER_AGENT = "odia-transliteration-build-data/0.1 (+stdlib urllib)"


# --------------------------------------------------------------------- #
# Download
# --------------------------------------------------------------------- #


def download(force: bool = False) -> Path:
    """Fetch the archive into `raw/`, skipping the work if it is already there."""
    RAW.mkdir(parents=True, exist_ok=True)

    if ZIP_PATH.exists() and not force:
        size = ZIP_PATH.stat().st_size
        if _size_ok(size):
            print(f"[skip]  {ZIP_PATH.name} already present ({size:,} bytes)")
            return ZIP_PATH
        print(f"[warn]  {ZIP_PATH.name} is {size:,} bytes, expected ~{EXPECTED_BYTES:,}; re-downloading")

    print(f"[get ]  {URL}")
    request = urllib.request.Request(URL, headers={"User-Agent": USER_AGENT})

    # Stream to a temp file so an interrupted download never masquerades as a
    # complete one on the next run.
    tmp = ZIP_PATH.with_suffix(".zip.part")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            declared = response.headers.get("Content-Length")
            print(f"[http]  {response.status} {response.reason}  final URL host: {response.url.split('/')[2]}")
            if declared:
                print(f"[http]  Content-Length: {int(declared):,} bytes")
            with tmp.open("wb") as handle:
                shutil.copyfileobj(response, handle, length=1 << 20)
    except urllib.error.URLError as exc:
        tmp.unlink(missing_ok=True)
        sys.exit(f"[fail]  download failed: {exc}")

    size = tmp.stat().st_size
    if not _size_ok(size):
        tmp.unlink(missing_ok=True)
        sys.exit(
            f"[fail]  downloaded {size:,} bytes, expected ~{EXPECTED_BYTES:,}. "
            "That is not the dataset — check the URL."
        )

    tmp.replace(ZIP_PATH)
    print(f"[ok  ]  wrote {ZIP_PATH} ({size:,} bytes)")
    print(f"[ok  ]  sha256 {sha256(ZIP_PATH)}")
    return ZIP_PATH


def _size_ok(size: int) -> bool:
    return abs(size - EXPECTED_BYTES) <= EXPECTED_BYTES * SIZE_TOLERANCE


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


# --------------------------------------------------------------------- #
# Extract
# --------------------------------------------------------------------- #


def extract(zip_path: Path, force: bool = False) -> Path:
    """Unzip into `raw/ori/`, skipping if it looks already extracted."""
    if EXTRACT_DIR.exists() and not force and any(EXTRACT_DIR.rglob("*")):
        print(f"[skip]  {EXTRACT_DIR} already extracted")
        return EXTRACT_DIR

    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        # Refuse absolute paths and parent traversal before writing anything.
        for name in names:
            if name.startswith("/") or ".." in Path(name).parts:
                sys.exit(f"[fail]  refusing unsafe archive member: {name}")
        archive.extractall(EXTRACT_DIR)
    print(f"[ok  ]  extracted {len(names)} members into {EXTRACT_DIR}")
    return EXTRACT_DIR


# --------------------------------------------------------------------- #
# Describe — the point of this script beyond fetching bytes
# --------------------------------------------------------------------- #


def describe(root: Path, samples: int = 3) -> None:
    """Print the file layout and a few records from each data file."""
    files = sorted(p for p in root.rglob("*") if p.is_file())

    print()
    print("=" * 72)
    print("DISCOVERED LAYOUT")
    print("=" * 72)
    for path in files:
        print(f"  {path.relative_to(root)}   {path.stat().st_size:,} bytes")

    data_files = [p for p in files if p.suffix.lower() in {".json", ".jsonl", ".tsv", ".csv", ".txt"}]

    print()
    print("=" * 72)
    print("SAMPLE RECORDS")
    print("=" * 72)
    for path in data_files:
        print(f"\n--- {path.relative_to(root)}")
        try:
            with path.open(encoding="utf-8") as handle:
                lines = [next(handle).rstrip("\n") for _ in range(samples)]
        except (StopIteration, UnicodeDecodeError) as exc:
            print(f"    (unreadable as utf-8 text: {exc})")
            continue

        for line in lines:
            print(f"    {line}")

        # If it parses as JSON, name the fields — that is what build_lexicon
        # keys off, and it is the thing most likely to change upstream.
        try:
            record = json.loads(lines[0])
        except json.JSONDecodeError:
            continue
        if isinstance(record, dict):
            print(f"    fields: {sorted(record.keys())}")
            for key, value in record.items():
                if isinstance(value, str):
                    print(f"      {key!r}: {value!r}  ({_script_of(value)})")

    print()
    print("Line counts:")
    for path in data_files:
        with path.open("rb") as handle:
            count = sum(1 for _ in handle)
        print(f"  {path.relative_to(root)}: {count:,} lines")


def _script_of(value: str) -> str:
    """Rough script label for a sample value, to identify which field is which."""
    odia = sum(1 for ch in value if 0x0B00 <= ord(ch) <= 0x0B7F)
    latin = sum(1 for ch in value if ch.isascii() and ch.isalpha())
    if odia and not latin:
        return "Odia"
    if latin and not odia:
        return "Latin"
    if odia or latin:
        return "mixed"
    return "other"


# --------------------------------------------------------------------- #


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="re-download and re-extract")
    args = parser.parse_args()

    zip_path = download(force=args.force)
    root = extract(zip_path, force=args.force)
    describe(root)


if __name__ == "__main__":
    main()
