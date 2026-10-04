#!/usr/bin/env python3
"""
Stage 0: a Sanskrit lexicon from files already on disk. No network.

The insight
-----------
core/data/webfreq.tsv is 527k Odia word types swept from news, Wikipedia,
literature, archive books and government pages — and a slice of it is already
Sanskrit written in Odia script, because Odia web text quotes stotras, Gita
chapters and Purana passages constantly. Measured:

    4,567 types ending in ଂ        2,944 types ending in ଃ
      332 types containing ଽ       — the entire Gita colophon series,
                                     ପ୍ରଥମୋଽଧ୍ୟାୟଃ, ଦ୍ୱିତୀୟୋଽଧ୍ୟାୟଃ, ...

So the fastest route to a working Sanskrit vocabulary needs no download at all.
Stage 1 adds Aksharantar's 1.81M `san` pairs on top; this is what makes the
feature usable today.

Method mirrors tools/build-data/build_common_lexicon.py: invert the
romanization scheme to give each word the spellings a person would plausibly
type, then emit lexicon rows. The romanizer here is extended for the Sanskrit
characters that script does not handle (ଽ ୠ ୄ ଌ ୢ ୡ ୣ).

Reads core/data/webfreq.tsv. Writes only inside Appv2/data/.

    python3 Appv2/scripts/mine_webfreq_sanskrit.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

APPV2 = Path(__file__).resolve().parents[1]
ROOT = APPV2.parent
sys.path.insert(0, str(ROOT / "tools" / "build-data"))

from normalize_odia import canonical, is_canonical  # noqa: E402

WEBFREQ = ROOT / "core" / "data" / "webfreq.tsv"
OUT_LEX = APPV2 / "data" / "sanskrit-lexicon.tsv"
OUT_LEX_WEB = APPV2 / "data" / "sanskrit-lexicon-web.tsv"
OUT_UNI = APPV2 / "data" / "sanskrit-unigrams.tsv"
OUT_UNI_WEB = APPV2 / "data" / "sanskrit-unigrams-web.tsv"

# The web files are what a phone loads. Same discipline as build_lexicon.py's
# WEB_BUDGET_BYTES: the budget is a hard constraint, the word count is not.
#
# Key expansion runs ~7 rows per word here (105k rows over 14.8k words), which
# is richer than the core lexicon's, so a given byte budget buys proportionally
# fewer words. At 700 KB only 2,706 of 14,818 words fitted; 1.2 MB is still
# small next to core/data/lexicon-web.tsv at 4.7 MB.
WEB_BUDGET_BYTES = 1_200_000

# rank.ts was tuned against unigram values in [0, 2.303]; see
# tools/build-data/merge_webfreq.py MAX_LOGFREQ. Emitting outside that range
# would silently swamp every other term in the score.
MAX_LOGFREQ = 2.303

NUKTA = "଼"
VIRAMA = "୍"
AVAGRAHA = "ଽ"

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
    "ଉ": "u", "ଊ": "uu", "ଏ": "e",
    "ଐ": "ai", "ଓ": "o", "ଔ": "au",
    # The vocalics. ଋ is romanized "ru" and branched to "ri" by variants(),
    # exactly as build_common_lexicon.py does — କୃଷ୍ଣ is typed "krishna" far
    # more often than "krushna".
    "ଋ": "ru", "ୠ": "rri", "ଌ": "lri", "ୡ": "llri",
}

MATRA = {
    "ା": "aa", "ି": "i", "ୀ": "ii", "ୁ": "u",
    "ୂ": "uu", "େ": "e", "ୈ": "ai",
    "ୋ": "o", "ୌ": "au",
    "ୃ": "ru", "ୄ": "rri", "ୢ": "lri", "ୣ": "llri",
}

ANUSVARA_MARK = "\x01"
CANDRABINDU_MARK = "\x02"
SIGN = {"ଂ": ANUSVARA_MARK, "ଁ": CANDRABINDU_MARK, "ଃ": "h"}

# Marks that carry no roman of their own.
#   ଽ  avagraha marks an ELIDED vowel, so it contributes nothing to what a
#      person types; Appv2/src/preprocess.ts gives it the explicit "'" route.
#   ୕  U+0B55 is the Kui overline, not Sanskrit — see palette.toml.
SILENT = {AVAGRAHA, "୕", "ୖ", "ୗ", "॑", "॒"}

# Same nasal collapse as build_common_lexicon.py: the script assimilates
# (ଙ୍କ, ଞ୍ଚ) but people type a plain "n" for all of them.
NASAL_COLLAPSE = (
    ("ngkh", "nkh"), ("ngk", "nk"), ("nggh", "ngh"), ("ngg", "ng"),
    ("nychh", "nchh"), ("nych", "nch"), ("nyjh", "njh"), ("nyj", "nj"),
    ("nyc", "nc"),
)

# --------------------------------------------------------------------------
# What counts as Sanskrit-in-Odia-script.
#
# Tier 1 is unambiguous: a final anusvara or visarga, or any of the vocalics
# and the avagraha, which r12a records as existing in Odia specifically for
# Sanskrit transcription.
#
# Tier 2 is a conjunct that survives only in tatsama vocabulary. On its own a
# tatsama conjunct proves little — ତ୍ର is everywhere in ordinary Odia — so a
# tier-2 hit only qualifies a word when it also carries a Sanskrit vowel or
# sign. That keeps the yield honest rather than large.
# --------------------------------------------------------------------------
TIER1_CHARS = {AVAGRAHA, "ୠ", "ଌ", "ୡ", "ୄ", "ୢ", "ୣ"}
TIER1_FINAL = {"ଂ", "ଃ"}

TATSAMA_CONJUNCTS = (
    "ଜ୍ଞ", "କ୍ଷ", "ଷ୍ଟ", "ଷ୍ଣ", "ଷ୍ପ", "ଦ୍ଧ", "ଦ୍ୱ", "ସ୍ୱ", "ଶ୍ଚ",
    "ତ୍ମ", "ହ୍ମ", "ଶ୍ୱ", "ସ୍ମ", "ତ୍ୱ", "ଧ୍ୟ", "ର୍ଯ୍ୟ", "ଦ୍ଭ", "ଷ୍ଠ",
    "ଙ୍କ", "ଙ୍ଗ", "ଞ୍ଚ", "ଞ୍ଜ", "ସ୍ଥ", "ଣ୍ଡ", "ଚ୍ଛ", "ଦ୍ୟ", "ଣ୍ୟ",
)
SANSKRIT_VOWELS = {"ୃ", "ଋ", "ୄ", "ୠ", "ଌ", "ୢ", "ୡ", "ୣ"}
SANSKRIT_SIGNS = {"ଂ", "ଃ", AVAGRAHA}


def sanskritness(word: str) -> int:
    """0 = ordinary Odia. Higher = more certainly a Sanskrit form."""
    score = 0
    if any(ch in TIER1_CHARS for ch in word):
        score += 3
    if word and word[-1] in TIER1_FINAL:
        score += 2

    has_conjunct = any(c in word for c in TATSAMA_CONJUNCTS)
    has_vowel = any(ch in SANSKRIT_VOWELS for ch in word)
    has_sign = any(ch in SANSKRIT_SIGNS for ch in word)
    if has_conjunct and (has_vowel or has_sign):
        score += 2
    return score


MIN_SCORE = 2

# --------------------------------------------------------------------------
# The seed list.
#
# The heuristics above are shape-based, and a whole class of liturgical
# vocabulary has no distinguishing shape. ଓଁ is the clearest case: the pranava
# is two characters, carries no final anusvara, no vocalic and no tatsama
# conjunct, so it scores 0 and was dropped — and "om" then came out ଓଂ, which is
# not how the pranava is written. ଶ୍ରୀ, ହରି, ରାମ and ଶିବ have the same problem.
#
# AGENTS.md §4 already settled the principle: "a hand-curated common-word list
# is essential, not a hack." This is that list for the devotional register.
#
# Every entry is CHECKED against the corpus at build time and a missing one is
# reported loudly, so a typo in an Odia string here cannot pass silently — the
# same reasoning that makes core/src/rules.ts fail loudly on a bad mapping.
# --------------------------------------------------------------------------
SEED = [
    # the pranava and the invocations
    "ଓଁ", "ଶ୍ରୀ", "ଜୟ", "ନମସ୍କାର", "ପ୍ରଣାମ",
    # Jagannath and Puri
    "ଜଗନ୍ନାଥ", "ବଳଭଦ୍ର", "ସୁଭଦ୍ରା", "ନୀଳାଚଳ", "ପୁରୁଷୋତ୍ତମ", "ରଥ", "ଦାରୁ",
    # the wider pantheon
    "ହରି", "ରାମ", "ଶିବ", "ବିଷ୍ଣୁ", "ଗଣେଶ", "ଦୁର୍ଗା", "ଲକ୍ଷ୍ମୀ", "ସରସ୍ୱତୀ",
    "ନାରାୟଣ", "ଗୋବିନ୍ଦ", "ମାଧବ", "କେଶବ", "ବାସୁଦେବ", "ଅନନ୍ତ", "ପ୍ରଭୁ", "ଈଶ୍ୱର",
    # the vocabulary of the texts themselves
    "ବେଦ", "ପୁରାଣ", "ଗୀତା", "ଶ୍ଳୋକ", "ସ୍ତୋତ୍ର", "ମନ୍ତ୍ର", "ଯଜ୍ଞ", "ପୂଜା",
    "ଭଗବାନ", "ଭକ୍ତ", "ଗୁରୁ", "ଦେବ", "ଦେବୀ", "ଧର୍ମ", "କର୍ମ", "ଯୋଗ", "ମୋକ୍ଷ",
    "ଆତ୍ମା", "ପରମାତ୍ମା", "ମାୟା", "ଶାନ୍ତି", "ମଙ୍ଗଳ", "ଅମୃତ", "ହୃଦୟ", "ଧ୍ୟାନ",
]


def romanize(word: str) -> str | None:
    """Careful romanization. Returns None for anything not purely Odia."""
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
        if ch in SILENT:
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
        return None

    if pending:
        out.append("a")
    return "".join(out)


def variants(roman: str, has_vocalic: bool) -> list[str]:
    """The spellings a person might actually type."""
    seeds = {roman}
    if ANUSVARA_MARK in roman or CANDRABINDU_MARK in roman:
        seeds = {
            roman.replace(ANUSVARA_MARK, "m").replace(CANDRABINDU_MARK, "n"),
            roman.replace(ANUSVARA_MARK, "n").replace(CANDRABINDU_MARK, "n"),
            roman.replace(ANUSVARA_MARK, "").replace(CANDRABINDU_MARK, ""),
            # Candrabindu as "m" too. build_common_lexicon.py only ever writes
            # it "n", which is right for ମୁଁ ("mun") and wrong for the one word
            # that matters most here: the pranava ଓଁ is universally typed "om",
            # and without this it was only reachable as "on" — so "om" fell
            # through to the rules and produced ଓଂ, which is not how the
            # pranava is written.
            roman.replace(ANUSVARA_MARK, "m").replace(CANDRABINDU_MARK, "m"),
        }

    forms: set[str] = set()
    for seed in seeds:
        forms.add(seed)
        for long_form, short_form in NASAL_COLLAPSE:
            if long_form in seed:
                forms.add(seed.replace(long_form, short_form))
    longest = sorted(seeds, key=len, reverse=True)[0]

    if has_vocalic:
        for f in list(forms):
            forms.add(f.replace("ru", "ri"))

    # People rarely double a long vowel.
    for f in list(forms):
        forms.add(f.replace("aa", "a").replace("ii", "i").replace("uu", "u"))
        forms.add(f.replace("ii", "ee").replace("uu", "oo"))

    # A word-final inherent vowel is frequently dropped.
    for f in list(forms):
        if len(f) > 3 and f.endswith("a"):
            forms.add(f[:-1])

    # Sanskrit-specific: a final visarga is very often just not typed —
    # "namah" and "nama" must both reach ନମଃ.
    for f in list(forms):
        if len(f) > 3 and f.endswith("h"):
            forms.add(f[:-1])

    if "w" in longest:
        forms.add(longest.replace("w", "v"))

    return [
        f
        for f in forms
        if 1 < len(f) <= 40 and ANUSVARA_MARK not in f and CANDRABINDU_MARK not in f
    ]


def fmt(value: float) -> str:
    return f"{value:.4f}".rstrip("0").rstrip(".")


def main() -> int:
    if not WEBFREQ.exists():
        print(f"missing {WEBFREQ}", file=sys.stderr)
        return 1

    # ---------------------------------------------------------------- read
    seed = {canonical(w) for w in SEED}
    counts: dict[str, int] = {}
    selected: list[tuple[str, int, int]] = []  # word, count, score
    total = 0
    for line in WEBFREQ.open(encoding="utf-8"):
        if line.startswith("#"):
            continue
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 2:
            continue
        try:
            count = int(parts[1])
        except ValueError:
            continue
        total += 1
        word = canonical(parts[0])
        counts[word] = count
        score = sanskritness(word)
        if score >= MIN_SCORE:
            selected.append((word, count, score))
        elif word in seed:
            selected.append((word, count, 99))  # 99 = admitted by seed

    print(f"[read ] {total:,} types; {len(selected):,} selected "
          f"(score >= {MIN_SCORE}, or in the seed list)")

    # A seed word absent from the corpus is almost certainly a typo in an Odia
    # string literal, which is exactly the class of error you cannot see by eye.
    missing = sorted(w for w in seed if w not in counts)
    if missing:
        print(f"[warn ] {len(missing)} seed word(s) NOT in webfreq.tsv — "
              f"check for a typo or a spelling variant:", file=sys.stderr)
        for w in missing:
            print(f"           {w}   {' '.join(f'U+{ord(c):04X}' for c in w)}",
                  file=sys.stderr)

    # --------------------------------------------------------------- rows
    selected.sort(key=lambda r: -r[1])
    peak = selected[0][1] if selected else 1

    rows: dict[tuple[str, str], float] = {}
    unigrams: dict[str, float] = {}
    skipped = 0

    for word, count, score in selected:
        roman = romanize(word)
        if roman is None:
            skipped += 1
            continue
        has_vocalic = any(ch in SANSKRIT_VOWELS for ch in word)
        keys = variants(roman, has_vocalic)
        if not keys:
            skipped += 1
            continue

        # Same 0..2.303 scale as build_common_lexicon.py, so this lexicon's
        # weights are directly comparable with the core one's.
        weight = (math.log1p(count) / math.log1p(peak)) * MAX_LOGFREQ
        unigrams[word] = max(unigrams.get(word, 0.0), weight)

        for key in keys:
            if not key.isascii() or not key.isalpha() or not key.islower():
                continue
            # A generated key is a guess; never let it outrank the careful
            # romanization of the same word.
            w = weight if key == roman else weight * 0.6
            prior = rows.get((key, word))
            if prior is None or w > prior:
                rows[(key, word)] = w

    print(f"[build] {len(rows):,} lexicon rows over {len(unigrams):,} words "
          f"({skipped:,} words skipped as not purely Odia)")

    # -------------------------------------------------------------- write
    OUT_LEX.parent.mkdir(parents=True, exist_ok=True)

    # Code-unit order, so core/src/lexicon.ts sortOrderIfNeeded() finds the file
    # already sorted and skips re-sorting at startup. Keys are pure [a-z], so
    # Python's ordering and JavaScript's UTF-16 ordering agree.
    ordered = sorted(rows.items(), key=lambda kv: (kv[0][0], -kv[1], kv[0][1]))

    def write_lexicon(path: Path, keep: set[str] | None) -> tuple[int, int]:
        """Emit rows for `keep` (all words when None), sorted by key.

        The pruning MUST be by word, never a truncation of this key-sorted
        stream. Cutting the stream off at a byte budget drops every key after
        roughly "d" — which is how ଓଁ went missing and "om" fell through to the
        rules and produced ଓଂ. Silent, and invisible in the row count.
        """
        written = 0
        size = 0
        with path.open("w", encoding="utf-8") as fh:
            head = (
                "# Sanskrit-in-Odia-script lexicon, mined from core/data/webfreq.tsv\n"
                "# by Appv2/scripts/mine_webfreq_sanskrit.py. Stage 0 — no network.\n"
                "# romanKey\todiaWord\tweight\n"
            )
            fh.write(head)
            size += len(head.encode("utf-8"))
            for (key, word), weight in ordered:
                if keep is not None and word not in keep:
                    continue
                assert is_canonical(word), word
                row = f"{key}\t{word}\t{fmt(weight)}\n"
                fh.write(row)
                size += len(row.encode("utf-8"))
                written += 1
        return written, size

    # Bytes per word, to pick how many words fit. Measured rather than guessed,
    # because key expansion means the row count per word varies a lot.
    by_weight = sorted(unigrams.items(), key=lambda kv: -kv[1])
    rows_for: dict[str, int] = {}
    bytes_for: dict[str, int] = {}
    for (key, word), weight in ordered:
        rows_for[word] = rows_for.get(word, 0) + 1
        bytes_for[word] = bytes_for.get(word, 0) + len(
            f"{key}\t{word}\t{fmt(weight)}\n".encode("utf-8")
        )

    keep_web: set[str] = set()
    running = 0
    for word, _ in by_weight:
        cost = bytes_for.get(word, 0)
        if running + cost > WEB_BUDGET_BYTES:
            continue  # a later, cheaper word may still fit
        keep_web.add(word)
        running += cost

    n_full, size_full = write_lexicon(OUT_LEX, None)
    n_web, size_web = write_lexicon(OUT_LEX_WEB, keep_web)
    print(f"[prune] web lexicon keeps {len(keep_web):,} of {len(unigrams):,} words "
          f"by frequency, {len(unigrams) - len(keep_web):,} dropped")

    def write_unigrams(path: Path, words: list[tuple[str, float]]) -> None:
        with path.open("w", encoding="utf-8") as fh:
            fh.write(
                "# Sanskrit-in-Odia-script unigrams, mined from core/data/webfreq.tsv\n"
                f"# by Appv2/scripts/mine_webfreq_sanskrit.py. Range 0..{MAX_LOGFREQ}.\n"
                "# odiaWord\tlogfreq\n"
            )
            for word, weight in words:
                assert 0.0 <= weight <= MAX_LOGFREQ, (word, weight)
                fh.write(f"{word}\t{fmt(weight)}\n")

    # Sorted by word, so the engine can binary-search it.
    all_uni = sorted(unigrams.items())
    write_unigrams(OUT_UNI, all_uni)
    # The web unigrams must cover exactly the web lexicon's words, or a word
    # would be offerable without its frequency term and rank oddly.
    top_uni = sorted((w, f) for w, f in unigrams.items() if w in keep_web)
    write_unigrams(OUT_UNI_WEB, top_uni)

    print(f"[write] {OUT_LEX.relative_to(ROOT)}      {n_full:,} rows, {size_full/1024:.0f} KB")
    print(f"[write] {OUT_LEX_WEB.relative_to(ROOT)}  {n_web:,} rows, {size_web/1024:.0f} KB")
    print(f"[write] {OUT_UNI.relative_to(ROOT)}     {len(all_uni):,} words")
    print(f"[write] {OUT_UNI_WEB.relative_to(ROOT)} {len(top_uni):,} words")

    # A visible sample, so a reader can sanity-check what was selected.
    print("\nHighest-frequency selections:")
    for word, count, score in selected[:12]:
        roman = romanize(word)
        print(f"    {word:22s} {count:7,d}  score {score}  <- {roman}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
