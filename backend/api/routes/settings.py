from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any
from backend.database import get_db
from backend.schemas import SettingsUpdate
from backend.services.config_service import ConfigService

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("/")
def get_settings(db: Session = Depends(get_db)):
    config = ConfigService(db)
    return config.get_all()

@router.patch("/")
def update_settings(data: SettingsUpdate, db: Session = Depends(get_db)):
    config = ConfigService(db)
    return config.update_many(data.settings)

@router.post("/reset")
def reset_settings(db: Session = Depends(get_db)):
    config = ConfigService(db)
    return config.reset_to_defaults()
