# Odia Lens for Windows (V4.9, owner testing only)

The Odia Lens as a Windows app: a see-through frame over any app reads the Odia under it
(screen capture + Tesseract OCR), and **point mode** reads the word under the pointer in
apps that expose their text (Word, Notepad, WordPad, Edge, Chrome, many PDF readers)
through Windows UI Automation: exact text, no OCR. Same Puri/Konark look, the same word
cards and the same dictionaries as the browser lens and the Mac lens (`mac-lens/`).

Not for public sharing yet (like `mac-lens/`). **Compiled, never run:** it was built and
checked in the cloud (Linux, .NET 8 with Windows targeting); its first run is on a
Windows PC. Send any error message or the panel's top status line.

## What you need on the PC

1. Windows 10 (version 2004 or later) or Windows 11.
2. **.NET 8 Desktop Runtime** (free, Microsoft): https://dotnet.microsoft.com/download/dotnet/8.0
   → ".NET Desktop Runtime 8" for x64. (Windows 11 may already have it.)
3. **Microsoft Edge WebView2 Runtime**: already on Windows 11 and on up-to-date Windows 10.
4. **Tesseract OCR** for the frame (not needed for point mode): the UB Mannheim installer,
   https://github.com/UB-Mannheim/tesseract/wiki. The app finds it on the PATH or in
   `C:\Program Files\Tesseract-OCR`. The Odia model comes with the app.

## Run the ready build

Unzip `odia-lens-windows.zip` (from Claude) into a folder, then run `OdiaLens.exe`. An **ଓ**
icon appears in the notification area (near the clock).

## Build it yourself

```powershell
npm install
node lens/build.mjs --mac        # the shared page and dictionary (mac-lens/build/web)
cd win-lens
dotnet publish -c Release -r win-x64 --self-contained false -o publish
publish\OdiaLens.exe
```

(The .NET 8 SDK is needed to build: https://dotnet.microsoft.com/download/dotnet/8.0.)

## Use

- The indigo bar with the Konark wheel: drag to move the frame. **Word**, **Line**, **Para**
  (sizes), **↻** read again, **✕** hide. Any edge or corner: drag to resize. It reads when
  it stops moving; the wheel turns while it reads. The results panel shows each line as
  read, each word with its meaning; click a word for its card.
- The **ଓ** icon: left-click shows or hides the lens; right-click for the menu: frame
  sizes, Read again, **Point at words in any app**, Quit.
- **Point at words in any app:** rest the pointer on an Odia word in Word, Notepad, Edge,
  Chrome or a PDF reader: a card opens beside it. Apps that do not expose their text, and
  pictures, show no card: use the frame for those.

## How it works

| File | Does |
|---|---|
| `src/LensApp.cs` | Tray icon and menu; reads the frame when it settles; point mode (pointer polled every 0.1 s, read after a 0.35 s rest). |
| `src/FrameWindow.cs` | The frame: a transparent, topmost WPF window; themed bar, border, corner marks; grips on every edge and corner. |
| `src/Capture.cs` | The pixels inside the frame (`CopyFromScreen`); the lens's windows ask Windows to stay out of captures (`SetWindowDisplayAffinity`, `WDA_EXCLUDEFROMCAPTURE`). |
| `src/Ocr.cs` | Runs `tesseract.exe` with the packed `ori.traineddata`; reads its TSV. |
| `src/PointReader.cs` | UI Automation: the element under the pointer, its text pattern, the line of text and the pointer's offset in it. |
| `src/WebPanel.cs` | WebView2 windows with the shared page (`lens/src/mac.ts`) from the app's `web` folder (`https://odialens.app/`, a local mapping: nothing goes over the network): the results panel and the card. |

Nothing goes over the network. No Desh data is in the app.

## Limits

- Untested on Windows (no Windows machine in the cloud): the first run may show an error;
  send it as it is.
- Point mode depends on each app's UI Automation support: Word, Notepad, Edge and Chrome
  give their text; some apps give nothing.
- OCR quality is the stock Tesseract Odia model's (own model: PLAN V4.3).
