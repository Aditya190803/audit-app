import os
import tempfile
import unittest

import fitz
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models import AuditSession, Tag, Transaction
from backend.services.export_service import ExportService


def _write_pdf(path: str, text: str) -> None:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text, fontsize=12)
    doc.save(path)
    doc.close()


class ExportServiceTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def test_highlighted_pdf_export_merges_multiple_input_pdfs(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            first_pdf = os.path.join(tmpdir, "first.pdf")
            second_pdf = os.path.join(tmpdir, "second.pdf")
            output_pdf = os.path.join(tmpdir, "highlighted.pdf")
            _write_pdf(first_pdf, "ALPHA TRADING")
            _write_pdf(second_pdf, "BETA BROKING")

            session = AuditSession(name="multi-pdf")
            self.db.add(session)
            self.db.commit()

            tx1 = Transaction(session_id=session.id, page_number=1, party_name="ALPHA TRADING")
            tx2 = Transaction(session_id=session.id, page_number=2, party_name="BETA BROKING")
            self.db.add_all([tx1, tx2])
            self.db.commit()
            self.db.refresh(tx1)
            self.db.refresh(tx2)
            self.db.add_all([
                Tag(transaction_id=tx1.id, tag_type="client"),
                Tag(transaction_id=tx2.id, tag_type="broker"),
            ])
            self.db.commit()

            ExportService(self.db).export_highlighted_pdf([tx1, tx2], [first_pdf, second_pdf], output_pdf)

            doc = fitz.open(output_pdf)
            try:
                self.assertEqual(len(doc), 2)
                self.assertEqual(len(list(doc[0].annots() or [])), 1)
                self.assertEqual(len(list(doc[1].annots() or [])), 1)
            finally:
                doc.close()

    def test_highlighted_pdf_export_searches_merged_pdf_when_page_number_is_local(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            first_pdf = os.path.join(tmpdir, "first.pdf")
            second_pdf = os.path.join(tmpdir, "second.pdf")
            output_pdf = os.path.join(tmpdir, "highlighted.pdf")
            _write_pdf(first_pdf, "ALPHA TRADING")
            _write_pdf(second_pdf, "BETA BROKING")

            session = AuditSession(name="legacy-multi-pdf")
            self.db.add(session)
            self.db.commit()

            tx = Transaction(session_id=session.id, page_number=1, party_name="BETA BROKING")
            self.db.add(tx)
            self.db.commit()
            self.db.refresh(tx)
            self.db.add(Tag(transaction_id=tx.id, tag_type="broker"))
            self.db.commit()

            ExportService(self.db).export_highlighted_pdf([tx], [first_pdf, second_pdf], output_pdf)

            doc = fitz.open(output_pdf)
            try:
                self.assertEqual(len(list(doc[0].annots() or [])), 0)
                self.assertEqual(len(list(doc[1].annots() or [])), 1)
            finally:
                doc.close()
