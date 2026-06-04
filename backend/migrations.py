from __future__ import annotations

import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import inspect, text
from sqlalchemy.schema import CreateIndex

from backend.database import Base, DB_PATH, SYNC_DATABASE_URL, engine
from backend import models as _models  # noqa: F401  # populate Base.metadata for repair/stamping


APPLICATION_TABLES = {
    "aliases",
    "audit_sessions",
    "bank_profiles",
    "brokers",
    "configs",
    "audit_logs",
    "transactions",
    "undo_redo_states",
    "tags",
}


def _backend_roots() -> list[Path]:
    roots: list[Path] = []

    def add(path: Path) -> None:
        resolved = path.resolve()
        if resolved not in roots:
            roots.append(resolved)

    add(Path(__file__).resolve().parent)

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        add(Path(meipass) / "backend")
        add(Path(meipass))

    add(Path.cwd() / "backend")
    add(Path.cwd())
    return roots


def _find_alembic_paths() -> tuple[Path, Path]:
    for root in _backend_roots():
        ini_path = root / "alembic.ini"
        if ini_path.is_dir():
            ini_path = ini_path / "alembic.ini"
        script_location = root / "alembic"
        if ini_path.is_file() and (script_location / "env.py").exists():
            return ini_path, script_location

    searched = ", ".join(str(root) for root in _backend_roots())
    raise FileNotFoundError(f"Could not locate Alembic files. Searched: {searched}")


def _has_table(table_name: str) -> bool:
    return inspect(engine).has_table(table_name)


def _has_application_tables() -> bool:
    tables = set(inspect(engine).get_table_names())
    return bool(tables & APPLICATION_TABLES)


def _has_alembic_version() -> bool:
    return _has_table("alembic_version")


def _compile_column_type(column) -> str:
    return column.type.compile(dialect=engine.dialect)


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _repair_unversioned_schema() -> None:
    """Bring pre-migration desktop databases up to the current model shape.

    Older app builds created/updated SQLite tables with SQLAlchemy create_all()
    and did not maintain alembic_version. Alembic cannot replay the initial
    migration against those databases because the tables already exist, so we
    add any missing nullable columns/indexes and then stamp the database at head.
    """
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)

    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing_columns = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                if not column.nullable and column.default is None and column.server_default is None:
                    raise RuntimeError(
                        f"Cannot auto-add required column {table.name}.{column.name} to an existing database"
                    )
                sql = (
                    f"ALTER TABLE {_quote_identifier(table.name)} "
                    f"ADD COLUMN {_quote_identifier(column.name)} {_compile_column_type(column)}"
                )
                connection.execute(text(sql))

        existing_indexes = {
            (table_name, index["name"])
            for table_name in inspector.get_table_names()
            for index in inspector.get_indexes(table_name)
        }
        for table in Base.metadata.sorted_tables:
            for index in table.indexes:
                if index.name and (table.name, index.name) not in existing_indexes:
                    connection.execute(CreateIndex(index))


def _alembic_config() -> AlembicConfig:
    ini_path, script_location = _find_alembic_paths()
    config = AlembicConfig(str(ini_path))
    config.set_main_option("script_location", str(script_location))
    config.set_main_option("sqlalchemy.url", SYNC_DATABASE_URL)
    return config


def run_startup_migrations() -> None:
    """Upgrade the local SQLite database to the latest schema."""
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    config = _alembic_config()

    if _has_application_tables() and not _has_alembic_version():
        _repair_unversioned_schema()
        command.stamp(config, "head")
        return

    command.upgrade(config, "head")
