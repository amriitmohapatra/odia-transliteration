/**
 * The one English -> Odia index the app uses (dictionary panel and "=word" typing),
 * built on first use from data already in the bundle. The large generated list
 * (english-api.bin, V2.21: gzip of english-api.tsv) is a separate asset, fetched once in
 * the background and added when it arrives; until then the other layers answer.
 */
import glossesTsv from '../../../core/data/glosses.tsv?raw';
import meaningsTsv from '../../../core/data/meanings.tsv?raw';
import { parseEnglishEntries } from './english.js';
import englishTsv from './english.tsv?raw';
import englishAiTsv from './english-ai.tsv?raw';
import englishApiUrl from './english-api.bin?url';
import { EnglishIndex, parseEnglishAi, parseEnglishApi, reverseMeanings } from './english-index.js';
import { inflate } from './pako-inflate.js';

let index: EnglishIndex | undefined;
let loading: Promise<boolean> | undefined;

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

/**
 * Fetch and add the generated list (once). Resolves true when it is in the index, false
 * when it could not load (offline before the first visit, a failed fetch): English
 * lookup then keeps working from the other layers.
 */
export function loadEnglishApi(): Promise<boolean> {
  loading ??= fetch(englishApiUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`english-api fetch failed: ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      englishIndex().setApi(parseEnglishApi(new TextDecoder('utf-8').decode(inflate(new Uint8Array(buffer)))));
      return true;
    })
    .catch(() => {
      loading = undefined; // try again on a later lookup
      return false;
    });
  return loading;
}
