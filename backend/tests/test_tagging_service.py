import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models import Tag, Transaction
from backend.services.tagging_service import TaggingService
from backend.services.tagging_worker import _process_transaction_batch


class TaggingServiceTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def test_recurring_reason_includes_party_amount_count_and_dates(self):
        tx1 = Transaction(id=1, date="3 Jan 2025", amount=-1000, party_name="AJITSI NH")
        tx2 = Transaction(id=2, date="9 Jan 2025", amount=-1000, party_name="AJITSI NH")

        recurring = TaggingService(self.db)._detect_recurring([tx1, tx2], 30)

        self.assertIn(1, recurring)
        self.assertEqual(recurring[1], recurring[2])
        self.assertIn("Recurring debit of ₹1,000.00 with AJITSI NH", recurring[1])
        self.assertIn("2 matching transactions", recurring[1])
        self.assertNotIn("within", recurring[1])
        self.assertIn("3 Jan 2025, 9 Jan 2025", recurring[1])

    def test_suspicious_worker_uses_detailed_recurring_reason(self):
        reason = "Recurring debit of ₹540.00 with AMAR PETROLIUM PATAN: 2 matching transactions (5 Oct 2024, 23 Oct 2024)"

        tags = _process_transaction_batch(
            batch=[{
                "id": 10,
                "party_name": "AMAR PETROLIUM PATAN",
                "description": "by debit card- OTHPOS429712397366AMAR PETROLIUM PATAN-",
                "amount": -540,
                "date": "23 Oct 2024",
            }],
            clients=[],
            phone_map={},
            broker_names=[],
            alias_list=[],
            alias_to_canonical={},
            suspicious_threshold=10000,
            fuzzy_threshold=0.75,
            exclusions=[],
            common_words=[],
            recurring_map={10: reason},
            suspicious_keywords=[],
        )

        self.assertEqual(tags[0]["tag_type"], "suspicious")
        self.assertEqual(tags[0]["reason"], reason)

    def test_auto_tag_worker_failure_keeps_existing_auto_tags(self):
        tx = Transaction(session_id=1, date="2026-01-01", amount=-1000, party_name="CLIENT ONE")
        self.db.add(tx)
        self.db.commit()
        self.db.refresh(tx)

        existing = Tag(
            transaction_id=tx.id,
            tag_type="client",
            confidence=1.0,
            reason="existing auto tag",
            source="auto",
            is_manual=False,
        )
        self.db.add(existing)
        self.db.commit()
        self.db.refresh(existing)

        class FailingFuture:
            def result(self):
                raise RuntimeError("worker failed")

        class FailingExecutor:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def submit(self, *args, **kwargs):
                return FailingFuture()

        with patch("concurrent.futures.ProcessPoolExecutor", FailingExecutor):
            with patch("concurrent.futures.as_completed", lambda futures: list(futures)):
                with self.assertRaises(RuntimeError):
                    TaggingService(self.db).auto_tag_session(
                        session_id=1,
                        clients=[{"name": "CLIENT ONE", "raw_data": {}}],
                    )

        remaining = self.db.query(Tag).filter(Tag.transaction_id == tx.id).all()
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0].id, existing.id)
        self.assertEqual(remaining[0].reason, "existing auto tag")
