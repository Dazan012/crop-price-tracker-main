"""
Management command: seed the CropCalendar with known Tanzania crop season data.

Sources:
  - FAO/WFP Tanzania Crop Calendar
  - Ministry of Agriculture seasonal guides
  - Kilimo.go.tz PDF documents

Usage:
    python manage.py seed_crop_calendar
    python manage.py seed_crop_calendar --scrape-kalenda
"""
import os
import re
from datetime import datetime
from django.core.management.base import BaseCommand
from django.db import transaction
from prices.models import Crop, Region, CropCalendar

os.environ['RUN_NOTIFICATION_ENGINE_SKIP'] = '1'

TANZANIA_CROP_CALENDAR = [
    {
        'crop': 'Maize',
        'seasons': [
            {'season': 'Masika (Long Rains)', 'plant_start': 1, 'plant_end': 2, 'harvest_start': 5, 'harvest_end': 8},
            {'season': 'Vuli (Short Rains)', 'plant_start': 10, 'plant_end': 12, 'harvest_start': 2, 'harvest_end': 4},
        ],
    },
    {
        'crop': 'Rice',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 11, 'plant_end': 1, 'harvest_start': 4, 'harvest_end': 7},
        ],
    },
    {
        'crop': 'Beans',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 10, 'plant_end': 12, 'harvest_start': 2, 'harvest_end': 4},
        ],
    },
    {
        'crop': 'Sorghum',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 11, 'plant_end': 1, 'harvest_start': 3, 'harvest_end': 6},
        ],
    },
    {
        'crop': 'Finger Millet',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 11, 'plant_end': 12, 'harvest_start': 3, 'harvest_end': 5},
        ],
    },
    {
        'crop': 'Bulrush Millet',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 11, 'plant_end': 1, 'harvest_start': 3, 'harvest_end': 5},
        ],
    },
    {
        'crop': 'Irish Potatoes',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 9, 'plant_end': 11, 'harvest_start': 3, 'harvest_end': 5},
        ],
    },
    {
        'crop': 'Coffee',
        'seasons': [
            {'season': 'Southern Harvest', 'plant_start': None, 'plant_end': None, 'harvest_start': 6, 'harvest_end': 9},
            {'season': 'Northern Harvest', 'plant_start': None, 'plant_end': None, 'harvest_start': 10, 'harvest_end': 12},
        ],
    },
    {
        'crop': 'Cotton',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 11, 'plant_end': 12, 'harvest_start': 5, 'harvest_end': 8},
        ],
    },
    {
        'crop': 'Tobacco',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 10, 'plant_end': 11, 'harvest_start': 2, 'harvest_end': 4},
        ],
    },
    {
        'crop': 'Tea',
        'seasons': [
            {'season': 'Year Round', 'plant_start': None, 'plant_end': None, 'harvest_start': 1, 'harvest_end': 12},
        ],
    },
    {
        'crop': 'Cashew',
        'seasons': [
            {'season': 'Harvest Season', 'plant_start': None, 'plant_end': None, 'harvest_start': 10, 'harvest_end': 2},
        ],
    },
    {
        'crop': 'Sunflower',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 11, 'plant_end': 12, 'harvest_start': 3, 'harvest_end': 5},
        ],
    },
    {
        'crop': 'Sweet Potatoes',
        'seasons': [
            {'season': 'Main Season', 'plant_start': 9, 'plant_end': 11, 'harvest_start': 3, 'harvest_end': 5},
        ],
    },
    {
        'crop': 'Cassava',
        'seasons': [
            {'season': 'Year Round', 'plant_start': None, 'plant_end': None, 'harvest_start': 1, 'harvest_end': 12},
        ],
    },
]

# Regional variations
REGION_VARIATIONS = {
    'Kagera': {
        'Coffee': [{'season': 'Main Harvest', 'plant_start': None, 'plant_end': None, 'harvest_start': 6, 'harvest_end': 10}],
    },
    'Mbeya': {
        'Maize': [{'season': 'Main Season', 'plant_start': 11, 'plant_end': 12, 'harvest_start': 5, 'harvest_end': 7}],
    },
    'Iringa': {
        'Maize': [{'season': 'Main Season', 'plant_start': 11, 'plant_end': 1, 'harvest_start': 6, 'harvest_end': 8}],
    },
    'Ruvuma': {
        'Maize': [{'season': 'Main Season', 'plant_start': 11, 'plant_end': 12, 'harvest_start': 5, 'harvest_end': 7}],
    },
    'Tanga': {
        'Maize': [{'season': 'Main Season', 'plant_start': 3, 'plant_end': 4, 'harvest_start': 7, 'harvest_end': 9}],
    },
}


class Command(BaseCommand):
    help = 'Seed crop calendar with known planting and harvest seasons'

    def add_arguments(self, parser):
        parser.add_argument('--scrape-kalenda', action='store_true',
            help='Also scrape planting calendar data from kilimo PDFs')

    @transaction.atomic
    def handle(self, *args, **options):
        created = 0
        skipped_crops = []

        # National calendars
        for entry in TANZANIA_CROP_CALENDAR:
            crop_name = entry['crop']
            crops = Crop.objects.filter(name__iexact=crop_name)
            if not crops.exists():
                skipped_crops.append(crop_name)
                continue
            crop = crops.first()
            for season in entry['seasons']:
                obj, is_new = CropCalendar.objects.update_or_create(
                    crop=crop,
                    region=None,
                    season_name=season['season'],
                    defaults={
                        'planting_start': season['plant_start'],
                        'planting_end': season['plant_end'],
                        'harvest_start': season['harvest_start'],
                        'harvest_end': season['harvest_end'],
                        'source': 'FAO/WFP Tanzania Crop Calendar',
                    }
                )
                if is_new:
                    created += 1

        # Regional variations
        for region_name, crops_data in REGION_VARIATIONS.items():
            regions = Region.objects.filter(name__iexact=region_name)
            if not regions.exists():
                continue
            region = regions.first()
            for crop_name, seasons in crops_data.items():
                crops = Crop.objects.filter(name__iexact=crop_name)
                if not crops.exists():
                    continue
                crop = crops.first()
                for season in seasons:
                    obj, is_new = CropCalendar.objects.update_or_create(
                        crop=crop,
                        region=region,
                        season_name=season['season'],
                        defaults={
                            'planting_start': season['plant_start'],
                            'planting_end': season['plant_end'],
                            'harvest_start': season['harvest_start'],
                            'harvest_end': season['harvest_end'],
                            'source': 'FAO/WFP Tanzania Crop Calendar (regional)',
                        }
                    )
                    if is_new:
                        created += 1

        self.stdout.write(self.style.SUCCESS(f'Created {created} crop calendar entries'))
        if skipped_crops:
            self.stdout.write(f'Skipped (crops not found): {", ".join(skipped_crops)}')

        if options['scrape_kalenda']:
            self.scrape_kalenda_pdfs()

    def scrape_kalenda_pdfs(self):
        """Try to extract planting calendar data from kilimo PDFs."""
        pdf_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))))), 'kilimo_pdfs', 'pdfs')
        if not os.path.exists(pdf_dir):
            self.stdout.write('No PDFs directory found')
            return

        found = 0
        for fname in os.listdir(pdf_dir):
            if 'kalenda' not in fname.lower() and 'calendar' not in fname.lower() and 'season' not in fname.lower():
                continue
            fpath = os.path.join(pdf_dir, fname)
            try:
                import pdfplumber
                with pdfplumber.open(fpath) as pdf:
                    text = ''
                    for page in pdf.pages:
                        t = page.extract_text()
                        if t:
                            text += t + '\n'
                    if not text.strip():
                        continue
                    # Look for planting months
                    month_map = {
                        'januari': 1, 'februari': 2, 'machi': 3, 'aprili': 4,
                        'mei': 5, 'juni': 6, 'julai': 7, 'agosti': 8,
                        'septemba': 9, 'oktoba': 10, 'novemba': 11, 'desemba': 12,
                        'january': 1, 'february': 2, 'march': 3, 'april': 4,
                        'may': 5, 'june': 6, 'july': 7, 'august': 8,
                        'september': 9, 'october': 10, 'november': 11, 'december': 12,
                    }
                    matches = re.findall(r'(?:kupanda|planting|mwisho\s+wa\s+kupanda|mwanzo\s+wa\s+kupanda)[^.]*?(' + '|'.join(month_map.keys()) + r')', text, re.IGNORECASE)
                    if matches:
                        found += 1
                        self.stdout.write(f'  {fname}: found planting months - {matches}')
            except Exception:
                pass

        self.stdout.write(f'Scanned {len(os.listdir(pdf_dir))} PDFs, found calendar data in {found}')
