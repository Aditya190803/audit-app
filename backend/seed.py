import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from backend.database import engine, SessionLocal
from backend.models import Base, Broker, Config
from backend.defaults import DEFAULT_CONFIGS

# Old demo broker names that should be replaced
OLD_DEMO_BROKERS = {
    "Interactive Brokers", "TD Ameritrade", "Charles Schwab",
    "Fidelity", "E*TRADE", "Robinhood", "Webull",
    "Merrill Edge", "Vanguard", "Tastytrade", "TradeStation",
    " Ally Invest", "Firstrade", "Zacks Trade"
}

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Replace old demo broker_list with real list from brokers_list.py
        new_brokers = DEFAULT_CONFIGS["broker_list"]
        if new_brokers:
            config = db.query(Config).filter(Config.key == "broker_list").first()
            if config:
                current = config.value if isinstance(config.value, list) else []
                # If current list contains any old demo names, replace it
                if any(b in OLD_DEMO_BROKERS for b in current) or len(current) == 0:
                    config.value = new_brokers
                    print(f"[Seed] Updated broker_list: {len(current)} -> {len(new_brokers)} brokers")

            # Sync Broker table: remove old demo brokers, add new ones
            existing = {b.name for b in db.query(Broker).all()}
            # Remove old demo brokers
            for old in OLD_DEMO_BROKERS:
                if old in existing:
                    db.query(Broker).filter(Broker.name == old).delete()
                    existing.discard(old)
            # Add new brokers
            for name in new_brokers:
                if name not in existing:
                    db.add(Broker(name=name, aliases=[]))
            print(f"[Seed] Broker table synced: {len(new_brokers)} brokers")

        # Seed default configs for other keys
        existing_configs = {c.key for c in db.query(Config).all()}
        for key, value in DEFAULT_CONFIGS.items():
            if key not in existing_configs:
                category = "brokers" if key in ["broker_list", "broker_exclusions"] else "rules" if key in ["suspicious_threshold", "recurring_days_window", "suspicious_keywords"] else "matching" if key in ["fuzzy_match_threshold", "min_confidence_for_auto_tag", "name_normalization_rules"] else "general"
                db.add(Config(key=key, value=value, category=category))

        db.commit()
        print("Database seeded successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
