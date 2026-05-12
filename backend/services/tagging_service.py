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
        suspicious_threshold = float(session_settings.get("suspicious_threshold", self.config.get_threshold()))
        fuzzy_threshold = self.config.get_fuzzy_threshold()
        recurring_window = int(self.config.get("recurring_days_window") or 30)
        suspicious_keywords = self.config.get("suspicious_keywords") or []
        common_words = self.config.get("broker_common_words") or []
        
        # Build phone number map from client list (exact match only, no fuzzy)
        phone_map = self._build_phone_map(clients)
        
        # Clear existing auto-tags
        self.db.query(Tag).filter(
            Tag.transaction_id.in_([t.id for t in transactions]),
            Tag.is_manual == False
        ).delete(synchronize_session=False)
        self.db.flush()
        
        # Detect recurring transactions
        recurring_map = self._detect_recurring(transactions, recurring_window)
        
        # Prepare transaction data for multiprocessing (must be picklable)
        tx_dicts = [
            {
                "id": t.id,
                "party_name": t.party_name,
                "description": t.description,
                "amount": t.amount,
                "date": t.date
            }
            for t in transactions
        ]
        
        import concurrent.futures
        import os
        from backend.services.tagging_worker import _process_transaction_batch
        
        # Split transactions into chunks for workers (cap at 3-4 cores)
        max_workers = min(2, max(1, os.cpu_count() if os.cpu_count() else 2))
        chunk_size = max(1, len(tx_dicts) // max_workers)
        batches = [tx_dicts[i:i + chunk_size] for i in range(0, len(tx_dicts), chunk_size)]
        
        all_tags_data = []
        completed = 0
        total_transactions = len(transactions)
        
        with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(
                    _process_transaction_batch, 
                    batch, clients, phone_map, broker_names, alias_list, alias_to_canonical,
                    suspicious_threshold, fuzzy_threshold, exclusions, common_words, recurring_map, suspicious_keywords
                ) for batch in batches
            ]
            
            for future in concurrent.futures.as_completed(futures):
                try:
                    result = future.result()
                    all_tags_data.extend(result)
                    completed += len(result) # roughly tracking completed
                    if progress_callback:
                        # Report an approximation since batches complete in chunks
                        progress_callback(min(completed, total_transactions), total_transactions)
                except Exception as e:
                    print(f"[TaggingService] Worker failed: {e}")
        
        # Bulk insert tags for massive speedup
        new_tags = []
        if all_tags_data:
            from sqlalchemy import insert
            # Bulk insert mapping
            tag_mappings = []
            for td in all_tags_data:
                tag_mappings.append({
                    "transaction_id": td["transaction_id"],
                    "tag_type": td["tag_type"],
                    "confidence": td["confidence"],
                    "reason": td["reason"],
                    "source": "auto",
                    "is_manual": False
                })
            
            # Execute bulk insert and get the inserted records to return
            # Using core insert to be extremely fast, then we query them back
            if tag_mappings:
                self.db.execute(insert(Tag), tag_mappings)
                
        self.db.commit()
        
        # Retrieve the newly inserted tags to return
        new_tags = self.db.query(Tag).filter(
            Tag.transaction_id.in_([t.id for t in transactions]),
            Tag.is_manual == False
        ).all()
        
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
