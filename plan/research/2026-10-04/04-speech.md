# Research 04 — Speech for non-readers ("speak-to-write" Odia)

Date: 2026-10-04. Research only; no repository files edited.

Method note: this environment's egress proxy blocked direct fetches of docs.cloud.google.com,
docs.sarvam.ai, sarvam.ai, huggingface.co, arxiv.org, learn.microsoft.com and
support.google.com. Facts from those domains come from search-engine snippets and are marked
**[snippet]**. Facts read directly from a primary source are marked **[read]**. Anything not
established is marked **[UNVERIFIED]**. Treat [snippet] as "likely, re-check before relying".

---

## 0. Conflict with the project's own scope (read first)

`plan/04-scope.md` currently lists, under *Not building — ever*:

- "Voice input or OCR — Different discipline entirely."
- "Notarized public distribution, auto-update, a website — This is a personal tool."
- and under *Deliberately excluded from the engine*: "**Any network call.** This was a decision, not an oversight."

CLAUDE.md repeats: "Offline only. No network call from shipped code, ever."

Every Odia ASR option with usable quality found below is either a cloud API or a
600 MB-class model that realistically runs on a server. A "speak-to-write" feature therefore
**requires an explicit scope amendment** and should be designed as a separate, opt-in, online
layer around the web app — not a change to `core/`, which must stay pure and offline.

---

## 1. Speech-to-text (ASR) for Odia

### 1.1 Web Speech API (`SpeechRecognition`, lang `or-IN`)

| Browser | Backend | Odia? |
|---|---|---|
| Chrome (desktop, Android) | Google cloud speech servers; Chrome 139+ also on-device via `processLocally` | **[UNVERIFIED]** — no source found either way. |
| Edge | Azure Speech | **Almost certainly no** (inference): Microsoft Q&A states Azure STT does not support `or-IN` and no date announced **[snippet]**. |
| Safari (macOS 14.1+, iOS 14.5+) | Apple speech service / Siri dictation | **[UNVERIFIED]**; no evidence Apple dictation supports Odia. Apple has added Bangla, Kannada, Marathi, Tamil, Telugu to VoiceOver, not Odia **[snippet]**. |
| Firefox | not supported | No. |

- An old claim (labnol, ~2010s) that "Hindi is the only Indian language" in Chrome is stale — do not rely on it.
- Chrome on-device mode: `processLocally: true` and `SpeechRecognition.available({langs, processLocally})` shipped in Chrome 139 (Aug 2025) **[snippet]**. On-device Odia packs are very unlikely to exist **[inference, UNVERIFIED]**.
- **Privacy**: in default (cloud) mode Chrome sends raw audio to Google servers for transcription; Google may retain it, unlike Firefox's former proxying approach **[snippet; Mozilla wiki]**. Safari routes audio to Apple. For a parent dictating family messages this must be disclosed.

**30-second test the owner should run** (Chrome, desktop and Android):

```js
const r = new webkitSpeechRecognition(); r.lang = 'or-IN'; r.interimResults = true;
r.onresult = e => console.log([...e.results].map(x => x[0].transcript).join(''));
r.onerror = e => console.log('error', e.error);   // 'language-not-supported' = no
r.start();
// Chrome 139+:
SpeechRecognition.available({ langs: ['or-IN'], processLocally: false }).then(console.log);
SpeechRecognition.available({ langs: ['or-IN'], processLocally: true  }).then(console.log);
```

Sources:
- https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api
- https://developer.mozilla.org/docs/Web/API/SpeechRecognition/available_static
- https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM/m/TQpe9shjCgAJ (Intent to Ship: On-device Web Speech API)
- https://wiki.mozilla.org/Web_Speech_API_-_Speech_Recognition
- https://learn.microsoft.com/en-us/answers/questions/2068084/azure-support-oriya(or-in)-speech-to-text-function

### 1.2 AI4Bharat models (open weights)

**IndicWhisper (Vistaar)** — MIT **[read]**. Odia WER per benchmark, from the Vistaar README **[read]**:

| Kathbath | Kathbath-Hard | CommonVoice | FLEURS | IndicTTS | MUCS | Odia avg |
|---|---|---|---|---|---|---|
| 24.7 | 29.1 | 35.2 | 32.9 | 15.0 | 27.5 | **27.4** |

Odia is the second-worst language after Sanskrit (avg 48) in that table. Whisper-medium-sized
(~769M) per-language checkpoint **[size UNVERIFIED]**. Needs a GPU server for interactive use.
Source: https://github.com/AI4Bharat/vistaar

**IndicConformer** — MIT **[read, GitHub]**. 600M multilingual (22 languages incl. Odia) plus
per-language monolingual models; official runtime is AI4Bharat's NeMo fork **[read]**.
- ONNX: fp32 2.4 GB; community int8 quant 0.62 GB (peak RSS ~1.1 GB); community per-language int8 packs ~131 MB each **[snippet; unofficial third-party repos]**.
- Odia WER: 26.4% as reported in the SraVaani paper's comparison (benchmark aggregation unclear) **[snippet]**; an agricultural-domain field benchmark reports 64.8% for an "AI4Bharat" system **[snippet]**.
- In-browser (onnxruntime-web, WASM/WebGPU): theoretically possible with a 131 MB pack; **no evidence anyone has done it for this model [UNVERIFIED]**. RNNT/CTC decoding and feature extraction would have to be ported to JS.
- Sources: https://github.com/AI4Bharat/IndicConformerASR · https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual · https://huggingface.co/yashwork-byte/indic-conformer-600m-int8-onnx · https://huggingface.co/nmukthap/vertexvoice-indic

**SraVaani-1.0 (ARTPARK-IISc, 2026)** — MIT, ~430M FastConformer TDT-CTC, ~900 MB FP16, 63 Indian languages/dialects **[snippet]**. Odia WER 25.7% vs IndicConformer 26.4%, Saaras v3 30.0%, Gemini 3 Flash 32.8% **[snippet; which test set is aggregated is unclear]**. Community ONNX and GGUF ports exist **[snippet]**.
- https://arxiv.org/abs/2608.08235 · https://huggingface.co/ARTPARK-IISc/SraVaani-1.0 · https://huggingface.co/killbanhar/sravaani-onnx

### 1.3 OpenAI Whisper (large-v3 / turbo)

**Odia is not a Whisper language at all.** The `LANGUAGES` dict in `whisper/tokenizer.py` has no
`"or"` entry, while hi, bn, ta, te, ml, kn, mr, gu, pa, as, ne, ur, sa, sd, si are present **[read]**.
So there is no meaningful Odia WER for vanilla Whisper; it would transcribe Odia speech as some
other language/script. Only fine-tunes (e.g. IndicWhisper) cover Odia.
Source: https://github.com/openai/whisper/blob/main/whisper/tokenizer.py

### 1.4 Meta MMS (Massively Multilingual Speech)

- Licence: "The MMS code and model weights are released under the **CC-BY-NC 4.0** license." **[read, fairseq README]** — **non-commercial; incompatible with this MIT project's "everything shipped is MIT/CC0/CC-BY" rule.** Disqualified regardless of quality.
- Odia (`ory`) in mms-1b-all ASR and mms-tts: very likely (Odia is a FLEURS language) but **[UNVERIFIED]**; no Odia WER retrieved.
- Source: https://github.com/facebookresearch/fairseq/blob/main/examples/mms/README.md

### 1.5 Commercial / government APIs

**Google Cloud Speech-to-Text** — `or-IN` supported by **Chirp 3** in **Preview** (Recognize, StreamingRecognize, BatchRecognize) **[snippet]**. Price: V2 standard $0.016/min for first 500k min/month (Chirp at standard rate), 60 free min/month, $300 new-account credit **[snippet; costbench/Google pricing page]**. No published Odia WER. Preview = no SLA.
- https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3 · https://cloud.google.com/speech-to-text/pricing

**Sarvam Saarika v2.5 / Saaras v3** — Odia supported as `od-IN` (note: **not** `or-IN`) **[snippet]**. ₹30/hour (~US$0.36/h; ~₹0.5/min), per-second billing; free Starter plan with ₹300 credits **[snippet]**. Saaras v3 has modes `transcribe`, `translate` (→ English), `verbatim`, `translit` (→ romanised), `codemix` **[snippet; exact output of `translit` for Odia UNVERIFIED]**. Odia WER: 30.0% (SraVaani comparison) / 35.8% (agri field benchmark) **[snippet]**. Vendor-reported IndicVoices average ~19% across top-10 languages — Odia is worse than average.
- https://docs.sarvam.ai/api/getting-started/models/saarika.md · https://docs.sarvam.ai/api/getting-started/pricing · https://www.sarvam.ai/blogs/asr · https://www.business-standard.com/technology/tech-news/saaras-v3-beats-gemini-gpt-4o-on-indian-speech-benchmarks-says-sarvam-ai-126021200384_1.html

**Bhashini (Govt. of India, Digital India Bhashini Division)** — ASR/TTS/MT for 22 languages incl. Odia; API needs registration (user ID + ULCA API key) at https://dashboard.bhashini.co.in/user/register; described as "free for low volume" **[snippet]**. **Quota, SLA, and eligibility for non-Indian developers/users: [UNVERIFIED]**. Models largely AI4Bharat lineage. Reliability for a public app is unknown.
- https://github.com/bhashini-dibd/ulca · https://pypi.org/project/bhashini-translator

**Azure Speech** — STT: no `or-IN` **[snippet]**. (TTS: yes, see §2.)

**Real-world difficulty**: an agricultural-advisory benchmark (10,934 recordings, Hindi/Telugu/Odia) found best Odia WER 35.1% (Azure diarize — oddly, given above), Sarvam 35.8%, Spring Labs 35.8%, Gemini 2.5 Pro 37.8%, AI4Bharat 64.8%; Hindi best was 16.2% **[snippet]**. https://arxiv.org/abs/2602.03868

**Spread to expect for Odia**: ~15% (studio read speech) → ~25–30% (read/extempore benchmarks) → ~35% (field conversational) → 65% (noisy domain, wrong model). Roughly **one word in three or four will be wrong** in casual dictation.

### 1.6 Gboard voice typing (competitor baseline)

**[UNVERIFIED].** Gboard has had Odia *keyboards* since April 2017 (22 Indian languages) **[snippet; MediaNama]**, and the repo's own scope doc says "Gboard already does Odia on mobile". Voice-typing additions announced for Indian languages (2017) named Bengali, Gujarati, Kannada, Malayalam, Marathi, Tamil, Telugu, Urdu — **not Odia** **[snippet]**. Whether Gboard voice typing now accepts Odia could not be confirmed (support.google.com blocked). Owner can check on an Android phone in 30 seconds: Gboard → Settings → Voice typing → Languages. If it exists, it is the free, zero-effort competitor and the web feature must beat it on read-back/verification, not on recognition.
- https://www.medianama.com/2017/04/223-google-gboard-indian-languages/ · https://www.androidauthority.com/google-announces-support-voice-search-eight-indian-languages-793389/

---

## 2. Text-to-speech for Odia (read-back for confirmation)

### 2.1 Web Speech `speechSynthesis` — per OS

| Platform | Odia voice? |
|---|---|
| Edge (Windows/macOS) | **Likely yes, online**: Edge exposes Azure "Online (Natural)" voices to `speechSynthesis`; the edge-tts voice list includes `or-IN-SubhasiniNeural` (F) and `or-IN-SukantNeural` (M) **[snippet]**. Requires network; audio text goes to Microsoft. Exact `getVoices()` name **[UNVERIFIED]**; an Edge 150 bug returning "undefined" voice names was reported **[snippet]**. |
| Chrome desktop | Google network voices exist for a few languages; Odia **[UNVERIFIED, probably no]**. |
| Android (Speech Services by Google) | Reported **no Odia voice** (MIT App Inventor community) **[snippet; dated]**. |
| macOS / iOS | No evidence of an Odia system voice **[UNVERIFIED, probably no]**. |
| Windows local (SAPI/OneCore) | No Odia **[UNVERIFIED]**. |

Conclusion: browser-native Odia TTS is **not dependable** except on Edge. Need a server fallback.

### 2.2 Open models

**AI4Bharat Indic Parler-TTS** — Apache-2.0 **[snippet]**; Odia supported with named speakers (e.g. Manas, Debjani) **[snippet]**; Flan-T5 encoder + MusicGen-style decoder + DAC. Size ~0.9B params **[UNVERIFIED]**. GPU server needed for interactive latency; not browser-feasible.
- https://huggingface.co/ai4bharat/indic-parler-tts · https://tts.ai/voices/indic-parler/?lang=or

**MMS-TTS (`mms-tts-ory`)** — CC-BY-NC; disqualified (licence). Existence of Odia checkpoint **[UNVERIFIED]**.

### 2.3 Cloud APIs

- **Google Cloud TTS**: `or-IN` listed for **Gemini-TTS (Preview)** **[snippet]**. Whether Chirp 3 HD has `or-IN` — search snippets **conflict** (one says added March 2025, another says not listed) **[UNVERIFIED]**. https://docs.cloud.google.com/text-to-speech/docs/gemini-tts · https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types
- **Azure TTS**: `or-IN-SubhasiniNeural`, `or-IN-SukantNeural` neural voices **[snippet]**. https://json2video.com/ai-voices/azure/languages/odia/
- **Sarvam Bulbul**: Odia (`od-IN`) supported; v2 ₹15 / 10K chars, v3 ₹30 / 10K chars (beta) **[snippet]**. A typical 60-char message costs ~₹0.09 on v2. https://docs.sarvam.ai/api/getting-started/pricing

---

## 3. Non-reader UX patterns (short)

1. **Text-free UI** (Medhi, Sagar, Toyama — Microsoft Research India, 2007): ethnographic design with illiterate domestic workers in Bangalore slums; semi-abstracted graphics + voice feedback strongly preferred over text; a consistent always-available help (voice) button is essential. https://www.microsoft.com/en-us/research/?p=160568 · https://courses.cs.washington.edu/courses/cse490c/18au/readings/medhi-2007.pdf
2. **Mobile interfaces for novice/low-literacy users** (Medhi et al., ToCHI 2011): compared text, spoken-dialog and rich-multimedia UIs for mobile payments; non-text designs preferred, spoken dialog was faster and needed less assistance. https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ToCHI2711_Medhi.pdf
3. **Avaaj Otalo** (Patel et al., CHI 2009/2010): voice forum for Gujarat farmers; dialed (keypad) input beat speech input on task completion, especially for <8th-grade education — speech recognition errors are costly for this population, so **error recovery must be trivial**. https://hci.stanford.edu/publications/2009/chi2009_patel.pdf
4. **"Text is not the enemy"** (Knoche & Huang): illiterate users already use phones by memorising visual shapes of words/contacts — recognition of a few familiar words is achievable even without reading. https://vbn.aau.dk/ws/files/309756266/TextIsNotTheEnemy_NUI_Workshop.pdf
5. **Emergent smartphone users in India** (Microsoft Research, "Sophistication with Limitation"): low textual literacy users lean on voice notes, voice search and help from family. https://www.microsoft.com/en-us/research/?p=839809
6. **Google Read Along (formerly Bolo)**: on-device speech recognition + TTS for children learning to read; supports Hindi, Bengali, Tamil, Telugu, Marathi, Urdu etc. — **not Odia** **[snippet]**. https://en.wikipedia.org/wiki/Read_Along · https://india.googleblog.com/2020/09/reinforcing-our-commitment-to.html

Patterns to adopt: one big mic button; every output has a speaker button; read-back before send; word-level tap-to-hear and tap-to-fix; icons + voice prompts instead of instructions; let the user just *send a voice note* as an escape hatch (they may not need text at all).

---

## 4. The romanised-typing path for a speaker who cannot read Odia

The existing engine already serves "speaks Odia, types English letters". The gap is verification:
the user cannot tell `କେମିତି` from a wrong candidate.

| Idea | Cost | Reliability | Notes |
|---|---|---|---|
| **TTS read-back of each candidate / whole sentence** | Low: Edge native voice free; otherwise Bulbul v2 ~₹15/10K chars via a tiny proxy | Medium–high: TTS on Odia script is mostly faithful to spelling, so it reveals wrong vowel length/consonant choices the user can hear. Weak on errors that sound alike (ନ/ଣ, ସ/ଶ/ଷ — often homophonous in speech). | **Cheapest and best.** Works for ASR output too. Network call ⇒ opt-in. |
| **English gloss** | Medium: needs MT. Options: IndicTrans2 (AI4Bharat, MIT; server GPU) or Google Translate / Sarvam `translate`. Could also precompute glosses for the top-N lexicon words offline (Aksharantar has no glosses; would need a dictionary source + licence check). | Medium: helps non-Odia users more than Odia-speaking parents (who may not read English either). MT on misspelled Odia is unpredictable. | Second priority; useful for "non-Odia person in Odisha". |
| **Picture per word** | High: curated image set; only works for concrete nouns. | Low: abstract words (କେମିତି "how", ଅଛ "are") have no picture. | Phrasebook use only, not general writing. |
| **Re-romanise the chosen Odia** (show `ke-mi-ti` back in a strict scheme) | Very low: pure engine, offline, uses strict ITRANS mode reversed | Medium: tells user what was chosen, but they typed it so it's circular; scope doc excludes Odia→English reverse transliteration. | Note only. |

Recommendation for §4: TTS read-back first (offline-impossible for most OSes, so this too needs an opt-in online path); English gloss second; pictures only for a phrasebook mode.

---

## 5. Recommendation — v1 "speak-to-write" on a Vercel-hosted web app

Pre-condition: amend `plan/04-scope.md` (voice input, website, and network call are all
currently excluded). Keep `core/` untouched and offline; put voice in `web/` behind an explicit
"Use online voice (sends your audio to Sarvam/Google)" toggle.

Architecture:
1. **Browser** records with `MediaRecorder` (16 kHz mono, short clips ≤30 s).
2. **Vercel API route** (Edge/Node function) holds the API key, forwards audio to **Sarvam Saarika/Saaras** (`od-IN`) and returns text. Vercel cannot self-host IndicConformer/SraVaani: function bundle limit (~250 MB) and execution timeouts rule out 600–900 MB models.
3. Output Odia text passes through `canonical()` (nukta invariant: ASR vendors may emit precomposed U+0B5C/U+0B5D).
4. **Read-back**: try `speechSynthesis` with an `or-IN` voice (Edge); else call **Sarvam Bulbul v2** through the same proxy. Big speaker button on the whole sentence and on each word.
5. **Fix loop**: tap a word → show transliteration-engine candidates for that word (re-uses the existing core) each with a speaker icon; or re-speak just that word.
6. Optional: Saaras v3 `translate` mode for an English gloss line (one extra call).

Why Sarvam first: supports Odia GA (Google Chirp 3 `or-IN` is Preview), cheapest (₹30/h ≈ $0.36/h vs Google ≈ $0.96/h), one vendor for ASR + TTS + translate, India-hosted. Fallback/second vendor: Google Chirp 3. Bhashini only if free quota/eligibility is confirmed.

Cost sanity: 1,000 users × 20 clips/day × 10 s = ~56 h/day ≈ ₹1,700/day (~$20). A single family user ≈ pennies/month.

Later (v2, if offline is mandatory): self-host IndicConformer or SraVaani (MIT) on a GPU box, or experiment with a 131 MB per-language int8 ONNX in onnxruntime-web (WebGPU) — unproven, expect multi-second latency on phones.

Privacy: every viable path sends the user's voice to a third party (Sarvam, Google, or Microsoft for Edge TTS). State it plainly in the toggle; do not store audio server-side; do not log transcripts.

Not recommended: Whisper (no Odia), MMS (CC-BY-NC), Azure STT (no Odia), browser Web Speech as the primary path (Odia support unverified, Chrome-only, ships audio to Google anyway — but worth the 30-second test; if it works in Chrome it is a free zero-infra option for Chrome users).
