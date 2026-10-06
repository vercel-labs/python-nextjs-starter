import sys
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_engine
from app.models import User

if len(sys.argv) != 2:
    raise SystemExit("Usage: python -m scripts.promote_admin account@example.com")
with Session(get_engine()) as db:
    user = db.scalar(select(User).where(User.email == sys.argv[1].lower()))
    if not user:
        raise SystemExit("Account not found. Register it through the app first.")
    user.is_admin = True
    db.commit()
    print("Administrator role granted.")
