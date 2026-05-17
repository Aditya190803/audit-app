import os
import tempfile
import unittest

import fitz
from openpyxl import load_workbook
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

    def test_excel_export_creates_required_workbook_sheets(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_xlsx = os.path.join(tmpdir, "audit.xlsx")

            session = AuditSession(name="AAAC HDFC")
            self.db.add(session)
            self.db.commit()

            client_tx = Transaction(
                session_id=session.id,
                date="2026-01-02",
                amount=-1250,
                description="NEFT TO CLIENT ONE",
                party_name="CLIENT ONE",
                payment_method="NEFT",
                page_number=1,
            )
            broker_tx = Transaction(
                session_id=session.id,
                date="2026-01-03",
                amount=5000,
                description="UPI FROM BROKER TWO",
                party_name="BROKER TWO",
                payment_method="UPI",
                page_number=2,
            )
            suspicious_tx = Transaction(
                session_id=session.id,
                date="2026-01-04",
                amount=-99999,
                description="CASH WITHDRAWAL",
                party_name="UNKNOWN",
                payment_method="CASH",
                page_number=3,
            )
            self.db.add_all([client_tx, broker_tx, suspicious_tx])
            self.db.commit()
            for tx in (client_tx, broker_tx, suspicious_tx):
                self.db.refresh(tx)

            self.db.add_all([
                Tag(transaction_id=client_tx.id, tag_type="client", reason="Matched client list"),
                Tag(transaction_id=broker_tx.id, tag_type="broker", reason="Matched broker list"),
                Tag(transaction_id=suspicious_tx.id, tag_type="suspicious", reason="Large cash movement"),
            ])
            self.db.commit()

            ExportService(self.db).export_excel(
                [client_tx, broker_tx, suspicious_tx],
                output_xlsx,
                session.name,
            )

            wb = load_workbook(output_xlsx)
            try:
                self.assertEqual(
                    wb.sheetnames,
                    [
                        "Account Transactions",
                        "Client",
                        "Broker",
                        "Suspicious",
                        "Suspicious - Recurring",
                        "Suspicious - High Value",
                        "Suspicious - Other",
                    ],
                )
                self.assertEqual(wb["Account Transactions"]["B2"].value, "AAAC HDFC")
                self.assertEqual(wb["Account Transactions"]["B3"].value, 3)
                self.assertEqual(wb["Client"]["B3"].value, 1)
                self.assertEqual(wb["Broker"]["B3"].value, 1)
                self.assertEqual(wb["Suspicious"]["B3"].value, 1)
                self.assertEqual(wb["Suspicious - Other"]["B3"].value, 1)
                self.assertEqual(wb["Account Transactions"]["A5"].value, "ID")
                self.assertEqual(wb["Account Transactions"]["H6"].value, "client")
            finally:
                wb.close()

    def test_excel_export_groups_recurring_suspicious_transactions_by_name(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_xlsx = os.path.join(tmpdir, "audit.xlsx")

            session = AuditSession(name="recurring")
            self.db.add(session)
            self.db.commit()

            tx1 = Transaction(session_id=session.id, date="2026-01-01", amount=-5000, party_name="ALPHA CLIENT")
            tx2 = Transaction(session_id=session.id, date="2026-01-15", amount=-5000, party_name="ALPHA CLIENT")
            tx3 = Transaction(session_id=session.id, date="2026-01-08", amount=-7000, party_name="BETA CLIENT")
            self.db.add_all([tx1, tx2, tx3])
            self.db.commit()
            for tx in (tx1, tx2, tx3):
                self.db.refresh(tx)

            self.db.add_all([
                Tag(transaction_id=tx3.id, tag_type="suspicious", reason="Recurring transaction to same party"),
                Tag(transaction_id=tx1.id, tag_type="suspicious", reason="Recurring transaction to same party"),
                Tag(transaction_id=tx2.id, tag_type="suspicious", reason="Recurring transaction to same party"),
            ])
            self.db.commit()

            ExportService(self.db).export_excel([tx3, tx1, tx2], output_xlsx, session.name)

            wb = load_workbook(output_xlsx)
            try:
                ws = wb["Suspicious - Recurring"]
                self.assertEqual(ws["B3"].value, 3)
                self.assertEqual(ws["F6"].value, "ALPHA CLIENT")
                self.assertEqual(ws["F7"].value, "ALPHA CLIENT")
                self.assertEqual(ws["F8"].value, "BETA CLIENT")
            finally:
                wb.close()

    def test_highlighted_pdf_export_falls_back_to_transaction_text_parts(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = os.path.join(tmpdir, "statement.pdf")
            output_pdf = os.path.join(tmpdir, "highlighted.pdf")
            _write_pdf(pdf_path, "CLIENT THREE")

            session = AuditSession(name="text-parts")
            self.db.add(session)
            self.db.commit()

            tx = Transaction(
                session_id=session.id,
                page_number=1,
                raw_text="DATE 2026-01-02\nCLIENT THREE\nAMOUNT 1000",
                party_name="CLIENT THREE",
            )
            self.db.add(tx)
            self.db.commit()
            self.db.refresh(tx)
            self.db.add(Tag(transaction_id=tx.id, tag_type="client"))
            self.db.commit()

            ExportService(self.db).export_highlighted_pdf([tx], pdf_path, output_pdf)

            doc = fitz.open(output_pdf)
            try:
                annots = list(doc[0].annots() or [])
                self.assertEqual(len(annots), 1)
            finally:
                doc.close()
