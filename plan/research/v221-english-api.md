# V2.21 — English → Odia words with the Claude API

Owner, 2026-11-09: "expand the english to odia word translation powered by the claude
console … sometimes the word may have a phrasal explanation. You will need to find those
words and add them to the dictionary so that they show up when I use =english_word …
Cast the net of english to odia words as wide as possible."

## What is built (2026-11-09)

| Part | File | State |
|---|---|---|
| Word list (~48,500: wordfreq top 50,000 English words + 584 multiword expressions, minus the 2,275 already answered) | `tools/build-data/english_wordlist.py`, `tools/build-data/english-phrases.txt` | Done; the list is rebuilt, not committed (wordfreq's data licence is unverified) |
| Generator: prompt, JSON schema, pilot, Batch API submit/collect, validation, gzip | `tools/build-data/english_api.ts` | Done; type-checked; `build` tested on hand-made output |
| App: lazily loaded layer (senses, phrases, forms), dictionary labels, `=word` | `Appv2/src/dictionary/english-index.ts`, `english-data.ts`, `overlay.ts`, `main.ts` | Done; ships with an empty `english-api.tsv` until the run |
| Tests | `Appv2/test/english-index.test.ts` (14), `Appv2/eval/browser/english-typing-check.mjs` (26, with a stand-in list) | Pass |
| **The run** | — | **Done 2026-11-09** (results below) |

## Why the run waited (until 2026-11-09)

The key must be the owner's Console key, so the cost lands on the Console credits. This
session cannot store a key for Anthropic's own host as a network secret (refused by the
platform), and the session's own `ANTHROPIC_BASE_URL` belongs to Claude Code itself (it
would bill the owner's Claude plan, not the Console). So the owner adds
`ODIA_CLAUDE_API_KEY` as an environment variable on the **odia-transliteration** cloud
environment (title bar → environment menu → Edit), and a new session on that
environment runs the steps. The script pins `https://api.anthropic.com` and reads only
`ODIA_CLAUDE_API_KEY`. (2026-11-09: the environment settings refuse to pass
`ANTHROPIC_API_KEY`, a name reserved for the session's own login, so the script reads
this name instead.)

## The run (a new session, from the repository root)

```bash
uv run --with wordfreq==3.1.1 python tools/build-data/english_wordlist.py /tmp/en-wide.txt 50000
npx tsx tools/build-data/english_api.ts pilot /tmp/en-wide.txt /tmp/pilot.jsonl 0 200 low
npx tsx tools/build-data/english_api.ts build /tmp/pilot.tsv /tmp/pilot-report.tsv /tmp/pilot.jsonl
```

Read the pilot by hand (`/tmp/pilot.tsv`: right word? phrases natural? senses useful?) and
the cost line it prints. Then, if the cost is acceptable to the owner:

```bash
npx tsx tools/build-data/english_api.ts submit /tmp/en-wide.txt /tmp/state.json low
npx tsx tools/build-data/english_api.ts collect /tmp/state.json /tmp/raw.jsonl   # polls each minute
npx tsx tools/build-data/english_api.ts build Appv2/src/dictionary/english-api.tsv /tmp/report.tsv /tmp/raw.jsonl
npx tsx tools/eval/english-coverage.ts <english words> # coverage before/after
```

Then: record the counts, cost and checksum in `Appv2/src/dictionary/PROVENANCE.md`, a
60-row owner sample in `plan/review/`, the numbers in `PLAN.md` V2.21, and run
`npm test` and the browser checks.

## Design notes

- Model `claude-opus-5-5` (the claude-api skill's default), effort `low`, 40 words per
  request, structured output (JSON schema), the system prompt cached. Batch API: half
  price; server-side fallbacks are not accepted there, so a refused chunk is retried.
- Answer kinds: `word`, `phrase` (Odia says it with a phrase: babysit → ପିଲା ଜଗିବା),
  `form` (ran → run: no Odia, the app looks up the base word) and `skip` (person
  names, brands, swear words, slurs).
- Every Odia option is checked: canonical form (nukta decomposed, joiners removed), Odia
  script only, and every word of it known to the app (IndicCorp top 100,000, the
  lexicon, the meanings, the hand-written list, or corpus log-frequency ≥ 0.6, checked by
  sample: at 0.4 garbage appears). Unknown words are dropped and listed in the report.
- Cost estimate before the pilot: about US$25–35 for the whole list as a batch
  (≈1,200 requests; output dominates). The pilot prints the measured figure.
- Google AI Mode / Gemini was not used: automated Google queries are against Google's
  terms, and copying Gemini output into this MIT dataset leaves its licence unclear.

## Results (2026-11-09)

Session with `ODIA_CLAUDE_API_KEY` set (A-13). Word list: 48,544 words (`english_wordlist.py`,
wordfreq 3.1.1, top 50,000).

**Pilot** (effort `low`, 200 of the most frequent words and 200 from rank 25,000): no errors,
whole list as a batch estimated US$23–27. Read by hand: right words, natural phrases
(`curate` → ବାଛି ସଜାଇବା, `jailbreak` → ଜେଲରୁ ପଳାଇବା), sensible forms and skips. It found
three faults in `build`, fixed before the batch:

- The output was sorted by whole line, so a word's senses came out alphabetical: `lot`
  led with "fate" (ଭାଗ୍ୟ), `major` with "army rank", `period` with "menstruation". Now
  sorted by the English word only; senses keep the model's order (most common first),
  which the app relies on.
- Attestation also accepts Praharaj headwords (by the dictionary's folded key), words Desh
  users chose at least 3 times (`typed.tsv`) and the attested loan spellings
  (`loans.tsv`). ତିତିର (pheasant) was dropped before.
- The old letter ଵ (U+0B35) is written ବ, as modern Odia does (ଜୀଵନ୍ତ → ଜୀବନ୍ତ).
- Prompt: the article "the" is skipped (the pilot gave ସେହି, "that").

**Batch** `msgbatch_01GdYWU6eNVczR7TsH3DJkG4`: 1,214 requests, all succeeded in about 7
minutes, **US$23.23**.

| | count |
|---|---|
| English words with Odia words | 17,120 |
| English words with Odia phrases | 3,744 |
| of these, with two or three senses | 879 |
| forms sent to their base word | 12,096 |
| skipped (names, brands, abbreviations, swear words, misspellings) | 12,693 |
| every option dropped by the check | 2,889 |
| Odia options kept / dropped as unknown / not Odia script | 36,034 / 5,712 / 25 |

`english-api.tsv` 1,505,071 bytes; `english-api.bin` (gzip) 366,702 bytes, loaded after
start-up.

**Coverage** (`tools/eval/english-coverage.ts`, wordfreq's top 50,000 English words):

| top | before | V2.20 | V2.21 |
|---|---|---|---|
| 1,000 | 4.7% | 96.1% | 96.4% |
| 3,000 | 2.3% | 93.7% | 95.8% |
| 10,000 | 0.7% | 66.3% | **90.0%** |
| 30,000 | 0.3% | 35.6% | 78.0% |
| 50,000 | 0.2% | 24.4% | 68.5% |

The words still missing at the top are letters, people's names and swear words, on purpose.

**Quality.** No Odia option carries an `offensive` label (and the app's hide filter applies
to this layer). Claude read 130 random rows: none clearly wrong, two or three weak
(`peripheral` → ବାହ୍ୟ only). Owner sample: `plan/review/english-api-sample.tsv` (C-17).
Browser: `lot` offers ବହୁତ then ପ୍ଲଟ (the second sense), `babysit` the phrase ପିଲା ଜଗିବା,
each labelled "Generated with Claude (AI) … not yet checked".

**What the check drops.** Mostly an uncommon spelling of a real word (କେଳେଙ୍କାରି where the
corpus prints କେଳେଙ୍କାରୀ; ବଷ୍ଟନ for ବୋଷ୍ଟନ; ଯିହୁଦୀ for ୟିହୁଦୀ), invented transliterations
(ଜିଞ୍ଜରବ୍ରେଡ, ପ୍ରିଅର୍ଡର) and foreign place names the corpus lacks. Lowering the corpus cut-off
would rescue under 800 options and let misspellings in, so it stays at 0.6.

## Open: the retry (A-14)

`english_api.ts retry` asks again for the 2,889 words that lost every option, showing the
model the spellings that were not found, and asks for the spelling Odia newspapers print or
another common word. `build` then takes both raw files (a later file fills only words still
without rows). About 73 requests, about US$1.50 as a batch. It could not run on 2026-11-09:
the Console workspace had reached its spend limit ("You will regain access on 2026-12-01").

```bash
uv run --with wordfreq==3.1.1 python tools/build-data/english_wordlist.py /tmp/en-wide.txt 50000   # only if the raw output is gone
npx tsx tools/build-data/english_api.ts build /tmp/check.tsv /tmp/report.tsv tools/build-data/english-api-raw.jsonl.gz
npx tsx tools/build-data/english_api.ts retry /tmp/report.tsv Appv2/src/dictionary/english-api.tsv /tmp/state2.json low
npx tsx tools/build-data/english_api.ts collect /tmp/state2.json /tmp/raw2.jsonl
npx tsx tools/build-data/english_api.ts build Appv2/src/dictionary/english-api.tsv /tmp/report2.tsv tools/build-data/english-api-raw.jsonl.gz /tmp/raw2.jsonl
```

The first run's raw output is kept, gzipped, in `tools/build-data/english-api-raw.jsonl.gz`
(913 KB; the model's answers with token usage; MIT, as the TSV), so the first command makes
`report.tsv` again without a new batch.
