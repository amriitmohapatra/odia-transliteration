// English -> Odia words with the Claude API (V2.21; owner, 2026-11-09: "expand the English
// to Odia word translation powered by the Claude console ... cast the net as wide as
// possible", including words Odia says with a phrase).
//
// Steps (from the repository root; needs ANTHROPIC_API_KEY, the owner's Console key):
//   npx tsx tools/build-data/english_api.ts pilot   LIST OUT.jsonl [FROM] [COUNT] [EFFORT]
//   npx tsx tools/build-data/english_api.ts submit  LIST STATE.json [EFFORT]
//   npx tsx tools/build-data/english_api.ts collect STATE.json OUT.jsonl
//   npx tsx tools/build-data/english_api.ts build   OUT.tsv REPORT.tsv RAW.jsonl [RAW2.jsonl ...]
//   npx tsx tools/build-data/english_api.ts pack    [TSV]   (after a hand edit of the TSV)
// LIST: tools/build-data/english_wordlist.py. pilot calls the Messages API directly (to tune
// the prompt and measure cost); submit/collect use the Message Batches API (half price).
// build checks every Odia word against the app's word lists and writes
// Appv2/src/dictionary/english-api.tsv and its gzip english-api.bin (the file the app
// fetches). The raw model output stays outside the repository.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import Anthropic from '@anthropic-ai/sdk';

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
- kind "skip": a person's name or surname, a brand, a non-English word, an abbreviation that is not used as a word, a swear word, a slur or a sexual vulgarity. Give no senses. Place names (cities, countries, rivers, states) are not skipped: give their usual Odia name.

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

export function requestParams(words: readonly string[], effort: Effort): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // The same system prompt on every request: cached after the first.
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `English words and expressions, one per line:\n${words.join('\n')}` }],
    output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } },
  };
}

/**
 * The owner's Console key, always against the public API. This session sets
 * ANTHROPIC_BASE_URL for its own connection; the SDK would read it, so the base URL is
 * pinned here and the key comes only from ANTHROPIC_API_KEY.
 */
function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Set ANTHROPIC_API_KEY (the owner’s Console key) in the environment settings.');
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

async function submit(list: string, state: string, effort: Effort = 'low'): Promise<void> {
  const api = client();
  const parts = chunks(readList(list), CHUNK);
  const ids = parts.map((_, i) => `c${String(i).padStart(5, '0')}`);
  const batch = await api.messages.batches.create({
    requests: parts.map((part, i) => ({ custom_id: ids[i]!, params: requestParams(part, effort) })),
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

/* ------------------------------------------------------------------ *
 * build: validate and write english-api.tsv
 * ------------------------------------------------------------------ */

/** Canonical Odia, joiners removed (ZWJ/ZWNJ are invisible and break exact lookup). */
export function cleanOdia(raw: string): string {
  return canonical(raw.replace(/[‌‍]/g, '').replace(/\s+/g, ' ').trim());
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
  return words;
}

interface Entry { english: string; kind: string; base: string; senses: { sense: string; odia: string[] }[] }

function build(out: string, report: string, raws: readonly string[]): void {
  const known = attestedWords();
  const rows: string[] = [];
  const dropped: string[] = ['english\tsense\todia\twhy'];
  const counts = { asked: 0, word: 0, phrase: 0, form: 0, skip: 0, missing: 0, options: 0, kept: 0, unattested: 0, notOdia: 0 };
  const seen = new Set<string>();
  for (const raw of raws) {
    for (const line of readFileSync(raw, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line) as RawLine;
      if (!r.entries) continue;
      const asked = new Set(r.words);
      counts.asked += r.words.length;
      for (const e of r.entries as Entry[]) {
        const english = String(e.english ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        // Only words that were asked, each once (a retry may repeat them).
        if (!asked.has(english) || seen.has(english) || !/^[a-z][a-z '-]*$/.test(english)) continue;
        seen.add(english);
        if (e.kind === 'skip') { counts.skip++; continue; }
        if (e.kind === 'form') {
          const base = String(e.base ?? '').trim().toLowerCase();
          if (/^[a-z][a-z '-]*$/.test(base) && base !== english) { rows.push(`${english}\tform\t\t${base}`); counts.form++; }
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
            if (!odia.split(' ').every((p) => known.has(p))) { counts.unattested++; dropped.push(`${english}\t${sense}\t${odia}\tnot in the word lists`); continue; }
            if (!keep.includes(odia)) keep.push(odia);
          }
          if (keep.length) {
            any = true;
            counts.kept += keep.length;
            rows.push(`${english}\t${e.kind === 'phrase' ? 'phrase' : 'word'}\t${sense}\t${keep.join('|')}`);
          }
        }
        if (any) counts[e.kind === 'phrase' ? 'phrase' : 'word']++;
        else counts.missing++;
      }
    }
  }
  const head = `# english-api.tsv: English -> Odia, generated with Claude (${MODEL}) through the owner's
# Anthropic Console key by tools/build-data/english_api.ts (V2.21, 2026-11). Every Odia word
# was checked against the app's own word lists; the rest were dropped (english_api.ts build).
# AI-written, not yet checked by a native speaker. Licence: MIT (this project).
# Format: english <TAB> kind <TAB> sense <TAB> value
#   kind  word | phrase: value = Odia options, "|"-separated, the everyday one first
#         form: value = the English base word (ran -> run); sense empty
#   sense a short English label when a word has two or three senses, else empty
`;
  writeFileSync(out, head + rows.sort().join('\n') + '\n');
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
    build: async () => build(args[0]!, args[1]!, args.slice(2)),
    pack: async () => pack(args[0]),
  }[command as 'pilot'];
  if (!run) throw new Error('usage: english_api.ts pilot|submit|collect|build ... (see the top of the file)');
  await run();
}
