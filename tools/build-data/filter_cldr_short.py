"""Remove CLDR abbreviations from the MODERN dictionary layer (owner report, 2026-10-15).

The CLDR rows of the layer (`build_modern_layer.py`, tag `cldr`) took every form of each
month and weekday name, including the abbreviated and one-letter ("narrow") forms, and
the two-letter codes of a few languages and scripts. So the possessive particle RA showed
"Sunday", the negation NA "November", MA "Tuesday", A "April", GA "Ga (language)".

It also took the weekday short forms, which are everyday words (guru "teacher" read
"Thursday", mangala "auspicious" "Tuesday", ravi "sun" "Sunday"), and the months of the
Indian calendar, numbered like the Gregorian ones (chaitra read "January", ashadha
"April"): wrong.

Rule (the builder now reads only the Gregorian calendar's full names): a CLDR month line
stays only on the 12 full Gregorian month names, a weekday line only on the full names
ending in -baara; a language, script or region name of two code points or fewer is
dropped. A key left with no line is removed; the words keep their other meanings.

Usage (repo root), rewrites in place and prints what it removed:
    python3 tools/build-data/filter_cldr_short.py Appv2/src/dictionary/modern.bin \\
        --b64 Odia_Sanskrit_Appv2/build/modern_payload.b64
"""
import base64
import gzip
import re
import sys
from pathlib import Path

SEP = '\x02'  # as Appv2/src/dictionary/lookup.ts SEP


def read(raw: bytes):
    text = gzip.decompress(raw).decode('utf-8')
    a = text.index(SEP)
    b = text.index(SEP, a + 1)
    c = text.index(SEP, b + 1)
    count = int(text[:a])
    keys = text[a + 1:b].split('\n')
    lens = [int(x) for x in text[b + 1:c].split(',')]
    defs = text[c + 1:]
    assert len(keys) == count == len(lens)
    out, off = [], 0
    for k, n in zip(keys, lens):
        out.append((k, defs[off:off + n]))
        off += n
    return out


def write(entries) -> bytes:
    keys = [k for k, _ in entries]
    defs = [d for _, d in entries]
    text = f'{len(keys)}{SEP}' + '\n'.join(keys) + SEP + ','.join(str(len(d)) for d in defs) + SEP + ''.join(defs)
    return gzip.compress(text.encode('utf-8'), compresslevel=9, mtime=0)


# The 12 full Gregorian month names, as CLDR or.xml writes them (folded keys).
GREGORIAN_MONTHS = {
    '\u0b1c\u0b3e\u0b28\u0b41\u0b06\u0b30\u0b40',  # January
    '\u0b2b\u0b47\u0b2c\u0b43\u0b06\u0b30\u0b40',  # February
    '\u0b2e\u0b3e\u0b30\u0b4d\u0b1a\u0b4d\u0b1a',  # March
    '\u0b05\u0b2a\u0b4d\u0b30\u0b47\u0b32',  # April
    '\u0b2e\u0b07',  # May
    '\u0b1c\u0b41\u0b28',  # June
    '\u0b1c\u0b41\u0b32\u0b3e\u0b07',  # July
    '\u0b05\u0b17\u0b37\u0b4d\u0b1f',  # August
    '\u0b38\u0b47\u0b2a\u0b4d\u0b1f\u0b47\u0b2e\u0b4d\u0b2c\u0b30',  # September
    '\u0b05\u0b15\u0b4d\u0b1f\u0b4b\u0b2c\u0b30',  # October
    '\u0b28\u0b2d\u0b47\u0b2e\u0b4d\u0b2c\u0b30',  # November
    '\u0b21\u0b3f\u0b38\u0b47\u0b2e\u0b4d\u0b2c\u0b30',  # December
}
WEEKDAY_END = '\u0b2c\u0b3e\u0b30'  # -baara (day)

CLDR = re.compile(r'^cldr\t(.+) \((month|weekday|language|script|country/region)\)$')


def filter_entries(entries):
    kept, removed = [], []
    for k, d in entries:
        lines = []
        for line in d.split('\n'):
            m = CLDR.match(line)
            if m:
                kind = m.group(2)
                drop = (
                    (kind == 'month' and k not in GREGORIAN_MONTHS)
                    or (kind == 'weekday' and not k.endswith(WEEKDAY_END))
                    or (kind in ('language', 'script', 'country/region') and len(k) <= 2)
                )
                if drop:
                    removed.append((k, line))
                    continue
            lines.append(line)
        if lines:
            kept.append((k, '\n'.join(lines)))
    return kept, removed


def main() -> None:
    path = Path(sys.argv[1])
    b64 = Path(sys.argv[sys.argv.index('--b64') + 1]) if '--b64' in sys.argv else None
    entries = read(path.read_bytes())
    kept, removed = filter_entries(entries)
    for k, line in removed:
        print('removed', ' '.join(f'U+{ord(ch):04X}' for ch in k), line.replace('\t', ' '))
    print(f'{len(entries)} entries -> {len(kept)}; {len(removed)} lines removed')
    data = write(kept)
    path.write_bytes(data)
    if b64:
        b64.write_text(base64.b64encode(data).decode('ascii') + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
