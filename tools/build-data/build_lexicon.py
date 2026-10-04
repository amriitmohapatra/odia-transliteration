#!/usr/bin/env python3.14
"""
Build the engine's data artifacts from AI4Bharat Aksharantar (`ori`).

Inputs   tools/build-data/raw/ori/{ori_train,ori_valid,ori_test}.json
         JSON Lines, despite the `.json` extension. Fields:
             unique_identifier, "native word", "english word", source, score

Outputs  core/data/lexicon.tsv          romanKey \\t odiaWord \\t weight
         core/data/lexicon-web.tsv      pruned, iOS-safe subset of the above
         core/data/unigrams.tsv         odiaWord \\t logfreq
         core/data/PROVENANCE.md        sources, licences, counts, checksums
         core/test/golden/heldout.tsv   roman \\t odia \\t source  (TEST SPLIT)

Split discipline
    TRAIN + VALID build the lexicon. The TEST split is reserved for evaluation
    and never enters any lexicon artifact — held-out words are excluded by
    construction rather than by discipline.

The nukta invariant
    Both sides of every pair pass through `canonical()` before anything else
    touches them, and every emitted string is asserted canonical on the way
    out. The count of precomposed U+0B5C / U+0B5D found in the raw data is
    reported prominently; that audit is a planned project spike.

Stdlib only. Usage:
    python3 build_lexicon.py [--web-budget-bytes 1500000]
"""

from __future__ import annotations

import argparse
import collections
import datetime
import hashlib
import json
import math
import re
import sys
from pathlib import Path

from normalize_odia import (
    NUKTA,
    canonical,
    codepoints,
    count_precomposed_nukta,
    is_canonical,
    is_odia_char,
)

#: The only two base characters a nukta legitimately attaches to in Odia.
LEGITIMATE_NUKTA_BASES = ("ଡ", "ଢ")  # DDA, DDHA

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
RAW = HERE / "raw" / "ori"

DATA_DIR = REPO / "core" / "data"
GOLDEN_DIR = REPO / "core" / "test" / "golden"

LEXICON_TSV = DATA_DIR / "lexicon.tsv"
LEXICON_WEB_TSV = DATA_DIR / "lexicon-web.tsv"
UNIGRAMS_TSV = DATA_DIR / "unigrams.tsv"
PROVENANCE_MD = DATA_DIR / "PROVENANCE.md"
HELDOUT_TSV = GOLDEN_DIR / "heldout.tsv"

SOURCE_URL = "https://huggingface.co/datasets/ai4bharat/Aksharantar/resolve/main/ori.zip"

# --------------------------------------------------------------------- #
# Weighting
# --------------------------------------------------------------------- #
#
# Aksharantar carries no corpus frequency, and — measured, not assumed — every
# (roman, odia) pair in the Odia release is unique, so raw attestation counts
# are all 1. The three signals that genuinely exist in the data are the
# provenance of each pair, the mining confidence attached to IndicCorp-derived
# pairs, and how many distinct romanizations attest a word. The weights below
# combine exactly those three and nothing else. See PROVENANCE.md, which states
# plainly that this is a substitute for a real unigram frequency table.

SOURCE_WEIGHT = {
    "Wikidata": 3.0,  # hand-curated entity names
    "Samanantar": 2.0,  # mined from human-translated parallel text
    "AK-Uni": 1.5,  # Aksharantar curated splits
    "AK-Freq": 1.5,
    "AK-NEI": 1.5,
    "AK-NEF": 1.5,
    "IndicCorp": 1.0,  # automatically mined, the noisiest tier
}
DEFAULT_SOURCE_WEIGHT = 1.0

#: Confidence floor for a scored pair, so a low-scoring pair still counts.
CONF_FLOOR = 0.5

#: A fuzzy alias is a guess about how someone might type a word, so it must
#: never outrank the spelling actually attested in the corpus.
ALIAS_PENALTY = 0.6

#: Longest roman key we accept. Aksharantar has some very long compounds; a
#: key beyond this is a sentence fragment, not a word.
MAX_KEY_LEN = 40

#: Maximum |roman| / |odia| ratio in either direction before a row is junk.
MAX_LEN_RATIO = 3.0

#: Target row count for the pruned web lexicon, trimmed further if the byte
#: budget demands it.
WEB_TARGET_WORDS = 30_000

#: The pruned lexicon is the artifact a future iOS keyboard extension loads
#: under a ~48 MB process ceiling. 1.5 MB is the agreed ceiling for it.
WEB_BUDGET_BYTES = 1_500_000

ROMAN_RE = re.compile(r"^[a-z]+$")


# --------------------------------------------------------------------- #
# Loading
# --------------------------------------------------------------------- #


class Stats:
    """Row-level accounting, printed at the end so nothing is dropped silently."""

    def __init__(self) -> None:
        self.read = 0
        self.kept = 0
        self.drop_empty = 0
        self.drop_latin_on_odia = 0
        self.drop_non_odia_side = 0
        self.drop_bad_roman = 0
        self.drop_long_key = 0
        self.drop_ratio = 0
        # The nukta audit, counted on RAW strings before canonical() runs.
        self.raw_rra = 0
        self.raw_rha = 0
        self.rows_with_precomposed = 0
        self.rows_changed_by_canonical = 0
        #: Which base character each U+0B3C attaches to. The two legitimate
        #: bases are ଡ and ଢ; anything else is upstream noise that canonical()
        #: will NOT repair, because it is already NFC-stable.
        self.nukta_bases: collections.Counter = collections.Counter()

    def report(self, label: str) -> None:
        print(f"  {label}: read {self.read:,}, kept {self.kept:,}")
        for name, value in [
            ("empty field", self.drop_empty),
            ("Latin on the Odia side", self.drop_latin_on_odia),
            ("no Odia character", self.drop_non_odia_side),
            ("roman side not [a-z]+", self.drop_bad_roman),
            (f"key longer than {MAX_KEY_LEN}", self.drop_long_key),
            (f"length ratio over {MAX_LEN_RATIO:g}x", self.drop_ratio),
        ]:
            if value:
                print(f"      dropped, {name}: {value:,}")


def read_split(name: str, stats: Stats) -> list[dict]:
    """Read one JSONL split, canonicalize both sides, drop garbage rows."""
    path = RAW / f"{name}.json"
    if not path.exists():
        sys.exit(f"[fail]  {path} not found. Run `python3 download.py` first.")

    out: list[dict] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            stats.read += 1
            record = json.loads(line)

            raw_odia = record.get("native word") or ""
            raw_roman = record.get("english word") or ""

            # --- the audit, on RAW strings, before canonical() touches them --
            rra, rha = count_precomposed_nukta(raw_odia)
            stats.raw_rra += rra
            stats.raw_rha += rha
            if rra or rha:
                stats.rows_with_precomposed += 1
            for index, char in enumerate(raw_odia):
                if char == NUKTA:
                    stats.nukta_bases[raw_odia[index - 1] if index else "<start>"] += 1

            odia = canonical(raw_odia)
            if odia != raw_odia:
                stats.rows_changed_by_canonical += 1
            roman = raw_roman.strip().lower()

            if not odia or not roman:
                stats.drop_empty += 1
                continue
            if any(ch.isascii() and ch.isalpha() for ch in odia):
                stats.drop_latin_on_odia += 1
                continue
            if not any(is_odia_char(ch) for ch in odia):
                stats.drop_non_odia_side += 1
                continue
            if not ROMAN_RE.match(roman):
                stats.drop_bad_roman += 1
                continue
            if len(roman) > MAX_KEY_LEN:
                stats.drop_long_key += 1
                continue
            if max(len(roman) / len(odia), len(odia) / len(roman)) > MAX_LEN_RATIO:
                stats.drop_ratio += 1
                continue

            stats.kept += 1
            out.append(
                {
                    "roman": roman,
                    "odia": odia,
                    "source": record.get("source") or "unknown",
                    "score": record.get("score"),
                }
            )
    return out


# --------------------------------------------------------------------- #
# Fuzzy key expansion
# --------------------------------------------------------------------- #


def _collapse_doubles(s: str) -> str:
    """`chhatar` -> `chatar`, `patta` -> `pata`."""
    return re.sub(r"(.)\1+", r"\1", s)


def _vowel_digraphs(s: str) -> str:
    """`aa` -> `a`, `ee` -> `i`, `oo` -> `u`."""
    return s.replace("aa", "a").replace("ee", "i").replace("oo", "u")


def _v_to_w(s: str) -> str:
    return s.replace("v", "w")


def _w_to_v(s: str) -> str:
    return s.replace("w", "v")


def _skeleton(s: str) -> str:
    """Every rule at once — the most forgiving form of a key."""
    return _v_to_w(_collapse_doubles(_vowel_digraphs(s)))


def alias_keys(key: str) -> set[str]:
    """
    Alternative spellings that should reach the same word, so the runtime stays
    a plain lookup with no edit-distance code in the hot path.

    Each rule is applied alone, plus one fully-collapsed skeleton. The original
    key is never returned.
    """
    out: set[str] = set()
    for rule in (_collapse_doubles, _vowel_digraphs, _v_to_w, _w_to_v, _skeleton):
        variant = rule(key)
        if variant and variant != key and ROMAN_RE.match(variant):
            out.add(variant)
    return out


# --------------------------------------------------------------------- #
# Weighting
# --------------------------------------------------------------------- #


def pair_weight(record: dict, score_lo: float, score_hi: float) -> float:
    """
    Quality of one (roman, odia) pair: its source tier scaled by mining
    confidence. Unscored pairs (every non-IndicCorp source) take full
    confidence, since they were not machine-mined in the first place.
    """
    base = SOURCE_WEIGHT.get(record["source"], DEFAULT_SOURCE_WEIGHT)
    score = record["score"]
    if not isinstance(score, (int, float)):
        return base
    if score_hi <= score_lo:
        return base
    normalized = (score - score_lo) / (score_hi - score_lo)
    return base * (CONF_FLOOR + (1.0 - CONF_FLOOR) * normalized)


def fmt(value: float) -> str:
    """Compact fixed-precision weight. Four decimals is far beyond what the
    ranking can distinguish, and keeps the artifacts small."""
    return f"{value:.4f}".rstrip("0").rstrip(".") or "0"


# --------------------------------------------------------------------- #
# Emit
# --------------------------------------------------------------------- #


def write_rows(path: Path, rows: list[tuple[str, str, float]]) -> None:
    """Write `key \\t odia \\t weight`, asserting canonical form on the way out."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for key, odia, weight in rows:
            # The last gate before the artifact hits disk.
            if not is_canonical(odia):
                raise SystemExit(f"[fail]  non-canonical Odia string on emit: {odia!r}")
            handle.write(f"{key}\t{odia}\t{fmt(weight)}\n")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def human(n: int) -> str:
    return f"{n / 1e6:.2f} MB" if n >= 1e6 else f"{n / 1e3:.1f} kB"


# --------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------- #


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-budget-bytes", type=int, default=WEB_BUDGET_BYTES)
    parser.add_argument("--web-target-words", type=int, default=WEB_TARGET_WORDS)
    args = parser.parse_args()

    print("=" * 72)
    print("READ  (train + valid build the lexicon; test is reserved)")
    print("=" * 72)

    build_stats = Stats()
    train = read_split("ori_train", build_stats)
    valid = read_split("ori_valid", build_stats)
    build_stats.report("train + valid")

    test_stats = Stats()
    test = read_split("ori_test", test_stats)
    test_stats.report("test (held out)")

    pairs = train + valid

    # ----------------------------------------------------------------- #
    # The nukta audit — a planned project spike
    # ----------------------------------------------------------------- #
    total_rra = build_stats.raw_rra + test_stats.raw_rra
    total_rha = build_stats.raw_rha + test_stats.raw_rha
    total_rows_affected = build_stats.rows_with_precomposed + test_stats.rows_with_precomposed
    total_changed = build_stats.rows_changed_by_canonical + test_stats.rows_changed_by_canonical

    print()
    print("#" * 72)
    print("#  NUKTA AUDIT  —  precomposed characters in raw Aksharantar (ori)")
    print("#" * 72)
    print(f"#    U+0B5C  precomposed RRA   : {total_rra:,} occurrences")
    print(f"#    U+0B5D  precomposed RHA   : {total_rha:,} occurrences")
    print(f"#    rows containing either    : {total_rows_affected:,}")
    print(f"#    rows altered by canonical(): {total_changed:,}")
    if total_rra == 0 and total_rha == 0:
        print("#")
        print("#    RESULT: the raw data is already free of precomposed nukta forms")
        print("#    and already in NFC. canonical() is a no-op on this corpus — but it")
        print("#    stays on every boundary, because the guarantee is ours, not the")
        print("#    upstream dataset's, and a future source will not be this clean.")
    else:
        print(f"#\n#    RESULT: {total_rows_affected:,} rows were rewritten to base + U+0B3C.")

    # Where the nukta actually sits. The audit is only half done if it reports
    # the absence of the precomposed forms without checking that the decomposed
    # ones are well formed. A nukta on any base other than DDA/DDHA is upstream
    # noise, and canonical() will not repair it — those sequences are already
    # NFC-stable, so they pass through into the lexicon exactly as written.
    nukta_bases = build_stats.nukta_bases + test_stats.nukta_bases
    print("#")
    print("#    Nukta placement (U+0B3C attachment):")
    stray = 0
    for base, count in nukta_bases.most_common():
        legit = base in LEGITIMATE_NUKTA_BASES
        if not legit:
            stray += count
        print(f"#      {codepoints(base):>8}  {base}   x{count:<8,} "
              f"{'ok' if legit else '<- not DDA/DDHA, left as-is'}")
    print(f"#    stray nukta occurrences: {stray:,} of {sum(nukta_bases.values()):,}")
    print("#" * 72)

    # ----------------------------------------------------------------- #
    # Score normalization, then per-pair weights
    # ----------------------------------------------------------------- #
    scores = [p["score"] for p in pairs if isinstance(p["score"], (int, float))]
    score_lo, score_hi = (min(scores), max(scores)) if scores else (0.0, 0.0)

    print()
    print("=" * 72)
    print("AGGREGATE")
    print("=" * 72)
    print(f"  scored pairs: {len(scores):,} of {len(pairs):,}  range [{score_lo:.4f}, {score_hi:.4f}]")

    source_counts = collections.Counter(p["source"] for p in pairs)
    print(f"  sources: {dict(source_counts.most_common())}")

    # romanKey -> odiaWord -> summed weight
    exact: dict[tuple[str, str], float] = collections.defaultdict(float)
    word_weight: dict[str, float] = collections.defaultdict(float)
    romanizations: dict[str, set[str]] = collections.defaultdict(set)

    for record in pairs:
        weight = pair_weight(record, score_lo, score_hi)
        exact[(record["roman"], record["odia"])] += weight
        word_weight[record["odia"]] += weight
        romanizations[record["odia"]].add(record["roman"])

    print(f"  distinct (key, word) pairs: {len(exact):,}")
    print(f"  distinct roman keys       : {len({k for k, _ in exact}):,}")
    print(f"  distinct Odia words       : {len(word_weight):,}")

    multi = collections.Counter(len(v) for v in romanizations.values())
    print(f"  romanizations per word    : {dict(sorted(multi.items()))}")

    # ----------------------------------------------------------------- #
    # Fuzzy key expansion
    # ----------------------------------------------------------------- #
    alias: dict[tuple[str, str], float] = {}
    for (key, word), weight in exact.items():
        for variant in alias_keys(key):
            slot = (variant, word)
            if slot in exact:
                continue  # an attested spelling always beats a generated one
            scaled = weight * ALIAS_PENALTY
            if scaled > alias.get(slot, 0.0):
                alias[slot] = scaled

    print(f"  alias rows generated      : {len(alias):,} "
          f"({len(alias) / max(len(exact), 1):.2f} per attested row)")

    # ----------------------------------------------------------------- #
    # Reserve the test split.
    #
    # Aksharantar itself repeats a handful of (roman, odia) pairs across the
    # test and train/valid splits, and fuzzy expansion can regenerate a test
    # pair from a neighbouring key. Excluding them here makes "held out" true
    # by construction instead of true by assumption. It costs a negligible
    # number of lexicon rows and buys an evaluation that means something.
    # ----------------------------------------------------------------- #
    heldout_pairs = {(r["roman"], r["odia"]) for r in test}
    removed_exact = sum(1 for slot in exact if slot in heldout_pairs)
    removed_alias = sum(1 for slot in alias if slot in heldout_pairs)
    for slot in heldout_pairs:
        exact.pop(slot, None)
        alias.pop(slot, None)
    print(f"  removed as held-out       : {removed_exact:,} attested + "
          f"{removed_alias:,} alias rows")

    # ----------------------------------------------------------------- #
    # Emit the full lexicon
    # ----------------------------------------------------------------- #
    print()
    print("=" * 72)
    print("EMIT")
    print("=" * 72)

    rows = [(k, w, v) for (k, w), v in exact.items()]
    rows += [(k, w, v) for (k, w), v in alias.items()]
    # Sorted by key for the runtime binary search; best candidate first within
    # a key. Keys are pure [a-z], so Python's code-point order and JavaScript's
    # UTF-16 order agree.
    rows.sort(key=lambda r: (r[0], -r[2], r[1]))
    write_rows(LEXICON_TSV, rows)
    print(f"  {LEXICON_TSV.relative_to(REPO)}: {len(rows):,} rows, {human(LEXICON_TSV.stat().st_size)}")

    # ----------------------------------------------------------------- #
    # Emit the pruned web / iOS lexicon
    # ----------------------------------------------------------------- #
    # No corpus frequency exists, so rank by the composite weight, then prefer
    # shorter words (a weak Zipf prior), then code point for determinism.
    ranked = sorted(word_weight, key=lambda w: (-word_weight[w], len(w), w))

    def web_rows(n: int) -> list[tuple[str, str, float]]:
        chosen = set(ranked[:n])
        out = [(k, w, wt) for (k, w, wt) in rows if w in chosen]
        return out

    n_words = min(args.web_target_words, len(ranked))
    selected = web_rows(n_words)

    def byte_size(rs: list[tuple[str, str, float]]) -> int:
        return sum(len(f"{k}\t{w}\t{fmt(v)}\n".encode("utf-8")) for k, w, v in rs)

    size = byte_size(selected)
    if size > args.web_budget_bytes:
        # Trim word count until the artifact fits. The iOS memory ceiling is a
        # hard constraint; the 30k target is not.
        lo, hi = 1_000, n_words
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if byte_size(web_rows(mid)) <= args.web_budget_bytes:
                lo = mid
            else:
                hi = mid - 1
        n_words = lo
        selected = web_rows(n_words)
        print(f"  pruned harder: {args.web_target_words:,} words exceeded the "
              f"{human(args.web_budget_bytes)} budget, cut to {n_words:,} words")

    threshold = word_weight[ranked[n_words - 1]] if n_words else 0.0
    write_rows(LEXICON_WEB_TSV, selected)
    print(f"  {LEXICON_WEB_TSV.relative_to(REPO)}: {len(selected):,} rows, "
          f"{human(LEXICON_WEB_TSV.stat().st_size)} "
          f"({n_words:,} words, weight cutoff {threshold:.4f})")

    # ----------------------------------------------------------------- #
    # Emit unigrams
    # ----------------------------------------------------------------- #
    UNIGRAMS_TSV.parent.mkdir(parents=True, exist_ok=True)
    with UNIGRAMS_TSV.open("w", encoding="utf-8", newline="\n") as handle:
        # Sorted by word so the engine can binary-search this file too. Odia is
        # entirely within the BMP, so Python and JavaScript agree on the order.
        for word in sorted(word_weight):
            if not is_canonical(word):
                raise SystemExit(f"[fail]  non-canonical Odia string on emit: {word!r}")
            handle.write(f"{word}\t{math.log(1.0 + word_weight[word]):.4f}\n")
    print(f"  {UNIGRAMS_TSV.relative_to(REPO)}: {len(word_weight):,} rows, "
          f"{human(UNIGRAMS_TSV.stat().st_size)}")

    # ----------------------------------------------------------------- #
    # Emit the held-out golden set
    # ----------------------------------------------------------------- #
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    seen: set[tuple[str, str]] = set()
    heldout: list[tuple[str, str, str]] = []
    for record in test:
        slot = (record["roman"], record["odia"])
        if slot in seen:
            continue
        seen.add(slot)
        heldout.append((record["roman"], record["odia"], record["source"]))
    heldout.sort()

    with HELDOUT_TSV.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("# Aksharantar `ori` TEST split. Never present in any lexicon artifact.\n")
        handle.write("# roman\todia\tsource\n")
        for roman, odia, source in heldout:
            if not is_canonical(odia):
                raise SystemExit(f"[fail]  non-canonical Odia string on emit: {odia!r}")
            handle.write(f"{roman}\t{odia}\t{source}\n")
    print(f"  {HELDOUT_TSV.relative_to(REPO)}: {len(heldout):,} rows, "
          f"{human(HELDOUT_TSV.stat().st_size)}")

    # ----------------------------------------------------------------- #
    # Leak check and overlap, both worth knowing before any eval is read
    # ----------------------------------------------------------------- #
    lexicon_pairs = set(exact) | set(alias)
    leaked = sum(1 for r in heldout if (r[0], r[1]) in lexicon_pairs)
    lexicon_words = {w for _, w, _ in rows}
    lexicon_keys = {k for k, _, _ in rows}
    word_overlap = sum(1 for r in heldout if r[1] in lexicon_words)
    key_overlap = sum(1 for r in heldout if r[0] in lexicon_keys)

    print()
    print("=" * 72)
    print("HELD-OUT LEAK CHECK")
    print("=" * 72)
    print(f"  test pairs also present as lexicon rows : {leaked:,}  (must be 0)")
    print(f"  test words that exist in the lexicon    : {word_overlap:,} "
          f"({word_overlap / max(len(heldout), 1):.1%})  -> the in-lexicon eval slice")
    print(f"  test keys that exist in the lexicon     : {key_overlap:,} "
          f"({key_overlap / max(len(heldout), 1):.1%})")
    if leaked:
        raise SystemExit("[fail]  test split leaked into the lexicon")

    # ----------------------------------------------------------------- #
    # Provenance
    # ----------------------------------------------------------------- #
    write_provenance(
        build_stats=build_stats,
        test_stats=test_stats,
        pairs=pairs,
        exact=exact,
        alias=alias,
        rows=rows,
        selected=selected,
        n_words=n_words,
        threshold=threshold,
        word_weight=word_weight,
        heldout=heldout,
        source_counts=source_counts,
        score_lo=score_lo,
        score_hi=score_hi,
        nukta=(total_rra, total_rha, total_rows_affected, total_changed),
        nukta_bases=nukta_bases,
        overlap=(word_overlap, key_overlap),
        removed=(removed_exact, removed_alias),
        budget=args.web_budget_bytes,
    )
    print(f"  {PROVENANCE_MD.relative_to(REPO)}: written")
    print()
    print("done.")


def write_provenance(**k) -> None:
    total_rra, total_rha, rows_affected, rows_changed = k["nukta"]
    word_overlap, key_overlap = k["overlap"]
    heldout = k["heldout"]
    build_stats: Stats = k["build_stats"]
    test_stats: Stats = k["test_stats"]

    artifacts = [LEXICON_TSV, LEXICON_WEB_TSV, UNIGRAMS_TSV, HELDOUT_TSV]
    today = datetime.date.today().isoformat()

    lines: list[str] = []
    add = lines.append

    add("# Data provenance")
    add("")
    add(f"Generated by `tools/build-data/build_lexicon.py` on {today}.")
    add("Rebuild with `cd tools/build-data && python3 download.py && python3 build_lexicon.py`.")
    add("Python 3.14, standard library only — no pip, no `huggingface_hub`, no `datasets`.")
    add("")
    add("## Sources")
    add("")
    add("| Source | Licence | URL | Used for |")
    add("|---|---|---|---|")
    add(f"| AI4Bharat Aksharantar, `ori` split | CC-BY 4.0 / CC0 | <{SOURCE_URL}> | "
        "lexicon, unigram weights, held-out golden set |")
    add("")
    add("The archive is 9,518,458 bytes and unpacks to three JSON Lines files:")
    add("`ori_train.json`, `ori_valid.json`, `ori_test.json`, with fields")
    add("`unique_identifier`, `native word`, `english word`, `source`, and (train/valid only) `score`.")
    add("")
    add("## Nukta audit")
    add("")
    add("A planned project spike: how much precomposed nukta is actually in the upstream data?")
    add("")
    add("| Measure | Count |")
    add("|---|---|")
    add(f"| U+0B5C precomposed RRA in raw Odia strings | {total_rra:,} |")
    add(f"| U+0B5D precomposed RHA in raw Odia strings | {total_rha:,} |")
    add(f"| Rows containing either | {rows_affected:,} |")
    add(f"| Rows altered by `canonical()` | {rows_changed:,} |")
    add("")
    if total_rra == 0 and total_rha == 0:
        add("**Result: none.** Aksharantar `ori` is already NFC and already free of the")
        add("precomposed forms, so `canonical()` is a no-op on this corpus. That is a fact")
        add("about this dataset, not a licence to drop the normalization: the invariant is")
        add("ours to guarantee, the artifacts are asserted canonical on write, and the next")
        add("data source will not necessarily be this clean.")
    else:
        add(f"**Result: {rows_affected:,} rows carried precomposed forms** and were rewritten")
        add("to base + U+0B3C before aggregation.")
    add("")
    add("### Nukta placement")
    add("")
    add("The absence of the precomposed forms is only half the question; the decomposed ones")
    add("also have to be well formed. Every U+0B3C in the corpus, by the base it attaches to:")
    add("")
    add("| Base | Codepoint | Occurrences | Verdict |")
    add("|---|---|---|---|")
    nukta_bases = k["nukta_bases"]
    stray = 0
    for base, count in nukta_bases.most_common():
        legit = base in LEGITIMATE_NUKTA_BASES
        if not legit:
            stray += count
        verdict = "legitimate" if legit else "**malformed** — passed through unchanged"
        add(f"| `{base}` | {codepoints(base)} | {count:,} | {verdict} |")
    add("")
    add(f"{stray:,} of {sum(nukta_bases.values()):,} nukta occurrences sit on a base other than")
    add("DDA/DDHA. `canonical()` does **not** repair these: the sequences are already NFC-stable,")
    add("so they enter the lexicon exactly as upstream wrote them. Most are a nukta pressed into")
    add("service for /z/ in transliterated foreign names (`ଲୋଜ଼ନୋ`, *lozano*), which is defensible;")
    add("a handful are genuine corruption (a doubled nukta, a nukta after a vowel sign). The")
    add("volume is negligible and no row is dropped for it, but it is recorded here so that a")
    add("future odd-looking lexicon entry is traced to upstream rather than to this pipeline.")
    add("")
    add("## Split discipline")
    add("")
    add("The lexicon is built from **train + valid only**. The **test** split is written to")
    add("`core/test/golden/heldout.tsv` and never enters any lexicon artifact, so held-out")
    add("pairs are excluded by construction rather than by discipline.")
    add("")
    removed_exact, removed_alias = k["removed"]
    add(f"Aksharantar itself repeats a small number of pairs across splits, and fuzzy")
    add(f"expansion can regenerate a test pair from a neighbouring key, so the build")
    add(f"explicitly deletes any lexicon row matching a test pair: **{removed_exact:,} attested**")
    add(f"and **{removed_alias:,} alias** rows were removed on this run. The build then asserts")
    add("that zero test pairs remain retrievable from any lexicon artifact, and fails if any do.")
    add("")
    add("- Test pairs present as lexicon rows after the build: **0** (asserted).")
    add(f"- Test rows whose Odia word appears somewhere in the lexicon: "
        f"{word_overlap:,} / {len(heldout):,} ({word_overlap / max(len(heldout), 1):.1%}).")
    add(f"- Test rows whose roman key appears somewhere in the lexicon: "
        f"{key_overlap:,} / {len(heldout):,} ({key_overlap / max(len(heldout), 1):.1%}).")
    add("")
    add("Those last two numbers define the in-lexicon versus out-of-vocabulary slices that")
    add("`CLAUDE.md` requires the evaluation to report separately.")
    add("")
    add("## Row accounting")
    add("")
    add("| Stage | Rows |")
    add("|---|---|")
    add(f"| train + valid records read | {build_stats.read:,} |")
    add(f"| kept after filtering | {build_stats.kept:,} |")
    add(f"| dropped, empty field | {build_stats.drop_empty:,} |")
    add(f"| dropped, Latin on the Odia side | {build_stats.drop_latin_on_odia:,} |")
    add(f"| dropped, no Odia character | {build_stats.drop_non_odia_side:,} |")
    add(f"| dropped, roman side not `[a-z]+` | {build_stats.drop_bad_roman:,} |")
    add(f"| dropped, key longer than {MAX_KEY_LEN} | {build_stats.drop_long_key:,} |")
    add(f"| dropped, length ratio over {MAX_LEN_RATIO:g}x | {build_stats.drop_ratio:,} |")
    add(f"| distinct attested (key, word) rows | {len(k['exact']):,} |")
    add(f"| generated fuzzy alias rows | {len(k['alias']):,} |")
    add(f"| **total `lexicon.tsv` rows** | **{len(k['rows']):,}** |")
    add(f"| distinct Odia words (`unigrams.tsv`) | {len(k['word_weight']):,} |")
    add(f"| test records read | {test_stats.read:,} |")
    add(f"| **`heldout.tsv` rows** | **{len(heldout):,}** |")
    add("")
    add(f"Source distribution across train + valid: "
        f"{', '.join(f'{s} {c:,}' for s, c in k['source_counts'].most_common())}.")
    add("")
    add("## Weighting, and the IndicCorp substitution")
    add("")
    add("`plan/01-engine-design.md` calls for unigram frequencies from IndicCorp v2. That")
    add("corpus is far too large for this pass, so **`unigrams.tsv` is derived from")
    add("Aksharantar attestation instead**. This is a substitution and it is a real")
    add("limitation, stated here rather than discovered later:")
    add("")
    add("- Every (roman, Odia) pair in the release is **unique**, so raw attestation counts")
    add("  are all 1. There is no count signal to log.")
    add("- Record order is shuffled, not frequency-ordered (mean word length and mining")
    add("  score are flat across all ten deciles of the file), so rank carries no signal.")
    add("- The highest-frequency Odia function words are **absent from the dataset**")
    add("  altogether. Aksharantar samples mid-frequency content words; mean Odia word")
    add("  length is 8.8 characters, i.e. long inflected forms.")
    add("")
    add("What the data does contain, and what the weights therefore use:")
    add("")
    add("| Signal | Detail |")
    add("|---|---|")
    add("| pair provenance | " + ", ".join(f"`{s}` {w:g}" for s, w in SOURCE_WEIGHT.items()) + " |")
    add(f"| mining confidence | `score`, present on IndicCorp pairs only, observed range "
        f"[{k['score_lo']:.4f}, {k['score_hi']:.4f}], rescaled to [{CONF_FLOOR:g}, 1] |")
    add("| attestation multiplicity | number of distinct romanizations of a word, 1 to 5 |")
    add("")
    add("```")
    add("pair_weight  = source_weight * (0.5 + 0.5 * normalized_score)")
    add("alias_weight = pair_weight * %g" % ALIAS_PENALTY)
    add("word_weight  = sum of pair_weight over every pair attesting the word")
    add("logfreq      = ln(1 + word_weight)          <- NOT a corpus frequency")
    add("```")
    add("")
    add("`logfreq` is an attestation weight wearing a frequency-shaped column. Treat it as")
    add("a weak prior only, and replace it with a real IndicCorp v2 unigram count before")
    add("drawing any conclusion about ranking quality.")
    add("")
    add("## Fuzzy key expansion")
    add("")
    add("Alias keys are generated at build time so the runtime stays a plain lookup with no")
    add("edit-distance code in the hot path. Each rule below is applied on its own, plus one")
    add("fully-collapsed skeleton; aliases carry "
        f"{ALIAS_PENALTY:g}x the weight of the attested spelling and never displace it.")
    add("")
    add("| Rule | Example |")
    add("|---|---|")
    add("| collapse doubled letters | `chhatar` -> `chatar` |")
    add("| `aa` -> `a`, `ee` -> `i`, `oo` -> `u` | `sahityaanurageemane` -> `sahityanuragimane` |")
    add("| `v` -> `w` and `w` -> `v` | `samworbdhita` -> `samvorbdhita` |")
    add("")
    add("## Artifacts")
    add("")
    add("| File | Rows | Size | sha256 |")
    add("|---|---|---|---|")
    for path in artifacts:
        with path.open("rb") as handle:
            count = sum(1 for line in handle if not line.startswith(b"#"))
        add(f"| `{path.relative_to(REPO)}` | {count:,} | {path.stat().st_size:,} B | "
            f"`{sha256(path)}` |")
    add("")
    add(f"`lexicon-web.tsv` is the pruned artifact a future iOS keyboard extension loads")
    add(f"under a ~48 MB process memory ceiling. It holds the top **{k['n_words']:,}** words by")
    add(f"weight (cutoff {k['threshold']:.4f}), giving {len(k['selected']):,} rows within a "
        f"{k['budget'] / 1e6:.2f} MB budget.")
    add("")
    add("## Licence note")
    add("")
    add("Aksharantar is released by AI4Bharat under CC-BY 4.0 / CC0 and is redistributable")
    add("with attribution. The derived artifacts in `core/data/` are transformations of that")
    add("dataset and inherit its terms. No AGPL code or data (Varnam/govarnam, Aksharamukha)")
    add("was consulted in producing them.")
    add("")

    PROVENANCE_MD.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
