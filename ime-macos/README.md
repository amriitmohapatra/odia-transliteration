# macOS input method — spike S4

A minimal Odia input method. This is the thing that lets you type Odia **inline in Word,
Notes, Safari and anywhere else**, rather than composing in a separate window and pasting.

Right now it is a **spike, not the product**. It contains a five-word hardcoded lookup
table instead of the real engine. Its only job is to answer one question that no amount of
reading the docs could settle:

> Will macOS 26 load an input method that is only ad-hoc signed, built with a free Apple ID?

Apple's general guidance says signing to run locally is enough and that the $99/yr
Developer Program is only needed to notarize and distribute. But Keyman's own macOS build
docs claim signing *and notarization* are required even for local test builds in order to
interact with keyboard input. Those two statements cannot both be right, and the answer
decides whether a week and a half of Stage C work is viable.

## Status

| | |
|---|---|
| Compiles with Command Line Tools only, no Xcode project | ✅ verified |
| Ad-hoc signature valid, satisfies Designated Requirement | ✅ verified |
| Bundle size | 116 KB |
| Appears in Input Sources after install | ⬜ needs your logout |
| Actually receives keystrokes in Notes / Word | ⬜ needs your logout |

## Run the spike

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
