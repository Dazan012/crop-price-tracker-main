"""
Auto-sync: Check kilimo.go.tz for new crop price PDFs, download, extract, and import.

Usage:
    python manage.py sync_kilimo          # Run sync
    python manage.py sync_kilimo --dry-run # Check only, don't import
"""
import os
import re
import json
import urllib.request
import sys
from datetime import date

from django.core.management.base import BaseCommand
from django.core.management import call_command


BASE_URL = 'https://www.kilimo.go.tz'
PUBLICATIONS_URL = f'{BASE_URL}/publications/default'
SYNC_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    '..', 'kilimo_pdfs'
)
SYNC_STATE_FILE = os.path.join(SYNC_DIR, 'sync_state.json')


def get_sync_state():
    """Load the list of already-downloaded PDFs."""
    if os.path.exists(SYNC_STATE_FILE):
        with open(SYNC_STATE_FILE, 'r') as f:
            return json.load(f)
    return {'downloaded': [], 'last_sync': None}


def save_sync_state(state):
    """Save sync state."""
    os.makedirs(SYNC_DIR, exist_ok=True)
    with open(SYNC_STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)


def fetch_publications_page():
    """Fetch kilimo.go.tz pages and extract PDF links."""
    all_html = ''
    urls_to_try = [
        PUBLICATIONS_URL,
        BASE_URL,
        f'{BASE_URL}/pages/publications',
    ]

    for url in urls_to_try:
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SmartCrops-Sync/1.0'
            })
            with urllib.request.urlopen(req, timeout=30) as response:
                all_html += response.read().decode('utf-8', errors='replace')
        except Exception:
            continue

    if not all_html:
        return [], "Failed to fetch any page from kilimo.go.tz"

    # Extract PDF links with flexible patterns
    patterns = [
        re.compile(r'href="(/uploads/documents/[^"]+\.pdf)"', re.IGNORECASE),
        re.compile(r"href='(/uploads/documents/[^']+\.pdf)'", re.IGNORECASE),
        re.compile(r'href="(https?://[^"]*kilimo[^"]*\.pdf)"', re.IGNORECASE),
        re.compile(r'href="([^"]*uploads/documents/sw-\d+[^"]*)"', re.IGNORECASE),
    ]

    pdfs = []
    seen = set()
    for pattern in patterns:
        for match in pattern.findall(all_html):
            if match in seen:
                continue
            seen.add(match)

            if match.startswith('http'):
                url = match
                path = match.replace(BASE_URL, '')
            else:
                url = BASE_URL + match
                path = match

            filename = path.split('/')[-1]
            short_name = re.sub(r'^sw-\d+-', '', filename)
            short_name = short_name.replace('%20', '_').replace(' ', '_')
            if len(short_name) > 60:
                short_name = short_name[:60] + '.pdf'
            pdfs.append({
                'url': url,
                'path': path,
                'remote_filename': filename,
                'local_name': short_name,
            })

    return pdfs, None


def download_pdf(url, dest_path):
    """Download a single PDF."""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SmartCrops-Sync/1.0'
        })
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read()
        with open(dest_path, 'wb') as f:
            f.write(data)
        return len(data), None
    except Exception as e:
        return 0, str(e)


class Command(BaseCommand):
    help = 'Sync new crop price PDFs from kilimo.go.tz and import data'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Check only, do not download or import')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        os.makedirs(SYNC_DIR, exist_ok=True)

        state = get_sync_state()
        self.stdout.write(f"Last sync: {state.get('last_sync', 'Never')}")
        self.stdout.write(f"Already downloaded: {len(state.get('downloaded', []))} PDFs\n")

        # Step 1: Fetch publications page
        self.stdout.write("Checking kilimo.go.tz for new PDFs...")
        pdfs, error = fetch_publications_page()
        if error:
            self.stderr.write(self.style.ERROR(error))
            return
        self.stdout.write(f"Found {len(pdfs)} PDFs on publications page")

        # Step 2: Find new PDFs
        downloaded = set(state.get('downloaded', []))
        new_pdfs = [p for p in pdfs if p['path'] not in downloaded]

        if not new_pdfs:
            self.stdout.write(self.style.SUCCESS("No new PDFs found. Everything is up to date!"))
            state['last_sync'] = str(date.today())
            save_sync_state(state)
            return

        self.stdout.write(self.style.WARNING(f"\nFound {len(new_pdfs)} NEW PDF(s):"))
        for p in new_pdfs:
            self.stdout.write(f"  - {p['remote_filename'][:80]}")

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[DRY RUN] Would download and import the above PDFs."))
            return

        # Step 3: Download new PDFs
        self.stdout.write("\nDownloading new PDFs...")
        downloaded_files = []
        for p in new_pdfs:
            dest = os.path.join(SYNC_DIR, p['local_name'])
            self.stdout.write(f"  Downloading: {p['local_name']}...", end=" ", flush=True)
            size, err = download_pdf(p['url'], dest)
            if err:
                self.stdout.write(self.style.ERROR(f"FAILED ({err})"))
                continue
            self.stdout.write(self.style.SUCCESS(f"OK ({size:,} bytes)"))
            downloaded_files.append(dest)
            state.setdefault('downloaded', []).append(p['path'])

        # Step 4: Extract and import
        if downloaded_files:
            self.stdout.write(f"\nExtracting data from {len(downloaded_files)} new PDF(s)...")
            # Run the full extract + import pipeline
            try:
                # First extract all PDFs into the JSON file
                extract_script = os.path.join(SYNC_DIR, 'extract_all.py')
                if os.path.exists(extract_script):
                    import subprocess
                    venv_python = os.path.join(
                        os.path.dirname(os.path.dirname(os.path.dirname(
                            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                        ))),
                        'venv', 'Scripts', 'python.exe'
                    )
                    if not os.path.exists(venv_python):
                        # Try alternative path
                        venv_python = sys.executable
                    subprocess.run([venv_python, extract_script], timeout=300)

                # Then import into database
                self.stdout.write("Importing extracted data into database...")
                call_command('import_kilimo_data')
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"Extract/import failed: {e}"))

        # Step 5: Save state
        state['last_sync'] = str(date.today())
        save_sync_state(state)

        self.stdout.write(self.style.SUCCESS(f"\nSync complete! Downloaded {len(downloaded_files)} new PDF(s)."))
        self.stdout.write(self.style.SUCCESS(f"Total PDFs tracked: {len(state['downloaded'])}"))
