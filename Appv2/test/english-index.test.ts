// English -> Odia index (src/dictionary/english-index.ts): the AI list, the meanings
// read backwards, the fallbacks, and the "=word" pending word in the text box.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { canonical } from '../../core/src/normalize.js';
import { parseEnglishEntries } from '../src/dictionary/english.js';
import { EnglishIndex, englishVariants, meaningKeys, parseEnglishAi, parseEnglishApi, reverseMeanings } from '../src/dictionary/english-index.js';
import { pendingRoman, type EditState } from '../src/editor-state.js';

const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');
const aiTsv = read('../src/dictionary/english-ai.tsv');
const GAI = 'ଗାଈ'; // cow
const HATI = 'ହାତୀ'; // elephant
const PANI = 'ପାଣି'; // water

function index(): EnglishIndex {
  return new EnglishIndex(parseEnglishEntries(read('../src/dictionary/english.tsv')), parseEnglishAi(aiTsv),
    reverseMeanings(read('../../core/data/glosses.tsv'), 2), reverseMeanings(read('../../core/data/meanings.tsv'), 5));
}

describe('english-ai.tsv', () => {
  it('parses strictly: every Odia option canonical, no repeated English', () => {
    const list = parseEnglishAi(aiTsv);
    expect(list.size).toBeGreaterThan(2000);
    for (const options of list.values()) for (const w of options) expect(w).toBe(canonical(w));
    expect(aiTsv).not.toMatch(/[ଡ଼ଢ଼]/); // the nukta invariant
  });

  it('fails loudly on a bad row', () => {
    expect(() => parseEnglishAi('Cow\tଗାଈ\n')).toThrow(/invalid English/);
    expect(() => parseEnglishAi('cow\tgai\n')).toThrow(/not an Odia word/);
    expect(() => parseEnglishAi('road\tଡ଼\n')).toThrow(/not canonical/);
    expect(() => parseEnglishAi(`cow\t${GAI}\ncow\t${GAI}\n`)).toThrow(/duplicate/);
    expect(() => parseEnglishAi(`cow\t${GAI}|${GAI}\n`)).toThrow(/repeated/);
  });
});

describe('meaningKeys and englishVariants', () => {
  it('reads each plain sense of a meaning line', () => {
    expect(meaningKeys('to go; going')).toEqual(['go', 'going']);
    expect(meaningKeys('elephant (the animal)')).toEqual(['elephant']);
    expect(meaningKeys('a long sentence that says far too much here')).toEqual([]);
  });

  it('falls back to the base word', () => {
    expect(englishVariants('cows')).toContain('cow');
    expect(englishVariants('berries')).toContain('berry');
    expect(englishVariants('went')).toContain('go');
    expect(englishVariants('running')).toContain('run');
    expect(englishVariants('making')).toContain('make');
    expect(englishVariants('tried')).toContain('try');
    expect(englishVariants('To Go')[0]).toBe('go');
  });
});

describe('EnglishIndex on the real data', () => {
  const ix = index();

  it('cow -> ଗାଈ first, elephant -> ହାତୀ, water keeps the curated ପାଣି first', () => {
    expect(ix.odiaFor('cow')[0]).toBe(GAI);
    expect(ix.odiaFor('cows')[0]).toBe(GAI);
    expect(ix.odiaFor('elephant')[0]).toBe(HATI);
    const water = ix.search('water');
    expect(water[0]).toMatchObject({ odia: PANI, source: 'curated' });
  });

  it('each Odia word once, hidden words left out, the limit kept', () => {
    const all = ix.odiaFor('cow', undefined, 20);
    expect(new Set(all).size).toBe(all.length);
    expect(ix.odiaFor('cow', (w) => w === GAI)).not.toContain(GAI);
    expect(ix.search('house', undefined, 2)).toHaveLength(2);
  });

  it('nothing for an unknown word or a single letter', () => {
    expect(ix.odiaFor('xylophonics')).toEqual([]);
    expect(ix.odiaFor('c')).toEqual([]);
  });

  it('frequency orders only the words found through the meanings', () => {
    const tiny = new EnglishIndex([], new Map(), new Map(), new Map([['road', ['କ', 'ଖ']]]));
    expect(tiny.odiaFor('road', undefined, 8, (w) => (w === 'ଖ' ? 9 : 1))).toEqual(['ଖ', 'କ']);
  });
});

describe('"=word" in the text box', () => {
  const state = (value: string): EditState => ({ value, start: value.length, end: value.length, direction: 'none', literals: [] });

  it('is a pending word that keeps the "=" (so the commit replaces it too)', () => {
    expect(pendingRoman(state('=cow'))).toEqual({ roman: '=cow', start: 0, end: 4, tailEnd: 4 });
    expect(pendingRoman(state(`${PANI} =cow`))).toMatchObject({ roman: '=cow', start: 5 });
  });

  it('a bare "=" or "a=b" is not', () => {
    expect(pendingRoman(state('='))).toBeUndefined();
    expect(pendingRoman(state('a=b'))).toBeUndefined();
  });
});

describe('english-api.tsv (generated with the Claude API, V2.21)', () => {
  const KULA = 'କୂଳ'; // bank of a river
  const BANK = 'ବ୍ୟାଙ୍କ'; // bank (money)
  const TATA = 'ତଟ';
  const fixture = [
    '# test',
    `bank\tword\tmoney\t${BANK}|ବାଙ୍କ`,
    `bank\tword\triver side\t${KULA}|${TATA}`,
    `babysit\tphrase\t\tପିଲା ଜଗିବା`,
    'ran\tform\t\trun',
    `run\tword\t\tଦୌଡ଼ିବା`,
  ].join('\n');

  it('parses strictly and fails loudly', () => {
    const api = parseEnglishApi(fixture);
    expect(api.senses.get('bank')).toHaveLength(2);
    expect(api.forms.get('ran')).toBe('run');
    expect(() => parseEnglishApi('cow\tword\t\tgai')).toThrow(/not an Odia word/);
    expect(() => parseEnglishApi('cow\tnoun\t\tଗାଈ')).toThrow(/unknown kind/);
    expect(() => parseEnglishApi('ran\tform\tpast\trun')).toThrow(/form/);
    expect(() => parseEnglishApi('road\tword\t\tସଡ଼କ')).toThrow(/not canonical/);
    expect(() => parseEnglishApi('cow\tword\tଗାଈ')).toThrow(/four fields/);
  });

  it('interleaves senses, marks phrases and sends a form to its base word', () => {
    const ix = new EnglishIndex([], new Map(), new Map(), new Map());
    expect(ix.hasApi).toBe(false);
    ix.setApi(parseEnglishApi(fixture));
    const bank = ix.search('bank');
    expect(bank.map((h) => h.odia).slice(0, 2)).toEqual([BANK, KULA]);
    expect(bank[1]).toMatchObject({ source: 'api-list', sense: 'river side' });
    expect(ix.search('babysit')[0]).toMatchObject({ phrase: true });
    expect(ix.odiaFor('ran')).toEqual(['ଦୌଡ଼ିବା']);
  });

  it('keeps the hand-written lists first', () => {
    const ix = index();
    ix.setApi(parseEnglishApi(`cow\tword\t\tଗୋମାତା`));
    expect(ix.odiaFor('cow')[0]).toBe(GAI);
  });

  it('the shipped file parses, and english-api.bin is the gzip of it', async () => {
    const tsv = read('../src/dictionary/english-api.tsv');
    expect(() => parseEnglishApi(tsv)).not.toThrow();
    expect(tsv).not.toMatch(/[ଡ଼ଢ଼]/);
    const { gunzipSync } = await import('node:zlib');
    const bin = readFileSync(new URL('../src/dictionary/english-api.bin', import.meta.url));
    expect(gunzipSync(bin).toString('utf8')).toBe(tsv);
  });
});
