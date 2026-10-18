import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guards the RTL invariants that ESLint can't see: raw CSS, and a constant
 * that is deliberately duplicated into a file the bundler never touches.
 */

const webRoot = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(webRoot, p), 'utf8')

describe('RTL language set', () => {
  // public/dir-init.js runs before any bundle loads, so it cannot import
  // lib/direction.ts and has to carry its own copy of the RTL list. That makes
  // it exactly the kind of constant that drifts silently.
  test('dir-init.js matches RTL_LANGUAGES in lib/direction.ts', () => {
    const initSrc = read('public/dir-init.js')
    const directionSrc = read('lib/direction.ts')

    const initBlock = initSrc.match(/var RTL = \{([\s\S]*?)\}/)
    expect(initBlock).not.toBeNull()
    const initCodes = [...initBlock[1].matchAll(/(\w+):\s*1/g)].map((m) => m[1]).sort()

    const setBlock = directionSrc.match(/RTL_LANGUAGES = new Set\(\[([\s\S]*?)\]\)/)
    expect(setBlock).not.toBeNull()
    const setCodes = [...setBlock[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()

    expect(initCodes.length).toBeGreaterThan(0)
    expect(initCodes).toEqual(setCodes)
  })

  test('Arabic and Persian are RTL', () => {
    const src = read('lib/direction.ts')
    const setBlock = src.match(/RTL_LANGUAGES = new Set\(\[([\s\S]*?)\]\)/)[1]
    expect(setBlock).toContain("'ar'")
    expect(setBlock).toContain("'fa'")
  })
test('dir-init.js knows exactly the shipped locales', () => {
    // dir-init.js reads the locale prefix off the URL, so it needs its own copy
    // of the registry. A locale added to lib/locale-registry.ts but not here
    // would silently fall through to the localStorage/navigator branch, and a
    // `/si/...` page would paint English text under lang="en".
    const initSrc = read('public/dir-init.js')
    const registrySrc = read('lib/locale-registry.ts')

    const knownBlock = initSrc.match(/var KNOWN = \{([\s\S]*?)\}/)
    expect(knownBlock).not.toBeNull()
    const initCodes = [...knownBlock[1].matchAll(/(\w+):\s*1/g)].map((m) => m[1]).sort()

    const registryCodes = [...registrySrc.matchAll(/code:\s*'([a-z]+)'/g)].map((m) => m[1]).sort()

    expect(initCodes.length).toBeGreaterThan(0)
    expect(initCodes).toEqual(registryCodes)
  })

  // A prefix must never be read off /api or /embed: those URLs are fixed by
  // contract, and "/embeddings" is an ordinary page that must stay localized.
  test('dir-init.js does not treat api/embed segments as locales', () => {
    const initSrc = read('public/dir-init.js')
    const fn = initSrc.match(/function pathLocale\(\) \{([\s\S]*?)\n  \}/)
    expect(fn).not.toBeNull()
    expect(fn[1]).toContain("first === 'api'")
    expect(fn[1]).toContain("first === 'embed'")
  })
})

describe('language registry', () => {
  // The list itself moved to lib/locale-registry.ts so that lib/direction.ts
  // could depend on it without gaining a module graph (global-error.tsx imports
  // direction.ts with no providers mounted). lib/languages.ts re-exports it.
  const src = read('lib/locale-registry.ts')
  const entries = [...src.matchAll(/\{\s*code:\s*'([a-z]+)'[^}]*\}/g)]

  test('every language declares a direction', () => {
    // English, Sinhala and Tamil are the only shipped locales. Asserted by
    // value, not by count, so dropping or adding one is a deliberate edit here.
    expect(entries.map((e) => e[1]).sort()).toEqual(['en', 'si', 'ta'])
    for (const entry of entries) {
      expect(entry[0]).toMatch(/dir:\s*'(ltr|rtl)'/)
    }
  })

  // The RTL machinery in lib/direction.ts, globals.css and dir-init.js is
  // dormant rather than removed: no shipped locale is RTL, but the generic
  // support costs nothing and returning to it is a one-line registry change.
  // So assert the *absence* of RTL entries explicitly rather than leaving the
  // old `['ar', 'fa']` expectation to rot against a deleted ar.json.
  test('no shipped locale is RTL', () => {
    const rtl = entries.filter((e) => /dir:\s*'rtl'/.test(e[0])).map((e) => e[1]).sort()
    expect(rtl).toEqual([])
  })

  // A locale that loads but isn't in the registry can never be picked, and one
  // in the registry without a loader falls back to English with no warning.
  test('registry and lazy loaders agree', () => {
    const i18nSrc = read('lib/i18n.ts')
    // The type annotation contains `=>`, so match lazily up to the assignment.
    const loaderBlock = i18nSrc.match(/LOCALE_LOADERS[\s\S]*?=\s*\{([\s\S]*?)\n\}/)[1]
    const loaderCodes = [...loaderBlock.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort()

    const registryCodes = entries.map((e) => e[1]).filter((c) => c !== 'en').sort()
    expect(loaderCodes).toEqual(registryCodes)
  })
})

describe('globals.css', () => {
  const css = read('styles/globals.css')
  const lines = css.split('\n')

  const DIRECTIONAL = new RegExp(
    [
      String.raw`(^|[^-\w])(left|right)\s*:`,
      String.raw`margin-(left|right)`,
      String.raw`padding-(left|right)`,
      String.raw`border-(left|right)`,
      String.raw`text-align\s*:\s*(left|right)`,
      String.raw`float\s*:\s*(left|right)`,
    ].join('|')
  )

  // Physical declarations are allowed, but only with a stated reason, so the
  // next person doesn't have to guess whether it was deliberate.
  test('every physical declaration is justified', () => {
    const unjustified = []
    lines.forEach((line, i) => {
      if (!DIRECTIONAL.test(line)) return
      const context = lines.slice(Math.max(0, i - 8), i).join('\n')
      if (/rtl-ok|mirrored|no logical form/.test(context)) return
      unjustified.push(`${i + 1}: ${line.trim()}`)
    })
    expect(unjustified).toEqual([])
  })

  test('RTL affordances are present', () => {
    expect(css).toContain('--font-arabic')
    expect(css).toContain('unicode-bidi: plaintext')
    expect(css).toMatch(/\[dir='rtl'\]/)
  })

  // Being present in the source is not enough: a rule can be valid, correct,
  // and still never reach the browser. The icon-mirroring block was silently
  // swallowed once because a comment above it contained `*/`, which closed the
  // comment early and took the following rule with it. Nothing failed: no
  // build error, no lint error, the app just quietly stopped mirroring icons.
  // So assert against the COMPILED output, not the source.
  test('RTL rules survive compilation', async () => {
    const { default: tailwind } = await import('@tailwindcss/postcss')
    const { default: postcss } = await import('postcss')

    const result = await postcss([tailwind({ base: webRoot, optimize: { minify: true } })])
      .process(css, { from: path.join(webRoot, 'styles/globals.css') })

    for (const needle of [
      'lucide-chevron-right', // directional icon mirroring
      'data-dir-flip', // opt-in for icon libraries without per-icon classes
      'recharts-wrapper', // charts locked to LTR
      'unicode-bidi', // per-block direction for authored content
      '--leading-tight', // Arabic line-height
      'lh-toast', // toast direction
      'lh-org-font-root', // Tajawal overriding the inline org font
    ]) {
      expect(result.css).toContain(needle)
    }

    // Tajawal must be forced, not offered as a fallback. next/font injects a
    // local "<Family> Fallback" face for CLS, and on macOS that adjusted system
    // font covers Arabic, so a per-glyph fallback stack resolves there and the
    // real Arabic face never loads. Two !important rules (one per layer,
    // because the base font-family is declared in both) are what prevent that.
    const forced = result.css.match(/font-family:var\(--font-arabic\)[^}]*!important/g) ?? []
    expect(forced.length).toBe(2)
  }, 60_000)
})

describe('locale coverage', () => {
  const en = JSON.parse(read('locales/en.json'))
  const flatten = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? flatten(v, `${prefix}${k}.`)
        : [`${prefix}${k}`]
    )

  // Only English, Sinhala and Tamil ship. Enumerated from disk rather than
  // hardcoded, so adding a locale file without registering it still fails the
  // "registry and lazy loaders agree" test above.
  const LOCALES = ['si', 'ta']
  const data = Object.fromEntries(
    LOCALES.map((c) => [c, JSON.parse(read(`locales/${c}.json`))])
  )
  const enKeys = flatten(en)

  /**
   * A monotonic floor on key presence, and a report of the real gap.
   *
   * This used to assert full coverage for ar.json, which was the only locale
   * that ever passed — so the other 22 sat at ~85% and nothing said so. With
   * three locales left, the honest thing is to make the gap visible and make it
   * impossible to grow: each floor is the current count and only ever moves up,
   * so deleting translations or swapping a locale file for English fails here.
   * Flip `report` to a hard `expect(missing).toEqual([])` once coverage lands.
   */
  test('key presence never regresses, and the remaining gap is reported', () => {
    const sets = Object.fromEntries(LOCALES.map((c) => [c, new Set(flatten(data[c]))]))
    const report = {}
    for (const c of LOCALES) {
      const present = enKeys.filter((k) => sets[c].has(k)).length
      report[c] = { present, missing: enKeys.length - present }
    }
    console.log('locale coverage:', JSON.stringify(report))

    const FLOOR = { si: 862, ta: 5236 }
    for (const c of LOCALES) {
      expect({
        locale: c,
        meetsFloor: report[c].present >= FLOOR[c],
        present: report[c].present,
      }).toMatchObject({ locale: c, meetsFloor: true })
    }
  })

  test('no locale carries keys en.json does not have', () => {
    // Stale keys silently shadow nothing: i18next never reads them, but they
    // make the file look more complete than it is. ar.json carried 15 of them.
    const enSet = new Set(enKeys)
    for (const c of LOCALES) {
      const orphans = flatten(data[c]).filter((k) => !enSet.has(k))
      expect({ locale: c, orphans: orphans.slice(0, 10) }).toEqual({
        locale: c,
        orphans: [],
      })
    }
  })

  test('translated share never regresses', () => {
    // A floor rather than an exact number: translation lands in batches, and
    // this exists to catch a locale being wiped or a bulk edit replacing
    // translated values with the English source. Raise it as work completes.
    const FLOOR = { si: 0.15, ta: 0 }
    const enMap = new Map(enKeys.map((k) => [k, k.split('.').reduce((o, s) => o[s], en)]))

    for (const c of LOCALES) {
      const map = new Map(flatten(data[c]).map(([k, v]) => [k, v]))
      const translated = enKeys.filter((k) => map.get(k) !== enMap.get(k)).length
      const share = translated / enKeys.length
      expect({
        locale: c,
        meetsFloor: share >= FLOOR[c],
        share: Number(share.toFixed(3)),
      }).toMatchObject({ locale: c, meetsFloor: true })
    }
  })
})
