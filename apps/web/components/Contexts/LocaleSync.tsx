'use client'

import { useEffect } from 'react'
import i18n, { changeLanguage } from '@/lib/i18n'
import { applyDocumentDirection } from '@/lib/direction'

/**
 * Makes the URL's locale the source of truth for the rendered language.
 *
 * Mounted once from `app/[locale]/layout.tsx`, above every localized page. It
 * exists because the URL is now the thing people share, bookmark and paste: a
 * link to `/si/orgs/acme/courses` must render Sinhala even if the visitor's
 * localStorage still holds the language they were last browsing in.
 *
 * `changeLanguage` (not `i18n.changeLanguage`) because it preloads the bundle
 * first, so the page never flips from English to the target language mid-read.
 *
 * Note it does NOT set `i18nextLng_userPicked`. Landing on a localized URL is
 * not the same as choosing a language in the switcher: the switcher sets that
 * flag, which is what lets an org's configured default language keep overriding
 * the browser for casual visitors. See OrgLanguageSync, which reconciles the
 * two and rewrites the URL to match whichever one wins.
 */
export default function LocaleSync({ locale }: { locale: string }) {
  useEffect(() => {
    if (i18n.language.split('-')[0] !== locale) {
      changeLanguage(locale)
    }
    // Covers the case where the language already matched but <html lang/dir>
    // still carries a value from a previous page (bfcache restore, or
    // dir-init.js having been blocked).
    applyDocumentDirection(locale)
  }, [locale])

  return null
}