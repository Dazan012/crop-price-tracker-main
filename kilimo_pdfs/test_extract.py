"""Quick test of PDF extraction."""
import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, 'kilimo_pdfs')
from scrape_kilimo import extract_regional_prices, extract_period_from_pdf

pdf_path = 'kilimo_pdfs/latest_sample.pdf'
print('Period:', extract_period_from_pdf(pdf_path))
print()
prices = extract_regional_prices(pdf_path)
print(f'Found {len(prices)} regions:')
for rp in prices:
    print(f"  {rp['region']}: {rp['prices']}")
