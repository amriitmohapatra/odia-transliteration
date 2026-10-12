import { describe, expect, it } from 'vitest';
import { englishSkeleton, odiaSkeleton, soundsLike } from '../src/dictionary/loanmatch.js';

const VIDEO = '\u0B2D\u0B3F\u0B21\u0B3F\u0B13'; // bhidio
const BIDI = '\u0B2C\u0B3F\u0B21\u0B3F'; // bidi, a cigarette
const MEETING = '\u0B2E\u0B3F\u0B1F\u0B3F\u0B02';
const PHONE = '\u0B2B\u0B4B\u0B28\u0B4D';
const OFFICE = '\u0B05\u0B2B\u0B3F\u0B38\u0B4D';
const WATER = '\u0B71\u0B3E\u0B1F\u0B30';
const BOUTAR = '\u0B2C\u0B4B\u0B09\u0B1F\u0B3E\u0B30';
const MOBILE = '\u0B2E\u0B4B\u0B2C\u0B3E\u0B07\u0B32\u0B4D';

describe('loan sound match', () => {
  it('keeps real loan spellings', () => {
    for (const [en, od] of [['video', VIDEO], ['meeting', MEETING], ['phone', PHONE], ['office', OFFICE],
      ['water', WATER], ['mobile', MOBILE]] as const) {
      expect(soundsLike(en, od), `${en} ${englishSkeleton(en)} vs ${odiaSkeleton(od)}`).toBe(true);
    }
  });
  it('drops sound-alike native words', () => {
    expect(soundsLike('video', BIDI)).toBe(false);
    expect(soundsLike('water', BOUTAR)).toBe(false);
  });
});
