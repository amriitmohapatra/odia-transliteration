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
| **The run** | — | **Waiting for the owner's key** (below) |

## Why the run waits

The key must be the owner's Console key, so the cost lands on the Console credits. This
session cannot store a key for Anthropic's own host as a network secret (refused by the
platform), and the session's own `ANTHROPIC_BASE_URL` belongs to Claude Code itself (it
would bill the owner's Claude plan, not the Console). So the owner adds
`ANTHROPIC_API_KEY` as an environment variable on the **odia-transliteration** cloud
environment (title bar → environment menu → Edit), and a new session on that
environment runs the steps. The script pins `https://api.anthropic.com` and reads only
`ANTHROPIC_API_KEY`.

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
