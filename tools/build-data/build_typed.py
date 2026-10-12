"""Build core/data/typed.tsv: what Desh keyboard users typed, and the Odia word they chose.

Source: the Desh Odia keyboard's typed-spelling table (`key_to_word.tsv`, extracted from
its `native_words.db`), shared with the owner on 2026-10-12. The raw file is NOT in this
repository; pass its path. See core/data/PROVENANCE.md (section "Desh") for the checksum
and the terms.

    python3 -I tools/build-data/build_typed.py /path/to/key_to_word.tsv

Rows out: `romanKey <TAB> odiaWord <TAB> count`, sorted by key in plain code-unit order
(core/src/lexicon.ts relies on that), then by count, highest first.

Filters, in order:
  1. The key is plain lower-case a-z (it always is in this source; checked anyway).
  2. The word is canonical Odia: NFC, then the precomposed nukta letters U+0B5C/U+0B5D
     decomposed (the project's one invariant). Pure Odia block plus ZWJ/ZWNJ only.
  3. The nukta that chat typing drops is put back: a word with a bare non-initial ଡ/ଢ
     whose nukta form (ଡ଼/ଢ଼) is the more frequent written word in core/data/unigrams.tsv
     gives its count to the nukta form (odisha: ଓଡିଶା -> ଓଡ଼ିଶା, bada: ବଡ -> ବଡ଼).
  4. A pair below MIN_SHARE of its key's choices is dropped (noise, and size).

Held-out pairs are KEPT in this file, unlike the lexicon: they are real users' choices
(`jiba` -> the verb form alone has 20,665 of them), and the app should offer them. The
leakage control is in the evaluation instead: tools/eval/run_eval.ts removes every
(key, word) pair of core/test/golden/heldout.tsv from this source before it scores the
held-out set. This script reports how many pairs that is.
After canonicalisation two rows can collide; their counts are added.
"""

from __future__ import annotations

import collections
import hashlib
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HELDOUT = REPO / "core" / "test" / "golden" / "heldout.tsv"
OUT = REPO / "core" / "data" / "typed.tsv"
UNIGRAMS = REPO / "core" / "data" / "unigrams.tsv"

# A pair must carry at least this share of the choices made for its key.
MIN_SHARE = 0.005

KEY = re.compile(r"[a-z]+")
ODIA = re.compile("[଀-୿‌‍]+")


def canonical(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    return text.replace("ଡ଼", "ଡ଼").replace("ଢ଼", "ଢ଼")


NUKTA = "଼"


def with_nukta(word: str) -> str:
    """Add the nukta to every bare ଡ/ଢ that is not word-initial."""
    out = []
    for i, ch in enumerate(word):
        out.append(ch)
        if ch in "ଡଢ" and i > 0 and (i + 1 >= len(word) or word[i + 1] != NUKTA):
            out.append(NUKTA)
    return "".join(out)


def read_unigrams() -> dict[str, float]:
    table: dict[str, float] = {}
    for line in UNIGRAMS.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        word, value = line.split("\t")[:2]
        table[canonical(word)] = float(value)
    return table


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    source = Path(argv[1])
    raw = source.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()

    held: set[tuple[str, str]] = set()
    for line in HELDOUT.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        cells = line.split("\t")
        held.add((cells[0], canonical(cells[1])))

    unigrams = read_unigrams()
    counts: dict[tuple[str, str], int] = collections.Counter()
    stats = collections.Counter()
    lines = raw.decode("utf-8").splitlines()
    for line in lines[1:]:
        cells = line.split("\t")
        if len(cells) != 5:
            stats["malformed"] += 1
            continue
        _, key, _, word, count = cells
        stats["rows"] += 1
        if not KEY.fullmatch(key):
            stats["bad key"] += 1
            continue
        fixed = canonical(word)
        if fixed != word:
            stats["canonicalised"] += 1
        if not ODIA.fullmatch(fixed):
            stats["not Odia"] += 1
            continue
        restored = with_nukta(fixed)
        if restored != fixed and unigrams.get(restored, 0) > unigrams.get(fixed, 0):
            stats["nukta restored"] += 1
            fixed = restored
        if (key, fixed) in held:
            stats["held-out pair (kept; eval drops it)"] += 1
        counts[(key, fixed)] += int(count)

    totals: dict[str, int] = collections.Counter()
    for (key, _), count in counts.items():
        totals[key] += count

    rows = []
    for (key, word), count in counts.items():
        if count < MIN_SHARE * totals[key]:
            stats["below share"] += 1
            continue
        rows.append((key, word, count))
    # Plain code-unit order on the key, as lexicon.ts binary-searches it.
    rows.sort(key=lambda r: (r[0], -r[2], r[1]))

    with OUT.open("w", encoding="utf-8", newline="\n") as out:
        out.write("# romanKey\todiaWord\tcount\n")
        out.write("# What Desh keyboard users typed and the Odia word they chose (pair counts).\n")
        out.write(f"# Source: Desh key_to_word.tsv sha256 {sha}. Held-out pairs kept (run_eval.ts drops them).\n")
        out.write("# Rebuild: python3 -I tools/build-data/build_typed.py /path/to/key_to_word.tsv\n")
        for key, word, count in rows:
            out.write(f"{key}\t{word}\t{count}\n")

    for name, value in sorted(stats.items()):
        print(f"  {name:24}: {value:,}")
    print(f"  rows written            : {len(rows):,} ({len({r[0] for r in rows}):,} keys)")
    print(f"  {OUT.relative_to(REPO)}: {OUT.stat().st_size:,} bytes, sha256 "
          f"{hashlib.sha256(OUT.read_bytes()).hexdigest()}")
    print(f"  source sha256           : {sha}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
