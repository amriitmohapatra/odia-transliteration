#!/usr/bin/env python3
"""Crawl Odia-script news/government pages, flagging those that quote social posts.

In-lane rationale: X/Facebook/Instagram are largely closed to automated reads, but
Odia news outlets reproduce politicians' and citizens' social posts verbatim in
Odia script. Those articles are the reachable mirror of the social register.
Build-time only.
"""
import json
import os
import random
import re
import sys
import time
import unicodedata
import urllib.parse

HERE = "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus"
sys.path.insert(0, HERE)
from fetch_lib import fetch, strip_html, ODIA_RE  # noqa: E402

SEEDS = [
    "https://odiya.werindia.com/news/odishareporter",
    "https://odiya.werindia.com/",
    "https://www.dharitri.com/",
    "https://www.dharitri.com/category/odisha/",
    "https://www.dharitri.com/category/national/",
    "https://khabarodisha.com/",
    "https://khabarodisha.com/category/odisha/",
    "https://odiapost.in/",
    "https://www.satyapatha.com/",
    "https://www.thepragatinews.com/",
    "https://odia.krishijagran.com/",
    "https://odisha.gov.in/",
    "https://indianewsdiary.com/",
]

# markers that the article reproduces a social-media post
SOCIAL_MARK = re.compile(
    "ଏକ୍ସ|ଟ୍ୱିଟ|ଟ୍ଵିଟ|ଫେସବୁକ|ଇନଷ୍ଟାଗ୍ରାମ|ଇନ୍ଷ୍ଟାଗ୍ରାମ|ସୋସିଆଲ|ସାମାଜିକ ଗଣମାଧ୍ୟମ|"
    "ପୋଷ୍ଟ|ଭାଇରାଲ|ହ୍ୟାଣ୍ଡଲ|ଲେଖିଛନ୍ତି|ଜଣାଇଛନ୍ତି|ଟ୍ୱିଟର|ୟୁଟ୍ୟୁବ|ହ୍ୱାଟସଆପ|ରିଲ୍")

BAD_EXT = re.compile(r"\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|mp3|zip|css|js|ico)(\?|$)", re.I)
HREF_RE = re.compile(r'href=["\']([^"\'#]+)["\']', re.I)


def norm_url(base, href):
    try:
        u = urllib.parse.urljoin(base, href)
    except ValueError:
        return None
    p = urllib.parse.urlsplit(u)
    if p.scheme not in ("http", "https"):
        return None
    if BAD_EXT.search(p.path):
        return None
    # percent-encode non-ASCII path/query so urllib can handle Odia slugs
    path = urllib.parse.quote(p.path, safe="/%:@&=+$,~")
    query = urllib.parse.quote(p.query, safe="/%:@&=+$,~?")
    return urllib.parse.urlunsplit((p.scheme, p.netloc, path, query, ""))


def main():
    seen = set()
    queue = []
    for s in SEEDS:
        st, txt, note = fetch(s, timeout=25)
        print(json.dumps({"seed": s, "status": st, "note": note, "bytes": len(txt)}), flush=True)
        if not txt:
            continue
        host = urllib.parse.urlsplit(s).netloc
        for href in HREF_RE.findall(txt):
            u = norm_url(s, href)
            if not u or u in seen:
                continue
            if urllib.parse.urlsplit(u).netloc != host:
                continue
            if len(urllib.parse.urlsplit(u).path.strip("/")) < 12:
                continue  # skip section roots
            seen.add(u)
            queue.append(u)
        time.sleep(0.8)

    random.shuffle(queue)
    print("QUEUE", len(queue), flush=True)

    out = os.path.join(HERE, "news_social_pages.jsonl")
    n_ok = n_social = 0
    with open(out, "w", encoding="utf-8") as fh:
        for i, u in enumerate(queue[:700]):
            st, txt, note = fetch(u, timeout=20)
            if not txt:
                continue
            plain = strip_html(txt)
            plain = unicodedata.normalize("NFC", plain)
            if len(ODIA_RE.findall(plain)) < 200:
                continue
            # keep only the Odia-bearing sentences
            keep = []
            for seg in re.split(r"[\n।]", plain):
                seg = seg.strip()
                if len(seg) < 12:
                    continue
                od = len(ODIA_RE.findall(seg))
                if od >= 10 and od / len(seg) > 0.55:
                    keep.append(seg)
            if not keep:
                continue
            body = " । ".join(keep)
            is_social = bool(SOCIAL_MARK.search(body))
            n_ok += 1
            n_social += int(is_social)
            fh.write(json.dumps({"url": u, "quotes_social": is_social,
                                 "text": body}, ensure_ascii=False) + "\n")
            if i % 40 == 0:
                print("page %d/%d ok=%d social=%d" % (i, min(700, len(queue)), n_ok, n_social), flush=True)
            time.sleep(random.uniform(0.4, 1.0))
    print("PAGES_OK", n_ok, "QUOTES_SOCIAL", n_social)


if __name__ == "__main__":
    main()
