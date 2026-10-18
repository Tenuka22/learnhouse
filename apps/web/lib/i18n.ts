'use client'

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from '../locales/en.json';
import { loadDateLocale } from './format';

// English is bundled below; Sinhala and Tamil are lazy-loaded on demand.
// Keep this in step with AVAILABLE_LANGUAGES in lib/locale-registry.ts — a
// language in the registry with no loader here can never be selected, and one
// with a loader but no registry can never be reached. tests/rtl-guard asserts
// the two agree.
const LOCALE_LOADERS: Record<string, () => Promise<{ default: any }>> = {
  si: () => import('../locales/si.json'),
  ta: () => import('../locales/ta.json'),
};

// Only bundle English; lazy-load all other locales on demand
const resources = {
  en: { common: en },
};

async function loadLocale(lng: string) {
  const code = lng.split('-')[0]
  if (code === 'en' || !LOCALE_LOADERS[code]) return;
  if (i18n.hasResourceBundle(code, 'common')) return;

  try {
    const mod = await LOCALE_LOADERS[code]();
    i18n.addResourceBundle(code, 'common', mod.default, true, true);
  } catch (e) {
    console.warn(`Failed to load locale: ${lng}`, e);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    detection: {
      order: ['localStorage', 'cookie', 'querystring', 'navigator', 'path', 'subdomain'],
      caches: ['localStorage', 'cookie'],
      lookupLocalStorage: 'i18nextLng',
      lookupCookie: 'i18next',
    },
    react: {
      useSuspense: false,
    }
  });

// Load the detected language if it's not English, and export the promise
// so I18nProvider can wait for resources before rendering.
// The date locale rides along: dayjs keeps its own registry, and without this
// every "2 hours ago" renders in English no matter the language.
export const initialLocaleReady = Promise.all([
  loadLocale(i18n.language.split('-')[0]),
  loadDateLocale(i18n.language),
]).then(() => undefined);

/**
 * Switch language safely: preloads the bundle before switching
 * so the UI never flashes English as a fallback.
 */
export async function changeLanguage(lng: string) {
  await Promise.all([loadLocale(lng), loadDateLocale(lng)])
  return i18n.changeLanguage(lng)
}

export default i18n;
