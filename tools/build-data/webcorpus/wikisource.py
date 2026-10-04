#!/usr/bin/env python3
"""
Odia Wikisource, done politely.

Two corrections over the first attempt:

 1. `prop=revisions&rvprop=content` cannot be combined with a generator, and
    the Page: namespace id is not 104 on this wiki -- it is looked up from
    siteinfo rather than guessed. Titles come from list=allpages, content
    comes from `action=query&export=1`, which returns full wikitext for up
    to 50 titles in one request.
 2. Wikimedia throttles generic browser User-Agents. Their policy asks for a
    descriptive UA; a shared one plus a 1s delay stops the 429s.

Output is appended into raw-lit.jsonl / lit-freq.tsv via run_lit.write_outputs.
"""
import json
import os
import re
import sys
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import harvest_lit as H
import run_lit
import run_lit2

API = "https://or.wikisource.org/w/api.php"

# Wikimedia's UA policy: identify the tool and give a contact.
H.UA = ("OdiaTransliterationCorpusBuild/0.1 (build-time lexicon research; "
        "contact amrit.mohapatra97@gmail.com) python-urllib")

DELAY = 1.0


def api(params, timeout=90):
    time.sleep(DELAY)
    return H.fetch(API + "?" + urllib.parse.urlencode(params), timeout=timeout, retries=2)


def page_namespace():
    body = api({"action": "query", "meta": "siteinfo", "siprop": "namespaces",
                "format": "json", "formatversion": "2"})
    if not body:
        return None, {}
    ns = json.loads(body)["query"]["namespaces"]
    found = None
    table = {}
    for nid, info in ns.items():
        name = info.get("name", "")
        canon = info.get("canonical", "")
        table[nid] = name or canon
        if canon == "Page":
            found = int(nid)
    return found, table


def all_titles(ns, limit):
    titles, cont = [], {}
    while len(titles) < limit:
        p = {"action": "query", "format": "json", "formatversion": "2",
             "list": "allpages", "apnamespace": str(ns), "aplimit": "500"}
        p.update(cont)
        body = api(p, timeout=60)
        if not body:
            break
        j = json.loads(body)
        titles += [x["title"] for x in j.get("query", {}).get("allpages", [])]
        print("  titles: %d" % len(titles), flush=True)
        if "continue" not in j:
            break
        cont = j["continue"]
    return titles[:limit]


TEXT_RE = re.compile(r"<title>(.*?)</title>.*?<text[^>]*>(.*?)</text>", re.S)
UNESC = [("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&amp;", "&")]


def export_batch(titles):
    body = api({"action": "query", "format": "json", "formatversion": "2",
                "titles": "|".join(titles), "export": "1", "exportnowrap": "1"},
               timeout=120)
    if not body:
        return []
    out = []
    for m in TEXT_RE.finditer(body):
        t, raw = m.group(1), m.group(2)
        for a, b in UNESC:
            raw = raw.replace(a, b)
        out.append((t, raw))
    return out


def harvest(ns, source, limit, batch=50):
    titles = all_titles(ns, limit)
    print("  %s: %d titles in ns%d" % (source, len(titles), ns), flush=True)
    total = 0
    for i in range(0, len(titles), batch):
        chunk = titles[i:i + batch]
        for t, raw in export_batch(chunk):
            txt = H.wikitext_to_text(raw)
            url = "https://or.wikisource.org/wiki/" + urllib.parse.quote(t.replace(" ", "_"))
            total += H.add_doc(url, source, txt, "wikisource")
        print("  %s: %d/%d titles, cum %d odia chars"
              % (source, min(i + batch, len(titles)), len(titles), total), flush=True)
    return total


def main():
    run_lit2.load_existing()
    ns, table = page_namespace()
    print("Page: namespace id = %r" % ns)
    print("namespaces: %s" % {k: v for k, v in sorted(table.items(), key=lambda kv: int(kv[0]))
                              if int(k) >= 0})
    if ns is None:
        print("could not resolve Page: namespace; aborting wikisource")
        return
    n1 = harvest(ns, "wikisource-bookpages", limit=int(sys.argv[1]) if len(sys.argv) > 1 else 6000)
    print("-> ns%d: %d odia chars" % (ns, n1))
    n2 = harvest(0, "wikisource-works", limit=1400)
    print("-> ns0: %d odia chars" % n2)
    run_lit.write_outputs()


if __name__ == "__main__":
    main()
