#!/usr/bin/env python3
"""Round 2: wide handle sweep on x.com + status-page crawl for citizen replies.

Logged-out x.com server-renders only ~4-6 posts per profile, so breadth of
handles and following status permalinks (which carry a few replies from
ordinary accounts) are the two ways to scale. Build-time only.
"""
import json
import os
import random
import re
import sys
import time

HERE = "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus"
sys.path.insert(0, HERE)
from fetch_lib import fetch, ODIA_RE  # noqa: E402
from x_harvest import FULLTEXT_RE, NOTETWEET_RE, unescape_js, clean_post  # noqa: E402

STATUS_RE = re.compile(r'/status/(\d{15,25})')
SCREENNAME_RE = re.compile(r'screen_name\s*:\s*"([A-Za-z0-9_]{2,15})"')

HANDLES = [
    # --- district administrations (Odia-heavy, practical civic register) ---
    "dm_puri", "districtadmndkl", "DM_Rayagada", "DBalasore", "dm_jharsuguda",
    "Ganjam_Admin", "GovernorOdisha", "DM_Kendrapara", "Collector_Angul",
    "dm_bargarh", "DM_Bolangir", "Collectorbhadrak", "dm_boudh", "dm_cuttack",
    "DeogarhDist", "dm_gajapati", "DM_Jagatsinghpur", "dm_jajpur", "dm_kalahandi",
    "DM_Kandhamal", "DM_Keonjhar", "Khordha_Admin", "DM_Koraput", "dm_malkangiri",
    "DM_Mayurbhanj", "dm_nabarangpur", "DM_Nayagarh", "DM_Nuapada", "dm_sambalpur",
    "DM_Sonepur", "DM_Sundargarh", "dm_bhubaneswar", "dm_nabarangapur",
    # --- more ministers / MPs / MLAs ---
    "MohanMajhiBJP", "PrithvirajHarich", "Nityananda_Gond", "BJPKrushnaPatra",
    "surama_padhy", "drpradeepbjp", "RabiNarayanNaik", "GaneshRamSingh",
    "BibhutiJena", "SambitPatra", "JualOram", "drarunkumarsahu", "Rudra_Narayan_",
    "baijayantjaypanda", "PradeepPurohit", "NityanandaGond", "kanak_vardhan",
    "BJDLive", "BJD_Youth", "OdishaCongress",
    # --- Odia-language media & culture accounts ---
    "OdiaOdisha", "odishabytes", "kalingatv", "PrameyaNews7", "SamayaOdia",
    "OdishaSunTimes", "TheOdishaNews", "OdiaLive", "AmaOdisha", "OdishaDiary",
    "OdishaBhaskar", "sambadodia", "DharitriOdia", "OTVKhabar", "News7Odia",
    "OdiaSahitya", "JagannathTemple", "SJTA_Puri", "ShreeJagannathaP",
    "odisha_yuva", "OdiaBhasa", "AmaOdiaBhasa", "OdishaLive",
    # --- ordinary / semi-ordinary Odia-script posters, fan & meme accounts ---
    "OdiaTrolls", "OdiaMemes", "OdiaPua", "OdiaJhia", "OdiaStatus",
    "OdiaShayari", "odia_kabita", "OdiaGapa", "utkal_odisha", "UtkalDivas",
    "OdiaGourav", "JaiJagannath", "OdishaWeather", "IMD_Bhubaneswar",
]

if __name__ == "__main__":
    seen_text = set()
    status_ids = []          # (handle, id)
    rows = []
    log = []

    for h in HANDLES:
        url = "https://x.com/%s" % h
        st, txt, note = fetch(url, timeout=30)
        n = 0
        if txt:
            for m in list(FULLTEXT_RE.finditer(txt)) + list(NOTETWEET_RE.finditer(txt)):
                raw = unescape_js(m.group(1))
                if not ODIA_RE.search(raw):
                    continue
                c = clean_post(raw)
                if len(c) < 8 or c[:60] in seen_text:
                    continue
                seen_text.add(c[:60])
                rows.append({"src": "x.com/" + h, "kind": "profile", "text": c})
                n += 1
            if n:
                for sid in set(STATUS_RE.findall(txt)):
                    status_ids.append((h, sid))
        log.append({"handle": h, "status": st, "note": note, "odia_posts": n})
        print(json.dumps(log[-1], ensure_ascii=False), flush=True)
        time.sleep(random.uniform(1.0, 2.2))

    print("PROFILE_POSTS", len(rows), "STATUS_IDS", len(status_ids), flush=True)

    # --- status pages: full thread + a few replies from ordinary accounts ---
    random.shuffle(status_ids)
    for i, (h, sid) in enumerate(status_ids[:400]):
        url = "https://x.com/%s/status/%s" % (h, sid)
        st, txt, note = fetch(url, timeout=30)
        n = 0
        if txt:
            for m in list(FULLTEXT_RE.finditer(txt)) + list(NOTETWEET_RE.finditer(txt)):
                raw = unescape_js(m.group(1))
                if not ODIA_RE.search(raw):
                    continue
                c = clean_post(raw)
                if len(c) < 8 or c[:60] in seen_text:
                    continue
                seen_text.add(c[:60])
                rows.append({"src": url, "kind": "status_or_reply", "text": c})
                n += 1
        if i % 20 == 0:
            print("status %d/%d %s +%d (total %d)" % (i, min(400, len(status_ids)), sid, n, len(rows)), flush=True)
        time.sleep(random.uniform(0.8, 1.8))

    out = os.path.join(HERE, "x_posts_round2.jsonl")
    with open(out, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(os.path.join(HERE, "x_harvest2_log.json"), "w", encoding="utf-8") as fh:
        json.dump(log, fh, ensure_ascii=False, indent=1)
    print("TOTAL_ROWS", len(rows))
