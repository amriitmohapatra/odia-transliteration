# v4.3 baseline: stock Tesseract Odia models on real ePaper lines

Date 2026-10-15. Truth: `truth.json` (197 lines from 6 held-out pages of today's ePapers:
sambad-9, sambad-11, samaja-6, samaja-16, dharitri-6, dharitri-10). 137 body lines,
60 headline/subhead lines. These pages are never used for training.

## Headline finding (read this first)

1. **Page segmentation mode 7 returns an empty line ~7-8 % of the time; mode 13 never did on these 197 lines.**
   With the lens crop (pad 0.35 x line height), a sliver of the neighbouring line above or
   below is inside the crop. Tesseract `--psm 7` then returns *nothing* for 11/137 body lines
   and 2/60 headlines (same in the CLI and in tesseract.js 5.1.1). `--psm 13` (raw line)
   reads those lines normally. On the lines where psm 7 does return text, psm 7 and psm 13 are
   equal (letter CER 8.2 vs 8.5 on 126 body lines). So: **psm 13, or psm 7 with a psm 13
   retry when the result is empty**, cuts body CER from 17.6 to 11.2 % with the stock model.
   In the lens, frame mode already keeps the block (psm 6) reading when the line reading is
   worse, which hides part of this; the point-and-read path (`readAt`) also falls back. This
   benchmark measures the single-line reader only.
2. **The x4 upscale clamp is not the problem.** For Sambad/Samaja body (box height 9-13 px) the
   lens scales x4 (line ~44 px), not to 64 px. Removing the clamp (t64), or enlarging to 96 or
   128 px, changes body CER by less than 0.5 point (noise). Unsharp mask and Otsu binarisation
   make it *worse* (+2.5 points).
3. **ori_best is no better than ori_fast** on these lines (within 0.5 point).
4. **Body text of Sambad and Samaja is the weak spot**: letter CER ~12 %, ~60-67 % of words
   exact (psm 13). Dharitri body (larger type, 15-21 px boxes) is good: letter CER ~3 %, 86 %
   words. Headlines: letter CER ~14 %, but much of that is a few failure types (Samaja's
   condensed headline font read without spaces, decorative/reverse type, stray marks from the
   crop edge), not the body-text confusions.

## Metrics

- **CER** = Levenshtein distance over code points / truth length, summed over lines, after
  NFC, nukta decomposition (U+0B5C/U+0B5D -> base + U+0B3C), ZWJ/ZWNJ removed, curly quotes
  straightened.
- **word%** = truth words matched exactly in a word-level Levenshtein alignment.
- **letter-CER / letter-word%**: the same, after keeping only the Odia block (punctuation and
  stray Latin marks dropped) and merging encodings that print identically: ya-phala as U+0B2F
  or U+0B5F after virama; wa-phala U+0B71 / ba-phala U+0B2C / U+0B35 after virama. The stock
  models write `୍ଯ` and `୍ବ`/`୍ଵ` where the newspapers' own text (and IndicCorp, about 7:1)
  uses `୍ୟ` and `୍ୱ`; strict CER counts that, letter-CER does not. Letter-CER is closer to what
  the lens needs (word lookup), strict CER is what a user copying text sees.
- "sure lines" = body lines without a transcription-doubt flag (108 of 137).

## Settings

All crops: box from `harvest.json` (body) or a hand-drawn box tightened to the ink (headlines),
pad 0.35 x box height, grey, invert when mean < 115, bicubic resize (lens: canvas
`imageSmoothingQuality: high`).

| setting | scale |
|---|---|
| lens | 64 / h clamped to [1, 4] (what the lens does) |
| t64 / t96 / t128 | target / h, no upper clamp |
| t64u / t96u | + unsharp mask (radius ~scale/2, 150 %, threshold 2) |
| t64b | + Otsu binarisation |
| @7 / @13 | Tesseract page segmentation mode 7 (single line) / 13 (raw line) |

## Results (Tesseract 5.3.4 CLI)

| run | body CER | body word% | body letter-CER | body letter-word% | body CER (sure lines) | head CER | head word% | head letter-CER | head letter-word% | body letter-CER sambad / samaja / dharitri | empty |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ori_fast-lens@13 | 11.5 | 67.0 | 8.6 | 72.3 | 10.2 | 17.5 | 59.7 | 13.9 | 65.1 | 12.3 / 12.7 / 3.1 | 0 |
| ori_fast-lens@7 | 17.6 | 65.4 | 16.5 | 70.3 | 15.8 | 24.5 | 58.5 | 22.3 | 60.5 | 20.4 / 27.1 / 6.0 | 13 |
| ori_fast-t128@13 | 11.6 | 65.7 | 8.7 | 71.1 | 10.4 | 18.3 | 57.8 | 15.1 | 62.1 | 12.9 / 12.7 / 2.9 | 0 |
| ori_fast-t128@7 | 20.2 | 62.6 | 19.1 | 66.4 | 18.5 | 31.4 | 51.6 | 28.6 | 53.6 | 28.9 / 28.3 / 5.8 | 18 |
| ori_fast-t64@13 | 11.1 | 67.3 | 8.3 | 72.7 | 9.8 | 17.5 | 59.7 | 13.7 | 65.1 | 11.9 / 12.0 / 3.1 | 0 |
| ori_fast-t64@7 | 18.5 | 63.0 | 17.2 | 67.6 | 17.8 | 24.5 | 58.5 | 22.3 | 60.5 | 24.1 / 26.3 / 6.0 | 14 |
| ori_fast-t64b@13 | 13.7 | 59.7 | 11.0 | 64.6 | 11.7 | 17.8 | 59.3 | 14.7 | 62.8 | 14.6 / 17.0 / 4.0 | 0 |
| ori_fast-t64b@7 | 20.5 | 56.6 | 19.3 | 60.7 | 19.6 | 24.9 | 57.8 | 22.7 | 59.8 | 26.5 / 29.8 / 6.8 | 14 |
| ori_fast-t64u@13 | 13.8 | 60.1 | 10.9 | 65.7 | 12.0 | 18.4 | 56.6 | 14.9 | 62.1 | 15.3 / 16.9 / 3.7 | 0 |
| ori_fast-t64u@7 | 19.2 | 57.1 | 18.0 | 61.4 | 16.5 | 25.9 | 57.0 | 23.5 | 59.4 | 19.3 / 28.6 / 9.0 | 14 |
| ori_fast-t96@13 | 11.4 | 66.8 | 8.2 | 72.4 | 9.9 | 18.1 | 57.0 | 14.7 | 62.5 | 11.5 / 12.8 / 2.7 | 0 |
| ori_fast-t96@7 | 20.3 | 63.3 | 18.9 | 67.4 | 18.3 | 24.1 | 57.8 | 22.0 | 59.8 | 27.3 / 29.7 / 5.3 | 17 |
| ori_fast-t96u@13 | 13.7 | 59.9 | 10.9 | 65.5 | 11.8 | 18.4 | 55.8 | 15.0 | 60.9 | 14.9 / 17.8 / 3.3 | 0 |
| ori_best-lens@13 | 11.0 | 67.6 | 8.1 | 72.5 | 9.9 | 17.9 | 58.9 | 14.3 | 63.2 | 11.2 / 12.1 / 3.2 | 0 |
| ori_best-lens@7 | 17.6 | 65.8 | 16.3 | 70.4 | 15.7 | 24.2 | 58.5 | 21.9 | 60.9 | 20.3 / 26.7 / 5.8 | 13 |
| ori_best-t128@13 | 11.4 | 65.5 | 8.5 | 70.4 | 10.2 | 17.8 | 58.1 | 14.5 | 62.1 | 12.1 / 12.7 / 3.1 | 0 |
| ori_best-t128@7 | 20.3 | 62.1 | 19.1 | 65.9 | 18.5 | 32.3 | 52.3 | 29.7 | 53.6 | 27.9 / 29.2 / 5.8 | 18 |
| ori_best-t64@13 | 11.3 | 67.6 | 8.6 | 71.9 | 10.1 | 17.9 | 58.5 | 14.3 | 62.8 | 12.7 / 12.3 / 3.1 | 0 |
| ori_best-t64@7 | 18.7 | 62.5 | 17.4 | 66.8 | 18.1 | 24.1 | 58.5 | 21.9 | 60.9 | 24.2 / 26.8 / 5.8 | 14 |
| ori_best-t64b@13 | 13.6 | 60.4 | 11.0 | 65.0 | 11.6 | 17.6 | 58.9 | 14.7 | 63.2 | 14.5 / 17.5 / 3.8 | 0 |
| ori_best-t64b@7 | 21.0 | 55.4 | 19.8 | 59.8 | 19.9 | 24.5 | 57.8 | 22.5 | 59.8 | 27.3 / 30.6 / 6.8 | 14 |
| ori_best-t64u@13 | 14.0 | 60.4 | 11.2 | 65.7 | 12.2 | 18.9 | 55.4 | 15.3 | 60.9 | 16.1 / 17.0 / 3.7 | 0 |
| ori_best-t64u@7 | 19.3 | 56.1 | 18.2 | 60.4 | 16.6 | 25.7 | 56.2 | 23.5 | 59.0 | 20.4 / 28.7 / 8.8 | 14 |
| ori_best-t96@13 | 11.0 | 66.6 | 8.0 | 72.3 | 9.9 | 18.2 | 56.6 | 14.8 | 61.3 | 11.4 / 12.1 / 2.6 | 0 |
| ori_best-t96@7 | 20.3 | 62.3 | 19.1 | 66.6 | 18.5 | 23.9 | 57.4 | 22.1 | 59.8 | 27.7 / 29.7 / 5.5 | 17 |
| ori_best-t96u@13 | 13.4 | 60.3 | 10.7 | 65.7 | 11.6 | 19.7 | 54.3 | 16.1 | 59.4 | 15.0 / 16.8 / 3.4 | 0 |

## Confirmation with tesseract.js 5.1.1 (what the lens runs; lens crop, ~60-90 ms per line)

| run | body CER | body word% | body letter-CER | body letter-word% | body CER (sure lines) | head CER | head word% | head letter-CER | head letter-word% | body letter-CER sambad / samaja / dharitri | empty |
|---|---|---|---|---|---|---|---|---|---|---|---|
| tjs_ori_best-lens@13 | 11.2 | 66.9 | 8.5 | 72.0 | 10.2 | 18.2 | 58.5 | 14.7 | 63.2 | 12.2 / 12.3 / 3.3 | 0 |
| tjs_ori_fast-lens@13 | 11.2 | 67.9 | 8.6 | 72.8 | 9.9 | 18.1 | 59.3 | 14.6 | 64.4 | 12.0 / 12.8 / 3.2 | 0 |
| tjs_ori_fast-lens@7 | 17.6 | 65.4 | 16.5 | 69.7 | 15.7 | 23.8 | 59.7 | 21.7 | 62.1 | 20.7 / 26.9 / 5.8 | 13 |

tesseract.js and the CLI agree within 0.3 point.

## Per paper (body, ori_fast, lens crop)

| paper | lines | box height | psm 7 CER / word% | psm 13 CER / word% | psm 13 letter-CER / letter-word% |
|---|---|---|---|---|---|
| Sambad | 41 | 9-13 px (median 11) | 21.5 / 56.2 | 14.8 / 60.8 | 12.3 / 67.5 |
| Samaja | 36 | 10-13 px (median 12) | 28.0 / 50.2 | 16.1 / 55.6 | 12.7 / 58.4 |
| Dharitri | 60 | 15-21 px (median 18) | 7.4 / 82.4 | 6.0 / 79.4 | 3.1 / 85.8 |

## Known confusions (coordinator's list), body lines, counted on aligned word pairs

| model / setting | thi -> thu (ଥି read ଥୁ) | ya-phala dropped | aa sign dropped |
|---|---|---|---|
| ori_fast lens@7 | 5 / 24 | 7 / 35 | 30 / 363 |
| ori_fast lens@13 | 8 / 28 | 11 / 41 | 34 / 403 |
| ori_best lens@13 | 8 / 28 | 8 / 41 | 34 / 403 |

(errors / occurrences in the aligned truth words; ya-phala counted after merging ୍ଯ and ୍ୟ.)

## Weak spots of this truth set

- 197 lines from one day, 6 pages; 29 body and 3 headline lines carry a doubt flag (a letter I
  could not confirm at 5 px x-height, mostly ଇ/ଉ, ଲ/ଳ, ସ/ମ in Sambad's body face, and numbers).
  Three were settled by the OCR agreeing with a plausible reading after a second look
  (ନ୍ୟୁ, ମୋଦୀ, ଅଳକାନନ୍ଦା); two (କରାଯାଇଛି vs କରାଯାଉଛି) remain genuinely uncertain.
- Body lines were sampled from ori_fast's own line boxes (height band per paper, >= 3 words,
  width cap so a box is one column). That slightly favours lines the stock model segments
  cleanly; it does not affect the recognition comparison between models.
- Headline boxes are hand-drawn and tightened to the ink, so headline numbers measure
  recognition, not line finding.

---

# Addendum (owner request, same day): scanned books as three more regimes

## Book truth

Held-out pages (never used for training or pseudo-labels): Surendra *Galpabiksha* pp. 60, 140
(300 dpi typeset scan, rendered with `pdftoppm -r 300`); *Kuntalakumari* p. 220 and *Prachina Utkal*
pp. 80, 160 (96 dpi 1-bit CCITT scans, rendered at 288 dpi = 3x); *Ahetuki Basana* pp. 20, 35
(Akruti legacy font, text layer unusable, rendered at 300 dpi). Line boxes from ori_best page OCR
(psm 3); crops then go through the same lens pipeline as the ePaper lines.

| regime | lines | doubt-flagged | notes |
|---|---|---|---|
| book300 | 40 | 8 | clean; letters mostly certain; doubts are punctuation/quote marks and two conjunct spellings |
| book96 | 19 | 17 | **weak truth.** At 96 dpi 1-bit many letters are ambiguous even when zoomed; I transcribed only lines I could read as a whole, from context, and flagged nearly all. Kuntalakumari p. 100 (verse, archaic words) was skipped. Treat book96 numbers as indicative (±5 points). |
| typed | 19 | 9 | clear print; doubts are the Akruti font's ର vs ର୍ ending, ଲ vs ଳ, and one ଘ/ଢ. The author's spelling (e.g. ତୋର୍) is kept as printed. |

## Per-regime results, stock models (CLI; columns: CER / word% / letter-CER / letter-word%)

| run | body CER / word% / letter-CER / letter-word% (n=137) | head CER / word% / letter-CER / letter-word% (n=60) | book300 CER / word% / letter-CER / letter-word% (n=40) | book96 CER / word% / letter-CER / letter-word% (n=19) | typed CER / word% / letter-CER / letter-word% (n=19) | empty |
|---|---|---|---|---|---|---|
| ori_fast-lens@7 | 17.6 / 65.4 / 16.5 / 70.3 | 24.5 / 58.5 / 22.3 / 60.5 | 13.1 / 56.2 / 11.6 / 65.0 | 49.8 / 16.9 / 51.4 / 9.3 | 6.8 / 71.7 / 5.8 / 75.9 | 13 |
| ori_fast-lens@13 | 11.5 / 67.0 / 8.6 / 72.3 | 17.5 / 59.7 / 13.9 / 65.1 | 18.5 / 49.0 / 16.6 / 57.0 | 51.8 / 12.7 / 50.7 / 9.3 | 7.1 / 75.8 / 6.2 / 79.3 | 0 |
| ori_fast-t64@13 | 11.1 / 67.3 / 8.3 / 72.7 | 17.5 / 59.7 / 13.7 / 65.1 | 18.5 / 49.0 / 16.6 / 57.0 | 51.8 / 12.7 / 50.7 / 9.3 | 7.1 / 75.8 / 6.2 / 79.3 | 0 |
| ori_fast-t96@13 | 11.4 / 66.8 / 8.2 / 72.4 | 18.1 / 57.0 / 14.7 / 62.5 | 19.2 / 47.9 / 17.0 / 57.0 | 51.1 / 14.5 / 50.2 / 9.9 | 6.9 / 74.2 / 6.2 / 78.4 | 0 |
| ori_best-lens@7 | 17.6 / 65.8 / 16.3 / 70.4 | 24.2 / 58.5 / 21.9 / 60.9 | 13.1 / 56.4 / 11.5 / 65.0 | 48.2 / 19.3 / 50.2 / 11.3 | 7.1 / 72.5 / 6.0 / 76.7 | 13 |
| ori_best-lens@13 | 11.0 / 67.6 / 8.1 / 72.5 | 17.9 / 58.9 / 14.3 / 63.2 | 18.5 / 49.0 / 16.6 / 57.3 | 52.1 / 14.5 / 51.3 / 9.9 | 6.6 / 78.3 / 6.0 / 80.2 | 0 |
| ori_best-t64@13 | 11.3 / 67.6 / 8.6 / 71.9 | 17.9 / 58.5 / 14.3 / 62.8 | 18.5 / 49.0 / 16.6 / 57.3 | 52.1 / 14.5 / 51.3 / 9.9 | 6.6 / 78.3 / 6.0 / 80.2 | 0 |
| ori_best-t96@13 | 11.0 / 66.6 / 8.0 / 72.3 | 18.2 / 56.6 / 14.8 / 61.3 | 19.0 / 48.8 / 16.8 / 57.5 | 51.4 / 13.9 / 50.5 / 9.9 | 6.9 / 74.2 / 6.3 / 78.4 | 0 |

| run (doubt-free lines only) | body letter-CER (n=108) | head letter-CER (n=57) | book300 letter-CER (n=32) | book96 letter-CER (n=2) | typed letter-CER (n=10) |
|---|---|---|---|---|---|
| ori_fast-lens@7 | 14.6 | 21.4 | 11.8 | 43.3 | 5.1 |
| ori_fast-lens@13 | 7.4 | 12.7 | 16.7 | 44.3 | 7.5 |
| ori_fast-t64@13 | 7.2 | 12.6 | 16.7 | 44.3 | 7.5 |
| ori_fast-t96@13 | 7.0 | 13.5 | 16.9 | 44.3 | 6.8 |
| ori_best-lens@7 | 14.4 | 21.0 | 11.7 | 40.2 | 5.5 |
| ori_best-lens@13 | 7.2 | 13.1 | 16.7 | 43.3 | 7.2 |
| ori_best-t64@13 | 7.5 | 13.0 | 16.7 | 43.3 | 7.2 |
| ori_best-t96@13 | 7.0 | 13.6 | 16.6 | 44.3 | 7.2 |

Findings for the books:

- **book300 (clean scan): psm 7 is better than psm 13** (letter-CER 11.6 vs 16.6). On long,
  clean lines psm 13 splits or drops words more often. So the cheap lens fix is "psm 7, and psm 13
  only when psm 7 returns nothing", not "psm 13 always". ePaper body: same fix recovers the 13
  empty lines; on the rest psm 7 and psm 13 are equal.
- **book96 is not readable with the stock model** (~50 % CER, ~10 % words). No preprocessing
  variant helps (the clamp/upscale rows are equal).
- **typed (Akruti) is already good** (~6 % letter-CER); remaining errors are ଜ→କ, ପ→ସ, ଥ shapes.
- The book300 page font is an older typeface: stock errors are ଯ→ପ, missing ya-phala, ୍ର→ୃ/ୁ,
  ତ୍ତ→ଞ — the same confusion families as the ePaper body text.
