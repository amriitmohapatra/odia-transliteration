# PLAN.md — what we build, in what order, and how we check it

**Living document.** Claude updates this file at the start and end of every stage, and
whenever a task changes status. Last updated: 2026-10-04 (V1 in progress).

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
| **V1 Web app on Vercel** | One merged app; dictionary as a module; owner preferences; family-safe filter; romanised read-back; colloquial tests; UI/UX pass; PWA + `vercel.json`; CI | **Code done** 2026-10-04. Acceptance: A-1–A-10, A-12 pass in Chromium; A-11 (Safari) and phones are owner tests. Then owner: D-10, deploy |
| V2 Better words | See §3b. Owner gloss file pulled forward into V1 (done) | **Started** 2026-10-04 |
| V3 Assist layer | `/api/speak`, `/api/listen`, `/api/translate` behind switches | Not started |
| V4 Lens | Browser extension, then camera/screenshot input | Not started |
| V5 Native | macOS input method with the real engine; Android, iOS (skills first) | Not started |
| E-1 Experiment | Laya against a simple word-origin tagger | Not started |
| P Public repository | When the owner says "project finished": a fresh public repository without the scraped corpus, the derived-counts decision, the licence-table check (`plan/06-owner-followups.md`, section D) | Waiting for "project finished" |

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

### 3.3 Backend

V1 has **no backend**: Vercel serves static files. The backend starts in V3 (the assist
layer, `ARCHITECTURE.md` §7). Two things are set up now so V3 starts safely:

| # | Task | Status |
|---|---|---|
| 3.1 | `.env*` in `.gitignore` | **Done** |
| 3.2 | `vercel.json`: build, output, `sw.js` headers | **Done** (deploy itself is the owner's action, after D-10) |

### 3.4 Quality, CI and release

| # | Task | Status |
|---|---|---|
| 4.1 | Root `npm test` runs core, Appv2 and the fallback-page tests | **Done** |
| 4.2 | GitHub Actions: tests, `gen-rules --check`, evals with delta on every push | **Done** (`.github/workflows/ci.yml`) |
| 4.3 | Release = git tag + 5-line note (changes, numbers vs baseline, not tested, limits) | From first deploy |
| 4.4 | Rollback = promote the previous Vercel deployment | From first deploy |
| 4.5 | A rule for when `tools/eval/baseline.json` may be refreshed: only in its own commit, with the reason | To do |
| 4.6 | Browser checks in the repo: `Appv2/eval/browser/` (regress, gloss-check, report-check, freeze) | **Done** |
| 4.7 | Run the browser checks in CI (needs a Playwright + Chromium install step) | To do |

## 3b. V2 — better words (started 2026-10-04)

Measured limits of this environment (2026-10-04): HuggingFace and Wikidata do not answer
through the network proxy, and GitHub returns 403 for the IndicXlit repository. Items that
need them wait for a run on the owner's Mac or a later environment.

| # | Task | Data source | Status |
|---|---|---|---|
| V2.1 | `j`-keys in the common lexicon (the useful part of PR #2), on main's reproducible builder | in repo | To do (data agent) |
| V2.2 | Context ranking: word-pair (bigram) counts; the previous word helps rank the next | in-repo corpus (same status as the shipped word counts, D-10 note) | To do (data agent) |
| V2.3 | Colloquial work list (`jauchi`, `aasuchu`, `janichi`, `kain`, `chala`, `dada`, `sanga`) | in repo | To do (data agent) |
| V2.4 | Word origin in the dictionary: "from Hindi / Persian / Arabic / English" | Praharaj origin tags (public domain, in hand) | To do (dictionary agent) |
| V2.5 | Owner phrase table: greetings, festival wishes, the three levels of "you" | the owner writes it | Mechanism first; content is an owner task |
| V2.6 | IndicXlit lexicon fill for unknown words (OOV top-1 7.3%) | HuggingFace | **Blocked here** |
| V2.7 | Replace the MODERN meanings layer (D-5) | Samanantar / BPCC (HuggingFace), Wikidata | **Blocked here** |
| V2.8 | Phrases with offensive meaning made of innocent words | needs V2.2 | Later |
| V2.9 | Inflected forms of offensive words | owner review (C-2) | Waiting for the owner |

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
| A-7 | Typing never freezes while the dictionary loads | Playwright long-task timing, CPU normal and 4× slower — **passes**: no long task while the meanings load; key median 6 ms (normal) / 26 ms (4×). Known limit: one start-up task while the word list is built, 0.2 s normal / 0.9 s at 4×; a key pressed in that moment waits up to ~0.5 s |
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
| 2026-10-04 | Browser checks moved into the repo (4.6). Docs pointers updated (CLAUDE.md, AGENTS.md, docs/README.md). |
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
