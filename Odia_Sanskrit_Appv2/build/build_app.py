#!/usr/bin/env python3
"""
Assemble odia-app-sanskrit-v2.html:

    docs/odia-app-sanskrit.html   (untouched, read-only)
  + pako inflate (MIT)            29 KB
  + dictionary payload            base64(gzip(...)), built by
                                  build_dictionary_payload.py
  + dict-overlay.css / .js        the gloss UI

The result is ONE self-contained file. Nothing existing is modified.
"""
import sys, re
from pathlib import Path

HERE = Path(__file__).resolve().parent

def main(app_html: str, out_path: str) -> None:
    html = Path(app_html).read_text(encoding='utf-8')
    pako = (HERE / 'pako-inflate.min.js').read_text(encoding='utf-8')
    b64 = (HERE / 'dict_payload_v2.b64').read_text(encoding='utf-8').strip()
    modern = (HERE / 'modern_payload.b64').read_text(encoding='utf-8').strip()
    css = (HERE / 'dict-overlay.css').read_text(encoding='utf-8')
    js = (HERE / 'dict-overlay.js').read_text(encoding='utf-8')

    # base64 must never be able to close the script tag early.
    assert '</' not in b64 and re.fullmatch(r'[A-Za-z0-9+/=]+', b64)
    assert '</' not in modern and re.fullmatch(r'[A-Za-z0-9+/=]+', modern)
    assert '</script' not in pako.lower().replace('<\\/script', '')
    assert '</script' not in js.lower()

    html = html.replace(
        '<title>Odia Phonetic — Sanskrit</title>',
        '<title>Odia Phonetic — Sanskrit · Dictionary</title>',
        1,
    )

    injection = (
        '\n    <!-- ================= v2 dictionary overlay ================= -->\n'
        '    <style>\n' + css + '\n    </style>\n'
        '    <script>\n' + pako + '\n    </script>\n'
        '    <script id="dict-data" type="text/plain">' + b64 + '</script>\n'
        '    <script id="dict-data-modern" type="text/plain">' + modern + '</script>\n'
        '    <script>\n' + js + '\n    </script>\n'
    )

    marker = '</body>'
    at = html.rindex(marker)
    out = html[:at] + injection + html[at:]
    Path(out_path).write_text(out, encoding='utf-8')
    print(f'wrote {out_path}  ({len(out.encode("utf-8"))/1e6:.2f} MB)')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
