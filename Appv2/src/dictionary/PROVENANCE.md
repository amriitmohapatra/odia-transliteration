# Dictionary data provenance

The existing `praharaj.bin`, `modern.bin`, and `origin.bin` retain the sources,
licenses and build records in [`Odia_Sanskrit_Appv2/PROVENANCE.md`](../../../Odia_Sanskrit_Appv2/PROVENANCE.md).

## English lookup starter — 12 October 2026

`english.tsv` is an original, deliberately small starter list written for this
project. It has **70 entries for 62 distinct English headwords**; aliases are not
counted as extra headwords. No scraped definitions, automatic loan detector output,
community machine-translation glosses, OCR corpus, or model weights were imported.
The file is licensed under this project's MIT license.

SHA-256 (`english.tsv`):
`401d27f7232a3445657b197b4c2f966184c26f0c261e4c6dbe95fff6908058a7`.

- **64 `original-seed` entries:** drafted by Codex for everyday words and common
  technology terms. These are suggestions awaiting the project owner's native
  Odia review, **not linguistically validated dictionary translations**. Each
  result displays that status in the app. The task authorizes a first version;
  it does not imply acceptance of every spelling or sense.
- **6 `owner-gloss` entries:** use the exact spellings and meanings already marked
  `owner` in [`core/data/glosses.tsv`](../../../core/data/glosses.tsv): day, how,
  okay/fine, dust, committee, and Raja festival. Explicit English headwords,
  aliases, and the `translation`/`loan` classification were curated for this
  feature. No automatic splitting/reversal of the larger gloss payload occurred.

Columns: English headword, canonical Odia word, kind (`translation` or `loan`),
English sense note, `|`-separated aliases, review status, source. Nukta is decomposed
throughout. The strict parser rejects malformed rows, unsupported provenance and
noncanonical spellings. Tests check that every claimed owner meaning exists in the
owner's source file.

`translation` means a proposed equivalent for the stated sense; it is not a
promise that substitution preserves a whole sentence. `loan` means the English
word written in Odia, not a native-word translation. Spelling variation remains
possible. The everyday/formal register and ambiguous senses are stated where
useful (rice, bank, teacher, tomorrow/yesterday, call versus phone device).

Search uses explicit headwords and aliases. Prefix hits are labelled “Related
headword.” There is no fuzzy search, sentence translation, automatic inflection,
or automatic insertion in phonetic candidates. Results pass the existing app's
`hide(word)` callback before display and are canonicalized before copying. Missing
entries report limited coverage; the existing Odia panel now says “meaning
unavailable” rather than implying that a word is invalid.

The seed is bundled with app code, so English lookup continues when historical
payload loading fails and works offline after the app is cached. It makes no
network requests. Clipboard copying is explicit and shows an error with a manual
copy fallback when the browser disallows access.

Before expanding the seed, review every proposed spelling/sense with a native
speaker, then use a suitable reviewed-source workflow. The parser reserves
`owner` for entries backed by `core/data/glosses.tsv`; keep new proposals as `seed`
until that source is updated. A large English dictionary should use sense IDs,
part of speech, register, source/version/license and source-specific review
status, rather than reverse-indexing approximate historical or machine-generated
glosses as authoritative translations.
