# 04 — Scope

The purpose of this file is to make it cheap to say no. When a tempting idea arrives
mid-build, check it against this list before acting on it.

---

## Not building — ever, for this project

| Excluded | Why |
|---|---|
| Mobile keyboards (iOS / Android) | Entirely different platform work. Gboard already does Odia on mobile. |
| Odia → English reverse transliteration | Different problem, no demand from the actual use case. |
| Spell-check or grammar checking | Enormous scope. No Odia hunspell dictionary exists to build on. |
| Voice input or OCR | Different discipline entirely. |
| IndicXlit at runtime | fairseq + PyTorch as an app dependency is disqualifying for a "lightweight" tool. At most, someday, an offline data-augmentation run inside the build pipeline. |
| Notarized public distribution, auto-update, a website | This is a personal tool. Distribution machinery is pure overhead. |
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

---

## The test for adding anything

Before adding a feature, answer both:

1. Would its absence stop you using the tool this week?
2. Can it be added later without redesigning anything?

If the answer is "no" then "yes", it goes in this file, not in the code.
