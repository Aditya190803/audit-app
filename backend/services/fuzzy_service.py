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
            
            # Use both partial_ratio (substring match) and token_sort_ratio
            partial_score = fuzz.partial_ratio(normalized_text, normalized) / 100.0
            token_score = fuzz.token_sort_ratio(normalized_text, normalized) / 100.0
            # Take the best of both
            score = max(partial_score, token_score)
            
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
        
        # Filter out weak short-name matches
        filtered = []
        for match in matches:
            name = match["original"]
            # Short names need higher confidence to avoid substring false positives
            min_tokens = len(self.normalize_text(name).split())
            if min_tokens <= 2 and len(name.strip()) < 6:
                if match["score"] < 0.9:
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
    
    def _get_significant_tokens(self, name: str, common_words: set = None) -> set:
        """Extract tokens from a name, excluding common corporate words."""
        if common_words is None:
            common_words = COMMON_WORDS
        tokens = set(self.normalize_text(name).split())
        return {t for t in tokens if t not in common_words and len(t) >= 3}

    def _has_significant_match(self, text: str, broker_name: str, common_words: set = None) -> bool:
        """Check if text has a fuzzy match for at least one significant broker token."""
        sig_broker = self._get_significant_tokens(broker_name, common_words)
        if not sig_broker:
            return False
        text_tokens = self.normalize_text(text).split()
        # Check if any significant broker token fuzzy-matches any text token
        for sig in sig_broker:
            for t in text_tokens:
                if len(t) < 3:
                    continue
                score = fuzz.ratio(sig, t) / 100.0
                if score >= 0.75:
                    return True
        return False

    def match_broker_names(self, text: str, brokers: List[str],
                          exclusions: List[str] = None,
                          common_words: List[str] = None) -> List[Dict[str, Any]]:
        """Match text against broker names, respecting exclusions.
        
        Only returns matches where at least one significant (non-generic)
        token from the broker name appears in the text.
        """
        if exclusions:
            brokers = [b for b in brokers if b not in exclusions]
        
        common_set = set(w.lower() for w in (common_words or [])) if common_words else COMMON_WORDS
        
        matches = self.find_matches(text, brokers)
        filtered = []
        for m in matches:
            if self._has_significant_match(text, m["original"], common_set):
                filtered.append(m)
        return filtered
    
    def batch_match(self, texts: List[str], candidates: List[str]) -> List[List[Dict[str, Any]]]:
        """Batch match multiple texts against candidates."""
        return [self.find_matches(text, candidates) for text in texts]
