from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from backend.database import get_db
from backend.services.session_service import SessionService
from backend.services.export_service import ExportService
import json
import os
from pathlib import Path

EXPORT_DIR = os.path.abspath("exports")

def _filter_export_transactions(transactions, export_type: str, transaction_ids_str: Optional[str] = None):
    """Filter transactions by export type and optional transaction_ids."""
    if transaction_ids_str:
        try:
            ids = set(json.loads(transaction_ids_str))
            transactions = [t for t in transactions if t.id in ids]
        except (json.JSONDecodeError, TypeError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid transaction_ids JSON: {e}")
    if export_type == "client":
        transactions = [t for t in transactions if any(tag.tag_type == "client" for tag in t.tags)]
    elif export_type == "broker":
        transactions = [t for t in transactions if any(tag.tag_type == "broker" for tag in t.tags)]
    elif export_type == "suspicious":
        transactions = [t for t in transactions if any(tag.tag_type == "suspicious" for tag in t.tags)]
    elif export_type == "tagged":
        transactions = [t for t in transactions if t.tags]
    return transactions

router = APIRouter(prefix="/export", tags=["export"])

def _ensure_export_path(file_path: str) -> str:
    requested_path = Path(file_path).expanduser()
    if requested_path.is_absolute():
        requested_path.parent.mkdir(parents=True, exist_ok=True)
        return str(requested_path)

    os.makedirs(EXPORT_DIR, exist_ok=True)
    safe = requested_path.name
    return os.path.join(EXPORT_DIR, safe)

@router.post("/excel/{session_id}")
def export_excel(session_id: int, export_type: str = "all", file_path: Optional[str] = None, transaction_ids: Optional[str] = Query(None), db: Session = Depends(get_db)):
    session_service = SessionService(db)
    session = session_service.get_session(session_id)
    transactions = _filter_export_transactions(session_service.get_transactions(session_id), export_type, transaction_ids)
    if not file_path:
        file_path = f"export_{session_id}_{export_type}.xlsx"
    output_path = _ensure_export_path(file_path)
    export_service = ExportService(db)
    export_service.export_excel(transactions, output_path, session.name if session else "Audit")
    return {"file_path": output_path, "count": len(transactions)}
