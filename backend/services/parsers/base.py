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
        for i, row in enumerate(data[:5]):
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
    def _parse_amount_cell(cell: Optional[str]) -> Optional[float]:
        if not cell:
            return None
        cleaned = str(cell).strip().replace(",", "").replace("$", "").replace("(", "-").replace(")", "").replace(" ", "")
        match = re.search(r"[\d]+\.\d{2}", cleaned)
        if match:
            try:
                return float(match.group())
            except ValueError:
                return None
        return None
