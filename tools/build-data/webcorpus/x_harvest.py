#!/usr/bin/env python3
"""Harvest Odia-script post text from x.com profile pages.

x.com server-renders recent posts into the HTML payload as JS string literals
(`full_text:"..."`) plus NoteTweet `text:"..."` for long posts. No auth needed
for the logged-out profile view. Build-time only.
"""
import json
import os
import random
import re
import sys
import time
import unicodedata

HERE = "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus"
sys.path.insert(0, HERE)
from fetch_lib import fetch, ODIA_RE  # noqa: E402

# JS string literal after full_text: / text: / description:
FULLTEXT_RE = re.compile(r'(?:full_text|description)\s*:\s*"((?:[^"\\]|\\.)*)"')
NOTETWEET_RE = re.compile(r'__typename\s*:\s*"NoteTweet"\s*,\s*text\s*:\s*"((?:[^"\\]|\\.)*)"')

ESCAPES = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f"}


def unescape_js(s):
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            nxt = s[i + 1]
            if nxt == "u" and i + 5 < len(s):
                try:
                    out.append(chr(int(s[i + 2:i + 6], 16)))
                    i += 6
                    continue
                except ValueError:
                    pass
            if nxt in ESCAPES:
                out.append(ESCAPES[nxt])
                i += 2
                continue
            out.append(nxt)
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


def clean_post(t):
    t = re.sub(r"https?://t\.co/\S+", " ", t)
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return unicodedata.normalize("NFC", t)


def harvest_handle(handle, path=""):
    url = "https://x.com/%s%s" % (handle, path)
    st, txt, note = fetch(url, timeout=30)
    if not txt:
        return {"handle": handle, "url": url, "status": st, "note": note,
                "posts": [], "odia_posts": 0}
    seen = set()
    posts = []
    for m in list(FULLTEXT_RE.finditer(txt)) + list(NOTETWEET_RE.finditer(txt)):
        raw = unescape_js(m.group(1))
        if not ODIA_RE.search(raw):
            continue
        c = clean_post(raw)
        if len(c) < 8:
            continue
        # dedupe on prefix so truncated + full versions collapse
        key = c[:60]
        if key in seen:
            # prefer the longer version
            for i, p in enumerate(posts):
                if p[:60] == key and len(c) > len(p):
                    posts[i] = c
            continue
        seen.add(key)
        posts.append(c)
    return {"handle": handle, "url": url, "status": st, "note": note,
            "posts": posts, "odia_posts": len(posts)}


HANDLES = [
    # --- politicians ---
    ("Naveen_Odisha", "Naveen Patnaik (ex-CM, BJD)"),
    ("MohanMOdisha", "Mohan Charan Majhi (CM)"),
    ("dpradhanbjp", "Dharmendra Pradhan (Union Minister)"),
    ("PandaJay", "Baijayant Jay Panda (BJP)"),
    ("pinakimisra", "Pinaki Misra (ex-MP)"),
    ("VKPandian_", "V K Pandian"),
    ("SnehanginiC", "Snehangini Chhuria (Minister)"),
    ("KVSinghdeo", "K V Singh Deo (Dy CM)"),
    ("PravatiParida", "Pravati Parida (Dy CM)"),
    ("SureshPujari_", "Suresh Pujari (Minister)"),
    ("BhartruhariMj", "Bhartruhari Mahtab (MP)"),
    ("sasmitpatra", "Sasmit Patra (MP, BJD)"),
    ("achyuta_samanta", "Achyuta Samanta (MP)"),
    ("Sarangi_Odisha", "Aparajita Sarangi (MP)"),
    ("BJPMukeshMahali", "Mukesh Mahaling (Health Minister)"),
    ("krushnachandra_", "Krushna Chandra Patra"),
    # --- parties / govt / CMO ---
    ("CMO_Odisha", "Odisha CMO"),
    ("bjd_odisha", "Biju Janata Dal"),
    ("BJP4Odisha", "BJP Odisha"),
    ("INCOdisha", "Congress Odisha"),
    ("IPR_Odisha", "I&PR Dept, Govt of Odisha"),
    ("HFWOdisha", "Health & Family Welfare Odisha"),
    ("SRC_Odisha", "Special Relief Commissioner Odisha"),
    ("odisha_police", "Odisha Police"),
    ("Commissionerate", "Commissionerate Police BBSR"),
    ("SchoolEduOdisha", "School & Mass Education Odisha"),
    ("AgriOdisha", "Agriculture Dept Odisha"),
    ("OdishaTourism", "Odisha Tourism"),
    ("PanchayatOdisha", "Panchayati Raj Odisha"),
    ("WCDOdisha", "Women & Child Development Odisha"),
    ("SSEPD_Odisha", "SSEPD Odisha"),
    ("EnergyOdisha", "Energy Dept Odisha"),
    # --- Odia-language news accounts (informal register, short headlines) ---
    ("otvnews", "OTV"),
    ("KanakNews", "Kanak News"),
    ("NandighoshaTV", "Nandighosha TV"),
    ("news18odia", "News18 Odia"),
    ("Sambad_Odisha", "Sambad"),
    ("dharitri_odisha", "Dharitri"),
    ("ZeeOdisha", "Zee Odisha"),
    ("argusnews_in", "Argus News"),
    ("odishareporter", "Odisha Reporter"),
    ("nnsodia", "NNS Odia TV"),
]

if __name__ == "__main__":
    out_path = os.path.join(HERE, "x_posts.jsonl")
    log = []
    total_posts = 0
    with open(out_path, "w", encoding="utf-8") as fh:
        for handle, who in HANDLES:
            r = harvest_handle(handle)
            r["who"] = who
            log.append({k: r[k] for k in ("handle", "who", "status", "note", "odia_posts")})
            print(json.dumps(log[-1], ensure_ascii=False), flush=True)
            for p in r["posts"]:
                fh.write(json.dumps({"src": "x.com/" + handle, "who": who,
                                     "text": p}, ensure_ascii=False) + "\n")
            total_posts += r["odia_posts"]
            time.sleep(random.uniform(1.5, 3.0))
    print("TOTAL_ODIA_POSTS", total_posts)
    with open(os.path.join(HERE, "x_harvest_log.json"), "w", encoding="utf-8") as fh:
        json.dump(log, fh, ensure_ascii=False, indent=1)
