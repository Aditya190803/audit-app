import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class ICICINumberedParser(BaseParser):
    name = "icici_numbered"
    display_name = "ICICI Bank (Numbered)"

    HEADER_PATTERNS = [
        r"s\s*no\.?", r"transaction\s*date", r"cheque\s*number",
        r"transaction\s*remarks", r"withdrawal", r"deposit", r"balance",
    ]

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(
                    1 for p in self.HEADER_PATTERNS if re.search(p, row_text)
                )
                if match_count >= 5:
                    return 0.9
        for page in pages:
            text = page["text"]
            if re.search(r"S\s*No\.", text) and re.search(r"\d{2}\.\d{2}\.\d{4}", text):
                lines = text.split("\n")
                txn_count = sum(1 for l in lines if re.match(r"\d+\s+\d{2}\.\d{2}\.\d{4}", l.strip()))
                txn_count_fitz = 0
                for i, l in enumerate(lines[:-1]):
                    if re.match(r"^\d+$", l.strip()) and re.match(r"\d{2}\.\d{2}\.\d{4}", lines[i + 1].strip()):
                        txn_count_fitz += 1
                if txn_count >= 3 or txn_count_fitz >= 3:
                    return 0.5
        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        date_pattern = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})$")
        amount_pattern = re.compile(r"^[\d,]+\.\d{2}$")
        sno_pattern = re.compile(r"^\d+$")

        for page in pages:
            text = page["text"]
            lines = text.split("\n")
            txs = self._parse_page(lines, date_pattern, amount_pattern, sno_pattern)
            for tx in txs:
                tx["page_number"] = page["page_number"]
                transactions.append(tx)

        return transactions

    def _parse_page(self, lines: List[str], date_pattern: Any,
                    amount_pattern: Any, sno_pattern: Any) -> List[Dict[str, Any]]:
        transactions = []
        n = len(lines)
        i = 0

        while i < n:
            line = lines[i].strip()
            if not line:
                i += 1
                continue

            if not sno_pattern.match(line):
                i += 1
                continue

            if i + 1 >= n:
                break

            date_str = lines[i + 1].strip()
            if not date_pattern.match(date_str):
                i += 1
                continue

            i += 2

            desc_lines = []
            amount = None

            while i < n:
                cline = lines[i].strip()
                if not cline:
                    i += 1
                    continue

                if amount_pattern.match(cline):
                    amount = self._parse_amount(cline)
                    i += 1
                    break
                elif sno_pattern.match(cline) and i + 1 < n and date_pattern.match(lines[i + 1].strip()):
                    break
                elif self._is_header_or_footer(cline):
                    i += 1
                    continue
                else:
                    desc_lines.append(cline)
                    i += 1

            if amount is None:
                continue

            balance = None
            while i < n:
                cline = lines[i].strip()
                if not cline:
                    i += 1
                    continue
                if amount_pattern.match(cline):
                    balance = self._parse_amount(cline)
                    i += 1
                    break
                elif sno_pattern.match(cline) and i + 1 < n and date_pattern.match(lines[i + 1].strip()):
                    break
                elif self._is_header_or_footer(cline):
                    i += 1
                    continue
                else:
                    desc_lines.append(cline)
                    i += 1

            description = " ".join(desc_lines) if desc_lines else ""

            transactions.append({
                "date": date_str,
                "amount": amount,
                "description": description,
                "party_name": self._extract_party_from_description(description) or description,
                "raw_text": f"{date_str} | {description}",
                "_balance": balance,
            })

        return self._apply_balance_signs(transactions)

    def _apply_balance_signs(self, transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        prev_balance = None
        for tx in transactions:
            amount = tx.get("amount")
            balance = tx.pop("_balance", None)
            if amount is None:
                continue

            signed = None
            if prev_balance is not None and balance is not None:
                delta = round(balance - prev_balance, 2)
                if abs(delta - amount) <= 0.02:
                    signed = abs(amount)
                elif abs(delta + amount) <= 0.02:
                    signed = -abs(amount)

            tx["amount"] = signed if signed is not None else self._infer_signed_amount(amount, tx.get("description"))

            if balance is not None:
                prev_balance = balance
        return transactions

    @staticmethod
    def _is_header_or_footer(line: str) -> bool:
        """Check if a line is a header/footer marker, not a transaction description."""
        cline = line.lower().strip()
        if len(cline) < 5:
            return False
        header_patterns = ["s no.", "s no", "transaction date", "cheque number",
                           "withdrawal", "deposit", "balance",
                           "dial your bank", "never share", "www.", "please call",
                           "page ", "statement of account", "icici bank",
                           "customer care", "toll free", "note:", "important:"]
        for kw in header_patterns:
            if cline.startswith(kw) or cline == kw:
                return True
        return bool(re.match(r'^\d+\s*$', cline.strip()))

    @staticmethod
    def _parse_amount(text: str) -> Optional[float]:
        cleaned = text.replace(",", "").strip()
        try:
            return float(cleaned)
        except ValueError:
            return None
