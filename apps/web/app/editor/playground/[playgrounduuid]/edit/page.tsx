import { Metadata } from 'next'
import { getServerSession } from '@/lib/auth/server'
import { getPlayground } from '@services/playgrounds/playgrounds'
import { getOrgCourses } from '@services/courses/courses'
import { notFound, redirect } from 'next/navigation'
import { OrgProvider } from '@components/Contexts/OrgContext'
import PlaygroundEditor from '@components/Playground/PlaygroundEditor'

type PageParams = Promise<{ playgrounduuid: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { playgrounduuid } = await params
  try {
    const pg = await getPlayground(playgrounduuid)
    return { title: `Edit | ${pg.name}` }
  } catch {
    return { title: 'Edit Playground' }
  }
}

export default async function EditPlaygroundPage({ params }: { params: PageParams }) {
  const { playgrounduuid } = await params
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token

  if (!access_token) {
    redirect('/auth/login')
  }

  let playground
  try {
    playground = await getPlayground(playgrounduuid, access_token)
  } catch {
    notFound()
  }

  let orgCourses: { course_uuid: string; name: string }[] = []
  if (playground.org_slug) {
    try {
      const coursesRes = await getOrgCourses(playground.org_slug, null, access_token, true)
      orgCourses = (Array.isArray(coursesRes) ? coursesRes : []).map((c: any) => ({
        course_uuid: c.course_uuid,
        name: c.name,
      }))
    } catch {
      // Non-fatal: proceed without course context
    }
  }

  return (
    // This route lives outside app/orgs/[orgslug], so no layout provides org
    // context. Without it every useOrg() consumer in the playground editor
    // (AI image generation, media URLs) silently gets null. An empty slug is
    // a pass-through: OrgProvider disables its query and renders children.
    <OrgProvider orgslug={playground.org_slug || ''}>
      <PlaygroundEditor
        playground={playground}
        orgslug={playground.org_slug || ''}
        accessToken={access_token}
        orgCourses={orgCourses}
      />
    </OrgProvider>
  )
}
