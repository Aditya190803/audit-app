import fitz  # PyMuPDF
import pdfplumber
import os
from typing import List, Dict, Any, Optional, Callable
import pytesseract
from PIL import Image
import io

class PDFService:
    def __init__(self, tesseract_path: Optional[str] = None):
        if tesseract_path and os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
    
    def extract_text(self, pdf_path: str, password: Optional[str] = None,
                     progress_callback: Optional[Callable[[int, int], None]] = None) -> List[Dict[str, Any]]:
        """Extract text and metadata from all pages in parallel."""
        import concurrent.futures
        from backend.services.pdf_worker import _process_page_text
        
        doc = fitz.open(pdf_path)
        if doc.is_encrypted:
            if not password or not doc.authenticate(password):
                doc.close()
                raise ValueError(f"PDF is encrypted and requires a valid password: {pdf_path}")
        num_pages = len(doc)
        doc.close()
        
        pages = []
        tesseract_cmd = getattr(pytesseract.pytesseract, 'tesseract_cmd', None)
        
        max_workers = min(2, max(1, os.cpu_count() or 2))
        
        with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_process_page_text, pdf_path, password, i, tesseract_cmd): i for i in range(num_pages)}
            for i, future in enumerate(concurrent.futures.as_completed(futures)):
                try:
                    pages.append(future.result())
                except Exception as e:
                    print(f"[PDFService] Error processing page text: {e}")
                if progress_callback:
                    progress_callback(i + 1, num_pages)
        
        pages.sort(key=lambda x: x["page_number"])
        return pages
    
    def extract_tables(self, pdf_path: str, password: Optional[str] = None,
                       progress_callback: Optional[Callable[[int, int], None]] = None) -> List[Dict[str, Any]]:
        """Extract tables from PDF using pdfplumber in parallel."""
        import concurrent.futures
        from backend.services.pdf_worker import _process_page_tables
        
        doc = fitz.open(pdf_path)
        if doc.is_encrypted:
            if not password or not doc.authenticate(password):
                doc.close()
                raise ValueError(f"PDF is encrypted and requires a valid password: {pdf_path}")
        num_pages = len(doc)
        doc.close()

        tables = []
        max_workers = min(2, max(1, os.cpu_count() or 2))
        
        with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_process_page_tables, pdf_path, password, i): i for i in range(num_pages)}
            for i, future in enumerate(concurrent.futures.as_completed(futures)):
                try:
                    tables.extend(future.result())
                except Exception as e:
                    print(f"[PDFService] Error processing page tables: {e}")
                if progress_callback:
                    progress_callback(i + 1, num_pages)
        
        tables.sort(key=lambda x: x["page_number"])
        return tables
    
    def parse_transactions(self, pdf_path: str, password: Optional[str] = None, 
                           bank_name: Optional[str] = None,
                           progress_callback: Optional[Callable[[str, int, int], None]] = None) -> List[Dict[str, Any]]:
        """Parse transactions from PDF using the parser registry."""
        from backend.services.parsers import registry
        def table_progress(done: int, total: int):
            if progress_callback:
                progress_callback("tables", done, total)

        def text_progress(done: int, total: int):
            if progress_callback:
                progress_callback("text", done, total)

        tables = self.extract_tables(pdf_path, password, table_progress)
        pages = self.extract_text(pdf_path, password, text_progress)

        parser = None
        if bank_name:
            parser = registry.get_by_name(bank_name)

        if not parser:
            scored = []
            for p in registry.parsers:
                if p.name == "generic":
                    continue
                score = p.detect(tables, pages)
                if score > 0.3:
                    scored.append((p, score))
            scored.sort(key=lambda x: x[1], reverse=True)

            for p, score in scored:
                try:
                    transactions = p.parse(tables, pages)
                    if transactions:
                        return transactions
                except Exception as e:
                    print(f"[PDFService] Parser {p.name} failed: {e}")
                    continue

            generic = registry.get_by_name("generic")
            try:
                transactions = generic.parse(tables, pages)
                if transactions:
                    return transactions
            except Exception as e:
                print(f"[PDFService] Generic parser also failed: {e}")

            return []

        try:
            transactions = parser.parse(tables, pages)
            if not transactions and parser.name != "generic":
                generic = registry.get_by_name("generic")
                transactions = generic.parse(tables, pages)
        except Exception as e:
            print(f"[PDFService] Parser {parser.name} failed: {e}")
            generic = registry.get_by_name("generic")
            try:
                transactions = generic.parse(tables, pages)
            except Exception as e2:
                print(f"[PDFService] Generic parser also failed: {e2}")
                transactions = []

        return transactions

    def get_page_count(self, pdf_path: str, password: Optional[str] = None) -> int:
        """Return the number of pages in a PDF."""
        doc = fitz.open(pdf_path)
        if doc.is_encrypted:
            if not password or not doc.authenticate(password):
                doc.close()
                raise ValueError(f"PDF is encrypted and requires a valid password: {pdf_path}")
        page_count = len(doc)
        doc.close()
        return page_count

    def get_text_with_positions(self, pdf_path: str, password: Optional[str] = None) -> List[Dict[str, Any]]:
        """Extract text with bounding box positions for highlighting."""
        doc = fitz.open(pdf_path)
        if doc.is_encrypted:
            if not password or not doc.authenticate(password):
                doc.close()
                raise ValueError(f"PDF is encrypted and requires a valid password: {pdf_path}")
        
        words = []
        for page_num in range(len(doc)):
            page = doc[page_num]
            word_list = page.get_text("words")
            for w in word_list:
                words.append({
                    "page_number": page_num + 1,
                    "text": w[4],
                    "x0": w[0],
                    "y0": w[1],
                    "x1": w[2],
                    "y1": w[3]
                })
        
        doc.close()
        return words
