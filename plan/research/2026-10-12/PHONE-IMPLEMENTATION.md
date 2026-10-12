# Phone implementation — 12 October 2026

The owner reported oversized fonts, an obscured editor and difficulty typing on
Vercel. A dedicated responsive phone view now uses the same web app and URL.

## Evidence and changes

The baseline 320px first visit left about 16px of editor visible. The old Odia Box
font enlarged glyphs by 32%; the candidate dock consumed 128px. The initial mobile
matrix passed 85/115 assertions on that baseline and 115/115 after the layout fix.

`main.ts` and `style.css` now fit a compact composing view to `visualViewport`.
Unscaled Noto Sans Oriya starts at 18px; Large/XL remains available. On focus,
introductory content disappears; Done restores it. The dock uses one horizontal
candidate row plus Copy, lookup and Done. Shortened first-run copy leaves a
visible editor before focus. No extra mobile deployment is required.

`dictionary/overlay.ts` and its CSS provide explicit phone lookup, bounded to 90%
of the visible viewport and 520px maximum. The dialog makes the background inert,
contains Tab focus and has Back to typing. Results scroll. Insertion restores the
saved selection. Generic dismissal avoids reopening a dismissed keyboard and
restores a visible non-text control after layout settles. Desktop keeps its
sticky meanings column.

Independent review found two regressions during implementation: scroll events
snapped long text back to the caret, and hidden controls lost focus after Done or
Escape in short viewports. Both were fixed and independently retested. Persistent
browser checks cover those behaviors.

## Final validation

- `mobile-check.mjs`: 193/193 assertions on the final production build, including
  320/390/430px phones, 844px landscape, first visit, XL text, modal focus/inert,
  selection insertion, manual long-document scrolling and simulated keyboard
  viewports (offsetTop 140 and 230px landscape visible height included).
- Existing Chromium editor 21/21 and English dictionary 19/19 checks passed again.
- Linux WebKit editing 6/6 scenarios passed again.
- Appv2 typecheck, production build, theme guard and diff whitespace checks passed.
- Prior editor verification: 251 unit tests, 58 fallback checks; engine accuracy
  unchanged. CI reruns unit/evaluation checks and all three Chromium suites.

Keyboard geometry uses a test-only visualViewport mock, not an actual software
keyboard. Physical iPhone/iPad rotation, keyboard animation, touch selection and
VoiceOver remain owner checks. This is a responsive browser composer, not an iOS
keyboard extension. Linguistic data, rankings and dictionary seed coverage did
not change in this phone follow-up. See `handoff.md` for release continuation.
