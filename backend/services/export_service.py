from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.worksheet import Worksheet
from typing import List, Dict
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

        header_row = 1

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

        data_end_row = ws.max_row
        meta_start_row = ws.max_row + 2
        ws.cell(row=meta_start_row, column=1, value="Sheet Metadata").font = Font(bold=True)
        ws.cell(row=meta_start_row, column=1).fill = title_fill
        ws.merge_cells(start_row=meta_start_row, start_column=1, end_row=meta_start_row, end_column=len(headers))

        ws.cell(row=meta_start_row+1, column=1, value="Account / Session").font = Font(bold=True)
        ws.cell(row=meta_start_row+1, column=2, value=session_name)

        ws.cell(row=meta_start_row+2, column=1, value="Transaction Count").font = Font(bold=True)
        ws.cell(row=meta_start_row+2, column=2, value=len(transactions))

        ws.cell(row=meta_start_row+3, column=1, value="Sheet Category").font = Font(bold=True)
        ws.cell(row=meta_start_row+3, column=2, value=title)

        for r in range(meta_start_row, meta_start_row+4):
            for c in range(1, len(headers) + 1):
                ws.cell(row=r, column=c).border = thin_border

        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A{header_row}:{ws.cell(row=data_end_row, column=len(headers)).coordinate}"

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
