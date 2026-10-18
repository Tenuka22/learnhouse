/**
 * Locale-prefixed routing: the single source of truth.
 *
 * Every user-facing page lives under `app/[locale]/...`, so the URL carries the
 * language (`/si/home`, `/en/orgs/acme/courses`). Two surfaces deliberately do
 * NOT take a prefix and keep their URLs byte-stable forever:
 *
 *   - `/api/*`  the backend proxy. Prefixing it would break every client fetch,
 *               the SCORM package route and the external webhook callers.
 *   - `/embed/*` these URLs are pasted into third-party LMS iframes and shared
 *               as activity links (see ActivityShareDropdown). Rewriting them
 *               would break every existing embed. They read the user's language
 *               from the i18next cookie instead, which is what an embed visitor
 *               already has.
 *
 * Everything that rewrites a URL must go through `localizePath` / `switchLocalePath`
 * rather than concatenating strings, so those exceptions stay honoured in one place.
 *
 * A THIRD category also stays unprefixed, for a different reason: the
 * server-component `redirect('/account/general')` family. Those targets are
 * deliberately browser-relative — the external tenancy ingress (which lives
 * outside this repo) expands them to `/orgs/{slug}/...` and rewrites `/login`
 * to `/auth/login`. Prefixing one would hand the ingress a path shape it does
 * not recognise, so those call sites keep emitting the unprefixed form and
 * middleware adds the locale only after the ingress has done its expansion.
 * Don't "fix" them to use `localizePath`.
 */

import { AVAILABLE_LANGUAGES } from './locale-registry'
import { baseCode } from './direction'

export type Locale = string

export const DEFAULT_LOCALE = 'en'

/** Prefixes that must never be locale-prefixed. See the note above. */
export const UNLOCALIZED_PREFIXES = ['/api', '/embed'] as const

const SUPPORTED = new Set<string>(AVAILABLE_LANGUAGES.map((l) => l.code))

export const SUPPORTED_LOCALES: string[] = Array.from(SUPPORTED)

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED.has(baseCode(value))
}

/**
 * `si-LK` -> `si`, unknown/absent -> null. Callers decide the fallback; this
 * never silently substitutes English so a bad prefix 404s instead of rendering
 * the wrong language.
 */
export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null
  // baseCode maps falsy input to 'en', so an empty/whitespace segment would
  // otherwise pass as a valid English prefix instead of being rejected.
  const trimmed = value.trim()
  if (!trimmed) return null
  const code = baseCode(trimmed)
  return SUPPORTED.has(code) ? code : null
}

/** First path segment of an already-prefixed pathname, if it is a locale. */
export function getPathLocale(pathname: string): Locale | null {
  const segment = pathname.split('/')[1]
  if (!segment) return null
  return normalizeLocale(segment)
}

/** `/si/home` -> `/home`; `/si` -> `/`. */
export function stripLocale(pathname: string): string {
  const locale = getPathLocale(pathname)
  if (!locale) return pathname
  const rest = pathname.slice(locale.length + 1)
  return rest === '' || rest === '/' ? '/' : rest
}

/**
 * True when the URL points at a surface that keeps its original shape.
 * Matches on the segment boundary so `/apixyz` is not treated as `/api`.
 */
export function isUnlocalizedPath(pathname: string): boolean {
  return UNLOCALIZED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/** Protocol-relative, absolute and non-navigational URLs are returned as-is. */
function isExternalOrSpecial(href: string): boolean {
  return (
    href.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(href) || // http:, mailto:, tel:, data:, ...
    href.startsWith('#')
  )
}

/**
 * Prefix an app-absolute pathname with a locale, idempotently.
 *
 * `localizePath('/home', 'si')` -> `/si/home`
 * `localizePath('/si/home', 'si')` -> `/si/home`  (already prefixed)
 * `localizePath('/embed/x/course/y', 'si')` -> unchanged (see UNLOCALIZED_PREFIXES)
 * `localizePath('https://learnhouse.app/x', 'si')` -> unchanged
 *
 * Hash and query suffixes are preserved. A bare `?a=b` or `#top` is a
 * same-page reference and deliberately left alone.
 */
export function localizePath(pathname: string, locale: Locale): string {
  if (!pathname) return pathname
  if (!isSupportedLocale(locale)) return pathname
  if (isExternalOrSpecial(pathname)) return pathname
  if (isUnlocalizedPath(pathname)) return pathname
  if (getPathLocale(pathname) === locale) return pathname

  const [path, suffix] = splitSuffix(pathname)

  // Already prefixed with a *different* locale: swap it rather than stacking.
  if (getPathLocale(path)) {
    return `/${locale}${stripLocale(path)}${suffix}`
  }

  const normalized = path === '/' ? '' : path.endsWith('/') ? path.slice(0, -1) : path
  return `/${locale}${normalized}${suffix}`
}

/**
 * Re-point an already-localized URL at another locale, preserving the page.
 *
 * `switchLocalePath('/si/orgs/acme', 'fr')` -> `/fr/orgs/acme`
 * `switchLocalePath('/embed/acme/course/x', 'fr')` -> unchanged
 */
export function swapLocalePath(pathname: string, locale: Locale): string {
  if (!isSupportedLocale(locale)) return pathname
  if (isExternalOrSpecial(pathname)) return pathname
  if (isUnlocalizedPath(pathname)) return pathname

  const [path, suffix] = splitSuffix(pathname)
  const rest = getPathLocale(path) ? stripLocale(path) : path
  const normalized = rest === '/' ? '' : rest.endsWith('/') ? rest.slice(0, -1) : rest
  return `/${locale}${normalized}${suffix}`
}

/** Split a pathname from its `?query#hash` tail, which must survive rewriting. */
function splitSuffix(href: string): [string, string] {
  const cut = href.search(/[?#]/)
  return cut === -1 ? [href, ''] : [href.slice(0, cut), href.slice(cut)]
}

/**
 * Choose a locale for a request that has no locale prefix yet.
 *
 * Mirrors the client-side detection order in lib/direction.ts as far as the
 * server can see it: the `i18next` cookie, then `?lng=`, then `Accept-Language`
 * (whose ordering by q-value means the first acceptable match wins).
 * `localStorage` is the client's top priority but is invisible server-side,
 * which is why the URL prefix — not this function — is the real source of truth
 * once the visitor has one.
 */
export function pickLocaleFromHints(
  cookie: string | null | undefined,
  queryLng: string | null | undefined,
  acceptLanguage: string | null | undefined
): Locale {
  const fromCookie = normalizeLocale(cookie)
  if (fromCookie) return fromCookie

  const fromQuery = normalizeLocale(queryLng)
  if (fromQuery) return fromQuery

  for (const entry of (acceptLanguage || '').split(',')) {
    const match = normalizeLocale(entry.split(';')[0]?.trim())
    if (match) return match
  }

  return DEFAULT_LOCALE
}