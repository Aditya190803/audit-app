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
        amount_pattern = re.compile(r"[\d,]+\.\d{2}")

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
            cell = str(row[col_indices["date"]] or "").strip()
            if date_pattern.search(cell):
                date = cell

        dr_amount = self._parse_amount_cell(row[col_indices["debit"]]) if "debit" in col_indices else None
        cr_amount = self._parse_amount_cell(row[col_indices["credit"]]) if "credit" in col_indices else None

        if dr_amount is not None and dr_amount != 0:
            amount = dr_amount
        elif cr_amount is not None and cr_amount != 0:
            amount = cr_amount
        elif dr_amount is not None:
            amount = dr_amount
        elif cr_amount is not None:
            amount = cr_amount
        else:
            amount = None

        if "description" in col_indices:
            desc = str(row[col_indices["description"]] or "").strip()
            if desc:
                description = desc

        if not description and "ref" in col_indices:
            desc = str(row[col_indices["ref"]] or "").strip()
            if desc:
                description = desc

        if date and amount is not None:
            return {
                "date": date,
                "amount": amount,
                "description": description or "",
                "party_name": description or "",
                "raw_text": " | ".join(str(c or "") for c in row),
            }
        return None

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
            elif amount is None and amount_pattern.search(cell_str):
                try:
                    amt = (
                        cell_str.replace(",", "")
                        .replace("(", "-")
                        .replace(")", "")
                    )
                    amount = float(amt)
                except ValueError:
                    pass
            elif description is None and len(cell_str) > 3 and not value_date_pattern.match(cell_str):
                description = cell_str

        if date and amount is not None:
            return {
                "date": date,
                "amount": amount,
                "description": description or "",
                "party_name": description or "",
                "raw_text": " | ".join(str(c or "") for c in row),
            }
        return None
