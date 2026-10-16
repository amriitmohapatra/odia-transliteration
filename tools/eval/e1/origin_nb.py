# E-1 (2026-10-15): character n-gram naive Bayes for word origin, trained on Praharaj origin tags.
# Usage: python3 tools/eval/e1/origin_nb.py ORIGINS.tsv  (word<TAB>Praharaj origin code; dump from
# Appv2/src/dictionary/origin.bin with parseOrigin). Result: plan/research/e1-origin-tagger.md. Not shipped.
import collections, math, random, sys
GROUP = {'S': 'sanskrit', 'T': 'native', 'D': 'native', 'E': 'english', 'P': 'perso-arabic', 'A': 'perso-arabic', 'F': 'other'}
rows = []
for line in open(sys.argv[1], encoding='utf-8'):
    w, c = line.rstrip('\n').split('\t')
    if c in GROUP: rows.append((w, GROUP[c]))
random.seed(1); random.shuffle(rows)
cut = int(len(rows) * 0.8); train, test = rows[:cut], rows[cut:]
def grams(w, n=(1, 2, 3, 4)):
    s = '^' + w + '$'
    return [s[i:i + k] for k in n for i in range(len(s) - k + 1)]
prior = collections.Counter(c for _, c in train)
counts = {c: collections.Counter() for c in prior}
for w, c in train: counts[c].update(grams(w))
vocab = set(g for c in counts for g in counts[c])
tot = {c: sum(counts[c].values()) for c in counts}
def predict(w, alpha=0.5, prior_w=1.0):
    best = None
    for c in prior:
        lp = prior_w * math.log(prior[c] / len(train))
        for g in grams(w):
            lp += math.log((counts[c][g] + alpha) / (tot[c] + alpha * len(vocab)))
        if best is None or lp > best[0]: best = (lp, c)
    return best[1]
conf = collections.Counter(); per = collections.Counter(); hit = collections.Counter()
for w, c in test:
    p = predict(w); conf[(c, p)] += 1; per[c] += 1; hit[c] += (p == c)
acc = sum(hit.values()) / len(test)
maj = max(per.values()) / len(test)
print(f'test {len(test)}  accuracy {acc:.3f}  majority baseline {maj:.3f}')
f1s = []
for c in sorted(per):
    tp = conf[(c, c)]; fp = sum(v for (t, p), v in conf.items() if p == c and t != c); fn = per[c] - tp
    pr = tp / (tp + fp) if tp + fp else 0; rc = tp / per[c]; f1 = 2 * pr * rc / (pr + rc) if pr + rc else 0; f1s.append(f1)
    print(f'  {c:13} n={per[c]:5}  precision {pr:.2f}  recall {rc:.2f}  F1 {f1:.2f}')
print(f'macro F1 {sum(f1s)/len(f1s):.3f}')
