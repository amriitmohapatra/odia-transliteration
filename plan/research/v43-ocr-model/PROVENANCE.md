# v4.3 fine-tune: provenance

Everything here lives in the scratchpad (`v43/`); nothing was written to the repository.

## Base model

| item | source | licence | sha256 |
|---|---|---|---|
| `ori_best` `ori.traineddata` (float LSTM, 8,110,602 B) — fine-tuning start point | `tesseract-ocr/tessdata_best`, `https://github.com/tesseract-ocr/tessdata_best/raw/main/ori.traineddata` (copy at `ocr/models/ori_best/`) | Apache-2.0 | `90dfe91cea0b25cf96b2bb283905ba1452534776df3f00d47530939d56339534` |
| `ori_fast` `ori.traineddata` (int, 1,480,066 B) — what the lens ships today (`lens/vendor/ori.traineddata`, same bytes) | `tesseract-ocr/tessdata_fast`, `https://github.com/tesseract-ocr/tessdata_fast/raw/main/ori.traineddata` | Apache-2.0 | `36f3135e61d501a3acfad41f5fe60b8e791274fff4c5375c969fdcca980cdbac` |

Note: `lstmtraining --stop_training --convert_to_int` on unmodified ori_best gives a 1,480,082-byte
file, i.e. tessdata_fast's `ori` is the int conversion of the same network. The fine-tuned int
model is therefore the same size as what the lens ships.

The candidate model `ori-lens.traineddata` is a derivative of the Apache-2.0 model (fine-tuned
weights, same unicharset, same dictionaries/dawgs). Apache-2.0 section 4 applies: keep the
licence and state that the file was modified.

## Training text

| source | licence / status | use |
|---|---|---|
| `tools/build-data/webcorpus/news-raw.jsonl` (1,042 scraped Odia news pages, sha256 `227b544082d7a6f554145621375d173d8b5b57c3a1e1c3561ec2d2beed9a891c`) | third-party news text, **not** covered by the project's MIT licence | **Rendered only**, in the scratchpad, into synthetic line images (`train/text/*.txt`, `train/synth/`). The text is not copied anywhere else and is not in the model as text. Note that an LSTM trained on rendered lines does not contain the sentences, but its character-sequence priors are shaped by them. |
| Real ePaper line crops, 40 non-held-out pages of Sambad / Samaja / Dharitri, 2026-10-15 (`epaper/img/`) | copyrighted newspaper pages | Pseudo-labelled line images for training (`train/real/`), scratchpad only. Labels are ori_best's own readings, filtered (below). |
| Scanned Odia books from odia.org (`odiaorg/pdf/`): Surendra *Galpabiksha* (300 dpi) sha256 `976730fcb9ad4a5245c51a0ea77a6a4157286b3a4c0a8e581a3167aa8e54265e`; *Kuntalakumari* (96 dpi 1-bit) `ce8ccf9b92d769f64b2285238ff0ee860b46499e1a146189d5c6ad2821c2d5e7`; *Prachina Utkal* (96 dpi 1-bit) `27d92b35b2022a110397e5f07b652ab70e989cf02916b7bb44486c3077bd3106`; *Ahetuki Basana* (Akruti font) `2838327ced0240bb6bea8f5fe74f48437df38a04fd3a59e4bb7365e13117365d` | third-party scans; copyright status per book not checked here | Held-out pages: truth lines only. Other pages: 106 pseudo-labelled line crops for training (`train/real/books/`), scratchpad only. |
| `core/data/indiccorp-words.tsv` (IndicCorp v2 Odia word counts, CC0; sha256 `abe6815b691b311b5c561a97205366f9bb9c608b686d87c87a01051913e5e3aa`) | CC0 | Filter for pseudo-labels: every word must be attested. |
| `ep/ocr-misreads.txt` (coordinator's list of high-confidence misreads; sha256 `fda9c74b694895fd2c04ca5832b14ec2ec34bd6e8ac6d00cf4d04871ef800ace`) | project-internal | Blocklist for pseudo-labels. |

## Fonts (OFL 1.1), used only to render synthetic training lines

| font | URL | licence file sha256 | font sha256 |
|---|---|---|---|
| Noto Sans Oriya (variable wdth, wght) | `https://raw.githubusercontent.com/google/fonts/main/ofl/notosansoriya/NotoSansOriya[wdth,wght].ttf` | OFL.txt `c90ff15ade263a49148e35af34e9c177c6d56881e81260b29f10123e9e227eca` | `910342275d619081b896b4ed25fd9ad6ff320c25591b810de1fcc4beb153ba82` |
| Noto Serif Oriya (variable wght) | `https://raw.githubusercontent.com/google/fonts/main/ofl/notoseriforiya/NotoSerifOriya[wght].ttf` | OFL.txt `c90ff15ade263a49148e35af34e9c177c6d56881e81260b29f10123e9e227eca` | `9fa2a08cb6a677d155a823bc58b4c587613780bd43013fd362369c251001502a` |
| Anek Odia (variable wdth, wght) | `https://raw.githubusercontent.com/google/fonts/main/ofl/anekodia/AnekOdia[wdth,wght].ttf` | OFL.txt `de62be758bba267e653a5f457dfebb4680957e2c343eb3e7de15aff4746bed05` | `673bb6e51b71af1de1f11f9a547a3a58c50a6fa32d480958e1ef0f06980ca45f` |
| Baloo Bhaina 2 (variable wght) | `https://raw.githubusercontent.com/google/fonts/main/ofl/baloobhaina2/BalooBhaina2[wght].ttf` | OFL.txt `ad09b05dc8bc678c9daf7c4c5f7ef1f55e5726127f4330b2e98e40b9dffcb860` | `d22904b7337723201c910edf70be2de6136ec65be366f2b0e6489860f1343f04` |
| Lohit Odia 2.91.2 | Ubuntu package `http://archive.ubuntu.com/ubuntu/pool/main/f/fonts-lohit-orya/fonts-lohit-orya_2.91.2-2_all.deb` (deb sha256 `1ee853ea095073b3f35bd9bc2be99df269eda8330b8747df9c12085da67a5606`); upstream `https://pagure.io/lohit` | OFL-1.1 per the package `copyright` file (sha256 `4b9b4fc06fd64d1e76a86d92ba4dbe438c03ea012e5e778b8c6fd19f1d005e2f`) | `11e15def92dc68ed3a7509200e11a668658c0d46ad0235cc1d7f0403751736b7` |

Fonts are not shipped in or with the model.

## Tools

Tesseract 5.3.4 (`tesseract`, `lstmtraining`, `combine_tessdata`), Pillow 12.3.0 with libraqm
(HarfBuzz shaping) for rendering, numpy 2.4.6, tesseract.js 5.1.1 for the confirmation runs.
