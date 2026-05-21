import hmac
import os
from hashlib import sha256
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.responses import Response


API_TOKEN_HEADER = "x-audit-token"
EXPORT_TOKEN_HEADER = "x-export-path-token"


def get_api_token() -> str | None:
    return os.environ.get("AUDIT_API_TOKEN")


def get_export_path_secret() -> str | None:
    return os.environ.get("AUDIT_EXPORT_PATH_SECRET")


def _public_paths() -> set[str]:
    configured = os.environ.get("AUDIT_PUBLIC_PATHS")
    if not configured:
        return {"/health"}
    return {path.strip() for path in configured.split(",") if path.strip()}


class LocalTokenAuthMiddleware(BaseHTTPMiddleware):
    """Require Electron's per-launch token for local API requests."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method == "OPTIONS" or request.url.path in _public_paths():
            return await call_next(request)

        expected = get_api_token()
        if not expected:
            return await call_next(request)

        provided = request.headers.get(API_TOKEN_HEADER)
        if not provided or not hmac.compare_digest(provided, expected):
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid audit API token"})

        return await call_next(request)


def canonical_path(path: str | Path) -> str:
    return str(Path(path).expanduser().resolve())


def export_path_token(file_path: str | Path, secret: str | None = None) -> str:
    secret = secret or get_export_path_secret()
    if not secret:
        raise HTTPException(status_code=403, detail="Export path approval is not configured")
    return hmac.new(secret.encode("utf-8"), canonical_path(file_path).encode("utf-8"), sha256).hexdigest()


def verify_export_path_token(file_path: str | Path, token: str | None) -> bool:
    if not token:
        return False
    return hmac.compare_digest(export_path_token(file_path), token)


def is_relative_to(path: str | Path, roots: Iterable[str | Path]) -> bool:
    resolved = Path(path).expanduser().resolve()
    for root in roots:
        try:
            resolved.relative_to(Path(root).expanduser().resolve())
            return True
        except ValueError:
            continue
    return False
