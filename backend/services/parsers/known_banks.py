import re
from typing import List, Dict, Any

from backend.services.parsers.base import BaseParser


class ConfigurableBankParser(BaseParser):
    """Header-driven parser for common Indian bank statement layouts."""

    bank_identity: List[str] = []
    header_patterns: List[str] = []
    column_keywords: Dict[str, List[str]] = {}
    date_regex = (
        r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}-[A-Za-z]{3}-\d{2,4}|"
        r"\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4}"
    )

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        score = 0.0
        page_text = "\n".join(str(p.get("text", "")) for p in pages).lower()
        if any(re.search(p, page_text, re.IGNORECASE) for p in self.bank_identity):
            score = max(score, 0.45)

        for table in tables:
            for row in table.get("data", [])[:15]:
                row_text = " ".join(str(c or "") for c in row).lower()
                matches = sum(1 for p in self.header_patterns if re.search(p, row_text, re.IGNORECASE))
                if matches >= 4:
                    score = max(score, 0.92 if score >= 0.45 else 0.76)
                elif matches >= 3 and score >= 0.45:
                    score = max(score, 0.82)
        return score

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        date_pattern = re.compile(self.date_regex, re.IGNORECASE)
        transactions: List[Dict[str, Any]] = []
        for table in tables:
            data = table.get("data", [])
            if not data:
                continue
            header_idx = self._find_header_row(data, self.header_patterns)
            header = data[header_idx]
            col_indices = self._detect_column_indices(header, self.column_keywords)
            if "date" not in col_indices or "description" not in col_indices:
                continue
            for row in data[header_idx + 1:]:
                tx = self._extract_row(row, col_indices, date_pattern)
                if tx:
                    tx["page_number"] = table.get("page_number")
                    transactions.append(tx)
        return transactions

    def _extract_row(self, row, col_indices, date_pattern):
        date = self._date_from_cell(self._safe_cell(row, col_indices.get("date", -1)), date_pattern)
        if not date:
            return None
        desc = self._clean_text(self._safe_cell(row, col_indices.get("description", -1)))
        ref = self._clean_text(self._safe_cell(row, col_indices.get("reference", -1)))
        if ref and ref not in desc:
            raw_desc = f"{desc} {ref}".strip()
        else:
            raw_desc = desc

        amount = None
        if "debit" in col_indices or "credit" in col_indices:
            amount = self._amount_from_debit_credit(
                self._safe_cell(row, col_indices.get("debit", -1)),
                self._safe_cell(row, col_indices.get("credit", -1)),
            )
        if amount is None and "amount" in col_indices:
            amount = self._parse_amount_cell(self._safe_cell(row, col_indices["amount"]))
            dc = self._clean_text(self._safe_cell(row, col_indices.get("type", -1))).upper()
            marker_source = f"{dc} {raw_desc}"
            if amount is not None:
                amount = -abs(amount) if re.search(r"\b(?:DR|DEBIT|WITHDRAWAL|WDL)\b", marker_source) else abs(amount)
                amount = self._infer_signed_amount(amount, marker_source)
        if amount is None:
            return None
        return {
            "date": date,
            "amount": amount,
            "description": raw_desc,
            "party_name": self._extract_party_from_description(raw_desc) or raw_desc,
            "raw_text": " | ".join(str(c or "") for c in row),
        }


COMMON_COLUMNS = {
    "date": [r"txn\s*date", r"tran(?:saction)?\s*date", r"date", r"value\s*date", r"posting\s*date"],
    "description": [r"description", r"particulars", r"narration", r"remarks", r"details", r"transaction\s*details"],
    "reference": [r"ref", r"cheque", r"chq", r"instrument", r"utr"],
    "debit": [r"debit", r"withdraw", r"withdrawal", r"paid\s*out", r"dr\b"],
    "credit": [r"credit", r"deposit", r"paid\s*in", r"cr\b"],
    "amount": [r"amount", r"transaction\s*amount"],
    "type": [r"type", r"dr\s*/\s*cr", r"cr\s*/\s*dr", r"debit\s*/\s*credit"],
    "balance": [r"balance", r"closing\s*balance", r"available\s*balance"],
}
COMMON_HEADERS = [r"date", r"particulars|narration|description|remarks|details", r"debit|withdraw", r"credit|deposit", r"amount", r"balance", r"ref|cheque|chq|utr"]


def bank_parser_class(class_name, parser_name, display_name, identities):
    return type(class_name, (ConfigurableBankParser,), {
        "name": parser_name,
        "display_name": display_name,
        "bank_identity": identities,
        "header_patterns": COMMON_HEADERS,
        "column_keywords": COMMON_COLUMNS,
    })


FederalBankParser = bank_parser_class("FederalBankParser", "federal_bank", "Federal Bank", [r"federal\s+bank", r"FDRL0"])
IndianBankParser = bank_parser_class("IndianBankParser", "indian_bank", "Indian Bank", [r"\bindian\s+bank\b", r"IDIB0"])
IndianOverseasBankParser = bank_parser_class("IndianOverseasBankParser", "indian_overseas_bank", "Indian Overseas Bank", [r"indian\s+overseas\s+bank", r"IOBA0"])
UCOBankParser = bank_parser_class("UCOBankParser", "uco_bank", "UCO Bank", [r"\buco\s+bank\b", r"UCBA0"])
CentralBankParser = bank_parser_class("CentralBankParser", "central_bank_of_india", "Central Bank of India", [r"central\s+bank\s+of\s+india", r"CBIN0"])
BankOfMaharashtraParser = bank_parser_class("BankOfMaharashtraParser", "bank_of_maharashtra", "Bank of Maharashtra", [r"bank\s+of\s+maharashtra", r"MAHB0"])
KarnatakaBankParser = bank_parser_class("KarnatakaBankParser", "karnataka_bank", "Karnataka Bank", [r"karnataka\s+bank", r"KARB0"])
SouthIndianBankParser = bank_parser_class("SouthIndianBankParser", "south_indian_bank", "South Indian Bank", [r"south\s+indian\s+bank", r"SIBL0"])
AUSmallFinanceBankParser = bank_parser_class("AUSmallFinanceBankParser", "au_small_finance", "AU Small Finance Bank", [r"au\s+small\s+finance", r"AUBL0"])
DCBBankParser = bank_parser_class("DCBBankParser", "dcb_bank", "DCB Bank", [r"\bdcb\s+bank\b", r"DCBL0"])
BandhanBankParser = bank_parser_class("BandhanBankParser", "bandhan_bank", "Bandhan Bank", [r"bandhan\s+bank", r"BDBL0"])
CityUnionBankParser = bank_parser_class("CityUnionBankParser", "city_union_bank", "City Union Bank", [r"city\s+union\s+bank", r"CIUB0"])
TamilnadMercantileBankParser = bank_parser_class("TamilnadMercantileBankParser", "tamilnad_mercantile_bank", "Tamilnad Mercantile Bank", [r"tamilnad\s+mercantile", r"TMBL0"])
EquitasBankParser = bank_parser_class("EquitasBankParser", "equitas_bank", "Equitas Small Finance Bank", [r"equitas", r"ESFB0"])
KarurVysyaBankParser = bank_parser_class("KarurVysyaBankParser", "karur_vysya_bank", "Karur Vysya Bank", [r"karur\s+vysya", r"KVBL0"])
