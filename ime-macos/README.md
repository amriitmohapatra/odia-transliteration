# macOS input method (V5, Stage C)

Type Odia **inline in Word, Notes, Safari and any other app**: select "Odia Phonetic" in
the menu bar, type `kemiti achha`, and the words appear as କେମିତି ଅଛ, with a numbered list of
alternatives under the word.

It runs **the same engine and the same data as the website's "Everyday" mode**, through
JavaScriptCore (a macOS system framework). No network.

## How it is built

| File | Does |
|---|---|
| `js/composer.ts` | All key handling, as a pure state machine (unit-tested): letters build the word and the best Odia word shows underlined; Space or Enter takes the highlighted word; 1–9 take a numbered one; Up/Down/Tab move the highlight; Escape keeps the English letters; Backspace edits; punctuation commits the word first, and `\|` types the danda. The previous word is the context for the next. |
| `js/bridge.ts` | Builds the engine like `Appv2/src/engine.ts` (profile `unified`) from file contents and defines `OdiaIME` (`load`, `key`, `flush`, `learned`). Plain ECMAScript: no `fetch`, `TextDecoder` or `atob`. |
| `build.mjs` | Bundles `js/bridge.ts` into `build/stage/engine.js` (one classic script) and stages the data files in `build/stage/data/` (the converter as base64). |
| `Sources/EngineBridge.swift` | A `JSContext`: runs `engine.js`, reads `Resources/data/` and calls `OdiaIME.load`; saves the user's choices in `UserDefaults`. |
| `Sources/OdiaInputController.swift` | Turns key events into composer keys and applies the answer: commit text, underlined word, candidate window (`IMKCandidates`). |
| `Sources/main.swift` | The `IMKServer`, the candidate window, and the engine loaded at start. |
| `test/` | `composer.test.ts` (keys) and `bundle.test.ts` (the built `engine.js` in a bare JavaScript context: types `kemiti achha`, keeps the nukta decomposed, learns). `npx vitest run --root ime-macos`, part of `npm test`. |

The TypeScript is tested in the cloud. **The Swift is not compiled there** (no Swift
compiler on Linux): the first build is on a Mac (follow-up A-12).

## Build and install (on a Mac)

```bash
npm install                      # at the repository root, once (esbuild)
cd ime-macos && ./build.sh --install
```

`build/` is not committed: it holds copies of the data files, including the Desh-derived
`typed.tsv`, `nextword.tsv` and converter (see `core/data/PROVENANCE.md`).

## First run (spike S4, still open)

```bash
./build.sh --install
```

Then log out and back in — macOS only scans for input methods at login, so this step is
unavoidable. After logging back in:

1. System Settings → Keyboard → Text Input → Input Sources → Edit → **+**
2. Choose **Odia** → **Odia Phonetic**
3. Switch to it with Ctrl+Space
4. Open Notes and type `odia` then space

Expected: **ଓଡ଼ିଆ**

Also try `odisha`, `namaskar`, `bhala`, `paani`. Anything not in the table commits the roman
text unchanged, which is correct spike behaviour.

Then test the same thing in Microsoft Word, which is the app most likely to misbehave.

To remove it:

```bash
rm -rf ~/Library/Input\ Methods/OdiaPhonetic.app
```

## Recording the result

Write what happened into `plan/03-spikes.md` under "S4". If it fails, record *how* — whether
it never appeared in Input Sources, or appeared but swallowed keystrokes. That distinction
determines whether a paid Developer ID signature would fix it.

## What happens after S4 passes

The structure of `OdiaInputController.swift` stays. Two things change:

- `stubTable` is replaced by `EngineBridge.swift`, which hosts JavaScriptCore running the
  real `core/dist/engine.js` — the same bundle the web app and the future iOS keyboard use.
- A candidate window (`IMKCandidates`) is added, so ambiguous input offers a ranked list
  instead of committing the first guess.

## Notes for whoever touches this next

- The bundle identifier **must** contain the literal substring `inputmethod`. macOS uses it
  to recognise the bundle as an input method; rename it and the whole thing silently stops
  working.
- `IMKServer` must be retained for the process lifetime. If it is deallocated the input
  method goes quiet with no error — a genuinely confusing failure mode.
- The controller is declared `@objc(OdiaInputController)` so that Swift's module-qualified
  name does not break the `InputMethodServerControllerClass` lookup in `Info.plist`.
- Nukta characters in the stub table are written as escapes (`\u{0B21}\u{0B3C}`) rather than
  literals, so the decomposed form is visible in the source and cannot be silently
  "corrected" by an editor. Same invariant as everywhere else in this project.
- Console will log `+[IMKClient subclass]: chose IMKClient_Legacy` on macOS 15+. Documented
  noise, not a fault. Ignore it.
- Debugging is unpleasant: the process must be killed and relaunched on every change
  (`killall OdiaPhonetic`), and `os_log`/`NSLog` is the only real instrumentation.
