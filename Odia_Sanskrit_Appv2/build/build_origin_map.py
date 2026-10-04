#!/usr/bin/env python3
"""
Build the word-origin map for the dictionary (PLAN.md V2.4).

Output: Appv2/src/dictionary/origin.bin (gzip). It says, for each headword of
praharaj.bin, where Praharaj says the word comes from: Sanskrit (tatsama),
native Odia (deshaja, with or without a stated Sanskrit source), Persian,
Arabic, English, Hindi, ... It is aligned to praharaj.bin's sorted key list,
one line per key, so it costs ~1 byte per word instead of repeating the keys.

Source
------
The origin marks inside the Praharaj entries (public domain; same file as the
payload builder, sha256 in Odia_Sanskrit_Appv2/PROVENANCE.md). An entry starts

    <head> — <Translit> [cognates in other scripts] <CLASS>. <POS>. (<etymon>) — 1 ...

e.g. SARAKAARA:  "ବୈଦେ. ବି (ଫା. ସରକାର) — 1 ..."  =  foreign, noun, (Persian sarakaara)
     GAAN (village): "ଦେ. ବି.—(ସଂ. ଗ୍ରାମ) — 1 ..."  =  deshya, noun, (Sanskrit graama)

Method
------
1. CLASS. The first class mark in the entry head that is followed (after any
   parenthesised groups, other class marks and register words such as
   "padya", "praachina") by a part-of-speech mark (POS below). The POS
   requirement is what stops a Sanskrit synonym list ("ସଂ. ନାମ—...") or a
   cognate list ("ତେ. ... ଫା. ... ଆ. ...") from being read as the class.
2. ETYMON. In the "grammar zone" right after the class (parenthesised groups,
   POS marks, register words; it ends at the first word of definition text),
   the first `;`-separated segment of a parenthesised group whose first token
   is a language mark (LANG below). Within it, each `+`-joined piece that
   starts with a language mark contributes that language (hybrids such as
   "ଆ. ନଜର୍+ଫା. ବନ୍ଦୀ", Arabic + Persian, keep both). Text after "ତୁଳ"
   (compare; also spelt ତୂଳ, ଢୁଳ) or "କିମ୍ବା" (or) is ignored: "(ସଂ. କାତର; ତୁଳ. ହି. ...)" is not Hindi.
   "(ହି. ଶବ୍ଦସାଗର)" / "(ହି.ଶ)" is a CITATION of the Hindi dictionary
   Shabdasagar, not an origin, and is skipped.
3. CODE per entry, from class + etymon:
     ସଂ.  (sanskrita)          -> S, whatever the parentheses say (they hold
                                 compound analysis and citations)
     ଦେ.  (deshya)             -> D; T if the etymon is Sanskrit only;
                                 the etymon's languages if any is foreign
     ବୈଦେ. (baideshika, foreign) -> the etymon's languages if any is foreign;
                                 F (foreign, language not given) if none;
                                 nothing if the etymon is Sanskrit only
                                 (contradictory: 31 entries)
     ପ୍ରାଦେ. (regional), ଗ୍ରା. (colloquial) -> the etymon's languages only if
                                 one is foreign; otherwise nothing (these
                                 marks are register, not origin)
4. KEY. Entries are keyed exactly as the payload builder keys them
   (fold(canonical(head)) for each `|`-separated head). One key can hold
   several entries (homographs). The distinct non-empty codes are kept in
   entry order, joined by "/" (e.g. "S/D": one entry Sanskrit, one native).
   Only keys present in praharaj.bin are written.

Codes (one letter per language; a hybrid is several letters, e.g. "AP"):

    S  Sanskrit (tatsama)            P  Persian (Farsi)     H  Hindi
    T  native Odia, from Sanskrit    A  Arabic              B  Bengali
       (tadbhava)                    E  English             K  Turkish
    D  native Odia (deshaja)         G  Portuguese          F  foreign, language not given

Tag table. "decided" = entries (whole Babylon file, 148,492 entries) whose label
came from this mark; Sanskrit marks inside a ସଂ.-class entry are not counted,
because the class alone decides those.

    mark                              code  meaning      decided
    ସଂ / ସଂ.                            S    Sanskrit       16,069  (tadbhava etymons and hybrids)
    ଇଂ / ଇଂ.                            E    English         4,186
    ଫା / ଫା.                            P    Persian         3,926
    ଆ / ଆ.                              A    Arabic          2,567
    ହି / ହି.  (not ହି. ଶବ୍ଦସାଗର)          H    Hindi             182
    ହିନ୍ଦିରୁ / ହିନ୍ଦୀରୁ ("from Hindi")       H    Hindi              43
    ବଙ୍ଗଳାରୁ ("from Bengali") / ବଂ.       B    Bengali           131
    ତୁର୍କୀ                               K    Turkish            61
    ପର୍ଟୁଗୀଜ                             G    Portuguese          5
    ଓ.  (Odia part of a hybrid)        D    native Odia        45

Class marks (whole file, entries): ସଂ. -> S 63,215 · ଦେ. -> D 40,148 / T 15,472 ·
ବୈଦେ. without a language -> F 1,746 · no class found or register only -> none 17,097
(phrases, cross-references, regional and colloquial words without a foreign etymon).

Deliberately NOT mapped (ambiguous; the entry keeps its class code, or nothing):
    (ଅ)   ~17 entries  probably Arabic (ଆ), but "ଅ" is also the indeclinable mark
    (ଇ)   ~18 entries  probably English, not certain
    (ସ)   ~19 entries  probably Sanskrit
    ମ.    in ସଂ. entries it is compound analysis ("ମ. ପ. ଲୋ" = madhyapadalopi), not Marathi
    ପ୍ରା.  Prakrit: a step further back, not used for the label
    other languages (Russian, Malay, Greek, ...) -> F when the class is ବୈଦେ.

The earlier rough count in plan/research/2026-10-04/02-dictionary-sources.md
("first parenthesised tag": Hindi 4,749) mostly counted "(ହି. ଶବ୍ଦସାଗର)", a
citation of the Hindi dictionary Shabdasagar inside Sanskrit entries (~740 in
the head alone), plus later senses. Genuine Hindi etymons: 225 entries.

Run from the repo root (Python 3 stdlib only):
    python3 Odia_Sanskrit_Appv2/build/build_origin_map.py <path-to-praharaj.babylon>
    python3 -m doctest Odia_Sanskrit_Appv2/build/build_origin_map.py   # tag-table tests
"""
import gzip
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
# Same normalisation as the payload: canonical() decomposes the nukta letters,
# fold() maps Praharaj-era spellings. Imported, never copied.
from build_dictionary_payload import canonical, fold  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
PAYLOAD = REPO / 'Appv2/src/dictionary/praharaj.bin'
OUT = REPO / 'Appv2/src/dictionary/origin.bin'
FORMAT = 'odia-origin 1'

# Class marks (first part of the token, trailing "." removed).
CLASS = {
    'ସଂ': 'S',        # sanskrita
    'ଦେ': 'D',        # deshya
    'ବୈଦେ': 'F',      # baideshika (foreign)
    'ପ୍ରାଦେ': 'R',    # praadeshika (regional)
    'ପ୍ରଦେ': 'R',     # misprint of the above
    'ପ୍ରା': 'R',      # as a CLASS (followed by a POS) it is the regional mark
    'ଗ୍ରା': 'G',      # graamya (colloquial)
    'ଗ୍ରାମ୍ଯ': 'G',
}

# Part-of-speech marks that must follow a class mark (counts from the full file).
POS = {
    'ବି', 'ବିଣ', 'ବିଣ୍', 'ବିଂ', 'ବିମ', 'ବିଣର', 'ବଣ', 'ବ',          # noun / adjective
    'କ୍ରି', 'କ୍ର', 'କ୍ରୀ', 'କ୍ରିଯା', 'କ୍ତି', 'ନ୍ତ୍ରି',              # verb
    'ଅ', 'ଅବ୍ଯଯ', 'ଆ',                                          # indeclinable
    'ସର୍ବ', 'ସର୍ବନାମ', 'ସର୍ବ୍ବ', 'ସ',                             # pronoun
    'ତ୍ରି', 'ପ୍ରତ୍ଯଯ', 'ଉପସର୍ଗ', 'ବାକ୍ଯ', 'ବାକ୍ଯାଂଶ', 'ପ୍ରବଚନ',
    'ନ୍ଯାଯ', 'ଢ଼ଗ', 'ଅସମାପିକା', 'ସ୍ତ୍ରୀ', 'ପୁଂ', 'କି', 'ଚି', 'ନି',
}

# Words that may sit between the class and the POS, or inside the grammar zone.
REGISTER = {'ପଦ୍ଯ', 'ପ୍ରାଚୀନ', 'ଓ', 'ସକର୍ମକ', 'ଅକର୍ମକ', 'ପୂଂ', 'ଫୁ'}

# Language marks inside an etymon segment.
LANG = {
    'ସଂ': 'S',
    'ଫା': 'P',
    'ଆ': 'A',
    'ଇଂ': 'E',
    'ହି': 'H',
    'ହିନ୍ଦିରୁ': 'H',
    'ହିନ୍ଦୀରୁ': 'H',
    'ବଙ୍ଗଳାରୁ': 'B',
    'ବଂ': 'B',
    'ତୁର୍କୀ': 'K',
    'ପର୍ଟୁଗୀଜ': 'G',
    'ଓ': 'D',
}
FOREIGN_CODES = set('PAEHBKG')
STOP = re.compile(r'ତୁଳ|ତୂଳ|ଢୁଳ|କିମ୍ବା')
CITATION = re.compile(r'^\s*ହି\s*\.?\s*ଶ')  # (ହି. ଶବ୍ଦସାଗର), (ହି.ଶ)

TOKEN = re.compile(r'\([^()]*\)|\[[^\[\]]*\]|[^\s()\[\]]+')
SPLIT = re.compile(r'[.,;:—–\s-]+')

MARKS = Counter()

LABELS = {
    'S': 'Sanskrit (tatsama)', 'T': 'native Odia, from Sanskrit (tadbhava)',
    'D': 'native Odia (deshaja)', 'P': 'Persian', 'A': 'Arabic', 'E': 'English',
    'H': 'Hindi', 'B': 'Bengali', 'K': 'Turkish', 'G': 'Portuguese',
    'F': 'foreign, language not given',
}


def parts(token: str) -> list:
    return [p for p in SPLIT.split(token) if p]


def etymon_codes(group: str, marks: list = None) -> str:
    """Language codes of the first etymon segment in one parenthesised group.

    >>> etymon_codes('(ଫା. ସରକାର)')
    'P'
    >>> etymon_codes('(ଆ. ନଜର୍+ଫା. ବନ୍ଦୀ)')
    'AP'
    >>> etymon_codes('(ସଂ. କାତର; ତୁଳ. ହି. କାହିଲ୍)')
    'S'
    >>> etymon_codes('(ହି. ଶବ୍ଦସାଗର)')
    ''
    >>> etymon_codes('(ନାମ; ସଂ. ଅଂଶୁ+ପା ଧାତୁ)')
    'S'
    >>> etymon_codes('(କଚିରିଆ)')
    ''
    >>> etymon_codes('(ତୁଳ ବଂ. ମତନ୍; ହି. ମୋତାବିକ୍)')
    ''
    >>> etymon_codes('(ତୂଳ; ହି. ଅଭର୍)')
    ''
    >>> etymon_codes('[ଇଂ. ରବ୍ଳ]')
    'E'
    """
    inner = group[1:-1]
    m = STOP.search(inner)  # "compare ..." / "or ..." runs to the end of the group
    if m:
        inner = inner[:m.start()]
    for seg in inner.split(';'):
        if CITATION.match(seg):
            continue
        p = parts(seg)
        if not p or p[0] not in LANG:
            continue
        codes = ''
        for piece in seg.split('+'):
            q = parts(piece)
            if q and q[0] in LANG and LANG[q[0]] not in codes:
                codes += LANG[q[0]]
                if marks is not None:
                    marks.append(q[0])
        return codes
    return ''


def classify(body: str) -> str:
    """Origin code of one entry, from its text after the headword.

    >>> classify('Sarakāra সরকার सरकार ବୈଦେ. ବି (ଫା. ସରକାର) — 1 ପ୍ରଭୂ')
    'P'
    >>> classify('Gāñ গাঁ गाँव ଦେ. ବି.—(ସଂ. ଗ୍ରାମ) — 1 ଗ୍ରାମ')
    'T'
    >>> classify('Jaḻa ସଂ. ବି (ଜଳ ଧାତୁ) — 1 ପାଣି (ହି. ଶବ୍ଦସାଗର)')
    'S'
    >>> classify('Kabachapatra ସଂ. ବି — ଭୁର୍ଜପତ୍ର (ହି. ଶବ୍ଦସାଗର) — The bark')
    'S'
    >>> classify('A-A ଦେ. ଅ — (ଧ୍ବନ୍ଯନୁକରଣ) 1 ବମନ')
    'D'
    >>> classify('Aañḻā ସଂ. ନାମ—ଆମଳକ, ଧାତ୍ରୀ ଫା. ଆମଲା ଆ. ଆମ୍ଳଜ୍ ଦେ. ବି — 1 (ସଂ. ଆମଳକ)')
    'D'
    >>> classify('Aela অয়েল্ ବୈଦେ. (ଇଂ) ବି — ତୈଳ —Oil.')
    'E'
    >>> classify('Aulāt ବୈଦେ. (କଚିରିଆ) ବି. (ଫା. ଆଓଲାଦ୍)')
    'P'
    >>> classify('Kāilā ବୈଦେ. ବି. (ସଂ. କାତର; ତୁଳ. ହି. କାହିଲ୍)')
    ''
    >>> classify('Agara অগুরু ବୈଦେ. ')
    'F'
    >>> classify('Ain ପ୍ରାଦେ. (ସମ୍ବଲପୁର) ବି — ଆଇନ')
    ''
    >>> classify('Chabeṇā ଦେ. ବି. (ସଂ. ଚର୍ବିଣ; ହିନ୍ଦିରୁ ଅନୁଭୁତ)')
    'T'
    >>> classify('Chupse ଦେ. ଅ. (ହିନ୍ଦିରୁ ଅନୁକୃତ)')
    'H'
    """
    toks = TOKEN.findall(body[:400])
    for i, tok in enumerate(toks):
        if tok[0] in '([':
            continue
        p = parts(tok)
        if not p or p[0] not in CLASS:
            continue
        cls = CLASS[p[0]]
        # Is a POS next (in this token, e.g. "ସଂ.ବି", or after parens/registers)?
        rest = p[1:]
        j = i + 1
        pos_ok = None
        for r in rest:
            if r in POS:
                pos_ok = True
                break
            if r not in REGISTER and r not in CLASS:
                pos_ok = False
                break
        while pos_ok is None and j < len(toks):
            t = toks[j]
            j += 1
            if t[0] in '([':
                continue
            q = parts(t)
            if not q:
                continue
            if q[0] in POS:
                pos_ok = True
            elif q[0] in CLASS or q[0] in REGISTER:
                continue
            else:
                pos_ok = False
        if pos_ok is None:
            pos_ok = True  # the head ended after the class (and its parens)
        if not pos_ok:
            continue
        # Grammar zone: parens, POS, class and register words. Ends at text.
        codes = ''
        used = []
        for t in toks[i + 1:]:
            if t[0] in '([':
                used = []
                codes = etymon_codes(t, used)
                if codes:
                    break
                continue
            q = parts(t)
            if q and q[0] in LANG and LANG[q[0]] in FOREIGN_CODES:
                codes, used = LANG[q[0]], [q[0]]  # a bare mark: "ବୈଦେ. ଇଂ. (ନାମ)"
                break
            if q and not all(x in POS or x in CLASS or x in REGISTER for x in q):
                break
        foreign = any(c in FOREIGN_CODES for c in codes)
        if cls != 'S' and (foreign or (cls == 'D' and codes == 'S')):
            MARKS.update(used)  # the marks that decided the label (tag table)
        if cls == 'S':
            return 'S'
        if cls == 'D':
            if foreign:
                return codes
            return 'T' if codes == 'S' else 'D'
        if cls == 'F':
            if foreign:
                return codes
            return '' if codes else 'F'
        return codes if foreign else ''  # regional / colloquial
    return ''


def parse_babylon(path: Path) -> dict:
    """{folded key: [code per entry]} -- keyed exactly like the payload builder."""
    raw = path.read_text(encoding='utf-8')
    out = {}
    for block in raw.split('\n\n'):
        if not block.strip() or block.startswith('#'):
            continue
        lines = block.split('\n')
        head, body = lines[0].strip(), '\n'.join(lines[1:]).strip()
        if not head or not body:
            continue
        body = canonical(body)
        dash = body.find('—')
        code = classify(body[dash + 1:] if dash >= 0 else body)
        for h in (fold(canonical(x.strip())) for x in head.split('|')):
            if h:
                out.setdefault(h, []).append(code)
    return out


def merge(codes: list) -> str:
    """Distinct non-empty codes in entry order, '/'-joined (homographs).

    >>> merge(['P', '', 'P'])
    'P'
    >>> merge(['S', 'D'])
    'S/D'
    >>> merge(['', ''])
    ''
    """
    seen = []
    for c in codes:
        if c and c not in seen:
            seen.append(c)
    return '/'.join(seen)


def fnv1a(s: str) -> str:
    """FNV-1a 32 over UTF-16 code units (all keys are in the BMP), as hex.
    Mirrored in Appv2/src/dictionary/overlay.ts to reject a stale file."""
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return format(h, '08x')


def payload_keys() -> list:
    text = gzip.decompress(PAYLOAD.read_bytes()).decode('utf-8')
    a = text.index('\x02')
    b = text.index('\x02', a + 1)
    keys = text[a + 1:b].split('\n')
    assert len(keys) == int(text[:a]), 'payload key count mismatch'
    assert all(ord(c) < 0x10000 for k in keys for c in k)
    return keys


def main(babylon: str) -> None:
    d = parse_babylon(Path(babylon))
    entries = Counter(c for v in d.values() for c in v)
    print(f'headwords (folded): {len(d)}   entries: {sum(entries.values())}')
    letters = Counter()
    for v in d.values():
        for c in v:
            for ch in set(c):
                letters[ch] += 1
    print('entries by code (whole file):')
    for code, n in entries.most_common():
        print(f'  {code or "(none)":6} {n:7}')
    print('entries containing each language (whole file):')
    for ch, n in letters.most_common():
        print(f'  {ch}  {n:7}  {LABELS[ch]}')

    print('language marks that decided a label (whole file):')
    for mark, n in MARKS.most_common():
        print(f'  {mark:12} {LANG[mark]}  {n:6}')

    keys = payload_keys()
    lines = [merge(d.get(k, [])) for k in keys]
    reach = Counter(lines)
    print(f'payload keys: {len(keys)}   with an origin: {sum(1 for x in lines if x)}')
    print('payload keys by code:')
    for code, n in reach.most_common():
        print(f'  {code or "(none)":8} {n:6}')
    print('payload keys containing each code:')
    per = Counter(ch for x in lines for ch in set(x.replace('/', '')))
    for ch, n in per.most_common():
        print(f'  {ch}  {n:6}  {LABELS[ch]}')
    multi = sum(1 for x in lines if '/' in x)
    print(f'payload keys whose entries disagree ("/"): {multi}')

    text = FORMAT + '\t' + str(len(keys)) + '\t' + fnv1a('\n'.join(keys)) + '\n' + '\n'.join(lines) + '\n'
    raw = text.encode('utf-8')
    gz = gzip.compress(raw, 9, mtime=0)
    OUT.write_bytes(gz)
    print(f'wrote {OUT.relative_to(REPO)}  raw={len(raw)} bytes  gz={len(gz)} bytes')


if __name__ == '__main__':
    main(sys.argv[1])
