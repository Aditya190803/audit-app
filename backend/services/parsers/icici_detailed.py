import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class ICICIDetailedParser(BaseParser):
    name = "icici_detailed"
    display_name = "ICICI Bank (Detailed)"

    HEADER_PATTERNS = [
        r"transaction\s*date", r"value\s*date", r"chq\.?",
        r"withdrawal", r"deposit", r"balance", r"cheque",
        r"transaction\s*remarks",
    ]

    COLUMN_KEYWORDS = {
        "withdrawal": [r"withdrawal"],
        "deposit": [r"deposit"],
        "balance": [r"balance"],
        "date": [r"transaction\s*date", r"value\s*date", r"date"],
        "description": [r"transaction\s*remarks", r"particulars", r"narration", r"remarks"],
        "cheque": [r"cheque", r"chq"],
    }

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        score = 0.0
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(
                    1 for p in self.HEADER_PATTERNS if re.search(p, row_text)
                )
                if match_count >= 4:
                    if re.search(r"value\s*date", row_text):
                        score = max(score, 0.9)
                    elif re.search(r"transaction\s*date", row_text) or re.search(r"transaction\s*remarks", row_text):
                        score = max(score, 0.8)
        return score

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(
            r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\s+[A-Za-z]{3}\s+\d{4}"
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
        has_amount_cols = "withdrawal" in col_indices or "deposit" in col_indices

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

    @staticmethod
    def _clean_broken_word(text: str) -> str:
        """Fix word-wrap artifacts like 'a ngelonense@ici' → 'angelonense@ici'."""
        # Merge single-letter prefixes with following lowercase words
        text = re.sub(r'\b([a-zA-Z])\s+([a-z]+)', r'\1\2', text)
        # Merge broken numbers in identifiers (e.g. 'paytmqr28100 505' → 'paytmqr28100505')
        text = re.sub(r'(\d)\s+(\d)', r'\1\2', text)
        return text

# Common bank names used to avoid tagging the intermediary bank as the party
    BANK_KEYWORDS = ['ICICI', 'HDFC', 'SBI', 'Axis Bank', 'Yes Bank', 'Kotak',
                     'Bank of India', 'Bank of Baroda', 'Union Bank', 'IndusInd',
                     'IDFC', 'Federal Bank', 'State Bank', 'BOB', 'PNB',
                     'Karnataka Bank', 'Canara Bank', 'Bank of Maharashtra']

    # Patterns for recognisable bank-named segments (used to avoid extracting
    # segments that are purely bank identifiers rather than counterparties)
    _BANK_RE = re.compile(
        r'^(?:ICICI\s*Bank|HDFC\s*Bank|SBI|State\s*Bank|Axis\s*Bank|Yes\s*Bank|Kotak\s*Mahindra|Bank\s*of\s*(?:India|Baroda|Maharashtra)|Union\s*Bank|IndusInd\s*Bank|IDFC\s*First?\s*Bank|Federal\s*Bank|PNB|Karnataka\s*Bank|Canara\s*Bank)\b',
        re.IGNORECASE
    )

    def _is_bank_segment(self, text: str) -> bool:
        """Check if text IS a bank name (not merely contains one as substring)."""
        t = text.strip()
        if not t:
            return True
        # Exact-match known short names
        if t.upper() in ('SBI', 'PNB', 'BOB', 'ICICI', 'HDFC'):
            return True
        # Regex for longer bank-name patterns (must start with the bank name)
        return bool(self._BANK_RE.match(t))

    def _extract_party_name(self, description: str) -> str:
        """Extract actual recipient/party from ICICI detailed description formats."""
        if not description:
            return ""

        # Replace newlines with spaces so split patterns (e.g. "UPI\nPay") still match
        desc = description.replace('\n', ' ')
        desc = ' '.join(desc.split())  # collapse multiple spaces

        def clean(s: str) -> str:
            return self._clean_broken_word(s).strip()

        # Skip words that are not real counterparties
        def skip_generic(s: str) -> bool:
            return s.lower() in ('upi', 'upi pay', 'upi intent', 'charge', 'na', '-')

        # UPI patterns
        if desc.startswith('UPI/'):
            # UPI/P2A/id/PARTY NAME/UPI/BANK (person-to-account)
            m = re.search(r'P2[AM]\s*/\s*\d+\s*/\s*([^/]+)', desc, re.IGNORECASE)
            if m:
                candidate = m.group(1).strip()
                candidate = re.sub(r'\s*/?\s*UPI\s*$', '', candidate).strip()
                if candidate and not self._is_bank_segment(candidate) and not skip_generic(candidate):
                    return clean(candidate)

            # UPI/{id}/Paying([A-Z][a-zA-Z0-9]+)/{vpa}/{bank}/{ref}
            m = re.search(r'Paying([A-Z][a-zA-Z0-9]+)', desc)
            if m:
                return m.group(1).strip()

            # UPI/{id}/Payvia([A-Z][a-zA-Z0-9]+)/{party}/{bank}/{ref}
            m = re.search(r'Payvia([A-Z][a-zA-Z0-9]+)', desc)
            if m:
                return m.group(1).strip()

            # UPI/{vpa_or_name}/UPI/... or UPI/{vpa_or_name}/UPI Pay/...
            m = re.search(r'^UPI/([^/]+)/UPI(?:\s*Pay)?\s*/', desc)
            if m:
                candidate = m.group(1).strip()
                if not (candidate.isdigit() and len(candidate) >= 10) and not self._is_bank_segment(candidate) and not skip_generic(candidate):
                    return clean(candidate)

            # UPI/{id}/UPI Pay/{party}/{bank}/{ref}
            m = re.search(r'UPI\s*Pay\s*/\s*([^/]+)', desc)
            if m:
                candidate = clean(m.group(1))
                if not self._is_bank_segment(candidate):
                    return candidate

            # UPI/{id}/UPIIntent/{party}/{bank}/{ref}
            m = re.search(r'UPIIntent\s*/\s*([^/]+)', desc)
            if m:
                candidate = clean(m.group(1))
                if not self._is_bank_segment(candidate):
                    return candidate

            # UPI/{id}/UPI Mandate/{party}/{bank}/{ref}
            m = re.search(r'UPI\s*Mandate\s*/\s*([^/]+)', desc)
            if m:
                candidate = clean(m.group(1))
                if not self._is_bank_segment(candidate):
                    return candidate

            # UPI/{id}/MandateRequest/{party}/{bank}/{ref}
            m = re.search(r'Mandate(?:Request|Refund)?\s*/\s*([^/]+)', desc)
            if m:
                candidate = clean(m.group(1))
                if not self._is_bank_segment(candidate):
                    return candidate

            # UPI/{id}/charge/{vpa}/{bank}/{ref}
            m = re.search(r'UPI/[^/]+/charge/([^/]+)/', desc)
            if m:
                candidate = clean(m.group(1))
                if not self._is_bank_segment(candidate):
                    return candidate

            # UPI/{vpa}/Payment from Ph/... (captures merchant VPA)
            m = re.search(r'^UPI/([^/]+)/Payment from', desc)
            if m:
                candidate = clean(m.group(1))
                if candidate and not self._is_bank_segment(candidate) and not skip_generic(candidate):
                    return candidate

            # UPI/{vpa}/Pay via Razorpa/... (captures merchant VPA)
            m = re.search(r'^UPI/([^/]+)/Pay via', desc)
            if m:
                candidate = clean(m.group(1))
                if candidate and not self._is_bank_segment(candidate) and not skip_generic(candidate):
                    return candidate

            # Generic fallback: 2nd segment is often the VPA/merchant when not a txn id
            parts = desc.split('/')
            if len(parts) >= 2:
                candidate = parts[1].strip()
                if candidate and not (candidate.isdigit() and len(candidate) >= 10) and not self._is_bank_segment(candidate) and not skip_generic(candidate):
                    return clean(candidate)

            # Last resort: segment before bank name
            for i, part in enumerate(parts):
                if self._is_bank_segment(part) and i > 0:
                    candidate = parts[i - 1].strip()
                    if candidate and not self._is_bank_segment(candidate) and not skip_generic(candidate):
                        return clean(candidate)

        # BIL: BIL/{id}/{party}/{account} or BIL/ONL/{id}/{party}/{ref}
        if desc.startswith('BIL/'):
            parts = [p.strip() for p in desc.split('/') if p.strip()]
            for candidate in parts[1:]:
                cleaned = clean(candidate)
                if (
                    cleaned
                    and not re.fullmatch(r"\d{6,}|ONL|BIL", cleaned, re.IGNORECASE)
                    and not self._is_bank_segment(cleaned)
                ):
                    return cleaned

        # CMS: CMS/{ref}/{party}
        if desc.startswith('CMS/'):
            m = re.search(r'CMS/[^/]+/([^/]+)', desc)
            if m:
                return clean(m.group(1))

        # ACH: ACH/{party}/{account}/{ref}
        if desc.startswith('ACH/'):
            m = re.search(r'ACH/([^/]+)', desc)
            if m:
                return clean(m.group(1))

        # INF/INFT: INF/INFT/{ref}/{description}
        if desc.startswith('INF/INFT/'):
            m = re.search(r'INF/INFT/[^/]+/(.+?)(?:/|$)', desc)
            if m:
                return clean(m.group(1))

        # MMT/IMPS: MMT/IMPS/{txn_id}/{party}/{ifsc}
        if desc.startswith('MMT/IMPS/'):
            m = re.search(r'MMT/IMPS/[^/]+/([^/]+)', desc)
            if m:
                return clean(m.group(1))

        # NEFT-CITIN...-PARTY NAME... (ICICI NEFT format)
        m = re.search(r'NEFT-[A-Z]{4}\d+-([A-Za-z][A-Za-z0-9 .&]+?)(?:\s*-|\s*$)', desc)
        if m:
            candidate = clean(m.group(1))
            if candidate and not self._is_bank_segment(candidate):
                return candidate

        return self._extract_party_from_description(desc)

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
        amount = self._amount_from_debit_credit(
            self._safe_cell(row, wd_idx) if wd_idx is not None else None,
            self._safe_cell(row, dp_idx) if dp_idx is not None else None,
        )

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
            party = self._extract_party_name(description) or self._extract_party_from_description(description)
            return {
                "date": date,
                "amount": amount,
                "description": description or "",
                "party_name": party or description or "",
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
            elif amount is None and amount_pattern.match(cell_str.replace(" ", "")):
                amount = self._parse_amount_cell(cell_str)
            elif description is None and len(cell_str) > 3 and not value_date_pattern.match(cell_str):
                description = cell_str

        if date and amount is not None:
            party = self._extract_party_name(description) or self._extract_party_from_description(description)
            return {
                "date": date,
                "amount": amount,
                "description": description or "",
                "party_name": party or description or "",
                "raw_text": " | ".join(str(c or "") for c in row),
            }
        return None
