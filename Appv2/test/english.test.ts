import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonical } from '../../core/src/normalize.js';
import { parseGlosses, parseLabels } from '../../core/src/curation.js';
import { normalizeEnglish, parseEnglishEntries, searchEnglish } from '../src/dictionary/english.js';

const tsv = readFileSync(new URL('../src/dictionary/english.tsv', import.meta.url), 'utf8');
const entries = parseEnglishEntries(tsv);

// Linguistic quality is awaiting owner review. These tests guard search behavior,
// source labels, canonical spelling and the distinction between meaning and sound.
describe('English to Odia starter dictionary', () => {
  it('has distinct entries and terms, with explicit review status', () => {
    expect(entries.length).toBe(70);
    expect(new Set(entries.map((entry) => entry.english)).size).toBe(62);
    expect(entries.filter((entry) => entry.status === 'owner')).toHaveLength(6);
    expect(entries.filter((entry) => entry.status === 'seed')).toHaveLength(64);
  });

  it('normalizes case, surrounding spaces and phrase spacing', () => {
    expect(normalizeEnglish('  PHONE   CALL  ')).toBe('phone call');
    expect(searchEnglish(entries, '  PHONE   CALL  ')[0]?.entry.english).toBe('call');
    expect(searchEnglish(entries, 'E-MAIL')[0]?.entry.english).toBe('email');
  });

  it('keeps native translations and English loan spellings separate', () => {
    const meeting = searchEnglish(entries, 'meeting');
    expect(meeting).toHaveLength(2);
    expect(meeting.every((result) => result.exact)).toBe(true);
    expect(new Set(meeting.map(({ entry }) => entry.kind))).toEqual(new Set(['loan', 'translation']));
    expect(searchEnglish(entries, 'phone')[0]?.entry.sense).toMatch(/device/);
    expect(searchEnglish(entries, 'phone call')[0]?.entry.sense).toMatch(/telephone call/);
  });

  it('preserves distinct senses rather than merging rice or bank', () => {
    expect(searchEnglish(entries, 'rice').map(({ entry }) => entry.sense)).toEqual(expect.arrayContaining(['cooked rice', 'uncooked rice grains']));
    expect(searchEnglish(entries, 'bank')).toHaveLength(2);
    expect(searchEnglish(entries, 'river bank')[0]?.entry.kind).toBe('translation');
  });

  it('labels prefixes as inexact and puts exact aliases before prefixes', () => {
    expect(searchEnglish(entries, 'me').every((result) => !result.exact)).toBe(true);
    const results = searchEnglish(entries, 'school');
    expect(results.every((result) => result.exact)).toBe(true);
    expect(searchEnglish(entries, 'mobile')[0]?.entry.english).toBe('mobile');
    expect(searchEnglish(entries, 'm')).toEqual([]);
  });

  it('does not invent translations for missing words or whole sentences', () => {
    for (const query of ['', '  ', 'photosynthesis', 'please call me tomorrow', '<script>']) {
      expect(searchEnglish(entries, query)).toEqual([]);
    }
  });

  it('applies the hide gate before the result limit, including aliases', () => {
    const hidden = searchEnglish(entries, 'phone call')[0]!.entry.odia;
    expect(searchEnglish(entries, 'PHONE CALL', (word) => word === hidden)).toEqual([]);
    expect(searchEnglish(entries, 'meeting', () => true)).toEqual([]);
    expect(searchEnglish(entries, 'me', () => false, 1)).toHaveLength(1);
    expect(searchEnglish(entries, 'me', () => false, 0)).toEqual([]);
  });

  it('uses canonical decomposed nukta, never precomposed nukta', () => {
    for (const entry of entries) {
      expect(entry.odia).toBe(canonical(entry.odia));
      expect(entry.odia).not.toMatch(/[\u0b5c\u0b5d]/);
    }
    expect(searchEnglish(entries, 'big')[0]?.entry.odia).toContain('\u0b21\u0b3c');
  });

  it('only calls entries owner-reviewed when they correspond to existing owner glosses', () => {
    const glosses = parseGlosses(readFileSync(new URL('../../core/data/glosses.tsv', import.meta.url), 'utf8'));
    for (const entry of entries.filter((row) => row.status === 'owner')) {
      expect(entry.source).toBe('owner-gloss');
      const gloss = glosses.get(entry.odia);
      expect(gloss?.status).toBe('owner');
      expect(gloss?.meaning.toLowerCase()).toContain(entry.english);
    }
  });

  it('rejects malformed, duplicate or falsely reviewed source rows', () => {
    const row = 'big\t\u0b2c\u0b21\u0b3c\ttranslation\tlarge\t\tseed\toriginal-seed';
    expect(() => parseEnglishEntries(row + '\n' + row)).toThrow(/duplicate/);
    expect(() => parseEnglishEntries(row.replace('\u0b21\u0b3c', '\u0b5c'))).toThrow(/canonical/);
    expect(() => parseEnglishEntries(row.replace('seed\toriginal', 'owner\toriginal'))).toThrow(/owner status/);
    expect(() => parseEnglishEntries(row.replace('translation', 'automatic'))).toThrow(/kind/);
    expect(() => parseEnglishEntries(row.replace('\t\tseed', '\tINVALID\tseed'))).toThrow(/alias/);
    expect(() => parseEnglishEntries('incomplete')).toThrow(/seven fields/);
  });
});

// The adult "Hide rude words" switch is not applied to English results (only the
// kids edition passes `hide`). This canary keeps that safe: an offensive or coarse
// word added to english.tsv fails here before it can be shown or inserted.
describe('English starter dictionary and the content labels', () => {
  it('contains no word labelled offensive or coarse', () => {
    const labels = parseLabels(readFileSync(new URL('../../core/data/labels.tsv', import.meta.url), 'utf8'));
    const flagged = entries.map((entry) => canonical(entry.odia))
      .filter((word) => labels.isOffensive(word) || labels.isCoarse(word));
    expect(flagged).toEqual([]);
  });
});
