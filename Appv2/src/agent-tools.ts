/**
 * The voice helper's client tools (Talk, V3.6; plan/07-voice-agent.md §4).
 *
 * The ElevenLabs agent calls these by name during a conversation; they run here,
 * in the page, and their answer (a string) goes back to the agent. The names and
 * parameters match tools/assist/agent/odia-helper.json.
 *
 * Pure: the page passes a Host that reads and edits the text box, so the rules
 * below are unit-tested (Appv2/test/agent-tools.test.ts) without a browser.
 *
 * Rules: the tools change only the text box, through the editor (Undo works);
 * they never insert HTML; every Odia string passes canonical() (CLAUDE.md: LLMs
 * can write the precomposed nukta U+0B5C); arguments from the agent are checked,
 * because they are model output.
 */

import { canonical } from '@odia/core/normalize';

/** Longest text the agent may type or put in at once: the read-aloud limit. */
export const TYPE_MAX_CHARS = 500;
/** Longest text read_text gives the agent (the translate limit). */
export const READ_MAX_CHARS = 2000;

const ODIA = /[ଁ-୷]/;

export interface ToolHost {
  /** The text box and the selected part ('' when nothing is selected). */
  read(): { text: string; selected: string };
  /** Type at the caret (replacing a selection), as one undo step. */
  insert(text: string): void;
  /** Replace the first exact match of `find`; false when it is not there. */
  replace(find: string, replacement: string): boolean;
  /** The app's dictionary entry for one Odia word, as plain text. */
  describe(word: string): string;
  /** The engine's Odia words for a roman word, best first. */
  spell(roman: string): string[];
}

export type ClientTool = (parameters: unknown) => string;

function arg(parameters: unknown, name: string): string | null {
  if (!parameters || typeof parameters !== 'object') return null;
  const v = (parameters as Record<string, unknown>)[name];
  return typeof v === 'string' ? v : null;
}

/** The text to type: canonical, spaced from the word before it, ending in one space. */
export function typedText(text: string, before: string): string {
  const t = canonical(text).replace(/\s+/g, ' ').trim();
  return `${before && !/\s$/.test(before) ? ' ' : ''}${t} `;
}

export function clientTools(host: ToolHost): Record<string, ClientTool> {
  return {
    read_text: () => {
      const { text, selected } = host.read();
      if (!text.trim()) return 'The text box is empty.';
      const shown = text.length > READ_MAX_CHARS ? `${text.slice(-READ_MAX_CHARS)} (only the last ${READ_MAX_CHARS} characters)` : text;
      return selected.trim() ? `Text box: ${shown}\nSelected: ${selected}` : `Text box: ${shown}`;
    },

    type_odia: (parameters) => {
      const text = arg(parameters, 'text');
      if (text === null || !text.trim()) return 'Not typed: give the text to type.';
      if (!ODIA.test(text)) return 'Not typed: write the text in Odia script.';
      if (text.length > TYPE_MAX_CHARS) return `Not typed: the text is longer than ${TYPE_MAX_CHARS} characters. Type it in parts.`;
      host.insert(canonical(text));
      return 'Typed.';
    },

    replace_text: (parameters) => {
      const find = arg(parameters, 'find');
      const replacement = arg(parameters, 'replace') ?? '';
      if (find === null || !find.trim()) return 'Not replaced: give the text to find.';
      if (replacement.length > TYPE_MAX_CHARS) return `Not replaced: the new text is longer than ${TYPE_MAX_CHARS} characters.`;
      return host.replace(canonical(find), canonical(replacement)) ? 'Replaced.' : 'Not found: call read_text and use the exact text from the box.';
    },

    look_up: (parameters) => {
      const word = arg(parameters, 'word')?.trim() ?? '';
      if (!ODIA.test(word)) return 'Give one Odia word, in Odia script.';
      if (/\s/.test(word)) return 'Give one word at a time.';
      return host.describe(canonical(word));
    },

    spell: (parameters) => {
      const roman = arg(parameters, 'roman')?.trim() ?? '';
      if (!/^[A-Za-z][A-Za-z'.~^-]{0,39}$/.test(roman)) return 'Give one word in English letters, for example kemiti.';
      const words = host.spell(roman.toLowerCase()).slice(0, 5);
      if (words.length === 0) return `The app gives no Odia word for "${roman}".`;
      return `Typing "${roman.toLowerCase()}" gives: ${words.join(', ')} (best first).`;
    },
  };
}
