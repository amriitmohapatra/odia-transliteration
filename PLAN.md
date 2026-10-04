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
| **V1 Web app on Vercel** | One merged app; dictionary as a module; owner preferences; family-safe filter; romanised read-back; colloquial tests; UI/UX pass; PWA + `vercel.json`; CI | **In progress** |
| V2 Better words | IndicXlit lexicon fill, bigram ranking, owner phrase table, new modern glosses, Hindi/Urdu layer, `j`-keys in lexicon | Not started |
| V3 Assist layer | `/api/speak`, `/api/listen`, `/api/translate` behind switches | Not started |
| V4 Lens | Browser extension, then camera/screenshot input | Not started |
| V5 Native | macOS input method with the real engine; Android, iOS (skills first) | Not started |
| E-1 Experiment | Laya against a simple word-origin tagger | Not started |

## 3. V1 — work by area

### 3.1 Engine and data (`core/`)

| # | Task | Status |
|---|---|---|
| 1.1 | Owner preferences (`core/data/preferences.tsv`, `[weights] pref`) — `raja` → festival, `raajaa` → king | **Done** |
| 1.2 | Family-safe filter (`core/data/labels.tsv`, on by default, `setFamilySafe`) | **Done** (list empty until C-1) |
| 1.3 | Eval overrides for owner decisions (`everyday-overrides.tsv`) | **Done** |
| 1.4 | Colloquial test set `core/test/golden/colloquial.tsv` + `tools/eval/colloquial.ts` (seeded, marked unvalidated) | **Done** — 26 rows; spoken top-1 71.4%, top-3 95.2%; 7 misses are the V2 work list |
| 1.5 | Guard test for the filter with real data (after C-1) | Later |

### 3.2 Frontend (`Appv2/` → the V1 app)

| # | Task | Status |
|---|---|---|
| 2.1 | Dictionary as a module of the app; data as cached binary files; retire `build_app.py` | In progress (frontend agent) |
| 2.2 | Family-safe switch in settings, stored as `odia.pref.familySafe`, plain label | To do |
| 2.3 | Romanised read-back line under the output (copy of the eval romaniser) | To do |
| 2.4 | PWA: manifest, icons, Apple tags in `Appv2/` | To do |
| 2.5 | UI/UX pass from the design proposal (§5) | To do (design in progress) |
| 2.6 | "Report this word" button: copies word, output, code points, version; opens an email link. No network call. | To do |

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

## 4. V1 acceptance checks

V1 is done when every row passes. Each row says how it is checked.

| # | Claim | How it is checked |
|---|---|---|
| A-1 | `kemiti achha` → କେମିତି ଅଛ | Unit test + browser test |
| A-2 | Works offline after the first load | Playwright: load, go offline, reload, type |
| A-3 | Family-safe filter is on by default and can be turned off | Unit tests (done) + browser test of the switch |
| A-4 | The meaning shows under candidates (e.g. `dina` → "Day", "Poor") | Playwright |
| A-5 | "Dictionary loading" and "dictionary failed" look different | Playwright with the data file blocked |
| A-6 | Learned words survive the move from the old app to V1 | Same storage key `odia.userdict`; browser test |
| A-7 | Typing never freezes while the dictionary loads | Playwright timing on a throttled CPU |
| A-8 | Usable with the keyboard alone | Manual + Playwright key sequence |
| A-9 | Phone layout: inputs ≥16 px, tap targets ≥44 px, safe areas | Playwright at 390×844 + design checklist |
| A-10 | No metric regression | `npm run eval`, `everyday.ts`, `Appv2/eval/run.ts` |
| A-11 | Safari engine | `webkit-check.py` on the owner's Mac (follow-up A-3) |
| A-12 | No analytics, no network call in V1 | Network log in Playwright is empty after load |

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

The detailed audit, wireframes, design tokens and the usability script for the owner's
parents come from the designer's proposal. They go here when it arrives.

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
| 2026-10-04 | 1.4, 3.1, 4.1, 4.2 done. |
| 2026-10-04 | Created. V0 done. V1 started: engine items 1.1–1.3 done. Guidebook practices added (§3.4, §4, 2.6). |
