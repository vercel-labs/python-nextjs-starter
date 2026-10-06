import os
from functools import lru_cache

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.pool import NullPool
from sqlalchemy.engine import make_url

load_dotenv()


class Base(DeclarativeBase):
    pass


def is_cloud():
    # vercel dev also sets VERCEL=1, but local HTTP cookies must remain usable.
    return os.getenv("VERCEL_ENV") in {"production", "preview"}


@lru_cache
def get_engine():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("Configure DATABASE_URL for the selected Neon environment.")
    if url.startswith(("postgres://", "postgresql://")):
        url = "postgresql+psycopg://" + url.split("://", 1)[1]
    if url.startswith("sqlite") and (is_cloud() or os.getenv("BOOKSTORE_TESTING") != "1"):
        raise RuntimeError("Use Neon Postgres for application environments. SQLite is only allowed in isolated tests.")
    if not url.startswith("sqlite") and make_url(url).query.get("sslmode") not in {"require", "verify-ca", "verify-full"}:
        raise RuntimeError("Neon connections must require TLS (sslmode=require or verify-full).")
    engine = create_engine(url, poolclass=NullPool, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {"connect_timeout": 10})
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
    return engine


def get_db():
    with Session(get_engine()) as session:
        yield session
