import os
import uuid
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, UploadFile


PDF_EXTENSIONS = {".pdf"}
CLIENT_LIST_EXTENSIONS = {".csv", ".xlsx", ".xls"}


def _validate_magic(ext: str, header: bytes, safe_name: str) -> None:
    if ext == ".pdf":
        if not header.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail=f"Invalid PDF file: {safe_name}")
        return

    if ext == ".xlsx":
        if not header.startswith(b"PK\x03\x04"):
            raise HTTPException(status_code=400, detail=f"Invalid XLSX file: {safe_name}")
        return

    if ext == ".xls":
        if not header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
            raise HTTPException(status_code=400, detail=f"Invalid XLS file: {safe_name}")
        return

    if ext == ".csv":
        try:
            header.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid CSV encoding: {safe_name}") from exc


def _write_stream(
    source: BinaryIO,
    destination: str,
    *,
    ext: str,
    safe_name: str,
    max_bytes: int,
) -> None:
    written = 0
    header = b""
    try:
        with open(destination, "wb") as output:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                if not header:
                    header = chunk[:16]
                    _validate_magic(ext, header, safe_name)
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(status_code=413, detail=f"File too large: {safe_name}")
                output.write(chunk)
    except Exception:
        try:
            os.remove(destination)
        except OSError:
            pass
        raise

    if written == 0:
        try:
            os.remove(destination)
        except OSError:
            pass
        raise HTTPException(status_code=400, detail=f"Empty file: {safe_name}")


def save_upload(
    upload_file: UploadFile,
    *,
    upload_dir: str,
    allowed_extensions: set[str],
    max_bytes: int,
) -> str:
    safe_name = Path(upload_file.filename or "file").name
    ext = Path(safe_name).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or 'unknown'}")

    os.makedirs(upload_dir, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    destination = os.path.abspath(os.path.join(upload_dir, unique_name))
    _write_stream(upload_file.file, destination, ext=ext, safe_name=safe_name, max_bytes=max_bytes)
    return destination
