# Handoff — Odia app, 12 October 2026

## Current goal and release status

The owner asked for a critical interface/dictionary review, an initial English →
Odia dictionary, then direct implementation and deployment to Vercel. During
release preparation they added phone usability: fonts were too large, the editor
was obscured, and typing was difficult. They requested this durable handoff.

- Repository: `amriitmohapatra/odia-transliteration`.
- Working branch: `codex/editor-reliability-12oct2026`.
- PR: https://github.com/amriitmohapatra/odia-transliteration/pull/5.
- This handoff is committed with the final PR #5 release candidate. The linked PR
  and its merge commit are the authoritative live release status; verify them
  before repeating a merge or deployment in another chat.
- Earlier editor implementation: `1032daa`; source research follow-up: `cfa5d38`.
  The final commit of PR #5 adds the phone layout, browser suite and this handoff.
- Previous production baseline: merge `5ba8761` of PR #4 (initial dictionary/review).
- Production sites: https://odia-transliteration-web.vercel.app and
  https://odia-phonetic-kids.vercel.app. Vercel deploys both from `main`.
- The owner explicitly authorized implementing and releasing changes. Complete
  checks and merge the reviewable PR; do not ask again for routine release approval.

## Implemented and tested before the phone follow-up

- English dictionary: 70 entries / 62 terms, separate meanings and loan spellings,
  visible review labels. 64 entries remain proposals needing native review.
- Insert Odia now replaces the saved editor selection and participates in undo.
- New `Appv2/src/editor-state.ts` and `editor.ts` own literal ranges, selections,
  composition, and bounded in-memory undo/redo for native and scripted edits.
- URLs, email addresses, domains, acronyms and alphanumeric identifiers stay
  literal. Paste and Keep/Escape choices stay literal through edits and undo.
- Ordinary digits are content; Alt/Option+number selects candidates. Left/Right
  moves the caret; Up/Down chooses candidates. Space commits with a space, Enter
  with a newline, Tab without a separator.
- Copy/Share visibly finishes only the eligible current token, then copies the
  document. Selected native Copy remains exact. Reads as reflects actual text.
- Candidate commits, dictionary/palette insertion and Clear use shared history.
  Clear's Undo toast invalidates after a later edit.
- Cancelable and noncancelable mobile boundary events are covered. Strict ITRANS,
  typed Odia digits, smart quotes/danda and existing Sanskrit shorthand survive.
- No new linguistic rules, ranking weights, dictionary rows or corpus imports.

## Dedicated phone layout

- The same URL selects a phone/coarse-tablet layout; no separate mobile deployment.
- `main.ts` exposes visual viewport dimensions/offsets to CSS and toggles a focused
  writing view. Intro, modes, palette and readback return after Done.
- `style.css` replaces the 132% Odia Box enlargement on phones with unscaled Noto
  Sans Oriya at 18px by default; Large/XL preferences still apply. First-run copy
  is shortened so a 320px phone initially shows the editor above the fold.
- `inline.ts` measures the compact dock, keeps the editor above it and scrolls
  the caret inside the editor. Manual scrolling through long messages is retained.
- Dictionary lookup is explicit, modal on phones and fitted to the visual
  viewport. Results scroll; background is inert; Tab focus stays in the dialog.
  Back to typing and Insert restore editing. Generic dismissal avoids reopening
  a dismissed keyboard. Desktop retains its meanings column.
- New `mobile-check.mjs` checks geometry, touch targets, larger text, selection
  insertion, focus and simulated keyboard viewport changes. CI runs this suite.
- These browser simulations do not establish physical iPhone/iPad or VoiceOver
  behavior. No native app or iOS keyboard extension was created.

## Verification and commands

Editor baseline: 178 core + 73 Appv2 unit tests, 58 fallback checks, 21 editor
Chromium cases, 19 dictionary Chromium checks, six Linux WebKit editing scenarios,
and the existing regression/origin/context/report checks passed. Typecheck, build,
rule generation and theme checks passed. Engine accuracy remained unchanged.

```bash
npm test
npm run typecheck --prefix Appv2
npx tsx Appv2/scripts/gen-rules.ts --check
node Appv2/eval/check-theme.mjs
npx vite build --config Appv2/vite.config.ts
python3 -m http.server 4825 --bind 127.0.0.1 --directory Appv2/dist
# In another terminal:
NODE_PATH=/workspace/onboarding-tools/node_modules CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node Appv2/eval/browser/editing-check.mjs 4825
NODE_PATH=/workspace/onboarding-tools/node_modules CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node Appv2/eval/browser/english-check.mjs 4825
WEBKIT_EXECUTABLE_PATH=/workspace/onboarding-tools/webkit-launch.sh python3 Appv2/eval/browser/editing-webkit.py 4825
NODE_PATH=/workspace/onboarding-tools/node_modules CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node Appv2/eval/browser/mobile-check.mjs 4825
```

The final phone matrix passed **193/193 assertions**, including long-message
scrolling, modal focus/inert restoration, Done, keyboard dismissal, offsetTop 140
and landscape with 230px of visible height. On the final phone production build,
21 editor, 19 dictionary and six Linux WebKit editing scenarios passed again;
Appv2 typecheck, theme guard and build also passed.

New Chromium checks also accept `APP_URL` for production verification. CI runs
the editor, dictionary and phone browser checks in its `editor-browser` job alongside
the existing `check` job. Do not treat a previously green PR revision as proof
that later phone changes passed.

## Known limits and useful evidence

- Read `AGENTS.md`, `PLAN.md` and `ARCHITECTURE.md`. Odia nukta remains decomposed;
  TypeScript Odia literals use Unicode escapes. Engine stays offline.
- `codex_review_12Oct2026.md` is the review; the historical baseline observations
  remain there. `plan/research/2026-10-12/EDITOR-IMPLEMENTATION.md` records the fixes.
- The new WebKit editing checks pass. Playwright's WebKit offline flag fails even
  for minimal service workers; actual server shutdown permits cached reload and
  lookup. Do not call this an iPhone airplane-mode test.
- Native macOS/iOS plugin capabilities were not exposed; no Xcode/Simulator is
  available. Phone hardware and native-speaker review remain owner follow-ups:
  `plan/06-owner-followups.md`.
- Orthographic coverage has 18 existing report-only failures. Legacy `web/`
  typecheck has an existing unused-variable error; main Appv2 typecheck passes.
- Both requested Hugging Face datasets remain manually gated (raw HTTP 401).
  Kaikki/IndoWordNet were sampled; source licensing, alignment and quality need
  review before importing. Do not blindly reverse historical glosses or ship
  NC/share-alike data as MIT. No sampled corpus was bundled.
- Before pushing, repository instructions request trial merges of the two older
  Claude branches. `jolly-dijkstra-4p8v4w` is clean; `zealous-brown-hpenqp` has
  eight pre-existing conflicts in linguistic data/rules/reference/builder files.
  Use `git merge-tree --write-tree` to inspect without modifying the worktree.

## Claude review, 12 October 2026 (after PR #5)

- Re-ran on merged `main` (adult and kids builds): 178 core + 74 Appv2 unit tests, 58 fallback
  checks, evals unchanged (held-out 25.3/36.8), editing 21/21, English 19/19, phone 193/193,
  regress, gloss, origin, context, kids and report checks pass. Typing latency unchanged (freeze).
- `report-check.mjs` now presses Done first: on phones the read-back row is hidden while typing.
- **Open, HIGH:** `editor.ts` `acceptInput` marks all composition text literal, and the bar hides
  while composing. A composing Latin keyboard (Gboard) therefore gets no suggestions and the
  word stays Roman after Space. Confirmed in Chromium with CDP `Input.imeSetComposition`
  (`4a3a85e` converts, `d4e941b` does not). Needs an Android check (`plan/06` A-5).
- **Open, MEDIUM:** Escape now calls `keep()`, so the word stays English permanently; Help names
  only Keep. **LOW:** family-safe switch not passed to English lookup (canary test added in
  `Appv2/test/english.test.ts`); Try example before the engine loads leaves Roman text.

## Resuming in another chat

1. Check `gh pr view 5 --json state,mergeCommit,headRefOid,url` and `git status`.
   If merged, start new work from current `origin/main`; do not repeat this release.
2. Verify GitHub deployments for that merge SHA, then load both production URLs.
   CI checks on a previous revision do not validate later changes.
3. For phone hardware, test Safari with the actual keyboard, rotation, long-text
   scrolling, Back to typing, insertion, Copy and larger text/VoiceOver. Linux
   emulation and the configured environment do not provide Xcode or Simulator.
4. For language quality, review the 64 proposed English entries and collect
   consented everyday Roman Odia messages with accepted outputs before changing
   ranking or importing corpora. See `plan/06-owner-followups.md` and the review.
5. Keep updating this file with later edits, exact check results and release state.

The owner authorized this release. The remaining release procedure for the PR's
final candidate is: wait for CI and both previews, merge the checked head SHA,
verify both production deployments, and run live editor/dictionary/phone checks.
Use the PR/deployment records to distinguish completed steps from pending ones.

