from pathlib import Path
from difflib import unified_diff

pairs = [
    ('frontend/src/pages/Landing.js', 'C:/Users/PABIO/Downloads/crop-price-tracker-main/frontend/src/pages/Landing.js'),
    ('frontend/src/pages/Register.js', 'C:/Users/PABIO/Downloads/crop-price-tracker-main/frontend/src/pages/Register.js'),
]

with open('compare_output.txt', 'w', encoding='utf-8') as out:
    for local, remote in pairs:
        out.write(f'FILE {local}\n')
        a = Path(local).read_text(encoding='utf-8', errors='ignore').splitlines()
        b = Path(remote).read_text(encoding='utf-8', errors='ignore').splitlines()
        diff = list(unified_diff(b, a, fromfile='downloaded', tofile='current', n=3))
        for line in diff:
            out.write(line + '\n')
        out.write('--- END ---\n')
