#!/usr/bin/env python3
"""How much of this harvest is new relative to what the engine already ships?

Compares lit-freq.tsv against core/data/unigrams.tsv (Aksharantar/IndicCorp
derived). Everything is NFC-normalised on both sides first, because a lexicon
keyed on precomposed nukta forms would otherwise appear to miss words it
actually has.
"""
import os
import sys
import unicodedata
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
UNI = os.path.join(ROOT, "core", "data", "unigrams.tsv")


def nfc(s):
    return unicodedata.normalize("NFC", s)


def load_freq(path):
    c = Counter()
    with open(path, encoding="utf-8") as f:
        next(f)
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) == 2:
                c[nfc(parts[0])] += int(parts[1])
    return c


def load_unigrams(path):
    s = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if parts and parts[0]:
                s.add(nfc(parts[0]))
    return s


def main():
    mine = load_freq(os.path.join(HERE, "lit-freq.tsv"))
    if not os.path.exists(UNI):
        print("no unigrams.tsv at %s" % UNI)
        return
    have = load_unigrams(UNI)
    print("harvest types: %d   tokens: %d" % (len(mine), sum(mine.values())))
    print("shipped unigrams: %d" % len(have))
    print()
    for topn in (100, 500, 1000, 5000, 20000):
        top = [w for w, _ in mine.most_common(topn)]
        miss = [w for w in top if w not in have]
        print("top %6d harvest words: %5d absent from shipped unigrams (%.1f%%)"
              % (topn, len(miss), 100.0 * len(miss) / len(top)))
    print()
    allmiss = [(w, c) for w, c in mine.most_common() if w not in have]
    tok_miss = sum(c for _, c in allmiss)
    print("overall: %d/%d types absent (%.1f%%), %d/%d tokens (%.1f%%)"
          % (len(allmiss), len(mine), 100.0 * len(allmiss) / len(mine),
             tok_miss, sum(mine.values()), 100.0 * tok_miss / sum(mine.values())))
    print()
    print("Most frequent harvested words the engine does NOT have:")
    for w, c in allmiss[:40]:
        print("  %-24s %d" % (w, c))

    # short-word coverage, the specific gap named in the brief
    print()
    short = [(w, c) for w, c in mine.most_common() if len(w) <= 4]
    smiss = [(w, c) for w, c in short if w not in have]
    print("harvest words <=4 chars: %d types (%.1f%% of harvest types); %d absent from shipped"
          % (len(short), 100.0 * len(short) / len(mine), len(smiss)))
    tot_short_tok = sum(c for _, c in short)
    print("  they are %d tokens = %.1f%% of all harvested tokens"
          % (tot_short_tok, 100.0 * tot_short_tok / sum(mine.values())))


if __name__ == "__main__":
    main()
