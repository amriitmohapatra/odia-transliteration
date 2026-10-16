// Read-aloud and voice typing (V3, src/speech.ts): the pure choices.
import { describe, expect, it } from 'vitest';

import { SPEAK_MAX_CHARS, pickOdiaVoice, recordingType, speakRoute, speakable } from '../src/speech.js';

const BHALA = '\u0b2d\u0b32'; // good

describe('pickOdiaVoice', () => {
  it('finds an Odia voice by its language tag, any region and case', () => {
    expect(pickOdiaVoice([{ lang: 'en-US' }, { lang: 'or-IN' }])).toBe(1);
    expect(pickOdiaVoice([{ lang: 'OD_in' }])).toBe(0);
    expect(pickOdiaVoice([{ lang: 'ory' }])).toBe(0);
  });
  it('does not take other languages that start with the same letters', () => {
    expect(pickOdiaVoice([{ lang: 'om-ET' }, { lang: 'oc-FR' }, { lang: 'hi-IN' }])).toBe(-1);
  });
});

describe('speakRoute', () => {
  it('uses the device voice first, then the online service only when switched on', () => {
    expect(speakRoute(true, false)).toBe('device');
    expect(speakRoute(true, true)).toBe('device');
    expect(speakRoute(false, true)).toBe('online');
    expect(speakRoute(false, false)).toBe('none');
  });
});

describe('speakable', () => {
  it('keeps short text whole, with single spaces', () => {
    expect(speakable(` ${BHALA}\n\n${BHALA} `)).toEqual({ text: `${BHALA} ${BHALA}`, cut: false });
  });
  it('cuts long text at a space, within the server limit', () => {
    const r = speakable(`${BHALA} `.repeat(400));
    expect(r.cut).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(SPEAK_MAX_CHARS);
    expect(r.text.endsWith(BHALA)).toBe(true);
  });
});

describe('recordingType', () => {
  it('takes the first format the browser can make', () => {
    expect(recordingType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(recordingType((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(recordingType(() => false)).toBeNull();
  });
});
