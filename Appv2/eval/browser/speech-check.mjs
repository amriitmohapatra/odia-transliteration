// Read-aloud and voice typing (V3, src/speech.ts) against a stand-in for /api/speak
// and /api/listen (Playwright routes; no Sarvam call, no key). Checks that nothing
// is sent while the Settings switches are off, what is sent when they are on, and
// that the typed Odia lands in the text box. A fake microphone stands in for speech.
// Build Appv2 and serve dist first. Usage: node speech-check.mjs [port]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = new URL(process.env.APP_URL || `http://127.0.0.1:${process.argv[2] || '4810'}/`).href;
const BHALA = '\u0b2d\u0b32'; // good
const ODISHA = '\u0b13\u0b21\u0b3c\u0b3f\u0b36\u0b3e';

/** A valid WAV of 0.1 s of silence, so the page can play the stand-in's answer. */
function silentWav() {
  const rate = 8000, n = 800, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log('PASS', message); };

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(['microphone'], { origin: new URL(url).origin });
  await context.addInitScript(() => localStorage.setItem('odia.pref.seenIntro', '1'));
  const page = await context.newPage();
  const errors = []; const external = []; const speakCalls = []; const listenCalls = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith(url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await page.route('**/api/speak', async (route) => {
    speakCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() });
  });
  await page.route('**/api/listen', async (route) => {
    const r = route.request();
    listenCalls.push({ type: r.headers()['content-type'], size: r.postDataBuffer()?.length ?? 0 });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: ODISHA, model: 'stand-in' }) });
  });
  await page.goto(url);
  await page.locator('#roman').waitFor();
  const deviceVoice = await page.evaluate(() => speechSynthesis.getVoices().some((v) => /^(or|ory|od)([-_]|$)/i.test(v.lang)));
  console.log(`(this Chromium has ${deviceVoice ? 'an' : 'no'} Odia voice)`);

  // Switches off (the default): Listen explains, Speak is hidden, nothing is sent.
  check((await page.locator('#privacy-note').innerText()).startsWith('Everything runs on this device'), 'by default the page says nothing is sent');
  await page.locator('#roman').fill(`${BHALA} ${BHALA}`);
  await page.locator('#readback-row').waitFor();
  check(await page.locator('#speak').isVisible(), 'Listen shows on the Reads as line');
  check(await page.locator('#voice').isHidden(), 'Speak is hidden while Voice typing is off');
  if (!deviceVoice) {
    await page.locator('#speak').click();
    await page.waitForFunction(() => document.getElementById('status')?.textContent.includes('Read aloud online'));
    check(speakCalls.length === 0, 'with the switch off and no Odia voice, Listen sends nothing and points to Settings');
  }

  // Read aloud online on: the Odia goes to /api/speak, once, and plays.
  await page.locator('#open-settings').click();
  await page.locator('#toggle-speak-online').check();
  check(await page.evaluate(() => localStorage.getItem('odia.pref.speakOnline')) === '1', 'the Read aloud online switch is remembered');
  check((await page.locator('#privacy-note').innerText()).includes('Sarvam'), 'the line under the page says what goes online');
  await page.locator('#settings .picker-panel [data-settings-close]').click();
  if (!deviceVoice) {
    await page.locator('#speak').click();
    await page.waitForFunction(() => true);
    await page.waitForTimeout(300);
    check(speakCalls.length === 1 && speakCalls[0].text === `${BHALA} ${BHALA}`, 'Listen sends the Odia text to /api/speak');
    check(await page.locator('#status').evaluate((el) => !el.classList.contains('status-warn')), 'the stand-in audio plays without an error');
  }

  // Voice typing on: Speak records (fake microphone), Stop sends, the Odia is typed at the caret.
  await page.locator('#open-settings').click();
  await page.locator('#toggle-listen-online').check();
  await page.locator('#settings .picker-panel [data-settings-close]').click();
  check(await page.locator('#voice').isVisible(), 'Speak shows when Voice typing is on');
  await page.locator('#roman').focus();
  await page.locator('#roman').press('End');
  await page.locator('#voice').click();
  await page.waitForFunction(() => document.getElementById('voice')?.getAttribute('aria-pressed') === 'true');
  check(true, 'Speak starts recording (the button shows it is pressed)');
  await page.waitForTimeout(700);
  await page.locator('#voice').click();
  await page.waitForFunction((o) => document.getElementById('roman').value.includes(o), ODISHA);
  check(listenCalls.length === 1 && /^audio\/(webm|ogg|mp4)/.test(listenCalls[0].type) && listenCalls[0].size > 0,
    `Stop sends the recording to /api/listen (${listenCalls[0]?.type}, ${listenCalls[0]?.size} bytes)`);
  check(await page.locator('#roman').inputValue() === `${BHALA} ${BHALA} ${ODISHA} `, 'the heard Odia is typed after the text, with spaces');
  check(await page.locator('#voice').getAttribute('aria-pressed') === 'false', 'Speak is ready again');

  // Voice typing off again: the button goes away.
  await page.locator('#open-settings').click();
  await page.locator('#toggle-listen-online').uncheck();
  await page.locator('#settings .picker-panel [data-settings-close]').click();
  check(await page.locator('#voice').isHidden(), 'turning Voice typing off hides Speak');
  await page.locator('#open-settings').click();
  await page.locator('#toggle-speak-online').uncheck();
  await page.locator('#settings .picker-panel [data-settings-close]').click();
  check((await page.locator('#privacy-note').innerText()).startsWith('Everything runs on this device'), 'with both switches off, the page again says nothing is sent');

  check(external.length === 0, `no request leaves the site (${external.join(', ')})`);
  check(errors.length === 0, `no page errors (${errors.join('; ')})`);
  await context.close();
} finally {
  await browser.close();
}
console.log(`\n${checks} speech checks passed`);
