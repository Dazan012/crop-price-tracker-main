"""
Scrape NBS (National Bureau of Statistics) agriculture publications and data.

Usage:
    python kilimo_pdfs/scrape_nbs.py
    pip install beautifulsoup4  (recommended for better HTML parsing)
"""
import json
import os
import re
import ssl
import urllib.parse
import urllib.request
from datetime import datetime

BASE_URL = "https://www.nbs.go.tz"
AGRICULTURE_URL = BASE_URL + "/statistics/agriculture"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nbs_data")


def get_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_url(url):
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                          'AppleWebKit/537.36'
        })
        with urllib.request.urlopen(req, context=get_ssl_context(), timeout=30) as resp:
            return resp.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"  ERROR fetching {url}: {e}")
        return ""


def extract_topics(html):
    """Extract agriculture related topics/links from NBS agriculture page."""
    topics = []
    pattern = r'href="([^"]+)"[^>]*>\s*<div class="text-truncate">\s*([^<]+)\s*</div>'
    for m in re.finditer(pattern, html):
        url = m.group(1)
        if url.startswith('/'):
            url = BASE_URL + url
        title = m.group(2).strip()
        topics.append({'title': title, 'url': url, 'source': 'nbs.go.tz'})
    return topics


def scrape_agriculture_topics():
    print("=" * 60)
    print("SCRAPING NBS Agriculture Statistics page")
    print("=" * 60)
    html = fetch_url(AGRICULTURE_URL)
    if not html:
        print("  Could not fetch NBS agriculture page")
        return []

    topics = extract_topics(html)
    print(f"  Found {len(topics)} agriculture-related topics")

    for t in topics:
        print(f"    - {t['title']}: {t['url']}")

    return topics


def save_output(topics):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, "agriculture_topics.json")
    output = {
        'source': 'nbs.go.tz',
        'url': AGRICULTURE_URL,
        'scrape_date': datetime.now().isoformat(),
        'total_topics': len(topics),
        'topics': topics,
    }
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\n  Output saved to: {filepath}")
    return filepath


def main():
    topics = scrape_agriculture_topics()
    if topics:
        save_output(topics)

    print(f"\nRelated NBS agriculture data pages to explore:")
    print(f"  1. Annual Agricultural Sample Surveys:")
    print(f"     {BASE_URL}/statistics/topic/annual-agriculture-sample-surveys")
    print(f"  2. Agriculture Census 2019/20:")
    print(f"     {BASE_URL}/statistics/topic/agriculture-census-2019-20")
    print(f"  3. Food Balance Sheets:")
    print(f"     {BASE_URL}/statistics/topic/tanzania-food-balance-sheets-reports")
    print(f"  4. Crop Price Statistics:")
    print(f"     {BASE_URL}/statistics/topic/crop-price-statistics")
    print()


if __name__ == '__main__':
    main()
