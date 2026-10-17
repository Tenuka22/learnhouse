"""Merge the question_sets and used_link_tokens migration heads

Both ``c9d0e1f2a3b4`` (question sets, this fork) and ``d7e8f9a0b1c2`` (used link
tokens, upstream) declare ``down_revision = 'b6e199d023f8'``. Merging upstream
into this fork therefore left two open heads, and ``alembic upgrade head`` fails
with "Multiple head revisions are present". This empty revision joins them so
the chain is linear again.

Revision ID: e1f2a3b4c5d6
Revises: c9d0e1f2a3b4, d7e8f9a0b1c2
Create Date: 2026-10-17 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa  # noqa: F401
import sqlmodel  # noqa: F401

# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = ('c9d0e1f2a3b4', 'd7e8f9a0b1c2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
