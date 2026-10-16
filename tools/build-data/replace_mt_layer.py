"""Replace the MODERN layer's machine-translation lines with open data (V2.7, decision D-5).

The `mt` lines of the MODERN dictionary layer came from OdiaNLP `cleaned_pairs.json`: the
repository is MIT, but the origin of its text is unknown and many lines are wrong ("the
quick" for shighra, "in the mass" for maasare). Decision D-5: replace the layer.

The plan's sources for the replacement could not be used: Samanantar is CC-BY-NC-4.0 on
HuggingFace (not shippable) and BPCC is gated. So the replacement is (measured in
plan/research/v27-modern-layer.md):

  * the AI-written meanings (core/data/meanings.tsv, D-13) for the 2,000 most frequent
    words that showed an `mt` line first (batch 11), which come before this layer anyway;
  * Wikidata labels (CC0) for names: countries, districts, cities, parties, universities,
    festivals, rivers, temples, languages (`wd` lines, from
    Odia_Sanskrit_Appv2/build/wikidata-names.tsv);
  * every `mt` line removed. A key left with no line is removed; those words keep their
    Praharaj, AI and owner meanings.

Usage (repo root), rewrites in place and prints the counts:
    python3 tools/build-data/replace_mt_layer.py Appv2/src/dictionary/modern.bin \\
        --b64 Odia_Sanskrit_Appv2/build/modern_payload.b64 \\
        --names Odia_Sanskrit_Appv2/build/wikidata-names.tsv
"""
import argparse
import base64
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from filter_cldr_short import read, write  # noqa: E402



def canonical(s: str) -> str:
    return unicodedata.normalize('NFC', s).replace('\u0b5c', '\u0b21\u0b3c').replace('\u0b5d', '\u0b22\u0b3c')


def fold_key(word: str) -> str:
    """As Appv2/src/dictionary/lookup.ts foldKey(): canonical, then yya -> ya, wa and va -> ba."""
    return canonical(word).replace('\u0b5f', '\u0b2f').replace('\u0b71', '\u0b2c').replace('\u0b35', '\u0b2c')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('bin')
    ap.add_argument('--b64')
    ap.add_argument('--names', required=True)
    a = ap.parse_args()

    entries = read(Path(a.bin).read_bytes())
    names = {}
    for line in Path(a.names).read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        odia, english, kind, _qid = line.split('\t')
        key = fold_key(odia)
        names.setdefault(key, f'wd\t{english} ({kind})')

    out, mt_lines, dropped_keys = {}, 0, 0
    for key, d in entries:
        lines = []
        for line in d.split('\n'):
            if line.startswith('mt\t'):
                mt_lines += 1
                continue
            lines.append(line)
        if lines:
            out[key] = lines
        else:
            dropped_keys += 1
    added = 0
    for key, line in names.items():
        lines = out.setdefault(key, [])
        if not any(l.startswith('cldr\t') or l.startswith('wd\t') for l in lines):
            # A name goes before an auto-detected loan line, as the CLDR names do.
            lines.insert(0, line)
            added += 1

    result = sorted((k, '\n'.join(v)) for k, v in out.items())
    raw = write(result)
    Path(a.bin).write_bytes(raw)
    if a.b64:
        Path(a.b64).write_text(base64.b64encode(raw).decode('ascii'), encoding='ascii')
    print(f'entries {len(entries):,} -> {len(result):,}; mt lines removed {mt_lines:,}; '
          f'keys left empty and removed {dropped_keys:,}; Wikidata names added {added:,}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
