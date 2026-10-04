# 00 — Overview

## The problem

There is no good way to type Odia phonetically on macOS.

Windows 11 ships a built-in, offline "Odia Phonetic" IME (ISO-15919 based, with
suggestions, toggled with Win+Space). macOS 26 ships only Odia **InScript** — a
key-position layout that requires memorising where each character sits. Every
cross-platform alternative is browser-only, Windows-only, closed-source, ad-supported,
or quietly dependent on an undocumented Google endpoint.

## The goal

A personal tool that converts phonetically-typed Latin into Odia and gets that text
into whatever application is in front of you — Word, Notes, a browser, Slack.

```
kemiti achha   →   କେମିତି ଅଛ
```

Constraints, in priority order:

1. Works with **no network connection**.
2. Works on **macOS and iOS** — see the goal below.
3. Works **inside other applications**, not just its own window.
4. Stays small enough that one person can maintain it.

## Stated goal (2026-07-26)

> The app should be ready and workable for both macOS and iOS.

This **supersedes the original macOS + Windows framing** and changes three things:

- **Windows TSF (old Stage E) is dead**, not merely deferred. Windows 11 already ships a
  built-in Odia Phonetic IME, and Windows is no longer a target platform. Delete the
  stage rather than leaving it gated on a spike.
- **The macOS input method is promoted** from a gated stretch goal to half the deliverable.
- **iOS becomes a first-class stage**, not an exploration. An iOS keyboard extension has
  hard constraints a desktop app does not — a tight memory ceiling and restrictions on
  JavaScriptCore outside the main app process — and those constraints may reach back and
  change the engine design. Resolve them before committing to the iOS stage.

The Tauri desktop composer keeps its place as the fastest route to something usable on
the Mac, but it is now a stepping stone rather than the cross-platform answer.

One consequence to revisit: with two Apple devices in scope, **sharing the learned user
dictionary between Mac and iPhone stops being a luxury**. A word taught on one device
should be known to the other. See `plan/04-scope.md`, where sync was previously excluded.

## Decisions

These were settled during planning. Revisit them only with a stated reason.

| Decision | Choice | Consequence |
|---|---|---|
| Engine | **Offline only** | No network call ever from the shipped app. No dependency that can vanish. The engine is the critical path — there is no shortcut to a usable v1. |
| First shipped version | **Desktop popup composer, both OSes** | Global hotkey → floating window → type roman → pick candidate → pastes into the app you were in. One codebase, no OS input-method plumbing. |
| Core language | **TypeScript**, linguistic rules in editable TOML | Node 25 already installed; nothing new to set up. Reaches every target including a native macOS input method. |
| Windows | **Evaluate the built-in Odia Phonetic IME before writing any Windows code** | Likely saves weeks. See spike S1. |

### Why TypeScript reaches a native macOS input method

This is the load-bearing finding of the whole plan.

macOS ships `JavaScriptCore.framework` as a public system framework. A Swift input
method can load and call the same `engine.js` bundle — no FFI, no WebAssembly, no Rust
toolchain, no cross-compilation.

Verified on this machine, macOS 26.5.2:

```swift
import JavaScriptCore
let ctx = JSContext()!
ctx.evaluateScript("function xlit(s){ return s.replace('odia','ଓଡ଼ିଆ'); }")
ctx.objectForKeyedSubscript("xlit").call(withArguments: ["odia bhasha"])
// → "ଓଡ଼ିଆ bhasha"
```

One engine serves all four targets:

| Target | How it loads the engine |
|---|---|
| CLI | direct import |
| Web page | direct import |
| Tauri desktop app | direct import |
| macOS input method (Swift) | JavaScriptCore |

Rust survives in exactly one place: roughly 150 lines of clipboard and hotkey glue
inside the Tauri shell, written once and never touched again.

## Verified facts this plan rests on

- **Aksharantar** (`ai4bharat/Aksharantar` on HuggingFace) — `ori.zip`, **9.5 MB,
  ungated, public**, CC-BY/CC0. ~346K Odia romanized↔native word pairs (train), 3K
  valid, 4,256 test. This is the lexicon.
- **IndicCorp v2** (`ai4bharat/IndicCorpV2`, config `ory_Orya`) — CC0 Odia monolingual
  corpus, for word-frequency ranking.
- **`indic-transliteration/common_maps`** `brahmic/oriya.toml` — **MIT**, actively
  maintained, complete Devanagari↔Odia character map. Fetched and confirmed. Seeds the
  strict-mode table.
- **Google's Dakshina dataset does *not* include Odia** (12 languages, Odia absent).
  Aksharantar is the only large romanization lexicon available for this language.
- **No Odia hunspell/aspell dictionary appears to exist.** Word frequencies must be
  derived from IndicCorp.
- **macOS InputMethodKit is not deprecated** and works on macOS 26. Bundle ID must
  contain the literal substring `inputmethod`; installs to `~/Library/Input Methods/`
  with no admin rights.
- **AI4Bharat IndicXlit** (11M-param transformer, MIT) reaches **58.9% top-1** on Odia
  native words, 30.6% on named entities. This is the realistic ceiling reference.

## Licensing discipline

Everything shipped derives from MIT / CC0 / CC-BY sources. The project is MIT.

**Varnam/govarnam and Aksharamukha are AGPL.** Their architecture is worth studying —
Varnam's weighted symbol table plus learned dictionary is exactly the right shape — but
**copy no code from either**. Record every data source, its licence and a checksum in
`core/data/PROVENANCE.md`.

## Definition of success

Two things, both concrete:

1. You compose an Odia message inline on your Mac — in Notes or Word — with candidates,
   without opening a browser.
2. When a transliteration is wrong, you fix it by editing one line of
   `core/rules/symbols.toml` and `npm run eval` confirms no regression elsewhere.

The second matters as much as the first. A tool you cannot tune is a tool you will
abandon the first time it gets a common word wrong.
