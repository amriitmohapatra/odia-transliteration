# 04 — Scope

The purpose of this file is to make it cheap to say no. When a tempting idea arrives
mid-build, check it against this list before acting on it.

---

## Not building — ever, for this project

| Excluded | Why |
|---|---|
| ~~Mobile keyboards (iOS / Android)~~ | **REOPENED 2026-10-04** (D-1, S-5 in `plan/05-v3-direction.md` §3). Android and iOS versions come after the desktop/web version. Original reason: entirely different platform work, and Gboard already does Odia on mobile. |
| ~~Odia → English reverse transliteration~~ | **REOPENED 2026-10-04 for pronunciation display only** (D-1, S-3). A romanized line under Odia text lets a non-reader say the word, in the read-back and the lens. Original reason: different problem, no demand from the use case at that time. |
| Spell-check or grammar checking | Enormous scope. No Odia hunspell dictionary exists to build on. |
| ~~Voice input or OCR~~ | **REOPENED 2026-10-04 through the opt-in assist layer** (D-1, D-2, S-4). Speech and OCR run in cloud services or in the browser, never inside `core/`. Original reason: different discipline entirely. |
| IndicXlit at runtime | fairseq + PyTorch as an app dependency is disqualifying for a "lightweight" tool. At most, someday, an offline data-augmentation run inside the build pipeline. |
| Notarized public distribution, auto-update, ~~a website~~ | **Website REOPENED 2026-10-04** (D-1, S-1): a static app on Vercel. Notarized distribution and auto-update stay excluded. Original reason: this is a personal tool, and distribution machinery is pure overhead. |
| ~~Cross-device sync~~ | **REOPENED 2026-07-26.** Excluded when the targets were macOS + Windows. Now that the goal is macOS + iOS, a word learned on the Mac should be known on the phone, and vice versa. Apple gives cheap options here (an App Group container plus iCloud key-value or CloudKit) that do not exist across a Mac/Windows split. Decide as part of the iOS stage, not before. |
| Any Keyman package | Keyman's desktop builds do not support candidate lists — that is the one feature that matters here. Its docs are explicit that predictive text is a mobile/touch feature. |

---

## Deferred — revisit only on demonstrated need

| Deferred | Note |
|---|---|
| Legacy Akruti / ShreeLipi / Sambad font conversion | Genuinely under-served for Odia and a real differentiator — Odia has an unusually large pre-Unicode newspaper and DTP legacy. But it is a **separate project**, not a feature of a typing tool. |
| Odia-numerals UI toggle | The ten-character map ships in `symbols.toml` on day one. Only the toggle UI is deferred. |
| Bigram / context-aware ranking | Would improve multi-word accuracy. Only worth it once unigram ranking is measured and found wanting. |
| User dictionary export / import | Trivial to add later. Nobody needs it on day one. |
| Candidate-window theming | Cosmetic. |
| SQLite learning store | Only if `userdict.json` exceeds about 1 MB, which would require tens of thousands of learned words. |
| Windows TSF input method (Stage E) | Gated on spike S1. Expected outcome: never built. |

---

## Deliberately excluded from the engine

**Any network call.** This was a decision, not an oversight.

Google's transliteration endpoint (`inputtools.google.com/request?...&itc=or-t-i0-und`)
was verified live during planning and returns excellent fuzzy results for Odia,
including multi-word input. It is also undocumented, unofficial, and could be changed or
blocked without notice.

It is not in this project. A dev-only script could sample it once to establish a quality
ceiling, but even that is unnecessary — Aksharantar's 4,256 held-out test pairs already
provide a gold standard.

**Still true after 2026-10-04.** Decision D-2 adds an opt-in online "assist layer" (voice,
read-aloud, sentence translation) as Vercel server functions. That layer is outside the
engine. `core/` stays offline and synchronous. Each online feature is off until the user
turns it on. See `plan/05-v3-direction.md` §4.

---

## The test for adding anything

Before adding a feature, answer both:

1. Would its absence stop you using the tool this week?
2. Can it be added later without redesigning anything?

If the answer is "no" then "yes", it goes in this file, not in the code.
