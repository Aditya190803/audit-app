import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class CanaraBankParser(BaseParser):
    name = "canara_bank"
    display_name = "Canara Bank"

    HEADER_PATTERNS = [
        r"\btrans\b|transaction", r"\bvalue\b", r"ref|chq",
        r"description", r"withdraws?|debit", r"deposit|credit", r"balance",
    ]

    COLUMN_KEYWORDS = {
        "date": [r"\btrans\b", r"transaction\s*date", r"date"],
        "value_date": [r"value"],
        "branch": [r"branch"],
        "reference": [r"ref", r"chq", r"cheque"],
        "description": [r"description", r"particulars", r"narration"],
        "debit": [r"withdraws?", r"withdrawal", r"debit"],
        "credit": [r"deposit", r"credit"],
        "balance": [r"balance"],
    }

    BANK_ID_PATTERN = re.compile(r"canara\s+bank|\bcnrb0", re.IGNORECASE)
    DATE_PATTERN = re.compile(
        r"\d{1,2}-\d{1,2}-\d{4}|\d{1,2}/\d{1,2}/\d{4}|"
        r"\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2,4}",
        re.IGNORECASE,
    )

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        if not self._has_bank_identity(tables, pages):
            return 0.0
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                if sum(1 for p in self.HEADER_PATTERNS if re.search(p, row_text)) >= 5:
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

            if sum(1 for kw in self.HEADER_PATTERNS if re.search(kw, row_text)) >= 4:
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
        if not description:
            return None
        amount = self._amount_from_debit_credit(
            self._safe_cell(row, col_indices.get("debit", -1)),
            self._safe_cell(row, col_indices.get("credit", -1)),
        )
        if amount is None:
            return None
        party = self._extract_party_canara(description) or self._extract_party_from_description(description)
        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": party or description,
            "raw_text": " | ".join(str(c or "") for c in row),
        }

    @classmethod
    def _extract_party_canara(cls, description: str) -> str:
        desc = cls._clean_text(description)
        m = re.search(r"\bUPI/(?:DR|CR)?/?\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)
        return ""

    @classmethod
    def _has_bank_identity(cls, tables: List[Dict], pages: List[Dict]) -> bool:
        text_parts = [str(page.get("text", "")) for page in pages]
        for table in tables:
            for row in table.get("data", [])[:12]:
                text_parts.append(" ".join(str(c or "") for c in row))
        return bool(cls.BANK_ID_PATTERN.search(" ".join(text_parts)))
