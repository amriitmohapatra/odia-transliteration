/*
 * Appv2 build config.
 *
 * A near-copy of web/vite.config.ts, deliberately: Appv2 must produce a build
 * with the same browser floor and the same failure modes as the app it upgrades.
 * The differences are only `root`, the stub path, and the extra `@odia/core/*`
 * subpath aliases the Sanskrit layer needs.
 *
 * Appv2 is NOT a member of the root package.json "workspaces" array — adding it
 * would mean editing an existing file. Aliasing @odia/core to a FILE PATH is
 * what makes that unnecessary: the import resolves with no node_modules link
 * and no workspace entry. Run from the repo root:
 *
 *     npx vite --config Appv2/vite.config.ts
 *     npx vite build --config Appv2/vite.config.ts
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const appDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * Edition, chosen at build time (owner, 2026-10-04): APP_EDITION=kids builds the
 * kids app, where abuses are removed completely (core filter level 'kids') and
 * there is no switch to turn that off. A separate build gives it its own URL.
 */
const edition: 'adult' | 'kids' = process.env.APP_EDITION === 'kids' ? 'kids' : 'adult';

/** Kids build: its own name in the page title and the install manifest. */
function editionPlugin(): Plugin {
  let outDir = '';
  return {
    name: 'odia-appv2-edition',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      if (edition !== 'kids') return html;
      return html
        .replace(/<title>[^<]*<\/title>/, '<title>Odia Phonetic Kids</title>')
        .replace(/(name="apple-mobile-web-app-title" content=")[^"]*"/, '$1Odia Kids"');
    },
    writeBundle() {
      if (edition !== 'kids') return;
      const file = join(outDir, 'manifest.webmanifest');
      if (!existsSync(file)) return;
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      manifest.name = 'Odia Phonetic Kids';
      manifest.short_name = 'Odia Kids';
      writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    },
  };
}

/** "V1 <commit>" for the "Report this word" text: Vercel's commit, else git, else "dev". */
function appVersion(): string {
  let sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { cwd: appDir, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      sha = 'dev';
    }
  }
  return `V1${edition === 'kids' ? ' kids' : ''} ${sha}`;
}
const repoRoot = resolve(appDir, '..');
const coreDir = resolve(repoRoot, 'core');

/*
 * Which build of the engine to bundle. Same three-step degradation as web/,
 * surfaced to the UI as `__CORE_MODE__`:
 *
 *   'src'   core/src/index.ts       — preferred: always fresh, no build order
 *   'dist'  core/dist/index.js      — tsc output, used when src is absent
 *   'stub'  Appv2/src/core-stub.ts  — verbatim passthrough, app runs degraded
 */
const coreMode: 'src' | 'dist' | 'stub' = existsSync(resolve(coreDir, 'src/index.ts'))
  ? 'src'
  : existsSync(resolve(coreDir, 'dist/index.js'))
    ? 'dist'
    : 'stub';

const coreEntry =
  coreMode === 'src'
    ? resolve(coreDir, 'src/index.ts')
    : coreMode === 'dist'
      ? resolve(coreDir, 'dist/index.js')
      : resolve(appDir, 'src/core-stub.ts');

const subpath = (name: string): string =>
  coreMode === 'dist'
    ? resolve(coreDir, `dist/${name}.js`)
    : resolve(coreDir, `src/${name}.ts`);

/**
 * Emit a service worker that precaches everything the build produced.
 * Hand-rolled rather than vite-plugin-pwa, for the same reason as web/: the
 * precache list is just "whatever landed in dist".
 */
function serviceWorkerPlugin(): Plugin {
  let outDir = resolve(appDir, 'dist');
  let publicDir = resolve(appDir, 'public');

  return {
    name: 'odia-appv2-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      publicDir = config.publicDir;
    },
    // writeBundle, not closeBundle: under Vite 7 closeBundle can run before the
    // output directory exists.
    writeBundle(_options, bundle) {
      const files = [
        ...Object.keys(bundle),
        ...walk(publicDir).map((absolute) => relative(publicDir, absolute)),
      ]
        .map((path) => path.split('\\').join('/'))
        .filter((path) => path !== 'sw.js' && !path.endsWith('.map'))
        .filter((path, index, all) => all.indexOf(path) === index)
        .sort();

      const revision = hash(files.join('|'));
      const precache = JSON.stringify(['./', ...files.map((f) => './' + f)], null, 2);

      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource(revision, precache), 'utf8');
      this.info(`service worker: ${files.length} precached files, revision ${revision}`);
    },
  };
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Small non-cryptographic hash; it only has to change when the file list does. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

function serviceWorkerSource(revision: string, precache: string): string {
  return `/* Generated by Appv2/vite.config.ts. Do not edit. */
'use strict';

// Cache Storage is shared by every app on the origin. This worker owns only the
// caches that start with PREFIX: it never deletes or reads another app's cache.
var PREFIX = 'odia-appv2-';
var CACHE = PREFIX + '${revision}';
var PRECACHE = ${precache};
var INDEX = new URL('./index.html', self.location).href;

function absolute(path) {
  return new URL(path, self.location).href;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Individually, not addAll: one 404 must not void the whole precache.
      return Promise.all(
        PRECACHE.map(function (path) {
          return cache.add(new Request(absolute(path), { cache: 'reload' })).catch(function () {});
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          return key === CACHE || key.indexOf(PREFIX) !== 0 ? undefined : caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(INDEX);
      }).then(function (hit) {
        return hit || fetch(request);
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(request, { ignoreSearch: true });
    }).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    })
  );
});
`;
}

/*
 * SINGLE_FILE=1 collapses the build into one .html you can AirDrop. A file://
 * page cannot fetch a sibling chunk, so dynamic imports must be inlined or the
 * app comes up with no vocabulary and silently falls back to rule-only output.
 */
const singleFile = process.env.SINGLE_FILE === '1';

/*
 * LEGACY=1 targets older Safari (macOS Big Sur), where the normal build dies
 * with "Object.hasOwn is not a function" — ES2022, needs Safari 15.4, and it
 * arrives via smol-toml rather than our own source.
 */
const legacy = process.env.LEGACY === '1';
const legacyPolyfillPath = resolve(repoRoot, 'web/legacy-polyfills.js');
const legacyPolyfills =
  legacy && existsSync(legacyPolyfillPath) ? readFileSync(legacyPolyfillPath, 'utf8') : '';

/*
 * Polyfills, prepended to the bundle.
 *
 * A build `target` only rewrites SYNTAX. It does not add missing built-in
 * METHODS, and esbuild injects no polyfills — so a modern method from a
 * dependency sails straight through and dies at runtime on an older browser.
 *
 * This is also why Appv2/src/preprocess.ts must not use a lookbehind regex:
 * lookbehind is a runtime RegExp feature (Safari 16.4+), and no `target` and no
 * polyfill can reach it. It uses a manual character scan instead.
 */
const POLYFILLS = `
if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    value: function (o, k) { return Object.prototype.hasOwnProperty.call(Object(o), k); },
    configurable: true, writable: true,
  });
}
if (!String.prototype.replaceAll) {
  Object.defineProperty(String.prototype, 'replaceAll', {
    value: function (search, replace) {
      if (Object.prototype.toString.call(search) === '[object RegExp]') {
        if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
        return this.replace(search, replace);
      }
      return this.split(search).join(replace);
    },
    configurable: true, writable: true,
  });
}
`.trim();

export default defineConfig({
  root: appDir,
  // Relative base, so the built app works from a subpath as well as from root.
  base: './',
  resolve: {
    alias: [
      { find: /^@odia\/core\/types$/, replacement: subpath('types') },
      { find: /^@odia\/core\/normalize$/, replacement: subpath('normalize') },
      { find: /^@odia\/core$/, replacement: coreEntry },
    ],
  },
  define: {
    __CORE_MODE__: JSON.stringify(coreMode),
    __APP_VERSION__: JSON.stringify(appVersion()),
    __APP_EDITION__: JSON.stringify(edition),
  },
  build: {
    outDir: legacy ? 'dist-legacy' : singleFile ? 'dist-single' : 'dist',
    // Handles SYNTAX only; missing METHODS are covered by POLYFILLS above.
    target: ['es2019', 'safari13'],
    cssTarget: 'safari13',
    // Assets stay separate files, except in the single-file build: a file://
    // page cannot fetch a sibling file, so the bundled Odia font and the
    // dictionary payloads (src/dictionary/*.bin) are inlined as data: URIs there.
    assetsInlineLimit: (file: string) =>
      singleFile && (file.endsWith('.woff2') || file.endsWith('.bin')),
    reportCompressedSize: true,
    chunkSizeWarningLimit: singleFile ? 100_000 : 2000,
    rollupOptions: {
      output: {
        banner: legacy ? `${legacyPolyfills}\n${POLYFILLS}` : POLYFILLS,
        ...(singleFile ? { inlineDynamicImports: true } : {}),
      },
    },
  },
  server: {
    // The engine, core rules and core data all live outside Appv2/, so the dev
    // server needs permission to read them.
    fs: { allow: [repoRoot] },
  },
  plugins: singleFile || legacy ? [editionPlugin()] : [editionPlugin(), serviceWorkerPlugin()],
});
