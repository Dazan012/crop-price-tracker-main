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


def extract_table_from_pdf(pdf_path):
    if not HAS_PDFPLUMBER:
        return None
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_idx in range(min(4, len(pdf.pages))):
                page = pdf.pages[page_idx]
                text = page.extract_text()
                tables = page.find_tables()
                for table in tables:
                    data = table.extract()
                    if not data or len(data) < 4:
                        continue
                    for row in data:
                        if len(row) > 1 and str(row[1]).strip() in ('Wiki hii', 'wiki hii'):
                            return data, page_idx
        return None
    except Exception as e:
        print(f"    ERROR extracting from {os.path.basename(pdf_path)}: {e}")
        return None


def process_kilimo_pdf(doc):
    path = doc.get('local_path')
    if not path or not os.path.exists(path):
        return None
    filename = os.path.basename(path)
    period = doc.get('title', '')
    result = extract_table_from_pdf(path)
    regions = []
    if result:
        table_data, _ = result
        current_region = None
        for row in table_data:
            if len(row) < 2:
                continue
            col0 = str(row[0]).strip() if row[0] else ''
            col1 = str(row[1]).strip() if len(row) > 1 and row[1] else ''
            if col1 == 'Wiki hii' and col0 and col0 not in ('Wiki', 'Mkoa', ''):
                prices = []
                for c in range(2, min(9, len(row))):
                    val = str(row[c]).strip() if c < len(row) and row[c] else '-'
                    prices.append(val)
                regions.append({'region': col0, 'prices': prices})
        cleaned = []
        for r in regions:
            cp = []
            for p in r['prices']:
                try:
                    p_clean = p.replace(' ', '').replace(',', '')
                    if p_clean in ('-', '–', '—', 'N/A', '', '.'):
                        cp.append(None)
                    else:
                        cp.append(int(float(p_clean)))
                except (ValueError, TypeError):
                    cp.append(None)
            cleaned.append({'region': r['region'], 'prices': cp})
        regions = cleaned
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
    price_bulletins = [d for d in docs if 'Mwenendo wa Bei' in d['title']]
    print(f"\nPrice bulletins found: {len(price_bulletins)}")
    results = []
    for d in price_bulletins:
        if 'local_path' not in d:
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
    parsed = []
    for row in raw_data:
        if not row or len(row) < 4:
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
        for col_idx in range(2, min(len(row), 2 + len(VIWANDA_CROP_COLUMNS) * 2)):
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
        return
    docs = parse_viwanda_prices_page(html)
    print(f"  Found {len(docs)} price PDFs")
    if not docs:
        return
    os.makedirs(VIWANDA_PDF_DIR, exist_ok=True)
    results = []
    for d in docs[:20]:
        print(f"  Downloading: {d['title']}")
        path = download_file(d['url'], VIWANDA_PDF_DIR)
        if path:
            d['local_path'] = path
            data = extract_viwanda_prices(path)
            results.append({
                'file': os.path.basename(path),
                'url': d['url'],
                'title': d['title'],
                'table_rows': len(data) if data else 0,
                'raw_data': data if data else [],
                'entries': parse_viwanda_rows(data) if data else [],
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
