// The phrase table in the Meanings panel: browse, search, Insert, Copy; desktop and phone.
// Build Appv2 and serve dist first. Usage: node phrases-check.mjs [port]
// APP_URL overrides the local URL. Playwright resolves locally or via NODE_PATH.
// Optional CHROMIUM_EXECUTABLE_PATH. Expected Odia comes from core/data/phrases.tsv.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = new URL(process.env.APP_URL || `http://127.0.0.1:${process.argv[2] || '4810'}/`).href;
const rows = readFileSync(new URL('../../../core/data/phrases.tsv', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t'));
const odiaFor = (meaning) => rows.find((r) => r[3] === meaning)?.[1];
const BIRTHDAY = odiaFor('happy birthday');
assert.ok(BIRTHDAY, 'phrases.tsv has a "happy birthday" row');

const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log('PASS', message); };

async function open(viewport, mobile) {
  const context = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
  await context.addInitScript(() => localStorage.setItem('odia.pref.seenIntro', '1'));
  const page = await context.newPage();
  const errors = []; const external = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (r) => { if (!r.url().startsWith(url) && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.goto(url);
  await page.locator('.dict-search').waitFor({ state: 'attached' });
  return { context, page, errors, external };
}

try {
  // Desktop: browse, search, insert at the caret, copy.
  {
    const { context, page, errors, external } = await open({ width: 1440, height: 1000 }, false);
    const editor = page.locator('#roman');
    await editor.fill('');
    await editor.focus();
    await page.locator('.dict-browse-phrases').click();
    await page.locator('.dict-phrase-entry').first().waitFor();
    check(await page.locator('.dict-phrase-entry').count() === rows.length, 'empty search lists every phrase');
    check(await page.locator('.dict-group').count() === 7, 'the list has a Phrases heading and one heading per group');
    await page.locator('.dict-search').fill('birthday');
    await page.waitForFunction(() => document.querySelectorAll('.dict-phrase-entry').length === 1);
    const text = await page.locator('.dict-body').innerText();
    check(text.includes(BIRTHDAY), 'birthday finds the birthday wish');
    check(text.includes('awaiting native-speaker review'), 'seed status is visible');
    check(text.includes('Type it: '), 'the typed spelling is shown for readers of English letters');
    await page.locator('.dict-phrase-entry .dict-insert').click();
    await page.waitForFunction(() => document.querySelector('.dict-body')?.textContent.includes('Inserted Odia.'));
    check(await editor.inputValue() === BIRTHDAY, 'Insert puts the whole phrase into the text box');
    await page.locator('.dict-phrase-entry .dict-copy').click();
    await page.waitForFunction(() => document.querySelector('.dict-body')?.textContent.includes('Copied Odia.'));
    check(await page.evaluate(() => navigator.clipboard.readText()) === BIRTHDAY, 'Copy copies the canonical phrase');
    await page.locator('.dict-search').fill('festival');
    await page.waitForFunction(() => document.querySelectorAll('.dict-phrase-entry').length >= 5);
    check(await page.locator('.dict-phrase-entry').count() === rows.filter((r) => r[2] === 'festival').length,
      'a group name lists that group');
    await page.locator('.dict-search').fill('zzzz');
    await page.waitForFunction(() => document.querySelectorAll('.dict-phrase-entry').length === 0);
    check(await page.locator('.dict-spelled-entry').count() >= 1, 'a search with no phrase still lists the Odia spellings');
    await page.locator('.dict-search').fill('meeting');
    await page.waitForFunction(() => document.querySelectorAll('.dict-english-entry').length === 2);
    check(await page.locator('.dict-phrase-entry').count() === 0, 'a search with no matching phrase shows no phrase blocks');
    await page.locator('.dict-search').fill('kemiti');
    await page.waitForFunction(() => document.querySelectorAll('.dict-phrase-entry').length >= 2);
    check(await page.locator('.dict-spelled-entry').count() >= 1, 'English letters (kemiti) list the Odia spellings and the matching phrases together');
    check(errors.length === 0 && external.length === 0, 'desktop: no page errors, no external requests');
    await context.close();
  }
  // Phone: the Meanings sheet, Insert closes it and returns to typing.
  {
    const { context, page, errors, external } = await open({ width: 390, height: 844 }, true);
    await page.locator('#roman').focus();
    const dock = page.locator('#meanings-dock');
    if (await dock.isVisible()) await dock.click();
    else await page.locator('#dict-toggle').click();
    await page.locator('.dict-search').fill('you');
    await page.waitForFunction(() => document.querySelectorAll('.dict-phrase-entry').length >= 3);
    const tume = odiaFor('you (familiar)');
    await page.locator('.dict-phrase-entry', { hasText: tume }).locator('.dict-insert').click();
    await page.waitForTimeout(400);
    check(await page.locator('#roman').inputValue() === tume, 'phone: Insert puts the phrase into the text box');
    check(!(await page.locator('#dict-panel').isVisible()), 'phone: Insert closes the Meanings sheet');
    check(errors.length === 0 && external.length === 0, 'phone: no page errors, no external requests');
    await context.close();
  }
  console.log(`ALL PASS (${checks} phrase checks)`);
} finally {
  await browser.close();
}
