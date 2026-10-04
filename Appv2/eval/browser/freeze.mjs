// A-7: long tasks and key latency while the dictionary loads, CPU normal and 4x slower.
// Usage: node Appv2/eval/browser/<file> [port]  (serve Appv2/dist on that port first; see README.md)
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const b = await chromium.launch();
for (const rate of [1, 4]) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('odia.pref.seenIntro', '1');
    window.__long = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await p.goto(`http://127.0.0.1:${process.argv[2] || '4810'}/`);
  const ta = p.locator('textarea').first(); await ta.click();
  // type continuously through the dictionary load window, timing each key until the bar shows it
  const lat = [];
  const words = 'kemiti achha ghara dina'.split('');
  for (const ch of words) {
    const t0 = Date.now(); await p.keyboard.type(ch); lat.push(Date.now() - t0);
  }
  await p.waitForFunction(() => document.querySelectorAll('.dict-gloss').length > 0, null, { timeout: 30000 }).catch(() => {}); const tReady = await p.evaluate(() => Math.round(performance.now()));
  const long = await p.evaluate(() => window.__long);
  const glossed = await p.evaluate(() => document.querySelectorAll('.dict-gloss').length);
  const worst = long.reduce((m, x) => Math.max(m, x[1]), 0);
  console.log(`cpu x${rate}: longest task ${worst} ms; long tasks ${JSON.stringify(long.filter(x => x[1] > 100))}; key latency max ${Math.max(...lat)} ms, median ${lat.sort((a,b)=>a-b)[Math.floor(lat.length/2)]} ms; glosses after: ${glossed}`);
  await ctx.close();
}
await b.close();
