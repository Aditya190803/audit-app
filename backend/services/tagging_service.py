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
    
    @staticmethod
    def _normalize_phone(phone: str) -> str | None:
        digits = re.sub(r'\D', '', phone)
        if len(digits) == 10:
            return digits
        if len(digits) == 11 and digits.startswith('0'):
            return digits[1:]
        if len(digits) == 12 and digits.startswith('91'):
            return digits[2:]
        if len(digits) > 10:
            return digits[-10:]
        return None

    @staticmethod
    def _build_phone_map(clients: List[Dict[str, Any]]) -> Dict[str, str]:
        phone_map = {}
        for c in clients:
            raw = c.get('raw_data', {})
            for key, val in raw.items():
                k = str(key).lower().strip()
                v = str(val).strip()
                if any(kw in k for kw in ['phone', 'mobile', 'cell', 'telephone', 'contact_no', 'contact']):
                    if v and v.lower() not in ('nan', '', 'none', 'null'):
                        normalized = TaggingService._normalize_phone(v)
                        if normalized:
                            phone_map[normalized] = c['name']
        return phone_map

    @staticmethod
    def _extract_phone_candidates(text: str) -> List[str]:
        if not text:
            return []
        candidates = re.findall(r'\b\d{10,15}\b', re.sub(r'\D', ' ', text))
        result = set()
        for c in candidates:
            normalized = TaggingService._normalize_phone(c)
            if normalized:
                result.add(normalized)
        return list(result)
    
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
        
        # Build phone number map from client list (exact match only, no fuzzy)
        phone_map = self._build_phone_map(clients)
        
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
            desc_text = tx.description or ""
            full_text = f"{party_text} {desc_text}"
            
            # --- Check suspicious FIRST (if suspicious, skip client/broker) ---
            is_suspicious = False
            reasons = []
            
            # Amount threshold
            if tx.amount and abs(tx.amount) >= threshold:
                is_suspicious = True
                reasons.append(f"Amount {tx.amount} exceeds threshold {threshold}")
            
            # Recurring transaction to same party
            if tx.id in recurring_map:
                is_suspicious = True
                reasons.append("Recurring transaction to same party")
            
            # Suspicious keywords in full text (party_name + description)
            full_text_lower = full_text.lower()
            for keyword in suspicious_keywords:
                if keyword.lower() in full_text_lower:
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
                continue  # Skip client/broker tagging for suspicious transactions
            
            # --- 1. Client matching — fuzzy name + exact phone ---
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
            
            # Phone number exact match
            phone_candidates = self._extract_phone_candidates(full_text)
            for phone in phone_candidates:
                if phone in phone_map:
                    tag = Tag(
                        transaction_id=tx.id,
                        tag_type="client",
                        confidence=1.0,
                        reason=f"Phone match: {phone} -> {phone_map[phone]}",
                        source="auto",
                        is_manual=False
                    )
                    new_tags.append(tag)
                    self.db.add(tag)
            
            # --- 2. Broker matching ---
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
