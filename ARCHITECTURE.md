# ARCHITECTURE.md — how the system is built

**Living document.** Claude updates this file in the same commit as any change that moves
a box, a file or a data flow below. Last updated: 2026-10-04 (V1 in progress).

Companion files: `PLAN.md` (what we build, in what order, and how we check it),
`plan/05-v3-direction.md` (research and decisions), `CLAUDE.md` (working rules),
`AGENTS.md` (hand-off for any AI tool).

**Style:** STE-flavored (short sentences, active voice). Terms are in the glossary at the
end.

---

## 1. The system in one picture

```
                         OWNER (native speaker)
                 edits rules, preferences, labels, phrases
                                   │
   ┌───────────────────────────────▼────────────────────────────────┐
   │  SOURCE OF TRUTH (git)                                         │
   │  core/rules/*.toml      letters → Odia, weights                │
   │  core/data/*.tsv        lexicon, unigrams (built), preferences │
   │                         and labels (hand-edited)               │
   │  Appv2/rules, data      Sanskrit profiles (generated + mined)  │
   │  Appv2/src/dictionary   Praharaj + modern glosses (binary)     │
   └───────────────┬────────────────────────────────┬───────────────┘
                   │ imported as text               │ build-time only
   ┌───────────────▼──────────────┐   ┌─────────────▼──────────────┐
   │  core/  THE ENGINE           │   │ tools/build-data (Python)  │
   │  TypeScript, synchronous,    │   │ corpus → lexicon/unigrams  │
   │  no I/O, no network          │   │ tools/eval  (measurement)  │
   └───┬──────────┬──────────┬────┘   └────────────────────────────┘
       │          │          │
   cli/       web/        Appv2/  ──► V1 web app (Vercel, static, offline)
   (dev)    (legacy        (three modes + dictionary + family-safe filter)
             single file)        │
                                 │ only if the user turns a feature on (V3)
                     ┌───────────▼─────────────┐
                     │ ASSIST LAYER (planned)  │  Vercel functions:
                     │ /api/speak /api/listen  │  keys stay on the server
                     │ /api/translate          │  → Sarvam, Google/Claude
                     └─────────────────────────┘

   ime-macos/ (Swift, JavaScriptCore) · lens extension (V4) · Android/iOS (V5): later
```

## 2. Invariants (never break these)

| # | Invariant | Where it is enforced |
|---|---|---|
| I-1 | ଡ଼ and ଢ଼ are stored decomposed (U+0B21/U+0B22 + U+0B3C), never U+0B5C/U+0B5D | `canonical()` in `core/src/normalize.ts` at every boundary; nukta tests in `core/test/` |
| I-2 | `core/` makes no network call and has no I/O | `core/tsconfig.json` has `"types": []`; code review |
| I-3 | The engine API is synchronous | Type signatures; the macOS input method depends on it |
| I-4 | Linguistic behaviour lives in data (TOML/TSV), not in TypeScript | `CLAUDE.md` "Where behaviour lives"; `rules.ts` and `curation.ts` fail loudly on bad data |
| I-5 | Every shipped data source is MIT / CC0 / CC-BY (fonts OFL), with a provenance record | `PROVENANCE.md` per data folder |
| I-6 | Online features are opt-in, one switch each, and name the company that receives the data | V3 design rule (`plan/05` §4) |
| I-7 | No Odia literals in TypeScript source: use `\u` escapes | Review. Warning: the agent tooling can turn `\u` escapes into literal characters; check by code point after writing |

## 3. The engine (`core/`)

One call per keystroke: `transliterateWord(roman, topk)` → ranked candidates.

```
roman ──► tokenize ──► segment (rules lattice, beam) ──┐
              │                                        ├─► rank ──► candidates
              │        lexicon.lookup(key) ────────────┤    (dedupe on canonical,
              │        unigrams.logfreq(word) ─────────┤     family-safe filter,
              │        learnStore.get(key)  ───────────┤     reachability floor,
              │        preferences.get(key) ───────────┘     verbatim token last)
              └── digits: arabic | odia
```

| Module | Job |
|---|---|
| `normalize.ts` | `canonical()`, code-point helpers. The nukta invariant. |
| `tokenize.ts` | Splits input into words, digit runs, punctuation. Non-ASCII passes through. |
| `rules.ts` | Loads and validates `symbols.toml` / `itrans.toml`. Throws on any error. |
| `segment.ts` | Builds spellings from the rules (weighted lattice, beam search, position context). |
| `lexicon.ts`, `unigrams.ts` | Sorted lexicon (roman key → words) and word frequencies. |
| `curation.ts` | Owner data: `preferences.tsv`, `labels.tsv`, `glosses.tsv`. Strict parsers. |
| `bigrams.ts` | Word-pair counts (`bigrams.tsv`), strict loader; the context term. |
| `rank.ts` | Merges evidence and scores (see formula). |
| `learn.ts` | User dictionary (`{roman: {odia: count}}`), memory or localStorage. |
| `strict.ts` | Deterministic ITRANS mode. |
| `index.ts` | `Engine`, `createEngine()`. `node.ts`: `createEngineFromDisk()`. |

**Score** (weights in `[weights]` of `symbols.toml`):

```
score = rule × (ruleScore + lexScore) + freq × logfreq + user × ln(1 + picks) + pref × prefWeight
        1.0                              1.5              2.0                    1.0
      + bigram × ln(1 + count(prev, word)) / ln(1 + total(prev))      (only with a previous word)
        1.2
```

Order of trust when sources agree: user > owner preference > lexicon > rules. One user pick
(2.0 × ln 2 = 1.39) beats a preference (1.0) and the strongest context (1.2); guarded by
`core/test/weights.test.ts`. The previous word comes from `transliterate()` (its own top-1)
or from the caret bar (`transliterateWord(roman, k, { prev })`, the Odia word before the caret).

**Content filter** (`filter: off | family | kids`, default family): `family` drops a word
labelled `offensive` unless the key typed is one of its own keys in `labels.tsv`, the user
taught it, or a preference lists it. The lexicon key alone does NOT exempt (the lexicon
files words under loose casual keys). `kids` drops `offensive` and `coarse` words with no
exemption, and `learn()` refuses them. It runs before the list is cut to `topk`. Strict
mode is not filtered.

## 4. Data

| Data | File | Made by | Edited by hand? |
|---|---|---|---|
| Rules (natural mode) | `core/rules/symbols.toml` | Owner + Claude | Yes, with eval delta |
| Rules (strict ITRANS) | `core/rules/itrans.toml` | From MIT `oriya.toml` | Rarely |
| Sanskrit profiles | `Appv2/rules/*.delta.toml` → `sanskrit.toml`, `unified.toml` | `Appv2/scripts/gen-rules.ts` | Only the `.delta` files |
| Lexicon, unigrams | `core/data/lexicon*.tsv`, `unigrams*.tsv` | `tools/build-data/` (reproducible since PR #1; `j`-keys for ଯ-words since V2.1) | No |
| Word pairs | `core/data/bigrams.tsv` (full, evals), `bigrams-web.tsv` (≤1.5 MB, browser) | `tools/build-data/build_bigrams.py` | No |
| Sanskrit lexicon | `Appv2/data/*.tsv` | `Appv2/scripts/mine_webfreq_sanskrit.py` | No |
| Owner preferences | `core/data/preferences.tsv` | Owner | Yes |
| Word labels | `core/data/labels.tsv` | Owner (empty until curated) | Yes |
| Owner meanings | `core/data/glosses.tsv` (read by the dictionary module, not the engine) | Owner; `seed` rows suggested by agents | Yes |
| Eval overrides | `core/test/golden/everyday-overrides.tsv` | Owner decisions | Yes |
| Colloquial test set | `core/test/golden/colloquial.tsv` | Seed by agent, checked by owner (C-3) | Yes |
| Dictionary | `Appv2/src/dictionary/*.bin` (from `Odia_Sanskrit_Appv2/build/*.b64`) | `Odia_Sanskrit_Appv2/build/*.py` | No |
| Word origin | `Appv2/src/dictionary/origin.bin` (13 KB gzip; one line per `praharaj.bin` key; checksum-guarded, dropped if the keys differ) | `Odia_Sanskrit_Appv2/build/build_origin_map.py` from the Praharaj marks | No |

The dictionary module (`Appv2/src/dictionary/`): `index.ts` fetches the two `.bin` files
(gzip, inflated by a vendored pako, Safari 13 floor), `overlay.ts` adds gloss chips to the
caret bar, the picker and the output, plus a side panel with search. It imports
`canonical()` from core. It skips Latin items (`inline-latin`).

The panel also has an explicit English → Odia direction (12 October 2026).
`english.ts` searches the small bundled `english.tsv` by headword/alias, preserving
separate senses, translations and loan spellings. Each result shows review status
and supports Copy Odia. It applies the same hidden-word callback as Odia lookup,
works independently of the historical binary payloads, and does not feed engine
ranking. See `Appv2/src/dictionary/PROVENANCE.md` for coverage and review limits.

"-web" files are the pruned versions the browser loads (phone memory budget).

## 5. The V1 web app (`Appv2/`)

```
index.html ─ main.ts ─┬─ engine.ts      loads assets per mode (lazy chunks), builds Engine
                      ├─ profiles.ts    ids: everyday | unified | sloka. Shown as: "Everyday"
                      │                 (= unified, default), "Śloka (verse)", and "Classic
                      │                 engine" (= everyday) under Settings → Advanced
                      ├─ preprocess.ts  | → ।  || → ॥  ' → ଽ  (before the engine)
                      ├─ inline.ts      caret popover (desktop) / strip docked on the phone
                      │                 keyboard via visualViewport (1–8 Odia + "Keep" as 9)
                      ├─ readback.ts    the "Reads as" line; tap a word → alternatives
                      ├─ romanize.ts    Odia → Latin for the read-back (copy of the eval one)
                      ├─ badges.ts      "offensive" / "can be rude" badges, from engine.labelsOf()
                      ├─ palette.ts     insert strip for rare marks
                      ├─ dictionary/    gloss chips, side panel, search (lazy, ~6 MB)
                      └─ sw.js          generated service worker (offline)
```

**DOM contracts** (commented at both ends in the code; break one and a gloss silently
disappears, so a Playwright check guards each):

| Selector | Producer | Consumer |
|---|---|---|
| `div.inline-candidates > button.inline-candidate > .inline-text \| .inline-latin` | `inline.ts` (inside `#kb-bar`) | `dictionary/overlay.ts` gloss chips |
| `#picker-list > li > button.candidate > .text` | `main.ts` alternatives sheet | `overlay.ts` |
| `#readback .rb-word[data-odia]` (replaced `#output .word`) | `readback.ts` | `overlay.ts` tooltips |
| `body.kb-docked` | `inline.ts` | CSS (phone strip state) |
| `data-label` on `button.inline-candidate` and `button.candidate` | `inline.ts`, `main.ts` | `overlay.ts` sets `aria-label` = label + ", " + meaning |
| `[aria-controls="dict-panel"]`: `#dict-toggle` (in `index.html`), `#meanings-dock` | `index.html` | `overlay.ts` keeps `aria-expanded` in step; `dictionary/index.ts` exports `setMeaningsOpen` / `meaningsOpen` |

**Layout:** at ≥1100 px `body` is a two-column grid and `#dict-panel` is a sticky meanings
column. The desktop caret popover is a vertical list that opens below or above the caret
(`keepClear()`), so it never covers the "Reads as" line. Help (header button) holds the
first-run card and the cheat sheets.

**Accessibility:** the text box has `aria-controls`, `aria-activedescendant`,
`aria-autocomplete`, `aria-describedby`; options have `tabindex=-1` and are named "word,
meaning"; `#inline-live` is a polite live region; the palette is one `role=toolbar` tab
stop; one global `:focus-visible` ring. Design tokens follow
`plan/design/v1-ux-proposal.md` §4 (70/70 contrast pairs pass; table in commit f2e0ee8).

**Layers (z-index):** strip/popover 20 · meanings toggle 30 · meanings panel 35 · sheets 40 ·
toast 50.

**Loading order** (keeps the first screen fast): page shell → engine assets for the
selected mode → engine → dictionary data on first need.

**Browser storage** (per device, never sent anywhere):

| Key | Holds |
|---|---|
| `odia.userdict` | Learned picks `{roman: {odia: count}}` |
| `odia.pref.profile`, `odia.pref.digits`, `odia.pref.strict` | Settings |
| `odia.pref.familySafe` | "Hide rude words" switch: `'1'`/`'0'`, missing = on |
| `odia.pref.textSize` | `normal` / `large` / `xl` (scales every `--fs-*` by 1 / 1.15 / 1.3; applied by an inline head script before first paint) |
| `odia.pref.seenIntro` | `'1'` once the first-run card is dismissed |
| Cache Storage `odia-appv2-<rev>` | Offline copy of the app; each app touches only its own prefix |

**Builds:**

| Command | Output | Use |
|---|---|---|
| `npx vite build --config Appv2/vite.config.ts` | `Appv2/dist/` (chunks, service worker) | Vercel |
| `SINGLE_FILE=1 … && node Appv2/scripts/make-single-file.mjs` | one `.html` (fonts and dictionary inlined) | AirDrop / offline file |

`web/` stays as the builder of the legacy `docs/odia-app.html`. V1 does not use it.
**From the V1 UI work (2026-10-04) `web/` is frozen**: it gets engine and safety fixes only.
`web/src/inline.ts` and `Appv2/src/inline.ts` were byte-identical until then; they now
diverge on purpose. Do not "re-sync" them. The theme checker reads Appv2's `style.css`
and `dictionary/overlay.css` together.

## 6. Hosting and deployment (V1)

- Vercel serves `Appv2/dist/` as static files. No server code runs in V1.
- `vercel.json` (repo root) sets the install and build commands, the output folder and
  headers (`sw.js` must not be cached long, so updates reach users).
- Every push to a branch gets a Vercel preview address. The owner checks the preview.
  Promote to production = release. Rollback = promote the previous deployment.
- No analytics script. "Nothing sent online" is part of the value proposition.
- **Two editions from one repository** (owner, 2026-10-04): adult (default) and kids. Set
  `APP_EDITION=kids` at build time for the kids app: core filter level `kids` (offensive
  and coarse words never suggested, never learned, never explained by the dictionary), no
  "Hide rude words" switch, name "Odia Phonetic Kids". On Vercel the kids app is a second
  project on the same repository with the environment variable `APP_EDITION=kids`, so it
  has its own address. Single file: `APP_EDITION=kids SINGLE_FILE=1 npx vite build --config
  Appv2/vite.config.ts && APP_EDITION=kids node Appv2/scripts/make-single-file.mjs` writes
  `docs/odia-app-kids.html`. Known gap: about 348 Praharaj entries with offensive markers
  stay searchable in kids until they are labelled (C-1). The verbatim Latin item is not
  filtered (English abuse is outside this filter).
- `vercel.json` today: install `npm ci`; build `npx vite build --config Appv2/vite.config.ts`
  (Appv2 reads `core/src` directly, so no separate engine build); output `Appv2/dist`;
  `sw.js` and `index.html` revalidate on every load; hashed `assets/` cache for a year;
  `nosniff`, `no-referrer`, and a `Permissions-Policy` that blocks camera, microphone and
  location. **V3 and V4 must relax that policy** (`microphone=(self)` for speak-to-write,
  `camera=(self)` for the lens) in the same commit that adds the feature.

## 7. The assist layer (V3, planned)

| Route | Does | Provider (D-3) |
|---|---|---|
| `/api/speak` | Odia text → audio | Sarvam Bulbul (browser voice first where present) |
| `/api/listen` | audio → Odia text | Sarvam Saarika |
| `/api/translate` | sentence → English | Google or Claude Haiku (100-sentence test decides) |

Rules: keys only in Vercel environment variables; `.env*` never committed; rate limit per
visitor; provider spending limit; hard cap US$20/month (D-4); logs never hold user text;
every result passes `canonical()`; cache by canonical text.

## 8. Testing and measurement

| Check | Command | Measures |
|---|---|---|
| Engine unit tests | `npx vitest run --root core` | Correctness, nukta invariant, curation, filter |
| Appv2 unit tests | `npx vitest run --root Appv2` | Preprocessing |
| Fallback page | `node docs/odia-simple.test.mjs` | The 40 KB rules-only page |
| Held-out accuracy | `npm run eval` | Aksharantar test split, in-lexicon vs OOV, vs `baseline.json` |
| Everyday accuracy | `npx tsx tools/eval/everyday.ts` | Real Odia round-trip, careful and casual |
| Coverage | `npx tsx tools/eval/coverage.ts` | Every letter, matra, conjunct reachable |
| Colloquial | `npx tsx tools/eval/colloquial.ts` | Spoken, slang, dialect forms by register (unvalidated seed) |
| Context | `npx tsx tools/eval/context.ts` | Words in their sentence, with and without the previous word; `--weights` sweeps the bigram weight |
| CI | `.github/workflows/ci.yml` | All of the above on every push |
| Appv2 suite | `npx tsx Appv2/eval/run.ts` | Rule drift, theme, no-regression, Sanskrit coverage, śloka |
| Browser (Chromium) | `Appv2/eval/browser/*.mjs` (see its README) | Typing, meanings, Keep English, offline, report button, A-7 timing — against the built app |
| Browser (Safari engine) | `tools/eval/webkit-check.py` | On a Mac only |

Rule: every rule or data change reports the metric delta in its commit.

## 9. Decision log (short)

| Date | Decision | Why |
|---|---|---|
| 2026-07 | TypeScript engine, rules in TOML | JavaScriptCore runs the same engine on macOS/iOS |
| 2026-07 | Offline engine, no network ever | Reliability; no undocumented endpoints |
| 2026-10-04 | Offline core + opt-in online assist layer (D-2) | New features need servers; the engine stays offline |
| 2026-10-04 | Appv2 becomes the V1 web app; dictionary becomes a module | One app, one service worker, one build |
| 2026-10-04 | Owner preferences as data with their own weight, below one user pick | Owner decides ambiguous keys (raja → festival) without code |
| 2026-10-04 | Family-safe filter in `rank()`, on by default (D-0) | Never suggest an abuse as a near miss; always allow typing it |

## 10. Glossary

| Term | Meaning |
|---|---|
| Candidate | One suggested Odia spelling for the typed word |
| Canonical | The one stored form of an Odia string (see I-1) |
| Lexicon | Roman key → Odia word list, from data |
| OOV | Out of vocabulary: not in the lexicon |
| Service worker | Browser code that keeps a copy of the app for offline use |
| Static site | Files only; no server code runs |
| Verbatim token | The typed Latin word, offered as-is (for English words) |
