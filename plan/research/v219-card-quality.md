# V2.19: a judged evaluation of the lens cards (2026-10-16)

**Why.** The owner pointed the lens at a Sambad ePaper notice and found words it could not
explain ("journalist + him" for samvaadikataaku, "maybe: Width" for pratibaddha). The
coverage numbers (`tools/eval/meanings-coverage.ts`) count a card as covered when it has a
meaning, not when the meaning is right. This round measures whether the card is right for
the word as used.

**Method.**
- Corpus: 228 Odia news articles of 2026-10-11 to 16 from 7 sites (dharitri, sambad,
  samajalive, odishabhaskar, prameyanews7, odishareporter, nandighoshatv; kanaknews left
  out because it shows a bot check to plain requests). Text kept outside the repository.
- Split by article: 28 held-out articles (4 per site) for measurement only; 200 for mining
  words (batch 12). Words are never mined from the held set.
- `tools/eval/card-audit.mjs`: every word through the lens's own lookup, with a flag for
  the card's source.
- Judges (5 AI agents, `JUDGE.md` rules: ok / weak / wrong / ocr, in context): every
  flagged card of the held set (849 words) and a random 600 of the 1,953 ok-flagged words;
  occurrence-weighted, the ok flag scaled from its sample. Verdicts, words only:
  `tools/eval/data/card-judge-round0.tsv`. The judges are a proxy, not a native speaker;
  the owner's samples (C-13) stay the real check.

**Round 0** (held set: 2,802 words, 7,078 occurrences):

| card source | share of text | judged right | weak | wrong |
|---|---|---|---|---|
| owner / AI / ending / number ("ok") | 83.5% | 99.0% | 0.3% | 0.6% |
| Praharaj exact (1930s) | 4.1% | 39% | 30% | 30% |
| parts guess | 1.0% | 27% | 52% | 21% |
| shorter word's modern meaning | 2.5% | 24% | 28% | 47% |
| "maybe:" from a shorter headword | 4.6% | 10% | 11% | 79% |
| no meaning | 4.3% | 0 | 0 | 93% (rest OCR) |

By match type: a prefix match (the word only begins like a headword) gave a right 1930s
gloss for 3% of its occurrences and a wrong one for 90%; the shorter word's modern meaning
on a prefix match was right for 25%, wrong for 47%. A stem match (headword + ending) was
right for 28%.

**Change (same day).** A prefix match no longer gives a meaning in the lens card or the
app's chip; the card says the dictionaries have no meaning yet. The parts guess and stem
matches stay.

| whole held set, by occurrences | right | weak | wrong (misleading) | no meaning | OCR |
|---|---|---|---|---|---|
| round 0, before | 85.6% | 3.2% | 6.7% | 4.0% | 0.4% |
| round 1, no prefix guesses | 85.0% | 2.3% | **2.5%** | 9.8% | 0.4% |

Misleading cards fall from 6.7% to 2.5% of the running text; the empty cards (9.8%) are
the work list for batch 12 (mined from the other 200 articles) and are measured again on
the same held set after it.

Main kinds of error the judges named: names of people and places shown with a dictionary
sense ("Beer" for Birla, "Flag" for Banerjee), English loans with no or a wrong meaning
(plan, task, concert, notice "a small metal jug"), 1930s senses ("A coachman" for
saarathi, "Unboiled" for invalid, "Czech" for cheque), and case forms of stems with no row.

**Round 2: after meanings batch 12** (1,756 rows mined from the other 200 articles and the
owner's ePaper page). The same held set through `card-audit.mjs`; the 205 cards that
changed were judged again (same rules, 2 judges; `tools/eval/data/card-judge-round2.tsv`);
every other card keeps its round 0 verdict, an empty card counts as "no meaning". This
method gives round 1's numbers back exactly.

| whole held set, by occurrences | right | weak | wrong (misleading) | no meaning | OCR |
|---|---|---|---|---|---|
| round 0, before | 85.6% | 3.2% | 6.7% | 4.0% | 0.4% |
| round 1, no prefix guesses | 85.0% | 2.3% | 2.5% | 9.8% | 0.4% |
| round 2, batch 12 | **88.4%** | 1.5% | **1.9%** | 7.7% | 0.4% |

Of the 205 changed cards, 191 were judged right, 10 weak, 4 wrong. Only 162 batch 12 words
occur in the held set (the words were mined from other articles), so the gain is what a
reader of new articles sees. The wrong ones are parts guesses for names (Patnagarh
"patna + fort", Nicobar, Janpath "people + path") and a set phrase.

Note on round 1's joiner change (commit 797d17a): only the AI-written meanings
(`meaningFinder`) ignore a zero-width joiner; the owner's meanings still need the exact
spelling. The commit message says both.

**The ePaper through the lens's own OCR** (2026-10-16: 16 pages, 4 each of Sambad,
Dharitri, Samaja, Prameya, Bhubaneswar edition; 35,456 words; read with
`lens/vendor/ori.traineddata` as `readPage()` does; images and text kept outside the
repository). Card audit, with the lens's word correction:

| | ok | parts | approximate | Praharaj only | no card |
|---|---|---|---|---|---|
| raw OCR | 73.1% | 1.4% | 1.1% | 5.4% | 19.0% |
| corrected | 80.7% | 1.4% | 0.9% | 5.8% | 11.2% |

Of the 11.2% with no card, 7.8 points are words common in IndicCorp (≥ 50 times) and 3.4
are OCR noise. Many of the common ones are print spellings that drop a doubled or joined
letter (khaRca for khaRcca, parabaRtii for parabaRttii, byabasthaa printed with ta) and
names of local places (Hatipala, Chandaka). Sambad and Samaja images are only about
1,000 px wide, so their OCR is weaker (mean confidence 71-75 against 82-90).

**Next round (planned):** batch 13 from the ePaper words with no card (about 2,000
common words); a lookup step that tries the doubled-letter spelling (ta → tta, ca → cca)
when a word has no entry, measured on the same pages before it ships; no parts guess
for a word that the name lists (Wikidata) or the judges mark as a name.
