import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import LocaleSync from '@components/Contexts/LocaleSync'
import { LocaleProvider } from '@components/Contexts/LocaleContext'
import { normalizeLocale } from '@/lib/locale'

/**
 * Locale-prefixed route root: every user-facing page lives under a supported
 * language code (`/si/home`, `/en/orgs/acme/courses`).
 *
 * Two surfaces sit outside this folder on purpose and keep their original URLs:
 * `app/api` (the backend proxy) and `app/embed` (URLs pasted into third-party
 * LMS iframes and shared as activity links). See lib/locale.ts.
 *
 * Note there is deliberately no `generateStaticParams`. Adding it would ask the
 * build to prerender every page in all 23 languages, most of which are
 * authenticated and per-org, turning a build that used to walk the routes once
 * into one that walks them 23 times for no benefit. `dynamicParams` therefore
 * stays at its default (true) and the explicit guard below is what actually
 * rejects an unsupported code.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  // An unknown code must 404 rather than silently render English: /xx/home
  // promising one thing and displaying another is worse than a 404. middleware
  // guarantees only supported codes arrive here, so this is the backstop for
  // direct requests that never went through it.
  const resolved = normalizeLocale(locale)
  if (!resolved) notFound()

  return (
    <LocaleProvider locale={resolved}>
      <LocaleSync locale={resolved} />
      {children}
    </LocaleProvider>
  )
}