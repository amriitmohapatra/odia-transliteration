# 05 — Direction for v3: decision brief

**Status:** decisions recorded 2026-10-04 (§11). D-6 is still open (D-10 decided: public website). Each stage
in §13 starts only when the owner approves it.

**Purpose:** the owner asked for "more informed ideas to decide". This file collects the
research, shows where each new idea conflicts with the current plan, and gives one
recommendation per idea. The owner decides. Then we build.

**Writing style:** STE-flavored (ASD-STE100): short sentences, active voice, tables for
comparisons. Terms that are not common English are in the glossary (§13).

**Evidence:** the seven research notes, with source URLs, are in
`plan/research/2026-10-04/`. The network proxy in the research environment blocked many
web pages. Some facts therefore come from search-result summaries, not from the primary
page. The research notes tag each such fact. This brief marks them **(unverified)**.

---

## 1. Summary in ten lines

1. The app already does one thing that no competitor does: it shows an **English meaning
   under each Odia suggestion while you type**. This is the core of the value proposition.
2. Most new ideas (lens, voice, Vercel site, Odia→English) were on the "never" list in
   `plan/04-scope.md`. The owner reopened them on 2026-10-04 (§3, D-1).
3. Recommended shape: **keep the offline engine exactly as it is, and add an optional
   online "assist" layer** for voice, read-aloud and sentence translation (§4).
4. Vercel can host the app as a static site with no change to the offline rule. Only the
   assist layer needs Vercel server functions.
5. The dictionary needs work, mostly for **quality and licence**, not age. The "modern"
   layer has an unknown origin and contains machine-translation noise (§5).
6. Laya is a real, free model (Apache-2.0, Sept 2026). Without fine-tuning it scores
   near random, and nobody tested it on Odia. Use it only as an **offline experiment**,
   never inside the engine (§8).
7. The translation lens is feasible, but **no built-in OCR on Apple, Google or Chrome
   reads Odia**. The cheapest first lens is a **browser extension**, which needs no OCR
   (§9).
8. Speak-to-write is feasible only through a cloud service. Odia speech recognition
   gets about **one word in three or four wrong**, so read-back is necessary (§7).
9. Slang, colloquial words and abuses get a data layer, a test set and a
   **family-safe filter that is on by default** (owner decision, 2026-10-04). No usable
   Odia abuse list exists, so the owner labels the words (§6).
10. Before any public release: decide about the scraped web corpus in git history (§10).

---

## 2. What the app is for, and how it differs from a keyboard

### The answer in one sentence

> Type Odia the way it sounds, and see what each suggested word means in English before
> you pick it.

### How it differs from a keyboard

| A keyboard (Gboard, Windows Odia Phonetic) | This app |
|---|---|
| Turns `dina` into an Odia word. It assumes that you can read the result. | Shows ଦିନ "day" and ଦୀନ "poor" side by side. You pick by meaning. (Checked against the shipped dictionary data, 2026-10-04.) |
| Everyday words only. | A Sanskrit mode for slokas (Gita, Puranas) in Odia script, with the right visarga and conjuncts. |
| Needs an install or a phone. | One page on any computer. No account. Nothing typed leaves the device. |

### What is NOT a difference

- **Offline typing.** Gboard and the Windows 11 Odia Phonetic keyboard also work offline.
- **Accuracy numbers.** No competitor publishes Odia accuracy, so a comparison is not
  possible. Do not use "89% top-1" in comparisons.

### Where not to compete

| Area | Who already does it well | Our position |
|---|---|---|
| Full sentence translation | Google Translate, Microsoft, Bhashini, Sarvam | Link out, or use their API. Do not build an MT model. |
| Camera translation | Google Lens | Our lens adds word meaning plus pronunciation, not only a translation. |
| Mobile keyboard | Gboard, SwiftKey, Desh | Later, and only with the meaning feature as the reason to switch. |

Source: `research/2026-10-04/05-competitors-uvp.md`. Most competitor facts are
**(unverified)**: the proxy blocked the product pages.

---

## 3. Scope decisions required

`plan/04-scope.md` lists these as "Not building — ever". Each new idea needs one of them
reversed. The owner accepted S-1 to S-5 on 2026-10-04 (D-1).

| # | Excluded today | New idea that needs it | Recommendation |
|---|---|---|---|
| S-1 | "a website" | Vercel-hosted app | **Reverse.** A static site keeps the engine offline. |
| S-2 | "Any network call" (from shipped code) | Voice, read-aloud, sentence translation | **Keep for the engine. Allow for an opt-in assist layer only.** The engine (`core/`) never calls the network. The web page calls the network only after the user turns a feature on. |
| S-3 | "Odia → English reverse transliteration" | Lens: romanized pronunciation of Odia text | **Reverse, to show pronunciation only.** A romanized line under Odia text helps a non-reader say the word. |
| S-4 | "Voice input or OCR" | Speak-to-write, lens | **Reverse, through the assist layer.** |
| S-5 | "Mobile keyboards (iOS / Android)" | Android and iOS versions | **Reverse later**, after the desktop/web version (the owner's own order). iOS Stage D already exists in `02-stages.md`. Android is new. |
| S-6 | "Spell-check or grammar checking" | (not asked) | Keep excluded. |

---

## 4. Recommended architecture

```
                      ┌──────────────────────────────────────────┐
  any browser         │  STATIC WEB APP on Vercel (offline after │
  (Mac, PC, phone)    │  first load; service worker caches it)   │
                      │                                          │
                      │   core/ engine  ── unchanged, offline    │
                      │   dictionary    ── loaded once, cached   │
                      │   family-safe filter, phrase table       │
                      └───────────────┬──────────────────────────┘
                                      │ only if the user turns on
                                      │ an online feature
                      ┌───────────────▼──────────────────────────┐
                      │  ASSIST LAYER: Vercel server functions   │
                      │   /api/listen     speech → Odia text     │
                      │   /api/speak      Odia text → audio      │
                      │   /api/translate  sentence → English     │
                      │  API keys stay on the server.            │
                      └───────────────┬──────────────────────────┘
                                      │
                       Sarvam · Google · Azure · Claude (choose in §11)
```

Rules for this shape:

1. `core/` stays pure, synchronous and offline. No model and no network call enter it.
2. Every string that comes back from a cloud service goes through `canonical()`. OCR and
   speech services can return the precomposed nukta forms (U+0B5C, U+0B5D).
3. Each online feature has its own switch. The switch says, in plain words, which company
   receives the text or the voice.
4. Cache answers by their canonical text. This keeps the cost down.

### What to build the Vercel app from

The repository audit (`research/2026-10-04/06-repo-audit.md`) recommends **one Vite app
that merges `web/` and `Appv2/`, with the dictionary loaded as a separate cached file**.
Four problems block a direct deploy of the current files:

| Problem | Where | Fix | Status |
|---|---|---|---|
| Two service workers on one site delete each other's cache. | `web/vite.config.ts:142-152`, same code in `Appv2/` | One app, one service worker. | **V0 done 2026-10-04:** each worker owns only its own caches. V1 still merges to one worker. |
| The dictionary is 8.6 MB of base64 inside the HTML. It only works in the single-file build. It finds the page by CSS class names, so a rename breaks it with no error. | `Odia_Sanskrit_Appv2/build/` | Make the dictionary a normal module of the app with a separate data file. | **Moved to V1** (2026-10-04). V1 merges the apps, so doing it now means doing it twice. |
| No Odia font is bundled. A computer without an Odia font shows boxes. | `web/src/style.css:41` | Bundle Noto Sans Oriya (OFL). | **V0 done 2026-10-04.** |
| In the suggestion bar, Space always picks the Odia word. An English word needs Escape first, and `learn()` never records it. | `web/src/inline.ts:125,170-174` | Keep the typed English word in the bar. | **V0 done 2026-10-04.** Root cause was in `core/src/rank.ts`: a taught English word was dropped and re-added last. Fixed too. |

Hosting cost: Vercel's free "Hobby" plan is for personal, non-commercial use. A public
product needs the Pro plan (about US$20 per month) **(unverified price)**.

---

## 5. Dictionary: words, phrases, sentences

### What we found

- Everyday words such as ଘର (house) and ଭଲ (good) have **no modern gloss**. They show only
  the 1930s Praharaj entry. (Checked in the shipped data.)
- The "MODERN" layer comes from `OdiaNLP/dictionary` `cleaned_pairs.json` (215,339
  pairs). The README calls it MIT. The repository is MIT, but **the origin of its source
  text is unknown**, and samples look like machine translation
  (`'sweat lodge' -> at ାଳ ଲଜ`). Some of the "outdated" feel is this noise.
- The meaning-layer sources (Praharaj, indic-dict, OdiaNLP, CLDR) are **not recorded in
  any `PROVENANCE.md`**. They are now the main feature, so they need records and checksums.
- The engine has **no context**. It scores each word alone (`core/src/index.ts:78-112`).
- Words outside the lexicon (OOV) are the weak point: **6.9% top-1** on the held-out set,
  against 63.3% for words in the lexicon (`tools/eval/baseline.json`).

### Sources that are safe to ship (MIT / CC0 / CC-BY)

| Source | Gives us | Licence |
|---|---|---|
| Wikidata labels and lexemes | Modern names: festivals, foods, places, institutions | CC0 |
| AI4Bharat BPCC-H-Daily, IN22-Conv | Human-translated everyday and chat sentences → phrase table, test set | CC-BY-4.0 |
| IndicCorp v2, Samanantar | Word-pair counts for context ranking. Aligned English glosses. | CC0 |
| Praharaj origin tags (already in hand) | Hindi (~4,700), Persian (~2,300), Arabic (~1,600), English (~2,000) headwords | Public domain |
| Aksharantar `hin` / `urd` | Romanized forms of Hindi and Urdu words | CC-BY / CC0 |
| CLDR emoji keywords, Common Voice sentences | Small, clean extras | Unicode / CC0 |

**Do not ship:** IndoWordNet (non-commercial), Wiktionary and FLORES (share-alike),
OdiaGenAI datasets (non-commercial), the Hunspell list (GPL), Indic-Glossaries (unclear
upstream licences). Use share-alike sets for offline evaluation only.

### Recommended work, in order

1. **Fill the lexicon at build time with IndicXlit** (MIT, 11M parameters). This attacks
   the 6.9% OOV number directly. `04-scope.md` already permits this.
2. **Add word-pair (bigram) counts** from CC0 corpora. The engine then uses the previous
   word to rank. `04-scope.md` lists this as "deferred until measured". The OOV number is
   that measurement.
3. **Replace the "MODERN" layer** with glosses aligned from Samanantar/BPCC plus Wikidata.
4. **A phrase table written by the owner.** Greetings, WhatsApp phrases, festival
   wishes, and the three levels of "you" (ଆପଣ / ତୁମେ / ତୁ). Because the owner writes it,
   it is MIT by construction. This is where "cultural context" lives.
5. **Record every source** in `PROVENANCE.md` with a checksum.

---

## 6. Slang, colloquial words and abuses

**Owner decision (2026-10-04): the family-safe filter is ON by default.**

Testers will try slang and abuses first. Full notes: `research/2026-10-04/07-slang-colloquial.md`.

### What we found

- **No Odia abuse list exists that we can ship.** The common lists (LDNOOBW, MACD) have no
  Odia. The labelled Odia datasets are unreleased, non-commercial, or have no licence.
  **The owner must label the offensive words.**
- **Imported lists block everyday words.** A small npm list (`cleanword`) has five Odia
  entries that are also in our lexicon. Praharaj glosses all five as ordinary words
  ("mad", "goat", "hut", "mortar"...). Do not import a list without review.
- **Praharaj already tags candidates.** In the shipped subset: 1,796 colloquial words
  (ଗ୍ରା.), 1,408 regional words (ପ୍ରାଦେ., about 631 of them Sambalpuri), and 348 entries
  with an offensive marker. These are a review queue for the owner, not a final list.
- **Spoken forms are in the corpus, but rare.** Examples: କଣ 10,822, ମତେ 4,956, ନାଇଁ 3,265,
  ହଉ 1,178, ଯାଉଚି 346 (written ଯାଉଛି 1,902). They come from fiction dialogue, not from the
  "social" lane, which is mostly politicians' posts.
- **Most spoken forms already come first.** `kana`, `kouthi`, `mate`, `naain` and
  `karuchi` give the right word at rank 1.
- **Gap: `j` never gave ଯ. Fixed 2026-10-04 (D-12).** The core rules mapped `j` only to ଜ,
  so `je`, `jadi` and `jiba` never offered ଯେ, ଯଦି, ଯିବା. ଯେ is the 5th most frequent word
  (81,614 tokens). The Sanskrit app's default mode already had this option (its delta S8,
  weight 0.6). That option now lives in the core rules for every mode. Now: `je` → ଯେ at
  rank 2, `jadi` → ଯଦି at rank 2, `jiba` → ଯିବା at rank 3.
- **Still open:** `jauchi` does not offer ଯାଉଚି (the `au` reading, not the `j`). `j` inside
  a compound (`upajoga` → ଉପଯୋଗ) does not reach ଯ, because the option is word-initial only.
- **Apostrophe forms (କ'ଣ) are lost.** The corpus merge filter drops them.
- **The full lexicon has 5 rows with a nukta on ଯ** (U+0B2F U+0B3C), which is not an Odia
  form. One appears at rank 3 for `ye`. Audit nukta on every consonant other than ଡ and ଢ
  as part of decision D-6.

### Design

Labels live in a data file, never in code. Every entry goes through `canonical()`, or a
nukta mismatch defeats the filter.

| Label | Effect with family-safe ON |
|---|---|
| `offensive` | Never shown as a near match. Shown only when the roman input equals one of the word's own lexicon keys. Gloss carries an "offensive" badge. |
| `coarse` | Shown normally, with a "can be rude" badge |
| `spoken`, `slang`, `dialect` | Label only. No filtering. |

Rules:

1. **The user can always type any word.** Strict mode and the rule path are not filtered.
   The filter touches only lexicon and learned suggestions.
2. **Whole words, never substrings.** Odia syllables are short, so substring matching
   blocks innocent words. Tag the stem. Generate the suffixed forms (ରେ, କୁ, ମାନେ...) for
   the owner to approve. Match exact words at runtime.
3. **An explicit pick is learned only under its exact roman key.** It then never appears
   as a near match for other input.
4. **The badge matters for non-readers.** A user who cannot read Odia must not send an
   abuse by accident.
5. Precedent: the open-source Android keyboard behind Gboard blocks offensive words by
   default, shows a flagged word only on an exact match, and does not learn it while
   blocking is on **(default-on is unverified)**.

### Tests

- `core/test/golden/colloquial.tsv` — columns `roman odia register source`, several roman
  spellings per word, typed by people. Report it by register. Never average it with the
  other test sets.
- Guard test, family-safe ON: for common inputs and for near-miss variants of each
  offensive word (aspiration, dental/retroflex, vowel length, ଣ/ନ, ଳ/ଲ, ଶ/ଷ/ସ):
  no `offensive` word in the top 5. The exact key still returns the word. Strict mode is
  unchanged. `coarse` words stay visible.
- Guard test, family-safe OFF: ranking is identical to the engine without the filter.

### Owner tasks (no agent can do these)

1. Label the Praharaj review queue: `offensive`, `coarse`, or not.
2. Approve the generated suffixed forms.
3. Check each row of `colloquial.tsv`.

---

## 7. Speak-to-write, for people who cannot read or write Odia

There are two different users:

| User | Can do | Gap | Feature |
|---|---|---|---|
| A | Speaks Odia, types English letters | Cannot check the Odia result | **Read-back**: speaker button and romanized line under the output. English gloss under each word (exists). |
| B | Speaks Odia only | Cannot type at all | **Voice input** through the assist layer, then the same read-back. |

### Speech recognition (speech → text)

| Option | Odia quality | Runs where | Cost |
|---|---|---|---|
| Sarvam Saarika / Saaras (`od-IN`) | ~30% word error rate | Cloud (India) | ~₹30 per hour of audio, ₹300 free credit **(unverified)** |
| Google Chirp 3 (`or-IN`) | "Preview". No published error rate. | Cloud | ~US$0.016 per minute **(unverified)** |
| AI4Bharat IndicConformer / IndicWhisper | ~25–27% word error rate | Own GPU server, 0.6–0.9 GB | Server cost |
| Chrome built-in speech (`or-IN`) | **Unknown** if it supports Odia | Google servers | Free |
| OpenAI Whisper | **No Odia** | — | — |
| Meta MMS | Non-commercial licence: **not usable** | — | — |

### Read-aloud (text → speech)

| Option | Odia | Cost |
|---|---|---|
| Sarvam Bulbul (`od-IN`) | Yes | ~₹15 per 10,000 characters **(unverified)** |
| Azure Speech | Yes, two voices | Paid |
| Browser built-in voice | Probably only in Microsoft Edge **(unverified)** | Free |
| AI4Bharat Indic Parler-TTS | Yes, Apache-2.0, needs a GPU | Use at build time to record common words |

### Recommendation

1. Build **read-back for user A first**. The romanized line is offline and free. The
   audio uses the browser voice where one exists, else Sarvam Bulbul.
2. Build **voice input for user B second**, through `/api/listen` with Sarvam.
3. Each word in the result is tappable. A tap shows the engine's alternatives, each with
   a speaker button. With one wrong word in three or four, an easy fix is necessary.
4. Research on low-literacy users (Medhi et al. 2007, 2011) supports voice plus pictures
   over text. Pictures fit a phrasebook of concrete nouns, not free text.

---

## 8. Laya (and Jev)

| | Laya | Jev |
|---|---|---|
| Who | ConvAI Innovations, released ~18 Sept 2026 | TypeSafe AI, released ~15 Sept 2026 |
| Licence | Apache-2.0 (free, open weights) | Hosted only, ~US$0.042 per 1M input tokens **(unverified)** |
| What it does | Picks an answer from a fixed list, a score, or yes/no. **It does not write text.** | Same type |
| Size | 322M (multilingual) | — |
| Odia | Not in its 51-language benchmark. **Never measured.** | **(unverified)** |
| Out of the box | **Near random** (0.36 against 0.318 random, from its own repo) | Reported as useful without training **(unverified)** |
| Runs in browser | Yes (async, onnxruntime-web) | No |

**So the premise "Laya can do what Jev does, for free" is not true yet.** Laya becomes
useful only after fine-tuning on 10,000–30,000 labelled examples (about 4–5 hours on a
free Kaggle GPU).

Why it cannot go inside the engine:

- It is ~30 times larger than IndicXlit, which `04-scope.md` already calls too heavy.
- Its API is asynchronous. The engine API is synchronous on purpose.
- It is unknown whether it loads inside the macOS input method (JavaScriptCore).

Where it could help, as an **offline experiment** (task E-1):

| Task | Cheaper first choice | Laya's role |
|---|---|---|
| Tag a word as native / Sanskrit / English loan / Hindi-Urdu loan | Small character-pattern classifier trained on Praharaj's origin tags (a few hundred KB) | Compare against it. Use Laya only if it wins clearly. |
| Pick a candidate from sentence context | Bigram counts (§5) | Offline comparison only |
| Phrase or sentence transliteration | Not possible: Laya does not generate text | — |
| Pick the right dictionary sense | Modern gloss first, plus one build-time LLM pass | — |

Recommendation: **build the simple tagger first. Run Laya as experiment E-1 only if the
simple tagger is not good enough.** Revisit when Laya publishes an Odia evaluation.

---

## 9. Translation lens

Reference: `cristaecooks/Translation-Lens-MacOS` (MIT, ~3,400 lines of Python, macOS on
Apple Silicon only). It is a **dictionary and pronunciation lens, not a translator**. It
uses Apple Vision for OCR. **Apple Vision does not read Odia**, and its own README says
other scripts need a different OCR engine. Its interface ideas are reusable (see-through
frame, speaker per word). Its capture and OCR code are not.

### The deciding fact

No built-in OCR reads Odia: not Apple Vision or Live Text, not Google ML Kit, not
Chrome's built-in translator. Every lens must bring its own OCR (Tesseract `ori`, 1.5–8 MB,
Apache-2.0) or send the image to a server.

### What each platform can do

| Platform | Can it read text in other apps? | How |
|---|---|---|
| Web page on Vercel | Desktop only, through screen sharing. The browser asks every session. Not on phones. | Screen share → crop → Tesseract in the browser. Also paste, upload, camera. |
| Browser extension | Any web page's text. **No OCR needed**, because web Odia is real text. | Hover tooltip. Desktop Chrome, Edge, Firefox. Then Safari. |
| macOS app | Yes, after one permission | ScreenCaptureKit + Tesseract |
| Android | Yes, with consent each session | Screen capture + overlay |
| iOS | **No floating lens is possible** | Share sheet, camera, Safari extension |

### Recommended order

1. **Lens v1 = browser extension.** Hover over Odia text on any web page. See each word's
   meaning, romanized pronunciation and a speaker button. Sentence translation is one
   click away through `/api/translate`.
2. **Lens v2 = web app input:** paste, upload a screenshot, or use the camera, on any device.
3. **Lens v3 = native macOS lens**, then Android. On iOS, share sheet and camera only.

### Sentence translation options (for `/api/translate`)

| Option | Licence / price | Note |
|---|---|---|
| Google Translate API | 500k characters per month free, then ~US$20 per million | Odia since 2020 |
| Claude Haiku 4.5 | ~US$1 in / US$5 out per million tokens | One call can also return per-word meanings |
| Sarvam | ~₹20 per 10,000 characters | Similar price class |
| IndicTrans2-dist 200M | MIT, ~200 MB at int8 | Self-host possible on Vercel Large Functions (beta), but CPU-only and slow to start |
| NLLB-200 | Non-commercial: **not usable** | — |

Recommendation: choose between Google and Claude Haiku after a **100-sentence test**
judged by the owner.

---

## 10. Words from other languages written in Odia script

News channels write English, Hindi and Urdu words directly in Odia script.

| Case | Today | Proposed |
|---|---|---|
| User types an English word in English letters | The engine keeps it as the last candidate. The suggestion bar hides it (bug, §4). | Fix the bar. |
| English word written in Odia script (ମୋବାଇଲ) | Dictionary shows "English: mobile" (the `LOAN` tag). It does not change the ranking. | Keep. Use the tag in the lens too. |
| Hindi or Urdu word in Odia script | **Nothing specific.** | Use Praharaj origin tags plus Aksharantar `hin`/`urd`. Show "Hindi:" or "Urdu:" with the gloss. |
| Nukta on ଜ / ଫ for Urdu sounds (z, f) | `PROVENANCE.md` calls these forms "malformed". | **Decide a policy first** (§11, D-6). Otherwise lexicon keys and `canonical()` conflict. |

---

## 11. Decisions

The owner accepted every recommendation on 2026-10-04 ("D-1 to D-12 all as you
recommend"). Two recommendations postpone the choice. Those two rows stay **open** until
their trigger occurs.

| # | Decision | Status | Result |
|---|---|---|---|
| D-0 | Family-safe default | Decided 2026-10-04 | **ON** |
| D-1 | Amend `04-scope.md` as in §3 (S-1 to S-5) | Decided 2026-10-04 | Yes. S-6 (spell-check) stays excluded. |
| D-2 | Architecture (§4) | Decided 2026-10-04 | Offline core plus an opt-in assist layer |
| D-3 | Cloud providers that may receive user text or voice | Partly decided 2026-10-04 | Voice: **Sarvam**. Translation: Google or Claude Haiku. The 100-sentence test (§9) picks one. |
| D-4 | Monthly budget for cloud services | Decided 2026-10-04 | Hard cap **US$20 per month** |
| D-5 | Replace the "MODERN" dictionary layer (§5) | Decided 2026-10-04 | Yes |
| D-6 | Nukta policy for ଜ / ଫ in Urdu and English loans | **Open** | Trigger: the owner reviews 50 loanword examples |
| D-7 | Lens v1 form (§9) | Decided 2026-10-04 | Browser extension |
| D-8 | Vercel plan | Decided 2026-10-04 | Hobby until public, then Pro |
| D-9 | Laya | Decided 2026-10-04 | Experiment E-1 only, after the simple tagger |
| D-10 | Public or private product (§12) | Decided 2026-10-04 | **Public website.** The repository stays private until the owner says otherwise (a public repo needs a fresh repository without the scraped corpus). |
| D-11 | Update `CLAUDE.md` stale lines (§12) | Decided 2026-10-04 | Yes |
| D-12 | Let `j` also give ଯ (§6) | Decided 2026-10-04 | Yes. **Done** 2026-10-04, measured before and after. |

---

## 12. Housekeeping and risks

1. **Scraped text in git history.** `tools/build-data/webcorpus/` (247 MB) holds raw
   third-party text that the MIT licence does not cover. The repository has **one
   commit**, so a clean public repository is cheap: make a new repository without that
   folder. Do not only delete the files: they stay in history.
2. **Word counts from the scraped corpus.** The everyday vocabulary that works best
   (`core/data/webfreq.tsv`) comes from that corpus. Counts are probably lower risk than
   the text itself, but this is a legal question, not a technical one. Decide before the
   app becomes public.
3. **`CLAUDE.md` is stale.** It says "pre-Stage-A. Nothing built yet." In fact three apps
   are built and measured. It also describes a Tauri `app/` that does not exist, and
   says Noto Sans Oriya is bundled (it is not).
4. **Native-speaker review.** The romanization scheme is still unreviewed
   (`AGENTS.md` §7.4). Public testers will find these first.
5. **Known engine issues:** `mu` gives ମୁ, not ମୁଁ (§7.5). The conflict between coverage and correctness
   is unresolved (§7.1).
6. **Test status, 2026-10-04:** core 128/128 pass, Appv2 15/15 pass, fallback page 58
   checks pass.

---

## 13. Proposed stages

Each stage is useful alone. The owner approves each stage before it starts.

| Stage | Content | Network | Needs decisions |
|---|---|---|---|
| **V0 Clean-up** — **done 2026-10-04** except D-10 | Service-worker caches, English word in the bar (and the `rank()` bug behind it), bundled font, dictionary provenance (`Odia_Sanskrit_Appv2/PROVENANCE.md`), `CLAUDE.md`, `j` → ଯ. The dictionary module moved to V1. | none | D-10 |
| **V1 Web app on Vercel** | One merged app (Odia, Sanskrit, dictionary). The dictionary becomes a module of the app, with its data as a separate cached file. Family-safe filter. Romanized read-back line. Colloquial and guard tests. | static only | D-1, D-8 |
| **V2 Better words** | IndicXlit lexicon fill. Bigram ranking. Phrase table. New modern glosses. Hindi/Urdu layer. | none | D-5, D-6 |
| **V3 Assist layer** | `/api/speak`, `/api/listen`, `/api/translate`, behind switches. | opt-in | D-2, D-3, D-4 |
| **V4 Lens** | Browser extension, then web-app camera and screenshot input. | opt-in for translation | D-7 |
| **V5 Native** | Real engine in the macOS input method. macOS lens. Then Android and iOS (install the mobile skills first). | — | later |
| **E-1 Experiment** | Laya against a simple tagger for word origin. | offline | D-9 |

### Team ("one-person company")

The owner is the head of the company. Claude is the project lead. Claude gives tasks to
sub-agents. Each sub-agent has one role:

| Role | Owns |
|---|---|
| Research analyst | Sources, licences, competitor facts |
| Data engineer | `tools/build-data/`, lexicon and dictionary builds, `PROVENANCE.md` |
| Engine engineer | `core/` and the TOML rules |
| Frontend engineer | The Vercel app, the extension |
| QA engineer | Tests, `npm run eval`, WebKit checks, the guard test |
| Licence officer | Every new data source is MIT / CC0 / CC-BY before it ships |

The owner keeps three jobs that no agent can do: linguistic review, offensive-word
labelling, and the 100-sentence translation judgement.

### Five-minute checks the owner can do now

1. On a Mac, an iPhone and in Microsoft Edge: open a browser console, run
   `speechSynthesis.getVoices().filter(v => v.lang.startsWith('or'))`. Report what appears.
2. On Android: try Gboard voice typing in Odia.
3. On Android: use Circle to Search on a screenshot of Odia text.
4. On a Mac: check System Settings → Keyboard → Input Sources for any Odia phonetic option.

---

## 14. Glossary

| Term | Meaning here |
|---|---|
| Assist layer | Optional online features that run on Vercel server functions, not in the engine |
| Bigram | A count of how often two words occur next to each other |
| Fine-tune | Train an existing model further on our own labelled examples |
| Lexicon | The list of romanized → Odia word pairs the engine uses |
| OCR | Software that reads text from an image |
| OOV | "Out of vocabulary": a word that is not in the lexicon |
| Service worker | Browser code that stores the app so it works offline |
| Static site | Files only. No server code runs. |
| Top-1 / top-5 | The right answer is first / in the first five suggestions |
| Word error rate | The fraction of words a speech recogniser gets wrong |
