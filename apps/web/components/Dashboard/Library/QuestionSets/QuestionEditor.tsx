'use client'
import React from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Plus, Trash2, GripVertical, ListChecks } from 'lucide-react'
import {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  type QuestionSetItemRead,
  type QuestionSetReadWithItems,
  type QuestionItemUpdateInput,
  type QuestionChoice,
  type QuestionResponseType,
} from '@services/question-sets/question-set-resource'
import { QUIZ_RESPONSE_SINGLE, QUIZ_RESPONSE_MULTIPLE } from '@/lib/quiz/modes'

type Props = {
  questionSetUuid: string
  items: QuestionSetItemRead[]
  accessToken?: string
  onChanged: (_updated: QuestionSetReadWithItems) => void
}

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

function QuestionEditor({ questionSetUuid, items, accessToken, onChanged }: Props) {
  const { t } = useTranslation()
  const [questions, setQuestions] = React.useState<QuestionSetItemRead[]>(items)
  const [pending, setPending] = React.useState<Set<number>>(new Set())

  React.useEffect(() => {
    setQuestions(items)
  }, [items])

  const markPending = (itemId: number, isPending: boolean) => {
    setPending((prev) => {
      const next = new Set(prev)
      if (isPending) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  const persistQuestion = async (itemId: number, patch: QuestionItemUpdateInput) => {
    markPending(itemId, true)
    try {
      const updated = await updateQuestion(questionSetUuid, itemId, patch, accessToken)
      setQuestions(updated.items)
      onChanged(updated)
    } catch (error: unknown) {
      toast.error(errorMessage(error) || t('question_sets.question_updated_error'))
    } finally {
      markPending(itemId, false)
    }
  }

  const handleAddQuestion = async () => {
    try {
      const updated = await addQuestion(
        questionSetUuid,
        { question_text: '', response_type: QUIZ_RESPONSE_SINGLE, options: { choices: [] } },
        accessToken
      )
      setQuestions(updated.items)
      onChanged(updated)
    } catch (error: unknown) {
      toast.error(errorMessage(error) || t('question_sets.question_added_error'))
    }
  }

  const handleRemoveQuestion = async (itemId: number) => {
    markPending(itemId, true)
    try {
      const updated = await deleteQuestion(questionSetUuid, itemId, accessToken)
      setQuestions(updated.items)
      onChanged(updated)
    } catch (error: unknown) {
      toast.error(errorMessage(error) || t('question_sets.question_deleted_error'))
      markPending(itemId, false)
    }
  }

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    if (result.destination.index === result.source.index) return
    const previous = questions
    const reordered = Array.from(questions)
    const [moved] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, moved)
    setQuestions(reordered)
    try {
      const updated = await reorderQuestions(
        questionSetUuid,
        reordered.map((q) => q.id),
        accessToken
      )
      setQuestions(updated.items)
      onChanged(updated)
    } catch (error: unknown) {
      setQuestions(previous)
      toast.error(errorMessage(error) || t('question_sets.reorder_error'))
    }
  }

  const updateQuestionTextLocal = (itemId: number, question_text: string) => {
    setQuestions((prev) => prev.map((q) => (q.id === itemId ? { ...q, question_text } : q)))
  }

  const updateOptionTextLocal = (question: QuestionSetItemRead, choiceId: string, text: string) => {
    const choices = question.options.choices.map((c) => (c.id === choiceId ? { ...c, text } : c))
    setQuestions((prev) => prev.map((q) => (q.id === question.id ? { ...q, options: { choices } } : q)))
  }

  const changeResponseType = (question: QuestionSetItemRead, response_type: QuestionResponseType) => {
    setQuestions((prev) => prev.map((q) => (q.id === question.id ? { ...q, response_type } : q)))
    persistQuestion(question.id, { response_type })
  }

  const toggleCorrect = (question: QuestionSetItemRead, choiceId: string) => {
    const isSingle = question.response_type === QUIZ_RESPONSE_SINGLE
    const choices = question.options.choices.map((c) => {
      if (isSingle) return { ...c, correct: c.id === choiceId }
      return c.id === choiceId ? { ...c, correct: !c.correct } : c
    })
    const options = { choices }
    setQuestions((prev) => prev.map((q) => (q.id === question.id ? { ...q, options } : q)))
    persistQuestion(question.id, { options })
  }

  const addOption = (question: QuestionSetItemRead) => {
    const newChoice: QuestionChoice = { id: crypto.randomUUID(), text: '', correct: false }
    const options = { choices: [...question.options.choices, newChoice] }
    setQuestions((prev) => prev.map((q) => (q.id === question.id ? { ...q, options } : q)))
    persistQuestion(question.id, { options })
  }

  const removeOption = (question: QuestionSetItemRead, choiceId: string) => {
    const options = { choices: question.options.choices.filter((c) => c.id !== choiceId) }
    setQuestions((prev) => prev.map((q) => (q.id === question.id ? { ...q, options } : q)))
    persistQuestion(question.id, { options })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <ListChecks className="w-4 h-4" /> {t('question_sets.questions')}
        </h3>
        <button
          type="button"
          onClick={handleAddQuestion}
          className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white nice-shadow hover:bg-neutral-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t('question_sets.add_question')}
        </button>
      </div>

      {questions.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
          {t('question_sets.no_questions')}
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="questions" direction="vertical">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-3">
                {questions.map((question, index) => (
                  <Draggable key={question.id} draggableId={String(question.id)} index={index}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={`rounded-xl border border-gray-100 bg-white p-3 transition-opacity ${
                          snapshot.isDragging ? 'z-drag-overlay shadow-lg' : ''
                        } ${pending.has(question.id) ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            {...dragProvided.dragHandleProps}
                            className="mt-2 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors flex-none"
                            title={t('library.sort.drag_to_reorder', { defaultValue: 'Drag to reorder' })}
                          >
                            <GripVertical size={16} />
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                defaultValue={question.question_text}
                                onChange={(e) => updateQuestionTextLocal(question.id, e.target.value)}
                                onBlur={() => persistQuestion(question.id, { question_text: question.question_text })}
                                placeholder={t('question_sets.question_text_placeholder')}
                                className="flex-1 min-w-0 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
                              />
                              <select
                                value={question.response_type}
                                onChange={(e) => changeResponseType(question, e.target.value as QuestionResponseType)}
                                className="rounded-lg border border-gray-100 bg-gray-50/60 px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black/10"
                              >
                                <option value={QUIZ_RESPONSE_SINGLE}>{t('question_sets.single_choice')}</option>
                                <option value={QUIZ_RESPONSE_MULTIPLE}>{t('question_sets.multiple_choice')}</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveQuestion(question.id)}
                                aria-label={t('question_sets.remove_question')}
                                title={t('question_sets.remove_question')}
                                className="p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex-none"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            <div className="flex flex-col gap-1.5 ps-1">
                              {question.options.choices.length === 0 && (
                                <p className="text-xs text-gray-400">{t('question_sets.no_options')}</p>
                              )}
                              {question.options.choices.map((choice) => (
                                <div key={choice.id} className="flex items-center gap-2">
                                  <input
                                    type={question.response_type === QUIZ_RESPONSE_SINGLE ? 'radio' : 'checkbox'}
                                    name={`correct-${question.id}`}
                                    checked={choice.correct}
                                    onChange={() => toggleCorrect(question, choice.id)}
                                    title={t('question_sets.correct_answer')}
                                    className="flex-none"
                                  />
                                  <input
                                    type="text"
                                    defaultValue={choice.text}
                                    onChange={(e) => updateOptionTextLocal(question, choice.id, e.target.value)}
                                    onBlur={() => persistQuestion(question.id, { options: question.options })}
                                    placeholder={t('question_sets.option_text_placeholder')}
                                    className="flex-1 min-w-0 rounded-lg border border-gray-100 bg-white px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeOption(question, choice.id)}
                                    aria-label={t('question_sets.remove_option')}
                                    className="p-1 rounded-md text-gray-300 hover:text-rose-600 hover:bg-rose-50 transition-colors flex-none"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => addOption(question)}
                                className="self-start inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 mt-0.5"
                              >
                                <Plus className="w-3 h-3" /> {t('question_sets.add_option')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  )
}

export default QuestionEditor
