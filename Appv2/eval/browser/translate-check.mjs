// In English (V3, src/translate.ts) against a stand-in for /api/translate (a Playwright
// route; no Claude call, no key). Checks that nothing is sent while the Settings switch
// is off, what is sent when it is on, that the English shows under "Reads as" with a
// machine-translation note, that it goes when the text changes, and that a server
// error reads as a message. Build Appv2 and serve dist first.
// Usage: node translate-check.mjs [port]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = new URL(process.env.APP_URL || `http://127.0.0.1:${process.argv[2] || '4810'}/`).href;
const BHALA = 'ଭଲ'; // good
const ODISHA = 'ଓଡ଼ିଶା';

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log('PASS', message); };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('odia.pref.seenIntro', '1'));
  const page = await context.newPage();
  const errors = []; const external = []; const calls = [];
  let reply = { status: 200, body: { ok: true, translation: 'Good, good.', provider: 'claude', model: 'stand-in', cached: false } };
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await page.route('**/api/translate', async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) });
  });
  const settings = async (fn) => {
    await page.locator('#open-settings').click();
    await fn();
    await page.locator('#settings .picker-panel [data-settings-close]').click();
  };

  await page.goto(url);
  await page.locator('#roman').waitFor();

  // Switch off (the default): no button, nothing sent, the page says so.
  await page.locator('#roman').fill(`${BHALA} ${BHALA}`);
  await page.locator('#readback-row').waitFor();
  check(await page.locator('#translate').isHidden(), 'In English is hidden while Translate online is off');
  check(await page.locator('#translation-row').isHidden(), 'no English row by default');
  check((await page.locator('#privacy-note').innerText()).startsWith('Everything runs on this device'), 'by default the page says nothing is sent');

  // Switch on: the button shows, the switch is remembered, the page names Anthropic.
  await settings(() => page.locator('#toggle-translate-online').check());
  check(await page.evaluate(() => localStorage.getItem('odia.pref.translateOnline')) === '1', 'the Translate online switch is remembered');
  check(await page.locator('#translate').isVisible(), 'In English shows beside Listen when the switch is on');
  check((await page.locator('#privacy-note').innerText()).includes('Anthropic'), 'the line under the page names where the text goes');
  check(calls.length === 0, 'turning the switch on sends nothing by itself');

  // Press: the Odia goes out once, as typed text; the English shows with its note.
  await page.locator('#translate').click();
  await page.locator('#translation-row').waitFor();
  check(calls.length === 1 && calls[0].text === `${BHALA} ${BHALA}` && calls[0].source === 'typed', 'In English sends the Odia once, marked as typed text');
  check(await page.locator('#translation').innerText() === 'Good, good.', 'the English shows under Reads as');
  check((await page.locator('#translation-note').innerText()).includes('Machine translation by Claude (Anthropic)'), 'the note says it is a machine translation and by whom');

  // The text changes: the English goes (it would describe older text).
  await page.locator('#roman').fill(`${BHALA} ${ODISHA}`);
  await page.waitForFunction(() => document.getElementById('translation-row')?.hidden === true);
  check(true, 'editing the text hides the old English');

  // A server error reads as a message, and nothing stale is shown.
  reply = { status: 503, body: { ok: false, error: 'Translation is not set up on the server yet.' } };
  await page.locator('#translate').click();
  await page.waitForFunction(() => document.getElementById('status')?.textContent.includes('not set up'));
  check(await page.locator('#translation-row').isHidden(), 'a server error shows the message and no English');
  check(await page.locator('#translate').isEnabled(), 'the button is ready again after an error');

  // Switch off again: the button and any English go, and the page says nothing is sent.
  reply = { status: 200, body: { ok: true, translation: 'Good Odisha.', provider: 'claude' } };
  await page.locator('#translate').click();
  await page.locator('#translation-row').waitFor();
  await settings(() => page.locator('#toggle-translate-online').uncheck());
  check(await page.locator('#translate').isHidden() && await page.locator('#translation-row').isHidden(), 'turning the switch off hides the button and the English');
  check((await page.locator('#privacy-note').innerText()).startsWith('Everything runs on this device'), 'with the switch off, the page again says nothing is sent');
  const sent = calls.length;
  await page.reload();
  await page.locator('#roman').waitFor();
  check(await page.locator('#translate').isHidden() && calls.length === sent, 'after a reload the switch stays off and nothing is sent');

  check(external.length === 0, `no request leaves the site (${external.join(', ')})`);
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  await context.close();
} finally {
  await browser.close();
}
console.log(`\n${checks} translate checks passed`);
