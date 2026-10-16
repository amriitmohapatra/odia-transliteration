# V2.7: replacing the MODERN layer's machine-translation rows (2026-10-15)

**Why (decision D-5).** The MODERN dictionary layer had 7,359 `[mt]` lines from OdiaNLP
`cleaned_pairs.json`: MIT repository, but the origin of its text is unknown, and many
lines are wrong (ଶୀଘ୍ର "the quick", ମଣିଷ "made man", ବିଧାନ "beads", ମାସରେ "in the mass",
ଆସିଛି "mg", ଭର୍ତ୍ତି "delusion").

**How much it mattered.** On the lens card (`lens/src/describe.ts` order: owner, AI,
ending/verb, number, modern, Praharaj), over the 20,000 most common IndicCorp words,
token-weighted: an `[mt]` line was the first meaning for **8.55%** of all running text
(3,872 words). The app's chip puts the modern layer before the ending explanation, so
there it was more.

**The plan's sources could not be used.** On HuggingFace, `ai4bharat/samanantar` is
**CC-BY-NC-4.0** (the plan table said CC0): not shippable. `ai4bharat/BPCC` is gated
(login and accepted terms). So no aligned glosses from parallel text.

**What was done instead.**

1. **Batch 11 of the AI-written meanings** (D-13): the 2,000 most frequent words that
   showed an `[mt]` line first (7.4% of running text), written by 8 agents from their own
   knowledge, every row reviewed by a separate agent (2 wrong, 36 minor fixes, 3 skips).
   1,997 rows in `core/data/meanings.tsv`.
2. **Wikidata names (CC0)**: 777 single-word Odia labels with their English labels, by
   class (countries, districts, cities and towns, parties, universities, colleges,
   festivals, rivers, lakes, temples, mosques, languages, ethnic groups, newspapers):
   `Odia_Sanskrit_Appv2/build/wikidata-names.tsv`, shown as `[wd]` "name (Wikidata)". Not
   taken: people (the query times out, and private-person facts are out of scope anyway),
   villages, mountains, films (timeouts), and multi-word labels (the lens looks up one word).
3. **Every `[mt]` line removed** (`tools/build-data/replace_mt_layer.py`): 40,561 → 34,905
   entries; 6,286 keys had no other line. Those words keep their Praharaj, AI and owner
   meanings.

**Result** (lens card order, share of running text by first meaning):

| first meaning | before | batch 11 | batch 11, `[mt]` removed |
|---|---|---|---|
| owner or AI | 60.28% | 67.66% | 67.66% |
| explained from its ending | 8.21% | 8.46% | 8.46% |
| Praharaj (1931–40) | 7.18% | 7.18% | 7.75% |
| `[mt]` modern usage | 8.55% | 0.92% | **0** |
| number | 3.03% | 3.03% | 3.03% |
| none | 2.28% | 2.28% | 2.48% |
| CLDR / Wikidata name | 0.24% | 0.24% | 0.25% / 0.13% |

`tools/eval/meanings-coverage.ts`: AI 66.7 → 75.0% of running text; "together" (words,
verb forms, numbers) 92.5 → 93.2%; "clear meaning" 88.0 → 87.3% (that bucket counted an
`[mt]` line as a clear meaning).
