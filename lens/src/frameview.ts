/**
 * The result list of the lens frame: for each line, the text exactly as OCR
 * read it, then its words, each with its first meaning. Plain DOM, no
 * extension API: the extension's frame panel (content.ts) and the Mac lens's
 * page (mac.ts) both use it.
 */

import type { FrameLine, FrameWord } from './messages.js';

export const FRAME_VIEW_CSS = `
.lines { margin: 0; padding: 0; list-style: none; }
.line + .line { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e6dfcf; }
.line-read { font: 17px/1.5 "Noto Sans Oriya", "Oriya Sangam MN", "Kalinga", "Odia MN", sans-serif; color: #5a5446; }
.line-read::before { content: "Read: "; font: 11.5px system-ui, sans-serif; color: #8a8370; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.chip {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px; cursor: pointer;
  border: 1px solid #d9d2c3; border-radius: 8px; padding: 3px 8px; background: #fbf8f1;
  font: 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: inherit; text-align: left;
}
.chip:hover, .chip:focus-visible { border-color: #c2410c; outline: none; }
.chip-word { font: 600 17px/1.3 "Noto Sans Oriya", "Oriya Sangam MN", "Kalinga", "Odia MN", sans-serif; }
.chip-meaning { color: #3d3a32; max-width: 220px; }
.chip-note { font-size: 11px; color: #a33a1c; }
.chip-none { color: #8a8370; font-style: italic; }
.empty { color: #6b6455; }
@media (prefers-color-scheme: dark) {
  .line + .line { border-top-color: #4a4538; }
  .line-read { color: #c3bba8; }
  .chip { background: #2b2822; border-color: #4a4538; }
  .chip-meaning { color: #e6dfcf; }
}
`;

/** The word to show: the dictionary word it was corrected to, else as read. */
export const shownWord = (w: FrameWord): string => w.card?.word ?? w.reading?.corrected ?? w.reading?.readAs ?? w.text;

/** The result list; `onWord` is called when a word is chosen (click or Enter), with its chip. */
export function renderLines(doc: Document, lines: readonly FrameLine[], onWord: (word: FrameWord, chip: HTMLElement) => void): HTMLElement {
  const list = doc.createElement('ul');
  list.className = 'lines';
  if (lines.length === 0) {
    const empty = doc.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No Odia text found inside the frame. Move it over the words, or make it larger.';
    list.append(empty);
    return list;
  }
  for (const line of lines) {
    const li = doc.createElement('li');
    li.className = 'line';
    const read = doc.createElement('div');
    read.className = 'line-read';
    read.lang = 'or';
    read.textContent = line.read;
    li.append(read);
    const chips = doc.createElement('div');
    chips.className = 'chips';
    for (const w of line.words) {
      const chip = doc.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      const word = doc.createElement('span');
      word.className = 'chip-word';
      word.lang = 'or';
      word.textContent = shownWord(w);
      const meaning = doc.createElement('span');
      const first = w.card?.meanings[0]?.text;
      meaning.className = first ? 'chip-meaning' : 'chip-meaning chip-none';
      meaning.textContent = first ?? 'no meaning yet';
      chip.append(word, meaning);
      if (w.reading && (w.reading.corrected || w.reading.conf < 60)) {
        const note = doc.createElement('span');
        note.className = 'chip-note';
        note.textContent = w.reading.conf < 60 ? 'unclear print' : 'corrected';
        chip.append(note);
      }
      chip.addEventListener('click', () => onWord(w, chip));
      chips.append(chip);
    }
    li.append(chips);
    list.append(li);
  }
  return list;
}
