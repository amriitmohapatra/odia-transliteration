"""Fill the lexicon with IndicXlit spellings (V2.6).

AI4Bharat IndicXlit (MIT; https://huggingface.co/ai4bharat/IndicXlit) turns an Odia word
into the Latin spellings a person is likely to type, English loans included
(lockdown, not "lakdauna"). Run offline, once, with indicxlit_romanize.py; this script
turns its output into lexicon rows and merges them:

    lexicon.tsv      = lexicon.tsv.aksharantar-only      + lexicon-common.tsv     + lexicon-xlit.tsv
    lexicon-web.tsv  = lexicon-web.tsv.aksharantar-only  + lexicon-common-web.tsv + lexicon-xlit-web.tsv

Usage (Python 3 standard library):

    python3 tools/build-data/build_xlit_fill.py ROMANIZED.tsv [ROMANIZED.tsv ...]

ROMANIZED.tsv: odia <TAB> roman <TAB> rank (1-4) <TAB> score, as indicxlit_romanize.py
writes it. The words come from core/data/indiccorp-words.tsv (CC0).

Rules, measured in plan/research/v26-indicxlit-fill.md:
  * a (key, word) pair the other two sources already have is left as it is: the fill only
    adds spellings, it never raises a weight;
  * weight = the word's IndicCorp frequency on the 0..2.303 scale of the other lexicons,
    times 1.0 / 0.9 / 0.8 / 0.7 for the model's 1st to 4th spelling;
  * a word with a letter the model does not know (U+0B35, read as <unk>) is left out;
  * every (key, word) pair of the held-out test set is left out, as build_lexicon.py does;
  * the web file takes only the WEB_TOP most frequent words, so a phone's file stays small.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_common_lexicon import ROOT, assert_canonical, canonical, read_lexicon, write_lexicon  # noqa: E402

DATA = ROOT / "core" / "data"
INDICCORP = DATA / "indiccorp-words.tsv"
HELDOUT = ROOT / "core" / "test" / "golden" / "heldout.tsv"
OUT_FULL = DATA / "lexicon-xlit.tsv"
OUT_WEB = DATA / "lexicon-xlit-web.tsv"

# (aksharantar-only, common, xlit, merged output)
MERGES = (
    (DATA / "lexicon.tsv.aksharantar-only", DATA / "lexicon-common.tsv", OUT_FULL, DATA / "lexicon.tsv"),
    (DATA / "lexicon-web.tsv.aksharantar-only", DATA / "lexicon-common-web.tsv", OUT_WEB, DATA / "lexicon-web.tsv"),
)

RANK_FACTOR = {1: 1.0, 2: 0.9, 3: 0.8, 4: 0.7}
WEB_TOP = 30_000
UNKNOWN_TO_MODEL = "\u0b35"


def is_roman(key: str) -> bool:
    return len(key) >= 2 and all("a" <= c <= "z" for c in key)


def main(paths: list[str]) -> int:
    if not paths:
        print(__doc__, file=sys.stderr)
        return 2

    counts: dict[str, int] = {}
    rank_of: dict[str, int] = {}
    with INDICCORP.open(encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or "\t" not in line:
                continue
            word, n = line.rstrip("\n").split("\t")[:2]
            counts[word] = int(n)
            rank_of[word] = len(rank_of)
    peak = max(counts.values())

    heldout: set[tuple[str, str]] = set()
    with HELDOUT.open(encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or "\t" not in line:
                continue
            roman, odia = line.rstrip("\n").split("\t")[:2]
            heldout.add((roman, canonical(odia)))

    # What the other two sources already give, per merged file.
    existing_full: dict[str, dict[str, float]] = {}
    read_lexicon(DATA / "lexicon.tsv.aksharantar-only", existing_full)
    read_lexicon(DATA / "lexicon-common.tsv", existing_full)

    full: dict[str, dict[str, float]] = {}
    web: dict[str, dict[str, float]] = {}
    dropped = {"unknown letter": 0, "not a-z": 0, "held out": 0, "already there": 0, "not in IndicCorp": 0}
    for path in paths:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 3:
                    continue
                word, key, rank = canonical(parts[0]), parts[1], int(parts[2])
                if UNKNOWN_TO_MODEL in word:
                    dropped["unknown letter"] += 1
                    continue
                if not is_roman(key) or rank not in RANK_FACTOR:
                    dropped["not a-z"] += 1
                    continue
                if (key, word) in heldout:
                    dropped["held out"] += 1
                    continue
                if word in existing_full.get(key, {}):
                    dropped["already there"] += 1
                    continue
                if word not in counts:
                    dropped["not in IndicCorp"] += 1
                    continue
                assert_canonical(Path(path), key, word)
                w = math.log1p(counts[word]) / math.log1p(peak) * 2.303 * RANK_FACTOR[rank]
                for table, wanted in ((full, True), (web, rank_of[word] < WEB_TOP)):
                    if wanted and w > table.setdefault(key, {}).get(word, 0.0):
                        table[key][word] = w

    notes = (
        "IndicXlit spellings of IndicCorp words (V2.6): tools/build-data/build_xlit_fill.py.",
        "Model: ai4bharat/IndicXlit indic-en v1.0 (MIT). Words: IndicCorp v2 counts (CC0).",
    )
    n_full = write_lexicon(OUT_FULL, full, notes)
    n_web = write_lexicon(OUT_WEB, web, notes + (f"Web file: the {WEB_TOP:,} most frequent words only.",))
    print(f"{OUT_FULL.name}: {n_full:,} rows; {OUT_WEB.name}: {n_web:,} rows")
    print("left out:", ", ".join(f"{k} {v:,}" for k, v in dropped.items()))

    for aksharantar, common, xlit, out in MERGES:
        table: dict[str, dict[str, float]] = {}
        n_a = read_lexicon(aksharantar, table)
        n_c = read_lexicon(common, table)
        n_x = read_lexicon(xlit, table)
        n_out = write_lexicon(out, table, ())
        print(f"{out.name}: {n_out:,} rows = {aksharantar.name} ({n_a:,}) + {common.name} ({n_c:,}) + {xlit.name} ({n_x:,})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
