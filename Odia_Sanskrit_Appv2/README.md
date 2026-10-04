# Odia_Sanskrit_Appv2 — the app, with a dictionary beside it

**The file to open: `odia-app-sanskrit-v2.html`** — one self-contained page
(~16 MB), AirDroppable, works from `file://` with no network, exactly like
`docs/odia-app-sanskrit.html` before it.

It is that app — the same engine, lexicons and modes, byte for byte — with an
Odia→English dictionary layered on top, so that while choosing between matra
variants you can see what each candidate actually *means*:

```
dhyaana →  ① ଧ୍ୟାନ  Contemplation; meditation.
           ② ଧ୍ଯାନ  Contemplation; meditation.
           ③ ଧ୍ୟଅନ  ·                      ← no entry: probably not a word
kala   →  କଲା Done; performed.   କଳ Low musical sound.
          କଳା Part; portion.     କାଳ Time.
```

Modern usage is covered too — loanwords and today's senses read the way you
actually see them in news and social media:

```
mobail  →  ① ମୋବାଇଲ  English: mobile
sarakaara → ସରକାର    government · Lord; master.
```

## Where meanings appear

1. **In the caret suggestion bar** — a short English chip under each numbered
   candidate. A faint `·` means the dictionary has no entry for that form,
   which is itself a useful signal when one candidate is a real word and the
   others are matra near-misses.
2. **In the side panel** (right of the app on wide screens; the `ଅ→A` button
   on phones) — the **full Praharaj entry** for every current suggestion:
   etymology, part of speech, all senses in Odia and English, usage citations.
3. **In the alternatives picker** (tap an underlined word) — a gloss under
   each alternative.
4. **Hovering a word in the output** shows its gloss as a tooltip.

The panel also has a search box for looking up any Odia word directly.

## Two dictionary layers

Every suggestion is looked up in **two layers**, shown together: the chip
reads *modern gloss · Praharaj gloss* (either may be absent), and the panel
shows a labelled modern card above the full classical entry.

### The modern layer (~40,600 entries, three tagged sources)

| tag | source | what it covers |
|---|---|---|
| `LOAN` | **algorithmic** — no dictionary at all. Every corpus word is reverse-transliterated and matched against English *pronunciations* (CMUdict phonemes + wordfreq frequencies). Matching on sound, not spelling, is what makes ସ୍କୁଲ୍ find *school*; matching against Praharaj first (plus stripped verb/case suffixes and vowel-length variants) is what stops native words like କର or ମିଶିଲା being "detected" as *car* or *michelle*. ~33,400 words: ମୋବାଇଲ, ଇଣ୍ଟରନେଟ, ହସ୍ପିଟାଲ, ଫେସବୁକ… | English/Hindi-via-English loans, the register of news and social media |
| `MODERN` | **community translation pairs** (MTEnglish2Odia / OdiaNLP, 215k modern pairs) inverted to Odia→English, filtered: single-word pairs, glosses ranked by English corpus frequency, max 4. Approximate by nature — treat as usage hints. ~7,400 words: ସରକାର → *government*, ଡାକ୍ତର → *doctor*, ଭିଡିଓ → *video*… | today's dominant senses, where Praharaj's reads dated |
| `NAME` | **Unicode CLDR** or.xml — the standard modern Odia names of countries, languages, scripts, months, weekdays. ~1,000 entries: ଭାରତ → India, ଜାନୁଆରୀ → January… | proper names with an exact modern equivalent |

The loan detector's residual noise sits on rare corpus words and mislabelled
proper names; every loan gloss is tagged as auto-detected, so treat a
surprising one with suspicion. English Wiktionary's Odia extract (~2,000
words, kaikki.org) would be a natural fourth source; it has no
GitHub-hosted mirror, so it is noted here rather than bundled.

## The classical dictionary

**Purṇṇachandra Oḍiā Bhāshakosha** — Gopal Chandra Praharaj, 7 volumes,
1931–40, the most exhaustive dictionary of Odia ever compiled, with English
glosses throughout. Machine-readable digitisation from the
[indic-dict project](https://github.com/indic-dict/stardict-oriya)
(`or-head/praharaj/praharaj.babylon`, 146,261 headwords after parsing). The
text is in the public domain; odiabibhaba.in, the site that prompted this,
is itself built largely on the same Bhashakosha, so this goes straight to
the most exhaustive source.

To keep the single file under ~16 MB, the embedded subset is the **38,776
entries reachable from the app's own vocabulary** — every word in the full
756k-type corpus sweep (`core/data/unigrams.tsv`) plus both bundled lexicons,
matched exactly or after stripping one inflectional suffix. About **98,000
distinct word forms** the engine can plausibly suggest resolve to an entry.
Flip `FULL = True` in the build script for the complete 146k-entry version
(~27 MB file) — this only changes how much is embedded, not the code.

### How a suggestion finds its entry

Praharaj's 1930s orthography differs from what the engine emits, so lookups
go through a chain, each step marked in the UI:

| step | what | shown as |
|---|---|---|
| canonical | NFC + decomposed nukta — the engine invariant | — |
| fold | ୟ→ଯ, ୱ→ବ, ଵ→ବ (Praharaj-era spellings) | — (silent) |
| exact | folded form is a headword | plain gloss |
| stem | after removing one suffix (ର, ରେ, କୁ, ମାନେ, ଗୁଡ଼ିକ, ଂ …) | `≈ stem` |
| prefix | longest headword the word begins with (sandhi compounds) | `≈ begins with` |
| none | — | `no entry` |

**Not every suggestion has a translation** — rule-generated matra variants,
long sandhi compounds and modern loans mostly won't. The chip shows `·` and
the panel says `no entry`; nothing is hidden or guessed.

## What was NOT done

- **No existing file was modified.** The v2 page is built by *reading*
  `docs/odia-app-sanskrit.html` and appending an overlay before `</body>`.
  Everything lives in this folder.
- The engine, rules, lexicons, ranking and learning are untouched — the
  overlay only watches the DOM the app renders and annotates it. If the
  dictionary ever fails to unpack, the app underneath keeps working as before.
- Odia-script meanings *for Sanskrit words* (the "Sanskrit words explained in
  Odia" idea) is deferred, as agreed — though since Praharaj glosses in both
  languages, the full entries in the panel already give you much of it.

## Rebuilding

```bash
# 1. classical payload (needs the babylon file from indic-dict/stardict-oriya)
python3 build/build_dictionary_payload.py path/to/praharaj.babylon

# 2. modern payload (needs cleaned_pairs.json from OdiaNLP/dictionary,
#    or.xml+en.xml from unicode-org/cldr common/main, the babylon file,
#    and `pip install wordfreq cmudict`)
python3 build/build_modern_layer.py cleaned_pairs.json or.xml praharaj.babylon

# 3. assemble the page from the untouched v1 app
python3 build/build_app.py docs/odia-app-sanskrit.html \
        Odia_Sanskrit_Appv2/odia-app-sanskrit-v2.html
```

`build/` contains everything: the payload builder, the assembler,
`dict-overlay.js` / `dict-overlay.css` (the UI), and `pako-inflate.min.js`
(gzip inflate, MIT, bundled from npm `pako` — the payload ships compressed
and unpacks in ~½ s on load).

## Licences

| piece | licence |
|---|---|
| the app itself | MIT (this repo) |
| Praharaj dictionary text | public domain (author d. 1946) |
| indic-dict digitisation | freely redistributable |
| OdiaNLP `dictionary` pairs | repository MIT; origin of the text unknown — see `PROVENANCE.md` |
| Unicode CLDR data | Unicode licence |
| CMUdict (loan detection, build-time only) | BSD |
| pako (inflate) | MIT |
