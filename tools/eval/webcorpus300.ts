/**
 * Engine-vs-corpus check: the top-N most frequent words in REAL written Odia.
 *
 * `everyday.ts` measures 46 words of hand-picked connected prose. This measures
 * the actual head of the language: the top 300 types of the merged 18.4M-token
 * web corpus (`core/data/webfreq.tsv`), which together carry a large share of
 * all token mass. If the engine misses here, it misses constantly.
 *
 * Method is deliberately identical to `everyday.ts` — invert symbols.toml to
 * derive the roman a person would plausibly type, in two registers (careful =
 * long vowels written out, casual = collapsed), then feed it back. Deriving the
 * roman rather than hand-authoring it keeps the test honest.
 *
 * The romanizer below is a verbatim copy of the one in `everyday.ts`. It is
 * duplicated rather than extracted because this script is measurement only and
 * must not perturb the existing harness.
 *
 *   npx tsx tools/eval/webcorpus300.ts [--n 300] [--topk 5] [--json out.json]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createEngineFromDisk } from '@odia/core/node';
import { canonical } from '@odia/core/normalize';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FREQ = resolve(ROOT, 'core/data/webfreq.tsv');
const LEXICON = resolve(ROOT, 'core/data/lexicon.tsv');

const argv = process.argv.slice(2);
const num = (flag: string, dflt: number) => {
  const i = argv.indexOf(flag);
  return i === -1 ? dflt : Number(argv[i + 1]) || dflt;
};
const N = num('--n', 300);
const TOPK = num('--topk', 5);
const DEEP = num('--deep', 50); // how far down to look when diagnosing a miss
const JSONOUT = argv.indexOf('--json') === -1 ? null : argv[argv.indexOf('--json') + 1];

/* ------------------------------------------------------------------ *
 * Odia -> roman (verbatim from tools/eval/everyday.ts)
 * ------------------------------------------------------------------ */

const NUKTA = '଼';
const VIRAMA = '୍';

const CONSONANT: Record<string, string> = {
  ['କ']: 'k', ['ଖ']: 'kh', ['ଗ']: 'g', ['ଘ']: 'gh', ['ଙ']: 'ng',
  ['ଚ']: 'ch', ['ଛ']: 'chh', ['ଜ']: 'j', ['ଝ']: 'jh', ['ଞ']: 'ny',
  ['ଟ']: 't', ['ଠ']: 'th', ['ଡ']: 'd', ['ଢ']: 'dh', ['ଣ']: 'n',
  ['ତ']: 't', ['ଥ']: 'th', ['ଦ']: 'd', ['ଧ']: 'dh', ['ନ']: 'n',
  ['ପ']: 'p', ['ଫ']: 'ph', ['ବ']: 'b', ['ଭ']: 'bh', ['ମ']: 'm',
  ['ଯ']: 'y', ['ର']: 'r', ['ଲ']: 'l', ['ଳ']: 'l', ['ୱ']: 'w',
  ['ଵ']: 'w', ['ଶ']: 'sh', ['ଷ']: 'sh', ['ସ']: 's', ['ହ']: 'h',
  ['ୟ']: 'y',
};

const CLUSTER: Record<string, string> = {
  [`ଡ${NUKTA}`]: 'd',
  [`ଢ${NUKTA}`]: 'dh',
};

const INDEPENDENT: Record<string, string> = {
  ['ଅ']: 'a', ['ଆ']: 'aa', ['ଇ']: 'i', ['ଈ']: 'ii',
  ['ଉ']: 'u', ['ଊ']: 'uu', ['ଋ']: 'ru', ['ଏ']: 'e',
  ['ଐ']: 'ai', ['ଓ']: 'o', ['ଔ']: 'au',
};

const MATRA: Record<string, string> = {
  ['ା']: 'aa', ['ି']: 'i', ['ୀ']: 'ii', ['ୁ']: 'u',
  ['ୂ']: 'uu', ['ୃ']: 'ru', ['େ']: 'e', ['ୈ']: 'ai',
  ['ୋ']: 'o', ['ୌ']: 'au',
};

const SIGN: Record<string, string> = {
  ['ଂ']: 'm', ['ଁ']: 'n', ['ଃ']: 'h',
};

function romanize(word: string): string {
  let out = '';
  let i = 0;
  let pendingInherent = false;

  const flushInherent = () => {
    if (pendingInherent) { out += 'a'; pendingInherent = false; }
  };

  while (i < word.length) {
    const two = word.slice(i, i + 2);

    if (CLUSTER[two] !== undefined) {
      flushInherent();
      out += CLUSTER[two];
      pendingInherent = true;
      i += 2;
      continue;
    }

    const ch = word[i] as string;

    if (ch === VIRAMA) { pendingInherent = false; i += 1; continue; }
    if (CONSONANT[ch] !== undefined) {
      flushInherent(); out += CONSONANT[ch]; pendingInherent = true; i += 1; continue;
    }
    if (MATRA[ch] !== undefined) {
      pendingInherent = false; out += MATRA[ch]; i += 1; continue;
    }
    if (INDEPENDENT[ch] !== undefined) {
      flushInherent(); out += INDEPENDENT[ch]; i += 1; continue;
    }
    if (SIGN[ch] !== undefined) {
      flushInherent(); out += SIGN[ch]; i += 1; continue;
    }
    if (ch === NUKTA) { i += 1; continue; }
    i += 1;
  }
  flushInherent();
  return out;
}

function casual(roman: string): string {
  return roman.replace(/aa/g, 'a').replace(/ii/g, 'i').replace(/uu/g, 'u');
}

/* ------------------------------------------------------------------ *
 * Failure taxonomy
 * ------------------------------------------------------------------ */

type Cause =
  | 'vowel-length'
  | 'spurious-gemination'
  | 'spurious-independent-vowel'
  | 'acronym-expansion'
  | 'retroflex-vs-dental'
  | 'nasal-sign'
  | 'hiatus-read-as-diphthong'
  | 'sibilant'
  | 'ya-vs-yya'
  | 'la-vs-lla'
  | 'vocalic-r'
  | 'nukta'
  | 'ba-vs-wa'
  | 'schwa-inherent-vowel'
  | 'conjunct-virama'
  | 'e-o-vowel-quality'
  | 'aspiration'
  | 'other';

const LONG_MATRA = 'ାୀୂ';
const SHORT_MATRA = 'ିୁେୋୈୌ';
const NASALS = 'ଁଂଃ';
const NASAL_CONS = 'ଙଞଣନମ';
const CONS_RANGE = /[କ-ହୟୱ]/;
const MATRA_RANGE = /[ା-ୌ]/;
const INDEP_RANGE = /[ଅ-ଔ]/;

const cls = (ch: string): string => {
  if (ch === NUKTA) return 'nukta';
  if (ch === VIRAMA) return 'virama';
  if (NASALS.includes(ch)) return 'sign';
  if (MATRA_RANGE.test(ch)) return 'matra';
  if (INDEP_RANGE.test(ch)) return 'indep';
  if (CONS_RANGE.test(ch)) return 'cons';
  return 'x';
};

const pairCause = (a: string, b: string): Cause | null => {
  const both = (s: string) => s.includes(a) && s.includes(b) && a !== b;
  const either = (s: string, t: string) =>
    (s.includes(a) && t.includes(b)) || (s.includes(b) && t.includes(a));

  if (both('ିୀ') || both('ୁୂ') || both('ଅଆ') || both('ଇଈ') || both('ଉଊ') || both('ାୀ')) {
    return 'vowel-length';
  }
  if (both('ତଟ') || both('ଥଠ') || both('ଦଡ') || both('ଧଢ') || both('ନଣ')) {
    return 'retroflex-vs-dental';
  }
  if (both('ଶଷସ')) return 'sibilant';
  // A nasal sign confused with a nasal consonant or a halant is the same bug.
  if (both(NASALS) || either(NASALS, NASAL_CONS + VIRAMA)) return 'nasal-sign';
  if (both('ଯୟ')) return 'ya-vs-yya';
  if (both('ଲଳ')) return 'la-vs-lla';
  if (both('ବୱଵ')) return 'ba-vs-wa';
  // "ru" is ambiguous between the vocalic r and r + u.
  if (both('ଋୃ') || either('ଋୃ', 'ୁୂର')) return 'vocalic-r';
  // aa+i, a+u etc. re-read as a single diphthong matra.
  if (either('ଇଈିୀଏେ', 'ୈଐ') || either('ଉଊୁୂଓୋ', 'ୌଔ')) return 'hiatus-read-as-diphthong';
  if (both('େୈ') || both('ୋୌ') || both('େୋ') || both('ଏଐ') || both('ଓଔ') || both('ଏଓ')) {
    return 'e-o-vowel-quality';
  }
  if (both('କଖ') || both('ଗଘ') || both('ଚଛ') || both('ଜଝ') || both('ପଫ') || both('ବଭ') ||
      both('ଡଢ') || both('ତଥ') || both('ଦଧ') || both('ଟଠ')) {
    return 'aspiration';
  }
  return null;
};

/** Cause of an insertion or deletion of a single code point. */
const soloCause = (ch: string): Cause => {
  if (ch === NUKTA) return 'nukta';
  if (ch === VIRAMA) return 'conjunct-virama';
  if (NASALS.includes(ch)) return 'nasal-sign';
  if (LONG_MATRA.includes(ch)) return 'vowel-length';
  if (ch === 'ଆ' || ch === 'ଈ' || ch === 'ଊ') return 'vowel-length';
  if (SHORT_MATRA.includes(ch)) return 'schwa-inherent-vowel';
  if (ch === 'ଅ') return 'schwa-inherent-vowel';
  if (ch === 'ୃ' || ch === 'ଋ') return 'vocalic-r';
  return 'other';
};

/**
 * Class-aware alignment. A plain Levenshtein backtrace happily pairs a matra
 * with a consonant when the cost ties, which turns `ସେଠାରେ -> ସେଥରେ` into
 * "delete ଠ, substitute ା->ଥ" instead of the linguistically real "substitute
 * ଠ->ଥ, delete ା". Costs are scaled by 10 so they stay integers.
 */
type Op = { kind: 'sub' | 'ins' | 'del'; t: string; o: string };

const INDEL = 10;
const subCost = (a: string, b: string): number => {
  if (a === b) return 0;
  if (pairCause(a, b) !== null) return 6;
  if (cls(a) === cls(b)) return 9;
  return 14; // cross-class: worse than an insert + a delete would be at 20, but close
};

function align(target: string, out: string): Op[] {
  const A = Array.from(target);
  const B = Array.from(out);
  const n = A.length;
  const m = B.length;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i]![0] = i * INDEL;
  for (let j = 0; j <= m; j++) d[0]![j] = j * INDEL;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i]![j] = Math.min(
        d[i - 1]![j]! + INDEL,
        d[i]![j - 1]! + INDEL,
        d[i - 1]![j - 1]! + subCost(A[i - 1]!, B[j - 1]!),
      );
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + subCost(A[i - 1]!, B[j - 1]!)) {
      if (A[i - 1] !== B[j - 1]) ops.push({ kind: 'sub', t: A[i - 1]!, o: B[j - 1]! });
      i--; j--; continue;
    }
    if (i > 0 && d[i]![j] === d[i - 1]![j]! + INDEL) {
      ops.push({ kind: 'del', t: A[i - 1]!, o: '' }); i--; continue;
    }
    ops.push({ kind: 'ins', t: '', o: B[j - 1]! }); j--;
  }
  return ops.reverse();
}

/**
 * The engine spelling short roman as a run of English letter names —
 * `ba -> ବିବିଏ` ("bee bee ay"), `ti -> ଟିଟିଆଇ`. Detected at word level
 * because it shows up as a scatter of unrelated insertions.
 */
function isAcronymExpansion(roman: string, target: string, out: string): boolean {
  return roman.length <= 3 &&
    Array.from(out).length >= Array.from(target).length + 2;
}

/** Insertion of a virama plus a copy of an adjacent consonant: ଏକ -> ଏକ୍କା. */
function hasSpuriousGemination(target: string, out: string): boolean {
  return /(.)୍\1/u.test(out) && !/(.)୍\1/u.test(target);
}

/**
 * A matra followed by a full independent vowel — `ତା -> ତାଆ`, `ଏଇ -> ଇଆଇ`.
 * The segmenter has split one vowel across two glyph slots. Structurally
 * different from getting vowel LENGTH wrong, so it is counted separately.
 */
const MATRA_THEN_INDEP = /[ା-ୌ][ଅ-ଔ]/u;
function hasSpuriousIndependentVowel(target: string, out: string): boolean {
  return MATRA_THEN_INDEP.test(out) && !MATRA_THEN_INDEP.test(target);
}

function causesOf(roman: string, target: string, out: string): Cause[] {
  const seen: Cause[] = [];
  const push = (c: Cause) => { if (!seen.includes(c)) seen.push(c); };

  if (isAcronymExpansion(roman, target, out)) { push('acronym-expansion'); return seen; }
  if (hasSpuriousGemination(target, out)) push('spurious-gemination');
  if (hasSpuriousIndependentVowel(target, out)) push('spurious-independent-vowel');

  for (const op of align(target, out)) {
    if (op.kind === 'sub') push(pairCause(op.t, op.o) ?? 'other');
    else if (op.kind === 'del') push(soloCause(op.t));
    else if (seen.includes('spurious-gemination') && (op.o === VIRAMA || cls(op.o) === 'cons')) {
      continue; // already accounted for by the gemination finding
    } else if (seen.includes('spurious-independent-vowel') && cls(op.o) === 'indep') {
      continue;
    } else push(soloCause(op.o));
  }
  return seen;
}

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

interface Word { odia: string; count: number; rank: number }

const freqLines = readFileSync(FREQ, 'utf8').split('\n');
const words: Word[] = [];
for (const line of freqLines) {
  if (!line) continue;
  const tab = line.indexOf('\t');
  if (tab <= 0) continue;
  const w = canonical(line.slice(0, tab));
  const c = Number(line.slice(tab + 1));
  if (Array.from(w).length < 2) continue;
  words.push({ odia: w, count: c, rank: words.length + 1 });
  if (words.length >= N) break;
}

// Lexicon: word -> the roman keys under which it is stored.
const lexKeysFor = new Map<string, string[]>();
for (const line of readFileSync(LEXICON, 'utf8').split('\n')) {
  if (!line || line.charCodeAt(0) === 35) continue;
  const a = line.indexOf('\t');
  if (a <= 0) continue;
  const b = line.indexOf('\t', a + 1);
  const key = line.slice(0, a).toLowerCase();
  const word = canonical((b === -1 ? line.slice(a + 1) : line.slice(a + 1, b)).trim());
  const arr = lexKeysFor.get(word);
  if (arr) { if (arr.length < 40) arr.push(key); } else lexKeysFor.set(word, [key]);
}

const engine = createEngineFromDisk();

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

interface Row {
  odia: string; count: number; corpusRank: number;
  roman: string; rank: number; deepRank: number;
  top1: string; causes: Cause[];
  inLexicon: boolean; lexKeys: string[];
}

function run(mode: 'careful' | 'casual'): Row[] {
  const rows: Row[] = [];
  for (const w of words) {
    let roman = romanize(w.odia);
    if (mode === 'casual') roman = casual(roman);
    if (!roman) continue;
    const deep = engine.transliterateWord(roman, DEEP).map((c) => canonical(c.text));
    const deepRank = deep.indexOf(w.odia);
    const rank = deepRank >= 0 && deepRank < TOPK ? deepRank : -1;
    const top1 = deep[0] ?? '';
    const keys = lexKeysFor.get(w.odia) ?? [];
    rows.push({
      odia: w.odia, count: w.count, corpusRank: w.rank,
      roman, rank, deepRank, top1,
      causes: rank === 0 ? [] : causesOf(roman, w.odia, top1),
      inLexicon: keys.length > 0, lexKeys: keys,
    });
  }
  return rows;
}

const pct = (n: number, d: number) => (d === 0 ? ' n/a' : `${((100 * n) / d).toFixed(1)}%`);

const results: Record<string, Row[]> = {};
console.log(`\nWEB-CORPUS TOP-${N} ROUND-TRIP`);
console.log(`source: core/data/webfreq.tsv (527,477 types / 18,363,293 tokens)`);
const tokenMass = words.reduce((s, w) => s + w.count, 0);
console.log(`${words.length} words, ${tokenMass.toLocaleString()} corpus tokens, top-${TOPK}\n`);
console.log('  register   top-1     top-3     top-5     miss');
console.log('  ' + '-'.repeat(48));
for (const mode of ['careful', 'casual'] as const) {
  const rows = run(mode);
  results[mode] = rows;
  const t1 = rows.filter((r) => r.rank === 0).length;
  const t3 = rows.filter((r) => r.rank >= 0 && r.rank < 3).length;
  const t5 = rows.filter((r) => r.rank >= 0 && r.rank < TOPK).length;
  const miss = rows.filter((r) => r.rank < 0).length;
  console.log(
    `  ${mode.padEnd(10)} ${pct(t1, rows.length).padEnd(9)} ${pct(t3, rows.length).padEnd(9)} ` +
      `${pct(t5, rows.length).padEnd(9)} ${miss}/${rows.length}`,
  );
}

// Token-weighted: what fraction of running text would be got right.
console.log('\n  token-weighted (share of corpus token mass correct)');
console.log('  ' + '-'.repeat(48));
for (const mode of ['careful', 'casual'] as const) {
  const rows = results[mode]!;
  const tot = rows.reduce((s, r) => s + r.count, 0);
  const w1 = rows.filter((r) => r.rank === 0).reduce((s, r) => s + r.count, 0);
  const w3 = rows.filter((r) => r.rank >= 0 && r.rank < 3).reduce((s, r) => s + r.count, 0);
  const w5 = rows.filter((r) => r.rank >= 0).reduce((s, r) => s + r.count, 0);
  console.log(
    `  ${mode.padEnd(10)} ${pct(w1, tot).padEnd(9)} ${pct(w3, tot).padEnd(9)} ${pct(w5, tot).padEnd(9)}`,
  );
}

// Coverage split: in-lexicon vs OOV.
console.log('\n  split by lexicon coverage (casual register)');
console.log('  ' + '-'.repeat(58));
{
  const rows = results['casual']!;
  for (const [label, sel] of [
    ['in-lexicon', rows.filter((r) => r.inLexicon)],
    ['OOV', rows.filter((r) => !r.inLexicon)],
  ] as const) {
    const t1 = sel.filter((r) => r.rank === 0).length;
    const t5 = sel.filter((r) => r.rank >= 0).length;
    console.log(`  ${label.padEnd(12)} n=${String(sel.length).padEnd(5)} top-1 ${pct(t1, sel.length).padEnd(8)} top-5 ${pct(t5, sel.length)}`);
  }
}

/* ---------------- cause ranking ---------------- */

for (const mode of ['casual', 'careful'] as const) {
  const rows = results[mode]!;
  const failed = rows.filter((r) => r.rank !== 0);
  const missed = rows.filter((r) => r.rank < 0);

  const sole = new Map<Cause, Row[]>();
  const any = new Map<Cause, Row[]>();
  const soleMiss = new Map<Cause, Row[]>();
  for (const r of failed) {
    for (const c of r.causes) {
      if (!any.has(c)) any.set(c, []);
      any.get(c)!.push(r);
    }
    if (r.causes.length === 1) {
      const c = r.causes[0]!;
      if (!sole.has(c)) sole.set(c, []);
      sole.get(c)!.push(r);
      if (r.rank < 0) {
        if (!soleMiss.has(c)) soleMiss.set(c, []);
        soleMiss.get(c)!.push(r);
      }
    }
  }

  console.log(`\n\n=== FAILURE CAUSES — ${mode} register ===`);
  console.log(`${failed.length}/${rows.length} words not top-1; ${missed.length} outside top-${TOPK}.\n`);
  console.log('  cause                     sole  any   sole&miss   corpus tokens lost (sole)');
  console.log('  ' + '-'.repeat(76));
  const ranked = [...any.keys()].sort((a, b) => {
    const sa = sole.get(a)?.length ?? 0;
    const sb = sole.get(b)?.length ?? 0;
    if (sb !== sa) return sb - sa;
    return (any.get(b)?.length ?? 0) - (any.get(a)?.length ?? 0);
  });
  for (const c of ranked) {
    const s = sole.get(c) ?? [];
    const a = any.get(c) ?? [];
    const sm = soleMiss.get(c) ?? [];
    const tok = s.reduce((x, r) => x + r.count, 0);
    console.log(
      `  ${c.padEnd(26)}${String(s.length).padEnd(6)}${String(a.length).padEnd(6)}${String(sm.length).padEnd(12)}${tok.toLocaleString()}`,
    );
  }
  const multi = failed.filter((r) => r.causes.length > 1).length;
  console.log(`  ${'(words with >1 cause)'.padEnd(26)}${String(multi).padEnd(6)}`);

  if (mode === 'casual') {
    console.log('\n  examples per cause (want -> got), highest corpus frequency first:');
    for (const c of ranked.slice(0, 12)) {
      const s = (sole.get(c) ?? []).slice().sort((a, b) => b.count - a.count).slice(0, 5);
      if (!s.length) continue;
      console.log(`\n    ${c}`);
      for (const r of s) {
        console.log(
          `      r${String(r.corpusRank).padStart(3)} ${r.roman.padEnd(14)} want ${r.odia.padEnd(12)} got ${r.top1.padEnd(12)} rank=${r.rank} deep=${r.deepRank} lex=${r.inLexicon ? 'Y' : 'n'}`,
        );
      }
    }
  }
}

/* ---------------- how fixable is each cause ---------------- */
{
  const rows = results['casual']!;
  const failed = rows.filter((r) => r.rank !== 0);
  const byCause = new Map<Cause, Row[]>();
  for (const r of failed) for (const c of r.causes) {
    if (!byCause.has(c)) byCause.set(c, []);
    byCause.get(c)!.push(r);
  }
  console.log('\n\n=== FIXABILITY BY CAUSE (casual, "any" attribution) ===');
  console.log('  how far away is the right answer when this cause is involved?\n');
  console.log('  cause                     words  rank2-5  rank6-50  unreachable');
  console.log('  ' + '-'.repeat(66));
  const ranked = [...byCause.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [c, rs] of ranked) {
    const near = rs.filter((r) => r.deepRank > 0 && r.deepRank < TOPK).length;
    const far = rs.filter((r) => r.deepRank >= TOPK).length;
    const gone = rs.filter((r) => r.deepRank < 0).length;
    console.log(`  ${c.padEnd(26)}${String(rs.length).padEnd(7)}${String(near).padEnd(9)}${String(far).padEnd(10)}${gone}`);
  }

  // Vowel length: which way does the engine guess wrong, in each register?
  console.log('\n  vowel-length direction (words where the cause is involved):');
  for (const mode of ['casual', 'careful'] as const) {
    let under = 0, over = 0, both = 0;
    for (const r of results[mode]!.filter((x) => x.rank !== 0)) {
      if (!r.causes.includes('vowel-length')) continue;
      const tl = (r.odia.match(/[ାୀୂଆଈଊ]/gu) ?? []).length;
      const ol = (r.top1.match(/[ାୀୂଆଈଊ]/gu) ?? []).length;
      if (tl > ol) under++; else if (ol > tl) over++; else both++;
    }
    console.log(
      `    ${mode.padEnd(8)} engine too SHORT ${String(under).padStart(3)}   too LONG ${String(over).padStart(3)}   same count, wrong place ${both}`,
    );
  }
  console.log('    (careful register writes the length out explicitly, so every');
  console.log('     careful-register case is the engine ignoring information it was given)');
}

/* ---------------- reachability of misses ---------------- */
{
  const rows = results['casual']!;
  const missed = rows.filter((r) => r.rank < 0);
  const deepHit = missed.filter((r) => r.deepRank >= 0);
  console.log(`\n\n=== REACHABILITY OF THE ${missed.length} TOP-${TOPK} MISSES (casual) ===`);
  console.log(`  found within top-${DEEP} but below top-${TOPK}: ${deepHit.length}  (a ranking problem)`);
  console.log(`  not generated at all within top-${DEEP}:        ${missed.length - deepHit.length}  (a generation/coverage problem)`);
  const inLexMissed = missed.filter((r) => r.inLexicon);
  console.log(`  of the misses, target IS in lexicon.tsv:      ${inLexMissed.length}`);
  console.log(`  ... but under a roman key != our derived one: ${inLexMissed.filter((r) => !r.lexKeys.includes(r.roman)).length}`);
  console.log('\n  worst misses by corpus frequency:');
  for (const r of missed.slice().sort((a, b) => b.count - a.count).slice(0, 40)) {
    const keyNote = r.inLexicon
      ? `lexkeys=[${r.lexKeys.slice(0, 3).join(',')}]`
      : 'NOT IN LEXICON';
    console.log(
      `    r${String(r.corpusRank).padStart(3)} ${String(r.count).padStart(7)}  ${r.roman.padEnd(14)} want ${r.odia.padEnd(12)} got ${r.top1.padEnd(12)} deep=${String(r.deepRank).padStart(3)} [${r.causes.join('+') || '-'}] ${keyNote}`,
    );
  }
}

/* ---------------- who produced the wrong top-1: lexicon or rules? ---------------- */
{
  console.log('\n\n=== ROOT CAUSE: WHICH SUBSYSTEM PRODUCED THE WRONG TOP-1 ===');
  for (const mode of ['casual', 'careful'] as const) {
    const rows = results[mode]!;
    const trackA: Row[] = []; // a lexicon entry took rank 1
    const trackB: Row[] = []; // a rule candidate took rank 1
    let lexBeatsCorrectRule = 0;
    let lexBeatsTokens = 0;
    const ex: string[] = [];
    for (const r of rows) {
      if (r.rank === 0) continue;
      const c = engine.transliterateWord(r.roman, DEEP);
      const src = c[0]?.source;
      (src === 'lexicon' ? trackA : trackB).push(r);
      const idx = c.findIndex((x) => canonical(x.text) === r.odia);
      if (src === 'lexicon' && idx > 0 && c[idx]!.source === 'rule') {
        lexBeatsCorrectRule++;
        lexBeatsTokens += r.count;
        if (ex.length < 12) {
          ex.push(
            `      r${String(r.corpusRank).padStart(3)} ${r.roman.padEnd(13)} lexicon ${canonical(c[0]!.text).padEnd(12)} ${c[0]!.score.toFixed(2)}  beat  rule ${r.odia.padEnd(12)} ${c[idx]!.score.toFixed(2)} (rank ${idx})`,
          );
        }
      }
    }
    const causeTable = (rs: Row[], label: string) => {
      const m = new Map<Cause, { n: number; tok: number }>();
      for (const r of rs) for (const c of r.causes) {
        if (!m.has(c)) m.set(c, { n: 0, tok: 0 });
        const e = m.get(c)!; e.n++; e.tok += r.count;
      }
      console.log(`\n    ${label} — ${rs.length} words, ${rs.reduce((s, r) => s + r.count, 0).toLocaleString()} tokens, ${rs.filter((r) => r.rank < 0).length} outside top-${TOPK}`);
      for (const [k, v] of [...m].sort((a, b) => b[1].n - a[1].n)) {
        console.log(`      ${k.padEnd(28)}${String(v.n).padStart(4)}   ${v.tok.toLocaleString()}`);
      }
    };
    console.log(`\n  --- ${mode} register ---`);
    console.log(`  top-1 lost because a LEXICON entry outranked a CORRECT rule candidate:`);
    console.log(`    ${lexBeatsCorrectRule}/${rows.length} words = ${pct(lexBeatsCorrectRule, rows.length)}, ${lexBeatsTokens.toLocaleString()} corpus tokens`);
    if (mode === 'casual') console.log(ex.join('\n'));
    causeTable(trackA, 'TRACK A: wrong top-1 came from the LEXICON');
    causeTable(trackB, 'TRACK B: wrong top-1 came from a RULE path');
  }
}

/* ---------------- nukta, verified by code point ---------------- */
{
  const rows = results['casual']!;
  const nuk = rows.filter((r) => r.odia.includes(NUKTA));
  const cp = (s: string) =>
    Array.from(s).map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ');
  let scanned = 0, precomposed = 0, nonCanonical = 0;
  for (const r of rows) {
    for (const c of engine.transliterateWord(r.roman, DEEP)) {
      scanned++;
      if (/[ଡ଼ଢ଼]/u.test(c.text)) precomposed++;
      if (canonical(c.text) !== c.text) nonCanonical++;
    }
  }
  console.log('\n\n=== NUKTA, BY CODE POINT ===');
  console.log(`  targets in the top-${N} containing U+0B3C: ${nuk.length}`);
  for (const r of nuk) {
    console.log(`    r${r.corpusRank} ${r.roman.padEnd(10)} want ${r.odia} [${cp(r.odia)}]`);
    console.log(`    ${' '.repeat(String(r.corpusRank).length + 1)} ${' '.repeat(10)} got  ${r.top1} [${cp(r.top1)}] rank=${r.rank} deep=${r.deepRank}`);
  }
  console.log(`  engine candidates scanned: ${scanned}`);
  console.log(`  containing precomposed U+0B5C / U+0B5D: ${precomposed}`);
  console.log(`  not already equal to canonical(): ${nonCanonical}`);
}

/* ---------------- careful->casual ablation ---------------- */
{
  const ca = results['careful']!;
  const cs = results['casual']!;
  const byWord = new Map(ca.map((r) => [r.odia, r]));
  let regress1 = 0;
  let regress5 = 0;
  const examples: Row[] = [];
  for (const r of cs) {
    const c = byWord.get(r.odia);
    if (!c) continue;
    if (c.rank === 0 && r.rank !== 0) { regress1++; examples.push(r); }
    if (c.rank >= 0 && r.rank < 0) regress5++;
  }
  console.log(`\n\n=== ABLATION: careful -> casual (isolates long-vowel collapse exactly) ===`);
  console.log(`  words correct at top-1 in careful but not in casual: ${regress1}`);
  console.log(`  words inside top-${TOPK} in careful but missed in casual: ${regress5}`);
  console.log(`  -> vowel-length collapse alone costs ${regress1}/${cs.length} = ${pct(regress1, cs.length)} of top-1`);
  console.log('  highest-frequency casualties:');
  for (const r of examples.sort((a, b) => b.count - a.count).slice(0, 15)) {
    console.log(`    r${String(r.corpusRank).padStart(3)} ${r.roman.padEnd(14)} want ${r.odia.padEnd(12)} got ${r.top1}`);
  }
}

if (JSONOUT) {
  writeFileSync(JSONOUT, JSON.stringify({ n: N, topk: TOPK, deep: DEEP, results }, null, 1));
  console.log(`\nwrote ${JSONOUT}`);
}
console.log('');
