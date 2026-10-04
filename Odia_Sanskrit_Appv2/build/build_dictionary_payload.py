#!/usr/bin/env python3
"""
Build the dictionary payload embedded in odia-app-sanskrit-v2.html.

Source
------
Purnnachandra Odia Bhashakosha (G. C. Praharaj, 1931-40), as digitised in
Babylon format by the indic-dict project:

    https://github.com/indic-dict/stardict-oriya
    or-head/praharaj/praharaj.babylon   (146,261 headwords after parsing)

The dictionary text is in the public domain (the author died in 1946;
Indian copyright expired 2007). The indic-dict packaging is freely
redistributable.

What this script does
---------------------
1. Parse the Babylon file: blank-line-separated blocks, first line the
   headword, the rest the entry (Odia senses with English glosses inline).
2. canonical(): NFC + decompose the nukta letters (U+0B5C -> U+0B21 U+0B3C,
   U+0B5D -> U+0B22 U+0B3C), mirroring core/src/normalize.ts.
3. fold(): Praharaj-era orthography to one lookup form
   (ya U+0B5F -> U+0B2F, wa U+0B71 -> U+0B2C, va U+0B35 -> U+0B2C).
4. Strip cognate tokens in other scripts (Bengali, Devanagari, Telugu, ...)
   -- they tripled the size for no benefit in this app.
5. Keep only entries REACHABLE from the transliteration app's vocabulary:
   every Odia word in core/data/unigrams.tsv (the full 756k-type corpus
   sweep), core/data/lexicon-web.tsv, Appv2/data/sanskrit-lexicon-web.tsv
   and Appv2/data/sanskrit-unigrams-web.tsv, matched exactly or after
   removing one inflectional suffix. This is what keeps the final HTML
   under ~16 MB while still covering essentially anything the engine can
   realistically suggest. Set FULL = True for the whole dictionary
   (~27 MB HTML).
6. Serialise:  N \\x02 keys(\\n-joined, sorted) \\x02 lens(,) \\x02 defs(concat)
   then gzip -9 and base64 -> dict_payload_v2.b64

Run from the repo root:
    python3 Odia_Sanskrit_Appv2/build/build_dictionary_payload.py <path-to-praharaj.babylon>
"""
import base64
import gzip
import json
import re
import sys
import unicodedata
from pathlib import Path

FULL = False

REPO = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'dict_payload_v2.b64'

WORD_SOURCES = [
    (REPO / 'core/data/unigrams.tsv', 0),
    (REPO / 'core/data/lexicon-web.tsv', 1),
    (REPO / 'Appv2/data/sanskrit-lexicon-web.tsv', 1),
    (REPO / 'Appv2/data/sanskrit-unigrams-web.tsv', 0),
]

SUFFIXES = sorted([
    'ମାନଙ୍କର',  # -maananka-ra
    'ମାନଙ୍କୁ',  # -maananku
    'ଗୁଡ଼ିକୁ',  # -gudiku
    'ଗୁଡ଼ିକର',  # -gudikara
    'ମାନଙ୍କ',        # -maananka
    'ଗୁଡ଼ିକ',        # -gudika
    'ଗୁଡ଼ାଏ',        # -gudaae
    'ମାନେ',                    # -maane
    'ଙ୍କର',                    # -nkara
    'ଙ୍କୁ',                    # -nku
    'ଟିକୁ',                    # -tiku
    'ଟିରେ',                    # -tire
    'ଙ୍କ',                          # -nka
    'ଟିର',                          # -tira
    'ରେ',                                # -re
    'ରୁ',                                # -ru
    'କୁ',                                # -ku
    'ଟି',                                # -ti
    'ଟା',                                # -taa
    'ର',                                      # -ra
    'ଁ',                                      # candrabindu
    'ଂ',                                      # anusvara
    'ଃ',                                      # visarga
], key=len, reverse=True)


def canonical(s: str) -> str:
    s = unicodedata.normalize('NFC', s)
    return s.replace('ଡ଼', 'ଡ଼').replace('ଢ଼', 'ଢ଼')


def fold(w: str) -> str:
    return w.replace('ୟ', 'ଯ').replace('ୱ', 'ବ').replace('ଵ', 'ବ')


FOREIGN = re.compile(r'[ऀ-ॿঀ-৿ఀ-౿؀-ۿ਀-੿஀-௿]')


def strip_foreign(text: str) -> str:
    keep = []
    for t in text.split(' '):
        letters = [c for c in t if c.isalpha()]
        if letters:
            f = sum(1 for c in t if FOREIGN.match(c))
            if f >= max(1, len(letters) // 2):
                continue
        keep.append(t)
    return re.sub(r'[ \t]{2,}', ' ', ' '.join(keep)).strip()


def parse_babylon(path: Path) -> dict:
    raw = path.read_text(encoding='utf-8')
    merged = {}
    for block in raw.split('\n\n'):
        if not block.strip() or block.startswith('#'):
            continue
        lines = block.split('\n')
        head, body = lines[0].strip(), '\n'.join(lines[1:]).strip()
        if not head or not body:
            continue
        for h in (fold(canonical(x.strip())) for x in head.split('|')):
            if not h:
                continue
            b = strip_foreign(canonical(body))
            if h in merged:
                if b not in merged[h]:
                    merged[h] += '\n\n' + b
            else:
                merged[h] = b
    return merged


def app_words() -> set:
    words = set()
    for path, col in WORD_SOURCES:
        for line in path.read_text(encoding='utf-8').splitlines():
            if line.startswith('#') or not line.strip():
                continue
            parts = line.split('\t')
            if len(parts) > col:
                words.add(fold(canonical(parts[col])))
    return words


def main(babylon: str) -> None:
    d = parse_babylon(Path(babylon))
    print(f'dictionary headwords (folded, merged): {len(d)}')

    if FULL:
        reach = set(d)
    else:
        words = app_words()
        print(f'app vocabulary (folded): {len(words)}')
        reach, hit = set(), 0
        for w in words:
            if w in d:
                reach.add(w); hit += 1; continue
            for s in SUFFIXES:
                if w.endswith(s) and len(w) - len(s) >= 2 and w[:len(w) - len(s)] in d:
                    reach.add(w[:len(w) - len(s)]); hit += 1; break
        print(f'app words with an entry: {hit} ({100 * hit / len(words):.1f}%)')
    print(f'entries embedded: {len(reach)}')

    keys = sorted(reach)
    defs = [d[k] for k in keys]
    assert all('\n' not in k for k in keys)
    payload = (str(len(keys)) + '\x02' + '\n'.join(keys) + '\x02'
               + ','.join(str(len(x)) for x in defs) + '\x02' + ''.join(defs))
    gz = gzip.compress(payload.encode('utf-8'), 9)
    OUT.write_text(base64.b64encode(gz).decode('ascii'), encoding='ascii')
    print(f'wrote {OUT}  raw={len(payload.encode())/1e6:.1f}MB '
          f'gz={len(gz)/1e6:.1f}MB b64={OUT.stat().st_size/1e6:.1f}MB')


if __name__ == '__main__':
    main(sys.argv[1])
