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
        description = " ".join(desc_cell.replace("\n", " ").split()) if desc_cell else ""

        # Strip WDL TFR / DEP TFR prefixes from description for cleaner party extraction
        clean_desc = re.sub(r'^(?:WDL|DEP)\s*TFR\s*', '', description, flags=re.IGNORECASE).strip()

        wd_raw = str(row[4] or "").strip()
        dp_raw = str(row[5] or "").strip()

        amount = self._amount_from_debit_credit(wd_raw, dp_raw)

        if amount is None:
            return None

        # "-" in withdrawal means it's a credit (already handled), skip zero rows
        if wd_raw.strip() == "-" and dp_raw.strip() == "-":
            return None

        party = self._extract_party_from_description(clean_desc) or self._extract_party_from_description(description)

        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": party or description,
            "raw_text": date_cell,
        }
