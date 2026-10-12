// Browser geometry and interaction regressions for the phone layout.
// Usage: NODE_PATH=<playwright modules> node mobile-check.mjs [port]
// APP_URL overrides port. MOBILE_ARTIFACT_DIR optionally saves screenshots/results.
// MOBILE_CHECK_FILTER optionally selects scenario names by regex.
// The visualViewport keyboard case is explicitly simulated, not an iOS device test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const url = process.env.APP_URL || `http://127.0.0.1:${process.argv[2] || '4810'}/`;
const artifactDir = process.env.MOBILE_ARTIFACT_DIR;
const filter = process.env.MOBILE_CHECK_FILTER ? new RegExp(process.env.MOBILE_CHECK_FILTER) : null;
if (artifactDir) mkdirSync(artifactDir, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {});
const results = [];
const measurements = [];
function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition), ...(condition ? {} : { detail }) });
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}${condition ? '' : ': ' + JSON.stringify(detail)}`);
}
async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function screenshot(page, name) {
  if (artifactDir) await page.screenshot({ path: join(artifactDir, name + '.png'), fullPage: false });
}
async function measure(page) {
  return page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
        visible: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0,
        fontSize: parseFloat(s.fontSize), fontFamily: s.fontFamily };
    };
    const vv = visualViewport;
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth,
      vv: { top: vv?.offsetTop ?? 0, height: vv?.height ?? innerHeight, width: vv?.width ?? innerWidth },
      editor: box('#roman'), dock: box('#kb-bar'), candidate: box('.inline-candidate'),
      panel: box('#dict-panel'), close: box('.dict-close'), search: box('.dict-search'), direction: box('.dict-direction') };
  });
}
function editorVisible(m) {
  const end = m.dock?.visible ? Math.min(m.vv.top + m.vv.height, m.dock.y) : m.vv.top + m.vv.height;
  return Math.max(0, Math.min(m.editor.bottom, end) - Math.max(m.editor.y, m.vv.top));
}
async function targets(page, label, selectors) {
  const sizes = await page.evaluate((selectors) => selectors.flatMap((selector) => [...document.querySelectorAll(selector)].map((el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return { selector, width: r.width, height: r.height, visible: s.display !== 'none' && r.width > 0 && r.height > 0 };
  })), selectors);
  const visible = sizes.filter((r) => r.visible);
  check(`${label}: visible primary touch targets are at least 44px`, visible.length > 0 && visible.every((r) => r.width >= 43.5 && r.height >= 43.5), visible);
}
async function run(name, viewport, test, { xl = false, firstVisit = false, keyboard = false, desktop = false } = {}) {
  if (filter && !filter.test(name)) return;
  const context = await browser.newContext({ viewport, ...(!desktop ? { isMobile: true, hasTouch: true } : {}), serviceWorkers: 'block' });
  try {
    await context.addInitScript(({ xl, firstVisit, keyboard }) => {
      if (!firstVisit) localStorage.setItem('odia.pref.seenIntro', '1');
      if (xl) localStorage.setItem('odia.pref.textSize', 'xl');
      if (keyboard) {
        // Test-only visualViewport replacement. Layout viewport stays unchanged.
        let height = innerHeight; let top = 0;
        const vv = new EventTarget();
        Object.defineProperties(vv, {
          height: { get: () => height }, width: { get: () => innerWidth },
          offsetTop: { get: () => top }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 },
          pageTop: { get: () => scrollY + top }, pageLeft: { get: () => scrollX },
        });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
        window.__mobileCheckViewport = (nextHeight, nextTop = 0) => {
          height = nextHeight; top = nextTop;
          vv.dispatchEvent(new Event('resize'));
          window.dispatchEvent(new Event('resize'));
        };
      }
    }, { xl, firstVisit, keyboard });
    const page = await context.newPage(); page.setDefaultTimeout(7000);
    const errors = []; page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(url);
    await page.locator('.dict-search').waitFor({ state: 'attached' });
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    await test(page, name);
    check(`${name}: no uncaught page errors`, errors.length === 0, errors);
  } catch (error) {
    check(`${name}: scenario completes`, false, error instanceof Error ? error.message : String(error));
  } finally { await context.close(); }
}
async function typing(page, name, { xl = false } = {}) {
  await page.locator('#roman').focus();
  await page.keyboard.type('kemiti');
  await page.locator('.inline-candidate').first().waitFor();
  await settle(page);
  const m = await measure(page); measurements.push({ name, phase: 'typing', ...m });
  check(`${name}: editor has at least 96px visible while typing`, editorVisible(m) >= 95.5, m);
  check(`${name}: editor and dock do not overlap`, m.editor.bottom <= m.dock.y + 1, m);
  check(`${name}: editor and dock stay within visual viewport`, m.editor.y >= m.vv.top - 1 && m.dock.bottom <= m.vv.top + m.vv.height + 1 && m.editor.x >= -1 && m.editor.right <= m.vv.width + 1 && m.documentWidth <= m.width + 1, m);
  check(`${name}: candidate dock is bounded to 120px`, m.dock.visible && m.dock.height <= 120, m.dock);
  check(`${name}: editor uses an unscaled phone font of at least 16px`, m.editor.fontSize >= 16 && !m.editor.fontFamily.includes('Odia Box'), m.editor);
  check(`${name}: ${xl ? 'XL preference enlarges text' : 'default editor text stays compact'}`, xl ? m.editor.fontSize > 18 : m.editor.fontSize <= 20, m.editor);
  const scroll = await page.locator('#inline-candidates').evaluate((el) => {
    const before = el.scrollLeft; el.scrollLeft = el.scrollWidth;
    return { before, after: el.scrollLeft, width: el.clientWidth, total: el.scrollWidth, wrap: getComputedStyle(el).flexWrap };
  });
  check(`${name}: candidates stay in one row and scroll when needed`, scroll.wrap === 'nowrap' && (scroll.total <= scroll.width + 1 || scroll.after > scroll.before), scroll);
  await targets(page, name, ['#kb-bar .btn', '#kb-bar .kb-bar-page', '#inline-candidates .inline-candidate']);
  await screenshot(page, name + '-typing');
}
async function dictionary(page, name) {
  const area = page.locator('#roman');
  // Use literal paste semantics and preserve a real saved selection across lookup.
  await area.evaluate((el) => {
    el.focus(); el.value = 'left target right'; el.setSelectionRange(5, 11);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: el.value }));
    el.dispatchEvent(new Event('select', { bubbles: true }));
  });
  const dockButton = page.locator('#meanings-dock');
  if (await dockButton.isVisible()) await dockButton.click();
  else await page.locator('#dict-toggle').click();
  await page.locator('.dict-direction').selectOption('english');
  await page.locator('.dict-search').fill('water');
  await page.locator('.dict-english-entry').first().waitFor();
  await settle(page);
  const m = await measure(page); measurements.push({ name, phase: 'dictionary', ...m });
  check(`${name}: dictionary fits the visual viewport`, m.panel.visible && m.panel.y >= m.vv.top - 1 && m.panel.bottom <= m.vv.top + m.vv.height + 1 && m.panel.height <= m.vv.height + 1 && m.panel.x >= -1 && m.panel.right <= m.vv.width + 1 && m.documentWidth <= m.width + 1, m);
  check(`${name}: dictionary leaves a visible return-to-editor margin`, m.panel.height <= Math.min(m.vv.height * 0.9, 520) + 2, m.panel);
  check(`${name}: dictionary replaces the candidate dock`, !m.dock.visible, m.dock);
  check(`${name}: search font does not trigger iOS small-input zoom`, m.search.fontSize >= 16, m.search);
  await targets(page, name + ' dictionary', ['.dict-close', '.dict-search', '.dict-direction', '.dict-insert', '.dict-copy']);
  check(`${name}: phone dictionary makes the background inert`, await page.evaluate(() => {
    const targets = [...document.querySelectorAll('body > .app, #kb-bar')];
    return targets.length === 2 && targets.every((el) => el.hasAttribute('inert'))
      && document.querySelector('#dict-panel')?.getAttribute('aria-modal') === 'true';
  }));
  await page.locator('.dict-search').focus();
  let trapped = true;
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
    trapped &&= await page.evaluate(() => document.querySelector('#dict-panel')?.contains(document.activeElement));
  }
  await page.keyboard.press('Shift+Tab');
  trapped &&= await page.evaluate(() => document.querySelector('#dict-panel')?.contains(document.activeElement));
  check(`${name}: Tab and Shift+Tab remain inside the phone lookup`, trapped);
  const word = await page.locator('.dict-english-entry .dict-word').first().innerText();
  await screenshot(page, name + '-dictionary');
  await page.locator('.dict-insert').first().click();
  assert.equal(await area.inputValue(), 'left ' + word + ' right', 'lookup insertion replaces the saved selection exactly');
  await settle(page);
  check(`${name}: Insert closes the phone lookup and focuses typing`, !(await page.locator('#dict-panel').isVisible()) && await area.evaluate((el) => document.activeElement === el), await measure(page));
  check(`${name}: Insert restores background interaction`, await page.evaluate(() =>
    [...document.querySelectorAll('body > .app, #kb-bar')].every((el) => !el.hasAttribute('inert'))));
  check(`${name}: editor is visible again after Insert`, editorVisible(await measure(page)) >= 95.5, await measure(page));
  await screenshot(page, name + '-after-insert');
  // Recover from a baseline's already-reported Insert-close failure so the
  // independent close-control check still runs without a blocked click.
  if (await page.locator('#dict-panel').isVisible()) await page.locator('.dict-close').click();
  await area.focus();
  if (await dockButton.isVisible()) await dockButton.click();
  else await page.locator('#dict-toggle').click();
  await page.locator('.dict-close').click();
  await settle(page);
  check(`${name}: Back to typing closes lookup and restores editor focus`, !(await page.locator('#dict-panel').isVisible()) && await area.evaluate((el) => document.activeElement === el), await measure(page));
  check(`${name}: Back to typing restores background interaction`, await page.evaluate(() =>
    [...document.querySelectorAll('body > .app, #kb-bar')].every((el) => !el.hasAttribute('inert'))));
  if (await dockButton.isVisible()) await dockButton.click();
  else await page.locator('#dict-toggle').click();
  await page.locator('.dict-search').focus();
  const simulatedViewport = await page.evaluate(() => typeof window.__mobileCheckViewport === 'function'
    ? { height: visualViewport.height, top: visualViewport.offsetTop } : null);
  if (simulatedViewport) {
    // Model the software keyboard being dismissed before the dialog closes.
    // Keeping an already-open keyboard is a separate, intentional behavior.
    await page.evaluate(() => window.__mobileCheckViewport(innerHeight, 0));
    await settle(page);
  }
  await page.keyboard.press('Escape');
  await settle(page);
  await page.waitForTimeout(150); // the dock's delayed blur must finish too
  const focus = await page.evaluate(() => {
    const el = document.activeElement; const r = el?.getBoundingClientRect();
    const s = el ? getComputedStyle(el) : null;
    return { id: el?.id, tag: el?.tagName, button: el instanceof HTMLButtonElement,
      visible: !!r && r.width > 0 && r.height > 0 && s?.display !== 'none' && s?.visibility !== 'hidden' };
  });
  check(`${name}: Escape after keyboard dismissal returns to a visible non-text control`,
    !(await page.locator('#dict-panel').isVisible()) && focus.button && focus.visible
      && !(await page.locator('html').evaluate((el) => el.classList.contains('phone-editing'))), focus);
  if (simulatedViewport) {
    await page.evaluate(({ height, top }) => window.__mobileCheckViewport(height, top), simulatedViewport);
    await settle(page);
  }

}
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
    const name = `${viewport.width}x${viewport.height}`;
    await run(name, viewport, async (page) => {
      const initial = await measure(page); measurements.push({ name, phase: 'initial', ...initial });
      check(`${name}: no horizontal page overflow`, initial.documentWidth <= initial.width + 1, initial);
      check(`${name}: editor initially shows at least 96px above the fold`, editorVisible(initial) >= 95.5, initial);
      await screenshot(page, name + '-initial');
      await typing(page, name);
      await dictionary(page, name);
    });
  }
  await run('320-first-visit', { width: 320, height: 568 }, async (page, name) => {
    const m = await measure(page); measurements.push({ name, phase: 'first-visit', ...m });
    check(`${name}: intro leaves at least 96px of editor visible without scrolling`, editorVisible(m) >= 95.5 && m.editor.y >= -1, m);
    await screenshot(page, name);
  }, { firstVisit: true });
  await run('390-xl', { width: 390, height: 844 }, async (page, name) => {
    await typing(page, name, { xl: true });
    await dictionary(page, name);
  }, { xl: true });
  await run('390-simulated-keyboard', { width: 390, height: 844 }, async (page, name) => {
    await page.locator('#roman').focus();
    await page.evaluate(() => window.__mobileCheckViewport(390));
    await settle(page);
    await typing(page, name);
    await dictionary(page, name);
  }, { keyboard: true });
  await run('390-simulated-offset-keyboard', { width: 390, height: 844 }, async (page, name) => {
    await page.locator('#roman').focus();
    await page.evaluate(() => window.__mobileCheckViewport(350, 140));
    await settle(page);
    await typing(page, name);
    await dictionary(page, name);
  }, { keyboard: true });
  await run('844-simulated-landscape-keyboard', { width: 844, height: 390 }, async (page, name) => {
    await page.locator('#roman').focus();
    await page.evaluate(() => window.__mobileCheckViewport(230));
    await settle(page);
    await typing(page, name);
    await dictionary(page, name);
    await page.locator('#roman').focus();
    await page.locator('#done-dock').waitFor();
    await page.locator('#done-dock').click();
    await settle(page);
    await page.waitForTimeout(150);
    const done = await page.evaluate(() => {
      const el = document.activeElement; const r = el?.getBoundingClientRect();
      return { id: el?.id, editing: document.documentElement.classList.contains('phone-editing'),
        top: r?.top, bottom: r?.bottom, width: r?.width, height: r?.height,
        viewportTop: visualViewport.offsetTop, viewportBottom: visualViewport.offsetTop + visualViewport.height };
    });
    check(`${name}: Done restores visible Settings focus after short-viewport typing`,
      done.id === 'open-settings' && !done.editing && done.width > 0 && done.height > 0
        && done.top >= done.viewportTop - 1 && done.bottom <= done.viewportBottom + 1, done);
  }, { keyboard: true });
  await run('390-manual-document-scroll', { width: 390, height: 844 }, async (page, name) => {
    const area = page.locator('#roman');
    const text = Array.from({ length: 100 }, (_, i) => `Document line ${i + 1}`).join('\n');
    await area.fill(text);
    await area.focus();
    await page.keyboard.press('Control+End');
    await settle(page);
    // Let any initial caret-reveal work finish before the intentional scroll.
    await page.waitForTimeout(100);
    const initial = await area.evaluate((el) => ({ height: el.clientHeight, total: el.scrollHeight, caret: el.selectionEnd }));
    check(`${name}: document is long enough to scroll`, initial.total > initial.height + 100, initial);
    await area.evaluate((el) => { el.scrollTop = 0; });
    // Regression: the captured scroll event used to reposition the dock and
    // jump back to the caret, undoing the user's deliberate reading action.
    await page.waitForTimeout(350);
    const after = await area.evaluate((el) => ({ top: el.scrollTop, caret: el.selectionEnd, text: el.value }));
    check(`${name}: manual scroll stays away from caret after 350ms`, after.top <= 2 && after.caret === initial.caret && after.text === text, { top: after.top, caret: after.caret, initial });
    await screenshot(page, name);
  });
  await run('desktop', { width: 1440, height: 1000 }, async (page, name) => {
    const m = await measure(page); measurements.push({ name, phase: 'desktop', ...m });
    check(`${name}: meanings column remains visible beside the editor`, m.panel.visible && m.panel.x >= m.editor.right - 1, m);
    check(`${name}: phone layout does not affect desktop`, !(await page.locator('html').evaluate((el) => el.classList.contains('phone-layout'))), m);
  }, { desktop: true });
  const summary = { suite: 'mobile', environment: 'Chromium emulation; keyboard case uses a visualViewport mock, not a real iOS keyboard', passed: results.filter((r) => r.pass).length, total: results.length, results, measurements };
  console.log(JSON.stringify(summary, null, 2));
  if (artifactDir) writeFileSync(join(artifactDir, 'results.json'), JSON.stringify(summary, null, 2));
  if (results.length === 0 || results.some((r) => !r.pass)) process.exitCode = 1;
} finally { await browser.close(); }
