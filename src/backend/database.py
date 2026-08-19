import os

from sqlmodel import SQLModel, Session, create_engine
from src.backend import config
# Import models to ensure they are registered in SQLModel.metadata
from src.backend import models

DB_PATH = "data/lecture_platform.db"
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

sqlite_url = f"sqlite:///{DB_PATH}"
database_url = config.DATABASE_URL or sqlite_url

is_sqlite = database_url.startswith("sqlite")
engine_kwargs: dict = {"pool_pre_ping": True}
if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
elif database_url.startswith("postgresql"):
    # Ensure postgres client session uses UTF-8 consistently.
    engine_kwargs["connect_args"] = {"options": "-c client_encoding=UTF8"}

engine = create_engine(database_url, **engine_kwargs)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
