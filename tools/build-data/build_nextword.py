#!/usr/bin/env python3
"""
Build a pruned next-word prediction table (core/data/nextword.tsv) from an Odia
back-off n-gram model (word list, bigrams, trigrams).

What the table is for
---------------------
After the user commits a word, the web app shows up to K likely next words. The
source model is large (266k bigrams, 176k trigrams); the web app has to download
the table, so this script keeps only what changes what the user would see.

Output format
-------------
    context <TAB> next <TAB> score

  context  one word (bigram row) or two words joined by one space (trigram row)
  next     the predicted next word
  score    log10 P(next | context), rounded to 2 decimals

Rows are grouped by context and sorted by score, best first. Every Odia cell is
canonical (NFC, then U+0B5C -> U+0B21 U+0B3C and U+0B5D -> U+0B22 U+0B3C), the
same as canonical() in core/src/normalize.ts.

How the app should read it (stupid back-off, weight 0.4 as in the source model):
for a two-word context "a b", take the trigram rows of "a b" with their own
score, then add the bigram rows of "b" that are not already listed, each with
score + log10(0.4) (= -0.40); sort. With no trigram rows, use the bigram rows of
"b" alone. A trigram context is written only when it changes the top-K list
(--redundancy-k) that the bigram rows of "b" alone would give, and only the
--max-trigram-contexts such contexts with the largest expected gain are kept.

Pruning knobs
-------------
  --min-unigram-count C   a word gets bigram rows only if it occurs >= C times
  --top-bigram N          at most N next words per one-word context
  --min-prob P            drop rows with log10 probability below P
  --top-trigram M         at most M trigram rows per two-word context
  --min-trigram-ctx-count T
                          a two-word context "a b" is kept only if its estimated
                          count, count(a) * P(b | a), is >= T
  --max-trigram-contexts X
                          keep only the X two-word contexts whose rows buy the
                          most expected top-K hits over the bigram rows
                          (estimated count x probability mass moved into top-K)
  --redundancy-k K        top-K used for the redundancy test (the UI shows K)
  --drop-repeats          drop rows where next == the context's last word. Kept
                          by default: Odia reduplicates a lot (ଧୀରେ ଧୀରେ,
                          ଅନେକ ଅନେକ, କୋଟି କୋଟି), so these are mostly real.
                          A repeated single code point (ଅ ଅ) is always dropped.

Junk filter (applied to every word, after canonicalisation): only Odia block
code points (U+0B00-U+0B7F) and ZWJ/ZWNJ; at least one base letter
(U+0B05-U+0B39, U+0B5F, U+0B71); no Odia digit (U+0B66-U+0B6F).

Optional checks on the written file (they read the TSV back, not memory):
  --phrases core/data/phrases.tsv   top-1/top-3 on adjacent words of the phrases
  --labels  core/data/labels.tsv    rows whose next word is an owner-labelled word

Run with:  python3 -I tools/build-data/build_nextword.py --help
"""
from __future__ import annotations

import argparse
import collections
import gzip
import io
import math
import os
import sys
import unicodedata
from pathlib import Path

BACKOFF = math.log10(0.4)


# --------------------------------------------------------------------------
# canonical form and junk filter
# --------------------------------------------------------------------------

def canonical(s: str) -> str:
    """Mirror of core/src/normalize.ts canonical()."""
    s = unicodedata.normalize("NFC", s)
    return s.replace("ଡ଼", "ଡ଼").replace("ଢ଼", "ଢ଼")


# One-letter "words" in chat are mostly fragments of split words (a genitive
# suffix typed apart, a word cut after its first letter). These four are real
# words: ta (emphatic), o (and), e (this), na (not). Others are dropped.
SINGLE_LETTER_WORDS = {"\u0b24", "\u0b13", "\u0b0f", "\u0b28"}

NUKTA = "\u0b3c"
UNIGRAMS = Path(__file__).resolve().parents[2] / "core" / "data" / "unigrams.tsv"
_unigrams: dict[str, float] | None = None


def restore_nukta(w: str) -> str:
    """Chat drops the nukta: a bare non-initial DDA/DDHA gets it back when the
    nukta form is the more frequent word in core/data/unigrams.tsv (as in
    build_typed.py)."""
    global _unigrams
    if _unigrams is None:
        _unigrams = {}
        for line in UNIGRAMS.read_text(encoding="utf-8").splitlines():
            if line and not line.startswith("#"):
                word, value = line.split("\t")[:2]
                _unigrams[canonical(word)] = float(value)
    out = []
    for i, ch in enumerate(w):
        out.append(ch)
        if ch in "\u0b21\u0b22" and i > 0 and (i + 1 >= len(w) or w[i + 1] != NUKTA):
            out.append(NUKTA)
    fixed = "".join(out)
    return fixed if fixed != w and _unigrams.get(fixed, 0) > _unigrams.get(w, 0) else w


def is_word(w: str) -> bool:
    if not w:
        return False
    base = False
    for ch in w:
        cp = ord(ch)
        if cp in (0x200C, 0x200D):
            continue
        if not 0x0B00 <= cp <= 0x0B7F:
            return False
        if 0x0B66 <= cp <= 0x0B6F:
            return False
        if 0x0B05 <= cp <= 0x0B39 or cp in (0x0B5F, 0x0B71):
            base = True
    return base


# --------------------------------------------------------------------------
# input
# --------------------------------------------------------------------------

def read_tsv(path: str):
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        for line in f:
            yield dict(zip(header, line.rstrip("\n").split("\t")))


class Stats(collections.Counter):
    pass


def load_counts(path: str, stats: Stats) -> dict[str, int]:
    counts: dict[str, int] = collections.Counter()
    for r in read_tsv(path):
        raw = r["odia_word"]
        w = canonical(raw)
        if w != raw:
            stats["words: changed by canonical()"] += 1
        if "ଡ଼" in raw or "ଢ଼" in raw:
            stats["words: precomposed nukta"] += 1
        counts[w] += int(r["unigram_count"])
    return counts


def add_best(table: dict, ctx, nxt: str, p: float) -> bool:
    """Keep the best probability per (ctx, next). Returns True on a duplicate."""
    d = table.setdefault(ctx, {})
    if nxt in d:
        if p > d[nxt]:
            d[nxt] = p
        return True
    d[nxt] = p
    return False


def load_ngrams(path: str, cols: list[str], stats: Stats, tag: str, drop_repeats: bool):
    table: dict = {}
    for r in read_tsv(path):
        stats[f"{tag}: input rows"] += 1
        raw = [r[c] for c in cols]
        if any("ଡ଼" in x or "ଢ଼" in x for x in raw):
            stats[f"{tag}: rows with precomposed nukta (fixed)"] += 1
        ws = [canonical(x) for x in raw]
        if not all(is_word(w) for w in ws):
            stats[f"{tag}: dropped, junk word"] += 1
            continue
        if any(len(w) == 1 and w not in SINGLE_LETTER_WORDS for w in ws):
            stats[f"{tag}: dropped, one-letter fragment"] += 1
            continue
        fixed = [restore_nukta(w) for w in ws]
        if fixed != ws:
            stats[f"{tag}: nukta restored"] += 1
            ws = fixed
        if ws[-1] == ws[-2] and (drop_repeats or len(ws[-1]) == 1):
            stats[f"{tag}: dropped, next == last context word"
                  + ("" if drop_repeats else " (single code point)")] += 1
            continue
        ctx = ws[0] if len(ws) == 2 else (ws[0], ws[1])
        if add_best(table, ctx, ws[-1], float(r["log10_p"])):
            stats[f"{tag}: merged duplicates after canonical()"] += 1
    return table


# --------------------------------------------------------------------------
# pruning
# --------------------------------------------------------------------------

def ranked(d: dict[str, float]) -> list[tuple[str, float]]:
    return sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))


def merged(tri: dict[str, float], bi: list[tuple[str, float]]) -> list[tuple[str, float]]:
    """Stupid back-off list for a two-word context."""
    out = dict(tri)
    for w, p in bi:
        if w not in out:
            out[w] = p + BACKOFF
    return ranked(out)


def prune(args, counts, bigrams, trigrams, stats):
    # bigrams ---------------------------------------------------------------
    bi_out: dict[str, list[tuple[str, float]]] = {}
    for ctx, d in bigrams.items():
        if counts.get(ctx, 0) < args.min_unigram_count:
            continue
        rows = [(w, p) for w, p in ranked(d) if p >= args.min_prob][: args.top_bigram]
        if rows:
            bi_out[ctx] = rows

    # trigrams --------------------------------------------------------------
    K = args.redundancy_k
    tri_out: dict[tuple[str, str], list[tuple[str, float]]] = {}
    tri_gain: dict[tuple[str, str], float] = {}
    for (a, b), d in trigrams.items():
        p_ab = bigrams.get(a, {}).get(b)
        est = counts.get(a, 0) * (10 ** p_ab if p_ab is not None else 0.0)
        if est < args.min_trigram_ctx_count:
            stats["trigram contexts: dropped, estimated count"] += 1
            continue
        cand = {w: p for w, p in d.items() if p >= args.min_prob}
        if not cand:
            continue
        bi = bi_out.get(b, [])
        full = merged(cand, bi)
        want = [w for w, _ in full[:K]]
        if want == [w for w, _ in bi[:K]]:
            stats["trigram contexts: dropped, same top-K as bigram"] += 1
            continue
        # keep the trigram rows that rank in the merged top-M ...
        top_m = {w for w, _ in full[: max(args.top_trigram, K)]}
        keep = {w: p for w, p in cand.items() if w in top_m}
        # ... and any trigram row whose absence would let its own (higher)
        # back-off score push into the top-K, until the top-K is unchanged.
        for _ in range(10):
            now = [w for w, _ in merged(keep, bi)[:K]]
            if now == want:
                break
            for w in now:
                if w not in want and w in cand:
                    keep[w] = cand[w]
        else:
            stats["trigram contexts: top-K not reproduced (kept anyway)"] += 1
        # expected extra top-K hits (in tokens) this context buys over the
        # bigram rows, with the back-off scores standing in for the truth
        truth = {w: 10 ** p for w, p in merged(cand, ranked(bigrams.get(b, {})))}
        gain = est * (sum(truth.get(w, 0.0) for w in want)
                      - sum(truth.get(w, 0.0) for w, _ in bi[:K]))
        tri_out[(a, b)] = ranked(keep)
        tri_gain[(a, b)] = gain
    if args.max_trigram_contexts is not None and len(tri_out) > args.max_trigram_contexts:
        best = sorted(tri_out, key=lambda c: (-tri_gain[c], c))[: args.max_trigram_contexts]
        stats["trigram contexts: dropped, below --max-trigram-contexts by gain"] += len(tri_out) - len(best)
        tri_out = {c: tri_out[c] for c in best}
    total = sum(counts.values())
    print(f"  trigram expected extra top-{K} hits (model estimate): "
          f"{sum(tri_gain[c] for c in tri_out) / total:.2%} of tokens"
          f" (all candidate contexts: {sum(tri_gain.values()) / total:.2%})")
    return bi_out, tri_out


# --------------------------------------------------------------------------
# output
# --------------------------------------------------------------------------

def fmt(p: float) -> str:
    s = f"{p:.2f}"
    return "0.00" if s == "-0.00" else s


def write(path: str, args, bi_out, tri_out) -> str:
    # repository paths stay relative to the repository; input files outside it
    # (the source model) are named by file name only
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    cmd_args = []
    for a in sys.argv[1:]:
        if os.path.sep in a and os.path.exists(a):
            full = os.path.abspath(a)
            a = os.path.relpath(full, repo) if full.startswith(repo + os.sep) else os.path.basename(a)
        cmd_args.append(a)
    cmd = "python3 -I tools/build-data/build_nextword.py " + " ".join(cmd_args)
    header = [
        "# nextword.tsv -- next-word predictions, pruned from an Odia n-gram model.",
        "#",
        "# Format: context <TAB> next <TAB> score",
        "#   context  one word (bigram row) or two words joined by one space (trigram row)",
        "#   next     predicted next word (canonical: nukta decomposed, U+0B21 U+0B3C)",
        "#   score    log10 P(next | context), 2 decimals; rows grouped by context, best first",
        "#",
        "# Reading it: for context \"a b\", take the rows of \"a b\", then add the rows of \"b\"",
        "# not already listed at score - 0.40 (stupid back-off, weight 0.4); sort. With no",
        "# \"a b\" rows, use the rows of \"b\". A two-word context is written only when it",
        f"# changes the top {args.redundancy_k} that the rows of \"b\" alone give, and only the",
        f"# {args.max_trigram_contexts} such contexts with the largest expected gain are kept.",
        "#",
        "# Source: the Desh Odia keyboard's n-gram model (chat text, 30.08M tokens), used",
        "# with the company's agreement (owner, 2026-10-12; written terms pending,",
        "# plan/06-owner-followups.md L-1). Not MIT: do not publish without those terms.",
        f"# Built by: {cmd}",
    ]
    lines = header[:]
    for ctx in sorted(bi_out):
        for w, p in bi_out[ctx]:
            lines.append(f"{ctx}\t{w}\t{fmt(p)}")
    for (a, b) in sorted(tri_out):
        for w, p in tri_out[(a, b)]:
            lines.append(f"{a} {b}\t{w}\t{fmt(p)}")
    text = "\n".join(lines) + "\n"
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return text


# --------------------------------------------------------------------------
# checks on the written file
# --------------------------------------------------------------------------

def read_table(path: str):
    bi: dict[str, list[tuple[str, float]]] = collections.defaultdict(list)
    tri: dict[tuple[str, str], dict[str, float]] = collections.defaultdict(dict)
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            ctx, w, s = line.rstrip("\n").split("\t")
            assert canonical(ctx) == ctx and canonical(w) == w, line
            if " " in ctx:
                a, b = ctx.split(" ")
                tri[(a, b)][w] = float(s)
            else:
                bi[ctx].append((w, float(s)))
    return bi, tri


def predict(bi, tri, prev2, prev1):
    lst = bi.get(prev1, [])
    if prev2 is not None and (prev2, prev1) in tri:
        return merged(tri[(prev2, prev1)], lst)
    return lst


def predict_mode(bi, tri, prev2, prev1, mode):
    """mode: backoff (stupid back-off merge), first (trigram rows, then bigram
    rows), bigram (ignore trigram rows)."""
    lst = bi.get(prev1, [])
    if mode == "bigram" or prev2 is None or (prev2, prev1) not in tri:
        return lst
    t = tri[(prev2, prev1)]
    if mode == "backoff":
        return merged(t, lst)
    head = ranked(t)
    seen = {w for w, _ in head}
    return head + [(w, p) for w, p in lst if w not in seen]


def eval_text(path_text: str, bi, tri, max_pairs: int) -> dict:
    """Held-out next-word check on running text: adjacent Odia words separated
    only by spaces or tabs; any other character breaks the chain."""
    import re
    chain_re = re.compile(r"[\u0B00-\u0B7F\u200C\u200D]+(?:[ \t]+[\u0B00-\u0B7F\u200C\u200D]+)*")
    res = collections.Counter()
    with open(path_text, encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith("#"):
                continue
            for m in chain_re.finditer(line):
                ws = [canonical(w) for w in m.group(0).split()]
                if not all(is_word(w) for w in ws):
                    continue
                for i in range(len(ws) - 1):
                    prev2 = ws[i - 1] if i >= 1 else None
                    truth = ws[i + 1]
                    res["pairs"] += 1
                    res["ctx_found"] += ws[i] in bi
                    res["tri_found"] += prev2 is not None and (prev2, ws[i]) in tri
                    for mode in ("backoff", "first", "bigram"):
                        got = [w for w, _ in predict_mode(bi, tri, prev2, ws[i], mode)[:3]]
                        res[f"{mode}_top1"] += truth in got[:1]
                        res[f"{mode}_top3"] += truth in got
                    if res["pairs"] >= max_pairs:
                        return res
    return res


def eval_phrases(path_phrases: str, bi, tri) -> dict:
    res = collections.Counter()
    misses = []
    with open(path_phrases, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            cols = line.rstrip("\n").split("\t")
            ws = [canonical(w) for w in cols[1].split(" ") if w]
            for i in range(len(ws) - 1):
                prev2 = ws[i - 1] if i >= 1 else None
                got = [w for w, _ in predict(bi, tri, prev2, ws[i])]
                got_bi = [w for w, _ in bi.get(ws[i], [])]
                truth = ws[i + 1]
                res["pairs"] += 1
                res["top1"] += truth in got[:1]
                res["top3"] += truth in got[:3]
                res["bi_top1"] += truth in got_bi[:1]
                res["bi_top3"] += truth in got_bi[:3]
                if prev2 is not None:
                    res["triples"] += 1
                    res["tri_ctx_found"] += (prev2, ws[i]) in tri
                    res["triple_top3"] += truth in got[:3]
                if truth not in got[:3]:
                    misses.append(f"{' '.join(ws[max(0, i - 1): i + 1])} -> {truth} (got {' '.join(got[:3]) or '-'})")
    res["misses"] = misses
    return res


def check_labels(path_labels: str, bi, tri) -> list[tuple[str, str, int, int]]:
    labels = {}
    with open(path_labels, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            cols = line.rstrip("\n").split("\t")
            labels[canonical(cols[0])] = cols[1]
    as_next = collections.Counter()
    in_top3 = collections.Counter()
    as_ctx = collections.Counter()
    for ctx, rows in bi.items():
        if ctx in labels:
            as_ctx[ctx] += len(rows)
        for i, (w, _) in enumerate(rows):
            if w in labels:
                as_next[w] += 1
                in_top3[w] += i < 3
    for (a, b), d in tri.items():
        for w in (a, b):
            if w in labels:
                as_ctx[w] += len(d)
        for i, (w, _) in enumerate(ranked(d)):
            if w in labels:
                as_next[w] += 1
                in_top3[w] += i < 3
    out = []
    for w in sorted(set(as_next) | set(as_ctx), key=lambda w: (labels[w], -as_next[w])):
        out.append((w, labels[w], as_next[w], in_top3[w], as_ctx[w]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--words", required=True, help="odia_words.tsv: word_id odia_word unigram_count unigram_prob")
    ap.add_argument("--bigrams", required=True, help="bigrams.tsv(.gz): w1_id w2_id w1 w2 q log10_p ...")
    ap.add_argument("--trigrams", required=True, help="trigrams.tsv(.gz): w1_id w2_id w3_id w1 w2 w3 q log10_p ...")
    ap.add_argument("--out", default="core/data/nextword.tsv")
    ap.add_argument("--top-bigram", type=int, default=4)
    ap.add_argument("--top-trigram", type=int, default=3)
    ap.add_argument("--min-unigram-count", type=int, default=0)
    ap.add_argument("--min-trigram-ctx-count", type=float, default=0)
    ap.add_argument("--max-trigram-contexts", type=int, default=3000,
                    help="keep only the N two-word contexts with the largest expected gain")
    ap.add_argument("--min-prob", type=float, default=-3.0)
    ap.add_argument("--redundancy-k", type=int, default=3)
    ap.add_argument("--drop-repeats", action="store_true")
    ap.add_argument("--phrases", help="phrases.tsv to evaluate against (optional)")
    ap.add_argument("--labels", help="labels.tsv to check predictions against (optional)")
    ap.add_argument("--text", help="running Odia text for a held-out next-word check (optional)")
    ap.add_argument("--text-max-pairs", type=int, default=100000)
    args = ap.parse_args()

    stats = Stats()
    counts = load_counts(args.words, stats)
    bigrams = load_ngrams(args.bigrams, ["w1", "w2"], stats, "bigrams", args.drop_repeats)
    trigrams = load_ngrams(args.trigrams, ["w1", "w2", "w3"], stats, "trigrams", args.drop_repeats)
    bi_out, tri_out = prune(args, counts, bigrams, trigrams, stats)
    text = write(args.out, args, bi_out, tri_out)

    raw = len(text.encode("utf-8"))
    gz = len(gzip.compress(text.encode("utf-8"), compresslevel=9, mtime=0))
    for k in sorted(stats):
        print(f"  {k}: {stats[k]:,}")
    bi_rows = sum(len(v) for v in bi_out.values())
    tri_rows = sum(len(v) for v in tri_out.values())
    print(f"wrote {args.out}")
    print(f"  bigram contexts {len(bi_out):,}, rows {bi_rows:,}")
    print(f"  trigram contexts {len(tri_out):,}, rows {tri_rows:,}")
    print(f"  total rows {bi_rows + tri_rows:,}; raw {raw:,} bytes; gzip -9 {gz:,} bytes")

    # checks read the written file back
    bi, tri = read_table(args.out)
    total = sum(counts.values())
    covered = sum(counts.get(w, 0) for w in bi)
    exp3 = sum(counts.get(w, 0) * sum(10 ** p for _, p in rows[:3]) for w, rows in bi.items())
    print(f"  context coverage: {covered / total:.1%} of {total:,} tokens have a bigram row")
    print(f"  model-expected top-3 hit (bigram only): {exp3 / total:.1%}")
    if args.phrases:
        r = eval_phrases(args.phrases, bi, tri)
        print(f"  phrases: top-3 {r['top3']}/{r['pairs']}, top-1 {r['top1']}/{r['pairs']}"
              f"  (bigram only: top-3 {r['bi_top3']}, top-1 {r['bi_top1']});"
              f" triples {r['triples']}, trigram context found {r['tri_ctx_found']},"
              f" triple top-3 {r['triple_top3']}")
        for m in r["misses"]:
            print(f"    miss: {m}")
    if args.text:
        r = eval_text(args.text, bi, tri, args.text_max_pairs)
        n = r["pairs"] or 1
        print(f"  text: {r['pairs']:,} pairs; context has a row {r['ctx_found'] / n:.1%};"
              f" two-word context has rows {r['tri_found'] / n:.1%}")
        for mode in ("backoff", "first", "bigram"):
            print(f"    {mode:8} top-1 {r[mode + '_top1'] / n:.2%}  top-3 {r[mode + '_top3'] / n:.2%}")
    if args.labels:
        rows = check_labels(args.labels, bi, tri)
        n = sum(r[2] for r in rows)
        print(f"  labelled words as next: {n} rows ({sum(r[3] for r in rows)} in a top-3)")
        for w, lab, nx, t3, cx in rows:
            print(f"    {lab:9} {w}  as next: {nx} rows ({t3} top-3); as context: {cx} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
