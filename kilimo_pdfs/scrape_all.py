"""
Master scraper: crawl kilimo.go.tz, viwanda.go.tz, and related sites
for all agricultural price data, documents, and market information.

Usage:
    python kilimo_pdfs/scrape_all.py
    python kilimo_pdfs/scrape_all.py --source kilimo     # only kilimo.go.tz
    python kilimo_pdfs/scrape_all.py --source viwanda    # only viwanda.go.tz
    python kilimo_pdfs/scrape_all.py --skip-download     # skip PDF downloads
"""
import argparse
import csv
import hashlib
import json
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from html.parser import HTMLParser

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    from bs4 import BeautifulSoup
    HAS_BEAUTIFULSOUP = True
except ImportError:
    HAS_BEAUTIFULSOUP = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)

KILIMO_BASE = "https://www.kilimo.go.tz"
KILIMO_PUBLICATIONS = KILIMO_BASE + "/publications/default?page={}"
KILIMO_PDF_DIR = os.path.join(BASE_DIR, "pdfs")
KILIMO_OUTPUT = os.path.join(BASE_DIR, "all_crop_data.json")

VIWANDA_BASE = "https://www.viwanda.go.tz"
VIWANDA_PRICES = VIWANDA_BASE + "/documents/product-prices-domestic"
VIWANDA_PDF_DIR = os.path.join(PROJECT_DIR, "prices", "viwanda_pdfs")
VIWANDA_OUTPUT = os.path.join(PROJECT_DIR, "prices", "viwanda_prices.json")

ALL_DATA_OUTPUT = os.path.join(BASE_DIR, "consolidated_data.json")

MONTH_MAP_SW = {
    'Januari': 1, 'Februari': 2, 'Machi': 3, 'Aprili': 4,
    'Mei': 5, 'Juni': 6, 'Julai': 7, 'Agosti': 8,
    'Septemba': 9, 'Oktoba': 10, 'Novemba': 11, 'Desemba': 12,
}

MONTH_MAP_EN = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12,
}

ALL_MONTHS = {**MONTH_MAP_SW, **MONTH_MAP_EN}

CROP_ORDER = [
    'Maize', 'Rice', 'Beans', 'Sorghum', 'Finger Millet',
    'Finger Millet', 'Irish Potatoes'
]


def get_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_url(url, timeout=30):
    try:
        safe_url = encode_url(url)
        req = urllib.request.Request(safe_url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                          'AppleWebKit/537.36 (KHTML, like Gecko) '
                          'Chrome/120.0.0.0 Safari/537.36'
        })
        with urllib.request.urlopen(req, context=get_ssl_context(), timeout=timeout) as resp:
            return resp.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}")
        return ""


def encode_url(url):
    parsed = urllib.parse.urlparse(url)
    safe_path = urllib.parse.quote(parsed.path, safe='/:@%')
    return urllib.parse.urlunparse((
        parsed.scheme, parsed.netloc, safe_path,
        parsed.params, parsed.query, parsed.fragment
    ))

def download_file(url, output_dir, filename=None):
    os.makedirs(output_dir, exist_ok=True)
    if filename is None:
        raw = os.path.basename(url.split('?')[0])
        filename = urllib.parse.unquote(raw.strip())
    if not filename:
        filename = hashlib.md5(url.encode()).hexdigest()[:16]
        ext = '.pdf' if '.pdf' in url else '.html'
        filename += ext
    filepath = os.path.join(output_dir, filename)
    if os.path.exists(filepath):
        return filepath
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
        size = os.path.getsize(filepath)
        print(f"    Downloaded: {filename} ({size} bytes)")
        return filepath
    except Exception as e:
        print(f"    ERROR downloading {url}: {e}")
        return None


# ── Kilimo.go.tz ──────────────────────────────────────────────────────

def parse_kilimo_publications_page(html, page_num):
    docs = []
    pattern = r'href="([^"]+\.pdf)"[^>]*>.*?<div class="bold-600 text-muted">([^<]+)</div>\s*<div>([^<]+)</div>'
    for m in re.finditer(pattern, html, re.DOTALL):
        url = m.group(1)
        if url.startswith('/'):
            url = KILIMO_BASE + url
        date_str = m.group(2).strip()
        title = m.group(3).strip()
        docs.append({
            'url': url,
            'date': date_str,
            'title': title,
            'source_page': page_num,
            'source_site': 'kilimo.go.tz',
        })
    return docs


def scrape_kilimo_publications(start_page=1, end_page=10):
    print("=" * 60)
    print(f"SCRAPING kilimo.go.tz publications (pages {start_page}-{end_page})")
    print("=" * 60)
    all_docs = []
    for page in range(start_page, end_page + 1):
        print(f"  Page {page}/{end_page}...")
        html = fetch_url(KILIMO_PUBLICATIONS.format(page))
        if not html:
            print(f"  Page {page} returned no content.")
            break
        docs = parse_kilimo_publications_page(html, page)
        if not docs:
            print(f"  No documents found on page {page}.")
            if page > 1:
                break
        for d in docs:
            print(f"    [{d['date']}] {d['title']}")
        all_docs.extend(docs)
    return all_docs


def download_kilimo_pdfs(docs):
    print(f"\nDownloading {len(docs)} PDFs...")
    local_paths = []
    for d in docs:
        url = d['url']
        if not url.lower().endswith('.pdf'):
            continue
        path = download_file(url, KILIMO_PDF_DIR)
        if path:
            d['local_path'] = path
            local_paths.append(path)
    return local_paths


def clean_price(val):
    """Clean a price string: remove spaces, commas, dashes. Returns int or None."""
    if not val or not val.strip():
        return None
    val = val.strip()
    val = val.replace(' ', '').replace(',', '')
    if val in ('-', '–', '—', 'N/A', '', '.'):
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def find_regional_price_table(data):
    """Check if a table extracted from PDF is a regional price table.
    Returns (clean_data, num_crops) or (None, 0) if not a match.
    """
    if not data or len(data) < 4:
        return None, 0

    wiki_hii_row = None
    for r_idx, row in enumerate(data):
        col1 = str(row[1]).strip() if len(row) > 1 and row[1] else ''
        col0 = str(row[0]).strip() if row[0] else ''
        if col1.lower() == 'wiki hii' and col0 and col0.lower() not in ('wiki', 'mkoa', ''):
            wiki_hii_row = r_idx
            break

    if wiki_hii_row is None:
        return None, 0

    sample_row = data[wiki_hii_row]
    num_crops = 0
    for col_idx in range(2, len(sample_row)):
        val = str(sample_row[col_idx]).strip() if sample_row[col_idx] else ''
        if val and val != '':
            num_crops += 1
        else:
            break
    if num_crops < 3:
        return None, 0

    start = max(0, wiki_hii_row - 1)
    return data[start:], num_crops


def extract_regional_prices(pdf_path):
    """Extract regional wholesale price data from a kilimo.go.tz PDF.
    Returns list of dicts: [{'region': 'Dodoma', 'prices': [600, 2600, ...]}, ...]
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

                    current_region = None
                    for row_idx in range(1, len(clean_data)):
                        row = clean_data[row_idx]
                        if len(row) < 2:
                            continue

                        col0 = str(row[0]).strip() if row[0] else ''
                        col1 = str(row[1]).strip() if len(row) > 1 and row[1] else ''

                        if col0 in ('Jumla ndogo', 'JUMLA KUU', 'Jumla', 'Wiki', 'Mkoa', ''):
                            continue

                        if col1.lower() == 'wiki hii':
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

    for rp in results:
        cleaned_prices = []
        for p in rp['prices']:
            cp = clean_price(p)
            cleaned_prices.append(cp)
        rp['prices'] = cleaned_prices

    return results


def extract_period_from_pdf(pdf_path, doc=None):
    """Extract the period string from the PDF filename or title."""
    if doc and doc.get('title'):
        title = doc.get('title', '')
        m = re.search(r'(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\w+),?\s*(\d{4})', title)
        if m:
            groups = m.groups()
            return f"{groups[0]}-{groups[1]} {groups[2]}, {groups[3]}"

    basename = os.path.basename(pdf_path)
    patterns = [
        r'(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(\w+),?\s*(\d{4})',
        r'(\d{1,2})\s+(\w+)\s*[-–]\s*(\d{1,2})\s+(\w+),?\s*(\d{4})',
    ]
    for pat in patterns:
        m = re.search(pat, basename)
        if m:
            groups = m.groups()
            if len(groups) == 4:
                return f"{groups[0]}-{groups[1]} {groups[2]}, {groups[3]}"
            elif len(groups) == 5:
                return f"{groups[0]} {groups[1]} - {groups[2]} {groups[3]}, {groups[4]}"

    try:
        with pdfplumber.open(pdf_path) as pdf:
            if pdf.pages:
                text = pdf.pages[0].extract_text()
                if text:
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

    return doc.get('title', 'unknown')


def process_kilimo_pdf(doc):
    path = doc.get('local_path')
    if not path or not os.path.exists(path):
        return None
    filename = os.path.basename(path)
    period = extract_period_from_pdf(path, doc)
    regions = extract_regional_prices(path)

    for rp in regions:
        rp['prices'] = [clean_price(p) if isinstance(p, str) else p for p in rp['prices']]

    return {
        'file': filename,
        'url': doc.get('url', ''),
        'date': doc.get('date', ''),
        'period': period,
        'regions': regions,
        'num_regions': len(regions),
    }


def scrape_kilimo(args):
    docs = scrape_kilimo_publications(args.start_page, args.end_page)
    print(f"\nTotal documents found: {len(docs)}")
    if not docs:
        return []
    if not args.skip_download:
        download_kilimo_pdfs(docs)
    
    # Process all PDFs in the folder (whether freshly downloaded or pre-existing)
    price_bulletins = []
    if os.path.exists(KILIMO_PDF_DIR):
        for fname in sorted(os.listdir(KILIMO_PDF_DIR)):
            if not fname.endswith('.pdf'):
                continue
            if 'Mwenendo' not in fname and 'Market Bulletin' not in fname:
                continue
            price_bulletins.append({
                'local_path': os.path.join(KILIMO_PDF_DIR, fname),
                'url': '',
                'title': fname,
                'date': '',
            })
    
    # Also check docs that have local_path from download
    for d in docs:
        if 'Mwenendo wa Bei' in d.get('title', '') and 'local_path' in d:
            if d not in price_bulletins:
                price_bulletins.append(d)
    
    print(f"\nPrice bulletins found: {len(price_bulletins)}")
    results = []
    for d in price_bulletins:
        path = d.get('local_path')
        if not path or not os.path.exists(path):
            continue
        print(f"  Processing: {os.path.basename(d.get('local_path', ''))}")
        processed = process_kilimo_pdf(d)
        if processed and processed['regions']:
            results.append(processed)
            print(f"    Regions: {processed['num_regions']}")
    output = {
        'source': 'kilimo.go.tz',
        'total_pdfs': len(results),
        'total_documents': len(docs),
        'data': results,
    }
    with open(KILIMO_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nKilimo data written to: {KILIMO_OUTPUT}")
    total_regions = sum(len(d['regions']) for d in results)
    total_prices = sum(
        sum(1 for r in d['regions'] for p in r['prices'] if p is not None)
        for d in results
    )
    print(f"  Bulletins processed: {len(results)}")
    print(f"  Region entries: {total_regions}")
    print(f"  Individual prices: {total_prices}")
    return docs


# ── Viwanda.go.tz (MIT) ───────────────────────────────────────────────

def parse_viwanda_prices_page(html):
    docs = []
    if HAS_BEAUTIFULSOUP:
        soup = BeautifulSoup(html, 'html.parser')
        for link in soup.select('a[href*=".pdf"]'):
            href = link.get('href', '')
            text = link.get_text(strip=True)
            if href.startswith('/'):
                href = VIWANDA_BASE + href
            docs.append({
                'url': href,
                'title': text,
                'source_site': 'viwanda.go.tz',
            })
    else:
        pattern = r'href="([^"]*\.pdf)"[^>]*>([^<]+)</a>'
        for m in re.finditer(pattern, html):
            url = m.group(1)
            title = m.group(2).strip()
            if url.startswith('/'):
                url = VIWANDA_BASE + url
            docs.append({
                'url': url,
                'title': title,
                'source_site': 'viwanda.go.tz',
            })
    return docs


def clean_viwanda_price(val):
    if val is None:
        return None
    s = str(val).strip()
    if s.upper() in ('NA', 'N/A', '—', '–', '-', '', '.'):
        return None
    s = s.replace(' ', '').replace(',', '')
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def extract_viwanda_prices(pdf_path):
    if not HAS_PDFPLUMBER:
        return None
    try:
        with pdfplumber.open(pdf_path) as pdf:
            all_data = []
            for page in pdf.pages:
                tables = page.find_tables()
                for table in tables:
                    data = table.extract()
                    if data and len(data) > 2:
                        all_data.extend(data)
            return all_data
    except Exception as e:
        print(f"    ERROR: {e}")
        return None


VIWANDA_CROP_COLUMNS = [
    'Maize', 'Rice', 'Sorghum', 'Finger Millet',
    'Bulrush Millet', 'Round Potatoes', 'Sweet Potatoes', 'Cassava',
]

SKIP_REGION_PATTERNS = [
    'jumla', 'manunuzi', 'mauzo', 'uagizaji', 'urari',
    'bidhaa', 'na.', 'mwaka', 's/n', 'eneo',
    'wastani', 'wasta',
]

REGION_NORMALIZE = {
    'dar es saalam': 'Dar Es Salaam',
    'dar es salaam': 'Dar Es Salaam',
}


def is_skip_region(name):
    lower = name.strip().lower()
    if not lower:
        return True
    if lower in ('na', 'n/a', ''):
        return True
    if lower.replace('.', '').replace(' ', '').isdigit():
        return True
    for pat in SKIP_REGION_PATTERNS:
        if lower.startswith(pat):
            return True
    return False


def parse_viwanda_rows(raw_data):
    """Parse viwanda price table rows into structured data.
    Table structure: Region | Market | Crop1_min | Crop1_max | Crop2_min | Crop2_max | ...
    OR: Region | Market | Crop1 | Crop2 | Crop3 | ...
    """
    parsed = []
    for row in raw_data:
        if not row or len(row) < 3:
            continue
        region = str(row[0]).strip() if row[0] else ''
        market = str(row[1]).strip() if len(row) > 1 and row[1] else ''
        if not region or not market:
            continue
        if is_skip_region(region):
            continue
        if region.lower() == market.lower():
            continue
        region = REGION_NORMALIZE.get(region.lower(), region)
        prices = []
        for col_idx in range(2, len(row)):
            prices.append(clean_viwanda_price(row[col_idx]))
        parsed.append({
            'region': region,
            'market': market,
            'prices': prices,
        })
    return parsed


def scrape_viwanda(args):
    print("\n" + "=" * 60)
    print("SCRAPING viwanda.go.tz (MIT) domestic product prices")
    print("=" * 60)
    html = fetch_url(VIWANDA_PRICES)
    if not html:
        print("  ERROR: Could not fetch viwanda.go.tz prices page")
        print("  Will try to use existing PDFs in viwanda_pdfs folder...")
        docs = []
    else:
        docs = parse_viwanda_prices_page(html)
        # Filter to only price-related PDFs
        docs = [d for d in docs if 'wholesale price' in d['title'].lower() or 'bei' in d['title'].lower()]
        print(f"  Found {len(docs)} price PDFs on page")
    if not docs and os.path.exists(VIWANDA_PDF_DIR):
        print("  No new PDFs found on website, checking existing files...")
        for fname in os.listdir(VIWANDA_PDF_DIR):
            if fname.endswith('.pdf') and 'wholesale price' in fname.lower():
                docs.append({
                    'url': f'existing://{fname}',
                    'title': fname,
                    'source_site': 'viwanda.go.tz',
                    'local_path': os.path.join(VIWANDA_PDF_DIR, fname),
                })
        print(f"  Found {len(docs)} existing price PDFs")
    if not docs:
        print("  No PDFs to process")
        return
    os.makedirs(VIWANDA_PDF_DIR, exist_ok=True)
    results = []
    for d in docs[:20]:
        path = d.get('local_path')
        if not path:
            print(f"  Downloading: {d['title']}")
            path = download_file(d['url'], VIWANDA_PDF_DIR)
            if path:
                d['local_path'] = path
        if not path or not os.path.exists(path):
            continue
        data = extract_viwanda_prices(path)
        entries = parse_viwanda_rows(data) if data else []
        if entries:
            print(f"  Processed: {os.path.basename(path)} ({len(entries)} entries)")
        else:
            print(f"  Processed: {os.path.basename(path)} (0 entries - may not be a price PDF)")
        results.append({
            'file': os.path.basename(path),
            'url': d['url'],
            'title': d['title'],
            'table_rows': len(data) if data else 0,
            'raw_data': data if data else [],
            'entries': entries,
            'crop_columns': VIWANDA_CROP_COLUMNS,
        })
    output = {
        'source': 'viwanda.go.tz',
        'total_pdfs': len(results),
        'data': results,
    }
    with open(VIWANDA_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nViwanda data written to: {VIWANDA_OUTPUT}")
    print(f"  PDFs processed: {len(results)}")


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Master scraper for Tanzania agricultural price data'
    )
    parser.add_argument('--source', choices=['all', 'kilimo', 'viwanda'],
                        default='all', help='Which source to scrape')
    parser.add_argument('--skip-download', action='store_true',
                        help='Skip downloading files')
    parser.add_argument('--start-page', type=int, default=1,
                        help='First publications page (kilimo.go.tz)')
    parser.add_argument('--end-page', type=int, default=10,
                        help='Last publications page (kilimo.go.tz)')
    args = parser.parse_args()

    all_docs = []

    if args.source in ('all', 'kilimo'):
        kilimo_docs = scrape_kilimo(args)
        all_docs.extend(kilimo_docs)

    if args.source in ('all', 'viwanda'):
        scrape_viwanda(args)

    print("\n" + "=" * 60)
    print("DONE! Summary:")
    print("=" * 60)
    print(f"  kilimo.go.tz PDFs downloaded to: {KILIMO_PDF_DIR}")
    print(f"  Kilimo data JSON: {KILIMO_OUTPUT}")
    print(f"  Viwanda PDFs: {VIWANDA_PDF_DIR}")
    print(f"  Viwanda data JSON: {VIWANDA_OUTPUT}")
    print(f"\n  Install missing packages:")
    print(f"    pip install pdfplumber beautifulsoup4")
    print()

    # Write consolidated manifest
    all_pdfs = []
    if os.path.exists(KILIMO_PDF_DIR):
        for f in sorted(os.listdir(KILIMO_PDF_DIR)):
            if f.endswith('.pdf'):
                fp = os.path.join(KILIMO_PDF_DIR, f)
                all_pdfs.append({
                    'file': f,
                    'size': os.path.getsize(fp),
                    'source': 'kilimo.go.tz',
                })
    if os.path.exists(VIWANDA_PDF_DIR):
        for f in sorted(os.listdir(VIWANDA_PDF_DIR)):
            if f.endswith('.pdf'):
                fp = os.path.join(VIWANDA_PDF_DIR, f)
                all_pdfs.append({
                    'file': f,
                    'size': os.path.getsize(fp),
                    'source': 'viwanda.go.tz',
                })

    manifest = {
        'scrape_date': datetime.now().isoformat(),
        'total_pdfs': len(all_pdfs),
        'total_size_bytes': sum(p['size'] for p in all_pdfs),
        'pdfs': all_pdfs,
        'sources': {
            'kilimo.go.tz': {
                'url': KILIMO_BASE,
                'publications_url': KILIMO_PUBLICATIONS.format(args.start_page),
                'pages_scraped': f"{args.start_page}-{args.end_page}",
            },
            'viwanda.go.tz': {
                'url': VIWANDA_BASE,
                'prices_url': VIWANDA_PRICES,
            },
        }
    }
    manifest_path = os.path.join(BASE_DIR, 'scrape_manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f"  Manifest: {manifest_path}")


if __name__ == '__main__':
    main()
