# Appv2 — Sanskrit in Odia script

Everyday Odia worked. Sanskritized Odia — the register of stotras, Puranas,
Upanishads and Jagannath devotional verse — did not. This line could not be
typed at all:

```
ଧ୍ୟାନ ବଳାତିତଂ ନାନ୍ୟଂ ବଳଂ ।
```

It can now:

```bash
npx vite --config Appv2/vite.config.ts
# then type:  dhyaana balaatitam naanyam balam |
```

Or open the self-contained build — one file, no server, AirDroppable:

```bash
SINGLE_FILE=1 npx vite build --config Appv2/vite.config.ts
node Appv2/scripts/make-single-file.mjs
open docs/odia-app-sanskrit.html
```

That writes a **new** file next to `docs/odia-app.html`; the existing app is
never overwritten.

## Accuracy

Measured on `eval/golden/sloka-source.txt` — 32 lines of published Sanskrit in
Odia script (Bhāgavata, Gīta Govinda, Harivaṃśa), **147 distinct words**:

| profile | careful top-1 | careful top-3 | casual top-1 | casual top-3 |
|---|---|---|---|---|
| Odia + Sanskrit | 89.8% | 93.9% | 78.2% | 85.7% |
| **Śloka** | **93.2%** | **95.9%** | 78.2% | 85.7% |

Never average these with the everyday numbers — they measure different things.
The casual register is where the remaining loss sits, and it is a vocabulary
problem, not a rule problem: long compounds like `ଯତ୍ରାଚ୍ୟୂତୋଦାରକଥା` and
`ଜ୍ୟୋତିଶ୍ଚକ୍ରବର୍ଣ୍ଣନେ` are simply not in any lexicon yet. Stage 1 is the fix.

## Nothing outside this folder changed

Not one existing file was edited. Three properties of the engine make that
possible, and they are worth knowing before touching anything here:

1. **`createEngine()` and `Engine` take file *contents*, not paths**, and
   `EngineConfig.lexicon` is a structural interface. So Appv2 ships its own rule
   files and its own lexicon and composes them at runtime — see `src/compose.ts`.
2. **Rule weights are not capped at 1.0.** `readWeight` only requires finite and
   `>= 0`, and the segmenter normalises every path against the best one, so only
   ratios matter. That is the clean fix for word-final anusvara.
3. **`tokenize()` classifies non-ASCII as `punct` and passes it through.** So
   `|` → `।` happens *before* the engine, in `src/preprocess.ts`, with no illegal
   roman key and no core edit.

## Three modes

| Mode | What it is |
|---|---|
| **Everyday** | The original engine, byte for byte. The control arm for `eval/no-regression.ts`, and an escape hatch. |
| **Odia + Sanskrit** *(default)* | Everyday Odia leads; Sanskrit forms sit a slot or two down but are always present. |
| **Śloka** | For verse. Word-final `ଂ` beats `ମ`, `ଳ` beats `ଲ`, the Sanskrit vocalics become typeable, and the frequency term is raised because Sanskrit spelling is lexically determined. |

The unified mode costs **nothing** in everyday Odia — `eval/no-regression.ts`
measures +0.0pp on all four existing metrics.

## Typing marks

Four have a keystroke; the rest are on the insert palette above the output.

| Type | Get | Note |
|---|---|---|
| `\|` | `।` | |
| `\|\|` | `॥` | tried before single `\|` |
| `'` | `ଽ` | only after `o` or `e` — 98% of avagraha in the corpus follows `ୋ`/`େ`, and this is what keeps `don't` intact |
| `:` | *the letter `h`* | **not** the visarga character; see below |

The `:` asymmetry is deliberate. Substituting `ଃ` directly splits the roman
token, so `du:kha` came out `ଦୁ` + `ଃ` + `ଖା` even though `ଦୁଃଖ` sits in the
lexicon under the key `duhkha`. Mapping to `h` keeps the word whole. Avagraha
has no such problem because it only ever occurs at a sandhi seam *between* two
words, where splitting is the correct analysis.

## Layout

```
rules/
  sanskrit.delta.toml   HAND-EDITED  — the śloka profile, as a delta
  unified.delta.toml    HAND-EDITED  — extends the above, re-weights three blocks
  sanskrit.toml         GENERATED, committed
  unified.toml          GENERATED, committed
  palette.toml          rare marks for the insert strip
scripts/
  gen-rules.ts               the delta compiler; --check is the drift gate
  measure_lla_prior.py       ଲ/ଳ, ବ/ୱ, ଯ/ୟ adjudication from the corpus
  mine_webfreq_sanskrit.py   the Stage-0 lexicon. No network.
src/      preprocess, palette, compose, profiles, engine, main
eval/     run.ts + three harnesses
```

## The rule files are generated — edit the delta

```bash
npx tsx Appv2/scripts/gen-rules.ts          # regenerate
npx tsx Appv2/scripts/gen-rules.ts --check  # exit 1 if stale
```

A standalone copy of `symbols.toml` would duplicate 537 lines and drift, so the
profiles are deltas applied to it. The compiler does a **line-oriented rewrite**
rather than re-emitting a parse, because `symbols.toml`'s comments are the
project's record of why each weight is what it is. The payoff:

```bash
git diff --no-index core/rules/symbols.toml Appv2/rules/sanskrit.toml
```

is a short review artefact — 157 insertions against a 537-line base, each marked
with the delta id that produced it.

Three guards. Before writing, the compiler feeds the generated string to core's
own `loadRules()`; if core would reject it, nothing is written. `--check`
byte-compares (output is deterministic — there is deliberately no timestamp).
And every output path is rejected unless it sits inside `Appv2/`.

## Verifying a change

```bash
npx tsx Appv2/eval/run.ts        # all four checks
npx vitest run --root Appv2      # unit tests
npx vite build --config Appv2/vite.config.ts
```

`eval/run.ts` calls `gen-rules --check` **first**, so no metric can be reported
against a stale rule file.

| Harness | Asks |
|---|---|
| `no-regression.ts` | Did everyday Odia move? Hard-fails past 0.5pp. Reads `tools/eval/baseline.json`, never writes it, and no Appv2 script implements `--write-baseline`. |
| `sanskrit-coverage.ts` | Is every Sanskrit mark reachable? Proves it by **running the engine**, never by scanning rule text — see below. |
| `sloka.ts` | How accurate on real verse, in three registers (careful / casual / **iast**). |
| `webkit-sanskrit.py` | Do the new features work in **Safari's engine**? Node passing and Safari failing is exactly how the `Object.hasOwn` bug reached a tester. Soft-skips without playwright or a built app. |

`tools/eval/webkit-check.py` also passes against the single-file build — pass it
an **absolute** path:

```bash
python3 tools/eval/webkit-check.py "$PWD/docs/odia-app-sanskrit.html"
python3 Appv2/eval/webkit-sanskrit.py --iphone
```

### Why coverage is measured by running the engine

`tools/eval/coverage.ts` builds its "producible" set by iterating the
*characters* of each rule option's text, so the conjunct `ଜ୍ଞ` credits `ଜ`, `୍`
**and** `ଞ` — and bare `ଞ`, which no rule can produce, is reported as covered.
`sanskrit-coverage.ts` reports three distinct states instead:

- **type** — comes back standalone
- **conjunct** — produced inside a cluster (`ଞ` in `ଜ୍ଞ`), bare form on the palette
- **palette** — tap-only

Currently 15 typeable, 3 conjunct-only, 8 palette-only, **0 unreachable**.

## Two findings worth not rediscovering

**A losing digraph key is worse than a missing one.** Adding `ny` → `ଞ` at
w=0.06 — low enough that it could never win — still broke `naanyam`, because
`segment.ts` penalises any consonant whose key is *shorter* than the longest
consonant key matching at that offset. The correct single-`ନ` reading started
paying `digraph_split = 0.12` while the anusvara, being a *sign*, paid nothing.
`ନାନ୍ୟମ` fell out of the top 5 entirely. The rule: a multi-character consonant
key is only safe if its own weight is high enough to **win** the position it
taxes. `S4a`–`S5d` sit at 0.95–1.0 and are fine.

**Position contexts are evaluated against the roman, not the Odia.** Measuring
the `ଳ`/`ଲ` prior the Odia-script way — "only combining marks follow" — sweeps
`ଥିଲା`, `କଲା`, `ଗଲା` and every other `-ଲା` verb form into the word-final bucket,
dragging the prior from 2.37 down to 0.99 and justifying exactly the wrong
weight. `ଥିଲା` is typed `thilaa`, so its `ଲ` is **intervocalic**.

## What is not done

- `eval/golden/sloka-source.txt` holds 32 lines of published Sanskrit plus the
  user's own. More of **your own writing** is the most valuable thing that could
  be added — it is the register the app actually has to serve, and it carries no
  licence question at all. Note the file's licence header: the Wikisource
  transcriptions are CC BY-SA, which is why they live in a test fixture and
  never reach `core/data/` or the shipped bundle.
- Stage 1: Aksharantar `san`, 1.81M pairs. See `data/PROVENANCE.md`. This is
  what fixes the casual-register gap above.
- CLI and macOS IME still use the core engine unchanged, by choice.
- Strict IAST/SLP1 mode would need Appv2's own transliterator —
  `StrictSchemeName` is a closed union in core.

`docs/romanization-reference.pdf` documents the core scheme and does **not** yet
cover the Sanskrit additions.
