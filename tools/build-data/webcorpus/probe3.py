#!/usr/bin/env python3
"""Probe Telegram public previews + citizen-register sources."""
import sys, json
sys.path.insert(0, "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus")
from fetch_lib import fetch, strip_html, ODIA_RE

URLS = [
    # Telegram public channel previews (informal register)
    "https://t.me/s/odiahdfullscreenstatus",
    "https://t.me/s/Adda247Odia",
    "https://t.me/s/reviveollywood_official",
    "https://t.me/s/odia_status_video",
    "https://t.me/s/OdiaShayari",
    "https://t.me/s/odishajobalert",
    "https://t.me/s/odisha_job",
    "https://t.me/s/OdiaGK",
    "https://t.me/s/odia_gk_quiz",
    "https://t.me/s/OdishaNewsLive",
    "https://t.me/s/prameyanews",
    "https://t.me/s/sambadenglish",
    "https://t.me/s/argusnewsindia",
    "https://t.me/s/kalingatv",
    "https://t.me/s/odishabytes",
    "https://t.me/s/otvkhabar",
    # ordinary-citizen / informal Odia
    "https://www.reddit.com/r/odisha/.json?limit=100",
    "https://www.reddit.com/r/Bhubaneswar/.json?limit=100",
    "https://or.wikipedia.org/wiki/ବିଶେଷ:ସାମ୍ପ୍ରତିକ_ପରିବର୍ତ୍ତନ",
    # news pages that quote social posts verbatim
    "https://odishatv.in/odia",
    "https://odishatv.in/",
    "https://www.prameyanews.com/",
    "https://kalingatv.com/odia/",
    "https://www.sambadepaper.com/",
    "https://odia.krishijagran.com/",
]

for u in URLS:
    st, txt, note = fetch(u, timeout=25)
    plain = strip_html(txt) if txt else ""
    n = len(ODIA_RE.findall(plain))
    print(json.dumps({"url": u, "status": st, "note": note,
                      "bytes": len(txt), "odia_chars": n}, ensure_ascii=False))
