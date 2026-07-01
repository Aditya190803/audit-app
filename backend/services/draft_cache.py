"""In-process cache for pre-parsed PDF extraction (tables + text).

Keyed by sha256(file bytes) + password, so re-dropping the same file (or
re-pre-parsing with the same password) is a cache hit and skips the expensive
extract_tables/extract_text step. Tagging is NOT cached — it depends on
user-chosen options (client list, threshold, exclusions) and runs at Start.

Ephemeral by design: lost on backend restart, which is fine (the user just
re-uploads, same as today). TTL-evicted so abandoned drafts don't leak memory.
"""
import hashlib
import threading
import time
from typing import Any, Dict, List, Optional

DRAFT_TTL_SECONDS = 30 * 60  # 30 min


class DraftCache:
    def __init__(self, ttl_seconds: int = DRAFT_TTL_SECONDS):
        self._ttl = ttl_seconds
        self._lock = threading.Lock()
        self._store: Dict[str, dict] = {}

    @staticmethod
    def file_hash(file_path: str, password: Optional[str] = None) -> str:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        if password:
            h.update(b"\x00password\x00")
            h.update(password.encode("utf-8"))
        return h.hexdigest()

    def put(self, key: str, tables: List[Dict[str, Any]], pages: List[Dict[str, Any]],
            page_count: int, saved_path: str) -> None:
        with self._lock:
            self._store[key] = {
                "tables": tables,
                "pages": pages,
                "page_count": page_count,
                "saved_path": saved_path,
                "updated_at": time.time(),
            }
            self._cleanup_locked()

    def get(self, key: str) -> Optional[dict]:
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            if time.time() - entry["updated_at"] > self._ttl:
                del self._store[key]
                return None
            return entry

    def has(self, key: str) -> bool:
        return self.get(key) is not None

    def _cleanup_locked(self) -> None:
        now = time.time()
        stale = [k for k, v in self._store.items() if now - v["updated_at"] > self._ttl]
        for k in stale:
            del self._store[k]


# Module-level singleton shared by the preparse route and parse_files.
draft_cache = DraftCache()
