#!/usr/bin/env python3
"""
Tokenize wikipedia-raw.jsonl, build a frequency list, and run the nukta audit.

Nukta invariant under test:
    ଡ଼ = U+0B21 U+0B3C   (decomposed)   never U+0B5C
    ଢ଼ = U+0B22 U+0B3C   (decomposed)   never U+0B5D
NFC decomposes U+0B5C/U+0B5D, so after normalization only the decomposed
sequences should exist. We verify that rather than assume it.

Outputs:
    wikipedia-freq.tsv        word <TAB> count      (all types)
    wikipedia-nukta-audit.tsv nukta minimal pairs with both token counts
    wikipedia-stats.json      every number quoted in the report
"""
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent

DDA, DDHA, NUKTA = "ଡ", "ଢ", "଼"
RRA_PRE, RHA_PRE = "ଡ଼", "ଢ଼"      # precomposed; must never survive NFC
YYA = "ୟ"                              # atomic, unrelated to nukta
ZWNJ, ZWJ = "‌", "‍"

# Odia letters + dependent signs. Excludes digits U+0B66-6F, isshar U+0B70,
# fraction signs U+0B72-77.
WORD_CHARS = (
    "ଁ-ଃ"      # candrabindu, anusvara, visarga
    "ଅ-ଌଏଐଓ-ନପ-ହ"   # independent vowels + consonants
    "଼-ୄେୈୋ-୍"                # nukta, avagraha, matras, virama
    "୕-ୗଡ଼-ୟୢୣୱ"
)
RE_WORD = re.compile(f"[{WORD_CHARS}{ZWNJ}{ZWJ}]+")
# a token must contain at least one real letter, not only combining marks
RE_HAS_LETTER = re.compile("[ଅ-ଌଏଐଓ-ନ"
                           "ପ-ହଡ଼-ୟୱ]")
# strip orphaned leading combining marks / trailing virama+ZWJ residue
RE_LEAD_MARK = re.compile("^[ଁ-ଃ଼-ୗୢୣ]+")


def norm_token(tok):
    tok = tok.replace(ZWNJ, "").replace(ZWJ, "")
    tok = unicodedata.normalize("NFC", tok)
    tok = RE_LEAD_MARK.sub("", tok)
    return tok


def strip_nukta(w):
    """Remove the nukta only where it follows ଡ or ଢ."""
    return (w.replace(DDA + NUKTA, DDA).replace(DDHA + NUKTA, DDHA))


def main():
    raw = HERE / "wikipedia-raw.jsonl"
    freq = Counter()
    freq_by_src = {"or.wikipedia": Counter(), "or.wikisource": Counter()}
    n_docs = n_chars = n_tokens = 0
    zw_tokens = 0
    precomposed_pre_nfc = Counter()
    # positional nukta accounting over the *token* stream
    dda_total = dda_nukta = dda_initial = dda_noninit = dda_noninit_nukta = 0
    ddha_total = ddha_nukta = ddha_noninit = ddha_noninit_nukta = 0

    with raw.open(encoding="utf-8") as fh:
        for line in fh:
            d = json.loads(line)
            txt = d["text"]
            src = d["source"]
            n_docs += 1
            n_chars += len(txt)
            for c in (RRA_PRE, RHA_PRE):
                if c in txt:
                    precomposed_pre_nfc[c] += txt.count(c)
            for m in RE_WORD.finditer(txt):
                t = m.group(0)
                if ZWNJ in t or ZWJ in t:
                    zw_tokens += 1
                t = norm_token(t)
                if not t or not RE_HAS_LETTER.search(t):
                    continue
                n_tokens += 1
                freq[t] += 1
                freq_by_src[src][t] += 1

    # --- positional nukta accounting (token-weighted) ------------------------
    for w, c in freq.items():
        for i, ch in enumerate(w):
            if ch == DDA:
                has_n = i + 1 < len(w) and w[i + 1] == NUKTA
                dda_total += c
                if has_n:
                    dda_nukta += c
                if i == 0:
                    dda_initial += c
                else:
                    dda_noninit += c
                    if has_n:
                        dda_noninit_nukta += c
            elif ch == DDHA:
                has_n = i + 1 < len(w) and w[i + 1] == NUKTA
                ddha_total += c
                if has_n:
                    ddha_nukta += c
                if i > 0:
                    ddha_noninit += c
                    if has_n:
                        ddha_noninit_nukta += c

    # --- minimal-pair audit --------------------------------------------------
    nukta_types = [w for w in freq if (DDA + NUKTA) in w or (DDHA + NUKTA) in w]
    pairs = []
    for w in nukta_types:
        bare = strip_nukta(w)
        if bare != w and bare in freq:
            pairs.append((w, freq[w], bare, freq[bare]))
    pairs.sort(key=lambda r: -(r[1] + r[3]))

    pair_nukta_tok = sum(r[1] for r in pairs)
    pair_bare_tok = sum(r[3] for r in pairs)
    pair_drop_tok = pair_bare_tok / (pair_nukta_tok + pair_bare_tok) if pairs else 0.0
    # type-weighted: of paired types, how many have the bare form winning
    bare_wins = sum(1 for r in pairs if r[3] > r[1])

    all_nukta_tok = sum(freq[w] for w in nukta_types)

    # --- everyday-word probe -------------------------------------------------
    everyday = ["ଭଲ", "ମୁଁ", "ପାଣି", "ଘର", "ଦିନ", "ବଡ଼", "ଛୋଟ", "ତୁମେ", "ଆମେ",
                "ସେ", "କଣ", "କେମିତି", "ଅଛି", "ନାହିଁ", "ହେଉଛି", "କରିବା", "ଯିବା",
                "ଆସିବା", "ଖାଇବା", "ରାତି", "ସକାଳ", "ବର୍ଷ", "ମାସ", "ହାତ", "ଆଖି",
                "ପିଲା", "ମାଆ", "ବାପା", "ଗାଁ", "ରାସ୍ତା"]
    everyday = [unicodedata.normalize("NFC", w) for w in everyday]
    ranked = {w: i + 1 for i, (w, _) in enumerate(freq.most_common())}
    everyday_hits = [{"word": w, "count": freq.get(w, 0),
                      "rank": ranked.get(w), "codepoints": cps(w)}
                     for w in everyday]

    # --- write ---------------------------------------------------------------
    with (HERE / "wikipedia-freq.tsv").open("w", encoding="utf-8") as f:
        f.write("word\tcount\twp_count\tws_count\n")
        for w, c in freq.most_common():
            f.write(f"{w}\t{c}\t{freq_by_src['or.wikipedia'][w]}"
                    f"\t{freq_by_src['or.wikisource'][w]}\n")

    with (HERE / "wikipedia-nukta-audit.tsv").open("w", encoding="utf-8") as f:
        f.write("nukta_form\tnukta_count\tbare_form\tbare_count\tbare_share\n")
        for w, cw, b, cb in pairs:
            f.write(f"{w}\t{cw}\t{b}\t{cb}\t{cb / (cw + cb):.4f}\n")

    lens = Counter(len(w) for w in freq)
    tok_len_mean = sum(len(w) * c for w, c in freq.items()) / n_tokens
    type_len_mean = sum(lens[k] * k for k in lens) / len(freq)
    short_types = sum(c for k, c in lens.items() if k <= 4)

    stats = {
        "docs": n_docs, "chars": n_chars,
        "tokens": n_tokens, "types": len(freq),
        "tokens_with_zwj_zwnj": zw_tokens,
        "precomposed_U0B5C_U0B5D_in_dump_text": dict(precomposed_pre_nfc),
        "type_len_mean": round(type_len_mean, 2),
        "token_len_mean": round(tok_len_mean, 2),
        "types_len_le4_pct": round(100 * short_types / len(freq), 2),
        "nukta": {
            "U0B3C_total_tokens": sum(c for w, c in freq.items() if NUKTA in w),
            "types_with_nukta": len(nukta_types),
            "tokens_with_nukta": all_nukta_tok,
            "DDA_occurrences_tokens": dda_total,
            "DDA_with_nukta_tokens": dda_nukta,
            "DDA_word_initial_tokens": dda_initial,
            "DDA_noninitial_tokens": dda_noninit,
            "DDA_noninitial_with_nukta_tokens": dda_noninit_nukta,
            "DDA_noninitial_nukta_rate": round(dda_noninit_nukta / dda_noninit, 4) if dda_noninit else None,
            "DDHA_occurrences_tokens": ddha_total,
            "DDHA_with_nukta_tokens": ddha_nukta,
            "DDHA_noninitial_tokens": ddha_noninit,
            "DDHA_noninitial_with_nukta_tokens": ddha_noninit_nukta,
            "DDHA_noninitial_nukta_rate": round(ddha_noninit_nukta / ddha_noninit, 4) if ddha_noninit else None,
            "minimal_pairs": len(pairs),
            "pair_nukta_tokens": pair_nukta_tok,
            "pair_bare_tokens": pair_bare_tok,
            "pair_drop_rate_token_weighted": round(pair_drop_tok, 4),
            "pair_types_where_bare_wins": bare_wins,
            "pair_types_total": len(pairs),
        },
        "everyday_probe": everyday_hits,
        "top100": [[w, c] for w, c in freq.most_common(100)],
    }
    (HERE / "wikipedia-stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in stats.items()
                      if k not in ("top100", "everyday_probe")},
                     ensure_ascii=False, indent=2))


def cps(w):
    return " ".join(f"U+{ord(c):04X}" for c in w)


if __name__ == "__main__":
    main()
