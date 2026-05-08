import fitz  # PyMuPDF
import pdfplumber
import os
from typing import List, Dict, Any, Optional
import pytesseract
from PIL import Image
import io

class PDFService:
    def __init__(self, tesseract_path: Optional[str] = None):
        if tesseract_path and os.path.exists(tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
    
    def extract_text(self, pdf_path: str, password: Optional[str] = None) -> List[Dict[str, Any]]:
        """Extract text and metadata from all pages."""
        doc = fitz.open(pdf_path)
        if doc.is_encrypted and password:
            doc.authenticate(password)
        
        pages = []
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            
            # If page has no text, try OCR
            if not text.strip():
                text = self._ocr_page(page)
            
            pages.append({
                "page_number": page_num + 1,
                "text": text,
                "width": page.rect.width,
                "height": page.rect.height
            })
        
        doc.close()
        return pages
    
    def _ocr_page(self, page: fitz.Page) -> str:
        """OCR a page using pytesseract."""
        try:
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            text = pytesseract.image_to_string(img)
            return text
        except Exception as e:
            return f""
    
    def extract_tables(self, pdf_path: str, password: Optional[str] = None) -> List[Dict[str, Any]]:
        """Extract tables from PDF using pdfplumber."""
        tables = []
        with pdfplumber.open(pdf_path, password=password) as pdf:
            for page_num, page in enumerate(pdf.pages):
                page_tables = page.extract_tables()
                for table in page_tables:
                    tables.append({
                        "page_number": page_num + 1,
                        "data": table
                    })
        return tables
    
    def parse_transactions(self, pdf_path: str, password: Optional[str] = None, 
                          bank_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Parse transactions from PDF using the parser registry."""
        from backend.services.parsers import registry
        tables = self.extract_tables(pdf_path, password)
        pages = self.extract_text(pdf_path, password)

        parser = None
        if bank_name:
            parser = registry.get_by_name(bank_name)

        if not parser:
            parser = registry.detect(tables, pages)

        transactions = parser.parse(tables, pages)

        # Fallback to generic if a specialized parser returned nothing
        if not transactions and parser.name != "generic":
            generic = registry.get_by_name("generic")
            transactions = generic.parse(tables, pages)

        return transactions

    def get_text_with_positions(self, pdf_path: str, password: Optional[str] = None) -> List[Dict[str, Any]]:
        """Extract text with bounding box positions for highlighting."""
        doc = fitz.open(pdf_path)
        if doc.is_encrypted and password:
            doc.authenticate(password)
        
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
