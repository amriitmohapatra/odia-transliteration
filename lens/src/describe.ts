/**
 * One Odia word in, the lens card out: pronunciation, meanings, origin.
 *
 * Pure: the caller (background.ts) finds the dictionary entry and loads its
 * definition, then hands both here. The meaning order is the app's chip order
 * (Appv2/src/dictionary/overlay.ts, chipFor): the owner's meaning first, then
 * the modern layer (not its auto-detected loan lines), then Praharaj's first
 * sense. A stem or prefix match is approximate and says so.
 */

import { canonical } from '@odia/core/normalize';
import type { Glosses, Meaning, VerbEndings } from '@odia/core';

import {
  findModern,
  defAt,
  explainEnding,
  explainVerb,
  readNumber,
  meaningSource,
  modernLines,
  shortGlossOf,
  tidyGloss,
  type Dict,
  type Entry,
  type MeaningFinder,
} from '../../Appv2/src/dictionary/lookup.js';
import { originLabel } from '../../Appv2/src/dictionary/origin.js';
import { LANGUAGE_LABEL, type LoanIndex } from '../../Appv2/src/dictionary/loans.js';
import { romanize } from '../../Appv2/src/romanize.js';

/** Everything the card needs besides the Praharaj entry itself. */
export interface LensData {
  modern: Dict | null;
  /** Origin code per Praharaj key (same order as the keys), or null. */
  origin: string[] | null;
  owner: Glosses;
  loans: LoanIndex;
  /** AI-written meanings (core/data/meanings.tsv), or null without them. */
  ai: MeaningFinder | null;
  /** Verb endings (core/data/verb-endings.tsv), or null without them. */
  verbs: VerbEndings | null;
}

export interface LensMeaning {
  text: string;
  /** Where it comes from, in words, for the small line under it. */
  source: string;
}

export interface LensCard {
  /** The word as found on the page, canonical. */
  word: string;
  /** How to say it, in Latin letters (careful register: long vowels written out). */
  roman: string;
  meanings: LensMeaning[];
  /** The dictionary headword when the match is a stem or a prefix of the word. */
  approximateHead: string | null;
  /** "from Persian" and the like, or null. */
  origin: string | null;
  /** "English loan word: mobile" when the word is a known loan, or null. */
  loan: string | null;
  /** How the word is made ("ana (not) + chhaatra (student)", in Odia), or null. */
  formation: string | null;
  /** More senses of the first AI or owner meaning, or null. */
  more: string | null;
}

/** The AI layer's one-word origin, as a phrase like Praharaj's origin labels. */
const ORIGIN_PHRASE: Record<string, string> = {
  native: 'native Odia',
  sanskrit: 'from Sanskrit',
  persian: 'from Persian',
  arabic: 'from Arabic',
  english: 'from English',
  hindi: 'from Hindi',
  portuguese: 'from Portuguese',
  name: 'a name',
  mixed: 'mixed origin',
};

/** Meanings shown at most. */
const MAX_MEANINGS = 3;

/** One part of a word explained from its parts, with its short meaning. */
export interface WordPart {
  word: string;
  gloss: string;
}

/** Letters (consonants and independent vowels): what makes a part long enough to stand alone. */
const LETTER = /[\u0b05-\u0b39\u0b5c-\u0b61\u0b71]/g;
const letters = (w: string): number => w.match(LETTER)?.length ?? 0;

/**
 * The ways to cut a word into two parts of at least two letters each, without
 * cutting inside a letter cluster: the second part starts with a letter (not a
 * vowel sign, virama or nukta), and the first part does not end with a virama
 * or a joiner. A one-letter part (ra, ku, re) is an ending, not a word.
 */
export function splitPoints(word: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 1; i < word.length; i++) {
    const a = word.slice(0, i);
    const b = word.slice(i);
    if (!/^[\u0b05-\u0b39\u0b5c-\u0b61\u0b71]/.test(b)) continue;
    if (/[\u0b4d\u200c\u200d]$/.test(a)) continue;
    if (letters(a) < 2 || letters(b) < 2) continue;
    out.push([a, b]);
  }
  return out;
}

/**
 * The best ways to read a word as two known words (jibana + shaili, "life +
 * style"), best first. `known` says whether a part has a modern, AI or owner
 * meaning; the old dictionary alone is not enough (its short headwords are
 * often obscure: patha "carbuncle" in pathaajiba, "will be sent"). Best: the
 * longer shorter part (an even cut beats a long word with a two-letter tail),
 * then the longer first part.
 */
export function chooseSplits(
  word: string,
  known: (part: string) => boolean,
  /** A case form (a known word + an ending: taa + ku, "him") is never the second part of a compound. */
  inflected: (part: string) => boolean = () => false,
): Array<[string, string]> {
  return splitPoints(word)
    .filter(([a, b]) => known(a) && known(b) && !inflected(b))
    .sort(([xa, xb], [ya, yb]) => Math.min(letters(ya), letters(yb)) - Math.min(letters(xa), letters(xb)) || ya.length - xa.length);
}

/**
 * A part's meaning, short: its first sense, lower case unless it is a name or
 * an abbreviation. Null for a grammar note ("an inflection for the dative
 * case"): such a part is an ending, not a word.
 */
export function partGloss(meaning: string): string | null {
  if (/\b(inflection|affix|suffix|termination)\b/i.test(meaning)) return null;
  const g = (meaning.split(/[;,(]/)[0] as string).replace(/^maybe:\s*/, '').replace(/\s+/g, ' ').trim().replace(/[\s.:]+$/, '');
  if (g.length < 2) return null;
  return /^[A-Z][a-z]/.test(g) ? g.charAt(0).toLowerCase() + g.slice(1) : g;
}

export function describeWord(
  word: string,
  key: string,
  entry: Entry | null,
  definition: string | null,
  data: LensData,
  /** The Odia word before this one on the page, for constructions ("...-ku nei"). */
  previous = '',
  /** The word as two known words, when no dictionary has it (engine.ts, wordParts). */
  parts: readonly [WordPart, WordPart] | null = null,
): LensCard {
  const odia = canonical(word);
  const meanings: LensMeaning[] = [];
  const add = (text: string | null, source: string): void => {
    if (text === null || meanings.length >= MAX_MEANINGS) return;
    if (meanings.some((m) => m.text.toLowerCase() === text.toLowerCase())) return;
    meanings.push({ text, source });
  };

  const own = data.owner.get(odia);
  if (own) add(tidyGloss(own.meaning, false), 'meaning checked by the app owner');

  // Decision D-13: owner, then the AI layer (a construction with the previous
  // word first: "over, regarding" for nei after -ku), then modern, then Praharaj.
  const phrase = data.ai?.after(previous, odia);
  if (phrase) add(phrase.meaning, `${meaningSource(phrase)} (in this phrase)`);
  const ai: Meaning | undefined = data.ai?.word(odia);
  if (ai) add(ai.meaning, meaningSource(ai));
  const first = phrase ?? ai;

  // A quick-glance card: with an owner or AI meaning for this exact word, the
  // older layers (the modern [mt] lines, Praharaj's 1930s senses) stay in the
  // app's full panel, so "Not" for nei never sits under "over; regarding".
  // A stem match with a known ending: "state + in, at, on" (rajya + re), not "maybe: State".
  // A verb form likewise: "get + have …-ed (they; or respectful)" (paa + ichhanti).
  // Owner or AI meanings only: Praharaj's 1930s first sense of a stem is too
  // often not today's sense (tanka "thigh", not rupee; sarakaara "lord").
  const meaningOf = (w: string): string | null => data.owner.get(w)?.meaning ?? data.ai?.word(w)?.meaning ?? null;
  const explained = own || first
    ? null
    : explainEnding(odia, entry, data.ai, meaningOf) ?? explainVerb(odia, entry, data.verbs, meaningOf);
  if (explained) add(explained.text, 'explained from its ending');
  // A number in Odia digits: "24", "6 (things)", "2019 + in, at, on".
  const number = own || first || explained ? null : readNumber(odia, data.ai);
  if (number) add(number.text, 'number in Odia digits');
  // A word no dictionary has, made of two known words: "life + style"
  // (jibana + shaili), not the first part's meaning as a guess.
  const compound =
    own || first || explained || number || !parts || entry?.how === 'exact' || entry?.how === 'stem' ? null : parts;
  if (compound) add(`${compound[0].gloss} + ${compound[1].gloss}`, 'guessed from its parts');
  const settled = own !== undefined || first !== undefined || explained !== null || number !== null || compound !== null;
  if (data.modern && !settled) {
    const found = findModern(data.modern.keys, key);
    if (found) {
      const line = modernLines(defAt(data.modern, found.index)).find((l) => l.tag !== 'loan');
      if (line) add(tidyGloss(line.gloss, found.how !== 'exact'), line.tag === 'cldr' ? 'standard modern name' : line.tag === 'wd' ? 'name (Wikidata)' : 'modern usage');
    }
  }

  // A stem or prefix match whose shorter word has an owner or AI meaning: that modern
  // meaning, marked "maybe", before Praharaj's 1930s sense of the same word
  // (samvaadikataaku: "maybe: journalist", not "maybe: Logician").
  const headMeaning = !settled && entry && entry.how === 'stem' ? meaningOf(entry.head) : null;
  if (headMeaning) add(tidyGloss(headMeaning, true), 'meaning of the shorter word');

  // A prefix match (the word only begins like a headword) gives no meaning: judged in
  // context on fresh news, its 1930s gloss was wrong 90% of the time and the shorter
  // word's modern meaning 47% (plan/research/v219-card-quality.md). No meaning is better
  // than a wrong one; the parts guess above still covers real compounds.
  if (entry && entry.how !== 'prefix' && definition !== null && !settled && !headMeaning) {
    const gloss = shortGlossOf(definition);
    add(gloss === null ? null : tidyGloss(gloss, entry.how !== 'exact'), 'Praharaj dictionary (1931–40)');
  }

  const loans = data.loans.byOdia.get(odia);
  const loan = loans && loans[0]
    ? `${LANGUAGE_LABEL[loans[0].language]}: ${loans[0].english}`
    : null;

  const origin =
    (entry && entry.how !== 'prefix' && data.origin ? originLabel(data.origin[entry.index]) : null) ??
    (ai?.origin ? ORIGIN_PHRASE[ai.origin] ?? null : null);
  const more = first ? first.senses.filter((x) => x.toLowerCase() !== first.meaning.toLowerCase()).slice(0, 2).join('; ') : '';

  return {
    word: odia,
    roman: romanize(odia),
    meanings,
    // An owner or AI meaning is for this exact word: no "approximate" note then.
    approximateHead: entry && entry.how === 'stem' && !own && !first && !explained && !number && !compound ? entry.head : null,
    origin,
    loan,
    formation:
      ai?.formation ||
      phrase?.formation ||
      explained?.formation ||
      number?.formation ||
      (compound ? `${compound[0].word} (${compound[0].gloss}) + ${compound[1].word} (${compound[1].gloss})` : null),
    more: more.length > 0 ? `Also: ${more}` : null,
  };
}
