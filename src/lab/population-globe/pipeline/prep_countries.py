import base64, json, math, sys
import numpy as np
import tifffile
from PIL import Image, ImageDraw

TIF = "data/ghs/GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif"
NE = "data/ne/ne_50m_admin_0_countries.geojson"
R = 6371.0088


def regrid(step):
    """population summed onto a global step-degree grid (rows from 90N, cols from 180W)."""
    page = tifffile.TiffFile(TIF).pages[0]
    lon0, lat0 = page.tags["ModelTiepointTag"].value[3:5]
    px = page.tags["ModelPixelScaleTag"].value[0]
    lat_s = math.floor(lat0 / step) * step; lon_s = math.ceil(lon0 / step) * step
    ry = int(round((lat0 - lat_s) / px)); rx = int(round((lon_s - lon0) / px))
    f = int(round(step / px))
    full = page.asarray(out="memmap")[ry:, rx:]
    h2, w2 = (full.shape[0] // f) * f, (full.shape[1] // f) * f
    rows = []
    for y in range(0, h2, f * 100):
        blk = np.array(full[y:min(y + f * 100, h2), :w2], dtype=np.float64)
        blk[blk < 0] = 0
        rows.append(blk.reshape(blk.shape[0] // f, f, w2 // f, f).sum(axis=(1, 3)))
    agg = np.vstack(rows)
    del full
    grid = np.zeros((int(round(180 / step)), int(round(360 / step))))
    gy, gx = int(round((90 - lat_s) / step)), int(round((lon_s + 180) / step))
    grid[gy:gy + agg.shape[0], gx:gx + agg.shape[1]] = agg[:, :grid.shape[1] - gx]
    return grid


def rasterize(feats, step):
    W, H = int(round(360 / step)), int(round(180 / step))
    img = Image.new("I", (W, H), 0)
    d = ImageDraw.Draw(img)
    for i, f in enumerate(feats):
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for k, ring in enumerate(poly):
                pts = [((lon + 180) / step, (90 - lat) / step) for lon, lat in ring]
                if len(pts) >= 3:
                    d.polygon(pts, fill=(i + 1) if k == 0 else 0)
    return np.array(img, dtype=np.int32)


feats = [f for f in json.load(open(NE, encoding="utf-8"))["features"]]
STEP_FINE = 0.05
pop = regrid(STEP_FINE)
cid = rasterize(feats, STEP_FINE)
lats = 90 - (np.arange(pop.shape[0]) + 0.5) * STEP_FINE
area = (R * math.radians(STEP_FINE)) ** 2 * np.cos(np.radians(lats))
n = len(feats) + 1
tot_pop = np.bincount(cid.ravel(), weights=pop.ravel(), minlength=n)
tot_area = np.bincount(cid.ravel(), weights=np.broadcast_to(area[:, None], cid.shape).ravel(), minlength=n)
print("assigned population", f"{tot_pop[1:].sum():,.0f}", "unassigned", f"{tot_pop[0]:,.0f}")

countries = []
idx = {}
for i, f in enumerate(feats):
    p = f["properties"]
    P, A = tot_pop[i + 1], tot_area[i + 1]
    if A < 300 or P < 1000:
        continue
    idx[i + 1] = len(countries)
    countries.append([p["NAME"], p["ADM0_A3"], int(round(P)), int(round(A)), round(P / A, 2),
                      round(p.get("LABEL_Y") or 0, 2), round(p.get("LABEL_X") or 0, 2)])

coarse = rasterize(feats, 0.25)
out = np.full(coarse.shape, 255, np.uint8)
for k, v in idx.items():
    out[coarse == k] = v
assert len(countries) < 255
json.dump({"countries": countries, "grid": base64.b64encode(out.tobytes()).decode(), "w": out.shape[1], "h": out.shape[0]},
          open("data/countries_min.json", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
countries.sort(key=lambda c: -c[2])
print(len(countries), "countries")
for c in countries[:6]: print(c)
for c in sorted(countries, key=lambda c: -c[4])[:6]: print(c)
