"""轻量数据库迁移：对已存在的旧库做增量结构升级（幂等，可反复执行）。

- 缺失的表由 Base.metadata.create_all 补建（如 users 表）；
- 已存在表中缺失的列在此显式 ALTER TABLE ADD COLUMN 补齐
  （create_all 不会修改旧表结构）。

SQLite 与 PostgreSQL 均支持 ADD COLUMN 语义（列均可空或有默认值）。
"""
from sqlalchemy import inspect, text

from database import Base, engine

# 表名 -> [(列名, DDL 列定义)]；仅列出后期版本新增的列
ADDED_COLUMNS = {
    "elevators": [
        ("is_archived", "INTEGER NOT NULL DEFAULT 0"),
        ("archive_type", "VARCHAR(10)"),
        ("archive_date", "DATE"),
        ("archive_reason", "TEXT"),
        ("archive_operator", "VARCHAR(50)"),
    ],
}


def run_migrations():
    inspector = inspect(engine)
    # 1) 补建缺失的表（不影响已有表数据）
    Base.metadata.create_all(bind=engine)

    # 2) 给旧表补列
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in ADDED_COLUMNS.items():
            if table not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns:
                if name not in present:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    print(f"  迁移：{table}.{name} 已添加")
