#!/usr/bin/env python3
"""
Refined nukta audit.

The naive minimal-pair drop rate conflates two opposite error directions:

  (a) native ଡ଼/ଢ଼ words written without the nukta   -> a nukta DROP
      ଓଡ଼ିଶା  vs  ଓଡିଶା
  (b) English loanwords with a genuine plain ଡ that acquire a spurious nukta
      ଡିସେମ୍ବର (correct)  vs  ଡ଼ିସେମ୍ବର (wrong)

Odia orthography also forbids ଡ଼/ଢ଼ word-initially, which gives a hard
orthographic test independent of frequency.

Splits pairs by which form the corpus majority prefers and reports the drop
rate only over the (a) class, which is what the engine's ranking cares about.
"""
import json
import unicodedata
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
DDA, DDHA, NUKTA = "ଡ", "ଢ", "଼"


def strip_nukta(w):
    return w.replace(DDA + NUKTA, DDA).replace(DDHA + NUKTA, DDHA)


def main():
    freq = Counter()
    with (HERE / "wikipedia-freq.tsv").open(encoding="utf-8") as f:
        next(f)
        for line in f:
            w, c = line.rstrip("\n").split("\t")[:2]
            freq[w] = int(c)

    # --- 1. word-initial nukta: orthographically illegal ---------------------
    init_nukta_types = [w for w in freq if w.startswith(DDA + NUKTA)
                        or w.startswith(DDHA + NUKTA)]
    init_nukta_tok = sum(freq[w] for w in init_nukta_types)
    init_bare_tok = sum(c for w, c in freq.items()
                        if w[0] in (DDA, DDHA) and not w.startswith((DDA + NUKTA, DDHA + NUKTA)))

    # --- 2. other nukta bases (should be ~none) ------------------------------
    other_base = Counter()
    for w, c in freq.items():
        for i, ch in enumerate(w):
            if ch == NUKTA:
                b = w[i - 1] if i else "<initial>"
                if b not in (DDA, DDHA):
                    other_base[f"U+{ord(b):04X} {b}" if i else b] += c

    # --- 3. split minimal pairs by majority direction ------------------------
    pairs = []
    for w, c in freq.items():
        if (DDA + NUKTA) in w or (DDHA + NUKTA) in w:
            b = strip_nukta(w)
            if b in freq:
                pairs.append((w, c, b, freq[b]))

    # exclude pairs whose nukta form is word-initial: those are unambiguously
    # the misspelling, and they are the loanword class
    legal = [p for p in pairs if not p[0].startswith((DDA + NUKTA, DDHA + NUKTA))]

    nukta_dom = [p for p in legal if p[1] > p[3]]   # native ଡ଼ word
    bare_dom = [p for p in legal if p[3] >= p[1]]   # loanword / genuine ଡ

    def rate(ps):
        n = sum(p[1] for p in ps)
        b = sum(p[3] for p in ps)
        return n, b, (b / (n + b) if (n + b) else 0.0)

    nd_n, nd_b, nd_drop = rate(nukta_dom)
    bd_n, bd_b, bd_add = rate(bare_dom)
    al_n, al_b, al_naive = rate(pairs)

    # --- 4. per-word drop rate for the 40 most frequent native ଡ଼/ଢ଼ words ---
    top_native = sorted(nukta_dom, key=lambda p: -(p[1] + p[3]))[:40]

    # --- 5. how much of the corpus is even at risk --------------------------
    # types where a nukta decision has to be made at all
    at_risk_types = {p[0] for p in legal} | {p[2] for p in legal}

    out = {
        "corpus": "or.wikipedia + or.wikisource dumps 2026-07-02",
        "word_initial_nukta": {
            "types": len(init_nukta_types),
            "tokens": init_nukta_tok,
            "comment": "orthographically illegal in Odia; ~all are loanwords "
                       "given a spurious nukta",
            "word_initial_bare_DDA_DDHA_tokens": init_bare_tok,
            "illegal_share_of_word_initial": round(
                init_nukta_tok / (init_nukta_tok + init_bare_tok), 4),
            "examples": sorted(
                [[w, freq[w], strip_nukta(w), freq.get(strip_nukta(w), 0)]
                 for w in init_nukta_types], key=lambda r: -r[1])[:12],
        },
        "nukta_on_other_bases": dict(other_base.most_common(10)),
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
        "at_risk_types": len(at_risk_types),
        "top40_native_nukta_words": [
            {"nukta": p[0], "n": p[1], "bare": p[2], "n_bare": p[3],
             "drop_rate": round(p[3] / (p[1] + p[3]), 4),
             "codepoints": " ".join(f"U+{ord(c):04X}" for c in p[0])}
            for p in top_native
        ],
    }
    (HERE / "wikipedia-nukta-report.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({k: v for k, v in out.items()
                      if k != "top40_native_nukta_words"},
                     ensure_ascii=False, indent=2))
    print("\n=== TOP 20 NATIVE ଡ଼/ଢ଼ WORDS: how often is the nukta dropped? ===")
    print(f"{'word':<14}{'nukta':>8}{'bare':>8}{'drop%':>8}")
    for r in out["top40_native_nukta_words"][:20]:
        print(f"{r['nukta']:<14}{r['n']:>8,}{r['n_bare']:>8,}"
              f"{r['drop_rate']*100:>7.1f}%")


if __name__ == "__main__":
    main()
