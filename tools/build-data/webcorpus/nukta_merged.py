#!/usr/bin/env python3
"""Nukta reality check on the merged corpus, restricted to orthographically legal forms."""
import json, os, sys, unicodedata as ud
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
NUKTA = "଼"; DDA = "ଡ"; DDHA = "ଢ"
PRE1 = "ଡ଼"; PRE2 = "ଢ଼"


def legal(w):
    """Every U+0B3C in w sits immediately after U+0B21 or U+0B22."""
    for i, ch in enumerate(w):
        if ch == NUKTA:
            if i == 0 or w[i - 1] not in (DDA, DDHA):
                return False
    return True


def load(path):
    c = Counter()
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) >= 2:
                c[p[0]] = int(p[1])
    return c


def analyse(merged, label):
    out = {"label": label}
    out["types"] = len(merged); out["tokens"] = sum(merged.values())

    pre = [w for w in merged if PRE1 in w or PRE2 in w]
    out["precomposed_types"] = len(pre)
    out["precomposed_tokens"] = sum(merged[w] for w in pre)

    nukta_types = [w for w in merged if NUKTA in w]
    out["nukta_types_all"] = len(nukta_types)
    out["nukta_tokens_all"] = sum(merged[w] for w in nukta_types)

    lg = [w for w in nukta_types if legal(w)]
    ilg = [w for w in nukta_types if not legal(w)]
    out["nukta_types_legal"] = len(lg)
    out["nukta_tokens_legal"] = sum(merged[w] for w in lg)
    out["nukta_types_illegal"] = len(ilg)
    out["nukta_tokens_illegal"] = sum(merged[w] for w in ilg)

    # census of what illegal nuktas sit on
    bad = Counter()
    for w in ilg:
        for i, ch in enumerate(w):
            if ch == NUKTA and (i == 0 or w[i - 1] not in (DDA, DDHA)):
                bad["<WORD-INITIAL>" if i == 0 else w[i - 1]] += merged[w]
    out["illegal_base_tokens"] = dict(bad.most_common(25))
    # split: on a vowel sign (mis-ORDERED, NFC will not fix) vs on a wrong consonant
    misordered = sum(v for k, v in bad.items() if k != "<WORD-INITIAL>" and ud.combining(k))
    out["misordered_after_vowel_sign_tokens"] = misordered

    # contested pairs, legal forms only
    pairs = []
    for w in lg:
        bare = w.replace(NUKTA, "")
        if bare in merged:
            pairs.append((w, merged[w], bare, merged[bare]))
    pairs.sort(key=lambda t: -(t[1] + t[3]))
    out["contested_types"] = len(pairs)
    out["contested_pct_of_legal"] = round(100.0 * len(pairs) / max(1, len(lg)), 1)
    out["uncontested_types"] = len(lg) - len(pairs)

    # word-initial nukta is phonotactically illegal in Odia -> the BARE form is correct there
    wi = [p for p in pairs if p[0][0] in (DDA, DDHA) and len(p[0]) > 1 and p[0][1] == NUKTA]
    med = [p for p in pairs if p not in wi]
    out["word_initial_pairs"] = len(wi)
    out["word_initial_nukta_tokens"] = sum(p[1] for p in wi)
    out["word_initial_bare_tokens"] = sum(p[3] for p in wi)

    def rate(ps):
        a = sum(p[1] for p in ps); b = sum(p[3] for p in ps)
        return a, b, round(100.0 * b / max(1, a + b), 1)

    out["all_pairs_rate"] = rate(pairs)
    out["medial_pairs"] = len(med)
    out["medial_rate"] = rate(med)

    nat = [p for p in med if p[1] >= p[3]]
    loan = [p for p in med if p[1] < p[3]]
    a, b, r = rate(nat)
    out["native_pairs"] = len(nat); out["native_nukta_tokens"] = a
    out["native_bare_tokens"] = b; out["native_drop_pct"] = r
    a2, b2, _ = rate(loan)
    out["loan_pairs"] = len(loan); out["loan_nukta_tokens"] = a2
    out["loan_bare_tokens"] = b2
    out["loan_spurious_add_pct"] = round(100.0 * a2 / max(1, a2 + b2), 1)

    # thresholded: both spellings >= 5, medial only -> robust figure
    rob = [p for p in med if p[1] >= 5 and p[3] >= 5]
    out["robust_pairs"] = len(rob)
    out["robust_rate"] = rate(rob)
    robnat = [p for p in rob if p[1] >= p[3]]
    out["robust_native_pairs"] = len(robnat)
    out["robust_native_rate"] = rate(robnat)

    out["top_medial_pairs"] = [
        dict(nukta=p[0], n=p[1], bare=p[2], b=p[3], drop=round(100.0 * p[3] / (p[1] + p[3]), 1))
        for p in med[:30]]
    return out


def aksharantar():
    aks = Counter()
    path = os.path.join(ROOT, "tools", "build-data", "raw", "ori", "ori_train.json")
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            o = json.loads(line)
            w = o.get("native word")
            if w:
                aks[ud.normalize("NFC", w)] += 1   # count = number of training pairs for that word
    return aks


if __name__ == "__main__":
    res = {}
    res["merged_with_ocr"] = analyse(load(os.path.join(ROOT, "core", "data", "webfreq.tsv")),
                                     "merged (incl. archive OCR, count>=5)")
    noocr = os.path.join(HERE, "webfreq-noocr.tsv")
    if os.path.exists(noocr):
        res["merged_no_ocr"] = analyse(load(noocr), "merged (born-digital lanes only)")
    aks = aksharantar()
    res["aksharantar"] = analyse(aks, "Aksharantar ori_train native words (count = #pairs)")
    with open(os.path.join(HERE, "MERGED-nukta.json"), "w", encoding="utf-8") as fh:
        json.dump(res, fh, ensure_ascii=False, indent=1)
    for k, v in res.items():
        print("=" * 70); print(k)
        for kk, vv in v.items():
            if kk == "top_medial_pairs":
                continue
            print(f"  {kk}: {vv}")
