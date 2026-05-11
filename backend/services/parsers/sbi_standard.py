import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class SBIStandardParser(BaseParser):
    name = "sbi_standard"
    display_name = "State Bank of India (Standard)"

    HEADER_PATTERNS = [
        r"txn\s*date", r"value\s*date", r"description",
        r"ref\s*no", r"cheque", r"debit", r"credit", r"balance",
    ]

    COLUMN_KEYWORDS = {
        "debit": [r"debit", r"withdrawal"],
        "credit": [r"credit", r"deposit"],
        "balance": [r"balance"],
        "date": [r"txn\s*date", r"value\s*date", r"date"],
        "description": [r"description", r"particulars", r"narration", r"transaction"],
        "ref": [r"ref\s*no", r"cheque", r"chq"],
    }

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        score = 0.0
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(
                    1 for p in self.HEADER_PATTERNS if re.search(p, row_text)
                )
                if match_count >= 5:
                    if re.search(r"txn\s*date", row_text) and re.search(r"value\s*date", row_text):
                        score = max(score, 0.95)
                    else:
                        score = max(score, 0.8)
        return score

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(
            r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{1,2}\.\d{1,2}\.\d{2,4}"
        )
        value_date_pattern = re.compile(
            r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{1,2}\.\d{1,2}\.\d{2,4}$|^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$"
        )
        amount_pattern = re.compile(r"^\(?-?[\d,]+\.\d{1,2}\)?$")

        for table in tables:
            txns = self._parse_table(table, date_pattern, amount_pattern, value_date_pattern)
            transactions.extend(txns)

        return transactions

    def _parse_table(self, table, date_pattern, amount_pattern, value_date_pattern):
        data = table["data"]
        if not data:
            return []

        transactions = []
        header_idx = self._find_header_row(data, self.HEADER_PATTERNS)
        header_row = data[header_idx]
        col_indices = self._detect_column_indices(header_row, self.COLUMN_KEYWORDS)
        has_amount_cols = "debit" in col_indices or "credit" in col_indices

        for row in data[header_idx + 1:]:
            if not row or len(row) < 3:
                continue

            if has_amount_cols:
                tx = self._extract_row_indexed(row, col_indices, date_pattern)
            else:
                tx = self._extract_row_naive(row, date_pattern, amount_pattern, value_date_pattern)

            if tx:
                tx["page_number"] = table["page_number"]
                transactions.append(tx)

        return transactions

    def _extract_row_indexed(self, row, col_indices, date_pattern):
        date = None
        amount = None
        description = None

        if "date" in col_indices:
            cell = self._safe_cell(row, col_indices["date"])
            if cell and date_pattern.search(str(cell)):
                date = str(cell)

        dr_idx = col_indices.get("debit")
        cr_idx = col_indices.get("credit")
        amount = self._amount_from_debit_credit(
            self._safe_cell(row, dr_idx) if dr_idx is not None else None,
            self._safe_cell(row, cr_idx) if cr_idx is not None else None,
        )

        desc_idx = col_indices.get("description")
        if desc_idx is not None:
            desc = str(self._safe_cell(row, desc_idx) or "").strip()
            desc = " ".join(desc.replace("\n", " ").split())
            if desc:
                description = desc

        ref_idx = col_indices.get("ref")
        if not description and ref_idx is not None:
            desc = str(self._safe_cell(row, ref_idx) or "").strip()
            if desc:
                description = desc

        if date and amount is not None:
            party = self._extract_sbi_party(description)
            return {
                "date": date,
                "amount": amount,
                "description": description or "",
                "party_name": party or self._extract_party_from_description(description) or description or "",
                "raw_text": " | ".join(str(c or "") for c in row),
            }
        return None

    @classmethod
    def _extract_sbi_party(cls, description: Optional[str]) -> str:
        if not description:
            return ""
        desc = " ".join(description.replace("\n", " ").split())

        # SBI prefixes: "BY TRANSFER-", "TO TRANSFER-", "by debit card-", "WDL TFR-", "DEP TFR-"
        m = re.match(r'^(?:BY|TO)\s+TRANSFER\s*[-.]?\s*', desc, re.IGNORECASE)
        if m:
            desc = desc[m.end():].strip()

        m = re.match(r'^by\s+debit\s+card\s*[-.]?\s*', desc, re.IGNORECASE)
        if m:
            desc = desc[m.end():].strip()

        m = re.match(r'^(?:WDL|DEP)\s*TFR\s*', desc, re.IGNORECASE)
        if m:
            desc = desc[m.end():].strip()

        return ""

    def _extract_row_naive(self, row, date_pattern, amount_pattern, value_date_pattern):
        date = None
        amount = None
        description = None

        for cell in row:
            if not cell:
                continue
            cell_str = str(cell).strip()
            if not cell_str:
                continue

            if date is None and date_pattern.search(cell_str):
                date = cell_str
            elif amount is None and amount_pattern.match(cell_str.replace(" ", "")):
                amount = self._parse_amount_cell(cell_str)
            elif description is None and len(cell_str) > 3 and not value_date_pattern.match(cell_str):
                description = " ".join(cell_str.replace("\n", " ").split())

        if date and amount is not None:
            party = self._extract_sbi_party(description)
            return {
                "date": date,
                "amount": amount,
                "description": description or "",
                "party_name": party or self._extract_party_from_description(description) or description or "",
                "raw_text": " | ".join(str(c or "") for c in row),
            }
        return None
