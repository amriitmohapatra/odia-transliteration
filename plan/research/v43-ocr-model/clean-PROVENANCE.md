# ori-lens-clean: provenance (clean sources only)

`clean/ori-lens-clean.traineddata` was trained **only** from the sources below. No scraped text, no
newspaper page, no book scan and no pseudo-labelled real line went into its training. The held-out
truth set (`v43/truth.json`, real ePaper and book lines) was used only to measure the finished model.

## Base model

| item | source | licence | sha256 |
|---|---|---|---|
| `ori.traineddata` from tessdata_best (float LSTM, 8,110,602 B), fine-tuning start point; its unicharset and dictionaries (dawgs) are kept unchanged | `https://github.com/tesseract-ocr/tessdata_best/raw/main/ori.traineddata` | Apache-2.0 | `90dfe91cea0b25cf96b2bb283905ba1452534776df3f00d47530939d56339534` |

The result is a modified version of an Apache-2.0 file: keep the licence and note the modification.

## Text (words only; lines are random word sequences, not sentences)

| source | licence | sha256 | use |
|---|---|---|---|
| `core/data/indiccorp-words.tsv`: the 100,000 most frequent Odia words of AI4Bharat IndicCorp v2 with counts | CC0 | `abe6815b691b311b5c561a97205366f9bb9c608b686d87c87a01051913e5e3aa` | 90 % of words; sampled by count^0.6 (80 %) or uniformly (10 %); words with ଥି or ya-phala weighted x2.5 |
| `core/data/lexicon.tsv.aksharantar-only`: AI4Bharat Aksharantar `ori` word list (Odia column only) | CC-BY 4.0 (attribution: AI4Bharat, Aksharantar) | `b49bfb887ed0b642e7ed3e73c0b25c0df38655b52aa975e4c45d9440ee7e647e` | 4 % of words, uniformly |
| generated tokens (`scripts/gen_text_clean.py`): Odia numerals, dates like ୧୪/୧୦, years, decimals, %, punctuation । , : ? ! - quotes brackets | none (generated) | — | ~6 % of tokens, punctuation inserted at random |

Generated text: `clean/train/text/train.txt` (60,000 lines, sha256
`d063011ef9a76b2cb3deffd36fad67b84b4a32b1ea0be58cf44396bf16c1ad5b`) and `eval.txt` (3,000 other lines).

## Fonts (SIL OFL 1.1), used only to render training images; not shipped

| font | URL | font sha256 |
|---|---|---|
| Noto Sans Oriya (variable) | `https://raw.githubusercontent.com/google/fonts/main/ofl/notosansoriya/NotoSansOriya[wdth,wght].ttf` | `910342275d619081b896b4ed25fd9ad6ff320c25591b810de1fcc4beb153ba82` |
| Noto Serif Oriya (variable) | `https://raw.githubusercontent.com/google/fonts/main/ofl/notoseriforiya/NotoSerifOriya[wght].ttf` | `9fa2a08cb6a677d155a823bc58b4c587613780bd43013fd362369c251001502a` |
| Anek Odia (variable) | `https://raw.githubusercontent.com/google/fonts/main/ofl/anekodia/AnekOdia[wdth,wght].ttf` | `673bb6e51b71af1de1f11f9a547a3a58c50a6fa32d480958e1ef0f06980ca45f` |
| Baloo Bhaina 2 (variable) | `https://raw.githubusercontent.com/google/fonts/main/ofl/baloobhaina2/BalooBhaina2[wght].ttf` | `d22904b7337723201c910edf70be2de6136ec65be366f2b0e6489860f1343f04` |
| Lohit Odia 2.91.2 | Ubuntu `fonts-lohit-orya_2.91.2-2_all.deb` (`http://archive.ubuntu.com/ubuntu/pool/main/f/fonts-lohit-orya/`), upstream `https://pagure.io/lohit` | `11e15def92dc68ed3a7509200e11a668658c0d46ad0235cc1d7f0403751736b7` |

OFL.txt files are kept next to the fonts in `v43/fonts/`.

## Images

All training and selection images are synthetic, made by `scripts/render.py` from the text above:
24,000 "newsprint" lines (box height 8.5-60 px, weight/width variation, 8 % reverse type,
neighbour-line slivers, blur, noise, JPEG q40-80, slight rotation) and 8,000 "bilevel 96 dpi" lines
(shrink to 10.5-17 px, threshold to 1 bit, enlarge 3x), each then cropped and scaled exactly as the
lens does (pad 0.35 x height, x min(4, 64/h), invert if dark). Checkpoint selection used only the
synthetic held-out sets (500 + 300 lines from separately generated text).

## Tools

Tesseract 5.3.4 training tools (Apache-2.0), Pillow 12.3.0 with libraqm, numpy.
