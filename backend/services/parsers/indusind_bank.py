import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class IndusIndBankParser(BaseParser):
    name = "indusind_bank"
    display_name = "IndusInd Bank"

    HEADER_PATTERNS = [
        r"date", r"particulars|narration", r"chq|ref",
        r"withdrawl|withdrawal", r"deposit", r"balance",
    ]

    COLUMN_KEYWORDS = {
        "date": [r"date"],
        "description": [r"particulars", r"narration", r"description"],
        "reference": [r"chq", r"ref"],
        "debit": [r"withdrawl", r"withdrawal", r"debit"],
        "credit": [r"deposit", r"credit"],
        "balance": [r"balance"],
    }

    BANK_ID_PATTERN = re.compile(r"indusind\s+bank|\bindb0", re.IGNORECASE)
    DATE_PATTERN = re.compile(
        r"\d{4}-\d{2}-\d{2}|\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}",
        re.IGNORECASE,
    )
    _ISO_DATE_LINE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    _TEXT_DATE_LINE = re.compile(
        r"^\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4}$",
        re.IGNORECASE,
    )
    _AMOUNT_LINE = re.compile(r"^[\d,]+(?:\.\d{1,2})?$")
    _INLINE_TXN = re.compile(
        r"^(\d{4}-\d{2}-\d{2}|\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{4})\s+"
        r"(.+?)\s+-\s+([\d,.]+)\s+([\d,.]+)$",
        re.IGNORECASE,
    )
    _HEADER_TOKENS = frozenset({
        "date", "particulars", "chq no/ref no", "withdrawal", "deposit", "balance",
        "chq", "no/ref", "no",
    })
    _REF_FRAGMENT = re.compile(r"^[A-Z0-9]{2,6}/")

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        if not self._has_bank_identity(tables, pages):
            return 0.0
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                if sum(1 for p in self.HEADER_PATTERNS if re.search(p, row_text)) >= 5:
                    return 0.94
        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        col_indices = None
        carry_desc: List[str] = []

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
                tx = self._extract_row(row, col_indices)
                if tx:
                    tx["page_number"] = table["page_number"]
                    transactions.append(tx)
                else:
                    merged = self._safe_cell(row, col_indices["date"]) or self._safe_cell(row, 0)
                    if merged and "\n" in str(merged):
                        carry_desc = self._parse_columnar_lines(
                            str(merged).split("\n"),
                            table["page_number"],
                            transactions,
                            carry_desc,
                        )

        if not transactions:
            carry_desc: List[str] = []
            for table in tables:
                for row in table.get("data", []):
                    for cell in row:
                        if not cell or "\n" not in str(cell):
                            continue
                        cell_text = str(cell)
                        if not self.DATE_PATTERN.search(cell_text):
                            continue
                        carry_desc = self._parse_columnar_lines(
                            cell_text.split("\n"),
                            table["page_number"],
                            transactions,
                            carry_desc,
                        )

        if not transactions:
            carry_desc = []
            for page in pages:
                lines = page.get("text", "").split("\n")
                started = False
                parse_lines = []
                for idx, line in enumerate(lines):
                    if not started:
                        if line.strip().lower() == "balance" and any(
                            lines[j].strip().lower() in {"deposit", "withdrawal"}
                            for j in range(max(0, idx - 3), idx)
                        ):
                            started = True
                        continue
                    parse_lines.append(line)
                if parse_lines:
                    carry_desc = self._parse_columnar_lines(
                        parse_lines,
                        page.get("page_number", 1),
                        transactions,
                        carry_desc,
                    )

        return transactions

    def _extract_row(self, row: List[str], col_indices: Dict[str, int]) -> Optional[Dict[str, Any]]:
        date = self._date_from_cell(self._safe_cell(row, col_indices["date"]), self.DATE_PATTERN)
        if not date:
            return None
        description = self._clean_text(self._safe_cell(row, col_indices["description"]))
        if not description:
            return None
        amount = self._amount_from_debit_credit(
            self._safe_cell(row, col_indices.get("debit", -1)),
            self._safe_cell(row, col_indices.get("credit", -1)),
        )
        if amount is None:
            return None
        party = self._extract_party_indusind(description) or self._extract_party_from_description(description)
        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": party or description,
            "raw_text": " | ".join(str(c or "") for c in row),
        }

    def _parse_columnar_lines(
        self,
        lines: List[str],
        page_number: int,
        transactions: List[Dict[str, Any]],
        carry_desc: Optional[List[str]] = None,
    ) -> List[str]:
        pending_desc: List[str] = list(carry_desc or [])
        current: Optional[Dict[str, Any]] = None
        awaiting_continuation = False

        for raw_line in lines:
            line = raw_line.strip()
            if not line or line.lower() in self._HEADER_TOKENS:
                continue

            if self._INLINE_TXN.search(line):
                pending_desc = self._flush_pending_to_previous(transactions, pending_desc)

            inline = self._parse_inline_line(line, page_number)
            if inline:
                pending_desc = []
                if current:
                    tx = self._finalize_columnar_txn(current, page_number)
                    if tx:
                        transactions.append(tx)
                    current = None
                transactions.append(inline)
                awaiting_continuation = True
                continue

            if self._is_date_line(line):
                awaiting_continuation = False
                pending_desc = self._flush_pending_to_previous(transactions, pending_desc)
                if current:
                    tx = self._finalize_columnar_txn(current, page_number)
                    if tx:
                        transactions.append(tx)
                current = {
                    "date": line,
                    "desc_parts": list(pending_desc),
                    "amounts": [],
                    "amounts_complete": False,
                }
                pending_desc = []
                continue

            if awaiting_continuation and transactions:
                self._append_to_transaction_description(transactions[-1], [line])
                continue

            if current is None:
                pending_desc.append(line)
                continue

            if current.get("amounts_complete"):
                pending_desc.append(line)
                continue

            if line == "-":
                current["amounts"].append(None)
            elif self._AMOUNT_LINE.match(line):
                amount = self._parse_amount_cell(line)
                if amount is not None:
                    current["amounts"].append(amount)
                    if len(current["amounts"]) >= 3:
                        current["amounts_complete"] = True
            else:
                current["desc_parts"].append(line)

        if current:
            tx = self._finalize_columnar_txn(current, page_number)
            if tx:
                transactions.append(tx)
                awaiting_continuation = True

        return pending_desc

    def _parse_inline_line(
        self,
        line: str,
        page_number: int,
    ) -> Optional[Dict[str, Any]]:
        match = self._INLINE_TXN.search(line)
        if not match:
            return None
        date, description, amount_str, _balance = match.groups()
        description = self._join_desc_parts([description])
        amount = self._parse_amount_cell(amount_str)
        if amount is None:
            return None
        signed = self._infer_signed_amount_for_indusind(amount, description)
        party = self._extract_party_indusind(description) or self._extract_party_from_description(description)
        return {
            "date": date,
            "amount": signed,
            "description": description,
            "party_name": party or description,
            "raw_text": line,
            "page_number": page_number,
        }

    def _finalize_columnar_txn(
        self,
        current: Dict[str, Any],
        page_number: int,
    ) -> Optional[Dict[str, Any]]:
        date = current.get("date")
        description = self._join_desc_parts(current.get("desc_parts", []))
        amounts = current.get("amounts", [])
        if not date or not description or len(amounts) < 2:
            return None

        balance = amounts[-1]
        if not isinstance(balance, (int, float)):
            return None

        body = amounts[:-1]
        if len(body) == 1 and body[0] is None:
            return None

        if len(body) >= 2 and body[0] is None:
            middle = body[1]
            if not isinstance(middle, (int, float)):
                return None
            signed = (
                -abs(middle)
                if self._looks_like_debit(description)
                else abs(middle)
            )
        elif len(body) == 1 and isinstance(body[0], (int, float)):
            signed = self._infer_signed_amount_for_indusind(body[0], description)
        else:
            wd_cell = None if (not body or body[0] is None) else str(body[0])
            dep_cell = None
            if len(body) > 1 and body[1] is not None:
                dep_cell = str(body[1])
            signed = self._amount_from_debit_credit(wd_cell, dep_cell)
            if signed is None:
                return None

        party = self._extract_party_indusind(description) or self._extract_party_from_description(description)
        return {
            "date": date,
            "amount": signed,
            "description": description,
            "party_name": party or description,
            "raw_text": f"{date} | {description} | {amounts}",
            "page_number": page_number,
        }

    @classmethod
    def _join_desc_parts(cls, parts: List[str]) -> str:
        result = ""
        for part in parts:
            text = str(part or "").strip()
            if not text:
                continue
            if not result:
                result = text
            elif text.startswith("/"):
                result += text
            elif result.endswith(("@", "/")):
                result += text
            elif cls._REF_FRAGMENT.match(text) and re.search(r"[A-Z0-9]$", result):
                result += text
            elif cls._is_split_word_fragment(result, text):
                result += text
            else:
                result += f" {text}"
        return cls._clean_text(result)

    @classmethod
    def _is_split_word_fragment(cls, left: str, right: str) -> bool:
        if not left or not right:
            return False
        if right.startswith("/"):
            return False
        if re.match(r"^[a-z]{1,4}(?:/|$)", right):
            return True
        return bool(re.search(r"[a-z]$", left) and re.match(r"^[a-z]", right))

    @classmethod
    def _flush_pending_to_previous(
        cls,
        transactions: List[Dict[str, Any]],
        pending_desc: List[str],
    ) -> List[str]:
        if pending_desc and transactions:
            cls._append_to_transaction_description_static(transactions[-1], pending_desc)
            return []
        return pending_desc

    def _append_to_transaction_description(
        self,
        transaction: Dict[str, Any],
        parts: List[str],
    ) -> None:
        self._append_to_transaction_description_static(transaction, parts)

    @classmethod
    def _append_to_transaction_description_static(
        cls,
        transaction: Dict[str, Any],
        parts: List[str],
    ) -> None:
        if not parts:
            return
        existing = transaction.get("description", "")
        merged_parts = [existing, *parts] if existing else parts
        description = cls._join_desc_parts(merged_parts)
        transaction["description"] = description
        transaction["raw_text"] = f"{transaction.get('raw_text', '')} | {' | '.join(parts)}"
        party = cls._extract_party_indusind(description) or cls._extract_party_from_description(description)
        transaction["party_name"] = party or description

    @classmethod
    def _is_date_line(cls, line: str) -> bool:
        return bool(cls._ISO_DATE_LINE.match(line) or cls._TEXT_DATE_LINE.match(line))

    @classmethod
    def _looks_like_debit(cls, description: str) -> bool:
        desc = cls._clean_text(description).upper()
        debit_markers = [
            "/DR", " UPI/DR", "NEFT DR", "RTGS DR", "IMPS DR", "ACH -", "ACH DEBIT",
            "LOAN RECOVERY", "CHARGES", "TO NON MAINTENANCE", "TO ECS RETURN",
            "REVERSED :", "N/HDFCH", "N/N0",
        ]
        if any(marker in desc for marker in debit_markers):
            return True
        if desc.startswith("N/") or desc.startswith("ACH"):
            return True
        return cls._infer_signed_amount(1.0, description) < 0

    @classmethod
    def _infer_signed_amount_for_indusind(cls, amount: float, description: str) -> float:
        if cls._looks_like_debit(description):
            return -abs(amount)
        return cls._infer_signed_amount(amount, description)

    @classmethod
    def _extract_party_indusind(cls, description: str) -> str:
        desc = cls._clean_text(description)
        m = re.search(r"\bUPI/\d+/(?:DR|CR)/([^/]+)", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                cleaned = cls._clean_party_candidate(candidate)
                if (
                    cleaned
                    and cleaned.upper() not in {"MR", "MS", "MRS"}
                    and not re.fullmatch(r"[A-Z]{3,5}", cleaned)
                ):
                    return cleaned

        upi_tail = re.search(r"\bUPI/\d+/(?:DR|CR)(.*)$", desc, re.IGNORECASE)
        if upi_tail:
            segments = [seg.strip() for seg in upi_tail.group(1).split("/") if seg.strip()]
            skip_tokens = {
                "UPI", "PAYM", "PAYV", "COLL", "OIDZ", "MAND", "AUTO", "XERO",
                "VERI", "PAYT", "REMARK", "ORDER", "MEDI", "GROC", "PETR", "THE",
                "LIFE", "PAYM",
            }
            candidates = []
            for segment in segments:
                if "@" in segment:
                    continue
                if re.fullmatch(r"[A-Z]{3,5}", segment):
                    continue
                if segment.upper() in skip_tokens:
                    continue
                cleaned = cls._clean_party_candidate(segment)
                if cleaned and len(cleaned) >= 2 and cleaned.upper() not in {"MR", "MS", "MRS"}:
                    candidates.append(cleaned)
            if candidates:
                return max(candidates, key=len)

        m = re.search(r"\bINB\s+IMPS/\d+/(?:DR|CR)/\s*([^/]+)", desc, re.IGNORECASE)
        if m:
            return cls._clean_party_candidate(m.group(1))

        if re.search(r"\bFT\s+FROM\s+INDUSIND\b", desc, re.IGNORECASE):
            account = re.search(r"\bACCOUNT/([A-Z0-9]+)", desc, re.IGNORECASE)
            if account:
                return f"FT FROM INDUSIND {account.group(1)}"
            return "FT FROM INDUSIND"

        return ""

    @classmethod
    def _has_bank_identity(cls, tables: List[Dict], pages: List[Dict]) -> bool:
        text_parts = [str(page.get("text", "")) for page in pages]
        for table in tables:
            for row in table.get("data", [])[:12]:
                text_parts.append(" ".join(str(c or "") for c in row))
        return bool(cls.BANK_ID_PATTERN.search(" ".join(text_parts)))
