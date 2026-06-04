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

    # Matches standalone DD-MM-YYYY or DD/MM/YYYY on a line by itself
    DATE_LINE_PATTERN = re.compile(r"^\d{1,2}[-/]\d{1,2}[-/]\d{4}$", re.MULTILINE)

    DATE_PATTERN = re.compile(
        r"\d{1,2}-\d{1,2}-\d{4}|\d{1,2}/\d{1,2}/\d{4}|"
        r"\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2,4}",
        re.IGNORECASE,
    )

    # A line that is purely a decimal amount (with optional commas), e.g. "90.00" or "1,750.00"
    AMOUNT_LINE_PATTERN = re.compile(r"^[\d,]+\.\d{1,2}$")

    # Lines that are page/column headers — skip during description collection
    SKIP_LINE_PATTERN = re.compile(
        r"^(?:Date|Particulars|Deposits|Withdrawals|Balance|Opening Balance|page\s+\d+)$",
        re.IGNORECASE,
    )

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        if not self._has_bank_identity(tables, pages):
            return 0.0

        # Check table-based format (older statement PDFs with real table rows)
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                if sum(1 for p in self.HEADER_PATTERNS if re.search(p, row_text)) >= 5:
                    return 0.94

        # Check text-based e-Passbook format:
        # Pages have the column headers as individual lines, followed by date+amount lines
        for page in pages:
            text = page.get("text", "")
            has_header = bool(re.search(r"Particulars", text))
            date_lines = self.DATE_LINE_PATTERN.findall(text)
            if has_header and len(date_lines) >= 2:
                return 0.92

        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        # Try table-based parsing first (classic statement PDF format)
        transactions = self._parse_from_tables(tables)
        if transactions:
            return transactions

        # Fall back to text-based parsing (e-Passbook PDF format)
        return self._parse_from_pages(pages)

    # ------------------------------------------------------------------
    # Table-based parsing (classic statement format)
    # ------------------------------------------------------------------

    def _parse_from_tables(self, tables: List[Dict]) -> List[Dict[str, Any]]:
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
                tx = self._extract_table_row(row, col_indices)
                if tx:
                    tx["page_number"] = table["page_number"]
                    transactions.append(tx)

        return transactions

    def _extract_row(self, row: List[str], col_indices: Dict[str, int]) -> Optional[Dict[str, Any]]:
        """Backward-compatible wrapper for older tests/callers."""
        return self._extract_table_row(row, col_indices)

    def _extract_table_row(self, row: List[str], col_indices: Dict[str, int]) -> Optional[Dict[str, Any]]:
        date = self._date_from_cell(self._safe_cell(row, col_indices["date"]), self.DATE_PATTERN)
        if not date:
            return None
        description = self._clean_canara_description(self._safe_cell(row, col_indices["description"]))
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

    # ------------------------------------------------------------------
    # Text-based parsing (e-Passbook format)
    #
    # Structure per transaction (all lines trimmed):
    #   DD-MM-YYYY           ← standalone date
    #   <desc line 1>
    #   <desc line 2>
    #   ...
    #   Chq: <ref>           ← optional
    #   <amount.xx>          ← transaction amount (no sign)
    #   <balance.xx>         ← running balance (consumed & discarded)
    #
    # Sign is inferred from /DR/ vs /CR/ in description.
    # ------------------------------------------------------------------

    def _parse_from_pages(self, pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []

        for page in pages:
            page_number = page.get("page_number", 1)
            raw_lines = page.get("text", "").split("\n")
            lines = [ln.strip() for ln in raw_lines]

            i = 0
            n = len(lines)

            while i < n:
                line = lines[i]

                # Only start a block on a standalone date line
                if not self.DATE_LINE_PATTERN.match(line):
                    i += 1
                    continue

                date_str = line
                i += 1

                # ------ collect description lines ------
                desc_parts: List[str] = []
                chq_ref = ""

                while i < n:
                    ln = lines[i]

                    # Reached the transaction amount line (and next is balance)
                    if self.AMOUNT_LINE_PATTERN.match(ln):
                        # `ln` is the transaction amount
                        amount_str = ln
                        i += 1
                        # skip the balance line if it is also an amount
                        if i < n and self.AMOUNT_LINE_PATTERN.match(lines[i]):
                            i += 1
                        break

                    # Next transaction starts — stop without consuming amount
                    if self.DATE_LINE_PATTERN.match(ln):
                        amount_str = None
                        break

                    # Skip header / footer lines
                    if self.SKIP_LINE_PATTERN.match(ln):
                        i += 1
                        continue

                    # Capture cheque / reference line
                    if ln.lower().startswith("chq:"):
                        chq_ref = ln[4:].strip()
                        i += 1
                        continue

                    # Regular description fragment
                    if ln:
                        desc_parts.append(ln)
                    i += 1
                else:
                    # Reached end of lines without finding amount
                    amount_str = None

                if not amount_str:
                    continue

                description = self._join_desc_lines(desc_parts)
                if not description:
                    continue

                try:
                    raw_amount = float(amount_str.replace(",", ""))
                except ValueError:
                    continue

                amount = self._infer_signed_amount(raw_amount, description)
                party = self._extract_party_canara(description) or self._extract_party_from_description(description)

                transactions.append({
                    "date": date_str,
                    "amount": amount,
                    "description": description,
                    "party_name": party or description,
                    "raw_text": date_str + " | " + description + (f" | Chq:{chq_ref}" if chq_ref else ""),
                    "page_number": page_number,
                })

        return transactions

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _join_desc_lines(self, parts: List[str]) -> str:
        """
        Canara e-Passbook wraps long UPI strings across lines at arbitrary
        character positions.  Tokens that end or begin with '/' are direct
        continuations of the same slash-delimited field; everything else gets
        a space separator.
        """
        if not parts:
            return ""
        result = parts[0]
        for part in parts[1:]:
            if result.endswith("/") or part.startswith("/"):
                result = result + part
            else:
                result = result + " " + part
        return result.lstrip()

    @staticmethod
    def _clean_canara_description(text: Optional[str]) -> str:
        """Remove only leading whitespace before the narration; preserve internal spacing."""
        if not text:
            return ""
        return str(text).replace("\n", " ").lstrip()

    @classmethod
    def _extract_party_canara(cls, description: str) -> str:
        desc = cls._clean_text(description)
        # UPI/CR/<ref>/<PARTY>/... or UPI/DR/<ref>/<PARTY>/...
        m = re.search(r"\bUPI/(?:DR|CR)/\d+/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)
        # NEFT CR-<ref>-<bank>-<PARTY>  (spaces around dashes tolerated due to line-joining)
        m = re.search(
            r"\bNEFT\s+CR[-/]\S+\s*-\s*\S+\s*-\s*(.+?)(?:\s*-\s*\S|\s*$)",
            desc, re.IGNORECASE,
        )
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
