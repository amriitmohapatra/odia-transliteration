// Build Appv2 and serve dist first. NODE_PATH must resolve Playwright.
// Usage: node desh-check.mjs [port]      (APP_URL overrides; DESH_CHECK_FILTER selects cases)
//
// The features built on the Desh keyboard data (V2.13-V2.16): word completion in the bar
// and in the dictionary search, next-word suggestions after a space, and the converter
// for words the word lists do not know. Adult edition only (the kids build has none).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const appUrl = process.env.APP_URL || `http://127.0.0.1:${process.argv[2] || '4810'}/`;
const filter = process.env.DESH_CHECK_FILTER ? new RegExp(process.env.DESH_CHECK_FILTER) : null;
const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {});

// Odia as escapes: these files are reviewed by code point, not by eye.
const CITY = '\u0B2D\u0B41\u0B2C\u0B28\u0B47\u0B36\u0B4D\u0B71\u0B30'; // bhubaneswar
const NAMASKAR = '\u0B28\u0B2E\u0B38\u0B4D\u0B15\u0B3E\u0B30';
const NAMA = '\u0B28\u0B2E';
const ATANKI = '\u0B06\u0B24\u0B19\u0B4D\u0B15\u0B40'; // aatankee: in no word list; the converter spells it

const results = [];
async function run(name, test, mobile = false) {
  if (filter && !filter.test(name)) return;
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    serviceWorkers: 'block',
  });
  try {
    await context.addInitScript(() => localStorage.setItem('odia.pref.seenIntro', '1'));
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(appUrl);
    await page.locator('.dict-search').waitFor({ state: 'attached' });
    const area = page.locator('#roman');
    await area.focus();
    await test({ page, area });
    assert.deepEqual(errors, [], 'no uncaught page errors');
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, pass: false, detail });
    console.log(`FAIL ${name}: ${detail}`);
  } finally {
    await context.close();
  }
}
const editor = (page) => page.locator('#roman').inputValue();
const barWords = (page) =>
  page.locator('#inline-candidates .inline-candidate .inline-text, #inline-candidates .inline-candidate .inline-latin').allInnerTexts();

async function openMeanings(page) {
  if (!(await page.locator('.dict-search').isVisible())) {
    await page.locator('#dict-toggle').click();
  }
  await page.locator('.dict-search').waitFor({ state: 'visible' });
}

try {
  await run('completion: "bhub" offers the whole word third, and 3 takes it', async ({ page }) => {
    await page.keyboard.type('bhub');
    await page.locator('#inline-candidates .inline-completion').first().waitFor({ state: 'visible' });
    const words = await barWords(page);
    assert.equal(words[2], CITY, `third item: ${words.join(' | ')}`);
    assert.equal(await page.locator('#inline-candidates .inline-candidate').nth(2).getAttribute('class').then((c) => c.includes('inline-completion')), true);
    assert.notEqual(words[0], CITY, 'Space still takes the best match for what was typed');
    await page.keyboard.press('3');
    assert.equal(await editor(page), CITY);
  });

  await run('completion: Space keeps the best match for the typed letters', async ({ page }) => {
    await page.keyboard.type('bhub');
    await page.locator('#inline-candidates .inline-completion').first().waitFor({ state: 'visible' });
    const first = (await barWords(page))[0];
    await page.keyboard.press('Space');
    assert.equal(await editor(page), `${first} `);
  });

  await run('converter: a word the word lists do not know is spelled right once it has loaded', async ({ page }) => {
    // The converter loads after start-up; retype until the engine has it.
    let first = '';
    for (let attempt = 0; attempt < 20 && first !== ATANKI; attempt++) {
      await page.locator('#roman').fill('');
      await page.keyboard.type('aatankee');
      await page.locator('#inline-candidates .inline-candidate').first().waitFor({ state: 'visible' });
      first = (await barWords(page))[0];
      if (first !== ATANKI) await page.waitForTimeout(250);
    }
    assert.equal(first, ATANKI, 'first suggestion');
    await page.keyboard.press('Space');
    assert.equal(await editor(page), `${ATANKI} `);
  });

  await run('dictionary: an English-letter search lists the completion too', async ({ page }) => {
    await openMeanings(page);
    await page.locator('.dict-search').fill('bhub');
    await page.locator('.dict-spelled-entry .dict-word', { hasText: CITY }).first().waitFor({ state: 'visible' });
  });

  await run('dictionary: the start of an Odia word lists words that begin with it', async ({ page }) => {
    await openMeanings(page);
    await page.locator('.dict-search').fill(NAMA);
    const button = page.locator('.dict-prefix', { hasText: NAMASKAR }).first();
    await button.waitFor({ state: 'visible', timeout: 15000 });
    await button.click();
    assert.equal(await page.locator('.dict-search').inputValue(), NAMASKAR);
  });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} Desh-data checks passed`);
if (failed.length) process.exit(1);
