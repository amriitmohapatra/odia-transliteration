/**
 * English -> Odia: one search for the dictionary panel and for "=word" in the text box
 * (owner, 2026-11-03: type "cow", get ଗାଈ).
 *
 * Layers, in this order, each word once (owner meanings first among the lists):
 *   1. english.tsv       the curated starter list (seed / owner); explained senses
 *   2. english-ai.tsv    about 2,000 everyday English words, written by Claude for
 *                        this project (AI-written, not yet checked)
 *   3. the app's own meanings read backwards: the owner's meanings (glosses.tsv) and
 *      the AI meanings (meanings.tsv) whose meaning, or one of its senses, is exactly
 *      the English word ("elephant" -> ହାତୀ). Exact sense only: no prefix, no Praharaj
 *      (its 1930s English is too often an old sense).
 *   4. english-api.tsv   about 45,000 words and expressions generated with the Claude API
 *                        (V2.21), loaded lazily (english-data.ts); senses, phrases and
 *                        inflected forms (ran -> run). Between the AI list and layer 3.
 *
 * Offline and synchronous; nothing here feeds the phonetic ranker (learn()).
 */
import { canonical } from '../../../core/src/normalize.js';
import { normalizeEnglish, searchEnglish, type EnglishEntry } from './english.js';

export type EnglishSource = 'curated' | 'ai-list' | 'api-list' | 'owner-meaning' | 'ai-meaning';

export interface EnglishHit {
  odia: string;
  /** The English key that matched (after the plural or "to" fallback). */
  english: string;
  source: EnglishSource;
  /** True for an exact headword; false for a curated prefix suggestion. */
  exact: boolean;
  /** The curated entry, for its sense note and status. */
  entry?: EnglishEntry;
  /** english-api.tsv: the sense label when the word has more than one ("river side"). */
  sense?: string;
  /** english-api.tsv: an Odia phrase for a word Odia has no single word for. */
  phrase?: boolean;
}

/** One sense of a word in english-api.tsv. */
export interface ApiSense { phrase: boolean; sense: string; odia: string[] }
/** english-api.tsv parsed: the senses of each English word, and inflected forms -> base word. */
export interface ApiList { senses: Map<string, ApiSense[]>; forms: Map<string, string> }

const ENGLISH_KEY = /^[a-z][a-z '-]*$/;

/**
 * english-api.tsv (V2.21, generated with the Claude API by tools/build-data/english_api.ts):
 * english <TAB> kind (word | phrase | form) <TAB> sense <TAB> Odia options, or the base word
 * for a form. Strict: a bad row fails loudly, as for the other data files.
 */
export function parseEnglishApi(tsv: string, file = 'english-api.tsv'): ApiList {
  const senses = new Map<string, ApiSense[]>();
  const forms = new Map<string, string>();
  for (const [index, line] of tsv.split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    const fail = (message: string): never => { throw new Error(`${file}:${index + 1}: ${message}`); };
    const cells = line.split('\t');
    if (cells.length !== 4) fail('expected four fields: english, kind, sense, value');
    const [english, kind, sense, value] = cells as [string, string, string, string];
    if (!ENGLISH_KEY.test(english) || english !== normalizeEnglish(english)) fail(`invalid English "${english}"`);
    if (kind === 'form') {
      if (!ENGLISH_KEY.test(value) || sense) fail(`a form needs an English base word and no sense: "${english}"`);
      forms.set(english, value);
      continue;
    }
    if (kind !== 'word' && kind !== 'phrase') fail(`unknown kind "${kind}"`);
    const options = value.split('|');
    for (const word of options) {
      if (!/^[\u0b00-\u0b7f]+( [\u0b00-\u0b7f]+)*$/.test(word)) fail(`not an Odia word: "${word}"`);
      if (word !== canonical(word)) fail(`not canonical: "${word}"`);
    }
    const list = senses.get(english) ?? [];
    list.push({ phrase: kind === 'phrase', sense, odia: options });
    senses.set(english, list);
  }
  return { senses, forms };
}

/** english-ai.tsv: english <TAB> odia|odia|... Strict: a bad row fails loudly. */
export function parseEnglishAi(tsv: string, file = 'english-ai.tsv'): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [index, line] of tsv.split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    const fail = (message: string): never => { throw new Error(`${file}:${index + 1}: ${message}`); };
    const cells = line.split('\t');
    if (cells.length !== 2) fail('expected two fields: english, odia options');
    const [english, odia] = cells as [string, string];
    if (english !== normalizeEnglish(english) || !/^[a-z][a-z '-]*$/.test(english)) fail(`invalid English "${english}"`);
    if (out.has(english)) fail(`duplicate English "${english}"`);
    const options = odia.split('|');
    for (const word of options) {
      if (!/^[଀-୿]+( [଀-୿]+)*$/.test(word)) fail(`not an Odia word: "${word}"`);
      if (word !== canonical(word)) fail(`not canonical: "${word}"`);
    }
    if (new Set(options).size !== options.length) fail(`repeated Odia option for "${english}"`);
    out.set(english, options);
  }
  return out;
}

/**
 * The English keys a meaning line stands for: each sense (split on ; , /), without a
 * bracketed note, a leading "to", "a", "an" or "the", and only plain English of at
 * most three words. "to go; going" -> ["go", "going"].
 */
export function meaningKeys(meaning: string): string[] {
  const keys: string[] = [];
  for (const raw of meaning.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[;,/]/)) {
    const key = raw.trim().replace(/^(to|a|an|the)\s+/, '').replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
    if (/^[a-z][a-z' -]*$/.test(key) && key.split(' ').length <= 3 && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** English key -> Odia words, from TSV rows of odia <TAB> meaning <TAB> ... (status in `statusCol`). */
export function reverseMeanings(tsv: string, statusCol: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of tsv.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const cells = line.split('\t');
    const odia = cells[0];
    const meaning = cells[1];
    // One-letter words (ଦ for "the", ସି for "c") are spellings of English letters, not answers.
    if (!odia || [...odia].length < 2 || !meaning || cells[statusCol] === 'wrong' || odia.includes(' ') || odia.startsWith('-')) continue;
    // The first sense is the word's main meaning; later senses still count, but go last.
    for (const key of meaningKeys(meaning)) {
      if (key.length < 2) continue;
      const list = out.get(key) ?? [];
      if (!list.includes(odia)) list.push(odia);
      out.set(key, list);
    }
  }
  return out;
}

/** Irregular English forms -> the base word the lists are keyed on. */
const IRREGULAR: Readonly<Record<string, string>> = Object.fromEntries(
  ('was:be were:be been:be being:be am:be is:be are:be went:go gone:go came:come saw:see seen:see ' +
  'knew:know known:know took:take taken:take gave:give given:give got:get gotten:get made:make said:say ' +
  'told:tell thought:think found:find left:leave felt:feel brought:bring bought:buy kept:keep ran:run ' +
  'sat:sit stood:stand wrote:write written:write ate:eat eaten:eat drank:drink slept:sleep met:meet ' +
  'led:lead shot:shoot lost:lose won:win paid:pay sent:send built:build taught:teach caught:catch ' +
  'fought:fight sold:sell spoke:speak spoken:speak heard:hear held:hold began:begin begun:begin ' +
  'broke:break broken:break chose:choose chosen:choose drove:drive driven:drive fell:fall fallen:fall ' +
  'forgot:forget forgotten:forget grew:grow grown:grow hid:hide hidden:hide hung:hang meant:mean ' +
  'rode:ride rose:rise risen:rise shook:shake sang:sing sung:sing sank:sink spent:spend stole:steal ' +
  'stolen:steal swam:swim threw:throw thrown:throw understood:understand woke:wake wore:wear worn:wear ' +
  'wept:weep flew:fly flown:fly drew:draw drawn:draw blew:blow bit:bite dug:dig fed:feed fled:flee ' +
  'forgave:forgive lay:lie lit:light sought:seek swept:sweep tore:tear torn:tear wound:wind ' +
  'children:child men:man women:woman feet:foot teeth:tooth mice:mouse geese:goose lives:life ' +
  'wives:wife knives:knife leaves:leaf better:good best:good worse:bad worst:bad').split(' ').map((p) => p.split(':') as [string, string]),
);

/**
 * The query and its fallbacks, tried in order until one answers: "to go" -> "go";
 * "cows" -> "cow"; "berries" -> "berry"; "went" -> "go"; "looking" -> "look";
 * "making" -> "make"; "running" -> "run"; "asked" -> "ask"; "tried" -> "try".
 */
export function englishVariants(query: string): string[] {
  const q = normalizeEnglish(query).replace(/^to\s+/, '');
  const out = [q];
  const irregular = IRREGULAR[q];
  if (irregular) out.push(irregular);
  if (/[^s]s$/.test(q)) out.push(q.slice(0, -1));
  if (/(ch|sh|x|ss|o)es$/.test(q)) out.push(q.slice(0, -2));
  if (/ies$/.test(q)) out.push(`${q.slice(0, -3)}y`);
  for (const [suffix, min] of [['ing', 3], ['ed', 2]] as const) {
    if (!q.endsWith(suffix) || q.length < suffix.length + min) continue;
    const stem = q.slice(0, -suffix.length);
    out.push(stem, `${stem}e`);
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) out.push(stem.slice(0, -1)); // running -> run
    if (suffix === 'ed' && stem.endsWith('i')) out.push(`${stem.slice(0, -1)}y`); // tried -> try
  }
  if (/ly$/.test(q) && q.length > 4) out.push(q.slice(0, -2)); // quickly -> quick
  return out.filter((v, i) => v.length > 1 && out.indexOf(v) === i);
}

export class EnglishIndex {
  constructor(
    private readonly curated: readonly EnglishEntry[],
    private readonly aiList: ReadonlyMap<string, readonly string[]>,
    private readonly ownerMeanings: ReadonlyMap<string, readonly string[]>,
    private readonly aiMeanings: ReadonlyMap<string, readonly string[]>,
    private api?: ApiList,
  ) {}

  /** The generated list arrives later (a separate, lazily loaded file). */
  setApi(api: ApiList): void {
    this.api = api;
  }

  get hasApi(): boolean {
    return this.api !== undefined;
  }

  /**
   * All hits for an English query, best first, each Odia word once; hidden words left
   * out. `frequency` (the engine's word counts) orders the words found through the
   * meanings, most common first; the written lists keep their own order.
   */
  search(query: string, hide: (word: string) => boolean = () => false, limit = 12,
    frequency?: (word: string) => number): EnglishHit[] {
    const hits: EnglishHit[] = [];
    const seen = new Set<string>();
    const push = (hit: EnglishHit): void => {
      const odia = canonical(hit.odia);
      if (seen.has(odia) || hide(odia)) return;
      seen.add(odia);
      hits.push({ ...hit, odia });
    };
    const variants = englishVariants(query);
    if (!variants[0]) return [];
    // An inflected form the generated list knows (ran -> run) is tried right after itself.
    for (let i = 0; i < variants.length; i++) {
      const base = this.api?.forms.get(variants[i]!);
      if (base && !variants.includes(base)) variants.splice(i + 1, 0, base);
    }
    // Curated first, exact headwords and aliases only here (prefix suggestions go last).
    const curated = searchEnglish(this.curated, variants[0], hide, 24);
    for (const { entry, exact } of curated) if (exact) push({ odia: entry.odia, english: entry.english, source: 'curated', exact, entry });
    for (const v of variants) {
      for (const odia of this.ownerMeanings.get(v) ?? []) push({ odia, english: v, source: 'owner-meaning', exact: true });
      for (const odia of this.aiList.get(v) ?? []) push({ odia, english: v, source: 'ai-list', exact: true });
      // The generated list: the first option of each sense first, so a second sense
      // (bank: river side) is not pushed out of the bar by the first sense's synonyms.
      const apiSenses = this.api?.senses.get(v) ?? [];
      const depth = Math.max(0, ...apiSenses.map((s) => s.odia.length));
      for (let k = 0; k < depth; k++) {
        for (const s of apiSenses) {
          const odia = s.odia[k];
          if (odia) push({ odia, english: v, source: 'api-list', exact: true, sense: s.sense || undefined, phrase: s.phrase || undefined });
        }
      }
      // The meanings read backwards also hold inflected forms (ଯିବାକୁ "to go"): when a
      // list already answers, they add at most two words.
      const room = hits.length > 0 ? 2 : Infinity;
      let added = 0;
      const fromMeanings = [...(this.aiMeanings.get(v) ?? [])];
      if (frequency) fromMeanings.sort((a, b) => frequency(b) - frequency(a));
      for (const odia of fromMeanings) {
        if (added >= room) break;
        const before = hits.length;
        push({ odia, english: v, source: 'ai-meaning', exact: true });
        if (hits.length > before) added++;
      }
      if (hits.length > 0) break; // "cows" found as "cows": no need for "cow"
    }
    for (const { entry, exact } of curated) if (!exact) push({ odia: entry.odia, english: entry.english, source: 'curated', exact, entry });
    return hits.slice(0, Math.max(0, Math.floor(limit)));
  }

  /** Odia words only, for the typing box's suggestion strip ("=cow"). */
  odiaFor(query: string, hide?: (word: string) => boolean, limit = 8, frequency?: (word: string) => number): string[] {
    return this.search(query, hide, limit, frequency).filter((h) => h.exact).map((h) => h.odia);
  }
}
