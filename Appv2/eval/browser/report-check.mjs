// "Wrong word? Report it": clipboard text, mailto draft, no request off the origin.
// Usage: node Appv2/eval/browser/<file> [port]  (serve Appv2/dist on that port first; see README.md)
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const URL = `http://127.0.0.1:${process.argv[2] || '4810'}/`;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
await ctx.addInitScript(() => { HTMLAnchorElement.prototype.click = function () { window.__mail = this.href; }; localStorage.setItem('odia.pref.seenIntro', '1'); });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e)));
const ext = []; p.on('request', r => { if (!r.url().startsWith(URL) && !r.url().startsWith('data:')) ext.push(r.url()); });
await p.goto(URL); await p.waitForTimeout(2500);
const ta = p.locator('textarea').first(); await ta.click(); await ta.type('raja ', { delay: 20 }); await p.waitForTimeout(800);
// Phone layout (2026-10-12): the read-back row returns after Done.
if (await p.locator('#done-dock').isVisible()) { await p.locator('#done-dock').click(); await p.waitForTimeout(500); }
await p.locator('#readback .rb-word').first().click(); await p.waitForTimeout(800);
const visible = await p.locator('#picker-report').isVisible();
await p.locator('#picker-report').click(); await p.waitForTimeout(800);
const clip = await p.evaluate(() => navigator.clipboard.readText());
const mail = await p.evaluate(() => window.__mail ?? '');
const toastText = await p.evaluate(() => document.querySelector('#toast-text')?.textContent);
const ok = visible && /Typed: raja/.test(clip) && /U\+0B30 U\+0B1C/.test(clip) && /Offered: /.test(clip) && /App: V1 /.test(clip) && /^mailto:[^?]+@[^?]+\?subject=/.test(mail) && ext.length === 0 && errs.length === 0;
console.log(clip); console.log('mail:', mail.slice(0, 70) + '…'); console.log('toast:', toastText);
console.log(ok ? 'PASS report' : 'FAIL report', JSON.stringify({ visible, ext, errs }));
await b.close();
