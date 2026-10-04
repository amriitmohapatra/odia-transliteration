# docs

| File | What it is |
|---|---|
| **`odia-app-sanskrit.html`** | **The app (V1, from 2026-10-04 when rebuilt).** Built from `Appv2/` with `SINGLE_FILE=1 npx vite build --config Appv2/vite.config.ts && node Appv2/scripts/make-single-file.mjs`. Everyday Odia, Sanskrit, the dictionary and the V1 interface in one ~16 MB file. Rebuilt and committed 2026-10-04 (V1, adult edition, 16.4 MB). The kids edition builds to `odia-app-kids.html` (see `ARCHITECTURE.md` §6). The hosted version is the same app on Vercel. |
| `odia-app.html` | The original app (`web/`, now frozen). Full engine, 112k-entry lexicon, ~6 MB, one self-contained file. |
| `odia-simple.html` | A 40 KB rules-only version. No vocabulary, so it gets ଜନ୍ମଦିନ wrong — kept as a lightweight fallback and as the thing the 58-check test suite guards. |
| `romanization-reference.pdf` | Printable reference: vowels, matras, consonants, conjuncts, signs, numerals. |
| `romanization-reference.tex` | Source. Compile with **LuaLaTeX**, not pdfLaTeX (Odia needs HarfBuzz shaping). |

Rebuild the app after any engine or data change:

```bash
npm run build:app        # -> docs/odia-app.html
```

---

## Getting it on your Mac

Double-click `odia-app.html`. That's it — no server, no install, no network.

To keep it around, open it in Safari and use **File → Add to Dock**. It then
opens in its own window with no browser chrome, like a native app.

## Getting it on your iPhone or iPad

The file has to reach the device first. Any of these work:

- **AirDrop** it from the Mac, then open in Safari
- Put it in **iCloud Drive** and open from the Files app
- Mail it to yourself

Then in Safari: **Share → Add to Home Screen**. You get an ଓ icon that launches
full-screen. Everything is inside the one file, so it works with no signal.

## What it does

Type phonetically and pick from whole-word options, the way a Pinyin keyboard
works. `kala` offers କଳା, କାଳ and କଲା; you choose, and **it remembers**, so that
word leads the list next time.

Ambiguous words are underlined with dots. Tap one for the alternatives, or press
its number key. The dashed button at the end keeps the English spelling, for
names and acronyms.

**Can**: convert as you type, offer whole-word alternatives, learn your choices,
switch to Odia numerals, strict ITRANS mode, copy to clipboard, work fully offline.

**Cannot**: type directly into other apps. You compose here and paste. Typing
*inline* in Word, Notes or Messages needs a real input method — `ime-macos/` on
the Mac (spike S4) and a keyboard extension on iOS (Stage D). See `plan/02-stages.md`.

## Accuracy

Measured by round-tripping real connected Odia — reverse-transliterate each word,
feed the roman back through the engine, check whether the original comes back.
Deriving the roman rather than hand-picking it keeps the test honest.

| register | top-1 | top-3 | top-5 |
|---|---|---|---|
| careful (`bhaagya`) | 89.1% | 97.8% | 97.8% |
| casual (`bhagya`) | 80.4% | 95.7% | 95.7% |

For comparison, AI4Bharat's IndicXlit — an 11M-parameter transformer — reaches
58.9% top-1 on Odia. The gap is not cleverness; it is that this engine has a
vocabulary of real Odia and is allowed to offer you a choice.

## Why vocabulary, not rules

The engine originally used AI4Bharat's Aksharantar as its lexicon. It turned out
not to be a dictionary of Odia at all: **2 of 25 common everyday words present**,
mean entry 8.7 characters, 95.7% mined names and compounds. It knew ଭାଗ୍ୟଶ୍ରୀ but
not ଘର.

That matters because some distinctions are simply not derivable from spelling.
ଜନ୍ମ and ସମ୍ବାଦ are both "n" before a labial consonant; one takes ନ, the other ମ.
No phonetic rule can separate them — you have to know the words.

So `core/data/webfreq.tsv` is a corpus swept from Odia news, Wikipedia,
literature, archive books and government pages: **18.4M tokens, 527k word types**,
with all 25 of those everyday words present. `tools/build-data/build_common_lexicon.py`
romanizes the frequent ones into lexicon entries, generating several spellings per
word because people do not double long vowels and do not distinguish retroflex
from dental.

That single change took casual top-3 from 67% to 96%.

## About the scheme

Type it how it sounds; case is ignored. Two things worth knowing:

- **ଡ଼ mostly takes care of itself.** Real Odia publishing writes the nukta on
  native words almost always (ବଡ଼, 97%) but omits it on English loans (ଭିଡିଓ). It
  is a property of the word, not the sound, which is exactly why the lexicon
  handles it and no rule tries to.
- **Double the vowel to lengthen it.** `bhaagya` is ଭାଗ୍ୟ. Common words are
  recognised either way, but for anything rare the doubling matters.

The scheme is a **v0.1 draft** derived from ITRANS conventions and published
orthography references, and has **not been reviewed by a native speaker**. Where
it is wrong, fix `core/rules/symbols.toml` and rebuild.
