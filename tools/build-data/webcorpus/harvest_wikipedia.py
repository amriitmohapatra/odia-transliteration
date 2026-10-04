#!/usr/bin/env python3
"""
Harvest bulk Odia text from or.wikipedia.org (and or.wikisource.org) via the
MediaWiki API. Build-time research only; the shipped engine never touches the
network.

Writes:
  wikipedia-raw.jsonl     one JSON object per article {title, source, text}
Nothing is normalized here beyond NFC on the extract text.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
import unicodedata
from pathlib import Path

OUT = Path(__file__).resolve().parent
UA = "OdiaTransliterationResearch/0.1 (offline IME lexicon research; amrit.mohapatra97@gmail.com)"

DELAY = 0.35  # polite pause between requests


def api(host, params, retries=4):
    params = dict(params)
    params["format"] = "json"
    params["formatversion"] = "2"
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                       "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    import gzip
                    data = gzip.decompress(data)
                return json.loads(data.decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    print(f"  ! API failed after {retries} tries: {last}", file=sys.stderr)
    return None


def list_all_titles(host, limit):
    """Enumerate namespace-0 page titles."""
    titles = []
    cont = {}
    while len(titles) < limit:
        p = {"action": "query", "list": "allpages", "apnamespace": 0,
             "aplimit": "500", "apfilterredir": "nonredirects"}
        p.update(cont)
        j = api(host, p)
        if not j:
            break
        titles.extend(x["title"] for x in j.get("query", {}).get("allpages", []))
        if "continue" in j:
            cont = j["continue"]
        else:
            break
        time.sleep(DELAY)
        print(f"  titles: {len(titles)}", file=sys.stderr)
    return titles[:limit]


def fetch_extracts(host, titles, fh, batch=20):
    """prop=extracts caps at 20 pages per request."""
    got = 0
    chars = 0
    for i in range(0, len(titles), batch):
        chunk = titles[i:i + batch]
        j = api(host, {"action": "query", "titles": "|".join(chunk),
                       "prop": "extracts", "explaintext": "1",
                       "exlimit": "max"})
        if not j:
            continue
        for page in j.get("query", {}).get("pages", []):
            txt = page.get("extract") or ""
            if not txt.strip():
                continue
            txt = unicodedata.normalize("NFC", txt)
            fh.write(json.dumps({"title": page.get("title"), "source": host,
                                 "text": txt}, ensure_ascii=False) + "\n")
            got += 1
            chars += len(txt)
        if (i // batch) % 10 == 0:
            fh.flush()
            print(f"  [{host}] {got} articles / {chars:,} chars "
                  f"({i + len(chunk)}/{len(titles)} requested)", file=sys.stderr)
        time.sleep(DELAY)
    return got, chars


def main():
    target_wp = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
    target_ws = int(sys.argv[2]) if len(sys.argv) > 2 else 1500
    out = OUT / "wikipedia-raw.jsonl"
    total = {}
    with out.open("w", encoding="utf-8") as fh:
        for host, target in (("or.wikipedia.org", target_wp),
                             ("or.wikisource.org", target_ws)):
            print(f"== {host}: enumerating titles ==", file=sys.stderr)
            titles = list_all_titles(host, target)
            print(f"== {host}: {len(titles)} titles, fetching extracts ==",
                  file=sys.stderr)
            if not titles:
                total[host] = (0, 0)
                continue
            total[host] = fetch_extracts(host, titles, fh)
            print(f"== {host}: DONE {total[host]} ==", file=sys.stderr)
    print(json.dumps(total, indent=2))


if __name__ == "__main__":
    main()
