from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
import os

DB_PATH = os.environ.get("AUDIT_DB_PATH") or os.path.join(os.path.dirname(__file__), 'audit.db')

# ── Async engine (primary, for all route handlers) ──────────────────────
ASYNC_DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ── Sync engine (for startup migrations, seeds, and ProcessPoolExecutor workers) ─
SYNC_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SYNC_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

# Enable foreign keys + WAL + performance PRAGMAs for sync engine
@event.listens_for(engine, "connect")
def _set_sqlite_pragma_sync(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=-64000")   # 64 MB page cache
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.execute("PRAGMA mmap_size=268435456")  # 256 MB mmap
    cursor.close()

# Same PRAGMAs for async connections (fired by aiosqlite's raw connection)
@event.listens_for(async_engine.sync_engine, "connect")
def _set_sqlite_pragma_async(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=-64000")
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.execute("PRAGMA mmap_size=268435456")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ── Dependency injectors ────────────────────────────────────────────────
async def get_async_db():
    """Async DB session for FastAPI route dependency injection."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

def get_db():
    """Sync DB session (kept for backward-compat & ProcessPoolExecutor workers)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
