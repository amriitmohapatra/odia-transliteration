#!/usr/bin/env python3
"""Wave 2: append additional literature/blog sources to the wave-1 harvest."""
import json
import os
import sys
import time

import harvest_lit as H
import run_lit

HERE = os.path.dirname(os.path.abspath(__file__))

EXTRA = [
    ("odishasahitya", lambda: H.wp_rest("odishasahitya.com", "odishasahitya", max_pages=8)),
    ("odiabibhaba", lambda: H.wp_rest("odiabibhaba.in", "odiabibhaba", max_pages=8)),
    # Panchatantra + folk tales retold in Odia: children's register, short words
    ("hiteshguideline", lambda: H.wpcom("hiteshguideline.wordpress.com", "stories-hiteshguideline", want=140)),
    ("odiaghara", lambda: H.wpcom("odiaghara.wordpress.com", "blog-odiaghara", want=20)),
    ("odiapuo", lambda: H.wpcom("odiapuo.wordpress.com", "blog-odiapuo", want=40)),
    ("odiakabita", lambda: H.wpcom("odiakabita.wordpress.com", "blog-odiakabita", want=10)),
]


def load_existing():
    p = os.path.join(HERE, "raw-lit.jsonl")
    if not os.path.exists(p):
        return
    with open(p, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            H.DOCS.append(d)
            H.SEEN_HASH.add(hash(d["text"][:4000]))
    print("loaded %d existing docs" % len(H.DOCS), flush=True)
    lp = os.path.join(HERE, "fetch-log.tsv")
    if os.path.exists(lp):
        with open(lp, encoding="utf-8") as f:
            next(f)
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) == 3:
                    H.FETCH_LOG.append((parts[0], parts[1], int(parts[2])))


def main():
    load_existing()
    todo = EXTRA
    if len(sys.argv) > 1:
        names = set(sys.argv[1:])
        todo = [x for x in EXTRA + run_lit.SOURCES if x[0] in names]
    for label, fn in todo:
        print("== %s ==" % label, flush=True)
        t0 = time.time()
        try:
            n = fn()
        except Exception as e:
            print("  !! %s failed: %r" % (label, e), flush=True)
            H.FETCH_LOG.append((label, "ADAPTER_FAIL:%r" % e, 0))
            continue
        print("  -> %s: %d odia chars in %.0fs" % (label, n, time.time() - t0), flush=True)
    run_lit.write_outputs()


if __name__ == "__main__":
    main()
