/**
 * Build the Odia Lens extension into lens/dist (load it unpacked, or zip it).
 *
 *   node lens/build.mjs            lens/dist, and lens/odia-lens.zip with --zip
 *   node lens/build.mjs --test     lens/dist-test: the same, plus host access to
 *                                  http://127.0.0.1/* so lens/eval/lens-check.mjs
 *                                  can turn it on without a toolbar click
 *
 * It bundles background.ts and content.ts (classic scripts: executeScript
 * injects a classic script) and packs the dictionary the app already ships
 * (Appv2/src/dictionary/*.bin; sources and checksums in
 * Odia_Sanskrit_Appv2/PROVENANCE.md). The Praharaj payload is split here, so
 * the background worker never unpacks the whole 24 MB text:
 *
 *   dict/praharaj-keys.bin   gzip, the sorted keys, one per line
 *   dict/praharaj-NNN.bin    gzip, JSON array of the definitions of keys
 *                            [NNN*chunk, (NNN+1)*chunk)
 *   dict/index.json          { count, chunk, files }
 *   dict/modern.bin, dict/origin.bin   copied as they are (small)
 *
 * No Desh data goes into the extension.
 */

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const LENS = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(LENS, '..');
const test = process.argv.includes('--test');
const zip = process.argv.includes('--zip');
const OUT = resolve(LENS, test ? 'dist-test' : 'dist');
/** Definitions per chunk: about 300 KB of text, 80 KB gzipped. */
const CHUNK = 500;
const SEP = '\u0002';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(resolve(OUT, 'dict'), { recursive: true });
mkdirSync(resolve(OUT, 'icons'), { recursive: true });

// @odia/core and its subpaths, as Appv2/vite.config.ts maps them.
const coreAlias = {
  name: 'odia-core',
  setup(b) {
    b.onResolve({ filter: /^@odia\/core(\/.*)?$/ }, (args) => {
      const sub = args.path.slice('@odia/core'.length).replace(/^\//, '');
      return { path: resolve(ROOT, 'core/src', `${sub || 'index'}.ts`) };
    });
  },
};

await build({
  entryPoints: { background: resolve(LENS, 'src/background.ts'), content: resolve(LENS, 'src/content.ts') },
  outdir: OUT,
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  loader: { '.tsv': 'text' },
  plugins: [coreAlias],
  legalComments: 'inline',
  logLevel: 'warning',
});

// The Praharaj payload: N SEP keys SEP lens SEP defs (Appv2/src/dictionary/lookup.ts).
const text = gunzipSync(readFileSync(resolve(ROOT, 'Appv2/src/dictionary/praharaj.bin'))).toString('utf8');
const a = text.indexOf(SEP);
const b = text.indexOf(SEP, a + 1);
const c = text.indexOf(SEP, b + 1);
const count = Number.parseInt(text.slice(0, a), 10);
const keys = text.slice(a + 1, b).split('\n');
const lens = text.slice(b + 1, c).split(',').map(Number);
const defs = text.slice(c + 1);
if (keys.length !== count || lens.length !== count) throw new Error('praharaj.bin: count mismatch');
const gz = (s) => gzipSync(Buffer.from(s, 'utf8'), { level: 9, mtime: 0 });
writeFileSync(resolve(OUT, 'dict/praharaj-keys.bin'), gz(keys.join('\n')));
let offset = 0;
let files = 0;
for (let first = 0; first < count; first += CHUNK) {
  const part = [];
  for (let i = first; i < Math.min(count, first + CHUNK); i++) {
    part.push(defs.slice(offset, offset + lens[i]));
    offset += lens[i];
  }
  writeFileSync(resolve(OUT, `dict/praharaj-${String(files).padStart(3, '0')}.bin`), gz(JSON.stringify(part)));
  files++;
}
writeFileSync(resolve(OUT, 'dict/index.json'), JSON.stringify({ count, chunk: CHUNK, files }));
for (const name of ['modern.bin', 'origin.bin']) {
  copyFileSync(resolve(ROOT, 'Appv2/src/dictionary', name), resolve(OUT, 'dict', name));
}

copyFileSync(resolve(ROOT, 'Appv2/public/icons/icon-192.png'), resolve(OUT, 'icons/icon.png'));
const manifest = JSON.parse(readFileSync(resolve(LENS, 'static/manifest.json'), 'utf8'));
if (test) manifest.host_permissions = ['http://127.0.0.1/*'];
writeFileSync(resolve(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`odia lens ${manifest.version}${test ? ' (test build)' : ''}: ${OUT}`);
console.log(`  praharaj: ${count} keys in ${files} chunks of ${CHUNK}`);
if (zip && !test) {
  const file = resolve(LENS, 'odia-lens.zip');
  rmSync(file, { force: true });
  execFileSync('zip', ['-qr', file, '.'], { cwd: OUT });
  console.log(`  ${file}`);
}
