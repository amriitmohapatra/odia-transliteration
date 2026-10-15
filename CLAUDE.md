# CLAUDE.md — Odia Transliteration

English → Odia (ଓଡ଼ିଆ) phonetic transliteration for macOS and Windows. Type
`kemiti achha`, get `କେମିତି ଅଛ`, into whatever app is in front of you.

**Read `plan/00-overview.md` before making architectural decisions.** The plan folder is
the source of truth for scope, staging and rationale.

**Current stage** (2026-10-04, latest): **V1 is live on Vercel**: adult
`https://odia-transliteration-web.vercel.app/`, kids `https://odia-phonetic-kids.vercel.app/`.
V2 (better words) has started. **2026-10-12:** the hybrid engine with Desh keyboard data
(V2.13 typed spellings, V2.14 spelling converter, V2.15 next word, V2.16 completion) is
built and in PR #9, not merged: merging publishes Desh data before the written permission
(L-1), and C-11 (content probe) comes first. Owner checks after the merge are open in `plan/06-owner-followups.md`. Status per item: `PLAN.md`. Earlier: Stages A and B were in progress. Three single-file web apps
are built and measured: `docs/odia-app.html`, `docs/odia-app-sanskrit.html` (from `Appv2/`)
and `Odia_Sanskrit_Appv2/odia-app-sanskrit-v2.html` (adds the dictionary). The v3 direction
and the owner's decisions are in `plan/05-v3-direction.md`. See also `plan/02-stages.md`.

**Living plan files:** `PLAN.md` (stages, work per area, acceptance checks, status) and
`ARCHITECTURE.md` (components, data flow, storage, hosting). Update them in the same commit
as the change they describe.

**Owner follow-ups:** `plan/06-owner-followups.md` lists the items that only the owner can
do, or that need the owner's Mac. When a stage in `plan/05-v3-direction.md` §13 finishes,
and when the V1 web app is live on Vercel, show the owner the open items in that file.

---

## The one invariant you must not break

`ଡ଼` and `ଢ଼` are stored **decomposed** — base consonant + nukta U+0B3C:

```
ଡ଼  =  U+0B21 + U+0B3C     never U+0B5C
ଢ଼  =  U+0B22 + U+0B3C     never U+0B5D
```

The precomposed code points **decompose under NFC**. Vowel signs go the other way — NFC
*composes* them. `ୟ` (U+0B5F) is atomic and safe.

A lexicon keyed on precomposed nukta forms silently stops matching after any NFC pass.
Odia's own name (`ଓଡ଼ିଶା`) contains one, so this breaks common words, not edge cases.

Call `canonical()` from `core/src/normalize.ts` at **every** boundary: data-build output,
rule-file load, lexicon keys, engine output, `learn()` input. When touching anything
Unicode-adjacent, run `npm test -w core` — the nukta vectors are the canary.

Verify by code point, never by eye. `ଡ଼` and `ଡ଼` are visually identical:

```bash
npm run -w cli start -- "odisha" --codepoints    # expect U+0B21 U+0B3C
```

---

## Architecture

One TypeScript engine, six consumers.

```
core/  ──────────────────────────────┐
  the engine. pure TS, no I/O.       │
                                     │
  ├─ cli/         node               │  direct import
  ├─ web/         browser            │  direct import
  ├─ Appv2/       Sanskrit web app   │  direct import
  ├─ lens/        browser extension  │  esbuild bundle (V4.1)
  ├─ mac-lens/    Swift lens window  │  WKWebView page from lens/src/mac.ts (owner testing)
  └─ ime-macos/   Swift input method │  JavaScriptCore
                                     ┘
```

`ime-macos` loads the same `core/dist/engine.js` through `JavaScriptCore.framework`, a
public macOS system framework. No FFI, no WebAssembly, no Rust in the engine path. This
is why the core is TypeScript.

The Tauri desktop composer (`app/`) in `plan/00-overview.md` does not exist. If it is ever
built, Rust stays limited to roughly 150 lines of clipboard and hotkey glue.

---

## Where behaviour lives

**Linguistic rules go in TOML, never in TypeScript.**

| Change | File |
|---|---|
| A letter maps to the wrong Odia character | `core/rules/symbols.toml` |
| Candidate ranking feels wrong | `[weights]` in `core/rules/symbols.toml` |
| Strict ITRANS/ISO-15919 mapping | `core/rules/itrans.toml` |
| Segmentation or orthography assembly logic | `core/src/segment.ts` (rare) |
| "For this roman key, this word comes first" (owner decision) | `core/data/preferences.tsv` |
| A word is offensive / coarse / spoken / slang / dialect (owner-curated, whole words) | `core/data/labels.tsv` |
| The meaning shown for a word is wrong or misleading (owner meaning, shown first) | `core/data/glosses.tsv` |
| A greeting, wish or other whole phrase to offer in the Meanings panel (owner decision) | `core/data/phrases.tsv` |
| A word has no meaning, or an old/wrong one, in the app and the lens (AI-written, status `ai` until the owner checks it; D-13) | `core/data/meanings.tsv` |
| A verb form is explained with the wrong tense or person ("get + have …-ed (they, or respectful)"; AI-written) | `core/data/verb-endings.tsv` |
| The derived everyday test expects the wrong word for an ambiguous key (owner decision) | `core/test/golden/everyday-overrides.tsv` |

`core/src/rules.ts` validates rule files on load and **fails loudly** on a typo or a
non-canonical Odia string. Do not soften that into a warning.

After any rule change, run `npm run eval` and compare against
`tools/eval/baseline.json`. Never commit a rule change without the metric delta.

---

## Commands

```bash
npm install                            # workspaces: core, cli, web

npm test                               # all tests
npm test -w core                       # engine only (includes nukta vectors)

npm run -w cli start -- "kemiti achha"           # transliterate
npm run -w cli start -- "namaskaara" --strict    # deterministic ITRANS mode
npm run -w cli start -- "odisha" --codepoints    # verify nukta encoding

npm run eval                           # metrics + delta vs baseline
npm run -w web dev                     # web page
npx vite --config Appv2/vite.config.ts # Sanskrit web app (not a workspace)

cd tools/build-data && uv run python build_lexicon.py   # rebuild data artifacts
```

Data artifacts in `core/data/` are **committed**. Rebuild only when the pipeline or its
sources change, and update `core/data/PROVENANCE.md` when you do.

---


## Context for other AI tools

`AGENTS.md` is the tool-agnostic handoff — read it if you have no memory of this project.
It covers the invariant, the architecture, the facts that were expensive to learn, and the
open problems.

Durable insight that outlives this repo lives in the Obsidian vault at
`~/Documents/My_Second_Brain/Odia-Transliteration/` — script traps, data-source findings,
design lessons and a verification checklist.

## Docs

`docs/romanization-reference.{tex,pdf}` — the user-facing cheat sheet: which English
letters produce which Odia characters, matras, conjuncts, signs and numerals.

It is the human-readable face of `core/rules/symbols.toml`. **When you change a mapping
in that TOML, update this sheet in the same commit** or the two silently diverge.

```bash
cd docs && lualatex romanization-reference.tex   # twice, for cross-references
```

**LuaLaTeX, not pdfLaTeX.** Odia needs Unicode input plus HarfBuzz shaping for conjuncts
and nukta forms — `pdflatex` cannot render this document. The font is `Oriya Sangam MN`
(macOS system font) via `fontspec` with `Renderer=HarfBuzz`. Note that XeLaTeX also
fails here: `xdvipdfmx` cannot embed the Apple `.ttc`.

The scheme in that sheet is **v0.1, unreviewed by a native speaker**. Treat its mappings
as proposals.

## Quality bar

Two test sets, measuring different things — never average them:

- **`core/test/golden/heldout.tsv`** — Aksharantar's 4,256 test pairs, excluded from the
  lexicon by construction. Report top-1/top-5 **split by in-lexicon vs out-of-vocabulary**.
  In-lexicon measures coverage; OOV measures rule generalization.
- **`core/test/golden/everyday.tsv`** — sentences the user actually writes. This is what
  daily usability feels like. Target top-3 ≥ 85%.

Realistic expectations: AI4Bharat's IndicXlit, an 11M-parameter transformer, reaches
**58.9% top-1** on Odia native words. A rule + lexicon engine should land at **30–45%
top-1 uniform on held-out**. That is not failure — for an input method the real
experience is top-5-with-learning on frequent words.

---

## Licensing

Project is MIT. Everything shipped must derive from MIT / CC0 / CC-BY sources (fonts: OFL).
Rows marked unknown or unverified below are open items, not exceptions:

| Source | Licence | Use |
|---|---|---|
| `indic-transliteration/common_maps` `oriya.toml` | MIT | Seeds strict-mode table |
| AI4Bharat Aksharantar (`ori`) | CC-BY / CC0 | Lexicon |
| AI4Bharat IndicCorp v2 (`ory_Orya`) | CC0 | Word frequencies |
| Noto Sans Oriya | OFL 1.1 | Bundled font, weights 400 and 700, in `web/src/fonts/` (used by `web/` and `Appv2/`) |
| Praharaj, *Purnnachandra Odia Bhashakosha* (1931–40), via indic-dict | Public domain (text). indic-dict packaging has no licence file. | Classical dictionary layer |
| OdiaNLP `dictionary` `cleaned_pairs.json` | Repo MIT. **Origin of the text unknown.** To be replaced (D-5). | MODERN dictionary layer, `[mt]` rows |
| Unicode CLDR `or.xml` | Unicode License v3 | MODERN dictionary layer, `[cldr]` rows |
| wordfreq, CMUdict | Unverified (see provenance file) | Build time: loanword detection |
| CMU Pronouncing Dictionary (data file) | BSD-2-Clause | Build time: English words and sounds for `loans.tsv` |
| SCOWL `american-english-small` | Permissive / public domain | Build time: common English words for `loans.tsv` |
| IndicCorp v2 Odia `or.txt` (word counts) | CC0 | Build time: attestation for `loans.tsv` (`tools/build-data/count_indiccorp.py`); shipped in the Odia Lens as the OCR word list `core/data/indiccorp-words.tsv` |
| Tesseract (`tesseract.js` 5.1.1, `tesseract.js-core` 5.1.1, `tessdata_fast/ori.traineddata`) | Apache-2.0 | Odia Lens picture mode (V4.2): OCR in the extension; `lens/PROVENANCE.md` |
| pako inflate | MIT | Unpacks the dictionary payloads |

The dictionary sources and their checksums are in `Odia_Sanskrit_Appv2/PROVENANCE.md`.

**Varnam/govarnam and Aksharamukha are AGPL.** Study their architecture; copy no code.
Record every data source, its licence and a checksum in the `PROVENANCE.md` of the folder
that owns the data: `core/data/`, `Appv2/data/` or `Odia_Sanskrit_Appv2/`.

---

## Conventions

- The engine is offline only. **`core/` never makes a network call.** This was a
  decision, not an oversight — see `plan/04-scope.md`. Since 2026-10-04 (D-2) the web app
  may call an opt-in assist layer on Vercel. Each online feature is off until the user
  turns it on. See `plan/05-v3-direction.md` §4.
- The engine API is synchronous. There is no network, so there is no reason for promises.
- Before adding a feature, check `plan/04-scope.md`. Most tempting ideas are already
  listed there as deliberately excluded.
- Prefer editing a TOML weight over adding a special case in code.

---

## Before this repository is ever made public (user reminder, 2026-10-04)

**Status 2026-10-12: the repo was found PUBLIC** (owner had changed it). A security
check that day found no keys, tokens or passwords in any commit (gitleaks and a custom
scan of all history: 8 alarms, all false). The exposure is `tools/build-data/webcorpus/`
(below) plus the owner's email (commit metadata, report button, scraper user-agents) and
Mac username in scraper scripts.

**Later on 2026-10-12 the owner made the repository PRIVATE again** (to use Desh keyboard
data, below). Earlier that day: **the repo stays public and its history stays as it is.**
Reason: public repositories get free GitHub Actions minutes; the private quota was nearly
used up. The owner declined all three remedies (fresh public repo, history rewrite,
private again). Do not ask again; do not add more scraped text to the repository. If the
owner later wants to clean up, the options are in `plan/06-owner-followups.md` S-1.

**Desh keyboard data (2026-10-12).** The owner reports that the company behind the Desh
Odia keyboard agreed to the use of its data (word list, typed-spelling pairs, n-gram model)
to improve this app, if it is credited and the app is shared with them. **Verbal; written
confirmation pending** (`plan/06-owner-followups.md` L-1). **Owner decision 2026-10-12:**
build with the Desh data now, in this private repository, without waiting for the email
("Finish the build order first and then open the PR. The written permission will take
time to arrive."). Desh-derived artifacts (`core/data/typed.tsv`, the converter, the
next-word table) may be committed here, each with its source checksum in
`core/data/PROVENANCE.md`. Merging to `main` deploys them to the public Vercel site: say so
in every PR that carries them; the owner decides when to merge. Never commit the raw Desh
files or Desh's own decoder scripts (they hold addresses from Desh's binary); the build
scripts in `tools/build-data/` are this project's own and take the raw file paths as
arguments. Credit Desh for the data in
the wording the written terms give; Desh is not the author of this app's code, and LICENSE
is not changed. A second reason, beside `webcorpus/`, never to make this repository public
without a fresh history.

The GitHub repo was **private** until then. `tools/build-data/webcorpus/` holds raw scraped
third-party text (archive.org books, literature, news, government pages, X posts)
that the MIT `LICENSE` does not cover.

If the user says they want to make the repo public, remind them of this first.

**Saved for later (owner, 2026-10-04):** the website is public, the repository stays private
for now. When the owner says the project is finished, remind them to plan the public
repository: the steps are in `plan/06-owner-followups.md` (section D) and `PLAN.md` (stage P).
Deleting the files in a new commit is **not enough** — they remain in git history.
Either publish from a fresh repository that never contained them, or rewrite
history and confirm with the user before doing so.

`tools/build-data/webcorpus/raw-archive-books.jsonl` (224 MB) is not in the repo
at all: it exceeds GitHub's per-file limit and exists only on the user's Mac.
