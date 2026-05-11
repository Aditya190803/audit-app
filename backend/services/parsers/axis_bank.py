import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class AxisBankParser(BaseParser):
    name = "axis_bank"
    display_name = "Axis Bank"

    HEADER_PATTERNS = [
        r"tran\s*date", r"chq\s*no", r"particulars",
        r"debit", r"credit", r"balance",
    ]

    COLUMN_KEYWORDS = {
        "date": [r"tran\s*date", r"date"],
        "cheque": [r"chq\s*no"],
        "description": [r"particulars", r"narration", r"remarks"],
        "debit": [r"debit", r"withdrawal"],
        "credit": [r"credit", r"deposit"],
        "balance": [r"balance", r"init\.\s*br"],
    }

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(
                    1 for p in self.HEADER_PATTERNS if re.search(p, row_text)
                )
                if match_count >= 4:
                    if re.search(r"particulars", row_text) and re.search(r"tran\s*date", row_text):
                        return 0.92
                    if re.search(r"particulars", row_text):
                        return 0.85
                    return 0.7
        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(r"\d{1,2}-\d{1,2}-\d{4}")
        col_indices = None

        for table in tables:
            data = table["data"]
            if not data:
                continue

            header_idx = self._find_header_row(data, self.HEADER_PATTERNS)
            row_text = " ".join(str(c or "") for c in data[header_idx]).lower()
            header_matches = sum(1 for kw in self.HEADER_PATTERNS if re.search(kw, row_text))

            if header_matches >= 3:
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

        amount = self._amount_from_debit_credit(
            row[col_indices["debit"]] if "debit" in col_indices else None,
            row[col_indices["credit"]] if "credit" in col_indices else None,
        )
        if amount is None:
            return None

        if abs(amount) < 0.01:
            opening = description.upper().strip()
            if "OPENING BALANCE" in opening or "CLOSING BALANCE" in opening:
                return None

        party = self._extract_party_axis(description) or self._extract_party_from_description(description)

        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": party or description,
            "raw_text": " | ".join(str(c or "") for c in row),
        }

    @classmethod
    def _extract_party_axis(cls, description: str) -> str:
        if not description:
            return ""
        desc = " ".join(description.replace("\n", " ").split())

        if desc.upper().startswith("SB:"):
            return "Interest Credit"

        m = re.search(r"\bUPI/P2[AM]/\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            words = candidate.split()
            filtered = [w for w in words if not re.match(r"^(UPI|P2A|P2M|NA)$", w, re.IGNORECASE)]
            if filtered:
                candidate = " ".join(filtered)
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bIMPS/P2A/\d+/\d+/([^/]+)/", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bIMPS/P2[AM]/\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bNEFT[/-][A-Z]{4}\d+/([^/-]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"BRN-PYMT-CARD-(\d+)", desc, re.IGNORECASE)
        if m:
            return f"Card Payment"

        if "BY TRANSFER" in desc.upper() or "TO TRANSFER" in desc.upper():
            m = re.search(r"(?:BY|TO)\s+TRANSFER[-.\s]*(.+?)(?:\s*$|\s*-)", desc, re.IGNORECASE)
            if m:
                return cls._clean_party_candidate(m.group(1))

        return ""