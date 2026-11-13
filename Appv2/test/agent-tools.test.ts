// The voice helper's client tools (src/agent-tools.ts, V3.6): what the agent may do
// to the text box, with a fake host. The agent's arguments are model output, so
// every check here is a guard against a bad call.
import { describe, expect, it } from 'vitest';

import { clientTools, READ_MAX_CHARS, TYPE_MAX_CHARS, typedText, type ToolHost } from '../src/agent-tools.js';

const ODISHA_PRECOMPOSED = 'ଓଡ଼ିଶା';
const ODISHA = 'ଓଡ଼ିଶା';
const GHARA = 'ଘର';

function fakeHost(initial = '') {
  const state = { text: initial, selected: '', inserted: [] as string[], described: [] as string[], spelled: [] as string[] };
  const host: ToolHost = {
    read: () => ({ text: state.text, selected: state.selected }),
    insert: (t) => {
      state.inserted.push(t);
      state.text += t;
    },
    replace: (find, rep) => {
      const at = state.text.indexOf(find);
      if (at < 0) return false;
      state.text = state.text.slice(0, at) + rep + state.text.slice(at + find.length);
      return true;
    },
    describe: (w) => {
      state.described.push(w);
      return `meaning of ${w}`;
    },
    spell: (r) => {
      state.spelled.push(r);
      return r === 'odisha' ? [ODISHA, 'ଓଡିଶା'] : [];
    },
  };
  return { host, state, tools: clientTools(host) };
}

describe('agent tools', () => {
  it('names exactly the tools the agent definition declares', () => {
    expect(Object.keys(fakeHost().tools).sort()).toEqual(['look_up', 'read_text', 'replace_text', 'spell', 'type_odia']);
  });

  it('read_text: the box, the selection, and only the end of a long text', () => {
    const { tools, state } = fakeHost();
    expect(tools.read_text!({})).toBe('The text box is empty.');
    state.text = `${GHARA} ${ODISHA}`;
    state.selected = ODISHA;
    expect(tools.read_text!({})).toBe(`Text box: ${GHARA} ${ODISHA}\nSelected: ${ODISHA}`);
    state.text = 'x'.repeat(READ_MAX_CHARS + 10);
    state.selected = '';
    expect(tools.read_text!({})).toContain(`only the last ${READ_MAX_CHARS}`);
  });

  it('type_odia: types canonical Odia (nukta decomposed), refuses Latin, empty and over-long text', () => {
    const { tools, state } = fakeHost();
    expect(tools.type_odia!({ text: ODISHA_PRECOMPOSED })).toBe('Typed.');
    expect(state.inserted).toEqual([ODISHA]);
    expect(tools.type_odia!({ text: 'hello' })).toMatch(/Odia script/);
    expect(tools.type_odia!({})).toMatch(/give the text/);
    expect(tools.type_odia!({ text: 42 })).toMatch(/give the text/);
    expect(tools.type_odia!(null)).toMatch(/give the text/);
    expect(tools.type_odia!({ text: GHARA.repeat(TYPE_MAX_CHARS) })).toMatch(/longer than/);
    expect(state.inserted).toHaveLength(1);
  });

  it('replace_text: canonical match and replacement, delete with empty, says when not found', () => {
    const { tools, state } = fakeHost(`${GHARA} ${ODISHA} `);
    expect(tools.replace_text!({ find: ODISHA_PRECOMPOSED, replace: GHARA })).toBe('Replaced.');
    expect(state.text).toBe(`${GHARA} ${GHARA} `);
    expect(tools.replace_text!({ find: `${GHARA} `, replace: '' })).toBe('Replaced.');
    expect(state.text).toBe(`${GHARA} `);
    expect(tools.replace_text!({ find: ODISHA, replace: GHARA })).toMatch(/^Not found/);
    expect(tools.replace_text!({ find: '', replace: GHARA })).toMatch(/give the text to find/);
  });

  it('look_up: one Odia word, canonical, through the host', () => {
    const { tools, state } = fakeHost();
    expect(tools.look_up!({ word: ` ${ODISHA_PRECOMPOSED} ` })).toBe(`meaning of ${ODISHA}`);
    expect(tools.look_up!({ word: 'odisha' })).toMatch(/Odia script/);
    expect(tools.look_up!({ word: `${GHARA} ${ODISHA}` })).toMatch(/one word/);
    expect(state.described).toEqual([ODISHA]);
  });

  it('spell: one roman word, lower-cased, best first; refuses anything else', () => {
    const { tools, state } = fakeHost();
    expect(tools.spell!({ roman: 'Odisha' })).toBe(`Typing "odisha" gives: ${ODISHA}, ଓଡିଶା (best first).`);
    expect(tools.spell!({ roman: 'zzq' })).toMatch(/no Odia word/);
    expect(tools.spell!({ roman: 'two words' })).toMatch(/one word/);
    expect(tools.spell!({ roman: '<b>x</b>' })).toMatch(/one word/);
    expect(state.spelled).toEqual(['odisha', 'zzq']);
  });

  it('typedText: one space from the word before, one after', () => {
    expect(typedText(`  ${GHARA}   ${ODISHA} `, '')).toBe(`${GHARA} ${ODISHA} `);
    expect(typedText(GHARA, ODISHA)).toBe(` ${GHARA} `);
    expect(typedText(GHARA, `${ODISHA} `)).toBe(`${GHARA} `);
  });
});
