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
        description = " ".join(remarks_cell.replace("\n", " ").split()) if remarks_cell else ""

        amount = self._amount_from_debit_credit(
            row[col_indices["withdrawal"]] if "withdrawal" in col_indices else None,
            row[col_indices["deposit"]] if "deposit" in col_indices else None,
        )

        if amount is None:
            return None

        party = self._extract_union_party(description) or self._extract_party_from_description(description)

        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": party or description,
            "raw_text": date_cell,
        }

    @classmethod
    def _extract_union_party(cls, description: str) -> str:
        if not description:
            return ""
        desc = " ".join(description.replace("\n", " ").split())

        # UPIAB/UPIAR patterns: UPIAB/id/CR/DR/NAME/BANK/handle
        m = re.search(r'\bUPI(?:AB|AR)\s*/\s*\d+\s*/\s*(?:DR|CR)\s*/\s*([^/]+)', desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        # IMPSAB/IMPSAR patterns: IMPSAB/id/PARTY/BANK
        m = re.search(r'\bIMPS(?:AB|AR)\s*/\s*\d+\s*/\s*([^/]+)', desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        # NEFTO-PARTY format (Union Bank NEFT)
        m = re.search(r'\bNEFT\s*O[-/]\s*([A-Za-z][A-Za-z0-9 .&]+?)(?:\s*[/-]|\s*$)', desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        # Interest payment pattern: account:Int.Pd:...
        if re.search(r'\bInt\.Pd\b', desc, re.IGNORECASE):
            return "Interest Credit"

        return ""
