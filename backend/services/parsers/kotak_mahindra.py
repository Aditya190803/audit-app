import re
from typing import List, Dict, Any
from backend.services.parsers.base import BaseParser


class KotakMahindraParser(BaseParser):
    name = "kotak_mahindra"
    display_name = "Kotak Mahindra Bank"

    HEADER_PATTERNS = [
        r"date", r"narration", r"chq\.?\s*/?\s*ref",
        r"value\s*dt", r"withdrawal", r"deposit",
        r"closing\s*balance",
    ]

    COLUMN_KEYWORDS = {
        "date": [r"date"],
        "narration": [r"narration"],
        "cheque": [r"chq\.?\s*/?\s*ref\.?\s*no\.?"],
        "value_date": [r"value\s*dt", r"value\s*date"],
        "withdrawal": [r"withdrawal"],
        "deposit": [r"deposit"],
        "balance": [r"closing\s*balance", r"balance"],
    }

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(
                    1 for p in self.HEADER_PATTERNS if re.search(p, row_text)
                )
                if match_count >= 5:
                    return 0.85
        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}")
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
                required = ["date", "narration", "withdrawal", "deposit", "balance"]
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
                if not row:
                    continue
                txns = self._extract_transactions(row, col_indices, date_pattern)
                for tx in txns:
                    tx["page_number"] = table["page_number"]
                    transactions.append(tx)

        return transactions

    def _parse_column_values(self, row: List[str], col_idx: int) -> List[str]:
        cell = self._safe_cell(row, col_idx)
        vals = str(cell or "").split("\n")
        return [v.strip() for v in vals if v.strip()]

    def _extract_transactions(self, row: List[str], col_indices: Dict[str, int],
                              date_pattern: Any) -> List[Dict[str, Any]]:
        dates_raw = self._parse_column_values(row, col_indices["date"])
        balances_raw = self._parse_column_values(row, col_indices["balance"])

        dates = [d for d in dates_raw if date_pattern.search(d)]
        balances = []
        for b in balances_raw:
            amt = self._parse_amount_cell(b)
            if amt is not None:
                balances.append(amt)

        withdrawals_raw = self._parse_column_values(row, col_indices["withdrawal"])
        deposits_raw = self._parse_column_values(row, col_indices["deposit"])

        withdrawals = []
        for w in withdrawals_raw:
            amt = self._parse_amount_cell(w)
            if amt is not None:
                withdrawals.append(amt)

        deposits = []
        for d in deposits_raw:
            amt = self._parse_amount_cell(d)
            if amt is not None:
                deposits.append(amt)

        narration_cell = self._safe_cell(row, col_indices["narration"])
        narrations_raw = str(narration_cell or "").split("\n")

        n = min(len(dates), len(balances))
        if n == 0:
            return []

        narrations = []
        for i in range(n):
            if i < len(narrations_raw) and narrations_raw[i].strip():
                narrations.append(narrations_raw[i].strip())
            else:
                narrations.append("")

        types = [None] * n
        for i in range(1, n):
            types[i] = "deposit" if balances[i] >= balances[i - 1] else "withdrawal"

        wd_in_tx1_n = sum(1 for t in types[1:] if t == "withdrawal")
        dp_in_tx1_n = sum(1 for t in types[1:] if t == "deposit")

        if wd_in_tx1_n < len(withdrawals):
            types[0] = "withdrawal"
        elif dp_in_tx1_n < len(deposits):
            types[0] = "deposit"
        elif n >= 2 and balances[0] is not None and balances[1] is not None:
            # Infer from balance change
            types[0] = "deposit" if balances[1] >= balances[0] else "withdrawal"
        elif n == 1:
            if len(withdrawals) == 1 and len(deposits) != 1:
                types[0] = "withdrawal"
            elif len(deposits) == 1 and len(withdrawals) != 1:
                types[0] = "deposit"
            elif len(withdrawals) >= 1:
                types[0] = "withdrawal"
            elif len(deposits) >= 1:
                types[0] = "deposit"
        # Fallback: infer from narration keywords
        if types[0] is None and n >= 1 and narrations:
            desc = narrations[0].upper() if narrations[0] else ""
            debit_markers = ["UPI-DR", "/DR/", " WDL ", "WITHDRAWAL", "BY DEBIT", "DEBIT"]
            credit_markers = ["/CR/", " DEP ", "DEPOSIT", "BY TRANSFER", "CREDIT"]
            if any(m in desc for m in debit_markers):
                types[0] = "withdrawal"
            elif any(m in desc for m in credit_markers):
                types[0] = "deposit"

        wd_i = 0
        dp_i = 0
        amount_for_index = [None] * n

        for i in range(n):
            if types[i] == "withdrawal" and wd_i < len(withdrawals):
                amount_for_index[i] = -withdrawals[wd_i]
                wd_i += 1
            elif types[i] == "deposit" and dp_i < len(deposits):
                amount_for_index[i] = deposits[dp_i]
                dp_i += 1

        transactions = []
        for i in range(n):
            if amount_for_index[i] is None:
                continue
            date_str = dates[i]
            if not date_pattern.search(date_str):
                continue
            narration = narrations[i] if i < len(narrations) else ""
            if not narration:
                narration = ""

            # Clean Kotak-style dash-separated narrations: UPI-NAME-BANK-IFSC-REF-UPI
            clean_narration = self._clean_kotak_narration(narration)

            transactions.append({
                "date": date_str,
                "amount": round(amount_for_index[i], 2),
                "description": narration,
                "party_name": self._extract_party_from_description(clean_narration) or self._extract_party_from_description(narration) or narration,
                "raw_text": f"{date_str} | {narration}",
            })

        return transactions

    @classmethod
    def _clean_kotak_narration(cls, narration: str) -> str:
        if not narration:
            return ""
        m = re.match(r'^UPI-(.+)', narration, re.IGNORECASE)
        if m:
            rest = m.group(1)
            parts = rest.split("-")
            if len(parts) >= 3:
                return "UPI/" + "/".join(parts)
        return narration
