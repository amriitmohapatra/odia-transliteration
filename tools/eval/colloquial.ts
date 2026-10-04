/**
 * Colloquial Odia: spoken forms, slang and dialect words, typed casually.
 *
 *   npx tsx tools/eval/colloquial.ts [--topk 5]
 *
 * Reads core/test/golden/colloquial.tsv. Reports top-1 / top-3 / top-5 by
 * register and lists every miss, which is the work list. Report only: it never
 * fails, because the set is an unvalidated seed until the owner checks it
 * (plan/06-owner-followups.md, C-3). Never average it with the other sets.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createEngineFromDisk } from '@odia/core/node';
import { canonical } from '@odia/core/normalize';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '../../core/test/golden/colloquial.tsv');
const argv = process.argv.slice(2);
const TOPK = Number(argv[argv.indexOf('--topk') + 1]) || 5;

interface Row { roman: string; odia: string; register: string; rank: number; got: string }

const engine = createEngineFromDisk();
const rows: Row[] = [];
for (const line of readFileSync(FILE, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [roman, odia, register] = line.split('\t');
  if (!roman || !odia || !register) throw new Error(`bad row in ${FILE}: ${line}`);
  const cands = engine.transliterateWord(roman, TOPK).map((c) => canonical(c.text));
  rows.push({ roman, odia: canonical(odia), register, rank: cands.indexOf(canonical(odia)), got: cands[0] ?? '-' });
}

const pct = (n: number, d: number) => (d === 0 ? '  n/a' : `${((100 * n) / d).toFixed(1)}%`);
console.log(`\nColloquial Odia — ${rows.length} rows, top-${TOPK}`);
console.log('STATUS: unvalidated seed. Numbers are indicative until the owner checks the set.\n');
console.log('  register   rows   top-1     top-3     top-5');
console.log('  ' + '-'.repeat(46));
for (const register of [...new Set(rows.map((r) => r.register))]) {
  const rs = rows.filter((r) => r.register === register);
  const at = (k: number) => rs.filter((r) => r.rank >= 0 && r.rank < k).length;
  console.log(
    `  ${register.padEnd(10)} ${String(rs.length).padStart(4)}   ${pct(at(1), rs.length).padEnd(9)} ` +
      `${pct(at(3), rs.length).padEnd(9)} ${pct(at(TOPK), rs.length)}`,
  );
}
const misses = rows.filter((r) => r.rank !== 0);
if (misses.length) {
  console.log('\n  Not first (work list):');
  for (const m of misses) {
    console.log(`    ${m.roman.padEnd(10)} want ${m.odia.padEnd(10)} rank ${m.rank < 0 ? '-' : m.rank + 1}   got ${m.got}`);
  }
}
console.log('');
