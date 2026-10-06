"""Prepare a template database during the Python service build, never on requests."""
import os
import time

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.database import get_engine
from scripts.bootstrap_admin import prepare_admin
from scripts.seed import main as seed

LOCK_ID = 724019310


def prepare(connection, *, postgres=True):
    acquired = False
    try:
        if postgres:
            deadline = time.monotonic() + 60
            while not connection.scalar(text("SELECT pg_try_advisory_lock(:key)"), {"key": LOCK_ID}):
                connection.commit()
                if time.monotonic() >= deadline:
                    raise RuntimeError("Database setup is busy; retry this deployment.")
                time.sleep(1)
            acquired = True
            connection.commit()
        existing_schema = inspect(connection).has_table("alembic_version")
        connection.execute(text("CREATE TABLE IF NOT EXISTS bookstore_bootstrap (id INTEGER PRIMARY KEY, completed BOOLEAN NOT NULL)"))
        connection.execute(text("INSERT INTO bookstore_bootstrap (id, completed) VALUES (1, :completed) ON CONFLICT (id) DO NOTHING"), {"completed": existing_schema})
        connection.commit()
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        connection.commit()
        prepare_admin(connection)
        connection.commit()
        completed = connection.scalar(text("SELECT completed FROM bookstore_bootstrap WHERE id = 1"))
        connection.commit()
        if not completed:
            seed(connection)
            connection.execute(text("UPDATE bookstore_bootstrap SET completed = TRUE WHERE id = 1"))
            connection.commit()
        print("Database schema ready; initial demo catalog prepared.")
    finally:
        connection.rollback()
        if acquired:
            connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": LOCK_ID})
            connection.commit()


def main():
    if os.getenv("BOOKSTORE_SKIP_DEPLOY_SETUP") == "1":
        print("Database setup delegated to the operator.")
        return
    # A session lock needs a direct connection, not Neon transaction pooling.
    direct = os.getenv("DATABASE_URL_UNPOOLED") or os.getenv("POSTGRES_URL_NON_POOLING")
    if not direct:
        raise RuntimeError("Connect Neon with DATABASE_URL_UNPOOLED for deployment setup.")
    os.environ["DATABASE_URL"] = direct
    get_engine.cache_clear()
    engine = get_engine()
    try:
        with engine.connect() as connection:
            if connection.dialect.name != "postgresql":
                raise RuntimeError("Deployment setup requires Postgres.")
            prepare(connection)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
