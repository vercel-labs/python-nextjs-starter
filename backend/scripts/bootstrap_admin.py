"""Create one operator-configured administrator per database during setup."""
import os
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy import insert, select, text

from app.auth import hasher
from app.models import User
from app.schemas import Registration

# Row 1 tracks catalog seeding; row 2 tracks administrator initialization.
ADMIN_BOOTSTRAP_ID = 2


def prepare_admin(connection):
    completed = connection.scalar(
        text("SELECT completed FROM bookstore_bootstrap WHERE id = :id"),
        {"id": ADMIN_BOOTSTRAP_ID},
    )
    if completed:
        return
    email = os.getenv("ADMIN_EMAIL")
    password = os.getenv("ADMIN_PASSWORD")
    if email is None and password is None:
        return
    if not email or not password:
        raise RuntimeError("Set both ADMIN_EMAIL and ADMIN_PASSWORD for administrator setup.")
    try:
        data = Registration(
            email=email, password=password,
            name=os.getenv("ADMIN_NAME", "Bookshop owner"),
        )
    except ValidationError:
        # Pydantic's normal error text includes input values, including passwords.
        raise RuntimeError(
            "Invalid administrator configuration: use a valid email, a password of "
            "15–128 characters, and a nonblank name of at most 80 characters."
        ) from None

    users = User.__table__
    existing = connection.execute(
        select(users.c.is_admin).where(users.c.email == str(data.email).lower())
    ).first()
    if existing is not None and not existing.is_admin:
        raise RuntimeError(
            "The configured administrator email belongs to a reader. "
            "Choose another email or explicitly promote the account with scripts.promote_admin."
        )
    if existing is None:
        connection.execute(insert(users).values(
            id=str(uuid4()), email=str(data.email).lower(), name=data.name,
            password_hash=hasher.hash(data.password), is_admin=True,
        ))
    connection.execute(
        text("INSERT INTO bookstore_bootstrap (id, completed) VALUES (:id, TRUE) "
             "ON CONFLICT (id) DO UPDATE SET completed = TRUE"),
        {"id": ADMIN_BOOTSTRAP_ID},
    )
    print("Administrator setup complete; existing credentials are preserved.")
