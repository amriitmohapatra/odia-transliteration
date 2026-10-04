# Odia transliteration

English → Odia phonetic transliteration. Type `kemiti achha`, get the Odia for it.
One TypeScript engine, offline, with a CLI and a zero-install web page in front of it.

**The invariant:** the nukta letters are stored decomposed — U+0B21 U+0B3C and
U+0B22 U+0B3C, never the precomposed U+0B5C / U+0B5D — and every string crossing a
boundary goes through `canonical()` in `core/src/normalize.ts`.

See `CLAUDE.md` for the working rules and `plan/` for scope and staging.

## Layout

| Workspace | What it is |
|---|---|
| `core/` | The engine. Pure TypeScript, synchronous, no I/O, no network, no heavy dependencies. |
| `cli/` | Node command-line front end (`odia`). |
| `web/` | Offline PWA: Safari on macOS, Add-to-Home-Screen on iOS. |

Linguistic rules live in `core/rules/*.toml`, never in TypeScript. Data artifacts live
in `core/data/` and are committed.

## Build and run

```bash
npm install                # workspaces: core, cli, web
npm test                   # engine tests, including the nukta vectors
npm run build              # builds each workspace in order: core, cli, web
npm run dev:web            # the web page, on a local dev server
npm run eval               # metrics against tools/eval/baseline.json
```

Per-workspace commands:

```bash
npm test -w core                                  # vitest, watch with `npm run test:watch -w core`
npm run -w cli start -- "kemiti achha"            # transliterate
npm run -w cli start -- "odisha" --codepoints     # verify nukta encoding by code point
```

Only `core/` has source today. `npm run build` and `npm run dev:web` will fail until
`cli/src` and `web/src` exist; that is expected at this stage, not a broken scaffold.

## Conventions worth knowing before you write code

- **Everything in the engine is synchronous.** There is no network, so there are no
  promises.
- **`core/` and `cli/` use NodeNext module resolution**, so relative imports need an
  explicit extension: `import { canonical } from './normalize.js';` — with `.js`, even
  from a `.ts` file. `web/` is bundled by Vite and does not need this.
- **Do not put Odia literals in TypeScript source.** Use `\uXXXX` escapes. The canonical
  and precomposed spellings of ଡ଼ are visually identical, so a literal cannot be
  reviewed. Linguistic content belongs in TOML, where it is data rather than code.
- `core/` compiles with `"types": []`: the engine must run under Node, in a browser and
  inside JavaScriptCore, so it may not reach for Node or DOM globals.

## Licence

MIT. See `LICENSE`. Bundled data and fonts are MIT / CC0 / CC-BY / OFL; provenance is
recorded in `core/data/PROVENANCE.md`.
