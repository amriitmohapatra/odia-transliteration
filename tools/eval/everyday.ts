/**
 * Round-trip evaluation against real connected Odia.
 *
 * Why this exists, and why it is not just another golden file: Aksharantar's Odia
 * split is 95.7% IndicCorp-mined surface forms with a mean word length of 8.7
 * characters, and only 2 of 25 common everyday words appear in it (plan/03-spikes.md,
 * S2b). So the mined lexicon tells us almost nothing about whether this engine is
 * pleasant to use for ordinary writing. This harness measures exactly that.
 *
 * Method: take real Odia, derive the roman a person would plausibly type by inverting
 * symbols.toml, feed that back through the engine, and check whether the original word
 * comes back. Deriving the roman rather than hand-authoring it keeps the test honest —
 * nobody gets to quietly pick romanizations the engine happens to like.
 *
 * Two registers are generated per word:
 *   careful  long vowels written out   bhaagya
 *   casual   long vowels collapsed     bhagya
 * Casual is how people actually type, so it is the number that matters.
 *
 *   npx tsx tools/eval/everyday.ts [--topk 5] [--verbose]
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createEngineFromDisk } from '@odia/core/node';
import { canonical } from '@odia/core/normalize';
import { casual, romanize } from './roundtrip.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SOURCE = resolve(ROOT, 'core/test/golden/everyday-source.txt');

const argv = process.argv.slice(2);
const TOPK = Number(argv[argv.indexOf('--topk') + 1]) || 5;
const VERBOSE = argv.includes('--verbose');

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const text = readFileSync(SOURCE, 'utf8')
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('#'))
  .join('\n');

// Odia block only; danda, comma and latin punctuation are separators.
const words = Array.from(
  new Set(
    (text.match(/[଀-୿]+/g) ?? []).map((w) => canonical(w)).filter((w) => w.length > 1),
  ),
);

const engine = createEngineFromDisk();

// Owner decisions that accept another word for an ambiguous derived roman key.
// See the file header. Each applied row is counted and printed.
const OVERRIDES = resolve(dirname(SOURCE), 'everyday-overrides.tsv');
const overrides = new Map<string, string[]>();
for (const line of (existsSync(OVERRIDES) ? readFileSync(OVERRIDES, 'utf8') : '').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [roman, register, odia] = line.split('\t');
  if (!roman || !register || !odia) throw new Error(`bad row in ${OVERRIDES}: ${line}`);
  const key = `${register}\t${roman}`;
  overrides.set(key, [...(overrides.get(key) ?? []), canonical(odia)]);
}
let overridesApplied = 0;

interface Row { odia: string; roman: string; rank: number }
const run = (mode: 'careful' | 'casual') => {
  const rows: Row[] = [];
  for (const odia of words) {
    let roman = romanize(odia);
    if (mode === 'casual') roman = casual(roman);
    if (!roman) continue;
    const cands = engine.transliterateWord(roman, TOPK).map((c) => canonical(c.text));
    let rank = cands.indexOf(odia);
    const accepted = overrides.get(`${mode}\t${roman}`);
    if (accepted !== undefined) {
      const ranks = [rank, ...accepted.map((w) => cands.indexOf(w))].filter((r) => r >= 0);
      const best = ranks.length ? Math.min(...ranks) : -1;
      if (best !== rank) overridesApplied += 1;
      rank = best;
    }
    rows.push({ odia, roman, rank });
  }
  return rows;
};

const pct = (n: number, d: number) => (d === 0 ? '  n/a' : `${((100 * n) / d).toFixed(1)}%`);

console.log(`\nEveryday Odia round-trip — ${words.length} distinct words from real text`);
console.log(`(source: core/test/golden/everyday-source.txt, top-${TOPK})\n`);
console.log('  register   top-1     top-3     top-5     miss');
console.log('  ' + '-'.repeat(48));

const results: Record<string, Row[]> = {};
for (const mode of ['careful', 'casual'] as const) {
  const rows = run(mode);
  results[mode] = rows;
  const t1 = rows.filter((r) => r.rank === 0).length;
  const t3 = rows.filter((r) => r.rank >= 0 && r.rank < 3).length;
  const t5 = rows.filter((r) => r.rank >= 0 && r.rank < TOPK).length;
  const miss = rows.filter((r) => r.rank < 0).length;
  console.log(
    `  ${mode.padEnd(10)} ${pct(t1, rows.length).padEnd(9)} ${pct(t3, rows.length).padEnd(9)} ` +
      `${pct(t5, rows.length).padEnd(9)} ${miss}/${rows.length}`,
  );
}

if (overrides.size > 0) {
  console.log(`\n  owner overrides applied: ${overridesApplied} (core/test/golden/everyday-overrides.tsv)`);
}

const misses = (results['casual'] ?? []).filter((r) => r.rank < 0);
if (misses.length) {
  console.log(`\n  Missed entirely (casual register), worst first — these are the work list:\n`);
  const show = VERBOSE ? misses : misses.slice(0, 25);
  for (const m of show) {
    const got = engine.transliterateWord(m.roman, 1)[0];
    console.log(`    ${m.roman.padEnd(16)} want ${m.odia.padEnd(14)} got ${got ? canonical(got.text) : '-'}`);
  }
  if (!VERBOSE && misses.length > show.length) {
    console.log(`    ... and ${misses.length - show.length} more (--verbose for all)`);
  }
}
console.log('');
