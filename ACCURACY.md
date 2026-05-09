# Accuracy Improvements

Prioritized list of fixes to improve transaction tagging accuracy. Ordered by impact vs. effort.

---

## P0 — Critical (wrong tags / data corruption)

### P0-1: Per-session threshold ignored
The threshold set during PDF upload is stored in `settings_snapshot` but `auto_tag_session()` reads the **global** config threshold instead. Every session uses the same global value regardless of what the auditor entered on the upload form.

- **File:** `tagging_service.py:71` reads `self.config.get_threshold()` — should use session's snapshot
- **File:** `transactions.py:94` stores to `settings["suspicious_threshold"]` — never read back

### P0-2: Parenthesized amounts parsed as positive
The amount parser `_parse_amount_cell()` replaces `(` with `-` in cleaning, but the regex `[\d]+\.\d{2}` captures **only digits**, dropping the negative sign. `(1,000.00)` → `-1000.00` → regex matches `1000.00` → returned as **positive**. Every debit in parentheses becomes a credit.

- **File:** `base.py:47-57`

### P0-3: Excluded brokers doesn't work
The filter checks `c.get('broker')` but client dicts have no top-level `broker` key — it's nested inside `raw_data`. The exclusion is always a no-op; excluded brokers are still matched.

- **File:** `transactions.py:60-66`

### P0-4: Phone matching false positives
`_extract_phone_candidates` strips all non-digits then finds any 10-15 digit sequence. UPI references (`paytmqr281005055` → 14 digits), account numbers, cheque numbers, transaction IDs all trigger false phone matches, causing wrong client tags.

- **File:** `tagging_service.py:44-54`

### P0-5: Significant-token gate too strict (my change)
`_has_significant_match` uses **exact token match**. If fuzzy finds "ABCD Ltd" for broker "ABC Capital", the significant token `"abc"` won't match `"abcd"` and the match is rejected despite 85%+ fuzzy score. Need to use the same fuzzy comparison for significant tokens too.

- **File:** `fuzzy_service.py:103-109`

---

## P1 — High (noise / false flags)

### P1-1: Suspicious keyword list too broad
`suspicious_keywords` contains `securities`, `shares`, `trading`, `stock`, `investment`, `brokerage`, `fee`, `commission`, `margin`, `payout` — words that appear in nearly **every** transaction of a securities audit. Most transactions get flagged as suspicious, burying genuinely suspicious activity.

- **File:** `defaults.py:41-57`

### P1-2: Recurring ignores debit/credit direction
Uses `abs(amount)` so ₹1000 **debit** + ₹1000 **credit** to same party within 30 days = flagged "recurring". These are opposite-direction flows, not recurring patterns.

- **File:** `tagging_service.py:199`

### P1-3: Client + broker tags can coexist
No mutual exclusion between client and broker tags. A transaction can get both a client tag (fuzzy name match) and a broker tag. The frontend only shows `tags[0]` — the second tag is invisible.

- **File:** `tagging_service.py:128-173`

### P1-4: Duplicate client tags from fuzzy + phone
A single transaction can receive both a fuzzy client tag AND a phone client tag for the same person. No deduplication.

- **File:** `tagging_service.py:128-157`

### P1-5: Tag undo corrupts auto-tags
Undo calls `addTag()` API which creates tags with `is_manual=True` + `source="manual"`. If the original was an auto-tag, it's now permanent. Later re-auto-tag runs (which delete only `is_manual=False` tags) will skip it.

- **File:** `AppShell.tsx:197-224`, `tags.py:17-33`

---

## P2 — Medium (edge cases / minor wrong tags)

| ID | Issue | File(s) |
|----|-------|---------|
| P2-1 | **Short name client false positives** — `partial_ratio` matches short names like "Raj" against "Rajesh Kumar" in transaction text. No significant-token gate exists for client matching (unlike broker matching). | `fuzzy_service.py:48-52` |
| P2-2 | **First Kotak transaction silently dropped** — If first row's debit/credit count matches the rest equally, `types[0]` stays `None` and no amount is assigned. | `kotak_mahindra.py:120-131` |
| P2-3 | **ICICI party name fallback = raw description** — When no UPI/BIL/CMS/ACH/IMPS pattern matches, the raw description (with bank names, ref numbers) becomes the party name, feeding garbage into matching. | `icici_detailed.py:244` |
| P2-4 | **Broker aliases produce duplicate tags** — Broker names and aliases are flattened into a single list. Both "ICICI Securities" and its alias "ICICI Securities Limited" can match the same transaction. | `tagging_service.py:61-64` |
| P2-5 | **Deleted brokers persist in config** — `delete_broker` removes the model row but never updates the config's `broker_list`. Stale names continue to be matched. | `brokers.py:44-52` |
| P2-6 | **Renamed brokers create duplicates** — `update_broker` changes the model's name but doesn't update `broker_list` in config. Both old and new names may be missing/duplicated. | `brokers.py:32-42` |
| P2-7 | **Phone-matched client names not displayed** — `extractMatchedName` looks for single-quoted names (`'John Doe'`). Phone-match reasons use arrow format (`Phone match: 9876543210 -> John Doe`), so the matched name is not shown. | `TagBadge.tsx:16-20` |
| P2-8 | **Date components parsed as amounts (generic parser)** — Regex `[\d,]+\.\d{2}` matches `01.02` from a date like `01.02.2024`. Row parser could treat a date cell as an amount. | `generic.py:143` |
| P2-9 | **"balance" keyword skips legitimate lines (ICICI numbered)** — If a transaction description contains "balance", the entire line is skipped. | `icici_numbered.py:94` |

---

## P3 — Low (usability / correctness at margins)

| ID | Issue | File(s) |
|----|-------|---------|
| P3-1 | `tag_priority` config defined in defaults but never used anywhere | `defaults.py:20` |
| P3-2 | Tag summary doesn't distinguish manual vs. auto tags | `tagging_service.py:257-275` |
| P3-3 | Amount filter in DataTable uses `Math.abs()` — cannot filter credits vs. debits | `DataTable.tsx:90-91` |
| P3-4 | `update_many` commits each key individually — partial update on failure | `config_service.py:37-39` |
| P3-5 | `formatSuspiciousReason` regex `[\d.]+` extracts first number, not necessarily the amount | `TagBadge.tsx:29` |
| P3-6 | Header detection limited to first 5 rows | `base.py:20` |
| P3-7 | `synchronize_session=False` without explicit flush — stale in-memory state | `tagging_service.py:79-82` |
| P3-8 | Bulk tag does N+1 commits for N transactions | `tags.py:48-64` |
| P3-9 | `BulkTagRequest` accepts `tag_type: str` without enum validation | `schemas.py:152` |
| P3-10 | PDF highlight export search is case-sensitive | `export_service.py:121` |
| P3-11 | CSV export doesn't clearly distinguish debits from credits | `export_service.py:27` |
| P3-12 | No undo/redo state for manual tag changes | `tagging_service.py:217-236` |
