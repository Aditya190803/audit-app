from rapidfuzz import fuzz, process
from typing import List, Dict, Any, Optional, Tuple
import re

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
        """Match text against client names and aliases."""
        candidate_names = [c["name"] for c in clients]
        
        # Add aliases to candidates
        if aliases:
            alias_map = {}
            for alias in aliases:
                candidate_names.append(alias["alias_name"])
                alias_map[alias["alias_name"]] = alias["canonical_name"]
        
        matches = self.find_matches(text, candidate_names)
        
        # Resolve aliases to canonical names
        for match in matches:
            if aliases and match["original"] in alias_map:
                match["canonical_name"] = alias_map[match["original"]]
                match["is_alias"] = True
            else:
                match["is_alias"] = False
        
        return matches
    
    def match_broker_names(self, text: str, brokers: List[str],
                          exclusions: List[str] = None) -> List[Dict[str, Any]]:
        """Match text against broker names, respecting exclusions."""
        if exclusions:
            brokers = [b for b in brokers if b not in exclusions]
        
        return self.find_matches(text, brokers)
    
    def batch_match(self, texts: List[str], candidates: List[str]) -> List[List[Dict[str, Any]]]:
        """Batch match multiple texts against candidates."""
        return [self.find_matches(text, candidates) for text in texts]
