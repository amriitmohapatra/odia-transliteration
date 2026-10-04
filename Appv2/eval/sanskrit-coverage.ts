/**
 * Is every Sanskrit-relevant character actually reachable?
 *
 * This exists because tools/eval/coverage.ts answers that question wrongly. Its
 * gap check builds the set of producible code points by iterating the
 * CHARACTERS of each rule option's text (coverage.ts:276), so the conjunct
 * "ଜ୍ଞ" credits ଜ, ୍ AND ଞ individually — and standalone ଞ, which no rule can
 * produce at all, is reported as covered. That false negative is why the hole
 * went unnoticed for so long.
 *
 * So this harness never inspects the rule tables. It RUNS THE ENGINE and asks
 * whether the expected word actually comes back.
 *
 * Four passes:
 *   S-A  every probe in golden/sanskrit-probes.tsv returns its expected word
 *   S-B  every required code point is covered by a passing probe, or is on the
 *        insert palette — and the report says which, because "you can type it"
 *        and "you can tap it" are different promises
 *   S-C  the pipeline-level marks (। ॥ ଽ ଃ), which are not word candidates and
 *        therefore cannot be tested by a word probe at all
 *   S-D  the nukta invariant, by code point
 *
 * Exits non-zero if anything required is unreachable.
 *
 *     npx tsx Appv2/eval/sanskrit-coverage.ts [--topk 12] [--profile sloka]
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonical, codepoints } from '../../core/src/normalize.js';
import { loadPalette } from '../src/palette.js';
import { preprocess, PREPROCESS_ALL } from '../src/preprocess.js';
import { isProfileId, type ProfileId } from '../src/profiles.js';
import { APPV2, engineFor, pct, rule } from './lib.js';

const args = process.argv.slice(2);
const TOPK = Number(valueOf('--topk') ?? 12);
const PROFILE: ProfileId = (() => {
  const raw = valueOf('--profile') ?? 'sloka';
  if (!isProfileId(raw)) throw new Error(`unknown profile "${raw}"`);
  return raw;
})();

function valueOf(flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
}

/**
 * What Sanskritized Odia must be able to produce.
 *
 * Deliberately NOT the whole Odia block. U+0B55 is the Kui overline, U+0B56/57
 * are pieces of decomposed ୈ/ୌ that Unicode says to write precomposed, and
 * U+0B72-77 are fraction signs — none of them liturgical. See palette.toml.
 */
const REQUIRED: readonly { cp: number; name: string }[] = [
  { cp: 0x0b0b, name: 'ଋ  vocalic r' },
  { cp: 0x0b43, name: 'ୃ  vocalic r sign' },
  { cp: 0x0b60, name: 'ୠ  vocalic rr' },
  { cp: 0x0b44, name: 'ୄ  vocalic rr sign' },
  { cp: 0x0b0c, name: 'ଌ  vocalic l' },
  { cp: 0x0b62, name: 'ୢ  vocalic l sign' },
  { cp: 0x0b61, name: 'ୡ  vocalic ll' },
  { cp: 0x0b63, name: 'ୣ  vocalic ll sign' },
  { cp: 0x0b01, name: 'ଁ  candrabindu' },
  { cp: 0x0b02, name: 'ଂ  anusvara' },
  { cp: 0x0b03, name: 'ଃ  visarga' },
  { cp: 0x0b3d, name: 'ଽ  avagraha' },
  { cp: 0x0b3c, name: '଼  nukta' },
  { cp: 0x0b4d, name: '୍  virama' },
  { cp: 0x0b19, name: 'ଙ  nga' },
  { cp: 0x0b1e, name: 'ଞ  nya' },
  { cp: 0x0b36, name: 'ଶ  sha' },
  { cp: 0x0b37, name: 'ଷ  ssa' },
  { cp: 0x0b33, name: 'ଳ  lla' },
  { cp: 0x0b71, name: 'ୱ  wa' },
  { cp: 0x0b5f, name: 'ୟ  yya' },
  { cp: 0x0b2f, name: 'ଯ  ya' },
  { cp: 0x0964, name: '।  danda' },
  { cp: 0x0965, name: '॥  double danda' },
  { cp: 0x0951, name: '॑  udatta (Vedic)' },
  { cp: 0x0952, name: '॒  anudatta (Vedic)' },
];

interface Probe {
  roman: string;
  expected: string;
  label: string;
}

function readProbes(): Probe[] {
  const path = resolve(APPV2, 'eval/golden/sanskrit-probes.tsv');
  const out: Probe[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim().length === 0 || line.startsWith('#')) continue;
    const [roman, expected, label] = line.split('\t');
    if (roman === undefined || expected === undefined) continue;
    out.push({
      roman: roman.trim(),
      expected: canonical(expected.trim()),
      label: (label ?? '').trim(),
    });
  }
  return out;
}

function main(): number {
  const engine = engineFor(PROFILE);
  const probes = readProbes();
  let failures = 0;

  console.log(`Sanskrit coverage — profile "${PROFILE}", top-${TOPK}`);

  /* ---------------------------------------------------------- pass S-A */
  rule('S-A  probes: does the expected word come back?');

  const reached = new Set<number>();
  // Code points seen ONLY as part of a conjunct, i.e. glued to a virama.
  //
  // This is the distinction tools/eval/coverage.ts misses. Crediting ଞ because
  // the engine produced ଯଜ୍ଞ is the same over-claim as crediting it because the
  // rule text "ଜ୍ଞ" contains it: in both cases bare ଞ remains untypeable. So
  // record HOW each code point was reached, not just that it was.
  const conjunctOnly = new Set<number>();
  let hit = 0;
  let top1 = 0;

  const VIRAMA_CP = 0x0b4d;

  for (const probe of probes) {
    const candidates = engine.transliterateWord(probe.roman, TOPK);
    const at = candidates.findIndex((c) => c.text === probe.expected);

    if (at === 0) top1 += 1;
    if (at >= 0) {
      hit += 1;
      const chars = [...probe.expected];
      chars.forEach((ch, i) => {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp === VIRAMA_CP) {
          reached.add(cp);
          return;
        }
        const bound =
          (chars[i - 1]?.codePointAt(0) ?? 0) === VIRAMA_CP ||
          (chars[i + 1]?.codePointAt(0) ?? 0) === VIRAMA_CP;
        if (bound) {
          if (!reached.has(cp)) conjunctOnly.add(cp);
        } else {
          reached.add(cp);
          conjunctOnly.delete(cp);
        }
      });
    } else {
      failures += 1;
      console.log(`  MISS  ${probe.roman.padEnd(14)} want ${probe.expected}   ${probe.label}`);
      console.log(`        want  ${codepoints(probe.expected)}`);
      console.log(
        `        got   ${candidates.slice(0, 5).map((c) => c.text).join('  ') || '(nothing)'}`,
      );
    }
  }

  console.log(
    `\n  ${hit}/${probes.length} reachable (${pct(hit, probes.length)}), ` +
      `${top1} at rank 1 (${pct(top1, probes.length)})`,
  );
  console.log('  REACHABLE must be 100%. TOP-1 need not be, and should not be:');
  console.log('  "sa" is genuinely ସ, ଶ or ଷ — choosing is the candidate list\'s job.');

  /* ---------------------------------------------------------- pass S-C */
  // Runs before S-B because the marks it proves feed S-B's covered set.
  rule('S-C  pipeline marks: not word candidates, so probed through the whole path');

  const pipeline: { input: string; contains: string; what: string }[] = [
    { input: 'balam |', contains: '।', what: 'danda from "|"' },
    { input: 'balam ||', contains: '॥', what: 'double danda from "||"' },
    { input: "so'ham", contains: 'ଽ', what: 'avagraha from "\'"' },
    { input: 'du:kha', contains: 'ଃ', what: 'visarga from ":"' },
    { input: 'namah', contains: 'ଃ', what: 'visarga from "h"' },
  ];

  for (const step of pipeline) {
    const out = engine.transliterate(preprocess(step.input, PREPROCESS_ALL), { topk: 5 }).text;
    const ok = out.includes(step.contains);
    if (ok) reached.add(step.contains.codePointAt(0) ?? 0);
    else failures += 1;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'}  ${step.input.padEnd(12)} -> ${out.padEnd(18)} ${step.what}`,
    );
  }

  /* ---------------------------------------------------------- pass S-B */
  rule('S-B  every required code point: typeable, on the palette, or missing?');

  const palette = new Set<number>();
  try {
    for (const group of loadPalette(readFileSync(resolve(APPV2, 'rules/palette.toml'), 'utf8'))) {
      for (const entry of group.entries) {
        for (const ch of entry.text) palette.add(ch.codePointAt(0) ?? 0);
      }
    }
  } catch (error) {
    console.log(`  palette failed to load: ${String(error)}`);
    failures += 1;
  }

  let typeable = 0;
  let inConjunct = 0;
  let paletteOnly = 0;

  for (const req of REQUIRED) {
    const hex = `U+${req.cp.toString(16).toUpperCase().padStart(4, '0')}`;
    const canType = reached.has(req.cp);
    const onlyConjunct = !canType && conjunctOnly.has(req.cp);
    const canTap = palette.has(req.cp);

    if (canType) {
      typeable += 1;
      console.log(`  type     ${hex}  ${req.name}`);
    } else if (onlyConjunct && canTap) {
      inConjunct += 1;
      console.log(`  conjunct ${hex}  ${req.name}   (bare form: palette)`);
    } else if (onlyConjunct) {
      failures += 1;
      console.log(`  CONJ     ${hex}  ${req.name}   <- only inside a conjunct, and NOT on the palette`);
    } else if (canTap) {
      paletteOnly += 1;
      console.log(`  palette  ${hex}  ${req.name}`);
    } else {
      failures += 1;
      console.log(`  NONE     ${hex}  ${req.name}   <- unreachable by any route`);
    }
  }

  console.log(
    `\n  ${typeable} typeable, ${inConjunct} conjunct-only (bare form on the palette), ` +
      `${paletteOnly} palette-only.`,
  );
  console.log('  Three different promises, kept apart on purpose:');
  console.log('    type      you can type it and it comes back standalone');
  console.log('    conjunct  the engine produces it inside a cluster (ଞ in ଜ୍ଞ), but the');
  console.log('              bare letter needs the palette. This is the distinction');
  console.log('              tools/eval/coverage.ts collapses, which is why bare ଞ being');
  console.log('              unreachable went unnoticed there.');
  console.log('    palette   tap-only. A real answer for a mark used twice a year: it');
  console.log('              should not cost a candidate slot on every word.');

  /* ---------------------------------------------------------- pass S-D */
  rule('S-D  the nukta invariant, by code point');

  for (const [roman, want] of [
    ['odisha', 'ଓଡ଼ିଶା'],
    ['padhaa', 'ପଢ଼ା'],
  ] as const) {
    const candidates = engine.transliterateWord(roman, TOPK);
    const found = candidates.find((c) => c.text === want);
    const anyPrecomposed = candidates.some((c) => /[ଡ଼ଢ଼]/.test(c.text));

    if (found === undefined) {
      failures += 1;
      console.log(`  FAIL  ${roman}: ${want} not in top-${TOPK}`);
      console.log(`        want ${codepoints(want)}`);
    } else {
      console.log(`  ok    ${roman} -> ${want}   ${codepoints(want)}`);
    }
    if (anyPrecomposed) {
      failures += 1;
      console.log(`  FAIL  ${roman}: a candidate used precomposed U+0B5C/U+0B5D`);
    }
  }

  rule(failures === 0 ? 'PASS' : `FAIL — ${failures} problem(s)`);
  return failures === 0 ? 0 : 1;
}

process.exit(main());
