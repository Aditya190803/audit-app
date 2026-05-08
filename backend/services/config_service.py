from sqlalchemy.orm import Session
from backend.models import Config
from backend.defaults import DEFAULT_CONFIGS
from typing import Any, Dict

class ConfigService:
    def __init__(self, db: Session):
        self.db = db
    
    def get_all(self) -> Dict[str, Any]:
        configs = self.db.query(Config).all()
        result = {}
        for c in configs:
            result[c.key] = c.value
        # Fill in any missing defaults
        for key, value in DEFAULT_CONFIGS.items():
            if key not in result:
                result[key] = value
        return result
    
    def get(self, key: str) -> Any:
        config = self.db.query(Config).filter(Config.key == key).first()
        if config:
            return config.value
        return DEFAULT_CONFIGS.get(key)
    
    def set(self, key: str, value: Any, category: str = "general"):
        config = self.db.query(Config).filter(Config.key == key).first()
        if config:
            config.value = value
        else:
            config = Config(key=key, value=value, category=category)
            self.db.add(config)
        self.db.commit()
        return config
    
    def update_many(self, updates: Dict[str, Any]):
        for key, value in updates.items():
            self.set(key, value)
        return self.get_all()
    
    def reset_to_defaults(self):
        self.db.query(Config).delete()
        for key, value in DEFAULT_CONFIGS.items():
            category = "brokers" if key in ["broker_list", "broker_exclusions"] else "rules" if key in ["suspicious_threshold", "recurring_days_window", "suspicious_keywords"] else "matching" if key in ["fuzzy_match_threshold", "min_confidence_for_auto_tag", "name_normalization_rules"] else "general"
            self.db.add(Config(key=key, value=value, category=category))
        self.db.commit()
        return self.get_all()
    
    def get_brokers(self) -> list:
        return self.get("broker_list") or DEFAULT_CONFIGS["broker_list"]
    
    def set_brokers(self, brokers: list):
        self.set("broker_list", brokers, "brokers")
    
    def get_threshold(self) -> float:
        return float(self.get("suspicious_threshold") or DEFAULT_CONFIGS["suspicious_threshold"])
    
    def get_fuzzy_threshold(self) -> float:
        return float(self.get("fuzzy_match_threshold") or DEFAULT_CONFIGS["fuzzy_match_threshold"])
