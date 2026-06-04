import unittest
import os
import sys
import tempfile
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from backend.services.csv_service import CSVService
from backend.services.fuzzy_service import FuzzyService
from backend.services.parsers.base import BaseParser
from backend.services.parsers.generic import GenericParser
from backend.services.parsers.icici_numbered import ICICINumberedParser
from backend.services.parsers.icici_detailed import ICICIDetailedParser
from backend.services.parsers.kotak_mahindra import KotakMahindraParser
from backend.services.parsers.axis_bank import AxisBankParser
from backend.services.parsers.idfc_bank import IDFCBankParser
from backend.services.parsers.hdfc_bank import HDFCBankParser
from backend.services.parsers.union_bank import UnionBankParser
from backend.services.parsers.sbi_standard import SBIStandardParser
from backend.services.parsers.sbi_compact import SBICompactParser
from backend.services.parsers.pnb_bank import PNBBankParser
from backend.services.parsers.bank_of_baroda import BankOfBarodaParser
from backend.services.parsers.yes_bank import YesBankParser
from backend.services.parsers.canara_bank import CanaraBankParser
from backend.services.parsers.indusind_bank import IndusIndBankParser
from backend.services.parsers.standard_chartered import StandardCharteredParser
from backend.services.parsers.rbl_bank import RBLBankParser
from backend.services.parsers import registry
from backend.brokers_list import BROKERS


CLIENTS = [
    {"name": "NITESH GIRDHARBHAI GOHIL", "raw_data": {"Client-ID": "AYLT55578O", "Name": "NITESH GIRDHARBHAI GOHIL"}},
    {"name": "MAYUR KANJIBHAI MAKWANA", "raw_data": {"Client-ID": "YMMC87086A", "Name": "MAYUR KANJIBHAI MAKWANA"}},
    {"name": "MITRAJ MUKESHBHAI DABHI", "raw_data": {"Client-ID": "HNNW24309I", "Name": "MITRAJ MUKESHBHAI DABHI"}},
    {"name": "DEEPKUMAR BHIKHABHAI PATEL", "raw_data": {"Client-ID": "CGOW34888Q", "Name": "DEEPKUMAR BHIKHABHAI PATEL"}},
]



class BankParserTests(unittest.TestCase):
    def test_axis_bank_detects_table(self):
        parser = AxisBankParser()
        tables = [{"data": [["Tran Date", "Chq No", "Particulars", "Debit", "Credit", "Balance", "Init. Br"]], "page_number": 1}]
        score = parser.detect(tables, [])
        self.assertGreater(score, 0.7)


    def test_axis_bank_extract_row(self):
        parser = AxisBankParser()
        col_indices = {"date": 0, "cheque": 1, "description": 2, "debit": 3, "credit": 4, "balance": 5}
        row = ["01-01-2025", "", "UPI/P2A/500102293542/HAR VANSH KUMAR GUPTA/UPI/BANK OF BARODA", "4,000.00", "", "1,341.96"]
        tx = parser._extract_row(row, col_indices, re.compile(r"\d{1,2}-\d{1,2}-\d{4}"))
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], -4000.0)
        self.assertIn("HAR VANSH KUMAR GUPTA", tx["party_name"])


    def test_axis_bank_parser_registered(self):
        names = [p.name for p in registry.parsers]
        self.assertIn("axis_bank", names)
        self.assertIn("idfc_bank", names)
        self.assertIn("hdfc_bank", names)
        self.assertIn("pnb_bank", names)
        self.assertIn("bank_of_baroda", names)
        self.assertIn("yes_bank", names)
        self.assertIn("canara_bank", names)
        self.assertIn("indusind_bank", names)
        self.assertIn("standard_chartered", names)
        self.assertIn("rbl_bank", names)


    def test_bank_of_baroda_detects_table_with_identity(self):
        parser = BankOfBarodaParser()
        tables = [{
            "data": [["Date", "Description", "Ref No. / Cheque No.", "Debit", "Credit", "Balance"]],
            "page_number": 1,
        }]
        pages = [{"text": "Bank of Baroda Account Statement IFSC BARB0CON123"}]
        score = parser.detect(tables, pages)
        self.assertGreater(score, 0.9)


    def test_bank_of_baroda_extract_row(self):
        parser = BankOfBarodaParser()
        col_indices = {"date": 0, "description": 1, "reference": 2, "debit": 3, "credit": 4, "balance": 5}
        row = ["09-Sep-25", "Salary Credit - INFOSYS LTD", "NEFT/IN456728", "", "35,000.00", "60,580.00"]
        tx = parser._extract_row(row, col_indices)
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], 35000.0)
        self.assertIn("INFOSYS", tx["party_name"])


    def test_canara_bank_detects_table_with_identity(self):
        parser = CanaraBankParser()
        tables = [{
            "data": [["TRANS", "VALUE", "BRANCH", "REF/CHQ.NO", "DESCRIPTION", "WITHDRAWS", "DEPOSIT", "BALANCE"]],
            "page_number": 1,
        }]
        pages = [{"text": "Canara Bank Account Statement IFSC CNRB0004038"}]
        score = parser.detect(tables, pages)
        self.assertGreater(score, 0.9)


    def test_canara_bank_extract_row(self):
        parser = CanaraBankParser()
        col_indices = {"date": 0, "value_date": 1, "branch": 2, "reference": 3, "description": 4, "debit": 5, "credit": 6, "balance": 7}
        row = ["01-05-2024", "01-05-2024", "4038", "412345678901", "UPI/DR/412345678901/RAMESH STORES/CNRB/ramesh@cnrb", "500.00", "", "1,866.46"]
        tx = parser._extract_row(row, col_indices)
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], -500.0)
        self.assertIn("RAMESH STORES", tx["party_name"])


    def test_canara_bank_trims_only_leading_description_space(self):
        parser = CanaraBankParser()
        col_indices = {"date": 0, "value_date": 1, "branch": 2, "reference": 3, "description": 4, "debit": 5, "credit": 6, "balance": 7}
        row = ["01-05-2024", "01-05-2024", "4038", "412345678901", "   UPI/DR/412345678901/PAYM ENT/CNRB/ramesh@cnrb", "500.00", "", "1,866.46"]
        tx = parser._extract_row(row, col_indices)
        self.assertIsNotNone(tx)
        self.assertEqual(tx["description"], "UPI/DR/412345678901/PAYM ENT/CNRB/ramesh@cnrb")


    def test_hdfc_bank_carries_page_boundary_narration_continuations(self):
        parser = HDFCBankParser()
        tables = [
            {
                "page_number": 4,
                "data": [[
                    "15/11/23",
                    "UPI-ARTIDUBEY0974OKICICI-ARTIDUBEY0974@O",
                    "0000331935748149",
                    "15/11/23",
                    "700.00",
                    "",
                    "268,601.47",
                ]],
            },
            {
                "page_number": 5,
                "data": [[
                    "15/11/23",
                    "KICICI-CBIN0284981-331935748149-UPI\nUPI-MRSARTIARVINDDUBE-ARTIDUBEY0974@O\nKICICI-CBIN0284981-331975043880-UPI",
                    "0000331975043880",
                    "15/11/23",
                    "",
                    "1,000.00",
                    "267,901.47",
                ]],
            },
        ]

        txs = parser.parse(tables, [])
        self.assertEqual(len(txs), 2)
        self.assertIn("331935748149", txs[0]["description"])
        self.assertIn("ARTIDUBEY0974OKICICI", txs[0]["party_name"])
        self.assertNotEqual(txs[0]["party_name"], "KICICI")
        self.assertEqual(txs[0]["page_number"], 4)


    def test_hdfc_bank_detects_table(self):
        parser = HDFCBankParser()
        tables = [{"data": [["Date", "Narration", "Chq./Ref.No.", "ValueDt", "WithdrawalAmt.", "DepositAmt.", "ClosingBalance"]], "page_number": 1}]
        score = parser.detect(tables, [])
        self.assertGreater(score, 0.9)


    def test_hdfc_bank_expands_packed_rows_and_uses_balance_delta_signs(self):
        parser = HDFCBankParser()
        rows = parser._table_rows([[
            "Date", "Narration", "Chq./Ref.No.", "ValueDt", "WithdrawalAmt.", "DepositAmt.", "ClosingBalance"
        ], [
            "01/11/23\n01/11/23\n02/11/23",
            "UPI-JAGATKUMARSINGH-JAGATKUMAR1974@OKH\nDFCBANK-HDFC0000322-330592196782-UPI\nUPI-MANSOORI IMTIYAZ-IMTIYAZMANSURI2528\n@OKICICI-SBIN0030371-330595887924-UPI\nCASHDEPOSIT-XXXXXXXXXX0896-CHALAROAD",
            "0000330592196782\n0000330595887924\n0000000000004468",
            "01/11/23\n01/11/23\n02/11/23",
            "6,000.00",
            "1,000.00\n6,000.00",
            "283,935.65\n277,935.65\n283,935.65",
        ]])
        self.assertEqual(len(rows), 3)

        first = parser._extract_row(rows[0], None)
        second = parser._extract_row(rows[1], 283935.65)
        third = parser._extract_row(rows[2], 277935.65)
        self.assertEqual(first["amount"], 1000.0)
        self.assertEqual(second["amount"], -6000.0)
        self.assertEqual(third["amount"], 6000.0)
        self.assertEqual(third["party_name"], "Cash Deposit")


    def test_hdfc_bank_splits_angel_one_compact_broker_rows(self):
        parser = HDFCBankParser()
        rows = parser._table_rows([[
            "Date", "Narration", "Chq./Ref.No.", "ValueDt", "WithdrawalAmt.", "DepositAmt.", "ClosingBalance"
        ], [
            "23/11/23\n24/11/23\n24/11/23",
            "UPI-JAGATKUMARSINGH-JAGATKUMAR1974@OKH\nDFCBANK-HDFC0000322-332760569139-UPI\nANGELONELIMI-48AAAC2411230002\nUPI-JIOPREPAIDRECHARGE-PAYTM-JIOMOBILI\nTY@PAYTM-PYTM0123456-332886991367-UPI",
            "0000332760569139\n0000311242906232\n0000332886991367",
            "23/11/23\n24/11/23\n24/11/23",
            "199.00",
            "1,000.00\n208.40",
            "273,349.47\n273,557.87\n273,358.87",
        ]])

        self.assertEqual(len(rows), 3)
        angel_row = rows[1]
        angel_tx = parser._extract_row(angel_row, 273349.47)
        self.assertEqual(angel_tx["amount"], 208.40)
        self.assertEqual(angel_tx["party_name"], "ANGELONELIMI")
        self.assertEqual(
            FuzzyService(0.75).match_broker_names(angel_tx["party_name"], BROKERS)[0]["original"],
            "ANGEL ONE LIMITED",
        )
        self.assertEqual(angel_row[1], "ANGELONELIMI-48AAAC2411230002")


    def test_hdfc_bank_splits_repeated_upi_narrations_without_client_bleed(self):
        parser = HDFCBankParser()
        rows = parser._table_rows([[
            "Date", "Narration", "Chq./Ref.No.", "ValueDt", "WithdrawalAmt.", "DepositAmt.", "ClosingBalance"
        ], [
            "17/02/24\n18/02/24\n18/02/24\n18/02/24\n19/02/24\n19/02/24",
            "UPI-CAMYMEDICALSTORES-CAMYMEDICALSTORE\nS.66006877@HDFCBANK-HDFC0000001-40488739\n5759-UPI\nUPI-RAJHANS CINEMAVAPI-PAYTM-81904322@\nPAYTM-PYTM0123456-404911127011-UPI\nUPI-SABRIPETROLEUM-PAYTMQR281005050101D\nSK2EA67MI98@PAYTM-PYTM0123456-4049204135\n29-UPI\nUPI-SOLMARWINES-SOLMARWINES.68126532@HD\nFCBANK-HDFC0000001-404921179349-UPI\nCASHDEPOSITBY-SELF-CHALAROAD\nUPI-SHAHRUKHM\nMEMON-MEMONSHAHRUKH55-2@O\nKAXIS-UTIB0000459-405037380264-UPI",
            "0000404887395759\n0000404911127011\n0000404920413529\n0000404921179349\n000000000000000\n0000405037380264",
            "17/02/24\n18/02/24\n18/02/24\n18/02/24\n19/02/24\n19/02/24",
            "377.00\n400.00\n1,000.00\n600.00\n20,000.00",
            "11,000.00",
            "220,574.76\n220,174.76\n219,174.76\n218,574.76\n229,574.76\n209,574.76",
        ]])

        self.assertEqual(len(rows), 6)
        camy = next(row for row in rows if "CAMYMEDICALSTORES" in row[1])
        shahrukh = next(row for row in rows if "SHAHRUKHM" in row[1])
        cash = next(row for row in rows if "CASHDEPOSITBY" in row[1])

        self.assertNotIn("SHAHRUKH", camy[1])
        self.assertEqual(parser._extract_row(camy, None)["party_name"], "CAMYMEDICALSTORES")
        self.assertIn("SHAHRUKH", parser._extract_row(shahrukh, 229574.76)["party_name"])
        self.assertEqual(parser._extract_row(cash, 218574.76)["party_name"], "Cash Deposit")


    def test_idfc_bank_detects_table(self):
        parser = IDFCBankParser()
        tables = [{"data": [["Transaction\nDate", "Value Date", "Particulars", "Cheque\nNo", "Debit", "Credit", "Balance"]], "page_number": 1}]
        score = parser.detect(tables, [])
        self.assertGreater(score, 0.7)


    def test_idfc_bank_extract_row(self):
        parser = IDFCBankParser()
        col_indices = {"date": 0, "value_date": 1, "description": 2, "cheque": 3, "debit": 4, "credit": 5, "balance": 6}
        row = ["01-Jan-2025", "01-Jan-2025", "NEFT/CMS0012575293449/Kotak Securities Limited NSE CLI/KKBK0000958", "", "", "1,00,000.00", "2,26,202.47"]
        tx = parser._extract_row(row, col_indices, re.compile(r"\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}", re.IGNORECASE))
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], 100000.0)
        self.assertIn("Kotak Securities", tx["party_name"])


    def test_indusind_bank_detects_table_with_identity(self):
        parser = IndusIndBankParser()
        tables = [{
            "data": [["Date", "Particulars", "Chq./Ref.", "Withdrawl", "Deposit", "Balance"]],
            "page_number": 1,
        }]
        pages = [{"text": "IndusInd Bank Statement of Account"}]
        score = parser.detect(tables, pages)
        self.assertGreater(score, 0.9)


    def test_indusind_bank_extract_row(self):
        parser = IndusIndBankParser()
        col_indices = {"date": 0, "description": 1, "reference": 2, "debit": 3, "credit": 4, "balance": 5}
        row = ["08-Jun-2025", "UPI/102783902476/DR/MD S/CNRB/7384395246@ybl/Payme", "S27130712", "20,612", "", "21,045.72"]
        tx = parser._extract_row(row, col_indices)
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], -20612.0)
        self.assertEqual(tx["party_name"], "MD S")


    def test_pnb_bank_detects_table_with_identity(self):
        parser = PNBBankParser()
        tables = [{
            "data": [["Transaction\nDate", "Cheque\nNumber", "Withdrawal", "Deposit", "Balance", "Narration"]],
            "page_number": 1,
        }]
        pages = [{"text": "Punjab National Bank Account Statement IFSC Code: PUNB0149220"}]
        score = parser.detect(tables, pages)
        self.assertGreater(score, 0.9)


    def test_pnb_bank_extract_row(self):
        parser = PNBBankParser()
        col_indices = {"date": 0, "cheque": 1, "debit": 2, "credit": 3, "balance": 4, "description": 5}
        row = ["08/03/2025", "", "20.00", "", "9,907.21 Cr.", "UPI/101137725054/P2M/q018556816@ybl/SANDHYA RANI PU"]
        tx = parser._extract_row(row, col_indices)
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], -20.0)
        self.assertIn("SANDHYA RANI", tx["party_name"])


    def test_rbl_bank_detects_table_with_identity(self):
        parser = RBLBankParser()
        tables = [{
            "data": [["Date", "Narration", "Withdrawals (Dr)", "Deposits (Cr)", "Balance (INR)"]],
            "page_number": 1,
        }]
        pages = [{"text": "RBL Bank Account Statement IFSC RATN0000111"}]
        score = parser.detect(tables, pages)
        self.assertGreater(score, 0.9)


    def test_rbl_bank_extract_row(self):
        parser = RBLBankParser()
        col_indices = {"date": 0, "description": 1, "debit": 2, "credit": 3, "balance": 4}
        row = ["12/01/2024", "UPI/DR/401212345678/AMIT TRADERS/RATN/amit@rbl", "750.00", "", "44,250.00"]
        tx = parser._extract_row(row, col_indices)
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], -750.0)
        self.assertEqual(tx["party_name"], "AMIT TRADERS")


    def test_standard_chartered_detects_table_with_identity(self):
        parser = StandardCharteredParser()
        tables = [{
            "data": [["Date", "Description", "Withdrawal", "Deposit", "Balance"]],
            "page_number": 1,
        }]
        pages = [{"text": "Statement of Account Branch : STANDARD CHARTERED BANK"}]
        score = parser.detect(tables, pages)
        self.assertGreater(score, 0.9)


    def test_standard_chartered_extract_row(self):
        parser = StandardCharteredParser()
        col_indices = {"date": 0, "description": 1, "debit": 2, "credit": 3, "balance": 4}
        row = ["26 Feb 2025", "PIKMIMIN02A00002 K2M IMPEX PRIVATE LIMITED|HDFC BANK 505712062191|IMPS|P2A|HDFC0004191|50200041425817", "100.00", "", "59,245.39"]
        tx = parser._extract_row(row, col_indices)
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], -100.0)
        self.assertIn("K2M IMPEX", tx["party_name"])


    def test_yes_bank_detects_table_with_identity(self):
        parser = YesBankParser()
        tables = [{
            "data": [["Transaction\nDate", "Value Date", "Description", "Withdrawals", "Deposits", "Balance"]],
            "page_number": 1,
        }]
        pages = [{"text": "YES Bank Statement of Accounts IFSC YESB0000988"}]
        score = parser.detect(tables, pages)
        self.assertGreater(score, 0.9)


    def test_yes_bank_extract_row(self):
        parser = YesBankParser()
        col_indices = {"date": 0, "value_date": 1, "description": 2, "debit": 3, "credit": 4, "balance": 5}
        row = ["01-04-2023", "01-04-2023", "PCA:0100857961:000981999769795:DHARAM CHAND BAKERS", "15,500.00", "0.00", "80,288.18"]
        tx = parser._extract_row(row, col_indices)
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], -15500.0)
        self.assertEqual(tx["party_name"], "DHARAM CHAND BAKERS")



if __name__ == "__main__":
    unittest.main()
