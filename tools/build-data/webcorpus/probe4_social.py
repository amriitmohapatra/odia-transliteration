#!/usr/bin/env python3
"""Honest attempts at the remaining social platforms: FB, IG, Threads, Bluesky, Mastodon."""
import json
import sys
import urllib.parse

sys.path.insert(0, "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus")
from fetch_lib import fetch, strip_html, ODIA_RE

Q = ["ଓଡ଼ିଶା", "ଓଡ଼ିଆ", "ଭଲ", "ଆଜି", "ମୁଁ"]

URLS = [
    # Facebook public surfaces
    ("facebook", "https://mbasic.facebook.com/MohanMOdisha"),
    ("facebook", "https://m.facebook.com/MohanMOdisha"),
    ("facebook", "https://www.facebook.com/MohanMOdisha/"),
    ("facebook", "https://www.facebook.com/KanakNews/"),
    # Instagram
    ("instagram", "https://www.instagram.com/mohanmajhiofficial/"),
    ("instagram", "https://www.instagram.com/api/v1/users/web_profile_info/?username=naveen_odisha"),
    # Threads
    ("threads", "https://www.threads.net/@mohanmajhi_odisha"),
    ("threads", "https://www.threads.com/@naveen_odisha"),
    # Koo (shut down 2024 - verify)
    ("koo", "https://www.kooapp.com/profile/Naveen_Odisha"),
]

# Bluesky public AppView API - no auth required
for q in Q:
    URLS.append(("bluesky", "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=%s&limit=100"
                 % urllib.parse.quote(q)))
# Mastodon public search / tag timelines
for tag in ["Odisha", "Odia", "ଓଡ଼ିଶା"]:
    URLS.append(("mastodon", "https://mastodon.social/api/v1/timelines/tag/%s?limit=40"
                 % urllib.parse.quote(tag)))

for plat, u in URLS:
    st, txt, note = fetch(u, timeout=25)
    plain = strip_html(txt) if txt else ""
    n = len(ODIA_RE.findall(plain))
    print(json.dumps({"platform": plat, "url": u[:110], "status": st,
                      "note": note, "bytes": len(txt), "odia_chars": n},
                     ensure_ascii=False), flush=True)
