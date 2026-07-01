from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.schemas import AuditSessionCreate, AuditSessionResponse
from backend.services.session_service import SessionService

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.post("/", response_model=AuditSessionResponse)
def create_session(data: AuditSessionCreate, db: Session = Depends(get_db)):
    service = SessionService(db)
    return service.create_session(
        name=data.name,
        pdf_path=data.pdf_path,
        csv_path=data.csv_path,
        settings_snapshot=data.settings_snapshot
    )

@router.get("/", response_model=List[AuditSessionResponse])
def list_sessions(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    service = SessionService(db)
    return service.get_all_sessions(limit=limit, offset=offset)

@router.get("/recovery")
def get_recovery_session(db: Session = Depends(get_db)):
    service = SessionService(db)
    session = service.get_crash_recovery_session()
    if session:
        return {"found": True, "session": AuditSessionResponse.model_validate(session)}
    return {"found": False}

@router.get("/{session_id}", response_model=AuditSessionResponse)
def get_session(session_id: int, db: Session = Depends(get_db)):
    service = SessionService(db)
    session = service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.patch("/{session_id}")
def update_session(session_id: int, data: AuditSessionCreate, db: Session = Depends(get_db)):
    service = SessionService(db)
    session = service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    kwargs = {}
    if data.name is not None:
        kwargs["name"] = data.name
    if kwargs:
        service.update_session(session_id, **kwargs)
    return service.get_session(session_id)

@router.delete("/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)):
    service = SessionService(db)
    if service.delete_session(session_id):
        return {"message": "Session deleted"}
    raise HTTPException(status_code=404, detail="Session not found")
