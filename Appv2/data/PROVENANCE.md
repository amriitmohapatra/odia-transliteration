# Appv2 data provenance

Every artefact in `Appv2/data/`, where it came from, and under what licence.
Same discipline as `core/data/PROVENANCE.md`: if it is not recorded here, it
should not be shipped.

## Stage 0 — what is here now

Nothing in this directory required a network fetch. It is all derived from
`core/data/webfreq.tsv`, which already sits in the repo.

| File | Rows | Built by | From |
|---|---|---|---|
| `sanskrit-lexicon.tsv` | 105,286 | `Appv2/scripts/mine_webfreq_sanskrit.py` | `core/data/webfreq.tsv` |
| `sanskrit-lexicon-web.tsv` | 27,835 | same, pruned to 1.2 MB by word frequency | same |
| `sanskrit-unigrams.tsv` | 14,818 | same | same |
| `sanskrit-unigrams-web.tsv` | 4,551 | same, covering exactly the web lexicon's words | same |
| `lla-preference.tsv` | 121,429 | `Appv2/scripts/measure_lla_prior.py` | same |

`core/data/webfreq.tsv` is 527,477 Odia word types over 18.4M tokens, swept
from Odia news, Wikipedia, literature, archive books and government pages. Its
own sources and licences are recorded in `core/data/PROVENANCE-webcorpus.md`.
Appv2 reads it and never writes it.

### Why a Sanskrit lexicon falls out of an Odia web corpus

Odia web text quotes stotras, Gita chapters and Purana passages constantly, so a
Sanskrit slice is already present. Measured: 4,567 types ending in `ଂ`, 2,944
ending in `ଃ`, and 332 containing `ଽ` — the last being almost entirely the Gita
colophon series (`ପ୍ରଥମୋଽଧ୍ୟାୟଃ`, `ଦ୍ୱିତୀୟୋଽଧ୍ୟାୟଃ`, …). Selection is by a
shape-based score plus a hand-curated seed list of 53 devotional words that have
no distinguishing shape (`ଓଁ`, `ଶ୍ରୀ`, `ହରି`, `ରାମ`). 14,854 types qualify.

Every seed word is checked against the corpus at build time and a missing one is
reported loudly, because a typo in an Odia string literal is invisible by eye.

### `lla-preference.tsv` is a reviewable artefact

It records, per word, which of two legitimate Odia spellings the corpus actually
uses — `ଲ`/`ଳ`, `ବ`/`ୱ`, `ଯ`/`ୟ`. A native speaker can read it and object to
specific rows, which is not true of a weight buried in a TOML file. The
aggregate priors it produces are what `Appv2/rules/sanskrit.delta.toml` cites.

## Licences

Everything shipped derives from MIT / CC0 / CC-BY sources, as `CLAUDE.md`
requires. Stage 0 adds no new source: it is a derivation of an artefact already
in the repo.

## NOT shipped, and why

Recorded so nobody re-litigates it.

| Source | Why not |
|---|---|
| **sanskritdocuments.org** (including its Odia-script collection at `/odia/`) | Terms permit personal study and research only: "not to be copied or reposted … without permission". It is also PDF-only, so not usable as text regardless. Excellent for finding out what texts exist; not a source we can redistribute from. |
| **GRETIL** | No blanket licence found on the site; provenance is per-text and traces back to individual contributors. Not safe to ship from without a per-text audit. |
| **IndicCorp v2 `san_Deva`** | CC0 and therefore fine to use, but only ~7,950 rows — too small to serve as a Sanskrit frequency source. |

## Stage 1 and 2 — planned, not yet fetched

| Source | Licence | Verified | For |
|---|---|---|---|
| **AI4Bharat Aksharantar `san`** | CC0 (mined) / CC-BY | `https://huggingface.co/datasets/ai4bharat/Aksharantar/resolve/main/san.zip` returns HTTP 200, **58,641,114 bytes** | 1,813K roman ↔ Devanagari pairs. The real prize: human romanizations, which is the hard half of a transliteration lexicon. Same URL pattern and JSON-Lines format (`"native word"`, `"english word"` — with a space) as the `ori.zip` `tools/build-data/download.py` already consumes. |
| **indic-transliteration/common_maps** | MIT | `brahmic/devanagari.toml` and `brahmic/oriya.toml` both present | Composed into a Devanagari→Odia converter. Pin to a commit SHA, not a branch. |
| **Digital Corpus of Sanskrit** | CC-BY 4.0 | mirror at `github.com/ambuda-org/dcs` | ~5.66M manually tagged words for Sanskrit word frequency. |
| **Ambuda** | permissive / public domain | `ambuda.org` | Ramayana and Mahabharata critical editions; verse material for the golden set. |

When Stage 1 runs, raw downloads go to `tools/build-data/raw/appv2/`. That is the
only path outside `Appv2/` any Appv2 script writes to, and the root `.gitignore`
already ignores `tools/build-data/raw/`.

### The conversion is a fan-out, not a function

Devanagari→Odia is not 1:1 for a reader of Odia. Three letters have two
legitimate spellings and the choice is conventional:

    ल  ->  ଲ or ଳ        व  ->  ବ or ୱ        य  ->  ଯ or ୟ

`lla-preference.tsv` is what decides them, per word where the corpus knows the
word and by positional prior where it does not. Both forms are emitted under the
same roman key, ranked — which is exactly what was asked for: the alternate
becomes a numbered option rather than disappearing.
