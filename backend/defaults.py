# Default configuration values
import os
import sys

def _load_brokers():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    brokers_path = os.path.join(project_root, "brokers_list.py")
    if os.path.exists(brokers_path):
        sys.path.insert(0, project_root)
        try:
            from brokers_list import BROKERS
            return sorted(BROKERS)
        except ImportError:
            pass
    return []

DEFAULT_CONFIGS = {
    "suspicious_threshold": 10000.0,
    "fuzzy_match_threshold": 0.75,
    "tag_priority": ["client", "broker", "suspicious"],  # reserved for future use
    "name_normalization_rules": {
        "strip_extra_spaces": True,
        "lowercase": True,
        "remove_special_chars": True
    },
    "auto_save_interval_seconds": 30,
    "recurring_days_window": 30,
    "min_confidence_for_auto_tag": 0.75,
    "broker_list": _load_brokers(),
    "broker_exclusions": [],
    "broker_common_words": [
        "limited", "ltd", "pvt", "private", "securities", "services",
        "company", "india", "commodities", "broking", "brokers", "brokerage",
        "capital", "finance", "financial", "investment", "investments",
        "equities", "equity", "stock", "shares", "trading", "ventures",
        "holdings", "consultants", "consultancy", "management", "advisory",
        "derivatives", "fintech", "technologies", "solutions", "llp",
        "enterprises", "intermediaries", "portfolio", "wealth", "markets",
        "global", "international", "payments", "money"
    ],
    "suspicious_keywords": [
        "loan", "personal loan", "borrow", "lend", "advance",
        "temp", "temporary", "friend", "family", "relative",
        "escrow", "collection", "dummy", "pool", "pooling",
        "dabba", "incentive",
        "tips", "referral", "rebate", "service charge",
        "payin", "payout",
        "demat",
        "guaranteed return", "fixed return",
        "doubler", "multibagger", "premium",
        "signal", "calls",
        "client payment", "client fund", "third party",
        "3rd party", "adjustment", "reversal", "parking",
        "rotation", "accommodation", "pass through",
        "surrogate", "proxy", "beneficiary", "set off",
        "collect", "received for", "paid for", "on behalf",
        "cash deposit", "cash withdrawal", "cash"
    ],
    "default_bank_profile": "generic"
}
