# Codex review — 12 October 2026

## Implemented after the review

The owner subsequently authorized implementation and release to Vercel. The app
now preserves addresses, identifiers and pasted text; plain digits no longer
select candidates. Alt/Option+number selects a candidate, Left/Right moves the
caret, and punctuation commits consistently at word boundaries. Copy visibly
finishes the active eligible word and copies the editor contents. Shared
transactions provide undo/redo for typing, commits, Clear and insertion, including
mobile input events and browser composition. English dictionary results now offer
**Insert Odia** at the saved editor selection, alongside Copy.

The historical findings below explain why these changes were needed. See the
[implementation and validation record](plan/research/2026-10-12/EDITOR-IMPLEMENTATION.md)
for the 21 editor checks, 19 dictionary checks and WebKit evidence. Dictionary
coverage, preferred spellings and ranking limitations remain separate work; this
release does not claim to fix them or to complete native iOS parity.

## Follow-up after environment settings were published

PR #4 was merged as `5ba8761`; this follow-up starts from that merged revision.
The published environment has unrestricted network access; no configuration draft
was pending when this follow-up began. The restored production app passed all 15 English-dictionary
Chromium checks again, including offline reload, clipboard behavior and degraded
historical-dictionary loading.
Reusable startup notes for the retained WebKit tooling and the new diagnosis
were subsequently saved as an environment-settings draft; publication is separate
from these successful checks in the current instance.

The Build macOS / Build iOS plugins still do not expose callable tools or skills
in this session. The executor remains Linux without `xcodebuild`, `xcrun` or
`swift`; changed network settings do not supply an Apple execution environment.
Native builds, Simulator and device tests remain unperformed.

Both requested Hugging Face dataset cards are reachable, but their data-file
requests still return HTTP 401 and metadata still says `gated: manual`. This is
publisher-controlled dataset access, separate from the environment's network
policy. No gated rows were downloaded.

The unresolved WebKit navigation error is now isolated to the tested
Playwright offline-emulation path: it also occurs with a minimal worker returning
constant HTML, without any app code or cache. With the HTTP origin actually
stopped, both minimal controls and both app versions reload successfully; the
current app still transliterates and returns `water` → `ପାଣି` from its dictionary.
This establishes cached operation during origin loss in Linux WebKit, not iPhone
airplane-mode behavior. The original failing assertions remain visible. See the
[controlled experiment](plan/research/2026-10-12/VALIDATION.md#follow-up-distinguish-webkit-offline-emulation-from-origin-loss).

New source sampling found **2,034 distinct Odia headword strings and 4,898 senses**
in Kaikki's 4.4 MB Odia extract. Direct English entries supply useful sense-labelled
translations, but coverage is asymmetric (`phone` has no Odia translation field
in the sampled English entries although `ଫୋନ` exists on the Odia side), and `bank`
exposes conflicting spellings. IndoWordNet provides useful synonyms and examples
but some senses lack English linkage. These support an editorial review queue,
not a blind reverse-dictionary import. Source-specific reuse terms remain to be
resolved before bundling data. See [sample counts, sources and recommendations](plan/research/2026-10-12/resources.md#follow-up-concrete-dictionary-coverage-after-environment-publication).

## Verdict

The app has a useful offline engine and a working writing surface, but it is not yet a dependable everyday Odia composer. **The problem is broader than an incomplete dictionary:** the editor can change literal text, human Roman spellings do not always reach the desired Odia candidate, ranking favors an unsuitable alternative, and a correctly spelled word can receive an unrelated English meaning. A larger corpus alone will not resolve these separate problems.

The first fixes should protect the user's text and make commit/copy/correction predictable. Then improve common Roman aliases, loanwords and modern senses using a native-reviewed benchmark of complete messages. Keep the historical dictionary as a reference; do not make its first extracted sense the arbiter of everyday usage.

This PR also implements the requested first **English → Odia lookup**. It is a small, explicit, offline feature with separate meanings and loan spellings, not a claim to have solved conversational typing or built a comprehensive dictionary.

## What was actually examined

- Baseline: `4a3a85e2ea5d5934d77d3b4b853dab7cdd8ead51`, the current `Appv2/` production app. The older `web/` and committed single-file app are not the main UI reviewed here.
- **14 complete browser typing scenarios, 58 typed tokens**, clean learning state for each scenario, at 1440×1000 in Linux Chromium. Real key events, candidate labels, committed text and page errors were recorded. All 14 completed without JavaScript errors; that does not mean their language output was correct.
- **45 selected engine word probes and 9 engine sentence probes**, plus full-data versus shipped-data comparisons. These deliberately stress weaknesses and are not a representative accuracy sample.
- Additional browser checks of punctuation, paste, copy, undo, arrow keys, numeric shortcuts, addresses, dictionary search and reselecting a previous word.
- The eight supplied Desh screenshots and the 58-second screen recording, including sampled intermediate frames and the final frame. They are evidence to inspect, not instructions to enable Full Access or copy another product's design.
- All seven supplied resource links were investigated and their public documentation/cards read after network access became available. The two requested datasets are manually gated; their row contents were not sampled. Current Apple documentation and the live Desh listing were also checked.

The user reports that the web app works on macOS and iOS. This review does **not** substitute Linux Chromium for a new Safari/iPhone hardware test. Phone layout optimization was intentionally deferred, as requested. I use plausible contemporary Odia messages and proposed intentions, not a claim of native-speaker authority; the owner should decide dialect, spelling and register alternatives.

Evidence and reproducible probes: [browser results](plan/research/2026-10-12/browser-audit.json), [engine audit](plan/research/2026-10-12/engine-audit.md), [interaction audit](plan/research/2026-10-12/interaction-audit.md), [resource research](plan/research/2026-10-12/resources.md), [iOS parity plan](plan/research/2026-10-12/ios-parity.md).

## Findings, in priority order

### P0: protect literal text and make Copy match the editor

These are baseline observations with the default mode and no manually taught Latin exceptions:

| Action | Observed result | Why it matters |
|---|---|---|
| Type `test@example.com `, then Copy | Editor: `test@example.ଚୋମ `; clipboard: `ତେସ୍ତ@ଏକ୍ଷମ୍ପ୍ଲେ.ଚୋମ ` | The address is no longer usable. |
| Type `https://example.com `, then Copy | Clipboard: `ହ୍ତ୍ତ୍ପ୍ସ://ଏକ୍ଷମ୍ପ୍ଲେ.ଚୋମ ` | A normal shared link is silently changed. |
| Type `covid19` | `ଚୋବିଦ9` | `1` selects a candidate instead of remaining part of the term. |
| Type `PCR2` | `ପ୍ଚ୍ର` | Candidate shortcut `2` consumes content in an ordinary research identifier. |
| Type `namaskar, tume kemiti achha? ` | Editor: `namaskar, ତୁମେ କେମିତି achha? `; Copy: `ନମସ୍କାର, ତୁମେ କେମିତି ଅଛ? ` | Punctuation and Copy use inconsistent conversion paths. |

“Keep English” is useful and works when explicitly selected. It is too much work to require token-by-token rescue of every email, URL or identifier. Introduce protected literal spans and a consistent explicit Latin mode. Apply the same policy to typing, paste, copy, share, selection and reload. Make numeric candidate selection optional or modifier-based while preserving literal digits. These editor fixes remain follow-up work; the English lookup in this PR does not change the commit path.

### P1: repair correction and navigation before optimizing for speed

In Chromium, typing `namaskar ` and pressing Ctrl+Z did not restore the Roman composition. Pressing Left Arrow inside active `kemiti` cycles candidates instead of moving the caret; typing `a` then produces `kemitia`. These behaviors follow custom key handling and direct textarea assignments. Cmd+Z must be tested separately on macOS.

A strong recovery path already exists: click the earlier word in **Reads as**, then choose another candidate. That changed `ମୁ` to `ମୁଁ` successfully. Preserve it, but add explicit composition/commit transactions and reliable undo/redo. Define expected host text after each key in automated tests. Losing a convenient correction path magnifies every ranking error.

### P1: distinguish missing Roman aliases from low-ranked words

Representative actual browser results, using ordinary Space commits:

| Input | Committed output | Diagnosis / proposed intention |
|---|---|---|
| `namaskar tume kemiti achha` | `ନମସ୍କାର ତୁମେ କେମିତି ଅଛ` | Baseline greeting works. |
| `mu bhala achhi` | `ମୁ ଭଲ ଅଛି` | Proposed `ମୁଁ` is available second; `mun` produces it first. Ranking/alias issue. |
| `tume kana karucha` | `ତୁମେ କଣ କରୁଚ` | Register and final-form choice need review; the word is not rescued by a definition. |
| `mu bhata khai sarili` | `ମୁ ଭତ୍ତା ଖାଇ ସରିଲି` | Likely intended cooked rice `ଭାତ`, not allowance `ଭତ୍ତା`. |
| `kali mo sanga asiba` | `କଲି ମୋ ସଙ୍ଗ ଆସିବ` | Likely intended tomorrow `କାଲି`, friend `ସାଙ୍ଗ`; short Roman vowels are ambiguous. |
| `mote phone kara` | `ମୋତେ ଫୋନେ କର` | English orthography is not the same as phonetic `phon`. |
| `aji office re meeting achhi` | `ଆଜି ଓଫ୍ଫିଚେ ରେ ମୀତିଙ ଅଛି` | Common workplace loans are not reached correctly. |
| `mote message pathao` | `ମୋତେ ମେଷଗେ ପଥଓ` | Loan alias and vowel/consonant ambiguity both contribute. |
| `mu video dekhuchi` | `ମୁ ବିଦେଓ ଦେଖୁଚି` | Proposed `ଭିଡିଓ` is absent under `video`; `bhidio` works. |
| `mo mobail re internet chaluni` | `ମୋ ମୋବାଇଲ ରେ ଇନ୍ତେର୍ନେତ ଚଲୁନି` | One phonetic loan succeeds, another English spelling does not. |
| `WhatsApp re photo pathao` | `ୱ୍ହତ୍ସପ୍ପ ରେ ଫୋଟୋ ପଥଓ` | Code-mixed brand names need deliberate treatment. |

These are observations, not an instruction to force one formal spelling on everyone. `jauchi` → `ଯାଉଚି` versus `jauchhi` → `ଯାଉଛି` needs a spoken/written policy and accepted alternatives. Ordinary inflections such as `gharaku`, `pilanku`, `karithili` and `sangamane` already work in the probes; “the engine cannot handle inflection” would be too broad a diagnosis.

For `meeting`, the desired `ମିଟିଂ` is absent in the ordinary engine request but becomes first when requesting 100 candidates. The larger request changes segmentation limits before ranking; this is a **candidate generation bottleneck**, not proof that the word was simply ranked tenth. Do not solve every failure by changing global frequency weights or displaying a hundred choices.

Recommended data separation:

1. Roman Odia aliases: several ways humans type the same spoken word.
2. Reviewed English loan spellings: `meeting` → `ମିଟିଂ`, with variant/suffix handling.
3. English semantic lookup: `meeting` → `ବୈଠକ` for a specified sense.
4. Literal English: keep `meeting`, `PCR2`, a name or an address.

Keep these choices distinguishable. In particular, English words such as “mate” overlap with plausible Roman Odia and must not trigger automatic semantic translation.

### P1: meanings can be present and still be misleading

The actual candidate glosses included:

| Typed word / context | Displayed meaning | Problem |
|---|---|---|
| `mu` | “At” | Pronoun intention is not explained. |
| `mun` | “the i” | Modern gloss quality is weak even when spelling works. |
| `kana` in a question | “A particle” | Technically lexical information, little help for “what?”. |
| `khai` in an eating sentence | “Ditch” | Same written form, wrong sense for this context. |
| `kara` in “phone me” | “Ray of light” | First historical sense defeats a normal verb reading. |
| `re` | “in fess” | Unhelpful noisy gloss for a frequent particle. |
| `mobail` → `ମୋବାଇଲ` | “not a known word” | Missing meaning is presented as invalid spelling. |

Searching `ଭାତ` finds a dictionary entry, but “Displayed; manifested; shining; resplendent” appears before the everyday boiled-rice sense. Searching `କେମିତି` shows the owner meaning “how” alongside an auto-detected “English word?: committee” and approximate “today: how-to”. The override fixed the main chip, but the speculative association remains in the panel.

The pruned lexicon has **123,125 rows, 105,824 Roman keys and 54,397 distinct Odia spellings**. Praharaj has **38,776 keys**; the modern payload has **40,589 keys**, including **32,315 loan-only entries** intentionally excluded from inline meaning chips because the detector produces false positives. These numbers measure different things. None establishes 120,000 correctly defined contemporary words.

This PR changes the missing-gloss message to **“meaning unavailable”** and lets owner-only glosses appear in direct Odia search. Follow-up: curate frequent conversational senses, label exact/stem/prefix matches clearly, and relegate speculative loan associations and full historical definitions to secondary reference content. Do not reverse the entire noisy modern payload to make an English dictionary.

### P1: measure the data and interaction that actually ship

`Appv2/eval/lib.ts` loads full lexicon/unigram/bigram files; the browser loads `-web` assets. Measured example: `janichi` leads with `ଜାଣିଛି` using full assets, but `ଜାଣିଚି` in the browser data, where the proposed standard form was absent even in the diagnostic top-100 request.

The everyday benchmark reverse-transliterates Odia with the project's own romanizer. It is useful as a regression check but does not model the range of human Roman typing. The Appv2 no-regression harness compares two current profiles using full data; a shared defect can affect both without making that comparison fail. Existing colloquial data is explicitly an unvalidated seed.

Add a shipped-asset benchmark with owner/family-authored Roman messages and accepted Odia alternatives. Keep four outcomes separate: candidate recall, ranking, meaning accuracy and editor correctness. Include unseen names, loans plus suffixes (`videota`, `officere`, `phoneku`), English spans, punctuation and corrections. Track interventions per sentence and p50/p95 candidate latency; do not publish a quality percentage from the selected failure cases in this review.

## First English → Odia dictionary delivered in this PR

Open **Meanings → Dictionary direction → English → Odia**. Search an English word or supported phrase, examine the sense and type of result, then choose **Copy Odia**.

- **70 entries for 62 distinct English terms**: 64 original suggested senses and 6 backed by existing owner-reviewed glosses. Every proposed result visibly awaits native-speaker review.
- Exact headword/alias matching, case and whitespace normalization, followed by labelled prefix suggestions. Different senses of rice, bank and call remain separate.
- “Translation” and “English loan spelling” are different labels: e.g. meeting, office, message and school offer distinct choices. Phone device and phone call use different entries.
- Canonical/decomposed nukta, existing hidden-word filtering, explicit copy feedback and a manual-copy fallback if clipboard access fails.
- Bundled offline data; the feature remains usable if the historical dictionary assets fail. No new runtime dependency or network service.
- Odia → English remains the default. Ordinary typing/ranking and automatic loanword suggestions are unchanged. This first version supports copying, not direct insertion or sentence translation.

Implementation: [english.ts](Appv2/src/dictionary/english.ts), [reviewable data](Appv2/src/dictionary/english.tsv), [provenance and limitations](Appv2/src/dictionary/PROVENANCE.md), [unit checks](Appv2/test/english.test.ts), [browser checks](Appv2/eval/browser/english-check.mjs).

The seed is deliberately modest. Its terminal halants, loan variants and sense labels are proposals, not corrections imposed on a native speaker. Approve those entries before expanding or using them as typing aliases. The six owner-backed meanings do not make the other 64 entries validated.

## Assessment of the seven supplied resources

See [resource research](plan/research/2026-10-12/resources.md) for pinned GitHub revisions and license detail. No third-party dataset rows or model weights were imported.

| Resource | What could be verified | Recommendation for this app |
|---|---|---|
| [Odia-lipi-ocr-data](https://huggingface.co/datasets/OdiaGenAIOCR/Odia-lipi-ocr-data) | Public card: manually gated, CC BY-NC-SA 4.0; declared 67 training examples, text/image/validated_text fields, ~15.1 MB. Row samples remain gated. | Printed-page OCR with claimed human validation; useful for digitization, not an English dictionary or Roman alias set. Low immediate priority; NC terms need attention before commercial use. |
| [Odia NLP Resource Catalog](https://github.com/shantipriyap/Odia-NLP-Resource-Catalog) | README on `master` links parallel corpora, IndoWordNet, frequency/morphology/POS resources. | Most useful supplied discovery index for current needs. Follow original artifact documentation and rights; a catalog is not itself a dictionary. |
| [GenerativeAI and LLM Odia](https://github.com/OdiaGenAI/GenerativeAI_and_LLM_Odia) | LLM research/training initiative, IndicTrans workflow; explicit CC BY-NC-SA 4.0 for the repository. | Useful for research and data preparation, not a ready keyboard engine. Repository terms do not establish linked dataset licenses. |
| [OdiaGenAI on Hugging Face](https://huggingface.co/OdiaGenAI) | Public page/listing APIs show instruction/translation datasets and Odia language models with varying licenses; listing was sampled, not exhaustively inventoried. | Evaluate individual artifacts, tasks, base-model licenses and runtime cost. Do not infer quality or uniform licensing from the organization name. |
| [Processed Odia pretraining data](https://huggingface.co/datasets/OdiaGenAIdata/pre_train_odia_data_processed) | Manually gated, CC BY-NC-SA 4.0; page shows 6.41 GB, sources including Varta, CulturaX, IndicNLP, OSCAR and Samanantar; card explicitly says duplicates remain. Samples not accessed. | Potential priors/context data only after deduplication, domain balancing and source-rights review. The NC mixture cannot be assumed suitable for commercial redistribution; it is not a bilingual sense dictionary. |
| [Dataset announcement](https://www.odiagenai.org/blog/odiagenai-releases-comprehensive-pre-trained-dataset-for-odia-llm-development) | Article read: OCR/scraping/public corpus mixture, dialect/domain limitations and NC-SA terms. Overview claims >300M tokens; later text says >293M and nearly 20M sentences. Dictionary/spell-checker are future work. | Useful methodology and limitations; reconcile differing counts/snapshots. It does not deliver the dictionary/spell-checker needed here. Published validation claims are not independently measured quality. |
| [Indic LLM Resource Catalog](https://github.com/OdiaGenAI/Indic_LLM_Resource_Catalog) | Lists instruction, translation and model resources; catalog explicitly CC BY-NC-SA 4.0. | Useful roadmap, weaker immediate fit. Synthetic instruction text can bias formal phrasing and does not encode trustworthy word senses. |

Better-targeted next investigations:

- **IndicXlit/Aksharantar:** strongest direct fit for Roman variants and names. IndicXlit documentation explicitly licenses code/models MIT; the Aksharantar card distinguishes manually collected CC-BY data from mined/existing CC0 packaging with an upstream-ownership caveat. Its Odia split is declared as 346K train / 3K validation / 4,256 test; these are Romanization pairs, not English meanings. Its published Odia top-1 results (58.90% native words, 30.63% names on its benchmark) are upstream claims, not a reason to replace this engine untested and not comparable to the app's internal scores.
- **IndoWordNet and Wiktionary extraction:** promising sense/part-of-speech/translation structure for English lookup. Verify actual Odia coverage, alignment and data licenses. MIT for a wrapper/extractor does not license the source dictionary content.
- **BPCC-H-Daily/H-Wiki:** IndicTrans2 documentation states CC BY 4.0 for these subsets; potentially useful conversational examples and evaluation material. Mined corpus CC0 packaging does not automatically clear source text rights.

Before ingesting any source, pin revision, retain provenance/license, inspect stratified samples, normalize Unicode, separate conversational/news/literary domains, and reserve a non-overlapping evaluation set. More tokens are not a substitute for good aliases, correct senses and predictable editing.

## Desh Odia parity, then differentiation

The supplied screenshots show Desh iOS **3.0.7**, two-step enable/choose onboarding, a QWERTY keyboard, an Odia/English switch, emoji and clipboard entry points, and preferences for sound, vibration, emoji/number row, key popup/height, Space selection, double-space punctuation and poornaviram. The 58-second recording shows Roman composing text and alternatives inside Notes, including Latin alternatives. It establishes a useful interaction baseline, not controlled accuracy or latency superiority.

The Notes formatting/checklist/table/attachment/share/undo/Done controls belong to **Apple Notes**. A microphone glyph in the system bottom area does not prove Desh implements dictation. Screenshots do not establish Desh's learning, offline behavior, network architecture, clipboard history, or why a setting is disabled. The live App Store listing additionally claims English predictions/spell correction, pinned clipboard snippets and copy/paste stickers; those are developer claims, not independently exercised parity. Full Access is off in one screenshot; that alone is not a controlled test of its feature dependencies.

**A responsive PWA cannot provide 1:1 system-keyboard behavior.** Plan a Swift containing app plus a `UIInputViewController` keyboard extension. Reuse a browser-independent build of the pure TypeScript core through JavaScriptCore, with Swift loading compact bundled assets. The macOS InputMethodKit stub is not an iOS controller. Keep detailed dictionary search/settings in the containing app and the typing/candidate loop in the extension.

| Parity milestone | Acceptance evidence required |
|---|---|
| Enable/choose and switching | Real-device Settings → app → Notes flow; globe/long-press switching; clear selected-language state. |
| Roman composition and candidates | Identical recorded inputs/choices in Desh and this extension; correct Space/punctuation commit, raw English and correction after cursor movement. |
| Editing reliability | Undo/reselection, held Backspace, combining marks, emoji, URLs, numeric identifiers, app changes and cold restarts without altered unrelated text. |
| Visible preferences | Language toggle, optional rows, key popup/height, supported feedback and double-space/danda preferences on iPhone and iPad. |
| Offline and permission behavior | Core typing with Full Access off; separately validate settings/learning sharing, clipboard and any optional network feature. |
| Performance/accessibility | Cold/warm startup and peak memory on oldest supported hardware; key latency, VoiceOver, larger text, rotation, iPad widths and hardware keyboards. |

Verified Apple guidance includes secure-field/system-keyboard substitutions, host apps that opt out, limited surrounding context and device-dependent extension memory limits. Current documentation permits read-only App Group access without Full Access, so the containing app can distribute dictionary/settings data for the keyboard to read; shared writes and network require consent. App Review §4.4.1 requires core functionality without Full Access and forbids launching arbitrary apps from the extension. Do not design a keyboard button that opens the containing app for dictation. See the [detailed architecture and official references](plan/research/2026-10-12/ios-parity.md).

Once composition quality and these milestones hold, differentiate with reviewed meaning-versus-loan choices, visible provenance, useful explanations, teachable personal words and the app's Sanskrit/rare-character tools where they fit. Do not cram the full dictionary panel into a keyboard or make core typing depend on Full Access. Native packaging follows core correctness; it cannot compensate for wrong candidates.

## Recommended sequence and owner decisions

1. **Next engineering PR:** protected English spans, consistent punctuation/copy, non-destructive numeric handling, and editor transactions/undo. Acceptance: addresses and identifiers round-trip exactly; displayed text equals copied text.
2. **Next language review:** validate the 64 new seed senses, then supply 50–100 consented everyday messages written naturally in Roman Odia, with intended output and acceptable spoken/formal variants. Include work, family, food, travel, names and English mixing; do not romanize a predetermined Odia list to manufacture all inputs.
3. **Next ranking/data PR:** shipped-asset evaluation, explicit common aliases and loan-plus-suffix cases; review candidate-generation limits and curated everyday glosses. Track regressions by category and correction burden.
4. **Then source ingestion:** sample and license-check the most relevant paired/sense resources; measure incremental gain before downloading or shipping larger corpora/models.
5. **Then iOS spike:** signed containing app + extension, pure-core JS bridge and actual device tests, followed by the parity checklist above. Keep phone layout polish after core functionality as requested.

Language decisions the owner should make: everyday versus formal spelling preferences; colloquial ଚ/ଛ treatment; preferred loan variants/terminal halants; English preservation versus loan conversion; and which multiple senses should lead in common contexts. Do not force these decisions through a global ranking-weight change.

## Validation and remaining limits

- New feature: 10 unit tests; browser checks cover labels/senses, alias lookup, exact versus prefix results, decomposed-nukta clipboard output, missing terms, owner meanings, offline reload, failed historical payloads, clipboard denial and direction switching after failure.
- Full unit/fallback suite, Appv2 typecheck, production build, generated-rule consistency and theme-token checks were run. The older Sanskrit WebKit harness also proved stale: it waits for removed `#output`/`#profile` DOM in the committed single-file app; its timeout is a harness failure, not evidence of Sanskrit accuracy. Final counts and command evidence are recorded in [validation](plan/research/2026-10-12/VALIDATION.md).
- Existing orthographic coverage failures and the older `web/` unused-variable typecheck defect remain repository limitations identified during onboarding. No source/ranking/data change in this feature is presented as fixing them.
- Additional Linux WebKit 26.5 validation: 12 online checks passed across desktop/iPhone viewport emulation, including typing and the new lookup/copy action. Two offline reload checks failed with an internal navigation error in both baseline and feature builds despite an active worker and 26 cached requests. The follow-up above isolates the error to the tested offline-emulation path and verifies cached operation after actual origin loss; it is not proof of a Safari-device failure or a new-feature regression. Native iOS/macOS behavior and linguistic correctness of the seed still need device/native-speaker review.
- All seven public resource pages/cards and current Apple guidance are now verified at the documentation level. The two requested datasets remain manually gated; raw rows, empirical data quality and commercial reuse clearance were not established. The newly added Build macOS / Build iOS plugins were not exposed in this chat’s active tools/skills; this Linux workspace has no Xcode/Simulator, so native build/device validation remains unperformed.
