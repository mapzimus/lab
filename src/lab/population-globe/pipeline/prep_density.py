import base64, json, math, sys, zipfile
import numpy as np
import tifffile

zpath, dst = sys.argv[1], sys.argv[2]
STEP = 0.25
with zipfile.ZipFile(zpath) as z:
    name = next(n for n in z.namelist() if n.lower().endswith(".tif"))
    z.extract(name, "data/ghs")
tif = tifffile.TiffFile("data/ghs/" + name)
page = tif.pages[0]
scale = page.tags["ModelPixelScaleTag"].value
tie = page.tags["ModelTiepointTag"].value
lon0, lat0, px = tie[3], tie[4], scale[0]
H, W = page.shape
print(name, page.shape, page.dtype, "origin", lon0, lat0, "px", px)

f = int(round(STEP / px))
nx, ny = 360 / STEP, 180 / STEP
lat_s = math.floor(lat0 / STEP) * STEP; lon_s = math.ceil(lon0 / STEP) * STEP
ry = int(round((lat0 - lat_s) / px)); rx = int(round((lon_s - lon0) / px))
gx0 = int(round((lon_s + 180) / STEP)); gy0 = int(round((90 - lat_s) / STEP))
grid = np.zeros((int(ny), int(nx)), np.float64)
arr = page.asarray()[ry:, rx:]
H, W = arr.shape
arr = np.where(arr > 0, arr, 0).astype(np.float32)
h2, w2 = (H // f) * f, (W // f) * f
agg = arr[:h2, :w2].reshape(h2 // f, f, w2 // f, f).sum(axis=(1, 3), dtype=np.float64)
grid[gy0:gy0 + agg.shape[0], gx0:gx0 + agg.shape[1]] = agg
del arr
total = grid.sum()
print("total population", f"{total:,.0f}")

R = 6371.0088
lats = 90 - (np.arange(int(ny)) + 0.5) * STEP
area = (R * math.radians(STEP)) ** 2 * np.cos(np.radians(lats))
dens = grid / area[:, None]
print("max density", dens.max(), "nonzero cells (>=1/km2)", int((dens >= 1).sum()))
q = np.round(np.log10(1 + dens) * 13000).clip(0, 65535).astype("<u2")
json.dump({"step": STEP, "w": int(nx), "h": int(ny), "k": 13000, "total": round(total),
           "year": 2025, "q": base64.b64encode(q.tobytes()).decode()},
          open(dst, "w"), separators=(",", ":"))
