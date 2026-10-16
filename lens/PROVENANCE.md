# Odia Lens: third-party parts and data

The extension's own code is this project's (MIT). It packs these parts:

| Part | From | Licence | In the extension |
|---|---|---|---|
| Tesseract OCR engine in WebAssembly | `tesseract.js-core` 5.1.1 (npm), file `tesseract-core-simd-lstm.wasm.js` | Apache-2.0 (`ocr/LICENSE-tesseract.js-core.txt`) | `ocr/` |
| tesseract.js worker and API | `tesseract.js` 5.1.1 (npm): `dist/worker.min.js`, and the API bundled into `offscreen.js` | Apache-2.0 (`ocr/LICENSE-tesseract.js.md`) | `ocr/`, `offscreen.js` |
| Odia OCR model (V4.3) | This project's fine-tune of `tesseract-ocr/tessdata_best` `ori.traineddata` (Apache-2.0; modified: retrained on rendered lines), kept at `lens/vendor/ori.traineddata`. Trained only on open text: IndicCorp v2 word counts (CC0) and the Aksharantar `ori` word list (CC-BY 4.0, AI4Bharat), rendered in five OFL fonts; no news text, page or scan. Sources and checksums: `plan/research/v43-ocr-model/clean-PROVENANCE.md` | Apache-2.0 (modified model) | `ocr/ori.traineddata` |
| PDF reader (V4.6): pdf.js | `pdfjs-dist` 6.3.289 (npm), legacy build: `legacy/build/pdf.mjs` (bundled into `reader.js`, sha256 `91e29f81…cfbd8d`) and `legacy/build/pdf.worker.min.mjs` (sha256 `a33cfe72…49b84e`) | Apache-2.0 (`pdf/LICENSE-pdf.js.txt`) | `reader.js`, `pdf/` |
| pdf.js image decoders | `pdfjs-dist` 6.3.289 `wasm/`: `jbig2.wasm` (sha256 `e6bee677…7cfdc`; PDFium, BSD-3-Clause, and Apache-2.0), `openjpeg.wasm` (`004a0e62…8ba`; OpenJPEG, BSD-2-Clause), `qcms_bg.wasm` (`663d8612…800e`; qcms, MIT) | licence files in `pdf/wasm/` | `pdf/wasm/` |
| pdf.js standard fonts | `pdfjs-dist` 6.3.289 `standard_fonts/`: the Foxit `.pfb` fonts only (the Liberation fonts are left out: their licence is GPL with a font exception) | BSD-3-Clause, PDFium (`pdf/standard_fonts/LICENSE_FOXIT`) | `pdf/standard_fonts/` |
| Word list for OCR correction | `core/data/indiccorp-words.tsv` (IndicCorp v2 word counts) | CC0 | `dict/words.bin` |
| Dictionaries | the app's `Appv2/src/dictionary/*.bin`, `loans.tsv`; `core/data/glosses.tsv`, `meanings.tsv`, `verb-endings.tsv` | see `Odia_Sanskrit_Appv2/PROVENANCE.md`, `Appv2/src/dictionary/PROVENANCE.md`, `core/data/PROVENANCE.md` | `dict/`, `background.js` |

Checksums (SHA-256):

| File | Bytes | SHA-256 |
|---|---|---|
| `lens/vendor/ori.traineddata` (own fine-tune "ori-lens-clean", 2026-10-15; replaces tessdata_fast `36f3135e…cdbac`) | 1,480,126 | `1fcb6e1c5bb49fa17e5c7820a42774dfc4317a83c3321925e3a45a38d5c9eac4` |
| `node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js` (5.1.1) | 3,938,657 | see `package-lock.json` integrity |
| `node_modules/tesseract.js/dist/worker.min.js` (5.1.1) | 123,724 | see `package-lock.json` integrity |

No Desh data is in the extension. Nothing is fetched from the network at run time.

**Odia Lens for Mac** (`mac-lens/`, owner testing): the same `ori.traineddata` and the
same dictionary files (built by `node lens/build.mjs --mac`); the OCR engine is the
`tesseract` program the owner installs with Homebrew (Apache-2.0), not packed in the app.
