# AGENTS.md — context for any AI tool working on this repo

You have no memory of how this project got here. This file is the handoff. Read it
before changing anything; several of the decisions below look arbitrary and are not.

`CLAUDE.md` holds Claude-specific operating instructions. `plan/` holds the staged plan
and the spike results. **This file is the shortest path to being useful.**

> **Ask before large changes.** The owner (a PhD researcher, not a systems programmer,
> and a native Odia speaker) makes the calls on scope and on anything linguistic. When
> something here looks wrong, raise it rather than silently "fixing" it — most of the
> odd-looking choices were forced by measurement.

---

## 1. What this is

English → Odia (ଓଡ଼ିଆ) phonetic transliteration. Type `kemiti achha`, get `କେମିତି ଅଛ`.

Current scope is **macOS only** (the owner narrowed it; iOS is deferred, not cancelled).
Two shipped artefacts:

| Artefact | What it is |
|---|---|
| `docs/odia-app.html` | **The app.** One self-contained ~6 MB file. Double-click. Full engine + 120k-entry lexicon inlined. Rebuild with `npm run build:app`. |
| `ime-macos/` | A macOS input method (InputMethodKit, Swift). Registers and starts, but still contains a **five-word stub table**, not the real engine. |

`docs/odia-simple.html` is a separate 40 KB rules-only fallback with no vocabulary. It is
NOT the app; it exists as a lightweight backup and is guarded by its own test.

---

## 2. The invariant you must not break

`ଡ଼` and `ଢ଼` are stored **decomposed** — base consonant + nukta U+0B3C:

```
ଡ଼  =  U+0B21 + U+0B3C      never U+0B5C
ଢ଼  =  U+0B22 + U+0B3C      never U+0B5D
```

The precomposed code points **decompose under NFC**; vowel signs go the other way (NFC
*composes* them). `ୟ` (U+0B5F) is atomic and safe.

A lexicon keyed on precomposed forms silently stops matching after any NFC pass, and
Odia's own name (`ଓଡ଼ିଶା`) contains one — so this breaks the commonest words, not edge
cases. **Verify by code point, never by eye**: `ଡ଼` and `ଡ଼` render identically.

```bash
npx tsx cli/src/main.ts "odisha" --codepoints    # expect U+0B21 U+0B3C
```

Call `canonical()` from `core/src/normalize.ts` at every boundary.

---

## 3. Architecture

One TypeScript engine, several consumers. **TypeScript, not Rust**, deliberately: macOS
ships `JavaScriptCore` as a public framework, so a Swift input method can run the same
`engine.js` with no FFI and no toolchain. Verified working.

```
core/        the engine — pure TS, no I/O
  src/       normalize, tokenize, rules, segment, lexicon, unigrams, rank, strict, learn
  rules/     symbols.toml (fuzzy, weighted)  ·  itrans.toml (strict)
  data/      generated artefacts, committed
cli/         dev harness
web/         the PWA; `SINGLE_FILE=1` build collapses into docs/odia-app.html
ime-macos/   Swift input method (no Xcode project — build.sh + swiftc)
tools/
  build-data/  Python 3 stdlib only. Corpus → lexicon/unigram artefacts.
  eval/        everyday.ts · coverage.ts · webkit-check.py · run_eval.ts
```

**Linguistic rules live in `core/rules/symbols.toml`, never in TypeScript.** If you find
yourself adding a special case in code, you are probably in the wrong file.

---

## 4. Facts that were expensive to learn

### Aksharantar is not a dictionary of Odia
The lexicon originally came from AI4Bharat Aksharantar. Measured: **2 of 25 common
everyday words present**, mean entry 8.7 characters, 3.2% of entries ≤4 characters, 95.7%
IndicCorp-mined names and compounds. It knew ଭାଗ୍ୟଶ୍ରୀ but not ଘର.

It is still useful for what it is — proper nouns, place names, long compounds. Do not
delete it; do not rely on it for ordinary vocabulary.

### The vocabulary that works came from a web sweep
`core/data/webfreq.tsv` — **18.4M tokens, 527k word types** from Odia news, Wikipedia,
literature, archive books and government pages. All 25 everyday words present.
`tools/build-data/build_common_lexicon.py` romanizes the frequent ones into lexicon rows.

That single change took everyday casual top-3 from **67% → 96%**.

### Some distinctions are lexical, not phonetic
ଜନ୍ମ and ସମ୍ବାଦ are both "n" before a labial; one takes ନ, the other ମ. **No rule can
separate them.** Same for the nukta: real Odia publishing writes it on native words
almost always (ବଡ଼ ~97%) but omits it on English loans (ଭିଡିଓ 992 vs ଭିଡ଼ିଓ 138). Whether
a word takes the nukta is a property of the word. Never generalise it as a rule.

### The corpus drops the nukta ~63% of the time (Aksharantar) but only ~12.9% (real web)
Aksharantar writes both ଓଡ଼ିଆ and ଓଡିଆ for the same word, which made the two tie in
ranking. `build_lexicon` must consolidate nukta variants, keeping the nukta-bearing form.
Safe because there are effectively **zero genuine minimal pairs** (96.5% of nukta-differing
pairs share an identical roman spelling).

### Digraph keys that swallow the next letter
`ny`, `gy` and `ng` were keys for ଞ, ଜ୍ଞ and ଙ. Longest-match-first meant they ate the
following consonant: `dhanyabaada` → ଧଞବାଦ, `bhaagya` → ଭଜ୍ଞ, `ganga` → ଗଙ (losing a whole
ଗ). **All three removed.** ଜ୍ଞ is `jny`; ଙ arrives through nasal assimilation.

### ଯ vs ୟ is the opposite of the Hindi intuition
Odia ଯ is pronounced like *ja*; ୟ is the true *ya*. Convention: ଯ word-initially (ଯୋଗ),
ୟ everywhere else (ରାଜ୍ୟ, ନ୍ୟାୟ, ଧନ୍ୟବାଦ).

### `ri`/`ru` are not just the vocalic vowel
They are ର + a vowel far more often. `କରି` alone occurs 77,908 times. Reading them only as
ୃ turned `kari` into କଋ and `guru` into ଗୁଋ. Both readings are generated; the vocalic one
is positional (only directly after a consonant).

---

## 5. Things that are counter-intuitive on purpose

- **`rr` → ଡ଼.** ଢ଼ had `rh`, but ଡ଼ had no unambiguous key, so it was unreachable
  word-initially, before a complex matra, or in a conjunct — 47 conjuncts were unreachable.
- **`_` is an explicit halant** and is a *word* character in the tokenizer. `tha` is
  legitimately ଥ, so ଟ୍ହ can only be typed `t_ha`. 27 of 1,521 conjuncts need it.
- **`RULE_FLOOR` in `rank.ts`** guarantees a few rule spellings survive, or the lexicon
  crowds out bare letters entirely (`ka` stopped offering କ). It is *scaled* to list
  length — reserving 3 of 5 slots crashed everyday top-3 from 96% to 78%.
- **The rescue drops the LOWEST-SCORING entries.** An earlier version kept every
  rule-bearing candidate and evicted lexicon-only ones, which threw away the correct
  answer: `jagannatha` lost ଜଗନ୍ନାଥ and led with ଜଗଣଥ. Do not reintroduce that.
- **The candidate list always ends with the verbatim Latin token.** That is how mixed
  English works — you pick it for "PCR", and `learn()` remembers. No language detection.

---

## 6. How to verify a change

Run all of these. They measure different things.

```bash
npx vitest run --root core          # 128 unit tests, incl. the nukta vectors
node docs/odia-simple.test.mjs      # 58 checks on the standalone fallback
npx tsx tools/eval/everyday.ts      # accuracy on real connected Odia
npx tsx tools/eval/coverage.ts      # every letter/matra/conjunct reachable?
python3 tools/eval/webkit-check.py  # the app in WebKit, the engine Safari runs
npm run eval                        # held-out set vs committed baseline
```

`tools/eval/everyday.ts` round-trips real Odia: it reverse-transliterates each word and
feeds the roman back. Deriving the roman rather than hand-picking it keeps it honest.

**Current numbers** (change them only with a measured reason):

| | top-1 | top-3 |
|---|---|---|
| careful (`bhaagya`) | 89.1% | 97.8% |
| casual (`bhagya`) | 80.4% | 95.7% |

For scale: AI4Bharat's IndicXlit, an 11M-parameter transformer, gets 58.9% top-1 on Odia.

---

## 7. Known open problems

1. **Coverage vs correctness conflict.** Fixing the `jagannatha` bug cost orthographic
   reachability (pass B 92.3%, E 80.0%). Protecting the best answer and guaranteeing every
   rare letter appears in a 9-item list compete for the same slots. Needs a dedicated
   letter-insert path rather than borrowing from the candidate list. **Unresolved.**
2. **`ime-macos/` is a stub.** It registers and its IMKServer starts, but it holds a
   five-word table. Real work: `EngineBridge.swift` over JavaScriptCore + `IMKCandidates`.
3. **Not tested on iOS hardware.** No Xcode on this machine, so no Simulator either.
4. **The scheme is unreviewed by a native speaker.** Every mapping in
   `docs/romanization-reference.tex` is a proposal.
5. **`mu` gives ମୁ, not ମୁଁ**, despite ମୁଁ being 12× more frequent — the rule bonus
   outweighs frequency. Rank 2, so one keystroke. Raising the freq weight fixes it but
   costs 2pp elsewhere.

---

## 8. Licensing

Project is MIT. Everything shipped derives from MIT / CC0 / CC-BY sources.
**Varnam/govarnam and Aksharamukha are AGPL — study the architecture, copy no code.**
Record sources and checksums in `core/data/PROVENANCE.md`.

The engine makes **no network call, ever**. Corpus building is a build-time activity only.
