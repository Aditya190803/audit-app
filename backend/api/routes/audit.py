from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.schemas import AuditLogResponse
from backend.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["audit"])

@router.get("/session/{session_id}", response_model=List[AuditLogResponse])
def get_session_logs(session_id: int, limit: int = 100, db: Session = Depends(get_db)):
    service = AuditService(db)
    return service.get_logs_for_session(session_id, limit)

@router.get("/", response_model=List[AuditLogResponse])
def get_all_logs(limit: int = 500, db: Session = Depends(get_db)):
    service = AuditService(db)
    return service.get_all_logs(limit)
