// Runs synchronously in <head>, before <body> paints, so an RTL locale never
// flashes an LTR layout. Same reason and same mechanism as embed-bg.js.
//
// Every user-facing page now lives under a locale prefix (/si/home,
// /en/orgs/acme/courses), and that prefix is the strongest signal available
// here: it is what a shared or bookmarked link carries, so it has to win over
// the browser's stored preference. Otherwise a visitor who followed a Sinhala
// link while their last session was in English would get English text painted
// under lang="si".
//
// The server cannot do this: i18next's highest-priority detection source is
// localStorage, which is client-only. So the detection order below MIRRORS
// `detection.order` in lib/i18n.ts exactly: path, localStorage, cookie,
// querystring, navigator.
// The RTL list is duplicated from RTL_LANGUAGES in lib/direction.ts, because
// this file runs before any bundle loads and cannot import it.
// tests/rtl-guard.test.mjs asserts the two lists stay in sync, so update both.
(function () {
  var RTL = {
    ar: 1, fa: 1, he: 1, iw: 1, ur: 1, ps: 1,
    sd: 1, ug: 1, yi: 1, dv: 1, ckb: 1,
  };

  var KNOWN = {
    en: 1, fr: 1, de: 1, es: 1, ar: 1, ja: 1, pt: 1, ru: 1, zh: 1,
    hi: 1, ko: 1, it: 1, tr: 1, vi: 1, id: 1, pl: 1, uk: 1, nl: 1,
    th: 1, bn: 1, fa: 1, sk: 1, si: 1,
  };

  // Unprefixed surfaces: /api and /embed keep their original URLs by contract,
  // so their first segment must never be read as a language code.
  function pathLocale() {
    try {
      var first = location.pathname.split('/')[1];
      if (!first || first === 'api' || first === 'embed') return '';
      return KNOWN[first] ? first : '';
    } catch { return ''; }
  }

  function detect() {
    var fromPath = pathLocale();
    if (fromPath) return fromPath;

    try {
      var stored = localStorage.getItem('i18nextLng');
      if (stored) return stored;
    } catch { /* private mode / sandboxed iframe */ }

    var cookie = document.cookie.match(/(?:^|;\s*)i18next=([^;]*)/);
    if (cookie) {
      try { return decodeURIComponent(cookie[1]) } catch { /* malformed */ }
    }

    try {
      var qs = new URLSearchParams(location.search).get('lng');
      if (qs) return qs;
    } catch { /* malformed query string */ }

    return (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  }

  var code = String(detect() || 'en').split('-')[0].toLowerCase();
  var dir = RTL[code] ? 'rtl' : 'ltr';

  var el = document.documentElement;
  el.setAttribute('lang', code);
  el.setAttribute('dir', dir);
  el.style.setProperty('--dir', dir === 'rtl' ? '-1' : '1');
})();
