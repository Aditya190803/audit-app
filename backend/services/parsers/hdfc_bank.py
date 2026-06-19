import re
from typing import List, Dict, Optional, Any
from backend.services.parsers.base import BaseParser


class HDFCBankParser(BaseParser):
    name = "hdfc_bank"
    display_name = "HDFC Bank"

    HEADER_PATTERNS = [
        r"date", r"narration", r"chq\.?/ref\.?\s*no",
        r"value\s*dt", r"withdrawal\s*amt", r"deposit\s*amt", r"closing\s*balance",
    ]

    SUMMARY_PATTERN = re.compile(
        r"opening\s*balance|closing\s*balance|statement\s+of\s+account|generated\s+on",
        re.IGNORECASE,
    )

    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        for table in tables:
            for row in table["data"]:
                row_text = " ".join(str(c or "") for c in row).lower()
                match_count = sum(1 for p in self.HEADER_PATTERNS if re.search(p, row_text))
                if match_count >= 5 and re.search(r"narration", row_text):
                    return 0.96

        for page in pages:
            text = page["text"].lower()
            if "hdfc bank" in text and "chq./ref.no" in text and "withdrawal amt" in text:
                return 0.75
        return 0.0

    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        transactions = []
        previous_balance = None

        for table in tables:
            rows = self._table_rows(table["data"])
            for row in rows:
                if not self._date_from_cell(row[0], re.compile(r"\d{1,2}/\d{1,2}/\d{2,4}")):
                    continuation = self._clean_text(row[1])
                    if continuation and transactions:
                        transactions[-1]["description"] = f"{transactions[-1]['description']} {continuation}"
                        transactions[-1]["party_name"] = (
                            self._extract_party_hdfc(transactions[-1]["description"])
                            or self._extract_party_from_description(transactions[-1]["description"])
                            or transactions[-1]["description"]
                        )
                    continue
                if self.SUMMARY_PATTERN.search(" ".join(str(c or "") for c in row)):
                    continue
                tx = self._extract_row(row, previous_balance)
                if tx:
                    previous_balance = tx["_balance"]
                    tx.pop("_balance", None)
                    tx["page_number"] = table["page_number"]
                    transactions.append(tx)

        return transactions

    def _table_rows(self, data: List[List[str]]) -> List[List[str]]:
        if not data:
            return []

        rows = data
        header = rows[0]
        row_text = " ".join(str(c or "") for c in header).lower()
        has_header = sum(1 for p in self.HEADER_PATTERNS if re.search(p, row_text)) >= 4
        data_rows = rows[1:] if has_header else rows

        parsed_rows = []
        for row in data_rows:
            if len(row) < 7:
                continue
            parsed_rows.extend(self._expand_packed_row(row))
        return parsed_rows

    def _expand_packed_row(self, row: List[str]) -> List[List[str]]:
        dates = self._split_lines(row[0])
        narrations = self._split_narrations(row[1], row[2])
        refs = self._split_lines(row[2])
        value_dates = self._split_lines(row[3])
        withdrawals = self._split_lines(row[4])
        deposits = self._split_lines(row[5])
        balances = self._split_lines(row[6])

        leading_continuations = []
        if narrations and not self._is_transaction_start(narrations[0]) and len(narrations) > len(refs):
            leading_continuations.append(narrations.pop(0))

        row_count = max(len(dates), len(refs), len(value_dates), len(balances), len(narrations))
        expanded = [["", continuation, "", "", "", "", ""] for continuation in leading_continuations]
        withdrawal_i = 0
        deposit_i = 0
        first_amount_type = self._infer_first_amount_type(balances, withdrawals, deposits)

        for i in range(row_count):
            balance = self._parse_amount_cell(balances[i]) if i < len(balances) else None
            prev_balance = self._parse_amount_cell(balances[i - 1]) if i > 0 and i - 1 < len(balances) else None

            withdrawal = ""
            deposit = ""
            if balance is not None and prev_balance is not None:
                delta = round(balance - prev_balance, 2)
                if delta < 0 and withdrawal_i < len(withdrawals):
                    withdrawal = withdrawals[withdrawal_i]
                    withdrawal_i += 1
                elif delta > 0 and deposit_i < len(deposits):
                    deposit = deposits[deposit_i]
                    deposit_i += 1
            elif i == 0:
                if first_amount_type == "withdrawal" and withdrawal_i < len(withdrawals):
                    withdrawal = withdrawals[withdrawal_i]
                    withdrawal_i += 1
                elif first_amount_type == "deposit" and deposit_i < len(deposits):
                    deposit = deposits[deposit_i]
                    deposit_i += 1

            expanded.append([
                dates[i] if i < len(dates) else "",
                narrations[i] if i < len(narrations) else "",
                refs[i] if i < len(refs) else "",
                value_dates[i] if i < len(value_dates) else "",
                withdrawal,
                deposit,
                balances[i] if i < len(balances) else "",
            ])

        return expanded

    def _infer_first_amount_type(self, balances: List[str], withdrawals: List[str], deposits: List[str]) -> Optional[str]:
        if not balances:
            return None

        expected_withdrawals = 0
        expected_deposits = 0
        parsed_balances = [self._parse_amount_cell(balance) for balance in balances]
        for i in range(1, len(parsed_balances)):
            if parsed_balances[i] is None or parsed_balances[i - 1] is None:
                continue
            delta = round(parsed_balances[i] - parsed_balances[i - 1], 2)
            if delta < 0:
                expected_withdrawals += 1
            elif delta > 0:
                expected_deposits += 1

        remaining_withdrawals = len(withdrawals) - expected_withdrawals
        remaining_deposits = len(deposits) - expected_deposits
        if remaining_withdrawals == 1 and remaining_deposits <= 0:
            return "withdrawal"
        if remaining_deposits == 1 and remaining_withdrawals <= 0:
            return "deposit"
        return None

    @staticmethod
    def _split_lines(cell: Optional[str]) -> List[str]:
        if not cell:
            return []
        return [line.strip() for line in str(cell).splitlines() if line and line.strip()]

    @staticmethod
    def _is_transaction_start(text: str) -> bool:
        if re.search(
            r"^(?:UPI-|NEFT\s*DR-|NEFTDR-|RTGS-|IMPS-|CASH\s*DEPOSIT|CASHDEPOSIT|"
            r"NEFT\s*CR-|NEFTCR-|INTERESTPAIDTILL|FDTHROUGHMOBILE-|IBFUNDSTRANSFERCR-|"
            r"GST/BANKREFERENCENO:|I/WCHQRETURN-|CHQRETURNCHGS|"
            r"POS\d+|OTHPOS\d+|IBBILLPAY|ACH|ATW-|ATM|CHQ\s+PAID)",
            text,
            re.IGNORECASE,
        ):
            return True

        compact = text.strip()
        if not re.match(r"^[A-Z][A-Z0-9 .&]*(?:LIMI|LTD|SECURITIES|BROKING|CAPITAL|WEALTH|MARKETS)-[A-Z0-9]", compact):
            return False

        prefix = compact.split("-", 1)[0]
        prefix_tokens = set(re.findall(r"[A-Z]+", prefix.upper()))
        bank_tokens = {"BANK", "HDFC", "HDFCBANK", "DFCBANK", "ICICI", "KICICI", "SBI", "AXIS", "KOTAK"}
        if prefix_tokens & bank_tokens:
            return False
        return True

    def _split_narrations(self, narration_cell: Optional[str], ref_cell: Optional[str]) -> List[str]:
        lines = self._split_lines(narration_cell)
        refs = self._split_lines(ref_cell)
        if not lines:
            return []
        if not refs:
            return [" ".join(lines)]

        narrations = []
        current = []
        ref_i = 0
        for line in lines:
            current.append(line)
            if ref_i < len(refs) and refs[ref_i].lstrip("0") and refs[ref_i].lstrip("0") in line.replace(" ", ""):
                narrations.append(" ".join(current))
                current = []
                ref_i += 1

        if current:
            narrations.append(" ".join(current))
        if len(narrations) == len(refs) and all(self._is_transaction_start(n) for n in narrations):
            return narrations

        narrations = []
        current = []
        for line in lines:
            if current and self._is_transaction_start(line):
                narrations.append(" ".join(current))
                current = [line]
            else:
                current.append(line)
        if current:
            narrations.append(" ".join(current))
        return narrations

    def _extract_row(self, row: List[str], previous_balance: Optional[float]) -> Optional[Dict[str, Any]]:
        date = str(row[0] or "").strip()
        if not re.search(r"\d{1,2}/\d{1,2}/\d{2,4}", date):
            return None

        description = " ".join(str(row[1] or "").replace("\n", " ").split())
        if not description:
            return None

        balance = self._parse_amount_cell(row[6])
        amount = self._amount_from_debit_credit(row[4], row[5])
        if amount is None and balance is not None and previous_balance is not None:
            amount = round(balance - previous_balance, 2)
        if amount is None:
            return None

        party = self._extract_party_hdfc(description) or self._extract_party_from_description(description)

        return {
            "date": date,
            "amount": amount,
            "description": description,
            "party_name": party or description,
            "raw_text": " | ".join(str(c or "") for c in row),
            "_balance": balance,
        }

    @classmethod
    def _extract_party_hdfc(cls, description: str) -> str:
        desc = cls._clean_text(description)
        if not desc:
            return ""

        m = re.search(r"\bUPI-([^-]+)-", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bNEFT\s*DR-[^-]+-([^-]+)-", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\b(?:RTGS|IMPS)\s+(?:DR|CR)-[^-]+-([^-]+)-", desc, re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if candidate and not cls._looks_like_bank_segment(candidate):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\bCASH\s*DEPOSIT(?:BY)?-", desc, re.IGNORECASE)
        if m:
            return "Cash Deposit"

        m = re.search(r"^([A-Z][A-Z0-9 .&]{2,})-[A-Z0-9]", desc)
        if m:
            candidate = m.group(1).strip()
            if (candidate
                    and not cls._looks_like_bank_segment(candidate)
                    and not cls._looks_like_transaction_prefix(candidate)):
                return cls._clean_party_candidate(candidate)

        m = re.search(r"\b(?:POS|OTHPOS)\d+\s*([A-Za-z][A-Za-z0-9 .&-]+)", desc, re.IGNORECASE)
        if m:
            return cls._clean_party_candidate(m.group(1))

        return ""
