from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class TagType(str, Enum):
    CLIENT = "client"
    BROKER = "broker"
    SUSPICIOUS = "suspicious"

class AuditAction(str, Enum):
    TAG_ADDED = "tag_added"
    TAG_REMOVED = "tag_removed"
    TAG_CHANGED = "tag_changed"
    ALIAS_ADDED = "alias_added"
    BROKER_EXCLUDED = "broker_excluded"
    SETTINGS_CHANGED = "settings_changed"

class TransactionBase(BaseModel):
    date: Optional[str] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    party_name: Optional[str] = None
    raw_text: Optional[str] = None
    page_number: Optional[int] = None
    bounding_box_json: Optional[Dict[str, Any]] = None
    payment_method: Optional[str] = None
    pdf_filename: Optional[str] = None
    review_status: Optional[str] = "unreviewed"
    user_notes: Optional[str] = None
    exported_at: Optional[datetime] = None

class TransactionCreate(TransactionBase):
    session_id: int

class TransactionResponse(TransactionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    created_at: datetime
    tags: List["TagResponse"] = Field(default_factory=list)

class TagBase(BaseModel):
    tag_type: TagType
    confidence: float = 1.0
    reason: Optional[str] = None
    source: str = "auto"
    is_manual: bool = False

class TagCreate(TagBase):
    transaction_id: int

class TagResponse(TagBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    created_at: datetime

class BrokerBase(BaseModel):
    name: str
    aliases: List[str] = Field(default_factory=list)
    is_active: bool = True

class BrokerCreate(BrokerBase):
    pass

class BrokerResponse(BrokerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime

class AliasBase(BaseModel):
    canonical_name: str
    alias_name: str

class AliasCreate(AliasBase):
    pass

class AliasResponse(AliasBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime

class AuditLogBase(BaseModel):
    action: AuditAction
    entity_type: str
    entity_id: Optional[int] = None
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    is_auto: bool = False

class AuditLogCreate(AuditLogBase):
    session_id: Optional[int] = None

class AuditLogResponse(AuditLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: Optional[int] = None
    timestamp: datetime

class AuditSessionBase(BaseModel):
    name: Optional[str] = None
    status: str = "active"
    pdf_path: Optional[str] = None
    csv_path: Optional[str] = None
    settings_snapshot: Dict[str, Any] = Field(default_factory=dict)

class AuditSessionCreate(AuditSessionBase):
    pass

class AuditSessionResponse(AuditSessionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    transaction_count: int = 0

class ConfigItem(BaseModel):
    key: str
    value: Any
    category: str = "general"

class ConfigResponse(ConfigItem):
    model_config = ConfigDict(from_attributes=True)

    id: int

class BankProfileBase(BaseModel):
    name: str
    parser_rules_json: Dict[str, Any] = Field(default_factory=dict)

class BankProfileCreate(BankProfileBase):
    pass

class BankProfileResponse(BankProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime

class BulkTagRequest(BaseModel):
    transaction_ids: List[int]
    tag_type: TagType
    reason: Optional[str] = None
    confidence: float = 1.0

class ParseRequest(BaseModel):
    pdf_path: str
    csv_path: str
    password: Optional[str] = None
    bank_profile_id: Optional[int] = None

class MatchResult(BaseModel):
    transaction_id: int
    matched_name: str
    match_type: TagType
    confidence: float
    reason: str

class ExportRequest(BaseModel):
    session_id: int
    export_type: str  # all, client, broker, suspicious, tagged, filtered
    format: str  # excel
    filter_tags: Optional[List[TagType]] = None
    file_path: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    version: str

class SettingsUpdate(BaseModel):
    settings: Dict[str, Any]

class FuzzyMatchRequest(BaseModel):
    text: str
    candidates: List[str]
    threshold: float = 0.75

class FuzzyMatchResponse(BaseModel):
    text: str
    matches: List[Dict[str, Any]]

# Update forward references
TransactionResponse.model_rebuild()
