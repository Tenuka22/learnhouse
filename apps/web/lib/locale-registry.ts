/**
 * The locale registry: the single list of languages the product ships.
 *
 * Deliberately dependency-free (no imports at all). Two files that cannot
 * afford a dependency graph still need this list:
 *
 *   - `lib/direction.ts` must stay import-free because `app/global-error.tsx`
 *     renders outside every provider.
 *   - `public/dir-init.js` runs before any bundle loads and carries a plain
 *     JS copy that tests/locale-routing.test.mjs asserts against this file.
 *
 * `lib/languages.ts` re-exports everything here, so existing imports keep
 * working; nothing should need to reach past it except those two files.
 */

import type { Direction } from './direction'

export interface Language {
  code: string
  translationKey: string
  nativeName: string
  /** Text direction of the language. Behaviour lives in lib/direction.ts. */
  dir: Direction
}

export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'en', translationKey: 'common.english', nativeName: 'English', dir: 'ltr' },
  { code: 'si', translationKey: 'common.sinhala', nativeName: 'සිංහල', dir: 'ltr' },
  { code: 'ta', translationKey: 'common.tamil', nativeName: 'தமிழ்', dir: 'ltr' },
]