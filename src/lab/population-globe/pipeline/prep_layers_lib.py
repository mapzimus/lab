"""Urban/rural shares (simplified Degree of Urbanisation) and night-light totals per 0.25 deg cell."""
import base64, json, math
import numpy as np
import tifffile

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


