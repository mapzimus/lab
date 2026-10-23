"""Satellite imagery for the video's realistic Earth. Writes video/cache/*.jpg (not committed).

    globe.jpg   EOX Sentinel-2 cloudless 2020, z4, reprojected to equirectangular 4096 x 2048
    region.jpg  same source, z10, over the app's REG box (-73.6..-68.6, 40.4..44.2), equirectangular
    boston.jpg  Esri World Imagery, z16, in Boston's local metre frame (x east, z south)
    metro.jpg   same, z13, 60 km around Boston, bridging the region and the city
    lynn.jpg    same for Lynn

Imagery: Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020);
Esri, Maxar, Earthstar Geographics.

    python3 video/fetch_imagery.py
"""

from __future__ import annotations

import io
import json
import math
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
CACHE = HERE / "cache"
TILES = CACHE / "tiles"
DATA = HERE.parent / "data"
os.environ.setdefault("SSL_CERT_FILE", "/root/.ccr/ca-bundle.crt")

EOX = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"
ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"


def tile(src: str, z: int, x: int, y: int) -> np.ndarray:
    name = "eox" if "eox" in src else "esri"
    p = TILES / name / f"{z}_{x}_{y}.jpg"
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(src.format(z=z, x=x, y=y), headers={"User-Agent": "mapzimus-lab video"})
        for attempt in range(4):
            try:
                p.write_bytes(urllib.request.urlopen(req, timeout=60).read())
                break
            except Exception:
                if attempt == 3:
                    raise
    return np.asarray(Image.open(p).convert("RGB"))


def merc(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    lat = np.clip(lat, -85.0511, 85.0511)
    y = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n
    return x * 256, y * 256  # global pixel coords


def sample(src, z, lat, lon):
    """Bilinear-free nearest sample of a mercator tile pyramid at arrays of lat/lon."""
    px, py = merc(lat, lon, z)
    n = 2 ** z
    px = np.mod(px, n * 256)
    py = np.clip(py, 0, n * 256 - 1)
    tx, ty = (px // 256).astype(int), (py // 256).astype(int)
    need = sorted(set(zip(tx.ravel().tolist(), ty.ravel().tolist())))
    print(f"  {len(need)} tiles at z{z}")
    with ThreadPoolExecutor(12) as ex:
        imgs = dict(zip(need, ex.map(lambda t: tile(src, z, t[0], t[1]), need)))
    out = np.zeros(lat.shape + (3,), np.uint8)
    for (x, y), im in imgs.items():
        m = (tx == x) & (ty == y)
        out[m] = im[(py[m] - y * 256).astype(int), (px[m] - x * 256).astype(int)]
    return out


def equirect(src, z, lonA, lonB, latA, latB, w, h, name):
    lon = lonA + (np.arange(w) + 0.5) / w * (lonB - lonA)
    lat = latB - (np.arange(h) + 0.5) / h * (latB - latA)  # row 0 = north
    LON, LAT = np.meshgrid(lon, lat)
    print(name)
    Image.fromarray(sample(src, z, LAT, LON)).save(CACHE / name, quality=90)


def city(json_name, kx, ky, margin, z, px_max, name):
    D = json.loads((DATA / json_name).read_text())
    lat0, lon0 = D["lat0"], D["lon0"]
    x0, x1, z0, z1 = D["box"]
    x0, x1, z0, z1 = x0 - margin, x1 + margin, z0 - margin, z1 + margin
    mpp = max(x1 - x0, z1 - z0) / px_max
    w, h = round((x1 - x0) / mpp), round((z1 - z0) / mpp)
    X = x0 + (np.arange(w) + 0.5) * mpp
    Z = z0 + (np.arange(h) + 0.5) * mpp  # row 0 = north (smallest z)
    XX, ZZ = np.meshgrid(X, Z)
    lon = lon0 + XX / kx(lat0)
    lat = lat0 - ZZ / ky
    print(name, w, "x", h, f"{mpp:.2f} m/px")
    Image.fromarray(sample(ESRI, z, lat, lon)).save(CACHE / name, quality=90)
    return {"rect": [x0, x1, z0, z1]}


if __name__ == "__main__":
    CACHE.mkdir(exist_ok=True)
    if not (CACHE / "globe.jpg").exists():
        equirect(EOX, 4, -180, 180, -90, 90, 4096, 2048, "globe.jpg")
        equirect(EOX, 10, -73.6, -68.6, 40.4, 44.2, 4096, 4096, "region.jpg")
    R = 6371008.8
    meta = {
        # Boston's pipeline uses flat 111,320 / 110,540 m per degree; Lynn's uses the sphere
        "boston": city("boston.json", lambda la: math.cos(math.radians(la)) * 111320, 110540, 2500, 16, 4096, "boston.jpg"),
        "metro": city("boston.json", lambda la: math.cos(math.radians(la)) * 111320, 110540, 28000, 13, 4096, "metro.jpg"),
        "lynn": city("lynn.json", lambda la: math.cos(math.radians(la)) * R * math.pi / 180, R * math.pi / 180, 2500, 16, 4096, "lynn.jpg"),
    }
    (CACHE / "meta.json").write_text(json.dumps(meta))
