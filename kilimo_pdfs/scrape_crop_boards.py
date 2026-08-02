"""
Scrape crop board websites for price data and statistics.

Boards:
  - CPB (Cereals & Other Produce) - grains, maize, rice, beans
  - TCB (Coffee Board) - coffee prices
  - TBT (Tea Board) - tea prices
  - CPB (Cotton Board) - cotton prices  
  - TTB (Tobacco Board) - tobacco prices

Usage:
    python kilimo_pdfs/scrape_crop_boards.py
    pip install beautifulsoup4
"""
import json
import os
import re
import ssl
import urllib.parse
import urllib.request
from datetime import datetime

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "crop_board_data")

BOARDS = [
    {
        'name': 'CPB - Cereals & Other Produce Board',
        'short': 'cpb',
        'url': 'https://www.cpb.go.tz',
        'crops': ['Maize', 'Rice', 'Beans', 'Sorghum', 'Finger Millet'],
        'subpages': [
            '/bei-za-mazao', '/prices', '/takwimu', '/statistics',
            '/publications', '/machapisho', '/ripoti', '/reports',
            '/masoko', '/markets',
        ],
    },
    {
        'name': 'TCB - Coffee Board',
        'short': 'coffee',
        'url': 'https://www.coffee.go.tz',
        'crops': ['Coffee Arabica', 'Coffee Robusta'],
        'subpages': [
            '/soko-la-awali', '/soko-la-mnada', '/matokeo',
            '/takwimu', '/statistics', '/ripoti', '/reports',
            '/bei', '/prices', '/machapisho', '/publications',
            '/bei-elekezi', '/auction-results',
        ],
    },
    {
        'name': 'TBT - Tea Board',
        'short': 'tea',
        'url': 'https://www.teaboard.go.tz',
        'crops': ['Tea'],
        'subpages': [
            '/machapisho', '/publications', '/takwimu', '/statistics',
            '/uzalishaji-wa-chai', '/tea-production', '/bei', '/prices',
            '/ripoti', '/reports', '/mnada', '/auction',
        ],
    },
    {
        'name': 'Cotton Board',
        'short': 'cotton',
        'url': 'https://www.cotton.or.tz',
        'crops': ['Cotton'],
        'subpages': [
            '/bei-za-pamba', '/prices', '/takwimu', '/statistics',
            '/machapisho', '/publications', '/ripoti', '/reports',
            '/ununuzi', '/purchases',
        ],
    },
    {
        'name': 'TTB - Tobacco Board',
        'short': 'tobacco',
        'url': 'https://www.tobaccoboard.go.tz',
        'crops': ['Tobacco'],
        'subpages': [
            '/takwimu', '/statistics', '/ununuzi', '/purchases',
            '/machapisho', '/publications', '/bei', '/prices',
            '/ripoti', '/reports', '/masoko', '/markets',
        ],
    },
    {
        'name': 'Cashew Board',
        'short': 'cashew',
        'url': 'https://www.cashew.go.tz',
        'crops': ['Cashew'],
        'subpages': [
            '/bei-za-korosho', '/prices', '/takwimu', '/statistics',
            '/machapisho', '/publications', '/ripoti', '/reports',
            '/masoko', '/markets', '/ununuzi', '/purchases',
        ],
    },
]


def get_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_url(url, timeout=20):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                          'AppleWebKit/537.36 (KHTML, like Gecko) '
                          'Chrome/120.0.0.0 Safari/537.36'
        })
        with urllib.request.urlopen(req, context=get_ssl_context(), timeout=timeout) as resp:
            return resp.read().decode('utf-8', errors='replace')
    except Exception as e:
        return None


def download_file(url, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    filename = urllib.parse.unquote(os.path.basename(url.split('?')[0]))
    if not filename:
        filename = hashlib.md5(url.encode()).hexdigest()[:16] + '.pdf'
    filepath = os.path.join(output_dir, filename)
    if os.path.exists(filepath):
        return filepath
    try:
        parsed = urllib.parse.urlparse(url)
        safe_url = urllib.parse.urlunparse((
            parsed.scheme, parsed.netloc,
            urllib.parse.quote(parsed.path, safe='/:@%'),
            parsed.params, parsed.query, parsed.fragment
        ))
        req = urllib.request.Request(safe_url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                          'AppleWebKit/537.36 (KHTML, like Gecko) '
                          'Chrome/120.0.0.0 Safari/537.36'
        })
        with urllib.request.urlopen(req, context=get_ssl_context(), timeout=30) as resp:
            with open(filepath, 'wb') as f:
                f.write(resp.read())
        return filepath
    except Exception as e:
        return None


def extract_pdf_links(html, base_url):
    """Extract PDF links from HTML."""
    links = []
    for m in re.finditer(r'href="([^"]*\.pdf)"', html, re.IGNORECASE):
        url = m.group(1)
        if url.startswith('/'):
            url = base_url + url
        elif not url.startswith('http'):
            url = base_url + '/' + url
        links.append(url)
    return list(set(links))


def extract_prices_from_html(html, board):
    """Try to extract price data visible in HTML (not PDF)."""
    prices = []

    # Look for price patterns: numbers followed by TZS or /Kg
    price_patterns = [
        r'Bei[^:]*:\s*TZS\s*([\d,]+)',
        r'TZS\s*([\d,]+)\s*/',
        r'([\d,]+)\s*TZS\s*/',
        r'price[^:]*:\s*\$?([\d.]+)',
        r'\$([\d.]+)\s*/Kg',
    ]
    for pat in price_patterns:
        for m in re.finditer(pat, html, re.IGNORECASE):
            try:
                val = float(m.group(1).replace(',', ''))
                prices.append({
                    'value': val,
                    'context': html[max(0, m.start()-50):m.end()+50],
                })
            except ValueError:
                pass

    return prices


def scrape_board(board):
    """Scrape a single crop board website."""
    print(f"\n{'='*60}")
    print(f"SCRAPING: {board['name']}")
    print(f"{'='*60}")
    print(f"  URL: {board['url']}")

    html = fetch_url(board['url'])
    if not html:
        print(f"  ERROR: Could not fetch {board['url']}")
        return None

    # Extract PDF links
    pdfs = extract_pdf_links(html, board['url'])
    print(f"  PDFs found on homepage: {len(pdfs)}")

    # Try to find price data in HTML
    prices = extract_prices_from_html(html, board)

    # Coffee board has prices embedded directly in homepage HTML
    if 'coffee' in board.get('url', '') or board['short'] == 'coffee':
        coffee_patterns = [
            (r'Bei\s+za\s+minada[^$]*\$?\s*([\d.]+)', 'Auction'),
            (r'Terminal\s+Market[^$]*\$?\s*([\d.]+)', 'Terminal'),
            (r'Farm\s+Gate[^$]*?TZS\s*([\d,]+)', 'Farm Gate'),
            (r'\$/(Kg|kg)[^<]*?([\d.]+)', 'USD'),
            (r'TZS/Kg[^<]*?([\d,]+)', 'Farm Gate TZS'),
        ]
        for pat, label in coffee_patterns:
            for m in re.finditer(pat, html, re.IGNORECASE):
                val_str = m.group(1) if len(m.groups()) >= 1 else m.group(0)
                try:
                    val = float(val_str.replace(',', ''))
                    ctx = html[max(0, m.start()-60):m.end()+60].replace('\n', ' ').strip()
                    prices.append({'value': val, 'context': ctx, 'source_label': label})
                except ValueError:
                    pass

    # Look for publications/prices subpages
    price_urls = []
    for path in board.get('subpages', ['/publications', '/prices', '/takwimu', '/statistics',
                                        '/bei', '/prices-domestic', '/documents']):
        sub_url = board['url'].rstrip('/') + path
        sub_html = fetch_url(sub_url)
        if sub_html:
            sub_pdfs = extract_pdf_links(sub_html, board['url'])
            pdfs.extend(sub_pdfs)
            sub_prices = extract_prices_from_html(sub_html, board)
            prices.extend(sub_prices)
            price_urls.append(sub_url)

    # Download and extract prices from PDFs
    board_pdf_dir = os.path.join(OUTPUT_DIR, f'pdfs_{board["short"]}')
    parsed_pdfs = []
    for pdf_url in set(pdfs):
        local = download_file(pdf_url, board_pdf_dir)
        if local:
            try:
                with __import__('pdfplumber').open(local) as pdf:
                    text = ''.join(p.extract_text() or '' for p in pdf.pages)
                    price_matches = re.findall(r'(?:TZS|tsh|shs)[.,]?\s*([\d,]+)', text, re.IGNORECASE)
                    for pm in price_matches:
                        try:
                            prices.append({'value': float(pm.replace(',', '')), 'context': f'from PDF: {os.path.basename(local)}', 'source_label': 'PDF'})
                        except ValueError:
                            pass
            except Exception:
                pass

    result = {
        'board': board['name'],
        'short': board['short'],
        'url': board['url'],
        'crops': board['crops'],
        'scrape_date': datetime.now().isoformat(),
        'pdfs_found': len(pdfs),
        'pdf_urls': pdfs[:50],
        'prices_found': len(prices),
        'price_samples': prices[:30],
        'subpages_checked': price_urls,
    }

    # Save individual board data
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, f"{board['short']}.json")
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"  Saved to: {filepath}")
    print(f"  PDFs: {len(pdfs)}, Price data points: {len(prices)}")

    return result


def main():
    all_results = []
    for board in BOARDS:
        result = scrape_board(board)
        if result:
            all_results.append(result)

    # Consolidated output
    consolidated = {
        'scrape_date': datetime.now().isoformat(),
        'total_boards': len(all_results),
        'results': all_results,
    }
    filepath = os.path.join(OUTPUT_DIR, 'all_boards.json')
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(consolidated, f, indent=2, ensure_ascii=False)
    print(f"\n{'='*60}")
    print(f"Consolidated output: {filepath}")
    print(f"{'='*60}")

    print(f"\nNext steps:")
    print(f"  Review each board's PDFs for downloadable price data")
    print(f"  Boards with price data:")
    for r in all_results:
        price_count = r.get('prices_found', 0)
        pdf_count = r.get('pdfs_found', 0)
        print(f"    {r['short']:>10}: {price_count} prices, {pdf_count} PDFs")


if __name__ == '__main__':
    main()
