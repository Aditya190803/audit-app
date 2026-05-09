import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class GenericParser(BaseParser):
    name = "generic"
    display_name = "Auto-Detect (Generic)"

    HEADER_PATTERNS = [
        r"date", r"withdrawal", r"deposit", r"debit", r"credit",
        r"balance", r"description", r"narration", r"particulars",
        r"transaction", r"remarks", r"cheque", r"chq",
    ]

    COLUMN_KEYWORDS = {
        "withdrawal": [r"withdrawal", r"debit", r"withdraw"],
        "deposit": [r"deposit", r"credit"],
        "balance": [r"balance"],
        "date": [r"transaction\s*date", r"value\s*date", r"txn\s*date", r"date"],
        "description": [r"transaction\s*remarks", r"particulars", r"narration",
                        r"description", r"remarks", r"transaction"],
        "cheque": [r"cheque", r"chq", r"ref\s*no"],
    }

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        return 0.1

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []

        if tables:
            date_pattern = re.compile(
                r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|"
                r"\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4}"
            )
            value_date_pattern = re.compile(
                r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{1,2}\.\d{1,2}\.\d{2,4}$|"
                r"^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$"
            )
            amount_pattern = re.compile(r"[\d,]+\.\d{2}")

            for table in tables:
                txns = self._parse_table(table, date_pattern, amount_pattern, value_date_pattern)
                transactions.extend(txns)

        if not transactions:
            transactions = self._parse_from_text(pages)

        if not transactions:
            transactions = self._parse_line_by_line(pages)

        return transactions

    def _parse_table(self, table, date_pattern, amount_pattern, value_date_pattern):
        data = table["data"]
        if not data:
            return []

        transactions = []
        header_idx = self._find_header_row(data, self.HEADER_PATTERNS)
        header_row = data[header_idx]
        col_indices = self._detect_column_indices(header_row, self.COLUMN_KEYWORDS)
        has_amount_cols = "withdrawal" in col_indices or "deposit" in col_indices

        for row in data[header_idx + 1:]:
            if not row or len(row) < 3:
                continue

            if has_amount_cols:
                tx = self._extract_row_indexed(row, col_indices, date_pattern)
            else:
                tx = self._parse_table_row(row, amount_pattern, date_pattern, value_date_pattern)

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

        wd_idx = col_indices.get("withdrawal")
        dp_idx = col_indices.get("deposit")
        wd_amount = self._parse_amount_cell(self._safe_cell(row, wd_idx)) if wd_idx is not None else None
        dp_amount = self._parse_amount_cell(self._safe_cell(row, dp_idx)) if dp_idx is not None else None

        if wd_amount is not None and wd_amount != 0:
            amount = wd_amount
        elif dp_amount is not None and dp_amount != 0:
            amount = dp_amount
        elif wd_amount is not None:
            amount = wd_amount
        elif dp_amount is not None:
            amount = dp_amount
        else:
            amount = None

        desc_idx = col_indices.get("description")
        if desc_idx is not None:
            desc = str(self._safe_cell(row, desc_idx) or "").strip()
            if desc:
                description = desc

        chq_idx = col_indices.get("cheque")
        if not description and chq_idx is not None:
            desc = str(self._safe_cell(row, chq_idx) or "").strip()
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

    def _parse_table_row(self, row, amount_pattern, date_pattern, value_date_pattern):
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
                # Skip if it looks like a date (multiple dots/slashes)
                dot_count = cell_str.count('.')
                slash_count = cell_str.count('/')
                if dot_count > 1 or slash_count > 0:
                    continue
                try:
                    amt_str = cell_str.replace(",", "").replace("$", "").replace(" ", "")
                    negative = amt_str.startswith('(') and amt_str.endswith(')')
                    amt_str = amt_str.replace("(", "").replace(")", "")
                    amount = float(amt_str)
                    if negative:
                        amount = -amount
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

    def _parse_from_text(self, pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+"
        )
        amount_pattern = re.compile(r"\s+([\d,]+\.\d{2})$")
        value_date_pattern = re.compile(
            r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{1,2}\.\d{1,2}\.\d{2,4}$|^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$"
        )

        for page in pages:
            for line in page["text"].split("\n"):
                line = line.strip()
                if not line:
                    continue

                date_match = re.match(date_pattern, line)
                if not date_match:
                    continue

                date_str = date_match.group(1)
                rest = line[date_match.end():]
                amount_match = re.search(amount_pattern, rest)
                if not amount_match:
                    continue

                amount_str = amount_match.group(1).replace(",", "")
                desc = rest[: amount_match.start()].strip()

                if value_date_pattern.match(desc):
                    desc = ""

                desc = " ".join(desc.split())

                try:
                    amount = float(amount_str)
                    transactions.append({
                        "date": date_str,
                        "amount": amount,
                        "description": desc if desc else date_str,
                        "party_name": desc if desc else date_str,
                        "raw_text": line,
                        "page_number": page["page_number"],
                    })
                except ValueError:
                    continue

        return transactions

    def _parse_line_by_line(self, pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4})"
        )
        amount_pattern = re.compile(r"([\d,]+\.\d{2})$")
        value_date_pattern = re.compile(
            r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$|^\d{1,2}\.\d{1,2}\.\d{2,4}$|^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$"
        )

        for page in pages:
            for line in page["text"].split("\n"):
                line = line.strip()
                if not line:
                    continue

                date_match = re.match(date_pattern, line)
                if not date_match:
                    continue

                date_str = date_match.group(1)
                rest = line[date_match.end():].strip()
                amount_match = re.search(amount_pattern, rest)
                if not amount_match:
                    continue

                amount_str = amount_match.group(1).replace(",", "")
                desc = rest[: amount_match.start()].strip()

                if value_date_pattern.match(desc):
                    desc = ""

                try:
                    amount = float(amount_str)
                    transactions.append({
                        "date": date_str,
                        "amount": amount,
                        "description": desc,
                        "party_name": desc,
                        "raw_text": line,
                        "page_number": page["page_number"],
                    })
                except ValueError:
                    continue

        return transactions
