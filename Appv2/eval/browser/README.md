# Browser checks for the V1 app

These scripts drive the built app in headless Chromium with Playwright. They are the
only tests of the UI, offline use, learning, owner meanings and the report button.
The unit tests and evals do not cover these.

```bash
npx vite build --config Appv2/vite.config.ts
(cd Appv2/dist && python3 -m http.server 4810 --bind 127.0.0.1 &)
node Appv2/eval/browser/regress.mjs 4810       # 9 checks: typing, meanings, Keep English, offline, no external requests
node Appv2/eval/browser/gloss-check.mjs 4810   # owner meanings first (raja -> Raja festival)
node Appv2/eval/browser/origin-check.mjs 4810  # word origin: sarakaara -> "from Persian" (V2.4)
node Appv2/eval/browser/report-check.mjs 4810  # "Wrong word? Report it"
node Appv2/eval/browser/freeze.mjs 4810        # A-7 timing (report, not pass/fail)
node Appv2/eval/browser/context-check.mjs 4810 # word-pair context in the caret bar (V2.2)
node Appv2/eval/browser/english-check.mjs 4810 # English lookup, clipboard, offline and degraded loading
```

Playwright: in the Claude Code cloud environment it loads from
`/opt/node-tools/node_modules` (no install). Elsewhere, `npm i -D playwright` and
`npx playwright install chromium`, then change the `createRequire(...)` line to a plain
`import { chromium } from 'playwright'`. Safari's engine is not covered: run
`tools/eval/webkit-check.py` on a Mac (follow-up A-3).

`english-check.mjs` resolves Playwright from the project or `NODE_PATH`, without
editing the script. To use the prepared Codex cloud tools and system Chromium:

```bash
NODE_PATH=/workspace/onboarding-tools/node_modules CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node Appv2/eval/browser/english-check.mjs 4810
```

It exits nonzero on a failed assertion. Its 15 checks include explicit translation
versus loan labels, canonical clipboard output, unavailable historical data,
direction switching after that failure, clipboard denial, and offline reload.

For WebKit (Python Playwright plus its browser/system libraries):

```bash
python3 Appv2/eval/browser/english-webkit.py 4810
```

`WEBKIT_EXECUTABLE_PATH` can select an installed launcher. This runs desktop and
iPhone viewport scenarios, **not native device tests**. The 12 online checks
passed in the 12 October Linux run; both offline reload checks failed with a
WebKit internal navigation error in the baseline and feature builds. The script
retains those checks and exits nonzero when they fail. See the review's validation
record before treating this as a release gate.
