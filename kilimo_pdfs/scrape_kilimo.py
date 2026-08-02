"""
Scrape all "Mwenendo wa Bei za Mazao" (Crop Price Trends) PDFs from kilimo.go.tz,
extract regional price tables, and export as JSON for import_kilimo_data.py.

Usage:
    python kilimo_pdfs/scrape_kilimo.py
    python kilimo_pdfs/scrape_kilimo.py --skip-download  # use already-downloaded PDFs
    python kilimo_pdfs/scrape_kilimo.py --start-page 3 --end-page 5
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import ssl

import pdfplumber

BASE_URL = "https://www.kilimo.go.tz"
PUBLICATIONS_URL = BASE_URL + "/publications/default?page={}"
PDF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdfs")
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "all_crop_data.json")

# Crop order in the regional price table (page 2)
# Columns: Mkoa | Wiki | Mahindi | Mchele | Maharage | Mtama | Uwele | Ulezi | Viazi mviringo
REGIONAL_CROP_ORDER = [
    'Maize', 'Rice', 'Beans', 'Sorghum', 'Finger Millet', 'Finger Millet', 'Irish Potatoes'
]

MONTH_MAP = {
    'Januari': 1, 'Februari': 2, 'Machi': 3, 'Aprili': 4,
    'Mei': 5, 'Juni': 6, 'Julai': 7, 'Agosti': 8,
    'Septemba': 9, 'Oktoba': 10, 'Novemba': 11, 'Desemba': 12,
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12,
}

MONTH_NAMES_SW = ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni',
                  'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba']
MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']


def get_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_html(url):
    """Fetch a URL and return the HTML content as string."""
    print(f"  Fetching {url}")
    try:
        with urllib.request.urlopen(url, context=get_ssl_context(), timeout=30) as resp:
            return resp.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}")
        return ""


def extract_pdf_links(html):
    """Extract all 'Mwenendo wa Bei za Mazao' PDF links from the publications page HTML."""
    links = []
    # Pattern: look for <a ... href="...pdf"> with title containing "Mwenendo wa Bei"
    # Find all hrefs ending in .pdf
    pattern = r'href="([^"]*Mwenendo\s*wa\s*Bei[^"]*\.pdf)"'
    for m in re.finditer(pattern, html, re.IGNORECASE):
        url = m.group(1)
        if url.startswith('/'):
            url = BASE_URL + url
        elif not url.startswith('http'):
            url = BASE_URL + '/' + url
        links.append(url)
    return links


def discover_all_pdfs(start_page=1, end_page=10):
    """Crawl all publication pages and return list of PDF URLs."""
    all_links = set()
    for page in range(start_page, end_page + 1):
        print(f"Crawling page {page}/{end_page}...")
        html = fetch_html(PUBLICATIONS_URL.format(page))
        if not html:
            print(f"  Page {page} returned no content, stopping.")
            break
        links = extract_pdf_links(html)
        if not links:
            print(f"  No price bulletin PDFs found on page {page}.")
        for link in links:
            if link not in all_links:
                all_links.add(link)
                print(f"    Found: {os.path.basename(link)}")
    return sorted(all_links)


def encode_url(url):
    parsed = urllib.parse.urlparse(url)
    safe_path = urllib.parse.quote(parsed.path, safe='/:@%')
    return urllib.parse.urlunparse((
        parsed.scheme, parsed.netloc, safe_path,
        parsed.params, parsed.query, parsed.fragment
    ))

def download_pdf(url, output_dir):
    """Download a PDF and return the local file path."""
    raw_filename = urllib.parse.unquote(os.path.basename(url.split('?')[0]))
    filename = raw_filename.strip()
    if not filename.endswith('.pdf'):
        filename += '.pdf'
    filepath = os.path.join(output_dir, filename)

    if len(filename) > 200:
        import hashlib
        short_name = hashlib.md5(url.encode()).hexdigest()[:16] + '.pdf'
        filepath = os.path.join(output_dir, short_name)
        return filepath

    if os.path.exists(filepath):
        print(f"    Already exists: {filename}")
        return filepath

    print(f"    Downloading: {filename}")
    try:
        safe_url = encode_url(url)
        req = urllib.request.Request(safe_url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                          'AppleWebKit/537.36 (KHTML, like Gecko) '
                          'Chrome/120.0.0.0 Safari/537.36'
        })
        with urllib.request.urlopen(req, context=get_ssl_context(), timeout=60) as resp:
            data = resp.read()
            with open(filepath, 'wb') as f:
                f.write(data)
        print(f"    Done: {filename} ({os.path.getsize(filepath)} bytes)")
        return filepath
    except Exception as e:
        print(f"    ERROR downloading {url}: {e}")
        return None


def clean_price(val):
    """Clean a price string: remove spaces, commas, dashes.
    Returns int price or None if invalid/empty.
    """
    if not val or not val.strip():
        return None
    val = val.strip()
    # Remove all spaces
    val = val.replace(' ', '')
    val = val.replace(',', '')
    # Check for dash (no data)
    if val in ('-', '–', '—', 'N/A', '', '.'):
        return None
    # Try to parse as number
    try:
        return int(float(val.replace(',', '')))
    except (ValueError, TypeError):
        return None


def extract_period_from_pdf(pdf_path):
    """Extract the period string from the PDF filename or first page."""
    # Try from filename first
    basename = os.path.basename(pdf_path).replace('..pdf', '.pdf')
    patterns = [
        r'tarehe\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\w+),?\s*(\d{4})',
        r'tarehe\s+(\d{1,2})\s+(\w+)\s*[-–]\s*(\d{1,2})\s+(\w+),?\s*(\d{4})',
        r'(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\w+),?\s*(\d{4})',
    ]
    for pat in patterns:
        m = re.search(pat, basename)
        if m:
            groups = m.groups()
            if len(groups) == 4:
                return f"{groups[0]}-{groups[1]} {groups[2]}, {groups[3]}"
            elif len(groups) == 5:
                return f"{groups[0]} {groups[1]} - {groups[2]} {groups[3]}, {groups[4]}"

    # Try from first page text
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if pdf.pages:
                text = pdf.pages[0].extract_text()
                if text:
                    # Look for date patterns
                    for pat in patterns:
                        m = re.search(pat, text)
                        if m:
                            groups = m.groups()
                            if len(groups) == 4:
                                return f"{groups[0]}-{groups[1]} {groups[2]}, {groups[3]}"
                            elif len(groups) == 5:
                                return f"{groups[0]} {groups[1]} - {groups[2]} {groups[3]}, {groups[4]}"
    except Exception:
        pass

    return None


def find_regional_price_table(data):
    """Check if a table extracted from PDF is a regional price table.
    Returns (clean_data, num_crops) or (None, 0) if not a match.
    """
    if not data or len(data) < 4:
        return None, 0

    # Strategy: look for a row that has "Wiki hii" in column 1 and 
    # a known region name in column 0, plus numeric-looking values in columns 2+
    wiki_hii_row = None
    for r_idx, row in enumerate(data):
        col1 = str(row[1]).strip() if len(row) > 1 and row[1] else ''
        col0 = str(row[0]).strip() if row[0] else ''
        if col1 in ('Wiki hii', 'Wiki hii', 'wiki hii') and col0 and col0 not in ('Wiki', 'Mkoa', ''):
            wiki_hii_row = r_idx
            break

    if wiki_hii_row is None:
        return None, 0

    # Found a regional price table! Determine number of crop columns
    # The structure is: Mkoa | Wiki | Mahindi | Mchele | Maharage | Mtama | Uwele | Ulezi | Viazi mviringo
    # Count non-empty columns after index 1 in the wiki_hii_row
    sample_row = data[wiki_hii_row]
    num_crops = 0
    for col_idx in range(2, len(sample_row)):
        val = str(sample_row[col_idx]).strip() if sample_row[col_idx] else ''
        if val and val != '':
            num_crops += 1
        else:
            break
    # If we got fewer than 3 crops, this might not be our table
    if num_crops < 3:
        return None, 0

    # Trim data to include only rows that are part of this table
    # Start from the row before wiki_hii_row (could be header) or wiki_hii_row itself
    start = max(0, wiki_hii_row - 1)
    return data[start:], num_crops


def extract_regional_prices(pdf_path):
    """Extract regional wholesale price data from a kilimo.go.tz PDF.
    
    Returns list of dicts: [{'region': 'Dodoma', 'prices': [600, 2600, ...]}, ...]
    Each price list follows REGIONAL_CROP_ORDER (Wiki hii/this week prices only).
    """
    results = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_idx in range(min(4, len(pdf.pages))):
                page = pdf.pages[page_idx]
                tables = page.find_tables()
                for table in tables:
                    data = table.extract()
                    clean_data, num_crops = find_regional_price_table(data)
                    if clean_data is None:
                        continue

                    # Process rows
                    current_region = None
                    for row_idx in range(1, len(clean_data)):
                        row = clean_data[row_idx]
                        if len(row) < 2:
                            continue

                        col0 = str(row[0]).strip() if row[0] else ''
                        col1 = str(row[1]).strip() if len(row) > 1 and row[1] else ''

                        # Skip summary rows
                        if col0 in ('Jumla ndogo', 'JUMLA KUU', 'Jumla', 'JUMLA KUU KAKAO', 'Wiki', 'Mkoa', ''):
                            if not col0:
                                # Empty region column = continuation of previous region (skip)
                                pass
                            continue

                        if col1 == 'Wiki hii':
                            current_region = col0
                            prices = []
                            for col in range(2, min(2 + num_crops, len(row))):
                                val = str(row[col]).strip() if col < len(row) and row[col] else '-'
                                prices.append(val)
                            results.append({
                                'region': current_region,
                                'prices': prices,
                            })

    except Exception as e:
        print(f"    ERROR extracting table from {os.path.basename(pdf_path)}: {e}")
        import traceback
        traceback.print_exc()

    # Clean prices
    for rp in results:
        cleaned_prices = []
        for p in rp['prices']:
            cp = clean_price(p)
            cleaned_prices.append(cp)
        rp['prices'] = cleaned_prices

    return results


def process_pdf(pdf_path):
    """Process a single PDF and return the extracted data dict."""
    period = extract_period_from_pdf(pdf_path)
    filename = os.path.basename(pdf_path)

    print(f"  Period: {period}")
    regional_prices = extract_regional_prices(pdf_path)
    print(f"  Regions found: {len(regional_prices)}")

    for rp in regional_prices[:3]:
        print(f"    {rp['region']}: {rp['prices']}")

    return {
        'file': filename,
        'period': period or 'unknown',
        'regional_prices': regional_prices,
    }


def main():
    parser = argparse.ArgumentParser(description='Scrape kilimo.go.tz price PDFs')
    parser.add_argument('--skip-download', action='store_true',
                        help='Skip downloading, use existing PDFs in pdfs/')
    parser.add_argument('--start-page', type=int, default=1,
                        help='First publication page to crawl (default: 1)')
    parser.add_argument('--end-page', type=int, default=10,
                        help='Last publication page to crawl (default: 10)')
    args = parser.parse_args()

    os.makedirs(PDF_DIR, exist_ok=True)

    # Step 1: Discover all PDF URLs
    print("=" * 60)
    print("STEP 1: Discovering all price bulletin PDFs...")
    print("=" * 60)
    pdf_urls = discover_all_pdfs(start_page=args.start_page, end_page=args.end_page)
    print(f"\nTotal price bulletin PDFs found: {len(pdf_urls)}")

    if not pdf_urls:
        print("No PDFs found. Exiting.")
        return

    # Step 2: Download all PDFs
    print("\n" + "=" * 60)
    print("STEP 2: Downloading PDFs...")
    print("=" * 60)
    local_paths = []
    if not args.skip_download:
        for url in pdf_urls:
            local_path = download_pdf(url, PDF_DIR)
            if local_path:
                local_paths.append(local_path)
    else:
        # Use existing files
        for f in sorted(os.listdir(PDF_DIR)):
            if f.endswith('.pdf'):
                local_paths.append(os.path.join(PDF_DIR, f))
        print(f"Using {len(local_paths)} existing PDFs in {PDF_DIR}")

    # Step 3: Extract data from each PDF
    print("\n" + "=" * 60)
    print("STEP 3: Extracting price tables...")
    print("=" * 60)
    all_data = []
    for idx, pdf_path in enumerate(local_paths):
        print(f"\n[{idx + 1}/{len(local_paths)}] {os.path.basename(pdf_path)}")
        pdf_data = process_pdf(pdf_path)
        if pdf_data['regional_prices']:
            all_data.append(pdf_data)
        else:
            print(f"  WARNING: No regional prices extracted, skipping.")

    # Step 4: Write output JSON
    print("\n" + "=" * 60)
    print("STEP 4: Writing output...")
    print("=" * 60)
    output = {
        'source': BASE_URL,
        'total_pdfs': len(all_data),
        'data': all_data,
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"  Output written to: {OUTPUT_FILE}")
    print(f"  PDFs processed: {len(all_data)}")

    # Summary
    total_regions = sum(len(d['regional_prices']) for d in all_data)
    total_price_entries = sum(
        sum(1 for p in d['regional_prices'] for pr in p['prices'] if pr is not None)
        for d in all_data
    )
    print(f"  Total region-bulletin entries: {total_regions}")
    print(f"  Total individual price entries: {total_price_entries}")

    print("\nDone!")


if __name__ == '__main__':
    main()
