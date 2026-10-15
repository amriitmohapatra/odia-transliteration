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
- In the panel: each line as it was read ("Read: …"), then each word with its first
  meaning. Click a word for its full card. Words read with the word before them, so phrases
  like "-କୁ ନେଇ" get their phrase meaning.
- The top line of the panel says what worked: **Dictionary** (ready, or why not), **OCR**
  (the tesseract version, or the error), then the last reading. If something does not
  work, send that line.

## How it works

| Part | Does |
|---|---|
| `Sources/FrameWindow.swift` | The frame: a borderless, see-through floating panel in the Puri/Konark theme; bar to drag (with buttons), every edge and corner resizes; tells the app when it stops moving. |
| `Sources/Capture.swift` | The pixels under the frame (ScreenCaptureKit `SCScreenshotManager`, macOS 14+), without the lens's own windows. |
| `Sources/OCR.swift` | Runs `tesseract` (Homebrew) with the Odia model packed in the app (`ori.traineddata`, tessdata_fast, Apache-2.0); reads its TSV: words, boxes, confidence. Small captures are doubled first. |
| `Sources/ResultsPanel.swift` | A web view with the results page; serves the page and its dictionary files from the app (`odialens://app/`). |
| `lens/src/mac.ts` | The results page: the browser lens's own correction, splitting, lookup and list (`correct.ts`, `engine.ts`, `frameview.ts`). |

Nothing goes over the network. No Desh data is in the app.

## Limits

- macOS 14 (Sonoma) or later; Apple silicon or Intel.
- OCR quality is the stock Tesseract Odia model's: good on clean print and most
  headlines, weaker on small or decorated newspaper print (own model: PLAN V4.3).
- Built and syntax-checked in the cloud, where AppKit does not exist: the first build on
  the Mac is its first real compile. Send any compiler error as it is.
