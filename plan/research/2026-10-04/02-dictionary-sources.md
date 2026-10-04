# Research 02: modern Odia lexical resources (status 2026-10-04)

Scope: find MODERN Odia lexical resources to update the app's dictionary overlay, extend it to
phrases and sentences "with cultural context", and cover English, Hindi and Urdu words written
in Odia script. The project ships MIT code and may ship only MIT, CC0 or CC-BY data.
CC-BY-SA, NC, ND, GPL and AGPL are flagged as **not shippable**.

## How this was researched, and its limits

- The egress proxy for this session **blocks** huggingface.co, kaikki.org, wiktionary.org,
  wikidata.org, wikiquote.org, tatoeba.org, creativecommons.org, bharatavani.in,
  odiabibhaba.in, aikosh.indiaai.gov.in, jpl.letras.ulisboa.pt, ai4bharat.iitm.ac.in and the
  other Indian government sites. **GitHub was reachable**, so every licence marked
  **PRIMARY** below was read from the actual LICENSE or README file in the upstream repo.
- Everything else was taken from **search-engine snippets** and is marked **SNIPPET**. Treat
  those licences as unconfirmed until someone opens the dataset card or licence page.
- The session's web-search budget (200 calls, shared) ran out partway through. These checks
  were **not done**: per-dataset OdiaGenAI HF cards, whether Leipzig has an Odia corpus,
  whether NLLB-Seed includes Odia, Wikidata Odia lexeme and label counts, the kaikki Odia
  entry count, and per-language Odia counts for BPCC-H-Daily, IndicCorp v2 and Sangraha.
- The numbers given are the numbers found. No counts were estimated or made up. Where a
  count is unknown, the table says so.

---

## 0. Finding about the EXISTING "MODERN" layer (action needed)

`Odia_Sanskrit_Appv2/README.md` lists the MODERN layer's source as
"MTEnglish2Odia / OdiaNLP pairs | MIT". It is built from `cleaned_pairs.json` in
`github.com/OdiaNLP/dictionary`.

What the upstream repos actually show (PRIMARY, cloned 2026-10-04):

| Fact | Evidence |
|---|---|
| `OdiaNLP/dictionary` is MIT | `LICENSE`: "MIT License, Copyright (c) 2020 OdiaNLP". Last commit 2021-10-09 |
| `data/cleaned_pairs.json` has 215,339 en→or pairs | Counted locally |
| It was generated from `data/translated.txt`, and the repo does not say where that file came from | Commented-out code in `dictionary/curate_pairs.py`. The README only says "Prepared 2 lakhs plus English and Odia parallel word/phrases pairs" |
| The pairs look like **machine-translation output**, not curated translations | Random samples: `'sweat lodge' -> at ାଳ ଲଜ` (an MT segmentation artefact), `'head off at the pass' -> ପାସ୍ ରେ ମୁଣ୍ଡ ବନ୍ଦ କର` (word-for-word idiom), `'aircrew' -> ବିମାନ ନୁନୁଲ`, `'santim' -> ସେଣ୍ଟିମିଟର`, `'mislaying' -> ଭୁଲ୍` |
| `soumendrak/MTEnglish2Odia` is a **separate** artefact under **GPL-3.0** | `LICENSE` is GPL v3. The README asks contributors to have "permissions to upload this data in GPL license" and claims "≈42,000 reviewed pairs". The repo says it moved to OdiaNLP |

What this means:
- The app README misattributes the source. The file in use is MIT-hosted, but its origin is
  unknown and it appears to be machine output. It is **not** the 42k GPL set, so do not
  describe it as GPL.
- Its quality matches what you would expect from MT. The owner's "a bit outdated" complaint
  may partly be MT noise rather than age.
- **Recommendation:** ask the OdiaNLP maintainer (Soumendra Kumar Sahoo) where
  `translated.txt` came from. If it came from a commercial MT API, the terms of service of
  that API apply. Either way, plan to **replace** this layer with glosses mined from CC0 or
  CC-BY parallel data (§4) and from Wikidata (CC0).

Also from the same repo: `data/Odia_structured_wordlist*.json` is the Praharaj scrape that
was published on Kaggle as "Odia Structured Dictionary" (121,658 words). It duplicates
what the app already has, so it is not a new source.

---

## 1. Master table

Licence status: **PRIMARY** means the licence file or README was read on GitHub.
**SNIPPET** means it comes only from a search-result summary and is unconfirmed.

### 1a. Shippable or likely shippable

| Source | Contents | Size (Odia) | Licence (exact as found) | Confirmed from | MIT-compatible? | Download | Last update seen |
|---|---|---|---|---|---|---|---|
| **BPCC-H-Daily** (AI4Bharat, part of BPCC) | Human-translated **everyday-use** English→Indic sentences | 139K sentences across 22 languages. **Odia count unconfirmed** | CC-BY-4.0 | PRIMARY (IndicTrans2 README licence table: "Newly Added Seed Corpora (BPCC-H-Wiki & BPCC-H-Daily) — CC-BY-4.0") | **Yes** | huggingface.co/datasets/ai4bharat/BPCC (config `bpcc-seed-latest`; **gated**: you must share contact info). Newer releases are also on ai4bharat.iitm.ac.in/datasets/bpcc | README news item dated 2024-12-20 |
| **IN22-Conv** (AI4Bharat) | Conversational-domain sentences n-way across 22 languages. Domains include daily_dialogue, hobbies, government, college_life, healthcare, banking, culture | 1,503 sentences | CC-BY-4.0 | PRIMARY (IndicTrans2 README: "Newly Created IN-22 test set (IN22-Gen & IN22-Conv) — CC-BY-4.0"). Domain counts are SNIPPET | **Yes** | huggingface.co/datasets/ai4bharat/BPCC/resolve/main/additional/IN22_testset.zip; mirror at mteb/IN22-Conv | 2023 |
| **BPCC-Mined / Samanantar / BPCC-BT** | Mined en–or sentence pairs | Samanantar en-or about 1.00M pairs (SNIPPET). BPCC adds more | CC0, but only for the **packaging**: "We do not own any of the text from which this data has been extracted" | PRIMARY for BPCC (IndicTrans2 README). SNIPPET for Samanantar's own card | **Yes for derived statistics** (n-gram counts, alignment-mined glosses). Do **not** ship raw sentences | HF ai4bharat/BPCC `additional/BPCC.zip`; HF ai4bharat/samanantar | 2023 |
| **IndicCorp v2** (AI4Bharat) | Monolingual web and news text, 24 languages, 20.9B tokens in total | **Odia token count unconfirmed** | "All the datasets created as part of this work will be released under a CC-0 license" | PRIMARY (IndicBERT README) | **Yes** (same caveat: ship counts, not text) | huggingface.co/datasets/ai4bharat/IndicCorpV2 | 2023 |
| **Aksharantar** `hin` and `urd` splits | Romanized↔native word pairs for Hindi and Urdu. This is the same dataset family the app already ships for `ori` | 26M pairs across 20 languages | CC-BY / CC0, as the project already records for `ori` | Already recorded in PROVENANCE.md for `ori`. Not re-checked per language (the IndicXlit README states only the code licence, MIT) | **Yes** | HF ai4bharat/Aksharantar `hin.zip`, `urd.zip` | 2022 |
| **Wikidata** (items with Odia labels, plus Odia Lexemes) | Odia labels and aliases on items (places, festivals, deities, foods, people, organisations), each linked to an English label. Lexemes carry forms and senses | **Counts unconfirmed** (site blocked, search budget exhausted) | CC0 for all Wikidata structured data | Not fetched this session. This is Wikidata's long-standing published policy | **Yes** | query.wikidata.org (SPARQL) or the `latest-all.json` / `latest-lexemes.json` dumps | Continuous |
| **Unicode CLDR** `annotations/or.xml` and `annotationsDerived/or.xml` | Odia keywords and TTS names for emoji and symbols | 3,951 annotation lines (about 1,975 characters × keywords + tts), plus 4,536 derived lines | Unicode License v3 (permissive, MIT-style) | PRIMARY (cldr/LICENSE, "Copyright © 2001–2026 Unicode, Inc.") | **Yes** (Unicode licence, not literally MIT/CC; the project already ships CLDR `or.xml`) | raw.githubusercontent.com/unicode-org/cldr/main/common/annotations/or.xml | Current main |
| **Common Voice** Odia sentence corpus | Read-aloud Odia sentences, mostly public-domain literary prose (Fakir Mohan-era register) | 5,836 lines in the repo (`server/data/or/sentence-collector.txt`). The CV 25.0 release card says 6,287 sentences (SNIPPET). The two figures disagree | CC0 for sentence text | PRIMARY (common-voice README: "sentence text in /server/data ... released under a CC0"). Repo code is MPL-2.0 | **Yes** | github.com/common-voice/common-voice/tree/main/server/data/or | Repo HEAD 2026-10-03 (the file's own last-change date was not determined) |
| **Lingua Libre / Wikimedia Commons Odia pronunciations** | Recorded word list (the titles form a clean wordlist), including Baleswari dialect | 55,000+ unique words, 5,600+ Baleswari | CC0 1.0 | SNIPPET (paper "Building a Public Domain Voice Database for Odia") | **Yes** if CC0 is confirmed | commons.wikimedia.org (Lingua Libre categories) | — |
| **Tatoeba** eng–ori | Sentence pairs | about 105 pairs (manythings.org/bilingual/ori) | CC-BY 2.0 FR by default; some sentences CC0 | SNIPPET | **Yes**, but too small to matter | downloads.tatoeba.org per-language exports | Weekly exports |
| **Sangraha** (AI4Bharat) | Pre-training text with three parts: Verified (human-checked web, books, video transcripts), Unverified, and Synthetic (WikiMedia English translated into Indic languages and also romanized) | 251B tokens in total. **Odia share unconfirmed** | CC-BY-4.0 | SNIPPET (HF card) | Verified part: **likely yes, for derived counts only**. It is crawled web text, so ship n-gram counts, not sentences. Synthetic part: **no** (translation of CC-BY-SA Wikimedia text) | HF ai4bharat/sangraha | 2024 |
| **Odisha 21 tribal-language dictionaries** (Odisha Virtual Academy / SCSTRTI) | Trilingual tribal language–Odia–English dictionaries | 21 dictionaries | CC-BY-4.0 (relicensed 2019-10-17) | SNIPPET (Global Voices / CC blog) | **Yes**, but marginal fit (tribal vocabulary) | Odisha Virtual Academy portal | 2019 |
| **Tarai 2012**, "Phonological Nativization of Arabic, Portuguese and English Loanwords in Odia", J. Portuguese Linguistics 11(2) | Linguistic analysis with example loanwords | Small example set | CC-BY-4.0 | SNIPPET | Yes, as a reference or eval list | jpl.letras.ulisboa.pt/article/id/5609 | 2012 |

### 1b. Not shippable, or licence unclear (do not ship)

| Source | Contents | Size | Licence | Confirmed from | MIT-compatible? | URL | Notes |
|---|---|---|---|---|---|---|---|
| **English Wiktionary Odia, via kaikki.org** | Glosses, POS, etymology (including "borrowed from Persian/English" categories), translations | **Unconfirmed**. The app's own README estimates about 2,000 words | CC-BY-SA 3.0 + GFDL (dual) | SNIPPET (wiktextract README) | **No** (share-alike) | kaikki.org/dictionary/Odia/ | Use offline only as an **eval or reference** list. Do not ship |
| **IndoWordNet, Odia**, via `cfiltnlp/IWN-En` | Odia synsets linked to English and Hindi | `data/english-hindi-oriya-linked.tsv`, 18,039,070 bytes | **CC-BY-NC-SA-4.0** | PRIMARY (LICENSE file and README badge) | **No** (NC + SA) | github.com/cfiltnlp/IWN-En | Last commit 2022-09-25 |
| **pyiwn** data bundle | Same IndoWordNet data, downloaded from Dropbox | — | Repo `LICENSE.txt` is **CC-BY-SA 4.0**, but the **PyPI metadata says "MIT"**. The two conflict | PRIMARY (both read) | **No** (go by the repo licence plus the upstream NC terms) | github.com/cfiltnlp/pyiwn | The Odia synset count found in search ("27,216 entries / 2,418 synsets") looks garbled. Unconfirmed |
| **AI4Bharat Indic-Glossaries** | English–Odia glossary pairs from IndoWordNet, Bharatavani, CSTT, OSF and others | **130,801 en-or** | README declares the datasets "CC BY 4.0" | PRIMARY (README). Upstream terms SNIPPET | **Unclear, so treat as No**. Its upstream sources are IndoWordNet (CC-BY-NC-SA), Bharatavani (no adaptation, per its copyright policy) and CSTT (government copyright, no open licence found). The CC-BY relabel cannot override those terms | github.com/AI4Bharat/Indic-Glossaries | **Every S3 download link returns 403 AccessDenied from AWS (tested 2026-10-04).** The data now lives only on Bhashini ULCA or glossary.ai4bharat.org |
| **CSTT glossaries** (e.g. "Fundamental Administrative Terminology English–Odia"; Medical and History English–Odia) | Government technical and administrative terms | PDFs | No open licence found (Government of India copyright) | SNIPPET | **No / unclear** | cstt.education.gov.in, shabd.education.gov.in, bharatavani.in PDFs | Useful for an owner to **consult by hand**. Do not bulk-ingest |
| **Bharatavani (CIIL)** | More than 130 dictionaries and glossaries | — | "free for public usage", but "**no person is permitted to adapt, translate, alter, summarize, or make any derivation**" | SNIPPET (bharatavani.in/ho/cop_pol) | **No** (effectively no-derivatives) | bharatavani.in | |
| **Odia Virtual Academy online dictionary** | 84,500 words (54,500 Odia + 30,000 English roots), plus an administrative glossary and a science glossary. Compiled from Praharaj and the Government of Odisha Administrative Glossary | 84.5K | No open licence found (the 21 tribal dictionaries are the only OVA items known to be CC-BY) | SNIPPET | **Unclear, so No** | odiavirtualacademy.org / ova.gov.in | Possibly worth a direct licence request to OVA |
| **odiabibhaba.in** | Web dictionary built largely on Praharaj | — | Unknown | Site blocked | **Unclear** | odiabibhaba.in/?p=2134 | The app already uses Praharaj directly, so this adds nothing |
| **odia.org** `odiaorg/purnachandraBhasakosha` | Praharaj digitisation (2014) | — | No licence file found | PRIMARY (README 404) | **Unclear** | github.com/odiaorg/purnachandraBhasakosha | Redundant |
| **Kaggle "Odia Structured Dictionary"** (OdiaNLP; listed on AIKosh/Bhashini DOST) | Praharaj scrape with meaning, pronunciation, gender, synonyms, Bengali equivalent, verse | 121,658 words | Not shown (AIKosh page: "ownership ... remain with the original author") | SNIPPET | **Unclear** | kaggle.com/datasets/soumendrak/odia-structured-dictionary | Redundant with Praharaj |
| **OdiaGenAI datasets** (odia_master_data_llama2 180k, odia_context_10K, roleplay_odia 1k, OdiEnCorp_translation_instructions_25k, all_combined_odia_171k) | Instruction sets, mostly machine-translated, plus Odisha domain Q&A (recipes, temples, poets) | 1k–180k each | **CC-BY-NC-SA-4.0** | PRIMARY (OdiaGenAI GitHub README licence section). odia_domain_context_train_v1 confirmed by SNIPPET | **No** (NC + SA) | huggingface.co/OdiaGenAI | Good *cultural topic* inspiration only. No idiom or proverb dataset was found |
| **OdiEnCorp 2.0** | en–or parallel corpus | 98,302 sentences | "non-commercial and research purposes" (CC-BY-NC-SA 4.0) | SNIPPET | **No** | lindat.mff.cuni.cz handle 11234/1-3211 | |
| **IndicCorp v1** (indicnlp_corpus) | Odia monolingual: 0.69M lines / 6.94M tokens / 107M chars | — | **CC-BY-NC-SA-4.0** | PRIMARY (README) | **No** | github.com/AI4Bharat/indicnlp_corpus | Use IndicCorp **v2** (CC0) instead |
| **FLORES-200** `ory_Orya` | dev + devtest splits (about 1K sentences each; exact counts **unconfirmed**, from memory) | ~2K | **CC-BY-SA-4.0** | SNIPPET | **No for shipping**. Fine as an **unshipped eval set** | HF facebook/flores; openlanguagedata/flores_plus | |
| **NLLB-Seed / OLDI seed** | About 6K professionally translated Wikipedia sentences, 39 languages. **Odia inclusion unconfirmed** | — | **CC-BY-SA-4.0** on OLDI. BPCC repackages "NLLB-Seed" as CC0, which **conflicts** with OLDI | SNIPPET (OLDI), PRIMARY (BPCC's CC0 claim) | **No** (resolve to the stricter licence) | HF openlanguagedata/oldi_seed | |
| **BPCC-H-Wiki** and **IN22-Gen (Wiki part)** | Odia translations of **English Wikipedia** sentences | 644K across 22 languages | Labelled CC-BY-4.0 | PRIMARY (label) | **Treat as No**. A translation of CC-BY-SA source text is a derivative, so the labelled CC-BY cannot clear it | — | |
| **Sangraha Synthetic** | WikiMedia English translated into Indic languages and romanized | — | Labelled CC-BY-4.0 | SNIPPET | **Treat as No** (same Wikipedia-derivative problem) | — | |
| **Hunspell `or_IN`** (LibreOffice / Fedora `hunspell-or`) | Spelling wordlist converted from aspell-or | **1,029 words** | GPLv2+ (Fedora package). Hyphenation file is LGPL-3+ (Santhosh Thottingal, PRIMARY) | Mixed | **No**, and too small to matter anyway | github.com/LibreOffice/dictionaries/tree/master/or_IN | description.xml version 2025.05.10 |
| **Wikiquote / Wikisource Odia** (proverbs, ଢଗଢମାଳି) | Proverb compilations | Unknown (site blocked) | CC-BY-SA 4.0 (Wikimedia text) | Not fetched | **No** for the compilations. The **underlying public-domain books** (pre-1960s authors) are usable if transcribed from the PD source | or.wikiquote.org, or.wikisource.org | No public-domain Odia proverb book was located on archive.org this session |
| **Google** language-resources / Dakshina | — | **No Odia** in google/language-resources (PRIMARY: directory listing). Dakshina has no Odia (from memory, unverified) | Apache-2.0 / CC-BY-SA | — | n/a | | |
| **Aya dataset** (Cohere) | Human-written prompt/completion pairs, 101 languages | Odia share unconfirmed | Apache-2.0 | SNIPPET | Permissive, but **outside the project's MIT/CC0/CC-BY list**, so the owner would need to approve it | HF CohereForAI/aya_dataset | |
| **Leipzig Corpora Collection** | Sentence samples and frequency word lists | Odia corpus **existence unconfirmed** | "CC BY" for downloads | SNIPPET | Likely yes, if an Odia corpus exists | wortschatz.uni-leipzig.de/en/download | Worth checking manually |
| **Hindi–Odia bilingual dictionary (open)** | — | **None found** | — | — | — | — | Oxford Languages sells Odia datasets commercially |
| **Perso-Arabic / Urdu loanword list for Odia (open)** | — | **No standalone list found**, but see the Praharaj etymology tags (§3): public domain, already in hand | — | — | — | — | Academic papers only (Tarai 2012, above) |
| **News style guides** (Sambad, Dharitri, OTV) for English words in Odia | — | **None found published** | — | — | — | — | Learn the conventions from corpus data instead (§3) |

---

## 2. Ranked recommendation: top 5 to add

Ranking = how certain the licence is × how well the source fits the owner's three asks
(modernise the dictionary; phrases and sentences with cultural context; English, Hindi and
Urdu words in Odia script).

1. **Wikidata Odia labels and Lexemes (CC0).** This is the best licence-clean modernising
   source. It gives English↔Odia pairs for modern named entities and culture: districts and
   towns, festivals (ରଥଯାତ୍ରା, ରଜ, ନୂଆଖାଇ), deities, foods (ପଖାଳ, ଛେନାପୋଡ଼), institutions,
   films, politicians. It is maintained continuously, and it can replace the noisy MT glosses
   for nouns.
   *Counts not confirmed. Run a SPARQL count before committing.*
2. **BPCC-H-Daily + IN22-Conv (CC-BY-4.0, PRIMARY).** These are the only licence-clean,
   human-written **everyday and conversational** Odia sentences. Use them for:
   - mining the phrase table (frequent 2–5-word Odia spans plus their English sides);
   - a sentence-level test set;
   - checking an owner-written greetings list.
   Exclude BPCC-H-Wiki. Note that HF access is gated.
3. **IndicCorp v2 (CC0) + Samanantar/BPCC-Mined Odia side (CC0 packaging).**
   - Build **pruned word-bigram counts** for context ranking and next-word prediction.
   - Run word alignment (e.g. fast_align or eflomal, done offline) on en–or pairs to produce
     **corpus-attested modern glosses** that replace `cleaned_pairs.json`.
   Ship only derived counts and glosses, never the sentences.
4. **Aksharantar `hin` + `urd` (same licence family as the shipped `ori`).** Use these to
   build the post-1940 Hindi/Urdu-in-Odia-script layer (§3b). Pair it with the
   Praharaj etymology tags already in hand for older loans (§3a): about 4.7K Hindi, 2.3K
   Persian, 1.6K Arabic and 2.0K English-origin headwords, all public domain.
5. **Unicode CLDR Odia annotations + Common Voice Odia sentences (CC0) + Lingua Libre
   wordlist (CC0, licence by SNIPPET).** These are small but high-trust:
   - CLDR gives emoji suggestion from Odia or romanized keywords, which suits WhatsApp-style
     typing;
   - Common Voice gives 5.8K CC0 sentences (literary register);
   - Lingua Libre gives a 55K CC0 attested-word list that includes Baleswari dialect.

Runner-up: **Sangraha Verified** (CC-BY-4.0 by SNIPPET), for more modern news and web
bigrams once the licence and the Odia share are confirmed.

Explicitly **not** recommended, despite being tempting:
- Indic-Glossaries: 130K en-or pairs, but the upstream licences are not cleared and the
  download links are dead.
- IndoWordNet: NC-SA.
- Wiktionary/kaikki: CC-BY-SA.
- OdiaGenAI: NC-SA.
- FLORES: CC-BY-SA. Use it for eval only.

---

## 3. English, Hindi and Urdu words in Odia script

**English.** The existing LOAN detector (CMUdict + wordfreq phonetic match) is the right
approach. No published newsroom style guide exists. Ways to improve it:
- Weight loans by **news-domain frequency** from IndicCorp v2 (CC0), since IndicCorp is
  news-heavy.
- Add English-word ↔ Odia-spelling pairs mined by alignment from Samanantar and BPCC (§2.3).
  These capture the spellings newsrooms actually use: ସରକାର vs ଗଭର୍ଣ୍ଣମେଣ୍ଟ, ହସ୍ପିଟାଲ vs
  ହସପିଟାଲ.

**Hindi and Urdu: two layers.**

*(a) Loans established before 1940: Praharaj's own etymology tags (public domain, already
in hand).*

Each Praharaj entry gives its origin in parentheses. Example:
`ଖବର — Khabara খবর खबर ବୈଦେ. ବି. (ଆ. ଖବର୍) — ... News; information`.

I counted the first parenthesised tag in `or-head/praharaj/praharaj.babylon` (148,491
entries parsed this session). This is a rough count: it takes only the first tag in each
entry, and the tag vocabulary still needs a proper parse.

| Tag | Origin | Entries |
|---|---|---|
| ହି. | Hindi | 4,749 |
| ଫା. | Fārsi / Persian | 2,341 |
| ଇଂ. | English | 2,037 |
| ଆ. | Arabic | 1,628 |
| ମ. | possibly Marathi or Magadhi (unconfirmed) | 1,012 |
| ସଂ. | Sanskrit | 20,380 |

Separately, 11,345 entries carry the marker ବୈଦେ. (*baideshika*, "foreign").

That makes about 10.7K Hindi/Persian/Arabic/English-origin headwords with English glosses,
ready to tag `HINDI` / `PERSIAN` / `ARABIC` / `ENGLISH-OLD` in the overlay at no licence
cost. The app already parses this file, so this is the cheapest single win for the
Hindi/Urdu ask.

*(b) Loans that entered after 1940: build from Aksharantar plus corpus frequency.*
1. Take Aksharantar `hin` (Devanagari) and `urd` (Perso-Arabic script with romanization)
   word lists.
2. Map Devanagari to Odia **deterministically**. The Unicode blocks are parallel: U+0900
   maps to U+0B00 with exceptions to handle (ଵ/ୱ, ଯ/ୟ, ଳ, nukta letters). For Urdu, go
   through the romanization.
3. Intersect the result with Odia corpus frequency (IndicCorp v2, the project's web sweep).
   Keep high-frequency matches that are **absent from Praharaj**. Those are the candidates
   for post-1940 Hindi/Urdu loans in news and social-media Odia, typically Bollywood and
   political vocabulary. No examples are listed here because none were derived from data
   this session.
4. Tag them `HINDI` or `URDU` in the overlay, with the Aksharantar English gloss where one
   exists.

**Invariant warning.** Hindustani loans carry nukta consonants (ज़ फ़ क़ ख़ ग़). Odia
news writes these either bare (ଜ) or as ଜ+U+0B3C. `core/data/PROVENANCE.md` currently
calls a nukta on ଜ "malformed — passed through unchanged". **Decide a ଜ଼ / ଫ଼ policy
before this layer lands.** The options are: fold to the bare letter for lookup, or
accept nukta on these bases. Without a decision the lexicon keys and `canonical()` will
fight. This must be settled in code and documented next to the ଡ଼/ଢ଼ invariant.

Wiktionary etymology categories ("Odia terms borrowed from Persian/Hindustani/English")
and Tarai 2012 are useful for **evaluating** this layer offline (CC-BY-SA / CC-BY).
Do not ship them.

---

## 4. What a "phrase and sentence" layer realistically needs

| Component | What it is | Legal source |
|---|---|---|
| **Phrase table** (romanized phrase → Odia phrase) | A few hundred to a few thousand entries: greetings (ନମସ୍କାର, କେମିତି ଅଛ, ଭଲ ଅଛି), WhatsApp staples (ଜନ୍ମଦିନର ଶୁଭେଚ୍ଛା, ଶୁଭ ସକାଳ, ଚିନ୍ତା କରନି, ଠିକ୍ ଅଛି), festival wishes (ରଥଯାତ୍ରାର ଶୁଭେଚ୍ଛା, ଶୁଭ ନୂଆଖାଇ, ରଜ ପର୍ବର ଶୁଭେଚ୍ଛା), kinship and honorific forms (ଆପଣ / ତୁମେ / ତୁ, ବୋଉ, ବାପା, ଭାଇ, ଅପା, ନାନୀ) | **Owner-authored** (MIT by construction) and reviewed by a native speaker. Candidate spans checked against BPCC-H-Daily and IN22-Conv frequency (CC-BY-4.0). Festival and culture names from Wikidata (CC0) |
| **Word bigram (optionally trigram) counts** | Re-rank candidates in context and predict the next word. Prune to fit the size budget (e.g. count ≥ 3, top-K successors per word) | IndicCorp v2 (CC0), Samanantar/BPCC Odia side (CC0 packaging), Common Voice (CC0, literary register), Sangraha Verified (CC-BY, SNIPPET). **Not** the project's own `tools/build-data/webcorpus/`, which is raw scraped third-party text and not licence-cleared. Even n-grams derived from it should be flagged before shipping |
| **Sentence-level evaluation** | Romanized Odia sentences → expected Odia | **No open romanized-Odia sentence corpus exists.** `core/test/golden/everyday.tsv` is the only one. Expand it by having the owner romanize IN22-Conv or BPCC-H-Daily Odia sentences the way people actually type, and record that provenance (CC-BY) |
| **Cultural-context glosses** | "Why/when is this said". For example, ଜୟ ଜଗନ୍ନାଥ as a greeting, ମହାପ୍ରସାଦ, ଓଷା/ବ୍ରତ, ପୁଅ ଜିଉନ୍ତିଆ | Owner-written notes, Wikidata descriptions (CC0), and Praharaj (PD) for traditional terms. OdiaGenAI's Odisha-domain Q&A is useful **only as topic inspiration** (NC-SA) |
| **Emoji suggestions** | Odia keyword → emoji | CLDR annotations (Unicode licence) |
| **Real WhatsApp text** | — | **No legal open source.** Private chat exports are personal data. IN22-Conv and BPCC-H-Daily are the closest legal proxies, alongside learning from the user's own typing on-device (already in scope through `learn()`) |

Realistic expectations:
- A curated phrase table plus pruned bigrams is the right size for an offline IME.
- Whole-sentence translation is out of scope for a rule + lexicon engine. It would need an
  MT model, and offline MT conflicts with the size budget and `plan/04-scope.md`.
- "Sentence handling" should mean **context-aware transliteration** of whole typed
  sentences (bigram re-ranking), not translation.

---

## 5. Primary sources read this session (GitHub, 2026-10-04)

- AI4Bharat/IndicTrans2 README: BPCC licence table, BPCC-H-Daily and IN22 descriptions
- AI4Bharat/IndicBERT README: IndicCorp v2 CC-0
- AI4Bharat/indicnlp_corpus README: IndicCorp v1 CC-BY-NC-SA-4.0, Odia 107M chars
- AI4Bharat/IndicXlit README: Aksharantar language list; code MIT
- AI4Bharat/Indic-Glossaries README: en-or 130,801, declared CC BY 4.0; S3 links 403
- OdiaNLP/dictionary: LICENSE (MIT), `curate_pairs.py`, `cleaned_pairs.json` (215,339)
- soumendrak/MTEnglish2Odia: LICENSE (GPL-3.0), README
- cfiltnlp/IWN-En: LICENSE (CC-BY-NC-SA-4.0), Odia file size
- cfiltnlp/pyiwn: LICENSE.txt (CC-BY-SA-4.0); PyPI JSON metadata (license "MIT")
- OdiaGenAI/GenerativeAI_and_LLM_Odia README (CC-BY-NC-SA-4.0); OdiaGenAI/Indic_LLM_Resource_Catalog
- common-voice/common-voice README (CC0 sentences) and `server/data/or/sentence-collector.txt`
- LibreOffice/dictionaries `or_IN/*` (1,029-word .dic, LGPL-3+ hyphenation)
- unicode-org/cldr `common/annotations/or.xml`, `annotationsDerived/or.xml`, LICENSE
- google/language-resources directory listing (no Odia)
- indic-dict/stardict-oriya file list (Praharaj babylon only; last commit 2023-05-18)
