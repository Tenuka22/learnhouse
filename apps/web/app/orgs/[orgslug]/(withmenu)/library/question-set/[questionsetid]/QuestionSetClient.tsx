'use client'

import React from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import FeatureGate from '@components/Dashboard/Shared/FeatureGate/FeatureGate'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { queryKeys } from '@/lib/query/keys'
import { getQuestionSetById } from '@services/question-sets/question-set-resource'
import { getUriWithOrg } from '@services/config/config'
import { shareQuestionSetLink } from '@components/Dashboard/Library/shareFolder'
import QuestionSetViewer from '@components/Dashboard/Library/QuestionSets/QuestionSetViewer'
import { FolderSimple, LinkSimple, ListChecks } from '@phosphor-icons/react'

function QuestionSetClient({
  orgslug,
  questionsetid,
}: {
  orgslug: string
  questionsetid: string
}) {
  const { t } = useTranslation()
  const session = useLHSession()
  const access_token = session?.data?.tokens?.access_token
  const questionSetUuid = `question_set_${questionsetid}`

  const { data: questionSet, isLoading } = useQuery({
    queryKey: queryKeys.questionSets.detail(questionSetUuid),
    queryFn: () => getQuestionSetById(questionSetUuid, access_token),
    enabled: !!questionsetid,
  })

  if (isLoading && !questionSet) {
    return (
      <div className="w-full animate-pulse">
        <GeneralWrapperStyled>
          <div className="h-7 bg-gray-200 rounded w-40 mb-4" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl nice-shadow p-4 h-16" />
            ))}
          </div>
        </GeneralWrapperStyled>
      </div>
    )
  }

  const items = questionSet?.items || []

  return (
    <FeatureGate feature="folders" orgslug={orgslug} context="public">
      <div className="w-full">
        <GeneralWrapperStyled>
          <div className="flex flex-col space-y-4 mb-2">
            <Breadcrumbs
              items={[
                {
                  label: t('library.library'),
                  href: getUriWithOrg(orgslug, '/library'),
                  icon: <FolderSimple size={14} weight="fill" />,
                },
              ]}
            />

            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <ListChecks size={22} className="text-sky-500 flex-none" weight="fill" />
                {questionSet?.title}
              </h1>
              {questionSet && (
                <button
                  onClick={() =>
                    shareQuestionSetLink(
                      orgslug,
                      questionSet.question_set_uuid,
                      questionSet.title,
                      t('library.link_copied'),
                      t('library.link_copy_error')
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 nice-shadow hover:bg-gray-50 transition-colors flex-none"
                >
                  <LinkSimple size={16} />
                  <span>{t('library.share')}</span>
                </button>
              )}
            </div>

            {questionSet?.description && (
              <p className="text-sm text-gray-500">{questionSet.description}</p>
            )}

            <QuestionSetViewer items={items} />
          </div>
        </GeneralWrapperStyled>
      </div>
    </FeatureGate>
  )
}

export default QuestionSetClient
