# CLAUDE.md — Odia Transliteration

English → Odia (ଓଡ଼ିଆ) phonetic transliteration for macOS and Windows. Type
`kemiti achha`, get `କେମିତି ଅଛ`, into whatever app is in front of you.

**Read `plan/00-overview.md` before making architectural decisions.** The plan folder is
the source of truth for scope, staging and rationale.

**Current stage**: pre-Stage-A. Nothing built yet. See `plan/02-stages.md`.

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

One TypeScript engine, four consumers.

```
core/  ──────────────────────────────┐
  the engine. pure TS, no I/O.       │
                                     │
  ├─ cli/         node               │  direct import
  ├─ web/         browser            │  direct import
  ├─ app/         Tauri desktop      │  direct import
  └─ ime-macos/   Swift input method │  JavaScriptCore
                                     ┘
```

`ime-macos` loads the same `core/dist/engine.js` through `JavaScriptCore.framework`, a
public macOS system framework. No FFI, no WebAssembly, no Rust in the engine path. This
is why the core is TypeScript.

Rust appears in exactly one place: `app/src-tauri/src/` — roughly 150 lines of clipboard
and hotkey glue. Do not grow it.

---

## Where behaviour lives

**Linguistic rules go in TOML, never in TypeScript.**

| Change | File |
|---|---|
| A letter maps to the wrong Odia character | `core/rules/symbols.toml` |
| Candidate ranking feels wrong | `[weights]` in `core/rules/symbols.toml` |
| Strict ITRANS/ISO-15919 mapping | `core/rules/itrans.toml` |
| Segmentation or orthography assembly logic | `core/src/segment.ts` (rare) |

`core/src/rules.ts` validates rule files on load and **fails loudly** on a typo or a
non-canonical Odia string. Do not soften that into a warning.

After any rule change, run `npm run eval` and compare against
`tools/eval/baseline.json`. Never commit a rule change without the metric delta.

---

## Commands

```bash
npm install                            # workspaces: core, cli, web, app

npm test                               # all tests
npm test -w core                       # engine only (includes nukta vectors)

npm run -w cli start -- "kemiti achha"           # transliterate
npm run -w cli start -- "namaskaara" --strict    # deterministic ITRANS mode
npm run -w cli start -- "odisha" --codepoints    # verify nukta encoding

npm run eval                           # metrics + delta vs baseline
npm run -w web dev                     # web page
npm run -w app tauri dev               # desktop composer

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

Project is MIT. Everything shipped derives from MIT / CC0 / CC-BY sources:

| Source | Licence | Use |
|---|---|---|
| `indic-transliteration/common_maps` `oriya.toml` | MIT | Seeds strict-mode table |
| AI4Bharat Aksharantar (`ori`) | CC-BY / CC0 | Lexicon |
| AI4Bharat IndicCorp v2 (`ory_Orya`) | CC0 | Word frequencies |
| Noto Sans Oriya | OFL | Bundled font |

**Varnam/govarnam and Aksharamukha are AGPL.** Study their architecture; copy no code.
Record every data source, its licence and a checksum in `core/data/PROVENANCE.md`.

---

## Conventions

- Offline only. **No network call from shipped code, ever.** This was a decision, not an
  oversight — see `plan/04-scope.md`.
- The engine API is synchronous. There is no network, so there is no reason for promises.
- Before adding a feature, check `plan/04-scope.md`. Most tempting ideas are already
  listed there as deliberately excluded.
- Prefer editing a TOML weight over adding a special case in code.

---

## Before this repository is ever made public (user reminder, 2026-10-04)

The GitHub repo is **private**. `tools/build-data/webcorpus/` holds raw scraped
third-party text (archive.org books, literature, news, government pages, X posts)
that the MIT `LICENSE` does not cover.

If the user says they want to make the repo public, remind them of this first.
Deleting the files in a new commit is **not enough** — they remain in git history.
Either publish from a fresh repository that never contained them, or rewrite
history and confirm with the user before doing so.

`tools/build-data/webcorpus/raw-archive-books.jsonl` (224 MB) is not in the repo
at all: it exceeds GitHub's per-file limit and exists only on the user's Mac.
