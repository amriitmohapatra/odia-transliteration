/**
 * Reachability probe: can the engine (rules only, lexicon disabled where noted)
 * produce a given Odia target from a given roman input?
 *
 * Reads probe cases from a TSV on argv[2]: roman <TAB> targetOdia <TAB> label
 * Prints: label <TAB> roman <TAB> target <TAB> rank(or -1) <TAB> top1
 */
import { readFileSync } from 'node:fs';
import { createEngineFromDisk } from '../../../core/src/node.js';
import { canonical } from '../../../core/src/normalize.js';

const engine = createEngineFromDisk({});
const K = 40;

const lines = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean);
for (const line of lines) {
  const [roman, target, label = ''] = line.split('\t');
  const want = canonical(target);
  const res = engine.transliterate(roman, { topk: K });
  const word = res.words[0];
  const cands = word ? word.candidates.map((c) => canonical(c.text)) : [];
  const rank = cands.indexOf(want);
  const top1 = cands[0] ?? '';
  process.stdout.write(`${label}\t${roman}\t${target}\t${rank}\t${top1}\n`);
}
