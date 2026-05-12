# Quality of Life Improvements

## P0 (Blocks Core Workflow)

- [ ] **Bulk tag operations** — select multiple transactions (Shift+click range) and apply/remove a tag in one click. Currently only single-tag via keyboard shortcuts (`Ctrl+1/2/3`).
- [ ] **Suspicious keyword editor UI** — the settings panel shows `suspicious_threshold` as a slider but has no UI for editing `suspicious_keywords`. Add a tag/chip input to add/remove keywords.
- [ ] **Undo for manual tags** — "Tag removed" toast with an Undo button that restores the previous tag state (currently manual tag overwrites are immediate and silent).

## P1 (Major Workflow Improvement)

- [ ] **Upload progress bar** — parsing multiple PDFs takes 30-60s. Show per-file progress with filename, page count, and ETA instead of a generic spinner.
- [ ] **Column visibility toggles** — let users hide/show columns (phone, raw_text, bounding_box_json, etc.) to reduce visual noise. Persist preference per session.
- [ ] **Session search/filter** — a search box above the session list to filter by name, date range, or tag counts.
- [ ] **Session rename** — double-click the session name in the sidebar to rename it without going through settings.
- [ ] **Export selection only** — "Export → Selected" option that exports only the checked rows, using the same CSV/Excel/PDF formats.
- [ ] **Per-PDF password input** — currently one password field for all PDFs. If multiple encrypted PDFs have different passwords, there's no way to provide them. Show a password input per encrypted file.
- [ ] **Instant PDF validation on drop** — check the file header (`%PDF`) on drop, before the user clicks "Start Audit". Show a red error badge on invalid files immediately.

## P2 (Nice to Have)

### Upload & Processing
- [ ] Drag-to-reorder PDFs
- [ ] Replace existing PDFs via re-drop
- [ ] PDF fingerprint / dedup — hash PDFs on upload and warn if same file processed twice

### Data Table & Review
- [ ] Inline edit of transaction tags — click a tag badge to cycle client → broker → suspicious → none
- [ ] Tag history tooltip — hover to see when applied, by whom, previous tags
- [ ] Saved filter presets — save common filter combos as named presets

### Sidebar & Navigation
- [ ] Session groups/folders
- [ ] Batch delete sessions

### Export
- [ ] Multi-PDF highlight export — merge or zip highlighted PDFs
- [ ] Custom export templates — choose columns and order
- [ ] Export summary report — one-page PDF with metadata + tag counts

### Backend / Data
- [ ] Async PDF parsing — background task with polling endpoint
- [ ] Session merge — combine two sessions
- [ ] Session split — create new session from selected transactions
- [ ] S3/blob storage for uploads

### Phone Matching
- [ ] Smart phone column detection — scan header names AND first 5 data cells for patterns
- [ ] Phone match preview — show detected phone numbers before processing

### Config & Settings
- [ ] Config profiles — save named profiles (threshold, keywords, exclusions)
- [ ] Import/export settings as JSON

### Code Quality
- [ ] Stricter `pdf_path` typing — add `pdf_paths: string[]` to API schema
- [ ] Auto-generated API docs — surface `/docs` in settings panel
- [ ] Unified error handling — standardize error response shape
- [ ] Add test suite — phone normalization, recurring window, multi-PDF, suspicious exclusion, manual tag cleanup
- [ ] Structured logging — replace `print()` with request_id/session_id logging
- [ ] CI pipeline — lint, type-check, format on every commit
