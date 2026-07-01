from sqlalchemy.orm import Session
from backend.models import Transaction, Tag, Broker, Alias
from backend.services.fuzzy_service import FuzzyService
from backend.services.config_service import ConfigService
from backend.services.phone import build_phone_map
from typing import List, Dict, Any, Optional, Callable
from collections import defaultdict
from datetime import datetime
import concurrent.futures
from backend.services.process_pool import get_process_pool, process_pool_worker_count

class TaggingService:
    def __init__(self, db: Session):
        self.db = db
        self.config = ConfigService(db)
        self.fuzzy = FuzzyService(threshold=self.config.get_fuzzy_threshold())

    def _load_tagging_context(self, session_settings: Dict[str, Any]) -> Dict[str, Any]:
        """Load brokers, aliases, and resolved thresholds once for a tagging run.

        Shared by auto_tag_session (full session) and auto_tag_transactions
        (appended rows). Returns picklable primitives so it can be forwarded to
        the worker process pool.
        """
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

        session_settings = session_settings or {}
        return {
            "broker_names": broker_names,
            "alias_list": alias_list,
            "alias_to_canonical": alias_to_canonical,
            "exclusions": self.config.get("broker_exclusions") or [],
            "suspicious_threshold": float(session_settings.get("suspicious_threshold", self.config.get_threshold())),
            "fuzzy_threshold": self.config.get_fuzzy_threshold(),
            "recurring_window": int(self.config.get("recurring_days_window") or 30),
            "suspicious_keywords": self.config.get("suspicious_keywords") or [],
            "common_words": self.config.get("broker_common_words") or [],
            "tag_priority": self.config.get("tag_priority") or ["client", "broker", "suspicious"],
        }

    def _persist_auto_tags(self, transaction_ids: List[int], tags_data: List[Dict[str, Any]]) -> List[Tag]:
        """Replace auto-tags for the given transactions with tags_data; commit; return new tags."""
        from sqlalchemy import insert
        self.db.query(Tag).filter(
            Tag.transaction_id.in_(transaction_ids),
            Tag.is_manual == False,
        ).delete(synchronize_session=False)
        self.db.flush()
        if tags_data:
            self.db.execute(insert(Tag), [
                {"transaction_id": td["transaction_id"], "tag_type": td["tag_type"],
                 "confidence": td["confidence"], "reason": td["reason"],
                 "source": "auto", "is_manual": False}
                for td in tags_data
            ])
        self.db.commit()
        return self.db.query(Tag).filter(
            Tag.transaction_id.in_(transaction_ids),
            Tag.is_manual == False,
        ).all()

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
        ctx = self._load_tagging_context(session_settings)

        phone_map = build_phone_map(clients)
        recurring_map = self._detect_recurring(transactions, ctx["recurring_window"])

        tx_dicts = [
            {"id": t.id, "party_name": t.party_name, "description": t.description,
             "amount": t.amount, "date": t.date}
            for t in transactions
        ]

        from backend.services.tagging_worker import _process_transaction_batch

        # Split transactions into chunks for the shared backend process pool.
        max_workers = process_pool_worker_count()
        chunk_size = max(1, len(tx_dicts) // max_workers)
        batches = [tx_dicts[i:i + chunk_size] for i in range(0, len(tx_dicts), chunk_size)]

        all_tags_data = []
        completed = 0
        total_transactions = len(transactions)

        worker_errors = []
        executor = get_process_pool()
        batch_sizes = {i: len(b) for i, b in enumerate(batches)}
        futures = {
            executor.submit(
                _process_transaction_batch,
                batch, clients, phone_map, ctx["broker_names"], ctx["alias_list"], ctx["alias_to_canonical"],
                ctx["suspicious_threshold"], ctx["fuzzy_threshold"], ctx["exclusions"], ctx["common_words"],
                recurring_map, ctx["suspicious_keywords"], ctx["tag_priority"]
            ): i for i, batch in enumerate(batches)
        }

        for future in concurrent.futures.as_completed(futures):
            try:
                batch_idx = futures[future]
                result = future.result()
                all_tags_data.extend(result)
                completed += batch_sizes[batch_idx]
                if progress_callback:
                    progress_callback(min(completed, total_transactions), total_transactions)
            except Exception as e:
                worker_errors.append(e)
                print(f"[TaggingService] Worker failed: {e}")

        if worker_errors:
            self.db.rollback()
            raise RuntimeError(f"Auto-tagging failed in {len(worker_errors)} worker batch(es)")

        tx_ids = [t.id for t in transactions]
        return self._persist_auto_tags(tx_ids, all_tags_data)

    def auto_tag_transactions(
        self,
        transaction_ids: List[int],
        clients: List[Dict[str, Any]],
        session_settings: Dict[str, Any] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ) -> List[Tag]:
        """Auto-tag a specific list of transactions (e.g., newly appended rows)."""
        if not transaction_ids:
            return []
        transactions = self.db.query(Transaction).filter(
            Transaction.id.in_(transaction_ids)
        ).all()
        if not transactions:
            return []

        ctx = self._load_tagging_context(session_settings)

        phone_map = build_phone_map(clients)
        recurring_map = self._detect_recurring(transactions, ctx["recurring_window"])

        tx_dicts = [
            {"id": t.id, "party_name": t.party_name, "description": t.description,
             "amount": t.amount, "date": t.date}
            for t in transactions
        ]

        from backend.services.tagging_worker import _process_transaction_batch
        # Small batch — single worker is fine; no process-pool overhead.
        all_tags_data = _process_transaction_batch(
            tx_dicts, clients, phone_map, ctx["broker_names"], ctx["alias_list"], ctx["alias_to_canonical"],
            ctx["suspicious_threshold"], ctx["fuzzy_threshold"], ctx["exclusions"], ctx["common_words"],
            recurring_map, ctx["suspicious_keywords"], ctx["tag_priority"],
        )

        return self._persist_auto_tags(transaction_ids, all_tags_data)

    def _detect_recurring(self, transactions: List[Transaction], window_days: int) -> Dict[int, str]:
        """Detect recurring transactions by amount and party within a date window."""
        recurring: Dict[int, str] = {}
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

        def _format_date(d: str | None) -> str:
            parsed = _parse_date(d)
            if not parsed:
                return d or "unknown date"
            return f"{parsed.day} {parsed.strftime('%b %Y')}"

        def _format_amount(amount: float | None) -> str:
            if amount is None:
                return "unknown amount"
            return f"₹{abs(amount):,.2f}"

        def _format_direction(amount: float | None) -> str:
            if amount is None:
                return "transaction"
            return "debit" if amount < 0 else "credit"

        for tx in transactions:
            if tx.amount and tx.party_name:
                # Key by rounded amount AND sign so credits and debits are separate
                key = (round(tx.amount, 2), self.fuzzy.normalize_text(tx.party_name))
                groups[key].append(tx)

        for _key, txs in groups.items():
            if len(txs) < 2:
                continue
            sorted_txs = sorted(txs, key=lambda t: _parse_date(t.date) or datetime.min)
            recurring_ids = set()
            for i in range(len(sorted_txs)):
                for j in range(i + 1, len(sorted_txs)):
                    d1 = _parse_date(sorted_txs[i].date)
                    d2 = _parse_date(sorted_txs[j].date)
                    if d1 and d2 and abs((d2 - d1).days) <= window_days:
                        recurring_ids.add(sorted_txs[i].id)
                        recurring_ids.add(sorted_txs[j].id)

            if len(recurring_ids) < 2:
                continue

            recurring_txs = [tx for tx in sorted_txs if tx.id in recurring_ids]
            sample = recurring_txs[0]
            party = sample.party_name or "same party"
            date_list = ", ".join(_format_date(tx.date) for tx in recurring_txs[:4])
            if len(recurring_txs) > 4:
                date_list += f", +{len(recurring_txs) - 4} more"

            reason = (
                f"Recurring {_format_direction(sample.amount)} of {_format_amount(sample.amount)} "
                f"with {party}: {len(recurring_txs)} matching transactions "
                f"({date_list})"
            )
            for tx in recurring_txs:
                recurring[tx.id] = reason

        return recurring

    def add_manual_tag(self, transaction_id: int, tag_type: str,
                       reason: str = "", confidence: float = 1.0,
                       source: str = "manual", is_manual: bool = True,
                       commit: bool = True) -> Tag:
        """Set a manual tag on a transaction.

        A transaction can have only one active tag. Manual tagging replaces any
        existing client, broker, or suspicious tag instead of adding a second
        category beside it.
        """
        self.db.query(Tag).filter(Tag.transaction_id == transaction_id).delete(synchronize_session=False)
        self.db.flush()
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
