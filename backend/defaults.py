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
    "tag_priority": ["client", "broker", "suspicious"],
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
    "suspicious_keywords": ["wire transfer", "cash withdrawal", "crypto", "bitcoin"],
    "default_bank_profile": "generic"
}
