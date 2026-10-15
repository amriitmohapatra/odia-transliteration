// Browser check for the Odia Lens extension (lens/), in Chromium with the
// extension loaded unpacked.
//
//   node lens/build.mjs --test && node lens/eval/lens-check.mjs
//
// NODE_PATH must resolve Playwright (CI installs it; in the Claude Code cloud
// environment it is /opt/node-tools/node_modules). The test build differs from
// the shipped one only by host access to all sites, so the check can turn the
// lens on and take screenshots without a toolbar click (it calls the worker's
// toggle). Picture mode is checked on an image of Odia words drawn with the
// app's Noto Sans Oriya.
// Odia is written as \u escapes and HTML character references.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const EXT = fileURLToPath(new URL('../dist-test', import.meta.url));

const DINA = '\u0B26\u0B3F\u0B28'; // day: owner meaning "day"
const DINARE = DINA + '\u0B30\u0B47'; // in the day: stem match
const PRABESHAKU = '\u0B2A\u0B4D\u0B30\u0B2C\u0B47\u0B36\u0B15\u0B41'; // to (the) entry
const NEI = '\u0B28\u0B47\u0B07'; // after -ku: over, regarding
const ODISHA_CANONICAL = '\u0B13\u0B21\u0B3C\u0B3F\u0B36\u0B3E';
const ODISHA_PRECOMPOSED = '\u0B13\u0B5C\u0B3F\u0B36\u0B3E'; // as some web pages write it
// An English loan word from the app's list (Appv2/src/dictionary/loans.tsv).
const [loanEnglish, loanOdia] = readFileSync(new URL('../../Appv2/src/dictionary/loans.tsv', import.meta.url), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')).find((c) => c[2] === 'en');

// Picture mode: three common words, drawn into an image (OCR must read them).
const PICTURE_WORDS = [
  '\u0B38\u0B30\u0B15\u0B3E\u0B30', // government
  '\u0B30\u0B3E\u0B1C\u0B4D\u0B5F', // state
  '\u0B26\u0B3F\u0B28\u0B30\u0B47', // in the day
];
const FONT = readFileSync(new URL('../../web/src/fonts/noto-sans-oriya-oriya-400-normal.woff2', import.meta.url));

const ref = (s) => [...s].map((ch) => `&#x${ch.codePointAt(0).toString(16)};`).join('');
const PAGES = {
  '/odia.html': `<!doctype html><meta charset="utf-8"><title>Odia</title>
    <style>body{font:22px/2 sans-serif;margin:40px} span{padding:0 2px}</style>
    <p>Day: <span id="dina">${ref(DINA)}</span> and <span id="dinare">${ref(DINARE)}</span>&#x0964;</p>
    <p>State: <span id="odisha">${ref(ODISHA_PRECOMPOSED)}</span></p>
    <p>Loan: <span id="loan">${ref(loanOdia)}</span></p>
    <p>Phrase: <span id="phrase">${ref(PRABESHAKU)} ${ref(NEI)}</span></p>
    <p id="latin">Only English words here.</p>`,
  '/picture.html': `<!doctype html><meta charset="utf-8"><title>Picture</title>
    <style>@font-face{font-family:Pic;src:url(/noto.woff2)} body{margin:40px}</style>
    <p id="label" style="font:16px sans-serif">An image with Odia words:</p>
    <img id="pic" alt="">
    <script type="module">
      const words = ${JSON.stringify(PICTURE_WORDS)};
      await document.fonts.load('40px Pic', words.join(' '));
      const c = document.createElement('canvas');
      c.width = 760; c.height = 90;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#111'; g.font = '40px Pic'; g.textBaseline = 'middle';
      let x = 20; const boxes = [];
      for (const w of words) { const m = g.measureText(w).width; g.fillText(w, x, 45); boxes.push([x, m]); x += m + 30; }
      const img = document.getElementById('pic');
      img.src = c.toDataURL('image/png');
      await img.decode();
      window.__boxes = boxes;
    </script>`,
  '/latin.html': `<!doctype html><meta charset="utf-8"><title>Latin</title><p id="latin" style="font:22px sans-serif">No Odia on this page at all.</p>`,
};
const server = createServer((req, res) => {
  if (req.url === '/noto.woff2') {
    res.writeHead(200, { 'content-type': 'font/woff2' });
    return res.end(FONT);
  }
  const body = PAGES[req.url];
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body ?? 'not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1200, height: 900 },
  // The owner's Mac: two device pixels per CSS pixel (picture mode maps between them).
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const outside = [];
context.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(origin) && !u.startsWith('chrome-extension://') && !u.startsWith('data:')) outside.push(u);
});
// The extension's own worker (background.js), not any other worker the browser starts.
const isLens = (w) => w.url().endsWith('/background.js');
let worker = context.serviceWorkers().find(isLens);
worker ??= await context.waitForEvent('serviceworker', { predicate: isLens, timeout: 15000 });
// Wait until the worker's extension APIs are there (a just-started worker can answer before).
for (let i = 0; i < 50 && !(await worker.evaluate(() => typeof chrome?.tabs?.query === 'function').catch(() => false)); i++) {
  await new Promise((r) => setTimeout(r, 100));
  worker = context.serviceWorkers().find(isLens) ?? worker;
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, pass: false });
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const toggle = () => worker.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await self.odiaLensToggle(tab.id);
  return chrome.action.getBadgeText({ tabId: tab.id });
});
const card = page.locator('odia-lens .card');
async function hover(id) {
  await page.mouse.move(5, 5);
  const box = await page.locator(`#${id}`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
}
const cardText = async () => {
  await card.waitFor({ state: 'visible', timeout: 5000 });
  return card.innerText();
};

await page.goto(`${origin}/odia.html`);

await check('turning the lens on sets the badge; no card before pointing at a word', async () => {
  assert.equal(await toggle(), 'ON');
  assert.equal(await card.isVisible().catch(() => false), false);
});

let firstMs = 0;
await check('a headword: pronunciation and meaning (owner meaning first)', async () => {
  const t0 = Date.now();
  await hover('dina');
  const text = await cardText();
  firstMs = Date.now() - t0;
  assert.ok(text.includes(DINA), text);
  assert.ok(text.includes('dina'), `pronunciation: ${text}`);
  assert.ok(/\bday\b/.test(text), `meaning: ${text}`);
});

await check('an inflected word: explained from its stem and ending ("day + in, at, on")', async () => {
  await hover('dinare');
  await page.waitForFunction(() => document.querySelector('odia-lens')?.shadowRoot?.querySelector('.card')?.textContent?.includes('explained from its ending'));
  const text = await cardText();
  assert.ok(text.includes('day + in, at, on'), text);
  assert.ok(!text.includes('Approximate'), text);
});

await check('a precomposed nukta letter on the page: the card shows the canonical word', async () => {
  await hover('odisha');
  await page.waitForFunction((w) => document.querySelector('odia-lens')?.shadowRoot?.querySelector('.word')?.textContent === w, ODISHA_CANONICAL);
  const text = await cardText();
  assert.ok(!text.includes('\u0B5C'), 'no precomposed letter in the card');
});

await check(`a loan word: "English loan word: ${loanEnglish}"`, async () => {
  await hover('loan');
  await page.waitForFunction(() => document.querySelector('odia-lens')?.shadowRoot?.querySelector('.card')?.textContent?.includes('English loan word'));
  assert.ok((await cardText()).includes(`English loan word: ${loanEnglish}`));
});

await check('a phrase: nei after a word in -ku reads "over; regarding" (AI-written, in this phrase)', async () => {
  await page.mouse.move(5, 5);
  const box = await page.locator('#phrase').boundingBox();
  // The second word of the span: a point three quarters along it.
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2, { steps: 3 });
  await page.waitForFunction((w) => document.querySelector('odia-lens')?.shadowRoot?.querySelector('.word')?.textContent === w, NEI);
  const text = await cardText();
  assert.ok(text.includes('over; regarding'), text);
  assert.ok(text.includes('in this phrase'), text);
  assert.ok(!/\bNot\b/.test(text), text);
});

await check('Latin text shows no card; Escape closes a card', async () => {
  await hover('dina');
  await cardText();
  await page.keyboard.press('Escape');
  await card.waitFor({ state: 'hidden', timeout: 2000 });
  await hover('latin');
  await page.waitForTimeout(400);
  assert.equal(await card.isVisible(), false);
});

let pictureMs = 0;
await check('picture mode: a word in an image is read by OCR and explained ("read from the picture")', async () => {
  await page.goto(`${origin}/picture.html`);
  await page.waitForFunction(() => Array.isArray(window.__boxes));
  assert.equal(await toggle(), 'ON');
  const img = await page.locator('#pic').boundingBox();
  const boxes = await page.evaluate(() => window.__boxes);
  const at = (i) => ({ x: img.x + boxes[i][0] + boxes[i][1] / 2, y: img.y + 45 });
  await page.mouse.move(5, 5);
  const t0 = Date.now();
  await page.mouse.move(at(0).x, at(0).y, { steps: 3 });
  await page.waitForFunction(
    (w) => document.querySelector('odia-lens')?.shadowRoot?.querySelector('.word')?.textContent === w,
    PICTURE_WORDS[0],
    { timeout: 30000 },
  );
  pictureMs = Date.now() - t0;
  const text = await cardText();
  assert.ok(text.includes('Read from the picture'), text);
  assert.ok(/government/i.test(text), text);
});

await check('picture mode: the next word on the same line comes from the cached reading (no new screenshot)', async () => {
  const img = await page.locator('#pic').boundingBox();
  const boxes = await page.evaluate(() => window.__boxes);
  await page.mouse.move(img.x + boxes[1][0] + boxes[1][1] / 2, img.y + 45, { steps: 3 });
  await page.waitForFunction(
    (w) => document.querySelector('odia-lens')?.shadowRoot?.querySelector('.word')?.textContent === w,
    PICTURE_WORDS[1],
    { timeout: 3000 },
  ).catch(async (error) => {
    throw new Error(`${error.message}; card: ${await card.innerText().catch(() => '(none)')}`);
  });
  assert.ok(/state/i.test(await cardText()));
  assert.equal(await toggle(), '');
  await page.goto(`${origin}/odia.html`);
  assert.equal(await toggle(), 'ON');
});

let frameMs = 0;
await check('frame (Alt+Shift+F): every word inside it is read together, in order, with meanings', async () => {
  await page.goto(`${origin}/picture.html`);
  await page.waitForFunction(() => Array.isArray(window.__boxes));
  const img = await page.locator('#pic').boundingBox();
  // Lens on, pointer over the picture: the frame opens around the pointer.
  assert.equal(await toggle(), 'ON');
  await page.mouse.move(img.x + 300, img.y + 120, { steps: 2 });
  await page.mouse.move(img.x + 300, img.y + 45, { steps: 2 });
  const t0 = Date.now();
  const badge = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await self.odiaLensToggle(tab.id, 'frame');
    return chrome.action.getBadgeText({ tabId: tab.id });
  });
  assert.equal(badge, 'ON');
  const panel = page.locator('odia-lens .panel');
  await page.waitForFunction(
    () => (document.querySelector('odia-lens')?.shadowRoot?.querySelectorAll('.chip') ?? []).length >= 3,
    null,
    { timeout: 30000 },
  ).catch(async (error) => {
    const shown = await page.evaluate(() => {
      const r = document.querySelector('odia-lens')?.shadowRoot;
      return `frame hidden=${r?.querySelector('.frame')?.hidden} panel=${r?.querySelector('.panel')?.textContent}`;
    });
    throw new Error(`${error.message}; ${shown}`);
  });
  frameMs = Date.now() - t0;
  const words = await page.evaluate(() =>
    [...document.querySelector('odia-lens').shadowRoot.querySelectorAll('.chip-word')].map((e) => e.textContent));
  assert.deepEqual(words, PICTURE_WORDS, `words: ${words.join(' ')}`);
  const text = await page.evaluate(() => document.querySelector('odia-lens').shadowRoot.querySelector('.panel').textContent);
  assert.ok(/government/i.test(text) && /state/i.test(text), text);
  assert.ok(await page.evaluate(() => document.querySelector('odia-lens').shadowRoot.querySelector('.line-read')?.textContent.length > 0));
  // A word's chip opens its full card inside the panel.
  await page.locator('odia-lens .chip').first().click();
  await page.waitForFunction(() => {
    const r = document.querySelector('odia-lens')?.shadowRoot;
    return r?.querySelector('.panel .detail .detail-word') && r.querySelector('.chip[aria-pressed="true"]');
  });
  // Any edge resizes: drag the right edge 80 px out, the left edge 40 px in.
  const frameBox = () => page.evaluate(() => {
    const r = document.querySelector('odia-lens').shadowRoot.querySelector('.frame').getBoundingClientRect();
    return { x: r.x, w: r.width, y: r.y, h: r.height };
  });
  const dragEdge = async (edge, dx, dy) => {
    const b = await page.locator(`odia-lens .${edge}`).boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  };
  const before = await frameBox();
  await dragEdge('edge.e', 80, 0);
  const wider = await frameBox();
  assert.ok(Math.abs(wider.w - before.w - 80) <= 2 && Math.abs(wider.x - before.x) <= 1, `east: ${JSON.stringify([before, wider])}`);
  await dragEdge('edge.w', 40, 0);
  const narrower = await frameBox();
  assert.ok(Math.abs(narrower.w - wider.w + 40) <= 2 && Math.abs(narrower.x - wider.x - 40) <= 2, `west: ${JSON.stringify([wider, narrower])}`);
  await dragEdge('edge.s', 0, 30);
  const taller = await frameBox();
  assert.ok(Math.abs(taller.h - narrower.h - 30) <= 2, `south: ${JSON.stringify([narrower, taller])}`);
  // Escape closes the frame.
  await page.keyboard.press('Escape');
  await page.locator('odia-lens .frame').waitFor({ state: 'hidden', timeout: 2000 });
  assert.equal(await toggle(), '');
  await page.goto(`${origin}/odia.html`);
  assert.equal(await toggle(), 'ON');
});

await check('turning it off removes the lens from the page', async () => {
  assert.equal(await toggle(), '');
  await hover('dina');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('odia-lens').count(), 0);
});

await check('a page with no Odia: on, pointer moves, nothing shown, no errors', async () => {
  await page.goto(`${origin}/latin.html`);
  assert.equal(await toggle(), 'ON');
  await hover('latin');
  await page.waitForTimeout(400);
  assert.equal(await card.isVisible().catch(() => false), false);
  assert.deepEqual(errors, []);
});

await check('no request leaves the computer', async () => {
  assert.deepEqual(outside, []);
});

console.log(`\nfirst card after the worker started: ${firstMs} ms`);
console.log(`first picture word (screenshot, OCR engine start, line read): ${pictureMs} ms`);
console.log(`frame read (three words, with cards): ${frameMs} ms`);
await context.close();
server.close();
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} lens checks passed`);
if (failed.length) process.exit(1);
