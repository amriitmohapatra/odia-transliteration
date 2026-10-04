# Research 03: Odia "translation lens", feasibility

Date: 2026-10-04. Research only, no repository files changed.

**Method note:** In this sandbox WebFetch could reach only github.com, raw.githubusercontent.com and
developer.apple.com. Google, Vercel, MDN, Hugging Face, arXiv, support.apple.com, iiit.ac.in and
Sarvam docs were egress-blocked, and the session hit its 200-search cap near the end. Claims tagged
**[search-summary]** come from search-engine result summaries, not a primary page fetch. Treat
them as likely but unverified. Claims tagged **[verified]** come from a primary page or file I
read directly.

---

## 0. Headline findings

1. **No platform's built-in OCR reads Odia.** Apple Vision and Live Text, Google ML Kit v2, and
   Chrome's on-device Translator API all leave Odia out. On every native platform, Odia OCR has to
   come from bundled Tesseract `ori`, a server model or a cloud API. This is the most important
   feasibility fact here.
2. **A Vercel-hosted web page cannot see other apps or tabs**, except through `getDisplayMedia()`
   screen-share. That API is desktop-only (no iOS Safari, no Android Chrome), and the user has to
   pick a source in a browser prompt every session.
3. **A browser extension covers most real Odia on the web with no OCR**, because web Odia is
   mostly selectable Unicode text that the extension can read from the DOM. This is the
   highest-value, lowest-risk v1.
4. **The reference repo is a dictionary-and-pronunciation lens, not a machine translator.** It is
   macOS-only, written in Python with PyObjC, and its capture call is obsolete in the macOS 15 SDK.
   Use it as a model for the UX, not as a code base.
5. **The "Vercel can't host the model" expectation is out of date.** Vercel Large Functions (public
   beta, June 2026) allow bundles up to 5 GB, with 2–4 GB of memory. A 200M int8 model (~200 MB plus
   onnxruntime) is marginal under 250 MB and comfortable under Large Functions. What actually blocks it is CPU-only inference and cold-start load time, not size.
6. **The lens conflicts with this repo's own scope** (`plan/04-scope.md`). See section 8.

---

## 1. Reference repo: cristaecooks/Translation-Lens-MacOS  [verified]

URL: https://github.com/cristaecooks/Translation-Lens-MacOS (9 stars, 8 commits, 1 fork at fetch time)

- **What it does:** a small always-on-top see-through frame, aimed at reading comics. The user
  drags it over text and lets go. It shows **pronunciation plus dictionary definitions**, with a
  speaker icon per word. It is **not an MT system**: there is no sentence translation, only
  word segmentation and dictionary lookup.
- **Languages (11):** zh, ja, ko, fr, de, es, it, pt, cs, tr, la. Dictionaries are CC-CEDICT,
  JMdict and Wiktionary/WikDict (CC BY-SA 4.0).
- **Screen capture:** `Quartz.CGWindowListCreateImage(rect, kCGWindowListOptionOnScreenBelowWindow,
  own_window_number, ...)` captures the pixels *beneath* its own window (`lens.py` ~L742–756). It
  needs the Screen Recording permission (`CGPreflightScreenCaptureAccess` /
  `CGRequestScreenCaptureAccess`). It does **not** use ScreenCaptureKit or the Accessibility API.
  - `CGWindowListCreateImage` is **obsoleted in the macOS 15 SDK**, and Apple says to use
    ScreenCaptureKit instead [search-summary: macports trac, sentry issues]. The Python app still
    runs because PyObjC binds at runtime. A Swift rewrite would use
    `SCScreenshotManager.captureImage(contentFilter:configuration:)` (macOS 14+) with an
    `SCContentFilter` that excludes the lens window, or the newer `captureImage(in: CGRect)`
    [verified: Apple docs, SCScreenshotManager, macOS 14.0+].
- **OCR:** Apple Vision `VNRecognizeTextRequest`, accurate level, with language correction, on
  device. It upscales small captures. For vertical CJK it slices columns into cells and reflows
  them into a horizontal strip. The README says outright: *"Languages Vision cannot read at all —
  Devanagari, so no Hindi — would need a different OCR engine."* Odia falls in that group.
- **Speech:** `AVSpeechSynthesizer` with the best installed system voice for the language.
- **Licence:** code MIT (© 2026 cristae_cooks). Dictionary data CC BY-SA 4.0.
- **Platform:** macOS 12+, Apple Silicon only. Download 50 MB, release bundle 127 MB (PyInstaller).
- **Code size:** `lens.py` 1,836 lines, `langs.py` 824, `build_dicts.py` 316, spec 93, README 268
  (~3,370 lines in total).
- **What we can reuse:**
  - The UX pattern: a see-through frame, read on release, size presets (character / word / line /
    bubble), a speaker per word, slow speech on ⌥-click.
  - The upscale-before-OCR trick.
  - Line-bucketing of OCR boxes (`ocr_text`).
  - The MIT code can be borrowed with attribution.
- **What is only inspiration:** the capture call (obsolete), Vision OCR (no Odia), the
  CJK-specific segmentation, and the Python/PyObjC packaging. The CC BY-SA dictionary model would
  conflict with this repo's MIT/CC0/CC-BY-only sourcing rule.

---

## 2. Platform feasibility

### 2a. Web page on Vercel

- A page can read only its own DOM. It has **no access to other tabs or other apps**.
- The one exception is **`navigator.mediaDevices.getDisplayMedia()`**. The user picks a screen,
  window or tab in a browser picker. The spec says the user agent must let the user choose the
  surface **every time**, and that granted permission **cannot be persisted**
  (W3C Screen Capture: https://www.w3.org/TR/screen-capture/) [search-summary]. A call needs a user
  gesture (transient activation).
- Support: Chrome 72+, Firefox 33+ (later versions for the standard API), Safari 13+ on desktop.
  **Not supported on iOS Safari, Chrome for Android or Firefox for Android**
  (https://caniuse.com/mdn-api_mediadevices_getdisplaymedia) [search-summary].
- **UX this allows:** the user shares a window or screen once per session, and the page shows the
  live video with a draggable "lens" rectangle *inside the page*. On release, the page grabs a
  frame to canvas, crops, upscales 2–3×, then runs OCR, then MT. This is a "lens over a mirrored
  copy of the screen", not a floating lens over the real app. It is clumsy but works on desktop.
- The page also works for pasted text, uploaded screenshots and camera photos
  (`<input type=file capture>` works on mobile).

### 2b. Browser extension (Chrome / Edge / Firefox / Safari)

- **Content scripts can read the DOM text of any page** the extension has host permission for.
  Hover-to-translate is a well-established pattern, for example **MouseTooltipTranslator**
  (MIT, 1.3k stars, https://github.com/ttop32/MouseTooltipTranslator) [verified]. It already
  supports hover/select translation, Google TTS, and OCR on images via tesseract.js
  (shift + hover).
- Odia on websites (news sites, Wikipedia, government pages, social media) is almost always
  Unicode text, so **no OCR is needed**: caretRangeFromPoint / selection gives exact codepoints,
  which then go through `canonical()` to MT.
- For text inside images, `chrome.tabs.captureVisibleTab` (with `activeTab` or `<all_urls>`)
  screenshots the visible tab without a picker, and the image can then be OCR'd [search-summary,
  MDN].
- **Chrome for Android has no extensions** in 2026. Desktop-class Chrome on Android/Chromebook is
  experimental [search-summary]. Firefox for Android does support extensions.
- **Safari Web Extensions run on macOS and on iOS/iPadOS 15+**, including content scripts, and
  ship inside an App Store app. There are reports of flaky content-script injection on iOS
  [search-summary: Apple forums, WebKit bug 271868].
- An extension is a separate distribution channel (Chrome Web Store / App Store), not "hosted on
  Vercel". A Vercel backend can serve its MT/TTS API.

### 2c. Native macOS app

- **Capture:** ScreenCaptureKit (`SCScreenshotManager`, macOS 14+) with the Screen Recording
  permission. The permission is persistent once granted, and the app must be relaunched after
  granting it (README).
- **Alternative for selectable text:** the Accessibility API (`AXUIElementCopyElementAtPosition`,
  `kAXValueAttribute` / `kAXSelectedTextAttribute`) can read text under the cursor in many apps
  without OCR. It needs the Accessibility permission. Coverage varies by app; it works well for
  native Cocoa apps and partly for browsers. (From general platform knowledge; I did not fetch a
  source this session.)
- **OCR:** Apple Vision **does not support Odia**. The documented recognition set (macOS 13+) is
  en, fr, it, de, es, pt, zh-Hans/Hant, yue-Hans/Hant, ko, ja, ru, uk, th, vi, ar, ars
  [search-summary: Apple forum thread 121048 and others]. macOS 26 Live Text adds tr, id, cs, da,
  nl, nb, nn, ms, pl, ro, sv [search-summary: intego]. **No Indic script at all, not even Hindi**
  (Apple Community thread "No Hindi OCR support"). Check at runtime with
  `supportedRecognitionLanguages`. So the app would bundle **Tesseract `ori`** (C library or
  SwiftyTesseract-style wrapper) or call a server.
- The repo's planned `ime-macos` Swift target already loads `core/dist/engine.js` through
  JavaScriptCore, so a Swift lens could reuse that pattern.

### 2d. Android

- **ML Kit Text Recognition v2:** Latin, Chinese, Devanagari, Japanese and Korean only. **No Odia**
  [search-summary: developers.google.com/ml-kit/vision/text-recognition/v2/languages].
- **Capture other apps:** `MediaProjection` (consent per session; "a session is a single call to
  createVirtualDisplay()"; Android 14+ needs a `mediaProjection` foreground-service type and
  supports single-app sharing) [search-summary: developer.android.com/media/grow/media-projection].
  Add a `SYSTEM_ALERT_WINDOW` overlay for the floating lens. An `AccessibilityService` can read the
  view-hierarchy text of other apps without OCR, but Google Play restricts AccessibilityService use
  to accessibility purposes (policy detail not verified this session).
- **Google Lens / Circle to Search:** Google Translate has supported Odia text since Feb 2020
  (Global Voices, Aug 2020). **Whether Lens camera/image translation and Circle to Search
  translation support Odia is UNVERIFIED.** Older (2019) Lens Indic coverage listed hi, bn, gu, kn,
  ml, mr, ne, pa, ta, te, with Odia absent. The owner should test this on a phone: if Circle to
  Search already translates Odia on screen, that sets the bar for an Android app.
- Android Chrome cannot run extensions, and web pages cannot use `getDisplayMedia`.

### 2e. iOS

- **Live Text / Vision: no Odia** (same list as macOS; no Indic scripts). iOS 18.4 added Odia as
  a *system UI language* [search-summary: t2online, androidcentral], but that is UI localisation,
  not OCR.
- **Capture other apps:** not possible in general. The only routes are:
  - a ReplayKit Broadcast Upload Extension (system-wide screen recording, **hard 50 MB memory
    limit**, which is tight for Tesseract plus a model) [search-summary];
  - share sheet / action extension (screenshot, then share);
  - a Safari Web Extension for web pages;
  - the camera.
- A floating lens over other apps is **not possible on iOS**.

### Feasibility table

| Surface | Read other apps' text? | How | Odia OCR source |
|---|---|---|---|
| Web page (Vercel) | Only via screen-share, desktop only, prompt each session; never on iOS/Android | `getDisplayMedia` → canvas crop; or upload/paste/camera | tesseract.js `ori` in browser, or server |
| Browser extension (desktop Chrome/Edge/Firefox; Safari macOS+iOS) | Any web page's DOM text (no OCR); visible-tab screenshot for images | content script + `captureVisibleTab` | Rarely needed; tesseract.js for images |
| macOS app | Yes: whole screen, persistent permission | ScreenCaptureKit (+ Accessibility API for selectable text) | **Not Vision.** Tesseract `ori` bundled, or server |
| Windows app (later) | Yes | Windows.Graphics.Capture / UI Automation (not researched) | Windows.Media.Ocr Odia: not researched; Tesseract |
| Android app | Yes, with per-session MediaProjection consent + overlay; or AccessibilityService | MediaProjection / AccessibilityService | **Not ML Kit.** Tesseract (tess-two) or server |
| iOS app | No general capture; screenshots via share sheet, camera, Safari extension, ReplayKit (50 MB cap) | share/action extension, camera, Safari ext | **Not Vision.** Tesseract or server |

---

## 3. Odia OCR options

| Option | Odia? | Size / cost | Quality evidence | Licence | Notes |
|---|---|---|---|---|---|
| Tesseract `ori` **fast** (tessdata_fast) | yes | **1.48 MB** [verified: HTTP content-length] | No Odia-specific CER/WER found | Apache-2.0 | `tessdata/ori` is also 1.48 MB |
| Tesseract `ori` **best** (tessdata_best) | yes | **8.1 MB** [verified] | as above | Apache-2.0 | `script/Oriya` best 16.3 MB, fast 5.7 MB [verified] |
| tesseract.js (v5–v7) | uses the above | `tesseract.js-core` npm unpacked 30.6 MB (several wasm builds; one build is downloaded) | v7 is 15–35% faster than v6; v5 cut worker memory 311→164 MB [search-summary: releases] | Apache-2.0 | Reuse one worker; cache traineddata; upscale small crops. No Odia speed benchmark; expect ~1–3 s per lens crop on a laptop (estimate, untested) |
| Google Cloud Vision OCR | "or" listed as **supported** [search-summary, docs page blocked] | $1.50 / 1k images after 1k free/month (from memory, **unverified**) | IIIT-H paper says its models beat Tesseract 5 and GCV on 8 of 13 languages; per-language numbers not retrieved | proprietary | Network call. Google Document AI not researched |
| IIIT-Hyderabad / Bhashini OCR (Mathew, Mondal, Jawahar, "Towards Deployable OCR Models for Indic Languages", arXiv 2205.06740, ICPR) | 13 languages incl. Odia | CRNN models; page OCR via Bhashini | Beats Tesseract 5.1.4 and GCV on 8 of 13 languages; **Odia-specific numbers not retrieved** (arXiv blocked) | check | Available through Bhashini (see §4) |
| Bhashini "SCENE" OCR (app, beta) | yes (12 languages) | free app | none | — | Not an API I could confirm |
| IndicPhotoOCR (IIT Jodhpur, Bharat Scene Text dataset, arXiv 2511.23071) | Odia among 11 languages | PARSeq-based recognisers | Scene text, not screen text | "open source" (exact licence unverified) | https://vl2g.github.io/projects/IndicPhotoOCR/ |
| Bodhan AI **IndicOCR** (IIT-M, Sept 2026) | "all 22 scheduled languages, 13 scripts" for print, so Odia likely | 33M layout + 0.8B OCR | none found | open weights; licence **unverified** | HF `bodhan-ai/indic-ocr` (gated). Too big for the browser; server GPU |
| OdiaGenAI OdiaOCR | Odia-specific | — | — | unverified | HF space (blocked) |
| Claude vision (OCR + translate in one call) | **unverified for Odia script** | ~w·h/750 tokens per image; a 600×200 crop is ~160 tokens | none; must test | API terms | Strong candidate for a one-call pipeline; needs an eval on real Odia screenshots |

**No Odia-specific CER/WER number was found for any engine.** All quality claims are qualitative.
Before choosing, build a 50–100 crop eval set from real screens (news sites, WhatsApp, PDFs).

Encoding warning: Tesseract and cloud OCR may emit the precomposed nukta forms U+0B5C/U+0B5D.
Every OCR output must go through `canonical()` before any lookup.

---

## 4. Odia → English machine translation

| Option | Size | Licence | Cost | Can run in browser / Vercel? | Notes |
|---|---|---|---|---|---|
| **IndicTrans2 indic-en 1B** | 1B params; ONNX bundles 0.9–7 GB depending on precision [search-summary: hari31416 ONNX repo, which is the indic-indic 1B] | **MIT** (models), data CC0/CC-BY [verified: GitHub README] | self-host | Browser: no. Vercel: CPU only, too slow (estimate) | Best open quality for Indic→En per the IndicTrans2 paper (TMLR 2023); Odia FLORES numbers not retrieved |
| **IndicTrans2 indic-en dist-200M** | 200M params; by arithmetic ~800 MB fp32, ~400 MB fp16, **~200 MB int8** | **MIT** | self-host | Browser: possible in principle via transformers.js / onnxruntime-web; community ONNX ports exist (TigreGotico `indictrans2-*-dist-200M-onnx`, EchoBharat int8) [search-summary], no official transformers.js port. Vercel: fits Large Functions; CPU latency unmeasured | HF ai4bharat repo is **gated** (click-through), which matters for automated downloads. Needs IndicProcessor preprocessing (script normalisation, language tags) ported to JS |
| NLLB-200 (distilled 600M / 1.3B / 3.3B) | 600M+ | **CC-BY-NC 4.0, no commercial use** | — | — | **Flag: cannot use if the product is ever monetised.** Supports `ory_Orya` |
| Google Cloud Translation (NMT) | — | proprietary | **500k chars/month free**, then **$20 / M chars**; LLM mode $10 + $10 / M chars in+out [search-summary: cloud.google.com/translate/pricing] | API from a Vercel function | Odia supported since 2020 |
| Microsoft Translator | — | proprietary | not researched | API | Odia added 2020 (Global Voices) |
| **Bhashini** (MeitY) | — | govt | **free, but "for proof-of-concept purposes only"**; production or charging users needs a paid plan from the Bhashini team [search-summary: bhashini.gitbook.io/bhashini-apis/pre-requisites-and-onboarding] | API | Register at bhashini.gov.in/ulca (email), up to 5 API keys, needs userID + API key. **Eligibility from Singapore / non-Indian entity: unknown**, nothing found either way. Also offers TTS and OCR |
| **Sarvam** (Mayura v1, Sarvam-Translate v1) | — | proprietary | **₹20 / 10k chars = ₹2,000 / M chars ≈ US$22–24 / M** (FX approximate) [search-summary: docs.sarvam.ai/api/pricing] | API | Same price class as Google. Its case is Indic quality, not price |
| Claude API | — | API terms | Haiku 4.5 **$1 / $5** per M tokens in/out; Sonnet 5.5 **$2 / $10**; Opus 5.5 **$4 / $20** [Anthropic model table cached 2026-09-25] | API | One call can do OCR (image in), translation, per-word gloss and romanisation, returned as JSON. Odia tokenises inefficiently, so per-call cost is unmeasured; rough guess <$0.001 per lens grab on Haiku. Quality on Odia is untested and needs an eval |
| Chrome built-in Translator API (on-device) | — | — | free | in browser | **Odia NOT supported** (38 languages; hi, bn, mr, ta, te, kn included) [search-summary: developer.chrome.com/docs/ai/translator-api] |

**Word-level glosses:** the owner wants per-word meaning plus pronunciation, which is how the
reference app is built. I did not find an openly licensed Odia→English dictionary of useful size.
kaikki.org Odia coverage was not confirmed (searches returned nothing). Wiktionary-derived data
would be CC BY-SA, which breaks this repo's licence policy. Practical options:
(a) ask the MT/LLM for per-word glosses at runtime;
(b) build a gloss list from IndicTrans2 / LLM output over the existing `unigrams.tsv` top-N words,
    reviewed by a native speaker;
(c) check the AIKosh "Odia structured dictionary dataset" licence (found, not inspected:
    https://aikosh.indiaai.gov.in/home/datasets/details/odia_structured_dictionary_dataset.html).

---

## 5. Vercel limits  [search-summary of vercel.com docs and changelog]

- Standard function bundle: **250 MB uncompressed** (Python 500 MB).
- **Large Functions (public beta, 29 Jun 2026): up to 5 GB** for Node.js, Bun and Python. They
  need Fluid compute (on by default for new projects). Opt in with
  `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`. Not compatible with Secure Compute / Static IPs. 10 GB+
  "coming soon". (https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size)
- Max duration: **Hobby 300 s**. **Pro/Enterprise: default 300 s, max 800 s**, with 1,800 s
  extended in beta.
- Memory: **Hobby 2 GB, Pro/Enterprise 4 GB**. **No GPU.**
- **Conclusion:** IndicTrans2-dist-200M int8 (~200 MB, plus tens of MB for onnxruntime-node and the tokenizer) is *marginal* under the 250 MB limit and comfortable under Large Functions, and the 1B
  model fits under Large Functions. However, CPU inference, model load on every cold start, and the
  4 GB memory cap make latency unpredictable. For a lens (target < 1–2 s), use:
  - a hosted API (Google / Sarvam / Bhashini / Claude) called from a Vercel function; or
  - external GPU/CPU inference for IndicTrans2 (HF Inference Endpoints, Modal, Replicate; their
    pricing was not researched this session).

  A Vercel-CPU IndicTrans2 spike is worth one afternoon if self-hosting matters.

Vercel's Hobby plan is for non-commercial use only (from memory, not re-verified).

---

## 6. Pronunciation / TTS

| Option | Odia? | Licence / cost | Notes |
|---|---|---|---|
| Web Speech `speechSynthesis`, macOS / iOS (Safari, Chrome) | **Probably no Odia voice.** VoiceOver's Indian list includes bn-IN, hi, kn, en-IN [search-summary: support.apple.com/111748, page blocked] | free | **Unverified.** Test `speechSynthesis.getVoices()` for `or` / `or-IN` on a current Mac and iPhone |
| Web Speech, Windows (Chrome) | No Odia in the Windows local voices (unverified) | free | — |
| Web Speech, **Microsoft Edge** (desktop) | **Likely yes.** Edge exposes ~250+ Azure "Online (Natural)" voices, and Azure has **or-IN-SubhasiniNeural / or-IN-SukantNeural** [search-summary] | free to the site | **Unverified** that Edge lists the or-IN voices. Text goes to Microsoft. Edge on Android returns an empty voice list |
| Web Speech, Android Chrome | Google TTS engine: **no Odia** [search-summary, weak source: App Inventor forum] | free | Unverified |
| Google Cloud TTS | **Probably no Odia.** Chirp 3 HD Indic list is bn, gu, hi, kn, ml, mr (+ en-IN); no or-IN found [search-summary] | $4–30 / M chars | Unverified |
| **Azure AI Speech TTS** | **Yes: or-IN-SubhasiniNeural (F), or-IN-SukantNeural (M)** [search-summary] | pay-per-char (not researched) | Simplest reliable cloud Odia voice; call from a Vercel function, cache MP3s per word |
| Bhashini TTS | yes (22 languages) | free for PoC only | same eligibility caveat |
| AI4Bharat **Indic Parler-TTS** | yes (Odia among 12 languages + en) | **Apache-2.0**, ~0.9B params (Flan-T5 encoder + decoder + DAC) [search-summary] | GPU server; too big for the browser. Good for **pre-generating** audio for the top-N words offline |
| AI4Bharat IndicTTS (FastPitch + HiFi-GAN) | yes | check licence | smaller; not researched in depth |
| **Offline romanised pronunciation guide** | — | free, no network | See below |

**Romanised guide:** the repo excludes fuzzy *Odia→English reverse transliteration*
(`plan/04-scope.md`). However, `core/rules/itrans.toml` is a deterministic table, and inverting it
to produce ISO-15919 or a simplified "say it like" romanisation is a lookup, not a fuzzy model.
It needs a few rules on top: inherent-vowel deletion (schwa) and conjunct handling.
`core/data/lexicon.tsv` already pairs Odia with romanisations from Aksharantar for known words.
**This still needs an owner decision**, because it touches an explicit exclusion.

---

## 7. Recommended architecture for v1 (fits a Vercel-hosted product)

The ordering principle: **text first, pixels second.** Most Odia a user meets on a computer is
already Unicode, and OCR is the weakest, most expensive link.

1. **Shared core (TypeScript):** `canonical()` + Odia tokeniser + romaniser (inverted itrans
   table) + a client for `/api/translate` and `/api/speak`. It is reused by the extension, the web
   app and later the native apps (via JavaScriptCore on Apple, as `ime-macos` already plans).
2. **Vercel backend (Next.js route handlers, Fluid compute):**
   - `POST /api/translate {text}` returns `{sentence_en, words:[{or, roman, gloss}]}`. v1 backend
     is Google NMT for sentences (free tier: 500k chars/month), or Claude Haiku with
     structured-output JSON when per-word glosses are wanted. Run a 100-sentence everyday eval
     before choosing between them; Sarvam is the Indic-specialist alternative. Cache by
     `canonical(text)` hash (Vercel KV / Upstash).
   - `POST /api/ocr {image}` is optional in v1. Use Claude vision or Google Cloud Vision, with
     tesseract.js on the client as the free path.
   - `GET /api/speak?w=` returns Azure or-IN neural MP3, cached per word (Vercel Blob). Bhashini
     is the free PoC alternative.
3. **v1a: browser extension (Chrome/Edge/Firefox desktop, then Safari macOS/iOS).** Hover or
   select on Odia text. The content script detects the Odia block (U+0B00–U+0B7F), canonicalises
   it, calls the backend, and shows a tooltip with the English line, per-word romanisation and
   gloss, and 🔈 per word. Fall back to `captureVisibleTab` + tesseract.js `ori` for images. Seed
   it from MouseTooltipTranslator's patterns (MIT).
4. **v1b: Vercel web app.** Paste text / upload screenshot / camera photo (works on phones). On
   desktop, add "Share screen" (`getDisplayMedia`): the user drags a lens rectangle over the
   mirrored stream, the app crops, upscales 2–3×, runs tesseract.js `ori` (best, 8 MB, cached)
   in a worker, then calls `/api/translate`. Be honest in the UI that sharing must be re-approved
   each session.
5. **Later, macOS (and Windows) native lens:** a floating frame like the reference app.
   - Capture with ScreenCaptureKit `SCScreenshotManager`.
   - Try the Accessibility API first (exact text, no OCR); fall back to Tesseract `ori`.
   - Reuse the same backend.
   - The Tauri `app/` could host the overlay window, but capture and OCR need native code.
6. **Later, Android:** MediaProjection + overlay bubble, Tesseract `ori` or server OCR. First check
   whether Circle to Search already handles Odia.
   **iOS:** share-sheet / Safari extension / camera only, since a floating lens is not possible.

Offline variant (if the no-network rule must hold): IndicTrans2-dist-200M int8 ONNX in a desktop
app (~200 MB) + Tesseract + romanised guide, with no audio unless Indic Parler-TTS clips are
pre-rendered. This is feasible but a substantially larger build.

---

## 8. Conflicts with this repository's documented scope

`plan/04-scope.md` explicitly excludes, for **this** project:

- OCR ("Different discipline entirely").
- **Any network call** from shipped code.
- A website.
- Odia→English reverse transliteration.

A cloud-backed, Vercel-hosted translation lens breaks all four. Recommendation: treat the lens as
a **separate product / repository** that imports `core/` (for `canonical()` and tables), or have
the owner formally amend the scope file first. Also, `CLAUDE.md`'s licence table allows only
MIT/CC0/CC-BY sources, so CC BY-SA dictionaries (the reference app's model) and CC-BY-NC NLLB are
both out.

---

## 9. Unverified items (owner should spot-check)

- Google Cloud Vision listing Oriya as "supported" (docs page blocked).
- Google Cloud Vision price ($1.50 / 1k images), which is from memory.
- Apple TTS voice list (no Odia voice): support.apple.com blocked.
- Google TTS / Android: no Odia (weak forum source).
- Edge `speechSynthesis` exposing Azure or-IN voices.
- Google Lens / Circle to Search translating Odia images (test on a phone).
- Bhashini eligibility for a non-Indian (Singapore) developer, and production terms.
- Licences of Bodhan IndicOCR, IndicPhotoOCR, OdiaOCR and the AIKosh dictionary.
- Odia OCR accuracy numbers for any engine (none found).
- IndicTrans2 Odia→En FLORES chrF++ (arXiv blocked).
- Browser feasibility and latency of the community IndicTrans2-200M ONNX ports.
- Claude's Odia OCR and translation quality, and tokens per Odia character.
- Play Store AccessibilityService policy details.

## Sources

- Reference repo: https://github.com/cristaecooks/Translation-Lens-MacOS (README, lens.py, LICENSE read via raw.githubusercontent.com)
- Apple SCScreenshotManager: https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager
- Apple RecognizeTextRequest: https://developer.apple.com/documentation/vision/recognizetextrequest
- Vision languages (forum): https://developer.apple.com/forums/thread/121048
- Live Text macOS 26 languages: https://www.intego.com/mac-security-blog/how-to-use-live-text-on-iphone-ipad-and-mac/
- No Hindi OCR (Apple Community): https://discussions.apple.com/thread/255762020
- ML Kit v2 languages: https://developers.google.com/ml-kit/vision/text-recognition/v2/languages
- getDisplayMedia support: https://caniuse.com/mdn-api_mediadevices_getdisplaymedia ; spec https://www.w3.org/TR/screen-capture/
- captureVisibleTab: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/Tabs/captureVisibleTab
- MouseTooltipTranslator: https://github.com/ttop32/MouseTooltipTranslator
- Chrome Android extensions: https://extensionbooster.net/blog/chrome-extensions-android-2026-what-works-guide/
- Safari Web Extensions on iOS: https://wwdcnotes.com/notes/wwdc21/10104 ; https://bugs.webkit.org/show_bug.cgi?id=271868
- Android MediaProjection: https://developer.android.com/media/grow/media-projection
- ReplayKit 50 MB: https://developer.apple.com/forums/thread/651367
- iOS 18.4 Odia UI language: https://www.androidcentral.com/apps-software/ios-18-4-is-a-huge-deal-for-apple-in-india
- Odia in Google/Microsoft Translate: https://globalvoices.org/2020/08/28/indias-odia-language-added-to-google-and-microsoft-translation-services/
- Tesseract data: https://github.com/tesseract-ocr/tessdata_best , https://github.com/tesseract-ocr/tessdata_fast
- tesseract.js performance: https://github.com/naptha/tesseract.js/blob/master/docs/performance.md
- Google Cloud Vision languages: https://cloud.google.com/vision/docs/languages
- IIIT-H Indic OCR: https://arxiv.org/abs/2205.06740 ; https://cvit.iiit.ac.in/usodi/tdocrmil.php
- IndicPhotoOCR / BSTD: https://vl2g.github.io/projects/IndicPhotoOCR/ ; https://arxiv.org/abs/2511.23071
- Bodhan AI IndicOCR: https://www.analyticsvidhya.com/blog/2026/09/bodhan-ai-indic-models/ ; https://huggingface.co/bodhan-ai/indic-ocr
- IndicTrans2: https://github.com/AI4Bharat/IndicTrans2 ; https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M ; https://arxiv.org/abs/2305.16307
- IndicTrans2 ONNX (1B indic-indic): https://huggingface.co/hari31416/indictrans2-indic-indic-1B-ONNX ; EchoBharat: https://huggingface.co/RaunakSaha/echobharat-models
- NLLB licence: https://huggingface.co/facebook/nllb-200-distilled-600M
- Google Translation pricing: https://cloud.google.com/translate/pricing
- Sarvam pricing: https://docs.sarvam.ai/api/pricing
- Bhashini onboarding: https://bhashini.gitbook.io/bhashini-apis/pre-requisites-and-onboarding
- Chrome Translator API: https://developer.chrome.com/docs/ai/translator-api
- Vercel limits: https://vercel.com/docs/functions/limitations ; 5 GB: https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size
- Google Cloud TTS voices: https://cloud.google.com/text-to-speech/docs/voices ; Chirp 3 HD: https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- Azure Odia voices: https://json2video.com/ai-voices/azure/voices/or-in-subhasinineural/
- Indic Parler-TTS: https://huggingface.co/ai4bharat/indic-parler-tts
- Edge voices note: https://readium.org/speech/docs/WebSpeech.html
