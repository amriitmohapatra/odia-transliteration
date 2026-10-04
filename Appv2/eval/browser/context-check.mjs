// Word-pair context in the caret bar (V2.2): the Odia word before the caret word
// changes the first suggestion. "kumara" alone puts KUMARA-short first; after
// AKSHAYA (typed "akshaya" + Space) the bar puts KUMAARA first.
// Usage: node Appv2/eval/browser/context-check.mjs [port]  (serve Appv2/dist; see README.md)
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const URL = `http://127.0.0.1:${process.argv[2] || '4810'}/`;
const SHORT = '\u0B15\u0B41\u0B2E\u0B30';       // kumara, short aa
const LONG = '\u0B15\u0B41\u0B2E\u0B3E\u0B30';  // kumaara
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.addInitScript(() => localStorage.setItem('odia.pref.seenIntro', '1'));
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForTimeout(2500);
const ta = p.locator('textarea').first();
const first = async () => (await p.$$eval('div.inline-candidates button .inline-text', (bs) => bs.map((x) => x.textContent)))[0];
await ta.click(); await ta.type('kumara', { delay: 15 }); await p.waitForTimeout(500);
const alone = await first();
await ta.fill(''); await ta.type('akshaya kumara', { delay: 15 }); await p.waitForTimeout(500);
const after = await first();
const ok = alone === SHORT && after === LONG && errs.length === 0;
console.log(JSON.stringify({ alone: alone === SHORT ? 'short (as expected)' : alone, afterAkshaya: after === LONG ? 'long (as expected)' : after, errors: errs.length }));
console.log(ok ? 'PASS context' : 'FAIL context');
await b.close();
