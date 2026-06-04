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



class ParsingTests(unittest.TestCase):
    def test_amount_cell_preserves_parenthesized_negative(self):
        self.assertEqual(BaseParser._parse_amount_cell("(1,000.00)"), -1000.0)


    def test_debit_credit_amount_signs(self):
        self.assertEqual(BaseParser._amount_from_debit_credit("625.00", ""), -625.0)
        self.assertEqual(BaseParser._amount_from_debit_credit("", "1,000.00"), 1000.0)


    def test_party_extraction_from_bank_narrations(self):
        self.assertEqual(
            BaseParser._extract_party_from_description(
                "TO TRANSFER- UPI/DR/509249553952/RAVI TRA/YESB/Q715451847/UPI-"
            ),
            "RAVI TRA",
        )
        self.assertEqual(
            BaseParser._extract_party_from_description(
                "by debit card- OTHPOS509106528360YAAMI PETROLEUM PATAN-"
            ),
            "YAAMI PETROLEUM PATAN",
        )
        self.assertEqual(
            BaseParser._extract_party_from_description(
                "NEFT-N093242964121374-ANGEL ONE LIMITED PROPRIETARY AC407-52743045"
            ),
            "ANGEL ONE",
        )
        self.assertEqual(
            BaseParser._extract_party_from_description(
                "NEFT-YESBN12025010106618757-ZERODHA BROKING LTD-DSCNB A/C- F09441079D48487D8673-002283000000071- YESB"
            ),
            "ZERODHA BROKING",
        )
        self.assertEqual(
            BaseParser._extract_party_from_description(
                "MMT/IMPS/500710624580/KKBKTransfer/GAURAV CH/Kotak Mahindra"
            ),
            "GAURAV CH",
        )


    def test_icici_numbered_uses_balance_delta_for_sign(self):
        parser = ICICINumberedParser()
        txs = parser._apply_balance_signs([
            {"amount": 100.0, "description": "MMT/IMPS/1/ALPHA/KKBK", "_balance": 900.0},
            {"amount": 50.0, "description": "MMT/IMPS/2/BETA/KKBK", "_balance": 950.0},
            {"amount": 25.0, "description": "MMT/IMPS/3/GAMMA/KKBK", "_balance": 925.0},
        ])
        self.assertEqual(txs[0]["amount"], 100.0)
        self.assertEqual(txs[1]["amount"], 50.0)
        self.assertEqual(txs[2]["amount"], -25.0)


    def test_generic_naive_parser_does_not_treat_date_as_amount(self):
        parser = GenericParser()
        tx = parser._parse_table_row(
            ["01.02.2024", "02.02.2024", "UPI/DR/123/ALPHA/SBIN/x/UPI", "1,250.00"],
            re.compile(r"^\(?-?[\d,]+\.\d{1,2}\)?$"),
            re.compile(r"\d{1,2}\.\d{1,2}\.\d{2,4}"),
            re.compile(r"^\d{1,2}\.\d{1,2}\.\d{2,4}$"),
        )
        self.assertEqual(tx["amount"], 1250.0)
        self.assertEqual(tx["description"], "UPI/DR/123/ALPHA/SBIN/x/UPI")


    def test_generic_text_parser_infers_debit_sign(self):
        txs = GenericParser()._parse_from_text([
            {"page_number": 1, "text": "01/02/2024 UPI/DR/123/ALPHA/SBIN/x/UPI 1,250.00"}
        ])
        self.assertEqual(txs[0]["amount"], -1250.0)


    def test_base_parser_infers_plain_neft_dr_cr_signs(self):
        self.assertEqual(BaseParser._infer_signed_amount(1250.0, "NEFT DR-REF-BANK-PARTY"), -1250.0)
        self.assertEqual(BaseParser._infer_signed_amount(1250.0, "NEFT CR-REF-BANK-PARTY"), 1250.0)


    def test_kotak_single_transaction_row_is_not_dropped(self):
        parser = KotakMahindraParser()
        txs = parser._extract_transactions(
            ["01/02/2024", "MMT/IMPS/1/ALPHA/KKBK", "", "", "1,250.00", "", "8,750.00"],
            {
                "date": 0,
                "narration": 1,
                "cheque": 2,
                "value_date": 3,
                "withdrawal": 4,
                "deposit": 5,
                "balance": 6,
            },
            re.compile(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"),
        )
        self.assertEqual(len(txs), 1)
        self.assertEqual(txs[0]["amount"], -1250.0)


    def test_base_parser_upi_p2m_extraction(self):
        party = BaseParser._extract_party_from_description(
            "UPI/P2M/600210234671/RAVINDRA KUMAR MISHRA/UPI/YES BANK LIMITED YBS"
        )
        self.assertIn("RAVINDRA KUMAR MISHRA", party)


    def test_base_parser_upi_p2a_extraction(self):
        party = BaseParser._extract_party_from_description(
            "UPI/P2A/637105785753/JAYPRAKASH RAMNIWAS K/UPI/State Bank Of India"
        )
        self.assertIn("JAYPRAKASH RAMNIWAS K", party)


    def test_base_parser_upi_mob_extraction(self):
        party = BaseParser._extract_party_from_description(
            "UPI/MOB/500460859965/NA"
        )
        self.assertIn("NA", party)


    def test_base_parser_imps_opm_extraction(self):
        party = BaseParser._extract_party_from_description(
            "IMPS-OPM/500420386389/JAGAT PAL/KKBK0004608/9831/"
        )
        self.assertIn("JAGAT PAL", party)


    def test_base_parser_nefto_extraction(self):
        party = UnionBankParser._extract_union_party(
            "NEFTO-BABARIYA DINESH RUPABHAI 001817221132"
        )
        self.assertIn("BABARIYA DINESH RUPABHAI", party)


    def test_base_parser_upiab_extraction(self):
        party = UnionBankParser._extract_union_party(
            "UPIAB/600241319866 /CR/RATHOD V/SBIN/vishalrathodcs"
        )
        self.assertIn("RATHOD V", party)


    def test_sbi_compact_skips_dash_rows(self):
        parser = SBICompactParser()
        row = ["02/01/2025", "02/01/2025", "WDL TFR UPI/DR/500203442888/BABARIYA/UBIN/dineshbaba/UPI", "-", "4,000.00", "-", "1,03,879.05"]
        tx = parser._extract_row(row, re.compile(r"\d{2}/\d{2}/\d{4}"))
        self.assertIsNotNone(tx)
        self.assertEqual(tx["amount"], -4000.0)
        self.assertIn("BABARIYA", tx["party_name"])


    def test_kotak_dash_narration_cleaning(self):
        narration = "UPI-SAMEERTASIBULLAKHA-SAMEERKHAN.SK17-1@OKHDFCBANK-HDFC0000146-327302563522-UPI"
        cleaned = KotakMahindraParser._clean_kotak_narration(narration)
        self.assertTrue(cleaned.startswith("UPI/"))
        party = BaseParser._extract_party_from_description(cleaned)
        self.assertIn("SAMEERTASIBULLAKHA", party)




if __name__ == "__main__":
    unittest.main()
