from backend.services.fuzzy_service import FuzzyService
from backend.services.parsers.base import BaseParser
from backend.services.phone import extract_phone_candidates

def _process_transaction_batch(batch, clients, phone_map, broker_names, alias_list, alias_to_canonical,
                               suspicious_threshold, fuzzy_threshold, exclusions, common_words, recurring_map, suspicious_keywords):
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
        match_text = extracted_party or party_text or desc_text
        tagged = False

        # 1. Phone match
        for norm in extract_phone_candidates(full_text):
            if norm in phone_map:
                tags_data.append({
                    "transaction_id": tx["id"],
                    "tag_type": "client",
                    "confidence": 1.0,
                    "reason": f"Phone match: {norm} -> '{phone_map[norm][0]}'",
                })
                tagged = True
                break

        if not tagged:
            # 2. Fuzzy client match
            client_match_text = f"{match_text} {desc_text}".strip()
            client_matches = fuzzy.match_client_names(client_match_text, clients, alias_list)
            for match in client_matches:
                if match["score"] >= fuzzy_threshold:
                    tags_data.append({
                        "transaction_id": tx["id"],
                        "tag_type": "client",
                        "confidence": match["score"],
                        "reason": f"Fuzzy match: '{match['original']}' (score: {match['score']})",
                    })
                    tagged = True
                    break

        if not tagged:
            # 3. Broker matching
            broker_text = extracted_party or party_text
            is_client_related = False
            if broker_text:
                norm_bt = fuzzy.normalize_text(broker_text)
                for c in clients:
                    if norm_bt == fuzzy.normalize_text(c["name"]):
                        is_client_related = True
                        break
                if not is_client_related:
                    is_client_related = bool(fuzzy.match_client_names(broker_text, clients, alias_list))

            if not is_client_related:
                broker_matches = fuzzy.match_broker_names(broker_text, broker_names, exclusions, common_words)
                seen_brokers = set()
                for match in broker_matches:
                    if match["score"] < fuzzy_threshold: continue
                    orig = match["original"]
                    canonical = alias_to_canonical.get(orig, orig)
                    if canonical in seen_brokers: continue
                    seen_brokers.add(canonical)
                    tags_data.append({
                        "transaction_id": tx["id"],
                        "tag_type": "broker",
                        "confidence": match["score"],
                        "reason": f"Broker match: '{orig}' (score: {match['score']})",
                    })
                    tagged = True
                    break

        if not tagged:
            # 4. Suspicious checks
            reasons = []
            if tx.get("amount") and abs(tx.get("amount")) >= suspicious_threshold:
                reasons.append(f"Amount {tx['amount']} exceeds threshold {suspicious_threshold}")
            if tx["id"] in recurring_map:
                reasons.append(recurring_map.get(tx["id"]) or "Recurring transaction to same party")
            full_text_lower = full_text.lower()
            for keyword in suspicious_keywords:
                if keyword.lower() in full_text_lower:
                    reasons.append(f"Contains suspicious keyword: '{keyword}'")
            if reasons:
                tags_data.append({
                    "transaction_id": tx["id"],
                    "tag_type": "suspicious",
                    "confidence": 1.0,
                    "reason": "; ".join(reasons),
                })
    return tags_data
