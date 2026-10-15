# Odia Lens: third-party parts and data

The extension's own code is this project's (MIT). It packs these parts:

| Part | From | Licence | In the extension |
|---|---|---|---|
| Tesseract OCR engine in WebAssembly | `tesseract.js-core` 5.1.1 (npm), file `tesseract-core-simd-lstm.wasm.js` | Apache-2.0 (`ocr/LICENSE-tesseract.js-core.txt`) | `ocr/` |
| tesseract.js worker and API | `tesseract.js` 5.1.1 (npm): `dist/worker.min.js`, and the API bundled into `offscreen.js` | Apache-2.0 (`ocr/LICENSE-tesseract.js.md`) | `ocr/`, `offscreen.js` |
| Odia OCR model | `tesseract-ocr/tessdata_fast`, `ori.traineddata`, kept at `lens/vendor/ori.traineddata` | Apache-2.0 | `ocr/ori.traineddata` |
| Word list for OCR correction | `core/data/indiccorp-words.tsv` (IndicCorp v2 word counts) | CC0 | `dict/words.bin` |
| Dictionaries | the app's `Appv2/src/dictionary/*.bin`, `loans.tsv`; `core/data/glosses.tsv`, `meanings.tsv`, `verb-endings.tsv` | see `Odia_Sanskrit_Appv2/PROVENANCE.md`, `Appv2/src/dictionary/PROVENANCE.md`, `core/data/PROVENANCE.md` | `dict/`, `background.js` |

Checksums (SHA-256):

| File | Bytes | SHA-256 |
|---|---|---|
| `lens/vendor/ori.traineddata` (tessdata_fast, fetched 2026-10-15) | 1,480,066 | `36f3135e61d501a3acfad41f5fe60b8e791274fff4c5375c969fdcca980cdbac` |
| `node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js` (5.1.1) | 3,938,657 | see `package-lock.json` integrity |
| `node_modules/tesseract.js/dist/worker.min.js` (5.1.1) | 123,724 | see `package-lock.json` integrity |

No Desh data is in the extension. Nothing is fetched from the network at run time.
