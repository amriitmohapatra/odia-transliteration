/**
 * Praharaj's romanized headwords (the indic-dict Babylon text) still carry 16
 * custom entity codes, about 1,600 in all, plus one "$nbsp;" typo. Shown raw
 * they read as "Aksh&aline;&uline;hiṇī". Each code is mapped to the letter the
 * same dictionary writes elsewhere (Uṟḍ̠, Kapāḻī, Uttarākāṇḍa...). Applied at
 * display time, so the shipped payload and its checksums stay unchanged.
 */
const ENTITY: Readonly<Record<string, string>> = {
  '&aline;': 'a\u0331', // a̱ (the first letter of the "ai" diphthong)
  '&Aline;': 'A\u0331',
  '&Alinei;': 'A\u0331i',
  '&uline;': 'u\u0331', // u̱ (the second letter of the "au" diphthong)
  '&rline;': '\u1E5F', // ṟ
  '&lline;': '\u1E3B', // ḻ
  '&hline;': '\u1E96', // ẖ (Laṟḍ̠ẖāi)
  '&ntod;': '\u1E47', // ṇ
  '&ttod;': '\u1E6D', // ṭ
  '&dtodline;': '\u1E0D\u0320', // ḍ̠
  '&Sdot;': '\u1E60', // Ṡ (the dictionary's letter for SHA)
  '&mdot;': '\u1E41', // ṁ
  '&nmacr;': '\u00F1', // ñ (Jñānendriya)
  '&Nmacr;': 'N', // typo in "Name"
  '&bmacr;': 'b', // typo in "barber"
  '$nbsp;': ' ',
};
const PATTERN = new RegExp(Object.keys(ENTITY).map((k) => k.replace(/\$/g, '\\$')).join('|'), 'g');

export function cleanDefinition(text: string): string {
  return text.includes('&') || text.includes('$') ? text.replace(PATTERN, (m) => ENTITY[m] ?? m) : text;
}
