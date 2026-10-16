/**
 * Entry for tools/eval/card-audit.mjs (bundled there with esbuild, because the lens
 * engine imports .tsv files). Every Odia word of the input through the Odia Lens's own
 * lookup (lens/src/engine.ts lookup, with the previous word), aggregated per word.
 */
import { readFileSync } from 'node:fs';

import { canonical } from '@odia/core/normalize';
import { lookup, setLoader } from '../../lens/src/engine.js';

export interface AuditRow {
  word: string;
  count: number;
  /** The previous word at the first occurrence (constructions such as "-ku nei" depend on it). */
  previous: string;
  meaning: string;
  source: string;
  formation: string;
  /** ok | parts | shorter | approximate | praharaj | none: how far the card can be trusted without a check. */
  flag: string;
  /** The word is in the typing app's word list (lexicon-web.tsv or typed.tsv). */
  typeable: boolean;
  contexts: string[];
}

const ODIA_RUN = /[\u0b00-\u0b7f\u200c\u200d]+/g;

/** Plain text, or JSON lines with "title" and "paragraphs" (web articles) or "lines" (ePaper OCR). */
export function textsOf(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('{')) {
      try {
        const o = JSON.parse(t) as { title?: string; paragraphs?: string[]; lines?: string[] };
        out.push(...[o.title ?? '', ...(o.paragraphs ?? []), ...(o.lines ?? [])].filter(Boolean));
        continue;
      } catch {
        /* not JSON: plain text */
      }
    }
    out.push(t);
  }
  return out;
}

export function flagOf(source: string, meaning: string): string {
  if (!source) return 'none';
  if (source === 'guessed from its parts') return 'parts';
  if (source === 'meaning of the shorter word') return 'shorter';
  if (meaning.startsWith('maybe: ')) return 'approximate';
  if (source.startsWith('Praharaj')) return 'praharaj';
  return 'ok';
}

export async function audit(raw: string, root: string, contexts = 2): Promise<AuditRow[]> {
  setLoader(async (p) => new Uint8Array(readFileSync(`${root}/lens/dist/${p}`)));
  const typeable = new Set<string>();
  for (const f of ['core/data/lexicon-web.tsv', 'core/data/typed.tsv']) {
    for (const line of readFileSync(`${root}/${f}`, 'utf8').split('\n')) {
      if (line && !line.startsWith('#')) typeable.add(canonical(line.split('\t')[1] ?? ''));
    }
  }
  const rows = new Map<string, AuditRow>();
  for (const text of textsOf(raw)) {
    const t = canonical(text);
    let previous = '';
    for (const m of t.matchAll(ODIA_RUN)) {
      const w = m[0];
      if (!/[\u0b05-\u0b39]/.test(w)) {
        previous = '';
        continue;
      }
      let row = rows.get(w);
      if (!row) {
        const card = await lookup(w, previous);
        const first = card?.meanings[0];
        row = {
          word: w,
          count: 0,
          previous,
          meaning: first?.text ?? '',
          source: first?.source ?? '',
          formation: card?.formation ?? '',
          flag: flagOf(first?.source ?? '', first?.text ?? ''),
          typeable: typeable.has(w),
          contexts: [],
        };
        rows.set(w, row);
      }
      row.count += 1;
      if (row.contexts.length < contexts) {
        const a = Math.max(0, (m.index ?? 0) - 45);
        row.contexts.push(t.slice(a, (m.index ?? 0) + w.length + 45).replace(/\s+/g, ' '));
      }
      previous = w;
    }
  }
  return [...rows.values()].sort((x, y) => y.count - x.count);
}
