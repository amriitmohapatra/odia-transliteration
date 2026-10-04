#!/usr/bin/env python3
import sys, json
sys.path.insert(0, "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus")
from fetch_lib import fetch, strip_html, odia_ratio, ODIA_RE

URLS = [
    # politicians / parties own sites
    "https://bjd.co.in/",
    "https://www.bjd.co.in/or",
    "https://naveenpatnaik.in/",
    "https://dharmendrapradhan.com/",
    "https://www.dharmendrapradhan.in/",
    "https://jaypanda.in/",
    "https://www.jaypanda.in/odia/",
    "https://cmo.odisha.gov.in/",
    "https://odisha.gov.in/",
    "https://www.bjpodisha.org/",
    "https://bjpodisha.in/",
    # nitter mirrors
    "https://nitter.net/Naveen_Odisha",
    "https://nitter.poast.org/Naveen_Odisha",
    "https://xcancel.com/Naveen_Odisha",
    "https://nitter.privacydev.net/Naveen_Odisha",
    # x/twitter direct
    "https://twitter.com/Naveen_Odisha",
    "https://x.com/CMO_Odisha",
    # facebook / instagram
    "https://www.facebook.com/Naveen.Odisha/",
    "https://www.instagram.com/naveen_odisha/",
]

for u in URLS:
    st, txt, note = fetch(u, timeout=20)
    if txt:
        plain = strip_html(txt)
        n_odia = len(ODIA_RE.findall(plain))
    else:
        plain, n_odia = "", 0
    print(json.dumps({"url": u, "status": st, "note": note,
                      "bytes": len(txt), "odia_chars": n_odia}, ensure_ascii=False))
