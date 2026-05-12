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
from backend.services.parsers import registry
from backend.brokers_list import BROKERS


CLIENTS = [
    {"name": "NITESH GIRDHARBHAI GOHIL", "raw_data": {"Client-ID": "AYLT55578O", "Name": "NITESH GIRDHARBHAI GOHIL"}},
    {"name": "MAYUR KANJIBHAI MAKWANA", "raw_data": {"Client-ID": "YMMC87086A", "Name": "MAYUR KANJIBHAI MAKWANA"}},
    {"name": "MITRAJ MUKESHBHAI DABHI", "raw_data": {"Client-ID": "HNNW24309I", "Name": "MITRAJ MUKESHBHAI DABHI"}},
    {"name": "DEEPKUMAR BHIKHABHAI PATEL", "raw_data": {"Client-ID": "CGOW34888Q", "Name": "DEEPKUMAR BHIKHABHAI PATEL"}},
]


class AccuracyTests(unittest.TestCase):
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

    def test_csv_prefers_name_column_over_client_id(self):
        fd, path = tempfile.mkstemp(suffix=".csv")
        try:
            with os.fdopen(fd, "w") as f:
                f.write("Client-ID,Name,Mobile No\n")
                f.write("AYLT55578O,NITESH GIRDHARBHAI GOHIL,8849790119\n")
            clients = CSVService().parse_client_list(path)
            self.assertEqual(clients[0]["name"], "NITESH GIRDHARBHAI GOHIL")
        finally:
            os.remove(path)

    def test_fuzzy_matches_abbreviated_client_name_without_matching_noise(self):
        matches = FuzzyService(0.75).match_client_names("MAYUR KA", CLIENTS)
        self.assertEqual(matches[0]["original"], "MAYUR KANJIBHAI MAKWANA")
        self.assertEqual(FuzzyService(0.75).match_client_names("YAAMI PETROLEUM PATAN", CLIENTS), [])

    def test_fuzzy_uses_upi_handle_evidence_for_client_names(self):
        matches = FuzzyService(0.75).match_client_names(
            "DABHI MI UPI/CR/519885665956/DABHI MI/SBIN/mitrajdabh/UPI",
            CLIENTS,
        )
        self.assertEqual(matches[0]["original"], "MITRAJ MUKESHBHAI DABHI")

    def test_fuzzy_uses_embedded_name_tokens_from_compressed_hdfc_narration(self):
        clients = CLIENTS + [
            {"name": "AMBIKA SHRIRAMRANA BHAT", "raw_data": {}},
        ]
        matches = FuzzyService(0.75).match_client_names(
            "NEFTDR-ICIC0000856-SHRIRAMRANAKBHAT-N ETBANK,MUM-N333232756797476-SALARY",
            clients,
        )
        self.assertTrue(any(m["original"] == "AMBIKA SHRIRAMRANA BHAT" for m in matches))

    def test_fuzzy_ignores_transaction_words_as_name_evidence(self):
        matches = FuzzyService(0.75).match_client_names(
            "AKASH BH DEP TFR UPI/CR/647452817697/AKASH BH/SBIN/akashjotan/UPI",
            CLIENTS,
        )
        self.assertFalse(any(m["original"] == "DEEPKUMAR BHIKHABHAI PATEL" for m in matches))

    def test_broker_matching_avoids_intermediary_bank_and_person_name_false_hits(self):
        fuzzy = FuzzyService(0.75)
        self.assertEqual(fuzzy.match_broker_names("Kotak Mahindra", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("GAURAV CH", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("ZERODHA BROKING", BROKERS)[0]["original"], "ZERODHA BROKING LIMITED")

    def test_broker_matching_rejects_bank_only_counterparties(self):
        fuzzy = FuzzyService(0.75)
        self.assertEqual(fuzzy.match_broker_names("AXIS BANK", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("KOTAK MAHINDRA BANK", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("ICICI BANK LIMITED", BROKERS), [])

    def test_broker_matching_keeps_distinctive_broker_entities(self):
        fuzzy = FuzzyService(0.75)
        self.assertIn(
            fuzzy.match_broker_names("KOTAK SECURITIES LIMITED NSE CLI", BROKERS)[0]["original"],
            {"KOTAK SECURITIES", "KOTAK SECURITIES LIMITED"},
        )
        self.assertEqual(
            fuzzy.match_broker_names("UPSTOX SECURITIES PRIVATE LIMITED", BROKERS)[0]["original"],
            "UPSTOX SECURITIES PRIVATE LIMITED",
        )
        self.assertEqual(
            fuzzy.match_broker_names("ANGEL ONE LIMITED", BROKERS)[0]["original"],
            "ANGEL ONE LIMITED",
        )
        self.assertEqual(
            fuzzy.match_broker_names("ANGELONELIMI-48AAAC2411230002", BROKERS)[0]["original"],
            "ANGEL ONE LIMITED",
        )

    def test_broker_matching_handles_truncated_entity_words_and_short_display_names(self):
        fuzzy = FuzzyService(0.75)
        self.assertEqual(
            fuzzy.match_broker_names("RAISE SECURITIE", BROKERS)[0]["original"],
            "RAISE SECURITIES PRIVATE LIMITED",
        )
        self.assertEqual(
            fuzzy.match_broker_names("Raise Se", BROKERS)[0]["original"],
            "RAISE SECURITIES PRIVATE LIMITED",
        )
        self.assertEqual(
            fuzzy.match_broker_names("RAISE SECURITIE AT 60015 SIHOR", BROKERS)[0]["original"],
            "RAISE SECURITIES PRIVATE LIMITED",
        )

    def test_broker_matching_handles_concatenated_broker_names(self):
        fuzzy = FuzzyService(0.75)
        narration = "RTGS-HDFCR52026010352880424- SMCGLOBALSECURITIESLTDDSCN5218- 57500001265218-HDFC0000240"
        self.assertEqual(
            fuzzy.match_broker_names(narration, BROKERS)[0]["original"],
            "SMC GLOBAL SECURITIES LIMITED",
        )
        self.assertEqual(
            fuzzy.match_broker_names("SMCGLOBALSECURITIESLTDDSCN5218", BROKERS)[0]["original"],
            "SMC GLOBAL SECURITIES LIMITED",
        )

    def test_broker_matching_rejects_person_only_registered_names_without_broker_context(self):
        fuzzy = FuzzyService(0.75)
        self.assertEqual(fuzzy.match_broker_names("AJAY GUPTA", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("AMIT SAHITA", BROKERS), [])

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

    def test_axis_bank_parser_registered(self):
        names = [p.name for p in registry.parsers]
        self.assertIn("axis_bank", names)
        self.assertIn("idfc_bank", names)
        self.assertIn("hdfc_bank", names)

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
