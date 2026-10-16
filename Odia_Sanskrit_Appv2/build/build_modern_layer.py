#!/usr/bin/env python3
"""
Build the MODERN gloss layer for odia-app-sanskrit-v2.html.

Praharaj (1931-40) knows the classical and everyday Odia of its era; it does
not know ମୋବାଇଲ, ଟ୍ରେନ or today's senses. This layer fills that gap from
three machine-readable sources, each tagged so the UI can say where a gloss
came from:

  [loan]  English loanwords, detected ALGORITHMICALLY: every word in the
          app's vocabulary is reverse-transliterated to Latin skeletons and
          matched against an English frequency lexicon (wordfreq). A match is
          only accepted when the word has NO exact Praharaj entry — Praharaj
          acts as the native-vocabulary filter, which is what stops କର from
          being glossed as "car".
  [mt]    REMOVED 2026-10-15 (V2.7, decision D-5): community translation pairs
          from OdiaNLP `cleaned_pairs.json`, whose text is of unknown origin
          and often wrong. Their place is taken by the AI-written meanings
          (core/data/meanings.tsv) and by [wd]. `mt_glosses` stays below only
          to document what the layer was; it is no longer called.
  [wd]    Wikidata (CC0) names: countries, districts, cities, parties,
          universities, festivals, rivers, temples, languages
          (build/wikidata-names.tsv).
  [cldr]  Unicode CLDR or.xml — the modern standard Odia names of languages,
          scripts, countries and regions. High quality, unambiguous.

Output: modern_payload.b64 — same container format as the Praharaj payload
(N \\x02 keys \\x02 lens \\x02 defs, gzip, base64), keys folded+canonical,
each def a set of lines "TAG\\tgloss".

Run from the repo root:
  python3 Odia_Sanskrit_Appv2/build/build_modern_layer.py \\
      <cldr-or.xml> <praharaj.babylon>
"""
import base64
import gzip
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

from wordfreq import zipf_frequency, top_n_list

OUT = Path(__file__).resolve().parent / 'modern_payload.b64'
REPO = Path(__file__).resolve().parents[2]

WORD_SOURCES = [
    (REPO / 'core/data/unigrams.tsv', 0),
    (REPO / 'core/data/lexicon-web.tsv', 1),
    (REPO / 'Appv2/data/sanskrit-lexicon-web.tsv', 1),
    (REPO / 'Appv2/data/sanskrit-unigrams-web.tsv', 0),
]


def canonical(s: str) -> str:
    s = unicodedata.normalize('NFC', s)
    return s.replace('ଡ଼', 'ଡ଼').replace('ଢ଼', 'ଢ଼')


def fold(w: str) -> str:
    return w.replace('ୟ', 'ଯ').replace('ୱ', 'ବ').replace('ଵ', 'ବ')


# ---------------------------------------------------------------- loanwords

# Folded-orthography consonant map (built AFTER fold(), so no ୟ/ୱ/ଵ keys).
CONS = {
    'କ': 'k', 'ଖ': 'kh', 'ଗ': 'g', 'ଘ': 'gh', 'ଙ': 'n',
    'ଚ': 'ch', 'ଛ': 'chh', 'ଜ': 'j', 'ଝ': 'jh', 'ଞ': 'n',
    'ଟ': 't', 'ଠ': 'th', 'ଡ': 'd', 'ଢ': 'dh', 'ଣ': 'n',
    'ତ': 't', 'ଥ': 'th', 'ଦ': 'd', 'ଧ': 'dh', 'ନ': 'n',
    'ପ': 'p', 'ଫ': 'f', 'ବ': 'b', 'ଭ': 'bh', 'ମ': 'm',
    'ଯ': 'y', 'ର': 'r', 'ଲ': 'l', 'ଳ': 'l',
    'ଶ': 's', 'ଷ': 's', 'ସ': 's', 'ହ': 'h',
}
VOWEL_SIGNS = {
    'ା': 'a', 'ି': 'i', 'ୀ': 'i', 'ୁ': 'u', 'ୂ': 'u',
    'ୃ': 'ri', 'େ': 'e', 'ୈ': 'ai', 'ୋ': 'o', 'ୌ': 'au',
}
INDEP_VOWELS = {
    'ଅ': 'a', 'ଆ': 'a', 'ଇ': 'i', 'ଈ': 'i', 'ଉ': 'u', 'ଊ': 'u',
    'ଏ': 'e', 'ଐ': 'ai', 'ଓ': 'o', 'ଔ': 'au', 'ଋ': 'ri',
}
VIRAMA = '୍'
NUKTA = '଼'
ANUSVARA = 'ଂ'
CANDRA = 'ଁ'
VISARGA = 'ଃ'


def roman_skeleton(word: str):
    """Romanise a folded Odia word; return (with_vowels, consonant_skeleton)."""
    out = []
    chars = list(word)
    i = 0
    while i < len(chars):
        c = chars[i]
        if c in CONS:
            base = CONS[c]
            # nukta: ଡ଼/ଢ଼ arrive decomposed; treat as r-ish flap
            if i + 1 < len(chars) and chars[i + 1] == NUKTA:
                base = 'r' if c in 'ଡଢ' else base
                i += 1
            if i + 1 < len(chars) and chars[i + 1] == VIRAMA:
                out.append(base)          # no inherent vowel
                i += 2
                continue
            nxt = chars[i + 1] if i + 1 < len(chars) else None
            if nxt in VOWEL_SIGNS:
                out.append(base + VOWEL_SIGNS[nxt])
                i += 2
            else:
                out.append(base + 'a')    # inherent vowel
                i += 1
        elif c in INDEP_VOWELS:
            out.append(INDEP_VOWELS[c])
            i += 1
        elif c in (ANUSVARA, CANDRA):
            out.append('n')
            i += 1
        elif c == VISARGA:
            out.append('h')
            i += 1
        else:
            i += 1
    roman = ''.join(out)
    # trailing inherent vowel is usually silent in loans (ମୋବାଇଲ -> mobail)
    return roman, skeleton_of(roman)


def skeleton_of(latin: str) -> str:
    s = re.sub(r'[^a-z]', '', latin.lower())
    s = re.sub(r'[aeiou]+', '', s)
    s = re.sub(r'(.)\1+', r'\1', s)
    return s


# ARPABET -> the same latin alphabet roman_skeleton() produces for Odia.
ARPA = {
    'B': 'b', 'CH': 'c', 'D': 'd', 'DH': 'd', 'F': 'f', 'G': 'g', 'HH': 'h',
    'JH': 'j', 'K': 'k', 'L': 'l', 'M': 'm', 'N': 'n', 'NG': 'n', 'P': 'p',
    'R': 'r', 'S': 's', 'SH': 's', 'T': 't', 'TH': 't', 'V': 'b', 'W': 'b',
    'Y': 'y', 'Z': 'j', 'ZH': 'j',
    'AA': 'a', 'AE': 'a', 'AH': 'a', 'AO': 'o', 'AW': 'au', 'AY': 'ai',
    'EH': 'e', 'ER': 'ar', 'EY': 'e', 'IH': 'i', 'IY': 'i', 'OW': 'o',
    'OY': 'oi', 'UH': 'u', 'UW': 'u',
}


def phonetic(pron) -> str:
    return ''.join(ARPA.get(re.sub(r'\d', '', ph), '') for ph in pron)


def edit_distance(a: str, b: str, cap: int) -> int:
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        best = i
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[-1] + 1, prev[j - 1] + (ca != cb)))
            best = min(best, cur[-1])
        if best > cap:
            return cap + 1
        prev = cur
    return prev[-1]


def detect_loans(app_folded: set, praharaj_heads: set) -> dict:
    """word -> english, matched on PRONUNCIATION (CMUdict), not spelling.

    Odia loanwords transcribe how an English word sounds, so spelling-based
    matching both misses real loans (school/skul) and invents false ones.
    Phoneme matching with a small edit tolerance is precise in both
    directions. Praharaj still acts as the native-vocabulary filter.
    """
    import cmudict
    cmu = cmudict.dict()

    by_skel = {}
    for w in top_n_list('en', 50000):
        if not w.isalpha() or len(w) < 3 or w not in cmu:
            continue
        z = zipf_frequency(w, 'en')
        if z < 2.5:
            continue
        for pron in cmu[w]:
            ph = phonetic(pron)
            if len(ph) < 4:
                continue
            sk = skeleton_of(ph)
            if len(sk) < 2:
                continue
            by_skel.setdefault(sk, []).append((z, w, ph))
    for sk in by_skel:
        by_skel[sk] = sorted(by_skel[sk], reverse=True)[:4]

    # Native-vocabulary filter, three layers deep. A word is "native" (and
    # never glossed as a loan) if itself, a suffix-stripped stem, OR a
    # vowel-length-collapsed variant of either is a Praharaj headword. This
    # is what stops ଦିନରୁ ("from the day") reading as "dinner" and ପାଷଣ
    # (a spelling of ପାଷାଣ, stone) reading as "passing".
    suffixes = sorted(['ମାନଙ୍କର', 'ମାନଙ୍କୁ', 'ମାନଙ୍କ', 'ଗୁଡ଼ିକ', 'ମାନେ',
                       'ଙ୍କର', 'ଙ୍କୁ', 'ଙ୍କ', 'ରେ', 'ରୁ', 'କୁ', 'ଟି', 'ଟା',
                       'ର', 'େ', 'ଁ', 'ଂ',
                       # verb inflections: ମିଶିଲା is ମିଶ + -ିଲା, not "michelle"
                       'ାଇଲା', 'ାଇଲେ', 'ିଲା', 'ିଲେ', 'ିଲି', 'ିଲୁ',
                       'ିବା', 'ିବେ', 'ିବି', 'ିମୁ', 'ୁଛି', 'ୁଛେ', 'ୁଛ',
                       'ନ୍ତି', 'ନ୍ତୁ', 'ନ୍ତେ', 'ୁଥିଲା', 'ିଯାଏ', 'ିଯିବ'],
                      key=len, reverse=True)

    def vskel(w: str) -> str:
        return (w.replace('ା', '').replace('ୀ', 'ି').replace('ୂ', 'ୁ'))

    praharaj_vskel = {vskel(h) for h in praharaj_heads}

    def is_native(w: str) -> bool:
        forms = [w]
        for s in suffixes:
            if w.endswith(s) and len(w) - len(s) >= 2:
                forms.append(w[:len(w) - len(s)])
        for f in forms:
            if f in praharaj_heads or vskel(f) in praharaj_vskel:
                return True
        return False

    loans = {}
    for w in app_folded:
        if len(w) < 3 or is_native(w):
            continue
        roman, _ = roman_skeleton(w)
        # loans do not distinguish aspirates: ଖ/କ both transcribe k
        deaspirated = re.sub(r'([kgcjtdpb])h', r'\1', roman)
        for variant in {roman, roman.rstrip('a'), deaspirated, deaspirated.rstrip('a')}:
            if len(variant) < 4:
                continue
            sk = skeleton_of(variant)
            best = None
            for z, en, ph in by_skel.get(sk, []):
                d = edit_distance(variant, ph, 2)
                # graduated acceptance: the fuzzier the match, the more common
                # the English word has to be
                ok = ((d == 0 and z >= 2.5)
                      or (d == 1 and z >= 3.5 and len(ph) >= 5)
                      or (d == 2 and z >= 4.0 and len(ph) >= 9))
                if not ok:
                    continue
                # tie-break equal edit distance by vowel agreement, then
                # frequency: ବ୍ରୋଞ୍ଜ is bronze, not "brings"
                vo = re.sub(r'[^aeiou]', '', variant)
                ve = re.sub(r'[^aeiou]', '', ph)
                vmiss = sum(1 for x, y in zip(vo, ve) if x != y) + abs(len(vo) - len(ve))
                if best is None or (d, vmiss, -z) < best[:3]:
                    best = (d, vmiss, -z, en)
            if best:
                prev = loans.get(w)
                if prev is None or best[:3] < prev[:3]:
                    loans[w] = best
    return {w: v[3] for w, v in loans.items()}


# ---------------------------------------------------------------- MT pairs

ODIA_ONLY = re.compile(r'^[଀-୿‌‍]+$')


def mt_glosses(pairs_path: Path) -> dict:
    pairs = json.loads(pairs_path.read_text(encoding='utf-8'))
    inv = {}
    for en, od in pairs.items():
        od = od.strip()
        if not ODIA_ONLY.match(od):
            continue
        en = en.strip().lower()
        if not re.fullmatch(r"[a-z][a-z '-]{1,40}", en):
            continue
        if len(en.split()) > 3:
            continue
        key = fold(canonical(od))
        inv.setdefault(key, set()).add(en)
    out = {}
    for od, ens in inv.items():
        scored = []
        for en in ens:
            base = en.split()[0]
            z = zipf_frequency(base, 'en')
            if z >= 3.3:
                scored.append((z, en))
        if not scored:
            continue
        scored.sort(reverse=True)
        out[od] = [en for _, en in scored[:4]]
    return out


# ---------------------------------------------------------------- CLDR

def cldr_names(or_xml: Path) -> dict:
    """Odia display-name -> english name, from languages/scripts/territories."""
    root = ET.parse(or_xml).getroot()
    from wordfreq import zipf_frequency as _z  # noqa: F401
    out = {}
    for path, kind in [
        ('.//languages/language', 'language'),
        ('.//scripts/script', 'script'),
        ('.//territories/territory', 'country/region'),
        # The Gregorian calendar's full (wide) names only: the abbreviated and
        # one-letter forms are everyday words (RA "of", NA "not", GURU "teacher"),
        # and the Indian calendar's months do not match Gregorian numbers
        # (owner report 2026-10-15; tools/build-data/filter_cldr_short.py).
        (".//calendar[@type='gregorian']/months/monthContext[@type='format']/monthWidth[@type='wide']/month", 'month'),
        (".//calendar[@type='gregorian']/days/dayContext[@type='format']/dayWidth[@type='wide']/day", 'weekday'),
    ]:
        for el in root.findall(path):
            od = (el.text or '').strip()
            code = el.get('type', '')
            if not od or not ODIA_ONLY.match(od.replace(' ', '')):
                continue
            if el.get('alt'):
                continue
            # Two-letter language and script codes are everyday syllables (GA, YI).
            if kind in ('language', 'script', 'country/region') and len(fold(canonical(od))) <= 2:
                continue
            out.setdefault(fold(canonical(od)), (code, kind))
    return out


# English names for CLDR codes, via the en.xml in the same checkout.
def cldr_english(en_xml: Path) -> dict:
    root = ET.parse(en_xml).getroot()
    names = {}
    for path in ['.//languages/language', './/scripts/script', './/territories/territory']:
        for el in root.findall(path):
            if el.get('alt'):
                continue
            names[el.get('type', '')] = (el.text or '').strip()
    return names


MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
          'August', 'September', 'October', 'November', 'December']
DAYS = {'sun': 'Sunday', 'mon': 'Monday', 'tue': 'Tuesday', 'wed': 'Wednesday',
        'thu': 'Thursday', 'fri': 'Friday', 'sat': 'Saturday'}


# ---------------------------------------------------------------- main

def app_words() -> set:
    words = set()
    for path, col in WORD_SOURCES:
        for line in path.read_text(encoding='utf-8').splitlines():
            if line.startswith('#') or not line.strip():
                continue
            parts = line.split('\t')
            if len(parts) > col:
                words.add(fold(canonical(parts[col])))
    return words


def praharaj_headwords(babylon: Path) -> set:
    heads = set()
    for block in babylon.read_text(encoding='utf-8').split('\n\n'):
        if not block.strip() or block.startswith('#'):
            continue
        head = block.split('\n', 1)[0].strip()
        for h in head.split('|'):
            heads.add(fold(canonical(h.strip())))
    return heads


def wikidata_names() -> dict:
    """build/wikidata-names.tsv: folded Odia key -> 'English (kind)'."""
    out = {}
    for line in (Path(__file__).resolve().parent / 'wikidata-names.tsv').read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        odia, english, kind, _qid = line.split('\t')
        out.setdefault(fold(canonical(odia)), f'{english} ({kind})')
    return out


def main(or_xml: str, babylon: str) -> None:
    words = app_words()
    heads = praharaj_headwords(Path(babylon))
    print(f'app words: {len(words)}, praharaj heads: {len(heads)}')

    loans = detect_loans(words, heads)
    print(f'loanwords detected: {len(loans)}')

    names = wikidata_names()
    print(f'Wikidata names: {len(names)}')

    odia_names = cldr_names(Path(or_xml))
    en_names = cldr_english(Path(or_xml).with_name('en.xml'))
    cldr = {}
    for od, (code, kind) in odia_names.items():
        if kind == 'month' and code.isdigit():
            en = MONTHS[int(code) - 1] if 1 <= int(code) <= 12 else None
        elif kind == 'weekday':
            en = DAYS.get(code)
        else:
            en = en_names.get(code)
        if en:
            cldr[od] = (en, kind)
    print(f'CLDR names: {len(cldr)}')

    entries = {}
    for w, en in loans.items():
        entries.setdefault(w, []).append('loan\t' + en)
    for w, (en, kind) in cldr.items():
        entries.setdefault(w, []).append('cldr\t' + en + ' (' + kind + ')')
    for w, name in names.items():
        lines = entries.setdefault(w, [])
        if not any(l.startswith('cldr\t') for l in lines):
            lines.insert(0, 'wd\t' + name)
    print(f'modern entries total: {len(entries)}')

    keys = sorted(entries)
    defs = ['\n'.join(entries[k]) for k in keys]
    payload = (str(len(keys)) + '\x02' + '\n'.join(keys) + '\x02'
               + ','.join(str(len(x)) for x in defs) + '\x02' + ''.join(defs))
    gz = gzip.compress(payload.encode('utf-8'), 9)
    OUT.write_text(base64.b64encode(gz).decode('ascii'), encoding='ascii')
    print(f'wrote {OUT}  raw={len(payload.encode())/1e6:.2f}MB '
          f'b64={OUT.stat().st_size/1e6:.2f}MB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
