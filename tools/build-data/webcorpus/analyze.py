#!/usr/bin/env python3
"""Build the frequency TSV and the nukta report for the social/politicians lane."""
import html
import json
import os
import re
import sys
import unicodedata
from collections import Counter

HERE = "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus"
sys.path.insert(0, HERE)
from fetch_lib import words  # noqa: E402

NUKTA = "଼"
DA = "ଡ"    # ଡ
DDHA = "ଢ"  # ଢ
PRE_DDA = "ଡ଼"   # ଡ଼ precomposed
PRE_DDHA = "ଢ଼"  # ଢ଼ precomposed
YYA = "ୟ"       # ୟ

DEC_DDA = DA + NUKTA
DEC_DDHA = DDHA + NUKTA


def _read(fn, key="text"):
    p = os.path.join(HERE, fn)
    if not os.path.exists(p):
        return []
    out = []
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def _norm(t):
    return unicodedata.normalize("NFC", html.unescape(t))


def strip_boilerplate(pages, seg_split=r"\s*।\s*", df_frac=0.20, min_pages=10):
    """News templates repeat the same nav/menu segments on every page. Any segment
    appearing on more than df_frac of pages is site chrome, not article prose, and
    would otherwise dominate the frequency counts."""
    segs_per_page = [[s.strip() for s in re.split(seg_split, p) if len(s.strip()) > 2]
                     for p in pages]
    if len(pages) < min_pages:
        return [" । ".join(s) for s in segs_per_page], set()
    df = Counter()
    for segs in segs_per_page:
        df.update(set(segs))
    cut = max(2, int(df_frac * len(pages)))
    boiler = {s for s, c in df.items() if c > cut}
    kept = [" । ".join(s for s in segs if s not in boiler) for segs in segs_per_page]
    return kept, boiler


def load():
    """Return list of (bucket, text), plus per-source doc counts."""
    out = []
    counts = {}

    for fn, tag in (("x_posts.jsonl", "x_profiles_r1"),
                    ("x_posts_round2.jsonl", "x_round2"),
                    ("x_posts_round3.jsonl", "x_round3")):
        ds = _read(fn)
        counts[tag] = len(ds)
        for d in ds:
            if d.get("text"):
                out.append(("x_social", _norm(d["text"])))

    news = _read("news_social_pages.jsonl")
    counts["news_pages"] = len(news)
    counts["news_pages_quoting_social"] = sum(1 for d in news if d.get("quotes_social"))
    texts, boiler = strip_boilerplate([_norm(d.get("text", "")) for d in news])
    counts["news_boilerplate_segments_removed"] = len(boiler)
    for d, t in zip(news, texts):
        if t.strip():
            out.append(("news_quoting_social" if d.get("quotes_social") else "news", t))
    return out, counts


def nukta_report(texts):
    """Count decomposed vs precomposed nukta usage, by code point."""
    joined = "".join(texts)
    r = {
        "decomposed_DDA_U+0B21_U+0B3C": joined.count(DEC_DDA),
        "decomposed_DDHA_U+0B22_U+0B3C": joined.count(DEC_DDHA),
        "total_U+0B3C_nukta_signs": joined.count(NUKTA),
        "precomposed_U+0B5C": joined.count(PRE_DDA),
        "precomposed_U+0B5D": joined.count(PRE_DDHA),
        "bare_DA_U+0B21_total": joined.count(DA),
        "bare_DDHA_U+0B22_total": joined.count(DDHA),
        "YYA_U+0B5F": joined.count(YYA),
    }
    r["nukta_on_other_bases"] = (r["total_U+0B3C_nukta_signs"]
                                 - r["decomposed_DDA_U+0B21_U+0B3C"]
                                 - r["decomposed_DDHA_U+0B22_U+0B3C"])
    # exactly which code point precedes each U+0B3C (catches mis-ordered
    # base+matra+nukta sequences, which NFC does NOT reorder because the matra
    # is a ccc=0 starter)
    prev = Counter()
    for i, ch in enumerate(joined):
        if ch == NUKTA:
            p = joined[i - 1] if i else ""
            prev["U+%04X" % ord(p) if p else "START"] += 1
    r["preceding_codepoint_of_U+0B3C"] = dict(prev.most_common())
    return r


# Words that in standard Odia orthography require a nukta. We measure how often
# the writer actually typed it by comparing nukta-ful vs nukta-less spellings of
# the SAME word (identical apart from U+0B3C).
def nukta_drop_rate(counter):
    pairs = []
    for w, c in counter.items():
        if NUKTA not in w:
            continue
        bare = w.replace(NUKTA, "")
        cb = counter.get(bare, 0)
        if cb or c:
            pairs.append((w, c, bare, cb))
    pairs.sort(key=lambda x: -(x[1] + x[3]))
    with_n = sum(p[1] for p in pairs)
    without_n = sum(p[3] for p in pairs)
    tot = with_n + without_n
    return {
        "distinct_nukta_words": len(pairs),
        "tokens_written_with_nukta": with_n,
        "tokens_written_without_nukta": without_n,
        "nukta_drop_rate": (without_n / tot) if tot else None,
        "top_minimal_pairs": [
            {"with": p[0], "n_with": p[1], "without": p[2], "n_without": p[3]}
            for p in pairs[:25] if p[3] > 0
        ][:25],
    }


def main():
    rows, counts = load()
    print("source doc counts:", json.dumps(counts))

    by_bucket = {}
    for b, t in rows:
        by_bucket.setdefault(b, []).append(t)

    # raw text dump
    with open(os.path.join(HERE, "social-politicians-raw.txt"), "w", encoding="utf-8") as fh:
        for b, t in rows:
            fh.write("[%s]\t%s\n" % (b, t))

    all_texts = [t for _, t in rows]
    social_texts = [t for b, t in rows if b in ("x_social", "news_quoting_social")]
    x_texts = [t for b, t in rows if b == "x_social"]

    counter = Counter()
    for t in all_texts:
        counter.update(words(t))
    x_counter = Counter()
    for t in x_texts:
        x_counter.update(words(t))

    tsv = os.path.join(HERE, "social-politicians-freq.tsv")
    with open(tsv, "w", encoding="utf-8") as fh:
        for w, c in counter.most_common():
            fh.write("%s\t%d\n" % (w, c))

    tsv_x = os.path.join(HERE, "social-politicians-x-only-freq.tsv")
    with open(tsv_x, "w", encoding="utf-8") as fh:
        for w, c in x_counter.most_common():
            fh.write("%s\t%d\n" % (w, c))

    # Refined drop rate: only word pairs where BOTH spellings occur >= 5 times.
    # The raw rate is contaminated by (a) loanwords that correctly take no nukta
    # (ଭିଡିଓ) and (b) one-off typos that add a spurious nukta (ଜ଼ିଲ୍ଲା).
    def refined(cnt, floor=5):
        w = wo = 0
        pairs = []
        for word, n in cnt.items():
            if NUKTA not in word:
                continue
            bare = word.replace(NUKTA, "")
            nb = cnt.get(bare, 0)
            if n >= floor and nb >= floor:
                w += n
                wo += nb
                pairs.append({"with": word, "n_with": n, "without": bare, "n_without": nb})
        pairs.sort(key=lambda p: -(p["n_with"] + p["n_without"]))
        return {"pairs": len(pairs), "tokens_with_nukta": w, "tokens_without_nukta": wo,
                "nukta_drop_rate": (wo / (w + wo)) if (w + wo) else None,
                "top_pairs": pairs[:30]}

    EVERYDAY = ["ଭଲ", "ମୁଁ", "ପାଣି", "ଘର", "ଦିନ", "ବଡ଼", "ଅଛି", "କଣ", "କେମିତି",
                "ତୁମେ", "ମୋର", "ନାହିଁ", "ଆଉ", "ହେଲା", "ରାତି", "ସକାଳ", "ଝିଅ",
                "ପୁଅ", "ମା", "ଯାଇ"]

    report = {
        "refined_drop_rate_all": refined(counter),
        "refined_drop_rate_x_only": refined(x_counter, floor=2),
        "everyday_word_coverage": {w: {"all": counter.get(w, 0), "x_only": x_counter.get(w, 0)}
                                   for w in EVERYDAY},
        "short_word_type_share_le4": round(
            100 * sum(1 for w in counter if len(w) <= 4) / max(1, len(counter)), 2),
        "mean_type_length": round(sum(len(w) for w in counter) / max(1, len(counter)), 2),
        "mean_token_length_freq_weighted": round(
            sum(len(w) * n for w, n in counter.items()) / max(1, sum(counter.values())), 2),
        "docs_by_bucket": {b: len(v) for b, v in by_bucket.items()},
        "tokens_all": sum(counter.values()),
        "types_all": len(counter),
        "tokens_x_only": sum(x_counter.values()),
        "types_x_only": len(x_counter),
        "nukta_all": nukta_report(all_texts),
        "nukta_x_only": nukta_report(x_texts),
        "nukta_social_only": nukta_report(social_texts),
        "drop_rate_all": nukta_drop_rate(counter),
        "drop_rate_x_only": nukta_drop_rate(x_counter),
        "top60": counter.most_common(60),
        "top40_x_only": x_counter.most_common(40),
    }
    with open(os.path.join(HERE, "social-politicians-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
    print(json.dumps({k: report[k] for k in
                      ("docs_by_bucket", "tokens_all", "types_all",
                       "tokens_x_only", "types_x_only")}, ensure_ascii=False))
    print("NUKTA ALL:", json.dumps(report["nukta_all"], ensure_ascii=False))
    print("NUKTA X:", json.dumps(report["nukta_x_only"], ensure_ascii=False))
    print("DROP ALL:", json.dumps({k: v for k, v in report["drop_rate_all"].items()
                                   if k != "top_minimal_pairs"}, ensure_ascii=False))
    print("DROP X:", json.dumps({k: v for k, v in report["drop_rate_x_only"].items()
                                 if k != "top_minimal_pairs"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
