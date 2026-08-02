import json
d = json.load(open(r'F:\project 1\crop-price-tracker\prices\viwanda_prices.json'))
print('Total PDFs:', len(d['data']))
for pdf in d['data'][:2]:
    entries = pdf.get('entries', [])
    fname = pdf['file']
    print(f'{fname}: {len(entries)} entries')
    if entries:
        print(f'  Sample: {entries[0]}')
