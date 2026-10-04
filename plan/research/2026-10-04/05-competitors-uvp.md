# Research 05 — What is this app for, and how is it different from a keyboard?

Date: 2026-10-04. Research only; no repository files edited.

## 0. Method and evidence quality (read first)

- **Every WebFetch was blocked** by the network egress proxy (learn.microsoft.com,
  translate.google.com, support.google.com, play.google.com, apps.apple.com,
  wikipedia.org, duolingo.com, odiabibhaba.in, globalvoices.org). Nothing below was
  confirmed against a primary product page. All claims come from WebSearch result
  snippets.
- Confidence tags used in the matrix:
  - **[1P]** snippet from the vendor's own page/blog/help (e.g. support.microsoft.com,
    blog.google, research.google, news.microsoft.com).
  - **[3P]** snippet from press / third-party aggregator.
  - **[BK]** background knowledge, not found in this session's searches.
  - **[?]** unknown / not verified.
- Many search hits were SEO spam pages (e.g. "wizehire", "novadine", "tinkerine"
  PDFs). They were ignored.
- No evidence was found either way on whether competitors store ଡ଼/ଢ଼ precomposed or
  decomposed. Correct nukta storage is therefore presented below as a property of
  this tool, **not** as a defect of others.

## 1. Competitor survey

### 1.1 Typing tools (keyboards / IMEs)

**Gboard (Google) — Android, iOS**
- Odia is one of 22 Indic languages with QWERTY transliteration; Google built
  weighted-transducer mappings from Latin key sequences to target script for the 22
  languages. [1P: research.google "The Machine Intelligence Behind Gboard"; blog.google
  "Gboard for Android gets new languages and tools"]
  - https://www.research.google/blog/the-machine-intelligence-behind-gboard/
  - https://blog.google/products/search/gboard-android-gets-new-languages-and-tools/
- Offline: decoding runs on-device; federated learning keeps typed text on device;
  differential privacy for model training. [1P: research.google; arXiv 2306.14793]
  - https://www.research.google/blog/improving-gboard-language-models-via-private-federated-analytics/
  - https://arxiv.org/pdf/2306.14793
- Voice: Gboard voice typing exists; **Odia voice typing status is unverified.** The
  Aug 2017 30-language expansion added 8 Indian languages (Bengali, Gujarati, Kannada,
  Malayalam, Marathi, Tamil, Telugu, Urdu) — Odia was not among them.
  [3P: https://techcrunch.com/2017/08/14/googles-voice-typing-tech-adds-support-for-30-more-languages-reaching-further-into-africa-india]
  Later snippets only say Odia is "listed" for Google speech services, with no date. [?]
- iOS Gboard: Odia transliteration on iOS Gboard not confirmed. [?]
- Shows English meaning while typing: no evidence. [?, assumed no]
- Sanskrit register in Odia script: Gboard has a Sanskrit keyboard (Devanagari) [BK];
  no evidence of Sanskrit-in-Odia-script mode. [?]
- English loanwords in Odia script: transliteration of words like "computer" is
  expected to work via its lexicon/model, not verified. [?]
- Learning: learns personal words on device [BK]. No teaching features.
- Price: free. Privacy: typed text stays on device for learning (1P); optional
  features (search, translate, voice in some modes) use network [BK].

**Microsoft Windows 10/11 Odia Phonetic IME — Windows desktop**
- Built into Windows. Add Odia language → add "Odia Phonetic" keyboard. Type Latin,
  choose an Odia-script suggestion. Rules based on ISO 15919. Installed by default
  with INSCRIPT; phonetic IME is an extra keyboard.
  [1P snippet: https://learn.microsoft.com/globalization/input/odia-ime — fetch blocked,
  snippet only]
- Offline: OS IME, works offline [3P snippet; BK]. Meaning: no. Sanskrit: no. Voice: no
  Odia (Windows voice typing language list not checked) [?]. Price: free with Windows.
- Legacy "Microsoft Indic Language Input Tool" (ILIT) predates it; superseded [BK].

**Microsoft SwiftKey — Android (iOS Odia unverified)**
- Supports transliteration for Odia (with Bangla, Hindi, Gujarati, Kannada, Malayalam,
  Marathi, Persian, Punjabi, Tamil, Telugu, Urdu); offers QWERTY + native layouts;
  auto-attaches matras.
  [1P: https://support.microsoft.com/en-US/swiftkey-keyboard/which-languages-support-transliteration-and-how-does-it-work-in-microsoft-swiftkey-for-android]
- Offline behaviour, voice for Odia, privacy details: not verified. [?] Free.

**Google Input Tools — Chrome extension (Windows desktop app discontinued [BK])**
- Chrome extension supports Odia transliteration in web pages.
  [1P: https://www.google.com/inputtools/chrome/]
- Network requirement is widely reported [3P snippet]. The endpoint it is believed to
  use (`inputtools.google.com/request?...itc=or-t-i0-und`) was verified live during
  planning per this repo's `plan/04-scope.md` (which calls its Odia results
  excellent); what the extension sends at runtime was not checked. Likely: text is
  sent to Google. Meaning: no. Free.

**Swalekh Flip (Reverie) — Android**
- 22 official Indian languages incl. Odia; three modes: native layout, "macaronic"
  (mixed English letters + native script), phonetic transliteration.
  [3P: https://www.medianama.com/2015/01/223-reverie-swalekh-keyboard/,
  https://www.mobigyaan.com/swalekh-keypad-android-support-11-indian-languages-launched]
- 2026 maintenance status unverified; most press is 2015–2016. [?] Reverie also offers
  "Swalekh Pad", a web Odia/Hindi editor (mentioned by Odisha Plus, Mar 2025). Free.

**Desh Odia Keyboard (ClusterDev Technologies) — Android, iOS**
- Transliteration (English letters → Odia words), word predictions for Odia and
  English, language key, themes, stickers, clipboard.
  [3P: https://www.deshkeyboard.com/odia-typing/ (vendor), App Store listing id6449289327]
- Voice: Desh markets voice typing for some languages; Odia voice unverified. [?]
- Privacy: a TechEnclave thread title asks "is Desh keyboard safe … any data leaks?"
  (https://techenclave.com/t/desh-keyboard-is-safe-to-use/267190) — content not read;
  no finding. [?] Free with ads [BK].

**Lipikaar — Windows, Firefox, web**
- "SMS-style" typing method for 16–18 Indian languages incl. Odia; offline Windows
  version is paid. Manthan Award 2008. Appears largely legacy.
  [3P: https://yourstory.com/2011/11/lipikaar-typing-in-18-indian-languages-made-easier,
  https://www.softpedia.com/get/Office-tools/Other-Office-Tools/Lipikaar.shtml]

**Indic Keyboard (SMC / Indic Project) — Android, open source**
- Odia: InScript and transliteration layouts. Last major release v3 (Aug 2020); F-Droid.
  Offline, no network. [1P: https://blog.smc.org.in/indic-keyboard-v3/,
  https://github.com/smc/Indic-Keyboard]
- No meaning display, no voice. Free/open source.

**KeyNounce Oriya Transliteration Keyboard — iOS (and macOS)**
- Type pronunciation in English, get Oriya (e.g. "Swaagata"). [1P listing snippet:
  https://apps.apple.com/us/app/oriya-transliteration-keyboard-by-keynounce/id1026358921]

**Apple iOS 18 / macOS built-in**
- iOS 18: alphabetical (native-script) keyboard layouts for 11 Indian languages
  including Odia; multilingual keyboard (up to 3 languages). No Odia transliteration
  keyboard confirmed. [3P: https://t2online.in/goodlife/tech/ios-18-offers-better-languages-support-for-users-in-india/1009944;
  1P: https://support.apple.com/en-au/121233]
- macOS: ships "Oriya" and "Oriya – QWERTY" keyboard layouts (fixed key-to-letter
  maps, no candidate list) [BK, not found in search]. **No built-in phonetic
  transliteration IME with candidates on macOS was found.** This is a real desktop gap,
  and the one this repo's `ime-macos/` targets. Confidence: medium.

### 1.2 Translation / lens / voice

**Google Translate — web, Android, iOS**
- Odia text translation added 2020 (alongside Microsoft). [3P: Global Voices
  https://globalvoices.org/2020/08/28/indias-odia-language-added-to-google-and-microsoft-translation-services/;
  Google blog "five new languages" https://blog.google/products/translate/five-new-languages/]
- Offline pack: Odia reportedly among 33 languages added to offline translation
  (Jan 2023). [3P: https://9to5google.com/2023/01/16/google-translate-offline-language-new/,
  https://www.androidpolice.com/google-translate-offline-translation-33-more-languages/]
  — listing Odia specifically is from a snippet; not confirmed against the list.
- Camera: Translate's camera mode was replaced by Google Lens. [3P:
  https://www.androidcentral.com/apps-software/google-lens-will-replace-google-translate-camera-mode]
  Odia as a **source** language for photo translation: likely (Lens translates most
  Translate languages) but unconfirmed; live/instant camera for Odia unconfirmed. [?]
- Google OCR covers Odia (2015, >90% on most languages; Odia testers named).
  [3P: https://cis-india.org/a2k/blogs/googles-optical-character-recognition-software-now-works-with-all-south-asian-languages]
- Odia TTS (listen) and Odia speech input: unconfirmed. A change.org petition
  requesting Odia TTS in Google's TTS engine exists (date not read). [?]
- Romanized pronunciation shown under Odia text: Translate shows romanization for
  many Indic languages [BK]; Odia specifically unconfirmed. [?]
- "Practice" (language learning, Aug 2025): for English speakers covers Spanish,
  French, Portuguese, German, Bengali, Hindi, Italian, Dutch, Romanian, Swedish,
  Chinese — **not Odia**. [3P: https://www.phonearena.com/news/Google-Translate-has-quietly-added-a-bunch-of-new-languages-to-its-practice-mode_id176554]
- Privacy: online translation sends text to Google; offline pack does not [BK]. Free.

**Google Lens — Android, iOS (via Google app), Chrome**
- Translate text in images into most Translate languages; offline Lens translation
  exists for downloaded packs. [3P: https://www.androidcentral.com/you-can-now-use-google-lens-offline-translations]
- Odia specifically: unconfirmed. [?] Image sent to Google unless offline pack used [BK].

**Microsoft Translator — app, Bing, Office, Azure**
- Odia added 13/17 Aug 2020: text translation and transliteration; cloud service.
  [1P: https://news.microsoft.com/en-in/translation-support-odia-latest-indian-languages/,
  https://microsoft.com/translator/blog/2020/08/13/odia-language-text-translation-is-now-available-in-microsoft-translator]
- Offline pack for Odia, speech, camera for Odia: not confirmed. [?] Free (consumer).

**Bhashini (Govt of India, MeitY) — Android, iOS**
- Text translation 22 languages; Speak/Converse 13→20 languages (Odia inclusion in
  voice not confirmed); "SCENE" OCR in beta, 12 languages (Odia not confirmed); Browse
  (web page translation). [3P: https://en.vikaspedia.in/viewcontent/e-governance/digital-india/bhashini,
  https://analyticsindiamag.com/bhashini-introduces-ocr-feature-in-its-app]
- Offline: no evidence; assumed cloud. [?] Free. Text sent to govt servers [inferred].

**Sarvam — APIs and Indus app**
- Saaras v3 speech recognition for 22 Indian languages incl. Odia, code-mixed support;
  Mayura translation; Sarvam Translate open weights (22 languages).
  [1P: https://www.sarvam.ai/apis/speech-to-text/odia, https://docs.sarvam.ai/api-reference-docs/getting-started/models]
- **Indus** chat app launched Feb 19–20 2026 (Android, iOS, web, beta); 22 Indian
  languages; text and voice in/out; HMD preloading it.
  [3P: https://www.businesstoday.in/technology/news/story/indus-by-sarvam-a-first-look-at-indias-homegrown-ai-chat-app-built-for-local-languages-517385-2026-02-21]
- Online only. Free (beta). Text/voice sent to Sarvam.

**General LLM chat apps (ChatGPT, Gemini, Indus)**
- If the user accepts online + a chat window, they can already type "kemiti achha",
  ask for Odia script, a meaning, a translation, or pronunciation. Quality for Odia is
  less documented than for Hindi/Telugu (a translation-agency blog lists Telugu,
  Sanskrit, Hindi among Gemini's better Indic languages, Odia not named — weak
  evidence). They are not an input method: no candidate list inside other apps, no
  per-word picking, no learned preferences, and they send text to a server.

### 1.3 Learning and dictionaries

**Duolingo** — no Odia course. Indian languages offered as courses to learn: Hindi
(for English speakers); English for Hindi/Tamil/Bengali/Telugu speakers.
[3P: https://www.impactonnet.com/more-from-impact/duolingo-expands-with-indian-languages-to-teach-global-tongues-across-bharat-10521.html]

**Odia script learning apps** — offline, free, aimed at children/beginners:
- Write Odia Alphabets (iOS/Android; tracing, audio, offline)
  https://apps.apple.com/np/app/write-odia-alphabets/id1476921270
- Odia Bhasa (free, ad-free; alphabets, conjuncts, handwriting slate, Chhabila Madhu
  Barnabodha; Product Hunt launch Jan 13 2026)
  https://www.producthunt.com/products/odia-bhasa-read-write/launches/odia-bhasa
- Odia Fun Learning (stroke-order games) — apkpure listing.
None of these connect learning to the user's own writing (no "teach me the letters
in the word I just typed").

**Dictionaries**
- odiabibhaba.in Odia Dictionary: ~84,500 words (54,500 Odia + 30,000 English roots),
  administrative and science glossaries; sourced from Purnachandra Odia Bhashakosha and
  others; also hosts an e-Bhasakosha of Praharaj. [3P snippet of the site:
  https://odiabibhaba.in/?p=2134, https://odiabibhaba.in/?p=11702]
- DDSA Praharaj Oriya dictionary app (University of Chicago DSAL): searchable
  Purnachandra Odia Bhashakosha (1931–40). [https://apps.apple.com/us/app/id1518329624,
  https://dsal.uchicago.edu/dictionaries/praharaj]
  **This is the same source as this project's classical meaning layer, as a
  standalone look-up app.**
- Odia Abhidhan, Odia Word Dictionary (Android, offline; one offers suggestions while
  typing **in the dictionary's own search box**, not in other apps). [3P: appfollow
  listings]
- Shabdkosh English–Odia (web). https://www.shabdkosh.com/dictionary/english-odia/
- Odia Virtual Academy (Govt of Odisha, ova.gov.in): web portal; digitised ~170 books
  via MOUs with U Chicago, C-DAC, CIS. A dedicated OVA dictionary app was not found. [3P]

**Script conversion (Sanskrit-in-Odia)**
- Aksharamukha (open source, but AGPL — see CLAUDE.md: study only): converts text
  already written in one script/romanization into another (120 scripts), incl. Odia,
  with orthographic options. It is a converter, not phonetic typing with ranked
  candidates. https://pypi.org/project/aksharamukha ;
  https://digitalorientalist.com/2024/11/26/aksharamukha-the-automated-transliteration-tool-to-simplify-script-conversion/
- Strict ITRANS/IAST-style typing is possible in many tools; no consumer tool found that
  offers Sanskrit-register candidates (visarga, avagraha, Vedic conjuncts) in Odia
  script inside an everyday Odia typing flow. [?, absence of evidence]

## 2. Feature-gap matrix

Legend: Y yes · N no · P partial · ? unverified · (tag) confidence.
"This tool (built)" = what exists today; "(planned)" listed separately.

| Product | Platform | Offline | Meaning while typing | Sanskrit in Odia script | English loans in Odia script | Learns picks | Teaches script | Voice → Odia | Lens/OCR | Price | Text leaves device? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **This tool (built)** | 1 HTML page, any browser | Y | **Y** (Praharaj + modern layer) | **Y** (sloka mode) | P (loans in lexicon; planned dedicated handling) | Y | N | N | N | free | **N** |
| This tool (planned) | + Vercel web | (web still offline-capable?) | — | — | Y (planned) | — | P? | speak-to-write | translation lens | — | depends on design |
| Gboard | Android, iOS | Y (1P) | N (?) | N (?) | ? likely Y | Y | N | ? (Odia unconfirmed) | via Lens | free | N for typing (1P, FL) |
| Win 11 Odia Phonetic IME | Windows | Y | N | N | ? | ? | N | ? | N | free | N |
| SwiftKey | Android | ? | N | N | ? | Y | N | ? | N | free | ? |
| Google Input Tools ext. | Chrome | **N** | N | N | Y likely | P | N | N | N | free | **Y** |
| Swalekh Flip | Android | ? | N | N | Y ("macaronic") | ? | N | ? | N | free | ? |
| Desh Odia | Android, iOS | ? | N | N | ? | Y | N | ? | N | free+ads | ? |
| Lipikaar | Windows, web | Y (paid) | N | N | ? | ? | N | N | N | paid | N (desktop) |
| Indic Keyboard (SMC) | Android | Y | N | N | ? | ? | N | N | N | free/OSS | N |
| macOS built-in | macOS | Y | N | N | N | N | N | N (Odia dictation ?) | N | free | N |
| Google Translate | web, mobile | P (pack, 3P) | n/a | N | n/a | N | N (Practice excludes Odia) | ? | Y via Lens (Odia ?) | free | Y online |
| Google Lens | mobile, Chrome | P | n/a | N | n/a | N | N | N | Y (Odia ?) | free | Y online |
| MS Translator | app, web, Office | ? | n/a | N | n/a | N | N | ? | ? | free | Y |
| Bhashini | Android, iOS | ? (assume N) | n/a | N | n/a | N | N | Y (Odia ?) | beta (Odia ?) | free | Y |
| Sarvam Indus / LLM chat | app, web | N | P (if asked) | P (if asked) | Y | N | P (if asked) | Y (Sarvam: Odia 1P) | P | free/beta | Y |
| DSAL Praharaj app | iOS | ? | N (look-up only) | N | N | N | N | N | N | free | ? |
| odiabibhaba.in | web | N | N (look-up only) | N | N | N | N | N | N | free | Y (web) |
| Odia script learning apps | Android, iOS | Y | N | N | N | N | **Y** | N | N | free | N |
| Aksharamukha | web, PyPI | P (lib) | N | Y (convert, not type) | N | N | N | N | N | free/AGPL | web: Y |

### Gaps no competitor combines (honest read)

1. **Meaning shown under each candidate while typing.** No keyboard, IME or
   transliteration tool found does this. Dictionaries show meanings only in their own
   search box; LLM chats give meanings only after you ask, online. **This is the one
   clean, verifiable gap.** It also does a job that matters for the stated users: a
   person who speaks but cannot read Odia can see *which* ଦିନ/ଦୀନ candidate means
   "day" vs "poor" before sending it to a parent.
2. **Sanskrit-register candidates in Odia script, from phonetic typing, in the same
   tool as everyday Odia.** Aksharamukha converts existing text; ITRANS tools need a
   strict scheme. Narrow audience (people typing slokas in Odia script), but genuinely
   unserved in the evidence found.
3. **Odia phonetic input with candidates on macOS (desktop), no account, no network.**
   Windows has this built in; Android/iOS have Gboard. macOS appears to have only
   fixed layouts (BK — verify). The single HTML page also covers any desktop browser
   without install.
4. **Zero-telemetry, inspectable rules.** Not a functional gap vs Gboard (which is
   on-device for typing), but a distinct trust property: no account, no server, rule
   files readable as text. Relevant for family messages and for an audience wary of
   third-party keyboards (Desh safety thread exists; content unread).

### Where competitors already do it well (do not claim otherwise)

- **Mobile Odia transliteration**: Gboard, SwiftKey, Desh — free, on-device, mature.
  `plan/04-scope.md` already says so.
- **Windows Odia transliteration**: built-in Odia Phonetic IME.
- **Offline**: Gboard and the Windows IME are offline too. "Works offline" is not a
  differentiator on its own.
- **Sentence translation**: Google Translate, Microsoft Translator, Bhashini, Sarvam,
  LLMs. A rule + lexicon engine cannot compete on full-sentence MT.
- **Reading Odia in the world (camera)**: Google Lens + Translate; Google OCR handles
  Odia (2015 claim, >90% on most scripts).
- **Speech**: Sarvam Saaras (Odia 1P), Bhashini, likely Google. Building ASR is a
  different discipline.
- **Script lessons for beginners**: several free offline apps already exist.

## 3. Candidate value propositions (each tied to a gap; built features only)

1. *Gap 1:* "Type Odia the way it sounds and see what each suggested word means in
   English before you pick it."
2. *Gap 1 + target users:* "Lets someone who speaks Odia but cannot read the script
   write to family in Odia script and check that each word means what they intended."
3. *Gaps 2 + 3 + 4:* "One page that types everyday Odia and Sanskrit slokas in Odia
   script on any computer, with no install, no account and nothing sent online."

### "How is this different from a keyboard?" — three bullets

- **It shows meanings while you type.** A keyboard turns "dina" into ଦିନ and assumes
  you can read it. This shows "day" under ଦିନ and "poor, humble" under ଦୀନ, so you
  can choose correctly even if you cannot read Odia well. (Gap 1) — illustrative
  example; confirm the tool actually returns these two candidates and glosses for
  "dina" before using it publicly.
- **It has a Sanskrit mode in Odia script.** Keyboards aim at everyday words; this
  has a separate mode for slokas (Gita, Puranas) that produces Sanskrit spelling,
  visarga and conjuncts in Odia script. (Gap 2)
- **It runs as a single page on any computer, offline, with no account.** Nothing
  you type leaves the machine and the spelling rules are plain text files you can
  read. (Gaps 3, 4) [Optional clause, only after verifying: "No built-in Odia
  phonetic input with candidates was found on macOS."]
  — Note: if the Vercel web app adds any server call, this bullet must change.

(Accuracy numbers — ~80–89% top-1, ~96–98% top-3 on the owner's everyday set — are
not comparable to any competitor figure found; no competitor publishes Odia accuracy.
Do not use them comparatively.)

## 4. Risks and "do not compete" list

1. **General machine translation** — Google Translate, Microsoft, Bhashini, Sarvam,
   LLMs. Do not build sentence translation. If a "translation lens" ships, its only
   defensible increment is *word-level* meaning (Praharaj + modern layer) plus a
   romanized pronunciation for each word — i.e. a reading aid, not a translator —
   and it should link out to Lens/Translate for full sentences.
2. **OCR / camera** — Google Lens is free, mature and on every Android phone. Building
   OCR is a different discipline. If the lens is built, accept typed or pasted Odia
   text first; camera input only through an existing OCR.
3. **Speech-to-text** — Sarvam (Odia, 1P), Bhashini, Google. Not buildable offline in a
   single HTML page at useful quality. If pursued, it means a cloud dependency, which
   breaks the "nothing leaves the device" value proposition.
4. **Mobile keyboards** — Gboard/SwiftKey/Desh are free and on-device. Already excluded
   in `plan/04-scope.md`. Keep it that way.
5. **Repo contradiction to resolve first.** `plan/04-scope.md` lists "Voice input or
   OCR" and "a website" under *Not building — ever*, and reverse (Odia→English)
   transliteration as excluded. The brief lists a Vercel web app, a translation lens and
   speak-to-write as planned. The owner must reconcile these before any public
   description mentions them. (Note also that `CLAUDE.md`'s "Current stage: pre-Stage-A.
   Nothing built yet" is stale relative to the shipped HTML page.)
6. **Licensing / provenance.** The meaning layer is now central to the pitch.
   `Odia_Sanskrit_Appv2/README.md` records Praharaj text as public domain, the
   indic-dict digitisation as "freely redistributable", and MTEnglish2Odia/OdiaNLP
   pairs as MIT. These sources are **not** in the CLAUDE.md licence table and (per
   grep) not in any `PROVENANCE.md`. Recommend adding them with checksums. The
   "freely redistributable" claim for the indic-dict digitisation was not verified in
   this session.
7. **Offline web app on Vercel.** Hosting on Vercel is fine, but offline only holds if
   the page is a static/PWA bundle with no runtime API calls. Analytics scripts would
   also break the privacy claim.
8. **Dictionary meaning quality.** Praharaj's glosses are 1930s English with old
   orthography; the modern layer is "approximate by nature" (README). A UVP built on
   meanings is exposed if glosses are wrong for common words. Spot-check the 500 most
   frequent everyday words before leading with this.
9. **Evidence quality of this report.** See §0 — snippet-level only.

## 5. Consolidated unverified list

- Gboard Odia voice typing (not in 2017 list; later status unconfirmed).
- Gboard Odia transliteration on iOS.
- Google Translate: Odia offline pack (3P, Jan 2023), Odia TTS, Odia speech input,
  Odia romanization display, Odia as Lens source language (photo vs live).
- Microsoft Translator Odia offline pack / speech / camera.
- Bhashini: Odia in Speak/Converse and in SCENE OCR; offline.
- SwiftKey Odia offline behaviour and privacy; Desh privacy; Swalekh Flip 2026 status.
- Windows Phonetic IME details (fetch blocked; snippet only).
- macOS built-in Odia input (layouts only, from background knowledge).
- Whether any competitor stores ଡ଼/ଢ଼ precomposed (no evidence either way).
- indic-dict digitisation licence wording.
