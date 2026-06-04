from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.models import Alias
from backend.schemas import AliasCreate, AliasResponse

router = APIRouter(prefix="/aliases", tags=["aliases"])


@router.get("/", response_model=List[AliasResponse])
def list_aliases(db: Session = Depends(get_db)):
    return db.query(Alias).order_by(Alias.canonical_name, Alias.alias_name).all()


@router.post("/", response_model=AliasResponse)
def create_alias(data: AliasCreate, db: Session = Depends(get_db)):
    # Prevent duplicates
    exists = db.query(Alias).filter(
        Alias.alias_name == data.alias_name.strip(),
        Alias.canonical_name == data.canonical_name.strip(),
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail="Alias mapping already exists")
    alias = Alias(
        alias_name=data.alias_name.strip(),
        canonical_name=data.canonical_name.strip(),
    )
    db.add(alias)
    db.commit()
    db.refresh(alias)
    return alias


@router.delete("/{alias_id}")
def delete_alias(alias_id: int, db: Session = Depends(get_db)):
    alias = db.query(Alias).filter(Alias.id == alias_id).first()
    if not alias:
        raise HTTPException(status_code=404, detail="Alias not found")
    db.delete(alias)
    db.commit()
    return {"success": True}
