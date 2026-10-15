/**
 * The result list of the lens frame: for each line, the text exactly as OCR
 * read it, then its words, each with its first meaning. Plain DOM, no
 * extension API: the extension's frame panel (content.ts) and the Mac lens's
 * page (mac.ts) both use it.
 */

import type { FrameLine, FrameWord } from './messages.js';

const ODIA = /[\u0b00-\u0b7f]/;

export const FRAME_VIEW_CSS = `
/* Puri/Konark palette (see frame.ts); fallbacks so the Mac page works without the tokens. */
.lines { margin: 0; padding: 0; list-style: none; }
.line + .line { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line, #e3d6bb); }
.line-read { font: 17px/1.5 "Noto Sans Oriya", "Oriya Sangam MN", "Kalinga", "Odia MN", sans-serif; color: var(--stone, #6f6253); }
.line-read::before {
  content: "Read"; display: inline-block; margin-right: 7px; padding: 1px 6px; border-radius: 4px; vertical-align: 2px;
  font: 600 10px/1.4 system-ui, sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
  background: var(--nila, #1e2f5c); color: var(--shankha, #fbf6ea);
}
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px; cursor: pointer;
  border: 1px solid var(--line, #e3d6bb); border-left: 3px solid var(--haritala, #e8b23a); border-radius: 8px;
  padding: 4px 9px 5px; background: #fff;
  font: 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: inherit; text-align: left;
  transition: border-color 0.12s, transform 0.12s;
}
.chip:hover, .chip:focus-visible { border-color: var(--hingula, #b7321e); outline: none; transform: translateY(-1px); }
.chip[aria-pressed="true"] { border-color: var(--hingula, #b7321e); border-left-color: var(--hingula, #b7321e); box-shadow: inset 0 0 0 1px var(--hingula, #b7321e); }
.chip-word { font: 600 17px/1.3 "Noto Sans Oriya", "Oriya Sangam MN", "Kalinga", "Odia MN", sans-serif; }
.chip-meaning { color: #3d3428; max-width: 220px; }
.chip-note { font-size: 11px; color: var(--hingula, #b7321e); }
.chip-none { color: var(--stone, #6f6253); font-style: italic; }
.chip:has(.chip-none) { border-left-color: var(--line, #e3d6bb); }
.empty { color: var(--stone, #6f6253); }
.detail {
  margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: #fff;
  border: 1px solid var(--line, #e3d6bb); border-top: 3px solid var(--hingula, #b7321e);
}
.detail-word { font: 600 22px/1.3 "Noto Sans Oriya", "Oriya Sangam MN", "Kalinga", "Odia MN", sans-serif; }
.detail-roman { font-style: italic; color: var(--stone, #6f6253); }
.detail ul { margin: 6px 0 0; padding: 0; list-style: none; }
.detail li { margin-top: 5px; padding-left: 11px; position: relative; }
.detail li::before {
  content: ""; position: absolute; left: 0; top: 0.55em; width: 5px; height: 5px;
  background: var(--hingula, #b7321e); transform: rotate(45deg);
}
.detail .source, .detail .note { display: block; font-size: 11.5px; color: var(--stone, #6f6253); }
.detail .warn { color: var(--hingula, #b7321e); }
@media (prefers-color-scheme: dark) {
  .line + .line { border-top-color: #3a3326; }
  .line-read { color: #c9bb9d; }
  .line-read::before { background: #2c3f73; }
  .chip { background: #231f17; border-color: #3a3326; }
  .chip-meaning { color: #e9dfc8; }
  .chip-note, .detail .warn { color: #ff8a73; }
  .detail { background: #231f17; border-color: #3a3326; border-top-color: #e0573d; }
  .detail-roman, .detail .source, .detail .note, .chip-none { color: #c9bb9d; }
}
@media (prefers-reduced-motion: reduce) { .chip { transition: none; } .chip:hover { transform: none; } }
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

/** A word's full card: the word, how to say it, every meaning with its source, and the notes. */
export function renderDetail(
  doc: Document,
  w: FrameWord,
  /** Where the word came from, the card's first note: a picture (OCR) or a PDF's typed text. */
  source = 'Read from the picture',
): HTMLElement {
  const box = doc.createElement('div');
  box.className = 'detail';
  const card = w.card;
  const reading = w.reading;
  const word = doc.createElement('div');
  word.className = 'detail-word';
  word.lang = 'or';
  word.textContent = shownWord(w);
  box.append(word);
  if (card) {
    const roman = doc.createElement('div');
    roman.className = 'detail-roman';
    roman.textContent = card.roman;
    box.append(roman);
  }
  const list = doc.createElement('ul');
  for (const m of card?.meanings ?? []) {
    const li = doc.createElement('li');
    li.textContent = m.text;
    const src = doc.createElement('span');
    src.className = 'source';
    src.textContent = m.source;
    li.append(src);
    list.append(li);
  }
  if (!card || card.meanings.length === 0) {
    const li = doc.createElement('li');
    li.textContent = 'No meaning in the dictionaries yet.';
    list.append(li);
  }
  box.append(list);
  const notes: [string | null, boolean][] = [
    [reading?.corrected ? `${source} as ${reading.readAs}, corrected to a dictionary word` : source, false],
    [reading?.partOf ? `Part of a longer word read as ${reading.partOf}` : null, false],
    [reading && reading.conf < 60 ? 'Unclear print: check the word' : null, true],
    [card?.approximateHead ? `Approximate: the dictionary word is ${card.approximateHead}` : null, false],
    [card?.more ?? null, false],
    [card?.formation ?? null, false],
    [card?.loan ?? null, false],
    [card?.origin ?? null, false],
  ];
  for (const [text, warn] of notes) {
    if (!text) continue;
    const note = doc.createElement('span');
    note.className = warn ? 'note warn' : 'note';
    if (ODIA.test(text)) note.lang = 'or';
    note.textContent = text;
    box.append(note);
  }
  return box;
}

