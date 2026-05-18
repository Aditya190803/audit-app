from backend.services.fuzzy_service import FuzzyService
from backend.services.parsers.base import BaseParser

def _process_transaction_batch(batch, clients, phone_map, broker_names, alias_list, alias_to_canonical, 
                               suspicious_threshold, fuzzy_threshold, exclusions, common_words, recurring_map, suspicious_keywords):
    """Worker function to process a batch of transactions and return tag data."""
    fuzzy = FuzzyService(threshold=fuzzy_threshold)
    tags_data = []
    
    for tx in batch:
        party_text = tx.get("party_name") or ""
        desc_text = tx.get("description") or ""
        full_text = f"{party_text} {desc_text}"
        
        extracted_party = None
        if full_text:
            import re
            m = re.search(r'UPI\w*\s*/\s*\w+\s*/\s*\w+\s*/\s*([^/]+?)\s*/', full_text)
            if m and len(m.group(1).strip()) > 1:
                extracted_party = m.group(1).strip()
            else:
                m = re.search(r'\*\s*([A-Za-z\s]+?)(?:\s+\d+\s*|\s*$)', full_text)
                if m and len(m.group(1).strip()) > 3:
                    extracted_party = m.group(1).strip()
                else:
                    m = re.search(r'OF\s+(?:Mr|Mrs|Ms)\.?\s+([A-Za-z\s]+?)(?:\s*\(|\s+\d|\s*$)', full_text)
                    if m and len(m.group(1).strip()) > 3:
                        extracted_party = m.group(1).strip()

        if not extracted_party:
            extracted_party = BaseParser._extract_party_from_description(desc_text)
            
        match_text = extracted_party or party_text or desc_text
        tagged = False
        
        # 1. Phone match
        def _normalize_phone(phone: str):
            digits = re.sub(r'\D', '', phone)
            if len(digits) == 10: return digits
            if len(digits) == 11 and digits.startswith('0'): return digits[1:]
            if len(digits) == 12 and digits.startswith('91'): return digits[2:]
            if len(digits) > 10: return digits[-10:]
            return None

        if full_text:
            cleaned = re.sub(r'(?:UPI|IMPS|NEFT|RTGS|MMT|UPIAB|UPIAR)\s*/\s*\d+', ' ', full_text, flags=re.IGNORECASE)
            cleaned = re.sub(r'[A-Za-z]\d{6,}', ' ', cleaned)
            cleaned = re.sub(r'\d{12,}', ' ', cleaned)
            candidates = re.findall(r'\b\d{10,15}\b', re.sub(r'\D', ' ', cleaned))
            for c in candidates:
                norm = _normalize_phone(c)
                if norm and len(norm) == 10 and norm[0] in ('6','7','8','9') and len(set(norm)) > 2:
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
