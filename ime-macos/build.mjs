// Stage the input method's JavaScript and data for build.sh (V5, Stage C):
//   build/stage/engine.js   js/bridge.ts and the engine, one script for JavaScriptCore (defines OdiaIME)
//   build/stage/data/       the files of the web app's "Everyday" mode, as OdiaIME.load reads them
// Usage: node ime-macos/build.mjs   (build.sh runs it; needs `npm install` at the repository root)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(HERE, 'build/stage');
const CORE = resolve(ROOT, 'core/src');

/** Published name in Resources/data → source file. Names match bridge.ts `Files`. */
export const DATA = {
  'unified.toml': 'Appv2/rules/unified.toml',
  'itrans.toml': 'core/rules/itrans.toml',
  'lexicon-web.tsv': 'core/data/lexicon-web.tsv',
  'sanskrit-lexicon-web.tsv': 'Appv2/data/sanskrit-lexicon-web.tsv',
  'unigrams-web.tsv': 'core/data/unigrams-web.tsv',
  'sanskrit-unigrams-web.tsv': 'Appv2/data/sanskrit-unigrams-web.tsv',
  'bigrams-web.tsv': 'core/data/bigrams-web.tsv',
  'typed.tsv': 'core/data/typed.tsv',
  'nextword.tsv': 'core/data/nextword.tsv',
  'preferences.tsv': 'core/data/preferences.tsv',
  'labels.tsv': 'core/data/labels.tsv',
};

/** Bundle the bridge as one classic script (no modules in a bare JSContext). */
export async function bundle(write = true) {
  return build({
    entryPoints: [resolve(HERE, 'js/bridge.ts')],
    bundle: true,
    format: 'iife',
    platform: 'neutral',
    target: 'es2020',
    minify: false,
    legalComments: 'none',
    write,
    outfile: resolve(OUT, 'engine.js'),
    alias: { '@odia/core/types': `${CORE}/types.ts`, '@odia/core/normalize': `${CORE}/normalize.ts`, '@odia/core': `${CORE}/index.ts` },
    logLevel: 'error',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(resolve(OUT, 'data'), { recursive: true });
  await bundle();
  for (const [name, src] of Object.entries(DATA)) copyFileSync(resolve(ROOT, src), resolve(OUT, 'data', name));
  // JavaScriptCore takes strings: the gzip converter goes over as base64.
  writeFileSync(resolve(OUT, 'data/converter.bin.b64'), readFileSync(resolve(ROOT, 'core/data/converter.bin')).toString('base64'));
  const kb = (p) => Math.round(statSync(p).size / 1024);
  console.log(`ime-macos: engine.js ${kb(resolve(OUT, 'engine.js'))} KB, data in ${OUT}/data`);
}
