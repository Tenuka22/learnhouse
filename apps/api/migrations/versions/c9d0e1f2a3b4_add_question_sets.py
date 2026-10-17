"""Add question_sets (structured question sets library resource)

Adds `questionset` (org-scoped, public/private like Folder/Media) and
`questionsetitem` (ordered child questions, response_type + options JSON
mirroring the BLOCK_QUIZ convention in quiz_modes.py).

Revision ID: c9d0e1f2a3b4
Revises: b6e199d023f8
Create Date: 2026-10-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b6e199d023f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    # ── questionset ─────────────────────────────────────────────────────
    if 'questionset' not in tables:
        op.create_table(
            'questionset',
            sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
            sa.Column('org_id', sa.BigInteger(), nullable=False),
            sa.Column('question_set_uuid', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default=''),
            sa.Column('title', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True, server_default=''),
            sa.Column('public', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default=''),
            sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default=''),
            sa.ForeignKeyConstraint(['org_id'], ['organization.id'], ondelete='CASCADE'),
        )
        op.create_index('ix_questionset_question_set_uuid', 'questionset', ['question_set_uuid'])
        op.create_index('ix_questionset_org_id', 'questionset', ['org_id'])

    # ── questionsetitem ─────────────────────────────────────────────────
    if 'questionsetitem' not in tables:
        op.create_table(
            'questionsetitem',
            sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
            sa.Column('question_set_id', sa.Integer(), nullable=False),
            sa.Column('question_text', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
            sa.Column('response_type', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default='single'),
            sa.Column('options', sa.JSON(), nullable=False),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('creation_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default=''),
            sa.Column('update_date', sqlmodel.sql.sqltypes.AutoString(), nullable=False, server_default=''),
            sa.ForeignKeyConstraint(['question_set_id'], ['questionset.id'], ondelete='CASCADE'),
        )
        op.create_index('ix_questionsetitem_question_set_id', 'questionsetitem', ['question_set_id'])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for tbl in ('questionsetitem', 'questionset'):
        if tbl in tables:
            op.drop_table(tbl)
