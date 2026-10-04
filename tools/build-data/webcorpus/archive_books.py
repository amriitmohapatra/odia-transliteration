#!/usr/bin/env python3
"""
Odia books from archive.org, via the public full-text (_djvu.txt) endpoint.

Kept in SEPARATE output files from the born-digital web harvest on purpose:
this text is OCR. OCR noise would (a) inject non-words into a lexicon and
(b) confound the nukta measurement, because U+0B3C is a single small dot
below the glyph and is exactly the kind of mark OCR loses. So the nukta
drop rate is NOT measured on this material -- it is reported apart, as an
OCR-reliability datapoint only.
"""
import json
import os
import sys
import time
import urllib.parse
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import harvest_lit as H

SEARCH = "https://archive.org/advancedsearch.php"


def search_items(rows=400, page=1):
    q = "language:(Oriya OR Odia) AND mediatype:texts"
    url = SEARCH + "?" + urllib.parse.urlencode({
        "q": q, "rows": str(rows), "page": str(page), "output": "json",
    }) + "&fl[]=identifier&fl[]=title&fl[]=year&sort[]=downloads+desc"
    body = H.fetch(url, timeout=90)
    if not body:
        return []
    try:
        return json.loads(body)["response"]["docs"]
    except Exception as e:
        print("  search parse fail: %r" % e)
        return []


def get_text(ident):
    url = "https://archive.org/download/%s/%s_djvu.txt" % (ident, ident)
    return url, H.fetch(url, timeout=120, retries=1)


def main():
    want = int(sys.argv[1]) if len(sys.argv) > 1 else 220
    docs = []
    items = []
    for page in (1, 2, 3):
        got = search_items(rows=400, page=page)
        print("search page %d -> %d items" % (page, len(got)), flush=True)
        items += got
        if len(items) >= want * 3:
            break
        time.sleep(1)

    seen = set()
    ok = 0
    for it in items:
        if ok >= want:
            break
        ident = it.get("identifier")
        if not ident or ident in seen:
            continue
        seen.add(ident)
        url, txt = get_text(ident)
        if not txt:
            continue
        txt = H.canonical(txt)
        n_odia = len(H.ODIA_RE.findall(txt))
        ratio = H.odia_ratio(txt)
        if n_odia < 5000 or ratio < 0.80:
            print("  skip %s (odia=%d ratio=%.2f)" % (ident, n_odia, ratio), flush=True)
            continue
        docs.append({"url": url, "source": "archive.org-book", "kind": "ocr-book",
                     "identifier": ident, "title": it.get("title", ""),
                     "year": it.get("year", ""), "odia_chars": n_odia,
                     "odia_ratio": round(ratio, 3), "text": txt})
        ok += 1
        print("  [%d/%d] %s  odia=%d ratio=%.2f" % (ok, want, ident, n_odia, ratio), flush=True)
        time.sleep(0.3)

    raw = os.path.join(HERE, "raw-archive-books.jsonl")
    with open(raw, "w", encoding="utf-8") as f:
        for d in docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    counts = Counter()
    for d in docs:
        for w in H.WORD_RE.findall(d["text"]):
            w = H.norm_word(w)
            if not w or all("୦" <= c <= "୯" for c in w):
                continue
            counts[w] += 1
    freq = os.path.join(HERE, "archive-books-freq.tsv")
    with open(freq, "w", encoding="utf-8") as f:
        f.write("word\tcount\n")
        for w, c in counts.most_common():
            f.write("%s\t%d\n" % (w, c))
    print("\nBOOKS=%d TOKENS=%d TYPES=%d" % (len(docs), sum(counts.values()), len(counts)))
    print("wrote %s and %s" % (raw, freq))


if __name__ == "__main__":
    main()
