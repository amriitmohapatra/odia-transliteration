/**
 * The quality harness: top-1 and top-5 exact match on the held-out set,
 * reported separately for in-lexicon and out-of-vocabulary keys.
 *
 *     npm run eval
 *     npm run eval -- --write-baseline
 *     odia eval
 *
 * Why the split is not optional: in-lexicon accuracy measures how much of the
 * language the data pipeline covered, OOV accuracy measures whether the rules
 * generalise. They move independently, and a single averaged number lets a
 * rule regression hide behind a lexicon that grew. Never average them.
 *
 * The verbatim Latin fallback is left in the candidate list and therefore
 * occupies one of the five scored slots. That is deliberate: top-5 here means
 * "would the right word have been in a candidate window of five", which is the
 * question an input method actually poses, and the fallback is always shown.
 *
 * Deliberately a single file with no relative imports: `odia eval` runs it in
 * a child process, which may be plain node relying on type stripping.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { Candidate } from '@odia/core/types';

const REPO_ROOT = new URL('../../', import.meta.url);
const GOLDEN_URL = new URL('core/test/golden/heldout.tsv', REPO_ROOT);
const BASELINE_URL = new URL('tools/eval/baseline.json', REPO_ROOT);

/**
 * Candidates requested per key. Larger than the top-5 being scored, because
 * the same list decides the in-lexicon split: a key counts as in-lexicon when
 * the engine offers at least one lexicon-sourced candidate for it, and that
 * candidate need not be in the top five.
 */
const PROBE_TOPK = 20;

/**
 * The engine is imported dynamically for the same reason the CLI does it:
 * `core/dist` is gitignored, so an unbuilt checkout would otherwise answer
 * `npm run eval` with a module-resolution stack trace.
 */
const engineModules = await loadEngineModules();

interface EngineModules {
  createEngineFromDisk: typeof import('@odia/core/node').createEngineFromDisk;
  canonical: typeof import('@odia/core/normalize').canonical;
}

async function loadEngineModules(): Promise<EngineModules | null> {
  try {
    const [node, normalize] = await Promise.all([
      import('@odia/core/node'),
      import('@odia/core/normalize'),
    ]);
    return { createEngineFromDisk: node.createEngineFromDisk, canonical: normalize.canonical };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') return null;
    throw err;
  }
}

const USAGE = `run_eval - Odia transliteration quality harness

usage
  npm run eval
  npm run eval -- --write-baseline

options
  --write-baseline   overwrite tools/eval/baseline.json with this run
  --help             show this message`;

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** One roman key and every Odia spelling the golden set accepts for it. */
interface TestCase {
  roman: string;
  references: Set<string>;
}

interface Bucket {
  keys: number;
  top1Hits: number;
  top5Hits: number;
  /** Edit distance summed over top-1 misses only. */
  editSum: number;
  editCount: number;
}

interface Scores {
  keys: number;
  top1: number;
  top5: number;
  meanEditDistance: number;
}

interface Baseline {
  generatedAt: string;
  golden: string;
  buckets: { inLexicon: Scores; oov: Scores; overall: Scores };
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function main(argv: string[]): number {
  let writeBaseline = false;
  try {
    const { values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        'write-baseline': { type: 'boolean' },
        help: { type: 'boolean' },
      },
    });
    if (values.help) {
      console.log(USAGE);
      return 0;
    }
    writeBaseline = values['write-baseline'] === true;
  } catch (err) {
    console.error(`run_eval: ${message(err)}\n`);
    console.error(USAGE);
    return 2;
  }

  if (engineModules === null) {
    console.error('run_eval: the engine is not built');
    console.error('  build it with:  npm run build -w @odia/core');
    return 1;
  }
  const { createEngineFromDisk, canonical } = engineModules;

  const golden = readGolden(canonical);
  if (golden === null) return 1;

  let engine;
  try {
    engine = createEngineFromDisk();
  } catch (err) {
    console.error(`run_eval: could not load the engine: ${message(err)}`);
    return 1;
  }

  const inLexicon = emptyBucket();
  const oov = emptyBucket();

  const startedAt = Date.now();
  for (const testCase of golden.cases) {
    const candidates: Candidate[] = engine.transliterateWord(testCase.roman, PROBE_TOPK);
    const isInLexicon = candidates.some((c: Candidate) => c.source === 'lexicon');
    score(
      isInLexicon ? inLexicon : oov,
      testCase,
      candidates.map((c: Candidate) => canonical(c.text)),
    );
  }
  const elapsedMs = Date.now() - startedAt;

  const buckets = {
    inLexicon: summarise(inLexicon),
    oov: summarise(oov),
    overall: summarise(merge(inLexicon, oov)),
  };

  report(golden, buckets, elapsedMs);
  compareToBaseline(buckets, writeBaseline);

  if (writeBaseline) {
    const baseline: Baseline = {
      generatedAt: new Date().toISOString(),
      golden: 'core/test/golden/heldout.tsv',
      buckets,
    };
    writeFileSync(BASELINE_URL, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
    console.log(`\nbaseline written to ${relative(BASELINE_URL)}`);
  }

  return 0;
}

/* ------------------------------------------------------------------ *
 * Golden set
 * ------------------------------------------------------------------ */

interface Golden {
  cases: TestCase[];
  rows: number;
  skipped: number;
}

/** Odia block, U+0B00 to U+0B7F. */
function hasOdia(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp >= 0x0b00 && cp <= 0x0b7f) return true;
  }
  return false;
}

function hasLatinLetter(s: string): boolean {
  return /[A-Za-z]/.test(s);
}

/**
 * Read `heldout.tsv` into one test case per roman key.
 *
 * Which column is which is decided per row from the content rather than by
 * position: the roman side is the one with Latin letters, the Odia side the
 * one in the Odia block. That makes the harness immune to the pipeline
 * emitting the pair in either order, and it silently drops any header row,
 * since a header has no Odia in it.
 *
 * Multiple rows may share a roman key. They become alternative references for
 * that key, and the key is scored once: a transliteration is correct if it
 * matches any spelling the golden set accepts.
 */
function readGolden(canonical: (s: string) => string): Golden | null {
  let raw: string;
  try {
    raw = readFileSync(GOLDEN_URL, 'utf8');
  } catch {
    console.error(`run_eval: no golden set at ${relative(GOLDEN_URL)}`);
    console.error('');
    console.error('  It is written from the Aksharantar test split by the data pipeline,');
    console.error('  in the same run that builds the lexicon. Build it first:');
    console.error('      cd tools/build-data && uv run python build_lexicon.py');
    return null;
  }

  const byRoman = new Map<string, Set<string>>();
  let rows = 0;
  let skipped = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith('#')) continue;
    rows += 1;

    const fields = line.split('\t');
    if (fields.length < 2) {
      skipped += 1;
      continue;
    }

    const [first, second] = fields as [string, string];
    let roman: string;
    let odia: string;
    if (hasOdia(second) && hasLatinLetter(first)) {
      roman = first;
      odia = second;
    } else if (hasOdia(first) && hasLatinLetter(second)) {
      roman = second;
      odia = first;
    } else {
      skipped += 1;
      continue;
    }

    roman = roman.trim();
    odia = canonical(odia.trim());
    if (roman.length === 0 || odia.length === 0) {
      skipped += 1;
      continue;
    }

    const references = byRoman.get(roman);
    if (references === undefined) byRoman.set(roman, new Set([odia]));
    else references.add(odia);
  }

  const cases = [...byRoman].map(([roman, references]) => ({ roman, references }));
  return { cases, rows, skipped };
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

function emptyBucket(): Bucket {
  return { keys: 0, top1Hits: 0, top5Hits: 0, editSum: 0, editCount: 0 };
}

/** `candidates` is already canonical and in rank order. */
function score(bucket: Bucket, testCase: TestCase, candidates: string[]): void {
  bucket.keys += 1;

  const top1 = candidates[0];
  if (top1 !== undefined && testCase.references.has(top1)) {
    bucket.top1Hits += 1;
    bucket.top5Hits += 1;
    return;
  }

  if (candidates.slice(0, 5).some((c) => testCase.references.has(c))) {
    bucket.top5Hits += 1;
  }

  // Edit distance is charged on top-1 misses only, and against the reference
  // the engine came closest to: it answers "how wrong was it", which is a
  // different question from "was it right".
  if (top1 !== undefined) {
    let best = Infinity;
    for (const reference of testCase.references) {
      const d = editDistance(top1, reference);
      if (d < best) best = d;
    }
    bucket.editSum += best;
    bucket.editCount += 1;
  }
}

function merge(a: Bucket, b: Bucket): Bucket {
  return {
    keys: a.keys + b.keys,
    top1Hits: a.top1Hits + b.top1Hits,
    top5Hits: a.top5Hits + b.top5Hits,
    editSum: a.editSum + b.editSum,
    editCount: a.editCount + b.editCount,
  };
}

function summarise(bucket: Bucket): Scores {
  return {
    keys: bucket.keys,
    top1: ratio(bucket.top1Hits, bucket.keys),
    top5: ratio(bucket.top5Hits, bucket.keys),
    meanEditDistance: ratio(bucket.editSum, bucket.editCount),
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Levenshtein distance in code points, not UTF-16 units, so a matra never
 * counts as half a character. Two rolling rows; the strings are single words.
 */
function editDistance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  if (x.length === 0) return y.length;
  if (y.length === 0) return x.length;

  let previous = new Array<number>(y.length + 1);
  let current = new Array<number>(y.length + 1);
  for (let j = 0; j <= y.length; j++) previous[j] = j;

  for (let i = 1; i <= x.length; i++) {
    current[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const substitution = (previous[j - 1] as number) + (x[i - 1] === y[j - 1] ? 0 : 1);
      const deletion = (previous[j] as number) + 1;
      const insertion = (current[j - 1] as number) + 1;
      current[j] = Math.min(substitution, deletion, insertion);
    }
    [previous, current] = [current, previous];
  }

  return previous[y.length] as number;
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

function report(
  golden: Golden,
  buckets: { inLexicon: Scores; oov: Scores; overall: Scores },
  elapsedMs: number,
): void {
  const perWord = golden.cases.length === 0 ? 0 : elapsedMs / golden.cases.length;
  const skipped = golden.skipped === 0 ? '' : `, ${golden.skipped} unusable rows skipped`;

  console.log('Odia transliteration eval');
  console.log(`  golden   ${relative(GOLDEN_URL)}`);
  console.log(`  data     ${golden.rows} rows -> ${golden.cases.length} unique roman keys${skipped}`);
  console.log(`  speed    ${(elapsedMs / 1000).toFixed(1)} s total, ${perWord.toFixed(2)} ms per word`);
  console.log('');
  console.log('  exact match after canonical() on both sides; a key is correct when any');
  console.log('  spelling the golden set accepts for it is matched');
  console.log('');
  console.log('  bucket         keys      top-1      top-5    mean edit dist (top-1 misses)');
  console.log(`  ${row('in-lexicon', buckets.inLexicon)}`);
  console.log(`  ${row('OOV', buckets.oov)}`);
  console.log(`  ${'-'.repeat(74)}`);
  console.log(`  ${row('overall', buckets.overall)}`);
  console.log('');
  console.log('  in-lexicon = the engine offered at least one lexicon-sourced candidate for');
  console.log('  the key. Coverage and rule generalisation are different things: do not average.');
  console.log('');
  console.log('  Reading the in-lexicon row: the correct pair is held out of the lexicon by');
  console.log('  construction, so a lexicon candidate on one of these keys is by definition a');
  console.log('  DIFFERENT word. Near-0% top-1 there is structural, not a bug. What the row');
  console.log('  does measure is the cost of that collision — top-5 above the OOV row means');
  console.log('  the rules found the right word and a lexicon entry outranked it.');
}

function row(label: string, s: Scores): string {
  return (
    label.padEnd(12) +
    String(s.keys).padStart(6) +
    pct(s.top1).padStart(11) +
    pct(s.top5).padStart(11) +
    s.meanEditDistance.toFixed(2).padStart(15)
  );
}

function pct(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ *
 * Baseline
 * ------------------------------------------------------------------ */

function compareToBaseline(
  buckets: { inLexicon: Scores; oov: Scores; overall: Scores },
  writingBaseline: boolean,
): void {
  let baseline: Baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_URL, 'utf8')) as Baseline;
  } catch {
    if (writingBaseline) return; // about to be written; do not advise doing what is already happening
    console.log('');
    console.log(`  no baseline at ${relative(BASELINE_URL)} yet`);
    console.log('  record this run as the baseline with:  npm run eval -- --write-baseline');
    return;
  }

  console.log('');
  console.log(`vs baseline  ${relative(BASELINE_URL)}  (${baseline.generatedAt})`);
  console.log('  bucket         top-1      top-5    mean edit dist');
  for (const key of ['inLexicon', 'oov', 'overall'] as const) {
    const now = buckets[key];
    const then = baseline.buckets?.[key];
    if (then === undefined) {
      console.log(`  ${label(key).padEnd(12)}  (absent from baseline)`);
      continue;
    }
    console.log(
      '  ' +
        label(key).padEnd(12) +
        deltaPoints(now.top1, then.top1).padStart(9) +
        deltaPoints(now.top5, then.top5).padStart(11) +
        deltaRaw(now.meanEditDistance, then.meanEditDistance).padStart(17),
    );
  }
}

function label(key: 'inLexicon' | 'oov' | 'overall'): string {
  if (key === 'inLexicon') return 'in-lexicon';
  if (key === 'oov') return 'OOV';
  return 'overall';
}

/** Accuracy deltas are in percentage points, which is what a rule change moves. */
function deltaPoints(now: number, then: number): string {
  return signed(100 * (now - then), 1, ' pp');
}

function deltaRaw(now: number, then: number): string {
  return signed(now - then, 2, ' chars');
}

function signed(value: number, digits: number, unit: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '' : ' ';
  return `${sign}${value.toFixed(digits)}${unit}`;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function relative(url: URL): string {
  return fileURLToPath(url).slice(fileURLToPath(REPO_ROOT).length);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

process.exitCode = main(process.argv.slice(2));
