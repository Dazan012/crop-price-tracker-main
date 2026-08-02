@echo off
REM ============================================
REM Run all Tanzania agricultural data scrapers
REM ============================================
echo.
echo ============================================
echo STEP 1: Installing dependencies
echo ============================================
call pip install pdfplumber beautifulsoup4

echo.
echo ============================================
echo STEP 2: Scraping kilimo.go.tz ALL publications
echo ============================================
call python kilimo_pdfs/scrape_all.py --source kilimo --start-page 1 --end-page 10

echo.
echo ============================================
echo STEP 3: Scraping viwanda.go.tz wholesale prices
echo ============================================
call python kilimo_pdfs/scrape_all.py --source viwanda

echo.
echo ============================================
echo STEP 4: Scraping NBS agriculture topics
echo ============================================
call python kilimo_pdfs/scrape_nbs.py

echo.
echo ============================================
echo STEP 5: Importing into Django database
echo ============================================
call python manage.py import_scraped_prices

echo.
echo ============================================
echo ALL DONE!
echo ============================================
pause
