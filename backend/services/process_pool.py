import concurrent.futures
import os
from threading import Lock
from typing import Optional

_pool: Optional[concurrent.futures.ProcessPoolExecutor] = None
_pool_lock = Lock()


def process_pool_worker_count() -> int:
    configured = os.environ.get("AUDIT_PROCESS_POOL_WORKERS")
    if configured:
        try:
            return max(1, int(configured))
        except ValueError:
            pass
    return min(2, max(1, os.cpu_count() or 2))


def get_process_pool() -> concurrent.futures.ProcessPoolExecutor:
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = concurrent.futures.ProcessPoolExecutor(max_workers=process_pool_worker_count())
        return _pool


def shutdown_process_pool() -> None:
    global _pool
    with _pool_lock:
        pool = _pool
        _pool = None
    if pool is not None:
        pool.shutdown(wait=False, cancel_futures=True)
