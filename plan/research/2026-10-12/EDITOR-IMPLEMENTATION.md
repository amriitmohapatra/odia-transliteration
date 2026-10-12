# Editor reliability implementation — 12 October 2026

This follows the baseline audit and the owner's instruction to implement fixes and publish them to Vercel. The historical observations in the original review remain evidence of the earlier app, not current acceptance results.

## Behavior delivered

- Typed email addresses, URLs, domains, acronyms and alphanumeric identifiers remain literal. Pasted text and explicit Keep/Escape choices remain literal through edits and undo.
- Space commits the highlighted eligible word and a space; Enter commits it and a newline; Tab commits without a separator. Punctuation stays attached. Left/Right move the caret; Alt/Option+1–9 selects a candidate, leaving bare digits available as content.
- Copy/Share visibly finish only the eligible active token, then read the editor value. They never silently transliterate the rest of the document. Native selected-text Copy is untouched. Reads as describes the actual document.
- A bounded in-memory history covers native edits, candidate commits, palette/dictionary insertions and Clear, retaining caret, selection direction and literal ranges. Undo/redo and native composition are handled explicitly. The Clear toast cannot undo a later unrelated edit.
- English dictionary results have Insert Odia beside Copy. Insertion replaces the last editor selection, keeps surrounding text, and is undoable. Meanings and loan spellings remain separate, with the existing review labels.
- Cancelable and noncancelable whitespace input events share a single commit transaction. Typed digit preferences, strict ITRANS capitals, smart quotes, danda and existing Sanskrit shorthand remain supported. Pasted content is never implicitly converted.

No linguistic rules, ranking weights, dictionary rows, lexicons or corpus artifacts changed. The starter dictionary's 64 proposed entries still await native review. A larger dictionary and preferred conversational spellings remain separate work.

## Evidence

- Initial 16-case browser suite: **2 passed, 14 failed** against the frozen original audit baseline. The two passing controls were native selected-text Copy and Keep English learning. See `editing-baseline.json`.
- Final expanded browser suite: **21/21 passed**, including five additional compatibility/edge cases. See `editing-final.json` and `Appv2/eval/browser/editing-check.mjs`.
- English dictionary: **19/19 browser checks passed**, including replacement at a saved selection, canonical caret position, undo/redo, clipboard failure and offline reload.
- Existing browser regression, word-origin and context checks passed; the old numeric-selection check now explicitly uses Alt+number for the new shortcut contract.
- Core **178** tests, Appv2 **73** tests (including 10 editor-state cases), and **58** fallback checks passed. Appv2 typecheck, production build, generated rules and theme checks passed.
- Engine scores unchanged: held-out overall top-1/top-5 **25.3%/36.8%**; everyday careful **89.1%/97.8%**, casual **80.4%/95.7%** top-1/top-3. No accuracy improvement is inferred from editing fixes.
- Linux WebKit: **six focused editing scenarios passed**, including actual clipboard bytes verified by native paste, undo/redo, backward-selection dictionary insertion, no-keydown input, Clear-toast invalidation, and noncancelable boundary input. This is not a physical Apple device test.
- The separate WebKit origin-loss diagnostic again reloads and performs English lookup after the HTTP server is stopped. Its offline-emulation flag still fails on both minimal service-worker controls and the app; those historical failing assertions are retained.

The CI workflow now builds the app and runs the 21 editor cases and 19 dictionary checks in Chromium on every push/PR, in addition to the existing suite. Native Safari/iOS device checks and the known report-only orthographic coverage failures remain outstanding.

## Release checks

The production branch is `main`, and Vercel builds both the regular and kids editions from it. The owner authorized this release in the conversation. Branch compatibility checks use `git merge-tree` without modifying the working tree: the jolly-dijkstra branch merges cleanly; zealous-brown already conflicts with current main in its older rules, lexicons and reference/builder files. This editor change does not modify those files or import that branch.

Physical-device and linguistic follow-ups remain in `plan/06-owner-followups.md`. The browser event simulations and Linux WebKit evidence do not replace those checks.
