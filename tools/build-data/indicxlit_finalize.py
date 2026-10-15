"""indicxlit_romanize.py output -> ROMANIZED.tsv for build_xlit_fill.py. usage: indicxlit_finalize.py WORDS.tsv RAW.tsv ROMANIZED.tsv
Odia column is copied byte-for-byte from fill-words.tsv (by line index), not from model output.
Keeps original beam rank (gaps possible after filtering). Keeps only ^[a-z]+$ outputs."""
import sys, re, collections
words = [l.rstrip('\n').split('\t')[0] for l in open(sys.argv[1], encoding='utf-8')]
ok = re.compile(r'^[a-z]+$')
rows = collections.defaultdict(list); unkw = set(); dropped = 0
for l in open(sys.argv[2], encoding='utf-8'):
    i, src, h, r, sc, nunk = l.rstrip('\n').split('\t')
    i = int(i)
    assert src == words[i]
    if int(nunk): unkw.add(i)
    if ok.match(h): rows[i].append((int(r), h, sc))
    else: dropped += 1
n = 0; cnt = collections.Counter()
with open(sys.argv[3], 'w', encoding='utf-8') as fo:
    for i, w in enumerate(words):
        rs = sorted(rows.get(i, []))
        cnt[len(rs)] += 1
        for r, h, sc in rs:
            fo.write('%s\t%s\t%d\t%s\n' % (w, h, r, sc)); n += 1
print('rows', n, 'dropped(non a-z)', dropped, 'words', len(words), 'words-by-rowcount', dict(sorted(cnt.items())), 'words with unk input', len(unkw))
