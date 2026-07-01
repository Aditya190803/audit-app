from typing import Any, Dict, List, Optional

from backend.services.fuzzy_service import FuzzyService
from backend.services.parsers.base import BaseParser
from backend.services.phone import extract_phone_candidates

DEFAULT_TAG_PRIORITY = ["client", "broker", "suspicious"]


def _try_client(tx, ctx) -> Optional[Dict[str, Any]]:
    """Phone match (exact) then fuzzy client-name match. Returns a client tag or None."""
    full_text = ctx["full_text"]
    for norm in extract_phone_candidates(full_text):
        if norm in ctx["phone_map"]:
            return {
                "transaction_id": tx["id"],
                "tag_type": "client",
                "confidence": 1.0,
                "reason": f"Phone match: {norm} -> '{ctx['phone_map'][norm][0]}'",
            }

    fuzzy = ctx["fuzzy"]
    client_match_text = f"{ctx['match_text']} {ctx['desc_text']}".strip()
    for match in fuzzy.match_client_names(client_match_text, ctx["clients"], ctx["alias_list"]):
        if match["score"] >= ctx["fuzzy_threshold"]:
            return {
                "transaction_id": tx["id"],
                "tag_type": "client",
                "confidence": match["score"],
                "reason": f"Fuzzy match: '{match['original']}' (score: {match['score']})",
            }
    return None


def _try_broker(tx, ctx) -> Optional[Dict[str, Any]]:
    """Broker match, but only if the party text isn't itself a client. Returns a broker tag or None."""
    fuzzy = ctx["fuzzy"]
    broker_text = ctx["extracted_party"] or ctx["party_text"]
    if not broker_text:
        return None

    # Guard: a party that is actually a client must not be mis-tagged as a broker.
    norm_bt = fuzzy.normalize_text(broker_text)
    if any(norm_bt == fuzzy.normalize_text(c["name"]) for c in ctx["clients"]):
        return None
    if fuzzy.match_client_names(broker_text, ctx["clients"], ctx["alias_list"]):
        return None

    seen_brokers = set()
    for match in fuzzy.match_broker_names(broker_text, ctx["broker_names"], ctx["exclusions"], ctx["common_words"]):
        if match["score"] < ctx["fuzzy_threshold"]:
            continue
        orig = match["original"]
        canonical = ctx["alias_to_canonical"].get(orig, orig)
        if canonical in seen_brokers:
            continue
        seen_brokers.add(canonical)
        return {
            "transaction_id": tx["id"],
            "tag_type": "broker",
            "confidence": match["score"],
            "reason": f"Broker match: '{orig}' (score: {match['score']})",
        }
    return None


def _try_suspicious(tx, ctx) -> Optional[Dict[str, Any]]:
    """Threshold / recurring / keyword checks. Returns a suspicious tag or None."""
    reasons = []
    if tx.get("amount") and abs(tx.get("amount")) >= ctx["suspicious_threshold"]:
        reasons.append(f"Amount {tx['amount']} exceeds threshold {ctx['suspicious_threshold']}")
    if tx["id"] in ctx["recurring_map"]:
        reasons.append(ctx["recurring_map"].get(tx["id"]) or "Recurring transaction to same party")
    full_text_lower = ctx["full_text"].lower()
    for keyword in ctx["suspicious_keywords"]:
        if keyword.lower() in full_text_lower:
            reasons.append(f"Contains suspicious keyword: '{keyword}'")
    if not reasons:
        return None
    return {
        "transaction_id": tx["id"],
        "tag_type": "suspicious",
        "confidence": 1.0,
        "reason": "; ".join(reasons),
    }


# Dispatch by tag type. tag_priority (from config) selects the cascade order:
# the first stage that returns a tag wins, and lower-priority stages never
# re-evaluate an already-tagged transaction.
_STAGES = {
    "client": _try_client,
    "broker": _try_broker,
    "suspicious": _try_suspicious,
}


def _process_transaction_batch(batch, clients, phone_map, broker_names, alias_list, alias_to_canonical,
                               suspicious_threshold, fuzzy_threshold, exclusions, common_words, recurring_map,
                               suspicious_keywords, tag_priority=DEFAULT_TAG_PRIORITY):
    """Worker function to process a batch of transactions and return tag data."""
    fuzzy = FuzzyService(threshold=fuzzy_threshold)
    tags_data = []

    for tx in batch:
        party_text = tx.get("party_name") or ""
        desc_text = tx.get("description") or ""
        full_text = f"{party_text} {desc_text}"

        # Single party-extraction path: BaseParser's pattern list is a superset of
        # the inline regexes that used to live here, and party_name is derived from
        # description by the parser, so scanning desc_text alone is equivalent.
        extracted_party = BaseParser._extract_party_from_description(desc_text)

        ctx = {
            "fuzzy": fuzzy,
            "full_text": full_text,
            "party_text": party_text,
            "desc_text": desc_text,
            "match_text": extracted_party or party_text or desc_text,
            "extracted_party": extracted_party,
            "clients": clients,
            "phone_map": phone_map,
            "broker_names": broker_names,
            "alias_list": alias_list,
            "alias_to_canonical": alias_to_canonical,
            "exclusions": exclusions,
            "common_words": common_words,
            "fuzzy_threshold": fuzzy_threshold,
            "suspicious_threshold": suspicious_threshold,
            "recurring_map": recurring_map,
            "suspicious_keywords": suspicious_keywords,
        }

        for tag_type in tag_priority or DEFAULT_TAG_PRIORITY:
            stage = _STAGES.get(tag_type)
            if stage is None:
                continue
            tag = stage(tx, ctx)
            if tag:
                tags_data.append(tag)
                break

    return tags_data
