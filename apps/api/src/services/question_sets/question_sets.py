from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.organizations import Organization
from src.db.users import AnonymousUser, APITokenUser, PublicUser
from src.db.question_sets.question_sets import (
    QuestionSet,
    QuestionSetCreate,
    QuestionSetItem,
    QuestionSetItemCreate,
    QuestionSetItemRead,
    QuestionSetItemReorder,
    QuestionSetItemUpdate,
    QuestionSetRead,
    QuestionSetReadWithItems,
    QuestionSetUpdate,
)
from src.db.resource_authors import (
    ResourceAuthor,
    ResourceAuthorshipEnum,
    ResourceAuthorshipStatusEnum,
)
from src.security.auth import resolve_acting_user_id
from src.security.org_auth import require_org_role_permission
from src.security.rbac import check_resource_access, AccessAction
from src.services.courses.activities.quiz_modes import RESPONSE_TYPES


async def _get_org_uuid(db_session: AsyncSession, org_id: int) -> str:
    org = (
        await db_session.execute(select(Organization).where(Organization.id == org_id))
    ).scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org.org_uuid


def _validate_response_type(response_type: str) -> str:
    if response_type not in RESPONSE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid response_type; must be one of {RESPONSE_TYPES}",
        )
    return response_type


async def _get_question_set_or_404(
    db_session: AsyncSession, question_set_uuid: str
) -> QuestionSet:
    question_set = (
        await db_session.execute(
            select(QuestionSet).where(QuestionSet.question_set_uuid == question_set_uuid)
        )
    ).scalars().first()
    if not question_set:
        raise HTTPException(status_code=404, detail="Question set not found")
    return question_set


async def _get_items(db_session: AsyncSession, question_set_id: int) -> List[QuestionSetItem]:
    rows = (
        await db_session.execute(
            select(QuestionSetItem)
            .where(QuestionSetItem.question_set_id == question_set_id)
            .order_by(QuestionSetItem.position.asc())
        )
    ).scalars().all()
    return list(rows)


async def _question_set_to_read(
    db_session: AsyncSession, question_set: QuestionSet
) -> QuestionSetReadWithItems:
    items = await _get_items(db_session, question_set.id)
    data = QuestionSetRead.model_validate(question_set).model_dump()
    data["items"] = [QuestionSetItemRead.model_validate(item) for item in items]
    return QuestionSetReadWithItems.model_validate(data)


# ----------------------------------------------------------------------------
# CRUD: question sets
# ----------------------------------------------------------------------------


async def create_question_set(
    request: Request,
    question_set_object: QuestionSetCreate,
    current_user: PublicUser,
    db_session: AsyncSession,
) -> QuestionSetReadWithItems:
    # Resolve the target org before authorizing so an org that does not exist
    # still answers 404 rather than "not a member of it".
    await _get_org_uuid(db_session, question_set_object.org_id)

    if isinstance(current_user, APITokenUser) and current_user.org_id != question_set_object.org_id:
        raise HTTPException(
            status_code=403,
            detail="API token cannot access resources outside its organization",
        )

    # `question_set_x` is a placeholder, not a real uuid: RBAC cannot resolve a
    # target org from it, so pin the create right to the caller-supplied org
    # first (mirrors create_media()/create_folder()).
    await require_org_role_permission(
        resolve_acting_user_id(current_user),
        question_set_object.org_id,
        db_session,
        "question_sets",
        "action_create",
    )
    await check_resource_access(
        request, db_session, current_user, "question_set_x", AccessAction.CREATE
    )

    question_set = QuestionSet(
        title=question_set_object.title,
        description=question_set_object.description or "",
        public=question_set_object.public,
        org_id=question_set_object.org_id,
        question_set_uuid=f"question_set_{uuid4()}",
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )

    db_session.add(question_set)
    await db_session.commit()
    await db_session.refresh(question_set)

    user_id = resolve_acting_user_id(current_user)
    if user_id:
        db_session.add(
            ResourceAuthor(
                resource_uuid=question_set.question_set_uuid,
                user_id=user_id,
                authorship=ResourceAuthorshipEnum.CREATOR,
                authorship_status=ResourceAuthorshipStatusEnum.ACTIVE,
                creation_date=str(datetime.now()),
                update_date=str(datetime.now()),
            )
        )
        await db_session.commit()
        await db_session.refresh(question_set)

    # Place into a folder, or at the library root (Drive-like) when no folder
    # given, so a new question set always appears in the library.
    if question_set_object.folder_uuid:
        from src.services.folders.folders import add_folder_content

        await add_folder_content(
            request,
            question_set_object.folder_uuid,
            question_set.question_set_uuid,
            current_user,
            db_session,
        )
    else:
        from src.services.folders.folders import add_org_root_content

        await add_org_root_content(
            request, question_set_object.org_id, question_set.question_set_uuid, current_user, db_session
        )
    await db_session.refresh(question_set)

    return await _question_set_to_read(db_session, question_set)


async def get_question_set(
    request: Request,
    question_set_uuid: str,
    current_user: PublicUser | AnonymousUser,
    db_session: AsyncSession,
) -> QuestionSetReadWithItems:
    question_set = await _get_question_set_or_404(db_session, question_set_uuid)

    await check_resource_access(
        request, db_session, current_user, question_set.question_set_uuid, AccessAction.READ
    )
    return await _question_set_to_read(db_session, question_set)


async def update_question_set(
    request: Request,
    question_set_object: QuestionSetUpdate,
    question_set_uuid: str,
    current_user: PublicUser,
    db_session: AsyncSession,
) -> QuestionSetReadWithItems:
    question_set = await _get_question_set_or_404(db_session, question_set_uuid)

    await check_resource_access(
        request, db_session, current_user, question_set.question_set_uuid, AccessAction.UPDATE
    )

    data = question_set_object.model_dump(exclude_unset=True)
    for key, value in data.items():
        if value is not None:
            setattr(question_set, key, value)
    question_set.update_date = str(datetime.now())
    db_session.add(question_set)
    await db_session.commit()
    await db_session.refresh(question_set)
    return await _question_set_to_read(db_session, question_set)


async def delete_question_set(
    request: Request,
    question_set_uuid: str,
    current_user: PublicUser,
    db_session: AsyncSession,
):
    question_set = await _get_question_set_or_404(db_session, question_set_uuid)

    await check_resource_access(
        request, db_session, current_user, question_set.question_set_uuid, AccessAction.DELETE
    )

    from src.db.folders.folder_content import FolderContent

    placements = (
        await db_session.execute(
            select(FolderContent).where(FolderContent.resource_uuid == question_set_uuid)
        )
    ).scalars().all()
    for placement in placements:
        await db_session.delete(placement)

    for item in await _get_items(db_session, question_set.id):
        await db_session.delete(item)

    await db_session.delete(question_set)
    await db_session.commit()
    return {"detail": "Question set deleted"}


# ----------------------------------------------------------------------------
# CRUD: questions within a set
# ----------------------------------------------------------------------------


async def add_question(
    request: Request,
    question_set_uuid: str,
    item_object: QuestionSetItemCreate,
    current_user: PublicUser,
    db_session: AsyncSession,
) -> QuestionSetReadWithItems:
    question_set = await _get_question_set_or_404(db_session, question_set_uuid)

    await check_resource_access(
        request, db_session, current_user, question_set.question_set_uuid, AccessAction.UPDATE
    )

    response_type = _validate_response_type(item_object.response_type)
    existing = await _get_items(db_session, question_set.id)
    next_position = max((item.position for item in existing), default=-1) + 1

    item = QuestionSetItem(
        question_set_id=question_set.id,
        question_text=item_object.question_text,
        response_type=response_type,
        options=item_object.options or {},
        position=next_position,
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db_session.add(item)
    question_set.update_date = str(datetime.now())
    db_session.add(question_set)
    await db_session.commit()
    await db_session.refresh(question_set)
    return await _question_set_to_read(db_session, question_set)


async def _get_item_or_404(
    db_session: AsyncSession, question_set: QuestionSet, item_id: int
) -> QuestionSetItem:
    item = (
        await db_session.execute(
            select(QuestionSetItem).where(
                QuestionSetItem.id == item_id,
                QuestionSetItem.question_set_id == question_set.id,
            )
        )
    ).scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Question not found")
    return item


async def update_question(
    request: Request,
    question_set_uuid: str,
    item_id: int,
    item_object: QuestionSetItemUpdate,
    current_user: PublicUser,
    db_session: AsyncSession,
) -> QuestionSetReadWithItems:
    question_set = await _get_question_set_or_404(db_session, question_set_uuid)

    await check_resource_access(
        request, db_session, current_user, question_set.question_set_uuid, AccessAction.UPDATE
    )

    item = await _get_item_or_404(db_session, question_set, item_id)

    data = item_object.model_dump(exclude_unset=True)
    if "response_type" in data and data["response_type"] is not None:
        data["response_type"] = _validate_response_type(data["response_type"])
    for key, value in data.items():
        if value is not None:
            setattr(item, key, value)
    item.update_date = str(datetime.now())
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(question_set)
    return await _question_set_to_read(db_session, question_set)


async def delete_question(
    request: Request,
    question_set_uuid: str,
    item_id: int,
    current_user: PublicUser,
    db_session: AsyncSession,
) -> QuestionSetReadWithItems:
    question_set = await _get_question_set_or_404(db_session, question_set_uuid)

    await check_resource_access(
        request, db_session, current_user, question_set.question_set_uuid, AccessAction.UPDATE
    )

    item = await _get_item_or_404(db_session, question_set, item_id)
    await db_session.delete(item)
    await db_session.commit()
    await db_session.refresh(question_set)
    return await _question_set_to_read(db_session, question_set)


async def reorder_questions(
    request: Request,
    question_set_uuid: str,
    order: QuestionSetItemReorder,
    current_user: PublicUser,
    db_session: AsyncSession,
) -> QuestionSetReadWithItems:
    question_set = await _get_question_set_or_404(db_session, question_set_uuid)

    await check_resource_access(
        request, db_session, current_user, question_set.question_set_uuid, AccessAction.UPDATE
    )

    existing = await _get_items(db_session, question_set.id)
    existing_by_id = {item.id: item for item in existing}
    if set(order.item_ids) != set(existing_by_id.keys()):
        raise HTTPException(
            status_code=400, detail="item_ids must match the set's existing question ids exactly"
        )

    for position, item_id in enumerate(order.item_ids):
        item = existing_by_id[item_id]
        item.position = position
        db_session.add(item)
    await db_session.commit()
    await db_session.refresh(question_set)
    return await _question_set_to_read(db_session, question_set)


async def get_question_set_list(
    request: Request,
    org_id: str,
    current_user: PublicUser | AnonymousUser | APITokenUser,
    db_session: AsyncSession,
    page: int = 1,
    limit: int = 50,
) -> List[QuestionSetRead]:
    org_id_int = int(org_id)
    page = max(1, int(page if page is not None else 1))
    limit = min(max(1, int(limit if limit is not None else 50)), 100)
    user_id = resolve_acting_user_id(current_user)

    from src.security.org_auth import is_org_member

    restricted = not user_id or not await is_org_member(user_id, org_id_int, db_session)
    statement = select(QuestionSet).where(QuestionSet.org_id == org_id_int)
    if restricted:
        statement = statement.where(QuestionSet.public == True)  # noqa: E712
        from src.db.folders.folder_content import FolderContent
        from src.db.folders.folders import Folder

        private_sets = (
            select(FolderContent.resource_uuid)
            .join(Folder, Folder.id == FolderContent.folder_id)
            .where(Folder.public == False)  # noqa: E712
        )
        statement = statement.where(QuestionSet.question_set_uuid.not_in(private_sets))
    statement = statement.offset((page - 1) * limit).limit(limit)
    question_sets = (await db_session.execute(statement)).scalars().all()
    return [QuestionSetRead.model_validate(q) for q in question_sets]
