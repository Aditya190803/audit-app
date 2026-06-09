from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
from backend.database import get_db
from backend.schemas import (
    TransactionNotesUpdate,
    TransactionUpdate,
    TransactionResponse,
)
from backend.services.session_service import SessionService
from backend.services.pdf_service import PDFService
from backend.services.csv_service import CSVService
from backend.services.tagging_service import TaggingService
from backend.services.config_service import ConfigService
from backend.services.audit_service import AuditService
from backend.services.payment_method import detect_payment_method
import os
import json
import time
import uuid
from pathlib import Path
from threading import Lock

router = APIRouter(prefix="/transactions", tags=["transactions"])

_progress_lock = Lock()
_parse_progress = {}

PROGRESS_TTL = 3600  # 1 hour
UPLOAD_DIR = os.path.abspath(os.environ.get("AUDIT_UPLOAD_DIR", "uploads"))
MAX_UPLOAD_BYTES = int(os.environ.get("AUDIT_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
PDF_EXTENSIONS = {".pdf"}
CLIENT_LIST_EXTENSIONS = {".csv", ".xlsx", ".xls"}

def _set_parse_progress(progress_id: Optional[str], percent: int, message: str, stage: str = "processing", **extra):
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
    with _progress_lock:
        _parse_progress[progress_id] = payload
        _cleanup_stale_progress(now)

def _get_parse_progress(progress_id: str):
    with _progress_lock:
        entry = _parse_progress.get(progress_id)
        if entry and entry.get("stage") in ("complete", "error"):
            del _parse_progress[progress_id]
        return entry

def _cleanup_stale_progress(now: float):
    stale = [pid for pid, entry in _parse_progress.items()
             if now - entry.get("updated_at", 0) > PROGRESS_TTL]
    for pid in stale:
        del _parse_progress[pid]

@router.get("/parse-progress/{progress_id}")
def get_parse_progress(progress_id: str):
    progress = _get_parse_progress(progress_id)
    if not progress:
        return {
            "id": progress_id,
            "percent": 0,
            "message": "Waiting to start...",
            "stage": "queued",
        }
    return progress

from fastapi.responses import StreamingResponse
import asyncio

@router.get("/parse-progress/{progress_id}/stream")
async def stream_parse_progress(progress_id: str):
    """SSE endpoint — pushes progress updates until complete or error."""
    async def event_generator():
        last_sent = None
        while True:
            progress = None
            with _progress_lock:
                progress = _parse_progress.get(progress_id)
            if progress is None:
                # Not started yet — send a queued placeholder
                progress = {"id": progress_id, "percent": 0, "message": "Waiting to start...", "stage": "queued"}

            if progress != last_sent:
                import json as _json
                yield f"data: {_json.dumps(progress)}\n\n"
                last_sent = progress

            stage = progress.get("stage", "")
            if stage in ("complete", "error"):
                # One final flush then close
                break
            await asyncio.sleep(0.4)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/parsers")
def list_parsers():
    from backend.services.parsers import registry
    return registry.parser_list()

def _clean_response_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return " ".join(str(value).split()).strip()


@router.get("/session/{session_id}", response_model=List[TransactionResponse])
def get_transactions(
    session_id: int,
    limit: int = Query(1000, ge=1, le=10000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    service = SessionService(db)
    transactions = service.get_transactions(session_id, limit=limit, offset=offset)
    return [
        TransactionResponse.model_validate(tx).model_copy(update={
            "date": _clean_response_text(tx.date),
            "description": _clean_response_text(tx.description),
            "party_name": _clean_response_text(tx.party_name),
        })
        for tx in transactions
    ]

@router.post("/parse")
async def parse_files(
    pdf: List[UploadFile] = File(...),
    client_list: UploadFile = File(...),
    threshold: int = Form(50000),
    password: Optional[str] = Form(None),
    sheet_name: Optional[str] = Form(None),
    name_column: Optional[str] = Form(None),
    excluded_brokers: Optional[str] = Form(None),
    ap_codes: Optional[str] = Form(None),
    bank_name: Optional[str] = Form(None),
    progress_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Parse one or more PDFs and client list, create session, and auto-tag transactions."""
    _set_parse_progress(progress_id, 1, "Preparing files...", "preparing")
    # Parse per-file passwords if sent as JSON map
    pdf_passwords: dict = {}
    if password:
        try:
            parsed = json.loads(password)
            if isinstance(parsed, dict):
                pdf_passwords = parsed
                password = None  # use per-file passwords
        except (json.JSONDecodeError, TypeError):
            pass  # single password fallback
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    def safe_save(upload_file: UploadFile, allowed_extensions: set[str]) -> str:
        safe_name = Path(upload_file.filename or "file").name
        ext = Path(safe_name).suffix.lower()
        if ext not in allowed_extensions:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or 'unknown'}")
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(UPLOAD_DIR, unique_name)
        written = 0
        with open(dest, "wb") as f:
            while True:
                chunk = upload_file.file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    f.close()
                    try:
                        os.remove(dest)
                    except OSError:
                        pass
                    raise HTTPException(status_code=413, detail=f"File too large: {safe_name}")
                f.write(chunk)
        return os.path.abspath(dest)
    
    # Save client list
    client_list_path = safe_save(client_list, CLIENT_LIST_EXTENSIONS)
    _set_parse_progress(progress_id, 5, "Reading client list...", "client_list")
    
    # Parse client list (CSV or Excel)
    csv_service = CSVService()
    clients = await run_in_threadpool(
        csv_service.parse_client_list,
        client_list_path,
        sheet_name,
        name_column
    )
    _set_parse_progress(progress_id, 12, f"Loaded {len(clients)} clients.", "client_list")
    
    # Filter out excluded brokers if provided
    if excluded_brokers:
        try:
            excluded = json.loads(excluded_brokers)
        except (json.JSONDecodeError, TypeError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid excluded_brokers JSON: {e}")
        if excluded:
            excluded_set = set(e.strip().lower() for e in excluded)
            def _get_broker_name(client: dict) -> str:
                raw = client.get('raw_data', {})
                if not isinstance(raw, dict):
                    return ''
                for key, val in raw.items():
                    k = str(key).lower().strip()
                    if k in ('broker', 'broker_name', 'brokername', 'source', 'dp name', 'dpname', 'depository participant'):
                        return str(val).strip()
                return ''
            clients = [c for c in clients if _get_broker_name(c).lower() not in excluded_set]

    # Filter by selected AP codes if provided
    if ap_codes:
        try:
            selected = json.loads(ap_codes)
        except (json.JSONDecodeError, TypeError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid ap_codes JSON: {e}")
        if selected:
            clients = csv_service.filter_clients_by_ap_codes(clients, selected)
    
    # Parse all PDFs and combine transactions
    pdf_service = PDFService()
    all_transactions = []
    pdf_paths = []
    page_offset = 0
    
    for pdf_file in pdf:
        file_index = len(pdf_paths) + 1
        pdf_path = safe_save(pdf_file, PDF_EXTENSIONS)
        _set_parse_progress(
            progress_id,
            12 + int((file_index - 1) / max(len(pdf), 1) * 48),
            f"Saving PDF {file_index} of {len(pdf)}: {pdf_file.filename}",
            "saving_pdf",
            current_file=file_index,
            total_files=len(pdf),
        )
        pdf_paths.append(pdf_path)
        _set_parse_progress(
            progress_id,
            15 + int((file_index - 1) / max(len(pdf), 1) * 45),
            f"Parsing PDF {file_index} of {len(pdf)}: {pdf_file.filename}",
            "parsing_pdf",
            current_file=file_index,
            total_files=len(pdf),
        )
        def report_pdf_progress(phase: str, done: int, total: int):
            phase_weight = 0.5 if phase == "tables" else 1.0
            page_fraction = 0 if total == 0 else (done / total) * phase_weight
            if phase == "text":
                page_fraction = 0.5 + (0 if total == 0 else (done / total) * 0.5)
            pdf_fraction = ((file_index - 1) + page_fraction) / max(len(pdf), 1)
            percent = 15 + int(pdf_fraction * 45)
            label = "Extracting tables" if phase == "tables" else "Reading text"
            _set_parse_progress(
                progress_id,
                percent,
                f"{label} from PDF {file_index} of {len(pdf)}: page {done} of {total}",
                "parsing_pdf",
                current_file=file_index,
                total_files=len(pdf),
                current_page=done,
                total_pages=total,
            )

        txns = await run_in_threadpool(pdf_service.parse_transactions, pdf_path, pdf_passwords.get(pdf_file.filename, password), bank_name, report_pdf_progress)
        for tx in txns:
            if tx.get("page_number"):
                tx["page_number"] += page_offset
            tx["pdf_filename"] = pdf_file.filename
            tx["payment_method"] = detect_payment_method(tx.get("description"), tx.get("party_name"))
        all_transactions.extend(txns)
        page_offset += await run_in_threadpool(pdf_service.get_page_count, pdf_path, pdf_passwords.get(pdf_file.filename, password or ""))
        _set_parse_progress(
            progress_id,
            15 + int(file_index / max(len(pdf), 1) * 45),
            f"Parsed PDF {file_index} of {len(pdf)} ({len(all_transactions)} transactions found).",
            "parsing_pdf",
            current_file=file_index,
            total_files=len(pdf),
            transactions_found=len(all_transactions),
        )
    
    # Create session
    session_service = SessionService(db)
    config = ConfigService(db)
    settings = config.get_all()
    settings['suspicious_threshold'] = threshold
    
    session = session_service.create_session(
        name=f"Audit: {', '.join(p.filename for p in pdf)}",
        pdf_path=json.dumps(pdf_paths),
        csv_path=client_list_path,
        settings_snapshot=settings
    )
    _set_parse_progress(progress_id, 65, f"Saving {len(all_transactions)} transactions...", "saving_transactions")
    
    # Add transactions
    transactions = session_service.add_transactions(session.id, all_transactions)
    _set_parse_progress(progress_id, 72, "Tagging transactions...", "tagging", transactions_found=len(transactions))
    
    # Auto-tag (pass session settings so per-session threshold is used)
    tagging = TaggingService(db)
    def report_tagging(done: int, total: int):
        pct = 72 if total == 0 else 72 + int((done / total) * 23)
        _set_parse_progress(
            progress_id,
            pct,
            f"Tagging transactions {done} of {total}...",
            "tagging",
            transactions_tagged=done,
            transaction_count=total,
        )

    tags = tagging.auto_tag_session(session.id, clients, session_settings=settings, progress_callback=report_tagging)
    _set_parse_progress(progress_id, 96, "Writing audit log...", "finalizing")
    
    # Log
    audit = AuditService(db)
    audit.log("session_created", "session", session.id, 
              old_value=None, 
              new_value={"transaction_count": len(transactions), "tag_count": len(tags)},
              session_id=session.id, is_auto=True)
    session_service.mark_session_status(session.id, "completed")
    _set_parse_progress(
        progress_id,
        100,
        f"Audit ready: {len(transactions)} transactions, {len(tags)} tags.",
        "complete",
        session_id=session.id,
        transaction_count=len(transactions),
        tag_count=len(tags),
    )
    
    return {
        "session_id": session.id,
        "transaction_count": len(transactions),
        "tag_count": len(tags),
        "client_count": len(clients)
    }

@router.get("/session/{session_id}/tags/summary")
def get_tag_summary(session_id: int, db: Session = Depends(get_db)):
    tagging = TaggingService(db)
    return tagging.get_tag_summary(session_id)

@router.get("/session/{session_id}/client-names")
def get_client_names(session_id: int, db: Session = Depends(get_db)):
    """Return unique client names from the session's uploaded CSV."""
    service = SessionService(db)
    session = service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    names: List[str] = []
    if session.csv_path and os.path.exists(session.csv_path):
        try:
            csv_svc = CSVService()
            clients = csv_svc.parse_client_list(session.csv_path)
            seen = set()
            for c in clients:
                n = c.get("name", "").strip()
                if n and n.lower() not in seen:
                    seen.add(n.lower())
                    names.append(n)
        except Exception:
            pass
    return names

@router.post("/{transaction_id}/notes")
def update_transaction_notes(
    transaction_id: int,
    data: TransactionNotesUpdate,
    db: Session = Depends(get_db)
):
    """Add or update user notes on a transaction"""
    service = SessionService(db)
    existing = service.get_transaction(transaction_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Transaction not found")
    old_notes = existing.user_notes
    tx = service.update_transaction(transaction_id, user_notes=data.notes)
    AuditService(db).log(
        "notes_updated", "transaction", transaction_id,
        old_value={"notes": old_notes},
        new_value={"notes": data.notes},
        session_id=tx.session_id,
        is_auto=False,
    )
    return {"success": True, "user_notes": data.notes}

@router.post("/{transaction_id}/exported")
def mark_transaction_exported(
    transaction_id: int,
    db: Session = Depends(get_db)
):
    """Mark a transaction as exported"""
    from backend.models import utc_now
    service = SessionService(db)
    tx = service.update_transaction(transaction_id, exported_at=utc_now())
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"success": True, "exported_at": tx.exported_at}

@router.post("/session/{session_id}/retag")
def retag_session(
    session_id: int,
    db: Session = Depends(get_db)
):
    """Re-run auto-tagging on all transactions in a session using current settings."""
    service = SessionService(db)
    session = service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Reload clients from the session's original CSV path
    clients: List[Dict] = []
    csv_svc = CSVService()
    if session.csv_path and os.path.exists(session.csv_path):
        try:
            clients = csv_svc.parse_client_list(session.csv_path)
        except Exception:
            pass  # Proceed with empty clients; broker/suspicious tagging still works

    tagging = TaggingService(db)
    session_settings = session.settings_snapshot or {}
    tags = tagging.auto_tag_session(session_id, clients, session_settings=session_settings)
    tag_count = len(tags)

    audit = AuditService(db)
    audit.log(
        "retag_triggered", "session", session_id,
        new_value={"tag_count": tag_count},
        session_id=session_id,
        is_auto=False
    )
    return {"success": True, "session_id": session_id, "tag_count": tag_count}


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def patch_transaction(
    transaction_id: int,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
):
    """Patch editable fields on a transaction (party name override, description, notes)."""
    service = SessionService(db)
    tx = service.get_transaction(transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    old_values = {}
    new_values = {}

    provided_fields = data.model_fields_set

    if "party_name" in provided_fields and data.party_name != tx.party_name:
        old_values["party_name"] = tx.party_name
        new_values["party_name"] = data.party_name
        tx.party_name = data.party_name

    if "description" in provided_fields and data.description != tx.description:
        old_values["description"] = tx.description
        new_values["description"] = data.description
        tx.description = data.description

    if "notes" in provided_fields and data.notes != tx.user_notes:
        old_values["notes"] = tx.user_notes
        new_values["notes"] = data.notes
        tx.user_notes = data.notes

    if new_values:
        db.commit()
        db.refresh(tx)
        audit = AuditService(db)
        audit.log(
            "transaction_updated", "transaction", transaction_id,
            old_value=old_values, new_value=new_values,
            session_id=tx.session_id, is_auto=False,
        )

    return tx


@router.post("/session/{session_id}/append")
async def append_pdfs_to_session(
    session_id: int,
    pdf: List[UploadFile] = File(...),
    password: Optional[str] = Form(None),
    bank_name: Optional[str] = Form(None),
    progress_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Append additional PDFs to an existing session and re-tag new transactions."""
    session_service = SessionService(db)
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session_service.mark_session_status(session_id, "active")
    _set_parse_progress(progress_id, 1, "Preparing files…", "preparing")

    pdf_passwords: dict = {}
    if password:
        try:
            parsed = json.loads(password)
            if isinstance(parsed, dict):
                pdf_passwords = parsed
                password = None
        except (json.JSONDecodeError, TypeError):
            pass

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    def safe_save(upload_file: UploadFile, allowed_extensions: set) -> str:
        safe_name = Path(upload_file.filename or "file").name
        ext = Path(safe_name).suffix.lower()
        if ext not in allowed_extensions:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or 'unknown'}")
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(UPLOAD_DIR, unique_name)
        written = 0
        with open(dest, "wb") as f:
            while True:
                chunk = upload_file.file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    f.close()
                    try:
                        os.remove(dest)
                    except OSError:
                        pass
                    raise HTTPException(status_code=413, detail=f"File too large: {safe_name}")
                f.write(chunk)
        return os.path.abspath(dest)

    # Load existing client list from session
    csv_service = CSVService()
    clients = []
    if session.csv_path and os.path.exists(session.csv_path):
        try:
            clients = await run_in_threadpool(csv_service.parse_client_list, session.csv_path)
        except Exception:
            pass  # Continue without client list; broker/suspicious tagging still works

    existing_count = session_service.get_transaction_count(session_id)

    # Parse the new PDFs
    pdf_service = PDFService()
    all_new_transactions = []
    new_pdf_paths: List[str] = []

    for i, pdf_file in enumerate(pdf):
        file_index = i + 1
        pdf_path = safe_save(pdf_file, PDF_EXTENSIONS)
        new_pdf_paths.append(pdf_path)
        _set_parse_progress(
            progress_id,
            10 + int((i / max(len(pdf), 1)) * 60),
            f"Parsing PDF {file_index} of {len(pdf)}: {pdf_file.filename}",
            "parsing_pdf",
            current_file=file_index,
            total_files=len(pdf),
        )

        def report_pdf_progress(phase: str, done: int, total: int):
            pass  # sub-progress suppressed for simplicity

        txns = await run_in_threadpool(
            pdf_service.parse_transactions,
            pdf_path,
            pdf_passwords.get(pdf_file.filename, password),
            bank_name,
            report_pdf_progress,
        )
        for tx in txns:
            tx["pdf_filename"] = pdf_file.filename
            tx["payment_method"] = detect_payment_method(tx.get("description"), tx.get("party_name"))
        all_new_transactions.extend(txns)
        _set_parse_progress(
            progress_id,
            10 + int((file_index / max(len(pdf), 1)) * 60),
            f"Parsed PDF {file_index} of {len(pdf)} ({len(all_new_transactions)} new transactions).",
            "parsing_pdf",
        )

    if not all_new_transactions:
        session_service.mark_session_status(session_id, "completed")
        _set_parse_progress(progress_id, 100, "No transactions found in the new PDFs.", "complete", session_id=session_id, transaction_count=0)
        return {"session_id": session_id, "new_transaction_count": 0, "tag_count": 0}

    _set_parse_progress(progress_id, 72, f"Saving {len(all_new_transactions)} new transactions…", "saving_transactions")

    # Store settings snapshot from session (preserve original threshold etc.)
    session_settings = session.settings_snapshot or {}
    config = ConfigService(db)
    effective_settings = {**config.get_all(), **session_settings}

    new_transactions = session_service.add_transactions(session_id, all_new_transactions)

    _set_parse_progress(progress_id, 80, "Tagging new transactions…", "tagging")

    tagging = TaggingService(db)
    new_tx_ids = [t.id for t in new_transactions]

    def _tag_new_only():
        return tagging.auto_tag_transactions(new_tx_ids, clients, session_settings=effective_settings)

    tags = await run_in_threadpool(_tag_new_only)

    # Persist appended PDF paths without mutating the user-visible session name.
    try:
        existing_paths = json.loads(session.pdf_path or "[]") if session.pdf_path else []
        if not isinstance(existing_paths, list):
            existing_paths = [existing_paths]
    except (json.JSONDecodeError, TypeError):
        existing_paths = [session.pdf_path] if session.pdf_path else []
    session.pdf_path = json.dumps([p for p in [*existing_paths, *new_pdf_paths] if p])
    db.commit()

    audit = AuditService(db)
    audit.log(
        "session_created", "session", session_id,
        old_value={"existing_transactions": existing_count},
        new_value={"appended_transactions": len(new_transactions), "tag_count": len(tags)},
        session_id=session_id, is_auto=False,
    )
    session_service.mark_session_status(session_id, "completed")

    _set_parse_progress(
        progress_id, 100,
        f"Appended {len(new_transactions)} transactions, {len(tags)} tags applied.",
        "complete",
        session_id=session_id,
        transaction_count=len(new_transactions),
        tag_count=len(tags),
    )

    return {
        "session_id": session_id,
        "new_transaction_count": len(new_transactions),
        "tag_count": len(tags),
    }
