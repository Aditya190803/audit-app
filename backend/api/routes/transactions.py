from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.database import get_db
from backend.schemas import TransactionResponse, ParseRequest
from backend.services.session_service import SessionService
from backend.services.pdf_service import PDFService
from backend.services.csv_service import CSVService
from backend.services.tagging_service import TaggingService
from backend.services.config_service import ConfigService
from backend.services.audit_service import AuditService
import os
import shutil
import json
import time
from threading import Lock

router = APIRouter(prefix="/transactions", tags=["transactions"])

_progress_lock = Lock()
_parse_progress = {}

def _set_parse_progress(progress_id: Optional[str], percent: int, message: str, stage: str = "processing", **extra):
    if not progress_id:
        return
    payload = {
        "id": progress_id,
        "percent": max(0, min(100, int(percent))),
        "message": message,
        "stage": stage,
        "updated_at": time.time(),
        **extra,
    }
    with _progress_lock:
        _parse_progress[progress_id] = payload

def _get_parse_progress(progress_id: str):
    with _progress_lock:
        return _parse_progress.get(progress_id)

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

@router.get("/parsers")
def list_parsers():
    from backend.services.parsers import registry
    return registry.parser_list()

@router.get("/session/{session_id}", response_model=List[TransactionResponse])
def get_transactions(session_id: int, db: Session = Depends(get_db)):
    service = SessionService(db)
    return service.get_transactions(session_id)

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
    bank_profile_id: Optional[int] = Form(None),
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
    upload_dir = os.path.abspath("uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    # Save client list
    client_list_path = os.path.join(upload_dir, client_list.filename)
    with open(client_list_path, "wb") as f:
        shutil.copyfileobj(client_list.file, f)
    client_list_path = os.path.abspath(client_list_path)
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
        except Exception:
            pass

    # Filter by selected AP codes if provided
    if ap_codes:
        try:
            selected = json.loads(ap_codes)
            if selected:
                clients = csv_service.filter_clients_by_ap_codes(clients, selected)
        except Exception:
            pass
    
    # Parse all PDFs and combine transactions
    pdf_service = PDFService()
    all_transactions = []
    pdf_paths = []
    page_offset = 0
    
    for pdf_file in pdf:
        file_index = len(pdf_paths) + 1
        pdf_path = os.path.join(upload_dir, pdf_file.filename)
        _set_parse_progress(
            progress_id,
            12 + int((file_index - 1) / max(len(pdf), 1) * 48),
            f"Saving PDF {file_index} of {len(pdf)}: {pdf_file.filename}",
            "saving_pdf",
            current_file=file_index,
            total_files=len(pdf),
        )
        with open(pdf_path, "wb") as f:
            shutil.copyfileobj(pdf_file.file, f)
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
            # Detect payment method from description
            desc = (tx.get("description") or "") + " " + (tx.get("party_name") or "")
            methods = {
                "NEFT": r'\bNEFT\b',
                "RTGS": r'\bRTGS\b',
                "IMPS": r'\bIMPS\b',
                "UPI": r'\bUPI\b',
                "CASH": r'\bCASH\b',
                "CHEQUE": r'\bCHEQUE\b|\bCHQ\b|\bCH\.?\b',
                "ECS": r'\bECS\b',
                "ATM": r'\bATM\b',
                "POS": r'\bPOS\b',
                "SWIFT": r'\bSWIFT\b',
            }
            import re
            detected = "OTHER"
            for method, pattern in methods.items():
                if re.search(pattern, desc, re.IGNORECASE):
                    detected = method
                    break
            tx["payment_method"] = detected
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

@router.post("/{transaction_id}/review")
def update_review_status(
    transaction_id: int,
    status: str = Form(...),
    db: Session = Depends(get_db)
):
    """Update review status: unreviewed, reviewed, needs_review, flagged"""
    service = SessionService(db)
    tx = service.update_transaction(transaction_id, review_status=status)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"success": True, "review_status": status}

@router.post("/{transaction_id}/notes")
def update_transaction_notes(
    transaction_id: int,
    notes: str = Form(...),
    db: Session = Depends(get_db)
):
    """Add or update user notes on a transaction"""
    service = SessionService(db)
    tx = service.update_transaction(transaction_id, user_notes=notes)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"success": True, "user_notes": notes}

@router.post("/{transaction_id}/exported")
def mark_transaction_exported(
    transaction_id: int,
    db: Session = Depends(get_db)
):
    """Mark a transaction as exported"""
    from datetime import datetime
    service = SessionService(db)
    tx = service.update_transaction(transaction_id, exported_at=datetime.utcnow())
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"success": True, "exported_at": tx.exported_at}
