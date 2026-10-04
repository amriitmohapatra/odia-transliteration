#!/usr/bin/env python3
"""Nukta audit for the gov-and-orgs lane.

Two contaminants have to be removed before the drop rate means anything.

 1. CORRUPT NUKTA. U+0B3C is orthographically valid in Odia only on U+0B21 (ଡ)
    and U+0B22 (ଢ). Government pages also carry ଯ଼ ଚ଼ ଜ଼ ର଼ and even nukta on
    vowel signs (ା଼ ୋ଼ ୁ଼) — legacy ISCII/AkrutiOriya→Unicode conversion debris.
    These are stripped first.

 2. DIRECTION. A minimal pair ଡ଼~ଡ can arise two ways:
       (a) a native ଡ଼ word written bare        ->  a real nukta DROP
       (b) a loanword with genuine ଡ given a spurious nukta (ଡ଼ିସେମ୍ବର)
    Odia forbids ଡ଼/ଢ଼ word-initially, which gives a frequency-independent test
    for class (b). Pairs are split by majority direction, matching the method
    used in the wikipedia lane so the two are comparable.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
DDA, DDHA, NUKTA = "ଡ", "ଢ", "଼"
ANY_NUKTA = re.compile(f"(.?)({NUKTA})")


def strip_nukta(w):
    return w.replace(DDA + NUKTA, DDA).replace(DDHA + NUKTA, DDHA)


def strip_corrupt(word):
    """Drop only nuktas sitting on a base that cannot legally carry one."""
    out = []
    for i, ch in enumerate(word):
        if ch == NUKTA and (i == 0 or word[i - 1] not in (DDA, DDHA)):
            continue
        out.append(ch)
    return "".join(out)


def main(freq_tsv, out_prefix):
    raw = Counter()
    for ln in open(freq_tsv, encoding="utf-8"):
        parts = ln.rstrip("\n").split("\t")
        if len(parts) < 2:
            continue
        raw[parts[0]] += int(parts[1])

    # ---- 1. corrupt-nukta census, then repair -------------------------------
    corrupt_base = Counter()
    corrupt_types = corrupt_tokens = 0
    freq = Counter()
    for w, c in raw.items():
        bad = False
        for m in ANY_NUKTA.finditer(w):
            b = m.group(1)
            if b not in (DDA, DDHA):
                corrupt_base[f"U+{ord(b):04X} {b}" if b else "<word-initial>"] += c
                bad = True
        if bad:
            corrupt_types += 1
            corrupt_tokens += c
        freq[strip_corrupt(w)] += c

    # ---- 2. word-initial ଡ଼/ଢ଼ : orthographically illegal --------------------
    init_nukta = [w for w in freq if w.startswith((DDA + NUKTA, DDHA + NUKTA))]
    init_nukta_tok = sum(freq[w] for w in init_nukta)
    init_bare_tok = sum(c for w, c in freq.items()
                        if w[:1] in (DDA, DDHA)
                        and not w.startswith((DDA + NUKTA, DDHA + NUKTA)))

    # ---- 3. minimal pairs, split by majority direction ----------------------
    pairs = []
    for w, c in freq.items():
        if (DDA + NUKTA) in w or (DDHA + NUKTA) in w:
            b = strip_nukta(w)
            if b in freq:
                pairs.append((w, c, b, freq[b]))

    legal = [p for p in pairs if not p[0].startswith((DDA + NUKTA, DDHA + NUKTA))]
    nukta_dom = [p for p in legal if p[1] > p[3]]
    bare_dom = [p for p in legal if p[3] >= p[1]]

    def rate(ps):
        n = sum(p[1] for p in ps)
        b = sum(p[3] for p in ps)
        return n, b, (b / (n + b) if (n + b) else 0.0)

    nd_n, nd_b, nd_drop = rate(nukta_dom)
    bd_n, bd_b, bd_add = rate(bare_dom)
    al_n, al_b, al_naive = rate(pairs)

    # ---- 4. total nukta inventory (by code point) ---------------------------
    tot_dda_nukta = sum(c * w.count(DDA + NUKTA) for w, c in freq.items())
    tot_ddha_nukta = sum(c * w.count(DDHA + NUKTA) for w, c in freq.items())

    top_native = sorted(nukta_dom, key=lambda p: -(p[1] + p[3]))[:40]

    out = {
        "corpus": "Odisha government + institutional web pages (this lane)",
        "types": len(freq), "tokens": sum(freq.values()),
        "nukta_inventory_by_codepoint": {
            "U+0B21 U+0B3C (ଡ଼) tokens": tot_dda_nukta,
            "U+0B22 U+0B3C (ଢ଼) tokens": tot_ddha_nukta,
            "precomposed U+0B5C seen": 0,
            "precomposed U+0B5D seen": 0,
            "note": "counts taken after NFC; see precomposed-probe.json for "
                    "what the servers actually put on the wire",
        },
        "corrupt_nukta": {
            "types": corrupt_types, "tokens": corrupt_tokens,
            "by_base": dict(corrupt_base.most_common(12)),
            "comment": "legacy ISCII/legacy-font conversion debris; stripped "
                       "before any rate below is computed",
        },
        "word_initial_nukta": {
            "types": len(init_nukta), "tokens": init_nukta_tok,
            "word_initial_bare_tokens": init_bare_tok,
            "illegal_share_of_word_initial": round(
                init_nukta_tok / (init_nukta_tok + init_bare_tok), 4)
            if (init_nukta_tok + init_bare_tok) else None,
            "examples": sorted([[w, freq[w], strip_nukta(w),
                                 freq.get(strip_nukta(w), 0)] for w in init_nukta],
                               key=lambda r: -r[1])[:12],
        },
        "minimal_pairs": {
            "all_pairs": len(pairs),
            "naive_drop_rate_token_weighted": round(al_naive, 4),
            "naive_comment": "CONTAMINATED - mixes drops and spurious adds",
            "orthographically_legal_pairs": len(legal),
            "native_words_nukta_dominant": {
                "pair_types": len(nukta_dom),
                "nukta_tokens": nd_n, "bare_tokens": nd_b,
                "DROP_RATE": round(nd_drop, 4),
                "comment": "THE number to compare against Aksharantar's ~63%",
            },
            "loanwords_bare_dominant": {
                "pair_types": len(bare_dom),
                "bare_tokens": bd_b, "spurious_nukta_tokens": bd_n,
                "SPURIOUS_ADD_RATE": round(bd_add, 4),
            },
        },
        "top40_native_nukta_words": [
            {"nukta": p[0], "n": p[1], "bare": p[2], "n_bare": p[3],
             "drop_rate": round(p[3] / (p[1] + p[3]), 4),
             "codepoints": " ".join(f"U+{ord(c):04X}" for c in p[0])}
            for p in top_native],
    }

    (HERE / f"{out_prefix}-nukta-report.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(HERE / f"{out_prefix}-freq-repaired.tsv", "w", encoding="utf-8") as f:
        for w, c in freq.most_common():
            f.write(f"{w}\t{c}\n")

    print(json.dumps({k: v for k, v in out.items()
                      if k != "top40_native_nukta_words"},
                     ensure_ascii=False, indent=2))
    print("\n=== TOP 20 NATIVE ଡ଼/ଢ଼ WORDS: how often is the nukta dropped? ===")
    print(f"{'word':<20}{'nukta':>7}{'bare':>7}{'drop%':>8}")
    for r in out["top40_native_nukta_words"][:20]:
        print(f"{r['nukta']:<20}{r['n']:>7}{r['n_bare']:>7}{r['drop_rate']*100:>7.1f}%")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
