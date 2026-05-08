from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.schemas import TagCreate, TagResponse
from backend.services.tagging_service import TaggingService
from backend.services.audit_service import AuditService

router = APIRouter(prefix="/tags", tags=["tags"])

@router.get("/transaction/{transaction_id}", response_model=List[TagResponse])
def get_tags(transaction_id: int, db: Session = Depends(get_db)):
    service = TaggingService(db)
    return service.get_tags_for_transaction(transaction_id)

@router.post("/", response_model=TagResponse)
def add_tag(data: TagCreate, db: Session = Depends(get_db)):
    service = TaggingService(db)
    tag = service.add_manual_tag(
        transaction_id=data.transaction_id,
        tag_type=data.tag_type,
        reason=data.reason,
        confidence=data.confidence
    )
    
    # Log
    audit = AuditService(db)
    audit.log("tag_added", "tag", tag.id,
              old_value=None,
              new_value={"tag_type": data.tag_type, "transaction_id": data.transaction_id},
              is_auto=False)
    
    return tag

@router.delete("/{tag_id}")
def remove_tag(tag_id: int, db: Session = Depends(get_db)):
    service = TaggingService(db)
    if service.remove_tag(tag_id):
        return {"message": "Tag removed"}
    raise HTTPException(status_code=404, detail="Tag not found")

@router.post("/bulk-remove")
def bulk_remove_tags(tag_ids: List[int], db: Session = Depends(get_db)):
    service = TaggingService(db)
    count = service.bulk_remove_tags(tag_ids)
    return {"removed_count": count}
