# Desh Odia iOS comparison and native implementation roadmap

Review date: 12 October 2026 (Asia/Singapore). This is a product/architecture review, not an iOS implementation or a claim that device parity has been tested.

## Evidence and limits

The eight screenshots supplied in the conversation are the primary evidence. Their displayed order corresponds to IMG_9457 (app settings), IMG_9458 (keyboard permissions), IMG_9461 (Notes text and keyboard switcher), IMG_9456 (enable onboarding), IMG_9453 (App Store listing), IMG_9459 (keyboard in Notes), IMG_9455 (preferences), and IMG_9454 (choose onboarding). These names come from the user's attachment ordering; the original local image files were not available in the cloud checkout.

The App Store screenshot identifies **Desh Odia Keyboard**, ClusterDev; the settings screenshot displays version **3.0.7**. The App Store promotional images claim word predictions and one-tap English/Odia switching. The screenshots directly show the controls, but they cannot measure typing accuracy, response time, data collection, offline operation, or how a clipboard button behaves.

The screenshot with “Allow Full Access” off establishes that setting at that moment. A different screenshot shows typing; it is not a controlled demonstration that every Desh feature works with access off. The text in Notes establishes that Odia text can be entered, but there is no input/output trace from which to score transliteration correctness. I also inspected a contact sheet sampled at approximately 0, 7, 14, 21, 28, 35, 42 and 49 seconds from the supplied 58-second screen recording. This is sampled visual evidence, not a frame-by-frame keystroke trace.

After environment network access was updated, I retrieved Apple's current “Creating a custom keyboard,” “Configuring open access for a custom keyboard,” `hasFullAccess` documentation, App Review Guidelines, the archived keyboard guide, and the live Desh App Store listing/Apple Search API on 12 October 2026. The Desh website itself still returned HTTP 403; the App Store material is sufficient to attribute the feature claims below. Current documentation takes precedence over archived wording, especially for shared-container access.

The [live App Store listing](https://apps.apple.com/in/app/desh-odia-keyboard/id6449289327) identifies version **3.0.7** and claims Roman-to-Odia transliteration, word predictions, English predictions/spell correction, language switching, emoji, configurable rows/feedback, pinned clipboard snippets and copy/paste stickers (animations pasted as GIFs). It says Full Access may be enabled for crash reports and says no personal information is collected. These are developer claims, **not an independent privacy or behavior audit**. Apple Search API reports minimum iOS 14.0; our own minimum deployment target needs a separate engineering decision.

### Recording evidence (sample timestamps)

- **0–14 s:** Odia text grows in Apple Notes while the Desh Roman QWERTY keyboard remains open. The user is composing a connected sentence, not merely displaying a completed example.
- **~21 s:** A Latin `p` is visible at the end of the host text and the candidate strip offers multiple Odia alternatives plus Latin `p`. This confirms a visible Roman composing token and explicit alternatives during typing.
- **~28 s:** The preceding word is now committed in Odia and punctuation has been added. Together with the visible “select suggestion with space” preference, the flow is consistent with space-to-commit; sampled frames alone do not prove the exact triggering key event.
- **~35 s:** Latin `klad` is visible in Notes, and the candidate row contains several Odia forms and verbatim `klad`. This is especially relevant for names/borrowings: preserve a raw Latin choice while offering phonetic forms.
- **~42–49 s:** The text contains Odia renderings of the intended named tools and further connected words. This confirms the workflow can continue after committing unfamiliar names. It does not prove that the chosen spellings are preferred, that every preceding candidate was correct, or that no corrections were needed between sampled frames.

The practical benchmark to adopt is continuous composition with a stable candidate strip, easy retention of Latin, and no forced dictionary-dialog interruption. No Desh accuracy or latency percentage can be derived from this recording alone.

## What parity actually means

A responsive website or installed PWA remains a composer inside its own app. It does **not** register a keyboard usable inside Notes, Messages, Safari and other apps. Matching the observed Desh workflow requires an iOS containing app and a **Custom Keyboard Extension**. The existing macOS InputMethodKit project is a separate platform integration: its checked-in `OdiaInputController.swift` still uses a five-word stub, and it cannot be reused as an iOS controller.

“1:1 parity” should mean an explicit set of user-visible behaviors with acceptance tests, rather than identical branding, colors, assets, or assumptions about Desh's internal algorithms. The following separates observed controls from marketing claims and unknown behavior.

| Capability | Evidence in supplied screenshots | Proposed implementation / acceptance test |
|---|---|---|
| Enable → choose onboarding | Directly visible; instructions explain enabling the keyboard and choosing it via the globe | Swift containing app with two concise steps, a live practice field, clear permission explanations, and instructions that remain correct after returning from Settings. Do not treat “installed/enabled” as proof the current input mode is selected. |
| Use inside another app | Desh visible in Notes and the system keyboard chooser | `UIInputViewController` keyboard target; test actual insertion in Notes, Messages, Safari and a third-party editor. Expect OS/app exclusions. |
| Roman QWERTY → Odia | QWERTY and Odia text visible; recording ~21/~35 s shows Roman composing tokens and alternatives | Reuse the core transliterator with a native composing buffer and candidate strip; record every Roman input, selected candidate and committed output on device. |
| Word predictions | App Store claim; recording confirms current-token candidates including Latin, but not next-word prediction quality | Separate current-word candidates from next-word predictions. First match reliable current-word suggestions, then evaluate contextual next-word ranking on conversational held-out sentences. |
| English/Odia switching | Live App Store claim plus an Odia toggle key visible | One-tap explicit Latin/Odia mode, visible state, predictable commit on mode switch, preservation of English acronyms, URLs and names. |
| Candidate selection with space | Directly visible preference, enabled | Preference for selecting the current candidate with space; deterministic raw-Latin escape, punctuation commit and correction/undo behavior. Test a complete sentence, not isolated taps. |
| Double-space punctuation and poornaviram | Two directly visible settings; double-space on, poornaviram default off | Independently configurable double-space punctuation and `.` versus `।`; avoid modifying URLs/decimals and test after Odia, English and emoji. |
| Emoji row and emoji/symbol access | Emoji row and symbol key visible; emoji-row preference on | Native emoji shortcuts and symbols; return cleanly to the composing buffer. Emoji catalog/search behavior is not established by screenshots. |
| Number row | Preference visible, off | Optional number row; decide separately whether labels/output use Latin or Odia digits. Verify both modes. |
| Sound, vibration, key popup, height | Preferences visible; vibration appears unavailable/disabled in the screenshot | Native settings with capability checks and accessible defaults. Disabled appearance does not establish why vibration is unavailable. Test supported devices with access off/on. |
| Clipboard | Button visible; live listing claims “Paste copied text,” permanent pinning, and optional automatic display with “Paste from Other Apps” allowed | Implement explicit paste and pinned snippets first; distinguish pasted content from automatic clipboard capture. Validate paste consent/access-off behavior on device. These claimed actions were not exercised in the supplied recording. |
| English spell correction | Live App Store description claims English predictions and spell correction | Separate English-mode candidate provider; test acronyms, names and deliberate misspellings without changing the Odia transliteration ranking. |
| Stickers | Live App Store description claims sticker copy/paste, with animations pasted as GIFs | Later optional feature using original or licensed assets; test copying and host-app pasting, with clear fallback for unsupported hosts. Not demonstrated in the supplied recording. |
| System keyboard switching | Globe and system chooser visible | Honor `needsInputModeSwitchKey`; wire the documented input-mode switch interaction, including long-press behavior, and test with multiple installed keyboards. |
| Voice input | Microphone glyph visible in the system bottom region | The glyph is **not evidence of Desh-owned speech recognition**. Do not promise microphone capture from the keyboard extension; consider a separate containing-app dictation workflow only after checking current APIs and permissions. |
| Learning, offline support, themes, transliteration quality | Not established by screenshots | Treat these as separate product requirements and measurement tasks, not confirmed Desh features. |

The formatting, checklist, table, attachment, pen, share, undo and Done controls above the keyboard belong to **Apple Notes**, not to Desh. Recreating those in the keyboard is unnecessary for parity with the observed input method.

## Architecture that fits this repository

```text
Swift containing app
  onboarding / practice editor / settings / bilingual dictionary
  explicit import-export, optional downloads, future optional online assist
             |
     consented settings/learning sharing, where OS permissions allow
             |
Swift keyboard extension (UIInputViewController)
  native keys + candidate strip + composing state + correction history
             |
JavaScriptCore bridge: synchronous rank / commit / learn interface
             |
bundled, offline core engine + versioned compact Odia data
```

1. **Keep the engine pure and shared.** The repository deliberately chose TypeScript with JavaScriptCore in mind. Build a standalone browser-independent JS bundle exposing a small callable interface. The current `Appv2/src/engine.ts` uses Vite asset globs and browser-oriented loading, so it is not a drop-in iOS bridge. Read bundled rule/data assets through Swift and initialize the pure core; avoid DOM, Node, fetch and dynamic module assumptions in the bridge. Preserve `canonical()` boundaries and decomposed nukta forms.
2. **Keep the native shell native.** Use UIKit keys and candidate views, Swift touch handling, explicit composition state, and `textDocumentProxy` for host interaction. An embedded web composer is not a substitute for OS keyboard semantics. Do not share the macOS InputMethodKit controller; share the JS engine and platform-neutral fixtures.
3. **Design around limited host context.** Host text context may be unavailable or truncated. Candidate ranking must work without it. Never assume access to a full document or arbitrary host selection. Exercise marked-text/proxy APIs on each supported OS and host; changing focus, selection, app or keyboard must not leave duplicate text or delete unrelated text. Distinguish “delete a Roman key while composing” from deletion after commit and test Odia combining sequences/conjuncts.
4. **Make core typing work without Full Access.** Bundle the engine, essential lexicon and initial bilingual dictionary. Offline conversion and suggestions should not need network access. Apple's **current** open-access documentation explicitly permits **read-only access** to the containing app's shared group containers without Full Access; network access and writing to shared containers require `RequestsOpenAccess` plus explicit user approval. Therefore the containing app can publish settings/dictionary packs to an App Group for the keyboard to read, while the keyboard keeps learned words in its own container. App-to-keyboard distribution can remain access-free; bidirectional learning synchronization needs an optional permitted write path. Verify persistence and updates on target devices, and use `hasFullAccess` rather than probing clipboard permissions. App Review §4.4.1 explicitly requires functionality without Full Access.
5. **Share and learn deliberately.** Use read-only App Group consumption for app-published configuration/data and a separate extension-local learning store. If the user enables shared write access, store a versioned, bounded learned-word/preferences format with atomic writes and conflict-safe merges. Keep stock data read-only and user data separate. Provide export, reset and deletion controls; never log host text or send it to a server by default. Show a concrete reason before requesting optional access. The current core's no-network contract remains valuable even if a future containing app has opt-in online features.
6. **Keep translation and transliteration distinguishable.** A bilingual dictionary can offer `meeting → ବୈଠକ` (meaning) and `meeting → ମିଟିଂ` (loanword rendering) as differently labelled choices. It should not silently translate an English token during ordinary phonetic typing. Put detailed definitions/senses in the containing app; offer compact explicitly selected results in the keyboard, subject to native-speaker review of each entry.
7. **Budget real device resources.** Keyboard extensions have constrained memory and may be terminated; no fixed universal “50 MB” ceiling should be promised. Measure peak resident memory, JS heap, cold initialization, candidate latency and recovery on the oldest supported iPhone and an iPad. Use compact data/pruned packs and avoid parsing duplicated lexicon strings per key press. Bundle size is not in-memory cost. Proposed engineering targets, **not measured results**: warm key-to-candidate p95 under 50 ms, usable keyboard under 300 ms after a warm activation, and no observable lost keystrokes during cold activation. Set final budgets after profiling.
8. **Accessibility is part of parity.** VoiceOver labels/actions for keys, candidates and language state; sufficient contrast; predictable focus order; Reduce Motion; enlarged candidate text without hiding keys; larger touch targets and adjustable height; hardware-keyboard commands; iPad rotation, floating keyboard and different widths. Odia text must render and be read intelligibly with suitable fonts and OS language support.

## Platform boundaries to communicate honestly

- Secure/password entry and some phone-pad fields use the system keyboard; a host app can disallow third-party keyboards. “Use in any app” is marketing shorthand, not a guarantee of every field.
- A keyboard extension is not a full foreground app. It has limited surrounding-document access, limited UI scope and a lifecycle controlled by the host/OS.
- A system microphone or globe near the keyboard does not become an API owned by the extension. Verify any dictation design separately; direct extension microphone capture is not part of the established custom-keyboard capability model.
- App Group reads are permitted without Full Access according to current Apple documentation; App Group writes/network require open access and consent. Test read-only settings/dictionary distribution, extension-local learning, optional shared writes, and clipboard interactions in both states.
- App Review §4.4.1 requires keyboard input and a next-keyboard method, functionality without Full Access, and activity collection only to enhance the user's keyboard. It forbids launching apps other than Settings and repurposing keyboard buttons for unrelated actions. Do not plan a one-tap keyboard → containing-app launch for dictation; a containing-app speech feature would be opened separately by the user. §4.4 also forbids advertising/marketing/in-app purchases within extensions.
- Linux browser emulation cannot validate native extension installation, iOS composition behavior, App Store compliance, memory pressure or actual VoiceOver. Xcode plus iPhone/iPad testing is a separate milestone. The user added Build macOS / Build iOS plugins during this review, but the active tool/skill catalog exposed no callable capabilities for them; the cloud machine has no `xcodebuild`, `xcrun` or Swift toolchain. Native build/device validation remains unperformed. Any Playwright WebKit result is browser-engine evidence, not proof of native iOS keyboard behavior.

## Sequence after the current core work

**Gate 1 — typing quality before native packaging.** Maintain a native-speaker-reviewed conversational corpus covering greetings, inflections, particles, names, place names, loanwords and English/Odia switching. Track complete-sentence success, top-1/top-3, manual corrections per sentence, taps per committed word and latency. Validate dictionary meanings separately from transliteration spellings. A keyboard UI cannot repair missing or misranked vocabulary on its own.

**Gate 2 — minimal extension spike.** On macOS/Xcode, build a signed containing app + extension, integrate bundled JSCore and core data, type real Odia in Notes/Safari/Messages with Full Access off, verify switching and return/backspace. Confirm Unicode code points in committed output and profile startup/memory. This is the first proof of native feasibility, not a UI mockup.

**Gate 3 — composition parity.** Implement candidate-strip selection, space/punctuation commit, raw English, recovery after cursor/focus changes, correction of recent commits, and grapheme-aware behavior. Use recorded scenarios with expected host text after every step. Test rapid typing, held backspace, pasted text, emoji, URLs, app switching and engine reload.

**Gate 4 — screenshot-visible preference parity.** Add bilingual toggle, number/emoji rows, sound/haptic capability handling, popup/height, double-space and poornaviram preferences. Verify onboarding/access-off flows, a clearly scoped clipboard feature, VoiceOver, iPad layouts and physical keyboards.

**Gate 5 — improve beyond the observed baseline.** Surface the app's explicit English → Odia meanings versus loans, teachable personal words, dictionary source labels, rare-letter palette and useful writing profiles where they fit a small keyboard. Keep deeper search, explanation, document tools and optional online assistance in the containing app. Ship additional features only after they improve measured typing without introducing latency or accidental substitutions.

**Gate 6 — TestFlight and store review.** Device matrix includes supported oldest/current iOS, iPhone/iPad, portrait/landscape, multiple host apps, cold launch, offline, memory pressure, Full Access off/on, reinstall/update, privacy reset and assistive technologies. Compare Desh and this keyboard on the **same** consented sentences and devices; do not infer performance superiority from screenshots. Record privacy disclosures and review the current extension rules before submission.

## Official sources for implementation verification

- Apple, [Custom Keyboard / App Extension Programming Guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/CustomKeyboard.html). Archived foundation for extension architecture, open access and restrictions; confirm modern API behavior against the current SDK.
- Apple, [Creating a custom keyboard](https://developer.apple.com/documentation/uikit/creating-a-custom-keyboard), retrieved via Apple documentation JSON: verifies target setup, `textDocumentProxy`, globe behavior, iPad floating layouts and device-dependent memory limits.
- Apple, [Configuring open access for a custom keyboard](https://developer.apple.com/documentation/uikit/configuring-open-access-for-a-custom-keyboard), retrieved via Apple documentation JSON: explicitly distinguishes read-only shared-container access from shared writes/network.
- Apple, [hasFullAccess](https://developer.apple.com/documentation/uikit/uiinputviewcontroller/hasfullaccess), retrieved via Apple documentation JSON.
- Apple, [UIInputViewController](https://developer.apple.com/documentation/uikit/uiinputviewcontroller).
- Apple, [UITextDocumentProxy](https://developer.apple.com/documentation/uikit/uitextdocumentproxy).
- Apple, [JavaScriptCore](https://developer.apple.com/documentation/javascriptcore).
- Apple, [Configuring app groups](https://developer.apple.com/documentation/xcode/configuring-app-groups).
- Apple, [App Review Guidelines §4.4 Extensions](https://developer.apple.com/app-store/review/guidelines/#extensions), including keyboard requirements; live text retrieved and reviewed.
- Desh, [App Store listing](https://apps.apple.com/in/app/desh-odia-keyboard/id6449289327), live page and Apple Search API retrieved; claims attributed to the developer, not independently tested. No undocumented claims about Desh's language model, data source or server architecture are made.
