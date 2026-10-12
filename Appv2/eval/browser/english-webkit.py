"""WebKit browser-engine checks; viewport emulation is not an iOS device test.

Build/serve Appv2 first, then: python3 english-webkit.py [port]
Requires Python Playwright and its WebKit browser/dependencies.
WEBKIT_EXECUTABLE_PATH optionally selects an installed WebKit launcher.
"""
import os
import sys
from playwright.sync_api import sync_playwright

url = f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else '4810'}/"
checks = 0
failures = []


def check(condition, label):
    global checks
    checks += 1
    if not condition:
        failures.append(label)
    print('PASS' if condition else 'FAIL', label, flush=True)


with sync_playwright() as pw:
    executable = os.environ.get('WEBKIT_EXECUTABLE_PATH')
    browser = pw.webkit.launch(**({'executable_path': executable} if executable else {}))
    try:
        for name, options in [('desktop', {'viewport': {'width': 1440, 'height': 1000}}),
                              ('iPhone viewport', pw.devices['iPhone 13'])]:
            context = browser.new_context(**options)
            context.add_init_script("localStorage.setItem('odia.pref.seenIntro','1')")
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url)
            editor = page.locator('textarea').first
            editor.click()
            editor.press_sequentially('kemiti achha ', delay=30)
            check(editor.input_value().strip() == '\u0b15\u0b47\u0b2e\u0b3f\u0b24\u0b3f \u0b05\u0b1b', name + ': ordinary typing')
            if not page.locator('.dict-search').is_visible():
                page.locator('button[aria-controls="dict-panel"]:visible').first.click()
            search = page.locator('.dict-search')
            search.fill('meeting')
            page.wait_for_function("document.querySelectorAll('.dict-english-entry').length === 2")
            body = page.locator('.dict-body').inner_text()
            check('Translation' in body and 'English loan spelling' in body, name + ': distinct meaning and loan')
            check('awaiting native-speaker review' in body, name + ': seed review label')
            page.locator('.dict-copy').first.click()
            page.wait_for_function("document.querySelector('.dict-body').textContent.includes('Copied Odia.')")
            check(True, name + ': clipboard write resolves in user gesture')
            search.fill('photosynthesis')
            page.wait_for_function("document.querySelector('.dict-body').textContent.includes('No entry in this starter dictionary')")
            check(page.locator('.dict-english-entry').count() == 0, name + ': unknown query clears results')
            check(not errors, name + ': no page errors')
            # Exercise the built service worker rather than assuming PID/port means readiness.
            page.wait_for_function('navigator.serviceWorker.controller !== null')
            page.reload()
            page.wait_for_timeout(2500)
            context.set_offline(True)
            try:
                page.reload()
            except Exception as error:
                check(False, name + ': offline reload: ' + str(error).splitlines()[0])
                context.close()
                continue
            if not page.locator('.dict-search').is_visible():
                page.locator('button[aria-controls="dict-panel"]:visible').first.click()
            page.locator('.dict-search').fill('water')
            page.wait_for_function("document.querySelector('.dict-english-entry')?.textContent.includes('water:')")
            check(page.locator('.dict-word').inner_text() == '\u0b2a\u0b3e\u0b23\u0b3f', name + ': offline lookup')
            context.close()
    finally:
        browser.close()
print(f'{checks - len(failures)} passed, {len(failures)} failed ({checks} WebKit checks; no native-device claim)')
sys.exit(1 if failures else 0)
