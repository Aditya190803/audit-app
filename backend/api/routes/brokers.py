from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.schemas import BrokerCreate, BrokerResponse
from backend.models import Broker
from backend.services.config_service import ConfigService

router = APIRouter(prefix="/brokers", tags=["brokers"])

@router.get("/", response_model=List[BrokerResponse])
def list_brokers(db: Session = Depends(get_db)):
    return db.query(Broker).all()

@router.post("/", response_model=BrokerResponse)
def create_broker(data: BrokerCreate, db: Session = Depends(get_db)):
    broker = Broker(name=data.name, aliases=data.aliases, is_active=data.is_active)
    db.add(broker)
    db.commit()
    db.refresh(broker)
    
    # Update config broker list
    config = ConfigService(db)
    brokers = config.get_brokers()
    if data.name not in brokers:
        brokers.append(data.name)
        config.set_brokers(brokers)
    
    return broker

@router.put("/{broker_id}", response_model=BrokerResponse)
def update_broker(broker_id: int, data: BrokerCreate, db: Session = Depends(get_db)):
    broker = db.query(Broker).filter(Broker.id == broker_id).first()
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    
    broker.name = data.name
    broker.aliases = data.aliases
    broker.is_active = data.is_active
    db.commit()
    db.refresh(broker)
    return broker

@router.delete("/{broker_id}")
def delete_broker(broker_id: int, db: Session = Depends(get_db)):
    broker = db.query(Broker).filter(Broker.id == broker_id).first()
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    
    db.delete(broker)
    db.commit()
    return {"message": "Broker deleted"}
