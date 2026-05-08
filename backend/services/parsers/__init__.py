from typing import List, Dict, Optional, Any
from backend.services.parsers.icici_detailed import ICICIDetailedParser
from backend.services.parsers.sbi_standard import SBIStandardParser
from backend.services.parsers.kotak_mahindra import KotakMahindraParser
from backend.services.parsers.union_bank import UnionBankParser
from backend.services.parsers.sbi_compact import SBICompactParser
from backend.services.parsers.icici_numbered import ICICINumberedParser
from backend.services.parsers.generic import GenericParser


class ParserRegistry:
    def __init__(self):
        self._parsers = []

    def register(self, parser_class):
        instance = parser_class()
        self._parsers.append(instance)
        return instance

    @property
    def parsers(self) -> List[Any]:
        return list(self._parsers)

    def get_by_name(self, name: str) -> Optional[Any]:
        for p in self._parsers:
            if p.name == name:
                return p
        return None

    def detect(self, tables: List[Dict], pages: List[Dict]) -> Any:
        best = None
        best_score = 0.0
        for p in self._parsers:
            score = p.detect(tables, pages)
            if score > best_score:
                best_score = score
                best = p
        return best if best_score > 0.3 else self.get_by_name("generic")

    def parser_list(self) -> List[Dict[str, str]]:
        return [{"name": p.name, "display_name": p.display_name} for p in self._parsers]


registry = ParserRegistry()

# Register built-in parsers
registry.register(ICICIDetailedParser)
registry.register(SBIStandardParser)
registry.register(KotakMahindraParser)
registry.register(UnionBankParser)
registry.register(SBICompactParser)
registry.register(ICICINumberedParser)
registry.register(GenericParser)
