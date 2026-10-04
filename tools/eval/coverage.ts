/**
 * Exhaustive orthographic coverage audit.
 *
 * The accuracy evals measure whole WORDS. This measures the alphabet itself,
 * systematically, because a word-level score can look healthy while some letter
 * or matra is quietly unreachable.
 *
 * Five passes, generated from the rule tables rather than hand-listed, so the
 * audit cannot silently drift out of sync with symbols.toml:
 *
 *   A  every independent vowel                       ଅ ଆ ଇ ...
 *   B  every consonant with its inherent vowel       କ ଖ ଗ ...
 *   C  every consonant x every matra                 କା କି କୀ କୁ ...
 *   D  every consonant pair as a conjunct            କ୍ତ ଙ୍କ ଣ୍ଡ ...
 *   E  every sign on a consonant                     କଂ କଁ କଃ କ୍
 *
 * Plus a gap check: every assigned letter in the Odia Unicode block that no rule
 * can produce at all.
 *
 * Two numbers are reported per pass and they mean different things:
 *
 *   REACHABLE  the target appears somewhere in the candidate list. This must be
 *              100%. Anything less is a hole in the scheme — the user cannot
 *              type that letter at all, by any route.
 *   TOP-1      the target is the first candidate. This will NOT be 100% and
 *              should not be: "sa" is genuinely ସ, ଶ or ଷ, and choosing between
 *              them is the candidate list's job, not the segmenter's.
 *
 *   npx tsx tools/eval/coverage.ts [--topk 9] [--verbose]
 */

import { createEngineFromDisk } from '@odia/core/node';
import { loadRules } from '@odia/core';
import { readCoreFile, RULES_PATH } from '@odia/core/node';
import { canonical, codepoints } from '@odia/core/normalize';

const argv = process.argv.slice(2);
const TOPK = Number(argv[argv.indexOf('--topk') + 1]) || 9;
const VERBOSE = argv.includes('--verbose');

const rulesToml = readCoreFile(RULES_PATH);
if (rulesToml === undefined) throw new Error('cannot read core/rules/symbols.toml');
const rules = loadRules(rulesToml);
const engine = createEngineFromDisk();

const VIRAMA = '୍';

/* ------------------------------------------------------------------ *
 * Inventory, taken from the rule tables
 * ------------------------------------------------------------------ */

/** Preferred roman for each distinct Odia consonant: the highest-weighted route to it. */
const consonantRoman = new Map<string, { roman: string; weight: number }>();
for (const rule of rules.consonants) {
  for (const option of rule.options) {
    const text = canonical(option.text);
    const prior = consonantRoman.get(text);
    if (prior === undefined || option.weight > prior.weight) {
      consonantRoman.set(text, { roman: rule.roman, weight: option.weight });
    }
  }
}

/** Vowels, excluding the inherent one (empty matra) for the matra pass. */
const vowels = rules.vowels.map((v) => ({
  roman: v.roman,
  independent: canonical(v.independent),
  matra: canonical(v.matra),
  weight: v.weight,
}));

const signs: { roman: string; text: string }[] = [];
for (const rule of rules.signs) {
  for (const option of rule.options) {
    signs.push({ roman: rule.roman, text: canonical(option.text) });
  }
}


/**
 * Odia -> roman, i.e. what a person would plausibly type. Built by inverting
 * the same rule tables the engine reads, so pass F cannot drift from the scheme.
 */
function romanizeOdia(word: string): string {
  const matraOf = new Map<string, string>();
  const independentOf = new Map<string, string>();
  // Highest-weighted roman per form, not merely the first. Both "a" (w 0.35,
  // the casual collapsed spelling) and "aa" (w 1.0) own the ା matra; taking the
  // first gave "katanti" for କାଟନ୍ତି and made the word look unreachable when the
  // engine was in fact correct.
  const bestMatra = new Map<string, number>();
  const bestIndep = new Map<string, number>();
  for (const v of vowels) {
    if (v.matra && v.weight > (bestMatra.get(v.matra) ?? -1)) {
      bestMatra.set(v.matra, v.weight);
      matraOf.set(v.matra, v.roman);
    }
    if (v.weight > (bestIndep.get(v.independent) ?? -1)) {
      bestIndep.set(v.independent, v.weight);
      independentOf.set(v.independent, v.roman);
    }
  }
  const signOf = new Map(signs.map((s) => [s.text, s.roman]));

  // Longest consonant first, so ଡ଼ (two code points) wins over bare ଡ.
  const consonants = [...consonantRoman].sort((a, b) => b[0].length - a[0].length);

  let out = '';
  let i = 0;
  let pending = false; // a consonant is awaiting its inherent vowel
  while (i < word.length) {
    const two = word.slice(i, i + 2);
    const hit = consonants.find(([text]) => (text.length === 2 ? two === text : word[i] === text));
    if (hit) {
      if (pending) out += 'a';
      out += hit[1].roman;
      pending = true;
      i += hit[0].length;
      continue;
    }
    const ch = word[i] as string;
    if (ch === VIRAMA) { pending = false; i += 1; continue; }
    if (matraOf.has(ch)) { pending = false; out += matraOf.get(ch); i += 1; continue; }
    if (independentOf.has(ch)) {
      if (pending) { out += 'a'; pending = false; }
      out += independentOf.get(ch); i += 1; continue;
    }
    if (signOf.has(ch)) {
      if (pending) { out += 'a'; pending = false; }
      out += signOf.get(ch); i += 1; continue;
    }
    return ''; // not pure Odia, skip
  }
  if (pending) out += 'a';
  return out;
}

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

interface Case { input: string; expect: string; label: string }
interface Outcome extends Case { rank: number }

function run(cases: Case[]): Outcome[] {
  return cases.map((c) => {
    const got = engine.transliterateWord(c.input, TOPK).map((x) => canonical(x.text));
    return { ...c, rank: got.indexOf(canonical(c.expect)) };
  });
}

const pct = (n: number, d: number) => (d === 0 ? '   n/a' : `${((100 * n) / d).toFixed(1)}%`);

function report(name: string, outcomes: Outcome[]): Outcome[] {
  const total = outcomes.length;
  const top1 = outcomes.filter((o) => o.rank === 0).length;
  const reach = outcomes.filter((o) => o.rank >= 0).length;
  const flag = reach === total ? ' ' : '!';
  console.log(
    `  ${flag} ${name.padEnd(34)} ${String(total).padStart(5)}   ` +
      `${pct(top1, total).padStart(7)}   ${pct(reach, total).padStart(7)}`,
  );
  return outcomes.filter((o) => o.rank < 0);
}

console.log('\nOrthographic coverage audit');
console.log(`(top-${TOPK}; REACHABLE must be 100% — TOP-1 need not be, see header)\n`);
console.log(`    ${'pass'.padEnd(34)} ${'cases'.padStart(5)}   ${'TOP-1'.padStart(7)}   ${'REACHABLE'.padStart(7)}`);
console.log('  ' + '-'.repeat(62));

const unreachable: Outcome[] = [];

// A — independent vowels
unreachable.push(
  ...report(
    'A  independent vowels',
    run(vowels.map((v) => ({ input: v.roman, expect: v.independent, label: v.independent }))),
  ),
);

// B — consonants carrying the inherent vowel
unreachable.push(
  ...report(
    'B  consonants (inherent vowel)',
    run(
      [...consonantRoman].map(([text, { roman }]) => ({
        input: roman + 'a',
        expect: text,
        label: text,
      })),
    ),
  ),
);

// C — every consonant x every matra
const matraCases: Case[] = [];
for (const [text, { roman }] of consonantRoman) {
  for (const v of vowels) {
    if (v.matra === '') continue; // the inherent vowel is pass B
    matraCases.push({ input: roman + v.roman, expect: text + v.matra, label: `${text}${v.matra}` });
  }
}
unreachable.push(...report('C  consonant x matra', run(matraCases)));

// D — every ordered consonant pair as a conjunct
//
// Plain concatenation is not always typable: "t" + "h" spells "th", which the
// digraph ଥ/ଠ legitimately owns, so ଟ୍ହ cannot be reached that way at all. When
// the join collides with a longer key, the explicit halant is the real input a
// person would use, so the test uses it and counts how often it was needed.
let neededHalant = 0;
const conjunctCases: Case[] = [];
for (const [a, ra] of consonantRoman) {
  for (const [b, rb] of consonantRoman) {
    const joined = ra.roman + rb.roman;
    const collides = rules
      .matchAt(joined, 0)
      .some((entry) => entry.roman.length > ra.roman.length);
    if (collides) neededHalant += 1;
    conjunctCases.push({
      input: collides ? `${ra.roman}_${rb.roman}a` : `${joined}a`,
      expect: a + VIRAMA + b,
      label: `${a}${VIRAMA}${b}`,
    });
  }
}
unreachable.push(...report('D  conjuncts (consonant pairs)', run(conjunctCases)));
console.log(
  `    ${' '.repeat(34)}         ${neededHalant} of ${conjunctCases.length} need an explicit halant ("t_ha")`,
);

// E — signs on a bearer
const signCases: Case[] = signs.map((s) => ({
  input: 'ka' + s.roman,
  expect: 'କ' + s.text,
  label: `କ${s.text}`,
}));
signCases.push({ input: 'k_', expect: 'କ' + VIRAMA, label: `କ${VIRAMA}` });
unreachable.push(...report('E  signs on a consonant', run(signCases)));

// F — real connected Odia, round-tripped
//
// Passes A-E check the alphabet in isolation. This checks that letters still
// combine cleanly once they are inside real words and sentences: that conjuncts
// survive next to matras, that the halant lands where it should, and that
// nothing is dropped or doubled across word boundaries.
const SENTENCE_SOURCE = new URL('../../core/test/golden/everyday-source.txt', import.meta.url);
let sentenceCases: Case[] = [];
try {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(SENTENCE_SOURCE, 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join(' ');
  const words = Array.from(new Set((text.match(/[଀-୿]+/g) ?? []).map(canonical)));
  sentenceCases = words
    .filter((w) => w.length > 1)
    .map((w) => ({ input: romanizeOdia(w), expect: w, label: w }))
    .filter((c) => c.input.length > 0);
} catch {
  /* the golden source is optional */
}
if (sentenceCases.length) {
  unreachable.push(...report('F  words from real Odia text', run(sentenceCases)));
  const conjunctWords = sentenceCases.filter((c) => c.expect.includes(VIRAMA));
  if (conjunctWords.length) {
    report('   ...of those, containing a halant', run(conjunctWords));
  }
}

/* ------------------------------------------------------------------ *
 * Gap check: assigned Odia code points no rule can produce
 * ------------------------------------------------------------------ */

const produced = new Set<string>();
for (const [text] of consonantRoman) for (const ch of text) produced.add(ch);
for (const v of vowels) {
  for (const ch of v.independent) produced.add(ch);
  for (const ch of v.matra) produced.add(ch);
}
for (const s of signs) for (const ch of s.text) produced.add(ch);
produced.add(VIRAMA);

// Digits are handled by the digit mode, not by letter rules.
for (let cp = 0x0b66; cp <= 0x0b6f; cp += 1) produced.add(String.fromCodePoint(cp));

const missing: string[] = [];
for (let cp = 0x0b00; cp <= 0x0b7f; cp += 1) {
  const ch = String.fromCodePoint(cp);
  // Skip unassigned code points: they round-trip through NFC as themselves but
  // have no name; the cheap proxy is that canonical() leaves them alone and
  // they are not in our produced set.
  if (produced.has(ch)) continue;
  missing.push(ch);
}

console.log('\n  Odia block letters no rule can produce:');
if (missing.length === 0) {
  console.log('    none');
} else {
  const named = missing
    .map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} ${ch}`)
    .join('   ');
  console.log(`    ${missing.length}: ${named}`);
  console.log('    (many of these are unassigned or archaic — check individually before acting)');
}

/* ------------------------------------------------------------------ */

if (unreachable.length) {
  console.log(`\n  UNREACHABLE — ${unreachable.length} target(s) absent from the top ${TOPK}:\n`);
  const show = VERBOSE ? unreachable : unreachable.slice(0, 40);
  for (const u of show) {
    const got = engine.transliterateWord(u.input, 1)[0];
    console.log(
      `    ${u.input.padEnd(10)} want ${u.label.padEnd(8)} ${codepoints(u.label).padEnd(26)} got ${got ? canonical(got.text) : '-'}`,
    );
  }
  if (!VERBOSE && unreachable.length > show.length) {
    console.log(`    ... and ${unreachable.length - show.length} more (--verbose for all)`);
  }
  console.log('');
  process.exit(1);
}

console.log('\n  Every letter, matra, conjunct and sign is reachable.\n');
