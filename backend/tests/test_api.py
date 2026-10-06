import time
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.auth import hash_token, rate_limit, verify_password
from app.database import Base, get_db, get_engine
from app.main import app
from app.models import AuthSession, User
from scripts.seed import main as seed
from sqlalchemy.orm import Session


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    monkeypatch.setenv("BOOKSTORE_TESTING", "1")
    get_engine.cache_clear()
    engine = get_engine()
    Base.metadata.create_all(engine)
    seed()
    with TestClient(app) as client:
        yield client
    engine.dispose()
    get_engine.cache_clear()


def register(client, email="reader@example.com"):
    return client.post("/auth/register", json={"name": "Reader", "email": email, "password": "a-unique-test-password"})


def promote(email="reader@example.com"):
    with Session(get_engine()) as db:
        user = db.scalar(select(User).where(User.email == email))
        user.is_admin = True
        db.commit()


BOOK = {"title": "Test title", "author": "Test author", "category": "Fiction", "description": "A test book.", "price_cents": 1900, "stock": 4, "cover_color": "#245947", "published_year": 2026, "featured": False}


def test_public_catalog_and_search(client):
    assert client.get("/health").json()["database"] == "connected"
    assert len(client.get("/books").json()) == 12
    assert len(client.get("/books?q=Noticing").json()) == 1
    assert all(book["category"] == "Poetry" for book in client.get("/books?category=Poetry").json())
    assert client.get("/books?q=%25").json() == []
    assert client.get("/books/missing").status_code == 404


def test_auth_session_revocation_and_passwords(client):
    assert client.get("/auth/me").status_code == 401
    response = register(client)
    assert response.status_code == 201
    assert not response.json()["is_admin"]
    assert "password_hash" not in response.json()
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    with Session(get_engine()) as db:
        assert db.scalar(select(User)).password_hash.startswith("$argon2id$")
        assert db.scalar(select(AuthSession)).token_hash != client.cookies.get("margin_session")
    token = client.cookies.get("margin_session")
    assert client.get("/auth/me").status_code == 200
    assert client.post("/auth/logout").status_code == 204
    client.cookies.set("margin_session", token)
    assert client.get("/auth/me").status_code == 401
    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "reader@example.com", "password": "incorrect-password"}).status_code == 401
    assert client.post("/auth/login", json={"email": "READER@example.com", "password": "a-unique-test-password"}).status_code == 200


def test_admin_crud_and_cascade(client):
    assert client.post("/books", json=BOOK).status_code == 401
    register(client)
    assert client.post("/books", json=BOOK).status_code == 403
    promote()
    created = client.post("/books", json=BOOK)
    assert created.status_code == 201
    book_id = created.json()["id"]
    assert client.put(f"/shelf/{book_id}").status_code == 204
    assert client.put(f"/books/{book_id}", json={**BOOK, "stock": 8}).json()["stock"] == 8
    assert client.put(f"/books/{book_id}", json={**BOOK, "price_cents": -1}).status_code == 422
    assert client.delete(f"/books/{book_id}").status_code == 204
    assert client.get(f"/books/{book_id}").status_code == 404
    assert client.get("/shelf").json() == []


def test_shelf_isolation_and_idempotency(client):
    register(client)
    assert client.put("/shelf/demo-01").status_code == 204
    assert client.put("/shelf/demo-01").status_code == 204
    assert len(client.get("/shelf").json()) == 1
    client.post("/auth/logout")
    register(client, "another@example.com")
    assert client.get("/shelf").json() == []
    client.delete("/shelf/demo-01")
    client.post("/auth/logout")
    client.post("/auth/login", json={"email": "reader@example.com", "password": "a-unique-test-password"})
    assert len(client.get("/shelf").json()) == 1


def test_expired_session(client):
    register(client)
    with Session(get_engine()) as db:
        session = db.get(AuthSession, hash_token(client.cookies.get("margin_session")))
        session.expires_at = int(time.time()) - 1
        db.commit()
    assert client.get("/auth/me").status_code == 401


def test_auth_throttle_and_registration_cannot_escalate(client):
    response = client.post("/auth/register", json={"name": "Reader", "email": "reader@example.com", "password": "a-unique-test-password", "is_admin": True})
    assert response.status_code == 201 and not response.json()["is_admin"]
    assert register(client).status_code == 409
    for _ in range(10):
        assert client.post("/auth/login", json={"email": "nobody@example.com", "password": "incorrect-password"}).status_code == 401
    response = client.post("/auth/login", json={"email": "nobody@example.com", "password": "incorrect-password"})
    assert response.status_code == 429 and response.headers["retry-after"] == "600"


def test_database_is_required_and_sqlite_is_only_for_tests(client, monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("VERCEL_ENV", "development")
    assert client.get("/health").status_code == 200
    get_engine.cache_clear()
    monkeypatch.delenv("BOOKSTORE_TESTING")
    with pytest.raises(RuntimeError, match="Use Neon Postgres"):
        get_engine()
    monkeypatch.setenv("BOOKSTORE_TESTING", "1")
    monkeypatch.setenv("VERCEL_ENV", "production")
    with pytest.raises(RuntimeError, match="Use Neon Postgres"):
        get_engine()
    monkeypatch.delenv("DATABASE_URL")
    with pytest.raises(RuntimeError, match="Configure DATABASE_URL"):
        get_engine()
    get_engine.cache_clear()


def test_login_replaces_and_revokes_presented_session(client):
    register(client)
    old_token = client.cookies.get("margin_session")
    assert client.post("/auth/login", json={"email": "reader@example.com", "password": "a-unique-test-password"}).status_code == 200
    assert client.cookies.get("margin_session") != old_token
    with Session(get_engine()) as db:
        assert db.get(AuthSession, hash_token(old_token)) is None
    client.cookies.clear()
    client.cookies.set("margin_session", old_token)
    assert client.get("/auth/me").status_code == 401


def test_stronger_signup_policy_and_invalid_hash(client):
    assert client.post("/auth/register", json={"email": "short@example.com", "name": "Reader", "password": "twelve-chars!"}).status_code == 422
    assert client.post("/auth/login", json={"email": "unknown@example.com", "password": "short"}).status_code == 401
    assert not verify_password("anything", "malformed-hash")


def test_global_throttle_blocks_rotating_emails(client):
    with Session(get_engine()) as db:
        for i in range(100):
            rate_limit(db, f"reader{i}@example.com", "login")
        with pytest.raises(HTTPException) as error:
            rate_limit(db, "new-address@example.com", "login")
        assert error.value.status_code == 429


def test_secure_host_cookie_ignores_legacy_cookie(client, monkeypatch):
    register(client)
    legacy = client.cookies.get("margin_session")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    assert client.get("/auth/me").status_code == 401
    response = client.post("/auth/login", json={"email": "reader@example.com", "password": "a-unique-test-password"})
    cookie = response.headers["set-cookie"]
    assert "__Host-margin_session=" in cookie and "Secure" in cookie and "Domain=" not in cookie
    assert legacy


def test_postgres_refuses_missing_tls(client, monkeypatch):
    get_engine.cache_clear()
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:password@localhost/bookstore")
    with pytest.raises(RuntimeError, match="require TLS"):
        get_engine()
    get_engine.cache_clear()
