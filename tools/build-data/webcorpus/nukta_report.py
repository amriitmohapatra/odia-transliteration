#!/usr/bin/env python3
"""
What does real Odia writing actually do with the nukta?

Aksharantar drops it ~63% of the time. This measures the same thing on
naturally-written literary/blog Odia.

Two measurements, kept separate:

 A. PRE-NFC: do sources emit the precomposed U+0B5C / U+0B5D at all?
    Measured on raw bytes as fetched, before any normalisation.
 B. POST-NFC: for every word containing a decomposed nukta sequence
    (U+0B21 U+0B3C or U+0B22 U+0B3C), does the nukta-stripped spelling of
    that same word also occur? That ratio is the drop rate.
"""
import json
import os
import re
import sys
import unicodedata
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import harvest_lit as H

DDA = "ଡ"      # ଡ
DDHA = "ଢ"     # ଢ
NUKTA = "଼"    # ◌଼
PRE_RRA = "ଡ଼"  # precomposed ଡ଼  -- decomposes under NFC
PRE_RHA = "ଢ଼"  # precomposed ଢ଼  -- decomposes under NFC
YYA = "ୟ"      # ୟ  atomic, unrelated

NUKTA_SEQ = re.compile("[" + DDA + DDHA + "]" + NUKTA)


def strip_nukta(w):
    return w.replace(DDA + NUKTA, DDA).replace(DDHA + NUKTA, DDHA)


def load_docs():
    docs = []
    with open(os.path.join(HERE, "raw-lit.jsonl"), encoding="utf-8") as f:
        for line in f:
            docs.append(json.loads(line))
    return docs


def load_freq():
    d = Counter()
    with open(os.path.join(HERE, "lit-freq.tsv"), encoding="utf-8") as f:
        next(f)
        for line in f:
            w, c = line.rstrip("\n").split("\t")
            d[w] = int(c)
    return d


# ---------------- A. pre-NFC precomposed check ----------------

def precomposed_probe(docs, sample=45):
    """Re-fetch a spread of source URLs and count precomposed code points in
    the response BEFORE normalisation."""
    by_src = {}
    for d in docs:
        by_src.setdefault(d["source"], []).append(d["url"])
    urls = []
    for src, us in by_src.items():
        urls += us[: max(1, sample // max(1, len(by_src)))]
    urls = urls[:sample]

    tot = Counter()
    hits = []
    checked = 0
    for u in urls:
        body = H.fetch(u, timeout=30, retries=0)
        if not body:
            continue
        checked += 1
        n_rra = body.count(PRE_RRA)
        n_rha = body.count(PRE_RHA)
        n_dec = len(NUKTA_SEQ.findall(body))
        n_yya = body.count(YYA)
        tot["pre_rra"] += n_rra
        tot["pre_rha"] += n_rha
        tot["decomposed"] += n_dec
        tot["yya"] += n_yya
        if n_rra or n_rha:
            hits.append((u, n_rra, n_rha, n_dec))
    return checked, tot, hits


# ---------------- B. post-NFC drop rate ----------------

def initial_nukta(w):
    """True if the word STARTS with a nukta consonant.

    Odia phonotactics do not allow ଡ଼/ଢ଼ word-initially -- they are flap
    allophones that only occur medially/finally. So a word-initial nukta
    is not a spelling variant, it is the reverse error, and a pair like
    ଡ଼ାକ(13) / ଡାକ(346) must not be counted as the nukta being 'dropped'
    96% of the time: ଡାକ is simply correct."""
    return len(w) >= 2 and w[0] in (DDA, DDHA) and w[1] == NUKTA


def drop_rate(freq):
    """Minimal pairs: W (with nukta) vs strip_nukta(W)."""
    pairs = []
    nukta_words = {w: c for w, c in freq.items() if NUKTA_SEQ.search(w)}
    for w, c in nukta_words.items():
        bare = strip_nukta(w)
        if bare == w:
            continue
        bc = freq.get(bare, 0)
        pairs.append((w, c, bare, bc))
    pairs.sort(key=lambda t: -(t[1] + t[3]))
    return pairs, nukta_words


def main():
    docs = load_docs()
    freq = load_freq()
    tokens = sum(freq.values())
    out = []
    P = out.append

    P("# Nukta behaviour in naturally-written Odia (literature-blogs lane)")
    P("")
    P("corpus: %d documents, %d word tokens, %d distinct words" % (len(docs), tokens, len(freq)))
    P("")

    # --- character level, post-NFC ---
    alltext = "\n".join(d["text"] for d in docs)
    n_dec = len(NUKTA_SEQ.findall(alltext))
    n_dda_nukta = alltext.count(DDA + NUKTA)
    n_ddha_nukta = alltext.count(DDHA + NUKTA)
    n_bare_nukta = alltext.count(NUKTA)
    n_pre = alltext.count(PRE_RRA) + alltext.count(PRE_RHA)
    P("## A. Character counts (after NFC, as stored)")
    P("")
    P("| sequence | code points | count |")
    P("|---|---|---|")
    P("| ଡ଼ decomposed | U+0B21 U+0B3C | %d |" % n_dda_nukta)
    P("| ଢ଼ decomposed | U+0B22 U+0B3C | %d |" % n_ddha_nukta)
    P("| any U+0B3C    | U+0B3C        | %d |" % n_bare_nukta)
    P("| precomposed   | U+0B5C/U+0B5D | %d |" % n_pre)
    P("| ୟ (unrelated) | U+0B5F        | %d |" % alltext.count(YYA))
    P("")
    P("U+0B3C not part of a ଡ/ଢ nukta sequence: %d" % (n_bare_nukta - n_dec))
    P("")

    # --- pre-NFC probe ---
    print("probing raw (pre-NFC) responses ...", file=sys.stderr)
    checked, tot, hits = precomposed_probe(docs)
    P("## B. Pre-NFC probe: do sources emit precomposed U+0B5C/U+0B5D?")
    P("")
    P("re-fetched %d source URLs, counted code points in the raw response" % checked)
    P("")
    P("| code point | count in raw bytes |")
    P("|---|---|")
    P("| U+0B5C precomposed ଡ଼ | %d |" % tot["pre_rra"])
    P("| U+0B5D precomposed ଢ଼ | %d |" % tot["pre_rha"])
    P("| U+0B21/U+0B22 + U+0B3C decomposed | %d |" % tot["decomposed"])
    P("| U+0B5F ୟ | %d |" % tot["yya"])
    P("")
    if hits:
        P("pages emitting precomposed forms:")
        for u, a, b, c in hits[:20]:
            P("  %s  U+0B5C=%d U+0B5D=%d decomposed=%d" % (u, a, b, c))
    else:
        P("No source emitted a precomposed form. Everything on the wire was")
        P("already decomposed base + U+0B3C.")
    P("")

    # --- drop rate ---
    pairs, nukta_words = drop_rate(freq)
    with_nukta_tokens = sum(nukta_words.values())
    contested_all = [p for p in pairs if p[3] > 0]
    contested = [p for p in contested_all if not initial_nukta(p[0])]
    wordinit = [p for p in contested_all if initial_nukta(p[0])]
    tok_nukta = sum(p[1] for p in contested)
    tok_bare = sum(p[3] for p in contested)
    P("## C. Nukta-drop rate (post-NFC minimal pairs)")
    P("")
    P("distinct words containing a nukta: %d  (%d tokens, %.2f%% of corpus)"
      % (len(nukta_words), with_nukta_tokens, 100.0 * with_nukta_tokens / tokens))
    P("of those, words whose nukta-stripped spelling ALSO occurs: %d" % len(contested_all))
    P("")
    P("Word-initial pairs are excluded from the rate below. Odia has no")
    P("word-initial ଡ଼/ଢ଼, so in those %d pairs the *bare* spelling is the correct"
      % len(wordinit))
    P("one and counting them as 'dropped' inverts the measurement. Examples:")
    for w, c, bare, bc in sorted(wordinit, key=lambda t: -(t[1] + t[3]))[:6]:
        P("  %s(%d) vs %s(%d)  <- %s is correct" % (w, c, bare, bc, bare))
    P("")
    if tok_nukta + tok_bare:
        P("Over word-medial contested pairs (%d pairs):" % len(contested))
        P("  nukta written : %d tokens (%.1f%%)" % (tok_nukta, 100.0 * tok_nukta / (tok_nukta + tok_bare)))
        P("  nukta dropped : %d tokens (%.1f%%)" % (tok_bare, 100.0 * tok_bare / (tok_nukta + tok_bare)))
    P("")
    P("Top contested pairs (word-medial only):")
    P("")
    P("| nukta spelling | n | bare spelling | n | drop % |")
    P("|---|---|---|---|---|")
    for w, c, bare, bc in contested[:45]:
        P("| %s | %d | %s | %d | %.1f |" % (w, c, bare, bc, 100.0 * bc / (c + bc)))
    P("")

    # register split: contemporary web vs classical printed books
    P("### Drop rate by register")
    P("")
    P("| register | nukta tokens | bare tokens | drop % |")
    P("|---|---|---|---|")
    cmap = {w: bare for w, c, bare, bc in contested}
    bset = set(cmap.values())
    reg = {"contemporary (blogs, magazines)": [0, 0], "classical (Wikisource books)": [0, 0]}
    for d in docs:
        k = ("classical (Wikisource books)" if d["source"].startswith("wikisource")
             else "contemporary (blogs, magazines)")
        for w in H.WORD_RE.findall(d["text"]):
            w = H.norm_word(w)
            if w in cmap:
                reg[k][0] += 1
            elif w in bset:
                reg[k][1] += 1
    for k, (a, b) in reg.items():
        if a + b:
            P("| %s | %d | %d | %.1f |" % (k, a, b, 100.0 * b / (a + b)))
    P("")

    # per-source drop rate
    P("## D. Drop rate by source")
    P("")
    P("| source | docs | tokens w/ nukta | tokens bare-variant | drop % |")
    P("|---|---|---|---|---|")
    contested_map = cmap
    bare_set = bset
    per = {}
    for d in docs:
        s = d["source"]
        e = per.setdefault(s, [0, 0, 0])
        e[0] += 1
        for w in H.WORD_RE.findall(d["text"]):
            w = H.norm_word(w)
            if w in contested_map:
                e[1] += 1
            elif w in bare_set:
                e[2] += 1
    for s, (nd, a, b) in sorted(per.items(), key=lambda kv: -(kv[1][1] + kv[1][2])):
        if a + b == 0:
            continue
        P("| %s | %d | %d | %d | %.1f |" % (s, nd, a, b, 100.0 * b / (a + b)))
    P("")

    path = os.path.join(HERE, "NUKTA-FINDINGS.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print("\n".join(out))
    print("\nwrote " + path, file=sys.stderr)


if __name__ == "__main__":
    main()
