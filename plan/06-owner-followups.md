# 06 — Owner follow-ups (deferred items)

**Purpose:** a list of the items that Claude could not do in the cloud environment, and
the items that only the owner can do. The owner asked (2026-10-04) to keep them for later
and to get a reminder **when the software is developed**.

**Reminder rule (also in `CLAUDE.md`):** when a stage in `plan/05-v3-direction.md` §13
finishes, and in particular when the V1 web app is live on Vercel, Claude shows this list
to the owner. Claude marks each item done here, with the date, when it is done.

**Testing rule (owner, 2026-10-14):** ask the owner to test both the Vercel website and the
Odia Lens only when a change affects both (for example `Appv2/src/dictionary/lookup.ts` or
`core/data/meanings.tsv`, which both read). A change to one of them: ask for that one only.

---

## S. Security (found 2026-10-12, do first)

| # | Item | How | Since |
|---|---|---|---|
| ~~S-1~~ | **Done later on 2026-10-12: the owner made the repository private.** (Earlier that day: stays public, history unchanged.) (owner: Actions minutes are free for public repositories). Options if this changes: a fresh public repository without `webcorpus/` and its history (recommended), a history rewrite plus a GitHub Support purge of pull-request refs, or private again. Original item: **Set the GitHub repository back to private.** It is public. No passwords or keys are in it, but `tools/build-data/webcorpus/` (102 files, 247 MB of scraped books, news, government pages and X posts, with third-party phone numbers and emails) is not ours to publish, and deleting the files in a new commit does not remove them from history. The websites keep working: Vercel deploys from private repositories. | GitHub → the repository → Settings → General → Danger Zone → Change visibility → Make private | 2026-10-12 |
| S-2 | Turn on GitHub's free security features (they matter while the repository is public, and Dependabot also works when private): Dependabot alerts and, if shown, secret scanning with push protection. | Settings → Advanced Security (or Code security) → Enable | 2026-10-12 |
| S-3 | Hide your email in future commits. Your Gmail address is already in the commit history and in the report button (on purpose). | github.com/settings/emails → tick "Keep my email addresses private" and "Block command line pushes that expose my email" | 2026-10-12 |
| S-4 | Later, for a public code repository: follow section D "Public repository" (a fresh repository without `webcorpus/`). | When the owner says "project finished" | 2026-10-12 |

## L. Licences and permissions

| # | Item | How | Since |
|---|---|---|---|
| L-1 | **Written permission from Desh** for the data the app will use. The email should name: (1) the data (word list with counts, typed-spelling pairs, word-pair and word-triple model, and the transliteration converter (FST), which the hybrid speller uses; not the English model); (2) the use (a free web app, public website, and later phone apps; data stored in this private repository); (3) the credit wording they want (for the data; the app's code and licence stay the owner's); (4) whether the data may stay in the app if the arrangement ends. Forward it to Claude or save it; Claude records the terms (no personal details). **Owner decision 2026-10-12: the build goes ahead before the email arrives** (private repository; merging to `main` publishes the data on the website, the owner decides when). | Ask Desh by email | 2026-10-12 |
| L-2 | **Permission to use Odisha school textbooks** (optional). The full Odia books (OSEPA classes 1–10, CHSE +2) are "all rights reserved"; the DIKSHA copies are CC BY-ND 4.0, which does not allow a dictionary made from their glossaries. To use their word lists (ଶବ୍ଦାର୍ଥ) and grammar, ask OSEPA, SCERT Odisha, BSE Odisha or the Odisha Textbook Bureau by email for written permission. Without it, Claude uses only the CC BY 4.0 items (DIKSHA supplements, StoryWeaver). Details: `plan/research/odia-school-textbooks.md`. | Email, if wanted | 2026-10-14 |

## A. Needs the owner's Mac

**Owner timing (2026-10-04):** A-1 and A-3 only after the final app is ready. All other
checks (A-4, B, phone tests) only after the app is complete and merged to `main`. Do not
ask for them before that.

**Now due (2026-10-04):** V1 is merged to `main` (PR #3) and live on Vercel: adult
`https://odia-transliteration-web.vercel.app/`, kids `https://odia-phonetic-kids.vercel.app/`.
Use these addresses for A-3, A-4 and B. The cloud environment cannot open `*.vercel.app`
(its network policy blocks the host), so Claude cannot test the live sites.

| # | Item | How | Since |
|---|---|---|---|
| A-1 | Rebuild the cheat-sheet PDFs. Both `.tex` files changed for D-12 (`j` → ଯ). The PDFs in `docs/` are older than the `.tex` files. | `cd docs && lualatex romanization-reference.tex` (twice), then the same for `romanization-reference-v2.tex`. Needs the macOS font Oriya Sangam MN. | 2026-10-04 |
| ~~A-2~~ | **Done 2026-10-04:** the V1 single file (adult edition) is rebuilt and committed as `docs/odia-app-sanskrit.html` (16.4 MB). AirDrop it to your parents, or use the Vercel site. It replaces `Odia_Sanskrit_Appv2/odia-app-sanskrit-v2.html`. Words taught to the old file do not move to the new one (no export yet). Future rebuilds: on the Mac, or use the Vercel site, rather than committing a 16 MB file per change. | Command in `docs/README.md` | 2026-10-04 |
| A-4 | **Try V1 on your own phone** (iPhone Safari and/or Android Chrome) once deployed or via the single-file build: type with the keyboard open, check the suggestion strip, Share, the "Reads as" line, Hide rude words, Text size. Chromium here could only simulate the keyboard. Known gap: the phone Meanings panel may sit under the iOS keyboard. | Design proposal §7 has a 20-minute test script for your parents | 2026-10-04 |
| A-3 | Run the WebKit (Safari engine) checks. Include the V1 single-file app opened from Files/Finder: the dictionary now loads with `fetch()` from a `data:` URI, proven only in Chromium. This environment has only Chromium. The V0 changes (caret bar, font, service worker) passed in Chromium. | `python3 tools/eval/webkit-check.py` and `python3 Appv2/eval/webkit-sanskrit.py` (need `pip install playwright` and `playwright install webkit`) | 2026-10-04 |
| A-5 | **Android keyboard test (30 s, found 2026-10-12).** On an Android phone with Gboard, open the adult site, type `kemiti`, press space. Does a suggestion strip appear while you type? Does the word change to Odia? Since PR #5 a browser test said no to both; fixed 2026-10-12 (browser test now says yes). Please confirm on a real phone, and also tap a suggestion while typing: the word must appear once, not twice. | Report yes/no for each | 2026-10-12 |
| A-6 | **Try the Odia Lens extension (2026-10-14).** Unzip `odia-lens.zip` (sent in chat; or build it: `npm run build:lens`), then in Chrome or Edge: `chrome://extensions` → Developer mode → Load unpacked → the folder. Open an Odia news page, click the lens icon, point at words. Report: wrong meanings, wrong pronunciations, pages where nothing happens. Steps in `lens/README.md`. **0.2.0 (2026-10-15) adds picture mode:** also try an ePaper (Sambad, Dharitri, Samaja: rest the pointer on a headline word; zoom the viewer in for body text) and a paused YouTube news video. Report words read wrongly (the card shows what it read). | Feedback for lens v1 and picture mode | 2026-10-14 |
| A-9 | **Turn on translation for the lens** (after the merge; 2026-10-15). (1) Anthropic Console (console.anthropic.com) > API keys: make a key; Settings > Limits: set a monthly spend limit of US$20 (decision D-4). (2) Vercel > the project > Settings > Environment Variables: add `ANTHROPIC_API_KEY` (Production), then redeploy. (3) In the lens: right-click its icon > Options > turn translation on; open the frame over Odia and press **Translate**. Without the key the panel says "Translation is not set up on the server yet." Google instead: `TRANSLATE_PROVIDER=google` and `GOOGLE_TRANSLATE_KEY`. | Lens translation live | 2026-10-15 |
| A-8 | **Build and try Odia Lens for Mac** (2026-10-15, for you only). Terminal: `brew install tesseract`, then in the repository `npm install`, then `cd mac-lens && ./build.sh --open`. Allow Screen Recording (System Settings > Privacy & Security), quit and reopen. Move the frame (indigo bar, red-and-yellow border) over Odia (Safari, Preview, a paused video) and let go; try dragging each edge. The Swift code is syntax-checked only (no Mac here), so a first compile error is likely: send it as it is. Send: any compiler error as it is, the panel's top status line if nothing is read, and words read wrongly. Steps in `mac-lens/README.md`. | Feedback for the Mac lens | 2026-10-15 |

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
| C-8 | Check a sample of word-origin labels ("from Persian", "from English", "native Odia", "from Sanskrit") in the meanings panel. They come from Praharaj's 1930s marks, so recent loans have none. | Correct origin labels |
| C-9 | Check the 27 rows of `core/data/phrases.tsv` (greetings, wishes, festival wishes, the three words for "you", family, everyday), all suggested by Claude. In the app: Meanings → Phrases. Change `seed` to `owner` when a row is right; correct or delete it when not; add the phrases your family really uses (or send them in chat). | Phrase table |
| C-10 | Check `plan/review/loans-sample.tsv`: 75 random rows of the new loan-word list (50 English, 25 Persian/Arabic/Hindi). Mark ok / wrong. Claude estimates about 8 in 10 right; your answer decides whether the list needs a stricter filter. | Loan-word list quality |
| C-11 | **Before merging PR #9 (2026-10-12):** check the 5 rows of the content probe Claude sent in chat (`review-unlabelled-obscene.tsv`, not in the repository): words the Praharaj dictionary marks as obscene that the Desh typed spellings offer, 3 of them first for their key, and none yet in `labels.tsv`. Add the ones you agree with to `labels.tsv`. The probe only knows Praharaj's 23 marked words; modern chat abuse is not covered, so also type a few words your family would never want suggested. The kids edition has no typed spellings or next words. | Merging PR #9 (public website) |
| C-12 | Desh users' spellings now decide some ambiguous keys (V2.13): `paai` gives ପାଇଁ, `nala` gives ନାଳ, `janaka` gives ଜଣକ, `karuchi` gives the written କରୁଛି before the spoken କରୁଚି. The phrase seed `thik achhi` is now written without the halant, as users write it. Keep, or add a row to `preferences.tsv` for the ones you want the other way. | Ranking |
| C-14 | **Label one more word** (2026-10-15): ସାଲା (Hindi insult "saala") appeared in an Odia YouTube title. It has no meaning in the app (left out on purpose). Add it to `core/data/labels.tsv` as `offensive` or `coarse` if the app should warn on it, or leave it. | Labels | 2026-10-15 |
| C-13 | **Check the AI-written meanings** (`core/data/meanings.tsv`). Each row has status `ai`. For a right row, change `ai` to `owner`; for a wrong one, correct it or set `wrong` (a `wrong` row is never shown, and stops the same mistake coming back). A 50-row random sample comes with each batch in `plan/review/`. | AI meanings quality |
| Q-1 | `jiba`: ଯିବ ("will go", 3,104 uses) now comes before ଜୀବ ("life, creature", 3,779 uses). Which should come first? If ଜୀବ, Claude adds a row to `core/data/preferences.tsv`. | Ranking of j-words |
| Q-2 | `japana`: ଯାପନ (321 uses) now comes before ଜାପାନ (Japan, 370 uses). Proposed: a preference row so Japan comes first. Confirm? | Ranking of j-words |
| C-4 | Judge the 100-sentence translation test (Google against Claude Haiku) | D-3, `/api/translate` |
| C-5 | Review 50 loanword examples with a nukta on ଜ / ଫ | D-6 |
| C-6 | Review the romanization scheme (`AGENTS.md` §7.4) | Public release |
| ~~C-7~~ | **Done 2026-10-04.** Owner corrected the 4 rows (ରଜ = Raja festival only; dust is ଧୂଳି) and added କମିଟି "committee", ଧୂଳି "dust". Keep adding words you find wrong. | — |

## D. Decisions still open

| # | Decision | Trigger |
|---|---|---|
| D-6 | Nukta policy for ଜ / ଫ in Urdu and English loans | After C-5 |
| D-11 | **Ranking rule (Claude, 2026-10-12, PR #9):** the word the user picked most often for a key now always comes first. Before, one pick only added a fixed amount, which the new Desh evidence could outweigh (a word kept in English lost after one Keep). Keep this rule, or ask for the old additive one. | Review of PR #9 |
| D-12 | **Odia + Sanskrit profile (PR #9):** the spelling converter costs careful Sanskrit top-1 89.8 → 86.4% (5 of 147 words) and gains everyday Odia (+2.1 pp top-1) and unknown words (+18.7 pp). Sloka mode has it off. Keep it in the default profile? Also: the kids edition keeps the converter (it only spells what is typed; the kids filter applies). | Review of PR #9 |
| D-13 | **Meaning order (Claude, 2026-10-14):** the owner's meaning, then the AI-written layer (`core/data/meanings.tsv`), then the modern `[mt]` layer, then Praharaj. On the lens card, an owner or AI meaning for the exact word hides the older layers (so ନେଇ shows "over; regarding", not Praharaj's "Not"); the app's full panel still shows every layer. The AI layer is the planned replacement for `[mt]` (D-5); `[mt]` stays until then. Keep? | Review of the AI-meanings PR |
| D-10 | **Decided 2026-10-04: public product.** Recorded as: the website is public; the GitHub repository stays private until the owner says otherwise. A public site needs no public repository. If the code is to be public too: publish from a fresh repository without `tools/build-data/webcorpus/` (it stays in git history otherwise), and decide about the word counts taken from that corpus (brief §12). Since V2.2 the app also ships word-PAIR counts from the same corpus (two-word windows, slightly more of the source text than single-word counts): the same decision covers them. | Ask before any repository becomes public |
| ~~—~~ | ~~Where "Wrong word? Report it" sends reports~~ | **Decided 2026-10-04:** to the owner's email (set in `Appv2/src/main.ts`, joined at run time) |
| — | **Public repository** (owner, 2026-10-04): when the owner says the project is finished, plan and create a public code repository. Steps: (1) a fresh repository that never contained `tools/build-data/webcorpus/` (deleting it here is not enough: it stays in git history); (2) decide about the word and word-pair counts derived from that corpus (keep, rebuild from CC0/CC-BY sources such as IndicCorp v2, or drop); (3) check every row of the licence table in `CLAUDE.md` (open items: OdiaNLP pairs, wordfreq, CMUdict, indic-dict packaging); (4) decide whether the report email stays in the public code; (5) **no Desh data in the public version** (owner, 2026-10-14: "I don't want to share the one we used"): leave out `core/data/typed.tsv`, `core/data/converter.bin`, `core/data/nextword.tsv` and their sections in `core/data/PROVENANCE.md`; instead, Claude builds the same three files from publicly available chat text (owner, 2026-10-15), presented as the app's own data; only sources whose licence allows it, derived tables only, measured against the Desh-built version first. Facts for that day: every Desh layer is optional (the engine, the evals and the app run without the three files), and `tools/build-data/build_typed.py`, `build_converter.py` and `build_nextword.py` take the raw source path as an argument, so another dataset is a build-time swap. The owner may create the public repository first and then decide, file by file, what to copy into it from this one. | When the owner says "project finished" |
| — | Install the Claude Code skills for Android and iOS work | **Asked 2026-10-04** (Vercel version is live). Waiting for the owner's answer. |

## E. Other sessions and their branches

Checked 2026-10-04 against `claude/festive-hawking-ie6xyt` (this plan's branch).

| # | Item | Status |
|---|---|---|
| E-1 | Session `session_0186HVx998d8ubjjxiDMfM9p`, branch `claude/zealous-brown-hpenqp` ("Offer ଯ for word-initial j"). It adds `j`-keys to the lexicon, so `je` → ଯେ is rank 1. **It opened PR amriitmohapatra/odia-transliteration#2.** | **Close PR #2 without merging (owner action; still open 2026-10-04).** Its `j`-keys are on `main` since PR #3. (1) It breaks the Appv2 rule build (`gen-rules --check`: "duplicate option after merge" on delta S8); CI on that branch would show it. (2) It conflicts with this branch in `core/rules/symbols.toml` (weight 0.4 vs 0.6) and both cheat sheets. (3) It conflicts with E-2 in all four lexicon files and the builder. Plan: merge E-2 first, then re-apply only its builder change (the `j`-keys) on top, rebuild, measure, and close PR #2. |
| E-2 | Session `session_01GvEiBCo7MZVHuKSH5B9PK9`, branch `claude/jolly-dijkstra-4p8v4w` ("Make the common lexicon build reproducible") | **Merged to `main` by the owner (PR #1), and `main` merged into this branch 2026-10-04: all metrics unchanged.** Earlier: Merges cleanly with this branch. Its one changed result, `raja` giving the Raja festival first, now matches the owner's decision (2026-10-04) and the eval override accepts it, so it is no longer a regression. Ready to merge when the owner wants; then re-apply E-1's `j`-keys on top. |
