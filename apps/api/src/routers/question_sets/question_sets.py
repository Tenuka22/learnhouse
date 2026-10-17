from typing import List
from fastapi import APIRouter, Depends, Request
from src.core.events.database import get_db_session
from src.db.question_sets.question_sets import (
    QuestionSetCreate,
    QuestionSetItemCreate,
    QuestionSetItemReorder,
    QuestionSetItemUpdate,
    QuestionSetRead,
    QuestionSetReadWithItems,
    QuestionSetUpdate,
)
from src.security.auth import get_current_user
from src.services.users.users import PublicUser
from src.services.question_sets.question_sets import (
    add_question,
    create_question_set,
    delete_question,
    delete_question_set,
    get_question_set,
    get_question_set_list,
    reorder_questions,
    update_question,
    update_question_set,
)


router = APIRouter()


@router.post(
    "/",
    response_model=QuestionSetReadWithItems,
    summary="Create question set",
    description="Create a structured question set.",
)
async def api_create_question_set(
    request: Request,
    question_set_object: QuestionSetCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> QuestionSetReadWithItems:
    return await create_question_set(request, question_set_object, current_user, db_session)


@router.get(
    "/{question_set_uuid}",
    response_model=QuestionSetReadWithItems,
    summary="Get question set",
    description="Get a single question set, including its questions, by its UUID.",
)
async def api_get_question_set(
    request: Request,
    question_set_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> QuestionSetReadWithItems:
    return await get_question_set(request, question_set_uuid, current_user, db_session)


@router.get(
    "/org/{org_id}/page/{page}/limit/{limit}",
    response_model=List[QuestionSetRead],
    summary="List question sets for org",
    description="List question sets for an organization, paginated.",
)
async def api_get_question_set_list(
    request: Request,
    page: int,
    limit: int,
    org_id: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> List[QuestionSetRead]:
    return await get_question_set_list(request, org_id, current_user, db_session, page, limit)


@router.put(
    "/{question_set_uuid}",
    response_model=QuestionSetReadWithItems,
    summary="Update question set",
    description="Update a question set's metadata (title, description, public flag).",
)
async def api_update_question_set(
    request: Request,
    question_set_object: QuestionSetUpdate,
    question_set_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> QuestionSetReadWithItems:
    return await update_question_set(request, question_set_object, question_set_uuid, current_user, db_session)


@router.delete(
    "/{question_set_uuid}",
    summary="Delete question set",
    description="Delete a question set, its questions, and remove it from any folders.",
)
async def api_delete_question_set(
    request: Request,
    question_set_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
):
    return await delete_question_set(request, question_set_uuid, current_user, db_session)


@router.post(
    "/{question_set_uuid}/questions",
    response_model=QuestionSetReadWithItems,
    summary="Add question",
    description="Add a question to a question set.",
)
async def api_add_question(
    request: Request,
    question_set_uuid: str,
    item_object: QuestionSetItemCreate,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> QuestionSetReadWithItems:
    return await add_question(request, question_set_uuid, item_object, current_user, db_session)


@router.put(
    "/{question_set_uuid}/questions/reorder",
    response_model=QuestionSetReadWithItems,
    summary="Reorder questions",
    description="Persist the display order of a question set's questions.",
)
async def api_reorder_questions(
    request: Request,
    question_set_uuid: str,
    order: QuestionSetItemReorder,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> QuestionSetReadWithItems:
    return await reorder_questions(request, question_set_uuid, order, current_user, db_session)


@router.put(
    "/{question_set_uuid}/questions/{item_id}",
    response_model=QuestionSetReadWithItems,
    summary="Update question",
    description="Update one question in a question set.",
)
async def api_update_question(
    request: Request,
    question_set_uuid: str,
    item_id: int,
    item_object: QuestionSetItemUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> QuestionSetReadWithItems:
    return await update_question(request, question_set_uuid, item_id, item_object, current_user, db_session)


@router.delete(
    "/{question_set_uuid}/questions/{item_id}",
    response_model=QuestionSetReadWithItems,
    summary="Delete question",
    description="Remove one question from a question set.",
)
async def api_delete_question(
    request: Request,
    question_set_uuid: str,
    item_id: int,
    current_user: PublicUser = Depends(get_current_user),
    db_session=Depends(get_db_session),
) -> QuestionSetReadWithItems:
    return await delete_question(request, question_set_uuid, item_id, current_user, db_session)
