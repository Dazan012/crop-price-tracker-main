import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'kilimo_pdfs'))

import pdfplumber
from scrape_all import extract_viwanda_prices, parse_viwanda_rows, clean_viwanda_price

pdf_dir = os.path.join(os.path.dirname(__file__), 'prices', 'viwanda_pdfs')
fname = 'sw-1776333884-Wholesale Price 13th April, 2026.pdf'
pdf_path = os.path.join(pdf_dir, fname)

data = extract_viwanda_prices(pdf_path)
entries = parse_viwanda_rows(data) if data else []
print(f"Entries: {len(entries)}")
for e in entries[:5]:
    print(f"  {e['region']} / {e['market']}: {e['prices']}")