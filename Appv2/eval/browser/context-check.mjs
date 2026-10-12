// Word-pair context in the caret bar (V2.2): the Odia word before the caret word
// changes the first suggestion. "jana" alone puts JANA (people) first; after DUI
// (two; typed "dui" + Space) the bar puts JANNA (persons, as in "two people")
// first. (The earlier pair, kumara after akshaya, no longer differs: Desh users'
// typed spellings put the long form first even alone, V2.13.)
// Usage: node Appv2/eval/browser/context-check.mjs [port]  (serve Appv2/dist; see README.md)
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const URL = `http://127.0.0.1:${process.argv[2] || '4810'}/`;
const ALONE = '\u0B1C\u0B28';   // jana: people
const AFTER = '\u0B1C\u0B23';   // janna: persons (dui janna, two people)
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.addInitScript(() => localStorage.setItem('odia.pref.seenIntro', '1'));
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForTimeout(2500);
const ta = p.locator('textarea').first();
const first = async () => (await p.$$eval('div.inline-candidates button .inline-text', (bs) => bs.map((x) => x.textContent)))[0];
await ta.click(); await ta.type('jana', { delay: 15 }); await p.waitForTimeout(500);
const alone = await first();
await ta.fill(''); await ta.type('dui jana', { delay: 15 }); await p.waitForTimeout(500);
const after = await first();
const ok = alone === ALONE && after === AFTER && errs.length === 0;
console.log(JSON.stringify({ alone: alone === ALONE ? 'jana (as expected)' : alone, afterDui: after === AFTER ? 'janna (as expected)' : after, errors: errs.length }));
console.log(ok ? 'PASS context' : 'FAIL context');
await b.close();
