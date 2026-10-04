/**
 * Did adding Sanskrit cost anything in everyday Odia?
 *
 * This is the harness that protects the app the user already relies on. It runs
 * two engines in one process over the same material:
 *
 *   control    the `everyday` profile — core/rules/symbols.toml and core/data,
 *              byte for byte what ships today
 *   treatment  the `unified` profile — Appv2's generated rules and the merged
 *              lexicons, which is what the app now defaults to
 *
 * Method is tools/eval/everyday.ts's: take real connected Odia, invert the
 * romanization scheme to derive the roman a person would plausibly type, feed
 * it back, and check whether the original returns. Deriving rather than
 * hand-authoring is what keeps it honest — nobody gets to pick romanizations
 * the engine happens to like.
 *
 * It READS tools/eval/baseline.json and never writes it. No Appv2 script
 * implements --write-baseline; the existing numbers are evidence, not a target
 * to be re-pointed at whatever we happen to score.
 *
 *     npx tsx Appv2/eval/no-regression.ts [--topk 5]
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonical } from '../../core/src/normalize.js';
import type { Engine } from '../../core/src/index.js';
import { casual, engineFor, pct, romanize, ROOT, rule } from './lib.js';

const args = process.argv.slice(2);
const TOPK = Number(valueAfter('--topk') ?? 5);

function valueAfter(flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
}

/**
 * How far each metric may move before this is a regression.
 *
 * Half a point. Tight enough that a real rule regression cannot hide inside it,
 * loose enough to absorb a tie broken differently by an added lexicon row.
 */
const TOLERANCE_PP = 0.5;

interface Arm {
  careful1: number;
  careful3: number;
  casual1: number;
  casual3: number;
  total: number;
}

/** Words from the everyday golden source, deduped, in corpus order. */
function goldenWords(): string[] {
  const path = resolve(ROOT, 'core/test/golden/everyday-source.txt');
  if (!existsSync(path)) return [];

  const seen = new Set<string>();
  for (const raw of readFileSync(path, 'utf8').split(/\s+/)) {
    const word = canonical(raw.replace(/[^଀-୿]/g, ''));
    if (word.length > 0) seen.add(word);
  }
  return [...seen];
}

function score(engine: Engine, words: readonly string[]): Arm {
  const arm: Arm = { careful1: 0, careful3: 0, casual1: 0, casual3: 0, total: 0 };

  for (const word of words) {
    const careful = romanize(word);
    if (careful.length === 0) continue;
    arm.total += 1;

    for (const [roman, at1, at3] of [
      [careful, 'careful1', 'careful3'],
      [casual(careful), 'casual1', 'casual3'],
    ] as const) {
      const candidates = engine.transliterateWord(roman, TOPK);
      const at = candidates.findIndex((c) => c.text === word);
      if (at === 0) arm[at1] += 1;
      if (at >= 0 && at < 3) arm[at3] += 1;
    }
  }

  return arm;
}

function main(): number {
  const words = goldenWords();
  if (words.length === 0) {
    console.log('core/test/golden/everyday-source.txt not found — nothing to compare.');
    return 0;
  }

  console.log(`No-regression — ${words.length} distinct words from the everyday golden source`);
  console.log(`control = everyday profile, treatment = unified profile, top-${TOPK}`);

  const control = score(engineFor('everyday'), words);
  const treatment = score(engineFor('unified'), words);

  rule('everyday Odia: control vs treatment');
  console.log('  metric              control   treatment   delta');

  let failures = 0;
  const metrics: [keyof Arm, string][] = [
    ['careful1', 'careful top-1'],
    ['careful3', 'careful top-3'],
    ['casual1', 'casual top-1'],
    ['casual3', 'casual top-3'],
  ];

  for (const [key, label] of metrics) {
    const a = (100 * control[key]) / control.total;
    const b = (100 * treatment[key]) / treatment.total;
    const delta = b - a;
    const bad = delta < -TOLERANCE_PP;
    if (bad) failures += 1;
    console.log(
      `  ${label.padEnd(18)} ${a.toFixed(1).padStart(6)}%  ${b.toFixed(1).padStart(8)}%  ` +
        `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp${bad ? '   <- REGRESSION' : ''}`,
    );
  }

  /* ------------------------------------------------------------------ *
   * The named cases.
   *
   * Each is the specific failure a specific delta risks. Naming them means a
   * regression identifies its own cause instead of showing up as a number that
   * moved for unknown reasons.
   * ------------------------------------------------------------------ */
  rule('named cases — the failures the risky deltas would cause');

  const unified = engineFor('unified');
  const cases: { roman: string; want: string; notAbove?: string; why: string }[] = [
    { roman: 'dhanyabaada', want: 'ଧନ୍ୟବାଦ', why: 'S5 territory: ନ୍ୟ must not become ଞ or ଂୟ' },
    {
      roman: 'achha',
      want: 'ଅଛ',
      notAbove: 'ଅଚଃହ',
      why: 'S3: medial visarga must not hijack an aspirate digraph',
    },
    {
      roman: 'kha',
      want: 'ଖା',
      notAbove: 'ଖଃ',
      // The obvious assertion here — ଖ in the top 3 — is wrong, and checking it
      // against the control is what showed that: ଖ sits at rank 6 in the
      // EVERYDAY profile too, because ଖା ("eat") is a frequent word and ଖ alone
      // is not a word at all. What S3 actually does is insert ଖଃ at rank 5,
      // displacing ଖାଆ. That is the spurious reading the 0.25 weight was tuned
      // to keep harmless, so this asserts the harm rather than the presence.
      why: 'S3: ଖଃ is allowed to exist, but never above the real answers',
    },
    { roman: 'svaamii', want: 'ସ୍ୱାମୀ', why: 'S7: subjoined व stays ୱ' },
    { roman: 'bishva', want: 'ବିଶ୍ୱ', why: 'S7: same, after a sibilant' },
    { roman: 'kari', want: 'କରି', why: 'S6 is śloka-only; ri must stay ର+ି here' },
    { roman: 'guru', want: 'ଗୁରୁ', why: 'S6 is śloka-only; ru must stay ର+ୁ here' },
    { roman: 'odisha', want: 'ଓଡ଼ିଶା', why: 'the nukta invariant' },
    { roman: 'jagannaatha', want: 'ଜଗନ୍ନାଥ', why: 'RULE_FLOOR: the lexicon answer must survive' },
    { roman: 'kemiti', want: 'କେମିତି', why: 'plain everyday Odia, unchanged' },
  ];

  for (const c of cases) {
    const candidates = unified.transliterateWord(c.roman, TOPK);
    const texts = candidates.map((x) => x.text);
    const at = texts.indexOf(canonical(c.want));

    let ok = at >= 0 && at < 3;
    let note = '';
    if (ok && c.notAbove !== undefined) {
      const bad = texts.indexOf(canonical(c.notAbove));
      if (bad >= 0 && bad < at) {
        ok = false;
        note = `  <- ${c.notAbove} outranked it`;
      } else if (bad >= 0) {
        note = `  (${c.notAbove} present at rank ${bad + 1}, below it — fine)`;
      }
    }

    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'}  ${c.roman.padEnd(13)} ${c.want.padEnd(11)} ` +
        `${at < 0 ? 'absent' : `rank ${at + 1}`.padEnd(6)}  ${c.why}${note}`,
    );
    if (!ok) {
      console.log(`        got: ${texts.slice(0, 5).join('  ')}`);
    }
  }

  /* ------------------------------------------------------------------ *
   * The committed held-out baseline, read only.
   * ------------------------------------------------------------------ */
  const baselinePath = resolve(ROOT, 'tools/eval/baseline.json');
  if (existsSync(baselinePath)) {
    rule('tools/eval/baseline.json — for reference, READ ONLY');
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
      buckets?: Record<string, { keys?: number; top1?: number; top5?: number }>;
    };
    // Nested under "buckets", and top1/top5 are fractions in 0..1, not counts.
    for (const [bucket, row] of Object.entries(baseline.buckets ?? {})) {
      console.log(
        `  ${bucket.padEnd(10)} keys ${String(row.keys ?? '?').padStart(5)}  ` +
          `top1 ${pct(row.top1 ?? 0, 1)}  top5 ${pct(row.top5 ?? 0, 1)}`,
      );
    }
    console.log('  Held-out is scored by `npm run eval`, which builds its own engine from');
    console.log('  core/ only. Appv2 changes nothing it reads, so its numbers cannot move.');
  }

  rule(failures === 0 ? 'PASS — no regression' : `FAIL — ${failures} regression(s)`);
  return failures === 0 ? 0 : 1;
}

process.exit(main());
