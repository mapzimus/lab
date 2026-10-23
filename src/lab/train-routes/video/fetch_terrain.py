"""Terrain and satellite imagery around the Glacier Express, in one local metre frame.
Needs cache/route.json from fetch_route.py. Writes into video/cache/ (not committed):

    terrain.bin     int16 heights (m), GRID m spacing, row 0 = north edge, little-endian
    img_{r}{c}.jpg  EOX Sentinel-2 cloudless 2020 at z13, the box split 2 x 2 (each under 8192 px)
    meta.json       box, origin, grid size, and track elevation per route point

Frame: x east, z south, metres from the box centre (lon0, lat0); x = (lon - lon0) * kx, z = -(lat - lat0) * ky.
Heights: AWS Terrain Tiles (Terrarium encoding, Mapzen; includes SRTM, EU-DEM and others).
Imagery: Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020).

    python3 video/fetch_terrain.py
"""

from __future__ import annotations

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
os.environ.setdefault("SSL_CERT_FILE", "/root/.ccr/ca-bundle.crt")

DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
EOX = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"
MARGIN = 0.08   # degrees around the route's bounding box
GRID = 100      # terrain mesh spacing, m
R = 6371008.8


def tile(url, z, x, y):
    name = "dem" if "terrarium" in url else "eox"
    p = CACHE / "tiles" / name / f"{z}_{x}_{y}"
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url.format(z=z, x=x, y=y), headers={"User-Agent": "mapzimus-lab video"})
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
    return (lon + 180) / 360 * n * 256, (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n * 256


def mosaic(url, z, lat, lon, bilinear=False):
    """Sample a mercator tile pyramid at arrays of lat/lon. Returns float RGB."""
    px, py = merc(lat, lon, z)
    if bilinear:
        px, py = px - 0.5, py - 0.5
    x0, y0 = np.floor(px).astype(int), np.floor(py).astype(int)
    tx0, tx1 = (x0.min()) // 256, (x0.max() + 1) // 256
    ty0, ty1 = (y0.min()) // 256, (y0.max() + 1) // 256
    need = [(x, y) for y in range(ty0, ty1 + 1) for x in range(tx0, tx1 + 1)]
    print(f"  {len(need)} tiles at z{z}")
    with ThreadPoolExecutor(12) as ex:
        imgs = list(ex.map(lambda t: tile(url, z, t[0], t[1]), need))
    big = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256, 3), np.float32)
    for (x, y), im in zip(need, imgs):
        big[(y - ty0) * 256:(y - ty0 + 1) * 256, (x - tx0) * 256:(x - tx0 + 1) * 256] = im
    gx, gy = px - tx0 * 256, py - ty0 * 256
    if not bilinear:
        return big[gy.astype(int), gx.astype(int)]
    ix, iy = np.floor(gx).astype(int), np.floor(gy).astype(int)
    fx, fy = (gx - ix)[..., None], (gy - iy)[..., None]
    a, b = big[iy, ix], big[iy, ix + 1]
    c, d = big[iy + 1, ix], big[iy + 1, ix + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def height(rgb):
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768


def main():
    route = json.loads((CACHE / "route.json").read_text())
    lons = [c[0] for c in route["coords"]]
    lats = [c[1] for c in route["coords"]]
    lonA, lonB = min(lons) - MARGIN, max(lons) + MARGIN
    latA, latB = min(lats) - MARGIN, max(lats) + MARGIN
    lon0, lat0 = (lonA + lonB) / 2, (latA + latB) / 2
    kx, ky = math.cos(math.radians(lat0)) * R * math.pi / 180, R * math.pi / 180
    x0, x1 = (lonA - lon0) * kx, (lonB - lon0) * kx
    z0, z1 = -(latB - lat0) * ky, -(latA - lat0) * ky

    # terrain grid
    nx, nz = int((x1 - x0) / GRID) + 1, int((z1 - z0) / GRID) + 1
    X = x0 + np.arange(nx) * GRID
    Z = z0 + np.arange(nz) * GRID
    XX, ZZ = np.meshgrid(X, Z)
    print("terrain", nx, "x", nz)
    h = height(mosaic(DEM, 12, lat0 - ZZ / ky, lon0 + XX / kx, bilinear=True))
    np.clip(np.round(h), -500, 9000).astype("<i2").tofile(CACHE / "terrain.bin")

    # imagery, 2 x 2 textures at ~13 m/px
    mpp = 13.0
    W, H = int((x1 - x0) / mpp), int((z1 - z0) / mpp)
    for r in range(2):
        for c in range(2):
            name = f"img_{r}{c}.jpg"
            if (CACHE / name).exists():
                continue
            w0, w1 = c * W // 2, (c + 1) * W // 2
            h0, h1 = r * H // 2, (r + 1) * H // 2
            XX, ZZ = np.meshgrid(x0 + (np.arange(w0, w1) + 0.5) * mpp, z0 + (np.arange(h0, h1) + 0.5) * mpp)
            print(name, w1 - w0, "x", h1 - h0)
            Image.fromarray(mosaic(EOX, 13, lat0 - ZZ / ky, lon0 + XX / kx).astype(np.uint8)).save(CACHE / name, quality=90)

    # track elevation: the ground under the line, straight-lined through tunnels between their portals
    rl, rn = np.array(lats), np.array(lons)
    ground = height(mosaic(DEM, 13, rl, rn, bilinear=True))
    kind = route["kind"]
    inside = np.array([False] + [k == "tunnel" for k in kind])  # point i ends segment i-1
    elev = ground.copy()
    i = 0
    while i < len(elev):
        if inside[i]:
            j = i
            while j < len(elev) and inside[j]:
                j += 1
            a, b = i - 1, min(j, len(elev) - 1)
            t = np.linspace(0, 1, b - a + 1)
            elev[a:b + 1] = ground[a] + (ground[b] - ground[a]) * t
            i = j
        else:
            i += 1
    top = int(np.argmax(elev))
    print(f"track: {elev[0]:.0f} m at Zermatt, highest {elev[top]:.0f} m at km {route['km'][top]:.1f}, {elev[-1]:.0f} m at St. Moritz")

    meta = {"lon0": lon0, "lat0": lat0, "kx": kx, "ky": ky, "box": [x0, x1, z0, z1], "grid": GRID, "nx": nx, "nz": nz,
            "img": {"mpp": mpp, "w": W, "h": H}, "elev": [round(float(e), 1) for e in elev],
            "top": {"km": route["km"][top], "m": round(float(elev[top]))}}
    (CACHE / "meta.json").write_text(json.dumps(meta))


if __name__ == "__main__":
    main()
