from typing import Optional, List
from sqlalchemy import Column, ForeignKey, Integer, BigInteger, JSON
from sqlmodel import Field, SQLModel

from src.services.courses.activities.quiz_modes import RESPONSE_TYPE_SINGLE


class QuestionSetBase(SQLModel):
    title: str
    description: Optional[str] = ""
    public: bool = True


class QuestionSet(QuestionSetBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(
            BigInteger, ForeignKey("organization.id", ondelete="CASCADE"), index=True
        )
    )
    question_set_uuid: str = Field(default="", index=True)
    creation_date: str = ""
    update_date: str = ""


class QuestionSetCreate(QuestionSetBase):
    org_id: int = Field(default=None, foreign_key="organization.id")
    # Optional: place into a folder right away
    folder_uuid: Optional[str] = None


class QuestionSetUpdate(SQLModel):
    title: Optional[str] = None
    description: Optional[str] = None
    public: Optional[bool] = None


class QuestionSetRead(QuestionSetBase):
    id: int
    org_id: int
    question_set_uuid: str
    creation_date: str
    update_date: str


# ----------------------------------------------------------------------------
# Question items
# ----------------------------------------------------------------------------
# `response_type` reuses the exact vocabulary defined by
# src.services.courses.activities.quiz_modes (RESPONSE_TYPE_SINGLE /
# RESPONSE_TYPE_MULTIPLE) and `options` follows the same options/correct-answer
# JSON shape used inside a BLOCK_QUIZ Block.content dict, so a question set
# item can be dropped into a course quiz block without reshaping.


class QuestionSetItemBase(SQLModel):
    question_text: str
    response_type: str = Field(default=RESPONSE_TYPE_SINGLE)
    # List of {"id": str, "text": str, "correct": bool} dicts, mirroring the
    # quiz Block.content "options" convention (see quiz_modes.py).
    options: dict = Field(default_factory=dict, sa_column=Column(JSON))
    position: int = 0


class QuestionSetItem(QuestionSetItemBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    question_set_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("questionset.id", ondelete="CASCADE"), index=True
        )
    )
    creation_date: str = ""
    update_date: str = ""


class QuestionSetItemCreate(SQLModel):
    question_text: str
    response_type: str = RESPONSE_TYPE_SINGLE
    options: dict = Field(default_factory=dict)


class QuestionSetItemUpdate(SQLModel):
    question_text: Optional[str] = None
    response_type: Optional[str] = None
    options: Optional[dict] = None


class QuestionSetItemRead(QuestionSetItemBase):
    id: int
    question_set_id: int
    creation_date: str
    update_date: str


class QuestionSetReadWithItems(QuestionSetRead):
    items: List[QuestionSetItemRead] = []


class QuestionSetItemReorder(SQLModel):
    # Question item ids in the desired display order; position = array index.
    item_ids: List[int]
