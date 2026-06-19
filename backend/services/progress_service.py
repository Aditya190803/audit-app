import asyncio
import time
from threading import Lock
from typing import Any, Optional


PROGRESS_TTL = 3600


class ParseProgressStore:
    def __init__(self, ttl_seconds: int = PROGRESS_TTL):
        self.ttl_seconds = ttl_seconds
        self._lock = Lock()
        self._progress: dict[str, dict[str, Any]] = {}
        self._subscribers: dict[str, list[tuple[asyncio.Queue, asyncio.AbstractEventLoop]]] = {}

    def set(self, progress_id: Optional[str], percent: int, message: str, stage: str = "processing", **extra: Any) -> None:
        if not progress_id:
            return
        now = time.time()
        payload = {
            "id": progress_id,
            "percent": max(0, min(100, int(percent))),
            "message": message,
            "stage": stage,
            "updated_at": now,
            **extra,
        }
        with self._lock:
            self._progress[progress_id] = payload
            self.cleanup(now)
            subscribers = list(self._subscribers.get(progress_id, []))

        for queue, loop in subscribers:
            try:
                loop.call_soon_threadsafe(queue.put_nowait, payload)
            except Exception:
                pass

    def get(self, progress_id: str, *, consume_terminal: bool = False) -> dict[str, Any] | None:
        with self._lock:
            entry = self._progress.get(progress_id)
            if consume_terminal and entry and entry.get("stage") in ("complete", "error"):
                del self._progress[progress_id]
            return entry

    def cleanup(self, now: float | None = None) -> None:
        now = now or time.time()
        stale = [
            progress_id
            for progress_id, entry in self._progress.items()
            if now - entry.get("updated_at", 0) > self.ttl_seconds
        ]
        for progress_id in stale:
            del self._progress[progress_id]

    def subscribe(self, progress_id: str, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> dict[str, Any] | None:
        with self._lock:
            self._subscribers.setdefault(progress_id, []).append((queue, loop))
            return self._progress.get(progress_id)

    def unsubscribe(self, progress_id: str, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> None:
        with self._lock:
            subscribers = self._subscribers.get(progress_id, [])
            try:
                subscribers.remove((queue, loop))
            except ValueError:
                pass
            if not subscribers:
                self._subscribers.pop(progress_id, None)
