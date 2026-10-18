'use client'

import { createContext, useCallback, useContext } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import i18n, { changeLanguage } from '@/lib/i18n'
import {
  DEFAULT_LOCALE,
  localizePath,
  normalizeLocale,
  swapLocalePath,
} from '@/lib/locale'

/**
 * Makes the URL's locale available to every client component below it.
 *
 * Mounted by `app/[locale]/layout.tsx`, which is a server component and can
 * read `params.locale`. A context (rather than a `useParams()` call at each
 * site) is what lets `LocaleLink` produce a correctly-prefixed href during
 * server rendering, so crawlers and no-JS clients see real URLs rather than
 * language-less ones that only get fixed after hydration.
 *
 * Components rendered outside a localized layout — the embed surface, the
 * global error page — get `null` and fall back to the active i18next language.
 */
const LocaleContext = createContext<string | null>(null)

export function LocaleProvider({
  locale,
  children,
}: {
  locale: string
  children: React.ReactNode
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** The URL locale, or '' when rendered outside a localized layout. */
export function useRouteLocale(): string {
  return useContext(LocaleContext) ?? ''
}

/**
 * The locale to prefix links with: the URL's language when there is one,
 * otherwise whatever the app is currently rendering in.
 */
export function useLocale(): string {
  const route = useRouteLocale()
  if (route) return route
  return normalizeLocale(i18n.language) ?? DEFAULT_LOCALE
}

/**
 * Turns an app path into a localized one, for imperative navigation:
 * `router.push(lp('/orgs/acme'))`.
 *
 * Imperative navigation can't go through <LocaleLink>, and these strings are
 * just as easy to get wrong: an unprefixed push does work (middleware redirects
 * it), but it costs a round trip and a 307, so the page flashes and the back
 * button fills up with the redirect.
 */
export function useLocalizedPath(): (href: string) => string {
  const locale = useLocale()
  return useCallback((href: string) => localizePath(href, locale), [locale])
}

/**
 * Marks the visitor as having chosen a language themselves.
 *
 * Without this, OrgLanguageSync treats the choice as incidental and re-applies
 * the org's default_language on the next navigation — so picking Sinhala on one
 * page silently reverted to English on the next, and the URL was rewritten back
 * to /en/... to match. Idempotent, and a no-op in private mode.
 */
const USER_PICKED_KEY = 'i18nextLng_userPicked'

export function markLanguagePicked() {
  try {
    localStorage.setItem(USER_PICKED_KEY, '1')
  } catch {
    /* private mode / sandboxed iframe */
  }
}

/**
 * The whole "user picked a language" action, in the one place it happens:
 * record the choice, switch the language, and re-point the URL.
 *
 * There are five language menus in the product. They previously each did a
 * different subset of this — two navigated but forgot the flag, two set the
 * flag but never navigated, and a page-level org default would then undo the
 * whole thing on the next route change. Anything that changes the UI language
 * from a menu should call this rather than `changeLanguage` directly.
 */
export function useLocaleSwitcher() {
  const router = useRouter()
  const pathname = usePathname() || ''

  return useCallback(
    async (code: string) => {
      markLanguagePicked()
      await changeLanguage(code)

      const next = swapLocalePath(pathname, code)
      if (next !== pathname) router.push(next)
    },
    [pathname, router]
  )
}