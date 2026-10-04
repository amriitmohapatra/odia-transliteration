/**
 * Context ranking: does knowing the previous word help?
 *
 *   npx tsx tools/eval/context.ts [--source FILE] [--bigrams FILE] [--weights 0,0.5,1]
 *                                 [--topk 5] [--max-tokens N]
 *
 * Sentence-level round trip, like everyday.ts but with the words left in their
 * sentences. Each Odia word is romanized (careful and casual, the same
 * derivation as everyday.ts, shared in roundtrip.ts) and fed back, three ways:
 *
 *   none   transliterateWord(roman)                    no context
 *   gold   transliterateWord(roman, k, { prev: gold }) the true previous word
 *   chain  transliterate(sentence)                     the engine's own top-1
 *                                                      of the previous word,
 *                                                      which is what the app gets
 *
 * A "sentence" is a run of Odia words separated by spaces or tabs only: the
 * same adjacency the bigram counts use (tools/build-data/build_bigrams.py).
 * Words of one code point break the run and are not scored (everyday.ts skips
 * them too). Every occurrence counts, not every distinct word. Rows "with
 * prev" are the tokens context can change; the first word of a run has none.
 *
 * `--weights` sweeps `[weights] bigram` (the value in symbols.toml is
 * replaced in memory); the default is the value in symbols.toml plus 0. The
 * owner overrides of everyday-overrides.tsv apply as in everyday.ts.
 *
 * Default source: core/test/golden/everyday-source.txt (small: a few dozen
 * tokens). For tuning, a held-out split of the corpus is better:
 *   python3 tools/build-data/build_bigrams.py --holdout DIR
 *   npx tsx tools/eval/context.ts --source DIR/dev-source.txt --bigrams DIR/bigrams.tsv
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BIGRAMS_PATH,
  Engine,
  ITRANS_PATH,
  LABELS_PATH,
  LEXICON_PATH,
  PREFERENCES_PATH,
  RULES_PATH,
  UNIGRAMS_PATH,
  loadRules,
  parseBigrams,
  parseLabels,
  parseLexicon,
  parsePreferences,
  parseUnigrams,
  readCoreFile,
} from '@odia/core/node';
import { canonical } from '@odia/core/normalize';
import { casual, romanize } from './roundtrip.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const SOURCE = resolve(opt('--source') ?? resolve(ROOT, 'core/test/golden/everyday-source.txt'));
const TOPK = Number(opt('--topk')) || 5;
const MAX_TOKENS = Number(opt('--max-tokens')) || Infinity;

const must = (path: string): string => {
  const text = readCoreFile(path);
  if (text === undefined) throw new Error(`missing core/${path}`);
  return text;
};
const RULES_TOML = must(RULES_PATH);
const bigramsFile = opt('--bigrams');
const bigrams = parseBigrams(
  bigramsFile === undefined ? must(BIGRAMS_PATH) : readFileSync(bigramsFile, 'utf8'),
  bigramsFile ?? BIGRAMS_PATH,
);
const lexicon = parseLexicon(must(LEXICON_PATH));
const unigrams = parseUnigrams(must(UNIGRAMS_PATH));
const preferences = parsePreferences(readCoreFile(PREFERENCES_PATH) ?? '');
const labels = parseLabels(readCoreFile(LABELS_PATH) ?? '');
const itrans = readCoreFile(ITRANS_PATH);

const configured = loadRules(RULES_TOML, itrans).weights.bigram ?? 0;
const WEIGHTS = (opt('--weights') ?? `0,${configured}`)
  .split(',')
  .map(Number)
  .filter((w, i, all) => Number.isFinite(w) && all.indexOf(w) === i);

/** An engine with `[weights] bigram` set to `w` (the rule file is edited in memory). */
function engineWith(w: number): Engine {
  const toml = /^bigram\s*=/m.test(RULES_TOML)
    ? RULES_TOML.replace(/^bigram\s*=.*$/m, `bigram = ${w}`)
    : RULES_TOML.replace(/^\[weights\]\s*$/m, `[weights]\nbigram = ${w}`);
  const rules = loadRules(toml, itrans);
  if ((rules.weights.bigram ?? 0) !== w) throw new Error(`could not set bigram weight ${w}`);
  return new Engine({ rules, lexicon, unigrams, bigrams, preferences, labels });
}

/* ------------------------------------------------------------------ *
 * Sentences
 * ------------------------------------------------------------------ */

const text = readFileSync(SOURCE, 'utf8')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('#'))
  .join('\n');

const runs: string[][] = [];
{
  let run: string[] = [];
  let lastEnd = -1;
  const flush = () => {
    if (run.length > 0) runs.push(run);
    run = [];
  };

  for (const m of text.matchAll(/[\u0B00-\u0B7F]+/g)) {
    const start = m.index ?? 0;
    const word = canonical(m[0]);
    const adjacent = lastEnd >= 0 && /^[ \t\u00A0]+$/.test(text.slice(lastEnd, start));
    if (!adjacent) flush();
    lastEnd = start + m[0].length;
    if (word.length < 2 || romanize(word) === '') {
      flush();
      lastEnd = -1;
      continue;
    }
    run.push(word);
  }
  flush();
}

// --max-tokens keeps every k-th run, so a long source is sampled across all of
// it (every lane of a dev split), not just its first documents.
{
  const total = runs.reduce((s, r) => s + r.length, 0);
  if (total > MAX_TOKENS) {
    const step = Math.ceil(total / MAX_TOKENS);
    const kept = runs.filter((_, i) => i % step === 0);
    runs.length = 0;
    runs.push(...kept);
  }
}

const OVERRIDES = resolve(ROOT, 'core/test/golden/everyday-overrides.tsv');
const overrides = new Map<string, string[]>();
for (const line of (existsSync(OVERRIDES) ? readFileSync(OVERRIDES, 'utf8') : '').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [roman, register, odia] = line.split('\t');
  if (!roman || !register || !odia) throw new Error(`bad row in ${OVERRIDES}: ${line}`);
  const key = `${register}\t${roman}`;
  overrides.set(key, [...(overrides.get(key) ?? []), canonical(odia)]);
}

type Register = 'careful' | 'casual';
type Mode = 'none' | 'gold' | 'chain';

function rankOf(cands: readonly string[], odia: string, roman: string, register: Register): number {
  let rank = cands.indexOf(odia);
  const accepted = overrides.get(`${register}\t${roman}`);
  if (accepted !== undefined) {
    const ranks = [rank, ...accepted.map((w) => cands.indexOf(w))].filter((r) => r >= 0);
    rank = ranks.length > 0 ? Math.min(...ranks) : -1;
  }
  return rank;
}

interface Tally { n: number; t1: number; t3: number; withPrev: number; p1: number; p3: number; ranks: number[]; tops: string[] }
const tally = (): Tally => ({ n: 0, t1: 0, t3: 0, withPrev: 0, p1: 0, p3: 0, ranks: [], tops: [] });
const VERBOSE = argv.includes('--verbose');

function measure(engine: Engine, register: Register, mode: Mode): Tally {
  const t = tally();
  for (const run of runs) {
    const romans = run.map((w) => (register === 'casual' ? casual(romanize(w)) : romanize(w)));
    const chain = mode === 'chain' ? engine.transliterate(romans.join(' '), { topk: TOPK }).words : undefined;
    run.forEach((odia, i) => {
      const roman = romans[i] as string;
      const cands = (
        chain !== undefined
          ? (chain[i]?.candidates ?? [])
          : engine.transliterateWord(roman, TOPK, mode === 'gold' && i > 0 ? { prev: run[i - 1] as string } : undefined)
      ).map((c) => canonical(c.text));
      const rank = rankOf(cands, odia, roman, register);
      t.ranks.push(rank);
      t.tops.push(cands[0] ?? '-');
      t.n += 1;
      if (rank === 0) t.t1 += 1;
      if (rank >= 0 && rank < 3) t.t3 += 1;
      if (i > 0) {
        t.withPrev += 1;
        if (rank === 0) t.p1 += 1;
        if (rank >= 0 && rank < 3) t.p3 += 1;
      }
    });
  }
  return t;
}

const pct = (n: number, d: number) => (d === 0 ? '  n/a' : `${((100 * n) / d).toFixed(1)}%`);

const nTokens = runs.reduce((s, r) => s + r.length, 0);
console.log(`\nContext ranking — ${nTokens} tokens in ${runs.length} runs, top-${TOPK}`);
console.log(`(source: ${SOURCE.startsWith(ROOT) ? SOURCE.slice(ROOT.length + 1) : SOURCE})`);
console.log(`(bigrams: ${bigramsFile ?? 'core/' + BIGRAMS_PATH}, ${bigrams.size.toLocaleString('en')} pairs)\n`);
console.log('  bigram  register  mode    all top-1  all top-3   with-prev top-1  with-prev top-3   top-1 won/lost');
console.log('  ' + '-'.repeat(98));
const flat = runs.flatMap((run) => run.map((w, i) => ({ odia: w, prev: i > 0 ? (run[i - 1] as string) : '' })));
const baseline = new Map<Register, Tally>();
for (const w of [0, ...WEIGHTS.filter((x) => x !== 0)]) {
  const engine = engineWith(w);
  for (const register of ['careful', 'casual'] as const) {
    for (const mode of (w === 0 ? ['none'] : ['gold', 'chain']) as Mode[]) {
      const t = measure(engine, register, mode);
      if (w === 0) baseline.set(register, t);
      const base = baseline.get(register) as Tally;
      const changed = t.ranks.flatMap((r, i) => {
        const b = base.ranks[i] as number;
        return (r === 0) !== (b === 0) ? [{ i, won: r === 0 }] : [];
      });
      const won = changed.filter((c) => c.won).length;
      console.log(
        `  ${String(w).padEnd(7)} ${register.padEnd(9)} ${mode.padEnd(7)} ${pct(t.t1, t.n).padStart(9)}  ${pct(t.t3, t.n).padStart(9)}` +
          `   ${pct(t.p1, t.withPrev).padStart(15)}  ${pct(t.p3, t.withPrev).padStart(15)}` +
          (w === 0 ? '' : `   ${String(won).padStart(5)} / ${changed.length - won}`),
      );
      if (VERBOSE && mode === 'chain') {
        for (const c of changed) {
          const f = flat[c.i] as { odia: string; prev: string };
          console.log(`      ${c.won ? 'won ' : 'LOST'}  ${f.prev} ${f.odia}   (got ${t.tops[c.i]}, was ${base.tops[c.i]})`);
        }
      }
    }
  }
}
console.log('\n  bigram 0 = no context term (identical to the context-free engine).\n');
