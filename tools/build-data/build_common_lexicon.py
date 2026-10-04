#!/usr/bin/env python3
"""
Build a lexicon of EVERYDAY Odia from the web corpus.

The problem this solves
-----------------------
The shipped lexicon came from AI4Bharat Aksharantar, which is not a dictionary
of Odia: 2 of 25 common words present, mean entry 8.7 characters, 95.7%
IndicCorp-mined names and compounds (plan/03-spikes.md, S2b). So the engine knew
ଭାଗ୍ୟଶ୍ରୀ but not ଘର.

Meanwhile no rule can decide ଜନ୍ମ vs ସମ୍ବାଦ — both are "n" before a labial, one
takes ନ and one takes ମ. That is lexical knowledge, not phonetics. The only fix
is to know the words.

core/data/webfreq.tsv holds 527k word types over 18.4M tokens swept from Odia
news, Wikipedia, literature, archive books and government pages. This script
gives each frequent word the roman spellings a person would plausibly type, by
inverting the romanization scheme, and emits them as lexicon rows.

Multiple keys per word on purpose: people do not double long vowels, and they do
not distinguish retroflex from dental. "janmadina", "janmadin" and "janmodina"
should all reach ଜନ୍ମଦିନ.

    python3 tools/build-data/build_common_lexicon.py
"""

from __future__ import annotations

import math
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEBFREQ = ROOT / "core" / "data" / "webfreq.tsv"
OUT_FULL = ROOT / "core" / "data" / "lexicon-common.tsv"
OUT_WEB = ROOT / "core" / "data" / "lexicon-common-web.tsv"

# How many word types to romanize. The full file backs the CLI and desktop; the
# web file is what a phone loads, so it stays small.
TOP_FULL = 120_000
TOP_WEB = 30_000

NUKTA = "଼"
VIRAMA = "୍"

CLUSTER = {"ଡ" + NUKTA: "d", "ଢ" + NUKTA: "dh"}

CONSONANT = {
    "କ": "k", "ଖ": "kh", "ଗ": "g", "ଘ": "gh", "ଙ": "ng",
    "ଚ": "ch", "ଛ": "chh", "ଜ": "j", "ଝ": "jh", "ଞ": "ny",
    "ଟ": "t", "ଠ": "th", "ଡ": "d", "ଢ": "dh", "ଣ": "n",
    "ତ": "t", "ଥ": "th", "ଦ": "d", "ଧ": "dh", "ନ": "n",
    "ପ": "p", "ଫ": "ph", "ବ": "b", "ଭ": "bh", "ମ": "m",
    "ଯ": "y", "ର": "r", "ଲ": "l", "ଳ": "l",
    "ଵ": "w", "ୱ": "w",
    "ଶ": "sh", "ଷ": "sh", "ସ": "s", "ହ": "h",
    "ୟ": "y",
}

INDEPENDENT = {
    "ଅ": "a", "ଆ": "aa", "ଇ": "i", "ଈ": "ii",
    "ଉ": "u", "ଊ": "uu", "ଋ": "ru", "ଏ": "e",
    "ଐ": "ai", "ଓ": "o", "ଔ": "au",
}

MATRA = {
    "ା": "aa", "ି": "i", "ୀ": "ii", "ୁ": "u",
    "ୂ": "uu", "ୃ": "ru", "େ": "e", "ୈ": "ai",
    "ୋ": "o", "ୌ": "au",
}

# The anusvara and candrabindu are romanized through placeholders so that
# `variants` can emit the word both with and without them: people very often do
# not type them at all (ମୁଁ is typed "mu" far more than "mun").
ANUSVARA_MARK = "\x01"
CANDRABINDU_MARK = "\x02"
SIGN = {"ଂ": ANUSVARA_MARK, "ଁ": CANDRABINDU_MARK, "ଃ": "h"}

ODIA_RANGE = range(0x0B00, 0x0B80)


def canonical(s: str) -> str:
    return unicodedata.normalize("NFC", s).replace("ଡ଼", "ଡ" + NUKTA).replace(
        "ଢ଼", "ଢ" + NUKTA
    )


def romanize(word: str) -> str | None:
    """Careful romanization: long vowels written out, retroflex undifferentiated.

    The vocalic vowel ୃ / ଋ is romanized "ru" here, but people type it both ways
    ("krushna" and "krishna" for କୃଷ୍ଣ), so `variants` branches it afterwards.
    """
    out: list[str] = []
    i = 0
    pending = False  # a consonant is waiting for its inherent vowel

    while i < len(word):
        two = word[i : i + 2]
        if two in CLUSTER:
            if pending:
                out.append("a")
            out.append(CLUSTER[two])
            pending = True
            i += 2
            continue

        ch = word[i]
        if ch == VIRAMA:
            pending = False
            i += 1
            continue
        if ch in CONSONANT:
            if pending:
                out.append("a")
            out.append(CONSONANT[ch])
            pending = True
            i += 1
            continue
        if ch in MATRA:
            pending = False
            out.append(MATRA[ch])
            i += 1
            continue
        if ch in INDEPENDENT:
            if pending:
                out.append("a")
            out.append(INDEPENDENT[ch])
            pending = False
            i += 1
            continue
        if ch in SIGN:
            if pending:
                out.append("a")
                pending = False
            out.append(SIGN[ch])
            i += 1
            continue
        if ch == NUKTA:
            i += 1
            continue
        return None  # not pure Odia — skip the word

    if pending:
        out.append("a")
    return "".join(out)


# A nasal before a stop assimilates in the SCRIPT (ଙ୍କ, ଞ୍ଚ) but people type a
# plain "n" for all of them. Without these, ଙ୍କ was only reachable as "ngka" —
# so the honorific ...ଙ୍କ, which is everywhere in Odia, could not be typed.
NASAL_COLLAPSE = (
    ("ngkh", "nkh"), ("ngk", "nk"), ("nggh", "ngh"), ("ngg", "ng"),
    ("nychh", "nchh"), ("nych", "nch"), ("nyjh", "njh"), ("nyj", "nj"),
    ("nyc", "nc"),
)


def variants(roman: str, has_vocalic: bool) -> list[str]:
    """The spellings a person might actually type for this word."""
    # Expand the sign placeholders both ways before anything else.
    seeds = {roman}
    if ANUSVARA_MARK in roman or CANDRABINDU_MARK in roman:
        seeds = {
            roman.replace(ANUSVARA_MARK, "m").replace(CANDRABINDU_MARK, "n"),
            roman.replace(ANUSVARA_MARK, "n").replace(CANDRABINDU_MARK, "n"),
            roman.replace(ANUSVARA_MARK, "").replace(CANDRABINDU_MARK, ""),
        }
    forms: set[str] = set()
    for seed in seeds:
        forms.add(seed)
        for long_form, short_form in NASAL_COLLAPSE:
            if long_form in seed:
                forms.add(seed.replace(long_form, short_form))
    roman = sorted(seeds, key=len, reverse=True)[0]

    # The vocalic vowel ୃ is written "ru" above, but "ri" is at least as common
    # in practice — କୃଷ୍ଣ is typed "krishna" far more often than "krushna".
    # Only branch when the word really contains it, so guru does not sprout giri.
    if has_vocalic:
        forms.add(roman.replace("ru", "ri"))

    # People rarely double a long vowel.
    base = set(forms)
    casual = roman.replace("aa", "a").replace("ii", "i").replace("uu", "u")
    for f in base:
        forms.add(f.replace("aa", "a").replace("ii", "i").replace("uu", "u"))
        forms.add(f.replace("ii", "ee").replace("uu", "oo"))

    # A word-final inherent vowel is frequently dropped: ଜନ୍ମଦିନ -> "janmadin".
    for f in list(forms):
        if len(f) > 3 and f.endswith("a"):
            forms.add(f[:-1])

    # "v" for "w" is common in loanwords.
    if "w" in roman:
        forms.add(roman.replace("w", "v"))
        forms.add(casual.replace("w", "v"))

    return [f for f in forms if 1 < len(f) <= 40 and "\x01" not in f and "\x02" not in f]


def main() -> int:
    if not WEBFREQ.exists():
        print(f"error: {WEBFREQ} not found — run the web corpus sweep first", file=sys.stderr)
        return 1

    rows: list[tuple[str, int]] = []
    with WEBFREQ.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            tab = line.find("\t")
            if tab <= 0:
                continue
            try:
                count = int(line[tab + 1 :])
            except ValueError:
                continue
            word = canonical(line[:tab].strip())
            if not word or any(ord(c) not in ODIA_RANGE for c in word):
                continue
            rows.append((word, count))

    rows.sort(key=lambda r: -r[1])
    peak = rows[0][1] if rows else 1

    def emit(path: Path, limit: int) -> tuple[int, int]:
        # key -> word -> weight, keeping the best weight per pair
        table: dict[str, dict[str, float]] = {}
        skipped = 0
        for word, count in rows[:limit]:
            roman = romanize(word)
            if roman is None or not roman:
                skipped += 1
                continue
            # Same 0..2.303 scale the unigrams use, so ranking stays comparable.
            weight = (math.log1p(count) / math.log1p(peak)) * 2.303
            has_vocalic = ("ୃ" in word) or ("ଋ" in word)
            for n, key in enumerate(variants(roman, has_vocalic)):
                # the exact romanization outranks its looser variants
                w = weight if n == 0 else weight * 0.9
                slot = table.setdefault(key, {})
                if w > slot.get(word, 0.0):
                    slot[word] = w

        written = 0
        with path.open("w", encoding="utf-8") as out:
            out.write("# romanKey\todiaWord\tweight\n")
            out.write("# Everyday Odia, romanized from core/data/webfreq.tsv.\n")
            out.write("# Rebuild: python3 tools/build-data/build_common_lexicon.py\n")
            for key in sorted(table):
                for word, w in sorted(table[key].items(), key=lambda kv: -kv[1]):
                    out.write(f"{key}\t{word}\t{w:.4f}\n")
                    written += 1
        return written, skipped

    n_full, skip_full = emit(OUT_FULL, TOP_FULL)
    n_web, skip_web = emit(OUT_WEB, TOP_WEB)

    print(f"corpus types      : {len(rows):,}")
    print(f"{OUT_FULL.name:<26}: {n_full:,} rows from top {TOP_FULL:,} ({skip_full:,} unromanizable)")
    print(f"{OUT_WEB.name:<26}: {n_web:,} rows from top {TOP_WEB:,} ({skip_web:,} unromanizable)")
    for p in (OUT_FULL, OUT_WEB):
        print(f"  {p.name:<26} {p.stat().st_size / 1048576:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
