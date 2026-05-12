import fitz
import pdfplumber
import pytesseract
from PIL import Image
import io

def _process_page_text(pdf_path, password, page_num, tesseract_cmd):
    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    doc = fitz.open(pdf_path)
    if doc.is_encrypted and password:
        doc.authenticate(password)
    page = doc[page_num]
    text = page.get_text()
    if not text.strip():
        if doc.is_encrypted and not password:
            text = "[ENCRYPTED — provide password to extract text]"
        else:
            try:
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                text = pytesseract.image_to_string(img)
            except Exception:
                text = ""
    return {
        "page_number": page_num + 1,
        "text": text,
        "width": page.rect.width,
        "height": page.rect.height
    }

def _process_page_tables(pdf_path, password, page_num):
    tables = []
    try:
        with pdfplumber.open(pdf_path, password=password) as pdf:
            page = pdf.pages[page_num]
            page_tables = page.extract_tables()
            for table in page_tables:
                tables.append({
                    "page_number": page_num + 1,
                    "data": table
                })
    except Exception:
        pass
    return tables
