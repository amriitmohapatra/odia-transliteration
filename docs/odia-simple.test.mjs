/**
 * Regression tests for the standalone docs/odia-simple.html.
 *
 *   node docs/odia-simple.test.mjs
 *
 * The page is deliberately one self-contained file with no build step, so this
 * test extracts its <script> block and evaluates the engine half directly.
 * Every case below is here because it was once WRONG in a way that shipped:
 *
 *   gy   was read as the ITRANS digraph for ଜ୍ଞ    -> bhagya gave ଭଜ୍ଞ
 *   ny   likewise for ଞ                            -> dhanyabaada gave ଧଞବାଦ
 *   H    lost to lowercase h at equal key length   -> duHkha gave ଦୁହ୍ଖ
 *   y    always ଯ, never positional ୟ              -> raajya gave ରାଜ୍ଯ
 *   CAPS never emitted a halant before joining     -> ShaNDha gave ଷଣଢ
 *
 * The nukta invariant is checked too: ଡ଼/ଢ଼ must be stored decomposed
 * (U+0B21/U+0B22 + U+0B3C), never the precomposed U+0B5C/U+0B5D.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(HERE, 'odia-simple.html');

const html = readFileSync(PAGE, 'utf8');
const script = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
if (!script) {
  console.error('FATAL: no <script> block found in odia-simple.html');
  process.exit(1);
}

// Keep the engine, drop the UI half (which needs a DOM).
const engineSource = script[1].split('/* ------------------------------------------------- learned choices')[0];

const factory = new Function(
  `${engineSource}\n; return { word, candidates };`,
);
// `recall` lives in the UI half; with no saved choices it always returns null.
globalThis.recall = () => null;
const { word, candidates } = factory();

const CASES = [
  // capitals mean retroflex, and must still form conjuncts
  ['ShaNDha', 'ଷଣ୍ଢ'],
  ['muNDe', 'ମୁଣ୍ଡେ'],
  ['paNDita', 'ପଣ୍ଡିତ'],
  ['kaNTha', 'କଣ୍ଠ'],
  ['chaNDa', 'ଚଣ୍ଡ'],
  ['paaNi', 'ପାଣି'],

  // ny / gy are two letters, not ଞ / ଜ୍ଞ
  ['dhanyabaada', 'ଧନ୍ୟବାଦ'],
  ['bhaagya', 'ଭାଗ୍ୟ'],

  // Nasal assimilation: a typed "n" is five letters depending on what follows.
  // "ng" used to be a key for ଙ and swallowed the next consonant — ଗଙ, not ଗଙ୍ଗ.
  ['nka', 'ଙ୍କ'],
  ['Baabunka', 'ବାବୁଙ୍କ'],
  ['ganga', 'ଗଙ୍ଗ'],
  ['ranga', 'ରଙ୍ଗ'],
  ['banka', 'ବଙ୍କ'],
  ['panchama', 'ପଞ୍ଚମ'],
  ['anta', 'ଅନ୍ତ'],
  ['sambaada', 'ସମ୍ବାଦ'],
  ['munDa', 'ମୁଣ୍ଡ'],
  // no place to assimilate to: sibilants take ଂ, semivowels take ନ
  ['sanskaara', 'ସଂସ୍କାର'],
  ['nyaaya', 'ନ୍ୟାୟ'],

  // "ri"/"ru" are the vocalic vowel ଋ/ୃ, but far more often they are just
  // ର + a vowel. Reading them only as the vocalic broke every one of these:
  // kari gave କଋ, guru gave ଗୁଋ. କରି alone is 77,908 in the web corpus.
  ['kari', 'କରି'],
  ['karibaa', 'କରିବା'],
  ['guru', 'ଗୁରୁ'],
  ['dhari', 'ଧରି'],
  ['hari', 'ହରି'],
  // "rii"/"ruu" are ର + an explicitly long vowel, not "ri" plus a stray "i"
  ['naarii', 'ନାରୀ'],
  ['purii', 'ପୁରୀ'],
  ['shree', 'ଶ୍ରୀ'],
  // curated: too many simultaneous ambiguities for rules alone
  ['shri', 'ଶ୍ରୀ'],
  ['krishna', 'କୃଷ୍ଣ'],

  // a capital is an explicit signal and must beat a longer lowercase key:
  // "R" (ଡ଼) was losing to "ri" (ଋ), so Ri gave the wrong letter entirely
  ['Ri', 'ଡ଼ି'],
  ['Rhi', 'ଢ଼ି'],

  // ଯ word-initially, ୟ elsewhere
  ['yoga', 'ଯୋଗ'],
  ['raajya', 'ରାଜ୍ୟ'],
  ['nyaaya', 'ନ୍ୟାୟ'],
  ['saahitya', 'ସାହିତ୍ୟ'],

  // signs are case-sensitive and must beat their lowercase consonant
  ['duHkha', 'ଦୁଃଖ'],
  ['mu~', 'ମୁଁ'],
  ['aMsha', 'ଅଂଶ'],

  // nukta, and the curated common words
  ['odisha', 'ଓଡ଼ିଶା'],
  ['odiaa', 'ଓଡ଼ିଆ'],
  ['baRa', 'ବଡ଼'],
  ['paRhaa', 'ପଢ଼ା'],
  ['bhagya', 'ଭାଗ୍ୟ'],

  // ordinary words
  ['namaskaara', 'ନମସ୍କାର'],
  ['kemiti', 'କେମିତି'],
  ['achha', 'ଅଛ'],
  ['bhala', 'ଭଲ'],
  ['tume', 'ତୁମେ'],
  ['eka', 'ଏକ'],
  ['ksha', 'କ୍ଷ'],
  ['jnyaana', 'ଜ୍ଞାନ'],
  ['swara', 'ସ୍ୱର'],
  ['vidyaa', 'ବିଦ୍ୟା'],
  ['kamal_', 'କମଲ୍'],
];

/** A word with several readings must OFFER the right one, even if not first. */
const IN_LIST = [
  ['chanda', 'ଚାନ୍ଦ'],
  ['kala', 'କଳା'],
  ['kala', 'କାଳ'],
  ['mana', 'ମାନ'],
];

let failures = 0;

for (const [input, expected] of CASES) {
  const got = word(input).text;
  if (got !== expected) {
    console.log(`FAIL  ${input.padEnd(14)} -> ${got}   expected ${expected}`);
    failures += 1;
  }
}

for (const [input, expected] of IN_LIST) {
  const list = candidates(input, 9).map((c) => c.text);
  if (!list.includes(expected)) {
    console.log(`FAIL  ${input.padEnd(14)} candidate list is missing ${expected}`);
    console.log(`        got: ${list.join(' ')}`);
    failures += 1;
  }
}

// The invariant. These two look identical on screen, so check by code point.
for (const [input] of CASES) {
  const got = word(input).text;
  if (/[ଡ଼ଢ଼]/.test(got)) {
    console.log(`FAIL  ${input}: precomposed nukta in output (${got})`);
    failures += 1;
  }
}

const total = CASES.length + IN_LIST.length;
if (failures === 0) {
  console.log(`odia-simple.html: ${total} checks passed, no precomposed nukta.`);
} else {
  console.log(`\nodia-simple.html: ${failures} FAILED out of ${total}.`);
  process.exit(1);
}
