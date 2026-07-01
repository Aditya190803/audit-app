import asyncio
import json
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
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
from backend.services.progress_service import ParseProgressStore
from backend.services.upload_service import (
    CLIENT_LIST_EXTENSIONS,
    PDF_EXTENSIONS,
    save_upload,
)
from backend.services.draft_cache import draft_cache

router = APIRouter(prefix="/transactions", tags=["transactions"])

UPLOAD_DIR = os.path.abspath(os.environ.get("AUDIT_UPLOAD_DIR", "uploads"))
MAX_UPLOAD_BYTES = int(os.environ.get("AUDIT_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
_progress_store = ParseProgressStore()

def _set_parse_progress(progress_id: Optional[str], percent: int, message: str, stage: str = "processing", **extra):
    _progress_store.set(progress_id, percent, message, stage, **extra)

def _get_parse_progress(progress_id: str):
    return _progress_store.get(progress_id, consume_terminal=True)

def _save_upload_file(upload_file: UploadFile, allowed_extensions: set[str]) -> str:
    return save_upload(
        upload_file,
        upload_dir=UPLOAD_DIR,
        allowed_extensions=allowed_extensions,
        max_bytes=MAX_UPLOAD_BYTES,
    )

def _parse_passwords(password: Optional[str]) -> tuple[dict, Optional[str]]:
    """Split the password form field into (per-file map, single fallback).

    The frontend sends either one password string or a JSON map of
    {filename: password}. Returns ({}, password) when no map is present.
    """
    if not password:
        return {}, None
    try:
        parsed = json.loads(password)
        if isinstance(parsed, dict):
            return parsed, None
    except (json.JSONDecodeError, TypeError):
        pass  # single password fallback
    return {}, password

def _is_encryption_error(exc: Exception) -> bool:
    """PyMuPDF/pdfplumber raise ValueError when a PDF needs a password we don't have."""
    return isinstance(exc, ValueError) and "encrypted" in str(exc).lower()

def _password_protected_pdf_error(filenames: list[str]) -> HTTPException:
    names = ", ".join(filenames)
    return HTTPException(
        status_code=400,
        detail=f"Could not read password-protected PDF(s): {names}. Enter the correct password and try again.",
    )

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



@router.get("/parse-progress/{progress_id}/stream")
async def stream_parse_progress(progress_id: str):
    """SSE endpoint — push-based progress updates until complete or error."""
    loop = asyncio.get_running_loop()
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    current = _progress_store.subscribe(progress_id, q, loop)
    if current:
        await q.put(current)

    async def event_generator():
        import json as _json
        last_percent = -1
        last_msg = ""
        try:
            while True:
                try:
                    # Wait for a pushed update (with timeout as safety net)
                    progress = await asyncio.wait_for(q.get(), timeout=2.0)
                except asyncio.TimeoutError:
                    # No update pushed recently — check current state as fallback
                    progress = _progress_store.get(progress_id)
                    if progress is None:
                        progress = {"id": progress_id, "percent": 0, "message": "Waiting to start...", "stage": "queued"}
                    # Always send on timeout so client knows we're alive
                    yield f"data: {_json.dumps(progress)}\n\n"
                    stage = progress.get("stage", "")
                    if stage in ("complete", "error"):
                        break
                    continue

                # Drain any queued updates to avoid lag — keep the latest
                latest = progress
                while not q.empty():
                    try:
                        latest = q.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                progress = latest

                pct = progress.get("percent", 0)
                stage = progress.get("stage", "")

                # Send if percent changed, stage changed, or terminal
                if pct != last_percent or stage in ("complete", "error") or progress.get("message") != last_msg:
                    yield f"data: {_json.dumps(progress)}\n\n"
                    last_percent = pct
                    last_msg = progress.get("message")

                if stage in ("complete", "error"):
                    break
        finally:
            # Unsubscribe
            _progress_store.unsubscribe(progress_id, q, loop)

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

@router.post("/preparse")
async def preparse_pdf(
    pdf: UploadFile = File(...),
    password: Optional[str] = Form(None),
    bank_name: Optional[str] = Form(None),
):
    """Pre-extract tables + text from a dropped PDF so Start is instant.

    Does NOT run the parser or create a session — just caches the expensive
    extraction keyed by file hash + password. Password-protected PDFs that
    cannot be opened return HTTP 400 so the frontend can prompt at drop time.
    """
    pdf_passwords, single_password = _parse_passwords(password)
    pw = pdf_passwords.get(pdf.filename, single_password)
    saved_path = _save_upload_file(pdf, PDF_EXTENSIONS)
    file_hash = draft_cache.file_hash(saved_path, pw)

    cached = draft_cache.get(file_hash)
    if cached:
        return {"file_hash": file_hash, "cached": True, "page_count": cached["page_count"]}

    pdf_service = PDFService()
    try:
        tables = await run_in_threadpool(pdf_service.extract_tables, saved_path, pw, None)
        pages = await run_in_threadpool(pdf_service.extract_text, saved_path, pw, None)
        page_count = await run_in_threadpool(pdf_service.get_page_count, saved_path, pw or "")
    except Exception as e:
        if _is_encryption_error(e):
            raise HTTPException(
                status_code=400,
                detail=f"Could not read password-protected PDF: {pdf.filename}. Enter the correct password and try again.",
            ) from e
        raise

    draft_cache.put(file_hash, tables, pages, page_count, saved_path)
    return {
        "file_hash": file_hash,
        "cached": False,
        "page_count": page_count,
        "warnings": list(pdf_service.last_warnings),
    }

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
    pdf_hashes: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Parse one or more PDFs and client list, create session, and auto-tag transactions."""
    _set_parse_progress(progress_id, 1, "Preparing files...", "preparing")
    pdf_passwords, password = _parse_passwords(password)
    # Optional pre-parse cache: {filename -> file_hash} from the frontend's preparse step.
    # Files present in the cache skip the slow extract_tables/extract_text step.
    hash_by_filename: Dict[str, str] = {}
    if pdf_hashes:
        try:
            parsed_hashes = json.loads(pdf_hashes)
            if isinstance(parsed_hashes, dict):
                hash_by_filename = parsed_hashes
        except (json.JSONDecodeError, TypeError):
            pass  # ignore malformed; fall back to full extract
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    # Save client list
    client_list_path = _save_upload_file(client_list, CLIENT_LIST_EXTENSIONS)
    _set_parse_progress(progress_id, 5, "Reading client list...", "client_list")
    
    # Parse client list (CSV or Excel)
    csv_service = CSVService()
    try:
        clients = await run_in_threadpool(
            csv_service.parse_client_list,
            client_list_path,
            sheet_name,
            name_column,
            True,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read the client list file. Check that it is a valid CSV or Excel file with a name column. ({e})",
        ) from e
    if not clients:
        raise HTTPException(status_code=400, detail="Client list did not contain any usable client names")
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
    parse_warnings = []
    password_protected: list[str] = []
    
    for pdf_file in pdf:
        file_index = len(pdf_paths) + 1
        pdf_path = _save_upload_file(pdf_file, PDF_EXTENSIONS)
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

        # Fast path: pre-parse cache hit -> skip extraction, run parser on cached tables/pages.
        cached = draft_cache.get(hash_by_filename.get(pdf_file.filename, "")) if pdf_file.filename in hash_by_filename else None
        try:
            if cached:
                txns = await run_in_threadpool(pdf_service.parse_from_extraction, cached["tables"], cached["pages"], bank_name)
                this_page_count = cached["page_count"]
            else:
                txns = await run_in_threadpool(pdf_service.parse_transactions, pdf_path, pdf_passwords.get(pdf_file.filename, password), bank_name, report_pdf_progress)
                this_page_count = await run_in_threadpool(pdf_service.get_page_count, pdf_path, pdf_passwords.get(pdf_file.filename, password or ""))
        except Exception as e:
            if _is_encryption_error(e):
                password_protected.append(pdf_file.filename)
                continue
            raise
        for warning in pdf_service.last_warnings:
            parse_warnings.append(f"{pdf_file.filename}: {warning}")
        for tx in txns:
            if tx.get("page_number"):
                tx["page_number"] += page_offset
            tx["pdf_filename"] = pdf_file.filename
            tx["payment_method"] = detect_payment_method(tx.get("description"), tx.get("party_name"))
        all_transactions.extend(txns)
        page_offset += this_page_count
        _set_parse_progress(
            progress_id,
            15 + int(file_index / max(len(pdf), 1) * 45),
            f"Parsed PDF {file_index} of {len(pdf)} ({len(all_transactions)} transactions found).",
            "parsing_pdf",
            current_file=file_index,
            total_files=len(pdf),
            transactions_found=len(all_transactions),
        )
    
    if password_protected:
        raise _password_protected_pdf_error(password_protected)

    # Create session — run in threadpool to keep event loop free for SSE
    session_service = SessionService(db)
    config = ConfigService(db)
    settings = config.get_all()
    settings['suspicious_threshold'] = threshold
    
    _set_parse_progress(progress_id, 62, "Creating audit session...", "creating_session")
    await asyncio.sleep(0)  # yield to event loop so SSE can send this update
    session = await run_in_threadpool(
        session_service.create_session,
        name=f"Audit: {', '.join(p.filename for p in pdf)}",
        pdf_path=json.dumps(pdf_paths),
        csv_path=client_list_path,
        settings_snapshot=settings
    )
    _set_parse_progress(progress_id, 65, f"Saving {len(all_transactions)} transactions...", "saving_transactions")
    await asyncio.sleep(0)
    
    # Add transactions — run in threadpool (can be slow with many transactions)
    transactions = await run_in_threadpool(session_service.add_transactions, session.id, all_transactions)
    _set_parse_progress(progress_id, 72, "Tagging transactions...", "tagging", transactions_found=len(transactions))
    await asyncio.sleep(0)
    
    # Auto-tag — run in threadpool so SSE receives granular tagging progress
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

    tags = await run_in_threadpool(tagging.auto_tag_session, session.id, clients, session_settings=settings, progress_callback=report_tagging)
    _set_parse_progress(progress_id, 96, "Writing audit log...", "finalizing")
    await asyncio.sleep(0)
    
    # Log — run in threadpool
    audit = AuditService(db)
    await run_in_threadpool(
        audit.log, "session_created", "session", session.id,
        old_value=None,
        new_value={"transaction_count": len(transactions), "tag_count": len(tags)},
        session_id=session.id, is_auto=True
    )
    final_status = "completed_with_warnings" if parse_warnings else "completed"
    await run_in_threadpool(session_service.mark_session_status, session.id, final_status)
    _set_parse_progress(
        progress_id,
        100,
        f"Audit ready: {len(transactions)} transactions, {len(tags)} tags."
        + (f" {len(parse_warnings)} warning(s)." if parse_warnings else ""),
        "complete",
        session_id=session.id,
        transaction_count=len(transactions),
        tag_count=len(tags),
        warnings=parse_warnings,
    )
    
    return {
        "session_id": session.id,
        "transaction_count": len(transactions),
        "tag_count": len(tags),
        "client_count": len(clients),
        "warnings": parse_warnings,
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
        except Exception as exc:
            print(f"[transactions] Failed to read client list for session {session_id}: {exc}")
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
    client_list_warning = None
    if session.csv_path and os.path.exists(session.csv_path):
        try:
            clients = csv_svc.parse_client_list(session.csv_path)
        except Exception as exc:
            client_list_warning = f"Client list could not be read; client matching was skipped: {exc}"

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
    return {"success": True, "session_id": session_id, "tag_count": tag_count, "client_list_warning": client_list_warning}


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

    pdf_passwords, password = _parse_passwords(password)

    # Load existing client list from session
    csv_service = CSVService()
    clients = []
    append_warnings = []
    if session.csv_path and os.path.exists(session.csv_path):
        try:
            clients = await run_in_threadpool(csv_service.parse_client_list, session.csv_path, None, None, True)
        except Exception as exc:
            append_warnings.append(f"Client list could not be read; client matching was skipped: {exc}")

    existing_count = session_service.get_transaction_count(session_id)

    # Parse the new PDFs
    pdf_service = PDFService()
    all_new_transactions = []
    new_pdf_paths: List[str] = []
    password_protected: list[str] = []

    for i, pdf_file in enumerate(pdf):
        file_index = i + 1
        pdf_path = _save_upload_file(pdf_file, PDF_EXTENSIONS)
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

        try:
            txns = await run_in_threadpool(
                pdf_service.parse_transactions,
                pdf_path,
                pdf_passwords.get(pdf_file.filename, password),
                bank_name,
                report_pdf_progress,
            )
        except Exception as e:
            if _is_encryption_error(e):
                password_protected.append(pdf_file.filename)
                continue
            raise
        for warning in pdf_service.last_warnings:
            append_warnings.append(f"{pdf_file.filename}: {warning}")
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

    if password_protected:
        raise _password_protected_pdf_error(password_protected)

    if not all_new_transactions:
        status = "completed_with_warnings" if append_warnings else "completed"
        session_service.mark_session_status(session_id, status)
        _set_parse_progress(
            progress_id,
            100,
            "No transactions found in the new PDFs."
            + (f" {len(append_warnings)} warning(s)." if append_warnings else ""),
            "complete",
            session_id=session_id,
            transaction_count=0,
            warnings=append_warnings,
        )
        return {"session_id": session_id, "new_transaction_count": 0, "tag_count": 0, "warnings": append_warnings}

    _set_parse_progress(progress_id, 72, f"Saving {len(all_new_transactions)} new transactions…", "saving_transactions")
    await asyncio.sleep(0)

    # Store settings snapshot from session (preserve original threshold etc.)
    session_settings = session.settings_snapshot or {}
    config = ConfigService(db)
    effective_settings = {**config.get_all(), **session_settings}

    new_transactions = await run_in_threadpool(session_service.add_transactions, session_id, all_new_transactions)

    _set_parse_progress(progress_id, 80, "Tagging new transactions…", "tagging")
    await asyncio.sleep(0)

    tagging = TaggingService(db)
    new_tx_ids = [t.id for t in new_transactions]

    def _tag_new_only():
        return tagging.auto_tag_transactions(new_tx_ids, clients, session_settings=effective_settings)

    tags = await run_in_threadpool(_tag_new_only)

    _set_parse_progress(progress_id, 92, "Finalizing…", "finalizing")
    await asyncio.sleep(0)

    # Persist appended PDF paths without mutating the user-visible session name.
    try:
        existing_paths = json.loads(session.pdf_path or "[]") if session.pdf_path else []
        if not isinstance(existing_paths, list):
            existing_paths = [existing_paths]
    except (json.JSONDecodeError, TypeError):
        existing_paths = [session.pdf_path] if session.pdf_path else []
    session.pdf_path = json.dumps([p for p in [*existing_paths, *new_pdf_paths] if p])
    await run_in_threadpool(db.commit)

    audit = AuditService(db)
    await run_in_threadpool(
        audit.log,
        "session_created", "session", session_id,
        old_value={"existing_transactions": existing_count},
        new_value={"appended_transactions": len(new_transactions), "tag_count": len(tags)},
        session_id=session_id, is_auto=False,
    )
    final_status = "completed_with_warnings" if append_warnings else "completed"
    await run_in_threadpool(session_service.mark_session_status, session_id, final_status)

    _set_parse_progress(
        progress_id, 100,
        f"Appended {len(new_transactions)} transactions, {len(tags)} tags applied."
        + (f" {len(append_warnings)} warning(s)." if append_warnings else ""),
        "complete",
        session_id=session_id,
        transaction_count=len(new_transactions),
        tag_count=len(tags),
        warnings=append_warnings,
    )

    return {
        "session_id": session_id,
        "new_transaction_count": len(new_transactions),
        "tag_count": len(tags),
        "warnings": append_warnings,
    }
