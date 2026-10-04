#!/usr/bin/env python3
"""Probe alternative social endpoints that sometimes serve without auth."""
import sys, json, re
sys.path.insert(0, "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus")
from fetch_lib import fetch, strip_html, ODIA_RE

URLS = [
    # --- X/Twitter unauthenticated side doors ---
    "https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2FNaveen_Odisha%2Fstatus%2F1795757440855679425",
    "https://syndication.twitter.com/srv/timeline-profile/screen-name/Naveen_Odisha",
    "https://syndication.twitter.com/srv/timeline-profile/screen-name/CMO_Odisha",
    "https://cdn.syndication.twimg.com/timeline/profile?screen_name=MohanMOdisha",
    # --- Telegram public web preview (no auth needed) ---
    "https://t.me/s/odishatv",
    "https://t.me/s/kanaknewsofficial",
    "https://t.me/s/OdiaNews",
    "https://t.me/s/odishareporter",
    "https://t.me/s/BJDOdisha",
    "https://t.me/s/odisha_news",
    "https://t.me/s/OdiaBhasa",
    "https://t.me/s/odiasahitya",
    # --- YouTube channel pages (titles/descriptions in Odia) ---
    "https://www.youtube.com/@KanakNews/videos",
    "https://www.youtube.com/@OTVOdisha/videos",
    "https://www.youtube.com/@NandighoshaTV/videos",
    # --- Odia-script news pages surfaced by search ---
    "https://www.satyapatha.com/",
    "https://www.thepragatinews.com/cm-mohan-majhi-110/",
    "https://odiya.werindia.com/news/odishareporter",
    "https://odiapost.in/",
    "https://www.dharitri.com/",
    "https://khabarodisha.com/",
]

for u in URLS:
    st, txt, note = fetch(u, timeout=25)
    plain = strip_html(txt) if txt else ""
    n = len(ODIA_RE.findall(plain))
    print(json.dumps({"url": u, "status": st, "note": note,
                      "bytes": len(txt), "odia_chars": n}, ensure_ascii=False))
