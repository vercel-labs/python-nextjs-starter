"""Initial bookstore schema. Run explicitly before deploying application code."""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users", sa.Column("id", sa.String(36), primary_key=True), sa.Column("name", sa.String(80), nullable=False), sa.Column("email", sa.String(254), nullable=False, unique=True), sa.Column("password_hash", sa.String(255), nullable=False), sa.Column("is_admin", sa.Boolean(), nullable=False))
    op.create_table("books", sa.Column("id", sa.String(36), primary_key=True), sa.Column("title", sa.String(160), nullable=False), sa.Column("author", sa.String(120), nullable=False), sa.Column("category", sa.String(40), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("price_cents", sa.Integer(), nullable=False), sa.Column("stock", sa.Integer(), nullable=False), sa.Column("cover_color", sa.String(7), nullable=False), sa.Column("published_year", sa.Integer(), nullable=False), sa.Column("featured", sa.Boolean(), nullable=False))
    op.create_table("sessions", sa.Column("token_hash", sa.String(64), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("expires_at", sa.Integer(), nullable=False))
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_table("auth_limits", sa.Column("key", sa.String(64), primary_key=True), sa.Column("window_start", sa.Integer(), nullable=False), sa.Column("attempts", sa.Integer(), nullable=False))
    op.create_table("shelf_items", sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("book_id", sa.String(36), sa.ForeignKey("books.id", ondelete="CASCADE"), nullable=False), sa.UniqueConstraint("user_id", "book_id", name="uq_shelf_user_book"))
    op.create_index("ix_shelf_items_user_id", "shelf_items", ["user_id"])


def downgrade():
    for table in ["shelf_items", "auth_limits", "sessions", "books", "users"]:
        op.drop_table(table)
