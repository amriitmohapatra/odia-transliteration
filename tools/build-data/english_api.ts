// English -> Odia words with the Claude API (V2.21; owner, 2026-11-09: "expand the English
// to Odia word translation powered by the Claude console ... cast the net as wide as
// possible", including words Odia says with a phrase).
//
// Steps (from the repository root; needs ODIA_CLAUDE_API_KEY, the owner's Console key; the
// platform reserves ANTHROPIC_API_KEY for the Claude Code session itself):
//   npx tsx tools/build-data/english_api.ts pilot   LIST OUT.jsonl [FROM] [COUNT] [EFFORT]
//   npx tsx tools/build-data/english_api.ts submit  LIST STATE.json [EFFORT]
//   npx tsx tools/build-data/english_api.ts collect STATE.json OUT.jsonl
//   npx tsx tools/build-data/english_api.ts retry   REPORT.tsv OUT.tsv STATE2.json [EFFORT]  (then collect)
//   npx tsx tools/build-data/english_api.ts build   OUT.tsv REPORT.tsv RAW.jsonl [RAW2.jsonl ...]
//   npx tsx tools/build-data/english_api.ts pack    [TSV]   (after a hand edit of the TSV)
// LIST: tools/build-data/english_wordlist.py. pilot calls the Messages API directly (to tune
// the prompt and measure cost); submit/collect use the Message Batches API (half price).
// build checks every Odia word against the app's word lists and writes
// Appv2/src/dictionary/english-api.tsv and its gzip english-api.bin (the file the app
// fetches). The raw model output of the 2026-11-09 run is kept, gzipped, as
// tools/build-data/english-api-raw.jsonl.gz (build reads .gz directly), so the file can be
// rebuilt and a retry needs only the words asked again.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

import Anthropic from '@anthropic-ai/sdk';

import { foldKey } from '../../Appv2/src/dictionary/lookup.js';
import { canonical } from '../../core/src/normalize.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const MODEL = 'claude-opus-5-5';
/** English words per request: small enough that one answer stays well under max_tokens. */
export const CHUNK = 40;
const MAX_TOKENS = 16000;

export const SYSTEM = `You are an expert lexicographer of the Odia language (ଓଡ଼ିଆ) as people in Odisha speak and write it today. You build an English -> Odia lookup for an Odia typing app: a user who knows the English word but not the Odia one types it and picks the Odia word to insert.

For each English word or expression in the list, answer with one entry:
- kind "word": one or more Odia words for it.
- kind "phrase": Odia has no single everyday word, so give a short natural phrase (two to six words) the way an Odia speaker would say it. Many English words need this, e.g. "babysit" -> ପିଲା ଜଗିବା, "commute" -> ନିତି ଯିବା ଆସିବା. Prefer a phrase people really use over a coined or bookish single word.
- kind "form": the English word is only an inflected form (plural, past tense, past participle, -ing, comparative, superlative) with the meaning of its base word; put the base word in "base" and give no senses. If the form has a meaning of its own (news, glasses, savings, belongings, spectacles, earnings), treat it as a word.
- kind "skip": a person's name or surname, a brand, a non-English word, an abbreviation that is not used as a word, a swear word, a slur or a sexual vulgarity, or the article "the" (Odia has none). Give no senses. Place names (cities, countries, rivers, states) are not skipped: give their usual Odia name.

Senses: give one sense, or two or three only when the English word has clearly different common meanings that need different Odia words (bank: money / river). Most common sense first. "sense" is a short English label (two to five words) when there is more than one sense, else "".

Odia options for each sense: one to four, the word most people would actually use first, then other common ones. Use standard modern Odia spelling in Odia script only (no Latin letters, no digits, no brackets, no explanations). For verbs give the verbal noun ending in -ବା (go -> ଯିବା, eat -> ଖାଇବା). For nouns and adjectives give the base form. When an English loan word written in Odia script is what people commonly say, include it (phone -> ଫୋନ; hospital -> ଡାକ୍ତରଖାନା, ହସ୍ପିଟାଲ). Do not write English sounds in Odia script for words that are not used as loans. Never guess a word: if you are not sure an Odia word exists with this meaning, use a phrase you are sure of, or fewer options. Technical and scientific words get their accepted Odia term or the loan used in Odia text.

Return every word of the list exactly once, in the same order, with "english" copied exactly.`;

export const SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          english: { type: 'string' },
          kind: { type: 'string', enum: ['word', 'phrase', 'form', 'skip'] },
          base: { type: 'string' },
          senses: {
            type: 'array',
            items: {
              type: 'object',
              properties: { sense: { type: 'string' }, odia: { type: 'array', items: { type: 'string' } } },
              required: ['sense', 'odia'],
              additionalProperties: false,
            },
          },
        },
        required: ['english', 'kind', 'base', 'senses'],
        additionalProperties: false,
      },
    },
  },
  required: ['entries'],
  additionalProperties: false,
} as const;

type Effort = 'low' | 'medium' | 'high';

/**
 * The user turn. A retry (notFound) lists after each word the Odia spellings the build
 * could not find in any word list, so the model can give the spelling Odia newspapers
 * print (କେଳେଙ୍କାରି -> କେଳେଙ୍କାରୀ) or another common word.
 */
export function userTurn(words: readonly string[], notFound?: ReadonlyMap<string, readonly string[]>): string {
  if (!notFound) return `English words and expressions, one per line:\n${words.join('\n')}`;
  return 'English words and expressions, one per line. After "::" are Odia spellings given earlier that were not '
    + 'found in a large collection of Odia news text and word lists: they may be misspelt, rare or invented. For each '
    + 'word, give the spelling commonly printed in Odia newspapers, or a different common Odia word or phrase with the '
    + 'same meaning. Repeat a listed spelling only if you are sure it is the standard one. Copy only the English, '
    + `without the "::" part, into "english".\n${words.map((w) => `${w} :: ${(notFound.get(w) ?? []).join(', ')}`).join('\n')}`;
}

export function requestParams(words: readonly string[], effort: Effort, notFound?: ReadonlyMap<string, readonly string[]>): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // The same system prompt on every request: cached after the first.
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userTurn(words, notFound) }],
    output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } },
  };
}

/**
 * The owner's Console key, always against the public API. This session sets
 * ANTHROPIC_BASE_URL for its own connection; the SDK would read it, so the base URL is
 * pinned here and the key comes only from ODIA_CLAUDE_API_KEY (the cloud environment
 * does not pass a variable named ANTHROPIC_API_KEY to the session: that name is reserved).
 */
function client(): Anthropic {
  const apiKey = process.env.ODIA_CLAUDE_API_KEY;
  if (!apiKey) throw new Error('Set ODIA_CLAUDE_API_KEY (the owner’s Console key) in the environment settings.');
  return new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com' });
}

const readList = (path: string): string[] => readFileSync(path, 'utf8').split('\n').map((w) => w.trim()).filter(Boolean);
const chunks = <T>(xs: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** One raw line per request: the words asked, the parsed entries (or the error), the usage. */
interface RawLine { id: string; words: string[]; entries?: unknown[]; error?: string; usage?: Anthropic.Usage; stop?: string | null }

function parseMessage(message: Anthropic.Message): { entries?: unknown[]; error?: string } {
  if (message.stop_reason === 'refusal') return { error: 'refusal' };
  if (message.stop_reason === 'max_tokens') return { error: 'max_tokens' };
  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    const data = JSON.parse(text) as { entries?: unknown[] };
    return Array.isArray(data.entries) ? { entries: data.entries } : { error: 'no entries' };
  } catch {
    return { error: 'invalid JSON' };
  }
}

/** Prices for MODEL in US$ per million tokens (claude-api skill, cached 2026-10-06); batch halves them. */
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
function cost(usages: readonly Anthropic.Usage[], batch: boolean): number {
  const f = batch ? 0.5 : 1;
  return usages.reduce((sum, u) => sum + f * (
    u.input_tokens * PRICE.input + u.output_tokens * PRICE.output +
    (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) / 1e6, 0);
}

async function pilot(list: string, out: string, from = 0, count = 200, effort: Effort = 'low'): Promise<void> {
  const api = client();
  const words = readList(list).slice(from, from + count);
  const usages: Anthropic.Usage[] = [];
  const parts = chunks(words, CHUNK);
  // A few requests at a time; the SDK retries 429 and 5xx.
  for (let i = 0; i < parts.length; i += 4) {
    await Promise.all(parts.slice(i, i + 4).map(async (part, j) => {
      const id = `p${String(from + (i + j) * CHUNK).padStart(6, '0')}`;
      try {
        const message = await api.messages.create(requestParams(part, effort));
        usages.push(message.usage);
        const line: RawLine = { id, words: part, ...parseMessage(message), usage: message.usage, stop: message.stop_reason };
        appendFileSync(out, `${JSON.stringify(line)}\n`);
      } catch (error) {
        appendFileSync(out, `${JSON.stringify({ id, words: part, error: String(error) } satisfies RawLine)}\n`);
      }
    }));
  }
  const total = readList(list).length;
  const thinking = usages.reduce((s, u) => s + ((u as { output_tokens_details?: { thinking_tokens?: number } }).output_tokens_details?.thinking_tokens ?? 0), 0);
  const perWord = cost(usages, true) / words.length;
  console.log(`${words.length} words, ${usages.length} requests, effort ${effort}`);
  console.log(`tokens: input ${usages.reduce((s, u) => s + u.input_tokens, 0)}, output ${usages.reduce((s, u) => s + u.output_tokens, 0)} (thinking ${thinking}), cache read ${usages.reduce((s, u) => s + (u.cache_read_input_tokens ?? 0), 0)}`);
  console.log(`cost now US$${cost(usages, false).toFixed(3)}; as a batch US$${cost(usages, true).toFixed(3)}; whole list (${total}) as a batch about US$${(perWord * total).toFixed(2)}`);
}

async function submit(list: string | string[], state: string, effort: Effort = 'low', notFound?: ReadonlyMap<string, readonly string[]>): Promise<void> {
  const api = client();
  const parts = chunks(typeof list === 'string' ? readList(list) : list, CHUNK);
  const ids = parts.map((_, i) => `${notFound ? 'r' : 'c'}${String(i).padStart(5, '0')}`);
  const batch = await api.messages.batches.create({
    requests: parts.map((part, i) => ({ custom_id: ids[i]!, params: requestParams(part, effort, notFound) })),
  });
  writeFileSync(state, JSON.stringify({ batch: batch.id, effort, words: Object.fromEntries(ids.map((id, i) => [id, parts[i]])) }, null, 1));
  console.log(`batch ${batch.id}: ${parts.length} requests, status ${batch.processing_status}`);
}

async function collect(state: string, out: string): Promise<void> {
  const api = client();
  const { batch: id, words } = JSON.parse(readFileSync(state, 'utf8')) as { batch: string; words: Record<string, string[]> };
  let batch = await api.messages.batches.retrieve(id);
  while (batch.processing_status !== 'ended') {
    console.log(`${new Date().toISOString()} ${batch.processing_status}: ${JSON.stringify(batch.request_counts)}`);
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    batch = await api.messages.batches.retrieve(id);
  }
  const usages: Anthropic.Usage[] = [];
  const failed: string[] = [];
  for await (const result of await api.messages.batches.results(id)) {
    const asked = words[result.custom_id] ?? [];
    let line: RawLine;
    if (result.result.type === 'succeeded') {
      const message = result.result.message;
      usages.push(message.usage);
      line = { id: result.custom_id, words: asked, ...parseMessage(message), usage: message.usage, stop: message.stop_reason };
    } else {
      line = { id: result.custom_id, words: asked, error: result.result.type };
    }
    if (line.error) failed.push(result.custom_id);
    appendFileSync(out, `${JSON.stringify(line)}\n`);
  }
  console.log(`done: ${JSON.stringify(batch.request_counts)}; failed or unparsable ${failed.length}; cost about US$${cost(usages, true).toFixed(2)}`);
  if (failed.length) {
    const retry = failed.flatMap((f) => words[f] ?? []);
    writeFileSync(`${out}.retry.txt`, `${retry.join('\n')}\n`);
    console.log(`${retry.length} words to retry: ${out}.retry.txt (submit it as a new list)`);
  }
}

/**
 * retry: the words whose every Odia option the build dropped (REPORT) and that have no row
 * in TSV, asked again with the spellings that were not found (a second batch; collect it
 * as usual and pass both raw files to build, the first one first).
 */
async function retry(report: string, tsv: string, state: string, effort: Effort = 'low'): Promise<void> {
  const answered = new Set(readFileSync(tsv, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]));
  const notFound = new Map<string, string[]>();
  for (const line of readFileSync(report, 'utf8').split('\n').slice(1).filter(Boolean)) {
    const [english, , odia] = line.split('\t') as [string, string, string];
    if (answered.has(english)) continue;
    notFound.set(english, [...(notFound.get(english) ?? []), odia]);
  }
  console.log(`${notFound.size} words to ask again`);
  await submit([...notFound.keys()], state, effort, notFound);
}

/* ------------------------------------------------------------------ *
 * build: validate and write english-api.tsv
 * ------------------------------------------------------------------ */

/**
 * Canonical Odia, joiners removed (ZWJ/ZWNJ are invisible and break exact lookup), and
 * the old letter ଵ (U+0B35) written ବ as modern Odia does (ଜୀଵନ୍ତ -> ଜୀବନ୍ତ).
 */
export function cleanOdia(raw: string): string {
  return canonical(raw.replace(/[\u200c\u200d]/g, '').replace(/\u0b35/g, '\u0b2c').replace(/\s+/g, ' ').trim());
}
const ODIA_PHRASE = /^[ଁ-୷]+( [ଁ-୷]+)*$/;

/** Every Odia word the app knows from a source it trusts, plus frequent corpus words. */
export function attestedWords(minLogFreq = 0.6): Set<string> {
  const words = new Set<string>();
  const rows = (p: string): string[][] => readFileSync(ROOT + p, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
  for (const [w] of rows('core/data/indiccorp-words.tsv')) if (w) words.add(w);
  for (const r of rows('core/data/lexicon.tsv')) if (r[1]) words.add(r[1]);
  for (const [w] of rows('core/data/meanings.tsv')) if (w) for (const p of w.split(' ')) words.add(p);
  for (const [w] of rows('core/data/glosses.tsv')) if (w) words.add(w);
  for (const r of rows('Appv2/src/dictionary/english-ai.tsv')) for (const o of (r[1] ?? '').split('|')) for (const p of o.split(' ')) words.add(p);
  for (const [w, f] of rows('core/data/unigrams.tsv')) if (w && Number(f) >= minLogFreq) words.add(w);
  // What Desh keyboard users chose for a key, seen at least three times (one-off typos stay out).
  for (const [, w, n] of rows('core/data/typed.tsv')) if (w && Number(n) >= 3) words.add(w);
  // English loans in Odia script, each already attested in IndicCorp (build_loans.py).
  for (const [, w] of rows('Appv2/src/dictionary/loans.tsv')) if (w) words.add(w);
  return words;
}

/** Praharaj's headwords, in the dictionary's folded spelling (ୟ -> ଯ, ୱ/ଵ -> ବ). */
export function praharajKeys(): Set<string> {
  const text = gunzipSync(readFileSync(ROOT + 'Appv2/src/dictionary/praharaj.bin')).toString('utf8');
  const a = text.indexOf('\u0002');
  return new Set(text.slice(a + 1, text.indexOf('\u0002', a + 1)).split('\n'));
}

interface Entry { english: string; kind: string; base: string; senses: { sense: string; odia: string[] }[] }

function build(out: string, report: string, raws: readonly string[]): void {
  const words = attestedWords();
  const praharaj = praharajKeys();
  const known = (w: string): boolean => words.has(w) || praharaj.has(foldKey(w));
  const rows: string[] = [];
  const dropped: string[] = ['english\tsense\todia\twhy'];
  const counts = { asked: 0, word: 0, phrase: 0, form: 0, skip: 0, missing: 0, options: 0, kept: 0, unattested: 0, notOdia: 0 };
  // A word is settled once it has rows (or is a form or a skip); a word whose options
  // were all dropped stays open, so a later raw file (a retry) can still fill it.
  const seen = new Set<string>();
  const asked = new Set<string>();
  const missing = new Set<string>();
  for (const raw of raws) {
    const text = raw.endsWith('.gz') ? gunzipSync(readFileSync(raw)).toString('utf8') : readFileSync(raw, 'utf8');
    for (const line of text.split('\n').filter(Boolean)) {
      const r = JSON.parse(line) as RawLine;
      if (!r.entries) continue;
      const thisRequest = new Set(r.words);
      for (const w of r.words) asked.add(w);
      for (const e of r.entries as Entry[]) {
        const english = String(e.english ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        // Only words that were asked, each once (a retry may repeat them).
        if (!thisRequest.has(english) || seen.has(english) || !/^[a-z][a-z '-]*$/.test(english)) continue;
        if (e.kind === 'skip') { if (!missing.has(english)) { seen.add(english); counts.skip++; } continue; }
        if (e.kind === 'form') {
          const base = String(e.base ?? '').trim().toLowerCase();
          if (/^[a-z][a-z '-]*$/.test(base) && base !== english) { rows.push(`${english}\tform\t\t${base}`); counts.form++; seen.add(english); missing.delete(english); }
          continue;
        }
        let any = false;
        for (const s of e.senses ?? []) {
          const sense = String(s.sense ?? '').replace(/[\t\n|]/g, ' ').trim();
          const keep: string[] = [];
          for (const o of s.odia ?? []) {
            counts.options++;
            const odia = cleanOdia(String(o));
            if (!ODIA_PHRASE.test(odia)) { counts.notOdia++; dropped.push(`${english}\t${sense}\t${o}\tnot Odia`); continue; }
            // A word must be known; a phrase must be made of known words.
            if (!odia.split(' ').every(known)) { counts.unattested++; dropped.push(`${english}\t${sense}\t${odia}\tnot in the word lists`); continue; }
            if (!keep.includes(odia)) keep.push(odia);
          }
          if (keep.length) {
            any = true;
            counts.kept += keep.length;
            rows.push(`${english}\t${e.kind === 'phrase' ? 'phrase' : 'word'}\t${sense}\t${keep.join('|')}`);
          }
        }
        if (any) { counts[e.kind === 'phrase' ? 'phrase' : 'word']++; seen.add(english); missing.delete(english); }
        else missing.add(english);
      }
    }
  }
  counts.asked = asked.size;
  counts.missing = missing.size;
  const head = `# english-api.tsv: English -> Odia, generated with Claude (${MODEL}) through the owner's
# Anthropic Console key by tools/build-data/english_api.ts (V2.21, 2026-11). Every Odia word
# was checked against the app's own word lists; the rest were dropped (english_api.ts build).
# AI-written, not yet checked by a native speaker. Licence: MIT (this project).
# Format: english <TAB> kind <TAB> sense <TAB> value
#   kind  word | phrase: value = Odia options, "|"-separated, the everyday one first
#         form: value = the English base word (ran -> run); sense empty
#   sense a short English label when a word has two or three senses, else empty
`;
  // Sorted by English word only: a word's senses keep the model's order, most common first
  // (the app offers the first sense's word first; a full-line sort put lot -> "fate" first).
  const byWord = (r: string): string => r.slice(0, r.indexOf('\t'));
  const sorted = rows.map((r, i) => [r, i] as const)
    .sort(([a, i], [b, j]) => (byWord(a) < byWord(b) ? -1 : byWord(a) > byWord(b) ? 1 : i - j))
    .map(([r]) => r);
  writeFileSync(out, head + sorted.join('\n') + '\n');
  writeFileSync(report, dropped.join('\n') + '\n');
  if (out.endsWith('.tsv')) pack(out);
  console.log(JSON.stringify(counts));
}

export const API_TSV = 'Appv2/src/dictionary/english-api.tsv';

/** english-api.bin: gzip of the TSV, the asset the app fetches (gzip writes no file time, so it is reproducible). */
export function pack(tsv = ROOT + API_TSV): void {
  writeFileSync(tsv.replace(/\.tsv$/, '.bin'), gzipSync(readFileSync(tsv), { level: 9 }));
}

const [command, ...args] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  const run = {
    pilot: () => pilot(args[0]!, args[1]!, Number(args[2] ?? 0), Number(args[3] ?? 200), (args[4] ?? 'low') as Effort),
    submit: () => submit(args[0]!, args[1]!, (args[2] ?? 'low') as Effort),
    collect: () => collect(args[0]!, args[1]!),
    retry: () => retry(args[0]!, args[1]!, args[2]!, (args[3] ?? 'low') as Effort),
    build: async () => build(args[0]!, args[1]!, args.slice(2)),
    pack: async () => pack(args[0]),
  }[command as 'pilot'];
  if (!run) throw new Error('usage: english_api.ts pilot|submit|collect|retry|build ... (see the top of the file)');
  await run();
}
