#!/usr/bin/env python3
"""Driver for the literature-blogs lane."""
import json
import os
import sys
import time
import unicodedata
from collections import Counter

import harvest_lit as H

HERE = os.path.dirname(os.path.abspath(__file__))

# (label, callable) -- each returns odia char count harvested
SOURCES = [
    # --- contemporary literary magazine: short stories, poems, essays ---
    ("shubhapallaba", lambda: H.wp_rest("shubhapallaba.in", "shubhapallaba", max_pages=8)),
    # --- classical + modern Odia literature portal ---
    ("odiasahitya", lambda: H.wp_rest("www.odiasahitya.com", "odiasahitya", max_pages=8)),
    # --- general Odia culture / everyday portals ---
    # odialive.com turned out to be an English-language Odisha news portal:
    # 800 posts yielded <5k Odia chars. Kept at 2 pages purely for the record.
    ("odialive", lambda: H.wp_rest("odialive.com", "odialive", max_pages=2)),
    ("smaranika", lambda: H.wp_rest("smaranika.in", "smaranika", max_pages=6)),
    ("odiarasika", lambda: H.wp_rest("odiarasika.in", "odiarasika", max_pages=6)),
    ("odiaweb", lambda: H.wp_rest("www.odiaweb.in", "odiaweb", max_pages=4)),
    ("odiabooks", lambda: H.wp_rest("odiabooks.com", "odiabooks", max_pages=4)),
    # --- recipes + bhajan lyrics on wordpress.com ---
    ("odishafooddelite", lambda: H.wpcom("odishafooddelite.wordpress.com", "recipes-odishafooddelite", want=550)),
    ("sangitaskitchen", lambda: H.wpcom("sangitaskitchen.wordpress.com", "recipes-sangitaskitchen", want=60)),
    ("odiabhajanlyrics", lambda: H.wpcom("odiabhajanlyrics.wordpress.com", "lyrics-bhajan", want=40)),
    # --- blogspot: stories, poetry, lyrics, personal blogs ---
    ("bs-odiagapas", lambda: H.blogspot("odiagapas.blogspot.com", "blog-odiagapas", want=400)),
    ("bs-odiageetagapa", lambda: H.blogspot("odiageetagapa.blogspot.com", "blog-odiageetagapa", want=400)),
    ("bs-moodishamuodia", lambda: H.blogspot("moodishamuodia.blogspot.com", "blog-moodishamuodia", want=400)),
    ("bs-moodiakathakabita", lambda: H.blogspot("moodiakathakabita.blogspot.com", "blog-moodiakathakabita", want=400)),
    ("bs-odianadia", lambda: H.blogspot("odianadia.blogspot.com", "blog-odianadia", want=400)),
    ("bs-a2zodialyrics", lambda: H.blogspot("a2zodialyrics.blogspot.com", "lyrics-a2z", want=400)),
    ("bs-odia-lyrics", lambda: H.blogspot("odia-lyrics.blogspot.com", "lyrics-odia", want=400)),
    ("bs-odiagapa0", lambda: H.blogspot("odiagapa0.blogspot.com", "blog-odiagapa0", want=200)),
    ("bs-odiakathani", lambda: H.blogspot("odiakathani.blogspot.com", "blog-odiakathani", want=400)),
    ("bs-kantiokatha", lambda: H.blogspot("kantiokatha.blogspot.com", "blog-kantiokatha", want=400)),
    ("bs-odiavasa", lambda: H.blogspot("odiavasa.blogspot.com", "blog-odiavasa", want=400)),
    ("bs-unnata-utkala", lambda: H.blogspot("unnata-utkala.blogspot.com", "blog-unnata-utkala", want=400)),
    ("bs-odiabibhaba", lambda: H.blogspot("odiabibhaba.blogspot.com", "blog-odiabibhaba", want=200)),
    ("bs-sammarpana", lambda: H.blogspot("sammarpana.blogspot.com", "blog-sammarpana", want=300)),
    ("bs-turmerickitchen", lambda: H.blogspot("turmerickitchen.blogspot.com", "recipes-turmerickitchen", want=300)),
    ("foodexpressodisha", lambda: H.wpcom("foodexpressodisha.wordpress.com", "recipes-foodexpress", want=110)),
    ("fullodisha", lambda: H.wp_rest("fullodisha.com", "blog-fullodisha", max_pages=5)),
    ("kichhikatha", lambda: H.wpcom("kichhikatha.wordpress.com", "blog-kichhikatha", want=60)),
    ("sahadevodia", lambda: H.wpcom("sahadevodia.wordpress.com", "blog-sahadevodia", want=40)),
    ("helloodia", lambda: H.wp_rest("helloodia.in", "blog-helloodia", max_pages=4)),
    # --- Odia Wikisource ---
    # ns104 (ପୃଷ୍ଠା:) first: it holds the proofread text of every scanned book
    # as raw wikitext, 50 pages per request. ns0 "works" mostly transclude
    # those same pages, and asking the parse API to expand a whole book takes
    # tens of seconds per title, so ns0 is sampled, not exhausted.
    ("ws-pages", lambda: H.wikisource_pages_ns("https://or.wikisource.org/w/api.php", "wikisource-books", limit=12000)),
    ("ws-works", lambda: H.wikisource_ns0("https://or.wikisource.org/w/api.php", "wikisource-works", limit=250)),
]


def main():
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    for label, fn in SOURCES:
        if only and label not in only:
            continue
        print("== %s ==" % label, flush=True)
        t0 = time.time()
        try:
            n = fn()
        except Exception as e:
            print("  !! %s failed: %r" % (label, e), flush=True)
            H.FETCH_LOG.append((label, "ADAPTER_FAIL:%r" % e, 0))
            continue
        print("  -> %s: %d odia chars in %.0fs" % (label, n, time.time() - t0), flush=True)
        write_outputs(quiet=True)   # checkpoint: a stall must not lose the haul

    write_outputs()


def write_outputs(quiet=False):
    raw = os.path.join(HERE, "raw-lit.jsonl")
    with open(raw, "w", encoding="utf-8") as f:
        for d in H.DOCS:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    counts = Counter()
    for d in H.DOCS:
        for w in H.WORD_RE.findall(d["text"]):
            w = H.norm_word(w)
            if not w:
                continue
            # drop pure-digit tokens (Odia numerals)
            if all("୦" <= c <= "୯" for c in w):
                continue
            counts[w] += 1

    freq = os.path.join(HERE, "lit-freq.tsv")
    with open(freq, "w", encoding="utf-8") as f:
        f.write("word\tcount\n")
        for w, c in counts.most_common():
            f.write("%s\t%d\n" % (w, c))

    log = os.path.join(HERE, "fetch-log.tsv")
    with open(log, "w", encoding="utf-8") as f:
        f.write("url\tstatus\todia_chars\n")
        for u, s, n in H.FETCH_LOG:
            f.write("%s\t%s\t%d\n" % (u, s, n))

    tokens = sum(counts.values())
    if quiet:
        print("     [checkpoint] docs=%d tokens=%d types=%d" % (len(H.DOCS), tokens, len(counts)),
              flush=True)
        return
    print("\nDOCS=%d  TOKENS=%d  TYPES=%d" % (len(H.DOCS), tokens, len(counts)))
    print("wrote %s, %s, %s" % (raw, freq, log))


if __name__ == "__main__":
    main()
