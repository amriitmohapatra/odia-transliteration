#!/usr/bin/env python3
"""
Build Appv2/src/dictionary/loans.tsv: English words used in Odia, with the
Odia spelling Odia writers actually use.

Method (V2.12 step B, 2026-10-12):
  1. English words and pronunciations from the CMU Pronouncing Dictionary
     (`cmudict.dict`, BSD-2-Clause; read directly, no wrapper code).
  2. Each pronunciation is turned into candidate Odia spellings by a table
     of ARPAbet sounds -> Odia letters, with alternatives where Odia writers
     vary (long or short vowel, final halant or not, NG as anusvara or as a
     conjunct, D/T as retroflex or dental).
  3. A candidate is kept only when it is ATTESTED: the Odia word occurs at
     least MIN_COUNT times in IndicCorp v2 Odia (CC0). The most frequent
     attested spelling wins. (Not core/data/lexicon.tsv or unigrams.tsv:
     both include counts from the scraped web corpus.)
  4. Native look-alikes are dropped: a word that Praharaj's dictionary marks
     as native, from Sanskrit, or tadbhava (origin codes D, S, T) is not a
     loan, even if it sounds like an English word (KARA is not "car").
  5. Only common English words: those written in lower case in the SCOWL
     word list (permissive licence / public domain), 4 letters or more.
     Praharaj's native filter is strict: any headword not marked English
     or foreign (E, F) counts as native.

No word-frequency list and no web text is used, so the output carries the
licences of its two inputs only (BSD-2 and CC-BY/CC0). Python stdlib only.

Run from the repo root:
  python3 tools/build-data/build_loans.py <cmudict.dict> <american-english-small> <indiccorp-or-counts.tsv>

  <american-english>: a SCOWL word list (Debian package wamerican-small,
  /usr/share/dict/american-english-small: SCOWL size 35, common words). Only its all-lowercase words are used:
  common English words, no names.
"""
import gzip
import itertools
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'Appv2/src/dictionary/loans.tsv'

VIRAMA = '\u0B4D'
ANUSVARA = '\u0B02'

# Consonants: ARPAbet -> alternatives (first is the most common in loans).
CONS = {
    'B': ['\u0B2C'], 'CH': ['\u0B1A'], 'D': ['\u0B21', '\u0B26'], 'DH': ['\u0B26'],
    'F': ['\u0B2B'], 'G': ['\u0B17'], 'HH': ['\u0B39'], 'JH': ['\u0B1C'], 'K': ['\u0B15'],
    'L': ['\u0B32'], 'M': ['\u0B2E'], 'N': ['\u0B28'], 'P': ['\u0B2A'], 'R': ['\u0B30'],
    'S': ['\u0B38', '\u0B37'], 'SH': ['\u0B36'], 'T': ['\u0B1F', '\u0B24'], 'TH': ['\u0B25'],
    'V': ['\u0B2D'], 'W': ['\u0B71', '\u0B13'], 'Y': ['\u0B5F'], 'Z': ['\u0B1C'],
    'ZH': ['\u0B1C'],
}
# Vowels: (independent form, matra) alternatives. '' matra = inherent a.
VOW = {
    'AA': [('\u0B06', '\u0B3E'), ('\u0B05', '')], 'AE': [('\u0B06', '\u0B3E'), ('\u0B0F', '\u0B47'), ('\u0B06', '\u0B4D\u0B5F\u0B3E')],
    'AH': [('\u0B05', ''), ('\u0B06', '\u0B3E'), ('\u0B13', '\u0B4B')], 'AO': [('\u0B05', ''), ('\u0B13', '\u0B4B')],
    'AW': [('\u0B06\u0B09', '\u0B3E\u0B09')], 'AY': [('\u0B06\u0B07', '\u0B3E\u0B07')],
    'EH': [('\u0B0F', '\u0B47')], 'ER': [('\u0B05\u0B30', '\u0B30')],
    'EY': [('\u0B0F', '\u0B47')], 'IH': [('\u0B07', '\u0B3F'), ('\u0B08', '\u0B40'), ('\u0B0F', '\u0B47')],
    'IY': [('\u0B07', '\u0B3F'), ('\u0B08', '\u0B40')], 'OW': [('\u0B13', '\u0B4B')],
    'OY': [('\u0B05\u0B0F', '\u0B07')], 'UH': [('\u0B09', '\u0B41')],
    'UW': [('\u0B09', '\u0B41'), ('\u0B0A', '\u0B42')],
}
MAX_VARIANTS = 4096


def spellings(phones, word=''):
    """All candidate Odia spellings for one ARPAbet pronunciation."""
    phones = [re.sub(r'\d', '', p) for p in phones]
    if word.endswith('ile') and phones[-2:] == ['AH', 'L']:
        phones = phones[:-2] + ['AY', 'L']  # Indian English: mobile = mobaail
    # ER is a vowel + r; NG is a nasal that may be anusvara or N+G.
    slots = []  # list of lists of alternative strings, built per phone
    prev_cons = False
    for i, p in enumerate(phones):
        nxt_vowel = i + 1 < len(phones) and phones[i + 1] in VOW
        if p in VOW:
            opts = VOW[p]
            if p == 'ER' and i + 1 < len(phones) and phones[i + 1] not in VOW:
                opts = [('\u0B05\u0B30\u0B4D', '\u0B30\u0B4D')]  # r before a consonant: R-halant (BIRTHDAY)
            if prev_cons:
                slots.append([m for _, m in opts])
            else:
                slots.append([ind for ind, _ in opts])
            prev_cons = p == 'ER'  # ER ends in r: a following vowel attaches to it
            continue
        if p == 'NG':
            last = i == len(phones) - 1
            alts = [ANUSVARA, '\u0B19\u0B4D\u0B17'] if last else ['\u0B19\u0B4D\u0B17'] if nxt_vowel else [ANUSVARA, '\u0B19\u0B4D']
            slots.append(alts)
            prev_cons = False
            continue
        cons = CONS.get(p)
        if not cons:
            return []
        if nxt_vowel:
            slots.append(cons)
        else:
            # Consonant before another consonant or at the end: halant, or
            # (at the end) the bare letter, which Odia readers say without a vowel.
            # Mid-word, Odia writers often leave the consonant bare instead of
            # joining it (BIRTHDAY = BA-R-THA-DE, not a TH-D conjunct).
            slots.append([c + VIRAMA for c in cons] + cons)
        prev_cons = True
    total = 1
    for s in slots:
        total *= len(s)
        if total > MAX_VARIANTS:
            return []
    return {unicodedata.normalize('NFC', ''.join(c)) for c in itertools.product(*slots)}


MIN_COUNT = 20  # occurrences in IndicCorp before a spelling counts as attested


def load_counts(path):
    """Odia word counts from IndicCorp v2 (CC0), from count_indiccorp.py."""
    count = {}
    for line in Path(path).read_text(encoding='utf8').splitlines():
        if not line or line.startswith('#'):
            continue
        word, n = line.split('\t')
        if int(n) >= MIN_COUNT:
            count[word] = int(n)
    return count


ORIGIN_LANG = {'P': 'fa', 'A': 'ar', 'H': 'hi', 'K': 'tr', 'G': 'pt', 'E': 'en'}
MIN_COUNT_PRAHARAJ = 500  # a Praharaj loan must still be common in modern text
FIRST_SENSE = re.compile(r'\u2014\s*1\.\s*([^\u0B00-\u0B7F\[\]0-9]+)')


def praharaj_loans(count):
    """Praharaj headwords marked Persian, Arabic, Hindi, Turkish or Portuguese,
    common in IndicCorp, with the English words of their first sense."""
    raw = gzip.decompress((ROOT / 'Appv2/src/dictionary/praharaj.bin').read_bytes()).decode('utf8')
    _, keys, lens, defs = raw.split('\x02')
    keys = keys.split('\n')
    origin = gzip.decompress((ROOT / 'Appv2/src/dictionary/origin.bin').read_bytes()).decode('utf8').split('\n')[1:]
    rows = []
    off = 0
    for key, n, code in zip(keys, (int(x) for x in lens.split(',')), origin):
        text = defs[off:off + n]
        off += n
        langs = [ORIGIN_LANG[c] for c in re.findall(r'[PAHKG]', code)]
        if not langs or count.get(key, 0) < MIN_COUNT_PRAHARAJ:
            continue
        m = FIRST_SENSE.search(text)
        if not m:
            continue
        # Single-word senses only: phrases ("act of restraining") do not match a search.
        for sense in m.group(1).split(';')[:2]:
            sense = re.sub(r'^(the|a|an|to) ', '', sense.strip().rstrip('.').strip().lower())
            if re.fullmatch(r"[a-z]{3,20}", sense):
                rows.append((sense, key, langs[0], 'praharaj', count[key]))
    return rows


def load_native():
    """Praharaj headwords not marked English or foreign (E, F). A 1930s
    dictionary word without that mark is native, Sanskrit or older Odia."""
    raw = gzip.decompress((ROOT / 'Appv2/src/dictionary/praharaj.bin').read_bytes()).decode('utf8')
    keys = raw.split('\x02')[1].split('\n')
    origin = gzip.decompress((ROOT / 'Appv2/src/dictionary/origin.bin').read_bytes()).decode('utf8').split('\n')
    codes = origin[1:1 + len(keys)]
    native = set()
    for key, code in zip(keys, codes):
        if 'E' not in code and 'F' not in code:
            native.add(key)
    return native


def bare(odia):
    """The word without a final halant: PHONA-halant and PHONA are one word."""
    return odia[:-1] if odia.endswith(VIRAMA) else odia


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    weight = load_counts(sys.argv[3])
    native = {bare(w) for w in load_native()}
    common = {w for w in Path(sys.argv[2]).read_text(encoding='utf8').splitlines() if re.fullmatch(r'[a-z]+', w)}
    best = {}
    for line in Path(sys.argv[1]).read_text(encoding='latin-1').splitlines():
        if not line or line.startswith(';;;'):
            continue
        head, *phones = line.split()
        word = re.sub(r'\(\d+\)$', '', head)
        # Past tenses are not borrowed as such; they mostly match by chance.
        if not re.fullmatch(r"[a-z]{4,}", word) or word not in common or word.endswith('ed'):
            continue
        for odia in spellings(phones, word):
            w = weight.get(odia)
            if w is None or bare(odia) in native:
                continue
            # Short words collide with native words by chance (wrung = RANG,
            # "colour"). A short loan is written the English way: a final
            # halant or a conjunct (PHONA-halant, GETA-halant, LISTA).
            if len(phones) <= 3 and not (odia.endswith(VIRAMA) or VIRAMA in odia[:-1]):
                continue
            if word not in best or w > best[word][1]:
                best[word] = (odia, w)
    rows = sorted([(e, o, 'en', 'cmudict', w) for e, (o, w) in best.items()] + praharaj_loans(weight))
    header = (
        '# loans.tsv: English words used in Odia, with the attested Odia spelling.\n'
        '# Generated by tools/build-data/build_loans.py; do not edit by hand (edit english.tsv).\n'
        '# Sources: CMU Pronouncing Dictionary (BSD-2-Clause) for English words and sounds;\n'
        '# SCOWL size-35 word list (permissive / public domain) for common English words;\n'
        '# IndicCorp v2 Odia (CC0) word counts for attestation; Praharaj origin marks\n'
        '# (public domain) to drop native look-alikes. Licence of this file: MIT.\n'
        '# Found automatically: not reviewed by a native speaker.\n'
        '# Persian, Arabic, Hindi, Turkish and Portuguese loans: Praharaj headwords with that\n'
        '# origin mark and >= 500 IndicCorp occurrences, keyed by the single-word English\n'
        '# meanings of the first sense (public domain; the 1930s sense).\n'
        '# english<TAB>odia<TAB>language (en fa ar hi tr pt)<TAB>source<TAB>indiccorp_count\n'
    )
    OUT.write_text(header + ''.join('\t'.join(map(str, r)) + '\n' for r in rows), encoding='utf8')
    print(f'{len(rows)} loans ({len(best)} English) -> {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
