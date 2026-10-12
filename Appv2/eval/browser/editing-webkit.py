#!/usr/bin/env python3
"""Focused editor contracts in Playwright WebKit (not an iOS hardware test).

Build and serve Appv2 first, then: python editing-webkit.py [port]
APP_URL overrides the local URL; WEBKIT_EXECUTABLE_PATH overrides the browser.
Requires Python Playwright and its WebKit runtime (or the override above).
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

MODIFIER = "Meta" if sys.platform == "darwin" else "Control"
URL = os.environ.get("APP_URL") or f"http://127.0.0.1:{sys.argv[1] if len(sys.argv) > 1 else '4810'}/"


def copied_literals(page):
    text = "test@example.com https://example.com/a?q=1 PCR2 "
    page.keyboard.type(text)
    assert page.locator("#roman").input_value() == text
    page.locator("#copy").click()
    page.wait_for_function("document.querySelector('#toast-text').textContent.includes('Copied')")
    # WebKit's readText permission differs from Chromium's. A real native paste
    # verifies the copied bytes without stubbing the clipboard or granting access.
    page.evaluate("""() => {
        const area = document.createElement('textarea');
        area.id = 'clipboard-paste-probe';
        document.body.prepend(area);
    }""")
    page.locator("#clipboard-paste-probe").focus()
    page.keyboard.press(MODIFIER + "+v")
    assert page.locator("#clipboard-paste-probe").input_value() == text
    assert page.locator("#roman").input_value() == text


def commit_history(page):
    page.keyboard.type("kemiti ")
    assert page.locator("#roman").input_value() == "କେମିତି "
    page.keyboard.press(MODIFIER + "+z")
    assert page.locator("#roman").input_value() == "kemiti"
    page.keyboard.press(MODIFIER + "+Shift+z")
    assert page.locator("#roman").input_value() == "କେମିତି "


def dictionary_selection(page):
    area = page.locator("#roman")
    before, after = "ଘର ଭଲ ଦିନ", "ଘର ବଡ\u0b3c ଦିନ"
    area.fill(before)
    area.evaluate("e => {e.focus(); e.setSelectionRange(3, 5, 'backward')}")
    page.locator(".dict-direction").select_option("english")
    page.locator(".dict-search").fill("big")
    page.wait_for_function("document.querySelector('.dict-english-entry')?.textContent.includes('big:')")
    page.locator(".dict-insert").click()
    assert area.input_value() == after
    assert area.evaluate("e => [e.selectionStart, e.selectionEnd]") == [6, 6]
    page.keyboard.press(MODIFIER + "+z")
    assert area.input_value() == before
    assert area.evaluate("e => [e.selectionStart, e.selectionEnd, e.selectionDirection]") == [3, 5, "backward"]
    page.keyboard.press(MODIFIER + "+Shift+z")
    assert area.input_value() == after


def without_keydown(page):
    # insert_text skips keydown; it does not emulate a physical iOS keyboard.
    for text in ["kemiti", "?", " "]:
        page.keyboard.insert_text(text)
    assert page.locator("#roman").input_value() == "କେମିତି? "


def stale_clear_toast(page):
    page.keyboard.type("kemiti ")
    page.locator("#clear").click()
    page.keyboard.type("a")
    page.keyboard.press("Backspace")
    assert page.locator("#roman").input_value() == ""
    assert not page.locator("#toast-action").is_visible(), "Clear Undo must not target a later deletion"


def noncancelable_boundary(page):
    page.keyboard.type("kemiti")
    # Synthetic event-contract test: a browser may prohibit canceling beforeinput.
    page.locator("#roman").evaluate("""e => {
        e.dispatchEvent(new InputEvent('beforeinput', {
            inputType: 'insertText', data: ' ', cancelable: false, bubbles: true
        }));
        e.setRangeText(' ', e.selectionStart, e.selectionEnd, 'end');
        e.dispatchEvent(new InputEvent('input', {
            inputType: 'insertText', data: ' ', bubbles: true
        }));
    }""")
    assert page.locator("#roman").input_value() == "କେମିତି "
    page.keyboard.press(MODIFIER + "+z")
    assert page.locator("#roman").input_value() == "kemiti", "Boundary commit must be one undo step"


def main():
    results = []
    executable = os.environ.get("WEBKIT_EXECUTABLE_PATH")
    with sync_playwright() as playwright:
        browser = playwright.webkit.launch(**({"executable_path": executable} if executable else {}))
        try:
            for test in [copied_literals, commit_history, dictionary_selection,
                         without_keydown, stale_clear_toast, noncancelable_boundary]:
                context = browser.new_context(viewport={"width": 1440, "height": 1000}, service_workers="block")
                context.add_init_script("localStorage.setItem('odia.pref.seenIntro', '1')")
                page = context.new_page()
                page.set_default_timeout(10000)
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                try:
                    page.goto(URL)
                    page.locator(".dict-search").wait_for(state="attached")
                    page.locator("#roman").focus()
                    test(page)
                    assert not errors, f"Uncaught browser errors: {errors}"
                    results.append({"name": test.__name__, "pass": True})
                    print("PASS", test.__name__, flush=True)
                except Exception as error:
                    results.append({"name": test.__name__, "pass": False, "detail": str(error) or type(error).__name__})
                    print("FAIL", test.__name__, str(error), flush=True)
                finally:
                    context.close()
        finally:
            browser.close()
    print(json.dumps({"suite": "editing-webkit", "passed": sum(r["pass"] for r in results),
                      "total": len(results), "results": results}, ensure_ascii=False, indent=2))
    return 0 if all(result["pass"] for result in results) else 1


if __name__ == "__main__":
    sys.exit(main())
