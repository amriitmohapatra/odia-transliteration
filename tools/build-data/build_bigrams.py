#!/usr/bin/env python3
"""
Count word pairs (bigrams) in the in-repo web corpus, for context ranking.

Why
---
Some roman keys are ambiguous between two real words, and only the sentence
decides: "raja" is the Raja festival or a king, "jiba" is ଯିବ or ଜୀବ. The
previous word is the cheapest context there is. This script counts how often
word B follows word A in the same corpus the unigram counts (webfreq.tsv) came
from, so the ranker can add a small term for "B is a likely next word after A".

Same text, same tokens
----------------------
Every lane is tokenised exactly the way that lane's own frequency file was
counted (see core/data/PROVENANCE-webcorpus.md), and every token then passes the
key filter of tools/build-data/webcorpus/merge_all.py (NFC, Odia block only, at
least two code points, a base letter, no Odia digit) plus canonical(). So every
word in a pair is a word of webfreq.tsv. A token the filter drops BREAKS the
chain; it is never skipped over.

| lane       | raw text in the repo           | tokeniser (from)                   |
|------------|--------------------------------|------------------------------------|
| wikipedia  | wikipedia-raw.jsonl.gz         | count_freq.py  RE_WORD, norm_token |
| literature | raw-lit.jsonl                  | harvest_lit.py WORD_RE, norm_word  |
| news       | news-raw.jsonl                 | harvest_news.py WORD_CHARS, strip  |
| social     | social-politicians-raw.txt     | fetch_lib.py   words()             |
| gov        | gov-and-orgs-corpus.txt        | analyze_gov.py TOKEN, clean_token  |

The tokenisers are imported from those scripts (harvest_news's is nested in its
main(), so its three lines are repeated here).

The archive.org OCR lane (half of webfreq's tokens) is NOT here: its raw text
(raw-archive-books.jsonl, 224 MB) never entered the repository. The pairs
therefore come from the born-digital lanes only.

Adjacency: two tokens form a pair only when the text between them is spaces or
tabs. A newline, a danda, a comma, a digit, Latin text or a dropped token ends
the chain. The engine mirrors this: it passes the previous word as context only
across whitespace (core/src/index.ts, `transliterate`).

news-raw.jsonl keeps no punctuation (the harvester stored each page's Odia words
space-joined) and keeps the site chrome that news-freq.tsv stripped. To stand in
for that boilerplate filter, a pair that occurs on more than 30% of one host's
pages (hosts with at least 5 pages) is not counted for that host.

Outputs (core/data/)
--------------------
    bigrams.tsv       full: every pair seen at least MIN_PAIR_COUNT times
    bigrams-web.tsv   pruned for the browser: pairs whose both words are in
                      lexicon-web.tsv or unigrams-web.tsv, highest counts first,
                      within WEB_BUDGET bytes

Format, one row per line, `#` comments:

    prev <TAB> next <TAB> count     a pair
    prev <TAB> *    <TAB> total     every pair token that starts with prev,
                                    counted BEFORE any pruning

The `*` row is the denominator of the conditional, so it must survive pruning:
each file has exactly one `*` row for every prev that has a pair in that file.
Rows are sorted by prev, then the `*` row, then count descending, then next.
Output is a pure function of the committed raw files: deterministic.

    python3 tools/build-data/build_bigrams.py
    python3 tools/build-data/build_bigrams.py --holdout DIR   (dev split, see below)
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "tools" / "build-data" / "webcorpus"
DATA = ROOT / "core" / "data"
OUT_FULL = DATA / "bigrams.tsv"
OUT_WEB = DATA / "bigrams-web.tsv"
WEB_VOCAB = (DATA / "lexicon-web.tsv", DATA / "unigrams-web.tsv")

# Pairs seen once or twice are mostly noise (names, typos, one-off phrases) and
# they are where a rare prev word scores near 1 on no evidence (count 2 of a
# total of 2). Measured on the 2026-10-04 corpus: >= 2 keeps 945,299 pairs in
# 37.9 MB, >= 3 keeps 354,943 pairs in about 13 MB.
MIN_PAIR_COUNT = 3
# Hard budget for the browser file, in bytes, comments and `*` rows included.
WEB_BUDGET = 1_500_000
# --holdout DIR: every HOLDOUT_EVERY-th document of the literature, news and
# social lanes is left out of the counts and written to DIR/dev-source.txt, and
# the counts go to DIR/bigrams.tsv. A development set for tuning `[weights]
# bigram` on text the pair counts never saw (tools/eval/context.ts --source).
# core/data/ is not touched in that mode.
HOLDOUT_EVERY = 20
DEV: list[str] | None = None
# The news boilerplate stand-in (see the module docstring).
NEWS_BOILER_FRACTION = 0.30
NEWS_BOILER_MIN_PAGES = 5

NUKTA = "\u0B3C"
ZWNJ, ZWJ = "\u200C", "\u200D"
DIGITS = {chr(c) for c in range(0x0B66, 0x0B70)}
GAP = re.compile(r"[ \t\u00A0]+")

# ---------------------------------------------------------------- lane tokenisers
# Imported from the lane scripts themselves, so the tokens are the ones their
# frequency files counted. Each generator yields (start, end, token-or-None) per
# regex match; None means the lane's own tokeniser dropped the match, which still
# breaks adjacency.

sys.path.insert(0, str(CORPUS))
import analyze_gov  # noqa: E402
import count_freq  # noqa: E402
import fetch_lib  # noqa: E402
import harvest_lit  # noqa: E402
import harvest_news  # noqa: E402


def _wiki(text: str):
    # count_freq.py main(): RE_WORD, norm_token, then RE_HAS_LETTER.
    for m in count_freq.RE_WORD.finditer(text):
        t = count_freq.norm_token(m.group(0))
        yield m.start(), m.end(), (t if t and count_freq.RE_HAS_LETTER.search(t) else None)


def _lit(text: str):
    # retokenize.py count(): harvest_lit WORD_RE + norm_word, all-digit words dropped.
    for m in harvest_lit.WORD_RE.finditer(text):
        w = harvest_lit.norm_word(m.group(0))
        ok = bool(w) and not all("\u0b66" <= ch <= "\u0b6f" for ch in w)
        yield m.start(), m.end(), (w if ok else None)


def _news(text: str):
    # harvest_news.py main(), nested tokenize(): WORD_CHARS, strip, HAS_LETTER.
    for m in harvest_news.WORD_CHARS.finditer(text):
        w = m.group(0).strip("\u200c\u200d\u0b64\u0b65")
        yield m.start(), m.end(), (w if w and harvest_news.HAS_LETTER.search(w) else None)


def _social(text: str):
    # fetch_lib.words(), one match at a time (the text is already NFC).
    for m in fetch_lib.WORD_RE.finditer(text):
        kept = fetch_lib.words(m.group(0))
        yield m.start(), m.end(), (kept[0] if len(kept) == 1 else None)


def _gov(text: str):
    # analyze_gov.py main(): TOKEN + clean_token on NFC lines.
    for m in analyze_gov.TOKEN.finditer(text):
        yield m.start(), m.end(), analyze_gov.clean_token(m.group(0))


# ---------------------------------------------------------------- merge_all key filter

def canonical(s: str) -> str:
    return unicodedata.normalize("NFC", s).replace("\u0B5C", "\u0B21" + NUKTA).replace(
        "\u0B5D", "\u0B22" + NUKTA
    )


def _has_letter(w: str) -> bool:
    return any(
        c not in DIGITS and not unicodedata.combining(c) and 0x0B00 <= ord(c) <= 0x0B7F for c in w
    )


def merge_key(tok: str | None) -> str | None:
    """merge_all.py's filter: the word as webfreq.tsv would hold it, or None."""
    if tok is None:
        return None
    w = canonical(tok)
    if not all(0x0B00 <= ord(c) <= 0x0B7F for c in w):
        return None
    if len(w) < 2:
        return None
    if not _has_letter(w) or any(c in DIGITS for c in w):
        return None
    return w


def pairs_of(text: str, tokenizer) -> list[tuple[str, str]]:
    """Adjacent (prev, next) pairs: both kept by the filter, only whitespace between."""
    out: list[tuple[str, str]] = []
    prev: str | None = None
    prev_end = -1
    for start, end, tok in tokenizer(text):
        w = merge_key(tok)
        if prev is not None and w is not None and GAP.fullmatch(text, prev_end, start):
            out.append((prev, w))
        prev = w
        prev_end = end
    return out


# ---------------------------------------------------------------- lanes

def lane_wikipedia(counts: Counter) -> int:
    n = 0
    with gzip.open(CORPUS / "wikipedia-raw.jsonl.gz", "rt", encoding="utf-8") as fh:
        for line in fh:
            for p in pairs_of(json.loads(line)["text"], _wiki):
                counts[p] += 1
                n += 1
    return n


def held_out(index: int, text: str) -> bool:
    """True when --holdout is on and this document goes to the dev set instead."""
    if DEV is None or index % HOLDOUT_EVERY != 0:
        return False
    DEV.append(text)
    return True


def lane_literature(counts: Counter) -> int:
    n = 0
    with (CORPUS / "raw-lit.jsonl").open(encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            text = json.loads(line)["text"]
            if held_out(i, text):
                continue
            for p in pairs_of(text, _lit):
                counts[p] += 1
                n += 1
    return n


def lane_news(counts: Counter) -> int:
    by_host: dict[str, list[list[tuple[str, str]]]] = defaultdict(list)
    with (CORPUS / "news-raw.jsonl").open(encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            d = json.loads(line)
            if held_out(i, d["text"]):
                continue
            by_host[d["host"]].append(pairs_of(d["text"], _news))
    n = 0
    for host in sorted(by_host):
        docs = by_host[host]
        boiler: set[tuple[str, str]] = set()
        if len(docs) >= NEWS_BOILER_MIN_PAGES:
            df = Counter()
            for ps in docs:
                df.update(set(ps))
            boiler = {p for p, c in df.items() if c / len(docs) > NEWS_BOILER_FRACTION}
        for ps in docs:
            for p in ps:
                if p not in boiler:
                    counts[p] += 1
                    n += 1
    return n


def lane_social(counts: Counter) -> int:
    n = 0
    with (CORPUS / "social-politicians-raw.txt").open(encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            line = line.rstrip("\n")
            # "[bucket]<TAB>text": the bucket tag is Latin, so it never pairs.
            tab = line.find("\t")
            text = line[tab + 1 :] if line.startswith("[") and tab > 0 else line
            if held_out(i, text):
                continue
            for p in pairs_of(text, _social):
                counts[p] += 1
                n += 1
    return n


def lane_gov(counts: Counter) -> int:
    n = 0
    with (CORPUS / "gov-and-orgs-corpus.txt").open(encoding="utf-8") as fh:
        for line in fh:
            for p in pairs_of(unicodedata.normalize("NFC", line.strip()), _gov):
                counts[p] += 1
                n += 1
    return n


LANES = (
    ("wikipedia", lane_wikipedia),
    ("literature", lane_literature),
    ("news", lane_news),
    ("social", lane_social),
    ("gov", lane_gov),
)

# ---------------------------------------------------------------- output


def assert_canonical(w: str) -> None:
    if canonical(w) != w or "\u0B5C" in w or "\u0B5D" in w:
        raise SystemExit(f"error: non-canonical Odia {w!r} in bigram output")


def read_vocab() -> set[str]:
    vocab: set[str] = set()
    for path in WEB_VOCAB:
        if not path.exists():
            raise SystemExit(f"error: {path} not found")
        col = 1 if path.name.startswith("lexicon") else 0
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                if not line.strip() or line.startswith("#"):
                    continue
                vocab.add(canonical(line.rstrip("\n").split("\t")[col].strip()))
    return vocab


def write(path: Path, kept: list[tuple[str, str, int]], totals: dict[str, int], header: tuple[str, ...]) -> int:
    """Write rows grouped by prev; return the byte size."""
    by_prev: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for a, b, c in kept:
        by_prev[a].append((b, c))
    lines = ["# prev\tnext\tcount    (prev\t*\ttotal = every pair token starting with prev)"]
    lines += [f"# {h}" for h in header]
    for a in sorted(by_prev):
        assert_canonical(a)
        lines.append(f"{a}\t*\t{totals[a]}")
        for b, c in sorted(by_prev[a], key=lambda bc: (-bc[1], bc[0])):
            assert_canonical(b)
            lines.append(f"{a}\t{b}\t{c}")
    data = ("\n".join(lines) + "\n").encode("utf-8")
    path.write_bytes(data)
    return len(data)


def row_bytes(a: str, b: str, c: int) -> int:
    return len(f"{a}\t{b}\t{c}\n".encode("utf-8"))


def main(argv: list[str]) -> int:
    global DEV
    holdout: Path | None = None
    if argv[:1] == ["--holdout"] and len(argv) == 2:
        holdout = Path(argv[1])
        holdout.mkdir(parents=True, exist_ok=True)
        DEV = []
    elif argv:
        print("usage: build_bigrams.py [--holdout DIR]", file=sys.stderr)
        return 2

    counts: Counter = Counter()
    for name, fn in LANES:
        before = sum(counts.values())
        n = fn(counts)
        print(f"{name:<11} {n:>10,} pair tokens  ({len(counts):,} distinct so far)")
        assert sum(counts.values()) - before == n

    totals: dict[str, int] = defaultdict(int)
    for (a, _b), c in counts.items():
        totals[a] += c
    n_tokens = sum(counts.values())
    print(f"all lanes   {n_tokens:>10,} pair tokens, {len(counts):,} distinct pairs, "
          f"{len(totals):,} distinct prev words")

    ordered = sorted(
        ((a, b, c) for (a, b), c in counts.items()), key=lambda r: (-r[2], r[0], r[1])
    )

    full = [r for r in ordered if r[2] >= MIN_PAIR_COUNT]
    if holdout is not None:
        assert DEV is not None
        size = write(holdout / "bigrams.tsv", full, totals, (
            f"DEV BUILD: every {HOLDOUT_EVERY}th literature/news/social document held out.",
        ))
        (holdout / "dev-source.txt").write_text(
            "# Held-out documents, for tools/eval/context.ts --source. Not shipped.\n"
            + "\n\n".join(DEV) + "\n", encoding="utf-8")
        print(f"holdout: {len(DEV):,} documents -> {holdout / 'dev-source.txt'}; "
              f"{len(full):,} pairs, {size:,} B -> {holdout / 'bigrams.tsv'}")
        return 0

    size_full = write(OUT_FULL, full, totals, (
        "Word pairs from the in-repo web corpus (born-digital lanes).",
        f"Pairs seen at least {MIN_PAIR_COUNT} times. Rebuild: python3 tools/build-data/build_bigrams.py",
    ))
    print(f"{OUT_FULL.name:<17} {len(full):>9,} pairs, {size_full:>11,} B")

    vocab = read_vocab()
    budget = WEB_BUDGET - 400  # header lines
    used = 0
    web: list[tuple[str, str, int]] = []
    prevs: set[str] = set()
    for a, b, c in full:
        if a not in vocab or b not in vocab:
            continue
        cost = row_bytes(a, b, c) + (0 if a in prevs else row_bytes(a, "*", totals[a]))
        if used + cost > budget:
            break
        used += cost
        web.append((a, b, c))
        prevs.add(a)
    size_web = write(OUT_WEB, web, totals, (
        "Pruned for the browser: both words in lexicon-web.tsv or unigrams-web.tsv,",
        f"highest counts first, within {WEB_BUDGET:,} bytes. Rebuild: python3 tools/build-data/build_bigrams.py",
    ))
    if size_web > WEB_BUDGET:
        raise SystemExit(f"error: {OUT_WEB.name} is {size_web:,} B, over the {WEB_BUDGET:,} B budget")
    cut = web[-1][2] if web else 0
    print(f"{OUT_WEB.name:<17} {len(web):>9,} pairs, {size_web:>11,} B, "
          f"{len(prevs):,} prev words, lowest count kept {cut}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
