/**
 * The locale registry lives in lib/locale-registry.ts (dependency-free, so both
 * lib/direction.ts and public/dir-init.js can rely on it without pulling in a
 * graph). This module stays the import site for everything else.
 */

import { AVAILABLE_LANGUAGES } from './locale-registry'

export { AVAILABLE_LANGUAGES }
export type { Language } from './locale-registry'

export const getLanguageByCode = (code: string) => {
  return AVAILABLE_LANGUAGES.find(lang => lang.code === code)
}

export const getCurrentLanguageNativeName = (currentLang: string): string => {
  const language = getLanguageByCode(currentLang)
  return language?.nativeName || 'English'
}