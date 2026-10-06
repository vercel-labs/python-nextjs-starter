from alembic import context
from app.database import Base, get_engine
from app import models


def migrate(connection):
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=connection.dialect.name == "sqlite")
    with context.begin_transaction():
        context.run_migrations()


connection = context.config.attributes.get("connection")
if connection is not None:
    migrate(connection)
else:
    with get_engine().connect() as connection:
        migrate(connection)
