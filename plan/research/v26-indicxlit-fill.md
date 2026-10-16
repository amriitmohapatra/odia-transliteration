# V2.6: IndicXlit lexicon fill (2026-10-15)

**Question.** About 17,500 of the 100,000 most common Odia words (IndicCorp v2) are in no
word list of the engine (`lexicon.tsv`, `typed.tsv`). Typed in English letters, they are
reached only by the spelling rules. Does adding the spellings that IndicXlit (AI4Bharat,
MIT) predicts for them help, and what does it cost?

**Method.** IndicXlit Odia → Latin (fairseq 0.12.2 on CPU, beam 4) gives four likely
Latin spellings per word (`tools/build-data/indicxlit_romanize.py`). They become lexicon
rows (`tools/build-data/build_xlit_fill.py`): weight = the word's IndicCorp frequency on
the 0–2.303 scale of the other lexicons, × 1.0 / 0.9 / 0.8 / 0.7 for the 1st–4th spelling.
The model check: on 1,000 held-out rows it gives the gold Latin spelling first 44.1% of
the time and in its four 70.8%; Latin → Odia it is 42.5% top-1 (the engine: 36.9%).

## 1. The words the fill covers gain a lot

Experiment 1 (not shipped): the same fill made for the held-out words, scored on the
held-out set (`core/test/golden/heldout.tsv`; split as `npm run eval`).

| Fill | rows | in-lexicon top-1 / top-5 | OOV top-1 / top-5 |
|---|---|---|---|
| none | 0 | 60.1 / 83.4 | 25.5 / 40.3 |
| 1st spelling | 3,992 | 61.9 / 88.8 | 46.2 / 61.3 |
| 1st–2nd | 7,984 | 63.3 / 90.2 | 53.0 / 69.5 |
| **1st–4th** | 15,968 | **63.7 / 91.4** | **58.3 / 76.0** |
| 1st–4th, score > −0.3 | 5,786 | 62.1 / 89.5 | 51.2 / 67.4 |
| 1st–4th, half weight | 15,968 | 61.8 / 86.9 | 58.3 / 76.0 |

The held-out Latin spellings come from the same dataset IndicXlit learned from, so this
may flatter it. Experiment 2 uses real typing: what Desh keyboard users typed for 3,000
words that are in no word list (3,471 pairs; their typed rows removed from the engine).

| Fill | top-1 | top-5 | top-1 by use | top-5 by use |
|---|---|---|---|---|
| none | 43.4 | 72.5 | 16.7 | 70.0 |
| 1st–2nd | 47.9 | 79.9 | 15.9 | 73.6 |
| **1st–4th** | **48.7** | **81.5** | 16.3 | 74.8 |

The typed key is among the four spellings for 62.3% of the pairs.

## 2. The cost: collisions with other words

The shipped fill covers words that are not in the held-out set, so on `npm run eval` it
can only cost: a fill word can take first place for another word's key. Overall top-1
36.9 → 36.0%, top-5 54.7 → 54.0% (the in-lexicon/OOV split moves because 297 more keys
now get a lexicon candidate; compare the overall row). 34 keys lose first place, 2 gain
it. Most losses are a rival spelling of the same word, not a wrong word: ଅଧିବେସନରେ for
ଅଧିବେଶନରେ, ଅଞ୍ଚଳବାସୀଙ୍କୁ for ଅଂଚଳବାସୀଙ୍କୁ, ବୁଝାପଡ଼ୁଛି (with the nukta) for ବୁଝାପଡୁଛି, ଚଣ୍ଡୀଗଡ
for ଚଣ୍ଡିଗଡ. A few are real errors: a spelling without the case ending (bhagalpur →
ଭାଗଲପୁରର). Scaling the fill weight down to 0.5 or 0.25 does not change this (36.0%,
36.1%): any lexicon row outranks a rule spelling. Taking only the 1st–2nd spellings
does not either (36.1%, 35 lost). Everyday (`tools/eval/everyday.ts`: careful 84.8%,
casual 80.4% top-1) and colloquial (spoken 76.2% top-1, 100% top-3) are unchanged.

**Shipped:** the 1st–4th spellings of the 17,484 words, less 332 words with a letter the
model does not know (mostly ଵ, read as `<unk>`): `core/data/lexicon-xlit.tsv`
(68,660 rows) and, for the web and phone file, the words among the 30,000 most frequent
only: `core/data/lexicon-xlit-web.tsv` (6,702 rows, +265 KB).

## 3. Held: new spellings for the common words (stage P)

IndicXlit also gives spellings for the 30,000 most common words that the rule-based
romanization misses, English loans above all (ଲକ୍ଡାଉନ: `lockdown`, where the rules give
`lakdauna`). With these (77,232 more web rows, about 3 MB), held-out top-1 falls to 35.5%
(63 keys lose first place). With real typing for 3,000 common words, their Desh rows
removed: top-1 74.3 → 77.8%, top-5 97.7 → 98.2%. Today the Desh typed spellings already
cover these words, so this is not shipped. **It is the measured way to replace part of
the Desh typing data when the public version leaves it out (stage P).**

Files of the run (romanizations, model checksums, scripts) were kept outside the
repository; the shipped rows are in `core/data/`, the checksums in `core/data/PROVENANCE.md`.
