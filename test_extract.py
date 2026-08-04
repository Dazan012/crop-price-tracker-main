import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'kilimo_pdfs'))

import pdfplumber
from scrape_all import extract_regional_prices, extract_period_from_pdf

pdf_dir = os.path.join(os.path.dirname(__file__), 'kilimo_pdfs', 'pdfs')
if os.path.exists(pdf_dir):
    tested = 0
    for fname in sorted(os.listdir(pdf_dir)):
        if fname.endswith('.pdf') and 'Mwenendo' in fname:
            pdf_path = os.path.join(pdf_dir, fname)
            regions = extract_regional_prices(pdf_path)
            if regions:
                period = extract_period_from_pdf(pdf_path, {'title': fname})
                print(f"{fname[:50]}... -> {len(regions)} regions, period={period}")
                tested += 1
                if tested >= 10:
                    break
    print(f"\nTested {tested} PDFs successfully")
else:
    print(f"PDF dir not found: {pdf_dir}")