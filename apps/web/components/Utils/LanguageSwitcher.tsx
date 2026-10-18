'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Languages, ChevronDown, Check } from 'lucide-react'
import { AVAILABLE_LANGUAGES } from '@/lib/languages'
import { changeLanguage } from '@/lib/i18n'
import { swapLocalePath } from '@/lib/locale'
import { useLHAnalytics, AnalyticsEvent } from '@services/analytics'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu"
import { getMenuColorClasses } from '@services/utils/ts/colorUtils'

const LanguageSwitcher = ({ primaryColor = '' }: { primaryColor?: string }) => {
  const { i18n } = useTranslation()
  const { track } = useLHAnalytics()
  const colors = getMenuColorClasses(primaryColor)
  const pathname = usePathname()
  const router = useRouter()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const currentLangCode = mounted ? i18n.language.split('-')[0].toUpperCase() : ''

  /**
   * Picking a language navigates as well as translating.
   *
   * The URL is the thing people share, bookmark and come back to, so it has to
   * agree with the language on screen. `swapLocalePath` keeps the visitor on the
   * same page and only moves the prefix; middleware already redirects the
   * language-less form, but navigating client-side avoids a full page load and
   * keeps the change feeling instantaneous.
   *
   * The two unprefixed surfaces (`/api`, `/embed`) are returned untouched, so
   * switching language from inside an embed is a no-op rather than a dead link.
   */
  const selectLanguage = (code: string) => {
    try {
      localStorage.setItem('i18nextLng_userPicked', '1')
    } catch { /* private mode */ }

    track(AnalyticsEvent.LanguageChanged, {
      language_code: code,
      source: 'language_switcher',
    })

    changeLanguage(code)

    const next = swapLocalePath(pathname, code)
    if (next !== pathname) router.push(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={`flex items-center space-x-1.5 px-2.5 py-2 rounded-lg transition-colors text-sm font-bold outline-none ${colors.iconBtn}`}>
          <Languages size={16} strokeWidth={2.5} />
          <span suppressHydrationWarning>{currentLangCode}</span>
          <ChevronDown size={12} className="opacity-50" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="min-w-[180px] max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto z-dropdown"
        align="end"
      >
        {AVAILABLE_LANGUAGES.map((language) => (
          <DropdownMenuItem
            key={language.code}
            className="flex items-center justify-between cursor-pointer"
            onClick={() => selectLanguage(language.code)}
          >
            <span className="flex items-center space-x-2">
              <span className="text-xs font-mono text-gray-400 w-5">{language.code.toUpperCase()}</span>
              <span>{language.nativeName}</span>
            </span>
            {i18n.language.split('-')[0] === language.code && <Check size={14} className="text-black" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default LanguageSwitcher