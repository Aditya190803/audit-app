from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.models import Tag, Transaction
from backend.schemas import TagCreate, TagResponse, BulkTagRequest
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
        confidence=data.confidence,
        source=data.source,
        is_manual=data.is_manual,
        commit=False,
    )
    db.flush()
    
    # Log
    tx = db.query(Transaction).filter(Transaction.id == data.transaction_id).first()
    audit = AuditService(db)
    audit.log("tag_added", "tag", tag.id,
              old_value=None,
              new_value={"tag_type": data.tag_type, "transaction_id": data.transaction_id},
              session_id=tx.session_id if tx else None,
              is_auto=False,
              commit=False)
    db.commit()
    db.refresh(tag)
    
    return tag

@router.delete("/{tag_id}")
def remove_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    tx = db.query(Transaction).filter(Transaction.id == tag.transaction_id).first()
    old_value = {"tag_type": tag.tag_type, "transaction_id": tag.transaction_id}
    db.delete(tag)
    AuditService(db).log(
        "tag_removed", "tag", tag_id,
        old_value=old_value,
        session_id=tx.session_id if tx else None,
        is_auto=False,
        commit=False,
    )
    db.commit()
    return {"message": "Tag removed"}

@router.post("/bulk-remove")
def bulk_remove_tags(tag_ids: List[int], db: Session = Depends(get_db)):
    tag_rows = (
        db.query(Tag.id, Tag.transaction_id, Tag.tag_type, Transaction.session_id)
        .join(Transaction, Transaction.id == Tag.transaction_id)
        .filter(Tag.id.in_(tag_ids))
        .all()
    )
    count = db.query(Tag).filter(Tag.id.in_(tag_ids)).delete(synchronize_session=False)
    audit = AuditService(db)
    for tag_id, transaction_id, tag_type, session_id in tag_rows:
        audit.log(
            "tag_removed", "tag", tag_id,
            old_value={"tag_type": tag_type, "transaction_id": transaction_id},
            session_id=session_id,
            is_auto=False,
            commit=False,
        )
    db.commit()
    return {"removed_count": count}

@router.post("/bulk-add")
def bulk_add_tags(data: BulkTagRequest, db: Session = Depends(get_db)):
    service = TaggingService(db)
    audit = AuditService(db)
    session_by_tx = {
        tx.id: tx.session_id
        for tx in db.query(Transaction).filter(Transaction.id.in_(data.transaction_ids)).all()
    }
    new_tags = []
    for tx_id in data.transaction_ids:
        tag = service.add_manual_tag(
            transaction_id=tx_id,
            tag_type=data.tag_type,
            reason=data.reason or f"Manually tagged as {data.tag_type}",
            confidence=data.confidence,
            commit=False
        )
        new_tags.append(tag)
    db.flush()
    for tag in new_tags:
        db.refresh(tag)
        audit.log("tag_added", "tag", tag.id,
                  old_value=None,
                  new_value={"tag_type": data.tag_type, "transaction_id": tag.transaction_id},
                  session_id=session_by_tx.get(tag.transaction_id),
                  is_auto=False,
                  commit=False)
    db.commit()
    return {
        "tagged_count": len(new_tags),
        "tags": [{"id": t.id, "transaction_id": t.transaction_id, "tag_type": t.tag_type} for t in new_tags]
    }
