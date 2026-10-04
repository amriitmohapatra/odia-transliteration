/**
 * Inline the built PWA into ONE self-contained .html file.
 *
 * Why: a served PWA needs a web server and, for the phone, the Mac and the iPhone
 * on the same network at the same moment. A single file can just be AirDropped,
 * put in iCloud Drive, or mailed to yourself — then opened in Safari and added to
 * the Home Screen. Same engine, same lexicon, nothing to host.
 *
 * The service worker is deliberately dropped: it exists to cache network
 * requests, and a file:// page makes none. Everything is already in the file.
 *
 *   node web/scripts/make-single-file.mjs
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEGACY = process.env.LEGACY === '1';
const DIST = resolve(HERE, '..', LEGACY ? 'dist-legacy' : 'dist-single');
const OUT = resolve(HERE, '..', '..', 'docs', LEGACY ? 'odia-app-legacy.html' : 'odia-app.html');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('error: web/dist/index.html not found — run `SINGLE_FILE=1 npx vite build` in web/ first');
  process.exit(1);
}

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

/*
 * Legacy build: prepend the polyfills as a CLASSIC script.
 *
 * It must be a classic script, not a module: module scripts are deferred, so a
 * <script type="module"> polyfill would run AFTER the bundle it is meant to fix.
 * A classic script in <head> runs first, which is exactly what is needed.
 *
 * Vite's rollupOptions.output.banner was ignored in this configuration, so the
 * injection happens here where it can be verified.
 */
if (LEGACY) {
  const shims = readFileSync(resolve(HERE, '..', 'legacy-polyfills.js'), 'utf8');
  html = html.replace('</head>', `<script>\n${shims}\n</script>\n</head>`);
}

const read = (rel) => readFileSync(join(DIST, rel.replace(/^\.\//, '')), 'utf8');

// <script type="module" crossorigin src="./assets/x.js"></script>
html = html.replace(
  /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g,
  (whole, src) => {
    if (/^https?:/i.test(src)) return whole;
    try {
      return `<script type="module">\n${read(src)}\n</script>`;
    } catch {
      console.warn(`  ! could not inline script ${src}`);
      return whole;
    }
  },
);

// <link rel="stylesheet" href="./assets/x.css">
html = html.replace(
  /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g,
  (whole, href) => {
    if (/^https?:/i.test(href)) return whole;
    try {
      return `<style>\n${read(href)}\n</style>`;
    } catch {
      console.warn(`  ! could not inline stylesheet ${href}`);
      return whole;
    }
  },
);

// Icons and manifest become data: URIs so the Home Screen icon still works.
const dataUri = (rel, mime) => {
  const buf = readFileSync(join(DIST, rel.replace(/^\.\//, '')));
  return `data:${mime};base64,${buf.toString('base64')}`;
};

html = html.replace(/<link\b[^>]*\brel="apple-touch-icon"[^>]*\bhref="([^"]+)"[^>]*>/g,
  (whole, href) => {
    try {
      return `<link rel="apple-touch-icon" href="${dataUri(href, 'image/png')}">`;
    } catch { return whole; }
  });

html = html.replace(/<link\b[^>]*\brel="icon"[^>]*\bhref="([^"]+)"[^>]*>/g,
  (whole, href) => {
    try {
      const sizes = /sizes="([^"]+)"/.exec(whole)?.[1];
      const attr = sizes ? ` sizes="${sizes}"` : '';
      return `<link rel="icon" type="image/png"${attr} href="${dataUri(href, 'image/png')}">`;
    } catch { return whole; }
  });

// A manifest cannot be a data: URI on iOS, and a file:// page cannot fetch one.
// Home-Screen install still works from the apple-mobile-web-app-* meta tags.
html = html.replace(/<link\b[^>]*\brel="manifest"[^>]*>/g, '');

// NOTE: the service-worker registration is deliberately left in place. It is
// already feature-checked and .catch()-guarded in main.ts, so on file:// it
// fails silently and costs nothing. An earlier version of this script tried to
// strip it with a regex and deleted the entire inlined bundle instead, because
// the bundle happens to contain the word "serviceWorker".

writeFileSync(OUT, html, 'utf8');

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`  wrote ${OUT}`);
console.log(`  size  ${kb(statSync(OUT).size)} (one file, no external requests)`);

const leftovers = html.match(/(?:src|href)="\.\/(?:assets|icons)\/[^"]+"/g);
if (leftovers) {
  console.warn(`  ! ${leftovers.length} un-inlined reference(s) remain:`);
  for (const l of new Set(leftovers)) console.warn(`      ${l}`);
  process.exit(1);
}
console.log('  verified: no remaining references to ./assets or ./icons');
