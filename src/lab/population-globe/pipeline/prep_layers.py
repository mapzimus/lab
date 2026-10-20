"""Urban/rural shares (simplified Degree of Urbanisation) and night-light totals per 0.25 deg cell."""
import base64, json, math
import numpy as np
import tifffile
from scipy import ndimage

TIF = "data/ghs/GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif"
LIGHTS = "data/lights/bm2016_3km_gray.tif"
R = 6371.0088
STEP, CW, CH = 0.25, 1440, 720


def cell_list():
    p = json.load(open("data/pop_min.json"))
    q = np.frombuffer(base64.b64decode(p["q"]), "<u2").astype(np.float64)
    d = (10 ** (q / p["k"]) - 1).astype(np.float32)
    return np.nonzero(d >= 1)[0].astype(np.uint32)


def regrid_fine(path, step):
    page = tifffile.TiffFile(path).pages[0]
    lon0, lat0 = page.tags["ModelTiepointTag"].value[3:5]
    px = page.tags["ModelPixelScaleTag"].value[0]
    lat_s = math.floor(lat0 / step) * step; lon_s = math.ceil(lon0 / step) * step
    ry = int(round((lat0 - lat_s) / px)); rx = int(round((lon_s - lon0) / px))
    f = int(round(step / px))
    full = page.asarray(out="memmap")[ry:, rx:]
    h2, w2 = (full.shape[0] // f) * f, (full.shape[1] // f) * f
    rows = []
    S = f * max(1, 600 // f)
    for y in range(0, h2, S):
        blk = np.array(full[y:min(y + S, h2), :w2], dtype=np.float64)
        blk[blk < 0] = 0
        rows.append(blk.reshape(blk.shape[0] // f, f, w2 // f, f).sum(axis=(1, 3)).astype(np.float32))
    agg = np.vstack(rows)
    H, W = int(round(180 / step)), int(round(360 / step))
    grid = np.zeros((H, W), np.float32)
    gy, gx = int(round((90 - lat_s) / step)), int(round((lon_s + 180) / step))
    grid[gy:gy + agg.shape[0], gx:gx + min(agg.shape[1], W - gx)] = agg[:, :W - gx]
    return grid


idx = cell_list()
print("cells", len(idx))

# --- Degree of Urbanisation on a 1 arc-minute grid (~1.85 km) ---
FINE = 1 / 60
P = regrid_fine(TIF, FINE)
lats = 90 - (np.arange(P.shape[0]) + 0.5) * FINE
area = ((R * math.radians(FINE)) ** 2 * np.cos(np.radians(lats))).astype(np.float32)
D = P / np.maximum(area[:, None], 1e-6)

lab, n = ndimage.label(D >= 1500)  # urban centres: 4-connected, >= 50k people
sums = ndimage.sum_labels(P, lab, np.arange(1, n + 1))
centre = np.zeros(n + 1, bool); centre[1:] = sums >= 50000
is_centre = centre[lab]; del lab
lab, n = ndimage.label(D >= 300, structure=np.ones((3, 3)))  # urban clusters: 8-connected, >= 5k
sums = ndimage.sum_labels(P, lab, np.arange(1, n + 1))
clus = np.zeros(n + 1, bool); clus[1:] = sums >= 5000
is_cluster = clus[lab] & ~is_centre; del lab, D

f = int(round(STEP / FINE))
blk = lambda a: a.reshape(CH, f, CW, f).sum(axis=(1, 3), dtype=np.float64)
tot = blk(P); cen = blk(np.where(is_centre, P, 0)); clu = blk(np.where(is_cluster, P, 0))
del P, is_centre, is_cluster
with np.errstate(invalid="ignore", divide="ignore"):
    s_cen = np.nan_to_num(cen / tot).ravel()[idx]; s_clu = np.nan_to_num(clu / tot).ravel()[idx]
print("world urban-centre share", cen.sum() / tot.sum(), "cluster share", clu.sum() / tot.sum())

# --- Night lights: linearised display brightness x pixel area, summed per cell ---
L = tifffile.imread(LIGHTS)[..., 0].astype(np.float32)
lpx = 180 / L.shape[0]
llat = 90 - (np.arange(L.shape[0]) + 0.5) * lpx
L[L < 6] = 0  # faint halo and background, not lights
lin = (L / 255.0) ** 2.2 * np.cos(np.radians(llat))[:, None]
rows = np.floor((90 - llat) / STEP).astype(int).clip(0, CH - 1)
cols = np.floor(((np.arange(L.shape[1]) + 0.5) * lpx) / STEP).astype(int).clip(0, CW - 1)
cell = (rows[:, None] * CW + cols[None, :]).ravel()
light = np.bincount(cell, weights=lin.ravel(), minlength=CH * CW)[idx]
print("lit cells", int((light > 0).sum()), "max", light.max())

enc = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
json.dump({
    "idx": enc(idx.astype("<u4")),
    "centre": enc(np.round(s_cen * 250).astype(np.uint8)),
    "cluster": enc(np.round(s_clu * 250).astype(np.uint8)),
    "lights": enc(np.round(np.log10(1 + light * 1000) * 13000).clip(0, 65535).astype("<u2")),
    "k": 13000, "lightsYear": 2016,
}, open("data/layers_min.json", "w"), separators=(",", ":"))
print("wrote layers")
