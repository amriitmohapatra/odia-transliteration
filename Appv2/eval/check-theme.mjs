/**
 * Catch the bug class that made the app unreadable in dark mode.
 *
 * The symptom was a white candidate bar floating in a dark UI, with dark-mode
 * muted-grey text on it. The cause was one character of nothing:
 *
 *     background: var(--panel, #fff);      <-- --panel was never defined
 *
 * CSS custom properties fail SILENTLY. An undefined token just uses its
 * fallback, forever, in every colour scheme — and since fallbacks get authored
 * while looking at light mode, they are always the light value. No browser
 * warns, no build step complains, and it only shows up when the sun goes down.
 *
 * Three rules, checked against every stylesheet passed in:
 *
 *   1. every `var(--x)` names a token that is actually defined
 *   2. every colour token defined in :root is also defined in the dark block,
 *      or it silently keeps its light value
 *   3. no literal white/black as a `color:` or `background:` outside :root —
 *      those cannot adapt, which is exactly how white-on-lavender happened on
 *      the active candidate and white-on-mint on the toast
 *
 *     node Appv2/eval/check-theme.mjs [file.css[+companion.css] ...]
 *
 * Defaults to checking both Appv2's and web's stylesheets, because they are the
 * same file and the bug shipped in both. A `+` joins stylesheets that load on
 * the same page and are checked as one: Appv2's dictionary overlay uses tokens
 * that style.css defines, so `style.css+dictionary/overlay.css` is checked
 * together (V1, 2026-10-04).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const DEFAULTS = ['Appv2/src/style.css+Appv2/src/dictionary/overlay.css', 'web/src/style.css'];
const targets = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS)
  .map((spec) => spec.split('+').map((p) => resolve(ROOT, p)).filter((p) => existsSync(p)))
  .filter((paths) => paths.length > 0);

/**
 * Tokens that are not colours, so rule 2 does not apply to them. The V1 design
 * (plan/design/v1-ux-proposal.md 4.3-4.4) adds size and spacing scales:
 * --fs-*, --space-*, --radius-*, --tap-*.
 */
const NON_COLOUR = /^--(radius|tap|odia-scale|odia-font|ui-font|mono-font|fs-[a-z0-9-]+|space-[a-z0-9-]+|radius-[a-z0-9-]+|tap-[a-z0-9-]+)$/;

/** Literal colours that cannot possibly adapt to a colour scheme. */
const UNADAPTIVE = /#fff\b|#ffffff\b|#000\b|#000000\b|\bwhite\b|\bblack\b/i;

let failures = 0;

function fail(file, message) {
  console.log(`  FAIL  ${file}`);
  console.log(`        ${message.split('\n').join('\n        ')}`);
  failures += 1;
}

/** The body of `:root { ... }` blocks, split into light and dark. */
function rootBlocks(css) {
  const light = [];
  const dark = [];
  const re = /(@media[^{]*prefers-color-scheme:\s*dark[^{]*\{\s*)?:root\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    (m[1] ? dark : light).push(m[2]);
  }
  return { light: light.join('\n'), dark: dark.join('\n') };
}

function tokensIn(text) {
  return new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

for (const paths of targets) {
  const file = paths.map((p) => relative(ROOT, p)).join(' + ');
  const css = paths.map((p) => readFileSync(p, 'utf8')).join('\n');
  const { light, dark } = rootBlocks(css);

  const defined = tokensIn(css);
  const lightTokens = tokensIn(light);
  const darkTokens = tokensIn(dark);

  // ---------------------------------------------------------------- rule 1
  const undefinedUses = new Map();
  for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,[^)]*)?\)/g)) {
    if (!defined.has(m[1])) {
      undefinedUses.set(m[1], (undefinedUses.get(m[1]) ?? 0) + 1);
    }
  }
  for (const [name, count] of undefinedUses) {
    fail(
      file,
      `${name} is used ${count}x but never defined.\n` +
        `Its fallback applies in EVERY colour scheme, which is how the\n` +
        `candidate bar stayed white in dark mode.`,
    );
  }

  // ---------------------------------------------------------------- rule 2
  for (const name of lightTokens) {
    if (NON_COLOUR.test(name)) continue;
    if (!darkTokens.has(name)) {
      fail(
        file,
        `${name} is defined for light mode but not in the\n` +
          `prefers-color-scheme: dark block, so it keeps its light value there.`,
      );
    }
  }

  // ---------------------------------------------------------------- rule 3
  // Strip the :root blocks and comments first: a literal colour is fine as a
  // token VALUE, it is only a problem when applied to an element directly.
  const body = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(@media[^{]*prefers-color-scheme:\s*dark[^{]*\{\s*)?:root\s*\{[^}]*\}/g, '');

  for (const m of body.matchAll(/(^|\n)\s*(color|background|background-color)\s*:\s*([^;]+);/g)) {
    const value = m[3].trim();
    // A literal inside var(..., fallback) is caught by rule 1 if the token is
    // undefined, and is harmless if it is defined. Only bare literals here.
    if (value.startsWith('var(')) continue;
    if (UNADAPTIVE.test(value)) {
      fail(
        file,
        `\`${m[2]}: ${value}\` is a fixed colour on an element.\n` +
          `It cannot flip with the colour scheme. Use a token — --accent-text\n` +
          `already means "readable text on a saturated fill" in both modes.`,
      );
    }
  }

  if (failures === 0) console.log(`  ok    ${file}`);
}

if (targets.length === 0) {
  console.log('  no stylesheets found to check');
}

console.log();
if (failures > 0) {
  console.log(`${failures} theme problem(s). Dark mode will be wrong.`);
  process.exit(1);
}
console.log('Theme tokens are complete and every element colour can adapt.');
