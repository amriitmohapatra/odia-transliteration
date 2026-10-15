# Lens v2: reading Odia in pictures (OCR spike, 2026-10-15)

Owner's aim (2026-10-15): the lens should read Odia ePapers (Sambad, Dharitri, Samaja),
which are page **images**, and headlines in YouTube videos. Translation of what it reads
comes later (V4.5). This file holds the measurements that decide the design.

## 1. What the ePapers serve

| Site | Page as | Largest image found | Notes |
|---|---|---|---|
| sambadepaper.com | JPEG per page, `epaperimages//DDMMYYYY//DDMMYYYY-md-<ed>-<page>.jpg` | 996 × 1520 | `-<page>s.jpg` 664 px, `ss` 83 px thumbnails; no larger size (`l`, `z`, `hd` all 404). The viewer's zoom enlarges the same image. |
| samajaepaper.in | same layout, same viewer | 1024 × 1520 | |
| dharitriepaper.in | `/edition/<id>/<name>` pages | not measured yet | |

At 996 px for a whole broadsheet page, **body text is about 5–6 px x-height**. Headlines are
25–40 px. So body text is near the limit of what any OCR can read; zooming in the viewer
adds no detail. Headlines and sub-heads are the realistic first target.

Page images were kept in the session scratchpad only, never in the repository
(copyright; CLAUDE.md: no scraped content in the repository).

## 2. Engine: Tesseract `ori` in WebAssembly (tesseract.js 5.1.1)

All models Apache-2.0 (`tesseract-ocr/tessdata_fast`, `tessdata_best`):

| Model | Size | SHA-256 |
|---|---|---|
| `tessdata_fast/ori.traineddata` | 1,480,066 B | `36f3135e61d501a3acfad41f5fe60b8e791274fff4c5375c969fdcca980cdbac` |
| `tessdata_best/ori.traineddata` | 8,110,602 B | `90dfe91cea0b25cf96b2bb283905ba1452534776df3f00d47530939d56339534` |
| `tessdata_best/script/Oriya.traineddata` | 16,265,327 B | `beafed2d6bff8c0c86d87c18308928924ffd7b2eec96cc4ffdf731c321494187` |
| `tessdata_fast/script/Oriya.traineddata` | 5,744,929 B | `39fc17f9e30eee261ac08b2d9d3c82bf28e69cff7c38d0a3aea19f1023410ade` |

### 2a. Rendered text (exact ground truth)

240 twelve-word passages from the news corpus, rendered with Noto Sans Oriya at body size
(11.5 px) and headline size (28 px bold), saved as JPEG quality 60, then grey + 3× upscale.
Word accuracy (whole words exactly right):

| Model | Body | Headline |
|---|---|---|
| `ori` fast | 87.6% | 96.6% |
| `ori` best | 86.1% | 96.7% |
| `Oriya` best (script model) | 88.3% | 96.7% |

The fast model is as good as the large ones here, at 1.5 MB.

### 2b. Real ePaper page (Samaja, 14 Oct 2026, page 3)

- **Whole page** (1024 px, 2× upscale, automatic layout): 17 s (fast model), 25 s (best).
  Body text comes out partly right (many words exact; matras and conjuncts often wrong).
  **Headline words: 46.9% (fast), 43.8% (best)**, from 13 headlines (69 words): spaces between
  words are lost in large type, and parts of conjuncts are dropped (ପ୍ରକଳ for ପ୍ରକଳ୍ପ).
- **One headline line at a time** (crop, grey, normalise, 2×, single-line mode): **100–320 ms
  per line**, clearly better. Example: `୫ବାଇକ୍‌କୁ ଧକା,ଜଣେମୃତ, ୫ଗୂରୁତର` for ୫ ବାଇକ୍‌କୁ ଧକ୍କା; ଜଣେ ମୃତ, ୫ ଗୁରୁତର.
  The newspapers' own display fonts often lose the i-matra and conjunct parts:
  ପରବାର (ପରିବାର), ଆବାସକ (ଆବାସିକ), ପ୍ରଜା (ପୂଜା).

### 2c. Dictionary correction

Word list: IndicCorp v2 Odia word counts (CC0), top 200,000 words, the 1930s-spelling fold.
Unknown OCR words snap to the most frequent known word within edit distance 2.

| | Before | After |
|---|---|---|
| Rendered body | 87.6% | 90.5% |
| Rendered headline | 96.6% | 95.8% (rare names were "corrected" wrongly) |
| Real headlines, whole page | 46.9% | 47.8%; with splitting of run-together words 51.6% |

Correction helps where the word is close and common; it cannot fix a word that the OCR turned
into another real word (ସମାନ "equal" for ସମ୍ମାନ "honour"). That needs context (word pairs).

## 3. Conclusions

1. **Stock Tesseract is fast enough** for hover use when it reads one line at a time
   (0.1–0.3 s), and **good on clean print** (rendered text: 88% body, 97% headlines).
2. **On real Odia newspaper fonts it is weak** (about half of headline words exactly right on
   a whole page; better line by line). The gap is the training data: the stock model has seen
   few Odia fonts and no newsprint.
3. The fix is **our own trained model**: fine-tune Tesseract's LSTM (or a small recognizer)
   on Odia text rendered in many newspaper-like fonts with newsprint damage (low resolution,
   JPEG, blur), from our own corpus, so ground truth is free and unlimited. Output is one
   `.traineddata` file that the same engine loads. Target: ≥85% exact words on real
   headlines, ≥70% on body text at ePaper resolution.
4. The lens must **show what it read** ("read as: …", with a confidence mark), so a wrong
   reading is visible, never silently explained.

## 4. Design for V4.2 (picture mode)

- Capture: `chrome.tabs.captureVisibleTab` (allowed by `activeTab`, no host permission;
  works for `<img>`, `<canvas>`, PDF viewers and paused, non-DRM video). Device pixels → CSS
  pixels before hit-testing. Chrome limits captures to about 2 per second: capture once when
  scrolling stops, then hover is a lookup in cached word boxes.
- OCR: tesseract.js in an **offscreen document** (`offscreen` permission), worker, WASM core
  and `ori.traineddata` bundled in the extension (no remote code; CSP `wasm-unsafe-eval`).
  Read the text line under the pointer (find the line band, crop, 2×, single-line mode);
  cache results per screenshot.
- After OCR: `canonical()` (OCR emits precomposed nukta), dictionary correction, then the
  same `describeWord` card as v1, with "read as: …".
- Privacy stays as in v1: nothing leaves the computer.

## 5. Stages

| Stage | What | Depends on |
|---|---|---|
| V4.2 | Picture mode with the stock fast model + correction: ePapers, images, paused videos | this spike |
| V4.3 | Own Odia print model (fine-tuned Tesseract), measured on real pages | fonts with open licences; CPU hours |
| V4.4 | YouTube: on-screen headlines in the video frame (OCR); Odia captions are page text, which v1 may already read (to check) | V4.2 |
| V4.5 | Translate a headline or sentence: online, opt-in, through the assist layer (D-2), never inside the offline lens | V3 `/api/translate` |
