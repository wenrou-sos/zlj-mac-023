"""数据库连接配置。

默认使用本地 SQLite（零配置即可运行）；
如需切换到 PostgreSQL，设置环境变量即可，例如：

    export DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/elevator"
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./elevator.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
