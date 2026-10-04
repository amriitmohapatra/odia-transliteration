/**
 * In-memory trial of proposed symbols.toml fixes. Does NOT write to core/rules/.
 * Loads the shipped rules, applies a patch string, builds a second engine, and
 * reports rank(target) before vs after for each probe.
 */
import { readFileSync } from 'node:fs';
import { createEngine } from '../../../core/src/index.js';
import { canonical } from '../../../core/src/normalize.js';

const CORE = new URL('../../../core/', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, CORE), 'utf8');
const base = read('rules/symbols.toml');
const itrans = read('rules/itrans.toml');
const lexicon = read('data/lexicon.tsv');
const unigrams = read('data/unigrams.tsv');

const PATCH = readFileSync(process.argv[3], 'utf8');

const mk = (toml: string) =>
  createEngine({ rulesToml: toml, itransToml: itrans, lexiconTsv: lexicon, unigramsTsv: unigrams });

const before = mk(base);
const after = mk(base + '\n' + PATCH);
const K = 40;

const rank = (e: ReturnType<typeof mk>, roman: string, target: string) => {
  const r = e.transliterate(roman, { topk: K });
  const c = (r.words[0]?.candidates ?? []).map((x) => canonical(x.text));
  return [c.indexOf(canonical(target)), c[0] ?? ''] as const;
};

let improved = 0, regressed = 0, same = 0;
for (const line of readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)) {
  const [roman, target, label = ''] = line.split('\t');
  const [rb, tb] = rank(before, roman, target);
  const [ra, ta] = rank(after, roman, target);
  const score = (r: number) => (r < 0 ? 999 : r);
  const d = score(ra) - score(rb);
  if (d < 0) improved++; else if (d > 0) regressed++; else same++;
  const mark = d < 0 ? 'BETTER' : d > 0 ? 'WORSE ' : '  =   ';
  process.stdout.write(`${mark}\t${label}\t${roman}\t${target}\t${rb}->${ra}\ttop1 ${tb} -> ${ta}\n`);
}
process.stderr.write(`improved=${improved} regressed=${regressed} same=${same}\n`);
