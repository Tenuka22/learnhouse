import LocaleLink from '@components/Utils/LocaleLink'

/**
 * The 404 boundary for a request that resolved a locale (e.g. `/si/nope`).
 *
 * Exists so the recovery link keeps the visitor in the language they asked for.
 * The root `app/not-found.tsx` handles the cases where no locale could be
 * determined at all, and cannot do the same because it has no locale in scope.
 */
export default function LocaleNotFound() {
  return (
    <LocaleLink
      href="/"
      className="flex w-fit h-[50px] text-xl space-x-2 bg-black px-6 py-2 text-md rounded-lg font-bold text-white items-center shadow-md gap-2"
    >
      Go back to homepage
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="tracking-tight transition-transform duration-150 ease-in-out ms-1"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </LocaleLink>
  )
}