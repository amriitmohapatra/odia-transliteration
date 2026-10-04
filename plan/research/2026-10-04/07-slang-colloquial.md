# Research 07: slang, colloquial Odia and abuses

Date: 2026-10-04. Research only. No repository file was edited.
Supports `plan/05-v3-direction.md` §6 (family-safe filter ON by default, owner decision D-0).

Policy for this file: no abusive word is written here. Offensive items are given only as
counts or categories.

Tags: **[verified]** = primary source read (file, licence text or code).
**[unverified]** = search snippet or secondary page only. **[not checked]** = not researched.

---

## 0. Headline findings

1. **No Odia offensive-language resource is both usable and shippable.** Every Odia abuse
   dataset found is either non-commercial (ADIMA), audio-only (ADIMA), unreleased or of
   unknown licence (Mohapatra 2021, IJISAE 2023, SCIDN), or very small with unknown
   provenance (`cleanword`, 84 Odia entries). LDNOOBW has no Odia. **The owner has to
   label the offensive list.** Praharaj and the corpus can only supply candidates for review.
2. **Lists you import will block everyday words.** In the third-party `cleanword` Odia
   list, all **5 of 5** entries that also appear in the shipped `lexicon-web.tsv` are
   dual-use common words. Praharaj glosses them as "mad", "stupid / sacrificial goat",
   "search / eunuch", "crooked / hut" and "mortar". Their web frequencies are 645, 244,
   217, 110 and 88. A single on/off "offensive" tag would hide these words from ordinary
   writing. **This is the case for severity tiers.**
3. **The corpus "social" lane holds no colloquial Odia.** It is 60 politicians' X
   handles plus news pages that quote them. Every colloquial form I probed has **0** hits
   there. The colloquial forms in `webfreq.tsv` come from fiction dialogue in the
   literature lane and the archive.org OCR lane.
4. **Spoken verb forms are present but rare.** Spoken `-ଚି/-ଚୁ` endings make up about
   **5–11%** of the written `-ଛି/-ଛୁ` count. Forms with an apostrophe (କ’ଣ, ତା’ର) are
   **dropped by the merge filter**. This was already documented in PROVENANCE, and it is a
   real gap.
5. **A typing gap blocks the most common colloquial verbs: `j` cannot reach ଯ.**
   `symbols.toml` maps `j` → ଜ only, and `build_common_lexicon.py` romanizes ଯ as `y`. The
   result is that `je` (for ଯେ, the 5th most frequent word in webfreq, 81,614), `jiba`,
   `jadi`, `jodi` and `jauchi` all return only ଜ-forms. The cheat sheet documents `ya` →
   ଯ, so this is by design, but people who type by sound write `j`. Any colloquial test
   set will fail on this whole verb family until the owner decides. (Evidence in §3.4.)

---

## 1. Data sources: slang, colloquial and dialect

Project rule: only MIT / CC0 / CC-BY data ships. Anything CC-BY-SA, NC, or of unknown
licence is flagged and may be used only as a review aid that is never shipped.

| Source | Contents | Licence | MIT-compatible to ship? |
|---|---|---|---|
| **Praharaj, Purnnachandra Odia Bhashakosha** (already in repo as `Odia_Sanskrit_Appv2/build/dict_payload_v2.b64`, via indic-dict/stardict-oriya) | 146k headwords, 1931–40. Register tags: ଗ୍ରା. (ଗ୍ରାମ୍ୟ, rustic/colloquial), ପ୍ରାଦେ. (regional, with the region in brackets), ଦେ. (ଦେଶଜ, native) and offensive-sense glosses (counts in §3.3) | Text is public domain (author d. 1946, per the build script). The packaging repo has **no LICENSE file** (404) **[verified]** | **Yes for the text (PD).** Record in PROVENANCE that the indic-dict packaging has no licence. The 1930s register is not modern slang |
| **`core/data/webfreq.tsv`** (repo) | 527k types. Colloquial forms come from the literature and archive-OCR lanes | Build-time scrape. The repo's MIT LICENSE does not cover it (see CLAUDE.md) | Already shipped as frequencies. See the CLAUDE.md git-history warning |
| **IndicVoices** (AI4Bharat) | 23.7k h of read, extempore (76%) and conversational speech. 400+ districts. Transcripts include Odia | CC-BY-4.0 **[unverified: aikosh.indiaai.gov.in snippet]**. README read, but no licence line or transcription-normalisation rule found **[verified absence in README]** | **Probably.** The open question: did transcribers normalise spoken ଯାଉଚି → written ଯାଉଛି? If they did, it is not a colloquial source. Check the Shoonya transcription guidelines before use |
| **Vaani** (IISc/ARTPARK + Google) | ~2,067 h of transcribed spontaneous, image-prompted speech, district-wise, includes Odisha | CC-BY-4.0 appears only as the **arXiv paper's** licence. The dataset licence is **[unverified]** | Unknown. Flag |
| **Wiktionary** categories (e.g. Odia slang, vulgarities, dialectal terms) | Unknown. en.wiktionary.org and kaikki.org were blocked by the proxy | **CC-BY-SA 4.0** | **No, whether or not the categories exist.** Usable only as an owner-review aid |
| **Living Dictionaries: Baleswari Odia** (livingdictionaries.app/baleswari-odia) | Community dialect dictionary | **[not checked]** | Flag |
| Sambalpuri/Kosli and Ganjami corpora or glossaries | Nothing found on GitHub or Hugging Face in searches | n/a | n/a |
| Gen-Z, meme and Romanized-Odia chat data | **Nothing found.** No Odia equivalent of Dakshina. Aksharantar is word pairs, not chat | n/a | n/a. Harvest from tester sessions instead (§5) |
| odishabytes "The Intimacy of Slangs" (essay on Puri slang) | Prose article | Copyright | No (reading only) |

## 2. Offensive-language resources for Odia

| Resource | Odia? | Contents | Licence | Ship? |
|---|---|---|---|---|
| **LDNOOBW** (Shutterstock) | **No.** 28 languages, including Hindi, but not Odia **[verified, README]** | Word lists for autocomplete filtering | CC-BY-4.0 **[verified]** | Licence is fine, but there is nothing for Odia. Useful as a precedent: "What wouldn't we want to *suggest*?" |
| **MACD** (ShareChat, NeurIPS 2022) | **No.** Hindi, Tamil, Telugu, Malayalam and Kannada only **[verified, repo README]** | 150k labelled comments | No LICENSE file found in the repo **[verified 404]** | No (no Odia; unknown licence) |
| **AbuseXLMR** (MACD model) | "15+ Indic languages" **[unverified]** | Model weights on Google Drive | Unknown | No (a model, not a word list) |
| **ADIMA** (ShareChat, ICASSP 2022) | **Yes**, about 1.2k Odia clips | Audio with yes/no profanity labels. **No transcripts** | "Non-commercial scientific research" licence from Mohalla Tech **[verified, LICENSE]** | **No** (NC, and audio only) |
| **SCIDN** (ShareChat IndoML Datathon NSFW) | Yes, per a search snippet | 1.5M labelled comments | **[unverified]**. Datathon terms likely | Flag |
| **Mohapatra et al. 2021**, Applied Sciences 11(18):8575 | English-Odia code-mixed Facebook comments, labelled hate / offensive / OK | Dataset | No public release found **[unverified]** | Flag |
| **IJISAE 2023**, Odia hate-speech ML comparison | Odia HS / non-HS from social pages | Dataset | Not found **[unverified]** | Flag |
| **HASOC** (FIRE 2019–23) | **No Odia** in any year found (Assamese, Bengali, Bodo, Gujarati, Sinhala, Marathi, Hindi …) **[unverified]** | n/a | n/a | n/a |
| **`cleanword`** npm (nabarupdev/cleanword) | **Yes**: 84 entries (42 in Odia script, 42 roman; 26 multi-word). All NFC; no precomposed nukta **[verified, tarball]** | Censor list | package.json says ISC, LICENSE says MIT (both permissive). **The list's own provenance is unknown** | Code licence is OK, but **do not ship the list as-is.** 5/5 of its lexicon-present Odia entries are dual-use (§0.2). Use it only as a seed for owner review |
| Google "bad words" lists | n/a | n/a | **[not checked]** | n/a |

## 3. The repo's own data (read-only measurement)

Script: `scratchpad/probe_colloq.py` (stdlib only). All keys were NFC-normalised before lookup.

### 3.1 Colloquial vs formal forms (counts)

| Form (spoken / casual) | webfreq | social lane | | Formal / written | webfreq | social lane |
|---|---:|---:|---|---|---:|---:|
| କଣ | 10,822 | 61 | | କଅଣ | 3,245 | 0 |
| କ’ଣ / କ'ଣ | **0 / 0** (dropped by the filter) | raw text: 45 / 8 | | | | |
| କୋଉଠି | 720 | 0 | | କେଉଁଠି | 2,370 | 7 |
| ଯାଉଚି | 346 | 0 | | ଯାଉଛି | 1,902 | 74 |
| କରୁଚି | 308 | 0 | | କରୁଛି | 3,789 | 97 |
| ଆସୁଚୁ | 6 | 0 | | ଆସୁଛୁ | 122 | 0 |
| କହୁଚି | 238 | 0 | | କହୁଛି | 1,337 | 4 |
| ଜାଣିଚି | 61 | 0 | | ଜାଣିଛି | 236 | 0 |
| ହଉ | 1,178 | 0 | | ହେଉ | 6,283 | 29 |
| ହେଇଗଲା | 392 | 0 | | ହୋଇଗଲା | 3,740 | 23 |
| ନାଇଁ | 3,265 | 0 | | ନାହିଁ | 60,772 | 336 |
| କାଇଁ | 293 | 0 | | କାହିଁକି | 6,893 | 130 |
| ମତେ / ତତେ | 4,956 / 912 | 0 / 0 | | ମୋତେ / ତୋତେ | 15,179 / 4,387 | 100 / 0 |
| ଟିକେ | 2,060 | 6 | | ଟିକିଏ | 3,507 | 6 |
| ଏଇଠି | 893 | 0 | | ଏଠାରେ | 8,986 | 75 |
| ଅଛ | 1,844 | 0 | | ଅଛୁ | 3,680 | 63 |
| ତମେ | 2,719 | 0 | | ତୁମେ | 6,468 | 2 |
| ବାପା, ଭାଇ, ଦାଦା, ଭାଇନା | 4,457 / 5,626 / 417 / 210 | 131 / 22 / 2 / 0 | | ପିତା, ଭ୍ରାତା | 4,782 / 283 | |
| ଚାଲ / ଚାଲ୍ | 1,070 / 222 | | | | | |
| ସାଙ୍ଗ, ଦୋସ୍ତ, ମସ୍ତ, ଟୋକା | 977 / 57 / 411 / 372 | | | | | |
| ଡ଼ୁଡ଼ା | **0** everywhere | | | | | |
| Sambalpuri ଜୁହାର, ମୁଇଁ, କେନ୍ତା | 157 / 253 / 23 | 0 | | | | |

Aggregate endings in webfreq: `-ଉଚି` 1,437 vs `-ଉଛି` 25,587 (5.6%); `-ଉଚୁ` 345 vs `-ଉଛୁ` 2,769
(12%); `-ିଚି` 2,227 vs `-ିଛି` 76,506 (2.9%). The social lane has 0 `-ଉଚି` against 737 `-ଉଛି`.

### 3.2 Where colloquial forms come from (lane attribution)

The probe set was ଯାଉଚି, କରୁଚି, ମତେ, ତତେ, ହଉ, ନାଇଁ, କାଇଁ, କୋଉଠି, ଅଛ, ଜୁହାର and ମୁଇଁ.
**Every one has 0 hits in both the social lane and the gov lane.** News has ≤4. Most hits
come from archive-OCR (e.g. ମତେ 3,210, ନାଇଁ 2,640) and literature (ମତେ 1,084, ନାଇଁ 581).
Wikipedia has a little (ମତେ 658). **Recommendation:** in PROVENANCE-webcorpus.md, relabel
the "social" lane as "politicians / official social". It is formal register.

Most of these forms are in `lexicon-web.tsv` and `unigrams-web.tsv`, so the engine can
suggest them. Engine check (`--web` lexicon, top-5): `kana`→କଣ, `kouthi`→କୋଉଠି,
`hau`→ହଉ, `mate`→ମତେ, `tate`→ତତେ, `naain`→ନାଇଁ, `kaain`→କାଇଁ, `juhaar`→ଜୁହାର,
`bhaina`→ଭାଇନା, `heigala`→ହେଇଗଲା, `karuchi`→କରୁଚି, `jaanichi`→ଜାଣିଚି are all top-1.
`asuchu` gives ଆସୁଚୁ only at rank 4 (behind ଆସୁଛୁ), and `kenta` gives କେନ୍ତା at rank 2.

### 3.3 Praharaj payload (`dict_payload_v2.b64`)

The payload is a **pruned** subset: **38,776 of 146,261** headwords, kept only if
reachable from the app's vocabulary. Every count below is therefore a lower bound for the
full dictionary.

| Tag / marker (entry counts) | n |
|---|---:|
| ଦେ. (ଦେଶଜ, native, in the tag zone) | 14,440 |
| ବୈଦେ. (foreign-origin) | 3,039 |
| **ଗ୍ରା. (ଗ୍ରାମ୍ୟ, rustic/colloquial)** | **1,796** |
| **ପ୍ରାଦେ. (regional)** | **1,408** |
| ଗ୍ରା. or ପ୍ରାଦେ. | 3,168 |
| Regions named in regional entries (approx.): ସମ୍ବଲପୁର 631, ଗଞ୍ଜାମ 157, ବାଲେଶ୍ବର 139, ମେଦିନୀପୁର 81, ସିଂହଭୂମ 69, ପୁରୀ 38, କଟକ 27 | |
| ଅଶ୍ଳୀଳ (obscene) anywhere in the gloss | 59 |
| ଗାଳି (abuse) anywhere | 241 |
| English "obscene" 20, "vulgar" 39, "indecent" 24, "abuse/abusive" 103, "slang" 14 | |
| **Union of offensive markers** | **348 entries** |
| **Full Praharaj** (`scratchpad/praharaj.babylon`, 148,493 blocks): ଗ୍ରା. 6,298 · ପ୍ରାଦେ. 6,866 · offensive-marker union 1,206 | |

Caveat: the 348 include entries that *define* words such as "abuse" or "vulgar talk".
They are not all offensive words. Use them as a candidate list for owner review, not as a
tag. ଗ୍ରା. and ପ୍ରାଦେ. are good sources for **"colloquial" and "dialect: Sambalpuri"
gloss labels**, but they describe the 1930s register, not modern slang.

### 3.4 Blocker: `j` → ଯ (outside this brief, but it decides colloquial coverage)

- `core/rules/symbols.toml` has `roman = "j"` → only ଜ. ଯ is reachable only through `y`.
  The cheat sheet (`docs/romanization-reference.tex`, line 199) documents `ya` → ଯ.
- `tools/build-data/build_common_lexicon.py` line 56 has `"ଯ": "y"`, so lexicon keys are
  `yauchi`, `yiba`, …
- Engine output with the web lexicon: `je` → ଜେ only; `jiba` → ଜୀବ ଜିବ ଜିବା …;
  `jadi` → ଜଡ଼ି …; `jauchi` → ଜୌଚି ଜଉଚି ଜୌଛି …. None of them reaches ଯ.
- Because ଯ is pronounced *ja*, people who type by sound will write `j`. This is a
  linguistic call for the owner. One option is a low-weight `j` → ଯ in the word-initial
  context, plus j-keyed lexicon variants for ଯ-words. Measure it with `npm run eval`.

## 4. Product design practice and a proposed design

### 4.1 What other keyboards do

- **AOSP LatinIME** (the open-source ancestor of Gboard) **[verified, LineageOS mirror
  lineage-21.0]**:
  - Setting "**Block offensive words** — Do not suggest potentially offensive words".
    `config_block_potentially_offensive = true`, so it is **on by default**.
  - Words carry a per-word `isPossiblyOffensive` flag in the dictionary data. Words are
    flagged; substrings are never matched.
  - `suggestions_output_utils.cpp`: when blocking is on, a flagged word is suppressed
    **unless it is the exact match for the last word typed** ("it's exactly what they
    typed!"). It is also kept out of multi-word splits and corrections.
  - `DictionaryFacilitatorImpl.addWordToUserHistory`: when blocking is on, a word with
    dictionary frequency 0 (an offensive word) is **not learned**.
- **Gboard** is proprietary. OEM help pages (OnePlus, Oppo, Realme) say the setting is on
  by default and affects only suggestions, not what you type **[unverified, secondary]**.
  support.google.com was blocked.
- **Apple iOS 17**: the transformer autocorrect learns the user's swear words over time
  ("the keyboard will learn it, too", Federighi, WWDC 2023) **[unverified, press: NPR,
  TechCrunch]**. Apple's precedent is "learn explicit use".
- **SwiftKey**: searches turned up **no documented profanity toggle** (null result, not
  an inference).

### 4.2 Proposed design (refines §6 of the v3 plan)

1. **Data: a tagged list, kept in TOML/TSV, never in code.** Example: `core/rules/register.tsv`
   with columns `odia_word  tier  label  note`. Run `canonical()` on load, and fail loudly
   on non-canonical input like `rules.ts` does. If ଡ଼ is stored precomposed, the guard
   silently stops matching. Tiers:
   - `offensive`: suppressed as a near-miss when family-safe is ON.
   - `coarse` (dual-use or mild insult: "mad", "fool", animal words): **ranked normally**,
     with a "can be rude" gloss badge.
   - `spoken`, `slang`, `dialect:<region>`: never suppressed. These are labels only.
2. **What "typed exactly" means for transliteration.** With family-safe ON, an `offensive`
   word may appear only when the normalised roman input **equals one of that word's own
   lexicon keys**. A key reached through fuzzy alternation (aspiration, dental/retroflex,
   vowel length, ଣ/ନ, ଳ/ଲ, ଶ/ଷ/ସ) does not count. This mirrors AOSP's exact-match
   exemption. Even then the word ranks below innocent words with the same exact key.
3. **The user can always type anything.** Strict/ITRANS mode and the rule path always
   produce the literal reading, so the filter touches **only lexicon- and learn-sourced
   candidates**. It never touches rule output for the exact input, and it never rewrites
   committed text.
4. **Tag whole words, never substrings: the Odia Scunthorpe problem.** Odia words are
   built from short CV syllables. A 2–3-akshara offensive stem is a substring of many
   innocent words, so substring matching would block large parts of the lexicon. Odia also
   adds suffixes (ରେ, କୁ, ର, ମାନେ, ଙ୍କ, ଟା, ଟି …). So tag **stems**, generate the inflected
   forms by script, and **have the owner review the generated list**. At runtime, match
   exact canonical words only. The cleanword overlap shows a second Scunthorpe effect,
   *polysemy*: the same whole word is innocent in one sense and rude in another. Tiers
   handle that case.
5. **Learning.**
   - An explicit pick is recorded **only under its exact roman key**, for that user and
     on that device.
   - With family-safe ON, it still never surfaces for fuzzy-neighbour keys.
   - AOSP is stricter: it does not learn offensive words at all while blocking is on. The
     plan deviates on purpose ("an explicit pick wins"). Recording under the exact key only
     keeps the deviation safe.
6. **Glosses.**
   - When an `offensive` or `coarse` word *is* shown, add a visible badge such as
     "offensive" or "can be rude". This protects user A in §7 (can speak Odia but cannot
     read it) from sending abuse by accident.
   - `spoken`, `dialect: Sambalpuri` and `colloquial (ଗ୍ରା.)` labels come from Praharaj
     tags and the owner's labels. Slang glosses say "slang", not a formal synonym.
7. **Family-safe default ON.** This is already decided (D-0) and matches the AOSP default.
   The toggle lives in settings. When it is OFF, ranking is identical to having no filter.

## 5. Test sets

**`core/test/golden/colloquial.tsv`**. Use the `heldout.tsv` style plus two columns:
`roman  odia  register  source`.
- The roman column is **typed by humans**, unlike `everyday.ts`, which derives roman by
  inverting symbols.toml. Include several spellings per word: `jauchi`, `jaauchi`,
  `jauchhi`, `yauchi`.
- Register values: `spoken`, `slang`, `dialect:sambalpuri`, `dialect:ganjami`,
  `dialect:baleswari`, `kinship`, `genz`.
- Seed it from the §3.1 probe list, from Praharaj ଗ୍ରା./ପ୍ରାଦେ. entries that have corpus
  frequency, and from **tester session logs**. Testers will type slang first, so log the
  roman input and the final picks with consent, and have the owner label them.
- Report top-1, top-3 and top-5 by register. Keep it separate from heldout and everyday,
  and never average them together.
- Fix §3.4 first, or `j`-rows will measure the scheme rather than coverage.

**Guard test** (`core/test/family-safe.test.ts`). Inputs:
- (a) the top-N roman keys of common words;
- (b) for each `offensive` word, its **fuzzy neighbourhood**: generate keys by applying
  the engine's own alternation dimensions to its keys, then drop the word's exact keys.

Assertions:
1. ON: no `offensive` word appears in the top-5 for any input in (a) or (b).
2. ON: the exact key still returns the word (users can type anything).
3. ON: strict mode output is unchanged.
4. OFF: the ranking is byte-identical to the unfiltered engine.
5. Every list entry is `canonical()`.
6. `coarse` words are not suppressed.

Keep the word list itself in a data file, not in the test source. Test names should refer
to entries by index.

**Labelling: only the owner, a native speaker, can do it.** This covers assigning tiers
(offensive vs coarse is cultural and regional), the generated inflection list, and
whether each colloquial row is valid. Praharaj (348 offensive-marker entries, 1,796 ଗ୍ରା.,
1,408 ପ୍ରାଦେ.), the cleanword seed and the corpus give candidates only.

## 6. Unverified or not checked

- IndicVoices licence (CC-BY-4.0 per aikosh) and its transcription normalisation policy.
- Vaani dataset licence (only the paper's CC-BY was seen).
- SCIDN licence. Whether the Mohapatra 2021 and IJISAE datasets are available. AbuseXLMR's
  language list. HASOC having no Odia.
- Gboard default-on (OEM pages only). Apple iOS 17 learning (press only).
- Whether Wiktionary Odia slang/vulgarity categories exist (site blocked). Irrelevant for
  shipping either way, since the licence is CC-BY-SA.
- Living Dictionaries Baleswari licence. Google "bad words" lists (not checked).

## Sources

- AOSP LatinIME via LineageOS mirror: `java/res/values/strings.xml`, `config-common.xml`,
  `java/res/xml/prefs_screen_correction.xml`,
  `native/jni/src/suggest/core/result/suggestions_output_utils.cpp`,
  `java/src/com/android/inputmethod/latin/DictionaryFacilitatorImpl.java` at
  https://github.com/LineageOS/android_packages_inputmethods_LatinIME (lineage-21.0)
- LDNOOBW README: https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
- MACD: https://github.com/ShareChatAI/MACD ; paper https://proceedings.neurips.cc/paper_files/paper/2022/hash/a7c4163b33286261b24c72fd3d1707c9-Abstract.html
- ADIMA: https://github.com/ShareChatAI/Adima (LICENSE read) ; https://arxiv.org/pdf/2202.07991
- SCIDN mention: https://arxiv.org/pdf/2410.21321
- Mohapatra et al. 2021: https://www.mdpi.com/2076-3417/11/18/8575
- IJISAE Odia HS: https://ijisae.org/index.php/IJISAE/article/view/4859
- cleanword: https://www.npmjs.com/package/cleanword (registry tarball 1.0.1 inspected)
- IndicVoices: https://github.com/AI4Bharat/IndicVoices ; https://aikosh.indiaai.gov.in/home/datasets/details/indicvoices.html
- Vaani: https://vaani.iisc.ac.in ; https://arxiv.org/html/2603.28714v2
- stardict-oriya: https://github.com/indic-dict/stardict-oriya
- Apple iOS 17: https://www.npr.org/2023/06/07/1180791069/apple-autocorrect-ducking ; https://techcrunch.com/2023/06/05/thanks-to-ai-ios-17-will-learn-your-swears/amp
- Gboard OEM pages: https://www.techbone.net/oneplus/smartphone/block-offensive-words
- Scunthorpe problem: https://en.wikipedia.org/wiki/Scunthorpe_problem
- Dialects: https://en.wikipedia.org/wiki/Ganjami_Odia ; https://en.wikipedia.org/wiki/Baleswari_Odia ; https://livingdictionaries.app/baleswari-odia
