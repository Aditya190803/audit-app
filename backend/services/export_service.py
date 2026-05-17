from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.worksheet import Worksheet
import fitz
from typing import List, Dict, Optional, Union
from sqlalchemy.orm import Session
from backend.models import Transaction, Tag
import re

class ExportService:
    def __init__(self, db: Session):
        self.db = db
    
    def export_excel(self, transactions: List[Transaction], file_path: str, session_name: str = "Audit"):
        """Export transactions to a formatted multi-sheet Excel workbook."""
        wb = Workbook()

        all_tags = self._tags_by_transaction(transactions)
        suspicious_transactions = self._filter_by_tag(transactions, "suspicious", all_tags)
        suspicious_breakdown = self._suspicious_breakdown(suspicious_transactions, all_tags)
        sheets = [
            ("Account Transactions", transactions),
            ("Client", self._filter_by_tag(transactions, "client", all_tags)),
            ("Broker", self._filter_by_tag(transactions, "broker", all_tags)),
            ("Suspicious", suspicious_transactions),
            ("Suspicious - Recurring", suspicious_breakdown["recurring"]),
            ("Suspicious - High Value", suspicious_breakdown["high_value"]),
            ("Suspicious - Other", suspicious_breakdown["other"]),
        ]

        for index, (title, sheet_transactions) in enumerate(sheets):
            ws = wb.active if index == 0 else wb.create_sheet()
            ws.title = title
            self._write_transaction_sheet(ws, sheet_transactions, all_tags, title, session_name)
            ws.sheet_properties.tabColor = {
                "Account Transactions": "366092",
                "Client": "70AD47",
                "Broker": "FFC000",
                "Suspicious": "C00000",
                "Suspicious - Recurring": "C00000",
                "Suspicious - High Value": "C00000",
                "Suspicious - Other": "C00000",
            }.get(title, "366092")

        wb.save(file_path)
        return file_path

    def _write_transaction_sheet(
        self,
        ws: Worksheet,
        transactions: List[Transaction],
        tags_by_transaction: Dict[int, List[Tag]],
        title: str,
        session_name: str,
    ) -> None:
        headers = [
            "ID",
            "Date",
            "Debit",
            "Credit",
            "Description",
            "Party Name",
            "Payment Method",
            "Tags",
            "Tag Reasons",
            "Review Status",
            "Notes",
            "PDF File",
            "Page",
        ]
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        title_fill = PatternFill(start_color="D9EAF7", end_color="D9EAF7", fill_type="solid")
        subtle_side = Side(style="thin", color="D9E2EC")
        thin_border = Border(left=subtle_side, right=subtle_side, top=subtle_side, bottom=subtle_side)

        ws["A1"] = title
        ws["A1"].font = Font(size=14, bold=True, color="1F2937")
        ws["A1"].fill = title_fill
        ws["A2"] = "Account / Session"
        ws["B2"] = session_name
        ws["A3"] = "Transaction Count"
        ws["B3"] = len(transactions)
        for row in range(1, 4):
            for col in range(1, len(headers) + 1):
                ws.cell(row=row, column=col).border = thin_border
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))

        header_row = 5
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=header_row, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")
            cell.border = thin_border

        sorted_transactions = self._sort_for_sheet(transactions, tags_by_transaction, title)

        for row, tx in enumerate(sorted_transactions, header_row + 1):
            tags = tags_by_transaction.get(tx.id, [])
            tag_types = [t.tag_type for t in tags]
            tag_reasons = [t.reason for t in tags]

            fill = None
            if "suspicious" in tag_types:
                fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
            elif "broker" in tag_types:
                fill = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
            elif "client" in tag_types:
                fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")

            values = [
                tx.id,
                tx.date,
                -tx.amount if tx.amount and tx.amount < 0 else "",
                tx.amount if tx.amount and tx.amount > 0 else "",
                tx.description,
                tx.party_name,
                tx.payment_method,
                ", ".join(tag_types),
                "; ".join(reason for reason in tag_reasons if reason),
                tx.review_status,
                tx.user_notes,
                tx.pdf_filename,
                tx.page_number,
            ]

            for col, value in enumerate(values, 1):
                cell = ws.cell(row=row, column=col, value=value)
                if fill:
                    cell.fill = fill
                cell.alignment = Alignment(vertical="top", wrap_text=col in {5, 9, 11})
                cell.border = thin_border

        if not sorted_transactions:
            empty_row = header_row + 1
            ws.cell(row=empty_row, column=1, value="No transactions in this category")
            ws.cell(row=empty_row, column=1).font = Font(italic=True, color="6B7280")
            ws.cell(row=empty_row, column=1).alignment = Alignment(vertical="top")
            ws.cell(row=empty_row, column=1).border = thin_border
            ws.merge_cells(start_row=empty_row, start_column=1, end_row=empty_row, end_column=len(headers))

        ws.freeze_panes = "A6"
        ws.auto_filter.ref = f"A{header_row}:{ws.cell(row=max(header_row, ws.max_row), column=len(headers)).coordinate}"

        for col in ws.columns:
            max_length = 0
            column = get_column_letter(col[0].column)
            for cell in col:
                if cell.value:
                    try:
                        max_length = max(max_length, len(str(cell.value)))
                    except Exception as e:
                        print(f"[ExportService] Error calculating column width: {e}")
            adjusted_width = min(max_length + 2, 50)
            ws.column_dimensions[column].width = adjusted_width

        for column in ("C", "D"):
            for cell in ws[column][header_row:]:
                cell.number_format = '#,##0.00'

    def _tags_by_transaction(self, transactions: List[Transaction]) -> Dict[int, List[Tag]]:
        transaction_ids = [tx.id for tx in transactions if tx.id is not None]
        if not transaction_ids:
            return {}
        tags = self.db.query(Tag).filter(Tag.transaction_id.in_(transaction_ids)).all()
        grouped: Dict[int, List[Tag]] = {tx_id: [] for tx_id in transaction_ids}
        for tag in tags:
            grouped.setdefault(tag.transaction_id, []).append(tag)
        return grouped

    def _filter_by_tag(self, transactions: List[Transaction], tag_type: str, tags_by_transaction: Dict[int, List[Tag]]) -> List[Transaction]:
        return [
            tx for tx in transactions
            if any(tag.tag_type == tag_type for tag in tags_by_transaction.get(tx.id, []))
        ]

    def _suspicious_breakdown(self, transactions: List[Transaction], tags_by_transaction: Dict[int, List[Tag]]) -> Dict[str, List[Transaction]]:
        grouped = {"recurring": [], "high_value": [], "other": []}
        for tx in transactions:
            grouped[self._suspicious_category(tx, tags_by_transaction)].append(tx)
        return grouped

    def _suspicious_category(self, tx: Transaction, tags_by_transaction: Dict[int, List[Tag]]) -> str:
        suspicious_tags = [tag for tag in tags_by_transaction.get(tx.id, []) if tag.tag_type == "suspicious"]
        reason = " ".join(tag.reason or "" for tag in suspicious_tags).lower()
        if "recurring" in reason:
            return "recurring"
        if "exceeds threshold" in reason:
            return "high_value"
        return "other"

    def _sort_for_sheet(self, transactions: List[Transaction], tags_by_transaction: Dict[int, List[Tag]], title: str) -> List[Transaction]:
        if not title.startswith("Suspicious - Recurring"):
            return transactions
        return sorted(
            transactions,
            key=lambda tx: (
                self._party_sort_key(tx),
                tx.date or "",
                tx.id or 0,
            ),
        )

    def _party_sort_key(self, tx: Transaction) -> str:
        value = tx.party_name or tx.description or tx.raw_text or "Unknown"
        return re.sub(r"\s+", " ", value).strip().casefold()
    
    def export_highlighted_pdf(self, transactions: List[Transaction], 
                               original_pdf_path: Union[str, List[str]], 
                               output_path: str,
                               password: Optional[str] = None):
        """Create a highlighted PDF with tagged transactions annotated."""
        pdf_paths = original_pdf_path if isinstance(original_pdf_path, list) else [original_pdf_path]
        doc = self._open_export_document(pdf_paths, password)
        
        # Color mapping for tags
        colors = {
            "client": (0, 1, 0),      # Green
            "broker": (1, 1, 0),      # Yellow
            "suspicious": (1, 0, 0)   # Red
        }
        
        for tx in transactions:
            tags = self.db.query(Tag).filter(Tag.transaction_id == tx.id).all()
            if not tags:
                continue
            
            page_rects = self._find_transaction_rects(doc, self._highlight_search_candidates(tx), tx.page_number)
            if not page_rects:
                continue

            page, rects = page_rects
            priority = ["client", "broker", "suspicious"]
            tag_type = None
            for p in priority:
                if any(t.tag_type == p for t in tags):
                    tag_type = p
                    break

            if tag_type and tag_type in colors:
                for rect in rects:
                    highlight = page.add_highlight_annot(rect)
                    highlight.set_colors(stroke=colors[tag_type])
                    highlight.update()
        
        doc.save(output_path)
        doc.close()
        return output_path

    def _highlight_search_candidates(self, tx: Transaction) -> List[str]:
        candidates = []
        for value in (tx.raw_text, tx.description, tx.party_name):
            if not value:
                continue
            normalized = re.sub(r"\s+", " ", str(value)).strip()
            if normalized:
                candidates.append(normalized)
            for part in re.split(r"[\n|]{1,}|\s{3,}", str(value)):
                part = re.sub(r"\s+", " ", part).strip()
                if len(part) >= 4:
                    candidates.append(part)

        unique_candidates = []
        seen = set()
        for candidate in candidates:
            key = candidate.casefold()
            if key not in seen:
                seen.add(key)
                unique_candidates.append(candidate)
        return unique_candidates

    def _find_transaction_rects(self, doc: fitz.Document, search_texts: List[str], page_number: Optional[int]):
        if not search_texts:
            return None

        page_indexes = []
        if page_number and 1 <= page_number <= len(doc):
            page_indexes.append(page_number - 1)
        page_indexes.extend(i for i in range(len(doc)) if i not in page_indexes)

        for page_index in page_indexes:
            page = doc[page_index]
            for search_text in search_texts:
                rects = page.search_for(search_text)
                if rects:
                    return page, rects
        return None

    def _open_export_document(self, pdf_paths: List[str], password: Optional[str] = None) -> fitz.Document:
        """Open one or more PDFs as a single logical document for highlighting."""
        if len(pdf_paths) == 1:
            doc = fitz.open(pdf_paths[0])
            if doc.is_encrypted and password:
                doc.authenticate(password)
            return doc

        merged = fitz.open()
        opened_docs = []
        try:
            for pdf_path in pdf_paths:
                source = fitz.open(pdf_path)
                opened_docs.append(source)
                if source.is_encrypted:
                    if not password or not source.authenticate(password):
                        raise ValueError(f"PDF is encrypted and requires a valid password: {pdf_path}")
                merged.insert_pdf(source)
        finally:
            for source in opened_docs:
                source.close()
        return merged
