# Odia Lens for Mac (owner testing only)

A see-through frame that floats over every app: Safari, Preview, a PDF, a YouTube
video, a photo. Move it over Odia and let go: the panel under it shows each line it read
and each word with its meaning. It is the Mac version of the browser lens's frame
(`lens/`), built like the reference app
[Translation-Lens-MacOS](https://github.com/cristaecooks/Translation-Lens-MacOS)
(ideas only: no code copied).

**Not for sharing yet.** Ad-hoc signed, no installer, not notarized.

## Build and open

Once, in Terminal:

```bash
brew install tesseract      # the program that reads the text (Apache-2.0)
cd <the repository>
npm install                 # once, for the results page
```

Then:

```bash
cd mac-lens
./build.sh --open
```

1. The first time, macOS asks for **Screen Recording** permission (System Settings >
   Privacy & Security > Screen & System Audio Recording). Turn on **Odia Lens**, then quit
   it (menu bar **ଓ** > Quit) and open it again: `open build/OdiaLens.app`.
2. **After every rebuild macOS asks again**: an ad-hoc signature changes with each build,
   and macOS treats it as a new app. Remove the old entry in that settings list and allow
   the new one.
3. **Point mode** (below) needs **Accessibility** permission too (System Settings > Privacy
   & Security > Accessibility). macOS asks the first time you turn point mode on; the same
   rule applies: after a rebuild, remove the old entry and allow the new one.

## Use

- The indigo bar with the Konark wheel: drag to move the frame. Its buttons: **Word**,
  **Line**, **Para** (sizes), **↻** read again, **✕** hide (show again from the menu bar).
- Any edge or corner of the red-and-yellow border: drag to resize. Let go: it reads after
  a third of a second. The wheel turns while it reads. (The edges catch the mouse through
  a faint ring drawn around the border: macOS sends clicks on fully clear pixels to the
  app below. If an edge does not grab, tell Claude: the ring's alpha in
  `FrameWindow.swift`, now 0.02, goes up. The corner diamonds are solid and always grab.)
- The menu bar item **ଓ**: show or hide the lens, frame sizes (Word, Line, Para,
  also ⌘1–⌘3 while the menu is open), Read again, Quit.
- **Point at words in any app** (menu bar **ଓ**, ⌘P while the menu is open): rest the
  pointer on an Odia word in Notes, Pages, TextEdit, Mail, Word, PowerPoint, Preview, Safari
  or Chrome, and a card opens beside it. This reads the app's own text (the way macOS's
  Look Up does), so the word is exact: no OCR. Apps that do not tell macOS their text, and
  pictures, show no card: use the frame for those. Choose the item again to stop.
- In the panel: each line as it was read ("Read: …"), then each word with its first
  meaning. Click a word for its full card. Words read with the word before them, so phrases
  like "-କୁ ନେଇ" get their phrase meaning.
- The top line of the panel says what worked: **Dictionary** (ready, or why not), **OCR**
  (the tesseract version, or the error), then the last reading. If something does not
  work, send that line.

## If the lens does not show

- The lens has no Dock icon. **✕** only hides it; the app keeps running. Open it again
  (`open build/OdiaLens.app`, or double-click it in Finder) and the frame comes back.
- The menu bar item **ଓ** can be hidden behind the camera notch when the menu bar is full.
  Quit some menu bar apps, or hold ⌘ and drag other icons out to make room.
- To stop it completely: `killall OdiaLens` in Terminal.
- **"No permission to read the screen" although the switch is on:** macOS still holds the
  permission of an earlier build. Reset it, then allow again when macOS asks:

  ```bash
  killall OdiaLens; tccutil reset ScreenCapture in.odiatransliteration.lens
  open build/OdiaLens.app
  ```

## How it works

| Part | Does |
|---|---|
| `Sources/FrameWindow.swift` | The frame: a borderless, see-through floating panel in the Puri/Konark theme; bar to drag (with buttons), every edge and corner resizes; tells the app when it stops moving. |
| `Sources/Capture.swift` | The pixels under the frame (ScreenCaptureKit `SCScreenshotManager`, macOS 14+), without the lens's own windows. |
| `Sources/OCR.swift` | Runs `tesseract` (Homebrew) with the Odia model packed in the app (`ori.traineddata`, this project's fine-tune of tessdata_best, Apache-2.0; `lens/PROVENANCE.md`); reads its TSV: words, boxes, confidence. Small captures are doubled first. |
| `Sources/ResultsPanel.swift` | A web view with the results page; serves the page and its dictionary files from the app (`odialens://app/`). |
| `Sources/PointReader.swift` | Point mode: the text around the pointer through the Accessibility interface (`AXUIElementCopyElementAtPosition`, then the range for the position, the string for ±60 characters, and the character's bounds). Its own windows are skipped. |
| `Sources/CardPanel.swift` | The card beside the pointer: the same page loaded as `index.html#card`; it finds the word and the word before it (`word.ts`) and shows the card. |
| `lens/src/mac.ts` | The results page: the browser lens's own correction, splitting, lookup and list (`correct.ts`, `engine.ts`, `frameview.ts`). |

Nothing goes over the network. No Desh data is in the app.

## Limits

- macOS 14 (Sonoma) or later; Apple silicon or Intel.
- OCR quality is the stock Tesseract Odia model's: good on clean print and most
  headlines, weaker on small or decorated newspaper print (own model: PLAN V4.3).
- Built and syntax-checked in the cloud, where AppKit does not exist: the first build on
  the Mac is its first real compile. Send any compiler error as it is.
