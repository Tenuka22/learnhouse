import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { getPlayground } from '@services/playgrounds/playgrounds'
import PlaygroundViewClient from './view'
import PlaygroundAccessDenied from './access-denied'

type PageParams = Promise<{ orgslug: string; playgrounduuid: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { playgrounduuid } = await params
  const session = await getServerSession()
  try {
    // Pass the token: without it a signed-in user's own playground always fell
    // back to the generic title, because the fetch was rejected.
    const pg = await getPlayground(playgrounduuid, session?.tokens?.access_token ?? undefined)
    return {
      title: pg.name,
      description: pg.description || `Interactive playground: ${pg.name}`,
    }
  } catch {
    return { title: 'Playground' }
  }
}

export default async function PlaygroundViewPage({ params }: { params: PageParams }) {
  const { orgslug, playgrounduuid } = await params
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token

  let playground
  try {
    playground = await getPlayground(playgrounduuid, access_token ?? undefined)
  } catch (error: any) {
    // Only a genuine 404 means the page does not exist. Collapsing 401/403/5xx
    // into notFound() made every access problem render as "page deleted",
    // which is what made public playgrounds look broken.
    const status = error?.status
    if (status === 401) {
      // Auth-required playground with no session: send them to sign in and
      // come back, rather than showing a 404.
      redirect(`/auth/login?redirect=${encodeURIComponent(`/playground/${playgrounduuid}`)}`)
    }
    if (status === 403) {
      return <PlaygroundAccessDenied orgslug={orgslug} />
    }
    notFound()
  }

  if (!playground.published && !access_token) {
    notFound()
  }

  return (
    <PlaygroundViewClient
      playground={playground}
      orgslug={orgslug}
      canEdit={!!access_token}
    />
  )
}
