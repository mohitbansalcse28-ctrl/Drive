"""Measure the NSIS progress-bar fill in each recorded frame and report whether it ever moves backwards.
   python3 tests/installer/progress.py <frames-dir>
Geometry is for the 1024x768 capture made by record.sh (the installer window is centred)."""
import glob, sys
from PIL import Image

Y, X0, X1 = 320, 287, 734

def is_fill(p):
    return p[2] > 180 and p[0] < 120 and 100 < p[1] < 200

def is_track(p):
    return is_fill(p) or sum(p) > 700

series = []
for f in sorted(glob.glob(f"{sys.argv[1]}/f*.png")):
    px = Image.open(f).convert("RGB").load()
    row = [px[x, Y] for x in range(X0, X1 + 1)]
    if not all(is_track(p) for p in row) or not is_fill(row[0]) and series == []:
        if series and not all(is_track(p) for p in row):
            break  # progress page left
        continue
    series.append(round(100 * sum(1 for p in row if is_fill(p)) / len(row)))

drops = [(i, a, b) for i, (a, b) in enumerate(zip(series, series[1:])) if b < a - 1]
print("progress %:", " ".join(map(str, series)))
print("backward jumps:", len(drops), drops[:10])
sys.exit(1 if drops or not series else 0)
