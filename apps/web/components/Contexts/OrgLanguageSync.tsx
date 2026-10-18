'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useOrg } from './OrgContext'
import i18n, { changeLanguage } from '@/lib/i18n'
import { swapLocalePath } from '@/lib/locale'

const USER_PICKED_KEY = 'i18nextLng_userPicked'

/**
 * Applies an org's configured default language to visitors who never chose one.
 *
 * With locale-prefixed URLs this has to do more than call `changeLanguage`: the
 * language in the URL is now what gets shared and bookmarked, so if this
 * component switched the text without moving the prefix, the address bar would
 * keep advertising the old language. It therefore rewrites the URL to match
 * whichever language actually won.
 *
 * The precedence it preserves is unchanged:
 *   1. an explicit choice in the language switcher (userPicked) — wins, and the
 *      switcher already navigated to the matching prefix
 *   2. the org's default_language
 *   3. whatever the URL/middleware detected
 */
export default function OrgLanguageSync() {
  const org = useOrg() as any
  const pathname = usePathname() || ''
  const router = useRouter()

  const orgDefault: string | undefined =
    org?.config?.config?.customization?.general?.default_language ||
    org?.config?.config?.general?.default_language

  useEffect(() => {
    if (!orgDefault) return

    let userPicked: string | null = null
    try {
      userPicked = localStorage.getItem(USER_PICKED_KEY)
    } catch { /* private mode */ }
    if (userPicked) return

    if (i18n.language.split('-')[0] !== orgDefault) {
      changeLanguage(orgDefault)
    }

    // Keep the URL in step with the text. On the unprefixed surfaces
    // (/embed) swapLocalePath returns the path unchanged, so this is a no-op
    // there rather than a redirect out of the embed.
    const next = swapLocalePath(pathname, orgDefault)
    if (next !== pathname) router.replace(next)
  }, [orgDefault, pathname, router])

  return null
}