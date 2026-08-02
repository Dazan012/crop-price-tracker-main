# Tanzania Agricultural Price Data Sources

## 1. kilimo.go.tz — Ministry of Agriculture (MoA)

**Primary source** for weekly crop price bulletins.

- **URL**: https://www.kilimo.go.tz
- **Publications**: https://www.kilimo.go.tz/publications/default?page={1-10}
- **Data**: Weekly "Mwenendo wa Bei za Mazao" (Crop Price Trends) PDFs
- **Frequency**: Weekly (Monday-Friday)
- **Crops tracked**: Maize, Rice, Beans, Sorghum, Finger Millet, Bulrush Millet, Irish Potatoes
- **Regional coverage**: All 31 Tanzania regions + cocoa/green gram/sesame sales
- **Format**: PDF with tables → extracted via pdfplumber
- **History**: 10 pages of publications (~120+ documents), currently 2024-2026
- **Existing scraper**: `kilimo_pdfs/scrape_kilimo.py` (updated → `scrape_all.py`)
- **Output**: `kilimo_pdfs/all_crop_data.json`

### Additional sections on kilimo.go.tz
- **News**: https://www.kilimo.go.tz/news (30+ pages of agricultural news)
- **Press Releases**: https://www.kilimo.go.tz/press-releases
- **Speeches**: https://www.kilimo.go.tz/speeches
- **Announcements**: https://www.kilimo.go.tz/announcements
- **Jobs**: https://www.kilimo.go.tz/pages/vacancies
- **Tenders**: https://www.kilimo.go.tz/pages/customer-service-charter

---

## 2. viwanda.go.tz — Ministry of Industry and Trade (MIT)

**Wholesale price data** — more frequent, market-level granularity.

- **URL**: https://www.viwanda.go.tz
- **Prices page**: https://www.viwanda.go.tz/documents/product-prices-domestic
- **Data**: "Bei za Jumla Mazao Makuu ya Chakula Nchini" (Wholesale prices of major food crops)
- **Frequency**: Multiple times per week
- **Markets covered**: 20+ specific markets (Ilala, Tandika, Temeke, Tandale, etc.)
- **Regions**: Dar es Salaam, Tanga, Kilimanjaro, Singida, Lindi, Iringa, Mara, Songwe, Ruvuma, Shinyanga + more
- **Format**: PDF tables with region + market + crop price columns
- **Crops**: Maize, Rice, Sorghum, Bulrush Millet, Finger Millet, Round Potatoes, Sweet Potatoes, Wheat, Beans
- **New scraper**: `kilimo_pdfs/scrape_all.py --source viwanda`
- **Output**: `prices/viwanda_prices.json`

---

## 3. marketinfo.tantrade.go.tz — TanTrade (iTIMS)

**Market information portal** — broadest product coverage.

- **URL**: https://marketinfo.tantrade.go.tz
- **Market prices**: https://marketinfo.tantrade.go.tz/market-price (requires login partially)
- **Coverage**:
  - 159 products
  - 220 markets
  - 16 sectors
  - 165 councils
  - 32 regions
- **Features**: Honey label certification, Spices label, "Made in Tanzania" brand
- **Access**: Partially restricted (iTIMS login required for some features)

---

## 4. nbs.go.tz — National Bureau of Statistics

**Official statistics** — census and survey data.

- **URL**: https://www.nbs.go.tz
- **Agriculture page**: https://www.nbs.go.tz/statistics/agriculture
- **Key datasets**:
  - Annual Agricultural Sample Surveys (AASS)
  - Agriculture Census 2019/20
  - Agriculture Census 2007/08
  - Food Balance Sheets
  - Large Scale Farms Report 2012/13
  - Food Security Fact Sheets
- **Format**: PDF reports and Excel spreadsheets
- **New scraper**: `kilimo_pdfs/scrape_nbs.py`
- **Output**: `kilimo_pdfs/nbs_data/agriculture_topics.json`

---

## 5. data.humdata.org — WFP Food Prices

**Historical food price data** — global dataset.

- **URL**: https://data.humdata.org/dataset/wfp-food-prices-for-united-republic-of-tanzania-the
- **Coverage**: January 2006 - November 2023
- **Data**: CSV download (9MB)
- **Crops**: Maize, rice, beans, fish, sugar + more
- **Markets**: 3000+ markets across 98 countries
- **Update frequency**: Weekly
- **Format**: CSV (direct download available)

---

## 6. GitHub Research Data Sources

### Tanzania Price Data / Predictions
- **URL**: https://github.com/EiA2030-ex-ante/Tanzania-Price-Data
- **Data**: Cleaned market prices from MIT, 44 markets, 8 crops
- **Format**: CSV with coordinates
- **Models**: Random Forest spatio-temporal predictions
- **Docs**: https://eia2030-ex-ante.github.io/Tanzania-Price-Predictions/

### agritechtz-pycli (Python API Client)
- **URL**: https://pypi.org/project/agritechtz-pycli/
- **Description**: Python library for Tanzanian crop price REST API
- **Author**: Moses Kabungo
- **Install**: `pip install agritechtz-pycli`
- **Usage**: Filter by crop, region, district, date range → returns pandas DataFrame

---

## 7. Crop Boards & Related Agencies

### Cereals and Other Produce Board (CPB) ⭐ MOST RELEVANT
- **URL**: https://www.cpb.go.tz
- **Crops**: Maize, Rice, Beans, Sorghum, Finger Millet (same as our project)
- **Data**: "BEI YA MAZAO KWA VITUO VYA UNUNUZI VYA CPB" — official purchase station prices
- **Products**: Nguvu brand maize flour, rice, cooking oil
- **Scraper**: `kilimo_pdfs/scrape_crop_boards.py` (outputs to `kilimo_pdfs/crop_board_data/cpb.json`)

### Coffee Board (TCB)
- **URL**: https://www.coffee.go.tz
- **Prices**: Live auction prices, farm gate prices, terminal market prices
  - Arabica Clean Coffee: $6.1/kg
  - Robusta Clean Coffee: $3.8/kg
  - Farm Gate Arabica: TZS 4,902-10,213/kg
  - Farm Gate Robusta: TZS 3,650/kg
- **Scraper**: `kilimo_pdfs/scrape_crop_boards.py`

### Tea Board (TBT)
- **URL**: https://www.teaboard.go.tz
- **Data**: Tea auction schedules, sector reports, production stats
- **Scraper**: `kilimo_pdfs/scrape_crop_boards.py`

### Cotton Board
- **URL**: https://www.cpb.go.tz (cotton board site)
- **Data**: Cotton prices (2025/26 season: TZS 1,240/kg), production statistics, grading
- **Scraper**: `kilimo_pdfs/scrape_crop_boards.py`

### Tobacco Board (TTB)
- **URL**: https://www.tobaccoboard.go.tz
- **Data**: Tobacco purchase statistics by season, crop survey data, grower registration
- **Scraper**: `kilimo_pdfs/scrape_crop_boards.py`

### Full List of 21+ Related Sites

| Site | Crop/ Focus | URL |
|------|-------------|-----|
| AGITF | Agriculture Input Trust Fund | https://www.agitf.go.tz |
| ASA | Avocado Society | https://www.asa.go.tz |
| CBT | Cashew Board | https://www.cashew.go.tz |
| COASCO | Cooperative Audit | https://www.coasco.go.tz |
| TCB | Coffee Board ⭐ | https://www.coffee.go.tz |
| COPRA | Copra/Coconut | https://www.copra.go.tz |
| CPB | Cereals Board ⭐⭐ | https://www.cpb.go.tz |
| CPB | Cotton Board ⭐ | https://www.cpb.go.tz |
| NARI | Naliendele Research | https://www.tari.go.tz/centres/tari-naliendele |
| NFRA | Food Reserve | https://www.nfra.go.tz |
| NIRC | Rice Council | https://www.nirc.go.tz |
| SBT | Sisal Board | https://www.sbt.go.tz |
| TARI | Agriculture Research | https://www.tari.go.tz |
| TBT | Tea Board ⭐ | https://www.teaboard.go.tz |
| TCDC | Cooperative Development | https://www.ushirika.go.tz |
| TFC | Fertilizer Company | https://www.fertilizer.co.tz |
| TFRA | Food Reserve | https://www.tfra.go.tz |
| TOSCI | Seeds Certification | https://www.tosci.go.tz |
| TPHPA | Plant Health | https://www.tphpa.go.tz |
| TSB | Sisal Board | https://www.sisalboard.go.tz |
| TTB | Tobacco Board ⭐ | https://www.tobaccoboard.go.tz |
| SAGCOT | Growth Corridor | https://sagcot.co.tz |
| TADB | Agric Development Bank | https://www.tadb.co.tz |

---

## Usage

```bash
# Install dependencies
pip install pdfplumber beautifulsoup4

# 1. Scrape ALL kilimo.go.tz publications (pages 1-10)
python kilimo_pdfs/scrape_all.py --source kilimo

# 2. Scrape viwanda.go.tz wholesale prices
python kilimo_pdfs/scrape_all.py --source viwanda

# 3. Scrape NBS agriculture topics
python kilimo_pdfs/scrape_nbs.py

# 4. Scrape ALL crop board websites (CPB, Coffee, Tea, Cotton, Tobacco, etc.)
python kilimo_pdfs/scrape_crop_boards.py

# 5. Import scraped data into Django database
python manage.py import_scraped_prices

# 6. Just download PDFs without processing
python kilimo_pdfs/scrape_all.py --skip-download

# 7. Existing scraper (specific pages)
python kilimo_pdfs/scrape_kilimo.py --start-page 1 --end-page 10

# 8. Run everything at once
run_all_scrapers.bat
```
