from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)


class AuthSession(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[int] = mapped_column(Integer, index=True)


class AuthLimit(Base):
    __tablename__ = "auth_limits"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[int] = mapped_column(Integer)
    attempts: Mapped[int] = mapped_column(Integer)


class Book(Base):
    __tablename__ = "books"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(160))
    author: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(Text)
    price_cents: Mapped[int] = mapped_column(Integer)
    stock: Mapped[int] = mapped_column(Integer)
    cover_color: Mapped[str] = mapped_column(String(7))
    published_year: Mapped[int] = mapped_column(Integer)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)


class ShelfItem(Base):
    __tablename__ = "shelf_items"
    __table_args__ = (UniqueConstraint("user_id", "book_id", name="uq_shelf_user_book"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
