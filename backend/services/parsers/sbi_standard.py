import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class SBIStandardParser(BaseParser):
    name = "sbi_standard"
    display_name = "State Bank of India (Standard)"

    HEADER_PATTERNS = [
        r"txn\s*date", r"value\s*date", r"description", r"narration",
        r"ref\s*no", r"ref\.?", r"cheque", r"chq", r"debit", r"credit", r"balance",
        r"date", r"withdrawal", r"deposit", r"valuedt",
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
                if match_count >= 4:  # lowered threshold for SBI "Date / ValueDt / Narration / Withdrawal / Deposit" style
                    if re.search(r"value\s*dt|valuedt", row_text) or re.search(r"withdrawalamt|depositamt", row_text):
                        score = max(score, 0.92)
                    elif re.search(r"txn\s*date", row_text) and re.search(r"value\s*date", row_text):
                        score = max(score, 0.95)
                    else:
                        score = max(score, 0.85)
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
                tx_or_list = self._extract_row_indexed(row, col_indices, date_pattern)
            else:
                tx_or_list = self._extract_row_naive(row, date_pattern, amount_pattern, value_date_pattern)

            if tx_or_list:
                if isinstance(tx_or_list, list):
                    for t in tx_or_list:
                        t["page_number"] = table["page_number"]
                        transactions.append(t)
                else:
                    tx_or_list["page_number"] = table["page_number"]
                    transactions.append(tx_or_list)

        return transactions

    def _extract_row_indexed(self, row, col_indices, date_pattern):
        # Collect raw cells
        date_cell = self._safe_cell(row, col_indices.get("date")) if "date" in col_indices else None
        dr_idx = col_indices.get("debit")
        cr_idx = col_indices.get("credit")
        wd_cell = self._safe_cell(row, dr_idx) if dr_idx is not None else None
        dp_cell = self._safe_cell(row, cr_idx) if cr_idx is not None else None
        desc_idx = col_indices.get("description")
        desc_cell = self._safe_cell(row, desc_idx) if desc_idx is not None else None
        ref_idx = col_indices.get("ref")
        ref_cell = self._safe_cell(row, ref_idx) if ref_idx is not None else None

        # Check if any key cell has multiple lines (SBI interest/compact statements cram txns in one row)
        has_multiline = any(
            c and "\n" in str(c) for c in [date_cell, wd_cell, dp_cell, desc_cell]
        ) or (desc_cell and str(desc_cell).count("\n") >= 2)  # aggressive trigger on long narration cells
        if not has_multiline:
            # original single-txn path
            date = None
            if date_cell and date_pattern.search(str(date_cell)):
                date = str(date_cell).strip()
            amount = self._amount_from_debit_credit(wd_cell, dp_cell)
            description = None
            if desc_cell:
                d = " ".join(str(desc_cell).replace("\n", " ").split())
                if d:
                    description = d
            elif ref_cell:
                d = " ".join(str(ref_cell).replace("\n", " ").split())
                if d:
                    description = d
            if date and amount is not None:
                party = self._extract_sbi_party(description)
                return [{
                    "date": date,
                    "amount": amount,
                    "description": description or "",
                    "party_name": party or self._extract_party_from_description(description) or description or "",
                    "raw_text": " | ".join(str(c or "") for c in row),
                }]
            return None

        # Multi-line: split and zip to create multiple transactions
        def split_lines(c):
            if not c:
                return [""]
            return [ln.strip() for ln in str(c).split("\n") if ln.strip()]

        date_lines = split_lines(date_cell)
        wd_lines = split_lines(wd_cell)
        dp_lines = split_lines(dp_cell)
        desc_lines = split_lines(desc_cell) if desc_cell else [""] * max(len(date_lines), 1)
        ref_lines = split_lines(ref_cell) if ref_cell else [""] * max(len(date_lines), 1)

        n = len(date_lines) if date_lines else max(len(wd_lines), len(dp_lines), 1)
        transactions = []
        for i in range(n):
            d_line = date_lines[i] if i < len(date_lines) else date_lines[-1] if date_lines else ""
            w_line = wd_lines[i] if i < len(wd_lines) else ""
            p_line = dp_lines[i] if i < len(dp_lines) else ""
            desc_line = desc_lines[i] if i < len(desc_lines) else (desc_lines[-1] if desc_lines else "")
            if not desc_line and i < len(ref_lines):
                desc_line = ref_lines[i]
            # Prefer credit (deposit) amounts, common for interest credits
            amt = self._amount_from_debit_credit(None, p_line) if p_line else None
            if amt is None:
                amt = self._amount_from_debit_credit(w_line or None, None)
            if amt is None:
                amt = self._amount_from_debit_credit(w_line or None, p_line or None)
            if d_line and amt is not None and date_pattern.search(d_line):
                clean_desc = " ".join(desc_line.replace("\n", " ").split())
                party = self._extract_sbi_party(clean_desc)
                tx = {
                    "date": d_line,
                    "amount": amt,
                    "description": clean_desc,
                    "party_name": party or self._extract_party_from_description(clean_desc) or clean_desc,
                    "raw_text": "multi-line-row-split",
                }
                transactions.append(tx)
        return transactions if transactions else None

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
