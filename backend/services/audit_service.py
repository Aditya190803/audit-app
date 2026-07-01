from sqlalchemy.orm import Session
from backend.models import AuditLog
from typing import Optional, Dict, Any, List

class AuditService:
    def __init__(self, db: Session):
        self.db = db
    
    def log(self, action: str, entity_type: str, entity_id: Optional[int] = None,
            old_value: Optional[Dict[str, Any]] = None,
            new_value: Optional[Dict[str, Any]] = None,
            session_id: Optional[int] = None,
            is_auto: bool = False,
            commit: bool = True):
        """Log an audit event."""
        log = AuditLog(
            session_id=session_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
            is_auto=is_auto
        )
        self.db.add(log)
        if commit:
            self.db.commit()
            self.db.refresh(log)
        else:
            self.db.flush()
        return log
    
    def get_logs_for_session(self, session_id: int, limit: int = 100) -> List[AuditLog]:
        """Get audit logs for a session."""
        return self.db.query(AuditLog).filter(
            AuditLog.session_id == session_id
        ).order_by(AuditLog.timestamp.desc()).limit(limit).all()
    
    def get_all_logs(self, limit: int = 500) -> List[AuditLog]:
        """Get all audit logs."""
        return self.db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()
