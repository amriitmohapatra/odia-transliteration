/**
 * Inline the built Appv2 app into ONE self-contained .html file.
 *
 * Why: a served PWA needs a web server and, for the phone, the Mac and the
 * iPhone on the same network at the same moment. A single file can just be
 * AirDropped, put in iCloud Drive, or mailed to yourself — then opened in
 * Safari and added to the Home Screen. Same engine, same lexicons, nothing to
 * host.
 *
 * Forked from web/scripts/make-single-file.mjs. Two differences:
 *
 *   - it writes docs/odia-app-sanskrit.html, so the existing docs/odia-app.html
 *     is never overwritten. Appv2 exists precisely so nothing already shipped
 *     changes.
 *   - it reports the per-chunk sizes, because this build inlines BOTH lexicons
 *     and it is worth seeing what that costs.
 *
 * The service worker is deliberately dropped: it exists to cache network
 * requests, and a file:// page makes none. Everything is already in the file.
 *
 *   SINGLE_FILE=1 npx vite build --config Appv2/vite.config.ts
 *   node Appv2/scripts/make-single-file.mjs
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPV2 = resolve(HERE, '..');
const ROOT = resolve(APPV2, '..');
const LEGACY = process.env.LEGACY === '1';
const DIST = resolve(APPV2, LEGACY ? 'dist-legacy' : 'dist-single');
const OUT = resolve(
  ROOT,
  'docs',
  LEGACY
    ? 'odia-app-sanskrit-legacy.html'
    : process.env.APP_EDITION === 'kids'
      ? 'odia-app-kids.html'
      : 'odia-app-sanskrit.html',
);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error(
    `error: ${DIST}/index.html not found — run:\n` +
      '  SINGLE_FILE=1 npx vite build --config Appv2/vite.config.ts',
  );
  process.exit(1);
}

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

/*
 * Legacy build: prepend the polyfills as a CLASSIC script.
 *
 * It must be a classic script, not a module: module scripts are deferred, so a
 * <script type="module"> polyfill would run AFTER the bundle it is meant to fix.
 * A classic script in <head> runs first, which is exactly what is needed.
 */
if (LEGACY) {
  const shimPath = resolve(ROOT, 'web', 'legacy-polyfills.js');
  if (existsSync(shimPath)) {
    html = html.replace('</head>', `<script>\n${readFileSync(shimPath, 'utf8')}\n</script>\n</head>`);
  }
}

const read = (rel) => readFileSync(join(DIST, rel.replace(/^\.\//, '')), 'utf8');

// Report what is about to be folded in, largest first.
const assetsDir = join(DIST, 'assets');
if (existsSync(assetsDir)) {
  const rows = readdirSync(assetsDir)
    .map((name) => ({ name, size: statSync(join(assetsDir, name)).size }))
    .sort((a, b) => b.size - a.size);
  console.log('  inlining:');
  for (const r of rows) console.log(`    ${(r.size / 1024).toFixed(0).padStart(6)} KB  ${r.name}`);
}

// <script type="module" crossorigin src="./assets/x.js"></script>
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (whole, src) => {
  if (/^https?:/i.test(src)) return whole;
  try {
    return `<script type="module">\n${read(src)}\n</script>`;
  } catch {
    console.warn(`  ! could not inline script ${src}`);
    return whole;
  }
});

// <link rel="stylesheet" href="./assets/x.css">
html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g, (whole, href) => {
  if (/^https?:/i.test(href)) return whole;
  try {
    return `<style>\n${read(href)}\n</style>`;
  } catch {
    console.warn(`  ! could not inline stylesheet ${href}`);
    return whole;
  }
});

// Icons become data: URIs so the Home Screen icon still works.
const dataUri = (rel, mime) => {
  const buf = readFileSync(join(DIST, rel.replace(/^\.\//, '')));
  return `data:${mime};base64,${buf.toString('base64')}`;
};

html = html.replace(
  /<link\b[^>]*\brel="apple-touch-icon"[^>]*\bhref="([^"]+)"[^>]*>/g,
  (whole, href) => {
    try {
      return `<link rel="apple-touch-icon" href="${dataUri(href, 'image/png')}">`;
    } catch {
      return whole;
    }
  },
);

html = html.replace(/<link\b[^>]*\brel="icon"[^>]*\bhref="([^"]+)"[^>]*>/g, (whole, href) => {
  try {
    const sizes = /sizes="([^"]+)"/.exec(whole)?.[1];
    const attr = sizes ? ` sizes="${sizes}"` : '';
    return `<link rel="icon" type="image/png"${attr} href="${dataUri(href, 'image/png')}">`;
  } catch {
    return whole;
  }
});

// A manifest cannot be a data: URI on iOS, and a file:// page cannot fetch one.
// Home-Screen install still works from the apple-mobile-web-app-* meta tags.
html = html.replace(/<link\b[^>]*\brel="manifest"[^>]*>/g, '');

// NOTE: the service-worker registration is deliberately left in place. It is
// already feature-checked and .catch()-guarded in main.ts, so on file:// it
// fails silently and costs nothing. An earlier version of the web/ script tried
// to strip it with a regex and deleted the entire inlined bundle instead,
// because the bundle happens to contain the word "serviceWorker".

writeFileSync(OUT, html, 'utf8');

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`\n  wrote ${OUT}`);
console.log(`  size  ${kb(statSync(OUT).size)} (one file, no external requests)`);

const leftovers = html.match(/(?:src|href)="\.\/(?:assets|icons)\/[^"]+"/g);
if (leftovers) {
  console.warn(`  ! ${leftovers.length} un-inlined reference(s) remain:`);
  for (const l of new Set(leftovers)) console.warn(`      ${l}`);
  process.exit(1);
}
console.log('  verified: no remaining references to ./assets or ./icons');
