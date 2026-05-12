from sqlalchemy.orm import Session
from backend.models import AuditSession, Transaction, UndoRedoState
from typing import Optional, Dict, Any, List
import json

def resolve_pdf_paths(pdf_path: str | None) -> List[str]:
    if not pdf_path:
        return []
    try:
        parsed = json.loads(pdf_path)
        if isinstance(parsed, list):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    return [pdf_path]

class SessionService:
    def __init__(self, db: Session):
        self.db = db
    
    def create_session(self, name: Optional[str] = None, 
                       pdf_path: Optional[str] = None,
                       csv_path: Optional[str] = None,
                       settings_snapshot: Optional[Dict] = None) -> AuditSession:
        session = AuditSession(
            name=name,
            pdf_path=pdf_path,
            csv_path=csv_path,
            settings_snapshot=settings_snapshot or {},
            status="active"
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session
    
    def get_session(self, session_id: int) -> Optional[AuditSession]:
        return self.db.query(AuditSession).filter(AuditSession.id == session_id).first()
    
    def get_all_sessions(self) -> List[AuditSession]:
        return self.db.query(AuditSession).order_by(AuditSession.created_at.desc()).all()
    
    def update_session(self, session_id: int, **kwargs) -> Optional[AuditSession]:
        session = self.get_session(session_id)
        if session:
            for key, value in kwargs.items():
                setattr(session, key, value)
            self.db.commit()
            self.db.refresh(session)
        return session
    
    def delete_session(self, session_id: int) -> bool:
        session = self.get_session(session_id)
        if session:
            self.db.delete(session)
            self.db.commit()
            return True
        return False
    
    def add_transactions(self, session_id: int, transactions_data: List[Dict[str, Any]]) -> List[Transaction]:
        """Bulk add transactions to a session."""
        transactions = []
        for data in transactions_data:
            tx = Transaction(
                session_id=session_id,
                date=data.get("date"),
                amount=data.get("amount"),
                description=data.get("description"),
                party_name=data.get("party_name"),
                raw_text=data.get("raw_text"),
                page_number=data.get("page_number"),
                bounding_box_json=data.get("bounding_box_json"),
                payment_method=data.get("payment_method"),
                pdf_filename=data.get("pdf_filename"),
            )
            self.db.add(tx)
            transactions.append(tx)
        
        self.db.commit()
        for tx in transactions:
            self.db.refresh(tx)
        
        return transactions
    
    def get_transactions(self, session_id: int) -> List[Transaction]:
        return self.db.query(Transaction).filter(Transaction.session_id == session_id).all()
    
    def get_transaction(self, transaction_id: int) -> Optional[Transaction]:
        return self.db.query(Transaction).filter(Transaction.id == transaction_id).first()
    
    def autosave_state(self, session_id: int, action_type: str, state_data: Dict[str, Any]):
        """Save state for undo/redo."""
        # Keep only last 50 states
        old_states = self.db.query(UndoRedoState).filter(
            UndoRedoState.session_id == session_id
        ).order_by(UndoRedoState.created_at.desc()).offset(50).all()
        
        for state in old_states:
            self.db.delete(state)
        
        undo_state = UndoRedoState(
            session_id=session_id,
            action_type=action_type,
            state_data=state_data
        )
        self.db.add(undo_state)
        self.db.commit()
    
    def get_crash_recovery_session(self) -> Optional[AuditSession]:
        """Get the most recent active session for crash recovery."""
        return self.db.query(AuditSession).filter(
            AuditSession.status == "active"
        ).order_by(AuditSession.updated_at.desc()).first()
    
    def mark_session_status(self, session_id: int, status: str):
        session = self.get_session(session_id)
        if session:
            session.status = status
            self.db.commit()

    def update_transaction(self, transaction_id: int, **kwargs) -> Optional[Transaction]:
        tx = self.get_transaction(transaction_id)
        if tx:
            for key, value in kwargs.items():
                setattr(tx, key, value)
            self.db.commit()
            self.db.refresh(tx)
        return tx
