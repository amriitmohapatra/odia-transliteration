# 01 — Engine design

## The Odia Unicode trap — read this before writing any code

`ଡ଼` and `ଢ଼` **must be stored decomposed**: base consonant + nukta U+0B3C.

```
ଡ଼  =  U+0B21 (ଡ)  +  U+0B3C (nukta)      NOT U+0B5C
ଢ଼  =  U+0B22 (ଢ)  +  U+0B3C (nukta)      NOT U+0B5D
```

The precomposed code points U+0B5C and U+0B5D **decompose under NFC normalization**.
Vowel signs behave in the opposite direction — NFC *composes* them. `ୟ` (U+0B5F) is
atomic and safe.

A lexicon keyed on precomposed nukta forms will silently fail to match after any NFC
pass. This is not an edge case: Odia's own name contains one of these characters
(`ଓଡ଼ିଶା`), as does the word for the language itself (`ଓଡ଼ିଆ`).

**The invariant**: canonicalize at every boundary — data-build output, rule-file load,
lexicon keys, engine output, `learn()` input. Write the test vectors before the engine.

Required vectors in `core/test/normalize.test.ts`:

- `canonical("ଡ଼") === "ଡ଼"` and the same for U+0B5D
- `transliterate("odia")` top candidate contains `ଡ଼`, never `ଡ଼`
- `ୟ` (U+0B5F) passes through untouched
- idempotence: `canonical(canonical(x)) === canonical(x)` for every golden output
- vowel-sign composition: no decomposed matra sequences survive canonicalization

## Public API

Small, stable, and **entirely synchronous** — there is no network, so there is no
reason for promises. The input method needs a synchronous per-keystroke path.

```ts
interface Candidate {
  text: string;
  score: number;
  source: "user" | "lexicon" | "rule" | "verbatim";
}
interface WordResult { roman: string; candidates: Candidate[] }
interface Result     { words: WordResult[]; text: string }   // text = top-1 join

class Engine {
  constructor(cfg: {
    rules: Rules;
    lexicon: Lexicon;
    unigrams: Unigrams;
    learnStore?: LearnStore;
    digits?: "arabic" | "odia";
  });

  transliterate(input: string, opts?): Result;
  transliterateWord(roman: string, topk?: number): Candidate[];  // per-keystroke path
  learn(roman: string, chosen: string): void;
  strict(input: string, scheme: "itrans" | "iso15919"): string;
}
```

**Mixed English handling**: every candidate list ends with the verbatim Latin token
(`source: "verbatim"`). No fragile language-detection heuristic — you pick the last
candidate for "PCR" or "Bayesian", and `learn()` remembers it next time.

## Module breakdown

| Module | Responsibility |
|---|---|
| `normalize.ts` | Canonical Unicode form; the nukta discipline. Every other module calls into this. |
| `tokenize.ts` | Split input into words, punctuation, digits and passthrough runs. |
| `rules.ts` | Load and **validate** the TOML rule files. |
| `segment.ts` | Beam search: roman token → lattice of Odia orthography candidates. |
| `lexicon.ts` | Sorted-array lexicon; exact match and prefix-range scan. |
| `rank.ts` | Merge scores from rules, corpus frequency and user history. |
| `strict.ts` | Deterministic ITRANS / ISO-15919 mode. No candidates, no ambiguity. |
| `learn.ts` | `LearnStore` interface; JSON-file and localStorage implementations. |
| `index.ts` | Assembles the above into the `Engine` class. |

## `symbols.toml` — the file you actually tune

A weighted many-to-many map, typed so the segmenter knows how to assemble orthography.
**All linguistic behaviour lives here, never in TypeScript.**

```toml
[[consonant]]
roman = "s"
odia  = [ { text = "ସ", w = 1.0 }, { text = "ଶ", w = 0.5 }, { text = "ଷ", w = 0.4 } ]

[[consonant]]
roman = "rh"
odia  = [ { text = "ଢ଼", w = 1.0 } ]      # nukta form — stored DECOMPOSED

[[vowel]]
roman = "aa"
independent = "ଆ"        # word-initial, or after another vowel
matra       = "ା"        # after a consonant
w = 1.0

[[sign]]
roman = "m"
odia  = [ { text = "ଂ", w = 0.4, context = "before_consonant" } ]

[digits]
odia = ["୦","୧","୨","୩","୪","୫","୬","୭","୮","୯"]

[weights]                # the ranking mix — tunable with no code change
rule = 1.0
freq = 0.6
user = 2.0
```

`rules.ts` validates on load: every Odia string must already equal its canonical form,
and unknown entry types are rejected. A typo must fail loudly at startup rather than
silently degrading transliteration quality.

`itrans.toml` is a separate, unambiguous, case-sensitive table for strict mode, seeded
from the MIT-licensed `oriya.toml`.

## Segmenter — beam search over the roman token

1. At each position, match rule keys **longest-first** (longest keys are ~4 characters:
   `ksh`, `chh`, `jny`).
2. Ambiguous keys fan out into multiple lattice edges (`d` → ଦ and ଡ).
3. Assemble orthography during expansion:
   - consonant + vowel → **matra** form
   - consonant + consonant → **virama** conjunct (`୍`)
   - word-initial or post-vowel vowel → **independent** form
   - trailing `a` after a consonant → inherent vowel, emit no matra
   - **word-final bare consonant emits two edges** — inherent (କମଲ) and halanta (କମଲ୍)
     — and lets the lexicon decide which is real
   - nasal `n`/`m` before a consonant adds a low-weight **anusvara** edge, so `sankhya`
     can reach ସଂଖ୍ୟା
4. Beam width 8–16. Path score is the product of edge weights.

Digits map according to the `digits` option. Punctuation and whitespace pass through
`tokenize.ts` untouched.

## Lexicon and ranking

`lexicon.tsv` rows are `romanKey \t odiaWord \t weight`, sorted by key, loaded into two
parallel arrays. Binary search gives exact match **and** prefix-range scan for
as-you-type candidates in about twenty lines.

**No FST library.** At this scale it would be over-engineering.

Build-time **fuzzy key expansion** generates alias rows pointing at the same word
(collapse doubled letters, `aa`→`a`, `ee`→`i`, `oo`→`u`, `v`↔`w`), so the runtime stays
a dumb lookup with no edit-distance code in the hot path.

Final score per candidate:

```
score = weights.rule · ruleScore
      + weights.freq · logfreq(odiaWord)
      + weights.user · log(1 + userCount)
```

Deduplicate on canonical form and **merge sources** — a word found by both the rules
and the lexicon should outrank one found by either alone.

## User learning

A JSON file, not SQLite:

```json
{ "kemiti": { "କେମିତି": 12 }, "achha": { "ଅଛ": 7, "ଆଛା": 1 } }
```

Stored at `~/Library/Application Support/OdiaTranslit/userdict.json` on macOS, the
platform equivalent on Windows, and localStorage on the web.

A personal dictionary holds thousands of entries at most. Revisit this only if the file
exceeds about 1 MB. The desktop app (Stage C) and the input method (Stage D) share the
same file, so a word learned in one is known to the other.

## Data pipeline

`tools/build-data/`, Python 3.14 with `uv`, dependency: `huggingface_hub` only. No
`datasets` package — it pulls in far too much for a streaming word-count.

1. `download.py` — fetch Aksharantar `ori` (9.5 MB) and stream IndicCorpV2 `ory_Orya`.
2. `frequencies.py` — streaming tokenize, canonicalize, count; keep count ≥ 5, giving
   roughly 100–200K unigrams.
3. `build_lexicon.py` — canonicalize both sides of every pair; drop garbage rows (Latin
   characters on the Odia side, empty entries, absurd length ratios); aggregate; join
   corpus frequency; expand fuzzy keys; emit the sorted TSV, the pruned web variant, and
   `PROVENANCE.md` with sources, licences and checksums.

   **Nukta consolidation — do not skip this.** Aksharantar drops the nukta about **63% of
   the time**, writing both ଓଡ଼ିଆ and ଓଡିଆ for the same word (see `plan/03-spikes.md`, S2).
   When two Odia words under the same `romanKey` differ *only* by the presence of U+0B3C,
   **merge their counts and keep the nukta-bearing form.** This is safe because the same
   analysis found effectively zero genuine minimal pairs — 96.5% of nukta-differing pairs
   share an identical roman spelling, and no pair has both members attested at ≥5 rows.

   Skip it and the two spellings tie in the ranking, so the wrong one surfaces roughly half
   the time on the most common words in the language. This was observed, not theorised:
   `odia` returned ଓଡ଼ିଆ and ଓଡିଆ at an identical score of 1.96.
4. `make_goldens.py` — emit `heldout.tsv` **from the Aksharantar test split only**, so
   held-out words are excluded from the lexicon by construction rather than by
   discipline.

Expected artifact sizes: full lexicon ~8–12 MB TSV (~3–4 MB gzipped), unigrams ~1.5 MB,
web-pruned lexicon (top ~30K words by frequency) ~1–1.5 MB. Artifacts are committed —
they are small enough, and the pipeline makes them reproducible.
