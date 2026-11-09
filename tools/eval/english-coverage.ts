// English -> Odia coverage (owner, 2026-11-03: type "cow", get ଗାଈ).
// For a list of common English words, most frequent first, the share that gets at
// least one Odia word: before (the curated english.tsv only), V2.20 (curated,
// english-ai.tsv, the meanings read backwards) and now (V2.20 plus the generated
// english-api.tsv, V2.21). Optionally writes the
// words still missing, to fill the next batch.
// Usage: npx tsx tools/eval/english-coverage.ts <english words, one per line> [missing-out]
// (The list is not in the repository; the 2026-11-03 run used wordfreq's top 3,000
// English words, at build time only.)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseEnglishEntries } from '../../Appv2/src/dictionary/english.js';
import { EnglishIndex, parseEnglishAi, parseEnglishApi, reverseMeanings } from '../../Appv2/src/dictionary/english-index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (p: string): string => readFileSync(root + p, 'utf8');
const [listPath, missingOut] = process.argv.slice(2);
if (!listPath) throw new Error('usage: english-coverage.ts <word list> [missing-out]');
const words = readFileSync(listPath, 'utf8').split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean);

const curated = parseEnglishEntries(read('Appv2/src/dictionary/english.tsv'));
const empty = new Map<string, string[]>();
const before = new EnglishIndex(curated, empty, empty, empty);
const layers = (): EnglishIndex => new EnglishIndex(curated, parseEnglishAi(read('Appv2/src/dictionary/english-ai.tsv')),
  reverseMeanings(read('core/data/glosses.tsv'), 2), reverseMeanings(read('core/data/meanings.tsv'), 5));
const v220 = layers();
const now = layers();
now.setApi(parseEnglishApi(read('Appv2/src/dictionary/english-api.tsv')));

const missing: string[] = [];
for (const n of [500, 1000, 2000, 3000, 10000, 30000, words.length].filter((x, i, xs) => x <= words.length && xs.indexOf(x) === i)) {
  const slice = words.slice(0, n);
  const hit = (ix: EnglishIndex): number => slice.filter((w) => ix.odiaFor(w).length > 0).length;
  const b = hit(before), m = hit(v220), a = hit(now);
  const pct = (x: number): string => `${(100 * x / n).toFixed(1).padStart(5)}%`;
  console.log(`top ${String(n).padStart(5)}: before ${pct(b)}  V2.20 ${pct(m)}  now ${pct(a)}  (${a}/${n})`);
}
const sources = new Map<string, number>();
for (const w of words) {
  const first = now.search(w).find((h) => h.exact);
  if (first) sources.set(first.source, (sources.get(first.source) ?? 0) + 1);
  else missing.push(w);
}
console.log('first answer from:', Object.fromEntries(sources));
if (missingOut) writeFileSync(missingOut, `${missing.join('\n')}\n`);
console.log(`missing ${missing.length}; first 60: ${missing.slice(0, 60).join(' ')}`);
