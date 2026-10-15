# E-1: a word-origin tagger (2026-10-15)

**Question (plan/05-v3-direction.md §8, decision D-9).** Can a small character-pattern
tagger, trained on Praharaj's origin tags, say where a word outside Praharaj comes from
(native, Sanskrit, English, Persian/Arabic)? Laya only if the simple tagger is not good
enough.

**Method.** `tools/eval/e1/origin_nb.py`: multinomial naive Bayes over character 1–4-grams
(with word-start and word-end marks). Data: the 35,396 Praharaj headwords with an origin
tag (`Appv2/src/dictionary/origin.bin`), single codes grouped: S → sanskrit, T and D →
native, E → english, P and A → perso-arabic, F → other; mixed codes left out. Random 80/20
split (34,995 words, 6,999 tested).

| class | test words | precision | recall | F1 |
|---|---|---|---|---|
| sanskrit | 3,837 | 0.84 | 0.87 | 0.86 |
| native | 2,602 | 0.78 | 0.74 | 0.76 |
| english | 225 | 0.63 | 0.70 | 0.66 |
| perso-arabic | 274 | 0.45 | 0.45 | 0.45 |
| other | 61 | 0.00 | 0.00 | 0.00 |

Accuracy 79.5% (majority class: 54.8%); macro F1 0.55.

**Decision: not shipped.** The tagger separates Sanskrit from native words well, but the
classes a reader cares about are weak: a "from Persian" label right less than half the
time misleads. The words where an origin matters already have one: Praharaj headwords
from its own tags, the frequent words without one from the AI meanings
(`core/data/meanings.tsv`, origin column, about 10,000 rows), English loans from
`Appv2/src/dictionary/loans.tsv`.

**Laya: not run.** Laya needs fine-tuning on 10,000–30,000 labelled examples (about 4–5
hours on a GPU, §8); this cloud server has no GPU, and Laya has no published Odia
evaluation. Worth revisiting only if an origin label for rare words becomes a real need.
