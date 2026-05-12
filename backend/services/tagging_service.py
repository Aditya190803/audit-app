from sqlalchemy.orm import Session
from backend.models import Transaction, Tag, Broker, Alias, AuditSession
from backend.services.fuzzy_service import FuzzyService
from backend.services.config_service import ConfigService
from backend.services.parsers.base import BaseParser
from typing import List, Dict, Any, Optional, Callable
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
    def _build_phone_map(clients: List[Dict[str, Any]]) -> Dict[str, List[str]]:
        phone_map: Dict[str, List[str]] = {}
        for c in clients:
            raw = c.get('raw_data', {})
            for key, val in raw.items():
                k = str(key).lower().strip()
                v = str(val).strip()
                if any(kw in k for kw in ['phone', 'mobile', 'cell', 'telephone', 'contact_no', 'contact']):
                    if v and v.lower() not in ('nan', '', 'none', 'null'):
                        normalized = TaggingService._normalize_phone(v)
                        if normalized:
                            phone_map.setdefault(normalized, []).append(c['name'])
        return phone_map

    @staticmethod
    def _extract_phone_candidates(text: str) -> List[str]:
        if not text:
            return []
        # Strip out obvious non-phone patterns before extracting digits
        cleaned = re.sub(r'(?:UPI|IMPS|NEFT|RTGS|MMT|UPIAB|UPIAR)\s*/\s*\d+', ' ', text, flags=re.IGNORECASE)
        cleaned = re.sub(r'[A-Za-z]\d{6,}', ' ', cleaned)
        cleaned = re.sub(r'\d{12,}', ' ', cleaned)
        candidates = re.findall(r'\b\d{10,15}\b', re.sub(r'\D', ' ', cleaned))
        result = set()
        for c in candidates:
            normalized = TaggingService._normalize_phone(c)
            if normalized and TaggingService._is_valid_phone(normalized):
                result.add(normalized)
        return list(result)

    @staticmethod
    def _extract_party_name(text: str) -> str | None:
        """Extract likely party name from bank transaction description."""
        if not text:
            return None

        text = ' '.join(text.split())

        # UPI format: .../REF/NAME/BANK/...
        m = re.search(r'UPI\w*\s*/\s*\w+\s*/\s*\w+\s*/\s*([^/]+?)\s*/', text)
        if m:
            name = m.group(1).strip()
            if len(name) > 1:
                return name

        # NEFT format: ...*NAME (last asterisk segment)
        m = re.search(r'\*\s*([A-Za-z\s]+?)(?:\s+\d+\s*|\s*$)', text)
        if m:
            name = m.group(1).strip()
            if len(name) > 3:
                return name

        # AS PER REQ / INVESTMENT format
        m = re.search(r'OF\s+(?:Mr|Mrs|Ms)\.?\s+([A-Za-z\s]+?)(?:\s*\(|\s+\d|\s*$)', text)
        if m:
            name = m.group(1).strip()
            if len(name) > 3:
                return name

        return None

    @staticmethod
    def _is_valid_phone(phone: str) -> bool:
        """Validate that a digit string looks like a real phone number, not a ref number."""
        if not phone:
            return False
        # Remove country code prefix for validation
        n = phone
        if len(n) == 12 and n.startswith('91'):
            n = n[2:]
        elif len(n) == 11 and n.startswith('0'):
            n = n[1:]
        # After normalization we should have 10 digits
        if len(n) != 10:
            return False
        # Indian mobile numbers start with 6-9
        if n[0] not in ('6', '7', '8', '9'):
            return False
        # Reject sequences that are likely ref numbers (all same digit, sequential)
        if len(set(n)) <= 2:
            return False
        return True
    
    def auto_tag_session(self, session_id: int, clients: List[Dict[str, Any]],
                         session_settings: Dict[str, Any] = None,
                         progress_callback: Optional[Callable[[int, int], None]] = None) -> List[Tag]:
        """Auto-tag all transactions in a session.
        
        Args:
            session_id: Session to process
            clients: Client list for matching
            session_settings: Per-session settings snapshot (e.g., threshold override)
        """
        transactions = self.db.query(Transaction).filter(Transaction.session_id == session_id).all()
        
        # Load brokers and aliases
        brokers = self.db.query(Broker).filter(Broker.is_active == True).all()
        broker_names = [b.name for b in brokers]
        # Map aliases back to canonical broker name for deduplication
        alias_to_canonical = {}
        for b in brokers:
            for alias in (b.aliases or []):
                broker_names.append(alias)
                alias_to_canonical[alias] = b.name
        
        aliases = self.db.query(Alias).all()
        alias_list = [{"alias_name": a.alias_name, "canonical_name": a.canonical_name} for a in aliases]
        
        # Use per-session threshold if available, otherwise global config
        session_settings = session_settings or {}
        exclusions = self.config.get("broker_exclusions") or []
        threshold = float(session_settings.get("suspicious_threshold", self.config.get_threshold()))
        recurring_window = int(self.config.get("recurring_days_window") or 30)
        suspicious_keywords = self.config.get("suspicious_keywords") or []
        
        # Build phone number map from client list (exact match only, no fuzzy)
        phone_map = self._build_phone_map(clients)
        
        # Clear existing auto-tags
        self.db.query(Tag).filter(
            Tag.transaction_id.in_([t.id for t in transactions]),
            Tag.is_manual == False
        ).delete(synchronize_session=False)
        self.db.flush()
        
        new_tags = []
        
        # Detect recurring transactions
        recurring_map = self._detect_recurring(transactions, recurring_window)
        
        total_transactions = len(transactions)
        for i, tx in enumerate(transactions, 1):
            party_text = tx.party_name or ""
            desc_text = tx.description or ""
            full_text = f"{party_text} {desc_text}"
            
            # Extract clean party name from description for better matching
            extracted_party = self._extract_party_name(full_text) or BaseParser._extract_party_from_description(desc_text)
            match_text = extracted_party or party_text or desc_text
            
            # --- Priority: client > broker > suspicious ---
            # Only one tag type per transaction to avoid conflicting tags
            tagged = False
            
            # 1. Phone number exact match (most reliable)
            phone_candidates = self._extract_phone_candidates(full_text)
            for phone in phone_candidates:
                if phone in phone_map:
                    for client_name in phone_map[phone]:
                        tag = Tag(
                            transaction_id=tx.id,
                            tag_type="client",
                            confidence=1.0,
                            reason=f"Phone match: {phone} -> '{client_name}'",
                            source="auto",
                            is_manual=False
                        )
                        new_tags.append(tag)
                        self.db.add(tag)
                        tagged = True
                        break
                if tagged:
                    break
            
            if not tagged:
                # 2. Fuzzy client name matching (using extracted name)
                client_match_text = f"{match_text} {desc_text}".strip()
                client_matches = self.fuzzy.match_client_names(client_match_text, clients, alias_list)
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
                        tagged = True
                        break
            
            if not tagged:
                # 3. Broker matching. Use the extracted counterparty, not the full
                # narration, so intermediary bank names don't become broker hits.
                # Skip broker matching if the party matches any client name (avoid
                # tagging a client's own transaction as a broker hit).
                common_words = self.config.get("broker_common_words") or []
                broker_text = extracted_party or party_text
                
                # Check if the party text itself matches a client - if so, skip broker check
                is_client_related = False
                if broker_text:
                    normalized_broker_text = self.fuzzy.normalize_text(broker_text)
                    for c in clients:
                        if normalized_broker_text == self.fuzzy.normalize_text(c["name"]):
                            is_client_related = True
                            break
                    if not is_client_related:
                        is_client_related = bool(self.fuzzy.match_client_names(broker_text, clients, alias_list))
                
                if not is_client_related:
                    broker_matches = self.fuzzy.match_broker_names(broker_text, broker_names, exclusions, common_words)
                    # Deduplicate: keep only the best-scoring match per canonical broker name
                    seen_brokers = set()
                    for match in broker_matches:
                        if match["score"] < self.config.get_fuzzy_threshold():
                            continue
                        orig = match["original"]
                        canonical = alias_to_canonical.get(orig, orig)
                        if canonical in seen_brokers:
                            continue
                        seen_brokers.add(canonical)
                        tag = Tag(
                            transaction_id=tx.id,
                            tag_type="broker",
                            confidence=match["score"],
                            reason=f"Broker match: '{orig}' (score: {match['score']})",
                            source="auto",
                            is_manual=False
                        )
                        new_tags.append(tag)
                        self.db.add(tag)
                        tagged = True
                        break
            
            if not tagged:
                # 4. Suspicious check (only for names not tagged as client or broker)
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

            if progress_callback and (i == total_transactions or i % 25 == 0):
                progress_callback(i, total_transactions)
        
        self.db.commit()
        
        # Refresh all tags to get IDs
        for tag in new_tags:
            self.db.refresh(tag)
        
        return new_tags
    
    def _detect_recurring(self, transactions: List[Transaction], window_days: int) -> set:
        """Detect recurring transactions by amount and party within a date window."""
        recurring = set()
        groups = defaultdict(list)
        
        def _parse_date(d: str | None):
            if not d:
                return None
            for fmt in ('%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d %b %Y', '%d-%b-%Y', '%d/%b/%Y'):
                try:
                    return datetime.strptime(d, fmt)
                except ValueError:
                    continue
            return None
        
        for tx in transactions:
            if tx.amount and tx.party_name:
                # Key by rounded amount AND sign so credits and debits are separate
                key = (round(tx.amount, 2), self.fuzzy.normalize_text(tx.party_name))
                groups[key].append(tx)
        
        for key, txs in groups.items():
            if len(txs) < 2:
                continue
            sorted_txs = sorted(txs, key=lambda t: _parse_date(t.date) or datetime.min)
            for i in range(len(sorted_txs)):
                for j in range(i + 1, len(sorted_txs)):
                    d1 = _parse_date(sorted_txs[i].date)
                    d2 = _parse_date(sorted_txs[j].date)
                    if d1 and d2 and abs((d2 - d1).days) <= window_days:
                        recurring.add(sorted_txs[i].id)
                        recurring.add(sorted_txs[j].id)
        
        return recurring
    
    def add_manual_tag(self, transaction_id: int, tag_type: str, 
                       reason: str = "", confidence: float = 1.0,
                       source: str = "manual", is_manual: bool = True,
                       commit: bool = True) -> Tag:
        """Add a manual tag to a transaction. Removes all existing tags first (single-tag model)."""
        # Remove ALL existing tags (both auto and manual) to prevent duplicates
        self.db.query(Tag).filter(
            Tag.transaction_id == transaction_id
        ).delete(synchronize_session=False)
        
        tag = Tag(
            transaction_id=transaction_id,
            tag_type=tag_type,
            confidence=confidence,
            reason=reason or f"Manually tagged as {tag_type}",
            source=source,
            is_manual=is_manual
        )
        self.db.add(tag)
        if commit:
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
        
        summary = {"client": 0, "broker": 0, "suspicious": 0, "total_tagged": 0,
                   "manual_tags": 0, "auto_tags": 0}
        tagged_txs = set()
        
        for tag in tags:
            if tag.tag_type in summary:
                summary[tag.tag_type] += 1
            if tag.is_manual:
                summary["manual_tags"] += 1
            else:
                summary["auto_tags"] += 1
            tagged_txs.add(tag.transaction_id)
        
        summary["total_tagged"] = len(tagged_txs)
        summary["total_transactions"] = len(transactions)
        
        return summary
