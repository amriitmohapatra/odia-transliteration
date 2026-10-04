#!/usr/bin/env python3
"""
Exercise the built app in WebKit — the engine Safari runs.

Every other browser check in this repo used headless Chrome, which is Blink.
Safari is WebKit, so a Chrome pass says nothing about the browser this app is
actually opened in on a Mac. Playwright's WebKit is built from WebKit trunk, so
this covers WebKit-only CSS and JS behaviour, and the clipboard gesture rule
that Safari enforces and Chrome does not.

    python3 tools/eval/webkit-check.py                 # desktop Safari engine
    python3 tools/eval/webkit-check.py --iphone        # iPhone emulation
    python3 tools/eval/webkit-check.py --old-safari    # emulate Safari < 15.4

The --iphone mode is a proxy, not a device. It cannot cover Add to Home Screen,
the real on-screen keyboard, or Safari's clipboard prompt on hardware.

Checks performed:
  1. the page loads and the engine initialises
  2. typing produces correct Odia (nukta verified BY CODE POINT, not by eye)
  3. tapping a word opens whole-word candidates, and tapping one commits it
  4. the choice is persisted, so it leads the list next time
  5. no horizontal overflow at iPhone width
  6. every input is >= 16px, or iOS Safari zooms the page on focus
  7. the clipboard write happens inside the gesture with nothing awaited first

    python3 tools/eval/ios-webkit-check.py [path-to-html]
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = ROOT / "docs" / "odia-app.html"

args = [a for a in sys.argv[1:] if not a.startswith("--")]
IPHONE = "--iphone" in sys.argv
# Emulate a pre-15.4 Safari by removing the built-ins it lacks. A build `target`
# only rewrites syntax, so a modern METHOD pulled in by a dependency sails
# through and dies at runtime. smol-toml calls Object.hasOwn, which shipped in
# Safari 15.4 — that reached a tester as "Engine failed to load".
OLD_SAFARI = "--old-safari" in sys.argv
STRIP_MODERN = "delete Object.hasOwn; delete String.prototype.replaceAll;"
TARGET = Path(args[0]) if args else DEFAULT
if not TARGET.exists():
    print(f"error: {TARGET} not found — run `npm run build:app` first", file=sys.stderr)
    raise SystemExit(1)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("error: playwright not installed", file=sys.stderr)
    raise SystemExit(1)

# Decomposed, per the project invariant. Never the precomposed U+0B5C/U+0B5D.
DDA = "ଡ଼"
EXPECT = {
    "janmadina": "ଜନ୍ମଦିନ",
    "ghara": "ଘର",
    "pani": "ପାଣି",
    "odisha": "ଓ" + DDA + "ିଶା",
}

failures: list[str] = []
def check(ok: bool, label: str, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f"   {detail}" if detail else ""))
    if not ok:
        failures.append(label)

def cps(s: str) -> str:
    return " ".join(f"U+{ord(c):04X}" for c in s)

with sync_playwright() as p:
    browser = p.webkit.launch()
    profile = p.devices["iPhone 14"] if IPHONE else {"viewport": {"width": 1280, "height": 900}}
    label = "iPhone 14 emulation" if IPHONE else "desktop macOS"
    if OLD_SAFARI:
        label += " · Safari <15.4 emulated"
    print(f"\nWebKit check — WebKit {browser.version}, {label}")
    print(f"target: {TARGET.relative_to(ROOT)}\n")

    # WebKit does not expose the clipboard permission names Chromium does, so the
    # clipboard is checked statically below rather than by granting permission.
    ctx = browser.new_context(**profile)
    if OLD_SAFARI:
        ctx.add_init_script(STRIP_MODERN)
    page = ctx.new_page()
    page.goto(TARGET.as_uri())
    page.wait_for_load_state("networkidle")

    # 1 — engine is live
    ta = page.locator("textarea").first
    check(ta.count() > 0, "page loads and the composer is present")
    ua = page.evaluate("navigator.userAgent")
    check("Safari" in ua or "AppleWebKit" in ua, "running under WebKit", ua.split(")")[0] + ")")

    # 2 — transliteration, verified by code point
    for roman, want in EXPECT.items():
        ta.fill(roman)
        page.wait_for_timeout(400)
        got = page.locator("#output").first.inner_text().strip()
        got = got.split("\n")[0].strip()
        ok = want in got
        check(ok, f"{roman} -> {want}", cps(want) if ok else f"got {got!r} {cps(got)}")

    status = page.evaluate(
        "document.querySelector('#status,.status')?.innerText.trim() || ''"
    )
    check("failed to load" not in status.lower(),
          "engine loaded without error", status[:70] or "(no status message)")

    # the invariant, explicitly
    ta.fill("odisha")
    page.wait_for_timeout(400)
    out_text = page.evaluate(
        "document.querySelector('#output')?.innerText || ''"
    )
    check("ଡ଼" not in out_text and "ଢ଼" not in out_text,
          "no precomposed nukta in rendered output")

    # 3 — tap a word, get whole-word candidates, tap one
    ta.fill("chanda")
    page.wait_for_timeout(400)
    words = page.locator("#output button.word, #output .w, #output span[data-i]")
    tapped = False
    if words.count() > 0:
        words.first.click()
        page.wait_for_timeout(300)
        opts = page.locator(
            "#picker-list button, #alts button, [role='listbox'] button, .candidates button"
        )
        n = opts.count()
        check(n > 1, "tapping a word opens whole-word candidates", f"{n} options")
        if n > 1:
            label = opts.nth(min(2, n - 1)).inner_text().strip()
            opts.nth(min(2, n - 1)).click()
            page.wait_for_timeout(300)
            after = page.evaluate(
                "document.querySelector('#output')?.innerText || ''"
            )
            tapped = True
            check(any(ch in after for ch in label if ord(ch) > 0x0B00),
                  "tapping a candidate commits it", f"chose {label!r}")
    else:
        check(False, "tapping a word opens whole-word candidates", "no word elements found")

    # 4 — the choice persists
    if tapped:
        stored = page.evaluate("JSON.stringify(Object.keys(localStorage))")
        check(stored != "[]", "choice persisted to localStorage", stored[:80])

    # 5 — no horizontal overflow at iPhone width
    overflow = page.evaluate(
        "() => { const d=document.documentElement;"
        " return {scroll:d.scrollWidth, client:d.clientWidth}; }"
    )
    check(overflow["scroll"] <= overflow["client"] + 1,
          "no horizontal overflow", f"scrollWidth={overflow['scroll']} clientWidth={overflow['client']}")

    # 6 — font-size >= 16px on every control, or iOS zooms on focus
    # Only TEXT-ENTRY fields make Safari zoom on focus. Checkboxes and radios do
    # not, so including them just produced a permanent false failure.
    small = page.evaluate(
        "() => Array.from(document.querySelectorAll('input,textarea,select'))"
        ".filter(el => !['checkbox','radio','range','color','button','submit']"
        "  .includes((el.type||'').toLowerCase()))"
        ".map(el => ({tag: el.tagName, type: el.type||'', px: parseFloat(getComputedStyle(el).fontSize)}))"
        ".filter(x => x.px < 16)"
    )
    check(len(small) == 0, "text inputs >= 16px (Safari zooms on focus below that)",
          "" if not small else str(small))

    # 7 — the clipboard write must be synchronous inside the gesture
    src = TARGET.read_text(encoding="utf-8")
    idx = src.find("writeText")
    window = src[max(0, idx - 400): idx] if idx > 0 else ""
    awaited = "await" in window.split("addEventListener")[-1] if idx > 0 else False
    check(idx > 0 and not awaited,
          "clipboard write is inside the gesture with no preceding await")

    shot = ROOT / "tools" / "eval" / ("webkit-iphone.png" if IPHONE else "webkit-macos.png")
    page.screenshot(path=str(shot), full_page=False)
    ctx.close()
    browser.close()

print()
if failures:
    print(f"{len(failures)} check(s) failed: {', '.join(failures)}\n")
    raise SystemExit(1)
print("All WebKit checks passed.\n")
