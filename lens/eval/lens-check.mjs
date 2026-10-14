// Browser check for the Odia Lens extension (lens/), in Chromium with the
// extension loaded unpacked.
//
//   node lens/build.mjs --test && node lens/eval/lens-check.mjs
//
// NODE_PATH must resolve Playwright (CI installs it; in the Claude Code cloud
// environment it is /opt/node-tools/node_modules). The test build differs from
// the shipped one only by host access to http://127.0.0.1/*, so the check can
// turn the lens on without a toolbar click (it calls the worker's toggle).
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

const ref = (s) => [...s].map((ch) => `&#x${ch.codePointAt(0).toString(16)};`).join('');
const PAGES = {
  '/odia.html': `<!doctype html><meta charset="utf-8"><title>Odia</title>
    <style>body{font:22px/2 sans-serif;margin:40px} span{padding:0 2px}</style>
    <p>Day: <span id="dina">${ref(DINA)}</span> and <span id="dinare">${ref(DINARE)}</span>&#x0964;</p>
    <p>State: <span id="odisha">${ref(ODISHA_PRECOMPOSED)}</span></p>
    <p>Loan: <span id="loan">${ref(loanOdia)}</span></p>
    <p>Phrase: <span id="phrase">${ref(PRABESHAKU)} ${ref(NEI)}</span></p>
    <p id="latin">Only English words here.</p>`,
  '/latin.html': `<!doctype html><meta charset="utf-8"><title>Latin</title><p id="latin" style="font:22px sans-serif">No Odia on this page at all.</p>`,
};
const server = createServer((req, res) => {
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
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const outside = [];
context.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith(origin) && !u.startsWith('chrome-extension://') && !u.startsWith('data:')) outside.push(u);
});
let [worker] = context.serviceWorkers();
worker ??= await context.waitForEvent('serviceworker', { timeout: 15000 });

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
await context.close();
server.close();
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} lens checks passed`);
if (failed.length) process.exit(1);
