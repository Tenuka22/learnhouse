'use client'
// Rendered from a server component, but @phosphor-icons/react calls
// createContext, which does not exist in the RSC runtime. Without this
// directive the route fails at "collect page data" with
// "(0, h.createContext) is not a function".
import LocaleLink from '@components/Utils/LocaleLink'
import { Lock } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'

// Shown when the API answers 403 for a playground: it exists, but the viewer
// may not see it (RESTRICTED access type, outside the granted usergroups).
// Rendering this instead of notFound() stops a permissions problem from being
// reported as a missing page.
export default function PlaygroundAccessDenied({ orgslug }: { orgslug: string }) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
        <Lock size={26} weight="duotone" />
      </div>
      <h1 className="text-xl font-bold text-neutral-800">You do not have access to this playground</h1>
      <p className="max-w-md text-sm text-neutral-500">
        This playground is restricted to specific user groups. Ask an administrator to add you, or sign in with a
        different account.
      </p>
      <LocaleLink
        href={getUriWithOrg(orgslug, '/playgrounds')}
        className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-neutral-900 px-5 text-sm font-medium text-white nice-shadow transition-colors hover:bg-neutral-800"
      >
        Back to playgrounds
      </LocaleLink>
    </div>
  )
}