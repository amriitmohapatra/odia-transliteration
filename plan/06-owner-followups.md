# 06 — Owner follow-ups (deferred items)

**Purpose:** a list of the items that Claude could not do in the cloud environment, and
the items that only the owner can do. The owner asked (2026-10-04) to keep them for later
and to get a reminder **when the software is developed**.

**Reminder rule (also in `CLAUDE.md`):** when a stage in `plan/05-v3-direction.md` §13
finishes, and in particular when the V1 web app is live on Vercel, Claude shows this list
to the owner. Claude marks each item done here, with the date, when it is done.

---

## A. Needs the owner's Mac

| # | Item | How | Since |
|---|---|---|---|
| A-1 | Rebuild the cheat-sheet PDFs. Both `.tex` files changed for D-12 (`j` → ଯ). The PDFs in `docs/` are older than the `.tex` files. | `cd docs && lualatex romanization-reference.tex` (twice), then the same for `romanization-reference-v2.tex`. Needs the macOS font Oriya Sangam MN. | 2026-10-04 |
| A-2 | Rebuild the single-file apps in `docs/` so they carry D-12. The app the parents use (`Odia_Sanskrit_Appv2/odia-app-sanskrit-v2.html`, default mode) already has the `j` → ଯ option. `docs/odia-app.html` does not. | `npm run build:app`, then the Appv2 and dictionary builds (see `Appv2/README.md`, `Odia_Sanskrit_Appv2/README.md`). The V1 Vercel build may replace this step. | 2026-10-04 |
| A-4 | **Try V1 on your own phone** (iPhone Safari and/or Android Chrome) once deployed or via the single-file build: type with the keyboard open, check the suggestion strip, Share, the "Reads as" line, Hide rude words, Text size. Chromium here could only simulate the keyboard. Known gap: the phone Meanings panel may sit under the iOS keyboard. | Design proposal §7 has a 20-minute test script for your parents | 2026-10-04 |
| A-3 | Run the WebKit (Safari engine) checks. Include the V1 single-file app opened from Files/Finder: the dictionary now loads with `fetch()` from a `data:` URI, proven only in Chromium. This environment has only Chromium. The V0 changes (caret bar, font, service worker) passed in Chromium. | `python3 tools/eval/webkit-check.py` and `python3 Appv2/eval/webkit-sanskrit.py` (need `pip install playwright` and `playwright install webkit`) | 2026-10-04 |

## B. Five-minute checks (any device)

| # | Check | Report |
|---|---|---|
| B-1 | On a Mac, an iPhone and in Microsoft Edge: open the browser console and run `speechSynthesis.getVoices().filter(v => v.lang.startsWith('or'))` | Which devices have an Odia voice |
| B-2 | On Android: Gboard voice typing in Odia | Works / does not exist |
| B-3 | On Android: Circle to Search on a screenshot of Odia text | Reads Odia / does not |
| B-4 | On a Mac: System Settings → Keyboard → Input Sources | Any Odia phonetic option? |

## C. Only a native speaker can do these

| # | Item | Blocks |
|---|---|---|
| C-1 | Label the Praharaj review queue (offensive markers, colloquial and regional tags): `offensive`, `coarse`, or not | Family-safe filter (§6 of the brief) |
| C-2 | Approve the generated suffixed forms of each offensive stem | Family-safe filter |
| C-3 | Check each row of `core/test/golden/colloquial.tsv` when it exists | Colloquial test set |
| C-4 | Judge the 100-sentence translation test (Google against Claude Haiku) | D-3, `/api/translate` |
| C-5 | Review 50 loanword examples with a nukta on ଜ / ଫ | D-6 |
| C-6 | Review the romanization scheme (`AGENTS.md` §7.4) | Public release |
| C-7 | Check the meanings file `core/data/glosses.tsv`. It has 4 rows suggested by Claude (status `seed`): ରଜ "Raja festival (June); also: dust", କେମିତି "how", ଆଛା "okay; fine", ଦିନ "day". Change `seed` to `owner` when right, fix or delete otherwise, and add words you find wrong while using the app. | Correct meanings under suggestions |

## D. Decisions still open

| # | Decision | Trigger |
|---|---|---|
| D-6 | Nukta policy for ଜ / ଫ in Urdu and English loans | After C-5 |
| D-10 | Public or private product. If public: a new repository without `tools/build-data/webcorpus/` (it stays in git history otherwise), and a decision on the word counts taken from that corpus (brief §12) | Before the first deploy |
| — | Install the Claude Code skills for Android and iOS work | After the Vercel version is done (owner's instruction, 2026-10-04) |

## E. Other sessions and their branches

Checked 2026-10-04 against `claude/festive-hawking-ie6xyt` (this plan's branch).

| # | Item | Status |
|---|---|---|
| E-1 | Session `session_0186HVx998d8ubjjxiDMfM9p`, branch `claude/zealous-brown-hpenqp` ("Offer ଯ for word-initial j"). It adds `j`-keys to the lexicon, so `je` → ଯେ is rank 1. | **Pushed.** Three problems: (1) it **breaks the Appv2 rule build**: `gen-rules --check` fails with "duplicate option after merge" on delta S8, because it adds the core option without retiring S8. (2) It conflicts with this branch in `core/rules/symbols.toml` (weight 0.4 against 0.6) and both cheat sheets. (3) It conflicts with E-2 in all four lexicon files and the builder. Recommendation: do not merge it as is. After E-2 lands, re-apply only its builder change (the `j`-keys) on top of E-2 and this branch, then rebuild and measure. |
| E-2 | Session `session_01GvEiBCo7MZVHuKSH5B9PK9`, branch `claude/jolly-dijkstra-4p8v4w` ("Make the common lexicon build reproducible") | **Pushed.** Merges cleanly with this branch. Appv2 rule check passes. Measured alone: everyday **casual top-1 drops 80.4% → 78.3%** (one word of 46): `raja` now gives ରଜ first (score 3.83) and ରାଜା second (3.81). Other rows unchanged. Combined with this branch: same gains as D-12 alone, 132/132 tests, all Appv2 checks pass. Decide whether ରଜ before ରାଜା is acceptable before merging (ରଜ is also the Raja festival). |
