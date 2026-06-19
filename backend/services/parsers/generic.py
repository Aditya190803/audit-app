import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class GenericParser(BaseParser):
    name = "generic"
    display_name = "Auto-Detect (Generic)"

    HEADER_PATTERNS = [
        r"date", r"withdrawal", r"deposit", r"debit", r"credit",
        r"balance", r"description", r"narration", r"particulars",
        r"transaction", r"remarks", r"cheque", r"chq", r"ref", r"utr",
        r"dr\s*/\s*cr", r"cr\s*/\s*dr", r"type", r"paid\s*(?:in|out)",
    ]

    COLUMN_KEYWORDS = {
        "withdrawal": [r"withdrawal", r"debit", r"withdraw", r"paid\s*out", r"dr\b"],
        "deposit": [r"deposit", r"credit", r"paid\s*in", r"cr\b"],
        "balance": [r"balance", r"closing\s*balance", r"available\s*balance"],
        "date": [r"transaction\s*date", r"value\s*date", r"txn\s*date", r"tran\s*date", r"posting\s*date", r"date"],
        "description": [r"transaction\s*remarks", r"transaction\s*details", r"particulars", r"narration",
                        r"description", r"remarks", r"details", r"transaction"],
        "cheque": [r"cheque", r"chq", r"ref\s*no", r"reference", r"utr", r"instrument"],
        "amount": [r"transaction\s*amount", r"amount"],
        "type": [r"dr\s*/\s*cr", r"cr\s*/\s*dr", r"debit\s*/\s*credit", r"type"],
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
            amount_pattern = re.compile(r"^\(?-?[\d,]+\.\d{1,2}\)?$")

            for table in tables:
                txns = self._parse_table(table, date_pattern, amount_pattern, value_date_pattern)
                if not txns:
                    txns = self._parse_amount_type_table(table, date_pattern)
                if not txns:
                    txns = self._parse_balance_delta_table(table, date_pattern, amount_pattern, value_date_pattern)
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
                tx_or_list = self._extract_row_indexed(row, col_indices, date_pattern)
            else:
                tx_or_list = self._parse_table_row(row, amount_pattern, date_pattern, value_date_pattern)

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
        date_cell = self._safe_cell(row, col_indices.get("date")) if "date" in col_indices else None
        wd_idx = col_indices.get("withdrawal")
        dp_idx = col_indices.get("deposit")
        wd_cell = self._safe_cell(row, wd_idx) if wd_idx is not None else None
        dp_cell = self._safe_cell(row, dp_idx) if dp_idx is not None else None
        desc_idx = col_indices.get("description")
        desc_cell = self._safe_cell(row, desc_idx) if desc_idx is not None else None

        has_multiline = any(c and "\n" in str(c) for c in [date_cell, wd_cell, dp_cell, desc_cell])

        if not has_multiline:
            # fast path for normal rows
            date = str(date_cell).strip() if date_cell and date_pattern.search(str(date_cell)) else None
            amount = self._amount_from_debit_credit(wd_cell, dp_cell)
            description = None
            if desc_cell:
                d = " ".join(str(desc_cell).replace("\n", " ").split())
                if d: description = d
            elif col_indices.get("cheque") is not None:
                d = " ".join(str(self._safe_cell(row, col_indices["cheque"]) or "").replace("\n", " ").split())
                if d: description = d
            if date and amount is not None:
                return {
                    "date": date,
                    "amount": amount,
                    "description": description or "",
                    "party_name": self._extract_party_from_description(description) or description or "",
                    "raw_text": " | ".join(str(c or "") for c in row),
                }
            return None

        # Multi-line crammed row support (generic for any bank using this layout)
        def split_lines(c):
            if not c: return [""]
            return [ln.strip() for ln in str(c).split("\n") if ln.strip()]

        date_lines = split_lines(date_cell)
        wd_lines = split_lines(wd_cell)
        dp_lines = split_lines(dp_cell)
        desc_lines = split_lines(desc_cell) if desc_cell else [""] * max(len(date_lines), 1)

        n = len(date_lines) if date_lines else max(len(wd_lines), len(dp_lines), 1)
        txs = []
        for i in range(n):
            d_line = date_lines[i] if i < len(date_lines) else (date_lines[-1] if date_lines else "")
            w_line = wd_lines[i] if i < len(wd_lines) else ""
            p_line = dp_lines[i] if i < len(dp_lines) else ""
            desc_line = desc_lines[i] if i < len(desc_lines) else (desc_lines[-1] if desc_lines else "")
            amt = self._amount_from_debit_credit(None, p_line) if p_line else self._amount_from_debit_credit(w_line or None, None)
            if amt is None:
                amt = self._amount_from_debit_credit(w_line or None, p_line or None)
            if d_line and amt is not None and date_pattern.search(d_line):
                clean_desc = " ".join(desc_line.replace("\n", " ").split())
                txs.append({
                    "date": d_line,
                    "amount": amt,
                    "description": clean_desc,
                    "party_name": self._extract_party_from_description(clean_desc) or clean_desc,
                    "raw_text": "multi-line-generic-split",
                })
        return txs if txs else None

    def _parse_table_row(self, row, amount_pattern, date_pattern, value_date_pattern):
        date = None
        amount = None
        description = None
        full_date_pattern = re.compile(
            r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|"
            r"\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4}"
        )

        for cell in row:
            if not cell:
                continue
            cell_str = str(cell).strip()
            if not cell_str:
                continue

            cleaned_amount = cell_str.replace(" ", "")
            is_likely_date = bool(full_date_pattern.search(cleaned_amount)) and (
                "-" in cleaned_amount or "/" in cleaned_amount or cleaned_amount.count(".") >= 2
            )

            if date is None and date_pattern.search(cell_str):
                date = cell_str
            elif amount is None and amount_pattern.match(cleaned_amount) and not is_likely_date:
                amount = self._parse_amount_cell(cell_str)
            elif description is None and len(cell_str) > 3 and not value_date_pattern.match(cell_str):
                description = " ".join(cell_str.replace("\n", " ").split())

        if date and amount is not None:
            return {
                "date": date,
                "amount": amount,
                "description": description or "",
                "party_name": self._extract_party_from_description(description) or description or "",
                "raw_text": " | ".join(str(c or "") for c in row),
            }
        return None

    def _parse_amount_type_table(self, table, date_pattern):
        data = table["data"]
        if not data:
            return []
        header_idx = self._find_header_row(data, self.HEADER_PATTERNS)
        col_indices = self._detect_column_indices(data[header_idx], self.COLUMN_KEYWORDS)
        if not {"date", "description", "amount"}.issubset(col_indices):
            return []
        transactions = []
        for row in data[header_idx + 1:]:
            date = self._date_from_cell(self._safe_cell(row, col_indices["date"]), date_pattern)
            amount = self._parse_amount_cell(self._safe_cell(row, col_indices["amount"]))
            if not date or amount is None:
                continue
            desc = self._clean_text(self._safe_cell(row, col_indices["description"]))
            type_text = self._clean_text(self._safe_cell(row, col_indices.get("type", -1))).upper()
            marker_source = f"{type_text} {desc}"
            if re.search(r"\b(?:DR|DEBIT|WITHDRAWAL|WDL|PAID OUT)\b", marker_source):
                amount = -abs(amount)
            elif re.search(r"\b(?:CR|CREDIT|DEPOSIT|PAID IN)\b", marker_source):
                amount = abs(amount)
            else:
                amount = self._infer_signed_amount(amount, desc)
            transactions.append({
                "date": date,
                "amount": amount,
                "description": desc,
                "party_name": self._extract_party_from_description(desc) or desc,
                "raw_text": " | ".join(str(c or "") for c in row),
                "page_number": table["page_number"],
            })
        return transactions

    def _parse_balance_delta_table(self, table, date_pattern, amount_pattern, value_date_pattern):
        data = table["data"]
        if not data:
            return []
        parsed = []
        header_idx = self._find_header_row(data, self.HEADER_PATTERNS)
        col_indices = self._detect_column_indices(data[header_idx], self.COLUMN_KEYWORDS)
        for row in data[header_idx + 1:]:
            tx = self._parse_table_row(row, amount_pattern, date_pattern, value_date_pattern)
            if not tx:
                continue
            if "amount" in col_indices:
                indexed_amount = self._parse_amount_cell(self._safe_cell(row, col_indices["amount"]))
                if indexed_amount is not None:
                    tx["amount"] = indexed_amount
            balance = self._parse_amount_cell(self._safe_cell(row, col_indices.get("balance", -1))) if "balance" in col_indices else None
            if balance is None:
                for cell in reversed(row):
                    val = self._parse_amount_cell(cell)
                    if val is not None and abs(val) != abs(tx["amount"]):
                        balance = abs(val)
                        break
            tx["_balance"] = abs(balance) if balance is not None else None
            tx["page_number"] = table["page_number"]
            parsed.append(tx)
        for i in range(1, len(parsed)):
            prev = parsed[i - 1].get("_balance")
            cur = parsed[i].get("_balance")
            if prev is not None and cur is not None:
                delta = round(cur - prev, 2)
                if abs(abs(delta) - abs(parsed[i]["amount"])) < 0.02:
                    parsed[i]["amount"] = delta
        for tx in parsed:
            tx.pop("_balance", None)
        return parsed

    def _parse_from_text(self, pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+"
        )
        amount_pattern = re.compile(r"\s+(\(?-?[\d,]+\.\d{1,2}\)?)$")
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

                amount_str = amount_match.group(1)
                desc = rest[: amount_match.start()].strip()

                # Clean common bank prefixes
                desc = re.sub(r'^(?:WDL|DEP)\s*TFR\s*', '', desc, flags=re.IGNORECASE).strip()
                desc = re.sub(r'^(?:BY|TO)\s+TRANSFER\s*[-.]?\s*', '', desc, flags=re.IGNORECASE).strip()

                if value_date_pattern.match(desc):
                    desc = ""

                desc = " ".join(desc.split())

                try:
                    amount = self._parse_amount_cell(amount_str)
                    if amount is None:
                        continue
                    amount = self._infer_signed_amount(amount, desc)
                    transactions.append({
                        "date": date_str,
                        "amount": amount,
                        "description": desc if desc else date_str,
                        "party_name": self._extract_party_from_description(desc) or (desc if desc else date_str),
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
        amount_pattern = re.compile(r"(\(?-?[\d,]+\.\d{1,2}\)?)$")
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

                amount_str = amount_match.group(1)
                desc = rest[: amount_match.start()].strip()

                # Clean common bank prefixes
                desc = re.sub(r'^(?:WDL|DEP)\s*TFR\s*', '', desc, flags=re.IGNORECASE).strip()
                desc = re.sub(r'^(?:BY|TO)\s+TRANSFER\s*[-.]?\s*', '', desc, flags=re.IGNORECASE).strip()

                if value_date_pattern.match(desc):
                    desc = ""

                try:
                    amount = self._parse_amount_cell(amount_str)
                    if amount is None:
                        continue
                    amount = self._infer_signed_amount(amount, desc)
                    transactions.append({
                        "date": date_str,
                        "amount": amount,
                        "description": desc,
                        "party_name": self._extract_party_from_description(desc) or desc,
                        "raw_text": line,
                        "page_number": page["page_number"],
                    })
                except ValueError:
                    continue

        return transactions