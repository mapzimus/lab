"""Kinshasa population density from GHS-POP — showing densification, not
just telling it.

Source:
- JRC GHS-POP R2023A, 3 arcsec (~92 m), epochs 1975 and 2025 (CC BY 4.0),
  tile R10_C20. Values are persons per cell.
  https://ghsl.jrc.ec.europa.eu/download.php?ds=pop

Chapter 4's claim is that Kinshasa grew mostly by packing people onto the
same ground. This script produces the density surface that shows it, and the
number that proves it: total population living inside the 1975 built
footprint, then vs. now.

Outputs:
- data/kinshasa-density.geojson — stacked density bands (persons/km^2),
  lowest first so higher bands paint on top; carries the densification
  stats as top-level properties.
"""

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.features import shapes as rshapes
from shapely.geometry import shape, mapping
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_geojson

BBOX = (14.95, -4.75, 15.80, -3.95)      # same window as 04_kinshasa.py
BANDS = [5_000, 15_000, 30_000, 60_000]  # persons/km^2, cumulative >=
BUILT_FRACTION = 0.20                    # 1975 footprint, matching 04
MIN_POLY_KM2 = 0.05


def read_window(name):
    path = f"zip://{RAW_DIR}/{name}.zip!/{name}.tif"
    with rasterio.open(path) as src:
        win = from_bounds(*BBOX, transform=src.transform)
        return src.read(1, window=win), src.window_transform(win)


def main():
    pop75, transform = read_window("GHS_POP_E1975_GLOBE_R2023A_4326_3ss_V1_0_R10_C20")
    pop25, _ = read_window("GHS_POP_E2025_GLOBE_R2023A_4326_3ss_V1_0_R10_C20")
    built75, _ = read_window("GHS_BUILT_S_E1975_GLOBE_R2023A_4326_3ss_V1_0_R10_C20")

    cell_deg = abs(transform.a)
    lat_mid = (BBOX[1] + BBOX[3]) / 2
    cell_km2 = (cell_deg * 111.32) * (cell_deg * 111.32 * np.cos(np.radians(lat_mid)))
    density = np.where(pop25 > 0, pop25 / cell_km2, 0.0)

    # The densification number: same 1975 ground, then vs now.
    mask75 = built75 >= BUILT_FRACTION * cell_km2 * 1e6
    inside75_then = float(pop75[mask75].sum())
    inside75_now = float(pop25[mask75].sum())
    stats = {
        "pop_1975_footprint_then_m": round(inside75_then / 1e6, 2),
        "pop_1975_footprint_now_m": round(inside75_now / 1e6, 2),
        "densification_x": round(inside75_now / inside75_then, 1),
    }
    print(f"  1975 footprint held {inside75_then/1e6:.1f}M in 1975; "
          f"{inside75_now/1e6:.1f}M live there in 2025 "
          f"(x{inside75_now/inside75_then:.1f})")

    features = []
    for band in BANDS:
        mask = (density >= band).astype(np.uint8)
        polys = [shape(g) for g, v in rshapes(mask, mask=mask, transform=transform) if v == 1]
        polys = [p for p in polys
                 if p.area * 111.32 * 111.32 * np.cos(np.radians(lat_mid)) >= MIN_POLY_KM2]
        if not polys:
            print(f"  band >={band}: empty, skipped")
            continue
        merged = unary_union(polys).simplify(0.0005, preserve_topology=True)
        features.append({"geometry": mapping(merged), "properties": {"min": band}})
        print(f"  band >={band}/km^2: {len(polys)} polygons")

    write_geojson(DATA_DIR / "kinshasa-density.geojson", features, ndigits=4,
                  extra={"stats": stats})


if __name__ == "__main__":
    main()
