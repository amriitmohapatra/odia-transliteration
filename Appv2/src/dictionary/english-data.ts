/**
 * The one English -> Odia index the app uses (dictionary panel and "=word" typing),
 * built on first use from data already in the bundle.
 */
import glossesTsv from '../../../core/data/glosses.tsv?raw';
import meaningsTsv from '../../../core/data/meanings.tsv?raw';
import { parseEnglishEntries } from './english.js';
import englishTsv from './english.tsv?raw';
import englishAiTsv from './english-ai.tsv?raw';
import { EnglishIndex, parseEnglishAi, reverseMeanings } from './english-index.js';

let index: EnglishIndex | undefined;

export function englishIndex(): EnglishIndex {
  // glosses.tsv: odia, meaning, status (col 2); meanings.tsv: status in col 5.
  index ??= new EnglishIndex(
    parseEnglishEntries(englishTsv),
    parseEnglishAi(englishAiTsv),
    reverseMeanings(glossesTsv, 2),
    reverseMeanings(meaningsTsv, 5),
  );
  return index;
}
