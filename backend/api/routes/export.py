from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from backend.database import get_db
from backend.services.session_service import SessionService
from backend.services.export_service import ExportService
import os

router = APIRouter(prefix="/export", tags=["export"])

@router.post("/csv/{session_id}")
def export_csv(session_id: int, export_type: str = "all", file_path: Optional[str] = None, db: Session = Depends(get_db)):
    session_service = SessionService(db)
    transactions = session_service.get_transactions(session_id)
    
    if export_type == "client":
        transactions = [t for t in transactions if any(tag.tag_type == "client" for tag in t.tags)]
    elif export_type == "broker":
        transactions = [t for t in transactions if any(tag.tag_type == "broker" for tag in t.tags)]
    elif export_type == "suspicious":
        transactions = [t for t in transactions if any(tag.tag_type == "suspicious" for tag in t.tags)]
    elif export_type == "tagged":
        transactions = [t for t in transactions if t.tags]
    
    if not file_path:
        file_path = f"export_{session_id}_{export_type}.csv"
    
    export_service = ExportService(db)
    export_service.export_csv(transactions, file_path)
    return {"file_path": file_path, "count": len(transactions)}

@router.post("/excel/{session_id}")
def export_excel(session_id: int, export_type: str = "all", file_path: Optional[str] = None, db: Session = Depends(get_db)):
    session_service = SessionService(db)
    transactions = session_service.get_transactions(session_id)
    
    if export_type == "client":
        transactions = [t for t in transactions if any(tag.tag_type == "client" for tag in t.tags)]
    elif export_type == "broker":
        transactions = [t for t in transactions if any(tag.tag_type == "broker" for tag in t.tags)]
    elif export_type == "suspicious":
        transactions = [t for t in transactions if any(tag.tag_type == "suspicious" for tag in t.tags)]
    elif export_type == "tagged":
        transactions = [t for t in transactions if t.tags]
    
    if not file_path:
        file_path = f"export_{session_id}_{export_type}.xlsx"
    
    export_service = ExportService(db)
    export_service.export_excel(transactions, file_path)
    return {"file_path": file_path, "count": len(transactions)}

@router.post("/pdf-highlight/{session_id}")
def export_highlighted_pdf(session_id: int, file_path: Optional[str] = None, password: Optional[str] = None, db: Session = Depends(get_db)):
    session_service = SessionService(db)
    session = session_service.get_session(session_id)
    if not session or not session.pdf_path:
        raise HTTPException(status_code=404, detail="Session or PDF not found")
    
    transactions = session_service.get_transactions(session_id)
    output_path = file_path or f"highlighted_{session_id}.pdf"
    
    export_service = ExportService(db)
    export_service.export_highlighted_pdf(transactions, session.pdf_path, output_path, password)
    return {"file_path": output_path}

@router.post("/pdf-report/{session_id}")
def export_pdf_report(session_id: int, file_path: Optional[str] = None, db: Session = Depends(get_db)):
    session_service = SessionService(db)
    session = session_service.get_session(session_id)
    transactions = session_service.get_transactions(session_id)
    output_path = file_path or f"report_{session_id}.pdf"
    
    export_service = ExportService(db)
    export_service.export_clean_pdf_report(transactions, output_path, session.name if session else "Audit")
    return {"file_path": output_path}
