/** Small, explicitly curated English lookup; never feeds the phonetic ranker. */
import { canonical } from '../../../core/src/normalize.js';

export interface EnglishEntry {
  english: string;
  odia: string;
  kind: 'translation' | 'loan';
  sense: string;
  aliases: readonly string[];
  status: 'seed' | 'owner';
  source: 'original-seed' | 'owner-gloss';
}

export function normalizeEnglish(query: string): string {
  return query.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Strict validation keeps unreviewed additions visible and malformed data out. */
export function parseEnglishEntries(tsv: string): EnglishEntry[] {
  const entries: EnglishEntry[] = [];
  const seen = new Set<string>();
  for (const [index, line] of tsv.split(/\r?\n/).entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    const cells = line.split('\t');
    const [english, odia, kind, sense, aliasCell, status, source] = cells;
    const fail = (message: string): never => { throw new Error(`english.tsv:${index + 1}: ${message}`); };
    if (cells.length !== 7 || !english || !odia || !sense) fail('expected seven fields and nonempty headword, Odia and sense');
    if (!english || !odia || !sense) continue;
    if (english !== normalizeEnglish(english) || !/^[a-z][a-z '-]*$/.test(english)) fail('invalid English headword');
    if (odia !== canonical(odia) || !/^[\u0b00-\u0b7f]+$/.test(odia)) fail('expected canonical Odia word');
    if (kind !== 'translation' && kind !== 'loan') fail('unknown kind');
    if (status !== 'seed' && status !== 'owner') fail('unknown status');
    if (source !== 'original-seed' && source !== 'owner-gloss') fail('unknown source');
    if ((status === 'owner') !== (source === 'owner-gloss')) fail('owner status requires owner-gloss source');
    const aliases = aliasCell ? aliasCell.split('|') : [];
    if (aliases.some((alias) => !alias || alias !== normalizeEnglish(alias) || !/^[a-z][a-z '-]*$/.test(alias))) fail('invalid alias');
    const key = `${english}\t${odia}\t${kind}\t${sense}`;
    if (seen.has(key)) fail('duplicate entry');
    seen.add(key);
    entries.push({ english, odia: canonical(odia), kind: kind as EnglishEntry['kind'], sense, aliases, status: status as EnglishEntry['status'], source: source as EnglishEntry['source'] });
  }
  return entries;
}

/** Exact headwords/aliases first; then explicit headword-prefix suggestions. */
export function searchEnglish(
  entries: readonly EnglishEntry[],
  query: string,
  hide: (word: string) => boolean = () => false,
  limit = 12,
): { entry: EnglishEntry; exact: boolean }[] {
  const q = normalizeEnglish(query);
  if (!q || !Number.isFinite(limit) || limit <= 0) return [];
  return entries.flatMap((entry) => {
    if (hide(canonical(entry.odia))) return [];
    const keys = [entry.english, ...entry.aliases];
    const exact = keys.includes(q);
    if (!exact && (q.length < 2 || !keys.some((key) => key.startsWith(q)))) return [];
    return [{ entry, exact }];
  }).sort((a, b) => Number(b.exact) - Number(a.exact)
    || a.entry.english.localeCompare(b.entry.english)
    || a.entry.kind.localeCompare(b.entry.kind)).slice(0, Math.floor(limit));
}
