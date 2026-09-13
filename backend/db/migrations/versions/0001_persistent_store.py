"""Persistent knowledge corpus, pgvector, sessions, and saved solutions."""

from datetime import datetime

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql as pg

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def timestamps() -> list[sa.Column[datetime]]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "knowledge_sources",
        sa.Column("id", pg.UUID(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(30), nullable=False),
        sa.Column("technology", sa.String(200)),
        sa.Column("version", sa.String(200)),
        sa.Column("path", sa.Text()),
        sa.Column("url", sa.Text()),
        sa.Column("file_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("error_message", sa.String(500)),
        *timestamps(),
        sa.CheckConstraint(
            "status IN ('uploaded','processing','chunked','ready_for_embedding','indexed','failed')",
            name="ck_source_status",
        ),
    )
    op.create_index("ix_knowledge_sources_status", "knowledge_sources", ["status"])
    op.create_table(
        "documents",
        sa.Column("id", pg.UUID(), primary_key=True),
        sa.Column("source_id", pg.UUID(), sa.ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_index", sa.Integer(), nullable=False),
        sa.Column("page_content", sa.Text(), nullable=False),
        sa.Column("page_number", sa.Integer()),
        sa.Column("title", sa.Text()),
        sa.Column("section", sa.Text()),
        sa.Column("metadata", pg.JSONB(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        timestamps()[0],
        sa.UniqueConstraint("source_id", "content_hash", name="uq_document_source_content"),
        sa.UniqueConstraint("id", "source_id", name="uq_document_id_source"),
    )
    op.create_index("ix_documents_source_id", "documents", ["source_id"])
    op.create_table(
        "document_chunks",
        sa.Column("id", pg.UUID(), primary_key=True),
        sa.Column("document_id", pg.UUID(), nullable=False),
        sa.Column("source_id", pg.UUID(), sa.ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chunk_id", sa.String(128), nullable=False, unique=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("metadata", pg.JSONB(), nullable=False),
        sa.Column("embedding", Vector()),
        sa.Column("embedding_model", sa.String(200)),
        sa.Column("embedding_dimension", sa.Integer()),
        sa.Column(
            "search_text", pg.TSVECTOR(), sa.Computed("to_tsvector('simple', content)", persisted=True), nullable=False
        ),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["document_id", "source_id"], ["documents.id", "documents.source_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("source_id", "content_hash", name="uq_chunk_source_content"),
        sa.CheckConstraint(
            "(embedding IS NULL AND embedding_model IS NULL AND embedding_dimension IS NULL) OR "
            "(embedding IS NOT NULL AND embedding_model IS NOT NULL AND embedding_dimension IS NOT NULL "
            "AND embedding_dimension > 0 AND vector_dims(embedding) = embedding_dimension)",
            name="ck_embedding_metadata",
        ),
    )
    op.create_index("ix_document_chunks_document_id", "document_chunks", ["document_id"])
    op.create_index("ix_document_chunks_source_id", "document_chunks", ["source_id"])
    op.create_index("ix_chunk_search", "document_chunks", ["search_text"], postgresql_using="gin")
    op.create_table(
        "debug_sessions",
        sa.Column("id", pg.UUID(), primary_key=True),
        sa.Column("diagnosis", pg.JSONB(), nullable=False),
        *timestamps(),
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", pg.UUID(), primary_key=True),
        sa.Column("session_id", pg.UUID(), sa.ForeignKey("debug_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payload", pg.JSONB(), nullable=False),
        timestamps()[0],
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])
    op.create_table(
        "saved_solutions",
        sa.Column("id", pg.UUID(), primary_key=True),
        sa.Column("payload", pg.JSONB(), nullable=False),
        *timestamps(),
    )


def downgrade() -> None:
    for table in (
        "saved_solutions",
        "chat_messages",
        "debug_sessions",
        "document_chunks",
        "documents",
        "knowledge_sources",
    ):
        op.drop_table(table)
    # The extension may be shared by other applications; retain it on downgrade.
