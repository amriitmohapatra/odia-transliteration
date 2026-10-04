#!/usr/bin/env python3
"""Round 3: snowball. Take @mentions found inside already-harvested Odia posts
and fetch those profiles. Mentions inside Odia-script posts are a good prior for
"this account also posts in Odia", and it reaches ordinary citizens, not just
the hand-picked official handles."""
import json
import os
import random
import re
import sys
import time
from collections import Counter

HERE = "/Users/amriitmohapatra/Documents/Odia_transliteration/tools/build-data/webcorpus"
sys.path.insert(0, HERE)
from fetch_lib import fetch, ODIA_RE  # noqa: E402
from x_harvest import FULLTEXT_RE, NOTETWEET_RE, unescape_js, clean_post, HANDLES as H1  # noqa: E402
from x_harvest2 import HANDLES as H2  # noqa: E402

MENTION_RE = re.compile(r"@([A-Za-z0-9_]{2,15})")

def load_texts():
    out = []
    for fn in ("x_posts.jsonl", "x_posts_round2.jsonl"):
        p = os.path.join(HERE, fn)
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line:
                out.append(json.loads(line)["text"])
    return out


if __name__ == "__main__":
    texts = load_texts()
    tried = {h.lower() for h, _ in H1} | {h.lower() for h in H2}
    cnt = Counter()
    for t in texts:
        for m in MENTION_RE.findall(t):
            if m.lower() not in tried:
                cnt[m] += 1
    cands = [h for h, _ in cnt.most_common(120)]
    print("candidate handles:", len(cands), json.dumps(cands[:40]), flush=True)

    seen = set()
    for line in open(os.path.join(HERE, "x_posts.jsonl"), encoding="utf-8"):
        seen.add(json.loads(line)["text"][:60])
    p2 = os.path.join(HERE, "x_posts_round2.jsonl")
    if os.path.exists(p2):
        for line in open(p2, encoding="utf-8"):
            seen.add(json.loads(line)["text"][:60])

    STATUS_RE = re.compile(r"/status/(\d{15,25})")
    rows, log = [], []
    status_ids = []

    def pull(txt, src, kind):
        n = 0
        for m in list(FULLTEXT_RE.finditer(txt)) + list(NOTETWEET_RE.finditer(txt)):
            raw = unescape_js(m.group(1))
            if not ODIA_RE.search(raw):
                continue
            c = clean_post(raw)
            if len(c) < 8 or c[:60] in seen:
                continue
            seen.add(c[:60])
            rows.append({"src": src, "kind": kind, "text": c})
            n += 1
        return n

    for h in cands:
        st, txt, note = fetch("https://x.com/%s" % h, timeout=30)
        n = pull(txt, "x.com/" + h, "snowball") if txt else 0
        if txt and n:
            for sid in set(STATUS_RE.findall(txt)):
                status_ids.append((h, sid))
        log.append({"handle": h, "status": st, "note": note, "odia_posts": n})
        print(json.dumps(log[-1], ensure_ascii=False), flush=True)
        time.sleep(random.uniform(1.0, 2.0))

    # status permalinks carry a handful of replies, which is where non-official
    # accounts (ordinary citizens) actually show up
    print("SNOWBALL_PROFILE_POSTS", len(rows), "STATUS_IDS", len(status_ids), flush=True)
    random.shuffle(status_ids)
    for i, (h, sid) in enumerate(status_ids[:500]):
        u = "https://x.com/%s/status/%s" % (h, sid)
        st, txt, note = fetch(u, timeout=30)
        n = pull(txt, u, "reply_thread") if txt else 0
        if i % 25 == 0:
            print("status %d/%d +%d total=%d" % (i, min(500, len(status_ids)), n, len(rows)), flush=True)
        time.sleep(random.uniform(0.8, 1.6))

    with open(os.path.join(HERE, "x_posts_round3.jsonl"), "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    with open(os.path.join(HERE, "x_harvest3_log.json"), "w", encoding="utf-8") as fh:
        json.dump(log, fh, ensure_ascii=False, indent=1)
    print("TOTAL_ROWS", len(rows))
