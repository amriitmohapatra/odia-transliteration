// The bundled engine.js in a bare JavaScript context, as JavaScriptCore gives it:
// no DOM, no fetch, no TextDecoder, no atob, no console. Built by ime-macos/build.mjs.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA, bundle } from '../build.mjs';

const ROOT = resolve(__dirname, '../..');
const KEMITI = '\u0b15\u0b47\u0b2e\u0b3f\u0b24\u0b3f';
const ACHHA = '\u0b05\u0b1b';
const ODISHA = '\u0b13\u0b21\u0b3c\u0b3f\u0b36\u0b3e';

type Api = {
  load(files: Record<string, string>, learned: string): string;
  key(kind: string, char: string): string;
  flush(): string;
  learned(): string;
};

let api: Api;
let script: string;
const files: Record<string, string> = {};

beforeAll(async () => {
  const result = await bundle(false);
  script = result.outputFiles![0]!.text;
  for (const [name, src] of Object.entries(DATA as Record<string, string>)) files[name] = readFileSync(resolve(ROOT, src), 'utf8');
  files['converter.bin.b64'] = readFileSync(resolve(ROOT, 'core/data/converter.bin')).toString('base64');
  const context = createContext({}); // ECMAScript built-ins only
  runInContext(script, context);
  api = runInContext('OdiaIME', context) as Api;
  expect(api.load(files, '')).toBe('');
}, 60_000);

const typeText = (text: string) => {
  let out = '';
  for (const ch of text) {
    const step = JSON.parse(ch === ' ' ? api.key('space', '') : api.key('char', ch));
    out += step.commit;
  }
  return out;
};

describe('engine.js in a bare context', () => {
  it('runs where TextDecoder, atob, fetch and the DOM do not exist', () => {
    const context = createContext({});
    expect(runInContext('[typeof TextDecoder, typeof atob, typeof fetch, typeof document].join()', context)).toBe(
      'undefined,undefined,undefined,undefined',
    );
  });

  it('types kemiti achha as the website does', () => {
    expect(typeText('kemiti achha ')).toBe(`${KEMITI} ${ACHHA} `);
  });

  it('keeps the nukta decomposed (U+0B21 U+0B3C) in its output', () => {
    expect(typeText('odisha ')).toBe(`${ODISHA} `);
  });

  it('remembers a choice and hands it over as JSON for Swift to save', () => {
    typeText('bhala');
    const step = JSON.parse(api.key('down', ''));
    const second = step.view.candidates[1];
    expect(JSON.parse(api.key('enter', '')).commit).toBe(second);
    const learned = JSON.parse(api.learned());
    expect(learned.bhala[second]).toBe(1);
  });

  it('a broken saved file starts empty instead of failing', () => {
    const context = createContext({});
    runInContext(script, context);
    const fresh = runInContext('OdiaIME', context) as Api;
    expect(fresh.load(files, '{not json')).toBe('');
    expect(fresh.learned()).toBe('{}');
  });
});
