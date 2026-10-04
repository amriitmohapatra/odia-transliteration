/**
 * Accuracy on real Sanskritized Odia.
 *
 * Method is tools/eval/everyday.ts's, and for the same reason: take real Odia
 * text, INVERT the romanization scheme to derive the roman a person would
 * plausibly type, feed that back, and check whether the original returns.
 * Deriving rather than hand-authoring is what keeps it honest — nobody gets to
 * quietly pick the romanizations the engine happens to like.
 *
 * Three registers, where everyday Odia has two:
 *
 *   careful   long vowels written out          dhyaana balaatitam
 *   casual    collapsed, how people type       dhyana balatitam
 *   iast      IAST with the diacritics dropped, which is what a plain keyboard
 *             produces when you copy out of a printed book — dhyana balatitam
 *             from dhyāna balātītaṃ. Everyday Odia has no equivalent, because
 *             nobody copies casual Odia out of a book. Sanskrit is mostly read
 *             before it is typed, so this register is real.
 *
 * Reported per profile, never averaged across them, and never averaged with the
 * everyday numbers: they measure different things.
 *
 *     npx tsx Appv2/eval/sloka.ts [--topk 5] [--profile sloka]
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonical } from '../../core/src/normalize.js';
import { preprocess, PREPROCESS_ALL } from '../src/preprocess.js';
import { isProfileId, PROFILES, type ProfileId } from '../src/profiles.js';
import { APPV2, casual, engineFor, iastFold, pct, romanize, rule } from './lib.js';

const args = process.argv.slice(2);
const TOPK = Number(valueAfter('--topk') ?? 5);

function valueAfter(flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
}

const PROFILES_TO_RUN: ProfileId[] = (() => {
  const raw = valueAfter('--profile');
  if (raw === undefined) return ['unified', 'sloka'];
  if (!isProfileId(raw)) throw new Error(`unknown profile "${raw}"`);
  return [raw];
})();

const SOURCE = resolve(APPV2, 'eval/golden/sloka-source.txt');

interface Line {
  /** The verse exactly as written. */
  text: string;
  /** Distinct Odia words in it. */
  words: string[];
}

function readSource(): Line[] {
  if (!existsSync(SOURCE)) return [];
  const lines: Line[] = [];

  for (const raw of readFileSync(SOURCE, 'utf8').split('\n')) {
    const text = raw.trim();
    if (text.length === 0 || text.startsWith('#')) continue;

    const words: string[] = [];
    for (const token of text.split(/\s+/)) {
      // Strip danda and any Latin, keep the Odia.
      const word = canonical(token.replace(/[^଀-୿]/g, ''));
      if (word.length > 0 && !words.includes(word)) words.push(word);
    }
    if (words.length > 0) lines.push({ text, words });
  }

  return lines;
}

interface Tally {
  top1: number;
  top3: number;
  top5: number;
  total: number;
}

function empty(): Tally {
  return { top1: 0, top3: 0, top5: 0, total: 0 };
}

function main(): number {
  const lines = readSource();
  const words = [...new Set(lines.flatMap((l) => l.words))];

  console.log(`Śloka accuracy — ${lines.length} line(s), ${words.length} distinct words`);
  console.log(`source: Appv2/eval/golden/sloka-source.txt`);

  if (words.length === 0) {
    console.log('\nNo verse in the golden source yet — nothing to measure.');
    console.log('Paste 30-60 lines of the Sanskritized Odia you want to type into');
    console.log('Appv2/eval/golden/sloka-source.txt and re-run. Until then this is a');
    console.log('smoke test, not a measurement, and it says so rather than reporting 100%.');
    return 0;
  }

  // Small samples produce percentages that look precise and are not. Say so
  // rather than letting "100.0%" over three words read as a result.
  const THIN = 25;
  if (words.length < THIN) {
    console.log(
      `\nNOTE: ${words.length} words is a smoke test, not a measurement. ` +
        `Percentages below are\n      not meaningful until the source has ~${THIN}+ distinct words.`,
    );
  }

  for (const id of PROFILES_TO_RUN) {
    const engine = engineFor(id);
    rule(`profile "${id}" — ${PROFILES[id].hint}`);

    const registers: [string, (r: string) => string][] = [
      ['careful', (r) => r],
      ['casual', casual],
      ['iast', iastFold],
    ];

    const misses: string[] = [];

    for (const [name, transform] of registers) {
      const tally = empty();
      for (const word of words) {
        const roman = transform(romanize(word));
        if (roman.length === 0) continue;
        tally.total += 1;

        const at = engine.transliterateWord(roman, TOPK).findIndex((c) => c.text === word);
        if (at === 0) tally.top1 += 1;
        if (at >= 0 && at < 3) tally.top3 += 1;
        if (at >= 0) tally.top5 += 1;
        if (at < 0 && name === 'casual') misses.push(`${roman} -> ${word}`);
      }

      console.log(
        `  ${name.padEnd(8)} top-1 ${pct(tally.top1, tally.total)}   ` +
          `top-3 ${pct(tally.top3, tally.total)}   ` +
          `top-5 ${pct(tally.top5, tally.total)}   (${tally.total} words)`,
      );
    }

    console.log('  casual is the number that matters — it is how people actually type.');

    if (misses.length > 0) {
      console.log(`\n  not in top-${TOPK} in the casual register:`);
      for (const miss of misses.slice(0, 20)) console.log(`    ${miss}`);
      if (misses.length > 20) console.log(`    ... and ${misses.length - 20} more`);
    }

    /* --------------------------------------------------------------- *
     * Whole-line reconstruction. Word accuracy is not the same question
     * as "does the verse come out right", because a line is only right
     * when every word in it is.
     * --------------------------------------------------------------- */
    let exact = 0;
    for (const line of lines) {
      const roman = line.text
        .split(/\s+/)
        .map((token) => {
          if (token === '।') return '|';
          if (token === '॥') return '||';
          return casual(romanize(canonical(token.replace(/[^଀-୿]/g, ''))));
        })
        .filter((t) => t.length > 0)
        .join(' ');

      const got = engine.transliterate(preprocess(roman, PREPROCESS_ALL), { topk: TOPK }).text;
      const want = line.text;
      if (got === want) exact += 1;
      else {
        console.log(`\n  line MISS  ${roman}`);
        console.log(`        got  ${got}`);
        console.log(`        want ${want}`);
      }
    }
    console.log(
      `\n  whole line, top-1 on every word: ${exact}/${lines.length} (${pct(exact, lines.length)})`,
    );
  }

  return 0;
}

process.exit(main());
