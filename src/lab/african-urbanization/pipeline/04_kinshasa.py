"""Kinshasa-Brazzaville built-up footprints, 1975-2030, from GHSL.

Source:
- JRC Global Human Settlement Layer, GHS-BUILT-S R2023A, 3 arcsec (~92 m),
  epochs 1975/1990/2000/2010/2020/2030 (CC BY 4.0). Tile R10_C20.
  https://ghsl.jrc.ec.europa.eu/download.php?ds=bu
  Values are built-up surface m^2 per cell; a cell counts as built here when
  at least 20% of its area is built.

Output:
- data/kinshasa-builtup.geojson — one cumulative MultiPolygon footprint per
  epoch (covers both Kinshasa and Brazzaville sides of the Pool), with the
  raw built-up surface total for the window as built_km2.
"""

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.features import shapes as rshapes
from shapely.geometry import shape, mapping
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_geojson

EPOCHS = [1975, 1990, 2000, 2010, 2020, 2030]
# Kinshasa + Brazzaville and the sprawl corridor east toward N'sele.
BBOX = (14.95, -4.75, 15.80, -3.95)  # w, s, e, n
BUILT_FRACTION = 0.20
MIN_POLY_KM2 = 0.03


def main():
    features = []
    prev_mask = None
    for epoch in EPOCHS:
        name = f"GHS_BUILT_S_E{epoch}_GLOBE_R2023A_4326_3ss_V1_0_R10_C20"
        path = f"zip://{RAW_DIR}/{name}.zip!/{name}.tif"
        with rasterio.open(path) as src:
            win = from_bounds(*BBOX, transform=src.transform)
            data = src.read(1, window=win)
            transform = src.window_transform(win)
        # Cell area in m^2 at this latitude (3 arcsec grid).
        cell_deg = abs(transform.a)
        lat_mid = (BBOX[1] + BBOX[3]) / 2
        cell_m2 = (cell_deg * 111_320) * (cell_deg * 111_320 * np.cos(np.radians(lat_mid)))
        mask = (data >= BUILT_FRACTION * cell_m2).astype(np.uint8)
        # Cumulative: once built, stays in every later epoch, so stacking the
        # epochs oldest-on-top renders growth-vintage rings with no gaps.
        if prev_mask is not None:
            mask = np.maximum(mask, prev_mask)
        prev_mask = mask
        built_km2 = float(data[data > 0].sum()) / 1e6

        polys = [shape(geom) for geom, val in rshapes(mask, mask=mask, transform=transform) if val == 1]
        merged = unary_union(polys)
        merged = merged.simplify(0.00045, preserve_topology=True)
        if merged.geom_type == "Polygon":
            parts = [merged]
        else:
            parts = list(merged.geoms)
        parts = [p for p in parts if p.area * 111.32 * 111.32 * np.cos(np.radians(lat_mid)) >= MIN_POLY_KM2]
        merged = unary_union(parts)
        features.append({
            "geometry": mapping(merged),
            "properties": {"epoch": epoch, "built_km2": round(built_km2, 1)},
        })
        print(f"  {epoch}: built surface {built_km2:.0f} km^2, {len(parts)} footprint polygons")

    write_geojson(DATA_DIR / "kinshasa-builtup.geojson", features, ndigits=4)


if __name__ == "__main__":
    main()
