#!/usr/bin/env python3
"""Merge every lane's frequency TSV into one corpus-wide table.

Build-time only. No network. Python 3 stdlib.
"""
import json
import os
import sys
import unicodedata as ud
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CORE_DATA = os.path.join(ROOT, "core", "data")

ODIA_LO, ODIA_HI = 0x0B00, 0x0B7F
NUKTA = "଼"
DDA, DDHA = "ଡ", "ଢ"
PRE_DDDA, PRE_RHA = "ଡ଼", "ଢ଼"
DIGITS = set(chr(c) for c in range(0x0B66, 0x0B70))

# Lane files chosen to avoid double counting.
# Skipped deliberately (documented in report):
#   news-freq-raw.tsv          -> unstripped twin of news-freq.tsv
#   govorgs-freq.tsv           -> pre-repair twin of gov-and-orgs-freq.tsv
#   govorgs-freq-repaired.tsv  -> byte-identical to gov-and-orgs-freq.tsv
#   lit-freq-everyday/classical-> components of lit-freq.tsv
#   social-politicians-x-only  -> subset of social-politicians-freq.tsv
LANES = [
    ("wikipedia", "wikipedia-freq.tsv", True),
    ("literature", "lit-freq.tsv", True),
    ("news", "news-freq.tsv", False),
    ("social", "social-politicians-freq.tsv", False),
    ("gov", "gov-and-orgs-freq.tsv", False),
]
OCR_LANE = ("archive_ocr", "archive-books-freq.tsv", True)
OCR_MIN_COUNT = 5  # lit lane's own stated usable threshold; below this the tail is OCR garbage


def canonical(s):
    return ud.normalize("NFC", s)


def is_odia_only(w):
    return all(ODIA_LO <= ord(c) <= ODIA_HI for c in w)


def has_letter(w):
    # at least one code point that is not a digit and not a combining mark
    for c in w:
        if c in DIGITS:
            continue
        if ud.combining(c):
            continue
        if 0x0B00 <= ord(c) <= 0x0B7F:
            return True
    return False


def read_tsv(path, has_header):
    with open(path, encoding="utf-8") as fh:
        first = True
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            if first:
                first = False
                if has_header and parts[0] == "word":
                    continue
            try:
                n = int(parts[1])
            except ValueError:
                continue
            yield parts[0], n


def load_lane(key, fname, header, min_count=0):
    path = os.path.join(HERE, fname)
    counts = Counter()
    stats = dict(rows=0, tokens_in=0, dropped_nonodia=0, dropped_single=0,
                 dropped_nodigitletter=0, dropped_mincount=0,
                 tok_dropped_nonodia=0, tok_dropped_single=0,
                 tok_dropped_nodigitletter=0, tok_dropped_mincount=0,
                 nfc_changed=0, precomposed_types=0)
    for raw, n in read_tsv(path, header):
        stats["rows"] += 1
        stats["tokens_in"] += n
        if PRE_DDDA in raw or PRE_RHA in raw:
            stats["precomposed_types"] += 1
        w = canonical(raw)
        if w != raw:
            stats["nfc_changed"] += 1
        if min_count and n < min_count:
            stats["dropped_mincount"] += 1
            stats["tok_dropped_mincount"] += n
            continue
        if not is_odia_only(w):
            stats["dropped_nonodia"] += 1
            stats["tok_dropped_nonodia"] += n
            continue
        if len(w) < 2:
            stats["dropped_single"] += 1
            stats["tok_dropped_single"] += n
            continue
        if not has_letter(w) or any(c in DIGITS for c in w):
            stats["dropped_nodigitletter"] += 1
            stats["tok_dropped_nodigitletter"] += n
            continue
        counts[w] += n
    stats["types_kept"] = len(counts)
    stats["tokens_kept"] = sum(counts.values())
    return counts, stats


def main():
    include_ocr = "--no-ocr" not in sys.argv

    lane_counts = {}
    lane_stats = {}
    for key, fname, header in LANES:
        c, s = load_lane(key, fname, header)
        lane_counts[key] = c
        lane_stats[key] = s
        print(f"{key:12s} rows={s['rows']:>9,} types={s['types_kept']:>8,} "
              f"tokens={s['tokens_kept']:>11,}", file=sys.stderr)

    if include_ocr:
        key, fname, header = OCR_LANE
        c, s = load_lane(key, fname, header, min_count=OCR_MIN_COUNT)
        lane_counts[key] = c
        lane_stats[key] = s
        print(f"{key:12s} rows={s['rows']:>9,} types={s['types_kept']:>8,} "
              f"tokens={s['tokens_kept']:>11,}  (count>={OCR_MIN_COUNT})", file=sys.stderr)

    merged = Counter()
    lane_presence = defaultdict(set)
    for key, c in lane_counts.items():
        for w, n in c.items():
            merged[w] += n
            lane_presence[w].add(key)

    print(f"MERGED types={len(merged):,} tokens={sum(merged.values()):,}", file=sys.stderr)

    ordered = sorted(merged.items(), key=lambda kv: (-kv[1], kv[0]))

    os.makedirs(CORE_DATA, exist_ok=True)
    out = os.path.join(CORE_DATA, "webfreq.tsv")
    with open(out, "w", encoding="utf-8") as fh:
        for w, n in ordered:
            fh.write(f"{w}\t{n}\n")

    seed = os.path.join(CORE_DATA, "common-seed.tsv")
    with open(seed, "w", encoding="utf-8") as fh:
        for w, n in ordered[:1500]:
            fh.write(f"{w}\t{n}\n")

    # ---------------- Aksharantar coverage ----------------
    aks = set()
    aks_path = os.path.join(ROOT, "tools", "build-data", "raw", "ori", "ori_train.json")
    bad = 0
    with open(aks_path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except json.JSONDecodeError:
                bad += 1
                continue
            w = o.get("native word")
            if w:
                aks.add(canonical(w))
    print(f"Aksharantar types={len(aks):,} badlines={bad}", file=sys.stderr)

    cov = {}
    for n in (100, 500, 1000):
        top = [w for w, _ in ordered[:n]]
        hit = sum(1 for w in top if w in aks)
        cov[n] = dict(hit=hit, pct=round(100.0 * hit / n, 1))

    absent50 = [(w, c, sorted(lane_presence[w])) for w, c in ordered if w not in aks][:50]

    # ---------------- Nukta ----------------
    pre_types = [w for w in merged if PRE_DDDA in w or PRE_RHA in w]
    nukta_types = [w for w in merged if NUKTA in w]
    nukta_tokens = sum(merged[w] for w in nukta_types)

    pairs = []
    for w in nukta_types:
        bare = w.replace(NUKTA, "")
        if bare in merged:
            pairs.append((w, merged[w], bare, merged[bare]))
    pairs.sort(key=lambda t: -(t[1] + t[3]))

    n_with = sum(p[1] for p in pairs)
    n_without = sum(p[3] for p in pairs)
    drop_all = 100.0 * n_without / (n_with + n_without) if pairs else 0.0

    # word-medial only: Odia forbids word-initial DDA/DDHA + nukta
    medial = [p for p in pairs if not (p[0][0] in (DDA, DDHA) and len(p[0]) > 1 and p[0][1] == NUKTA)]
    initial = [p for p in pairs if p not in medial]
    m_with = sum(p[1] for p in medial)
    m_without = sum(p[3] for p in medial)
    drop_medial = 100.0 * m_without / (m_with + m_without) if medial else 0.0

    # direction split on medial pairs
    native = [p for p in medial if p[1] >= p[3]]
    loan = [p for p in medial if p[1] < p[3]]
    nat_drop = 100.0 * sum(p[3] for p in native) / max(1, sum(p[1] + p[3] for p in native))
    loan_add = 100.0 * sum(p[1] for p in loan) / max(1, sum(p[1] + p[3] for p in loan))

    # legal-base check
    illegal = Counter()
    for w in nukta_types:
        for i, ch in enumerate(w):
            if ch == NUKTA:
                prev = w[i - 1] if i else "<START>"
                if prev not in (DDA, DDHA):
                    illegal[prev] += merged[w]

    # Aksharantar's own nukta behaviour, same metric
    aks_nukta = [w for w in aks if NUKTA in w]
    aks_contested = [w for w in aks_nukta if w.replace(NUKTA, "") in aks]
    aks_pre = [w for w in aks if PRE_DDDA in w or PRE_RHA in w]
    web_contested = [w for w in nukta_types if w.replace(NUKTA, "") in merged]

    report = dict(
        merged_types=len(merged), merged_tokens=sum(merged.values()),
        include_ocr=include_ocr, ocr_min_count=OCR_MIN_COUNT if include_ocr else None,
        lane_stats=lane_stats,
        lane_types={k: len(v) for k, v in lane_counts.items()},
        lane_tokens={k: sum(v.values()) for k, v in lane_counts.items()},
        aksharantar_types=len(aks),
        coverage=cov,
        top50_absent=[dict(word=w, count=c, lanes=l) for w, c, l in absent50],
        nukta=dict(
            precomposed_types_in_merged=len(pre_types),
            precomposed_examples=pre_types[:20],
            nukta_types=len(nukta_types), nukta_tokens=nukta_tokens,
            contested_types=len(pairs),
            contested_pct=round(100.0 * len(pairs) / max(1, len(nukta_types)), 1),
            tokens_with=n_with, tokens_without=n_without,
            drop_rate_all=round(drop_all, 1),
            medial_pairs=len(medial), medial_with=m_with, medial_without=m_without,
            drop_rate_medial=round(drop_medial, 1),
            initial_pairs=len(initial),
            initial_with=sum(p[1] for p in initial), initial_without=sum(p[3] for p in initial),
            native_pairs=len(native), native_drop=round(nat_drop, 1),
            loan_pairs=len(loan), loan_spurious_add=round(loan_add, 1),
            illegal_base_tokens=dict(illegal.most_common(20)),
            top_pairs=[dict(nukta=p[0], n=p[1], bare=p[2], b=p[3],
                            drop=round(100.0 * p[3] / (p[1] + p[3]), 1)) for p in pairs[:40]],
        ),
        aksharantar_nukta=dict(
            nukta_types=len(aks_nukta), contested=len(aks_contested),
            contested_pct=round(100.0 * len(aks_contested) / max(1, len(aks_nukta)), 1),
            precomposed_types=len(aks_pre),
        ),
        web_contested_pct=round(100.0 * len(web_contested) / max(1, len(nukta_types)), 1),
    )
    with open(os.path.join(HERE, "MERGED-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)

    with open(os.path.join(HERE, "MERGED-nukta-pairs.tsv"), "w", encoding="utf-8") as fh:
        fh.write("nukta_form\tnukta_count\tbare_form\tbare_count\tdrop_pct\n")
        for p in pairs:
            fh.write(f"{p[0]}\t{p[1]}\t{p[2]}\t{p[3]}\t{100.0*p[3]/(p[1]+p[3]):.1f}\n")

    print(json.dumps({k: report[k] for k in
                      ("merged_types", "merged_tokens", "coverage", "web_contested_pct")},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
