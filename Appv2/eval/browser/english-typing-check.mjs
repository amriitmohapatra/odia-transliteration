// "=word" in the text box (2026-11-03): type an English word after "=" and the
// suggestion bar offers Odia words for it (src/dictionary/english-index.ts), each with
// its meaning; Space takes the first, a number another, Keep the English. Picks never
// teach the phonetic ranker. Build Appv2 and serve dist first.
// Usage: NODE_PATH=<playwright modules> node english-typing-check.mjs [port]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = new URL(process.env.APP_URL || `http://127.0.0.1:${process.argv[2] || '4810'}/`).href;
const GAI = 'ଗାଈ'; // cow
const HATI = 'ହାତୀ'; // elephant
// A stand-in for the generated list (english-api.bin, V2.21), served in place of the real file.
const BABYSIT = '\u0b2a\u0b3f\u0b32\u0b3e \u0b1c\u0b17\u0b3f\u0b2c\u0b3e';
const KULA = '\u0b15\u0b42\u0b33';
const API_FIXTURE = gzipSync(Buffer.from([
  `babysit\tphrase\t\t${BABYSIT}`,
  `riverbank\tword\tmoney\t\u0b2c\u0b4d\u0b5f\u0b3e\u0b19\u0b4d\u0b15`,
  `riverbank\tword\triver side\t${KULA}`,
].join('\n') + '\n', 'utf8'));

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log('PASS', message); };

try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    // No service worker: it would fetch english-api.bin itself, past the stand-in route.
    const context = await browser.newContext({ viewport, hasTouch: name === 'phone', serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('odia.pref.seenIntro', '1'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/english-api-*.bin', (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: API_FIXTURE }));
    await page.goto(url);
    const box = page.locator('#roman');
    await box.waitFor();
    await page.waitForFunction(() => !document.querySelector('.status-loading'));
    const bar = () => page.$$eval('div.inline-candidates:not([hidden]) button.inline-candidate', (bs) => bs.map((b) => ({
      text: b.querySelector('.inline-text, .inline-latin')?.textContent ?? '', label: b.getAttribute('aria-label') ?? '' })));

    await box.click();
    await box.pressSequentially('=cow', { delay: 15 });
    await page.waitForFunction(() => document.querySelector('div.inline-candidates:not([hidden]) .inline-text'));
    let items = await bar();
    check(items[0]?.text === GAI, `${name}: =cow offers ଗାଈ first (${items.map((i) => i.text).join(' ')})`);
    check(items.at(-1)?.text === 'cow', `${name}: the English word is last, to keep`);
    await page.waitForFunction(() => /cow/i.test(document.querySelector('div.inline-candidates .inline-candidate')?.getAttribute('aria-label') ?? ''));
    check(true, `${name}: the first suggestion carries its meaning (cow)`);
    await box.press('Space');
    await page.waitForFunction((v) => document.getElementById('roman').value === v, `${GAI} `);
    check(true, `${name}: Space types ଗାଈ and removes the "="`);

    // A number picks another word; Keep keeps the English without the "=".
    await box.pressSequentially('=elephant', { delay: 15 });
    await page.waitForFunction(() => document.querySelector('div.inline-candidates:not([hidden]) .inline-text'));
    items = await bar();
    check(items[0]?.text === HATI, `${name}: =elephant offers ହାତୀ first`);
    await box.press('Alt+2');
    await page.waitForFunction((v) => document.getElementById('roman').value === v, `${GAI} ${items[1].text}`);
    check(true, `${name}: Alt+2 types the second word (${items[1].text})`);
    await box.press('Space');
    await box.pressSequentially('=water', { delay: 15 });
    await page.waitForFunction(() => document.querySelector('div.inline-candidates:not([hidden]) .inline-latin'));
    items = await bar();
    await page.locator('div.inline-candidates button.inline-candidate').nth(items.length - 1).click();
    await page.waitForFunction(() => /water$/.test(document.getElementById('roman').value));
    check(!(await box.inputValue()).includes('='), `${name}: Keep types "water", without the "="`);

    // The generated list (loaded in the background): a phrase, and both senses of a word.
    await box.fill('');
    await page.waitForTimeout(2800); // the background load starts 2.5 s after the page is ready
    await box.pressSequentially('=babysit', { delay: 15 });
    await page.waitForFunction(() => document.querySelector('div.inline-candidates:not([hidden]) .inline-text'));
    items = await bar();
    check(items[0]?.text === BABYSIT, `${name}: =babysit offers the Odia phrase from the generated list`);
    await box.press('Space');
    await page.waitForFunction((v) => document.getElementById('roman').value === v, `${BABYSIT} `);
    check(true, `${name}: Space types the whole phrase`);
    await box.fill('');
    await box.pressSequentially('=riverbank', { delay: 15 });
    await page.waitForFunction(() => document.querySelectorAll('div.inline-candidates:not([hidden]) .inline-text').length >= 2);
    items = await bar();
    check(items[1]?.text === KULA, `${name}: the second sense comes second, not pushed out`);

    // Unknown English: no bar, the text stays as typed.
    await box.fill('');
    await box.pressSequentially('=xyzzyq', { delay: 15 });
    await page.waitForTimeout(400);
    check((await bar()).length === 0, `${name}: an unknown word after "=" shows no suggestions`);

    // The picks taught nothing: "cow" typed as Odia sounds still gives sound-alikes.
    await box.fill('');
    await box.pressSequentially('cow', { delay: 15 });
    await page.waitForFunction(() => document.querySelector('div.inline-candidates:not([hidden]) .inline-text'));
    items = await bar();
    check(items[0]?.text !== GAI, `${name}: plain "cow" is not taught ଗାଈ (${items[0]?.text})`);
    check(errors.length === 0, `${name}: no page errors (${errors.join('; ')})`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${checks} english typing checks passed`);
