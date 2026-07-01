"""Phone-number extraction and matching for transaction tagging.

Single source of truth for phone normalization, validation, and candidate
extraction. Previously duplicated (with drift) between TaggingService and the
tagging worker process pool.
"""
import re
from typing import Any, Dict, List


def normalize_phone(phone: str) -> str | None:
    digits = re.sub(r'\D', '', phone)
    if len(digits) == 10:
        return digits
    if len(digits) == 11 and digits.startswith('0'):
        return digits[1:]
    if len(digits) == 12 and digits.startswith('91'):
        return digits[2:]
    if len(digits) > 10:
        return digits[-10:]
    return None


def is_valid_phone(phone: str) -> bool:
    """A normalized 10-digit Indian mobile number, not an obvious ref number."""
    if not phone:
        return False
    n = phone
    if len(n) == 12 and n.startswith('91'):
        n = n[2:]
    elif len(n) == 11 and n.startswith('0'):
        n = n[1:]
    if len(n) != 10:
        return False
    if n[0] not in ('6', '7', '8', '9'):
        return False
    if len(set(n)) <= 2:
        return False
    return True


def extract_phone_candidates(text: str) -> List[str]:
    """Normalized, valid, order-preserving phone candidates from narration text."""
    if not text:
        return []
    cleaned = re.sub(r'(?:UPI|IMPS|NEFT|RTGS|MMT|UPIAB|UPIAR)\s*/\s*\d+', ' ', text, flags=re.IGNORECASE)
    cleaned = re.sub(r'[A-Za-z]\d{6,}', ' ', cleaned)
    cleaned = re.sub(r'\d{12,}', ' ', cleaned)
    candidates = re.findall(r'\b\d{10,15}\b', re.sub(r'\D', ' ', cleaned))
    result: List[str] = []
    seen: set[str] = set()
    for c in candidates:
        normalized = normalize_phone(c)
        if normalized and is_valid_phone(normalized) and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def build_phone_map(clients: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Map normalized phone -> client names that carry that number."""
    phone_map: Dict[str, List[str]] = {}
    for c in clients:
        raw = c.get('raw_data', {})
        for key, val in raw.items():
            k = str(key).lower().strip()
            v = str(val).strip()
            if any(kw in k for kw in ('phone', 'mobile', 'cell', 'telephone', 'contact_no', 'contact')):
                if v and v.lower() not in ('nan', '', 'none', 'null'):
                    normalized = normalize_phone(v)
                    if normalized:
                        phone_map.setdefault(normalized, []).append(c['name'])
    return phone_map
