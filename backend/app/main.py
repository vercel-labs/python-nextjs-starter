import os
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from sqlalchemy import delete, or_, select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import DUMMY_HASH, admin_user, cookie_name, current_user, hash_token, hasher, rate_limit, start_session, verify_password
from app.database import get_db, is_cloud
from app.models import AuthSession, Book, ShelfItem, User
from app.schemas import BookInput, BookOut, Credentials, Registration, UserOut
from app.observability import RequestLoggingMiddleware

app = FastAPI(title="Margin Bookstore API", version="0.1.0")
app.add_middleware(RequestLoggingMiddleware)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.scalar(select(func.count()).select_from(Book))
    return {"status": "ok", "service": "fastapi", "database": "connected"}


@app.get("/books", response_model=list[BookOut])
def books(q: str = "", category: str = "", db: Session = Depends(get_db)):
    query = select(Book)
    if q:
        term = "%" + q[:160].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(or_(Book.title.ilike(term, escape="\\"), Book.author.ilike(term, escape="\\")))
    if category:
        query = query.where(Book.category == category)
    return db.scalars(query.order_by(Book.featured.desc(), Book.title).limit(100)).all()


@app.get("/books/{book_id}", response_model=BookOut)
def book_detail(book_id: str, db: Session = Depends(get_db)):
    book = db.get(Book, book_id)
    if not book:
        raise HTTPException(404, "Book not found.")
    return book


@app.post("/books", response_model=BookOut, status_code=201)
def create_book(data: BookInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    book = Book(id=str(uuid4()), **data.model_dump())
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


@app.put("/books/{book_id}", response_model=BookOut)
def update_book(book_id: str, data: BookInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    book = book_detail(book_id, db)
    for key, value in data.model_dump().items():
        setattr(book, key, value)
    db.commit()
    db.refresh(book)
    return book


@app.delete("/books/{book_id}", status_code=204)
def delete_book(book_id: str, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    db.delete(book_detail(book_id, db))
    db.commit()


@app.post("/auth/register", response_model=UserOut, status_code=201)
def register(data: Registration, request: Request, response: Response, db: Session = Depends(get_db)):
    email = str(data.email).lower()
    rate_limit(db, email, "register")
    user = User(id=str(uuid4()), name=data.name.strip(), email=email, password_hash=hasher.hash(data.password), is_admin=False)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Unable to create this account. Try signing in instead.")
    start_session(db, user, response, request.cookies.get(cookie_name()))
    return user


@app.post("/auth/login", response_model=UserOut)
def login(data: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    email = str(data.email).lower()
    rate_limit(db, email, "login")
    user = db.scalar(select(User).where(User.email == email))
    valid = verify_password(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Email or password is incorrect.")
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hasher.hash(data.password)
    start_session(db, user, response, request.cookies.get(cookie_name()))
    return user


@app.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@app.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(cookie_name())
    if token and len(token) < 100:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(token)))
        db.commit()
    response.delete_cookie(cookie_name(), path="/", secure=is_cloud() or os.getenv("COOKIE_SECURE") == "true", httponly=True, samesite="lax")


@app.get("/shelf", response_model=list[BookOut])
def shelf(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Book).join(ShelfItem, ShelfItem.book_id == Book.id).where(ShelfItem.user_id == user.id).order_by(Book.title)).all()


@app.put("/shelf/{book_id}", status_code=204)
def save_book(book_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    book_detail(book_id, db)
    if not db.scalar(select(ShelfItem).where(ShelfItem.user_id == user.id, ShelfItem.book_id == book_id)):
        db.add(ShelfItem(id=str(uuid4()), user_id=user.id, book_id=book_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            # Only a duplicate is idempotent; do not hide a deletion race or other failure.
            if not db.scalar(select(ShelfItem).where(ShelfItem.user_id == user.id, ShelfItem.book_id == book_id)):
                book_detail(book_id, db)
                raise HTTPException(409, "Could not save this book. Try again.")


@app.delete("/shelf/{book_id}", status_code=204)
def unsave_book(book_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(ShelfItem).where(ShelfItem.user_id == user.id, ShelfItem.book_id == book_id))
    db.commit()
