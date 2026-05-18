import os
import tempfile
import unittest

from openpyxl import load_workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.routes.export import _ensure_export_path
from backend.database import Base
from backend.models import AuditSession, Tag, Transaction
from backend.services.export_service import ExportService


class ExportServiceTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def test_export_route_preserves_absolute_save_dialog_path(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_xlsx = os.path.join(tmpdir, "nested", "audit.xlsx")

            self.assertEqual(_ensure_export_path(output_xlsx), output_xlsx)
            self.assertTrue(os.path.isdir(os.path.dirname(output_xlsx)))

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

                ws_acc = wb["Account Transactions"]
                max_r = ws_acc.max_row
                self.assertEqual(ws_acc["A1"].value, "ID")
                self.assertEqual(ws_acc["B1"].value, "Date")
                self.assertEqual(ws_acc["H2"].value, "client")
                self.assertEqual(ws_acc[f"B{max_r-2}"].value, "AAAC HDFC")
                self.assertEqual(ws_acc[f"B{max_r-1}"].value, 3)

                ws_client = wb["Client"]
                max_r_client = ws_client.max_row
                self.assertEqual(ws_client[f"B{max_r_client-1}"].value, 1)

                ws_broker = wb["Broker"]
                max_r_broker = ws_broker.max_row
                self.assertEqual(ws_broker[f"B{max_r_broker-1}"].value, 1)

                ws_suspicious = wb["Suspicious"]
                max_r_suspicious = ws_suspicious.max_row
                self.assertEqual(ws_suspicious[f"B{max_r_suspicious-1}"].value, 1)

                ws_other = wb["Suspicious - Other"]
                max_r_other = ws_other.max_row
                self.assertEqual(ws_other[f"B{max_r_other-1}"].value, 1)
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
                max_r = ws.max_row
                self.assertEqual(ws[f"B{max_r-1}"].value, 3)
                self.assertEqual(ws["F2"].value, "ALPHA CLIENT")
                self.assertEqual(ws["F3"].value, "ALPHA CLIENT")
                self.assertEqual(ws["F4"].value, "BETA CLIENT")
            finally:
                wb.close()
