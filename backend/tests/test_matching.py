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



class MatchingTests(unittest.TestCase):
    def test_broker_matching_avoids_intermediary_bank_and_person_name_false_hits(self):
        fuzzy = FuzzyService(0.75)
        self.assertEqual(fuzzy.match_broker_names("Kotak Mahindra", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("GAURAV CH", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("ZERODHA BROKING", BROKERS)[0]["original"], "ZERODHA BROKING LIMITED")


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


    def test_broker_matching_rejects_bank_only_counterparties(self):
        fuzzy = FuzzyService(0.75)
        self.assertEqual(fuzzy.match_broker_names("AXIS BANK", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("KOTAK MAHINDRA BANK", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("ICICI BANK LIMITED", BROKERS), [])


    def test_broker_matching_rejects_person_only_registered_names_without_broker_context(self):
        fuzzy = FuzzyService(0.75)
        self.assertEqual(fuzzy.match_broker_names("AJAY GUPTA", BROKERS), [])
        self.assertEqual(fuzzy.match_broker_names("AMIT SAHITA", BROKERS), [])


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


    def test_fuzzy_ignores_transaction_words_as_name_evidence(self):
        matches = FuzzyService(0.75).match_client_names(
            "AKASH BH DEP TFR UPI/CR/647452817697/AKASH BH/SBIN/akashjotan/UPI",
            CLIENTS,
        )
        self.assertFalse(any(m["original"] == "DEEPKUMAR BHIKHABHAI PATEL" for m in matches))


    def test_fuzzy_matches_abbreviated_client_name_without_matching_noise(self):
        matches = FuzzyService(0.75).match_client_names("MAYUR KA", CLIENTS)
        self.assertEqual(matches[0]["original"], "MAYUR KANJIBHAI MAKWANA")
        self.assertEqual(FuzzyService(0.75).match_client_names("YAAMI PETROLEUM PATAN", CLIENTS), [])


    def test_fuzzy_uses_embedded_name_tokens_from_compressed_hdfc_narration(self):
        clients = CLIENTS + [
            {"name": "AMBIKA SHRIRAMRANA BHAT", "raw_data": {}},
        ]
        matches = FuzzyService(0.75).match_client_names(
            "NEFTDR-ICIC0000856-SHRIRAMRANAKBHAT-N ETBANK,MUM-N333232756797476-SALARY",
            clients,
        )
        self.assertTrue(any(m["original"] == "AMBIKA SHRIRAMRANA BHAT" for m in matches))


    def test_fuzzy_uses_upi_handle_evidence_for_client_names(self):
        matches = FuzzyService(0.75).match_client_names(
            "DABHI MI UPI/CR/519885665956/DABHI MI/SBIN/mitrajdabh/UPI",
            CLIENTS,
        )
        self.assertEqual(matches[0]["original"], "MITRAJ MUKESHBHAI DABHI")



if __name__ == "__main__":
    unittest.main()
