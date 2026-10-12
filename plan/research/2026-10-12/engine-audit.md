# Engine and dictionary audit — 12 October 2026

These are measured baseline results from the repository before the English dictionary feature, not claims of native-language authority. Proposed spellings and contemporary senses require the owner's validation, especially spoken ଚ versus standard written ଛ, address terms, and regional forms. The audit contains 45 selected word/input probes and 9 sentence probes. Probe selection is independent of the existing golden tests (some familiar words overlap). No repository files were edited by this audit.

## Reproduction and limits

Run `npx tsx plan/research/2026-10-12/engine-probe.ts`. It builds the default Appv2 `unified` profile using precisely the shipped `-web` lexicon, unigram, Sanskrit, bigram assets and current owner preferences/labels; no learned picks. The browser builder is `Appv2/src/engine.ts:60` and `:183`; default profile is `Appv2/src/profiles.ts:112`. The API is called with `topk=9`, matching `Appv2/src/main.ts:206`, and may return nine Odia candidates plus Keep. The UI then displays at most eight Odia candidates plus Keep (`Appv2/src/inline.ts:295`); the recorded `rank9` is the engine result, not a claim that its ninth Odia candidate is visible. Top100 is a diagnostic and is not the visible list. Probes here run the engine API, not the browser event/commit UI. Browser observations are recorded separately in browser-audit.json.

Raw evidence: `engine-probe-summary.json` (selected baseline candidates and proposed targets), `full-vs-web.json` (comparison), `data-counts.json`. The probe script can regenerate full scores and definitions into an output directory. Results are reproducible snapshots, not a representative accuracy percentage. Targets were intentionally chosen to stress known and suspected gaps; do not average them into a quality score.

## Central diagnosis

“Dictionary incomplete” actually covers five different problems:

1. **Roman-to-Odia candidate generation:** English orthography is not handled like phonetic Roman Odia. Known Odia loanwords are inaccessible under the English spelling.
2. **Ranking of valid alternatives:** `mu`, `sanga`, `dada`, `karideba` have useful spellings available, but another candidate wins.
3. **Register and spelling variation:** `jauchi` gives spoken ଯାଉଚି; standard ଯାଉଛି requires `jauchhi`. This needs explicit product policy rather than declaring one dialect wrong.
4. **Meaning coverage and sense selection:** generation can be correct while the English meaning is missing, obsolete or unrelated to the current sentence.
5. **Evaluation data does not match shipped data:** full-data test success can hide pruned-web omissions.

Adding more text or swapping in an LLM does not directly solve all five.

## Concrete word results

Rank zero below means absent from the requested output, not globally impossible. Proposed targets are for owner review.

| Input | Actual top1 | Proposed target / diagnostic | Classification |
|---|---|---|---|
| `mu` | ମୁ | ମୁଁ rank2; `mun` gives it rank1 | Ranking, not missing vocabulary |
| `muu` | ମୂ | ମୁଁ absent top9/top100 | Roman variant unavailable; not a safe universal vowel rule |
| `kana`, `kan` | କଣ | Already rank1; exact old gloss first sense is “A particle” | Meaning/sense issue |
| `khaiba` | ଖାଇବା | Already rank1 | Works |
| `khai` | ଖାଇ | Already rank1; exact old glossary leads with moat/ditch noun | Correct spelling; wrong sense in an eating sentence |
| `aasuchu`, `asuchu` | ଆସୁଛୁ | Standard spelling rank1; spoken ଆସୁଚୁ rank2/5 | Works for standard target, register choice |
| `auchu` | ଔଚୁ | ଆସୁଛୁ absent top9/top100 | Missing shortened/typo alias if owner intends that mapping |
| `jauchi` | ଯାଉଚି | Standard ଯାଉଛି absent top9/top100; `jauchhi` works | Register alias/generation |
| `janichi` | ଜାଣିଚି | Standard ଜାଣିଛି absent top9/top100 in web; `janichhi` works | Register and pruning |
| `sanga` | ସଙ୍ଗ | ସାଙ୍ଗ rank2; `sangamane` → ସାଙ୍ଗମାନେ rank1 | Ranking varies by inflection |
| `dada` | ଦଡ଼ | ଦାଦା rank2; top100 request moves it to rank1 | Candidate-generation limit changes ranking evidence |
| `karideba` | କରିଦେବ | କରିଦେବା rank2 | Genuine inflection ambiguity |
| `karidaba` | କରିଦବ | କରିଦବା rank5; no exact web lexicon rows | Colloquial generation and ranking |
| `phone` | ଫୋନେ | ଫୋନ absent top9/top100; `phon` works | English spelling alias missing |
| `mobile` | ମୋବିଲେ | ମୋବାଇଲ absent top9/top100; `mobail` works | English spelling alias missing |
| `office` | ଓଫ୍ଫିଚେ | ଅଫିସ absent top9/top100; `aphis` works | English spelling alias missing |
| `meeting` | ମୀତିଙ | ମିଟିଂ absent top9, rank1 in top100; `miting` works | Generation truncation before frequency scoring |
| `message` | ମେଷଗେ | ମେସେଜ absent top9/top100; `mesej` gives rank2 after ମେସେଜ୍ | English spelling alias missing |
| `video` | ବିଦେଓ | ଭିଡିଓ absent top9/top100; `bhidio` works | English spelling alias missing |
| `videota` | ବିଦେଓତ | ଭିଡିଓଟା absent top9/top100 | Loan plus suffix unavailable |
| `link` | ଲିଙ୍କ | Rank1 | An English spelling that happens to fit the phonetic model |

`ghare`, `gharaku`, `pilamane`, `pilanku`, `karithili`, `sangamane` all lead with the proposed ordinary inflections. Do not describe the engine as generally unable to inflect. The actual issue is uneven lexical coverage, without a productive morphology layer for novel forms.

The top100 caveat is especially important: `core/src/index.ts:151` passes `limit: Math.max(wanted, this.beam)` into segmentation. Asking for more candidates changes the evidence available to ranking; it does not simply reveal the lower portion of the same list. `meeting` is therefore not a case of “correct word ranked >9”: it is missing at generation time in the ordinary request. Bigram ranking cannot invent it (`core/src/rank.ts:18`).

## Realistic sentence probes (automatic top1, unedited)

| Roman sentence | Actual result |
|---|---|
| `namaskar, mu bhalare achhi. tame kemiti achha?` | ନମସ୍କାର, ମୁ ଭଲରେ ଅଛି. ତମେ କେମିତି ଅଛ? |
| `mu aji ghare achhi. kali office jibi.` | ମୁ ଆଜି ଘରେ ଅଛି. କଲି ଓଫ୍ଫିଚେ ଯିବି. |
| `mate phone kara, meeting pare message karibi.` | ମତେ ଫୋନେ କର, ମୀତିଙ ପରେ ମେଷଗେ କରିବି. |
| `ehi video ta dekha, link pathaichi.` | ଏହି ବିଦେଓ ତା ଦେଖ, ଲିଙ୍କ ପଥୈଚି. |
| `mo sangamane aji gharaku asibe.` | ମୋ ସାଙ୍ଗମାନେ ଆଜି ଘରକୁ ଆସିବେ. |
| `mun aji bhata khai office jibi.` | ମୁଁ ଆଜି ଭତ୍ତା ଖାଇ ଓଫ୍ଫିଚେ ଯିବି. |

The second sentence illustrates prospective-time `kali` versus actual କଲି; the last illustrates rice `bhata` versus actual ଭତ୍ତା. One-previous-word context cannot reliably decide every sentence-wide sense. These are proposed user intentions, not proof that another valid reading is linguistically invalid.

## Why dictionary size overpromises

Measured from current shipped files:

- `core/data/lexicon-web.tsv`: 123,125 rows, **105,824 Roman keys and 54,397 distinct Odia spellings**. “120k-word dictionary” is misleading; these are alias rows, not unique words and not meanings.
- Praharaj payload: 38,776 headword keys.
- Modern payload: 40,589 keys; 33,401 entries have `loan`, 7,359 have `mt`, 995 have `cldr` (tags overlap).
- **32,315 modern entries have only a `loan` tag.** `Appv2/src/dictionary/overlay.ts:402` excludes this tag from meaning chips, intentionally. Such entries can appear in the panel but contribute no modern inline meaning. This is not a loader error.
- `core/data/glosses.tsv` currently has six owner-approved senses, including `kemiti`/କେମିତି = how, committee/କମିଟି, and dust/ଧୂଳି. Do not repeat stale docs saying four unvalidated rows.

Modern `mobile`, `meeting`, `message` loan records are **Odia→English annotations**, not English→Odia lookup keys. They are not consulted by the candidate engine. `kemiti` still has an auto-detected `loan\tcommittee` raw record; the owner override and exclusion from chips avoid one bad display, but blindly reversing all loan rows would resurrect such false matches. `Odia_Sanskrit_Appv2/PROVENANCE.md:22` also records the MT underlying-text origin as unknown and owner decision D-5 to replace that layer; `:24` flags wordfreq's CC-BY-SA word-list data used in loan labels. These are recorded existing uncertainties, not newly licensed data for unqualified reuse.

`overlay.ts:259` attempts exact match, removal of **one** suffix, then a longest-known-prefix approximation. This is useful fallback, not morphological analysis. `:305` modern lookup does exact and one suffix only. `:415` says **“not a known word”** when the chip lacks a meaning: that conflates “no definition in our sources” with invalid Odia. Prefer “Meaning unavailable” / “No definition yet.”

Before the new feature, search itself is Odia-only (`overlay.ts:493-497`); `onSearch` at `:678` does only `lookup(q)` and `lookupModern(q)`, and does not use `ownerGloss(q)` to decide whether a result exists. Even an owner-only sense would be invisible in direct search if absent from both binary layers.

## Evaluation blind spot

Run `npx tsx plan/research/2026-10-12/full-vs-web.ts`.

`Appv2/eval/lib.ts:44-58` deliberately loads FULL lexicon/unigram/bigram data, unlike `Appv2/src/engine.ts:60-76`. `janichi` becomes standard ଜାଣିଛି at rank1 with full assets, but the shipped app leads with ଜାଣିଚି and does not offer the standard form in the probed top100. `mesej` swaps final-halant preference too. None of the six bad English spellings is repaired by merely using the full assets.

The existing `Appv2/eval/no-regression.ts` has a narrower, legitimate purpose: compare the current core profile against the current Sanskrit-extended profile. It deduplicates the Odia source into isolated words (`goldenWords`, line 57), derives Roman spellings, and calls `transliterateWord` without previous-word context (`score`, line 97). It defaults to top5 (`:33`), whereas the caret requests nine, and top5 bypasses the scaled rule-reachability floor (`core/src/rank.ts`, floor based on `limit - 5`). It fails only if treatment loses more than 0.5 percentage points against the contemporaneous control, plus ten named cases. Shared core regressions can affect both arms equally and escape that relative check. Its committed held-out baseline section only prints the stored values; it does not recompute or assert them. None of this makes the check bad, but a pass cannot establish whole-app typing quality, context behavior, full gloss accuracy or real browser asset parity. `tools/eval/colloquial.ts:7` explicitly says report-only and never fails while owner validation is pending.

Add a shipped-asset evaluation target and sentence/interaction cases from owner typing, with owner-accepted alternative spellings. Retain the existing round-trip tests but do not call their score free-form conversational accuracy: the reverse romanizer supplies a predictable spelling, whereas human Roman input contains English orthography, shortened forms, typing errors and regional choices. Measure correction burden (picks/backspaces), intended spelling in first three candidates, meaning accuracy separately, and behavior after learning.

## Recommended implementation order

1. First English dictionary should be a small, explicit, offline sense table, with separate **meaning** versus **loan spelling** results and native-review status. Make adding senses data-only. Do not automatically replace ambiguous English text or blindly reverse old MT/loan records. Preserve Keep English and learned choices.
2. Expose this through dictionary search with a clear insertion interaction; if English spelling aliases are also added to typing, label those separately and validate all profiles plus user-learning precedence. A search feature alone does not fix `phone` in the typing bar; state that boundary.
3. Introduce owner-reviewed common Roman aliases and an inflection strategy for loans (`videota`, `officere`, `phoneku`) before changing general rule weights. Distinguish native meaning (e.g. office as a workplace/department) from loan spelling (ଅଫିସ).
4. Fix glossary wording and curate current senses for frequent grammar, verbs and chat vocabulary; retain old definitions as reference with their dates. Avoid automatic reverse indexing of every English word in old definitions.
5. Broaden candidate generation based on evidence while testing latency and ranking regressions; generation and ranking are separate stages. Do not globally increase every weight to rescue one word.
6. Collect consented owner/family phrase examples and accept dialect/register alternatives. Native validation owns sense, spelling and register decisions; automated probes supply reproducibility.
