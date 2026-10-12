/**
 * The three modes, as data.
 *
 * This file is the only one that changes to reshape the mode design, which is
 * the point: rules and lexicons are separate fields, so the rule set and the
 * vocabulary are independently swappable and the matrix is 3 x 3. We ship three
 * cells of it.
 *
 *   everyday   exactly today's app, byte for byte. Exists as the control arm
 *              for Appv2/eval/no-regression.ts and as an escape hatch if the
 *              Sanskrit work ever misbehaves.
 *   unified    the default. Everyday Odia first, Sanskrit one or two slots
 *              down but always present.
 *   sloka      for typing verse. Word-final ଂ beats ମ, ଳ beats ଲ, the vocalics
 *              are reachable, and the frequency term is raised because Sanskrit
 *              spelling is lexically determined.
 *
 * Assets are named, not imported, so this file stays free of Vite globs and can
 * be read by the eval harnesses under tsx as well as by the browser bundle.
 */

import {
  PREPROCESS_ALL,
  PREPROCESS_DANDA_ONLY,
  type PreprocessOptions,
} from './preprocess.js';

export type ProfileId = 'everyday' | 'unified' | 'sloka';

export type AssetKey =
  | 'coreRules'
  | 'unifiedRules'
  | 'sanskritRules'
  | 'itrans'
  | 'coreLexicon'
  | 'sanskritLexicon'
  | 'coreUnigrams'
  | 'sanskritUnigrams'
  // Word pairs for context ranking (core/data/bigrams-web.tsv), shared by every
  // profile. Used by engine.transliterate(sentence); single words are unaffected.
  | 'coreBigrams'
  // Typed-spelling pairs (core/data/typed.tsv, Desh keyboard users), shared by
  // every profile: what people typed for a key and the word they chose.
  | 'typed'
  // Next-word predictions (core/data/nextword.tsv, Desh keyboard users' n-grams).
  | 'nextWords'
  // Owner-curated, shared by every profile: core/data/preferences.tsv, labels.tsv.
  | 'preferences'
  | 'labels';

export interface LexiconRef {
  asset: AssetKey;
  /** Multiplicative. See the note on `LexiconSource.priority` in compose.ts. */
  priority: number;
}

export interface Profile {
  id: ProfileId;
  /** Shown on the toggle. */
  label: string;
  /** One line under the toggle, explaining when to reach for it. */
  hint: string;
  rules: AssetKey;
  /** Ordered; the first is the one whose spellings should usually lead. */
  lexicons: LexiconRef[];
  unigrams: AssetKey[];
  preprocess: PreprocessOptions;
}

export const PROFILES: Record<ProfileId, Profile> = {
  everyday: {
    id: 'everyday',
    label: 'Everyday',
    hint: 'The original engine, unchanged. Odia prose.',
    rules: 'coreRules',
    lexicons: [{ asset: 'coreLexicon', priority: 1 }],
    unigrams: ['coreUnigrams'],
    // Danda only. The avagraha and visarga shortcuts would be surprising in a
    // profile whose promise is "nothing has changed".
    preprocess: PREPROCESS_DANDA_ONLY,
  },

  unified: {
    id: 'unified',
    label: 'Odia + Sanskrit',
    hint: 'Everyday Odia first, Sanskrit forms a slot or two down.',
    rules: 'unifiedRules',
    lexicons: [
      { asset: 'coreLexicon', priority: 1 },
      // Below core, so a word that is both ordinary Odia and Sanskrit keeps its
      // everyday spelling at rank 1.
      { asset: 'sanskritLexicon', priority: 0.85 },
    ],
    unigrams: ['coreUnigrams', 'sanskritUnigrams'],
    preprocess: PREPROCESS_ALL,
  },

  sloka: {
    id: 'sloka',
    label: 'Śloka',
    hint: 'For verse. Word-final ଂ, ଳ over ଲ, the Sanskrit vocalics.',
    rules: 'sanskritRules',
    lexicons: [
      { asset: 'sanskritLexicon', priority: 1 },
      // Core stays loaded rather than being swapped out: a śloka is embedded in
      // Odia prose more often than not, and losing ordinary vocabulary mid-line
      // would be worse than ranking it second.
      { asset: 'coreLexicon', priority: 0.75 },
    ],
    unigrams: ['sanskritUnigrams', 'coreUnigrams'],
    preprocess: PREPROCESS_ALL,
  },
};

export const PROFILE_ORDER: readonly ProfileId[] = ['everyday', 'unified', 'sloka'];

export const DEFAULT_PROFILE: ProfileId = 'unified';

/** localStorage key, alongside the existing odia.pref.digits / odia.pref.strict. */
export const PROFILE_PREF_KEY = 'odia.pref.profile';

export function isProfileId(value: unknown): value is ProfileId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROFILES, value);
}
