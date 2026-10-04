# Odia_Sanskrit_Appv2 — dictionary provenance

Every source behind the dictionary overlay in `odia-app-sanskrit-v2.html`: where it came
from, its licence, and a checksum. Same discipline as `core/data/PROVENANCE.md` and
`Appv2/data/PROVENANCE.md`: if a source is not recorded here, it should not ship.

Recorded 2026-10-04 (stage V0, `plan/05-v3-direction.md`). The payloads were built
earlier. This file records them after the fact, so each row says how sure we are.

**Confidence tags:** **verified** = we read the licence file or the primary page.
**unverified** = from the build script, a search summary or memory. Check before a public
release.

---

## Shipped in the page

| Piece | What it gives | Licence | Confidence |
|---|---|---|---|
| Praharaj, *Purnnachandra Odia Bhashakosha* (1931–40) | Classical entries, 38,776 of 146,261 headwords | Public domain. The author died in 1946. Indian copyright (life + 60 years) ended in 2007. | Reasoning from the build script. **unverified** by a lawyer |
| indic-dict `stardict-oriya` digitisation of Praharaj | The machine-readable text | **No LICENSE file** in the repository (HTTP 404). The build script calls it "freely redistributable". | No licence file: **verified**. "Freely redistributable": **unverified** |
| OdiaNLP `dictionary`, `data/cleaned_pairs.json` (215,339 pairs) | The `[mt]` rows of the MODERN layer (~7,400 words) | Repository: MIT. **Origin of the underlying text: unknown** (`translated.txt` has no stated source). Samples look like machine translation. | MIT: **verified** (LICENSE, © 2020 OdiaNLP). Origin: **unknown**. Owner decision D-5 (2026-10-04): replace this layer. |
| Unicode CLDR `common/main/or.xml` | The `[cldr]` rows: names of countries, languages, scripts, months (~1,000) | Unicode License v3 | **verified** |
| wordfreq (Python package) | The English word shown for each `[loan]` row (~33,400), and the frequency ranking of `[mt]` glosses | Code Apache-2.0. Word-list data CC-BY-SA 4.0. | **unverified**. Build time only, but the chosen English word does appear in the page. |
| CMUdict (Python package `cmudict`) | English pronunciations for the loanword match | BSD | **unverified**. Build time only. No CMUdict text ships. |
| pako `inflate` (trimmed, minified) | Unpacks the gzip payloads in the browser | MIT | **unverified** here. The version is not recorded in the file. |

The note in `README.md` that the "MTEnglish2Odia / OdiaNLP pairs" are MIT is
incomplete. `soumendrak/MTEnglish2Odia` is a different, smaller set under GPL-3.0. The
file used here is the OdiaNLP one. See `plan/research/2026-10-04/02-dictionary-sources.md`.

## Checksums (sha256)

| File | sha256 | Note |
|---|---|---|
| `praharaj.babylon` (indic-dict `or-head/praharaj/`) | `b60c01043c26598c26cb8085c130ef89ab92bb404367302a4257c6c35e0003eb` | Copy fetched 2026-10-04, 67,584,041 bytes. Not confirmed identical to the copy the payload was built from. |
| `cleaned_pairs.json` (OdiaNLP `dictionary` at commit `8bc4ca8d`, 2021-10-09) | `b34a7ac9339cdd807d3471d872c647294c8c4ce768a1df5e00ff22ac21da80c8` | Same caveat. |
| `build/dict_payload_v2.b64` | `b3f7edb86a6638ef0631eb8f3f0308212cbbaa2a779bfab705496e1903586da3` | Committed payload, Praharaj subset |
| `build/modern_payload.b64` | `fde76f2a4030a61e18cf013aef3b126d92d37fdf279fe306f7aa1db5c14858da` | Committed payload, MODERN layer |
| `build/pako-inflate.min.js` | `bca5529190cd4c572482197baa533963e1588bc510c90379c4c634e66a262bfc` | |

## Open items

1. Replace the `[mt]` rows (D-5). Candidate sources, all MIT-compatible: Samanantar/BPCC
   aligned glosses (CC0 / CC-BY) and Wikidata labels (CC0).
2. Confirm the wordfreq data licence. If CC-BY-SA applies to single English words used
   as glosses, replace them with a CC0 or CC-BY word list.
3. Record the pako version, or replace the trimmed copy with a pinned npm package.
4. The overlay's own `canonical()` (`build/dict-overlay.js`) is a hand copy of
   `core/src/normalize.ts`. It contains literal precomposed nukta characters, against the
   repository convention. It still works, because `normalize('NFC')` runs first. V1 moves
   the dictionary into the app as a module, which removes this copy.
