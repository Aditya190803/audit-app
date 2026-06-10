from multiprocessing import freeze_support
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
import os
import sys

# Required for PyInstaller on Windows — must be called before any multiprocessing usage
freeze_support()

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.migrations import run_startup_migrations
from backend.security import LocalTokenAuthMiddleware
from backend.seed import seed_database
from backend.services.process_pool import shutdown_process_pool
from backend.api.routes import sessions, transactions, tags, brokers, export, settings, audit, aliases

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    run_startup_migrations()
    seed_database()
    print("[Backend] Database migrated and seeded.")
    yield
    # Shutdown
    shutdown_process_pool()
    print("[Backend] Shutting down...")

app = FastAPI(
    title="Bank Audit Backend",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if os.environ.get("AUDIT_DISABLE_DOCS") == "1" else "/docs",
    redoc_url=None if os.environ.get("AUDIT_DISABLE_DOCS") == "1" else "/redoc",
    openapi_url=None if os.environ.get("AUDIT_DISABLE_DOCS") == "1" else "/openapi.json",
)

app.add_middleware(LocalTokenAuthMiddleware)

def _allowed_origins():
    configured = os.environ.get("AUDIT_ALLOWED_ORIGINS")
    if configured:
        return [origin.strip() for origin in configured.split(",") if origin.strip()]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "file://",
    ]

# CORS - keep dev origins narrow; token auth protects the API boundary.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    print(f"[Backend Error] {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__}
    )

# Include routers
app.include_router(sessions.router)
app.include_router(transactions.router)
app.include_router(tags.router)
app.include_router(brokers.router)
app.include_router(export.router)
app.include_router(settings.router)
app.include_router(audit.router)
app.include_router(aliases.router)

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

@app.get("/")
def root():
    return {"message": "Bank Audit Backend API", "version": "1.0.0"}

if __name__ == "__main__":
    port = int(os.environ.get("BACKEND_PORT", 8765))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
