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
import type { Glosses } from '@odia/core';

import { findModern, defAt, modernLines, shortGlossOf, tidyGloss, type Dict, type Entry } from '../../Appv2/src/dictionary/lookup.js';
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
}

/** Meanings shown at most. */
const MAX_MEANINGS = 3;

export function describeWord(
  word: string,
  key: string,
  entry: Entry | null,
  definition: string | null,
  data: LensData,
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

  if (data.modern) {
    const found = findModern(data.modern.keys, key);
    if (found) {
      const line = modernLines(defAt(data.modern, found.index)).find((l) => l.tag !== 'loan');
      if (line) add(tidyGloss(line.gloss, found.how !== 'exact'), line.tag === 'cldr' ? 'standard modern name' : 'modern usage');
    }
  }

  if (entry && definition !== null) {
    const gloss = shortGlossOf(definition);
    add(gloss === null ? null : tidyGloss(gloss, entry.how !== 'exact'), 'Praharaj dictionary (1931–40)');
  }

  const loans = data.loans.byOdia.get(odia);
  const loan = loans && loans[0]
    ? `${LANGUAGE_LABEL[loans[0].language]}: ${loans[0].english}`
    : null;

  const origin = entry && entry.how !== 'prefix' && data.origin ? originLabel(data.origin[entry.index]) : null;

  return {
    word: odia,
    roman: romanize(odia),
    meanings,
    approximateHead: entry && entry.how !== 'exact' ? entry.head : null,
    origin,
    loan,
  };
}
