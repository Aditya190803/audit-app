import re

METHODS = {
    "NEFT": r'\bNEFT\b',
    "RTGS": r'\bRTGS\b',
    "IMPS": r'\bIMPS\b',
    "UPI": r'\bUPI\b',
    "CASH": r'\bCASH\b',
    "CHEQUE": r'\bCHEQUE\b|\bCHQ\b|\bCH\.?\b',
    "ECS": r'\bECS\b',
    "ATM": r'\bATM\b',
    "POS": r'\bPOS\b',
    "SWIFT": r'\bSWIFT\b',
}

def detect_payment_method(description: str = "", party_name: str = "") -> str:
    desc = (description or "") + " " + (party_name or "")
    detected = "OTHER"
    for method, pattern in METHODS.items():
        if re.search(pattern, desc, re.IGNORECASE):
            detected = method
            break
    return detected
