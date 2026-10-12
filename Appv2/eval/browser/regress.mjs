// Regression checks kept passing through Run A. node regress.mjs [port]
// Adapted from ../offline3.mjs and ../lead-dict.mjs.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const port = process.argv[2] || '4810';
const URL = `http://127.0.0.1:${port}/`;
const K = '\u0B15\u0B47\u0B2E\u0B3F\u0B24\u0B3F \u0B05\u0B1B'; // kemiti achha
let ok = true;
const check = (name, pass, info) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${info ?? ''}`); if (!pass) ok = false; };
const b = await chromium.launch();
const barTexts = (p) => p.$$eval('div.inline-candidates button', (bs) => bs.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
// What the app will copy / show. #output before A3; the read-back + copy source after.
const shown = (p) => p.evaluate(() => {
  const out = document.querySelector('#output');
  return { area: document.querySelector('textarea').value, output: out ? out.textContent : null, readback: document.querySelector('#readback')?.innerText ?? null };
});
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  const ext = []; p.on('request', (r) => { if (!r.url().startsWith(URL) && !r.url().startsWith('data:')) ext.push(r.url()); });
  await p.goto(URL); await p.waitForTimeout(2500);
  const ta = p.locator('textarea').first();
  // 1. kemiti achha + Space
  await ta.click(); await ta.type('kemiti achha ', { delay: 20 }); await p.waitForTimeout(600);
  let s = await shown(p);
  check('kemiti achha -> Odia in the text box', s.area.trim() === K, JSON.stringify(s));
  // 2. raja: Raja-festival word first with a gloss (lead-dict.mjs)
  await p.fill('textarea', ''); await ta.click(); await ta.type('raja', { delay: 20 }); await p.waitForTimeout(2500);
  let bar = await barTexts(p);
  check('raja: first item has a gloss', bar.length > 0 && /[A-Za-z]/.test(bar[0].replace(/^\d+\s*/, '')), JSON.stringify(bar.slice(0, 3)));
  // 3. dina glosses Day / Poor
  await p.fill('textarea', ''); await ta.click(); await ta.type('dina', { delay: 20 }); await p.waitForTimeout(1200);
  bar = await barTexts(p);
  check('dina: glosses include Day and Poor', /day/i.test(bar.join('|')) && /poor/i.test(bar.join('|')), JSON.stringify(bar.slice(0, 3)));
  // 4. bus + Alt+9 keeps bus; ordinary digits remain literal content.
  await p.fill('textarea', ''); await ta.click(); await ta.type('bus', { delay: 20 }); await p.waitForTimeout(800);
  bar = await barTexts(p);
  const latinLast = await p.evaluate(() => { const bs = [...document.querySelectorAll('div.inline-candidates button.inline-candidate')]; const last = bs[bs.length - 1]; return !!last && !!last.querySelector('.inline-latin'); });
  check('bus: Latin item is last in the bar', latinLast, JSON.stringify(bar));
  await ta.press(`Alt+Digit${bar.length}`); await p.waitForTimeout(400);
  s = await shown(p);
  check('bus + Alt + last number keeps "bus"', s.area === 'bus', JSON.stringify(s.area));
  await ta.type(' bus', { delay: 20 }); await p.waitForTimeout(800);
  bar = await barTexts(p);
  check('next bus lists "bus" first', /bus/.test(bar[0] ?? ''), JSON.stringify(bar.slice(0, 2)));
  check('no page errors', errs.length === 0, JSON.stringify(errs));
  check('no external requests', ext.length === 0, JSON.stringify(ext.slice(0, 3)));
  await ctx.close();
}
// 5. Offline reload + typing (offline3.mjs)
{
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).some((r) => r.active), null, { timeout: 20000 });
  await p.reload(); await p.waitForTimeout(4000);
  const before = await p.evaluate(async () => { const ks = await caches.keys(); let n = 0, bin = 0; for (const k of ks) { const rs = await (await caches.open(k)).keys(); n += rs.length; bin += rs.filter((r) => r.url.endsWith('.bin')).length; } return { n, bin, controlled: !!navigator.serviceWorker.controller }; });
  await ctx.setOffline(true);
  let s = 'reload failed';
  try {
    await p.reload(); await p.waitForTimeout(3000);
    const ta = p.locator('textarea').first(); await ta.click(); await ta.type('kemiti achha ', { delay: 20 });
    await p.waitForTimeout(800);
    s = await shown(p);
  } catch (e) { s = 'ERR ' + String(e).slice(0, 80); }
  check('offline reload + typing works', typeof s === 'object' && s.area.trim() === K, JSON.stringify({ before, s }));
  await ctx.close();
}
await b.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
