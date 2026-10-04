#!/usr/bin/env python3
"""Harvest Odia-script text from Odia news media (build-time research only).

Uses curl via subprocess (the sandbox blocks urllib).

Writes into this directory:
  news-raw.jsonl    one record per successfully fetched article URL
  news-freq.tsv     word <TAB> count   (boilerplate-stripped)
  news-freq-raw.tsv word <TAB> count   (no boilerplate stripping)
  news-nukta.json   nukta statistics, counted by code point on NFC text
  news-stats.json   fetch accounting: what worked, what did not
"""
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")

# Odia Unicode block U+0B00-U+0B7F, plus ZWNJ/ZWJ which occur inside words.
ODIA_RUN = re.compile(r"[଀-୿‌‍]+")
# word = Odia letters/matras/signs/nukta/virama (+ZWJ/ZWNJ); digits excluded.
WORD_CHARS = re.compile(r"[଀-୥୰-୿‌‍]+")
HAS_LETTER = re.compile(r"[ଅ-ହୟୱ]")

NUKTA = "଼"
DDA = "ଡ"           # ଡ
DDHA = "ଢ"          # ଢ
PRECOMP_RRA = "ଡ଼"   # ଡ଼ precomposed (must never survive NFC)
PRECOMP_RHA = "ଢ଼"   # ଢ଼ precomposed
YYA = "ୟ"           # ୟ atomic, unrelated to nukta


def fetch(url, timeout=30):
    try:
        p = subprocess.run(
            ["curl", "-sL", "-m", str(timeout), "-A", UA, "--compressed",
             "-H", "Accept-Language: or,en;q=0.5",
             "-w", "\n@@HTTP@@%{http_code}", url],
            capture_output=True, timeout=timeout + 12,
        )
        out = p.stdout.decode("utf-8", errors="replace")
        if "@@HTTP@@" not in out:
            return None, "no-response"
        body, code = out.rsplit("\n@@HTTP@@", 1)
        code = code.strip()
        if code != "200":
            return None, f"http-{code}"
        return body, "ok"
    except subprocess.TimeoutExpired:
        return None, "timeout"
    except Exception as e:  # noqa: BLE001
        return None, type(e).__name__


TAG_STRIP = re.compile(r"<(script|style|noscript|svg)\b[^>]*>.*?</\1>",
                       re.S | re.I)
TAGS = re.compile(r"<[^>]+>")


def html_to_odia_runs(html):
    """Return one 'segment' per HTML text node: its Odia words, space-joined.

    Segment granularity matters. Whitespace and the danda are outside the
    Odia block, so a bare [U+0B00-U+0B7F]+ match is a single word, not a
    phrase — doing boilerplate detection at that granularity would delete
    ordinary high-frequency function words. Text nodes keep phrases intact.
    """
    h = TAG_STRIP.sub(" ", html)
    h = TAGS.sub("\x00", h)
    h = (h.replace("&nbsp;", " ").replace("&amp;", "&")
          .replace("&quot;", '"').replace("&#039;", "'")
          .replace("&lt;", "<").replace("&gt;", ">"))
    h = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), h)
    h = re.sub(r"&#x([0-9a-fA-F]+);", lambda m: chr(int(m.group(1), 16)), h)
    segs = []
    for node in h.split("\x00"):
        if "଀" > max(node, default="\0") and not ODIA_RUN.search(node):
            continue
        words = [unicodedata.normalize("NFC", w)
                 for w in ODIA_RUN.findall(node)]
        words = [w for w in words if HAS_LETTER.search(w)]
        if words:
            segs.append(" ".join(words))
    return segs


BAD_PATH = re.compile(
    r"/(tag|tags|author|page/|wp-|feed|search|privacy|contact|about|"
    r"advertis|epaper|login|comment|subscribe|disclaimer|sitemap)", re.I)
ARTICLE_HINT = re.compile(r"[a-z0-9଀-୿%]-|%E0%AC|\d{5,}")


def discover(html, base, host):
    urls = set()
    for m in re.finditer(r'href=["\']([^"\'>\s]+)', html):
        u = urljoin(base, m.group(1))
        pr = urlparse(u)
        if pr.scheme not in ("http", "https") or host not in pr.netloc:
            continue
        path = pr.path
        if BAD_PATH.search(path) or len(path) < 12:
            continue
        if not ARTICLE_HINT.search(path):
            continue
        if re.search(r"\.(jpg|jpeg|png|gif|webp|pdf|mp4|mp3|xml)$", path, re.I):
            continue
        urls.add(pr.scheme + "://" + pr.netloc + path)
    return urls


SEEDS = [
    ("dharitri.com", [
        "https://www.dharitri.com/",
        "https://www.dharitri.com/category/state-news/",
        "https://www.dharitri.com/category/district-news/",
        "https://www.dharitri.com/category/national-news/",
        "https://www.dharitri.com/category/sports-news/",
        "https://www.dharitri.com/category/entertainment/",
        "https://www.dharitri.com/category/editorial/",
        "https://www.dharitri.com/category/business/",
    ]),
    ("sambad.in", [
        "https://sambad.in/", "https://sambad.in/state",
        "https://sambad.in/district", "https://sambad.in/sports",
        "https://sambad.in/entertainment", "https://sambad.in/business",
        "https://sambad.in/crime", "https://sambad.in/metro",
        "https://sambad.in/india-and-beyond", "https://sambad.in/politics",
        "https://sambad.in/punascha-pruthibi", "https://sambad.in/special",
    ]),
    ("khabar.odishatv.in", [
        "https://khabar.odishatv.in/", "https://khabar.odishatv.in/odisha",
        "https://khabar.odishatv.in/india", "https://khabar.odishatv.in/sports",
        "https://khabar.odishatv.in/entertainment",
        "https://khabar.odishatv.in/crime",
    ]),
    ("kanaknews.com", [
        "https://kanaknews.com/", "https://kanaknews.com/news/odisha",
        "https://kanaknews.com/news/national",
        "https://kanaknews.com/news/sports",
    ]),
    ("news18.com", [
        "https://odia.news18.com/", "https://odia.news18.com/news/",
        "https://odia.news18.com/news/odisha/",
        "https://odia.news18.com/news/national/",
        "https://odia.news18.com/news/sports/",
        "https://odia.news18.com/news/entertainment/",
    ]),
    ("etvbharat.com", [
        "https://www.etvbharat.com/or/odisha",
        "https://www.etvbharat.com/or/bharat",
        "https://www.etvbharat.com/or/sports",
    ]),
    ("nandighoshatv.com", [
        "https://nandighoshatv.com/", "https://nandighoshatv.com/category/odisha/",
        "https://nandighoshatv.com/category/national/",
    ]),
    ("odishanewslens.com", [
        "https://www.odishanewslens.com/",
        "https://www.odishanewslens.com/category/odisha",
    ]),
    ("prameya.com", [
        "https://www.prameya.com/", "https://www.prameya.com/odisha",
        "https://www.prameya.com/national", "https://www.prameya.com/sports",
    ]),
    ("odishalive.tv", ["https://odishalive.tv/"]),
    ("odishabhaskar.com", [
        "https://odishabhaskar.com/",
        "https://odishabhaskar.com/category/odisha/",
    ]),
    ("odishareporter.in", [
        "https://odishareporter.in/",
        "https://odishareporter.in/category/odisha/",
        "https://odishareporter.in/category/national/",
    ]),
    ("odishakhabar.in", [
        "https://odishakhabar.in/", "https://odishakhabar.in/category/odisha/",
    ]),
    ("odishasambad.in", [
        "https://odishasambad.in/", "https://odishasambad.in/category/odisha/",
    ]),
    ("naxatranews.com", ["https://naxatranews.com/"]),
    ("argusnews.in", ["https://argusnews.in/"]),
    ("newsroomodisha.com", ["https://newsroomodisha.com/"]),
    ("odisha.news", ["https://odisha.news/"]),
    # attempted and expected to fail / be JS-rendered — kept for honest
    # accounting of what was tried
    ("prameyanews.com", ["https://www.prameyanews.com/"]),
    ("thesamaja.in", ["https://thesamaja.in/"]),
    ("odishatv.in", ["https://odishatv.in/"]),
    ("pragativadi.com", ["https://pragativadi.com/odia/"]),
    ("nitidina.com", ["https://nitidina.com/"]),
    ("sanmarga.in", ["https://sanmarga.in/"]),
    ("kalingatv.com", ["https://odia.kalingatv.com/"]),
    ("anupambharat.in", ["https://anupambharat.in/"]),
    ("zeenews.india.com", ["https://zeenews.india.com/odia"]),
    ("odishabytes.com", ["https://odishabytes.com/"]),
    ("focusodisha.com", ["https://www.focusodisha.com/"]),
    ("samayaodisha.com", ["https://www.samayaodisha.com/"]),
    ("utkalprasanga.in", ["https://www.utkalprasanga.in/"]),
]

MAX_PER_HOST = 110
MIN_ODIA_CHARS = 150
BOILERPLATE_DOC_FRACTION = 0.30   # a run on >25% of pages is site chrome


def main():
    candidates = {}
    seed_status = []

    def seed_job(args):
        host, url = args
        html, st = fetch(url)
        return host, url, html, st

    jobs = [(h, u) for h, seeds in SEEDS for u in seeds]
    with ThreadPoolExecutor(max_workers=10) as ex:
        for host, url, html, st in ex.map(seed_job, jobs):
            seed_status.append({"url": url, "host": host, "status": st,
                                "bytes": len(html or "")})
            if html:
                candidates.setdefault(url, host)
                for u in discover(html, url, host):
                    candidates.setdefault(u, host)

    print("== SEEDS ==", file=sys.stderr)
    for s in seed_status:
        print(f"  {s['status']:12s} {s['bytes']:8d}  {s['url']}",
              file=sys.stderr)

    per_host = Counter()
    picked = []
    for u, h in candidates.items():
        if per_host[h] >= MAX_PER_HOST:
            continue
        per_host[h] += 1
        picked.append((u, h))
    print(f"\ncandidates={len(candidates)} picked={len(picked)}",
          file=sys.stderr)

    records = []
    fails = Counter()
    fail_by_host = defaultdict(Counter)

    def art_job(args):
        u, h = args
        html, st = fetch(u)
        return u, h, html, st

    with ThreadPoolExecutor(max_workers=12) as ex:
        for u, h, html, st in ex.map(art_job, picked):
            if not html:
                fails[st] += 1
                fail_by_host[h][st] += 1
                continue
            runs = html_to_odia_runs(html)
            nchars = sum(len(r) for r in runs)
            if nchars < MIN_ODIA_CHARS:
                fails["too-little-odia"] += 1
                fail_by_host[h]["too-little-odia"] += 1
                continue
            records.append({"url": u, "host": h, "odia_chars": nchars,
                            "runs": runs})

    # ---- boilerplate detection: runs repeated across many pages are chrome
    # Site chrome repeats WITHIN a host, and each host is only a fraction of
    # the corpus, so document frequency must be computed per host.
    # A multi-word segment on >30% of a host's pages is nav/tagline/footer.
    # A single-word segment must be near-universal (>60%) on that host before
    # we discard it, so ordinary frequent words are not thrown away.
    host_docs = Counter(r["host"] for r in records)
    host_run_df = defaultdict(Counter)
    for r in records:
        for run in set(r["runs"]):
            host_run_df[r["host"]][run] += 1
    boiler = defaultdict(set)   # host -> set of boilerplate segments
    for host, runs in host_run_df.items():
        n = max(host_docs[host], 1)
        for run, c in runs.items():
            if c / n > (BOILERPLATE_DOC_FRACTION if " " in run else 0.60):
                boiler[host].add(run)
    n_boiler = sum(len(v) for v in boiler.values())

    # ---- write raw (full text, nothing removed)
    with open(os.path.join(HERE, "news-raw.jsonl"), "w",
              encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps({"url": r["url"], "host": r["host"],
                                "odia_chars": r["odia_chars"],
                                "text": " ".join(r["runs"])},
                               ensure_ascii=False) + "\n")

    def tokenize(runs):
        for run in runs:
            for w in WORD_CHARS.findall(run):
                w = w.strip("‌‍୤୥")
                if w and HAS_LETTER.search(w):
                    yield w

    freq_raw = Counter()
    freq = Counter()
    tok_raw = tok_clean = 0
    for r in records:
        for w in tokenize(r["runs"]):
            freq_raw[w] += 1
            tok_raw += 1
        bl = boiler.get(r["host"], ())
        for w in tokenize([x for x in r["runs"] if x not in bl]):
            freq[w] += 1
            tok_clean += 1

    for name, c in (("news-freq.tsv", freq), ("news-freq-raw.tsv", freq_raw)):
        with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
            for w, n in c.most_common():
                f.write(f"{w}\t{n}\n")

    # ---- nukta analysis, by code point, on NFC text
    all_text = "\n".join(" ".join(r["runs"]) for r in records)
    assert all_text == unicodedata.normalize("NFC", all_text), "not NFC"
    n_dda_nukta = all_text.count(DDA + NUKTA)
    n_ddha_nukta = all_text.count(DDHA + NUKTA)
    n_dda_plain = all_text.count(DDA) - n_dda_nukta
    n_ddha_plain = all_text.count(DDHA) - n_ddha_nukta

    def strip_nukta(w):
        return w.replace(DDA + NUKTA, DDA).replace(DDHA + NUKTA, DDHA)

    pairs = []
    with_n = without_n = 0
    for w, c in freq_raw.items():
        if DDA + NUKTA in w or DDHA + NUKTA in w:
            bare = strip_nukta(w)
            cb = freq_raw.get(bare, 0)
            with_n += c
            without_n += cb
            if cb:
                pairs.append({"nukta": w, "bare": bare,
                              "n_nukta": c, "n_bare": cb,
                              "drop_rate": round(cb / (c + cb), 3)})
    pairs.sort(key=lambda d: -(d["n_nukta"] + d["n_bare"]))

    nukta = {
        "method": "counts are on NFC-normalised text, by code point",
        "corpus_chars_odia": len(all_text),
        "articles": len(records),
        "decomposed_DDA_U0B21_U0B3C": n_dda_nukta,
        "decomposed_DDHA_U0B22_U0B3C": n_ddha_nukta,
        "precomposed_U0B5C_after_NFC": all_text.count(PRECOMP_RRA),
        "precomposed_U0B5D_after_NFC": all_text.count(PRECOMP_RHA),
        "bare_U0B21_without_nukta": n_dda_plain,
        "bare_U0B22_without_nukta": n_ddha_plain,
        "total_U0B3C": all_text.count(NUKTA),
        "atomic_YYA_U0B5F": all_text.count(YYA),
        "nukta_attach_rate_DDA": round(
            n_dda_nukta / max(n_dda_nukta + n_dda_plain, 1), 4),
        "nukta_attach_rate_DDHA": round(
            n_ddha_nukta / max(n_ddha_nukta + n_ddha_plain, 1), 4),
        "word_types_with_nukta": sum(
            1 for w in freq_raw if DDA + NUKTA in w or DDHA + NUKTA in w),
        "word_types_with_both_spellings": len(pairs),
        "tokens_nukta_spelling": with_n,
        "tokens_bare_twin_spelling": without_n,
        "nukta_drop_rate_over_nukta_bearing_types": round(
            without_n / max(with_n + without_n, 1), 4),
        "top_pairs": pairs[:60],
    }
    with open(os.path.join(HERE, "news-nukta.json"), "w",
              encoding="utf-8") as f:
        json.dump(nukta, f, ensure_ascii=False, indent=2)

    stats = {
        "seed_pages_attempted": len(jobs),
        "seed_pages_ok": sum(1 for s in seed_status if s["status"] == "ok"),
        "article_urls_attempted": len(picked),
        "article_urls_ok": len(records),
        "distinct_hosts_ok": len({r["host"] for r in records}),
        "hosts_ok": dict(Counter(r["host"] for r in records).most_common()),
        "failures": dict(fails),
        "fail_by_host": {h: dict(c) for h, c in fail_by_host.items()},
        "seed_status": seed_status,
        "total_tokens_raw": tok_raw,
        "total_tokens_boilerplate_stripped": tok_clean,
        "distinct_words_raw": len(freq_raw),
        "distinct_words_stripped": len(freq),
        "boilerplate_segments_removed": n_boiler,
        "corpus_chars_odia": len(all_text),
    }
    with open(os.path.join(HERE, "news-stats.json"), "w",
              encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    short = {k: v for k, v in stats.items() if k != "seed_status"}
    print("\n== STATS ==\n" + json.dumps(short, ensure_ascii=False, indent=2),
          file=sys.stderr)


if __name__ == "__main__":
    main()
