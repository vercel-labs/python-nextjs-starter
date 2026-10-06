import traceback

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.auth import hasher, verify_password
from app.database import get_db
from app.main import app
from app.models import Book, User
from scripts.deploy_setup import prepare


@pytest.fixture(autouse=True)
def clean_admin_configuration(monkeypatch):
    for key in ("ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_NAME"):
        monkeypatch.delenv(key, raising=False)


def configure_admin(monkeypatch):
    monkeypatch.setenv("ADMIN_EMAIL", "Owner@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "a-unique-admin-password")
    monkeypatch.setenv("ADMIN_NAME", "Shop owner")


def setup(engine):
    with engine.connect() as connection:
        prepare(connection, postgres=False)


def test_fresh_setup_migrates_seeds_and_does_not_restore_deletions(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'bootstrap.db'}")
    with engine.connect() as connection:
        prepare(connection, postgres=False)
    with Session(engine) as session:
        assert len(session.scalars(select(Book)).all()) == 12
        session.delete(session.get(Book, "demo-01"))
        session.commit()
    with engine.connect() as connection:
        prepare(connection, postgres=False)
    with Session(engine) as session:
        assert session.get(Book, "demo-01") is None
        assert len(session.scalars(select(Book)).all()) == 11


def test_existing_migrated_database_is_not_reseeded(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'existing.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
    with engine.connect() as connection:
        prepare(connection, postgres=False)
    with Session(engine) as session:
        assert session.scalars(select(Book)).all() == []


def test_admin_creation_login_and_authorization(tmp_path, monkeypatch):
    configure_admin(monkeypatch)
    engine = create_engine(f"sqlite:///{tmp_path / 'admin.db'}", connect_args={"check_same_thread": False})
    setup(engine)
    with Session(engine) as session:
        user = session.scalar(select(User))
        assert user.email == "owner@example.com"
        assert user.name == "Shop owner"
        assert user.is_admin
        assert user.password_hash != "a-unique-admin-password"
        assert verify_password("a-unique-admin-password", user.password_hash)

    def database():
        with Session(engine) as session:
            yield session

    monkeypatch.delenv("VERCEL_ENV", raising=False)
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    app.dependency_overrides[get_db] = database
    try:
        with TestClient(app) as client:
            assert client.delete("/books/demo-01").status_code == 401
            assert client.post("/auth/login", json={"email": "owner@example.com", "password": "wrong-password"}).status_code == 401
            assert client.post("/auth/login", json={"email": "owner@example.com", "password": "a-unique-admin-password"}).status_code == 200
            assert client.get("/auth/me").json()["is_admin"] is True
            assert client.delete("/books/demo-01").status_code == 204
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_later_setup_preserves_password_role_and_does_not_recreate_admin(tmp_path, monkeypatch):
    configure_admin(monkeypatch)
    engine = create_engine(f"sqlite:///{tmp_path / 'preserve.db'}")
    setup(engine)
    with Session(engine) as session:
        user = session.scalar(select(User))
        original_hash = user.password_hash
        user.is_admin = False
        session.commit()
    # Completed bootstrap does not validate or apply changed credentials.
    monkeypatch.setenv("ADMIN_EMAIL", "replacement@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "short")
    setup(engine)
    with Session(engine) as session:
        users = session.scalars(select(User)).all()
        assert len(users) == 1
        assert users[0].email == "owner@example.com"
        assert users[0].password_hash == original_hash
        assert not users[0].is_admin
        session.delete(users[0])
        session.commit()
    setup(engine)
    with Session(engine) as session:
        assert session.scalars(select(User)).all() == []


def test_credentials_can_be_added_after_catalog_setup(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'later.db'}")
    setup(engine)
    with Session(engine) as session:
        assert session.scalars(select(User)).all() == []
        session.delete(session.get(Book, "demo-01"))
        session.commit()
    configure_admin(monkeypatch)
    setup(engine)
    with Session(engine) as session:
        assert session.scalar(select(User)).is_admin
        assert session.get(Book, "demo-01") is None


@pytest.mark.parametrize("email,password,name", [
    ("owner@example.com", None, "Owner"),
    (None, "a-unique-admin-password", "Owner"),
    ("bad-email", "a-unique-admin-password", "Owner"),
    ("owner@example.com", "short-secret", "Owner"),
    ("owner@example.com", "a-unique-admin-password", " "),
])
def test_invalid_configuration_fails_without_logging_secrets(tmp_path, monkeypatch, capsys, email, password, name):
    if email is not None:
        monkeypatch.setenv("ADMIN_EMAIL", email)
    if password is not None:
        monkeypatch.setenv("ADMIN_PASSWORD", password)
    monkeypatch.setenv("ADMIN_NAME", name)
    engine = create_engine(f"sqlite:///{tmp_path / 'invalid.db'}")
    with pytest.raises(RuntimeError) as error:
        setup(engine)
    output = "".join(traceback.format_exception(error.value)) + capsys.readouterr().out
    if password:
        assert password not in output
    if email:
        assert email not in output
    with Session(engine) as session:
        assert session.scalars(select(User)).all() == []
    configure_admin(monkeypatch)
    setup(engine)
    with Session(engine) as session:
        assert session.scalar(select(User)).is_admin


@pytest.mark.parametrize("is_admin", [False, True])
def test_existing_account_is_never_overwritten_or_silently_promoted(tmp_path, monkeypatch, is_admin):
    engine = create_engine(f"sqlite:///{tmp_path / 'existing-account.db'}")
    setup(engine)
    original_hash = hasher.hash("an-existing-account-password")
    with Session(engine) as session:
        session.add(User(id="existing", email="owner@example.com", name="Existing", password_hash=original_hash, is_admin=is_admin))
        session.commit()
    configure_admin(monkeypatch)
    if is_admin:
        setup(engine)
    else:
        with pytest.raises(RuntimeError, match="belongs to a reader"):
            setup(engine)
    with Session(engine) as session:
        user = session.get(User, "existing")
        assert user.password_hash == original_hash
        assert user.is_admin == is_admin
        assert user.name == "Existing"
