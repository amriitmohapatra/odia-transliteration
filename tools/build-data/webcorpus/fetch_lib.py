#!/usr/bin/env python3
"""Shared fetch + Odia-extraction helpers for the social/politicians lane.

Build-time only. The shipped engine never touches the network.
"""
import gzip
import io
import json
import re
import ssl
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import zlib

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

ODIA_RE = re.compile(r'[଀-୿]')
# A "word" = run of Odia letters/matras/signs, incl. nukta and virama and ZWJ/ZWNJ
WORD_RE = re.compile(r'[଀-୿‌‍]+')

TAG_RE = re.compile(r'<(script|style|noscript|svg)[^>]*>.*?</\1>', re.S | re.I)
ANY_TAG = re.compile(r'<[^>]+>')


def fetch(url, timeout=25, headers=None):
    """Return (status, text, note). status is int or None on failure."""
    hdrs = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "or,en-US;q=0.8,en;q=0.6",
        "Accept-Encoding": "gzip, deflate",
    }
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            raw = r.read()
            enc = r.headers.get("Content-Encoding", "")
            if "gzip" in enc:
                raw = gzip.decompress(raw)
            elif "deflate" in enc:
                raw = zlib.decompress(raw, -zlib.MAX_WBITS)
            charset = r.headers.get_content_charset() or "utf-8"
            try:
                txt = raw.decode(charset, errors="replace")
            except LookupError:
                txt = raw.decode("utf-8", errors="replace")
            return r.status, txt, "ok"
    except urllib.error.HTTPError as e:
        return e.code, "", "HTTPError %s %s" % (e.code, e.reason)
    except urllib.error.URLError as e:
        return None, "", "URLError %s" % (e.reason,)
    except Exception as e:  # noqa: BLE001
        return None, "", "%s: %s" % (type(e).__name__, e)


def strip_html(html):
    h = TAG_RE.sub(" ", html)
    h = ANY_TAG.sub(" ", h)
    h = h.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"')
    h = h.replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">")
    # numeric entities
    h = re.sub(r"&#x([0-9a-fA-F]+);", lambda m: chr(int(m.group(1), 16)), h)
    h = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), h)
    return re.sub(r"[ \t\r\f\v]+", " ", h)


def odia_lines(text):
    """Yield NFC-normalised lines that contain Odia script."""
    out = []
    for line in re.split(r"[\n ]+|(?<=[।?!])\s", text):
        line = line.strip()
        if not line or not ODIA_RE.search(line):
            continue
        line = unicodedata.normalize("NFC", line)
        out.append(line)
    return out


def odia_ratio(text):
    o = len(ODIA_RE.findall(text))
    return o / max(1, len(text))


def words(text):
    """Odia word tokens from NFC text, stripping stray ZWJ/ZWNJ at edges."""
    res = []
    for w in WORD_RE.findall(unicodedata.normalize("NFC", text)):
        w = w.strip("‌‍")
        # drop tokens that are only matras/signs with no base letter
        if not re.search(r"[ଅ-ହୟୱ୦-୯]", w):
            continue
        res.append(w)
    return res
