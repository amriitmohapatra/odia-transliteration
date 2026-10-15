# ARCHITECTURE.md — how the system is built

**Living document.** Claude updates this file in the same commit as any change that moves
a box, a file or a data flow below. Last updated: 2026-10-04 (V1 in progress).

Companion files: `PLAN.md` (what we build, in what order, and how we check it),
`plan/05-v3-direction.md` (research and decisions), `CLAUDE.md` (working rules),
`AGENTS.md` (hand-off for any AI tool).

**Style:** STE-flavored (short sentences, active voice). Terms are in the glossary at the
end.

---

## 1. The system in one picture

```
                         OWNER (native speaker)
                 edits rules, preferences, labels, phrases
                                   │
   ┌───────────────────────────────▼────────────────────────────────┐
   │  SOURCE OF TRUTH (git)                                         │
   │  core/rules/*.toml      letters → Odia, weights                │
   │  core/data/*.tsv        lexicon, unigrams (built), preferences │
   │                         and labels (hand-edited)               │
   │  Appv2/rules, data      Sanskrit profiles (generated + mined)  │
   │  Appv2/src/dictionary   Praharaj + modern glosses (binary)     │
   └───────────────┬────────────────────────────────┬───────────────┘
                   │ imported as text               │ build-time only
   ┌───────────────▼──────────────┐   ┌─────────────▼──────────────┐
   │  core/  THE ENGINE           │   │ tools/build-data (Python)  │
   │  TypeScript, synchronous,    │   │ corpus → lexicon/unigrams  │
   │  no I/O, no network          │   │ tools/eval  (measurement)  │
   └───┬──────────┬──────────┬────┘   └────────────────────────────┘
       │          │          │
   cli/       web/        Appv2/  ──► V1 web app (Vercel, static, offline)
   (dev)    (legacy        (three modes + dictionary + family-safe filter)
             single file)        │
                                 │ only if the user turns a feature on (V3)
                     ┌───────────▼─────────────┐
                     │ ASSIST LAYER (planned)  │  Vercel functions:
                     │ /api/speak /api/listen  │  keys stay on the server
                     │ /api/translate          │  → Sarvam, Google/Claude
                     └─────────────────────────┘

   lens/ (browser extension, V4.1, built) · ime-macos/ (Swift, JavaScriptCore) · Android/iOS (V5): later
```

## 2. Invariants (never break these)

| # | Invariant | Where it is enforced |
|---|---|---|
| I-1 | ଡ଼ and ଢ଼ are stored decomposed (U+0B21/U+0B22 + U+0B3C), never U+0B5C/U+0B5D | `canonical()` in `core/src/normalize.ts` at every boundary; nukta tests in `core/test/` |
| I-2 | `core/` makes no network call and has no I/O | `core/tsconfig.json` has `"types": []`; code review |
| I-3 | The engine API is synchronous | Type signatures; the macOS input method depends on it |
| I-4 | Linguistic behaviour lives in data (TOML/TSV), not in TypeScript | `CLAUDE.md` "Where behaviour lives"; `rules.ts` and `curation.ts` fail loudly on bad data |
| I-5 | Every shipped data source is MIT / CC0 / CC-BY (fonts OFL), with a provenance record | `PROVENANCE.md` per data folder |
| I-6 | Online features are opt-in, one switch each, and name the company that receives the data | V3 design rule (`plan/05` §4) |
| I-7 | No Odia literals in TypeScript source: use `\u` escapes | Review. Warning: the agent tooling can turn `\u` escapes into literal characters; check by code point after writing |

## 3. The engine (`core/`)

One call per keystroke: `transliterateWord(roman, topk)` → ranked candidates.

```
roman ──► tokenize ──► segment (rules lattice, beam) ──┐
              │                                        ├─► rank ──► candidates
              │        lexicon.lookup(key) ────────────┤    (dedupe on canonical,
              │        unigrams.logfreq(word) ─────────┤     family-safe filter,
              │        learnStore.get(key)  ───────────┤     reachability floor,
              │        preferences.get(key) ───────────┘     verbatim token last)
              └── digits: arabic | odia
```

| Module | Job |
|---|---|
| `normalize.ts` | `canonical()`, code-point helpers. The nukta invariant. |
| `tokenize.ts` | Splits input into words, digit runs, punctuation. Non-ASCII passes through. |
| `rules.ts` | Loads and validates `symbols.toml` / `itrans.toml`. Throws on any error. |
| `segment.ts` | Builds spellings from the rules (weighted lattice, beam search, position context). |
| `lexicon.ts`, `unigrams.ts` | Sorted lexicon (roman key → words) and word frequencies. |
| `curation.ts` | Owner data: `preferences.tsv`, `labels.tsv`, `glosses.tsv`, `phrases.tsv`. Strict parsers. |
| `bigrams.ts` | Word-pair counts (`bigrams.tsv`), strict loader; the context term. |
| `rank.ts` typed term | Typed-spelling pairs (`typed.tsv`, parsed as a lexicon): `typed * count / (total + prior)`, also a candidate source (`source: 'typed'`). |
| `converter.ts` | Desh spelling converter: n-best decoder over `converter.bin` (pure, synchronous). `rank.ts` adds `convert * share` (softmax of costs); weight `convert` for keys no word list knows, `convert_known` otherwise. The app fetches the file after start-up and rebuilds the engine. The user's most picked word for a key is always first. |
| `nextword.ts` | Next-word table (`nextword.tsv`): one- and two-word contexts, stupid back-off 0.4; contexts canonicalised on load, rows on first use. `Engine.predictNext()` filters labelled words. The bar shows them after "word + space" (tap or Alt+number only). |
| `Engine.complete()` | Whole-word completions from the typed pairs (prefix scan, `source: 'completion'`); the app puts up to two in the bar and in the dictionary search. |
| `rank.ts` | Merges evidence and scores (see formula). |
| `learn.ts` | User dictionary (`{roman: {odia: count}}`), memory or localStorage. |
| `strict.ts` | Deterministic ITRANS mode. |
| `index.ts` | `Engine`, `createEngine()`. `node.ts`: `createEngineFromDisk()`. |

**Score** (weights in `[weights]` of `symbols.toml`):

```
score = rule × (ruleScore + lexScore) + freq × logfreq + user × ln(1 + picks) + pref × prefWeight
        1.0                              1.5              2.0                    1.0
      + bigram × ln(1 + count(prev, word)) / ln(1 + total(prev))      (only with a previous word)
        1.2
```

Order of trust when sources agree: user > owner preference > lexicon > rules. One user pick
(2.0 × ln 2 = 1.39) beats a preference (1.0) and the strongest context (1.2); guarded by
`core/test/weights.test.ts`. The previous word comes from `transliterate()` (its own top-1)
or from the caret bar (`transliterateWord(roman, k, { prev })`, the Odia word before the caret).

**Content filter** (`filter: off | family | kids`, default family): `family` drops a word
labelled `offensive` unless the key typed is one of its own keys in `labels.tsv`, the user
taught it, or a preference lists it. The lexicon key alone does NOT exempt (the lexicon
files words under loose casual keys). `kids` drops `offensive` and `coarse` words with no
exemption, and `learn()` refuses them. It runs before the list is cut to `topk`. Strict
mode is not filtered.

## 4. Data

| Data | File | Made by | Edited by hand? |
|---|---|---|---|
| Rules (natural mode) | `core/rules/symbols.toml` | Owner + Claude | Yes, with eval delta |
| Rules (strict ITRANS) | `core/rules/itrans.toml` | From MIT `oriya.toml` | Rarely |
| Sanskrit profiles | `Appv2/rules/*.delta.toml` → `sanskrit.toml`, `unified.toml` | `Appv2/scripts/gen-rules.ts` | Only the `.delta` files |
| Lexicon, unigrams | `core/data/lexicon*.tsv`, `unigrams*.tsv` | `tools/build-data/` (reproducible since PR #1; `j`-keys for ଯ-words since V2.1) | No |
| Word pairs | `core/data/bigrams.tsv` (full, evals), `bigrams-web.tsv` (≤1.5 MB, browser) | `tools/build-data/build_bigrams.py` | No |
| Typed spellings (Desh) | `core/data/typed.tsv` (1.56 MB, 412 KB gzipped; adult web app, not kids) | `tools/build-data/build_typed.py` (raw file outside the repo) | No |
| Spelling converter (Desh) | `core/data/converter.bin` (gzip, 843 KB; adult and kids, not sloka) | `tools/build-data/build_converter.py` (raw file outside the repo) | No |
| Next words (Desh) | `core/data/nextword.tsv` (1.66 MB, 293 KB gzipped; adult only) | `tools/build-data/build_nextword.py` (raw files outside the repo) | No |
| Sanskrit lexicon | `Appv2/data/*.tsv` | `Appv2/scripts/mine_webfreq_sanskrit.py` | No |
| AI-written meanings | `core/data/meanings.tsv` (word / pair / "-suffix word" keys; status ai, owner, wrong) | Claude, in sessions; checked by the owner (C-13) | Yes |
| Verb endings | `core/data/verb-endings.tsv` (ending after a consonant root / after a vowel root / meaning); `explainVerb()` in `lookup.ts` takes the verb from the verbal noun's "to …" meaning: ପାଇଛନ୍ତି = "get + have …-ed (they, or respectful)" | Claude, in sessions; checked by the owner (C-13) | Yes |
| Numbers in Odia digits | no data: `readNumber()` in `Appv2/src/dictionary/lookup.ts` reads digits, counting words (-ti, -taa, -jana), ordinals and the ending rows of `meanings.tsv` ("2019 + in, at, on") | code | Yes |
| Owner preferences | `core/data/preferences.tsv` | Owner | Yes |
| Word labels | `core/data/labels.tsv` | Owner (empty until curated) | Yes |
| Owner meanings | `core/data/glosses.tsv` (read by the dictionary module, not the engine) | Owner; `seed` rows suggested by agents | Yes |
| Phrase table | `core/data/phrases.tsv`: greetings, wishes, festival wishes, the three words for "you", family, everyday; read by the Meanings panel (direction "Phrases", `dictionary/phrases.ts`), never by the engine | Owner; `seed` rows suggested by agents, shown as awaiting review | Yes |
| Eval overrides | `core/test/golden/everyday-overrides.tsv` | Owner decisions | Yes |
| Colloquial test set | `core/test/golden/colloquial.tsv` | Seed by agent, checked by owner (C-3) | Yes |
| Dictionary | `Appv2/src/dictionary/*.bin` (from `Odia_Sanskrit_Appv2/build/*.b64`) | `Odia_Sanskrit_Appv2/build/*.py` | No |
| Word origin | `Appv2/src/dictionary/origin.bin` (13 KB gzip; one line per `praharaj.bin` key; checksum-guarded, dropped if the keys differ) | `Odia_Sanskrit_Appv2/build/build_origin_map.py` from the Praharaj marks | No |

The dictionary module (`Appv2/src/dictionary/`): `index.ts` fetches the two `.bin` files
(gzip, inflated by a vendored pako, Safari 13 floor), `overlay.ts` adds gloss chips to the
caret bar, the picker and the output, plus a side panel with search. It imports
`canonical()` from core. It skips Latin items (`inline-latin`).

The panel also has an explicit English → Odia direction (12 October 2026).
`english.ts` searches the small bundled `english.tsv` by headword/alias, preserving
separate senses, translations and loan spellings. Each result shows review status
and supports Copy Odia and undoable insertion into the editor. It applies the same hidden-word callback as Odia lookup,
works independently of the historical binary payloads, and does not feed engine
ranking. See `Appv2/src/dictionary/PROVENANCE.md` for coverage and review limits.

"-web" files are the pruned versions the browser loads (phone memory budget).

## 5. The V1 web app (`Appv2/`)

```
index.html ─ main.ts ─┬─ engine.ts      loads assets per mode (lazy chunks), builds Engine
                      ├─ profiles.ts    ids: everyday | unified | sloka. Shown as: "Everyday"
                      │                 (= unified, default), "Śloka (verse)", and "Classic
                      │                 engine" (= everyday) under Settings → Advanced
                      ├─ preprocess.ts  | → ।  || → ॥  ' → ଽ  (before the engine)
                      ├─ inline.ts      caret popover (desktop) / strip docked on the phone
                      │                 keyboard via visualViewport (1–8 Odia + "Keep" as 9)
                      ├─ editor.ts      native input, composition and scripted edit transactions
                      ├─ editor-state.ts selection, literal spans and bounded undo/redo history
                      ├─ readback.ts    the "Reads as" line; tap a word → alternatives
                      ├─ romanize.ts    Odia → Latin for the read-back (copy of the eval one)
                      ├─ badges.ts      "offensive" / "can be rude" badges, from engine.labelsOf()
                      ├─ palette.ts     insert strip for rare marks
                      ├─ dictionary/    gloss chips, side panel, search (lazy, ~6 MB)
                      └─ sw.js          generated service worker (offline)
```

**DOM contracts** (commented at both ends in the code; break one and a gloss silently
disappears, so a Playwright check guards each):

| Selector | Producer | Consumer |
|---|---|---|
| `div.inline-candidates > button.inline-candidate > .inline-text \| .inline-latin` | `inline.ts` (inside `#kb-bar`) | `dictionary/overlay.ts` gloss chips |
| `#picker-list > li > button.candidate > .text` | `main.ts` alternatives sheet | `overlay.ts` |
| `#readback .rb-word[data-odia]` (replaced `#output .word`) | `readback.ts` | `overlay.ts` tooltips |
| `body.kb-docked` | `inline.ts` | CSS (phone strip state) |
| `data-label` on `button.inline-candidate` and `button.candidate` | `inline.ts`, `main.ts` | `overlay.ts` sets `aria-label` = label + ", " + meaning |
| `[aria-controls="dict-panel"]`: `#dict-toggle` (in `index.html`), `#meanings-dock` | `index.html` | `overlay.ts` keeps `aria-expanded` in step; `dictionary/index.ts` exports `setMeaningsOpen` / `meaningsOpen` |
| One `.dict-search` box (no direction select since 2026-10-12); results grouped under `.dict-group` headings: `.dict-spelled-entry` (Odia spellings of a roman query), `.dict-english-entry`, `.dict-loan-entry`, `.dict-phrase-entry`, each with `.dict-insert` / `.dict-copy`; `.dict-browse-phrases` in the empty state | `overlay.ts` | `english-check.mjs`, `phrases-check.mjs`, `mobile-check.mjs` |

**Layout:** at ≥1100 px `body` is a two-column grid and `#dict-panel` is a sticky meanings
column. The desktop caret popover is a vertical list that opens below or above the caret
(`keepClear()`), so it never covers the "Reads as" line. Help (header button) holds the
first-run card and the cheat sheets.

**Phone layout (12 October 2026):** the shared `DOCK_QUERY` selects the responsive
phone/coarse-tablet view. `main.ts` mirrors `visualViewport` dimensions and offsets
into CSS variables and toggles `phone-editing` while composing. The editor fills
the space above the measured candidate dock; caret scrolling stays inside the
textarea. Surrounding introductory controls return after Done. Phone Odia uses
unscaled Noto Sans Oriya with the selected text-size multiplier.

The phone dictionary is an explicitly opened modal sheet, bounded by the visible
viewport. Its results scroll separately, the background is inert, and focus stays
in the sheet. Back to typing and successful insertion return to the editor.
Desktop retains the sticky meanings column. This remains a browser app, not an
iOS system keyboard; viewport simulations do not establish device parity.

**Editor transactions (12 October 2026):** the editor value is the document being
copied or shared. Space/newline commits an eligible Roman token with its punctuation;
Copy visibly finishes the current eligible token before reading the value. Addresses,
domains, acronyms and alphanumeric identifiers stay literal. Paste, drop, spell-check
replacements, non-Roman composition and explicit Keep choices retain literal-span metadata
through subsequent edits and undo/redo. Left/Right move the caret; Up/Down choose
candidates; number keys 1–9 take a candidate while the bar is open (Microsoft IME style,
the owner's original design; setting "Number keys pick suggestions", on by default), and
Alt/Option+1–9 always does. With the setting off, number keys type digits. No
whole-document conversion runs as a side effect of copying.

**Unified dictionary search (2026-10-12, owner request):** the Meanings panel has one search
box. Odia script → the Odia entry (Praharaj, modern, origin) and phrases. English letters →
three groups: the Odia spellings the engine gives for it (`spell` option of
`startDictionary`, the same top 5 as typing) with their meanings; English word → Odia
(`english.tsv`, then the loan-word list `dictionary/loans.tsv`: English loans and Persian /
Arabic / Hindi words by English meaning, generated by `tools/build-data/build_loans.py`,
see `Appv2/src/dictionary/PROVENANCE.md`); and phrases. An Odia result that is in the loan
list shows its origin ("English loan word: phone"). An exact English
match shows first. Empty box → meanings of the current suggestions, as before.

**Composition (fixed 2026-10-12, after PR #5):** `isLiteralInput()` in `editor-state.ts`
decides. Composed text that is plain Roman (Android Gboard composes whole words) is
eligible: the bar shows during composition and Space converts it. Composed Odia or other
scripts (an IME's own commit) stays literal. A tap on a suggestion during composition
ends the composition in `Editor.replace()`; undo first returns the Roman word. Escape
closes the bar for the current word only (Space then types a plain space); Keep is the
only way to keep a word in English permanently. Checks: `editing-check.mjs` composition
cases (CDP `Input.imeSetComposition`), desktop and phone.

The English dictionary's optional insertion callback delegates to the editor. It
replaces the last editor selection with the explicitly chosen canonical Odia form;
the dictionary never assigns textarea values itself. Insert, candidate commits,
palette edits and Clear share the same document history. History and literal ranges
are in memory, not a server or persistent draft store. The proposed dictionary
entries retain their review labels and do not change transliteration rankings.

**Accessibility:** the text box has `aria-controls`, `aria-activedescendant`,
`aria-autocomplete`, `aria-describedby`; options have `tabindex=-1` and are named "word,
meaning"; `#inline-live` is a polite live region; the palette is one `role=toolbar` tab
stop; one global `:focus-visible` ring. Design tokens follow
`plan/design/v1-ux-proposal.md` §4 (70/70 contrast pairs pass; table in commit f2e0ee8).

**Layers (z-index):** strip/popover 20 · meanings toggle 30 · meanings panel 35 · sheets 40 ·
toast 50.

**Loading order** (keeps the first screen fast): page shell → engine assets for the
selected mode → engine → dictionary data on first need.

**Browser storage** (per device, never sent anywhere):

| Key | Holds |
|---|---|
| `odia.userdict` | Learned picks `{roman: {odia: count}}` |
| `odia.pref.profile`, `odia.pref.digits`, `odia.pref.strict` | Settings |
| `odia.pref.familySafe` | "Hide rude words" switch: `'1'`/`'0'`, missing = on |
| `odia.pref.numberPick` | "Number keys pick suggestions" switch (1–9 take a suggestion, Microsoft IME style): `'1'`/`'0'`, missing = on |
| `odia.pref.textSize` | `normal` / `large` / `xl` (scales every `--fs-*` by 1 / 1.15 / 1.3; applied by an inline head script before first paint) |
| `odia.pref.seenIntro` | `'1'` once the first-run card is dismissed |
| Cache Storage `odia-appv2-<rev>` | Offline copy of the app; each app touches only its own prefix |

**Builds:**

| Command | Output | Use |
|---|---|---|
| `npx vite build --config Appv2/vite.config.ts` | `Appv2/dist/` (chunks, service worker) | Vercel |
| `SINGLE_FILE=1 … && node Appv2/scripts/make-single-file.mjs` | one `.html` (fonts and dictionary inlined) | AirDrop / offline file |

`web/` stays as the builder of the legacy `docs/odia-app.html`. V1 does not use it.
**From the V1 UI work (2026-10-04) `web/` is frozen**: it gets engine and safety fixes only.
`web/src/inline.ts` and `Appv2/src/inline.ts` were byte-identical until then; they now
diverge on purpose. Do not "re-sync" them. The theme checker reads Appv2's `style.css`
and `dictionary/overlay.css` together.

## 6. Hosting and deployment (V1)

- Vercel serves `Appv2/dist/` as static files. No server code runs in V1.
- **Live since 2026-10-04:** adult `https://odia-transliteration-web.vercel.app/`, kids
  `https://odia-phonetic-kids.vercel.app/`. Both projects deploy from `main`.
- **Root Directory must be the repository root** (empty or `./`). Vercel may suggest `web`
  because `web/` is a Vite project; with `web` the build fails ("Could not resolve
  .../web/Appv2/vite.config.ts"). Leave the command overrides off so `vercel.json` applies.
- `vercel.json` (repo root) sets the install and build commands, the output folder and
  headers (`sw.js` must not be cached long, so updates reach users).
- Every push to a branch gets a Vercel preview address. The configured production
  branch is `main`; merging there triggers production deployments for both editions.
  Release after checks and user authorization. Rollback = promote the previous deployment.
- No analytics script. "Nothing sent online" is part of the value proposition.
- **Two editions from one repository** (owner, 2026-10-04): adult (default) and kids. Set
  `APP_EDITION=kids` at build time for the kids app: core filter level `kids` (offensive
  and coarse words never suggested, never learned, never explained by the dictionary), no
  "Hide rude words" switch, name "Odia Phonetic Kids". On Vercel the kids app is a second
  project on the same repository with the environment variable `APP_EDITION=kids`, so it
  has its own address. Single file: `APP_EDITION=kids SINGLE_FILE=1 npx vite build --config
  Appv2/vite.config.ts && APP_EDITION=kids node Appv2/scripts/make-single-file.mjs` writes
  `docs/odia-app-kids.html`. Known gap: about 348 Praharaj entries with offensive markers
  stay searchable in kids until they are labelled (C-1). The verbatim Latin item is not
  filtered (English abuse is outside this filter).
- `vercel.json` today: install `npm ci`; build `npx vite build --config Appv2/vite.config.ts`
  (Appv2 reads `core/src` directly, so no separate engine build); output `Appv2/dist`;
  `sw.js` and `index.html` revalidate on every load; hashed `assets/` cache for a year;
  `nosniff`, `no-referrer`, and a `Permissions-Policy` that blocks camera, microphone and
  location. **V3 and V4 must relax that policy** (`microphone=(self)` for speak-to-write,
  `camera=(self)` for the lens) in the same commit that adds the feature.

## 7. The assist layer (V3, planned)

| Route | Does | Provider (D-3) |
|---|---|---|
| `/api/speak` | Odia text → audio | Sarvam Bulbul (browser voice first where present) |
| `/api/listen` | audio → Odia text | Sarvam Saarika |
| `/api/translate` | sentence → English | Google or Claude Haiku (100-sentence test decides) |

Rules: keys only in Vercel environment variables; `.env*` never committed; rate limit per
visitor; provider spending limit; hard cap US$20/month (D-4); logs never hold user text;
every result passes `canonical()`; cache by canonical text.

## 7b. Odia Lens, the browser extension (`lens/`, V4.1)

Point at an Odia word on any web page: pronunciation, meaning, origin. Chrome and Edge,
Manifest V3. Details and install steps: `lens/README.md`.

| Part | Does |
|---|---|
| `lens/src/background.ts` | Toolbar click or Alt+Shift+O → injects `content.js` into that tab and toggles it (badge ON). Answers lookups from the packed dictionary. |
| `lens/src/content.ts` | Word under the pointer (`caretRangeFromPoint`, `word.ts`), card in a shadow root (constructed style sheet, so page CSP cannot block it), Esc, scroll hides. |
| `lens/src/describe.ts` | Word + entry → card: `romanize()` (the app's read-back), owner meaning, modern layer, Praharaj gloss, loan note, origin. |
| `Appv2/src/dictionary/lookup.ts` | The lookup the app's Meanings panel uses too (fold, exact / stem / prefix, short gloss). |
| `lens/build.mjs` | esbuild bundles (classic scripts); splits `praharaj.bin` into a keys file and 78 gzip chunks of 500 definitions, so a restarted worker answers in ~0.3 s instead of unpacking 24 MB. Copies the OCR engine and model (`ocr/`) and the word list (`dict/words.bin`). |

**Picture mode (V4.2, 2026-10-15):** Odia in images, canvases and paused videos (ePapers,
YouTube frames). When the pointer rests on a picture, `content.ts` hides the card and asks
the background; the background takes a screenshot (`captureVisibleTab`, allowed by
`activeTab`) and crops 640 × 140 CSS px around the pointer; the OCR page
(`lens/src/offscreen.ts`, an offscreen document) finds the text line from the pixels
(`picture.ts findLine`, a few ms), reads that line alone with Tesseract `ori` (tesseract.js,
WebAssembly, single-line mode, letters enlarged to ~64 px; the image goes in as raw grey
PGM, because Chrome delays PNG encoding in hidden pages by ~1 s), and falls back to reading
the region when the line is unclear. The background splits run-together words and digits
(`correct.ts separate`), corrects each word with the IndicCorp list (`correct.ts`: known
word, rare misprint of a 300× more common word, nearest word within 1–2 edits), and builds
the same card, which says "Read from the picture" (and what OCR saw when it was
corrected, or "unclear print"). The line's words stay cached until scroll or a playing
video changes the screen. About 0.4–0.7 s per new line; 1.3 s for the first (engine start).

**Frame (lens 0.3.0, Alt+Shift+F):** a see-through box the reader moves and resizes. On
release (and when the page scrolls under it) `content.ts` hides its panel, the background
captures the inside of the frame, and the OCR page reads it as a block (`ocr.ts readBlock`:
lines found with Tesseract's block mode, then each line read again alone, up to 12). Each
line comes back as read, plus its words, each corrected and looked up with the word before
it (constructions such as "-ku nei"). `frameview.ts` draws the list (shared with the Mac
lens). The lookup and OCR code is platform-neutral: `engine.ts` (dictionary loading,
lookup, OCR word handling; a file loader is set by the host) and `ocr.ts` (Tesseract; the
host sets the file paths).

**Privacy:** permissions `activeTab`, `scripting` and `offscreen`, no host permissions (a
unit test checks the shipped manifest); CSP allows WebAssembly only from the extension;
nothing leaves the computer (the browser check fails on any outside request). **No Desh
data** in the extension. Package: about 10 MB zip.

**Limits:** top frame; OCR quality is the stock Tesseract model's (good on clean print and
most headlines, weak on 5 px ePaper body text: own model V4.3); one word at a time; no
sentence translation (V4.5); Chrome and Edge only.

## 8. Testing and measurement

| Check | Command | Measures |
|---|---|---|
| Engine unit tests | `npx vitest run --root core` | Correctness, nukta invariant, curation, filter |
| Appv2 unit tests | `npx vitest run --root Appv2` | Preprocessing |
| Fallback page | `node docs/odia-simple.test.mjs` | The 40 KB rules-only page |
| Held-out accuracy | `npm run eval` | Aksharantar test split, in-lexicon vs OOV, vs `baseline.json` |
| Everyday accuracy | `npx tsx tools/eval/everyday.ts` | Real Odia round-trip, careful and casual |
| Coverage | `npx tsx tools/eval/coverage.ts` | Every letter, matra, conjunct reachable |
| Colloquial | `npx tsx tools/eval/colloquial.ts` | Spoken, slang, dialect forms by register (unvalidated seed) |
| Context | `npx tsx tools/eval/context.ts` | Words in their sentence, with and without the previous word; `--weights` sweeps the bigram weight |
| CI | `.github/workflows/ci.yml` | All of the above on every push |
| Appv2 suite | `npx tsx Appv2/eval/run.ts` | Rule drift, theme, no-regression, Sanskrit coverage, śloka |
| Browser (Chromium) | `Appv2/eval/browser/*.mjs` (see its README) | Typing, meanings, Keep English, offline, report button, A-7 timing — against the built app |
| Browser (Safari engine) | `tools/eval/webkit-check.py` | On a Mac only |

Rule: every rule or data change reports the metric delta in its commit.

## 9. Decision log (short)

| Date | Decision | Why |
|---|---|---|
| 2026-07 | TypeScript engine, rules in TOML | JavaScriptCore runs the same engine on macOS/iOS |
| 2026-07 | Offline engine, no network ever | Reliability; no undocumented endpoints |
| 2026-10-04 | Offline core + opt-in online assist layer (D-2) | New features need servers; the engine stays offline |
| 2026-10-04 | Appv2 becomes the V1 web app; dictionary becomes a module | One app, one service worker, one build |
| 2026-10-04 | Owner preferences as data with their own weight, below one user pick | Owner decides ambiguous keys (raja → festival) without code |
| 2026-10-04 | Family-safe filter in `rank()`, on by default (D-0) | Never suggest an abuse as a near miss; always allow typing it |

## 10. Glossary

| Term | Meaning |
|---|---|
| Candidate | One suggested Odia spelling for the typed word |
| Canonical | The one stored form of an Odia string (see I-1) |
| Lexicon | Roman key → Odia word list, from data |
| OOV | Out of vocabulary: not in the lexicon |
| Service worker | Browser code that keeps a copy of the app for offline use |
| Static site | Files only; no server code runs |
| Verbatim token | The typed Latin word, offered as-is (for English words) |
