#!/usr/bin/env python3
"""
Exercise the Sanskrit features of the built app in WebKit — the engine Safari runs.

tools/eval/webkit-check.py already covers the shared behaviour (engine loads,
nukta by code point, candidate picker, clipboard gesture, 16px inputs) and
passes against this build. This file covers only what Appv2 adds, because a
feature that works under node and not in Safari is a feature that does not work:

  1. the mode selector offers all three profiles and switching actually rebuilds
  2. the insert palette renders, and tapping a key inserts at the caret
  3. "|" produces ।  and "||" produces ॥   (preprocess, not the rule engine)
  4. "'" produces ଽ and ":" produces ଃ
  5. the user's verse comes out right, verified BY CODE POINT
  6. Śloka mode outranks Odia+Sanskrit mode on a word-final anusvara
  7. the mode choice persists to localStorage
  8. the palette strip does not widen the page at iPhone width

    python3 Appv2/eval/webkit-sanskrit.py [path-to-html] [--iphone]
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = ROOT / "docs" / "odia-app-sanskrit.html"

args = [a for a in sys.argv[1:] if not a.startswith("--")]
IPHONE = "--iphone" in sys.argv
TARGET = Path(args[0]).resolve() if args else DEFAULT

if not TARGET.exists():
    print(
        f"error: {TARGET} not found — run:\n"
        "  SINGLE_FILE=1 npx vite build --config Appv2/vite.config.ts\n"
        "  node Appv2/scripts/make-single-file.mjs",
        file=sys.stderr,
    )
    raise SystemExit(1)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("error: playwright not installed", file=sys.stderr)
    raise SystemExit(1)

DANDA = "।"
DOUBLE_DANDA = "॥"
AVAGRAHA = "ଽ"
VISARGA = "ଃ"
ANUSVARA = "ଂ"

# The user's line, written by code point so it cannot drift in this file.
VERSE = (
    "ଧ୍ୟାନ "                                # ଧ୍ୟାନ
    "ବଳାତିତଂ "                    # ବଳାତିତଂ
    "ନାନ୍ୟଂ "                          # ନାନ୍ୟଂ
    "ବଳଂ "                                            # ବଳଂ
    "।"                                                         # ।
)

results: list[tuple[bool, str, str]] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    results.append((ok, label, detail))


def cps(s: str) -> str:
    return " ".join(f"U+{ord(c):04X}" for c in s)


def main() -> int:
    with sync_playwright() as pw:
        browser = pw.webkit.launch()
        ctx = (
            browser.new_context(**pw.devices["iPhone 13"])
            if IPHONE
            else browser.new_context(viewport={"width": 1280, "height": 900})
        )
        page = ctx.new_page()
        print(f"WebKit check (Sanskrit) — WebKit {browser.version}, "
              f"{'iPhone 13' if IPHONE else 'desktop macOS'}")
        print(f"target: {TARGET.name}\n")

        page.goto(TARGET.as_uri())
        page.wait_for_selector("#roman", timeout=30_000)
        # The engine loads its assets asynchronously; wait for real output.
        page.fill("#roman", "ghara")
        page.wait_for_function(
            "() => (document.querySelector('#output')?.textContent || '').trim().length > 0",
            timeout=60_000,
        )

        # ---------------------------------------------------------- 1
        opts = page.eval_on_selector_all("#profile option", "els => els.map(e => e.value)")
        check(
            set(opts) == {"everyday", "unified", "sloka"},
            "mode selector offers all three profiles",
            ", ".join(opts),
        )

        def render(text: str) -> str:
            page.fill("#roman", text)
            page.wait_for_timeout(320)
            return (page.text_content("#output") or "").strip()

        def set_mode(mode: str) -> None:
            page.select_option("#profile", mode)
            # Switching may fetch a lexicon chunk; wait for the status to settle.
            page.wait_for_timeout(900)

        # ---------------------------------------------------------- 2
        keys = page.eval_on_selector_all(".palette-key", "els => els.map(e => e.textContent)")
        groups = page.eval_on_selector_all(".palette-name", "els => els.map(e => e.textContent)")
        check(len(keys) >= 20, "insert palette rendered", f"{len(keys)} keys in {len(groups)} groups")
        check(
            {"Vocalics", "Signs", "Letters", "Verse", "Vedic"} <= set(groups),
            "palette has every group",
            ", ".join(groups),
        )

        set_mode("sloka")

        # ---------------------------------------------------------- 3, 4, 5
        out = render("balam |")
        check(DANDA in out, 'typing "|" produces ।', f"{out}   {cps(out)}")

        out = render("balam ||")
        check(DOUBLE_DANDA in out, 'typing "||" produces ॥', f"{out}   {cps(out)}")

        out = render("so'ham")
        check(AVAGRAHA in out, "typing \"'\" produces ଽ", f"{out}   {cps(out)}")

        out = render("du:kha")
        check(VISARGA in out, 'typing ":" produces ଃ', f"{out}   {cps(out)}")

        out = render("don't")
        check("'" in out and AVAGRAHA not in out, "English contractions survive", out)

        out = render("dhyaana balaatitam naanyam balam |")
        check(out == VERSE, "the verse renders exactly", f"{out}\n        {cps(out)}")

        # ---------------------------------------------------------- 6
        #
        # The word has to be OUT OF VOCABULARY for the two modes to differ, and
        # that is not a limitation — it is the design working.
        #
        # "balam" is in the lexicon as ବଳଂ (33 occurrences in the web corpus),
        # so both modes return ବଳଂ: the lexicon outranks the rules in either,
        # and a real attested word should win over a rule guess. The rule
        # weights only get to decide when nothing knows the word.
        #
        # "balaatitam" is not in the corpus, so it is decided by S1 and S2:
        #   sloka   word-final ଂ at w=1.6 and ଳ at 1.15  -> ବଳାତିତଂ
        #   unified word-final ଂ at w=0.55 and ଳ at 0.9  -> ବଲାତିତମ
        sloka_out = render("balaatitam")
        set_mode("unified")
        unified_out = render("balaatitam")
        check(
            sloka_out.endswith(ANUSVARA) and not unified_out.endswith(ANUSVARA),
            "Śloka and Odia+Sanskrit differ on an out-of-vocabulary word",
            f"sloka={sloka_out}  unified={unified_out}",
        )

        # ---------------------------------------------------------- 7
        set_mode("sloka")
        stored = page.evaluate("() => localStorage.getItem('odia.pref.profile')")
        check(stored == "sloka", "mode persists to localStorage", str(stored))

        # ---------------------------------------------------------- 8
        page.fill("#roman", "")
        overflow = page.evaluate(
            "() => ({ scroll: document.documentElement.scrollWidth,"
            "         client: document.documentElement.clientWidth })"
        )
        check(
            overflow["scroll"] <= overflow["client"] + 1,
            "palette strip does not widen the page",
            f"scrollWidth={overflow['scroll']} clientWidth={overflow['client']}",
        )

        # ---------------------------------------------------------- palette insert
        before = page.input_value("#roman")
        page.click(".palette-key >> nth=0")
        page.wait_for_timeout(200)
        after = page.input_value("#roman")
        check(len(after) > len(before), "tapping a palette key inserts at the caret", repr(after))

        browser.close()

    failed = 0
    for ok, label, detail in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f"   {detail}" if detail else ""))
        if not ok:
            failed += 1

    print()
    if failed:
        print(f"{failed} check(s) failed.")
        return 1
    print("All Sanskrit WebKit checks passed.")
    return 0


raise SystemExit(main())
