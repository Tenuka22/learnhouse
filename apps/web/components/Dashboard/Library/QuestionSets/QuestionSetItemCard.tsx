'use client'
import React from 'react'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import EditQuestionSetModal from '@components/Dashboard/Library/QuestionSets/EditQuestionSetModal'
import QuestionEditor from '@components/Dashboard/Library/QuestionSets/QuestionEditor'
import { shareQuestionSetLink } from '@components/Dashboard/Library/shareFolder'
import {
  getQuestionSetById,
  type QuestionSetRead,
} from '@services/question-sets/question-set-resource'
import {
  ListChecks,
  DotsThreeVertical,
  LinkSimple,
  Globe,
  Lock,
  FolderMinus,
  PencilSimple,
} from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { useTranslation } from 'react-i18next'

export interface QuestionSetFolderItem {
  resource_type: 'question_sets'
  resource_uuid: string
  resource: QuestionSetRead
}

type Props = {
  item: QuestionSetFolderItem
  orgslug: string
  org_id: number
  onRemove: () => void
}

function QuestionSetItemCard({ item, orgslug, onRemove }: Props) {
  const { t } = useTranslation()
  const session = useLHSession()
  const access_token = session?.data?.tokens?.access_token
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)

  const resource = item.resource

  // Lazily shows the question count on the tile, mirroring the prefetch-for-a-
  // count-badge idiom already used by ResourcePicker's TabButton.
  const { data, mutate } = useSWR(
    ['question-set-detail', item.resource_uuid],
    () => getQuestionSetById(item.resource_uuid, access_token)
  )

  const questionCount = data?.items.length

  return (
    <div className="group relative flex flex-col bg-white rounded-xl nice-shadow overflow-hidden w-full transition-all hover:bg-gray-50/40">
      <div className={`absolute top-2 end-2 z-20 transition-opacity ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button aria-label="Question set actions" className="p-1.5 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition-all shadow-md">
              <DotsThreeVertical size={18} weight="bold" className="text-gray-700" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <button
                onClick={() => setEditOpen(true)}
                className="w-full text-start flex items-center px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
              >
                <PencilSimple className="me-2 h-4 w-4" /> {t('library.edit')}
              </button>
            </DropdownMenuItem>
            {resource.public && (
              <DropdownMenuItem asChild>
                <button
                  onClick={() =>
                    shareQuestionSetLink(
                      orgslug,
                      resource.question_set_uuid,
                      resource.title,
                      t('library.link_copied'),
                      t('library.link_copy_error')
                    )
                  }
                  className="w-full text-start flex items-center px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
                >
                  <LinkSimple className="me-2 h-4 w-4" /> {t('library.copy_link')}
                </button>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <ConfirmationModal
                confirmationButtonText={t('library.remove_from_folder')}
                confirmationMessage={t('library.remove_from_folder_confirm')}
                dialogTitle={t('library.remove_from_folder')}
                dialogTrigger={
                  <button className="w-full text-start flex items-center px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors">
                    <FolderMinus className="me-2 h-4 w-4" /> {t('library.remove_from_folder')}
                  </button>
                }
                functionToExecute={onRemove}
                status="warning"
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button type="button" onClick={() => setEditOpen(true)} className="block w-full text-start">
        <div className="relative aspect-video flex items-center justify-center bg-sky-50 text-sky-500">
          <ListChecks size={46} weight="fill" />
        </div>
        <div className="p-3 flex flex-col space-y-1.5">
          <h3 className="text-base font-bold text-gray-900 leading-tight line-clamp-1 flex items-center gap-1.5">
            {resource.public ? (
              <Globe size={13} className="text-gray-400 flex-none" />
            ) : (
              <Lock size={13} className="text-gray-400 flex-none" />
            )}
            <span className="truncate">{resource.title || t('library.untitled')}</span>
          </h3>
          <div className="pt-1.5 flex items-center justify-between border-t border-gray-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {t('library.tabs.question_sets')}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {questionCount === undefined
                ? '…'
                : t('question_sets.question_count', { count: questionCount })}
            </span>
          </div>
        </div>
      </button>

      <Modal
        isDialogOpen={editOpen}
        onOpenChange={setEditOpen}
        minHeight="lg"
        minWidth="lg"
        dialogTitle={t('question_sets.edit_question_set')}
        dialogContent={
          data ? (
            <div className="flex flex-col gap-6">
              <EditQuestionSetModal
                questionSet={data}
                orgslug={orgslug}
                closeModal={() => {}}
                onChanged={(updated) => mutate(updated, false)}
              />
              <div className="border-t border-gray-100 pt-4">
                <QuestionEditor
                  questionSetUuid={resource.question_set_uuid}
                  items={data.items}
                  accessToken={access_token}
                  onChanged={(updated) => mutate(updated, false)}
                />
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-gray-400">{t('library.loading', { defaultValue: 'Loading…' })}</div>
          )
        }
      />
    </div>
  )
}

export default QuestionSetItemCard
