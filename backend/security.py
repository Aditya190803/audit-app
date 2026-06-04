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

        # Primary: header auth
        provided = request.headers.get(API_TOKEN_HEADER)
        # EventSource cannot set headers, so allow query-token auth only for SSE progress.
        if not provided and request.url.path.startswith("/transactions/parse-progress/") and request.url.path.endswith("/stream"):
            provided = request.query_params.get("token")
        if not provided or not hmac.compare_digest(provided, expected):
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid audit API token"})

        return await call_next(request)


def canonical_path(path: str | Path) -> str:
    return str(Path(path).expanduser().resolve())


TOKEN_WINDOW_SECONDS = 60  # tokens valid for 1 window


def _export_token_window(ts: int | None = None) -> int:
    """Return the current 60-second window bucket."""
    import time
    return int((ts or time.time()) // TOKEN_WINDOW_SECONDS)


def export_path_token(file_path: str | Path, secret: str | None = None) -> str:
    secret = secret or get_export_path_secret()
    if not secret:
        raise HTTPException(status_code=403, detail="Export path approval is not configured")
    window = str(_export_token_window()).encode("utf-8")
    msg = canonical_path(file_path).encode("utf-8") + b":" + window
    return hmac.new(secret.encode("utf-8"), msg, sha256).hexdigest()


def verify_export_path_token(file_path: str | Path, token: str | None) -> bool:
    import time
    if not token:
        return False
    secret = get_export_path_secret()
    if not secret:
        return False
    now = time.time()
    # Accept current window and the previous one (grace period)
    for window_offset in (0, -1):
        window = str(_export_token_window(now) + window_offset).encode("utf-8")
        msg = canonical_path(file_path).encode("utf-8") + b":" + window
        candidate = hmac.new(secret.encode("utf-8"), msg, sha256).hexdigest()
        if hmac.compare_digest(candidate, token):
            return True
    return False


def is_relative_to(path: str | Path, roots: Iterable[str | Path]) -> bool:
    resolved = Path(path).expanduser().resolve()
    for root in roots:
        try:
            resolved.relative_to(Path(root).expanduser().resolve())
            return True
        except ValueError:
            continue
    return False
