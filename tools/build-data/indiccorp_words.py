#!/usr/bin/env python3
"""
The Odia word list the Odia Lens uses to correct what OCR reads (V4.2).

  python3 tools/build-data/indiccorp_words.py indiccorp-or-counts.tsv core/data/indiccorp-words.tsv

Input: the IndicCorp v2 (CC0) word counts from count_indiccorp.py (canonical: NFC,
decomposed nukta). Output: the 100,000 most frequent words made of Odia letters and
signs only (no digits), one "word<TAB>count" per line, most frequent first.
"""
import re
import sys

LIMIT = 100_000
LETTERS = re.compile(r'[\u0b01-\u0b63\u0b70-\u0b7f]+')

src, out = sys.argv[1], sys.argv[2]
rows = []
for line in open(src, encoding='utf8'):
    if line.startswith('#'):
        continue
    word, count = line.rstrip('\n').split('\t')
    if LETTERS.fullmatch(word) and not word[0] in '\u0b01\u0b02\u0b03\u0b3c\u0b3e\u0b3f\u0b40\u0b41\u0b42\u0b43\u0b44\u0b47\u0b48\u0b4b\u0b4c\u0b4d\u0b56\u0b57':
        rows.append((word, int(count)))
    if len(rows) == LIMIT:
        break
with open(out, 'w', encoding='utf8') as f:
    f.write('# indiccorp-words.tsv: the 100,000 most frequent Odia words in IndicCorp v2 (CC0),\n')
    f.write('# letters and signs only. Built by tools/build-data/indiccorp_words.py from the\n')
    f.write('# count_indiccorp.py counts (see core/data/PROVENANCE.md). Used by the Odia Lens to\n')
    f.write('# correct words read by OCR (V4.2). Format: word<TAB>count, most frequent first.\n')
    for word, count in rows:
        f.write(f'{word}\t{count}\n')
print(len(rows), 'words; last count', rows[-1][1])
