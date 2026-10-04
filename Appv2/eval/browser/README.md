# Browser checks for the V1 app

These scripts drive the built app in headless Chromium with Playwright. They are the
only tests of the UI, offline use, learning, owner meanings and the report button.
The unit tests and evals do not cover these.

```bash
npx vite build --config Appv2/vite.config.ts
(cd Appv2/dist && python3 -m http.server 4810 --bind 127.0.0.1 &)
node Appv2/eval/browser/regress.mjs 4810       # 9 checks: typing, meanings, Keep English, offline, no external requests
node Appv2/eval/browser/gloss-check.mjs 4810   # owner meanings first (raja -> Raja festival)
node Appv2/eval/browser/report-check.mjs 4810  # "Wrong word? Report it"
node Appv2/eval/browser/freeze.mjs 4810        # A-7 timing (report, not pass/fail)
```

Playwright: in the Claude Code cloud environment it loads from
`/opt/node-tools/node_modules` (no install). Elsewhere, `npm i -D playwright` and
`npx playwright install chromium`, then change the `createRequire(...)` line to a plain
`import { chromium } from 'playwright'`. Safari's engine is not covered: run
`tools/eval/webkit-check.py` on a Mac (follow-up A-3).
