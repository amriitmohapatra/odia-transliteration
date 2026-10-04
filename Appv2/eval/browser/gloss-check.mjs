// Owner meanings (core/data/glosses.tsv) shown first in the bar and the panel.
// Usage: node Appv2/eval/browser/<file> [port]  (serve Appv2/dist on that port first; see README.md)
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const port = process.argv[2] || '4810';
await p.goto(`http://127.0.0.1:${port}/`); await p.waitForTimeout(2500);
const ta = p.locator('textarea').first(); await ta.click();
for (const w of ['raja', 'kemiti', 'dina']) {
  await ta.fill(''); await ta.type(w, { delay: 15 }); await p.waitForTimeout(1800);
  const bar = await p.$$eval('div.inline-candidates button', bs => bs.slice(0, 2).map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  console.log(w.padEnd(7), JSON.stringify(bar));
}
const panel = await p.$$eval('.dict-owner', els => els.map(e => e.innerText.replace(/\s+/g,' ')).slice(0,2));
console.log('panel owner box:', JSON.stringify(panel), 'errors:', errs.length);
await b.close();
