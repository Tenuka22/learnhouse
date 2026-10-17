'use client'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import FormLayout, {
  FormField,
  FormLabelAndMessage,
  ButtonBlack,
} from '@components/Objects/StyledElements/Form/Form'
import * as Form from '@radix-ui/react-form'
import { createQuestionSet } from '@services/question-sets/question-set-resource'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Globe, Lock } from 'lucide-react'
import { BarLoader } from 'react-spinners'
import toast from 'react-hot-toast'
import { useFormik } from 'formik'
import * as Yup from 'yup'
import { useTranslation } from 'react-i18next'

type Props = {
  orgslug: string
  folderUuid?: string
  closeModal: () => void
  onChanged?: () => void
}

function CreateQuestionSetModal({ folderUuid, closeModal, onChanged }: Props) {
  const { t } = useTranslation()
  const org = useOrg()
  const session = useLHSession()
  const access_token = session?.data?.tokens?.access_token

  const validationSchema = Yup.object().shape({
    title: Yup.string().required(t('question_sets.title_required')).max(200),
    description: Yup.string().max(2000),
    public: Yup.boolean(),
  })

  const formik = useFormik({
    initialValues: {
      title: '',
      description: '',
      public: true,
    },
    validationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      const toastId = toast.loading(t('question_sets.creating_question_set'))
      try {
        await createQuestionSet(
          {
            org_id: org.id,
            title: values.title,
            description: values.description,
            public: values.public,
            ...(folderUuid ? { folder_uuid: folderUuid } : {}),
          },
          access_token
        )
        toast.success(t('question_sets.question_set_created_success'))
        closeModal()
        onChanged?.()
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : undefined
        toast.error(message || t('question_sets.question_set_created_error'))
      } finally {
        toast.dismiss(toastId)
        setSubmitting(false)
      }
    },
  })

  return (
    <FormLayout onSubmit={formik.handleSubmit}>
      <FormField name="title">
        <FormLabelAndMessage label={t('question_sets.title')} message={formik.errors.title} />
        <Form.Control asChild>
          <Input onChange={formik.handleChange} value={formik.values.title} type="text" required />
        </Form.Control>
      </FormField>

      <FormField name="description">
        <FormLabelAndMessage label={t('question_sets.description')} message={formik.errors.description} />
        <Form.Control asChild>
          <Textarea onChange={formik.handleChange} value={formik.values.description} />
        </Form.Control>
      </FormField>

      <FormField name="public">
        <FormLabelAndMessage label={t('question_sets.public')} />
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={() => formik.setFieldValue('public', true)}
            className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
              formik.values.public
                ? 'bg-white border-indigo-200 ring-1 ring-indigo-100 text-gray-900'
                : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Globe className="w-4 h-4" /> {t('question_sets.public')}
          </button>
          <button
            type="button"
            onClick={() => formik.setFieldValue('public', false)}
            className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
              !formik.values.public
                ? 'bg-white border-indigo-200 ring-1 ring-indigo-100 text-gray-900'
                : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Lock className="w-4 h-4" /> {t('question_sets.private')}
          </button>
        </div>
      </FormField>

      <div className="flex justify-end mt-6">
        <ButtonBlack
          type="submit"
          disabled={formik.isSubmitting}
          state={formik.isSubmitting ? 'loading' : 'none'}
        >
          {formik.isSubmitting ? (
            <BarLoader cssOverride={{ borderRadius: 60 }} width={60} color="#ffffff" />
          ) : (
            t('question_sets.create_question_set')
          )}
        </ButtonBlack>
      </div>
    </FormLayout>
  )
}

export default CreateQuestionSetModal
