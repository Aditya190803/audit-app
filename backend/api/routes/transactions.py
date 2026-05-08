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
    pdf: UploadFile = File(...),
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
    """Parse PDF and client list, create session, and auto-tag transactions."""
    # Save uploaded files
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    pdf_path = os.path.join(upload_dir, pdf.filename)
    client_list_path = os.path.join(upload_dir, client_list.filename)
    
    with open(pdf_path, "wb") as f:
        shutil.copyfileobj(pdf.file, f)
    with open(client_list_path, "wb") as f:
        shutil.copyfileobj(client_list.file, f)
    
    # Parse PDF
    pdf_service = PDFService()
    transactions_data = pdf_service.parse_transactions(pdf_path, password, bank_name=bank_name)
    
    # Parse client list (CSV or Excel)
    csv_service = CSVService()
    clients = csv_service.parse_client_list(
        client_list_path,
        sheet_name=sheet_name,
        name_column=name_column
    )
    
    # Filter out excluded brokers if provided
    if excluded_brokers:
        import json
        try:
            excluded = json.loads(excluded_brokers)
            if excluded:
                clients = [c for c in clients if c.get('broker') not in excluded]
        except Exception:
            pass

    # Filter by selected AP codes if provided
    if ap_codes:
        import json
        try:
            selected = json.loads(ap_codes)
            if selected:
                clients = csv_service.filter_clients_by_ap_codes(clients, selected)
        except Exception:
            pass
    
    # Create session
    session_service = SessionService(db)
    config = ConfigService(db)
    settings = config.get_all()
    settings['suspicious_threshold'] = threshold
    
    session = session_service.create_session(
        name=f"Audit: {pdf.filename}",
        pdf_path=pdf_path,
        csv_path=client_list_path,
        settings_snapshot=settings
    )
    
    # Add transactions
    transactions = session_service.add_transactions(session.id, transactions_data)
    
    # Auto-tag
    tagging = TaggingService(db)
    tags = tagging.auto_tag_session(session.id, clients)
    
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
