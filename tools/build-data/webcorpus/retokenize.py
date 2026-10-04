#!/usr/bin/env python3
"""Rebuild the frequency TSVs from the stored raw text.

Separate from the harvesters so a tokenizer change never means re-fetching.
Also prints what the apostrophe fix (କ’ଣ, ତା’) actually changed.
"""
import json
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import harvest_lit as H


# Wikisource is 19th/early-20th-century printed books: valuable, but a
# different register from what someone types into a chat box. Kept in the
# combined list, split out so the everyday signal can be weighted separately.
CLASSICAL = ("wikisource",)


def is_classical(source):
    return any(source.startswith(p) for p in CLASSICAL)


def count(path, keep=None):
    c = Counter()
    docs = 0
    per_source = Counter()
    with open(path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            if keep and not keep(d["source"]):
                continue
            docs += 1
            n = 0
            for w in H.WORD_RE.findall(d["text"]):
                w = H.norm_word(w)
                if not w or all("୦" <= ch <= "୯" for ch in w):
                    continue
                c[w] += 1
                n += 1
            per_source[d["source"]] += n
    return docs, c, per_source


def write(c, path):
    with open(path, "w", encoding="utf-8") as f:
        f.write("word\tcount\n")
        for w, n in c.most_common():
            f.write("%s\t%d\n" % (w, n))


def main():
    jobs = [("raw-lit.jsonl", "lit-freq.tsv", None),
            ("raw-lit.jsonl", "lit-freq-everyday.tsv", lambda s: not is_classical(s)),
            ("raw-lit.jsonl", "lit-freq-classical.tsv", is_classical),
            ("raw-archive-books.jsonl", "archive-books-freq.tsv", None)]
    per_source_shown = False
    for src, dst, keep in jobs:
        p = os.path.join(HERE, src)
        if not os.path.exists(p):
            print("skip %s (absent)" % src)
            continue
        docs, c, per = count(p, keep)
        write(c, os.path.join(HERE, dst))
        print("%s: %d docs -> %d tokens, %d types  =>  %s"
              % (src, docs, sum(c.values()), len(c), dst))
        apos = [(w, n) for w, n in c.most_common() if "’" in w]
        if apos:
            print("   apostrophe-internal words kept: %d types, %d tokens; top: %s"
                  % (len(apos), sum(n for _, n in apos),
                     ", ".join("%s(%d)" % (w, n) for w, n in apos[:8])))
        if keep is None and src == "raw-lit.jsonl" and not per_source_shown:
            per_source_shown = True
            print("   tokens by source:")
            for s, n in per.most_common():
                print("     %-28s %8d" % (s, n))


if __name__ == "__main__":
    main()
