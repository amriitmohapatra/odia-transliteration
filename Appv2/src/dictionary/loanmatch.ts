/**
 * Does an Odia spelling sound like an English word? A coarse check for the
 * auto-detected loan rows: both sides are reduced to a skeleton of consonant
 * classes (vowels, nasals, h and y dropped) and must match exactly. It keeps
 * video = BHIDIO and drops BIDI ("cigarette"); keeps water = WATARA and drops
 * BOUTARA. A heuristic, not a pronunciation model: the clean loan list
 * (V2 step B) replaces it.
 */
const ODIA_CLASS: Readonly<Record<string, string>> = {
  '\u0B15': 'K', '\u0B16': 'K', '\u0B17': 'G', '\u0B18': 'G',
  '\u0B1A': 'C', '\u0B1B': 'C', '\u0B1C': 'J', '\u0B1D': 'J', '\u0B2F': 'J',
  '\u0B1F': 'T', '\u0B20': 'T', '\u0B24': 'T', '\u0B25': 'T',
  '\u0B21': 'D', '\u0B22': 'D', '\u0B26': 'D', '\u0B27': 'D',
  '\u0B2A': 'P', '\u0B2B': 'F', '\u0B2C': 'B', '\u0B2D': 'V', '\u0B71': 'V',
  '\u0B2E': 'M', '\u0B30': 'R', '\u0B32': 'L', '\u0B33': 'L',
  '\u0B36': 'S', '\u0B37': 'S', '\u0B38': 'S',
};

export function odiaSkeleton(odia: string): string {
  let out = '';
  for (const ch of odia) {
    const c = ODIA_CLASS[ch];
    if (c && !out.endsWith(c)) out += c;
  }
  return out;
}

export function englishSkeleton(english: string): string {
  const s = english.toLowerCase().replace(/[^a-z]/g, '')
    .replace(/ng(?![aeiou])/g, '')
    .replace(/tch|ch/g, 'C').replace(/sh/g, 'S').replace(/th/g, 'T').replace(/ph/g, 'F')
    .replace(/ck/g, 'K').replace(/gh/g, '').replace(/qu/g, 'KV').replace(/x/g, 'KS')
    .replace(/c(?=[eiy])/g, 'S').replace(/[cqk]/g, 'K').replace(/[zj]/g, 'J')
    .replace(/[vw]/g, 'V').replace(/f/g, 'F').replace(/[aeiouyhn]/g, '')
    .toUpperCase();
  return s.replace(/(.)\1+/g, '$1');
}

export function soundsLike(english: string, odia: string): boolean {
  const e = englishSkeleton(english);
  return e.length > 0 && e === odiaSkeleton(odia);
}

/** Edit distance between two short strings. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length]!;
}

const plain = (s: string) => s.toLowerCase().replace(/bh|w/g, 'v').replace(/ph/g, 'f').replace(/aa/g, 'a')
  .replace(/[^a-z]/g, '');

/**
 * The spelling closest to the English word, of those that sound like it.
 * `read` turns Odia into English letters (the app's read-back).
 */
export function closestLoan(english: string, odia: readonly string[], read: (w: string) => string): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  for (const word of odia) {
    if (!soundsLike(english, word)) continue;
    const score = distance(plain(read(word)), plain(english));
    if (score < bestScore) { best = word; bestScore = score; }
  }
  return best;
}
