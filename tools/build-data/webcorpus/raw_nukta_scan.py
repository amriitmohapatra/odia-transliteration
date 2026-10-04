#!/usr/bin/env python3
"""Count nukta encodings in RAW server bytes, BEFORE any NFC normalisation.

The main pipeline NFC-normalises on ingest, which by definition converts any
precomposed U+0B5C/U+0B5D into U+0B21/U+0B22 + U+0B3C. So the question "does
real Odia writing on the wire ever use the precomposed code points?" can only be
answered here, on unnormalised text.
"""
import json
import os
import random
import sys
import time

HERE = "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus"
sys.path.insert(0, HERE)
from fetch_lib import fetch  # noqa: E402

NUKTA = "଼"
DEC_DDA = "ଡ଼"
DEC_DDHA = "ଢ଼"
PRE_DDA = "ଡ଼"
PRE_DDHA = "ଢ଼"
YYA = "ୟ"


def scan(text):
    return {
        "U+0B3C_total": text.count(NUKTA),
        "U+0B21+U+0B3C": text.count(DEC_DDA),
        "U+0B22+U+0B3C": text.count(DEC_DDHA),
        "U+0B5C_precomposed": text.count(PRE_DDA),
        "U+0B5D_precomposed": text.count(PRE_DDHA),
        "U+0B5F_YYA": text.count(YYA),
    }


URLS = [
    "https://x.com/Naveen_Odisha",
    "https://x.com/MohanMOdisha",
    "https://x.com/CMO_Odisha",
    "https://x.com/bjd_odisha",
    "https://x.com/BJP4Odisha",
    "https://x.com/INCOdisha",
    "https://x.com/dpradhanbjp",
    "https://x.com/HFWOdisha",
    "https://x.com/WCDOdisha",
    "https://x.com/odishareporter",
    "https://x.com/nnsodia",
    "https://x.com/dm_puri",
    "https://odiya.werindia.com/news/odishareporter",
    "https://www.dharitri.com/",
    "https://khabarodisha.com/",
    "https://odiapost.in/",
    "https://www.satyapatha.com/",
    "https://odia.krishijagran.com/",
    "https://odisha.gov.in/",
    "https://or.wikipedia.org/wiki/%E0%AC%93%E0%AC%A1%E0%AD%BC%E0%AC%BF%E0%AC%B6%E0%AC%BE",
]

if __name__ == "__main__":
    tot = {k: 0 for k in scan("")}
    per = []
    for u in URLS:
        st, txt, note = fetch(u, timeout=30)
        s = scan(txt) if txt else scan("")
        s.update({"url": u, "status": st, "note": note, "bytes": len(txt)})
        per.append(s)
        for k in tot:
            tot[k] += s[k]
        print(json.dumps(s, ensure_ascii=False), flush=True)
        time.sleep(random.uniform(1.0, 2.0))
    print("RAW_TOTALS", json.dumps(tot))
    with open(os.path.join(HERE, "raw_nukta_scan.json"), "w", encoding="utf-8") as fh:
        json.dump({"per_url": per, "totals": tot}, fh, ensure_ascii=False, indent=1)
