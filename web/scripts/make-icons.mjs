/**
 * Regenerate the PWA icons: an ଓ (U+0B13) on the accent colour.
 *
 * The icons are committed, so this only needs running when the mark or the
 * colour changes. Rendering is done with ImageMagick against a system Odia
 * font — there is no pure-JS way to rasterise an Indic glyph without pulling in
 * a font engine, and this project does not carry dependencies it does not need.
 *
 *   node scripts/make-icons.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');

const GLYPH = 'ଓ'; // ଓ ODIA LETTER O
const BACKGROUND = '#5B2A9A';
const FOREGROUND = 'white';

const FONT_CANDIDATES = [
  '/System/Library/Fonts/Supplemental/Oriya Sangam MN.ttc',
  '/Library/Fonts/NotoSansOriya-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Kalinga.ttf',
];

/** size, output name, glyph height as a fraction of the canvas. */
const ICONS = [
  [512, 'icon-512.png', 0.66],
  [192, 'icon-192.png', 0.66],
  // Maskable icons are cropped to a circle by the platform, so the glyph has to
  // sit inside the inner 80% safe zone.
  [512, 'icon-maskable-512.png', 0.45],
  // iOS applies its own corner mask and never honours transparency here.
  [180, 'apple-touch-icon-180.png', 0.66],
];

const font = FONT_CANDIDATES.find((path) => existsSync(path));
if (!font) {
  console.error('No Odia-capable font found. Tried:\n  ' + FONT_CANDIDATES.join('\n  '));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

for (const [size, name, scale] of ICONS) {
  const target = join(outDir, name);
  execFileSync('magick', [
    '-size',
    `${size}x${size}`,
    `xc:${BACKGROUND}`,
    '-font',
    font,
    '-pointsize',
    String(Math.round(size * scale)),
    '-fill',
    FOREGROUND,
    '-gravity',
    'center',
    // The Odia O sits high in its em box; nudge it back to optical centre.
    '-annotate',
    `+0+${Math.round(size * 0.02)}`,
    GLYPH,
    '-alpha',
    'remove',
    '-depth',
    '8',
    '-strip',
    target,
  ]);
  console.log(`wrote ${name} (${size}x${size})`);
}
