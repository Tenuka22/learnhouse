import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guards the locale-prefixed URL contract. Every link in the app funnels
 * through localizePath/swapLocalePath, so a regression here shows up as a
 * language-less URL (or, worse, a stacked `/si/si/...`) across the whole UI.
 */

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getPathLocale,
  isSupportedLocale,
  isUnlocalizedPath,
  localizePath,
  normalizeLocale,
  stripLocale,
  swapLocalePath,
  UNLOCALIZED_PREFIXES,
} from '../lib/locale'

describe('locale normalisation', () => {
  test('Sinhala and English are supported', () => {
    expect(isSupportedLocale('si')).toBe(true)
    expect(isSupportedLocale('en')).toBe(true)
    expect(SUPPORTED_LOCALES).toContain('si')
    expect(DEFAULT_LOCALE).toBe('en')
  })

  test('regional tags collapse to the base code', () => {
    expect(normalizeLocale('si-LK')).toBe('si')
    expect(normalizeLocale('en-GB')).toBe('en')
    expect(normalizeLocale('TA-in')).toBe('ta')
    // A locale we used to ship is now just another unsupported code.
    expect(normalizeLocale('PT-br')).toBeNull()
  })

  // An unknown prefix must NOT silently become English: /xx/home should 404
  // rather than render English under a URL that promises something else.
  test('unknown codes are rejected rather than defaulted', () => {
    expect(normalizeLocale('xx')).toBeNull()
    expect(normalizeLocale('')).toBeNull()
    expect(normalizeLocale(undefined)).toBeNull()
    expect(normalizeLocale(42)).toBeNull()
  })
})

describe('locale paths', () => {
  test('reads and strips the prefix', () => {
    expect(getPathLocale('/si/home')).toBe('si')
    expect(stripLocale('/si/home')).toBe('/home')
    expect(stripLocale('/si')).toBe('/')
    expect(stripLocale('/si/')).toBe('/')
    expect(getPathLocale('/home')).toBeNull()
    // A slug that merely starts with a locale code is not a prefixed path.
    expect(stripLocale('/singer/page')).toBe('/singer/page')
  })

  // Only en/si/ta ship. An unknown code must be left alone rather than
  // producing a prefix that 404s.
  test('an unsupported locale is a no-op', () => {
    expect(localizePath('/home', 'fr')).toBe('/home')
    expect(swapLocalePath('/si/home', 'fr')).toBe('/si/home')
  })

  test('prefixes a bare app path', () => {
    expect(localizePath('/home', 'si')).toBe('/si/home')
    expect(localizePath('/', 'si')).toBe('/si')
    expect(localizePath('/orgs/acme/courses', 'ta')).toBe('/ta/orgs/acme/courses')
  })

  test('is idempotent and swaps instead of stacking', () => {
    expect(localizePath('/si/home', 'si')).toBe('/si/home')
    expect(localizePath('/en/home', 'si')).toBe('/si/home')
    expect(localizePath('/si/home', 'ta')).toBe('/ta/home')
  })

  test('preserves query and hash', () => {
    expect(localizePath('/search?q=a#top', 'si')).toBe('/si/search?q=a#top')
    expect(localizePath('/si/search?q=a#top', 'ta')).toBe('/ta/search?q=a#top')
    // Same-page reference: nothing to localize.
    expect(localizePath('#top', 'si')).toBe('#top')
  })

  test('leaves external and special URLs alone', () => {
    for (const href of [
      'https://learnhouse.app/docs',
      'http://example.com',
      '//cdn.example.com/x.js',
      'mailto:hi@example.com',
      'tel:+123456',
    ]) {
      expect(localizePath(href, 'si')).toBe(href)
    }
  })
})

describe('byte-stable surfaces', () => {
  // /api is the backend proxy and /embed URLs are pasted into third-party LMS
  // iframes and shared as activity links. Neither may ever gain a locale.
  for (const prefix of UNLOCALIZED_PREFIXES) {
    test(`${prefix}/* is never prefixed`, () => {
      expect(isUnlocalizedPath(`${prefix}/anything`)).toBe(true)
      expect(isUnlocalizedPath(prefix)).toBe(true)
      expect(localizePath(`${prefix}/acme/course/x/activity/y`, 'si')).toBe(
        `${prefix}/acme/course/x/activity/y`
      )
      expect(swapLocalePath(`${prefix}/acme`, 'si')).toBe(`${prefix}/acme`)
    })
  }

  test('only matches on a segment boundary', () => {
    // /embeddings is a page, not the embed surface.
    expect(isUnlocalizedPath('/embeddings')).toBe(false)
    expect(isUnlocalizedPath('/apiary')).toBe(false)
    expect(localizePath('/embeddings', 'si')).toBe('/si/embeddings')
  })
})

describe('switchLocalePath', () => {
  test('keeps the page and only changes the language', () => {
    expect(swapLocalePath('/si/orgs/acme/courses', 'ta')).toBe('/ta/orgs/acme/courses')
    expect(swapLocalePath('/si', 'ta')).toBe('/ta')
    expect(swapLocalePath('/ta/orgs/acme', 'ta')).toBe('/ta/orgs/acme')
  })

  test('prefixes an unprefixed path rather than dropping it', () => {
    expect(swapLocalePath('/orgs/acme', 'si')).toBe('/si/orgs/acme')
  })
})

describe('language menus', () => {
  const webRoot = path.resolve(import.meta.dirname, '..')
  const ROOTS = ['app', 'components']
  const SKIP = new Set(['node_modules', '.next', 'api', 'embed'])

  // Synchronous, because the file list is built in the describe body and the
  // `test` callbacks below are the only async ones.
  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const out = []
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) out.push(...walk(full))
      } else if (/\.(tsx|ts)$/.test(e.name)) {
        out.push(full)
      }
    }
    return out
  }

  const files = ['app', 'components'].flatMap((r) => walk(path.join(webRoot, r)))

  /**
   * A menu that translates but doesn't navigate leaves the address bar on the
   * old language, and a menu that doesn't set the user-picked flag gets undone
   * by OrgLanguageSync on the next route change. Both shipped at once: the
   * header profile menu did neither.
   */
  test('no menu changes the language without going through useLocaleSwitcher', () => {
    const offenders = []
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      if (src.includes('useLocaleSwitcher')) continue
      src.split('\n').forEach((line, i) => {
        // Direct `changeLanguage(...)` calls from a menu.
        if (/\bchangeLanguage\s*\(/.test(line) && !/import/.test(line)) {
          // OrgLanguageSync and LocaleSync legitimately own this.
          if (/OrgLanguageSync|LocaleSync/.test(file)) return
          offenders.push(`${path.relative(webRoot, file)}:${i + 1} ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  test('the user-picked flag is set in exactly one place', () => {
    const setters = []
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      // Either the literal key or the shared USER_PICKED_KEY constant.
      if (/setItem\(\s*(?:USER_PICKED_KEY|['"]i18nextLng_userPicked['"])/.test(src)) {
        setters.push(path.relative(webRoot, file))
      }
    }
    // LocaleContext owns it; a second hand-rolled writer is how one menu ended
    // up missing the flag in the first place.
    expect(setters).toEqual([path.join('components', 'Contexts', 'LocaleContext.tsx')])
  })

  test('OrgLanguageSync still defers to an explicit choice', () => {
    const src = fs.readFileSync(
      path.join(webRoot, 'components', 'Contexts', 'OrgLanguageSync.tsx'),
      'utf8'
    )
    // The org default must not fight the URL once the visitor has chosen.
    expect(src).toContain('USER_PICKED_KEY')
    expect(src).toMatch(/if \(userPicked\) return/)
  })
})

describe('proxy locale handling', () => {
  const webRoot = path.resolve(import.meta.dirname, '..')
  // The locale logic lives in proxy.ts, not middleware.ts: Next 16 renamed the
  // entry point, and this app already had a proxy.ts carrying the tenancy
  // rewrites (/courses -> /orgs/{slug}/courses). Locale handling had to be
  // integrated into it rather than added alongside.
  const src = fs.readFileSync(path.join(webRoot, 'proxy.ts'), 'utf8')

  // The matcher is the only thing standing between /embed and a redirect, and a
  // silently-narrowed matcher would break every external embed while still
  // looking fine in dev.
  test('the proxy matcher excludes api, embed and _next', () => {
    const block = src.match(/matcher:\s*\[[\s\S]*?\n\s{2}\]/)?.[0] ?? ''
    expect(block).toContain('api|_next')
    expect(block).toContain('embed')
  })

  // Every tenancy branch rewrites to a different destination. If one is left
  // unprefixed, that page renders in English under a Sinhala URL — the exact
  // mismatch the prefix exists to prevent.
  test('every rewrite/redirect destination is localized', () => {
    const raw = src.match(/NextResponse\.(?:rewrite|redirect)\(\s*new URL\(([^,]+),/g) ?? []
    const byHand = raw.filter((m) => !m.includes('localize('))
    // The one legitimate exception: the language-less entry redirect, whose
    // destination IS the prefix being added. /api/health, the podcast feed and
    // the sitemap/robots rewrites are wrapped too, since localizePath returns
    // those unchanged anyway and wrapping them documents the exception.
    expect(byHand).toEqual([
      expect.stringContaining('${detected}${pathname}${search}'),
    ])
  })

  test('the language-less entry point redirects rather than rewrites', () => {
    // A rewrite would leave the address bar on /courses, so the language would
    // never appear in a shared link.
    expect(src).toContain('NextResponse.redirect(')
    expect(src).toMatch(/new URL\(`\/\$\{detected\}\$\{pathname\}\$\{search\}`, req\.url\),\s*\n?\s*307/)
  })

  test('tenancy decisions run on the locale-less path', () => {
    expect(src).toContain('const pathname = stripLocale(req.nextUrl.pathname)')
  })
})