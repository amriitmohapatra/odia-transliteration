#!/usr/bin/env python3
"""Tokenize + count Odia words from harvested JSONL; analyze nukta usage.

Boilerplate handling: government sites repeat nav/footer lines verbatim across
hundreds of pages. We count each DISTINCT line once globally (dedup), which is
the standard defence for this kind of crawl. Raw (undeduped) counts are also
reported so the effect is visible.
"""
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent

NUKTA = "଼"
DDA = "ଡ"      # ଡ
DDHA = "ଢ"     # ଢ
PRE_DDA = "ଡ଼"  # ଡ଼ precomposed
PRE_DDHA = "ଢ଼"  # ଢ଼ precomposed

# Odia letters + matras + signs; ZWNJ/ZWJ allowed word-internally
TOKEN = re.compile(r"[଀-୿‌‍]+")
# strip leading/trailing danda, digits-only tokens, isolated signs
ODIA_DIGIT = re.compile(r"^[୦-୯]+$")
LETTER = re.compile(r"[ଅ-ହୟ-ୡ]")


def clean_token(t):
    t = t.strip("।॥‌‍")
    if not t or ODIA_DIGIT.match(t):
        return None
    if not LETTER.search(t):
        return None
    if len(t) > 40:
        return None
    return t


def main(jsonl_paths, out_prefix):
    lines_seen = set()
    raw_counts = Counter()
    dedup_counts = Counter()
    n_pages = 0
    n_lines_total = 0
    n_lines_kept = 0
    raw_text_chunks = []

    for p in jsonl_paths:
        for ln in open(p, encoding="utf-8"):
            rec = json.loads(ln)
            n_pages += 1
            for line in rec["text"].split("\n"):
                line = unicodedata.normalize("NFC", line.strip())
                if not line:
                    continue
                n_lines_total += 1
                for t in TOKEN.findall(line):
                    t = clean_token(t)
                    if t:
                        raw_counts[t] += 1
                if line in lines_seen:
                    continue
                lines_seen.add(line)
                n_lines_kept += 1
                raw_text_chunks.append(line)
                for t in TOKEN.findall(line):
                    t = clean_token(t)
                    if t:
                        dedup_counts[t] += 1

    # ---- write corpus + freq
    (OUT / f"{out_prefix}-corpus.txt").write_text(
        "\n".join(raw_text_chunks) + "\n", encoding="utf-8")

    with open(OUT / f"{out_prefix}-freq.tsv", "w", encoding="utf-8") as f:
        for w, n in dedup_counts.most_common():
            f.write(f"{w}\t{n}\n")

    # ---- nukta analysis (all on NFC text, by code point)
    text_all = "\n".join(raw_text_chunks)
    n_nukta = text_all.count(NUKTA)
    n_dda_nukta = len(re.findall(DDA + NUKTA, text_all))
    n_ddha_nukta = len(re.findall(DDHA + NUKTA, text_all))
    n_other_nukta = n_nukta - n_dda_nukta - n_ddha_nukta
    n_pre_dda = text_all.count(PRE_DDA)
    n_pre_ddha = text_all.count(PRE_DDHA)
    n_ya = text_all.count("ୟ")

    # words containing a nukta -> compare against nukta-dropped spelling
    pairs = []
    for w, n in dedup_counts.items():
        if NUKTA not in w:
            continue
        bare = w.replace(NUKTA, "")
        m = dedup_counts.get(bare, 0)
        pairs.append((w, n, bare, m))
    pairs.sort(key=lambda x: -(x[1] + x[3]))

    tot_with = sum(p[1] for p in pairs)
    tot_without = sum(p[3] for p in pairs)
    drop_rate = tot_without / (tot_with + tot_without) if (tot_with + tot_without) else 0.0

    # type-level: how many nukta-words also appear bare
    n_types_nukta = len(pairs)
    n_types_also_bare = sum(1 for p in pairs if p[3] > 0)

    report = {
        "pages": n_pages,
        "lines_total": n_lines_total,
        "lines_after_dedup": n_lines_kept,
        "tokens_raw": sum(raw_counts.values()),
        "tokens_dedup": sum(dedup_counts.values()),
        "types_raw": len(raw_counts),
        "types_dedup": len(dedup_counts),
        "nukta": {
            "U+0B3C_total": n_nukta,
            "DDA+NUKTA (ଡ଼)": n_dda_nukta,
            "DDHA+NUKTA (ଢ଼)": n_ddha_nukta,
            "NUKTA_on_other_base": n_other_nukta,
            "precomposed_U+0B5C": n_pre_dda,
            "precomposed_U+0B5D": n_pre_ddha,
            "U+0B5F (ୟ, atomic)": n_ya,
        },
        "nukta_drop": {
            "types_with_nukta": n_types_nukta,
            "types_also_seen_bare": n_types_also_bare,
            "tokens_with_nukta": tot_with,
            "tokens_bare_variant": tot_without,
            "drop_rate": round(drop_rate, 4),
        },
    }
    (OUT / f"{out_prefix}-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    with open(OUT / f"{out_prefix}-nukta-pairs.tsv", "w", encoding="utf-8") as f:
        f.write("with_nukta\tn_with\tbare\tn_bare\n")
        for w, n, b, m in pairs:
            f.write(f"{w}\t{n}\t{b}\t{m}\n")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("\nTop 60 (dedup):")
    for w, n in dedup_counts.most_common(60):
        print(f"{n}\t{w}")
    print("\nTop nukta pairs (with vs bare):")
    for w, n, b, m in pairs[:30]:
        print(f"{w}\t{n}\t|\t{b}\t{m}")


if __name__ == "__main__":
    main(sys.argv[2:], sys.argv[1])
