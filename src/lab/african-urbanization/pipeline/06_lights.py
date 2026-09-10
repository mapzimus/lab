"""Nighttime lights over Africa — observed evidence behind the projections.

Source:
- Li, Zhou, Zhao & Zhao, harmonized global nighttime light dataset
  (DMSP/VIIRS-consistent, 30 arcsec, DN 0-63), 2020 simVIIRS layer.
  https://doi.org/10.6084/m9.figshare.9828827 (CC BY 4.0)

The lights are the story's reality check: the projected megacity arcs and
modeled corridors should already glow. Two classes keep the layer readable
at continental zoom: 'lit' (any sustained light) and 'bright' (urban cores).

Output:
- data/lights.geojson — one MultiPolygon per class, simplified for ~z3-5.
"""

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.features import shapes as rshapes
from shapely.geometry import shape, mapping
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_geojson

AFRICA = (-20.0, -36.0, 56.0, 38.5)  # w, s, e, n
CLASSES = [("lit", 7), ("bright", 30)]  # DN thresholds, 0-63 scale
MIN_KM2 = 60.0  # drop specks a continental zoom can't show anyway


def main():
    with rasterio.open(RAW_DIR / "Harmonized_DN_NTL_2020_simVIIRS.tif") as src:
        win = from_bounds(*AFRICA, transform=src.transform)
        data = src.read(1, window=win)
        transform = src.window_transform(win)

    features = []
    for name, threshold in CLASSES:
        mask = (data >= threshold).astype(np.uint8)
        polys = [shape(g) for g, v in rshapes(mask, mask=mask, transform=transform) if v == 1]
        km2 = lambda p: p.area * 111.32 * 111.32  # rough at these latitudes
        polys = [p for p in polys if km2(p) >= MIN_KM2]
        merged = unary_union(polys).simplify(0.035, preserve_topology=True)
        features.append({"geometry": mapping(merged), "properties": {"class": name}})
        total = sum(km2(p) for p in polys)
        print(f"  {name} (DN>={threshold}): {len(polys)} patches, ~{total/1000:.0f}k km^2")

    write_geojson(DATA_DIR / "lights.geojson", features, ndigits=2)


if __name__ == "__main__":
    main()
