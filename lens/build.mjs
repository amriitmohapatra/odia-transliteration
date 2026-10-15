/**
 * Build the Odia Lens extension into lens/dist (load it unpacked, or zip it).
 *
 *   node lens/build.mjs            lens/dist, and lens/odia-lens.zip with --zip
 *   node lens/build.mjs --test     lens/dist-test: the same, plus host access to all
 *                                  sites, so lens/eval/lens-check.mjs can turn it on
 *                                  and take screenshots without a toolbar click
 *   node lens/build.mjs --mac      mac-lens/build/web: the Mac lens's results page
 *                                  (mac.js, index.html and dict/; no OCR files: the
 *                                  Mac app runs the tesseract program itself)
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
 *   dict/words.bin           gzip, core/data/indiccorp-words.tsv (OCR correction)
 *
 * Picture mode (V4.2) adds the OCR engine, all local (no remote code):
 *
 *   offscreen.html/.js       the OCR page (tesseract.js bundled)
 *   ocr/worker.min.js        tesseract.js worker            (node_modules/tesseract.js, Apache-2.0)
 *   ocr/tesseract-core-simd-lstm.wasm.js  Tesseract in WebAssembly (tesseract.js-core, Apache-2.0)
 *   ocr/ori.traineddata      Odia model, tessdata_fast      (lens/vendor, Apache-2.0; lens/PROVENANCE.md)
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
const mac = process.argv.includes('--mac');
const OUT = mac ? resolve(LENS, '../mac-lens/build/web') : resolve(LENS, test ? 'dist-test' : 'dist');
/** Definitions per chunk: about 300 KB of text, 80 KB gzipped. */
const CHUNK = 500;
const SEP = '\u0002';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(resolve(OUT, 'dict'), { recursive: true });
if (!mac) {
  mkdirSync(resolve(OUT, 'icons'), { recursive: true });
  mkdirSync(resolve(OUT, 'ocr'), { recursive: true });
}

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
  entryPoints: mac
    ? { mac: resolve(LENS, 'src/mac.ts') }
    : {
        background: resolve(LENS, 'src/background.ts'),
        content: resolve(LENS, 'src/content.ts'),
        offscreen: resolve(LENS, 'src/offscreen.ts'),
      },
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

writeFileSync(resolve(OUT, 'dict/words.bin'), gzipSync(readFileSync(resolve(ROOT, 'core/data/indiccorp-words.tsv')), { level: 9, mtime: 0 }));

if (mac) {
  writeFileSync(
    resolve(OUT, 'index.html'),
    '<!doctype html>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width">\n<title>Odia Lens</title>\n<body>\n<script src="mac.js"></script>\n',
  );
  console.log(`odia lens (Mac page): ${OUT}`);
  console.log(`  praharaj: ${count} keys in ${files} chunks of ${CHUNK}`);
  process.exit(0);
}

// The OCR engine and the Odia model.
const NM = resolve(ROOT, 'node_modules');
copyFileSync(resolve(NM, 'tesseract.js/dist/worker.min.js'), resolve(OUT, 'ocr/worker.min.js'));
copyFileSync(resolve(NM, 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js'), resolve(OUT, 'ocr/tesseract-core-simd-lstm.wasm.js'));
copyFileSync(resolve(LENS, 'vendor/ori.traineddata'), resolve(OUT, 'ocr/ori.traineddata'));
copyFileSync(resolve(NM, 'tesseract.js/LICENSE.md'), resolve(OUT, 'ocr/LICENSE-tesseract.js.md'));
copyFileSync(resolve(NM, 'tesseract.js-core/LICENSE'), resolve(OUT, 'ocr/LICENSE-tesseract.js-core.txt'));
copyFileSync(resolve(LENS, 'static/offscreen.html'), resolve(OUT, 'offscreen.html'));

copyFileSync(resolve(ROOT, 'Appv2/public/icons/icon-192.png'), resolve(OUT, 'icons/icon.png'));
const manifest = JSON.parse(readFileSync(resolve(LENS, 'static/manifest.json'), 'utf8'));
if (test) manifest.host_permissions = ['<all_urls>'];
writeFileSync(resolve(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`odia lens ${manifest.version}${test ? ' (test build)' : ''}: ${OUT}`);
console.log(`  praharaj: ${count} keys in ${files} chunks of ${CHUNK}`);
if (zip && !test) {
  const file = resolve(LENS, 'odia-lens.zip');
  rmSync(file, { force: true });
  execFileSync('zip', ['-qr', file, '.'], { cwd: OUT });
  console.log(`  ${file}`);
}
