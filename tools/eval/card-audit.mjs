// Card audit (2026-10-16, after the owner's Sambad ePaper test): every Odia word of a text
// through the Odia Lens's own lookup, with a trust flag per card and whether the typing app
// knows the word. Text in, TSV out; no text is stored in the repository.
//
//   node lens/build.mjs                                  # the lens dictionary files (lens/dist)
//   node tools/eval/card-audit.mjs INPUT [OUT.tsv] [--contexts N]
//
// INPUT: plain text, or JSON lines with "title"/"paragraphs" (web articles) or "lines"
// (ePaper OCR). OUT columns: word, count, previous, flag, typeable, meaning, source,
// formation, contexts (joined with " | "; N per word, default 2; 0 leaves them out).
// A summary of flags, by words and by occurrences, goes to stderr.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const n = args.indexOf('--contexts');
const contexts = n >= 0 ? Number(args.splice(n, 2)[1]) : 2;
const [input, output] = args;
if (!input) {
  console.error('usage: node tools/eval/card-audit.mjs INPUT [OUT.tsv] [--contexts N]');
  process.exit(2);
}

const out = join(mkdtempSync(join(tmpdir(), 'card-audit-')), 'entry.mjs');
const core = resolve(ROOT, 'core/src');
await build({
  entryPoints: [resolve(ROOT, 'tools/eval/card-audit-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  loader: { '.tsv': 'text' },
  alias: { '@odia/core/normalize': `${core}/normalize.ts`, '@odia/core/types': `${core}/types.ts`, '@odia/core': `${core}/index.ts` },
  logLevel: 'error',
});
const { audit } = await import(pathToFileURL(out).href);
const rows = await audit(readFileSync(input, 'utf8'), ROOT, contexts);

const tsv = ['word\tcount\tprevious\tflag\ttypeable\tmeaning\tsource\tformation\tcontexts']
  .concat(rows.map((r) => [r.word, r.count, r.previous, r.flag, r.typeable ? 'yes' : 'no', r.meaning, r.source, r.formation, r.contexts.join(' | ')].join('\t')))
  .join('\n');
if (output) writeFileSync(output, tsv + '\n');
else console.log(tsv);

const words = new Map();
const tokens = new Map();
for (const r of rows) {
  words.set(r.flag, (words.get(r.flag) ?? 0) + 1);
  tokens.set(r.flag, (tokens.get(r.flag) ?? 0) + r.count);
}
const totalT = rows.reduce((s, r) => s + r.count, 0);
const notTypeable = rows.filter((r) => !r.typeable).reduce((s, r) => s + r.count, 0);
console.error(`${rows.length} words, ${totalT} occurrences`);
for (const f of ['ok', 'parts', 'shorter', 'approximate', 'praharaj', 'none']) {
  console.error(`  ${f.padEnd(12)} ${String(words.get(f) ?? 0).padStart(6)} words  ${(100 * (tokens.get(f) ?? 0) / totalT).toFixed(1).padStart(5)}% of occurrences`);
}
console.error(`  not in the typing app's word list: ${(100 * notTypeable / totalT).toFixed(1)}% of occurrences`);
