import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class YesBankParser(BaseParser):
    name = "yes_bank"
    display_name = "YES Bank"

    HEADER_PATTERNS = [
        r"transaction\s*date", r"value\s*date", r"description",
        r"withdrawals?", r"deposits?", r"balance",
    ]

    COLUMN_KEYWORDS = {
        "date": [r"transaction\s*date", r"date"],
        "value_date": [r"value\s*date"],
        "description": [r"description", r"narration", r"particulars", r"remarks"],
        "debit": [r"withdrawals?", r"debit"],
        "credit": [r"deposits?", r"credit"],
        "balance": [r"balance"],
    }

    BANK_ID_PATTERN = re.compile(r"\byes\s+bank\b|\byesb0", re.IGNORECASE)
    DATE_PATTERN = re.compile(r"\d{1,2}-\d{1,2}-\d{4}")

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        bank_identity = self._has_bank_identity(tables, pages)
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(1 for p in self.HEADER_PATTERNS if re.search(p, row_text))
                if match_count >= 5 and bank_identity:
                    return 0.95
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
                required = ["date", "description", "debit", "credit", "balance"]
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
        if not description or re.search(r"opening\s+balance|closing\s+balance", description, re.IGNORECASE):
            return None

        amount = self._amount_from_debit_credit(
            self._safe_cell(row, col_indices.get("debit", -1)),
            self._safe_cell(row, col_indices.get("credit", -1)),
        )
        if amount is None:
            return None

        party = self._extract_party_yes(description) or self._extract_party_from_description(description)
        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": party or description,
            "raw_text": " | ".join(str(c or "") for c in row),
        }

    @classmethod
    def _extract_party_yes(cls, description: str) -> str:
        desc = cls._clean_text(description)

        m = re.search(r"\bPCA:[^:]+:[^:]+:([^/]+)$", desc, re.IGNORECASE)
        if m:
            return cls._clean_party_candidate(m.group(1))

        m = re.search(r"\bUPI/\d+/(?:[^/]+/)?([^/]+)$", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bNEFT[-/][^-/:]+[-/:]\s*([A-Za-z][A-Za-z0-9 .&]+)", desc, re.IGNORECASE)
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
