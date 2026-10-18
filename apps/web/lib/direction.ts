/**
 * Text direction: the single source of truth.
 *
 * Nearly dependency-free: `app/global-error.tsx` renders outside every provider
 * (no i18n, no router) and still needs to import from here, so this module may
 * only reach for lib/locale-registry.ts, which is itself free of imports. The
 * registry import is a runtime cycle in appearance only — locale-registry's own
 * reference to `Direction` is `import type`, so it is erased before the module
 * graph is built.
 *
 * The RTL language set is duplicated in `public/dir-init.js`, which runs before
 * any bundle loads and therefore cannot import this module. `tests/rtl-guard`
 * asserts the two stay in sync.
 */

import { AVAILABLE_LANGUAGES } from './locale-registry'

export type Direction = 'ltr' | 'rtl'

/**
 * Superset of the locales we translate to. A browser can report `he` or `ur`
 * even though we don't ship those bundles yet; direction should still be
 * right, with the UI falling back to English text.
 */
export const RTL_LANGUAGES = new Set([
  'ar', // Arabic
  'fa', // Persian
  'he', // Hebrew
  'iw', // Hebrew (legacy code, still emitted by some browsers)
  'ur', // Urdu
  'ps', // Pashto
  'sd', // Sindhi
  'ug', // Uyghur
  'yi', // Yiddish
  'dv', // Dhivehi
  'ckb', // Central Kurdish
])

/** `en-GB` -> `en`. Mirrors the `.split('-')[0]` used throughout lib/i18n.ts. */
export function baseCode(lng?: string | null): string {
  return String(lng || 'en').split('-')[0].toLowerCase()
}

export function directionForLanguage(lng?: string | null): Direction {
  return RTL_LANGUAGES.has(baseCode(lng)) ? 'rtl' : 'ltr'
}

/** +1 in LTR, -1 in RTL. Multiply any physical x-offset by this. */
export function dirMultiplier(dir: Direction): 1 | -1 {
  return dir === 'rtl' ? -1 : 1
}

const SUPPORTED_LOCALE_CODES = new Set(
  AVAILABLE_LANGUAGES.map((language) => language.code)
)

/**
 * The locale segment of a locale-prefixed pathname, or '' when there isn't one.
 *
 * Lives here rather than in lib/locale.ts because this module has to stay
 * dependency-free (see the note at the top) and public/dir-init.js needs the
 * same answer before any bundle loads. `/api` and `/embed` keep their original
 * URLs by contract, so their first segment is never a locale.
 */
export function detectPathLocale(pathname: string): string {
  const first = String(pathname || '').split('/')[1]
  if (!first || first === 'api' || first === 'embed') return ''
  return SUPPORTED_LOCALE_CODES.has(first) ? first : ''
}

/**
 * Detect the language the same way i18next's LanguageDetector does, in the same
 * order (see `detection.order` in lib/i18n.ts). Client-only; returns 'en' on
 * the server.
 *
 * Kept byte-for-byte equivalent to the detector in public/dir-init.js.
 */
export function detectClientLanguage(): string {
  if (typeof window === 'undefined') return 'en'

  // The URL prefix wins: it is the one signal that travels with a shared link
  // or a bookmark, so honour it ahead of this browser's stored preference.
  const fromPath = detectPathLocale(window.location.pathname)
  if (fromPath) return fromPath

  try {
    const stored = window.localStorage.getItem('i18nextLng')
    if (stored) return stored
  } catch {
    /* localStorage can throw in private mode / sandboxed iframes */
  }

  const cookie = document.cookie.match(/(?:^|;\s*)i18next=([^;]*)/)
  if (cookie) {
    try {
      return decodeURIComponent(cookie[1])
    } catch {
      /* malformed cookie value */
    }
  }

  try {
    const qs = new URLSearchParams(window.location.search).get('lng')
    if (qs) return qs
  } catch {
    /* malformed query string */
  }

  return navigator.languages?.[0] || navigator.language || 'en'
}

/**
 * Write `lang`/`dir` onto <html>. Idempotent.
 *
 * `--dir` is exposed as a CSS custom property so stylesheets can consume a
 * direction multiplier without reaching for JS.
 */
export function applyDocumentDirection(lng: string): Direction {
  const code = baseCode(lng)
  const dir = directionForLanguage(code)

  if (typeof document === 'undefined') return dir

  const el = document.documentElement
  el.setAttribute('lang', code)
  el.setAttribute('dir', dir)
  el.style.setProperty('--dir', dir === 'rtl' ? '-1' : '1')

  return dir
}
