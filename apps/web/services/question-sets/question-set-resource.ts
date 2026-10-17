import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
} from '@services/utils/ts/requests'

/*
 This file includes only POST, PUT, DELETE requests for the Question Set
 resource (and its nested questions). GET requests are called from the
 frontend using SWR (https://swr.vercel.app/) or react-query.
 (GET helpers are also exported here for server-side fetching, mirroring
 services/folders/folders.ts.)
*/

// `response_type` reuses the exact vocabulary shared with the course quiz
// grading code (apps/web/lib/quiz/modes.ts / apps/api .../quiz_modes.py).
export type QuestionResponseType = 'single' | 'multiple'

export interface QuestionChoice {
  id: string
  text: string
  correct: boolean
}

export interface QuestionOptions {
  choices: QuestionChoice[]
}

export interface QuestionSetItemRead {
  id: number
  question_set_id: number
  question_text: string
  response_type: QuestionResponseType
  options: QuestionOptions
  position: number
  creation_date: string
  update_date: string
}

export interface QuestionSetRead {
  id: number
  org_id: number
  question_set_uuid: string
  title: string
  description: string
  public: boolean
  creation_date: string
  update_date: string
}

export interface QuestionSetReadWithItems extends QuestionSetRead {
  items: QuestionSetItemRead[]
}

export interface QuestionSetCreateInput {
  org_id: number
  title: string
  description?: string
  public: boolean
  folder_uuid?: string
}

export interface QuestionSetUpdateInput {
  title?: string
  description?: string
  public?: boolean
}

export interface QuestionItemCreateInput {
  question_text: string
  response_type: QuestionResponseType
  options: QuestionOptions
}

export interface QuestionItemUpdateInput {
  question_text?: string
  response_type?: QuestionResponseType
  options?: QuestionOptions
}

// Matches the (functionally unused, but call-site-compatible) `next` param
// threaded through every other services/*/*.ts GET helper.
type FetchNextOptions = { revalidate?: number | false; tags?: string[] }

export function removeQuestionSetPrefix(question_set_uuid: string): string {
  return question_set_uuid.replace('question_set_', '')
}

export async function getQuestionSetById(
  question_set_uuid: string,
  access_token?: string,
  next?: FetchNextOptions | null
): Promise<QuestionSetReadWithItems> {
  const result = await fetch(
    `${getAPIUrl()}question_sets/${question_set_uuid}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function getOrgQuestionSets(
  org_id: number | string,
  access_token?: string,
  next?: FetchNextOptions | null,
  page: number = 1,
  limit: number = 100
): Promise<QuestionSetRead[]> {
  const result = await fetch(
    `${getAPIUrl()}question_sets/org/${org_id}/page/${page}/limit/${limit}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function createQuestionSet(
  question_set: QuestionSetCreateInput,
  access_token?: string
): Promise<QuestionSetReadWithItems> {
  const result = await fetch(
    `${getAPIUrl()}question_sets/`,
    RequestBodyWithAuthHeader('POST', question_set, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function updateQuestionSet(
  question_set_uuid: string,
  body: QuestionSetUpdateInput,
  access_token?: string
): Promise<QuestionSetReadWithItems> {
  const result = await fetch(
    `${getAPIUrl()}question_sets/${question_set_uuid}`,
    RequestBodyWithAuthHeader('PUT', body, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function deleteQuestionSet(
  question_set_uuid: string,
  access_token?: string
): Promise<{ detail: string }> {
  const result = await fetch(
    `${getAPIUrl()}question_sets/${question_set_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function addQuestion(
  question_set_uuid: string,
  item: QuestionItemCreateInput,
  access_token?: string
): Promise<QuestionSetReadWithItems> {
  const result = await fetch(
    `${getAPIUrl()}question_sets/${question_set_uuid}/questions`,
    RequestBodyWithAuthHeader('POST', item, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function updateQuestion(
  question_set_uuid: string,
  item_id: number,
  body: QuestionItemUpdateInput,
  access_token?: string
): Promise<QuestionSetReadWithItems> {
  const result = await fetch(
    `${getAPIUrl()}question_sets/${question_set_uuid}/questions/${item_id}`,
    RequestBodyWithAuthHeader('PUT', body, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function deleteQuestion(
  question_set_uuid: string,
  item_id: number,
  access_token?: string
): Promise<QuestionSetReadWithItems> {
  const result = await fetch(
    `${getAPIUrl()}question_sets/${question_set_uuid}/questions/${item_id}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function reorderQuestions(
  question_set_uuid: string,
  itemIdsOrdered: number[],
  access_token?: string
): Promise<QuestionSetReadWithItems> {
  const result = await fetch(
    `${getAPIUrl()}question_sets/${question_set_uuid}/questions/reorder`,
    RequestBodyWithAuthHeader(
      'PUT',
      { item_ids: itemIdsOrdered },
      null,
      access_token
    )
  )
  const res = await errorHandling(result)
  return res
}
