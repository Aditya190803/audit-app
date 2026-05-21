import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class PNBBankParser(BaseParser):
    name = "pnb_bank"
    display_name = "Punjab National Bank"

    HEADER_PATTERNS = [
        r"transaction\s*date", r"cheque\s*number", r"withdrawal",
        r"deposit", r"balance", r"narration",
    ]

    COLUMN_KEYWORDS = {
        "date": [r"transaction\s*date", r"date"],
        "cheque": [r"cheque\s*number", r"cheque", r"chq"],
        "debit": [r"withdrawal", r"debit"],
        "credit": [r"deposit", r"credit"],
        "balance": [r"balance"],
        "description": [r"narration", r"description", r"particulars", r"remarks"],
    }

    BANK_ID_PATTERN = re.compile(r"punjab\s+national\s+bank|\bpnb\b|\bpunb0", re.IGNORECASE)
    DATE_PATTERN = re.compile(r"\d{1,2}/\d{1,2}/\d{4}")

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        bank_identity = self._has_bank_identity(tables, pages)
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(1 for p in self.HEADER_PATTERNS if re.search(p, row_text))
                if match_count >= 4 and bank_identity:
                    return 0.94
        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        col_indices = None

        for table in tables:
            data = table["data"]
            if not data:
                continue

            header_idx = self._find_header_row(data, self.HEADER_PATTERNS)
            row_text = " ".join(str(c or "") for c in data[header_idx]).lower()
            header_matches = sum(1 for kw in self.HEADER_PATTERNS if re.search(kw, row_text))

            if header_matches >= 4:
                new_indices = self._detect_column_indices(data[header_idx], self.COLUMN_KEYWORDS)
                required = ["date", "debit", "credit", "balance", "description"]
                if all(k in new_indices for k in required):
                    col_indices = new_indices
                    data_rows = data[header_idx + 1:]
                else:
                    continue
            elif col_indices is not None:
                data_rows = data
            else:
                continue

            for row in data_rows:
                if not row or len(row) <= max(col_indices.values()):
                    continue
                tx = self._extract_row(row, col_indices)
                if tx:
                    tx["page_number"] = table["page_number"]
                    transactions.append(tx)

        return transactions

    def _extract_row(self, row: List[str], col_indices: Dict[str, int]) -> Optional[Dict[str, Any]]:
        date = self._date_from_cell(self._safe_cell(row, col_indices["date"]), self.DATE_PATTERN)
        if not date:
            return None

        description = self._clean_text(self._safe_cell(row, col_indices["description"]))
        if not description:
            return None

        amount = self._amount_from_debit_credit(
            self._safe_cell(row, col_indices.get("debit", -1)),
            self._safe_cell(row, col_indices.get("credit", -1)),
        )
        if amount is None:
            return None

        party = self._extract_party_pnb(description) or self._extract_party_from_description(description)
        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": party or description,
            "raw_text": " | ".join(str(c or "") for c in row),
        }

    @classmethod
    def _extract_party_pnb(cls, description: str) -> str:
        desc = cls._clean_text(description)
        if re.search(r"\bint\.?\s*pd\b", desc, re.IGNORECASE):
            return "Interest Credit"

        m = re.search(r"\bUPI/\d+/(?:P2[AMV])/(?:[^/]+/)?([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bNEFT(?:_IN)?[:\-/][^/\s]+(?:/\d+)?/\s*(.+)$", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        return ""

    @classmethod
    def _has_bank_identity(cls, tables: List[Dict], pages: List[Dict]) -> bool:
        text_parts = [str(page.get("text", "")) for page in pages]
        for table in tables:
            for row in table.get("data", [])[:10]:
                text_parts.append(" ".join(str(c or "") for c in row))
        return bool(cls.BANK_ID_PATTERN.search(" ".join(text_parts)))
