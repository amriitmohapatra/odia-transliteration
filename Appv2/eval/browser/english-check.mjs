// Build Appv2 and serve dist first. Usage: node english-check.mjs [port]
// APP_URL overrides the local URL for deployment checks.
// Playwright resolves locally or via NODE_PATH. Optional CHROMIUM_EXECUTABLE_PATH.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = new URL(process.env.APP_URL || `http://127.0.0.1:${process.argv[2] || '4810'}/`).href;
const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log('PASS', message); };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  const page = await context.newPage();
  const errors = []; const external = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (!request.url().startsWith(url) && !request.url().startsWith('data:')) external.push(request.url()); });
  await page.goto(url);
  await page.locator('.dict-direction').selectOption('english');
  const search = page.locator('.dict-search');
  await search.fill('meeting');
  await page.waitForFunction(() => document.querySelectorAll('.dict-english-entry').length === 2);
  const text = await page.locator('.dict-body').innerText();
  check(text.includes('Translation') && text.includes('English loan spelling'), 'meeting distinguishes translation and loan spelling');
  check(text.includes('\u0b2c\u0b48\u0b20\u0b15') && text.includes('\u0b2e\u0b3f\u0b1f\u0b3f\u0b02'), 'meeting has the two proposed Odia forms');
  check(text.includes('awaiting native-speaker review'), 'seed status is visible');
  await search.fill('  PHONE   CALL  ');
  await page.waitForFunction(() => document.querySelector('.dict-english-entry')?.textContent.includes('call: telephone call'));
  check(await page.locator('.dict-english-entry').count() === 1, 'phrase alias uses exact lookup');
  await search.fill('big');
  await page.waitForFunction(() => document.querySelector('.dict-english-entry')?.textContent.includes('big:'));
  await page.locator('.dict-copy').click();
  await page.waitForFunction(() => document.querySelector('.dict-body')?.textContent.includes('Copied Odia.'));
  check(await page.evaluate(() => navigator.clipboard.readText()) === '\u0b2c\u0b21\u0b3c', 'clipboard preserves decomposed nukta');
  // Choosing a dictionary result is an explicit edit at the editor selection
  // saved before the user moved focus into dictionary search.
  const editor = page.locator('#roman');
  const beforeInsert = '\u0b18\u0b30 \u0b2d\u0b32 \u0b26\u0b3f\u0b28';
  await editor.fill(beforeInsert);
  await editor.evaluate((element) => {
    element.focus();
    element.setSelectionRange(3, 5);
  });
  await search.fill('big');
  await page.waitForFunction(() => document.querySelector('.dict-english-entry')?.textContent.includes('big:'));
  await page.locator('.dict-insert').click();
  await page.waitForFunction(() => document.querySelector('.dict-body')?.textContent.includes('Inserted Odia.'));
  check(await editor.inputValue() === '\u0b18\u0b30 \u0b2c\u0b21\u0b3c \u0b26\u0b3f\u0b28',
    'Insert Odia replaces the saved editor selection and preserves surrounding words');
  check(await editor.evaluate(element => element.selectionStart === 6 && element.selectionEnd === 6),
    'insertion restores the editor caret after the canonical Odia word');
  await editor.press('Control+z');
  check(await editor.inputValue() === beforeInsert, 'dictionary insertion is one undoable editor transaction');
  await editor.press('Control+Shift+z');
  check(await editor.inputValue() === '\u0b18\u0b30 \u0b2c\u0b21\u0b3c \u0b26\u0b3f\u0b28',
    'dictionary insertion can be redone without losing surrounding text');
  await search.fill('me');
  await page.waitForFunction(() => document.querySelector('.dict-body')?.textContent.includes('(Related headword)'));
  check(await page.locator('.dict-english-entry').count() >= 2, 'prefix results are explicitly labelled');
  await search.fill('photosynthesis');
  await page.waitForFunction(() => document.querySelector('.dict-body')?.textContent.includes('No entry in this starter dictionary'));
  check(await page.locator('.dict-english-entry').count() === 0, 'unknown query clears results honestly');
  await page.locator('.dict-direction').selectOption('odia');
  await search.fill('\u0b15\u0b47\u0b2e\u0b3f\u0b24\u0b3f');
  await page.waitForFunction(() => document.querySelector('.dict-owner')?.textContent.includes('how'));
  check(true, 'Odia lookup still shows owner meaning');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.locator('.dict-direction').selectOption('english');
  await page.locator('.dict-search').fill('water');
  await page.waitForFunction(() => document.querySelector('.dict-english-entry')?.textContent.includes('water:'));
  check((await page.locator('.dict-word').innerText()) === '\u0b2a\u0b3e\u0b23\u0b3f', 'English lookup works after offline reload');
  check(errors.length === 0, 'no page errors');
  check(external.length === 0, 'no external requests');
  await context.close();

  // The small English seed is usable even when the historical dictionaries fail.
  const degraded = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const fallback = await degraded.newPage();
  await fallback.route('**/*.bin', route => route.abort());
  await fallback.goto(url);
  await fallback.locator('.dict-direction').selectOption('english');
  await fallback.locator('.dict-search').fill('office');
  await fallback.waitForFunction(() => document.querySelectorAll('.dict-english-entry').length === 2);
  check(true, 'English lookup survives blocked historical payloads');
  await fallback.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Permission denied')) } }));
  await fallback.locator('.dict-copy').first().click();
  await fallback.waitForFunction(() => document.querySelector('.dict-body')?.textContent.includes('Could not copy.'));
  check(!(await fallback.locator('.dict-copy').first().isDisabled()), 'clipboard denial shows manual fallback and restores button');
  await fallback.waitForFunction(() => document.querySelector('.dict-state')?.textContent.includes('Historical dictionary unavailable'));
  await fallback.locator('.dict-direction').selectOption('odia');
  check(await fallback.locator('.dict-english-entry').count() === 0
    && await fallback.locator('.dict-body').innerText() === ''
    && await fallback.locator('.dict-state').isVisible(),
  'switching to unavailable Odia dictionary clears stale English results and keeps failure status');
  await fallback.locator('.dict-direction').selectOption('english');
  await fallback.locator('.dict-search').fill('office');
  await fallback.waitForFunction(() => document.querySelectorAll('.dict-english-entry').length === 2);
  check(true, 'switching back to English restores usable seed lookup after payload failure');
  await degraded.close();
  console.log(`ALL PASS (${checks} browser checks)`);
} finally {
  await browser.close();
}
