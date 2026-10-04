import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { createEngine } from '../../core/src/index.js';
import { badgeFor } from '../src/badges.js';

/*
 * FIXTURES ONLY. core/data/labels.tsv is empty and is curated by the owner;
 * no real abusive word is written anywhere in this repository by an agent.
 * The words labelled here are ordinary rule outputs picked at run time, so
 * this file contains no word at all.
 */

const rulesToml = readFileSync(new URL('../../core/rules/symbols.toml', import.meta.url), 'utf8');

describe('flag badges (Appv2/src/badges.ts)', () => {
  it('maps engine labels to text badges, offensive first', () => {
    const stub = {
      labelsOf: (word: string) =>
        word === 'A' ? new Set(['offensive', 'coarse']) : word === 'B' ? new Set(['coarse']) : word === 'C' ? new Set(['dialect']) : undefined,
    };
    expect(badgeFor(stub, 'A')).toEqual({ text: 'offensive', kind: 'danger' });
    expect(badgeFor(stub, 'B')).toEqual({ text: 'can be rude', kind: 'warn' });
    expect(badgeFor(stub, 'C')).toBeUndefined();
    expect(badgeFor(stub, 'D')).toBeUndefined();
  });

  it('shows nothing for an engine without labels (degraded engine) or one that throws', () => {
    expect(badgeFor(undefined, 'A')).toBeUndefined();
    expect(badgeFor({}, 'A')).toBeUndefined();
    expect(badgeFor({ labelsOf: () => { throw new Error('x'); } }, 'A')).toBeUndefined();
  });

  it('uses the real engine: labelsOf for badges, setFamilySafe for the filter', () => {
    const plain = createEngine({ rulesToml });
    const [first, second, third] = plain.transliterateWord('dina', 8).map((c) => c.text);
    expect(second).toBeDefined();
    expect(third).toBeDefined();

    // A labels fixture built at run time from ordinary words.
    const engine = createEngine({
      rulesToml,
      labelsTsv: `${second}\toffensive\n${third}\tcoarse\n`,
    });
    expect(badgeFor(engine, second as string)).toEqual({ text: 'offensive', kind: 'danger' });
    expect(badgeFor(engine, third as string)).toEqual({ text: 'can be rude', kind: 'warn' });
    expect(badgeFor(engine, first as string)).toBeUndefined();

    // Family-safe on (the default): a rule-only near miss labelled offensive
    // is not offered. Off: it comes back. This is the switch in Settings.
    const on = engine.transliterateWord('dina', 8).map((c) => c.text);
    expect(on).not.toContain(second);
    expect(on).toContain(third);
    engine.setFamilySafe(false);
    expect(engine.transliterateWord('dina', 8).map((c) => c.text)).toContain(second);
  });
});
