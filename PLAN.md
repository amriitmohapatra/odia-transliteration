# PLAN.md — what we build, in what order, and how we check it

**Living document.** Claude updates this file at the start and end of every stage, and
whenever a task changes status. Last updated: 2026-10-12 (editor reliability and responsive phone follow-up).

| File | Holds |
|---|---|
| `PLAN.md` (this file) | Stages, work per area, acceptance checks, status |
| `ARCHITECTURE.md` | How the system is built: components, data flow, storage, hosting |
| `plan/05-v3-direction.md` | Research, scope decisions, owner decisions D-0 to D-12 |
| `plan/06-owner-followups.md` | Tasks only the owner can do, and reminders |
| `plan/research/2026-10-04/` | Research notes with sources |

**Style:** STE-flavored. Short sentences, one idea each.

---

## 1. Product in four lines

1. **What it is:** type Odia the way it sounds, and see what each suggested word means in
   English before you pick it.
2. **How it differs from a keyboard:** meaning under every suggestion; a Sanskrit mode for
   slokas in Odia script; one page on any computer, no account, nothing typed leaves the
   device.
3. **Users:** (A) Odia family members chatting; (B) people who speak Odia but cannot read
   the script; (C) non-Odia people in Odisha.
4. **Not competing on:** full sentence translation, camera translation, mobile keyboards
   (Google already does these). We link to them or use their APIs.

## 2. Stages and status

| Stage | Content | Status |
|---|---|---|
| V0 Clean-up | Cache scoping, English word in the bar, `rank()` learning bug, bundled font, dictionary provenance, `j` → ଯ | **Done** 2026-10-04 (D-10 open) |
| **V1 Web app on Vercel** | One merged app; dictionary as a module; owner preferences; family-safe filter; romanised read-back; colloquial tests; UI/UX pass; PWA + `vercel.json`; CI | **Live** 2026-10-04: adult `https://odia-transliteration-web.vercel.app/`, kids `https://odia-phonetic-kids.vercel.app/` (two Vercel projects, root directory = repository root). Acceptance: A-1–A-10, A-12 pass in Chromium; A-11 (Safari) and phones are owner tests (`plan/06`) |
| V2 Better words | See §3b. Owner gloss file pulled forward into V1 (done) | **Started** 2026-10-04 |
| V3 Assist layer | `/api/speak`, `/api/listen`, `/api/translate` behind switches | Not started |
| V4 Lens | Browser extension, then camera/screenshot input | Not started |
| V5 Native | macOS input method with the real engine; Android, iOS (skills first) | Not started |
| E-1 Experiment | Laya against a simple word-origin tagger | Not started |
| P Public repository | When the owner says "project finished": a fresh public repository without the scraped corpus, the derived-counts decision, the licence-table check (`plan/06-owner-followups.md`, section D), and Desh's terms for any Desh-derived data (L-1) | Waiting for "project finished" |

## 3. V1 — work by area

### 3.1 Engine and data (`core/`)

| # | Task | Status |
|---|---|---|
| 1.1 | Owner preferences (`core/data/preferences.tsv`, `[weights] pref`) — `raja` → festival, `raajaa` → king | **Done** |
| 1.2 | Family-safe filter (`core/data/labels.tsv`, on by default, `setFamilySafe`) | **Done** (list empty until C-1) |
| 1.3 | Eval overrides for owner decisions (`everyday-overrides.tsv`) | **Done** |
| 1.4 | Colloquial test set `core/test/golden/colloquial.tsv` + `tools/eval/colloquial.ts` (seeded, marked unvalidated) | **Done** — 26 rows; spoken top-1 71.4%, top-3 95.2%; 7 misses are the V2 work list |
| 1.5 | Guard test for the filter with real data (after C-1) | **Done** — `Appv2/test/family-guard.test.ts` on the owner's list (17 rows) and the full lexicon |
| 1.7 | Keyed exemptions in `labels.tsv` (the lexicon key alone let 6 listed words through for everyday keys) | **Done** |
| 1.8 | Kids edition: filter level `kids`, `APP_EDITION=kids` build, no switch, dictionary hides labelled words | **Done** — `Appv2/eval/browser/kids-check.mjs` |
| 1.9 | Inflected forms of offensive words (C-2 review file, 109 rows) | Waiting for the owner |
| 1.6 | Owner meanings `core/data/glosses.tsv` (audit B5): shown first under suggestions and in the panel; 4 `seed` rows (ରଜ festival, କେମିତି how, ଆଛା okay, ଦିନ day) | **Done** — rows wait for the owner's check (C-7) |

### 3.2 Frontend (`Appv2/` → the V1 app)

| # | Task | Status |
|---|---|---|
| 2.1 | Dictionary as a module of the app; data as cached binary files; retire `build_app.py` | **Done** — 157/157 glosses identical to the old file; lazy load after the page; works over HTTP and from one file (Chromium) |
| 2.2 | Family-safe switch in settings, stored as `odia.pref.familySafe`, plain label | **Done** (Run A: "Hide rude words", on) |
| 2.3 | Romanised read-back line under the output (copy of the eval romaniser) | **Done** (Run A: "Reads as" line, tap a word for alternatives) |
| 2.4 | PWA: manifest, icons, Apple tags in `Appv2/` | **Done** |
| 2.5 | UI/UX pass from the design proposal (§5) | **Done** — Run A (items 1–5, 8, mode names) and Run B (6 Share/Copy/Undo, 7 tokens + text size, 9 first-run card + Help, 10 desktop list + meanings column, 11 screen reader + keyboard). Open: M9 "Show full entry"; phone Meanings panel above the iOS keyboard |
| 2.6 | "Report this word" button: copies word, output, code points, version; opens an email link. No network call. | **Done** — "Wrong word? Report it" in the Alternatives sheet; recipient empty until the owner decides (follow-up D) |

### Phone follow-up — 12 October 2026

The owner requested phone usability now, after reporting oversized type and an
obscured editor. The same web URL has a dedicated responsive writing view: compact
Noto Odia text, an editor fitted above the software keyboard, one scrollable
candidate row, Copy and Done. The dictionary opens only on request as a focused
sheet; Insert returns to the saved editor selection. Desktop keeps its meanings
column. Text-size preferences still apply. Browser viewport and interaction
checks cover narrow phones, landscape, larger text and simulated keyboard changes;
physical iPhone/iPad validation remains an owner follow-up. See `handoff.md` for
the release state and reproducible commands.

### 3.3 Backend

V1 has **no backend**: Vercel serves static files. The backend starts in V3 (the assist
layer, `ARCHITECTURE.md` §7). Two things are set up now so V3 starts safely:

| # | Task | Status |
|---|---|---|
| 3.1 | `.env*` in `.gitignore` | **Done** |
| 3.2 | `vercel.json`: build, output, `sw.js` headers | **Done**. Deployed by the owner 2026-10-04 (two projects: adult, kids) |

### 3.4 Quality, CI and release

| # | Task | Status |
|---|---|---|
| 4.1 | Root `npm test` runs core, Appv2 and the fallback-page tests | **Done** |
| 4.2 | GitHub Actions: tests, `gen-rules --check`, evals with delta on every push | **Done** (`.github/workflows/ci.yml`) |
| 4.3 | Release = git tag + 5-line note (changes, numbers vs baseline, not tested, limits) | To do (first deploy 2026-10-04 has no tag yet) |
| 4.4 | Rollback = promote the previous Vercel deployment | Available since the first deploy (2026-10-04) |
| 4.5 | A rule for when `tools/eval/baseline.json` may be refreshed: only in its own commit, with the reason | To do |
| 4.6 | Browser checks in the repo: `Appv2/eval/browser/` (regress, gloss-check, report-check, freeze) | **Done** |
| 4.7 | Run editor, English dictionary and phone browser checks in CI against the production build | **Done** 2026-10-12 |

## 3b. V2 — better words (started 2026-10-04)

Measured limits of this environment (2026-10-04): HuggingFace and Wikidata do not answer
through the network proxy, and GitHub returns 403 for the IndicXlit repository. Items that
need them wait for a run on the owner's Mac or a later environment.

| # | Task | Data source | Status |
|---|---|---|---|
| V2.1 | `j`-keys in the common lexicon (the useful part of PR #2), on main's reproducible builder | in repo | **Done** — ଯ-words typed with j: top-1 361 → 659 of 779; 12 of the 300 commonest ଜ-words lose first place (owner questions Q-1, Q-2) |
| V2.2 | Context ranking: word-pair (bigram) counts; the previous word helps rank the next | in-repo corpus (same status as the shipped word counts, D-10 note) | **Done** — weight 1.2 (one user pick still wins); held-out corpus split casual top-1 83.2 → 84.6, careful 92.4 → 92.7; caret bar uses the word before the caret |
| V2.3 | Colloquial work list (`jauchi`, `aasuchu`, `janichi`, `kain`, `chala`, `dada`, `sanga`) | in repo | **Partly** — `jauchi` fixed (V2.1); long-a weight 0.35 → 0.45 (held-out overall top-1 25.0 → 25.3); the other six need owner validation (spoken ଚ vs written ଛ) or an engine change (`dada`: the beam) |
| V2.4 | Word origin in the dictionary: "from Hindi / Persian / Arabic / English" | Praharaj origin tags (public domain, in hand) | **Done** — 35,396 of 38,776 dictionary words get an origin (`origin.bin`, 13 KB); panel pill on all sizes, chip suffix on desktop. Owner: review a sample (follow-up C-8) |
| V2.5 | Owner phrase table: greetings, festival wishes, the three levels of "you" | the owner writes it | **Mechanism done** 2026-10-12: `core/data/phrases.tsv` (27 seed rows awaiting the owner's review, C-9), strict parser, Meanings panel direction "Phrases" (browse by group, search by meaning / typed spelling / group / Odia, Insert, Copy); kids filter per word. Not in the typing strip yet (one roman word → several Odia words needs a separate design). |
| V2.6 | IndicXlit lexicon fill for unknown words (OOV top-1 7.3%) | HuggingFace | **Blocked here** |
| V2.7 | Replace the MODERN meanings layer (D-5) | Samanantar / BPCC (HuggingFace), Wikidata | **Blocked here** |
| V2.8 | Phrases with offensive meaning made of innocent words | needs V2.2 | Later |
| V2.9 | Inflected forms of offensive words | owner review (C-2) | Waiting for the owner |
| V2.10 | Explicit offline English → Odia lookup, separate translations/loan spellings | original seed + existing owner glosses | **First version** 2026-10-12: 70 entries / 62 terms, Copy and undoable Insert Odia at the last editor selection, offline/degraded-load checks. 64 proposed entries await native review; typing aliases are separate follow-up work. |
| V2.11 | Preserve literal text, align commit/copy and restore undo/redo | editor transactions + browser regression cases | **Implemented** 2026-10-12: addresses/identifiers and paste stay literal; Alt/Option+number candidate shortcuts; Left/Right caret movement; visible pending-word commit on Copy; shared undo for typing, candidates, insertion and Clear. Browser checks run in CI. |
| V2.12 | One unified dictionary (owner: the two directions were misleading); search by Odia, English word or roman spelling ("when I am not sure of the matras") | data in hand | **Done** 2026-10-12: step A (one search box) and step B (`loans.tsv`: 3,668 English loans from CMUdict + SCOWL + IndicCorp v2 CC0 attestation, 187 Persian/Arabic/Hindi from Praharaj; replaces the wordfreq-based loan rows in search; owner sample C-10). Step C (typing `phone` → the loan word) waits for the owner |
| V2.13 | Typed spellings: what Desh keyboard users typed and chose, as a ranking term (owner: "the best of both") | Desh `key_to_word` (L-1 pending; owner: build now) | **Done** 2026-10-12: `core/data/typed.tsv` (55,818 pairs), `[weights] typed = 1.3`, prior 20. Desh users' first choice as our first suggestion 68.9% → 87.3% (by use). Held-out unchanged on untouched keys (OOV +0.0, in-lexicon −4 pp only on keys whose answer the eval removes from the pairs). Everyday top-3 unchanged (97.8/95.7); top-1 89.1 → 82.6 careful (ambiguous keys now follow users: `paai` ପାଇଁ, `nala` ନାଳ, `janaka` ଜଣକ). Off in the sloka profile and the kids edition |
| V2.14 | Hybrid speller: Desh's learned spelling converter for words our word lists do not know (owner: "the best of both") | Desh `transliteration.db` (L-1 pending; owner: build now) | **Done** 2026-10-12: `core/data/converter.bin` (843 KB, own format), `core/src/converter.ts` (n-best decoder, p95 3.5 ms per word); `[weights] convert = 4` (unknown key), `convert_known = 0.5`, temperature 3. Held-out OOV top-1 6.7 → 25.6%, top-5 → 40.9%; overall 36.9/54.7 (Desh converter alone 34.8/52.5). Everyday casual top-5 95.7 → 97.8. The user's most picked word for a key now always comes first (house rule made structural). Off in the sloka profile (verse −6.8 pp); default profile Sanskrit careful top-1 89.8 → 86.4 |
| V2.15 | Next-word suggestions after a space (from Desh users' word pairs and triples) | Desh `native_lm.db` (L-1 pending; owner: build now) | **Done** 2026-10-12: `core/data/nextword.tsv` (46,849 rows, 293 KB gzipped), `Engine.predictNext()` (content filter: never an offensive word; kids: not shipped). Bar shows up to 5 after "word + space"; a tap or Alt+number inserts the word and a space and offers the next; plain number keys, Space, Enter and arrows keep their meaning; Escape closes them at that place. Setting "Suggest the next word" (on). Off in strict mode and the sloka profile. Phrase pairs: 15 of 21 in the top 3 |
| V2.16 | Word completion: a whole word for a key still being typed (`bhub` → ଭୁବନେଶ୍ୱର), in the bar and in the dictionary search | `typed.tsv` (V2.13) | **Done** 2026-10-12: `Engine.complete()` (3+ letters, summed pair counts, floor 100 and 2% of the best, content filter); up to two in the bar at places 3–4 (Space still takes the typed match; marked …); dictionary: English-letter search lists them, an Odia prefix lists "Words starting with" (dictionary headwords, most common first). Kept English words lead again after one Keep (`rank.ts`). Browser check `desh-check.mjs` |

The measured 12 October interface/data audit and recommended next work are in
[`codex_review_12Oct2026.md`](codex_review_12Oct2026.md). It prioritizes literal-text
preservation, consistent commit/copy/undo, and shipped-asset evaluation before
larger corpus imports or native-keyboard packaging.

The owner authorized implementing these fixes and publishing them to the Vercel
app on 12 October. This release uses a reviewed PR into the configured production
branch, `main`, after its checks pass. Linguistic data imports and new preferred
spellings remain separate from these editing fixes.

**Release step (owner approval, 2026-10-04):** when V2 is merged into this branch and all
checks pass, Claude opens a pull request from `claude/festive-hawking-ie6xyt` to `main`.
The owner merges it. The owner's phone and Safari checks follow the merge to `main`.

## 4. V1 acceptance checks

V1 is done when every row passes. Each row says how it is checked.

| # | Claim | How it is checked |
|---|---|---|
| A-1 | `kemiti achha` → କେମିତି ଅଛ | Unit test + browser test — **passes** |
| A-2 | Works offline after the first load | Playwright: load, go offline, reload, type — **passes** (after fixing a registration bug, 2026-10-04) |
| A-3 | Family-safe filter is on by default and can be turned off | Unit tests + browser test of the switch — **passes** (Run A check-a5, 16/16) |
| A-4 | The meaning shows under candidates (e.g. `dina` → "Day", "Poor") | Playwright — **passes** |
| A-5 | "Dictionary loading" and "dictionary failed" look different | Playwright with the data file blocked — **passes** (Run A check-a6) |
| A-6 | Learned words survive the move from the old app to V1 | Same storage key `odia.userdict` (unchanged); learning checked in the browser — **passes** on the same origin. Moving from the old *file* to the hosted site is a new origin: learned words do not carry over (no export yet) |
| A-7 | Typing never freezes while the dictionary loads | Playwright long-task timing, CPU normal and 4× slower — **passes**: no long task while the meanings load; key median 3 ms (normal) / 21 ms (4×). Known limit: one start-up task while the word list and word pairs are built, 0.31 s normal / 1.07 s at 4× (V2; was 0.2 / 0.9 s in V1). 2026-10-12 re-measured side by side with the Desh layers: start-up task 0.27 s / 1.32 s (before them, same machine: 0.27 / 1.48 s); then four 30–60 ms tasks (120–260 ms at 4×) while they load; worst key delay 0.1 s at 4× |
| A-8 | Usable with the keyboard alone | Playwright key sequence — **passes** (Run B check-b6: text box → Copy in 5 Tab stops, focus ring ≥7.37:1) |
| A-9 | Phone layout: inputs ≥16 px, tap targets ≥44 px, safe areas | Playwright at 390×844 and 390×480 — **passes** in Chromium; real phones: owner test |
| A-10 | No metric regression | `npm run eval`, `everyday.ts`, `Appv2/eval/run.ts` — **passes** (unchanged after both UI runs) |
| A-11 | Safari engine | `webkit-check.py` on the owner's Mac (follow-up A-3) |
| A-12 | No analytics, no network call in V1 | Network log in Playwright is empty after load — **passes** (0 requests off the origin) |

## 5. UI/UX design approach

Design work follows the project's design skills (anti-ui-slop, ui-ux-pro-max, web design
guidelines): a design contract first, every state designed (empty, loading, error,
offline), real content instead of placeholders, and a finish gate before release.

Principles for this app:

1. **The text is the product.** The writing area and the suggestions get the space. Settings
   hide behind one button.
2. **Meaning before choice.** Every suggestion shows its English gloss, so users pick by
   meaning (the value proposition).
3. **Check without reading Odia.** A romanised line (and later audio) lets user B confirm
   the result.
4. **Large and calm.** Odia at about 1.3× the Latin size, high contrast, 44 px targets,
   light and dark themes.
5. **Honest states.** Loading, offline and failure each look different and say what to do.
6. **No surprises with data.** Nothing leaves the device in V1. Each later online feature
   has its own switch that names the company.

Full proposal: `plan/design/v1-ux-proposal.md` (audit, wireframes, tokens with computed
contrast, accessibility checklist, copy deck, usability test for the owner's parents).

**Audit, worst first** (checked in Chromium, phone 390×844 and desktop 1280×800):

| # | Problem | Fix in V1 |
|---|---|---|
| B1 | On a phone the keyboard hides the suggestions after #4, the result and Copy | A suggestion strip that sits on the keyboard; Copy stays in the top bar |
| B2 | Dark mode: hovered active suggestion is 1.7:1 contrast | One CSS rule (`:not(.is-active):hover`) |
| B3 | The Alternatives sheet splits Odia words between letters | No `overflow-wrap: anywhere` on Odia |
| B4 | The round meanings button covers the Alternatives sheet | Layering fix |
| B5 | Wrong meanings: କେମିତି → "committee", ଆଛା → "See)", ରଜ → "Dust." | Owner gloss file + loan-detector exclusions (data) |
| — | Odia shown twice, tiny labels, engine words on screen, silent loading, no offline sign | One text box + "Reads as" line, ≥15 px text, plain words, honest states |

**V1 UI work, in order:** (1) B2–B4; (2) phone suggestion strip; (3) one text box + "Reads
as" line; (4) readable meanings, no engine words; (5) family-safe switch ("Hide rude
words", on); (6) Share/Copy and Undo; (7) new colour and size tokens (all text ≥4.5:1,
outlines ≥3:1); (8) loading, error and offline states; (9) first-run card, everyday
example; (10) desktop list popover + fixed meanings column; (11) screen-reader fixes.

**Mode names:** "Everyday" (runs today's default, Odia + Sanskrit) and "Śloka (verse)"; the
original engine moves to Advanced. Adopted as the recommended default; the owner can
change it.

## 6. Team

The owner is the head of the company and decides scope and anything linguistic. Claude is
the project lead and gives tasks to agents, one role each: research analyst, data
engineer, engine engineer, frontend engineer, designer, QA engineer, licence officer.
Agents do not commit; the lead reviews, measures and commits.

## 7. Working rules

- Small commits. Each says why, and gives the evidence (tests, metric delta).
- A failing test first for every bug.
- Before every push: check the other active branches (`claude/jolly-dijkstra-4p8v4w`,
  `claude/zealous-brown-hpenqp`) with a trial merge. Owner instruction, 2026-10-04.
- No real abuse is written into the repository by an agent. The owner curates `labels.tsv`.
- At the end of each stage: show the owner `plan/06-owner-followups.md`.

## 8. Change log of this plan

| Date | Change |
|---|---|
| 2026-10-12 | V2.15 next-word suggestions. The Desh layers (typed pairs, next words, converter) now load after start-up, each in its own task: A-7 start-up task 270 → 270 ms (normal CPU), 1.48 → 1.32 s (4×); worst key delay at 4× 2 s → 0.1 s. Context check now uses `dui jana` (the typed pairs put କୁମାର first even alone). |
| 2026-10-12 | V2.14 hybrid speller: Desh spelling converter for unknown words, loaded after start-up. Held-out vs baseline: in-lexicon −3.1/+1.4, OOV +18.7/+26.1, overall +14.9/+22.0 pp. Most-picked word first (rank.ts). |
| 2026-10-12 | V2.16 word completion (bar and dictionary search). A word kept in English is first for its key while it is the user's most picked word (the typed data gave many English keys an Odia word with frequency evidence). Engine scores otherwise unchanged; editing 27/27, English 19/19, phrases 15/15, phone 193/193, Desh 4/4. |
| 2026-10-12 | V2.13 typed spellings from Desh data (owner decision: build before the written permission). Colloquial "spoken" top-1 100 → 76.2% (`karuchi` → କରୁଛି, the written form Desh users choose, over the spoken କରୁଚି; top-3 100%). Phrase seed `thik achhi` now ଠିକ ଅଛି (users' spelling). Unified profile verse: casual top-1 78.9 → 77.6%. |
| 2026-10-12 | Owner preference `ra` → the letter RA alone (weight 3). Evals unchanged (held-out, everyday, context, colloquial). |
| 2026-10-12 | Repository private again (owner). Desh keyboard data: owner reports permission; written confirmation pending (L-1); measured in session only until then. CI runs on pull requests and on `main` only. Stage P (public repository) now also depends on Desh's terms. |
| 2026-10-12 | V2.12 step B: loan-word list `loans.tsv` (3,855 rows, licence-clean inputs), English search uses it; Odia results show "English loan word: …". IndicCorp v2 Odia counted (CC0, 5.58 M lines) for attestation. |
| 2026-10-12 | V2.12 unified dictionary: one search box, grouped results (spellings, English → Odia, loans, phrases); loan rows filtered by origin and sound. Browser checks rewritten for the one box. |
| 2026-10-12 | Bug fixes: about 1,640 raw romanization codes in Praharaj meanings (`&aline;`, `&uline;`, `$nbsp;`...) now show as letters (`dictionary/clean.ts`, test over the whole payload); the legacy `web/` build now includes `legacy-polyfills.js` (variable was unused). |
| 2026-10-12 | Number keys 1–9 pick a suggestion again (owner request: Microsoft keyboard style, lost in PR #5). Setting "Number keys pick suggestions", on by default; Alt+number always picks. Two new editing checks (27/27). |
| 2026-10-12 | V2.5 phrase table: data file, parser, Meanings panel "Phrases", unit and browser checks (`phrases-check.mjs`, in CI). Engine scores unchanged. |
| 2026-10-12 | Security check (repo found public): no secrets in any commit (gitleaks + custom scan, all history). CI token set to read-only; `npm audit fix` (nanoid, smol-toml; vitest/tinypool remain, test runner only, needs a major upgrade). Owner items S-1 to S-4 in `plan/06`. Owner decision: the repo stays public, history unchanged (free Actions minutes). |
| 2026-10-12 | Owner approved the fixes. **Fixed:** composed Roman words (Gboard) show suggestions and convert again; a tap during composition replaces the word once and undo returns the Roman word; Escape only closes the bar for the current word; "Try example" waits for the engine. Checks: 4 unit + 4 browser composition cases and a rewritten Escape case (they fail on the PR #5 build, pass now); editing 25/25, English 19/19, phone 193/193 on adult and kids builds. |
| 2026-10-12 | Claude review of the Codex changes (PRs #4, #5): all unit, eval and browser checks pass on adult and kids builds; typing latency unchanged. **Found:** words typed through a composing keyboard (Android Gboard style) stay Roman and show no suggestions (confirmed in Chromium with CDP IME events; before #5 they converted); Escape now keeps a word as English; "Hide rude words" is not applied to English results (canary test added); "Try example" before load can stay Roman. `report-check.mjs` presses Done (phone read-back row is hidden while typing). Fixes wait for the owner. |
| 2026-10-04 | PR #3 merged to `main`. **V1 live on Vercel** (adult and kids). First build failed: Vercel had picked `web` as the root directory; fixed by setting it to the repository root. |
| 2026-10-04 | Browser checks moved into the repo (4.6). Docs pointers updated (CLAUDE.md, AGENTS.md, docs/README.md). |
| 2026-10-04 | V2.1–V2.4 merged: j-keys, word-pair context (weight 1.2, wired into the caret bar), long-a weight, word origins. |
| 2026-10-04 | `main` (PR #1) merged in. Owner decisions applied: meanings (C-7), report email, D-10 public site. Owner's offensive lists labelled with keyed exemptions; kids edition. |
| 2026-10-04 | A-7 measured (passes, start-up limit noted). **V1 code done.** |
| 2026-10-04 | 2.6 report button done. |
| 2026-10-04 | UI Run B merged (6 commits): Share/Undo, tokens (70/70 contrast pairs pass), text size, first-run card + Help, desktop list + meanings column, screen-reader path. A-1, A-6, A-8, A-9, A-10 pass. |
| 2026-10-04 | Owner meanings file (1.6) done: wrong meanings from the audit fixed as seed rows. |
| 2026-10-04 | UI Run A merged (8 commits, `--no-ff`): B1–B4 fixed, phone strip, one text box + "Reads as", readable meanings, "Hide rude words", states, mode names. A-3, A-4, A-5 pass. |
| 2026-10-04 | Design proposal in (`plan/design/`). V1 UI work list added (§5). Romanizer for the read-back line done. |
| 2026-10-04 | 2.4 done. Service-worker registration bug fixed: offline now works (A-2, A-12 pass). |
| 2026-10-04 | 2.1 done (dictionary module). Owner gloss file added to V2. |
| 2026-10-04 | 1.4, 3.1, 4.1, 4.2 done. |
| 2026-10-04 | Created. V0 done. V1 started: engine items 1.1–1.3 done. Guidebook practices added (§3.4, §4, 2.6). |
