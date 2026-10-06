import hashlib
import os
import secrets
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.database import get_db, is_cloud
from app.models import AuthLimit, AuthSession, User

hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(32))
COOKIE = "margin_session"
SESSION_SECONDS = 7 * 24 * 60 * 60


def cookie_name():
    return "__Host-margin_session" if is_cloud() or os.getenv("COOKIE_SECURE") == "true" else COOKIE


def hash_token(token: str):
    return hashlib.sha256(token.encode()).hexdigest()


def rate_limit(db: Session, email: str, action: str):
    """Atomic, database-backed throttle shared by all function instances."""
    now = int(time.time())
    insert = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    # Bound expensive hashing even when an attacker rotates email addresses.
    # Application throttles supplement perimeter abuse controls.
    blocked = False
    for identity, maximum in (("global:" + action, 100), (action + ":" + email, 10)):
        key = hash_token(identity)
        db.execute(insert(AuthLimit).values(key=key, window_start=now, attempts=0).on_conflict_do_nothing(index_elements=["key"]))
        entry = db.scalar(select(AuthLimit).where(AuthLimit.key == key).with_for_update())
        if entry.window_start <= now - 600:
            entry.window_start, entry.attempts = now, 0
        entry.attempts += 1
        blocked = blocked or entry.attempts > maximum
        if blocked:
            break
    db.commit()
    if blocked:
        raise HTTPException(429, "Too many attempts. Try again in 10 minutes.", headers={"Retry-After": "600"})


def verify_password(password: str, hashed: str):
    try:
        return hasher.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


def start_session(db: Session, user: User, response: Response, previous_token: str | None = None):
    token = secrets.token_urlsafe(32)
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= int(time.time())))
    if previous_token and len(previous_token) < 100:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(previous_token)))
    db.add(AuthSession(token_hash=hash_token(token), user_id=user.id, expires_at=int(time.time()) + SESSION_SECONDS))
    db.commit()
    response.set_cookie(cookie_name(), token, httponly=True, secure=is_cloud() or os.getenv("COOKIE_SECURE") == "true", samesite="lax", max_age=SESSION_SECONDS, path="/")


def current_user(request: Request, db: Session = Depends(get_db)):
    margin_session = request.cookies.get(cookie_name())
    if margin_session and len(margin_session) < 100:
        session = db.get(AuthSession, hash_token(margin_session))
        if session and session.expires_at > int(time.time()):
            user = db.get(User, session.user_id)
            if user:
                return user
    raise HTTPException(401, "Sign in to continue.")


def admin_user(user: User = Depends(current_user)):
    if not user.is_admin:
        raise HTTPException(403, "An administrator account is required.")
    return user
