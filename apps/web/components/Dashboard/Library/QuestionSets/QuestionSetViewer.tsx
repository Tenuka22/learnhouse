'use client'
import { useTranslation } from 'react-i18next'
import { ListChecks } from 'lucide-react'
import {
  QUIZ_RESPONSE_SINGLE,
} from '@/lib/quiz/modes'
import type { QuestionSetItemRead } from '@services/question-sets/question-set-resource'

/**
 * Read-only question/answer renderer: question text + its options, with NO
 * correct-answer flags revealed. Shared by the public folder tile preview and
 * the standalone /library/question-set/[id] direct-view route.
 */
function QuestionSetViewer({ items }: { items: QuestionSetItemRead[] }) {
  const { t } = useTranslation()

  if (items.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
        {t('question_sets.no_questions')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((question, index) => (
        <div key={question.id} className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-start gap-2">
            <span className="flex-none inline-flex items-center justify-center w-6 h-6 rounded-full bg-sky-50 text-sky-600 text-xs font-bold">
              {index + 1}
            </span>
            <p className="font-semibold text-gray-900 leading-snug">{question.question_text}</p>
          </div>
          {question.options.choices.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5 ps-8">
              {question.options.choices.map((choice) => (
                <div key={choice.id} className="flex items-center gap-2 text-sm text-gray-600">
                  <span
                    className={`flex-none w-3.5 h-3.5 border border-gray-300 ${
                      question.response_type === QUIZ_RESPONSE_SINGLE ? 'rounded-full' : 'rounded-[3px]'
                    }`}
                  />
                  <span>{choice.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <p className="flex items-center gap-1.5 text-xs text-gray-400 justify-end">
        <ListChecks className="w-3.5 h-3.5" /> {t('question_sets.question_count', { count: items.length })}
      </p>
    </div>
  )
}

export default QuestionSetViewer
