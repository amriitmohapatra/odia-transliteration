# 02 — Stages

**Goal: the app is ready and workable on macOS and iOS.**

Restructured 2026-07-26 when the target changed from macOS + Windows to macOS + iOS. Windows
TSF is deleted, not deferred. Each stage is independently useful and has a stated
success criterion.

---

## The shape of the answer

Two platforms, three surfaces, one engine.

| Surface | macOS | iOS / iPadOS | Reuses `engine.js`? |
|---|---|---|---|
| **Offline web app** (Stage B) | Safari, installable to Dock | Safari, Add to Home Screen | 100% |
| **Native system-wide input** | Input method, Stage C | Keyboard extension, Stage D | 100%, via JavaScriptCore |
| CLI (dev harness only) | yes | — | 100% |

The single fact that makes this work: **JavaScriptCore is a public system framework on both
macOS and iOS**, so a Swift input method or keyboard extension can run the same TypeScript
engine bundle with no FFI and no port. Verified on macOS 26 during planning.

The single fact that constrains it: **an iOS keyboard extension has a ~48 MB memory
ceiling.** That is why the data pipeline emits a pruned `lexicon-web.tsv` alongside the full
one. The pruned artifact is the iOS artifact.

---

## Stage A — Core engine, CLI, evaluation harness

**Status: in progress.** The critical path — nothing else can be judged until quality is
measurable.

- **A1 strict mode** — deterministic ITRANS from the MIT `oriya.toml`. Predictable, useful
  immediately, and a correctness oracle for the fuzzy engine.
- **A2 fuzzy engine** — segmenter, lexicon, ranking, learning.

**Success**: nukta vectors pass; strict mode matches the ITRANS checklist; held-out top-1
≥ 35% and top-5 ≥ 60%; everyday set top-3 ≥ 80%; `transliterateWord` under 5 ms.

---

## Stage B — Offline PWA  ← **this is what makes the goal true on both platforms**

**Status: in progress.**

One Vite-built static page that works in Safari on the Mac and, added to the Home Screen,
on iPhone and iPad. Fully offline via a service worker. Loads the **pruned** lexicon.

This is not a consolation prize for iOS. Per the research it is the correct phase-one
answer: zero App Store friction, zero sideloading, works in Singapore with no caveats, and
100% engine reuse. It also validates the linguistics before any native investment.

**iOS details that decide whether it is usable or merely present**: `viewport-fit=cover`
plus safe-area insets; inputs at ≥16px or Safari zooms on focus; `navigator.clipboard.writeText`
called **synchronously inside the tap handler** with no preceding `await`; a web app
manifest with real icons; `apple-touch-icon` and `apple-mobile-web-app-*` tags; touch
targets ≥44px.

**Success**: loads under 2 s; `kemiti achha` → `କେମିତି ଅଛ`; works with Wi-Fi off on both a
Mac and an iPhone; Copy actually pastes into Notes and WhatsApp.

---

## Stage C — macOS input method (IMK)

**Estimate**: ~5–10 elapsed days. **Gated on spike S4.**

Select "Odia Phonetic" from the menu bar and type Odia inline in any app. `OdiaPhonetic.app`
in `~/Library/Input Methods/`, `IMKCandidates` window, `EngineBridge.swift` hosting
JavaScriptCore over the same `engine.js`.

References: `azooKey/azooKey-Desktop` (Swift, MIT), `ensan-hcl/macOS_IMKitSample_2021`
(skeleton), `rime/squirrel` (battle-tested).

**Success**: inline typing in Notes, Word and Safari; latency imperceptible; survives
logout; dictionary shared with the other surfaces.

---

## Stage D — iOS keyboard extension

**Estimate**: ~8–15 elapsed days. **Gated on spikes S5 and S6.** The hardest stage, and the
one with real external dependencies.

A `UIInputViewController` in Swift, hosting JavaScriptCore with `engine.js` and the pruned
lexicon, with a candidate bar above the keys. Study `KeyboardKit` (MIT core) rather than
starting from a bare `UIInputViewController`.

Constraints that are not negotiable, all verified:

- **~48 MB memory ceiling.** The pruned lexicon (~1–1.5 MB on disk) is the target; the full
  one is not viable in-extension. For comparison, Swalekh Flip — a shipping Odia phonetic
  keyboard on the App Store — is 5.9 MB total, for exactly this reason.
- **JavaScriptCore is interpreter-only.** Not an extension restriction — it applies to every
  third-party process on iOS, main apps included. Fine for hash and binary-search lookups,
  which is all this engine does in its hot path. Measure anyway (S5).
- **App Store guideline 4.4.1 requires the keyboard to work fully without Full Access.** So
  the keyboard must be self-sufficient. Dictionary sharing with a containing app needs an
  App Group, which needs Full Access *and* a paid developer account — that makes sync an
  optional enhancement, never a dependency.
- **React Native, Capacitor and Flutter are confirmed dead ends** for the extension itself.
  The JS bridge alone exceeds the ceiling. Native Swift only.

**Success**: type Odia inline in Messages, Notes and Safari on the phone; no Jetsam kills
under sustained typing; works with Full Access off.

### Stage D-lite — a standalone iOS app (optional intermediate)

An ordinary SwiftUI app is **not** subject to the extension memory ceiling — it gets the
same hundreds-of-MB budget as any foreground app. So a small native app embedding
JavaScriptCore and the **full** lexicon is a weekend-scale step that gives an app icon,
better feel than a bookmarked page, and zero memory anxiety. Consider it if the PWA proves
the concept but feels insufficient and Stage D is not yet worth starting.

---

## ~~Stage E — Windows TSF~~ — **deleted**

Windows is no longer a target platform, and Windows 11 already ships a built-in Odia
Phonetic IME. Removed rather than deferred.

---

## Distribution reality (Singapore)

This determines when the $99/yr Apple Developer Program becomes unavoidable.

| Path | Cost | Limits |
|---|---|---|
| PWA / Home Screen | free | none — no Apple involvement at all |
| Free Apple ID sideload | free | **7-day** profile expiry, 3 apps, needs Xcode + cable. No App Groups. |
| Apple Developer Program | $99/yr | 1-year profiles; TestFlight (100 internal / 10,000 external, 90-day build expiry, light first-build review); **App Groups require this** |
| App Store | $99/yr | Full review. Precedent is good — several Odia phonetic keyboards are live. Not needed for personal use. |

**AltStore PAL and EU DMA sideloading do not help** — they are limited to the EU, Japan and
Brazil. Singapore is not covered. AltStore Classic works but is just the same 7-day free
certificate mechanism with nicer refresh UI.

So: Stages A–C need no Apple money. **Stage D effectively requires the $99/yr membership**
once you want it on your phone for longer than a week at a time. That is spike S6.
