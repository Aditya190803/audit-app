import re
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any


class BaseParser(ABC):
    name: str = ""
    display_name: str = ""

    @abstractmethod
    def detect(self, tables: List[Dict], pages: List[Dict]) -> float:
        ...

    @abstractmethod
    def parse(self, tables: List[Dict], pages: List[Dict]) -> List[Dict[str, Any]]:
        ...

    @staticmethod
    def _find_header_row(data: List[List[str]], keywords: List[str]) -> int:
        for i, row in enumerate(data[:15]):
            row_text = " ".join(str(c or "") for c in row).lower()
            matches = sum(1 for kw in keywords if re.search(kw, row_text))
            if matches >= 2:
                return i
        return 0

    @staticmethod
    def _detect_column_indices(header_row: List[str], column_patterns: Dict[str, List[str]]) -> Dict[str, int]:
        indices = {}
        for i, cell in enumerate(header_row):
            cell_lower = str(cell or "").lower().strip()
            for col_type, patterns in column_patterns.items():
                if col_type not in indices:
                    for pattern in patterns:
                        if re.search(pattern, cell_lower):
                            indices[col_type] = i
                            break
        return indices

    @staticmethod
    def _safe_cell(row: list, idx: int) -> Optional[str]:
        if 0 <= idx < len(row):
            return row[idx]
        return None

    @staticmethod
    def _parse_amount_cell(cell: Optional[str]) -> Optional[float]:
        if not cell:
            return None
        cleaned = str(cell).strip().replace(",", "").replace("$", "").replace(" ", "")
        if cleaned in {"", "-", "--"}:
            return None
        # Handle parenthesized amounts: (1,000.00) -> -1000.00
        negative = cleaned.startswith('(') and cleaned.endswith(')')
        cleaned = cleaned.replace("(", "").replace(")", "")
        match = re.search(r"-?\d+(?:\.\d{1,2})?", cleaned)
        if not match:
            return None
        try:
            val = float(match.group())
            return -abs(val) if negative else val
        except ValueError:
            return None

    @classmethod
    def _amount_from_debit_credit(
        cls,
        debit_cell: Optional[str],
        credit_cell: Optional[str],
    ) -> Optional[float]:
        debit = cls._parse_amount_cell(debit_cell)
        credit = cls._parse_amount_cell(credit_cell)

        if debit is not None and debit != 0:
            return -abs(debit)
        if credit is not None and credit != 0:
            return abs(credit)
        if debit is not None:
            return -abs(debit)
        if credit is not None:
            return abs(credit)
        return None

    @staticmethod
    def _clean_text(text: Optional[str]) -> str:
        if not text:
            return ""
        return " ".join(str(text).replace("\n", " ").split())

    @staticmethod
    def _looks_like_bank_segment(text: str) -> bool:
        text = text.strip()
        if not text:
            return True
        return bool(re.search(
            r"^(?:ICICI|HDFC|SBI|SBIN|UBIN|UTIB|YESB|KKBK|BARB|PUNB|CNRB|"
            r"AXIS|KOTAK|UNION|FEDERAL|IDFC|INDUSIND|BANK(?:\s+OF)?|BOB|PNB|"
            r"AXISBANKLTD|YES\s*BANK(?:\s*LIMITED)?|BANK\s*OF\s*(?:MAHARASHTRA|INDIA|BARODA)|"
            r"CRED|PAYTM|RUPAY)\b",
            text,
re.IGNORECASE,
))

    @staticmethod
    def _looks_like_transaction_prefix(text: str) -> bool:
        return bool(re.fullmatch(
            r"(?:NEFT|RTGS|IMPS)\s+(?:DR|CR)|"
            r"CASH\s+(?:DEPOSIT|WITHDRAWAL|WDL)|"
            r"(?:POS|ATM)\s+PURCHASE|ATM\s+WITHDRAWAL",
            text.strip(),
            re.IGNORECASE,
        ))

    @classmethod
    def _clean_party_candidate(cls, text: Optional[str]) -> str:
        text = cls._clean_text(text)
        if not text:
            return ""

        # Split concatenated words: "SMCGLOBAL" -> "SMC GLOBAL" (lowercase boundary before uppercase)
        text = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', text)
        # Re-join single-letter fragments that were wrongly split: "a ngel" -> "angel"
        text = re.sub(r'\b([A-Za-z]{3,})\s+([a-z])\b', r'\1\2', text)
        # Strip common corporate/bank suffixes
        text = re.sub(r'\b(?:A/C|AC\d*|DSCNB|PROPRIETARY|LIMITED|LTD|PVT|PRIVATE)\b\.?', ' ', text, flags=re.IGNORECASE)
        text = re.sub(r'\b(?:chg|gst)\s*rs\.?\s*\d+(?:\.\d+)?', ' ', text, flags=re.IGNORECASE)
        text = re.sub(r'\b(?:NSE\s*CLI|NSE\s*CM|BSE\s*CLI|MF\s*BKG)\b', ' ', text, flags=re.IGNORECASE)
        text = re.sub(r'\b(?:ELECT|BKG)\b', ' ', text, flags=re.IGNORECASE)
        # Strip long numeric sequences (account/reference numbers)
        text = re.sub(r'\b\d{6,}\b', ' ', text)
        # Strip IFSC-like codes (4 letters + 0 + digits)
        text = re.sub(r'\b[A-Z]{4}0\d{6,}\b', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip(' -/')
        return text[:80].strip()

    @classmethod
    def _extract_party_from_description(cls, description: Optional[str]) -> str:
        desc = cls._clean_text(description)
        if not desc:
            return ""

        patterns = [
            # UPI/P2A/id/PARTY NAME/UPI/BANK OF BARODA (Axis Bank format)
            r"\bUPI/P2[AM]\s*/\s*\d+\s*/\s*([^/]+?)(?:\s*/?\s*UPI\s*/|$)",
            # UPI/P2M/id/PARTY NAME/Paying|Payvia|UPI/BANK (Axis Bank, mixed)
            r"\bUPI/P2[AM]\s*/\s*\d+\s*/\s*([^/]+)",
            # MMT/IMPS/500710624580/KKBKTransfer/GAURAV CH/Kotak Mahindra
            r"\b(?:MMT/)?IMPS\s*/\s*\d+\s*/\s*(?:KKBKTransfer|Fund Transfer)\s*/\s*([^/]+)",
            # UPI/DR/reference/party/bank/handle/UPI
            r"\bUPI(?:AB|AR)?\s*/\s*(?:DR|CR)\s*/\s*\d+\s*/\s*([^/]+)",
            # UPIAB/600241319866 /CR/RATHOD V/SBIN/vishalrathodcs
            r"\bUPI(?:AB|AR)?\s*/\s*\d+\s*/\s*(?:DR|CR)\s*/\s*([^/]+)",
            # UPI/MOB/id/PARTY (IDFC Bank format)
            r"\bUPI/MOB\s*/\s*\d+\s*/\s*([^/]+)",
            # MMT/IMPS/600112037511/GAURAV CHA/KKBK0000261
            r"\b(?:MMT/)?IMPS\s*/\s*\d+\s*/\s*([^/]+)",
            # IMPS-OPM/id/PARTY/BANK (IDFC Bank format)
            r"\bIMPS[-/]OPM\s*/\s*\d+\s*/\s*([^/]+)",
            # IMPSAB/id/..../PARTY/BANK (Union Bank format)
            r"\bIMPS(?:AB|AR)?\s*/\s*\d+\s*/\s*([^/]+)",
            # NEFT/CMS{ref}/PARTY NAME NSE CLI/BANK (IDFC, NEFT format)
            r"\bNEFT/CMS\d+\s*/\s*([^/]+?)(?:\s*/\s*[A-Z]{4}\d+|$)",
            # NEFT-N093...-ANGEL ONE LIMITED-...
            r"\bNEFT[-/][^-/\s]+[-/]\s*([A-Za-z][A-Za-z0-9 .&]+?)(?=-\s*(?:\d|[A-Z]\d|[A-Z]{4}\d|DSCNB|A/C|AC)|$)",
            r"\bRTGS[-/][^-/\s]+[-/]\s*([A-Za-z][A-Za-z0-9 .&]+?)(?=-\s*(?:\d|[A-Z]\d|[A-Z]{4}\d|DSCNB|A/C|AC)|$)",
            # NEFT*UBIN0913707*001832250223*PARMAR VIPULBHAI
            r"\bNEFT\*[^*]+\*[^*]+\*\s*([A-Za-z][A-Za-z0-9 .&]+)",
            # NEFTO-PARTY (Union Bank NEFT format)
            r"\bNEFT\s*O[-/]\s*([A-Za-z][A-Za-z0-9 .&]+?)(?:\s*[/-]|\s*$)",
            # NEFT DR-<party>-<ref> (HDFC and other banks with space before DR/CR)
            r"\b(?:NEFT|RTGS|IMPS)\s+(?:DR|CR)[-/]([A-Za-z][A-Za-z0-9 .&]+?)(?:[-/]|$)",
            # Ecom/ref/MERCHANT/... (IDFC Bank format)
            r"\bEcom\s*/\s*\d+\s*/\s*([^/]+)",
            # IFT/ref/PARTY NAME/account/... (IDFC Bank format)
            r"\bIFT\s*/\s*\d+\s*/\s*([^/]+)",
            # BY TRANSFER- UPI/CR/.../SIDHA RAJ/...
            r"\bUPI\s*/\s*(?:DR|CR)\s*/\s*\d+\s*/\s*([^/]+)",
            # POS/ATM descriptions often put merchant after a long terminal id.
            r"\b(?:POS|OTHPOS)\d+\s*([A-Za-z][A-Za-z0-9 .&-]+)",
            # BRN-PYMT-CARD-{card_no} (card payment)
            r"\bBRN[-/]PYMT[-/]CARD[-/]",
        ]

        for pattern in patterns:
            match = re.search(pattern, desc, re.IGNORECASE)
            if not match:
                continue
            candidate = match.group(1).strip() if match.lastindex else ""
            candidate = cls._clean_party_candidate(candidate)
            if not candidate:
                continue
            if pattern.endswith("BRN[-/]PYMT[-/]CARD[-/]"):
                return "Card Payment"
            if not cls._looks_like_bank_segment(candidate):
                candidate = re.sub(r"\s+(UPI|MOB|P2A|P2M|NA)\s*$", "", candidate, flags=re.IGNORECASE).strip()
                if candidate:
                    return candidate

        parts = [cls._clean_party_candidate(p) for p in re.split(r"[/|-]", desc)]
        for part in parts:
            if not part or cls._looks_like_bank_segment(part):
                continue
            if re.fullmatch(
                r"\d+|[A-Z]{4}\d+|NA|UPI|DR|CR|NEFT|IMPS|MMT|BIL|ONL|P2A|P2M|MOB|"
                r"NEFT (?:DR|CR)|RTGS (?:DR|CR)|IMPS (?:DR|CR)|CASH DEPOSIT|"
                r"FUND TRANSFER|TRANSFER|KKBKTRANSFER|CASH WDL|CHARGE|PAYMENT FROM PH|"
                r"WITHDRAW|DEPOSIT|WDL TFR|DEP TFR|RECURRING",
                part,
                re.IGNORECASE,
            ):
                continue
            if "@" in part:
                continue
            if any(ch.isdigit() for ch in part) and len(part) > 12:
                continue
            if len(part) >= 3:
                return part

        if re.match(r"^(?:BIL|CAM|APBS|RTGS|NEFT|CMS|ACH|INF)\b", desc, re.IGNORECASE):
            return ""
        return cls._clean_party_candidate(desc)

    @classmethod
    def _infer_signed_amount(cls, amount: float, description: Optional[str]) -> float:
        desc = cls._clean_text(description).upper()
        debit_markers = [
            "/DR/", " UPI/DR/", " UPI/P2M/", " WDL ", "WDL TFR", "WITHDRAWAL",
            "BY DEBIT", "DEBIT", " TO TRANSFER", " CHG", "/CHG", "CHARGE",
            "/P2A/", "IMPS-OPM", "WITHDRAW",
        ]
        credit_markers = [
            "/CR/", " UPI/CR/", " UPI/P2A/", " DEP ", "DEP TFR", "DEPOSIT",
            "BY TRANSFER", "CREDIT", "FROM TRANSFER", "/P2M/",
        ]
        if any(marker in desc for marker in debit_markers):
            return -abs(amount)
        if any(marker in desc for marker in credit_markers):
            return abs(amount)
        return amount

    @staticmethod
    def _date_from_cell(cell: Optional[str], date_pattern: Any) -> Optional[str]:
        if not cell:
            return None
        match = date_pattern.search(str(cell))
        if match:
            return match.group(0)
        return None
