# Default configuration values
import os
import sys

def _load_brokers():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    brokers_path = os.path.join(backend_dir, "brokers_list.py")
    if os.path.exists(brokers_path):
        sys.path.insert(0, backend_dir)
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
        "personal loan", "borrow", "lend", "unauthorized advance",
        "escrow", "dummy", "pooling",
        "dabba", "incentive",
        "guaranteed return", "fixed return",
        "doubler", "multibagger",
        "client payment", "3rd party transfer", "pass through",
        "surrogate", "proxy", "accommodation entry",
        "round tripping", "layering", "hawala",
        "cash deposit large", "cash withdrawal large",
        "structuring", "smurfing",
    ],
    "default_bank_profile": "generic"
}
