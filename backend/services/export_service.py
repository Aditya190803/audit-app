import csv
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
import fitz
from typing import List, Dict, Any, Optional, Union
from sqlalchemy.orm import Session
from backend.models import Transaction, Tag
from backend.services.pdf_service import PDFService
import os

class ExportService:
    def __init__(self, db: Session):
        self.db = db
    
    def export_csv(self, transactions: List[Transaction], file_path: str):
        """Export transactions to CSV."""
        data = []
        for tx in transactions:
            tags = self.db.query(Tag).filter(Tag.transaction_id == tx.id).all()
            tag_types = [t.tag_type for t in tags]
            tag_reasons = [t.reason for t in tags]
            
            data.append({
                "id": tx.id,
                "date": tx.date,
                "debit": -tx.amount if tx.amount and tx.amount < 0 else '',
                "credit": tx.amount if tx.amount and tx.amount > 0 else '',
                "description": tx.description,
                "party_name": tx.party_name,
                "tags": ", ".join(tag_types),
                "tag_reasons": "; ".join(tag_reasons),
                "page_number": tx.page_number
            })
        
        df = pd.DataFrame(data)
        df.to_csv(file_path, index=False)
        return file_path
    
    def export_excel(self, transactions: List[Transaction], file_path: str):
        """Export transactions to Excel with styled headers."""
        wb = Workbook()
        ws = wb.active
        ws.title = "Transactions"
        
        # Headers
        headers = ["ID", "Date", "Debit", "Credit", "Description", "Party Name", "Tags", "Tag Reasons", "Page"]
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")
        
        # Data
        for row, tx in enumerate(transactions, 2):
            tags = self.db.query(Tag).filter(Tag.transaction_id == tx.id).all()
            tag_types = [t.tag_type for t in tags]
            tag_reasons = [t.reason for t in tags]
            
            # Color row based on tag type
            fill = None
            if "suspicious" in tag_types:
                fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
            elif "broker" in tag_types:
                fill = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
            elif "client" in tag_types:
                fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
            
            values = [tx.id, tx.date,
                     -tx.amount if tx.amount and tx.amount < 0 else '',
                     tx.amount if tx.amount and tx.amount > 0 else '',
                     tx.description, tx.party_name, 
                     ", ".join(tag_types), "; ".join(tag_reasons), tx.page_number]
            
            for col, value in enumerate(values, 1):
                cell = ws.cell(row=row, column=col, value=value)
                if fill:
                    cell.fill = fill
        
        # Auto-adjust column widths
        for col in ws.columns:
            max_length = 0
            column = col[0].column_letter
            for cell in col:
                try:
                    if cell.value:
                        max_length = max(max_length, len(str(cell.value)))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            ws.column_dimensions[column].width = adjusted_width
        
        wb.save(file_path)
        return file_path
    
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
            
            search_text = tx.raw_text or tx.description or tx.party_name or ""
            if not search_text:
                continue

            page_rects = self._find_transaction_rects(doc, search_text, tx.page_number)
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

    def _find_transaction_rects(self, doc: fitz.Document, search_text: str, page_number: Optional[int]):
        page_indexes = []
        if page_number and 1 <= page_number <= len(doc):
            page_indexes.append(page_number - 1)
        page_indexes.extend(i for i in range(len(doc)) if i not in page_indexes)

        for page_index in page_indexes:
            page = doc[page_index]
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
                if source.is_encrypted and password:
                    source.authenticate(password)
                merged.insert_pdf(source)
        finally:
            for source in opened_docs:
                source.close()
        return merged
    
    def export_clean_pdf_report(self, transactions: List[Transaction], 
                                output_path: str,
                                session_name: str = "Audit Report"):
        """Create a clean PDF summary report."""
        doc = fitz.open()
        page = doc.new_page()
        
        # Title
        title = f"Bank Audit Report: {session_name}"
        page.insert_text((50, 50), title, fontsize=20, color=(0, 0, 0))
        page.insert_text((50, 80), f"Generated: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')}", fontsize=10, color=(0.5, 0.5, 0.5))
        
        # Summary
        tags = self.db.query(Tag).filter(Tag.transaction_id.in_([t.id for t in transactions])).all()
        client_count = sum(1 for t in tags if t.tag_type == "client")
        broker_count = sum(1 for t in tags if t.tag_type == "broker")
        suspicious_count = sum(1 for t in tags if t.tag_type == "suspicious")
        
        y = 120
        page.insert_text((50, y), "Summary:", fontsize=14, color=(0, 0, 0))
        y += 25
        page.insert_text((70, y), f"Total Transactions: {len(transactions)}", fontsize=11)
        y += 20
        page.insert_text((70, y), f"Client Tags: {client_count}", fontsize=11, color=(0, 0.5, 0))
        y += 20
        page.insert_text((70, y), f"Broker Tags: {broker_count}", fontsize=11, color=(0.8, 0.6, 0))
        y += 20
        page.insert_text((70, y), f"Suspicious Tags: {suspicious_count}", fontsize=11, color=(0.8, 0, 0))
        
        # Tagged transactions table
        y += 40
        page.insert_text((50, y), "Tagged Transactions:", fontsize=14, color=(0, 0, 0))
        y += 25
        
        for tx in transactions:
            tx_tags = [t for t in tags if t.transaction_id == tx.id]
            if tx_tags:
                tag_str = ", ".join([f"{t.tag_type}({t.confidence:.0%})" for t in tx_tags])
                line = f"{tx.date or 'N/A'} | {tx.amount or 0:.2f} | {tx.party_name or 'N/A'} | {tag_str}"
                if y > 750:
                    page = doc.new_page()
                    y = 50
                page.insert_text((50, y), line, fontsize=9)
                y += 15
        
        doc.save(output_path)
        doc.close()
        return output_path
