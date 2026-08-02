import json
d = json.load(open(r'F:\project 1\crop-price-tracker\prices\viwanda_prices.json'))
total = sum(len(pdf.get('entries', [])) for pdf in d['data'])
print(f'Total entries across all PDFs: {total}')
print(f'Total PDFs: {len(d["data"])}')

# Show regions found
regions = set()
for pdf in d['data']:
    for e in pdf.get('entries', []):
        regions.add(e['region'])
print(f'Unique regions: {sorted(regions)}')
