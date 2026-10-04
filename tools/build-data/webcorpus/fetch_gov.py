#!/usr/bin/env python3
"""Build-time harvester: Odia text from government / institutional web pages.

Stdlib only. Fetches a list of URLs, strips HTML, keeps Odia-block text,
NFC-normalizes, and writes JSONL of per-page text.

This is BUILD-TIME research tooling. The shipped engine makes no network calls.
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
from pathlib import Path

OUT = Path(__file__).resolve().parent
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

ODIA = re.compile(r"[଀-୿]")
# token: Odia letters/matras/signs, allow ZWNJ/ZWJ inside
TOKEN = re.compile(r"[଀-୿‌‍]+")

SCRIPT_STYLE = re.compile(
    r"<(script|style|noscript)\b[^>]*>.*?</\1>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")
WS = re.compile(r"[ \t\r\f\v]+")


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "or,en-US;q=0.8,en;q=0.6",
        "Accept-Encoding": "gzip, deflate",
    })
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        ctype = r.headers.get("Content-Type", "")
        status = r.status
    enc = "utf-8"
    m = re.search(r"charset=([\w\-]+)", ctype, re.I)
    if m:
        enc = m.group(1)
    text = raw.decode(enc, "replace")
    if not m:
        m2 = re.search(r'charset=["\']?([\w\-]+)', text[:4000], re.I)
        if m2 and m2.group(1).lower() not in ("utf-8", "utf8"):
            text = raw.decode(m2.group(1), "replace")
    return status, ctype, text


def html_to_text(html):
    t = SCRIPT_STYLE.sub(" ", html)
    t = re.sub(r"<!--.*?-->", " ", t, flags=re.S)
    t = re.sub(r"</(p|div|li|tr|h[1-6]|br|td|section|article)>", "\n", t, flags=re.I)
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = TAG.sub(" ", t)
    # entities
    for a, b in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                 ("&quot;", '"'), ("&#39;", "'"), ("&rsquo;", "'"), ("&ldquo;", '"'),
                 ("&rdquo;", '"'), ("&ndash;", "-"), ("&mdash;", "-")):
        t = t.replace(a, b)
    t = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), t)
    t = re.sub(r"&#x([0-9a-fA-F]+);", lambda m: chr(int(m.group(1), 16)), t)
    t = WS.sub(" ", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    return t.strip()


def odia_lines(text):
    """Keep only lines that contain Odia script; strip non-Odia runs lightly."""
    out = []
    for line in text.split("\n"):
        line = line.strip()
        if len(line) < 2:
            continue
        n_od = len(ODIA.findall(line))
        if n_od < 2:
            continue
        # require Odia to be a meaningful share of the line
        letters = sum(1 for c in line if c.isalpha())
        if letters and n_od / letters < 0.5:
            continue
        out.append(line)
    return out


def main(urls_file, out_jsonl, log_file):
    urls = []
    seen = set()
    for ln in Path(urls_file).read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        if ln in seen:
            continue
        seen.add(ln)
        urls.append(ln)

    fout = open(out_jsonl, "a", encoding="utf-8")
    log = open(log_file, "a", encoding="utf-8")
    ok = fail = 0
    for i, url in enumerate(urls, 1):
        try:
            status, ctype, html = fetch(url)
            if "pdf" in ctype.lower():
                raise ValueError("pdf-not-parsed")
            text = html_to_text(html)
            text = unicodedata.normalize("NFC", text)
            lines = odia_lines(text)
            nchar = sum(len(ODIA.findall(l)) for l in lines)
            if nchar < 40:
                rec = {"url": url, "status": status, "ok": False,
                       "reason": f"too-little-odia({nchar})"}
                fail += 1
            else:
                fout.write(json.dumps({"url": url, "status": status,
                                       "odia_chars": nchar,
                                       "text": "\n".join(lines)},
                                      ensure_ascii=False) + "\n")
                fout.flush()
                rec = {"url": url, "status": status, "ok": True,
                       "odia_chars": nchar, "lines": len(lines)}
                ok += 1
        except Exception as e:
            rec = {"url": url, "ok": False,
                   "reason": f"{type(e).__name__}: {str(e)[:160]}"}
            fail += 1
        log.write(json.dumps(rec, ensure_ascii=False) + "\n")
        log.flush()
        print(f"[{i}/{len(urls)}] {'OK ' if rec.get('ok') else 'ERR'} "
              f"{rec.get('odia_chars', rec.get('reason',''))} {url}", flush=True)
        time.sleep(0.6)
    fout.close()
    log.close()
    print(f"\nDONE ok={ok} fail={fail} total={len(urls)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
