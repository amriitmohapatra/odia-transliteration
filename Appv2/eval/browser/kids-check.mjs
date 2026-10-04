// Adult vs kids edition: switch shown/hidden, listed words only under their own keys / never.
// Usage: node Appv2/eval/browser/kids-check.mjs <adult-port> <kids-port>
//   (build the kids edition with APP_EDITION=kids into its own folder and serve it).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const off = new Set(readFileSync(new URL('../../../core/data/labels.tsv', import.meta.url), 'utf8').split('\n')
  .filter((l) => l && !l.startsWith('#') && /\t(offensive|coarse)/.test(l)).map((l) => l.split('\t')[0]));
const keys = ['banda', 'baanda', 'pela', 'pella', 'gandi', 'gaandi', 'raandi', 'bedha', 'chhodi', 'giha'];
const b = await chromium.launch();
for (const [name, port] of [['adult', process.argv[2] || '4817'], ['kids', process.argv[3] || '4818']]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => localStorage.setItem('odia.pref.seenIntro', '1'));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${port}/`); await p.waitForTimeout(2500);
  const switchVisible = await p.evaluate(() => { const el = document.getElementById('toggle-family-safe')?.closest('.setting'); return !!el && getComputedStyle(el).display !== 'none'; });
  const ta = p.locator('textarea').first(); await ta.click();
  const found = [];
  for (const k of keys) {
    await ta.fill(''); await ta.type(k, { delay: 10 }); await p.waitForTimeout(500);
    const bar = await p.$$eval('div.inline-candidates button .inline-text', (bs) => bs.map((x) => x.textContent));
    const hits = bar.filter((w) => off.has(w));
    if (hits.length) found.push(`${k}:${hits.length}`);
  }
  const title = await p.title();
  console.log(name.padEnd(5), JSON.stringify({ title, switchVisible, listedWordsShownForKeys: found, errors: errs.length }));
  await ctx.close();
}
await b.close();
