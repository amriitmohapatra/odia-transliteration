#!/usr/bin/env python3
"""scheme-vs-reality: validate core/rules/symbols.toml against the merged web corpus."""
import collections, json, sys, unicodedata, re, os

ROOT = "/Users/amriitmohapatra/Documents/Odia_transliteration"
FREQ = os.path.join(ROOT, "core/data/webfreq.tsv")

VIRAMA = "୍"
NUKTA = "଼"

def load_freq(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            w, c = line.split("\t")
            rows.append((w, int(c)))
    return rows

rows = load_freq(FREQ)
total_tokens = sum(c for _, c in rows)
print(f"types={len(rows)} tokens={total_tokens}", file=sys.stderr)

# ---------------------------------------------------------------- 1. grapheme census
cp_tok = collections.Counter()
cp_typ = collections.Counter()
for w, c in rows:
    seen = set()
    for ch in w:
        cp_tok[ch] += c
        if ch not in seen:
            cp_typ[ch] += 1
            seen.add(ch)

out = {"total_tokens": total_tokens, "total_types": len(rows)}
out["codepoints"] = [
    {
        "char": ch,
        "cp": "U+%04X" % ord(ch),
        "name": unicodedata.name(ch, "?"),
        "tokens": cp_tok[ch],
        "types": cp_typ[ch],
        "tok_per_1k": round(1000 * cp_tok[ch] / total_tokens, 3),
    }
    for ch in sorted(cp_tok, key=lambda c: -cp_tok[c])
]

# ---------------------------------------------------------------- 2. ya vs yya by position
YA = "ଯ"    # ଯ
YYA = "ୟ"   # ୟ

def positions(target):
    """classify each occurrence: initial / after-virama (conjunct 2nd member) / other-medial / final"""
    d = collections.Counter()
    ex = collections.defaultdict(collections.Counter)
    for w, c in rows:
        for i, ch in enumerate(w):
            if ch != target:
                continue
            if i == 0:
                k = "word_initial"
            elif w[i - 1] == VIRAMA:
                k = "post_virama"
            elif i == len(w) - 1:
                k = "word_final"
            else:
                k = "medial_other"
            d[k] += c
            ex[k][w] += c
    return d, ex

ya_pos, ya_ex = positions(YA)
yya_pos, yya_ex = positions(YYA)
out["ya_vs_yya"] = {
    "ya_U+0B2F": dict(ya_pos),
    "yya_U+0B5F": dict(yya_pos),
    "ya_examples": {k: v.most_common(12) for k, v in ya_ex.items()},
    "yya_examples": {k: v.most_common(12) for k, v in yya_ex.items()},
}

# what precedes ya/yya post-virama
pre = {"ya": collections.Counter(), "yya": collections.Counter()}
for w, c in rows:
    for i, ch in enumerate(w):
        if i >= 2 and w[i - 1] == VIRAMA and ch in (YA, YYA):
            key = "ya" if ch == YA else "yya"
            pre[key][w[i - 2]] += c
out["ya_phala_base"] = {k: v.most_common(15) for k, v in pre.items()}

# ---------------------------------------------------------------- 3. ba vs wa
BA = "ବ"   # ବ
WA = "ୱ"   # ୱ
ba_pos, ba_ex = positions(BA)
wa_pos, wa_ex = positions(WA)
out["ba_vs_wa"] = {
    "ba_U+0B2C": dict(ba_pos),
    "wa_U+0B71": dict(wa_pos),
    "wa_examples": {k: v.most_common(15) for k, v in wa_ex.items()},
}
# what precedes wa post-virama
wpre = collections.Counter()
bpre = collections.Counter()
for w, c in rows:
    for i, ch in enumerate(w):
        if i >= 2 and w[i - 1] == VIRAMA:
            if ch == WA:
                wpre[w[i - 2]] += c
            elif ch == BA:
                bpre[w[i - 2]] += c
out["wa_conjunct_base"] = wpre.most_common(15)
out["ba_conjunct_base"] = bpre.most_common(15)

# ---------------------------------------------------------------- 4. la vs lla
LA = "ଲ"   # ଲ
LLA = "ଳ"  # ଳ
la_pos, _ = positions(LA)
lla_pos, lla_ex = positions(LLA)
out["la_vs_lla"] = {
    "la_U+0B32": dict(la_pos),
    "lla_U+0B33": dict(lla_pos),
    "lla_tokens": cp_tok[LLA],
    "la_tokens": cp_tok[LA],
    "lla_examples": lla_ex["medial_other"].most_common(20) + lla_ex["word_final"].most_common(10),
}

# ---------------------------------------------------------------- 5. conjuncts
conj = collections.Counter()
conj_types = collections.Counter()
for w, c in rows:
    i = 0
    n = len(w)
    while i < n:
        if w[i] == VIRAMA and i > 0 and i + 1 < n:
            # base may carry a nukta
            a_end = i
            a_start = i - 1
            if w[a_start] == NUKTA and a_start > 0:
                a_start -= 1
            b_start = i + 1
            b_end = b_start + 1
            if b_end < n and w[b_end] == NUKTA:
                b_end += 1
            key = w[a_start:a_end] + VIRAMA + w[b_start:b_end]
            conj[key] += c
            conj_types[key] += 1
        i += 1
out["conjuncts_top60"] = [
    {"conj": k, "tokens": v, "types": conj_types[k],
     "cps": " ".join("U+%04X" % ord(ch) for ch in k)}
    for k, v in conj.most_common(60)
]
out["conjunct_total_tokens"] = sum(conj.values())
out["conjunct_distinct"] = len(conj)

with open(os.path.join(ROOT, "tools/build-data/webcorpus/SCHEME-check.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("written", file=sys.stderr)
