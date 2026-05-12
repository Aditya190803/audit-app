from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
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

router = APIRouter(prefix="/transactions", tags=["transactions"])

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
    db: Session = Depends(get_db)
):
    """Parse one or more PDFs and client list, create session, and auto-tag transactions."""
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Save client list
    client_list_path = os.path.join(upload_dir, client_list.filename)
    with open(client_list_path, "wb") as f:
        shutil.copyfileobj(client_list.file, f)
    
    # Parse client list (CSV or Excel)
    csv_service = CSVService()
    clients = csv_service.parse_client_list(
        client_list_path,
        sheet_name=sheet_name,
        name_column=name_column
    )
    
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
        pdf_path = os.path.join(upload_dir, pdf_file.filename)
        with open(pdf_path, "wb") as f:
            shutil.copyfileobj(pdf_file.file, f)
        pdf_paths.append(pdf_path)
        txns = pdf_service.parse_transactions(pdf_path, password, bank_name=bank_name)
        for tx in txns:
            if tx.get("page_number"):
                tx["page_number"] += page_offset
        all_transactions.extend(txns)
        page_offset += pdf_service.get_page_count(pdf_path, password)
    
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
    
    # Add transactions
    transactions = session_service.add_transactions(session.id, all_transactions)
    
    # Auto-tag (pass session settings so per-session threshold is used)
    tagging = TaggingService(db)
    tags = tagging.auto_tag_session(session.id, clients, session_settings=settings)
    
    # Log
    audit = AuditService(db)
    audit.log("session_created", "session", session.id, 
              old_value=None, 
              new_value={"transaction_count": len(transactions), "tag_count": len(tags)},
              session_id=session.id, is_auto=True)
    
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
