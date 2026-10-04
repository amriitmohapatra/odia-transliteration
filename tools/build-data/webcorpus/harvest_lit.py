#!/usr/bin/env python3
"""
Lane: literature-blogs.
Harvest everyday + literary Odia from blogs, poetry/story sites, lyrics,
recipes, magazines and Odia Wikisource.

Build-time only. Nothing here ships. stdlib + urllib only.

Output (all under this directory):
  raw-lit.jsonl        one record per fetched document
  lit-freq.tsv         word <TAB> count
  fetch-log.tsv        url <TAB> status <TAB> odia_chars
"""

import gzip
import io
import json
import os
import re
import ssl
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# Odia block U+0B00-U+0B7F
ODIA_RE = re.compile(r'[଀-୿]')

# A "word" = run of Odia letters/matras/signs, incl. ZWJ/ZWNJ which Odia uses
# for conjunct control. Danda U+0964/U+0965 and punctuation are separators.
#
# One exception, learned the hard way from the corpus: Odia writes an
# apostrophe INSIDE certain very common words -- କ’ଣ "what", ତା’ "his/her",
# ସେ’, ମୋ’. Splitting on it shredded those into bare letters and put କ, ଣ, ତ
# in the top-40 as if they were words. So an apostrophe counts as
# word-internal when Odia letters sit on both sides of it.
_OC = '[଀-୿‌‍]'
APOS = '\u2019\u2018\u0027\u02bc'      # ’ ‘ ' ʼ
WORD_RE = re.compile('%s+(?:[%s]%s+)*' % (_OC, APOS, _OC))
_APOS_TRAIL = re.compile('[%s]+$' % APOS)


def norm_word(w):
    """Trim ZWJ/ZWNJ, unify the apostrophe on U+2019, drop a trailing one."""
    w = w.strip('‌‍')
    for a in '\u2018\u0027\u02bc':
        w = w.replace(a, '’')
    return _APOS_TRAIL.sub('', w)

FETCH_LOG = []


def fetch(url, timeout=45, retries=2):
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "*/*",
                "Accept-Language": "or,en;q=0.8",
                "Accept-Encoding": "gzip",
            })
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                data = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    data = gzip.GzipFile(fileobj=io.BytesIO(data)).read()
                return data.decode("utf-8", errors="replace")
        except Exception as e:
            if attempt == retries:
                FETCH_LOG.append((url, "FAIL:%s" % type(e).__name__ + ":" + str(e)[:80], 0))
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


# ---------- HTML -> text ----------

BLOCK_STRIP = re.compile(
    r'<(script|style|noscript|svg|head|nav|footer|form)\b.*?</\1>',
    re.S | re.I)
TAG = re.compile(r'<[^>]+>')
BR = re.compile(r'<(br|/p|/div|/li|/h[1-6]|/tr)\b[^>]*>', re.I)


def html_to_text(html):
    if not html:
        return ""
    t = BLOCK_STRIP.sub(" ", html)
    t = BR.sub("\n", t)
    t = TAG.sub(" ", t)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&")
    t = t.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    t = t.replace("&#39;", "'").replace("&rsquo;", "'").replace("&ldquo;", '"')
    t = t.replace("&rdquo;", '"').replace("&hellip;", "...").replace("&#8217;", "'")
    t = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))) if int(m.group(1)) < 0x110000 else " ", t)
    t = re.sub(r'&[a-zA-Z]+;', " ", t)
    t = re.sub(r'[ \t ]+', ' ', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()


def canonical(s):
    """NFC. The precomposed nukta forms U+0B5C/U+0B5D DECOMPOSE under NFC,
    so after this every nukta consonant is base + U+0B3C."""
    return unicodedata.normalize("NFC", s)


def odia_ratio(text):
    if not text:
        return 0.0
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for c in letters if '଀' <= c <= '୿') / len(letters)


DOCS = []
SEEN_HASH = set()


def add_doc(url, source, text, kind="page"):
    if not text:
        return 0
    text = canonical(text)
    n_odia = len(ODIA_RE.findall(text))
    if n_odia < 40:
        FETCH_LOG.append((url, "THIN", n_odia))
        return 0
    h = hash(text[:4000])
    if h in SEEN_HASH:
        FETCH_LOG.append((url, "DUP", n_odia))
        return 0
    SEEN_HASH.add(h)
    DOCS.append({"url": url, "source": source, "kind": kind,
                 "odia_chars": n_odia, "text": text})
    FETCH_LOG.append((url, "OK", n_odia))
    return n_odia


# ---------- adapters ----------

def wp_rest(host, source, max_pages=6, per_page=100, base="/wp-json/wp/v2/posts"):
    """WordPress REST API. Full post bodies -> best register for us."""
    total = 0
    for page in range(1, max_pages + 1):
        url = "https://%s%s?per_page=%d&page=%d&_fields=link,title,content,excerpt" % (
            host, base, per_page, page)
        body = fetch(url)
        if not body:
            break
        try:
            posts = json.loads(body)
        except Exception:
            FETCH_LOG.append((url, "BADJSON", 0))
            break
        if not isinstance(posts, list) or not posts:
            break
        for p in posts:
            try:
                txt = "\n".join([
                    html_to_text(p.get("title", {}).get("rendered", "")),
                    html_to_text(p.get("content", {}).get("rendered", "")),
                ])
                total += add_doc(p.get("link", host), source, txt, "wp-post")
            except Exception:
                continue
        print("  %s wp page %d: %d posts, cum %d odia chars" % (host, page, len(posts), total),
              flush=True)
        if len(posts) < per_page:
            break
        time.sleep(0.6)
    return total


def blogspot(blog, source, want=400):
    """Blogger JSON feed carries the full post body."""
    total = 0
    start = 1
    step = 100
    while start <= want:
        url = ("https://%s/feeds/posts/default?alt=json&max-results=%d&start-index=%d"
               % (blog, step, start))
        body = fetch(url)
        if not body:
            break
        try:
            feed = json.loads(body).get("feed", {})
        except Exception:
            FETCH_LOG.append((url, "BADJSON", 0))
            break
        entries = feed.get("entry", [])
        if not entries:
            break
        for e in entries:
            title = e.get("title", {}).get("$t", "")
            content = e.get("content", {}).get("$t", "") or e.get("summary", {}).get("$t", "")
            link = ""
            for l in e.get("link", []):
                if l.get("rel") == "alternate":
                    link = l.get("href", "")
            txt = title + "\n" + html_to_text(content)
            total += add_doc(link or url, source, txt, "blogspot-post")
        print("  %s feed @%d: %d entries, cum %d" % (blog, start, len(entries), total), flush=True)
        if len(entries) < step:
            break
        start += step
        time.sleep(0.6)
    return total


def wpcom(site, source, want=400):
    """wordpress.com-hosted blogs use the public REST API, not /wp-json."""
    total = 0
    page_handle = None
    got = 0
    while got < want:
        url = ("https://public-api.wordpress.com/rest/v1.1/sites/%s/posts/"
               "?number=100&fields=URL,title,content" % site)
        if page_handle:
            url += "&page_handle=" + urllib.parse.quote(page_handle)
        body = fetch(url)
        if not body:
            break
        try:
            j = json.loads(body)
        except Exception:
            FETCH_LOG.append((url, "BADJSON", 0))
            break
        posts = j.get("posts", [])
        if not posts:
            break
        for p in posts:
            txt = html_to_text(p.get("title", "")) + "\n" + html_to_text(p.get("content", ""))
            total += add_doc(p.get("URL", site), source, txt, "wpcom-post")
            got += 1
        print("  %s wpcom: %d posts, cum %d" % (site, got, total), flush=True)
        page_handle = j.get("meta", {}).get("next_page")
        if not page_handle:
            break
        time.sleep(0.6)
    return total


def mediawiki(api, source, pages=120, ns=0, gap_from=None):
    """Odia Wikisource / Wikipedia plain-text extracts."""
    total = 0
    cont = {}
    got = 0
    while got < pages:
        params = {
            "action": "query", "format": "json", "formatversion": "2",
            "generator": "allpages", "gapnamespace": str(ns),
            "gaplimit": "25", "prop": "extracts", "explaintext": "1",
            "exlimit": "20",
        }
        if gap_from:
            params["gapfrom"] = gap_from
            gap_from = None
        params.update(cont)
        url = api + "?" + urllib.parse.urlencode(params)
        body = fetch(url)
        if not body:
            break
        try:
            j = json.loads(body)
        except Exception:
            FETCH_LOG.append((url, "BADJSON", 0))
            break
        for p in j.get("query", {}).get("pages", []):
            ex = p.get("extract", "")
            if ex:
                purl = api.replace("/w/api.php", "/wiki/") + urllib.parse.quote(
                    p.get("title", "").replace(" ", "_"))
                total += add_doc(purl, source, p.get("title", "") + "\n" + ex, "wiki")
            got += 1
        print("  %s: %d pages seen, cum %d" % (source, got, total), flush=True)
        if "continue" not in j:
            break
        cont = j["continue"]
        time.sleep(0.4)
    return total


WIKI_STRIP = [
    (re.compile(r'<noinclude>.*?</noinclude>', re.S), ' '),
    (re.compile(r'<ref[^>]*>.*?</ref>', re.S), ' '),
    (re.compile(r'<[^>]+>'), ' '),
    (re.compile(r'\{\{[^{}]*\}\}'), ' '),
    (re.compile(r'\{\|.*?\|\}', re.S), ' '),
    (re.compile(r'\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]'), r'\1'),
    (re.compile(r'\[https?://\S+\s+([^\]]*)\]'), r'\1'),
    (re.compile(r"'{2,5}"), ''),
    (re.compile(r'^[=*#:;]+', re.M), ' '),
]


def wikitext_to_text(w):
    if not w:
        return ""
    for _ in range(3):          # nested templates
        w = re.sub(r'\{\{[^{}]*\}\}', ' ', w)
    for pat, rep in WIKI_STRIP:
        w = pat.sub(rep, w)
    w = re.sub(r'[ \t]+', ' ', w)
    return w.strip()


def wikisource_ns0(api, source, limit=1400):
    """Main-namespace works: poems, songs, stories. Needs action=parse
    because these pages transclude <pages index=...> from the Page: ns,
    which prop=extracts does not expand."""
    titles, cont, total = [], {}, 0
    while len(titles) < limit:
        params = {"action": "query", "format": "json", "formatversion": "2",
                  "list": "allpages", "apnamespace": "0", "aplimit": "500"}
        params.update(cont)
        body = fetch(api + "?" + urllib.parse.urlencode(params))
        if not body:
            break
        j = json.loads(body)
        titles += [p["title"] for p in j.get("query", {}).get("allpages", [])]
        if "continue" not in j:
            break
        cont = j["continue"]
    titles = titles[:limit]
    print("  %s: %d ns0 titles" % (source, len(titles)), flush=True)
    for i, t in enumerate(titles):
        url = api + "?" + urllib.parse.urlencode({
            "action": "parse", "format": "json", "formatversion": "2",
            "prop": "text", "page": t})
        # short timeout, no retry: a ns0 title that transcludes a whole book
        # can keep the parse API busy for a minute. Skip those, ns104 already
        # carries their text.
        body = fetch(url, timeout=20, retries=0)
        if not body:
            continue
        try:
            html = json.loads(body).get("parse", {}).get("text", "")
        except Exception:
            continue
        purl = api.replace("/w/api.php", "/wiki/") + urllib.parse.quote(t.replace(" ", "_"))
        total += add_doc(purl, source, t + "\n" + html_to_text(html), "wikisource-work")
        if (i + 1) % 100 == 0:
            print("    ns0 %d/%d cum %d" % (i + 1, len(titles), total), flush=True)
        time.sleep(0.12)
    return total


def wikisource_pages_ns(api, source, limit=4000, ns=104):
    """Page: (ପୃଷ୍ଠା:) namespace holds the proofread text of scanned books --
    the bulk of the corpus. Raw wikitext, cleaned."""
    total, cont, got = 0, {}, 0
    while got < limit:
        params = {"action": "query", "format": "json", "formatversion": "2",
                  "generator": "allpages", "gapnamespace": str(ns),
                  "gaplimit": "50", "prop": "revisions",
                  "rvprop": "content", "rvslots": "main"}
        params.update(cont)
        body = fetch(api + "?" + urllib.parse.urlencode(params), timeout=60)
        if not body:
            break
        try:
            j = json.loads(body)
        except Exception:
            break
        for p in j.get("query", {}).get("pages", []):
            got += 1
            try:
                raw = p["revisions"][0]["slots"]["main"]["content"]
            except Exception:
                continue
            txt = wikitext_to_text(raw)
            purl = api.replace("/w/api.php", "/wiki/") + urllib.parse.quote(
                p["title"].replace(" ", "_"))
            total += add_doc(purl, source, txt, "wikisource-bookpage")
        print("  %s: %d ns%d pages, cum %d" % (source, got, ns, total), flush=True)
        if "continue" not in j:
            break
        cont = j["continue"]
        time.sleep(0.3)
    return total


def plain_pages(urls, source):
    total = 0
    for u in urls:
        body = fetch(u)
        if not body:
            continue
        txt = html_to_text(body)
        if odia_ratio(txt) < 0.25:
            FETCH_LOG.append((u, "LOW_ODIA_RATIO", len(ODIA_RE.findall(txt))))
            continue
        total += add_doc(u, source, txt, "page")
        time.sleep(0.5)
    return total


def discover_links(index_url, host, pattern=None, limit=60):
    """Pull article links off an index page."""
    body = fetch(index_url)
    if not body:
        return []
    hrefs = re.findall(r'href=["\']([^"\']+)["\']', body)
    out, seen = [], set()
    for h in hrefs:
        if h.startswith("/"):
            h = "https://" + host + h
        if not h.startswith("http"):
            continue
        if host not in h:
            continue
        if pattern and not re.search(pattern, h):
            continue
        h = h.split("#")[0]
        if h in seen:
            continue
        seen.add(h)
        out.append(h)
        if len(out) >= limit:
            break
    return out
