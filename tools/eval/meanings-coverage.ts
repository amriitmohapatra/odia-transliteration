/**
 * Meanings coverage: for the most frequent Odia words, what does the dictionary give?
 *
 *   npx tsx tools/eval/meanings-coverage.ts [--top 20000] [--list BUCKET] [--n 50]
 *
 * Words come from tools/eval/data/indiccorp-top20k.tsv (IndicCorp v2 Odia counts,
 * CC0; the top 20,000 words carry 89.8% of all tokens). Each word goes into the
 * best bucket the lookup can reach, in the order the app and the lens show
 * meanings (Appv2/src/dictionary/lookup.ts, lens/src/describe.ts):
 *
 *   owner        core/data/glosses.tsv
 *   ai           core/data/meanings.tsv (when present; AI-written, status not "wrong")
 *   exact        Praharaj headword with a readable gloss, or a modern-layer exact hit
 *   stem         only an inflected form matches (shown as "maybe:")
 *   no-gloss     Praharaj headword, but no English gloss the extractor can read
 *   prefix-only  only a shorter headword the word starts with (often a different word)
 *   none         nothing
 *
 * Reported by token mass (how much running text the bucket covers), and by words.
 * --list BUCKET prints the most frequent words of that bucket: the work list.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { parseGlosses } from '@odia/core';
import { canonical } from '@odia/core/normalize';

import { defAt, findEntry, findModern, foldKey, modernLines, parsePayload, shortGlossOf } from '../../Appv2/src/dictionary/lookup.js';

const ROOT = new URL('../../', import.meta.url);
const read = (p: string): Buffer => readFileSync(new URL(p, ROOT));

const { values } = parseArgs({
  options: {
    top: { type: 'string', default: '20000' },
    list: { type: 'string' },
    n: { type: 'string', default: '50' },
  },
});

const BUCKETS = ['owner', 'ai', 'exact', 'stem', 'no-gloss', 'prefix-only', 'none'] as const;
type Bucket = (typeof BUCKETS)[number];

const P = parsePayload(new Uint8Array(read('Appv2/src/dictionary/praharaj.bin')));
const M = parsePayload(new Uint8Array(read('Appv2/src/dictionary/modern.bin')));
const owner = parseGlosses(read('core/data/glosses.tsv').toString('utf8'));
const ai = new Set<string>();
try {
  for (const line of read('core/data/meanings.tsv').toString('utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const cells = line.split('\t');
    if (cells[5] !== 'wrong') ai.add(canonical(cells[0] as string));
  }
} catch {
  // no AI layer yet
}

function bucketOf(word: string): Bucket {
  if (owner.get(word)) return 'owner';
  if (ai.has(word)) return 'ai';
  const key = foldKey(word);
  const modern = findModern(M.keys, key);
  const modernGloss = modern ? modernLines(defAt(M, modern.index)).some((l) => l.tag !== 'loan') : false;
  if (modern?.how === 'exact' && modernGloss) return 'exact';
  const entry = findEntry(P.keys, key);
  const gloss = entry ? shortGlossOf(defAt(P, entry.index)) : null;
  if (entry?.how === 'exact') return gloss ? 'exact' : 'no-gloss';
  if (entry?.how === 'stem' || (modern && modernGloss)) return 'stem';
  if (entry?.how === 'prefix') return 'prefix-only';
  return 'none';
}

const rows = read('tools/eval/data/indiccorp-top20k.tsv')
  .toString('utf8')
  .split('\n')
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split('\t'))
  .slice(0, Number(values.top))
  .map(([w, c]) => ({ word: canonical(w as string), count: Number(c) }));
const total = Number(/all tokens: (\d+)/.exec(read('tools/eval/data/indiccorp-top20k.tsv').toString('utf8'))?.[1] ?? 0);

const byBucket = new Map<Bucket, { word: string; count: number }[]>(BUCKETS.map((b) => [b, []]));
for (const row of rows) byBucket.get(bucketOf(row.word))!.push(row);

if (values.list) {
  const list = byBucket.get(values.list as Bucket);
  if (!list) throw new Error(`unknown bucket "${values.list}" (${BUCKETS.join(', ')})`);
  for (const r of list.slice(0, Number(values.n))) console.log(`${r.word}\t${r.count}`);
} else {
  const mass = rows.reduce((s, r) => s + r.count, 0);
  console.log(`Meanings coverage: top ${rows.length} IndicCorp words (${((100 * mass) / total).toFixed(1)}% of all tokens)\n`);
  console.log('  bucket          words    token share (of these words)');
  for (const b of BUCKETS) {
    const list = byBucket.get(b)!;
    const m = list.reduce((s, r) => s + r.count, 0);
    console.log(`  ${b.padEnd(13)} ${String(list.length).padStart(7)}    ${((100 * m) / mass).toFixed(1).padStart(5)}%`);
  }
  const good = ['owner', 'ai', 'exact'].reduce((s, b) => s + byBucket.get(b as Bucket)!.reduce((t, r) => t + r.count, 0), 0);
  console.log(`\n  a clear meaning (owner, ai, exact): ${((100 * good) / mass).toFixed(1)}% of the running text`);
}
