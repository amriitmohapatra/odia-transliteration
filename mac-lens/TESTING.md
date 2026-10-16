# Test prompt for Odia Lens for Mac

Give this whole file to the AI assistant (Claude Code, ChatGPT or another) that helps test
the Mac lens. It is written for that assistant.

---

You are helping me test **Odia Lens for Mac**, a menu bar app on my MacBook. It shows a
see-through frame over any app; the Odia text under the frame is read with OCR
(`tesseract`) and a panel under the frame shows each line and each word with its English
meaning. Point mode shows a card for the Odia word under the mouse pointer in any app.

The project is at `~/Projects/odia-transliteration` (the app is in `mac-lens/`). The
developer is another AI session that cannot run macOS. **Your job is to find and record
problems, not to fix them.**

## Rules

1. **Do not change any file in the repository.** No edits, no commits, no `git push`, no
   `npm audit fix`. Only `git pull` and the build commands below. If you think you know the
   fix, write it in the report as a suggestion.
2. If you cannot run commands yourself (for example in a chat app), tell me one step at a
   time what to do and ask me for the output or a screenshot. Do not skip steps.
3. Copy every error message exactly as it is. Do not shorten or paraphrase it.
4. Check Odia by code point when a word looks right but behaves wrong (step 6 shows how).
   Two Odia letters with a dot below can look the same but be stored differently.
5. Do not send my files, screenshots or text to any website or service.

## 1. Update and build

```bash
killall OdiaLens 2>/dev/null
cd ~/Projects/odia-transliteration
git pull
npm install
cd mac-lens
./build.sh
tccutil reset ScreenCapture in.odiatransliteration.lens
open build/OdiaLens.app
```

- Record: the last 30 lines of the build output if it fails, `sw_vers`, `uname -m`,
  `tesseract --version | head -1`, `git log --oneline -1`.
- macOS asks for **Screen Recording** permission. Allow it (System Settings > Privacy &
  Security > Screen & System Audio Recording: **Odia Lens** on). Then quit the lens (menu
  bar **ଓ** > Quit, or `killall OdiaLens`) and `open build/OdiaLens.app` again.
- Keep a log open in a second Terminal window during all tests:

  ```bash
  log stream --style compact --predicate 'process == "OdiaLens"' 2>&1 | tee ~/Desktop/odialens-log.txt
  ```

## 2. Start-up

- [ ] The frame (indigo bar with a wheel, red-and-yellow border) and the results panel
      appear. The menu bar shows **ଓ** (on a MacBook Air it can be hidden behind the notch:
      say so if it is not visible).
- [ ] The panel's top line says `Dictionary: ready` and an OCR line. Copy that line.
- [ ] No Dock icon (expected).

## 3. Test text

Open **TextEdit**, choose Format > Make Plain Text, set the font size to 28, and paste:

```
ଓଡ଼ିଆ ସାମ୍ବାଦିକତାକୁ ନେଇ ଆମେ ପ୍ରତିବଦ୍ଧ।
ପାଠକପାଠିକା ପାଇଁ ଏହା ଦେୟଯୁକ୍ତ ସେବା।
ଓଡ଼ିଶାରେ ଖର୍ଚ ବଢ଼ିଛି।
ପରିବର୍ତ୍ତନର ସାରଥି।
```

Expected first meanings (the panel may show more):

| Word | Expected meaning (start) |
|---|---|
| ସାମ୍ବାଦିକତାକୁ | to journalism |
| ପ୍ରତିବଦ୍ଧ | committed (to), bound |
| ପାଠକପାଠିକା | readers (men and women) |
| ଦେୟଯୁକ୍ତ | paid, with a fee |
| ଓଡ଼ିଶାରେ | in Odisha |
| ଖର୍ଚ | expense, cost |
| ସାରଥି | charioteer; driver, guiding force |
| ନେଇ (after ସାମ୍ବାଦିକତାକୁ) | over; regarding |

Also test on real pages: an Odia ePaper page in Safari (for example Sambad or Dharitri
ePaper), an Odia PDF in Preview, and a paused Odia YouTube video.

## 4. Frame (OCR) tests

For each, record what happened and anything odd:

- [ ] Drag the indigo bar over line 1 and let go. Within about 2 seconds the panel shows
      "Read: …" with the line, then words and meanings. Compare with the table.
- [ ] Buttons **Word**, **Line**, **Para** change the frame size; **↻** reads again; **✕**
      hides the lens. After ✕, `open build/OdiaLens.app` must show it again.
- [ ] Drag each of the 4 edges and 4 corners to resize. Note any edge that does not grab.
- [ ] Menu bar **ଓ**: Show or hide, Frame size, Read again, Quit all work.
- [ ] Click a word in the panel: its full card opens.
- [ ] Frame over the ePaper page, the PDF and the paused video: is the text read? Count
      roughly how many words in a line are read right.
- [ ] Frame over English only, and over an empty area: no crash, a sensible message.
- [ ] Move the frame quickly many times: no freeze, no crash.
- [ ] Light and dark mode (System Settings > Appearance): the frame and panel stay readable.
- [ ] With a second display (if any): reading on the second display works.
- [ ] After sleep and wake: the lens still reads.

## 5. Point mode tests

Menu bar **ଓ** > **Point at words in any app**. macOS asks for **Accessibility**
permission (System Settings > Privacy & Security > Accessibility: Odia Lens on); after
allowing, quit and reopen the lens and turn point mode on again.

- [ ] Rest the pointer on each word of the test text in TextEdit: a card opens beside it
      with the meaning from the table. ନେଇ after ସାମ୍ବାଦିକତାକୁ should show a phrase meaning.
- [ ] The same in Notes, Safari (an Odia web page), Preview (an Odia PDF with a text
      layer), and Microsoft Word or Pages if installed. Note in which apps no card opens.
- [ ] Choose the menu item again: point mode stops, no more cards.

## 6. Checking a wrong word

When a meaning is wrong or missing, record the word, the meaning shown, and the meaning
you expected. If the word looks right but gets no meaning, record its code points:

```bash
python3 -c "import sys; print(' '.join(f'U+{ord(c):04X}' for c in sys.argv[1]))" 'WORD'
```

(The letters ଡ଼ and ଢ଼ must be U+0B21 U+0B3C and U+0B22 U+0B3C.)

## 7. Report

Save the report as `~/Desktop/odialens-test-report.md` with these sections, then show it
to me:

1. **Setup:** macOS version, chip, tesseract version, git commit, build result.
2. **Blockers:** anything that stops the lens from working, with exact error text.
3. **Bugs:** one line each: what I did / what happened / what should happen. Most severe
   first.
4. **Wrong or missing meanings:** a table: word, meaning shown, expected meaning, where
   (frame or point mode, which app).
5. **OCR quality:** per source (TextEdit, ePaper, PDF, video): roughly how many words were
   read right.
6. **Status line:** the panel's top line, copied exactly.
7. **Log:** any lines in `~/Desktop/odialens-log.txt` that contain `error`, `fault`,
   `OdiaLens` crash text or `JavaScript`, copied exactly (at most 50 lines).
8. **Suggestions** (optional): likely causes or fixes, clearly marked as guesses.

Do not mark a check as passed unless you saw it pass.
