import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class SBICompactParser(BaseParser):
    name = "sbi_compact"
    display_name = "State Bank of India (Compact)"

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        for table in tables:
            for row in table["data"]:
                if len(row) < 7:
                    continue
                row_text = " ".join(str(c or "") for c in row).lower()
                if re.search(r"balance", row_text):
                    empty_count = sum(1 for c in row[:-1] if not str(c or "").strip())
                    if empty_count >= 4:
                        return 0.85
        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(r"\d{2}/\d{2}/\d{4}")

        for table in tables:
            data = table["data"]
            if not data:
                continue

            header_row_idx = None
            for i, row in enumerate(data[:5]):
                if len(row) >= 7:
                    row_text = " ".join(str(c or "") for c in row).lower()
                    if re.search(r"balance", row_text):
                        empty_count = sum(1 for c in row[:-1] if not str(c or "").strip())
                        if empty_count >= 4:
                            header_row_idx = i
                            break

            if header_row_idx is None:
                continue

            for row in data[header_row_idx + 1:]:
                if not row or len(row) < 7:
                    continue
                if not str(row[0] or "").strip():
                    continue

                tx = self._extract_row(row, date_pattern)
                if tx:
                    tx["page_number"] = table["page_number"]
                    transactions.append(tx)

        return transactions

    def _extract_row(self, row: List[str], date_pattern: Any) -> Optional[Dict[str, Any]]:
        date_cell = str(row[0] or "").strip()
        date = date_cell.split("\n")[0].strip() if "\n" in date_cell else date_cell
        if not date or not date_pattern.search(date):
            return None

        desc_cell = str(row[2] or "").strip()
        description = " ".join(desc_cell.split()) if desc_cell else ""

        wd_raw = str(row[4] or "").strip()
        dp_raw = str(row[5] or "").strip()

        wd_amount = self._parse_amount_cell(wd_raw) if wd_raw and wd_raw != "-" else None
        dp_amount = self._parse_amount_cell(dp_raw) if dp_raw and dp_raw != "-" else None

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
