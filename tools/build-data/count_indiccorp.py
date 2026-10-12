#!/usr/bin/env python3
"""
Count Odia words in IndicCorp v2 (CC0), streaming, without saving the corpus.

  curl -sSL https://huggingface.co/datasets/ai4bharat/IndicCorpV2/resolve/main/data/or.txt \
    | python3 tools/build-data/count_indiccorp.py indiccorp-or-counts.tsv

Words are runs of Odia-block characters; ZWJ/ZWNJ removed; NFC; the precomposed
nukta letters U+0B5C/U+0B5D rewritten decomposed (the project invariant). Words
seen fewer than 3 times are dropped. Input used on 2026-10-12: or.txt, 2,177,310,918
bytes, sha256 42c97403c4a547c6093e38b0cba952be02428070a6ab7986fc509436d4d78fc6,
5,581,122 lines. Output is a build input (about 10 MB), not committed.
"""
word = re.compile(r'[଀-୿‌‍]+')
c = collections.Counter(); n = 0
for line in sys.stdin.buffer:
    t = line.decode('utf8', 'replace')
    for w in word.findall(t):
        w = unicodedata.normalize('NFC', w.replace('‌','').replace('‍',''))
        w = w.replace('ଡ଼', 'ଡ଼').replace('ଢ଼', 'ଢ଼')
        c[w] += 1
    n += 1
    if n % 2000000 == 0: print(n, len(c), file=sys.stderr, flush=True)
with open(sys.argv[1], 'w', encoding='utf8') as f:
    f.write(f'# IndicCorp v2 or.txt word counts (CC0). lines={n}\n')
    for w, k in c.most_common():
        if k < 3: break
        f.write(f'{w}\t{k}\n')
print('done', n, len(c), file=sys.stderr)
