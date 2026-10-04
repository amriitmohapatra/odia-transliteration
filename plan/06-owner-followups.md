# 06 — Owner follow-ups (deferred items)

**Purpose:** a list of the items that Claude could not do in the cloud environment, and
the items that only the owner can do. The owner asked (2026-10-04) to keep them for later
and to get a reminder **when the software is developed**.

**Reminder rule (also in `CLAUDE.md`):** when a stage in `plan/05-v3-direction.md` §13
finishes, and in particular when the V1 web app is live on Vercel, Claude shows this list
to the owner. Claude marks each item done here, with the date, when it is done.

---

## A. Needs the owner's Mac

**Owner timing (2026-10-04):** A-1 and A-3 only after the final app is ready. All other
checks (A-4, B, phone tests) only after the app is complete and merged to `main`. Do not
ask for them before that.

| # | Item | How | Since |
|---|---|---|---|
| A-1 | Rebuild the cheat-sheet PDFs. Both `.tex` files changed for D-12 (`j` → ଯ). The PDFs in `docs/` are older than the `.tex` files. | `cd docs && lualatex romanization-reference.tex` (twice), then the same for `romanization-reference-v2.tex`. Needs the macOS font Oriya Sangam MN. | 2026-10-04 |
| A-2 | Give your parents the V1 app. **Their current file has not changed.** Either use the Vercel site (after D-10), or rebuild the single file and AirDrop it: from the repo root run `SINGLE_FILE=1 npx vite build --config Appv2/vite.config.ts && node Appv2/scripts/make-single-file.mjs`. It writes `docs/odia-app-sanskrit.html` (about 16.4 MB, dictionary included); this replaces `Odia_Sanskrit_Appv2/odia-app-sanskrit-v2.html`. Words they taught the old file do not move to the new one (no export yet). | (`build_app.py` is retired.) | 2026-10-04 |
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
| C-1 | **First part done 2026-10-04:** the owner's two lists are in `core/data/labels.tsv` (17 rows). Please check the 4 rows marked REVIEW (one word labelled `coarse` because of its ordinary meaning "depth; hole"; one with a second meaning "bottom of a thing"; the words for curd and hair labelled `slang`, so they are never hidden). Still open: the Praharaj review queue (about 348 entries with offensive markers). | Family-safe filter |
| C-2 | Check `plan/review/c2-inflections.tsv`: 109 inflected forms of the offensive words (case endings; verb endings for the two verbs), each with a proposed typed spelling. Delete the rows that are not real; then Claude moves the rest into `labels.tsv`. **Until then, inflected forms are not filtered.** | Family-safe filter for inflected forms |
| C-3 | Check each of the 26 rows of `core/test/golden/colloquial.tsv` (spoken, slang and dialect words seeded by Claude): right Odia? right register? Add the casual words your family really types. | Colloquial test set |
| C-4 | Judge the 100-sentence translation test (Google against Claude Haiku) | D-3, `/api/translate` |
| C-5 | Review 50 loanword examples with a nukta on ଜ / ଫ | D-6 |
| C-6 | Review the romanization scheme (`AGENTS.md` §7.4) | Public release |
| ~~C-7~~ | **Done 2026-10-04.** Owner corrected the 4 rows (ରଜ = Raja festival only; dust is ଧୂଳି) and added କମିଟି "committee", ଧୂଳି "dust". Keep adding words you find wrong. | — |

## D. Decisions still open

| # | Decision | Trigger |
|---|---|---|
| D-6 | Nukta policy for ଜ / ଫ in Urdu and English loans | After C-5 |
| D-10 | **Decided 2026-10-04: public product.** Recorded as: the website is public; the GitHub repository stays private until the owner says otherwise. A public site needs no public repository. If the code is to be public too: publish from a fresh repository without `tools/build-data/webcorpus/` (it stays in git history otherwise), and decide about the word counts taken from that corpus (brief §12). | Ask before any repository becomes public |
| ~~—~~ | ~~Where "Wrong word? Report it" sends reports~~ | **Decided 2026-10-04:** to the owner's email (set in `Appv2/src/main.ts`, joined at run time) |
| — | Install the Claude Code skills for Android and iOS work | After the Vercel version is done (owner's instruction, 2026-10-04) |

## E. Other sessions and their branches

Checked 2026-10-04 against `claude/festive-hawking-ie6xyt` (this plan's branch).

| # | Item | Status |
|---|---|---|
| E-1 | Session `session_0186HVx998d8ubjjxiDMfM9p`, branch `claude/zealous-brown-hpenqp` ("Offer ଯ for word-initial j"). It adds `j`-keys to the lexicon, so `je` → ଯେ is rank 1. **It opened PR amriitmohapatra/odia-transliteration#2.** | **Do not merge PR #2 as it is.** (1) It breaks the Appv2 rule build (`gen-rules --check`: "duplicate option after merge" on delta S8); CI on that branch would show it. (2) It conflicts with this branch in `core/rules/symbols.toml` (weight 0.4 vs 0.6) and both cheat sheets. (3) It conflicts with E-2 in all four lexicon files and the builder. Plan: merge E-2 first, then re-apply only its builder change (the `j`-keys) on top, rebuild, measure, and close PR #2. |
| E-2 | Session `session_01GvEiBCo7MZVHuKSH5B9PK9`, branch `claude/jolly-dijkstra-4p8v4w` ("Make the common lexicon build reproducible") | **Merged to `main` by the owner (PR #1), and `main` merged into this branch 2026-10-04: all metrics unchanged.** Earlier: Merges cleanly with this branch. Its one changed result, `raja` giving the Raja festival first, now matches the owner's decision (2026-10-04) and the eval override accepts it, so it is no longer a regression. Ready to merge when the owner wants; then re-apply E-1's `j`-keys on top. |
