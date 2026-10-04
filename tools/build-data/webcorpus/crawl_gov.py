#!/usr/bin/env python3
"""BFS crawler for Odia-language government / institutional pages.

Build-time research tool. Follows only same-host links whose path marks the
Odia locale (/or/, /od/, ?lang=or ...), caps pages per host, writes JSONL.

Usage: python3 crawl_gov.py <seeds.txt> <out.jsonl> <log.jsonl> [max_per_host] [max_total]
"""
import json
import re
import sys
import time
import unicodedata
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag

from fetch_gov import fetch, html_to_text, odia_lines, ODIA

HREF = re.compile(r'<a\b[^>]*?href=["\']([^"\']+)["\']', re.I)
SKIP_EXT = re.compile(r"\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|pptx?|mp[34]|avi|css|js|ico|webp)(\?|$)", re.I)
# a URL is "Odia locale" if its path contains one of these markers
ODIA_PATH = re.compile(r"(^|/)(or|od|odia|oriya)(/|$)", re.I)


ANY_PATH = False  # set True to follow every same-host link, not just /or/ ones


def is_candidate(url):
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        return False
    if SKIP_EXT.search(p.path):
        return False
    if len(url) > 300:
        return False
    if ANY_PATH:
        return True
    return ODIA_PATH.search(p.path) is not None


def main():
    global ANY_PATH
    seeds_file, out_jsonl, log_file = sys.argv[1], sys.argv[2], sys.argv[3]
    max_per_host = int(sys.argv[4]) if len(sys.argv) > 4 else 8
    max_total = int(sys.argv[5]) if len(sys.argv) > 5 else 200
    ANY_PATH = len(sys.argv) > 6 and sys.argv[6] == "anypath"

    seeds = [l.strip() for l in Path(seeds_file).read_text(encoding="utf-8").splitlines()
             if l.strip() and not l.startswith("#")]

    q = deque(seeds)
    seen = set(seeds)
    per_host = defaultdict(int)
    fetched = ok = fail = 0

    fout = open(out_jsonl, "a", encoding="utf-8")
    log = open(log_file, "a", encoding="utf-8")

    while q and fetched < max_total:
        url = q.popleft()
        host = urlparse(url).netloc
        if per_host[host] >= max_per_host:
            continue
        per_host[host] += 1
        fetched += 1
        try:
            status, ctype, html = fetch(url, timeout=25)
            if "html" not in ctype.lower() and "xml" not in ctype.lower():
                raise ValueError(f"non-html:{ctype[:40]}")
            text = unicodedata.normalize("NFC", html_to_text(html))
            lines = odia_lines(text)
            nchar = sum(len(ODIA.findall(l)) for l in lines)
            if nchar >= 60:
                fout.write(json.dumps({"url": url, "status": status,
                                       "odia_chars": nchar,
                                       "text": "\n".join(lines)},
                                      ensure_ascii=False) + "\n")
                fout.flush()
                ok += 1
                rec = {"url": url, "ok": True, "odia_chars": nchar}
            else:
                fail += 1
                rec = {"url": url, "ok": False, "reason": f"too-little-odia({nchar})"}
            # enqueue children only from pages that actually had Odia
            if nchar >= 60:
                for href in HREF.findall(html):
                    u = urldefrag(urljoin(url, href))[0]
                    if u in seen or not is_candidate(u):
                        continue
                    if urlparse(u).netloc != host:
                        continue
                    seen.add(u)
                    q.append(u)
        except Exception as e:
            fail += 1
            rec = {"url": url, "ok": False, "reason": f"{type(e).__name__}: {str(e)[:140]}"}
        log.write(json.dumps(rec, ensure_ascii=False) + "\n")
        log.flush()
        print(f"[{fetched}] {'OK ' if rec.get('ok') else 'ERR'} "
              f"{rec.get('odia_chars', rec.get('reason',''))} {url}", flush=True)
        time.sleep(0.4)

    fout.close()
    log.close()
    print(f"\nDONE fetched={fetched} ok={ok} fail={fail} queue_left={len(q)} hosts={len(per_host)}")


if __name__ == "__main__":
    main()
