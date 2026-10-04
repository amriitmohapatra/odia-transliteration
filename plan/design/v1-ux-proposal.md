# Odia Phonetic V1: UX audit and design proposal

> Committed 2026-10-04. Four of the 45 screenshots are in `plan/design/screens/`
> (keyboard-open phone, dark-mode suggestion bar, Alternatives sheet, desktop). The others
> stayed in the design session's scratch folder. `contrast.mjs` is in `plan/design/`.

Date: 2026-10-04. Author: UI/UX design role (research only; no repository files changed).
Scope: the V1 Vercel web app built from `Appv2/` (Everyday / Odia+Sanskrit / Śloka), with the
dictionary module, the family-safe switch and the read-back line. Later stages (assist layer,
lens) get reserved slots only.

Inputs read: `plan/05-v3-direction.md` §1, §2, §6, §7, §9, §13; `plan/06-owner-followups.md`;
`Appv2/README.md`, `Appv2/index.html`, `Appv2/src/main.ts`, `Appv2/src/inline.ts`,
`Appv2/src/style.css`, `Appv2/eval/check-theme.mjs`; `Odia_Sanskrit_Appv2/README.md` and
`build/dict-overlay.css`.

Skills used: `anti-ui-slop` (design contract, required states, finish gate),
`ui-ux-pro-max` (UX guideline searches, pre-delivery checklist), `web-design-guidelines`
(Vercel Web Interface Guidelines, fetched 2026-10-04).

A note on `ui-ux-pro-max --design-system`: it was run with "language learning input tool
accessible elderly". It returned a landing-page pattern, a claymorphism style and the
Baloo 2 / Comic Neue font pair. **Rejected**: wrong product class (this is a typing tool, not a
marketing page), the fonts cannot render Odia, and the app must ship Noto Sans Oriya offline.
Nothing from that output is used here. The targeted UX searches (touch targets, contrast,
toasts) and the pre-delivery checklist are used.

---

## 0. The three builds that were audited

The `Appv2/dist` folder was rebuilt by another engineer **during** this audit (06:43 → 07:06).
So the screenshots cover three builds. Each finding below says which build it applies to.

| Tag in file names | What it is | Served from |
|---|---|---|
| `appv2-*` | Appv2 as of 06:43, before the dictionary module | `Appv2/dist` (06:43) |
| `dict-*` | The single file the parents use today | `Odia_Sanskrit_Appv2/odia-app-sanskrit-v2.html` |
| `v1wip-*` | V1 work in progress: Appv2 with the dictionary module merged | snapshot of `Appv2/dist` at 07:06, copied to `design/v1wip-dist/` |

All screenshots are in this folder (`scratchpad/design/`), at device scale 2.

| File | Shows |
|---|---|
| `appv2-phone-light-0-fullpage.png`, `dict-phone-light-0-fullpage.png` | whole page, phone |
| `{appv2,dict,v1wip}-{phone,desk}-{light,dark}-1-empty.png` | empty state |
| `{appv2,dict,v1wip}-{phone,desk}-{light,dark}-2-kemiti-achha.png` | after typing "kemiti achha" (Space commits each word) |
| `{appv2,dict,v1wip}-{phone,desk}-{light,dark}-3-dina.png` | then " dina", suggestion bar open |
| `appv2-phone-light-4-keyboard-open-sim.png`, `dict-phone-light-4-keyboard-open-sim.png` | 390×480 viewport: what is visible above an iPhone keyboard |
| `{appv2,dict,v1wip}-phone-light-5-picker.png` | the "Alternatives" sheet after tapping an output word |
| `v1wip-phone-light-6-loading.png` | loading state (word list delayed by 3 s) |

No reference-screen catalogue (anti-ui-slop step 2, UIZZE) was consulted; the audit relies
on the app's own screenshots and the guidelines above.

Not tested: real iOS Safari / Android Chrome (only Chromium is available here, see owner item
A-3), offline mode, screen readers, 200% text zoom. These are in the test plan (§8).

---

## 1. Audit: what is wrong today

Severity: **Blocker** = a parent hits it in the first minute. **High** = hurts a core task.
**Medium** = friction. **Low** = polish.

### 1.1 Blockers

| # | Finding | Build | Evidence |
|---|---|---|---|
| B1 | **On a phone, the keyboard hides almost everything.** With the keyboard open (~480 px left), the suggestion bar drops below the caret and runs off screen: only candidates 1–4 are visible, and the Odia result and the Copy button are not visible at all. A parent types, cannot see the choices, and cannot find Copy. | all | `*-4-keyboard-open-sim.png` |
| B2 | **Dark mode: the highlighted suggestion becomes unreadable when the pointer rests on it.** Dark text on dark grey, 1.71:1. Cause: in `style.css` the dark-mode `.inline-candidate:hover` rule comes *after* `.inline-candidate.is-active`, with equal specificity, so the hover background wins while the text keeps the "on-accent" dark colour. On touch screens the hover state can stick after a tap. One-line fix (`.inline-candidate:not(.is-active):hover`). | appv2, v1wip, dict | `*-phone-dark-3-dina.png`, item 1 |
| B3 | **The Alternatives sheet breaks Odia words in half.** "ଦିନ" renders as "ଦି" on one line and "ନ" on the next, because the word shrinks to make room for the gloss and `overflow-wrap: anywhere` lets it split between letters. A reader sees nonsense. | v1wip | `v1wip-phone-light-5-picker.png` |
| B4 | **The meanings button covers the Alternatives sheet.** The round "ଅ→A" button (z-index 59) floats over the sheet (z-index 20) and hides the bottom rows. | v1wip, dict | `v1wip-phone-light-5-picker.png` |
| B5 | **Wrong meanings that a parent will see first.** `kemiti` → କେମିତି ("how") is glossed **"English: committee"** (the loan detector). ଆଛା shows the truncated gloss **"See)"**. ଦିନ shows "day after day · Day." These are data bugs, not UI bugs, but the gloss is the product's main promise (brief §1.1). | v1wip, dict | output tooltips; `dict-phone-light-2-kemiti-achha.png` |

### 1.2 High

| # | Finding | Build |
|---|---|---|
| H1 | **The Odia result appears twice.** After Space commits a word, the text box already holds the Odia. The "ODIA" box below repeats it. Two boxes with the same text, and the second one pushes Copy down. For user B the useful thing under the text is a romanised read-back, not a copy. | all |
| H2 | **Odia inside the text box uses the wrong font.** Committed Odia in the textarea uses the monospace stack, not Noto Sans Oriya, at 17 px with no Odia scale. The same word looks different (and smaller) in the box than in the result. | all |
| H3 | **Glosses and labels are too small for older eyes.** Measured: gloss 11.5 px, dictionary tags 10.2–10.9 px, section labels 11.5 px (upper-case), hints 12.5–13 px, the "Loading dictionary…" status 13 px. Target is 15 px minimum for any text a user must read. | all |
| H4 | **Long, archaic glosses.** "Feminine of Dīna; afflicted.", "Day (prefixed to words denoting number)", "The form taken by the verb 'To be' in present tense 2nd…". Each gloss wraps differently, so candidate positions jump (item 1 has the gloss inline, item 3 centred on two lines). | v1wip, dict |
| H5 | **Engine words shown to users.** The Alternatives sheet labels each row "LEXICON" or "RULE". "Strict ITRANS" and "Vocalics" are on the main screen. The footer cites `plan/04-scope.md`. | all |
| H6 | **Desktop: the dictionary panel hides part of the suggestion bar.** Both use z-index 60; the bar wraps three-per-row and its right column (item 5) slides under the panel. | v1wip, dict (`*-desk-*-3-dina.png`) |
| H7 | **The empty state speaks to Sanskrit scholars, not to the family.** Placeholder is `dhyaana balaatitam naanyam balam |` and its Odia verse. The mode hint talks about "Sanskrit forms a slot or two down". The rare-mark palette ("VOCALICS ଋ ୠ ଌ ୡ") sits in the middle of the main screen in every mode. | all |
| H8 | **The output placeholder looks like real output.** The grey verse in the ODIA box looks like a result. A parent can press "Copy Odia" and get "Nothing to copy". | all |
| H9 | **Silent loading.** While the word list loads, typing produces no output at all. The only signal is a 13 px "Loading dictionary…" line placed *below* the toggles, off the user's focus. | v1wip (`v1wip-phone-light-6-loading.png`) |
| H10 | **Parents' file is behind.** In `odia-app-sanskrit-v2.html` item 9 is ଦିଣା, not the typed English word (the V0 fix is missing), and it has no bundled font (different glyph shapes). V1 on Vercel will replace it; until then the parents test an older app. | dict |

### 1.3 Medium

| # | Finding |
|---|---|
| M1 | Control borders (`--line`) are 1.17–1.36:1 against their surface in both themes. The text box edge, palette keys and checkboxes need 3:1 (WCAG 1.4.11). |
| M2 | Opacity is used to make text "quiet": palette group names at 0.55 (3.75:1, fails), the "no meaning" dot at 0.35 (1.67:1, fails, and a dot means nothing to a parent). |
| M3 | Mode is a small native `<select>` labelled "Mode" in grey. Three options, so a segmented control would show all of them. "Odia + Sanskrit" as a label confuses a parent who just wants to chat. |
| M4 | The meanings button "ଅ→A" is an icon-like symbol with no word. Users A and C will not guess it opens the dictionary. |
| M5 | The suggestion bar is a `role="listbox"` but the textarea does not point to it (`aria-controls`, `aria-activedescendant`), so a screen reader never announces suggestions. |
| M6 | Odia text is not marked `lang="or"`. Screen readers (and later read-aloud) will try to pronounce it as English. |
| M7 | No offline indicator. The app works offline but never says so; the tagline claims it, which reads as marketing. |
| M8 | "Clear" deletes everything with no undo. |
| M9 | Desktop: the dictionary panel shows the full Praharaj entry as a wall of mixed Odia and English text. |

### 1.4 Low

- `What to type` and `Typing Sanskrit` are long reference tables on the main page; they belong in Help.
- Wrapped grid in the caret bar: positions change with gloss length, so the number for a word is hard to find by eye.
- The toast lasts 1.6 s; older users may miss "Copied".

### 1.5 What already works and must be kept

- 44 px buttons, 17 px body text, ≥16 px inputs (no iOS zoom), safe-area padding, no sideways
  scroll.
- Space commits the top word; number keys pick; the typed English word is the last item (v1wip).
- Dotted underline on uncertain words, and the bottom sheet for alternatives (one-handed).
- The theme checker (`Appv2/eval/check-theme.mjs`) and the `--accent-text` flip.
- Main text contrast passes AA in both themes (see §4.2).

---

## 2. Design contract (anti-ui-slop step 4)

| Item | Decision |
|---|---|
| **Screen job** | Turn spoken Odia, typed in English letters, into Odia text that the user can *check* and then send. |
| **Primary user** | A parent on a phone, typing a WhatsApp message. Secondary: user B (speaks, cannot read) and user C (learner). |
| **Primary action** | Pick the right word (by its meaning), then **Share / Copy**. |
| **Hierarchy** | 1 text box → 2 suggestions with meanings → 3 read-back line → 4 Share/Copy → everything else behind Settings or Help. |
| **Workflow shape** | One screen, one text box. No navigation. Sheets for Settings, Help, Alternatives, Dictionary (phone). |
| **Allowed components** | Text box, suggestion strip (phone), caret popover (desktop), read-back line, segmented control, switch, button, bottom sheet, side panel (desktop), toast, status chip, badge. |
| **Required states** | Empty / first run, loading, typing, no suggestions, word not in dictionary, flagged word (rude / offensive), copied, copy failed, offline-ready, word list failed, dictionary failed, cleared (undo). |
| **Responsive rule** | Phone and desktop get **different suggestion components** that share one data source. Phone: strip docked above the keyboard. Desktop: vertical popover at the caret plus a docked dictionary column. |
| **Reject** | Card grids, decorative gradients, emoji as icons, engine jargon ("lexicon", "ITRANS", "vocalics") on the main screen, text below 15 px, opacity as a colour. |

---

## 3. Proposed V1 UX

### 3.1 Information architecture

```
Main screen (one screen, no navigation)
├─ Header: name · offline status · Settings · Help
├─ Mode: [ Everyday | Śloka ]                (segmented; see note)
├─ Text box (the only composing surface)
│    └─ reserved slot: mic button (V3)
├─ Suggestions
│    ├─ phone: strip docked above the keyboard
│    └─ desktop: popover at the caret
├─ Read-back line ("Reads as: kemiti achha dina")
│    ├─ each word is tappable → Alternatives sheet
│    └─ reserved slot: speaker button (V3)
├─ Share (phone) / Copy (desktop) · Clear
└─ Meanings: side column (desktop) / "Meanings" button → sheet (phone)

Sheets
├─ Alternatives (word + meaning + badge; reserved speaker slot per row)
├─ Settings
│    ├─ Hide rude words  [on]
│    ├─ Odia digits ୧୨୩  [off]
│    ├─ Text size  Normal | Large | Extra large
│    ├─ Advanced: Exact spelling (no guessing) [off] · Classic engine
│    └─ (V3) Online helpers — each switch names the company
└─ Help
     ├─ What this is (two lines) · How to type (cheat sheet) · Typing Sanskrit
     ├─ Marks palette (। ॥ ଽ ଃ …) — also a button in Śloka mode
     └─ About · privacy · (V4) "Get the browser helper"
```

**Mode note (owner decision).** The README measures the unified profile at +0.0 pp on everyday
Odia, so it is safe as the default. Proposal: show it as **"Everyday"**, show Śloka as
**"Śloka (verse)"**, and move the original byte-for-byte engine into Settings → Advanced as
"Classic engine". Only the labels change; profile IDs and the no-regression harness stay as
they are. If the owner prefers to keep three visible modes, use a three-part segmented
control with the same labels plus "Classic".

### 3.2 One composing surface, not two (resolves H1, H2)

- Keep the **text box** as the only place where text lives. Committed words become Odia in
  place (already true), rendered in **Noto Sans Oriya at the Odia scale**: put
  `'Noto Sans Oriya'` first in the text box font stack (its `unicode-range` limits it to
  Odia), then the UI font. Drop the monospace font.
- Replace the "ODIA" output box with the **read-back line** directly under the text box.
- The read-back line is a row of word buttons, one per Odia word. Tapping a word opens the
  Alternatives sheet for that word. This keeps the "fix a word later" function that the
  output box had.
  - Engineering note: the inline bar knows the English key at commit time. Store it with the
    committed word (a list of {start, end, roman}) so the sheet can ask the engine again.
    Fall back to the romanised form when the key is unknown (pasted text).
- Today the output box also does three jobs the inline bar does not. With one surface they
  move into the text box:
  - **Strict mode.** The inline bar is disabled in strict mode
    (`inline.setEnabled(!strict)`) and the Odia only appears in the output box via
    `engine.strict()`. New: on Space or punctuation, commit the deterministic result in place
    (same inline mechanism, one candidate, no strip). The read-back line still shows.
  - **Bulk conversion.** Pasted English text, and words typed before the word list loaded,
    were converted only in the output box. New: on paste and when the engine becomes ready,
    run one in-place pass that converts pending English words to their top candidate, and
    mark those words in the read-back line as "not checked yet" (dotted underline).
  - **Copy/Share with a pending word.** Commit the word at the caret (top candidate) before
    copying, or the copied text ends in English.

### 3.3 Primary flow per user

**A — Odia-speaking parent, phone, WhatsApp**
1. Opens the link (home-screen icon after first visit). First-run card explains the app.
2. Types `kemiti achha`. The strip above the keyboard shows ଅଛ "you are", ଆଛା "okay"…; Space
   takes the first.
3. Glances at the read-back line, taps **Share**, picks WhatsApp. (Desktop: Copy, then paste.)

**B — speaks Odia, cannot read the script**
1. Types the sound. Picks by the **English meaning** in the strip, never by the Odia shape.
2. Checks the read-back line: it shows how the *Odia* reads, worked out from the Odia
   letters, not an echo of what they typed. If it says `deena` where they meant `dina`, the
   wrong word was picked.
3. A word with no dictionary entry shows "not a known word", a hint to try another spelling.
4. Family-safe ON protects them from sending an abuse by accident (brief §6 rule 4).
5. V3: speaker button reads the message aloud before sending.

**C — non-Odia person in Odisha (reads/writes a little)**
1. Uses the strip and read-back the same way, plus **Meanings** (side column / sheet) to learn.
2. Uses Help → How to type as a reference.
3. V4: the browser helper (lens) for reading Odia on web pages.

### 3.4 Phone layout (390 px)

Keyboard closed, after typing:

```
┌──────────────────────────────────────┐
│ [ଓ] Odia Phonetic   (✓ Offline)  [⚙] [?]│ 56px header; offline chip 15px text
├──────────────────────────────────────┤
│ ┌───────────────┬───────────────────┐ │
│ │   Everyday    │  Śloka (verse)    │ │ segmented, 48px
│ └───────────────┴───────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ କେମିତି ଅଛ ଦିନ                       │ │ text box: Odia 22px, Latin 18px
│ │                                  │ │
│ │                           [mic]  │ │ ← reserved, hidden until V3
│ └──────────────────────────────────┘ │
│ Reads as                              │ 15px label
│ [kemiti] [achha] [dina]       [spk]  │ 18px word buttons; speaker reserved (V3)
│                                       │
│ ┌─────────────────────────┐ ┌──────┐ │
│ │      Share…              │ │ Copy │ │ 52px; Share = navigator.share
│ └─────────────────────────┘ └──────┘ │
│  Clear                    [Meanings] │ quiet buttons, 44px
└──────────────────────────────────────┘
```

Keyboard open (the real case):

```
┌──────────────────────────────────────┐
│ [ଓ] Odia            [Copy]  [⚙]       │ Copy moves into the header once text exists
│ ┌──────────────────────────────────┐ │
│ │ କେମିତି ଅଛ dina|                   │ │
│ └──────────────────────────────────┘ │
│ Reads as  kemiti achha …              │ one line, ellipsis at the start if long
├──────────────────────────────────────┤ ← strip pinned to visualViewport bottom
│┌──────────┐┌──────────┐┌──────────┐ ›│
││ ଦିନ       ││ ଦୀନ       ││ ଦିନା      │  │ Odia 24px
││ day      ││ poor     ││ day (with│  │ gloss 15px, 1 line, ellipsis
││          ││          ││ numbers) │  │
│└──────────┘└──────────┘└──────────┘  │ 3 cards visible; swipe or › for 4–8,
├──────────────────────────────────────┤  last card: Keep "dina" (English)
│           system keyboard             │
└──────────────────────────────────────┘
```

Rules for the phone strip:
- Docked to the bottom of `window.visualViewport`, so it rides on top of the keyboard on iOS
  and Android. Hidden when the keyboard is closed and no word is pending.
- **3 candidates visible**, each card ≥ 110×64 px. Cards 4–8 by horizontal scroll and a `›`
  button (keyboard and switch-access alternative to swiping). Last card: `Keep "dina"`.
- No number badges on phone (phone keyboards have no number row by default).
- First card has the "Space takes this" highlight (accent background).
- Flagged words carry a text badge in the card: "can be rude" or "offensive".

### 3.5 Desktop layout (1280 px)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [ଓ] Odia Phonetic                          ✓ Works offline   Settings   Help      │
├──────────────────────────────────────────────────┬──────────────────────────────┤
│ ( Everyday | Śloka (verse) )                       │ Meanings          [search…]  │
│ ┌──────────────────────────────────────────────┐ │ ─────────────────────────── │
│ │ କେମିତି ଅଛ dina|                               │ │ 1  ଦିନ   day                 │
│ │    ┌───────────────────────────────────┐     │ │    MODERN  day; days         │
│ │    │ 1  ଦିନ    day                      │     │ │    1930s dictionary: Day; a  │
│ │    │ 2  ଦୀନ    poor, needy              │     │ │    period of 24 hours…       │
│ │    │ 3  ଦିନା   day (with numbers)       │     │ │    [Show full entry]         │
│ │    │ 4  ଦୀନା   afflicted (fem.)         │     │ │ 2  ଦୀନ   poor, needy         │
│ │    │ 5  ଡିନ    not a known word         │     │ │    …                         │
│ │    │ 9  Keep "dina" (English)           │     │ │                              │
│ │    └───────────────────────────────────┘     │ │                              │
│ └──────────────────────────────────────────────┘ │                              │
│ Reads as  [kemiti] [achha] [dina]                  │                              │
│ [ Copy Odia ]  [ Clear ]                           │                              │
│                                                    │  Hide meanings              │
└──────────────────────────────────────────────────┴──────────────────────────────┘
  composer column max 46rem                             docked column 360–420px
```

Rules for the desktop popover:
- **Vertical list**, one candidate per row: number · Odia · gloss in a fixed column. Numbers
  line up with keys 1–9, and positions never jump with gloss length.
- Popover `max-width` = composer column width; it never goes under the Meanings column.
  The Meanings column is part of the layout grid (not `position: fixed` over it) at ≥1100 px.
- Arrow keys move the highlight; Enter or Space commits; Esc closes; number picks.
- Meanings column: show the first two senses; "Show full entry" expands the Praharaj text.

### 3.6 Suggestion + gloss design (both components)

| Element | Rule |
|---|---|
| Odia word | `--fs-odia-cand` (24 px), never wraps inside a word (`overflow-wrap: normal; white-space: nowrap` on the word; the gloss wraps instead). Fixes B3. |
| Gloss | 15 px, `--muted`, one line with ellipsis in the strip/popover; up to two lines in the Alternatives sheet. Full text in the Meanings panel. |
| Which gloss | The modern layer's first sense if present, else the first Praharaj sense. Never both joined with "·". Cut at the first ";". |
| Approximate | Replace "≈" with the word "maybe:" (e.g. "maybe: poor"). |
| No entry | Text "not a known word" in `--muted`, italic. Replaces the 0.35-opacity dot. |
| Loan | Small badge "English word" only when the modern layer tags it LOAN and the confidence is high; otherwise no badge. (Data: fix the କେମିତି → committee class of false positives first.) |
| Flags (family-safe) | Badge "can be rude" (`--warn` on `--warn-soft`) or "offensive" (`--danger` on `--danger-soft`). Text, not colour alone. |
| Source | Remove "LEXICON / RULE" from user view. If wanted for debugging, show it only with `?debug=1`. |
| Speaker (V3) | 44 px slot at the row's trailing edge in the Alternatives sheet and Meanings panel. Not in the phone strip (too small). |

### 3.7 Read-back line

- Label "Reads as" (15 px), then one 18 px Latin word per Odia word, in the same order, as
  buttons with a 44 px tall hit area.
- Produced from the **Odia text** (reverse romanisation, brief S-3), not from the user's
  typing. That is what makes it a check.
- Words with no dictionary entry get a dotted underline and the screen-reader text
  "not a known word".
- Optional "Show meanings" (Settings, default off for A, recommended in the first-run card
  for C): shows the gloss under each read-back word in 15 px.
- Empty state: hidden (no empty box).
- Reserved: speaker button at the end of the line (V3), same 44 px slot.
- `lang="or-Latn"` is the correct tag for romanised Odia, but no screen reader has a voice
  for it. Use `lang="en"` as the practical fallback so it is read aloud at all, plus
  `translate="no"` so browser auto-translate does not "translate" the romanisation.

### 3.8 Settings sheet

| Setting | Label (plain) | Helper text (15 px) | Default |
|---|---|---|---|
| Family-safe | **Hide rude words** | "Rude and swear words are not suggested. You can still type them on purpose." | On |
| Digits | **Odia digits ୧୨୩** | "Write numbers as ୧୨୩ instead of 123." | Off |
| Text size | **Text size** Normal · Large · Extra large | (live preview line in Odia) | Normal |
| Strict | Advanced → **Exact spelling (no guessing)** | "One English spelling gives one Odia spelling. No suggestions. For people who know the ITRANS scheme." | Off |
| Classic engine | Advanced → **Classic engine** | "The original word list without Sanskrit forms." | Off |
| V3 | **Online helpers** (section, all off) | Each switch: "Read aloud — sends the Odia text to Sarvam AI (India)". "Speak to write — sends your voice to …". "Translate sentence — sends the sentence to …". Plus "Needs internet". | Off |

Label alternatives for the family-safe switch to test with the parents (§7, task 5):
"Hide rude words" / "Family-safe suggestions" / "Don't suggest bad words".
Text size is new: it scales `--fs-*` tokens by 1 / 1.15 / 1.3; cheap and high value for older users.

### 3.9 First-run explanation

A dismissible card above the text box, shown once (localStorage, wrapped in try/catch),
re-openable from Help:

> **Type Odia the way it sounds, in English letters.**
> Unlike a keyboard, it shows what each word means in English before you pick it, so you can
> check it even if you can't read Odia. Nothing you type leaves this device.
>
> [ Try an example: kemiti achha ]   [ Got it ]

"Try an example" fills the box with `kemiti achha ` and commits, so the first thing a user sees
is a working result with meanings.

### 3.10 Copy and share

- **Phone:** primary button **Share…** calls `navigator.share({ text })`. This opens the
  phone's own share sheet (WhatsApp, Messages…). It is an OS hand-off, **not a network call
  from the app**, so the offline rule holds. Secondary button **Copy**.
- **Desktop:** primary **Copy Odia** (no Share; desktop share sheets are poor). Shortcut
  Ctrl/Cmd+Shift+C. The existing clipboard fallback stays.
- Success: toast "Copied — now paste it in WhatsApp" for 4 s (`role="status"`).
- Failure: toast "Couldn't copy. The text is selected — press and hold, then Copy." and the
  text is selected in the box.
- Copy and Share are disabled (and say why on tap: "Type something first") while the box is
  empty. Fixes H8.
- **Clear** empties the box and shows "Cleared · Undo" for 6 s.

### 3.11 States

| State | What the user sees |
|---|---|
| Empty, first visit | First-run card + placeholder "Type here, e.g. kemiti achha…" (everyday, not Sanskrit). No output box. |
| Empty, returning | Placeholder only. |
| Loading word list | Text box usable. Strip/popover shows "Loading words… your text will convert in a moment" next to the text (not at the bottom of the page). Typed English stays and converts when ready. |
| Typing | Suggestions + read-back. |
| No suggestions (strict mode or punctuation) | No strip. Read-back still shows. |
| Word not in dictionary | "not a known word" in the gloss slot. |
| Flagged word | Badge in strip, popover, sheet. Offensive words appear only on an exact key (brief §6). |
| Offline-ready | Header chip "✓ Works offline" (SVG check, `--ok`). While caching: "Saving for offline…". No service worker: no chip. |
| Word list failed | Banner under the text box: "The word list didn't load. Check your connection once, then reload." [Reload]. `--warn` text on `--warn-soft`. |
| Dictionary failed | One line under the text box: "Meanings are unavailable right now. Typing still works." Gloss slots hidden. |
| Copied / copy failed / cleared | Toasts as in §3.10. |
| V3 online feature with no network | Button disabled with "Needs internet". |

### 3.12 Where later features sit (reserved, not built)

| Feature | Stage | Slot | V1 cost |
|---|---|---|---|
| Read aloud | V3 | Speaker button at the end of the read-back line; per row in the Alternatives sheet and Meanings panel | Leave 44 px of space; no button rendered |
| Speak to write | V3 | Mic button at the bottom-right inside the text box | Leave right padding in the text box |
| Sentence translation | V3 | "Translate sentence" quiet button under the read-back line | none |
| Online switches | V3 | Settings → Online helpers | none |
| Lens (browser extension) | V4 | One line in Help → About: "Get the browser helper" | none |
| Paste / screenshot / camera input | V4 | Help → "Read Odia text" page | none |

---

## 4. Design system

### 4.1 Colour tokens

Existing names are kept. Changed values are marked **chg**, new tokens **new**.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f6fa` | `#131318` | page |
| `--surface` | `#ffffff` | `#1c1c23` | text box, cards |
| `--surface-soft` | `#f1eff7` | `#23232c` | quiet fills |
| `--panel` | `#ffffff` | `#272733` | floating: strip, popover, sheets |
| `--card` | `#f1eff7` | `#24242e` | palette keys, dictionary entries |
| `--text` | `#17171c` **chg** (was `#1b1b21`) | `#ecebf2` | body |
| `--muted` | `#55555f` **chg** (was `#63636f`) | `#a9a8b6` **chg** (was `#9b9aa9`) | glosses, labels, hints |
| `--line` | `#dedbe8` | `#32323e` | decorative dividers only |
| `--line-strong` **new** | `#8a879a` | `#7d7c90` | edges of controls (text box, switch, segmented, palette key) |
| `--accent` | `#5b2a9a` | `#c3a4f4` | primary button, active candidate, focus ring |
| `--accent-text` | `#ffffff` | `#1a1024` | text on accent |
| `--accent-soft` | `#ece3fb` | `#2a2138` | chosen word, hover (both themes) |
| `--ok` | `#0a6b4c` **chg** (was `#0a7050`) | `#59d5a0` | offline chip, success toast |
| `--warn` | `#7a4100` **chg** (was `#8a4a00`) | `#f0bd78` **chg** (was `#e0aa62`) | "can be rude" text, warnings |
| `--warn-soft` **new** | `#fbefdc` | `#3a2a14` | badge / banner fill |
| `--danger` **new** | `#a0172c` | `#ff9aa5` | "offensive" text |
| `--danger-soft` **new** | `#fbe4e7` | `#3d1a20` | badge fill |
| `--danger-text` **new** | `#ffffff` | `#1a1024` | text on `--danger` |

Rules: no `opacity` on text to make it quiet (use `--muted`); dark-mode hover uses
`--accent-soft`, never `rgb(255 255 255 / 10%)`; `.inline-candidate.is-active` must win over
`:hover` in both themes.

### 4.2 Contrast (computed, WCAG 2.x formula; script `design/contrast.mjs`)

Current tokens:

```
--- CURRENT light
PASS  15.93  text on bg                PASS   5.51  muted on bg
PASS   5.20  muted on surface-soft     PASS   5.92  muted on panel
PASS   8.70  accent on bg              PASS   9.36  accent-text on accent
PASS   7.21  active gloss (.85) on accent
PASS   6.09  toast: white on ok        PASS   6.86  toast error: white on warn
FAIL   3.75  palette-name text @0.55 on bg
PASS   6.08  mode-hint text @0.7 on bg PASS   5.31  inline-num text @0.65 on panel
FAIL   1.67  "no entry" dot muted @0.35 on panel
FAIL   1.36  line vs surface (control edge, needs 3)
FAIL   1.27  line vs bg (palette key edge, needs 3)
PASS   8.22  ambiguous underline accent vs surface-soft (needs 3)
--- CURRENT dark
PASS  15.64  text on bg                PASS   6.69  muted on bg
PASS   5.33  muted on panel            PASS   8.76  accent on bg
PASS   8.69  accent-text on accent     PASS  10.01  toast: accent-text on ok
FAIL   1.71  HOVER BUG: accent-text on panel+10% white (active candidate under pointer)
PASS   6.12  inline-num @0.65 on panel PASS   5.40  palette-name @0.55 on bg
FAIL   1.34  line vs surface (needs 3) FAIL   1.17  line vs panel (needs 3)
```

Proposed tokens (all pass):

```
--- PROPOSED light
16.60 text on bg          6.85 muted on bg        6.46 muted on surface-soft
 7.37 muted on panel      8.70 accent on bg       9.36 accent-text on accent
 7.56 accent on accent-soft                       3.49 line-strong vs surface (≥3)
 3.25 line-strong vs bg (≥3)                      6.06 ok on bg
 6.52 white on ok (toast) 7.15 warn on warn-soft  6.54 danger on danger-soft
 7.91 danger-text on danger
--- PROPOSED dark
15.64 text on bg          7.90 muted on bg        6.29 muted on panel
 7.23 muted on surface    8.76 accent on bg       6.98 accent on panel
 8.69 accent-text on accent                       7.24 accent on accent-soft
12.91 text on accent-soft (hover fixed)           3.78 line-strong vs surface (≥3)
 3.62 line-strong vs panel (≥3)                  10.10 ok on bg
10.01 accent-text on ok   8.06 warn on warn-soft  7.62 danger on danger-soft
 9.11 danger-text on danger
```

Goal is AA (4.5:1) for all text and 3:1 for control edges. Body text reaches AAA (7:1).

### 4.3 Type scale

Base stays 17 px (iOS zoom rule satisfied). Text-size setting multiplies all `--fs-*` by
1 / 1.15 / 1.3.

| Token **new** | Size | Use |
|---|---|---|
| `--fs-sm` | 15px | glosses, labels, helper text, badges. **Floor for any text a user must read.** |
| `--fs-body` | 17px | body, buttons |
| `--fs-input` | 18px | text box Latin; Odia in the box = 18 × `--odia-scale` ≈ 24 px |
| `--fs-lg` | 20px | header title, sheet titles |
| `--fs-odia-cand` | calc(18px × var(--odia-scale)) ≈ 24px | candidate word |
| `--odia-scale` | 1.32 (keep) | Odia optical correction |

- Line height: Latin 1.5; Odia 1.75 (keep).
- Weights: 400 and 700 only (the bundled Noto Sans Oriya subset has only these; 600–650 UI
  text renders as 700 for Odia).
- No upper-case letter-spaced labels; use sentence case at `--fs-sm`, weight 600.

### 4.4 Spacing, radius, targets

| Token **new** | Value |
|---|---|
| `--space-1` … `--space-6` | 4, 8, 12, 16, 24, 32 px |
| `--radius` (keep) | 14px — text box, cards, buttons |
| `--radius-sm` | 8px — chips, keys, badges |
| `--radius-pill` | 999px — status chip, toast |
| `--tap` (keep) | 44px — every target |
| `--tap-lg` | 52px — Share/Copy and suggestion cards |

Minimum 8 px between adjacent targets.

**Theme checker note.** `Appv2/eval/check-theme.mjs` treats every `:root` token as a colour
unless it matches `NON_COLOUR = /^--(radius|tap|odia-scale|odia-font|ui-font|mono-font)$/`, and
fails if a colour token has no dark value. The new non-colour tokens need that regex extended,
for example
`/^--(radius(-sm|-pill)?|tap(-lg)?|odia-scale|odia-font|ui-font|mono-font|fs-[a-z-]+|space-\d)$/`,
or the build fails. All new colour tokens above have a dark value.

### 4.5 Components and their states

| Component | States |
|---|---|
| Button (primary / secondary / quiet) | default, hover, pressed, focus-visible (2px `--accent` ring, 2px offset), disabled (with reason on tap), busy |
| Segmented control (mode) | selected, unselected, focus, switching ("Switching to Śloka…" while the Sanskrit word list loads) |
| Switch (settings) | on, off, focus, disabled; label + helper text share one hit area |
| Text box | empty (placeholder), typing, loading, error banner, focus |
| Suggestion strip (phone) | hidden, loading, items (active, default, pressed, flagged), overflow `›` |
| Caret popover (desktop) | hidden, loading, items (active, hover, flagged, no-entry), keyboard focus |
| Suggestion item | Odia + gloss; active; flagged badge; "not a known word"; "Keep 'dina'" item |
| Read-back line | hidden (empty), words, uncertain word, (V3) speaker |
| Alternatives sheet | open, current choice marked, flagged rows, close by Done / scrim / Esc |
| Meanings panel / sheet | closed, current suggestions, search, no result, dictionary failed, entry collapsed/expanded |
| Status chip | saving for offline, works offline, (V3) online helper on |
| Toast | success, error, undo |
| Badge | can be rude, offensive, English word |
| First-run card | shown, dismissed |
| Settings sheet, Help sheet | open, closed |

Icons: one SVG family (for example Lucide, MIT): settings, help, check, share, copy, speaker,
mic. No emoji. Every icon-only button has an `aria-label`.

---

## 5. Accessibility checklist (V1 acceptance)

- [ ] All text ≥ 15 px; inputs ≥ 16 px (18 px proposed).
- [ ] Text contrast ≥ 4.5:1 and control edges ≥ 3:1 in **both** themes (§4.2), checked with
      the pointer resting on the active suggestion.
- [ ] No text made quiet with `opacity`.
- [ ] Every target ≥ 44×44 px with ≥ 8 px gaps; Share/Copy and suggestion cards 52 px.
- [ ] Odia never splits inside a word (strip, popover, sheet, read-back).
- [ ] Odia elements carry `lang="or"`; read-back carries `lang="en"` + `translate="no"`.
- [ ] Text box has `aria-controls` pointing at the suggestion list and `aria-activedescendant`
      on the active item; each item's accessible name = "ଦିନ, day".
- [ ] Suggestion count announced politely ("8 suggestions") after a pause in typing, not on
      every keystroke.
- [ ] Every flag is text ("offensive"), not colour alone.
- [ ] Sheets: focus moves in on open, returns to the trigger on close; Esc closes; scrim click
      closes; `overscroll-behavior: contain`.
- [ ] Floating elements never cover a sheet or the focused element (one z-index scale:
      page 0 · sticky header 10 · strip/popover 20 · sheets 40 · toast 50).
- [ ] Toasts `role="status"`, ≥ 4 s, never the only place an error is shown.
- [ ] `prefers-reduced-motion`: no slide animations.
- [ ] Works at 200% browser zoom and the largest iOS text size without horizontal scroll.
- [ ] Keyboard only (desktop): type, pick with arrows/numbers, copy, open settings, close sheets.
- [ ] Swipe on the strip has a button alternative (`›`).
- [ ] Tested on real iOS Safari and Android Chrome (owner item A-3), light and dark.

### Finish gate (anti-ui-slop), as acceptance criteria for the engineer

Nothing is built yet, so the gate is **not passed**. V1 ships when:
1. A first-time parent can say what the screen is for within 5 seconds (usability task 1).
2. Share/Copy is the single primary action and is visible with the keyboard open.
3. Every visible control does something; no engine jargon on the main screen.
4. All states in §3.11 are reachable (loading and failures by throttling / blocking assets).
5. Phone and desktop use the two suggestion components in §3.4 and §3.5.
6. `check-theme.mjs` passes with the new tokens.
7. Screenshots of both themes, phone and desktop, empty / typing / sheet / error, are reviewed.

---

## 6. Copy deck (main screen strings)

| Where | Text |
|---|---|
| Title | Odia Phonetic |
| Placeholder | Type here, e.g. kemiti achha… |
| Read-back label | Reads as |
| Primary (phone) | Share… |
| Primary (desktop) | Copy Odia |
| Meanings button (phone) | Meanings |
| No entry | not a known word |
| Approximate | maybe: … |
| Keep English | Keep "dina" |
| Offline chip | Works offline / Saving for offline… |
| Loading | Loading words… your text will convert in a moment |
| Copied | Copied — now paste it in WhatsApp |
| Family-safe | Hide rude words |
| Strict | Exact spelling (no guessing) |
| Footer | Everything runs on this device. Nothing you type is sent anywhere. |

---

## 7. Usability test script (owner + parents, ~20 minutes)

Setup: the parent's own phone, the V1 link, brightness as they normally use it. Sit beside
them, do not help unless stuck for 60 s. Note what they **do**, not what they say. Ask them to
think aloud.

| # | Task (say this) | Watch for | Success |
|---|---|---|---|
| 1 | "This is a new app. Without touching it, tell me what you think it does." | Do they read the first-run card? Do they mention "meaning"? | Says "write Odia" within 10 s |
| 2 | "Write 'kemiti achha' and send it to me on WhatsApp." | Do they see the strip above the keyboard? Do they find Share? Do they hesitate at the share sheet? | Message arrives in under 1 minute, no help |
| 3 | "Write the word for 'day' — dina. Make sure it is the one that means day, not 'poor'." | Do they read the glosses? Do they use the read-back line? Do they find a second choice (tap a word)? | Picks ଦିନ by meaning |
| 4 | "You made a mistake in the second word. Fix it without deleting everything." | Do they tap the read-back word? Do they try the text box instead? | Fixes via the Alternatives sheet |
| 5 | "Open the settings. What does each switch do? Would you leave 'Hide rude words' on?" | Read each label aloud; ask them to explain it back in their words. Try the alternative labels (§3.8). Ask if the text is big enough; try "Large". | Explains family-safe correctly; picks a text size |

After the tasks, ask: "What was hard?" and "Would you use this instead of what you use now?
Why?". Record: time per task, number of wrong taps, every moment they squint or bring the
phone closer (text size), every word in a gloss they did not understand.

Run the same five tasks with one user B (speaks Odia, cannot read it) — task 3 is the one
that matters most for them — and, if possible, one user C.

---

## 8. Priorities

### Must be in V1 (in this order)

1. **Fix the blockers**: B2 dark hover (one line), B3 word splitting, B4 z-index scale, and
   B1 the phone suggestion strip docked above the keyboard (largest item).
2. **One composing surface**: Odia font in the text box, remove the duplicate output box,
   add the read-back line with tappable words (H1, H2).
3. **Glosses readable**: 15 px floor, one short gloss, "not a known word", no LEXICON/RULE
   (H3, H4, H5). Data: owner reviews the worst false glosses (B5) — add "committee" class
   loan errors to the review queue.
4. **Family-safe switch** "Hide rude words", on by default, with badges.
5. **Share / Copy** with `navigator.share` on phones; Clear with Undo.
6. **Tokens** in §4 (values + new tokens + checker regex); text-size setting.
7. **States**: loading next to the text, word-list/dictionary failure messages, offline chip.
8. **First-run card** and everyday placeholder; move cheat sheets and palette into Help
   (palette button stays visible in Śloka mode).
9. Desktop: vertical caret popover + docked Meanings column (H6, M9).
10. `lang="or"`, listbox wiring, focus handling (M5, M6).

### Later

| Item | Stage |
|---|---|
| Speaker buttons (read aloud) | V3 |
| Mic (speak to write), sentence translation, Online helpers switches | V3 |
| "Show meanings" under read-back words (if task 3 shows a need) | V1.1 |
| Phrase suggestions, bigram ranking effects on the strip | V2 |
| Browser-extension lens; paste/screenshot/camera input | V4 |
| Manual light/dark override | only if testers ask |
| Native keyboards (iOS / Android) | V5 |

### Cut (do not build)

- A separate onboarding tour (the first-run card is enough).
- Accounts, history, favourites.
- Pictures for words (research supports them for phrasebooks, not free text; brief §7).
