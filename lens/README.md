# Odia Lens (browser extension)

Point at an Odia word on any web page. A small card shows:

- the word, and how to say it in English letters (`ଦିନ` → *dina*);
- its meaning: the app owner's meaning first, then the AI-written modern meanings
  (`core/data/meanings.tsv`, labelled "AI-written, not yet checked"), then the modern
  layer, then the Praharaj dictionary (1931–40). A phrase reading comes first where
  one applies: ନେଇ after a word ending in -କୁ is "over; regarding";
- a verb form explained by its verb and ending: ପାଇଛନ୍ତି → get + have …-ed (they, or
  respectful) (`core/data/verb-endings.tsv`);
- a number in Odia digits read out: ୨୪ → 24, ୬ଟି → 6 (things), ୨୦୧୯ରେ → 2019 + in, at, on;
- "Approximate" when only the stem or the start of the word is in the dictionary;
- "English loan word: …" and the word's origin ("from Persian") when known;
- **Say it**, when the computer has an Odia voice.

**Picture mode (0.2.0):** Odia inside a picture is read too: ePaper pages (Sambad,
Dharitri, Samaja), images, canvases, a paused YouTube video. Rest the pointer on a word
for a moment; the lens reads that line from a screenshot of the tab, offline (Tesseract
OCR inside the extension), and the card says **"Read from the picture"**. When the print
was unclear and the lens changed the reading to a dictionary word, the card shows what it
read; "unclear print" means: check the word. Headlines read well; very small body text on
a whole-page ePaper image often does not (a better Odia model is next, V4.3). Zoom the
ePaper viewer in before pointing: larger letters read better.

**The frame (0.3.0, Alt+Shift+F):** a see-through box you move (drag its indigo bar with
the Konark wheel) and resize (drag any edge or corner) over Odia in a picture. Everything
inside it is read together, line by line, when you let go; the wheel turns while it reads.
The panel next to it (below, or above when there is more room there) shows each line
exactly as it was read, then each word with its first meaning (words read with the word
before them, so phrases like "-କୁ ନେଇ" get their phrase meaning). Click a word: its full
card opens under that line. **Copy text** copies the lines read; **▾** folds the panel. Sizes: **Word**,
**Line**, **Para**; **↻** reads again; **✕** or Esc closes it. It reads again when the page
scrolls under it. Look: Puri/Konark colours (Nilachakra indigo, Pattachitra red and yellow
border, temple-flag band), light and dark. With the frame open, pointing at pictures does nothing else, so the
frame decides what is read.

It is the same dictionary and the same lookup as the Meanings panel of the web
app (`Appv2/src/dictionary/lookup.ts`).

## Install (Chrome or Edge, desktop)

1. Unzip `odia-lens.zip` into a folder you keep (do not delete it afterwards).
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder.
5. Optional: pin the Odia Lens icon to the toolbar (puzzle-piece menu).

## Use

- Open a page with Odia text. Click the Odia Lens icon, or press **Alt+Shift+O**.
  The icon shows **ON**.
- Point at a word. The card appears under it. **Esc** closes the card.
- Click the icon again to turn the lens off. A new page starts with the lens off.
- An **✕** on the icon means the browser does not allow extensions on that page
  (for example the Chrome Web Store or `chrome://` pages).

## Privacy

- The lens reads a page only after you click its icon on that page
  (`activeTab`). It asks for no access to any site in advance.
- Everything is offline: the dictionary and the OCR engine are inside the extension,
  and nothing is sent anywhere. Picture mode takes a screenshot of the tab only while the
  lens is on and the pointer rests on a picture; the screenshot stays in the browser. The browser check (`lens/eval/lens-check.mjs`) fails if any
  request leaves the computer.
- No Desh keyboard data is in the extension.

## Limits of v1

- The page itself only (not text inside frames), and text that is real text
  (not images or canvas drawings; that needs OCR, lens v2).
- One word at a time; no sentence translation yet (V4.5).
- Picture mode reads one line at a time, in the visible part of the page; OCR makes
  mistakes on small or decorated print.
- Chrome and Edge. Firefox and Safari later.

## For developers

```bash
node lens/build.mjs --zip                                  # lens/dist and lens/odia-lens.zip
npx vitest run --root lens                                 # unit tests (part of npm test)
node lens/build.mjs --test && node lens/eval/lens-check.mjs   # browser check (NODE_PATH → Playwright)
npx tsc -p lens/tsconfig.json                              # typecheck
```

The test build adds host access to all sites, so the check can turn the lens on and take
screenshots without a toolbar click. A unit test keeps the shipped manifest free of host
permissions. Third-party parts (Tesseract, the Odia model) and their licences:
`lens/PROVENANCE.md`.

Data: `Appv2/src/dictionary/praharaj.bin`, `modern.bin`, `origin.bin`, `loans.tsv`
and `core/data/glosses.tsv`; sources and checksums in
`Odia_Sanskrit_Appv2/PROVENANCE.md` and `Appv2/src/dictionary/PROVENANCE.md`. The
origin of the text of the modern layer's `[mt]` rows is still unknown (D-5); the
web app ships the same file.
