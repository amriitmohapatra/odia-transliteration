# Baseline desktop interaction audit — 12 October 2026

Test target: frozen baseline `/workspace/review-artifacts/baseline-dist`, served at `http://127.0.0.1:4810/`. Automated Chromium (`/usr/bin/chromium`) at 1440×1000, fresh browser context/local learning for each scenario. This is Linux Chromium evidence, not a claim of macOS Safari or iOS hardware verification. No repository files changed. The newer English dictionary implementation is deliberately excluded from this baseline.

Reproduce the explicit input/key/copy steps in each finding below against baseline commit `4a3a85e`. Browser setup matches `browser-audit.mjs`.

Raw output: `interaction-audit.json`, `interaction-extra.json`, `dictionary-baseline.json`. The first script's `dictionary` step timed out because `#dict-toggle` is hidden when the desktop dictionary is already docked open; the separate dictionary script correctly tests the visible search box. Candidate arrays in the first script include hidden retained DOM nodes; do not interpret those arrays as proof that the bar remained visible after a commit.

## 1. High: ordinary addresses and mixed alphanumeric text are corrupted

Fresh page, type `test@example.com ` in the editor, click Copy, inspect clipboard:

- Visible editor: `test@example.ଚୋମ `
- Clipboard: `ତେସ୍ତ@ଏକ୍ଷମ୍ପ୍ଲେ.ଚୋମ `

Fresh page, type `https://example.com `:

- Visible editor: `https://example.ଚୋମ `
- Clipboard: `ହ୍ତ୍ତ୍ପ୍ସ://ଏକ୍ଷମ୍ପ୍ଲେ.ଚୋମ `

Pasting a mixed sentence also converts the address: `mote test@example.com re email kara https://example.com` becomes `ମୋତେ ତେସ୍ତ@ଏକ୍ଷମ୍ପ୍ଲେ.ଚୋମ ରେ ଏମୈଲ କର ହ୍ତ୍ତ୍ପ୍ସ://ଏକ୍ଷମ୍ପ୍ଲେ.com` in the editor. A final Roman run is intentionally kept pending until commit, making the partially converted URL even harder to interpret.

Related direct typing: `covid19` becomes `ଚୋବିଦ9`; `PCR2` becomes `ପ୍ଚ୍ର`. The digits 1 and 2 are intercepted as candidate shortcuts, so they vanish as content. This behavior is documented as a shortcut in source, but it directly conflicts with ordinary mixed communication and research identifiers.

Recommended next work: preserve recognized URL/email spans across typing, paste, copy and re-selection; provide a consistent explicit Latin mode/span and modifier-based or optional numeric selection. Merely adding more dictionary entries cannot repair this class of bug.

## 2. Medium: punctuation produces different visible and copied sentences

Type `namaskar, tume kemiti achha? ` character by character:

- Editor: `namaskar, ତୁମେ କେମିତି achha? `
- Copy: `ନମସ୍କାର, ତୁମେ କେମିତି ଅଛ? `

Pasting `namaskar tume kemiti achha?` converts every word immediately to `ନମସ୍କାର ତୁମେ କେମିତି ଅଛ?`.

The first and last words are available to the engine; punctuation prevents the usual Space commit. Copy silently invokes another conversion pass. This is a predictability/preview issue, not evidence that those words are missing from the lexicon.

Recommended next work: define one commit policy for punctuation/newline/blur and show precisely the text that Copy will return. Preserve explicit literal English choices in that policy. Test type and paste routes against the same expected sentence.

## 3. Medium: standard editing keys do not support recovery after a candidate commit

Type `namaskar ` → `ନମସ୍କାର `. Press Ctrl+Z in Linux Chromium: editor remains `ନମସ୍କାର `; the Roman input is not restored. Source uses direct `textarea.value` assignment for candidate commits, outside normal browser undo history. Cmd+Z needs separate verification on macOS; no claim is made here about a tested Mac shortcut.

Type `kemiti`, press Left Arrow, type `a`: output remains at the end and becomes `kemitia`, not an edit before the last character. ArrowLeft/Right are explicitly used to cycle candidate selection. That may be a deliberate IME convention, but ordinary caret editing now requires a different interaction and is not seamless.

Backspace after `kemiti ` removes the space; another Backspace removes the final vowel sign, yielding `କେମିତ`, rather than reopening the Roman composition. This alone is not necessarily a bug, but combined with ineffective undo it makes correction more effortful.

What works: typing `mu bhala achhi `, clicking the first word in “Reads as,” then choosing the second candidate changes `ମୁ ଭଲ ଅଛି ` to `ମୁଁ ଭଲ ଅଛି `. Preserve this useful recovery path while adding transaction-based undo and a clear caret/candidate navigation convention.

## 4. Medium: a dictionary miss is presented as a verdict on the word

The UI annotates unmatched candidates with **“not a known word.”** That overstates what an exact lookup in finite sources can establish. New loanwords, names, productive inflections, and corpus omissions may all be legitimate. In the baseline dictionary, both `phone` and `ଫୋନ` return “Nothing found for that spelling.” `ଘର` is found normally.

Recommend “No entry in these dictionaries” and distinct labels for dictionary coverage, spelling confidence, and unreviewed/generated candidates. A missing glossary definition should not be confused with failure of transliteration.

## 5. Medium: historical senses and uncertain English associations undermine everyday trust

Search `କେମିତି` in the visible dictionary: panel shows `meaning: how`, `English word?: committee`, `today: how-to`. The committee association is speculative and competes visually with a clear common meaning. This is exactly why phonetic English association must be distinguished from translation and loan spelling.

Search `ଭାତ`: the dictionary exists and includes **boiled rice**, but leads with **Displayed; manifested; shining; resplendent**, followed by **Lighted; illuminated**, then **Morning; dawn**, before the everyday noun sense. Source labels are historically useful; the default short suggestion gloss should prefer a reviewed everyday sense, with the full historical entry expandable.

Search `ଘର`: usable house/home senses appear, but raw OCR/prose issues remain (e.g. English “Refuse; shelter,” “set a part or a particular use”). Do not treat these dictionary strings as already clean training labels.

## Scope and strengths

Core sentence typing via Space and candidate reselection work. Basic copy works mechanically. Dictionary lookup for existing entries works and exposes provenance. The highest-value next fixes are consistent editor transactions and mixed-text preservation, alongside improved lexical coverage/ranking and reviewed modern glosses. More data alone does not resolve the reproduced interaction failures. Phone layout was intentionally outside this audit because the owner deferred it.
