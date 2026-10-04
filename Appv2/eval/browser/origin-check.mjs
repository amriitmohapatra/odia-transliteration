// Word origin (V2.4): "from Persian" next to the meaning, in the panel and on the chip.
// Usage: node Appv2/eval/browser/origin-check.mjs [port] [screenshot-dir]
// (serve Appv2/dist on that port first; see README.md)
//
// SARAKAARA (U+0B38 U+0B30 U+0B15 U+0B3E U+0B30) is "(Pha. sarakaara)" in Praharaj:
// Persian. JALA (U+0B1C U+0B33) is a Sanskrit entry whose "(Hi. Shabdasagar)"
// citation must not make it Hindi. RAJA keeps the owner meaning first.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/x.js')('playwright');
const port = process.argv[2] || '4810';
const shots = process.argv[3] || null;
const SARKAR = '\u0B38\u0B30\u0B15\u0B3E\u0B30';
const JALA = '\u0B1C\u0B33';
let ok = true;
const check = (name, pass, info) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${info ?? ''}`); if (!pass) ok = false; };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`http://127.0.0.1:${port}/`); await p.waitForTimeout(2500);
const ta = p.locator('textarea').first(); await ta.click();

const typeWord = async (w) => { await ta.fill(''); await ta.type(w, { delay: 15 }); await p.waitForTimeout(2000); };
const panelEntry = (word) => p.$$eval('#dict-panel .dict-entry', (els, word) => {
  const e = els.find((x) => x.querySelector('.dict-word')?.textContent === word);
  if (!e) return null;
  return {
    origin: e.querySelector('.dict-tag-origin')?.textContent ?? null,
    owner: e.querySelector('.dict-owner')?.innerText.replace(/\s+/g, ' ') ?? null,
    firstBox: e.querySelector('.dict-modern, .dict-def')?.className ?? null,
  };
}, word);
const chip = (word) => p.$$eval('div.inline-candidates button.inline-candidate', (bs, word) => {
  const btn = bs.find((x) => x.querySelector('.inline-text')?.textContent === word);
  if (!btn) return null;
  return {
    gloss: btn.querySelector('.dict-gloss')?.textContent ?? null,
    origin: btn.querySelector('.dict-gloss .dict-origin')?.textContent ?? null,
    aria: btn.getAttribute('aria-label'),
  };
}, word);

// 1. sarakaara: panel says "from Persian"; the chip carries it as a suffix.
await typeWord('sarakaara');
let e = await panelEntry(SARKAR);
check('sarakaara: panel entry shows "from Persian"', e?.origin === 'from Persian', JSON.stringify(e));
let c = await chip(SARKAR);
check('sarakaara: chip has the origin suffix', /from Persian/.test(c?.origin ?? ''), JSON.stringify(c));
check('sarakaara: accessible name ends ", from Persian"', /, from Persian$/.test(c?.aria ?? ''), JSON.stringify(c?.aria));
if (shots) await p.screenshot({ path: `${shots}/origin-sarakaara.png` });

// 2. jala: Sanskrit, not Hindi (the Shabdasagar citation), and no chip suffix.
await typeWord('jala');
e = await panelEntry(JALA);
check('jala: panel says Sanskrit (tatsama), not Hindi', e?.origin === 'from Sanskrit (tatsama)', JSON.stringify(e));
c = await chip(JALA);
check('jala: no origin suffix on a Sanskrit word', c !== null && c.origin === null, JSON.stringify(c));

// 3. raja: the owner meaning is still the first box of the entry, and first on the chip.
await typeWord('raja');
const bar = await p.$$eval('div.inline-candidates button', (bs) => bs.slice(0, 1).map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
check('raja: owner meaning first on the chip', /Raja festival/.test(bar[0] ?? ''), JSON.stringify(bar));
const owner = await p.$$eval('#dict-panel .dict-entry', (els) => {
  const first = els[0];
  return first ? first.querySelector('.dict-modern, .dict-def')?.classList.contains('dict-owner') ?? false : false;
});
check('raja: owner meaning is the first box in the panel', owner);

check('no page errors', errs.length === 0, JSON.stringify(errs));
await b.close();
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
