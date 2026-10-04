#!/usr/bin/env python3
"""Re-fetch a sample of harvested URLs and count PRE-NFC nukta encodings.

The harvest pipeline NFC-normalizes, which destroys the distinction between
U+0B5C/U+0B5D (precomposed) and U+0B21/U+0B22 + U+0B3C (decomposed).
This probe looks at the raw decoded HTML, before any normalization, to find
out what these sites actually publish on the wire.
"""
import json
import random
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

from fetch_gov import fetch, html_to_text

PRE_DDA = "ଡ଼"
PRE_DDHA = "ଢ଼"
NUKTA = "଼"
DDA = "ଡ"
DDHA = "ଢ"


def main(jsonl, n_sample=45):
    urls = [json.loads(l)["url"] for l in open(jsonl, encoding="utf-8")]
    # one page per host first, then fill
    byhost = {}
    for u in urls:
        byhost.setdefault(urlparse(u).netloc, []).append(u)
    sample = [v[0] for v in byhost.values()]
    random.seed(0)
    random.shuffle(sample)
    sample = sample[:n_sample]

    agg = Counter()
    per_page = []
    for i, u in enumerate(sample, 1):
        try:
            s, c, html = fetch(u, timeout=25)
        except Exception as e:
            print(f"[{i}] ERR {type(e).__name__} {u}", flush=True)
            continue
        txt = html_to_text(html)  # NOT normalized
        assert txt == txt  # explicit: no NFC applied here
        d = {
            "pre_0B5C": txt.count(PRE_DDA),
            "pre_0B5D": txt.count(PRE_DDHA),
            "dec_DDA_NUKTA": txt.count(DDA + NUKTA),
            "dec_DDHA_NUKTA": txt.count(DDHA + NUKTA),
            "nukta_total": txt.count(NUKTA),
        }
        # sanity: is the served page already in NFC?
        d["is_nfc"] = unicodedata.is_normalized("NFC", txt)
        for k, v in d.items():
            if isinstance(v, int):
                agg[k] += v
        agg["pages"] += 1
        agg["nfc_pages"] += 1 if d["is_nfc"] else 0
        per_page.append({"url": u, **d})
        print(f"[{i}/{len(sample)}] pre5C={d['pre_0B5C']} pre5D={d['pre_0B5D']} "
              f"dec={d['dec_DDA_NUKTA']}/{d['dec_DDHA_NUKTA']} nfc={d['is_nfc']} {u}",
              flush=True)
        time.sleep(0.4)

    Path(Path(jsonl).parent / "precomposed-probe.json").write_text(
        json.dumps({"aggregate": dict(agg), "pages": per_page},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nAGGREGATE:", json.dumps(dict(agg), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 45)
