#!/usr/bin/env python3
"""Discover candidate Odia-language pages by following links from seed pages.

Build-time only. Prints candidate URLs, one per line.
"""
import re
import sys
from urllib.parse import urljoin, urlparse

from fetch_gov import fetch, ODIA

HREF = re.compile(r'<a\b[^>]*?href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', re.S | re.I)
TAGX = re.compile(r"<[^>]+>")


def discover(seed, same_host_only=True, limit=400):
    try:
        status, ctype, html = fetch(seed)
    except Exception as e:
        print(f"# ERR {seed} {type(e).__name__}: {e}", file=sys.stderr)
        return []
    host = urlparse(seed).netloc
    out = []
    for href, label in HREF.findall(html):
        if href.lower().startswith(("javascript:", "mailto:", "tel:")):
            continue
        u = urljoin(seed, href)
        p = urlparse(u)
        if p.scheme not in ("http", "https"):
            continue
        if same_host_only and p.netloc != host:
            continue
        txt = TAGX.sub(" ", label)
        n_od = len(ODIA.findall(txt))
        out.append((u, n_od, txt.strip()[:60]))
    return out[:limit]


if __name__ == "__main__":
    seen = set()
    for seed in sys.argv[1:]:
        for u, n_od, txt in discover(seed):
            if u in seen:
                continue
            seen.add(u)
            print(f"{n_od}\t{u}\t{txt}")
