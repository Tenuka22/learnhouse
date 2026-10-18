'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { localizePath } from '@/lib/locale'
import { useLocale } from '@components/Contexts/LocaleContext'

/**
 * `next/link` that keeps every internal URL under the current locale prefix.
 *
 * Every internal `<Link>` in the app routes to `/{locale}/...` today, and this
 * is the single place that knowledge lives, so a new page doesn't have to
 * remember to localize its own links.
 *
 * The locale comes from LocaleContext rather than `useParams()` because this
 * component is also rendered from server components (which cannot use hooks but
 * can render a client component). Context is populated during SSR, so the
 * emitted href is already prefixed — a crawler and a no-JS client see
 * `/si/orgs/acme/courses`, not a language-less link repaired after hydration.
 *
 * Pass-through by design: absolute URLs, `mailto:`/`tel:`, hash links and the
 * byte-stable `/api` + `/embed` surfaces are returned untouched (see
 * lib/locale.ts).
 */
export default function LocaleLink({ href, ...props }: ComponentProps<typeof Link>) {
  const locale = useLocale()

  const resolved =
    typeof href === 'string' ? localizePath(href, locale) : (href as ComponentProps<typeof Link>['href'])

  return <Link {...props} href={resolved} />
}