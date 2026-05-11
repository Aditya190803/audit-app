import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class IDFCBankParser(BaseParser):
    name = "idfc_bank"
    display_name = "IDFC FIRST Bank"

    HEADER_PATTERNS = [
        r"transaction\s*date", r"value\s*date", r"particulars",
        r"cheque", r"debit", r"credit", r"balance",
    ]

    COLUMN_KEYWORDS = {
        "date": [r"transaction\s*date", r"value\s*date", r"date"],
        "value_date": [r"value\s*date"],
        "description": [r"particulars", r"narration", r"remarks"],
        "cheque": [r"cheque\s*no", r"cheque"],
        "debit": [r"debit", r"withdrawal"],
        "credit": [r"credit", r"deposit"],
        "balance": [r"balance"],
    }

    SUMMARY_PATTERN = re.compile(r"opening\s*balance|closing\s*balance|total\s*debit|total\s*credit", re.IGNORECASE)

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(
                    1 for p in self.HEADER_PATTERNS if re.search(p, row_text)
                )
                if match_count >= 5:
                    if re.search(r"particulars", row_text) and re.search(r"transaction\s*date", row_text):
                        return 0.95
                    if re.search(r"particulars", row_text):
                        return 0.85
                    return 0.7
        for page in pages:
            text = page["text"].lower()
            if re.search(r"idfc\s*first\s*bank", text) and re.search(r"particulars", text):
                return 0.6
        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(r"\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}", re.IGNORECASE)
        col_indices = None

        for table in tables:
            data = table["data"]
            if not data:
                continue

            header_idx = None
            new_indices = None
            data_rows = []

            for i, row in enumerate(data):
                row_text = " ".join(str(c or "") for c in row).lower()
                if self.SUMMARY_PATTERN.search(row_text):
                    continue

                match_count = sum(1 for p in self.HEADER_PATTERNS if re.search(p, row_text))
                if match_count >= 4:
                    candidate = self._detect_column_indices(row, self.COLUMN_KEYWORDS)
                    required = ["date", "description", "debit", "credit", "balance"]
                    if all(k in candidate for k in required):
                        header_idx = i
                        new_indices = candidate
                        continue

                if header_idx is not None:
                    data_rows.append(row)

            if new_indices is not None:
                col_indices = new_indices

            if col_indices is None:
                continue

            if not data_rows:
                for i, row in enumerate(data):
                    row_text = " ".join(str(c or "") for c in row).lower()
                    if self.SUMMARY_PATTERN.search(row_text):
                        continue
                    if i > 0:
                        data_rows.append(row)

            for row in data_rows:
                if not row or len(row) <= max(col_indices.values()):
                    continue
                tx = self._extract_row(row, col_indices, date_pattern)
                if tx:
                    tx["page_number"] = table["page_number"]
                    transactions.append(tx)

        return transactions

    def _extract_row(self, row: List[str], col_indices: Dict[str, int],
                     date_pattern: Any) -> Optional[Dict[str, Any]]:
        date_cell = str(row[col_indices["date"]] or "").strip()
        date = date_cell.split("\n")[0].strip() if "\n" in date_cell else date_cell
        if not date or not date_pattern.search(date):
            return None

        desc_cell = str(row[col_indices["description"]] or "").strip()
        description = " ".join(desc_cell.replace("\n", " ").split()) if desc_cell else ""

        if not description:
            return None

        upper_desc = description.upper().strip()
        if upper_desc == "OPENING BALANCE" or upper_desc == "CLOSING BALANCE":
            return None

        amount = self._amount_from_debit_credit(
            row[col_indices["debit"]] if "debit" in col_indices else None,
            row[col_indices["credit"]] if "credit" in col_indices else None,
        )
        if amount is None:
            return None

        party = self._extract_party_idfc(description) or self._extract_party_from_description(description)

        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": party or description,
            "raw_text": " | ".join(str(c or "") for c in row),
        }

    @classmethod
    def _extract_party_idfc(cls, description: str) -> str:
        if not description:
            return ""
        desc = " ".join(description.replace("\n", " ").split())

        m = re.search(r"\bUPI/MOB/\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate.upper() not in ("NA",):
                parts = candidate.split()
                filtered = [p for p in parts if not re.match(r"^(UPI|MOB|P2A|P2M|NA)$", p, re.IGNORECASE)]
                if filtered:
                    candidate = " ".join(filtered)
                return cls._clean_party_candidate(candidate) if candidate and not cls._looks_like_bank_segment(candidate) else ""

        m = re.search(r"\bNEFT/CMS\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            parts = candidate.split()
            filtered = []
            for p in parts:
                if re.match(r"^[A-Z]{4}0\d+$", p):
                    break
                filtered.append(p)
            candidate = " ".join(filtered).rstrip("/").strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bIMPS[-/]OPM/\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bIFT/\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bEcom/\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                candidate = candidate.rstrip("/").strip()
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bIMPS/\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        return ""