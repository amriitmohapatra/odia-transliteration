# Odia Lens for Windows: third-party parts

The app's own code is this project's (MIT). It packs these parts:

| Part | From | Licence | In the app |
|---|---|---|---|
| WebView2 SDK | NuGet `Microsoft.Web.WebView2` 1.0.4258.31 (published 2026-09-28), package sha256 `56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9` | BSD-3-Clause (Microsoft, the package's `LICENSE.txt`) | `Microsoft.Web.WebView2.*.dll`, `WebView2Loader.dll` |
| Odia OCR model | `lens/vendor/ori.traineddata` (tessdata_fast; see `lens/PROVENANCE.md`) | Apache-2.0 | `tessdata\ori.traineddata` |
| The shared page and dictionaries | `node lens/build.mjs --mac` (see `lens/PROVENANCE.md`) | see there | `web\` |

Not packed, installed by the user: the .NET 8 Desktop Runtime (MIT), the WebView2 Runtime
(Microsoft), Tesseract OCR (Apache-2.0, UB Mannheim build).
