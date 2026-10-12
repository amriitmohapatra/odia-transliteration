// Build Appv2 and serve dist first. NODE_PATH must resolve Playwright.
// Usage: CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node editing-check.mjs [port]
// APP_URL overrides the local port; EDITING_CHECK_FILTER selects case names by regex.
// Chromium emulation checks event contracts; it is not an iOS/Safari hardware test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { parse: parseToml } = require('smol-toml');
const strictTable = parseToml(readFileSync(new URL('../../../core/rules/itrans.toml', import.meta.url), 'utf8'));
const appUrl = process.env.APP_URL || `http://127.0.0.1:${process.argv[2] || '4810'}/`;
const origin = new URL(appUrl).origin;
const filter = process.env.EDITING_CHECK_FILTER ? new RegExp(process.env.EDITING_CHECK_FILTER) : null;
const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {});
const results = [];
async function run(name, test, mobile = false) {
  if (filter && !filter.test(name)) return;
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    serviceWorkers: 'block',
  });
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await context.addInitScript(() => localStorage.setItem('odia.pref.seenIntro', '1'));
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(appUrl);
    // Dictionary panel creation occurs after the engine has loaded its assets.
    await page.locator('.dict-search').waitFor({ state: 'attached' });
    const area = page.locator('#roman');
    await area.focus();
    await test({ page, area, context });
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
const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
const selection = (area) => area.evaluate((el) => [el.selectionStart, el.selectionEnd]);
async function firstCandidate(page) {
  const candidate = page.locator('#inline-candidates .inline-candidate').first();
  await candidate.waitFor({ state: 'visible' });
  return candidate.locator('.inline-text, .inline-latin').innerText();
}
try {
  for (const literal of ['test@example.com', 'https://example.com/a?q=1', 'covid19', 'PCR2']) {
    await run(`typed ${literal} remains literal, including digits and punctuation`, async ({ page, area }) => {
      if (literal === 'covid19') {
        // A digit straight after letters needs "Number keys pick suggestions" off.
        await page.locator('#open-settings').click();
        await page.locator('#toggle-number-pick').uncheck();
        await page.locator('#settings button[data-settings-close]').click();
        await area.focus();
      }
      await page.keyboard.type(literal + ' ');
      assert.equal(await editor(page), literal + ' ');
      await page.waitForFunction(() => document.querySelectorAll('#readback .rb-word[data-odia]').length === 0, null, { timeout: 2000 });
      assert.equal(await page.locator('#readback .rb-word[data-odia]').count(), 0, 'Reads as must not imply a hidden Odia conversion for a literal token');
      await page.locator('#copy').click();
      assert.equal(await clipboard(page), literal + ' ', 'Copy preserves literal token');
      assert.equal(await editor(page), literal + ' ', 'Copy does not silently alter literal token');
    });
  }

  await run('punctuation commits on whitespace and Copy equals displayed text', async ({ page }) => {
    await page.keyboard.type('namaskar, tume kemiti achha? ');
    const shown = await editor(page);
    assert.ok(!/[A-Za-z]/.test(shown), `uncommitted Roman text: ${shown}`);
    assert.ok(shown.includes(',') && shown.endsWith('? '), 'punctuation and whitespace retained');
    await page.locator('#copy').click();
    assert.equal(await clipboard(page), shown);
    assert.equal(await editor(page), shown);
  });

  await run('Copy visibly finalizes a pending word and copies that same result', async ({ page }) => {
    await page.keyboard.type('kemiti');
    const proposed = await firstCandidate(page);
    assert.match(proposed, /[\u0b00-\u0b7f]/);
    await page.locator('#copy').click();
    assert.equal(await editor(page), proposed, 'pending conversion is visible');
    assert.equal(await clipboard(page), proposed);
  });

  await run('Alt plus a digit explicitly selects that candidate', async ({ page }) => {
    await page.keyboard.type('kemiti');
    await firstCandidate(page);
    const proposed = await page.locator('#inline-candidates .inline-candidate').nth(1).locator('.inline-text, .inline-latin').innerText();
    await page.keyboard.press('Alt+2');
    assert.equal(await editor(page), proposed, 'Alt+2 selects the displayed second candidate');
  });

  await run('number keys pick a numbered suggestion, as on Microsoft keyboards (default on)', async ({ page }) => {
    await page.keyboard.type('kemiti');
    await firstCandidate(page);
    const second = await page.locator('#inline-candidates .inline-candidate').nth(1).locator('.inline-text, .inline-latin').innerText();
    await page.keyboard.press('2');
    assert.equal(await editor(page), second, '2 takes the displayed second candidate');
    await page.keyboard.type(' 10 ');
    assert.equal(await editor(page), second + ' 10 ', 'with no suggestions open, number keys type digits');
    await page.keyboard.type('bus');
    await firstCandidate(page);
    const shown = await page.locator('#inline-candidates .inline-candidate').count();
    if (shown < 9) {
      await page.keyboard.press(String(shown + 1));
      assert.ok((await editor(page)).endsWith('bus' + (shown + 1)), 'a number beyond the list types the digit');
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('odia.pref.numberPick')), null, 'default needs no stored setting');
  });

  await run('number keys type digits when the setting is off; Alt plus a number still picks', async ({ page, area }) => {
    await page.locator('#open-settings').click();
    await page.locator('#toggle-number-pick').uncheck();
    await page.locator('#settings button[data-settings-close]').click();
    await area.focus();
    await page.keyboard.type('kemiti');
    await firstCandidate(page);
    await page.keyboard.press('2');
    assert.equal(await editor(page), 'kemiti2');
    assert.equal(await page.evaluate(() => localStorage.getItem('odia.pref.numberPick')), '0', 'the choice is saved');
    await page.keyboard.press('Backspace');
    const second = await page.locator('#inline-candidates .inline-candidate').nth(1).locator('.inline-text, .inline-latin').innerText();
    await page.keyboard.press('Alt+2');
    assert.equal(await editor(page), second);
  });

  await run('Copy honors the candidate highlighted with ArrowDown', async ({ page }) => {
    await page.keyboard.type('kemiti');
    const first = await firstCandidate(page);
    await page.keyboard.press('ArrowDown');
    const chosen = await page.locator('#inline-candidates .inline-candidate[aria-selected="true"]').locator('.inline-text, .inline-latin').innerText();
    assert.notEqual(chosen, first, 'test selected a different spelling');
    await page.locator('#copy').click();
    assert.equal(await editor(page), chosen, 'Copy must commit the highlighted choice, not rerank to first');
    assert.equal(await clipboard(page), chosen);
  });

  await run('native Copy of a selected raw substring stays exact', async ({ page, area }) => {
    await page.keyboard.type('kemiti');
    await area.evaluate((el) => el.setSelectionRange(0, 3));
    await page.keyboard.press('Control+c');
    assert.equal(await clipboard(page), 'kem');
    assert.equal(await editor(page), 'kemiti');
    assert.deepEqual(await selection(area), [0, 3]);
  });

  await run('paste preserves mixed text and Copy does not reinterpret it', async ({ page }) => {
    const text = 'mote test@example.com re email kara https://example.com covid19 PCR2';
    await page.evaluate((value) => navigator.clipboard.writeText(value), text);
    await page.keyboard.press('Control+v');
    assert.equal(await editor(page), text, 'paste should be literal');
    await page.locator('#copy').click();
    assert.equal(await editor(page), text);
    assert.equal(await clipboard(page), text);
  });

  await run('Left and Right move the actual caret; typing replaces a selection', async ({ page, area }) => {
    await page.keyboard.type('kemiti');
    await firstCandidate(page);
    await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await selection(area), [5, 5], 'Left must not change candidate selection instead');
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await selection(area), [6, 6]);
    await area.evaluate((el) => el.setSelectionRange(1, 4));
    await page.keyboard.type('a');
    assert.equal(await editor(page), 'kati', 'replace selected emi without stale candidate insertion');
  });

  await run('word commit is one reversible undo/redo step', async ({ page }) => {
    await page.keyboard.type('kemiti');
    const proposed = await firstCandidate(page);
    await page.keyboard.press('Space');
    assert.equal(await editor(page), proposed + ' ');
    await page.keyboard.press('Control+z');
    assert.equal(await editor(page), 'kemiti', 'Undo restores precommit Roman token');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await editor(page), proposed + ' ', 'Redo restores same committed spelling');
  });

  await run('Clear participates in undo and redo', async ({ page }) => {
    await page.keyboard.type('kemiti ');
    const before = await editor(page);
    await page.locator('#clear').click();
    assert.equal(await editor(page), '');
    await page.keyboard.press('Control+z');
    assert.equal(await editor(page), before);
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await editor(page), '', 'Redo repeats Clear');
  });

  await run('Keep English is learned and survives Copy', async ({ page }) => {
    await page.keyboard.type('bus');
    const keep = page.locator('#inline-candidates .inline-candidate').filter({ has: page.locator('.inline-latin') });
    await keep.click();
    assert.equal(await editor(page), 'bus');
    await page.keyboard.type(' bus');
    assert.equal(await firstCandidate(page), 'bus', 'learned Latin choice leads');
    await page.keyboard.press('Space');
    assert.equal(await editor(page), 'bus bus ');
    await page.locator('#copy').click();
    assert.equal(await clipboard(page), 'bus bus ');
  });

  await run('Escape closes suggestions for this word only; a changed word offers them again', async ({ page }) => {
    await page.keyboard.type('kemi');
    await firstCandidate(page);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#inline-candidates').isVisible(), false, 'Escape closes the bar');
    await page.keyboard.type('ti');
    const proposed = await firstCandidate(page);
    await page.keyboard.press('Space');
    assert.equal(await editor(page), proposed + ' ', 'Escape is not Keep: the longer word converts');
    await page.keyboard.type('achha');
    await firstCandidate(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Space');
    assert.equal(await editor(page), proposed + ' achha ', 'after Escape, Space types a plain space');
  });

  await run('Clear toast expires on an intervening edit and Undo targets that edit', async ({ page }) => {
    await page.keyboard.type('kemiti ');
    await page.locator('#clear').click();
    assert.equal(await editor(page), '');
    assert.equal(await page.locator('#toast-action').isVisible(), true, 'Clear starts an Undo toast');
    await page.keyboard.type('x');
    await page.keyboard.press('Backspace');
    assert.equal(await editor(page), '');
    assert.equal(await page.locator('#toast-action').isVisible(), false, 'the old Clear transaction is no longer the toast target');
    await page.keyboard.press('Control+z');
    assert.equal(await editor(page), 'x', 'Undo restores the later deletion, not the original cleared sentence');
  });

  await run('Odia digits convert standalone typed numbers but preserve identifiers and pasted numbers', async ({ page, area }) => {
    await page.locator('#open-settings').click();
    await page.locator('#toggle-digits').check();
    await page.locator('#settings button[data-settings-close]').click();
    await area.focus();
    await page.keyboard.type('123 PCR2 ');
    assert.equal(await editor(page), '\u0b67\u0b68\u0b69 PCR2 ');
    await page.evaluate(() => navigator.clipboard.writeText('123'));
    await page.keyboard.press('Control+v');
    const expected = '\u0b67\u0b68\u0b69 PCR2 123';
    assert.equal(await editor(page), expected);
    await page.locator('#copy').click();
    assert.equal(await clipboard(page), expected);
    assert.equal(await editor(page), expected);
  });

  await run('strict ITRANS preserves uppercase keys and Sloka punctuation shortcuts remain usable', async ({ page, area }) => {
    await page.locator('#mode-sloka').check();
    await page.waitForFunction(() => !document.querySelector('#status')?.textContent?.includes('Switching'));
    await page.locator('#open-settings').click();
    await page.locator('#toggle-strict').check();
    await page.locator('#settings button[data-settings-close]').click();
    await area.focus();
    await page.keyboard.type('A I U ');
    // Expected values come from the committed ITRANS table, not guessed Odia words.
    const vowels = ['A', 'I', 'U'].map((key) => strictTable.vowels[key].independent).join(' ') + ' ';
    assert.equal(await editor(page), vowels, 'capitals are strict vowel keys, not protected English acronyms');
    await page.keyboard.type('| || ');
    const expected = vowels + '\u0964 \u0965 ';
    assert.equal(await editor(page), expected, 'single and double danda are distinct marks');
    await page.locator('#copy').click();
    assert.equal(await clipboard(page), expected);
  });

  await run('noncancelable beforeinput commits after input without duplicate space and stays undoable', async ({ page, area }) => {
    await page.keyboard.type('kemiti');
    const proposed = await firstCandidate(page);
    await page.keyboard.type('?');
    // Simulate the platform contract where beforeinput cannot be canceled:
    // the browser performs the edit, then reports input. This is an event-path test.
    await area.evaluate((el) => {
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: false, inputType: 'insertText', data: ' ' }));
      el.setRangeText(' ', el.selectionStart, el.selectionEnd, 'end');
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
    });
    assert.equal(await editor(page), proposed + '? ');
    await page.keyboard.press('Control+z');
    assert.equal(await editor(page), 'kemiti?', 'one Undo reverts the combined delimiter and commit');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await editor(page), proposed + '? ');
  });

  await run('an Odia IME composition is kept exactly as the IME commits it', async ({ page, context }) => {
    // CDP drives Chromium's actual composition events, without claiming a physical IME test.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'kemiti', selectionStart: 6, selectionEnd: 6 });
    assert.equal(await editor(page), 'kemiti');
    await cdp.send('Input.insertText', { text: '\u0b15\u0b47\u0b2e\u0b3f\u0b24\u0b3f' });
    assert.equal(await editor(page), '\u0b15\u0b47\u0b2e\u0b3f\u0b24\u0b3f');
    assert.equal(await page.locator('#inline-candidates').isVisible(), false, 'no suggestions for committed Odia');
    await page.keyboard.press('Space');
    assert.equal(await editor(page), '\u0b15\u0b47\u0b2e\u0b3f\u0b24\u0b3f ');
    await cdp.detach();
  });

  // A Latin keyboard that composes whole words (Android Gboard). Before this was
  // fixed, the composed word was literal: no suggestions and no conversion.
  async function composeRoman(cdp, word) {
    for (let i = 1; i <= word.length; i++) {
      await cdp.send('Input.imeSetComposition', { text: word.slice(0, i), selectionStart: i, selectionEnd: i });
    }
  }
  for (const mobile of [false, true]) {
    const where = mobile ? 'phone' : 'desktop';
    await run(`${where}: a composed Roman word shows suggestions and converts on Space`, async ({ page, context }) => {
      const cdp = await context.newCDPSession(page);
      await composeRoman(cdp, 'kemiti');
      const proposed = await firstCandidate(page);
      await cdp.send('Input.insertText', { text: 'kemiti' });
      await page.keyboard.press('Space');
      assert.equal(await editor(page), proposed + ' ');
      await cdp.detach();
    }, mobile);

    await run(`${where}: a tap on a suggestion during composition replaces the word once`, async ({ page, context }) => {
      const cdp = await context.newCDPSession(page);
      await composeRoman(cdp, 'kemiti');
      const candidate = page.locator('#inline-candidates .inline-candidate').first();
      const proposed = await firstCandidate(page);
      await candidate.click();
      assert.equal(await editor(page), proposed);
      await composeRoman(cdp, ' achha');
      await cdp.send('Input.insertText', { text: ' achha' });
      assert.equal(await editor(page), proposed + ' achha', 'no duplicated or lost text after the tap');
      await page.keyboard.press('Space');
      const value = await editor(page);
      assert.ok(!/[a-z]/.test(value), `both words are Odia: ${value}`);
      await cdp.detach();
    }, mobile);
  }

  await run('phone viewport insertion without keydown commits punctuation on space', async ({ page }) => {
    // insertText models software-keyboard input without keydown. It does not emulate iOS itself.
    await page.keyboard.insertText('kemiti');
    const proposed = await firstCandidate(page);
    await page.keyboard.insertText('?');
    await page.keyboard.insertText(' ');
    assert.equal(await editor(page), proposed + '? ');
    await page.keyboard.insertText('PCR2');
    await page.keyboard.insertText(' ');
    assert.equal(await editor(page), proposed + '? PCR2 ');
  }, true);

  console.log(JSON.stringify({ suite: 'editing', passed: results.filter((r) => r.pass).length, total: results.length, results }, null, 2));
  if (results.length === 0 || results.some((r) => !r.pass)) process.exitCode = 1;
} finally {
  await browser.close();
}
