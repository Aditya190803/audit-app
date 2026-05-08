import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class UnionBankParser(BaseParser):
    name = "union_bank"
    display_name = "Union Bank of India"

    HEADER_PATTERNS = [
        r"date", r"remarks", r"tran\s*id", r"utr",
        r"instr", r"withdrawals", r"deposits", r"balance",
    ]

    COLUMN_KEYWORDS = {
        "date": [r"date"],
        "remarks": [r"remarks"],
        "withdrawal": [r"withdrawals", r"withdrawal"],
        "deposit": [r"deposits", r"deposit"],
        "balance": [r"balance"],
        "tran_id": [r"tran\s*id"],
        "utr": [r"utr"],
        "instr_id": [r"instr"],
    }

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(
                    1 for p in self.HEADER_PATTERNS if re.search(p, row_text)
                )
                if match_count >= 6:
                    return 0.9
        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(r"\d{2}-\d{2}-\d{4}")
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
                required = ["date", "remarks", "withdrawal", "deposit", "balance"]
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
        date = date_cell.split("\n")[0].strip() if date_cell else ""
        if not date or not date_pattern.search(date):
            return None

        remarks_cell = str(row[col_indices["remarks"]] or "").strip()
        description = " ".join(remarks_cell.split()) if remarks_cell else ""

        wd_amount = self._parse_amount_cell(row[col_indices["withdrawal"]]) if "withdrawal" in col_indices else None
        dp_amount = self._parse_amount_cell(row[col_indices["deposit"]]) if "deposit" in col_indices else None

        amount = None
        if wd_amount is not None and wd_amount != 0:
            amount = wd_amount
        elif dp_amount is not None and dp_amount != 0:
            amount = dp_amount
        elif wd_amount is not None:
            amount = wd_amount
        elif dp_amount is not None:
            amount = dp_amount

        if amount is None:
            return None

        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": description,
            "raw_text": date_cell,
        }
