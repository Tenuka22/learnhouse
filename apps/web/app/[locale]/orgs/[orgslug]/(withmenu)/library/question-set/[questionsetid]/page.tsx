import React from 'react'
import { notFound } from 'next/navigation'
import QuestionSetClient from './QuestionSetClient'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getQuestionSetById, type QuestionSetReadWithItems } from '@services/question-sets/question-set-resource'
import { getOrgThumbnailMediaDirectory, getOrgOgImageMediaDirectory } from '@services/media/media'
import { getOrgSeoConfig, buildPageTitle } from '@/lib/seo/utils'
import { getServerCanonicalUrl } from '@/lib/seo/utils.server'
import { getServerSession } from '@/lib/auth/server'

type MetadataProps = {
  params: Promise<{ orgslug: string; questionsetid: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

/** Fetch the question set as the current viewer (forwards their session).
 * Returns null when the set is private / the viewer has no access (the API denies). */
async function fetchQuestionSetForViewer(questionsetid: string): Promise<QuestionSetReadWithItems | null> {
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token
  try {
    const questionSet = await getQuestionSetById(
      `question_set_${questionsetid}`,
      access_token ?? undefined,
      { revalidate: 0, tags: ['question-sets'] }
    )
    return questionSet && questionSet.question_set_uuid ? questionSet : null
  } catch {
    return null
  }
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const [org, questionSet] = await Promise.all([
    getOrganizationContextInfo(params.orgslug, { revalidate: 120, tags: ['organizations'] }),
    fetchQuestionSetForViewer(params.questionsetid),
  ])

  const seoConfig = getOrgSeoConfig(org)

  // Private / inaccessible question set: never index, never leak the title.
  if (!questionSet) {
    return {
      title: buildPageTitle('Library', org.name, seoConfig),
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    }
  }

  const ogImageUrl = seoConfig.default_og_image
    ? getOrgOgImageMediaDirectory(org?.org_uuid, seoConfig.default_og_image)
    : null
  const imageUrl = ogImageUrl || getOrgThumbnailMediaDirectory(org?.org_uuid, org?.thumbnail_image)
  const canonical = await getServerCanonicalUrl(params.orgslug, `/library/question-set/${params.questionsetid}`)
  const title = buildPageTitle(questionSet.title || 'Library', org.name, seoConfig)
  const description = questionSet.description || org.description || seoConfig.default_meta_description || ''

  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: imageUrl, width: 800, height: 600, alt: org.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
      ...(seoConfig.twitter_handle && { site: seoConfig.twitter_handle }),
    },
  }
}

const QuestionSetPage = async (props: { params: Promise<{ orgslug: string; questionsetid: string }> }) => {
  const params = await props.params
  // Server-side access gate: a private question set (or one the viewer lacks
  // rights to) returns a real 404; no title/questions are rendered or indexed.
  const questionSet = await fetchQuestionSetForViewer(params.questionsetid)
  if (!questionSet) {
    notFound()
  }
  return <QuestionSetClient orgslug={params.orgslug} questionsetid={params.questionsetid} />
}

export default QuestionSetPage
