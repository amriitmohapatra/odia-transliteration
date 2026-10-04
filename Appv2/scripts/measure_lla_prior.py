#!/usr/bin/env python3
"""
Adjudicate ଲ/ଳ, ବ/ୱ and ଯ/ୟ from the corpus instead of from opinion.

Why this exists
---------------
Sanskrit written in Odia script is not a 1:1 transposition of Devanagari. Three
letters have two legitimate Odia spellings and the choice is conventional, not
phonetic:

    ल  ->  ଲ or ଳ      बल   is written ବଳ, not ବଲ
    व  ->  ବ or ୱ      देव  is ଦେବ, but द्वि is ଦ୍ୱି — position decides
    य  ->  ଯ or ୟ      word-initial ଯ, elsewhere ୟ

Getting these wrong is exactly what made the user's line untypeable, and a
plausible-sounding rule would have been wrong in at least one of the three. So
rather than assert, this script measures: for every word type in
core/data/webfreq.tsv containing one of the marked letters, it constructs the
"twin" spelled the other way and looks it up in the same corpus.

Two outputs:
  1. Appv2/data/lla-preference.tsv — a per-word decision table. This is a
     REVIEWABLE ARTEFACT: a native speaker can read it and object to specific
     rows, which is not true of a weight buried in a TOML file.
  2. Aggregate priors bucketed by position, printed and written as a comment
     header, for the words the corpus has never seen.

Reads core/data/webfreq.tsv. Writes only inside Appv2/.

    python3 Appv2/scripts/measure_lla_prior.py
"""

from __future__ import annotations

import sys
from collections import Counter, defaultdict
from pathlib import Path

APPV2 = Path(__file__).resolve().parents[1]
ROOT = APPV2.parent
sys.path.insert(0, str(ROOT / "tools" / "build-data"))

from normalize_odia import canonical, is_canonical  # noqa: E402

WEBFREQ = ROOT / "core" / "data" / "webfreq.tsv"
OUT = APPV2 / "data" / "lla-preference.tsv"

VIRAMA = "୍"

# The three contrasts, as (plain form, marked form, label).
PAIRS = [
    ("ଲ", "ଳ", "la"),   # ଲ / ଳ
    ("ବ", "ୱ", "va"),   # ବ / ୱ
    ("ଯ", "ୟ", "ya"),   # ଯ / ୟ
]

# Anything that hangs off a consonant rather than standing on its own. Used to
# decide "is this the last LETTER of the word", which is not the same question
# as "is this the last character".
COMBINING = set(
    [chr(c) for c in range(0x0B01, 0x0B04)]
    + ["଼", "ଽ"]
    + [chr(c) for c in range(0x0B3E, 0x0B45)]
    + ["େ", "ୈ", "ୋ", "ୌ", "୍"]
    + [chr(c) for c in range(0x0B55, 0x0B58)]
    + ["ୢ", "ୣ"]
)


def position(word: str, i: int) -> str:
    """Where the letter at `i` sits, in the vocabulary the rule contexts use.

    CRITICAL: these buckets must mean what core/src/rules.ts means by them, and
    core evaluates every PositionContext against the ROMAN string, not against
    the assembled Odia. The two disagree in one place that matters enormously.

    A consonant carrying a MATRA is not word-final, because the matra is more
    roman characters: ଥିଲା is typed "thilaa", so its ଲ sits between "i" and
    "aa" and is intervocalic. Treating "only combining marks follow" as
    word-final — the Odia-script reading — sweeps ଥିଲା, କଲା, ଗଲା and every
    other -ଲା verb form into the word_final bucket. Those are among the most
    frequent words in Odia, and they dragged the measured word-final ଳ:ଲ prior
    from ~4 down to 0.99, which would have justified exactly the wrong weight.

    So word_final here means what it means to the segmenter: nothing follows in
    the roman. In the Odia word that is the last character outright, or the last
    followed only by a nukta or an explicit halanta.

    `subjoined` and `conjunct` have no PositionContext in core at all — that is
    the gap the S7a-S7h conjunct keys work around — but they are where ୱ
    actually wins, so they are measured separately.
    """
    if i > 0 and word[i - 1] == VIRAMA:
        return "subjoined"
    if i + 1 < len(word) and word[i + 1] == VIRAMA:
        return "conjunct"
    if i == 0:
        return "word_initial"
    if all(ch in ("଼", VIRAMA) for ch in word[i + 1 :]):
        return "word_final"
    return "intervocalic"


def read_webfreq() -> dict[str, int]:
    counts: dict[str, int] = {}
    for line in WEBFREQ.open(encoding="utf-8"):
        if line.startswith("#"):
            continue
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 2:
            continue
        try:
            counts[canonical(parts[0])] = int(parts[1])
        except ValueError:
            continue
    return counts


def main() -> int:
    if not WEBFREQ.exists():
        print(f"missing {WEBFREQ}", file=sys.stderr)
        return 1

    counts = read_webfreq()
    print(f"[read ] {len(counts):,} word types from core/data/webfreq.tsv")

    rows: list[tuple[str, str, str, int, int, str, float]] = []
    # label -> position -> [plain tokens, marked tokens]
    totals: dict[str, dict[str, list[int]]] = defaultdict(
        lambda: defaultdict(lambda: [0, 0])
    )
    seen_pairs: set[tuple[str, str]] = set()

    for word, count in counts.items():
        for plain, marked, label in PAIRS:
            if marked not in word:
                continue
            for i, ch in enumerate(word):
                if ch != marked:
                    continue
                twin = word[:i] + plain + word[i + 1 :]
                if (twin, word) in seen_pairs:
                    continue
                seen_pairs.add((twin, word))

                plain_count = counts.get(twin, 0)
                pos = position(word, i)
                totals[label][pos][0] += plain_count
                totals[label][pos][1] += count
                # +1 smoothing: an unattested twin is evidence FOR the marked
                # form, and dividing by zero is not a ratio.
                ratio = (count + 1) / (plain_count + 1)
                rows.append((label, twin, word, plain_count, count, pos, ratio))

    rows.sort(key=lambda r: (-r[4], r[0]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as fh:
        fh.write(
            "# Measured from core/data/webfreq.tsv by "
            "Appv2/scripts/measure_lla_prior.py\n"
            "#\n"
            "# Which of two legitimate Odia spellings the corpus actually uses.\n"
            "# ratio > 1 means the MARKED form (ଳ / ୱ / ୟ) wins.\n"
            "# Counts are corpus tokens; ratio is (marked+1)/(plain+1).\n"
            "#\n"
            "# Aggregate priors by position, token-weighted:\n"
        )
        for label, buckets in sorted(totals.items()):
            for pos, (plain_n, marked_n) in sorted(buckets.items()):
                prior = (marked_n + 1) / (plain_n + 1)
                fh.write(
                    f"#   {label:3s} {pos:14s} "
                    f"plain {plain_n:9,d}  marked {marked_n:9,d}  "
                    f"prior {prior:6.2f}\n"
                )
        fh.write("#\n# contrast\tplain\tmarked\tplainCount\tmarkedCount\tposition\tratio\n")
        for label, twin, word, plain_count, count, pos, ratio in rows:
            assert is_canonical(word) and is_canonical(twin), word
            fh.write(f"{label}\t{twin}\t{word}\t{plain_count}\t{count}\t{pos}\t{ratio:.3f}\n")

    print(f"[write] {OUT.relative_to(ROOT)}  ({len(rows):,} contrasting pairs)\n")

    print("Aggregate priors (token-weighted). > 1 means the marked form wins:")
    for label, buckets in sorted(totals.items()):
        plain_name, marked_name = next(
            (p, m) for p, m, l in PAIRS if l == label
        )
        print(f"\n  {label}:  {plain_name} (plain) vs {marked_name} (marked)")
        for pos, (plain_n, marked_n) in sorted(
            buckets.items(), key=lambda kv: -(kv[1][0] + kv[1][1])
        ):
            prior = (marked_n + 1) / (plain_n + 1)
            verdict = marked_name if prior > 1 else plain_name
            print(
                f"    {pos:14s} plain {plain_n:9,d}  marked {marked_n:9,d}  "
                f"prior {prior:6.2f}  -> prefer {verdict}"
            )

    # The five words the delta file cites, so the claim and the code agree.
    print("\nSpot check — the rows quoted in Appv2/rules/sanskrit.delta.toml:")
    cited = Counter()
    for label, twin, word, plain_count, count, pos, ratio in rows:
        if word in ("ଜଳ", "ଫଳ", "କାଳ", "ମୂଳ", "ବଳ", "ସ୍ୱାମୀ", "ବିଶ୍ୱ", "ଦ୍ୱାର", "ସ୍ୱର"):
            cited[word] = 1
            print(f"    {twin:8s} {plain_count:6,d}  vs  {word:8s} {count:6,d}   {ratio:6.2f}x  ({pos})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
