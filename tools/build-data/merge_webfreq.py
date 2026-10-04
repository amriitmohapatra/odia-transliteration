#!/usr/bin/env python3
"""
Fold real-world word frequencies into core/data/unigrams.tsv.

Why this exists
---------------
The lexicon and unigrams were built from AI4Bharat Aksharantar, which turned out
not to be a lexicon of Odia at all: only 2 of 25 common everyday words appear in
it, mean entry length is 8.7 characters, and it is 95.7% IndicCorp-mined names
and compounds (see plan/03-spikes.md, S2b). So the engine had no way to know
that ମୁଁ is one of the commonest words in the language while ମାଣା is not.

tools/build-data/webcorpus/ now holds a genuine corpus swept from Odia news,
Wikipedia, literature, archive books, government pages and social posts —
18.4M tokens over 527k word types, with ordinary vocabulary present at
50/50 on the probe list. This script turns that into the frequency signal the
ranker uses, so that ATTESTED words outrank spellings the rules merely invented.

Scale
-----
`rank.ts` computes  score = w.rule*ruleScore + w.freq*logfreq + w.user*userBoost
with w.freq = 0.6 and ruleScore in [0, 1]. The existing unigram values sit in
[0.41, 2.30], so frequency can outweigh a rule difference but not swamp it.
Raw log counts would reach ln(226484) = 12.3 and drown everything else, so web
counts are compressed onto the same [0, MAX_LOGFREQ] range.

The two sources are merged by MAX, not replaced. Aksharantar remains genuinely
good at what it is — proper nouns, place names and long compounds — which is
exactly where the web corpus is thin.

    python3 tools/build-data/merge_webfreq.py
"""

from __future__ import annotations

import math
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEBFREQ = ROOT / "core" / "data" / "webfreq.tsv"
UNIGRAMS = ROOT / "core" / "data" / "unigrams.tsv"

# Matches the top of the existing unigram range, so the merged file keeps the
# scale rank.ts was tuned against.
MAX_LOGFREQ = 2.303

NUKTA = "଼"
PRECOMPOSED = {"ଡ଼": "ଡ" + NUKTA, "ଢ଼": "ଢ" + NUKTA}


def canonical(s: str) -> str:
    """NFC, then force the two nukta letters decomposed. Mirrors normalize.ts."""
    s = unicodedata.normalize("NFC", s)
    for pre, dec in PRECOMPOSED.items():
        s = s.replace(pre, dec)
    return s


def read_tsv(path: Path) -> dict[str, float]:
    out: dict[str, float] = {}
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            tab = line.find("\t")
            if tab <= 0:
                continue
            try:
                value = float(line[tab + 1 :])
            except ValueError:
                continue
            word = canonical(line[:tab].strip())
            if word:
                out[word] = max(out.get(word, 0.0), value)
    return out


def main() -> int:
    if not WEBFREQ.exists():
        print(f"error: {WEBFREQ} not found — run the web corpus sweep first", file=sys.stderr)
        return 1

    web_counts = read_tsv(WEBFREQ)
    if not web_counts:
        print("error: webfreq.tsv parsed to zero rows", file=sys.stderr)
        return 1

    peak = max(web_counts.values())
    denom = math.log1p(peak)
    web_scaled = {
        word: (math.log1p(count) / denom) * MAX_LOGFREQ for word, count in web_counts.items()
    }

    existing = read_tsv(UNIGRAMS)

    merged = dict(existing)
    added = improved = 0
    for word, value in web_scaled.items():
        prior = merged.get(word)
        if prior is None:
            merged[word] = value
            added += 1
        elif value > prior:
            merged[word] = value
            improved += 1

    if UNIGRAMS.exists():
        shutil.copy2(UNIGRAMS, UNIGRAMS.with_suffix(".tsv.aksharantar-only"))

    with UNIGRAMS.open("w", encoding="utf-8") as fh:
        fh.write("# odiaWord\\tlogfreq\n")
        fh.write("# Merged: AI4Bharat Aksharantar attestation + real-web corpus frequency.\n")
        fh.write(f"# Rebuild: python3 tools/build-data/merge_webfreq.py   (range 0..{MAX_LOGFREQ})\n")
        for word in sorted(merged):
            fh.write(f"{word}\t{merged[word]:.4f}\n")

    print(f"web corpus      : {len(web_counts):,} types, {int(sum(web_counts.values())):,} tokens")
    print(f"prior unigrams  : {len(existing):,} types (backed up alongside)")
    print(f"added           : {added:,}")
    print(f"raised          : {improved:,}")
    print(f"merged unigrams : {len(merged):,} types -> {UNIGRAMS}")

    probes = ["ମୁଁ", "ପାଣି", "ଭଲ", "ଘର", "ବଡ଼", "ଓଡ଼ିଶା", "ଭାଗ୍ୟ", "ଚାନ୍ଦ", "କଳା", "ସମୟ"]
    print("\nprobe (was -> now):")
    for p in probes:
        key = canonical(p)
        before = existing.get(key)
        after = merged.get(key)
        b = f"{before:.3f}" if before is not None else "absent"
        a = f"{after:.3f}" if after is not None else "absent"
        print(f"  {p:<10} {b:>7} -> {a:>7}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
