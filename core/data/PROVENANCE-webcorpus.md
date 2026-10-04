# PROVENANCE — `webfreq.tsv` and `common-seed.tsv`

Corpus-wide Odia word-frequency table harvested from the live web on **27 July 2026**,
merged from five independent harvest lanes plus one OCR lane.

**This is build-time-only data.** It was gathered by scripts under
`tools/build-data/webcorpus/`, which make network calls. Nothing in the shipped engine,
CLI, web page, desktop app or macOS IME ever makes a network call — see `plan/04-scope.md`.
The two files here are static committed artifacts, no different from `lexicon.tsv`.

## Why this corpus exists

The shipped lexicon derives from AI4Bharat Aksharantar, which is a transliteration-pair
dataset, not a frequency list of ordinary Odia. Measured against it, only **1 of 25**
everyday Odia words appears at all, mean entry length is 8.7 characters, and 3.2% of
entries are ≤4 characters. This corpus supplies the missing everyday register and the
frequency signal needed to rank candidates.

## Files

| File | Rows | Tokens | Description |
|---|---|---|---|
| `webfreq.tsv` | 527,477 | 18,363,293 | `word <TAB> count`, count-descending. Full merged table. |
| `common-seed.tsv` | 1,500 | 8,778,568 | Top 1,500 by frequency (47.8% of all tokens). Raw material for the curated common-word lexicon — **not yet curated**. |

Both files are NFC-normalised, verified by code point: 0 NFC-unstable keys,
0 precomposed U+0B5C / U+0B5D, 0 single-character keys, 0 keys with a non-Odia-block
code point, 0 sort-order violations.

## Lanes merged

Harvest date **2026-07-27** unless noted. Token counts are post-filter.

| Lane | Input file | Types | Tokens | Sources |
|---|---|---:|---:|---|
| wikipedia | `wikipedia-freq.tsv` | 342,270 | 5,274,029 | or.wikipedia (20,915 articles) + or.wikisource (760 works), from the official Wikimedia XML dumps dated **2026-07-02** |
| literature | `lit-freq.tsv` | 227,801 | 2,757,415 | 29 blogs, literary magazines and story sites (odishasahitya.com, odiasahitya.com, shubhapallaba.in, odiarasika.in, kantiokatha.blogspot.com, smaranika.in, …) + or.wikisource page-namespace |
| news | `news-freq.tsv` | 30,125 | 343,131 | 1,042 articles from 19 Odia-language outlets (sambad.in, dharitri.com, odia.news18.com, odishabhaskar.com, prameya.com, kanaknews.com, …) |
| social | `social-politicians-freq.tsv` | 23,357 | 246,049 | 279 x.com posts/replies from 60 Odia-posting handles + 433 Odia news pages quoting social posts |
| gov | `gov-and-orgs-freq.tsv` | 13,545 | 69,123 | 479 pages from 78 `*.odisha.gov.in` / `*.nic.in` hosts under the `/or` locale path |
| archive_ocr | `archive-books-freq.tsv` | 147,116 | 9,673,546 | 200 scanned Odia books from archive.org, OCR text, **thresholded at count ≥ 5** |

Wikimedia dump checksums (SHA-256):

```
orwiki-latest-pages-articles.xml.bz2        99c0583e30a3dbd54f08d5e554cadcc4e5442ad7a92d1291b42cfbe48995335d
orwikisource-latest-pages-articles.xml.bz2  9e7adebff0cff48339370ac2f578cf14aa9101878cb7ea66e86b646c080ddc58
```

### Files deliberately NOT merged, to avoid double counting

`news-freq-raw.tsv` (unstripped twin of `news-freq.tsv`), `govorgs-freq.tsv` (pre-repair
twin), `govorgs-freq-repaired.tsv` (byte-identical duplicate),
`lit-freq-everyday.tsv` and `lit-freq-classical.tsv` (components of `lit-freq.tsv`),
`social-politicians-x-only-freq.tsv` (subset of `social-politicians-freq.tsv`).

## Merge procedure

`tools/build-data/webcorpus/merge_all.py`. Python 3 stdlib only. For every key:

1. NFC-normalise (`unicodedata.normalize("NFC", …)`), matching `canonical()` in
   `core/src/normalize.ts`.
2. Drop the key if any code point lies outside the Odia block U+0B00–U+0B7F.
3. Drop single-code-point keys.
4. Drop keys containing an Odia digit U+0B66–U+0B6F, or containing no base letter.
5. Sum counts across lanes.

The archive.org OCR lane is thresholded at count ≥ 5 before merging. Below that its tail
is 79.6% hapax and is dominated by OCR noise.

### What the filters removed

- **Single-code-point keys**: 612,676 tokens across 77 types. This includes the single
  most frequent word in written Odia, ଓ ("and", 260,939), plus ଏ, ନ, ର, ତ, କ. They are
  excluded by the spec above; an IME does not need frequency ranking for a one-keystroke
  input, but be aware they are absent by construction, not because they are rare.
- **Non-Odia-block keys**: 106,367 tokens across 11,719 types. Two distinct populations:
  - Words with a **word-internal right single quote U+2019**, which is real Odia
    orthography: ତା’ର (14,113), କ’ଣ (8,034), ତା’ପରେ (2,030), ତୋ’ର, ମୋ’ର, ଯା’ର.
    These are genuine high-frequency words and their loss is a real gap in this table.
    If `core/src/segment.ts` treats U+2019 as word-internal between Odia letters, the
    filter in step 2 should be widened to admit it and the merge re-run.
  - ZWJ/ZWNJ debris from legacy encodings: ଏଥ୍‌ରେ (1,535), କରିଥ୍‌ଲେ (890) — correctly dropped.

## Licensing

| Source | Licence | Note |
|---|---|---|
| or.wikipedia, or.wikisource | CC BY-SA 4.0 + GFDL | **Share-Alike.** This is *not* in the MIT / CC0 / CC-BY set listed in `CLAUDE.md`. A licence decision is required before these counts ship. |
| archive.org scanned books | mixed; mostly public domain (pre-1930 Odia imprints) | Per-item licence not individually verified. |
| News sites, blogs, x.com, government portals | no explicit licence | Harvested as unattributed **word frequency counts**, not as reproduced text. No source text is shipped; only integer counts over word types. |

Raw harvested text stays under `tools/build-data/webcorpus/` and is **not** shipped.
Add `tools/build-data/webcorpus/*.bz2`, `*.jsonl`, `*.jsonl.gz` and `*.txt` to
`.gitignore` before committing — `.gitignore` currently only excludes
`tools/build-data/raw/`.

## Known biases — read before using this as a ranking prior

1. **Register is not conversational.** 44% of tokens come from encyclopedic Wikipedia and
   another 53% from scanned printed books. ତୁମେ ranks 292, କେମିତି 874, ଛୁଆ 3,843. The
   `everyday.tsv` register the quality bar targets is under-represented; the news and
   social lanes are only 3.2% of tokens combined.
2. **The OCR lane is half the token mass.** Excluding it changes the top-1,500 seed list
   by 19% (1,215 of 1,500 words are shared; 81 of the top 100 are shared). A born-digital-only
   merge is preserved at `tools/build-data/webcorpus/webfreq-noocr.tsv` (454,750 types /
   8,689,747 tokens) if the classical-print skew proves harmful. Coverage-vs-Aksharantar
   is stable across both (14.0% vs 15.0% at top-100), so the headline finding does not
   depend on this choice.
3. **News-cycle spikes** from a single crawl date: ଇସ୍ତଫା, ଧର୍ମେନ୍ଦ୍ର, ନୀଳାଦ୍ରି. Re-crawling
   across several dates and pooling would wash these out; the harvesters are idempotent.
4. **Wikisource is double-counted in register terms.** The wikipedia lane and the
   literature lane both harvested or.wikisource, by different routes (XML dump vs
   MediaWiki API). Overlapping documents inflate the classical-literary weighting.
5. **No morphological analysis.** ଓଡ଼ିଶା / ଓଡ଼ିଶାର / ଓଡ଼ିଶାରେ are separate types.
6. **Government lane over-weights administrative vocabulary** — ଜିଲ୍ଲା, ଶ୍ରୀ, କାର୍ଯ୍ୟାଳୟ
   are artifacts of officer-directory pages.

## Nukta status

Every key in both files stores ଡ଼ and ଢ଼ **decomposed**, per the project invariant:

```
ଓଡ଼ିଶା = U+0B13 U+0B21 U+0B3C U+0B3F U+0B36 U+0B3E
ବଡ଼    = U+0B2C U+0B21 U+0B3C
ପଢ଼ା   = U+0B2A U+0B22 U+0B3C U+0B3E
```

Zero precomposed U+0B5C / U+0B5D survive in either output file. Three lanes independently
confirmed that precomposed forms **do** appear on the wire before normalisation
(11–25% of nukta occurrences depending on source), so the NFC pass is load-bearing, not
decorative. Full analysis: `tools/build-data/webcorpus/MERGED-nukta.json` and
`MERGED-nukta-pairs.tsv`.

## Reproducing

```bash
cd tools/build-data/webcorpus
python3 merge_all.py            # writes core/data/webfreq.tsv + common-seed.tsv
python3 merge_all.py --no-ocr   # born-digital only, same output paths
python3 nukta_merged.py         # writes MERGED-nukta.json
```
