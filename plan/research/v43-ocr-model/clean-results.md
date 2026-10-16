# ori-lens-clean: a model trained only on clean sources

Why: `ori-lens.traineddata` (v43/) was shaped by scraped news text and by pseudo-labelled crops of
copyrighted pages, which the project's licence rule does not allow in shipped artefacts. This model
was trained the same way but **only** from CC0 / CC-BY word lists rendered in OFL fonts
(sources: `clean/PROVENANCE.md`).

## Model

`v43/clean/ori-lens-clean.traineddata` — int, 1,480,126 bytes, sha256
`1fcb6e1c5bb49fa17e5c7820a42774dfc4317a83c3321925e3a45a38d5c9eac4`, version string
`4.00.00alpha:ori:synth20170629 + odia-lens v4.3 clean fine-tune 2026-10-15`. tesseract.js 5.1.1 loads
it (75-80 ms per line). Float version: `clean/train/models/clean_float.traineddata`.

## Training

- Base ori_best (Apache-2.0), unicharset and dawgs unchanged, `--reset_learning_rate`.
- Text: 60,000 lines of 2-8 words sampled from IndicCorp v2 word counts (CC0; count^0.6, words with
  ଥି or ya-phala x2.5) and Aksharantar words (CC-BY), plus generated numerals and punctuation.
  No sentences, so the network gets no help from word order (it had none from the news text either
  beyond what a line LSTM picks up).
- Images: 24,000 newsprint-style lines + 8,000 bilevel-96-dpi lines in 5 OFL fonts, all put through the
  lens's crop and scaling. No real image of any kind.
- Two runs side by side (1 thread each): learning rate 1e-4 and 2e-4, 32,000 lines each (one pass, ~95
  min). Selection on the synthetic held-out sets only (500 news-style + 300 bilevel lines from
  separately generated text): 2e-4 at 32,000 lines.

| run, lines seen | news-style synth BCER / BWER | bilevel synth BCER / BWER |
|---|---|---|
| ori_best (start) | 26.8 / 59.5 | 39.3 / 78.5 |
| 2e-4, 8,000 | 10.9 / 29.2 | 18.4 / 49.5 |
| 2e-4, 16,000 | 9.7 / 27.3 | 17.2 / 46.8 |
| 2e-4, 24,000 | 8.6 / 24.2 | 15.2 / 42.4 |
| 2e-4, 28,000 | 9.1 / 24.8 | 14.4 / 40.8 |
| **2e-4, 32,000 (chosen)** | 8.7 / 24.1 | 14.1 / 39.7 |
| 1e-4, 28,000 | 9.9 / 27.3 | 16.0 / 44.3 |

(BWER is high because the eval lines are random word sequences.)

## Results on the held-out truth (truth.json, 275 real lines; same table format as ../results.md)

Columns per regime: strict CER / word-exact % / letter-CER / letter word-exact %. `lens@7` = the lens
today; `lens@13` = psm 13; `lens@rule60` = psm 7, then psm 13 when psm 7 is empty or its mean word
confidence < 60. `M_` rows: Tesseract 5.3.4 CLI; `tjs_` rows: tesseract.js 5.1.1.

| run | body CER / word% / letter-CER / letter-word% (n=137) | head CER / word% / letter-CER / letter-word% (n=60) | book300 CER / word% / letter-CER / letter-word% (n=40) | book96 CER / word% / letter-CER / letter-word% (n=19) | typed CER / word% / letter-CER / letter-word% (n=19) | empty |
|---|---|---|---|---|---|---|
| M_ori_fast-lens@7 | 17.6 / 65.4 / 16.5 / 70.3 | 24.5 / 58.5 / 22.3 / 60.5 | 13.1 / 56.2 / 11.6 / 65.0 | 49.8 / 16.9 / 51.4 / 9.3 | 6.8 / 71.7 / 5.8 / 75.9 | 13 |
| M_ori_fast-lens@13 | 11.5 / 67.0 / 8.6 / 72.3 | 17.5 / 59.7 / 13.9 / 65.1 | 18.5 / 49.0 / 16.6 / 57.0 | 51.8 / 12.7 / 50.7 / 9.3 | 7.1 / 75.8 / 6.2 / 79.3 | 0 |
| M_ori_fast-lens@rule60 | 9.6 / 69.9 / 8.0 / 74.3 | 19.4 / 62.0 / 17.1 / 65.1 | 13.6 / 55.1 / 12.1 / 63.6 | 52.1 / 12.7 / 51.3 / 9.3 | 6.8 / 71.7 / 5.8 / 75.9 | 0 |
| M_ori-lens-lens@7 | 15.6 / 70.1 / 14.4 / 76.0 | 19.0 / 65.9 / 17.8 / 69.0 | 8.5 / 69.9 / 7.6 / 76.5 | 45.6 / 21.7 / 47.0 / 15.9 | 4.7 / 80.8 / 4.5 / 83.6 | 13 |
| M_ori-lens-lens@13 | 6.6 / 76.1 / 5.3 / 81.7 | 10.4 / 73.6 / 9.0 / 77.0 | 10.3 / 68.8 / 9.4 / 73.5 | 44.8 / 22.3 / 45.5 / 18.5 | 5.4 / 80.0 / 5.5 / 79.3 | 0 |
| M_ori-lens-lens@rule60 | 6.7 / 76.7 / 5.5 / 82.4 | 16.8 / 69.4 / 15.2 / 72.4 | 8.6 / 70.4 / 7.7 / 76.8 | 45.4 / 23.5 / 46.1 / 20.5 | 4.7 / 80.8 / 4.5 / 83.6 | 0 |
| M_clean-lens@7 | 14.7 / 71.7 / 13.7 / 76.9 | 19.6 / 63.6 / 17.9 / 66.3 | 8.7 / 70.2 / 8.0 / 75.8 | 46.3 / 18.7 / 46.7 / 13.2 | 5.4 / 78.3 / 4.8 / 81.9 | 13 |
| M_clean-lens@13 | 5.8 / 78.5 / 4.8 / 82.9 | 10.3 / 71.3 / 8.5 / 77.0 | 9.4 / 65.8 / 8.5 / 72.8 | 44.4 / 18.1 / 44.3 / 13.2 | 6.8 / 75.0 / 6.2 / 76.7 | 0 |
| M_clean-lens@rule60 | 6.0 / 77.8 / 4.9 / 83.0 | 15.3 / 67.8 / 13.5 / 71.3 | 8.7 / 70.2 / 7.9 / 76.1 | 44.4 / 18.1 / 44.3 / 13.2 | 5.4 / 78.3 / 4.8 / 81.9 | 0 |
| tjs_clean-lens@7 | 14.8 / 71.3 / 13.8 / 76.0 | 19.3 / 65.9 / 17.5 / 68.6 | 8.7 / 69.9 / 7.9 / 76.5 | 44.5 / 20.5 / 45.2 / 15.2 | 5.7 / 76.7 / 5.3 / 80.2 | 13 |
| tjs_clean-lens@13 | 5.7 / 78.5 / 4.7 / 83.0 | 10.3 / 70.5 / 8.3 / 76.6 | 9.8 / 65.4 / 8.9 / 73.2 | 43.8 / 19.9 / 43.5 / 15.9 | 6.8 / 75.8 / 6.2 / 77.6 | 0 |

| run (doubt-free lines only) | body letter-CER (n=108) | head letter-CER (n=57) | book300 letter-CER (n=32) | book96 letter-CER (n=2) | typed letter-CER (n=10) |
|---|---|---|---|---|---|
| M_ori_fast-lens@7 | 14.6 | 21.4 | 11.8 | 43.3 | 5.1 |
| M_ori_fast-lens@13 | 7.4 | 12.7 | 16.7 | 44.3 | 7.5 |
| M_ori_fast-lens@rule60 | 6.6 | 16.0 | 12.4 | 44.3 | 5.1 |
| M_ori-lens-lens@7 | 13.0 | 17.3 | 7.5 | 35.1 | 3.1 |
| M_ori-lens-lens@13 | 4.5 | 8.2 | 9.0 | 41.2 | 5.8 |
| M_ori-lens-lens@rule60 | 4.7 | 14.8 | 7.6 | 38.1 | 3.1 |
| M_clean-lens@7 | 12.5 | 17.5 | 7.9 | 39.2 | 4.8 |
| M_clean-lens@13 | 4.2 | 7.9 | 8.2 | 36.1 | 6.8 |
| M_clean-lens@rule60 | 4.3 | 13.2 | 7.7 | 36.1 | 4.8 |
| tjs_clean-lens@7 | 12.7 | 17.0 | 7.6 | 29.9 | 5.8 |
| tjs_clean-lens@13 | 4.2 | 7.7 | 8.5 | 36.1 | 6.8 |

### Known confusions, ePaper body, psm 13 (errors / occurrences)

| model | thi -> thu | ya-phala dropped | aa sign dropped |
|---|---|---|---|
| ori_fast | 8 / 28 | 11 / 41 | 34 / 403 |
| ori-lens | 0 / 28 | 5 / 41 | 23 / 401 |
| **ori-lens-clean** | **0 / 28** | **4 / 41** | **17 / 403** |

Clean book (book300), psm 13: ya-phala dropped 16 → 3 of 40, aa sign 14 → 9 of 198.

## Reading the table

- **The clean model is as good as ori-lens, and slightly better on ePapers** (psm 13, letter-CER):
  body 8.6 (ori_fast) → 5.3 (ori-lens) → **4.8** (clean); headlines 13.9 → 9.0 → **8.5**;
  clean book 16.6 → 9.4 → **8.5** (at psm 7: 11.6 → 7.6 → 8.0); 96 dpi book 50.7 → 45.5 → 44.3 (still
  unusable); typed legacy font 6.2 → 5.5 → 6.2 at psm 13, 5.8 → 4.5 → 4.8 at psm 7.
  So the news text and the pseudo-labelled real lines were not what made ori-lens good; the
  degradations and the lens-matched crop were.
- The differences between ori-lens and the clean model (≤ 1 point) are within the noise of this truth
  set; the difference to ori_fast is not.
- **psm**: psm 13 is best for ePapers with every model. The "psm 7, then psm 13 when empty or mean
  confidence < 60" rule fixes the empty lines (body 13.7 → 4.9 with the clean model, as good as psm 13)
  and is best for clean books and typed text, but **hurts headlines** (8.5 → 13.5): psm 7 reads many
  headlines wrongly with confidence ≥ 60. If the lens keeps one rule for everything, the rule is the
  better compromise for books, psm 13 for ePapers.

## Recommendation

Ship `ori-lens-clean.traineddata` instead of ori-lens: same or better accuracy, same size
(1.48 MB, same network shape as the shipped ori_fast), and only CC0 / CC-BY / OFL / Apache-2.0
inputs. Pair it with the psm change (psm 13 for ePaper lines, or the rule above).

## Weak spots

Same as ../results.md: small truth set (275 lines, one day, four books), doubt flags (book96 truth is
weak), same-day fonts. One difference: the clean model never saw the newspapers' own fonts, so its
results on these papers are a fairer guess of how it does on a paper nobody trained on.
