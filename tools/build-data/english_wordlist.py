#!/usr/bin/env python3
"""The English words to translate for english-api.tsv (V2.21), most frequent first.

wordfreq's top English words (letters and inner hyphens only), then the hand-written
multiword list tools/build-data/english-phrases.txt (phrasal verbs, compounds,
Indian English). Words already answered by the curated english.tsv or the
hand-written english-ai.tsv are left out. The list is a build input only and is not
committed (wordfreq's data licence is unverified, as in CLAUDE.md); this script makes it
again, the same each time for a pinned wordfreq.

Usage (from the repository root):
  uv run --with wordfreq==3.1.1 python tools/build-data/english_wordlist.py OUT [N]
N defaults to 50000 single words.
"""
import re
import sys
from pathlib import Path

import wordfreq

ROOT = Path(__file__).resolve().parents[2]
out = Path(sys.argv[1])
n = int(sys.argv[2]) if len(sys.argv) > 2 else 50000


def headwords(path: Path) -> set[str]:
    words = set()
    for line in path.read_text(encoding='utf-8').splitlines():
        if line and not line.startswith('#'):
            cells = line.split('\t')
            words.add(cells[0])
            if path.name == 'english.tsv' and len(cells) > 4 and cells[4]:
                words.update(cells[4].split('|'))
    return words


done = headwords(ROOT / 'Appv2/src/dictionary/english.tsv') | headwords(ROOT / 'Appv2/src/dictionary/english-ai.tsv')
singles = [w for w in wordfreq.top_n_list('en', 3 * n) if re.fullmatch(r'[a-z][a-z-]*[a-z]', w)][:n]
phrases = [l.strip().lower() for l in (ROOT / 'tools/build-data/english-phrases.txt').read_text(encoding='utf-8').splitlines()
           if l.strip() and not l.startswith('#')]
seen: set[str] = set()
words = []
for w in singles + phrases:
    if w not in seen and w not in done:
        seen.add(w)
        words.append(w)
out.write_text('\n'.join(words) + '\n', encoding='utf-8')
print(f'{len(words)} words ({len(singles)} single words considered, {len(phrases)} phrases; {len(done)} already answered)')
