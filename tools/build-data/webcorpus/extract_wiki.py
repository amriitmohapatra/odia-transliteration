#!/usr/bin/env python3
"""
Parse the Odia Wikipedia / Wikisource XML dumps, strip wikitext to plain text,
NFC-normalize, and emit one JSON object per article.

Build-time only. Output: wikipedia-raw.jsonl
"""
import bz2
import html
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent

# --- wikitext stripping ------------------------------------------------------
RE_COMMENT = re.compile(r"<!--.*?-->", re.S)
RE_NOWIKI = re.compile(r"<(nowiki|math|syntaxhighlight|source|score|timeline|"
                       r"gallery|imagemap|graph|mapframe|maplink)\b.*?</\1>", re.S | re.I)
RE_REF_PAIR = re.compile(r"<ref\b[^>/]*>.*?</ref>", re.S | re.I)
RE_REF_SELF = re.compile(r"<ref\b[^>]*/>", re.I)
RE_TAG = re.compile(r"</?[a-zA-Z][^>]*>")
RE_TABLE = re.compile(r"\{\|.*?\|\}", re.S)
RE_HEADING = re.compile(r"^=+\s*(.*?)\s*=+\s*$", re.M)
RE_BOLDITAL = re.compile(r"'{2,5}")
RE_LIST = re.compile(r"^[*#:;]+", re.M)
RE_URLBARE = re.compile(r"https?://\S+")
RE_ENTITY = re.compile(r"&[a-zA-Z]+;|&#\d+;")

# Wikisource page-scan markers
RE_PAGEQ = re.compile(r"<pages?\b[^>]*/?>", re.I)


def strip_templates(s):
    """Remove {{...}} handling nesting."""
    out = []
    depth = 0
    i = 0
    n = len(s)
    while i < n:
        if s.startswith("{{", i):
            depth += 1
            i += 2
        elif s.startswith("}}", i):
            if depth:
                depth -= 1
            i += 2
        else:
            if depth == 0:
                out.append(s[i])
            i += 1
    return "".join(out)


def strip_links(s):
    """[[a|b]] -> b ; [[a]] -> a ; drop File/Image/Category links entirely."""
    out = []
    i = 0
    n = len(s)
    while i < n:
        if s.startswith("[[", i):
            # find matching ]] allowing one level of nesting
            depth = 1
            j = i + 2
            while j < n and depth:
                if s.startswith("[[", j):
                    depth += 1
                    j += 2
                elif s.startswith("]]", j):
                    depth -= 1
                    j += 2
                else:
                    j += 1
            inner = s[i + 2:j - 2]
            head = inner.split(":", 1)[0].strip().lower()
            if head in ("file", "image", "category", "ଚିତ୍ର", "ଫାଇଲ", "ବିଭାଗ",
                        "ଶ୍ରେଣୀ", "media", "ମାଧ୍ୟମ"):
                pass  # drop wholly
            else:
                out.append(inner.split("|")[-1])
            i = j
        elif s.startswith("[", i) and not s.startswith("[[", i):
            j = s.find("]", i)
            if j == -1:
                out.append(s[i])
                i += 1
            else:
                inner = s[i + 1:j]
                parts = inner.split(None, 1)
                out.append(parts[1] if len(parts) > 1 else "")
                i = j + 1
        else:
            out.append(s[i])
            i += 1
    return "".join(out)


def wikitext_to_text(s):
    s = RE_COMMENT.sub(" ", s)
    s = RE_NOWIKI.sub(" ", s)
    s = RE_REF_PAIR.sub(" ", s)
    s = RE_REF_SELF.sub(" ", s)
    s = RE_PAGEQ.sub(" ", s)
    s = strip_templates(s)
    for _ in range(3):
        new = RE_TABLE.sub(" ", s)
        if new == s:
            break
        s = new
    s = strip_links(s)
    s = RE_TAG.sub(" ", s)
    s = RE_HEADING.sub(r"\1", s)
    s = RE_BOLDITAL.sub("", s)
    s = RE_LIST.sub(" ", s)
    s = RE_URLBARE.sub(" ", s)
    s = html.unescape(s)
    s = RE_ENTITY.sub(" ", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return unicodedata.normalize("NFC", s.strip())


def iter_pages(path):
    with bz2.open(path, "rb") as fh:
        for _, elem in ET.iterparse(fh, events=("end",)):
            tag = elem.tag.rsplit("}", 1)[-1]
            if tag != "page":
                continue
            ns = elem.findtext("./{*}ns")
            title = elem.findtext("./{*}title") or ""
            text = elem.findtext("./{*}revision/{*}text") or ""
            redirect = elem.find("./{*}redirect") is not None
            yield ns, title, text, redirect
            elem.clear()


def main():
    out_path = HERE / "wikipedia-raw.jsonl"
    stats = {}
    with out_path.open("w", encoding="utf-8") as out:
        for label, fname, keep_ns in (
            ("or.wikipedia", "orwiki-latest-pages-articles.xml.bz2", {"0"}),
            # Wikisource: ns 0 = works, ns 104 = Page: scans (the real prose)
            ("or.wikisource", "orwikisource-latest-pages-articles.xml.bz2", {"0", "104"}),
        ):
            p = HERE / fname
            n_pages = n_kept = n_chars = 0
            for ns, title, wt, redirect in iter_pages(p):
                n_pages += 1
                if redirect or ns not in keep_ns or not wt:
                    continue
                txt = wikitext_to_text(wt)
                if len(txt) < 30:
                    continue
                n_kept += 1
                n_chars += len(txt)
                out.write(json.dumps({"title": title, "source": label,
                                      "ns": ns, "text": txt},
                                     ensure_ascii=False) + "\n")
                if n_kept % 2000 == 0:
                    print(f"  [{label}] kept {n_kept} / seen {n_pages} "
                          f"/ {n_chars:,} chars", file=sys.stderr)
            stats[label] = {"pages_seen": n_pages, "pages_kept": n_kept,
                            "chars": n_chars}
            print(f"== {label}: {stats[label]}", file=sys.stderr)
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
