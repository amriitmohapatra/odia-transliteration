# Validation — 12 October 2026

Baseline reviewed: `4a3a85e2ea5d5934d77d3b4b853dab7cdd8ead51`. Baseline results
were captured from a frozen production build before this feature. New-feature
checks used the rebuilt Appv2 production bundle. Runtime: Node 24.19.0, npm 11.9.0,
Linux Chromium via Playwright 1.58.2. No native iOS/Safari claim is made.

| Check | Observed result |
| --- | --- |
| `npm test` | PASS: 178 core + 63 Appv2 tests (241 total), plus 58 standalone fallback checks. Includes 10 new English lookup tests. |
| `npm run typecheck --prefix Appv2` | PASS. |
| `npx vite build --config Appv2/vite.config.ts` | PASS. Existing large-data-chunk warning remains. |
| `npx tsx Appv2/scripts/gen-rules.ts --check` | PASS for both generated rule files. |
| `node Appv2/eval/check-theme.mjs` | PASS. |
| `english-check.mjs` against rebuilt app | PASS: 15 browser checks; clipboard, aliases, separate senses/kinds, review labels, exact/prefix/missing results, owner meaning, offline reload, unavailable binary dictionaries, mode-switch recovery, clipboard denial, no external requests/page errors. |
| Existing `regress.mjs` against rebuilt app | All 9 reported checks PASS, including offline reload, learned English and meanings. |
| Existing `origin-check.mjs` against rebuilt app | All 8 reported checks PASS. |
| Existing `context-check.mjs` against rebuilt app | PASS (short/long context choice, zero page errors). |
| `npm run eval` | Completed, exit 0: 4,201 unique held-out keys, overall top-1 25.3%, top-5 36.8%. This is a report, not proof of general conversational quality. |
| `npx tsx tools/eval/everyday.ts` | Completed, exit 0: careful top-1/top-3 89.1%/97.8%, casual 80.4%/95.7%, 46 words. |
| `npx tsx Appv2/eval/run.ts` | Required rule, theme, no-regression, Sanskrit coverage and sloka checks PASS. Optional WebKit initially WARNed because its browser was absent; a later direct run found the stale harness described below. |
| `npx tsx tools/eval/coverage.ts` | Existing FAIL, exit 1: 18 targets absent from top 9. CI marks this report-only. No ranking/rule change in this PR. |
| Legacy `tools/eval/webkit-check.py` | After installing WebKit, 13 checks passed and the `ghara` check read stale prior output after its fixed 400 ms sleep. A subsequent two-word timing probe produced the expected output; this is timing-sensitive legacy coverage, not a clean suite pass. |
| New `english-webkit.py` | Linux WebKit 26.5: 12 online checks PASS across desktop and iPhone viewport emulation; 2 offline-reload checks FAIL, script exit 1. See diagnosis below. |
| Existing `Appv2/eval/webkit-sanskrit.py` | Timed out waiting for retired `#output`; committed `odia-app-sanskrit.html` has `#readback` instead and no `#profile` select. Harness is stale; no Sanskrit feature pass claimed. |
| Portable review engine probes and full-vs-web comparison | Executed successfully after moving scripts into this evidence directory. |
| `git diff --check` | PASS. |

The earlier onboarding run also found TS6133 for unused `legacyPolyfills` in
`web/vite.config.ts:215`. That legacy code is unchanged and its typecheck was not
rerun as a new-feature acceptance test. No new passing claim is made for it.

## Reproduce the new feature checks

From the repository root, install locked dependencies, then build and serve:

```bash
npm ci
npm test
npm run typecheck --prefix Appv2
npx vite build --config Appv2/vite.config.ts
python3 -m http.server 4810 --bind 127.0.0.1 --directory Appv2/dist
```

In another terminal, with Playwright installed (locally or via `NODE_PATH`):

```bash
node Appv2/eval/browser/english-check.mjs 4810
```

For the prepared cloud image:

```bash
NODE_PATH=/workspace/onboarding-tools/node_modules CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node Appv2/eval/browser/english-check.mjs 4810
```

The existing browser scripts still assume `/opt/node-tools/node_modules`; they
were executed using the onboarding helper's temporary path/browser substitution,
without changing their checks. The new English script does not have that fixed
module path.

## Reproduce audit evidence

These are diagnostics, not new linguistic golden tests. To reproduce the exact
historical UI, serve a build of baseline commit `4a3a85e`; running against the
current branch will correctly show the new dictionary wording/controls. Avoid
resetting an in-progress checkout to do this. The original run retained a copy
of its built output outside the repository.

```bash
NODE_PATH=/workspace/onboarding-tools/node_modules CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node plan/research/2026-10-12/browser-audit.mjs 4810 /tmp/odia-browser-review
npx tsx plan/research/2026-10-12/engine-probe.ts /tmp/odia-engine-review
npx tsx plan/research/2026-10-12/full-vs-web.ts /tmp/odia-engine-review
```

`browser-audit.json`, `engine-probe-summary.json`, `full-vs-web.json`,
`data-counts.json`, and the interaction/dictionary JSON files preserve the baseline
observations. The browser script also writes diagnostic screenshots to its output
directory. User screenshots/recording and private app data are not committed.
The interaction report documents exact keys and expected observed text; one
initial dictionary-button attempt timed out because the desktop panel was already
open, and a separate search probe supplied the actual dictionary findings.

After network access became available, all seven requested public resource pages/cards were read. Raw rows in the two manually gated datasets were not sampled. See `resources.md` for pinned documentation and the difference between source claims and independent verification.

## Additional WebKit diagnosis

The user added Build macOS / Build iOS plugins during the task. They were not
exposed by this session's tools/skill catalog; the machine is Linux with no Xcode,
xcrun or Swift. To gain browser-engine evidence, Playwright's official WebKit 26.5
archive was installed under `/workspace/ms-playwright`. Missing libraries were
downloaded with APT from the image's signed Debian snapshot indexes and extracted
under `/workspace/webkit-deps`, without system changes or disabling verification.
A local launcher supplies those libraries to the bundled WPE MiniBrowser.

Prepared-cloud command:

```bash
WEBKIT_EXECUTABLE_PATH=/workspace/onboarding-tools/webkit-launch.sh python3 Appv2/eval/browser/english-webkit.py 4810
```

The feature supports ordinary typing, translation/loan labels, review labels,
clipboard writes, missing-result behavior and no page errors in desktop and
iPhone viewport contexts. Both offline reloads produce `WebKit encountered an
internal error`. A separate probe against the frozen baseline and feature build
found the same result with an active service-worker controller and 26 cached
requests in each. An extra online reload and waiting for caches did not resolve
it. This isolates it from the new lookup change; it does not distinguish a Linux
WebKit/automation limitation from a service-worker compatibility issue or establish
a failure on physical Safari devices. Offline navigation remains unverified there.
See `english-webkit-results.txt` and `webkit-offline-probe.jsonl`. The regression
script retains the failing assertions and reports a nonzero exit.

The existing legacy WebKit scripts were run through a temporary launcher
substitution; assertions were unchanged and screenshot output was redirected away
from the tracked screenshot. Their output labels say “desktop macOS” because of
their emulated profile, but these executions were on Linux. The original fixed
400 ms `ghara` assertion observed the preceding word. A separate fresh-session
probe checked 400 ms and 2 seconds for `janmadina` and `ghara` to diagnose timing;
its results are in `legacy-webkit-timing.json`. This does not turn the original
failed run into a pass. No source or expected output was changed to hide a failure.
