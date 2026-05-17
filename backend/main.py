from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.database import engine, Base
from backend.seed import seed_database
from backend.api.routes import sessions, transactions, tags, brokers, export, settings, audit

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Base.metadata.create_all(bind=engine)
    seed_database()
    print("[Backend] Database initialized and seeded.")
    yield
    # Shutdown
    print("[Backend] Shutting down...")

app = FastAPI(
    title="Bank Audit Backend",
    version="1.0.0",
    lifespan=lifespan
)

# CORS - allow Electron renderer
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Electron local files need this
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

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

@app.get("/")
def root():
    return {"message": "Bank Audit Backend API", "version": "1.0.0"}

if __name__ == "__main__":
    port = int(os.environ.get("BACKEND_PORT", 8765))
    uvicorn.run("backend.main:app", host="127.0.0.1", port=port, log_level="info")
