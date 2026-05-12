from rapidfuzz import fuzz, process
from typing import List, Dict, Any, Optional, Tuple
import re

COMMON_WORDS = {
    "limited", "ltd", "pvt", "private", "securities", "services",
    "company", "india", "commodities", "broking", "brokers", "brokerage",
    "capital", "finance", "financial", "investment", "investments",
    "equities", "equity", "stock", "shares", "trading", "ventures",
    "holdings", "consultants", "consultancy", "management", "advisory",
    "derivatives", "fintech", "technologies", "solutions", "llp",
    "enterprises", "intermediaries", "portfolio", "wealth", "markets",
    "global", "international", "payments", "money"
}

CLIENT_COMMON_WORDS = COMMON_WORDS | {
    "mr", "mrs", "ms", "shri", "smt", "kumar", "kumari", "bhai",
    "ben", "devi", "singh", "patel"
}

BROKER_ENTITY_WORDS = {
    "broking", "broker", "brokers", "securities", "stock", "stocks",
    "shares", "share", "trading", "trade", "commodity", "commodities",
    "capital", "wealth", "markets", "equities", "investment", "investments",
}

BROKER_BRAND_TOKENS = {
    "zerodha", "angel", "angelone", "upstox", "groww", "5paisa",
    "sharekhan", "motilal", "oswal", "iifl", "geojit", "icici",
    "hdfcsec", "kotaksec", "edelweiss", "nuvama",
}

BANK_ONLY_TOKENS = {
    "bank", "mahindra", "kotak", "icici", "hdfc", "sbi", "state", "union",
    "axis", "yes", "federal", "idfc", "indusind", "baroda", "punjab",
}

BANK_COUNTERPARTY_TOKENS = BANK_ONLY_TOKENS | {
    "limited", "ltd", "private", "pvt", "first",
}

TRANSACTION_NOISE_TOKENS = {
    "dep", "wdl", "tfr", "upi", "upiab", "upiar", "cr", "dr", "neft",
    "nefto", "imps", "rtgs", "inb", "at", "to", "from", "by", "of",
    "bill", "payment", "transfer", "sbin", "hdfc", "icic", "bkid", "barb",
    "punb", "ubin", "yesb", "utib", "kkbk", "sihor",
}

class FuzzyService:
    def __init__(self, threshold: float = 0.75):
        self.threshold = threshold
    
    def set_threshold(self, threshold: float):
        self.threshold = threshold
    
    def normalize_text(self, text: str) -> str:
        """Normalize text for matching."""
        if not text:
            return ""
        text = str(text).strip().lower()
        text = ' '.join(text.split())  # Remove extra spaces
        # Remove special characters but keep alphanumeric and spaces
        text = re.sub(r'[^\w\s]', ' ', text)
        text = ' '.join(text.split())
        return text
    
    def find_matches(self, text: str, candidates: List[str], 
                    limit: int = 5) -> List[Dict[str, Any]]:
        """Find fuzzy matches for text against candidates."""
        if not text or not candidates:
            return []
        
        normalized_text = self.normalize_text(text)
        normalized_candidates = [(c, self.normalize_text(c)) for c in candidates]
        
        matches = []
        for original, normalized in normalized_candidates:
            if not normalized:
                continue
            
            # Blend whole-string and token-aware scores. partial_ratio is useful for
            # abbreviated bank narrations, but it should not dominate every match.
            partial_score = fuzz.partial_ratio(normalized_text, normalized) / 100.0
            token_score = fuzz.token_sort_ratio(normalized_text, normalized) / 100.0
            token_set_score = fuzz.token_set_ratio(normalized_text, normalized) / 100.0
            wratio_score = fuzz.WRatio(normalized_text, normalized) / 100.0
            score = max(token_score, token_set_score, wratio_score, partial_score * 0.95)
            
            if score >= self.threshold:
                matches.append({
                    "original": original,
                    "score": round(score, 3),
                    "matched": True
                })
        
        # Sort by score descending
        matches.sort(key=lambda x: x["score"], reverse=True)
        return matches[:limit]
    
    def find_best_match(self, text: str, candidates: List[str]) -> Optional[Dict[str, Any]]:
        """Find the best single match."""
        matches = self.find_matches(text, candidates, limit=1)
        return matches[0] if matches else None
    
    def _client_token_roots(self, token: str) -> set:
        roots = {token}
        for suffix in ("bhai", "ben", "kumar", "kumari"):
            if token.endswith(suffix) and len(token) > len(suffix) + 2:
                roots.add(token[:-len(suffix)])
        return roots

    def _client_evidence_score(self, text: str, candidate: str) -> Optional[float]:
        """Score direct name evidence, including compressed UPI handles.

        Bank narrations often split a name across a visible abbreviation and a
        compressed UPI handle. This keeps those matches controlled by requiring
        evidence from at least two distinct client-name tokens.
        """
        text_tokens = self.normalize_text(text).split()
        candidate_tokens = [
            t for t in self.normalize_text(candidate).split()
            if len(t) >= 3 and t not in CLIENT_COMMON_WORDS
        ]

        if not candidate_tokens or not text_tokens:
            return None

        strong_hits = set()
        prefix_hits = set()
        for idx, ct in enumerate(candidate_tokens):
            roots = self._client_token_roots(ct)
            for tt in text_tokens:
                if tt in TRANSACTION_NOISE_TOKENS:
                    continue
                if len(tt) < 2:
                    continue
                best_ratio = max(fuzz.ratio(root, tt) / 100.0 for root in roots)
                if best_ratio >= 0.84:
                    strong_hits.add(idx)
                    break

                if any(len(root) >= 4 and root in tt and len(tt) >= len(root) + 3 for root in roots):
                    strong_hits.add(idx)
                    break

                min_prefix = 2 if idx <= 1 and strong_hits else min(4, min(len(r) for r in roots))
                if any(len(tt) >= min_prefix and root.startswith(tt) for root in roots):
                    prefix_hits.add(idx)
                    break

                # UPI handles commonly concatenate first-name/surname fragments.
                if len(tt) >= 5 and any(
                    len(root) >= 4 and root[:(4 if len(root) == 4 else 5)] in tt
                    for root in roots
                ):
                    prefix_hits.add(idx)
                    break

        hit_count = len(strong_hits | prefix_hits)

        if len(candidate_tokens) == 1:
            return 0.9 if strong_hits else None

        if not strong_hits:
            return None

        # Require at least half the distinct tokens to carry evidence.
        # For 3-token names like "AMBIKA SHRIRAMRANA BHAT", both
        # "SHRIRAMRANA" and "BHAT" must find evidence in the text.
        min_required = max(2, len(candidate_tokens) // 2 + 1)
        if hit_count < min_required:
            return None

        return min(0.95, 0.78 + (hit_count * 0.055) + (len(strong_hits) * 0.06))

    def _has_client_evidence(self, text: str, candidate: str) -> bool:
        """Require real token evidence so short names don't match random substrings."""
        return self._client_evidence_score(text, candidate) is not None

    def match_client_names(self, text: str, clients: List[Dict[str, Any]], 
                          aliases: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Match text against client names and aliases.
        
        Short names (<4 chars) require a higher threshold (0.9) to reduce false positives.
        """
        candidate_names = [c["name"] for c in clients]
        
        # Add aliases to candidates
        if aliases:
            alias_map = {}
            for alias in aliases:
                candidate_names.append(alias["alias_name"])
                alias_map[alias["alias_name"]] = alias["canonical_name"]
        
        matches = self.find_matches(text, candidate_names)
        by_name = {m["original"]: m for m in matches}

        for name in candidate_names:
            if name in by_name:
                continue
            evidence_score = self._client_evidence_score(text, name)
            if evidence_score is not None and evidence_score >= self.threshold:
                by_name[name] = {
                    "original": name,
                    "score": round(evidence_score, 3),
                    "matched": True,
                }

        matches = sorted(by_name.values(), key=lambda x: x["score"], reverse=True)
        
        # Filter out weak short-name matches
        filtered = []
        for match in matches:
            name = match["original"]
            # Short names need higher confidence to avoid substring false positives.
            min_tokens = len(self.normalize_text(name).split())
            name_len = len(name.strip())
            if min_tokens <= 2 and name_len < 6:
                if match["score"] < 0.9:
                    continue
            # Single-token names under 4 chars require even higher confidence
            if min_tokens == 1 and name_len < 4:
                if match["score"] < 0.95:
                    continue
            if not self._has_client_evidence(text, name):
                continue
            filtered.append(match)
        
        # Resolve aliases to canonical names
        for match in filtered:
            if aliases and match["original"] in alias_map:
                match["canonical_name"] = alias_map[match["original"]]
                match["is_alias"] = True
            else:
                match["is_alias"] = False
        
        return filtered
    
    def _get_significant_tokens(self, name: str, common_words: set = None, *, for_broker: bool = False) -> set:
        """Extract tokens from a name, excluding common corporate words."""
        if common_words is None:
            common_words = COMMON_WORDS
        tokens = set(self.normalize_text(name).split())
        ignored = set(common_words)
        if for_broker:
            ignored |= TRANSACTION_NOISE_TOKENS | {"limited", "ltd", "private", "pvt"}
            if not (tokens & BROKER_ENTITY_WORDS):
                ignored |= BANK_ONLY_TOKENS
        return {t for t in tokens if t not in ignored and len(t) >= 3}

    def _is_person_like_broker_name(self, broker_name: str) -> bool:
        tokens = [
            t for t in self.normalize_text(broker_name).split()
            if t not in COMMON_WORDS and t not in BROKER_ENTITY_WORDS and t not in BANK_ONLY_TOKENS
        ]
        if not tokens:
            return False
        broker_tokens = set(self.normalize_text(broker_name).split())
        if broker_tokens & BROKER_ENTITY_WORDS:
            return False
        if broker_tokens & BROKER_BRAND_TOKENS:
            return False
        return len(tokens) <= 4 and all(t.isalpha() for t in tokens)

    def _broker_entity_evidence(self, text_tokens: List[str], broker_tokens: List[str]) -> bool:
        """Detect exact, fuzzy, or abbreviated broker entity words."""
        broker_entities = set(broker_tokens) & BROKER_ENTITY_WORDS
        if not broker_entities:
            return False

        for entity in broker_entities:
            for token in text_tokens:
                if token in TRANSACTION_NOISE_TOKENS or token in BANK_ONLY_TOKENS:
                    continue
                if token == entity:
                    return True
                if len(token) >= 5 and fuzz.ratio(entity, token) / 100.0 >= 0.88:
                    return True
                if 2 <= len(token) <= 4 and entity.startswith(token):
                    return True
        return False

    def _broker_compact_evidence(self, text: str, broker_name: str, common_words: set = None) -> bool:
        """Detect broker names collapsed into one narration token.

        Example: SMC GLOBAL SECURITIES LIMITED may appear as
        SMCGLOBALSECURITIESLTDDSCN5218. This requires the broker's distinctive
        token sequence plus entity context, so generic suffixes alone cannot hit.
        """
        if common_words is None:
            common_words = COMMON_WORDS

        broker_tokens = self.normalize_text(broker_name).split()
        meaningful = [
            t for t in broker_tokens
            if t not in {"limited", "ltd", "private", "pvt"}
            and t not in TRANSACTION_NOISE_TOKENS
            and len(t) >= 3
        ]
        broker_has_entity_context = bool(set(meaningful) & BROKER_ENTITY_WORDS) or "limited" in broker_tokens or "ltd" in broker_tokens
        if len(meaningful) < 2 or not broker_has_entity_context:
            return False

        distinctive = [
            t for t in meaningful
            if t not in BROKER_ENTITY_WORDS and t not in BANK_ONLY_TOKENS and t not in common_words
        ]
        if not distinctive:
            return False

        compact_text = re.sub(r"[^a-z0-9]", "", self.normalize_text(text))
        if not compact_text:
            return False

        compact_name = "".join(meaningful)
        if len(compact_name) >= 8 and compact_name in compact_text:
            return True

        # Some statements include just a brand/acronym plus the entity word.
        for brand in distinctive:
            for entity in set(meaningful) & BROKER_ENTITY_WORDS:
                entity_variants = {entity}
                if entity == "limited":
                    entity_variants.update({"ltd", "limi"})
                for variant in entity_variants:
                    pair = f"{brand}{variant}"
                    if len(pair) >= 8 and pair in compact_text:
                        return True

        if len(distinctive) >= 2:
            compact_distinctive = "".join(distinctive)
            if (
                len(compact_distinctive) >= 8
                and compact_distinctive in compact_text
                and set(distinctive) & BROKER_BRAND_TOKENS
            ):
                    return True

        return False

    def _has_significant_match(self, text: str, broker_name: str, common_words: set = None) -> bool:
        """Check if text has a fuzzy match for at least one significant broker token."""
        if self._broker_compact_evidence(text, broker_name, common_words):
            return True

        sig_broker = self._get_significant_tokens(broker_name, common_words, for_broker=True)
        if not sig_broker:
            return False
        text_tokens = self.normalize_text(text).split()
        broker_tokens = self.normalize_text(broker_name).split()
        broker_has_entity_word = bool(set(broker_tokens) & BROKER_ENTITY_WORDS)
        has_entity_evidence = self._broker_entity_evidence(text_tokens, broker_tokens)
        ignored_text_tokens = TRANSACTION_NOISE_TOKENS
        if not broker_has_entity_word:
            ignored_text_tokens = ignored_text_tokens | BANK_ONLY_TOKENS
        clean_text_tokens = [
            t for t in text_tokens
            if t not in ignored_text_tokens and len(t) >= 3
        ]
        if not clean_text_tokens:
            return False

        has_entity_word = bool(set(text_tokens) & set(broker_tokens) & BROKER_ENTITY_WORDS)
        has_entity_context = has_entity_word or has_entity_evidence
        strong_matches = []
        exact_matches = []
        for sig in sig_broker:
            for t in clean_text_tokens:
                if len(t) < 3:
                    continue
                # Use fuzzy ratio instead of exact match - "ABC" should match "ABCD" at 0.75
                score = fuzz.ratio(sig, t) / 100.0
                if score >= 0.88:
                    strong_matches.append(sig)
                    if sig == t:
                        exact_matches.append(sig)
                    break

        if not strong_matches:
            return False

        if self._is_person_like_broker_name(broker_name) and not has_entity_context:
            return False

        # Avoid matching ordinary person/merchant abbreviations such as
        # "GAURAV CH" to "GAURAV SHARES TRADING..." unless the transaction text
        # itself carries a broker/entity word.
        if len(strong_matches) == 1 and len(sig_broker) > 1 and not has_entity_context:
            matched = strong_matches[0]
            if matched not in BROKER_BRAND_TOKENS:
                return False

        # If the broker name contains an entity word, prefer seeing either that
        # entity word or two pieces of distinctive evidence in the text.
        if broker_has_entity_word and has_entity_evidence and strong_matches:
            return True

        if broker_has_entity_word and not has_entity_word and len(strong_matches) < 2:
            return strong_matches[0] in BROKER_BRAND_TOKENS

        if not broker_has_entity_word and not has_entity_context:
            return len(exact_matches) >= 2

        return True

    def match_broker_names(self, text: str, brokers: List[str],
                          exclusions: List[str] = None,
                          common_words: List[str] = None) -> List[Dict[str, Any]]:
        """Match text against broker names, respecting exclusions.
        
        Only returns matches where at least one significant (non-generic)
        token from the broker name appears in the text.
        """
        text_tokens = set(self.normalize_text(text).split())
        if text_tokens and text_tokens <= BANK_COUNTERPARTY_TOKENS:
            return []
        if text_tokens and text_tokens <= (BANK_COUNTERPARTY_TOKENS | TRANSACTION_NOISE_TOKENS):
            return []

        if exclusions:
            brokers = [b for b in brokers if b not in exclusions]
        
        common_set = set(w.lower() for w in (common_words or [])) if common_words else COMMON_WORDS
        
        matches = self.find_matches(text, brokers)
        matched_names = {m["original"] for m in matches}
        for broker in brokers:
            if broker in matched_names:
                continue
            if self._has_significant_match(text, broker, common_set):
                score = max(
                    fuzz.token_set_ratio(self.normalize_text(text), self.normalize_text(broker)) / 100.0,
                    self.threshold,
                )
                matches.append({
                    "original": broker,
                    "score": round(min(score, 0.95), 3),
                    "matched": True,
                })

        filtered = []
        for m in matches:
            if self._has_significant_match(text, m["original"], common_set):
                filtered.append(m)
        filtered.sort(key=lambda x: x["score"], reverse=True)
        return filtered
    
    def batch_match(self, texts: List[str], candidates: List[str]) -> List[List[Dict[str, Any]]]:
        """Batch match multiple texts against candidates."""
        return [self.find_matches(text, candidates) for text in texts]
