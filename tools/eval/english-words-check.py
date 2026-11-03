#!/usr/bin/env python3
"""Check the Odia words of Appv2/src/dictionary/english-ai.tsv against the app's word lists.

Every Odia option should be a real, attested word: in the IndicCorp top-100k list
(core/data/indiccorp-words.tsv), in the lexicon (core/data/lexicon.tsv), or a
dictionary headword with a modern meaning (core/data/meanings.tsv, glosses.tsv).
Prints the rows whose words are found nowhere (likely typos), the canonical-form
check (no precomposed nukta U+0B5C/U+0B5D), and coverage counts.

Usage: python3 tools/eval/english-words-check.py [path]
"""
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'Appv2/src/dictionary/english-ai.tsv'


def words(file, col=0, skip_hash=True):
    out = {}
    for line in (ROOT / file).read_text(encoding='utf-8').splitlines():
        if not line or (skip_hash and line.startswith('#')):
            continue
        cells = line.split('\t')
        if len(cells) > col:
            out.setdefault(cells[col], cells[1] if col == 0 and len(cells) > 1 else '')
    return out


freq = {}
for line in (ROOT / 'core/data/indiccorp-words.tsv').read_text(encoding='utf-8').splitlines():
    if line and not line.startswith('#'):
        w, c = line.split('\t')[:2]
        freq[w] = int(c)
lexicon = set(words('core/data/lexicon.tsv', 1))
meant = set(words('core/data/meanings.tsv', 0)) | set(words('core/data/glosses.tsv', 0))

rows = missing = precomposed = options = 0
seen = set()
dupes = []
for n, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
    if not line or line.startswith('#'):
        continue
    rows += 1
    eng, odia = line.split('\t')[:2]
    if eng in seen:
        dupes.append(eng)
    seen.add(eng)
    for w in odia.split('|'):
        options += 1
        if 'ଡ଼' in w or 'ଢ଼' in w or unicodedata.normalize('NFC', w) != w and '଼' not in w:
            precomposed += 1
            print(f'{n}: NOT CANONICAL {eng} {w}')
        parts = w.split(' ')
        if not all(p in freq or p in lexicon or p in meant for p in parts):
            missing += 1
            print(f'{n}: UNKNOWN {eng}\t{w}')
print(f'\n{rows} English words, {options} Odia options; unknown {missing}; not canonical {precomposed}; duplicate English {len(dupes)} {dupes[:20]}')
