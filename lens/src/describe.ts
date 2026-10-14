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
import type { Glosses, Meaning } from '@odia/core';

import {
  findModern,
  defAt,
  explainEnding,
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

export function describeWord(
  word: string,
  key: string,
  entry: Entry | null,
  definition: string | null,
  data: LensData,
  /** The Odia word before this one on the page, for constructions ("...-ku nei"). */
  previous = '',
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
  const explained = own || first ? null : explainEnding(odia, entry, data.ai, (head) => {
    const owned = data.owner.get(head)?.meaning;
    if (owned) return owned;
    // Owner or AI meanings only: Praharaj's 1930s first sense of a stem is too
    // often not today's sense (tanka "thigh", not rupee; sarakaara "lord").
    return data.ai?.word(head)?.meaning ?? null;
  });
  if (explained) add(explained.text, 'explained from its ending');
  const settled = own !== undefined || first !== undefined || explained !== null;
  if (data.modern && !settled) {
    const found = findModern(data.modern.keys, key);
    if (found) {
      const line = modernLines(defAt(data.modern, found.index)).find((l) => l.tag !== 'loan');
      if (line) add(tidyGloss(line.gloss, found.how !== 'exact'), line.tag === 'cldr' ? 'standard modern name' : 'modern usage');
    }
  }

  if (entry && definition !== null && !settled) {
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
    approximateHead: entry && entry.how !== 'exact' && !own && !first && !explained ? entry.head : null,
    origin,
    loan,
    formation: ai?.formation || phrase?.formation || explained?.formation || null,
    more: more.length > 0 ? `Also: ${more}` : null,
  };
}
