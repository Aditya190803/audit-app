from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from backend.database import Base

def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)

class AuditSession(Base):
    __tablename__ = "audit_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    status = Column(String, default="active")  # active, completed, crashed
    pdf_path = Column(String, nullable=True)
    csv_path = Column(String, nullable=True)
    settings_snapshot = Column(JSON, default=dict)
    
    transactions = relationship("Transaction", back_populates="session", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="session", cascade="all, delete-orphan")

class Transaction(Base):
    __tablename__ = "transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("audit_sessions.id"), nullable=False)
    date = Column(String, nullable=True)
    amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    party_name = Column(String, nullable=True)
    raw_text = Column(Text, nullable=True)
    page_number = Column(Integer, nullable=True)
    bounding_box_json = Column(JSON, nullable=True)
    payment_method = Column(String, nullable=True)
    pdf_filename = Column(String, nullable=True)
    review_status = Column(String, default="unreviewed")
    user_notes = Column(Text, nullable=True)
    exported_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    
    session = relationship("AuditSession", back_populates="transactions")
    tags = relationship("Tag", back_populates="transaction", cascade="all, delete-orphan")

class Tag(Base):
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)
    tag_type = Column(String, nullable=False)  # client, broker, suspicious
    confidence = Column(Float, default=1.0)
    reason = Column(Text, nullable=True)
    source = Column(String, default="auto")  # auto, manual
    created_at = Column(DateTime, default=utc_now)
    is_manual = Column(Boolean, default=False)
    
    transaction = relationship("Transaction", back_populates="tags")

class Broker(Base):
    __tablename__ = "brokers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    aliases = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)

class Alias(Base):
    __tablename__ = "aliases"
    
    id = Column(Integer, primary_key=True, index=True)
    canonical_name = Column(String, nullable=False)
    alias_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("audit_sessions.id"), nullable=True)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer, nullable=True)
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=utc_now)
    is_auto = Column(Boolean, default=False)
    
    session = relationship("AuditSession", back_populates="audit_logs")

class Config(Base):
    __tablename__ = "configs"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, nullable=False, unique=True)
    value = Column(JSON, nullable=True)
    category = Column(String, default="general")

class BankProfile(Base):
    __tablename__ = "bank_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    parser_rules_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utc_now)

class UndoRedoState(Base):
    __tablename__ = "undo_redo_states"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("audit_sessions.id"), nullable=False)
    action_type = Column(String, nullable=False)
    state_data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=utc_now)
