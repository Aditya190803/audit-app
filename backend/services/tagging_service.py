from sqlalchemy.orm import Session
from backend.models import Transaction, Tag, Broker, Alias, AuditSession
from backend.services.fuzzy_service import FuzzyService
from backend.services.config_service import ConfigService
from typing import List, Dict, Any, Optional
from collections import defaultdict
import re
from datetime import datetime

class TaggingService:
    def __init__(self, db: Session):
        self.db = db
        self.config = ConfigService(db)
        self.fuzzy = FuzzyService(threshold=self.config.get_fuzzy_threshold())
    
    def auto_tag_session(self, session_id: int, clients: List[Dict[str, Any]]) -> List[Tag]:
        """Auto-tag all transactions in a session."""
        transactions = self.db.query(Transaction).filter(Transaction.session_id == session_id).all()
        
        # Load brokers and aliases
        brokers = self.db.query(Broker).filter(Broker.is_active == True).all()
        broker_names = [b.name for b in brokers]
        for b in brokers:
            broker_names.extend(b.aliases or [])
        
        aliases = self.db.query(Alias).all()
        alias_list = [{"alias_name": a.alias_name, "canonical_name": a.canonical_name} for a in aliases]
        
        # Get exclusions
        exclusions = self.config.get("broker_exclusions") or []
        threshold = self.config.get_threshold()
        recurring_window = int(self.config.get("recurring_days_window") or 30)
        suspicious_keywords = self.config.get("suspicious_keywords") or []
        
        # Clear existing auto-tags
        self.db.query(Tag).filter(
            Tag.transaction_id.in_([t.id for t in transactions]),
            Tag.is_manual == False
        ).delete(synchronize_session=False)
        
        new_tags = []
        
        # Detect recurring transactions
        recurring_map = self._detect_recurring(transactions, recurring_window)
        
        for tx in transactions:
            party_text = tx.party_name or ""
            full_text = f"{party_text} {tx.description or ''}"
            
            # 1. Client matching — search party_name first, then full description
            client_matches = self.fuzzy.match_client_names(party_text, clients, alias_list)
            if not client_matches:
                client_matches = self.fuzzy.match_client_names(full_text, clients, alias_list)
            for match in client_matches:
                if match["score"] >= self.config.get_fuzzy_threshold():
                    tag = Tag(
                        transaction_id=tx.id,
                        tag_type="client",
                        confidence=match["score"],
                        reason=f"Fuzzy match: '{match['original']}' (score: {match['score']})",
                        source="auto",
                        is_manual=False
                    )
                    new_tags.append(tag)
                    self.db.add(tag)
            
            # 2. Broker matching — search party_name first, then full description
            broker_matches = self.fuzzy.match_broker_names(party_text, broker_names, exclusions)
            if not broker_matches:
                broker_matches = self.fuzzy.match_broker_names(full_text, broker_names, exclusions)
            for match in broker_matches:
                if match["score"] >= self.config.get_fuzzy_threshold():
                    tag = Tag(
                        transaction_id=tx.id,
                        tag_type="broker",
                        confidence=match["score"],
                        reason=f"Broker match: '{match['original']}' (score: {match['score']})",
                        source="auto",
                        is_manual=False
                    )
                    new_tags.append(tag)
                    self.db.add(tag)
            
            # 3. Suspicious detection
            is_suspicious = False
            reasons = []
            
            # Amount threshold
            if tx.amount and abs(tx.amount) >= threshold:
                is_suspicious = True
                reasons.append(f"Amount {tx.amount} exceeds threshold {threshold}")
            
            # Recurring with no useful remark
            if tx.id in recurring_map and not tx.description:
                is_suspicious = True
                reasons.append("Recurring transaction with empty remark")
            
            # Suspicious keywords
            desc_lower = (tx.description or "").lower()
            for keyword in suspicious_keywords:
                if keyword.lower() in desc_lower:
                    is_suspicious = True
                    reasons.append(f"Contains suspicious keyword: '{keyword}'")
            
            if is_suspicious:
                tag = Tag(
                    transaction_id=tx.id,
                    tag_type="suspicious",
                    confidence=1.0,
                    reason="; ".join(reasons),
                    source="auto",
                    is_manual=False
                )
                new_tags.append(tag)
                self.db.add(tag)
        
        self.db.commit()
        
        # Refresh all tags to get IDs
        for tag in new_tags:
            self.db.refresh(tag)
        
        return new_tags
    
    def _detect_recurring(self, transactions: List[Transaction], window_days: int) -> set:
        """Detect recurring transactions by amount and party."""
        recurring = set()
        groups = defaultdict(list)
        
        for tx in transactions:
            if tx.amount and tx.party_name:
                key = (round(abs(tx.amount), 2), self.fuzzy.normalize_text(tx.party_name))
                groups[key].append(tx)
        
        for key, txs in groups.items():
            if len(txs) > 1:
                for tx in txs:
                    recurring.add(tx.id)
        
        return recurring
    
    def add_manual_tag(self, transaction_id: int, tag_type: str, 
                       reason: str = "", confidence: float = 1.0) -> Tag:
        """Add a manual tag to a transaction."""
        # Remove any existing auto-tag of same type
        self.db.query(Tag).filter(
            Tag.transaction_id == transaction_id,
            Tag.tag_type == tag_type,
            Tag.is_manual == False
        ).delete(synchronize_session=False)
        
        tag = Tag(
            transaction_id=transaction_id,
            tag_type=tag_type,
            confidence=confidence,
            reason=reason or f"Manually tagged as {tag_type}",
            source="manual",
            is_manual=True
        )
        self.db.add(tag)
        self.db.commit()
        self.db.refresh(tag)
        return tag
    
    def remove_tag(self, tag_id: int) -> bool:
        """Remove a tag."""
        tag = self.db.query(Tag).filter(Tag.id == tag_id).first()
        if tag:
            self.db.delete(tag)
            self.db.commit()
            return True
        return False
    
    def bulk_remove_tags(self, tag_ids: List[int]) -> int:
        """Remove multiple tags."""
        count = self.db.query(Tag).filter(Tag.id.in_(tag_ids)).delete(synchronize_session=False)
        self.db.commit()
        return count
    
    def get_tags_for_transaction(self, transaction_id: int) -> List[Tag]:
        """Get all tags for a transaction."""
        return self.db.query(Tag).filter(Tag.transaction_id == transaction_id).all()
    
    def get_tag_summary(self, session_id: int) -> Dict[str, int]:
        """Get summary of tags in a session."""
        transactions = self.db.query(Transaction).filter(Transaction.session_id == session_id).all()
        tx_ids = [t.id for t in transactions]
        
        tags = self.db.query(Tag).filter(Tag.transaction_id.in_(tx_ids)).all()
        
        summary = {"client": 0, "broker": 0, "suspicious": 0, "total_tagged": 0}
        tagged_txs = set()
        
        for tag in tags:
            if tag.tag_type in summary:
                summary[tag.tag_type] += 1
            tagged_txs.add(tag.transaction_id)
        
        summary["total_tagged"] = len(tagged_txs)
        summary["total_transactions"] = len(transactions)
        
        return summary
