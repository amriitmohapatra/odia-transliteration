# Research 01: Laya, Jev, and whether a classifier or small model helps this app

Date: 2026-10-04. Research only. No repository files were edited.

**Sourcing.** WebFetch was blocked by the egress proxy for every domain tried
(huggingface.co, llmreference.com, innfactory.ai, browserbase.com, gradually.ai,
sebastianraschka.com). Claims below come from one of three places:
- **[repo]**: read directly from the Laya GitHub repository, shallow-cloned at commit
  `2e4d9c8` (2026-10-03, package version 0.3.26). This is primary evidence.
- **[search]**: a WebSearch result summary. This is secondary evidence, and I could not
  open the page behind it.
- **[project]**: read from this repository (`plan/`, `AGENTS.md`, `tools/eval/baseline.json`,
  app READMEs).

---

## 1. Identification

### Laya: identified, high confidence

Laya is an open-weight, **non-generative "System 1 decision model"** from ConvAI Innovations
(author Nandakishor M). It was released around 18 Sep 2026 under **Apache-2.0**.

- Repo: https://github.com/NandhaKishorM/laya [repo]
- Weights: https://huggingface.co/convaiinnovations/laya [repo links it; page itself blocked]
- Licence: Apache-2.0 (LICENSE file) [repo]
- How it works: you give it a "state" (text or JSON) and typed questions. There are three
  question types: `choice` (pick one of N labels), `score` (an ordinal scale) and `noul`
  (yes/no probability). One forward pass returns a probability for each answer. **It cannot
  generate text.** [repo README]
- Checkpoints [repo README, lines 180-182]:

| checkpoint | backbone | params | context | languages |
|---|---|---|---|---|
| `laya` | ModernBERT-large | 421M | 512 | English |
| `laya-multilingual` | mmBERT-base | 322M | 1024 (up to 8192) | "100+ languages" |
| `laya-typed-decisions` | ModernBERT-large | 421M | 1024 | fine-tuned on its own benchmark |

- Download size of the multilingual checkpoint: about 647 MB according to [search]. I did
  not find this number in the repo. It matches 322M params at 2 bytes each (bf16). In fp32 it
  would be about 1.3 GB.
- Browser and TypeScript: the `laya-ts` package runs in Node and in the browser. It uses an
  ONNX export split into `encoder.onnx` and `head.onnx`, run by `onnxruntime-web`, with
  WebGPU tried first and WASM as the fallback. It is ESM-only, and **its API is
  Promise-based** (`await Agent.load`, `await agent.predict`). [repo laya-ts/README.md]
- Fine-tuning: there is a Kaggle notebook for 2xT4 (about 4-5 h for 4 epochs over about 30k
  questions) and a script for Apple Silicon MPS/CPU. Training uses "RLCD", a GRPO-style
  policy gradient with proper-scoring-rule rewards, followed by temperature calibration.
  [repo README, "Fine-Tuning"]

**What the evidence says about Laya and Odia** [repo]:
- `laya/lang.py:30` and `laya-ts/src/lang.ts:13` map the Oriya Unicode block
  (U+0B00-U+0B7F) to script `oriya`, and the router then sends that text to
  `laya-multilingual`. There is one routing test string (`ତୁମେ କେମିତି ଅଛ, ମୁଁ ଭଲ ଅଛି`) in
  `laya-dotnet/tools/routing_cases.py`.
- **Odia is not among the 51 benchmarked languages.** The sweep uses MASSIVE, and its
  language list contains no `or`. The nearest Indic results: `hi` 0.46, `bn` 0.45, `kn` 0.30,
  `ta`/`te`/`ml`/`ur` also present (20-way intent task, random = 0.05) [repo BENCHMARKS.md].
- mmBERT, the backbone, was pretrained on "1800+ languages" [search: arXiv 2509.06888,
  https://huggingface.co/blog/mmbert]. Whether that includes Odia, and how well, is
  **unverified**. Odia is probably present, given the count.
- **In short: nobody has measured Laya on Odia.** The only Odia support is the script
  router.

**Limits Laya states itself** [repo BENCHMARKS.md, "Limits, stated plainly"]:
- **Base checkpoints are near chance zero-shot.** On typed-decisions they score 0.362
  (English) and 0.352 (multilingual), against 0.318 random and 0.461 majority-class. The
  headline 0.766 (above Jev's 0.727) comes from the **fine-tuned** checkpoint, trained on that
  benchmark's own training split. The README says: "Treat Laya as a fast base to specialise,
  not as a zero-shot decision engine."
- Keep `choice` under about 20 options. All option labels share a 192-token head budget.
  Note, though, that `docs/finetune_browser_agent.md` reports 0.63-0.66 top-1 over about 45
  candidates after fine-tuning.
- Both checkpoints ship over-confident, so you must refit temperatures on your own data.
- The English checkpoint collapses outside Latin script: Khmer scored 0.000 accuracy at 0.952
  confidence.
- CPU latency: on a laptop CPU (Ryzen 9 6900HX, laya 0.3.5, through HTTP), p50 is **329 ms**
  for one question at 8 threads [repo BENCHMARKS.md]. The section does not say clearly which
  checkpoint was used, so the per-checkpoint CPU figure is **unverified**. On a T4 GPU, p50 is
  about 33 ms.
- The project is two weeks old and already at 0.3.26 with many minor releases, so expect the
  API to change.

### Jev: identified, medium-high confidence (secondary sources only)

Jev is TypeSafe AI's hosted, proprietary "System One model". It is a decision/classifier
model with the same interface shape as Laya (state plus typed questions, returning
calibrated probabilities). All of the following is [search]:
- Launched 15 Sep 2026 in early access, with a $40M seed led by DCVC. Generally available
  from 21 Sep 2026.
- **Hosted only. No weights and no paper.** Price is $0.042 per 1M input tokens; output is
  free.
- Published accuracy: 0.727 on typed-decisions, 0.910 on AG News, 0.480 on DAIR Emotion
  (these are quoted in Laya's BENCHMARKS.md [repo]).
- **Language support: unverified.** No source I could reach states which languages Jev
  supports. Nothing confirms Odia.
- Sources: https://openrouter.ai/blog/insights/what-is-jev/ ,
  https://www.datacamp.com/blog/system-one-models-jev ,
  https://www.mindstudio.ai/blog/jev-system-one-model-launch ,
  https://www.ayautomate.com/blog/jev-typesafe-system-one-model ,
  https://dev.to/valyuai/how-to-use-jev-a-practical-guide-to-typesafes-system-one-model-g5e

Laya positions itself explicitly as the open, free alternative to Jev. It even ships a
"Jev-compatible" HTTP server (README section "Self-Hosting: HTTP Server (Jev-compatible)")
[repo]. Comparison write-ups: https://runware.ai/blog/jev-laya-and-the-emerging-role-of-decision-models ,
https://flowtivity.ai/blog/laya-open-source-jev-alternative/ ,
https://www.eesel.ai/blog/laya-ai-review

---

## 2. Correcting the premise

> "If Jev can be a powerful classifier, Laya should also be able to - also its free."

That is not quite right, and Laya's own README says so. Jev is (reportedly) useful
**zero-shot**: you describe the labels and it answers. Laya out of the box scores near
chance on the same kind of task. What Laya actually offers is that it is **cheap to
fine-tune**. With a few thousand to about 30k labelled decisions from your own domain, it
can match or beat Jev on that domain. So the useful question is not "Laya instead of Jev".
It is: **"Is there a classification task in this app with enough labelled data to fine-tune
on, where a 322M-parameter encoder beats something simpler?"**

---

## 3. Survey of free and open models with Odia support (Oct 2026)

| Model | Licence | Size | Odia evidence | Browser-capable | Free hosted API | Notes |
|---|---|---|---|---|---|---|
| **Laya-multilingual** | Apache-2.0 | 322M (about 647 MB, unverified) | Script router only. **Not evaluated on Odia** | Yes: laya-ts + onnxruntime-web (WebGPU/WASM), async | No (self-host; HF Space demo exists) | Non-generative. Needs fine-tuning |
| **IndicXlit** (AI4Bharat) | MIT | ~11M (about 45 MB CTranslate2 per lang, [search]) | Yes: trained on Aksharantar `ori`. 58.9% top-1 per CLAUDE.md | No official ONNX/JS port found [search] | Via Bhashini (registration) | **Excluded from runtime by `plan/04-scope.md`. Allowed as a build-time augmentation run** |
| **IndicTrans2-dist** | MIT | ~211M | Yes: 22 languages including Odia | Community ONNX bundles exist (e.g. hari31416/indictrans2-indic-indic-1B-ONNX) | Bhashini | Translation, not transliteration |
| **IndicBERT v2** | MIT | 278M | Yes: IndicCorp v2, 24 languages | Plausible via transformers.js ONNX (**not verified**) | No | Encoder. Classifier backbone |
| **MuRIL** (Google) | **Unverified** (believed Apache-2.0) | ~237M (**unverified**) | Yes: 17 Indic languages incl. Odia, plus transliterated text | Plausible via ONNX (**not verified**) | No | Pretraining included romanized text. Relevant to the transliteration domain |
| **Gemma 3** (270M-27B) | Gemma Terms (custom, permissive-ish) | 270M-27B | "140+ languages pretrained" ([search], Google blog). **Odia not confirmed** | Yes: onnx-community/gemma-3-270m-it-ONNX, transformers.js WebGPU | Google AI Studio free tier (network) | Generative |
| **Sarvam-Translate** | **GPL-3.0** [search] | 4B (Gemma3-4B-IT fine-tune) | Yes: 22 languages incl. Odia | Impractical | Sarvam API | GPL: build-time only, never ship |
| **Sarvam-1** | Sarvam non-commercial [search] | 2B | Yes: 10 Indic languages incl. Odia | Impractical | — | Non-commercial |
| **Sarvam-M** | Apache-2.0 (Mistral-Small base; **not verified**) | 24B | Yes: `or` in post-training languages | No | Sarvam API (free credits) | |
| **Sarvam 30B / 105B** | Apache-2.0 [search] | 30B / 105B MoE (10.3B active) | "22 Indian languages" | No | Sarvam API | Released Feb-Mar 2026 |
| **Krutrim-2** | Krutrim Community Licence | 12B | "22 Indic languages" | No | Krutrim cloud | Custom licence |
| **OdiaGenAI Llama 2 7B / odia-gemma-2b / llama-3.1-8b-r-1** | Research / non-commercial [search] | 2B-8B | Odia-specific instruction tuning | No (2B maybe, with quantization) | — | Non-commercial |
| **Bhashini (ULCA)** | Govt API, free with registration [search] | — | Odia transliteration and translation | n/a | **Yes (registration)** | Network service |
| **Sarvam API** | Commercial, free signup credits (₹100-1000, conflicting [search]) | — | Odia transliteration (₹20 per 10k chars) | n/a | Free credits only | Network service |
| **Bodhan AI / AI4Bharat suite** (Sep 2026) | "Open weights" (licence **unverified**) | **unverified** | Translate covers 22 languages | **unverified** | "Hosted APIs" | Very new |

Sources for the table:
- https://indicnlp.ai4bharat.org/indic-xlit/ , https://arxiv.org/pdf/2205.03018
- https://ai4bharat.iitm.ac.in/blog/indictrans2 , https://arxiv.org/pdf/2305.16307
- https://huggingface.co/ai4bharat/IndicBERTv2-MLM-only
- https://blog.google/technology/developers/gemma-3/ , https://huggingface.co/onnx-community/gemma-3-270m-it-ONNX
- https://www.sarvam.ai/blogs/sarvam-translate , https://en.wikipedia.org/wiki/Sarvam_AI ,
  https://www.opensourceforu.com/2026/03/sarvam-releases-30b-and-105b-llms-under-apache-2-0/ ,
  https://build.nvidia.com/sarvamai/sarvam-m/modelcard , https://docs.sarvam.ai/api-reference-docs/getting-started/pricing
- https://tech.olakrutrim.com/krutrim-2-a-best-in-class-large-language-model-for-indic-languages/
- https://huggingface.co/OdiaGenAI , https://analyticsindiamag.com/meet-the-creator-of-odia-llama/
- https://pypi.org/project/bhashini-translator
- https://news.careers360.com/iit-madras-suite-of-open-ai-models-for-indic-languages-bodhan-ai

**LLMs on transliteration.** "Beyond Specialization" (arXiv 2505.19851) finds GPT-4o / 4.1 / 4.5
beat IndicXlit on most of 10 Indic languages, for example Bengali on Dakshina: GPT-4o 62.5%
vs IndicXlit 55.3% top-1. **I found no Odia-specific numbers** in what was retrievable.

**Licensing for this MIT project.** Anything that ships must be MIT, Apache, CC0 or CC-BY
(CLAUDE.md). That rules out shipping Sarvam-Translate (GPL-3), Sarvam-1 and OdiaGenAI
(non-commercial), and probably Krutrim. Using them at build time to *produce data* is a
separate licensing question. Model output licensing is unsettled, so check before
committing any generated rows.

---

## 4. Constraints from this project that decide the answer

1. **Runtime weight budget.** `plan/04-scope.md` rejects **IndicXlit at runtime** (11M
   params) as "disqualifying for a lightweight tool", and allows it only as "an offline
   data-augmentation run inside the build pipeline". Laya-multilingual is about 30x more
   parameters (322M, roughly 650 MB) and takes hundreds of ms per call on CPU. **By the
   project's own rule, Laya cannot run in the typing path.** At most it is a build-time or
   offline-eval tool.
2. **The engine API is synchronous** (CLAUDE.md). laya-ts is Promise-based, so it cannot sit
   inside `core` without breaking that contract.
3. **`ime-macos` runs `core/dist/engine.js` in bare JavaScriptCore**, which has no DOM, no
   fetch, no Worker and no WebGPU. Whether `onnxruntime-web`'s WASM backend loads in a bare
   JSContext is **unverified**, and probably not without work.
4. **No network call from shipped code.** That rules out Jev, Bhashini and the Sarvam API at
   runtime. They are build-time or dev tools only.
5. **Where the metric is actually losing** (`tools/eval/baseline.json`, 2026-07-27, held-out
   Aksharantar):
   - in-lexicon: top-1 63.3%, top-5 82.0%
   - **OOV: top-1 6.9%, top-5 14.8%** (3,076 of 4,201 keys)

   A classifier or re-ranker only **re-orders candidates the engine already produced**. If
   the right word is not in the candidate list (OOV top-5 is 14.8%), no re-ranker can fix
   it. The biggest lever is getting more correct words into the lexicon, not ranking better.
6. **Some distinctions are lexical, not phonetic** (AGENTS.md: ନ vs ମ in ଜନ୍ମ/ସମ୍ବାଦ; nukta on
   native words vs English loans). The project already solves these with lexicon and
   frequency data.
7. **Bigram / context ranking is deferred** "until unigram ranking is measured and found
   wanting" (`plan/04-scope.md`).

---

## 5. What a "classifier" would do here, task by task

### (a) Tag an Odia-script word as native / tatsama / English loan / Hindi-Urdu loan
- **Use:** pick defaults for OOV words. Examples: nukta (native words take it, English loans
  usually do not), ଯ vs ୟ, and whether to prefer Sanskrit-style conjuncts. It could also
  choose a profile (Everyday vs Śloka) automatically.
- **Labels:** the Praharaj dictionary layer already shows etymology for each headword
  (`Odia_Sanskrit_Appv2/README.md`), so this is a free, labelled training set, likely tens of
  thousands of words. The modern layer tags "English: ..." loans.
- **Cheapest reliable choice:** a **character n-gram classifier** (naive Bayes or logistic
  regression over 1-4-grams of the Odia string, or of the roman input). It would be a few
  hundred KB of weights as JSON, synchronous, pure TS, and run in microseconds. Etymology
  from orthography is a strongly surface-cued task: retroflex and conjunct patterns,
  ଷ/ଶ/ଋ, visarga mark tatsama, and English loans have distinctive endings and clusters. Char
  n-grams usually get most of the way. *That expectation is my judgement, not a measured
  result.*
- **Laya:** possible as a `choice` with 4 options after fine-tuning on Praharaj labels. But
  it is 650 MB, async, and gives an unmeasured gain over n-grams. **Not worth it.**
- **Value:** low to moderate. For in-lexicon words the lexicon already settles it. This only
  helps OOV, where the candidate generator is the real problem.

### (b) Choose among transliteration candidates using sentence context (re-ranking)
- **Use:** `kala` gives କଲା / କଳା / କାଳ / କଳ. The previous word disambiguates.
- **Cheapest reliable choice:** **bigram (or small trigram) counts** from the existing web
  corpus (18.4M tokens, `core/data/webfreq.tsv` pipeline), with Kneser-Ney or stupid-backoff.
  This is synchronous, sized in KB to tens of MB depending on pruning, offline, and standard
  for IMEs. It is exactly the deferred scope item.
- **Laya:** a fine-tune is a *legitimate offline experiment*, because training data is free
  and self-supervised. Take a corpus sentence, romanize one word, let the engine produce
  candidates, and use the real word as gold. That gives millions of examples. Formulation:
  state = the sentence with a slot, `choice` = up to 5-10 candidates (well under the
  20-option limit; Odia words may be several mmBERT tokens each). **But** it can only run at
  build or eval time (section 4), so the most it could do is show whether context ranking
  is worth building. A bigram model answers that question more cheaply.
- **Value:** moderate, and only for in-lexicon ambiguity. The everyday top-3 is already 96%
  (AGENTS.md), so there is little headroom.

### (c) Phrase or sentence-level transliteration
- This is a generation task. **Laya cannot do it by construction**, and neither can Jev.
- Options: IndicXlit (word-level, 11M), LLMs (GPT-4-class beat IndicXlit on most Indic
  languages per arXiv 2505.19851; no Odia number found), Sarvam API, Bhashini.
- **Recommended use: build-time only.** Run IndicXlit (MIT) over the romanizations of the
  frequent web-corpus words that the engine gets wrong. Then **add the corrected rows to the
  lexicon**, with checksums and provenance in `core/data/PROVENANCE.md` and `canonical()`
  applied. `plan/04-scope.md` already permits exactly this, and it attacks the OOV 6.9%
  directly. An LLM (for example Gemma 3 locally, or Sarvam-M) could serve the same role,
  but check the licence of generated data before committing it.

### (d) Pick the word sense for the dictionary gloss
- **Use:** `kala` → which of Praharaj's senses to show on the chip.
- **Cheapest reliable choice:** **show the modern layer first and the Praharaj first sense
  second** (the app already does roughly this). For headwords with many senses, run a
  one-off **build-time LLM pass** to pick a "default modern sense" per headword, stored as a
  column.
- **Laya:** context-aware sense choice at type time is in principle a `choice` question
  (state = sentence, options = senses). But base Laya is near chance zero-shot, there is no
  labelled Odia sense data to fine-tune on, and it cannot run in the shipped app. **Not
  viable.**

### Cost and size summary

| approach | size | latency | sync | ships under scope? | training data needed |
|---|---|---|---|---|---|
| frequency / unigram (today) | MBs | µs | yes | yes | none (have it) |
| bigram LM from web corpus | KB-tens of MB | µs | yes | yes | none (have it) |
| char n-gram etymology classifier | ~100s KB | µs | yes | yes | Praharaj etymology labels (have it) |
| Laya-multilingual fine-tuned | 322M params, ~650 MB | ~33 ms T4 GPU / ~330 ms laptop CPU | no (async) | **no** (heavier than the IndicXlit already excluded) | 10k-30k labelled decisions; 4-5 h on free Kaggle 2xT4 |
| IndicXlit at build time | 11M | n/a (offline) | n/a | yes, as data | none |
| LLM via API at build time | n/a | n/a | n/a | yes, as data (check licence) | none |
| Jev | hosted | 236-276 ms (published, per Laya's table) | no | **no** (network) | n/a |

---

## 6. Recommendation

1. **Do not put Laya, or any neural model, into the engine or the IME.** The project's own
   scope already rejected an 11M model at runtime. Laya is 30x larger, async, untested on
   Odia, and near chance without fine-tuning.
2. **The highest-value move is not a classifier.** It is attacking OOV (top-1 6.9%) with
   **build-time IndicXlit augmentation** of the lexicon, which `plan/04-scope.md` already
   allows. Measure with `npm run eval`.
3. If context ranking is wanted, build the **bigram model from the existing web corpus**
   first, as the scope file prescribes. A Laya fine-tune is only worth trying as an
   **offline experiment** if bigrams plateau. Its training data is free (self-supervised from
   the corpus), so it is cheap to try on a free Kaggle 2xT4 if curious.
4. For etymology tagging (nukta, ଯ/ୟ defaults on OOV words), use a **pure-TS char-n-gram
   classifier trained on Praharaj etymology labels**. It is small, synchronous and offline.
5. Revisit Laya only if its maintainers publish an Odia evaluation, or if a task appears
   that is (i) build-time or server-side, (ii) a bounded choice, and (iii) backed by labelled
   data. Watch for API churn: version 0.3.26 two weeks after launch.

## Unverified claims, in one place
- Laya-multilingual download size of 647 MB (search only; consistent with bf16).
- Which checkpoint the 329 ms laptop-CPU latency belongs to.
- Whether mmBERT's pretraining includes Odia, and how much.
- Whether onnxruntime-web loads inside a bare JavaScriptCore context.
- Every Jev fact (secondary sources only), especially language support.
- MuRIL licence and size. Gemma 3 Odia support. Sarvam-M licence.
- Bodhan AI licence, sizes and availability.
- Sarvam free-credit amount (₹100 vs ₹1,000, conflicting sources).
- Odia-specific LLM transliteration accuracy (none found).
- That a char-n-gram classifier would reach useful etymology accuracy (judgement, not
  measured).
