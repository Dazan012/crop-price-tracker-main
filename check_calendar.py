import pdfplumber

# Check the sunflower planting calendar PDF
pdf_path = r'F:\project 1\crop-price-tracker\kilimo_pdfs\pdfs\sw-1734269018-KALENDA YA KUPANDA ZAO LA ALIZETI KWA KILA KANDA.pdf'
try:
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            print(f'--- Page {i+1} ---')
            print(text[:2000] if text else '(empty)')
            print()
except Exception as e:
    print(f'Error: {e}')
