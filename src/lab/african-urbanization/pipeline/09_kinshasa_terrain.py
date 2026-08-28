"""The hills Kinshasa grew onto, and what that costs.

The colonial city was laid out on flat ground beside the river. Everything
built since has had to go somewhere, and a lot of it went up the slopes to the
south and west. That matters: on bare tropical slopes without drainage, heavy
rain cuts erosion gullies that take houses and roads with them, and Kinshasa
loses buildings to them every wet season.

This script derives slope from the Copernicus 30 m DEM and measures, for each
GHSL epoch, how much of that epoch's built ground sits on ground steep enough
to be a problem. The answer is the point: the old city almost entirely avoided
it, and the new city could not.

Sources:
- Copernicus DEM GLO-30 (ESA, free and open licence), four 1-degree tiles
  covering the window. https://spacedata.copernicus.eu/
- JRC GHS-BUILT-S R2023A, 3 arcsec, tile R10_C20 (CC BY 4.0), already
  downloaded for 04_kinshasa.py.

Outputs:
- data/kinshasa-slope.geojson — moderate and steep slope polygons, clipped to
  the chapter window, with the per-epoch built-on-slope shares attached.
"""

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.merge import merge as rmerge
from rasterio.features import shapes as rshapes
from shapely.geometry import shape, mapping
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_geojson

# Deliberately wider than the 04/07/12 window. Slope is a backdrop layer, so
# its edge must fall outside anything the chapter's camera can show; clipped to
# the story window it drew a hard rectangle across the frame. The four DEM
# tiles cover 14-16E and 3-5S, so there is room.
BBOX = (14.55, -5.00, 16.00, -3.72)
BUILT_BBOX = (14.95, -4.75, 15.80, -3.95)   # the window 04, 07 and 12 use
EPOCHS = [1975, 1990, 2000, 2010, 2020, 2030]
BUILT_FRACTION = 0.20
# Degrees. The window's median slope is about 6, so a 5 degree class would
# just outline most of the region and say nothing. 10 is where informal
# building needs cut terraces and the erosion gullies start; 15 is where the
# city's landslide-prone quarters sit. Kept coarse deliberately: the DEM is
# 30 m and the built grid is 92 m, so finer classes would be false precision.
CLASSES = [("steep", 10.0), ("steepest", 15.0)]
MIN_POLY_KM2 = 0.4
# 3 DEM cells ~= 90 m, matching the 3 arcsec built-up grid this is compared to.
DECIMATE = 3
DEM_TILES = ["S05_00_E014", "S05_00_E015", "S04_00_E014", "S04_00_E015"]


def read_builtup(epoch):
    name = f"GHS_BUILT_S_E{epoch}_GLOBE_R2023A_4326_3ss_V1_0_R10_C20"
    with rasterio.open(f"zip://{RAW_DIR}/{name}.zip!/{name}.tif") as src:
        win = from_bounds(*BUILT_BBOX, transform=src.transform)
        return src.read(1, window=win), src.window_transform(win)


def dem_mosaic():
    """Mosaic the tiles and step down to roughly the built-up grid.

    The DEM is 30 m. Slope computed at that spacing is noisy enough that
    thresholding it produces hundreds of thousands of speckle polygons, which
    is both unusably slow to dissolve and a false claim of precision: the
    built-up layer this gets compared against is 92 m. Block-averaging by
    DECIMATE first gives a slope surface at about the same scale as the thing
    it explains, and the polygon count drops by orders of magnitude.
    """
    srcs = [rasterio.open(RAW_DIR / f"Copernicus_DSM_COG_10_{t}_00_DEM.tif") for t in DEM_TILES]
    arr, transform = rmerge(srcs, bounds=BBOX)
    for s in srcs:
        s.close()
    elev = arr[0].astype("float32")
    elev[elev < -1000] = np.nan          # tile nodata
    rows = elev.shape[0] // DECIMATE * DECIMATE
    cols = elev.shape[1] // DECIMATE * DECIMATE
    coarse = np.nanmean(
        elev[:rows, :cols].reshape(rows // DECIMATE, DECIMATE, cols // DECIMATE, DECIMATE),
        axis=(1, 3))
    return coarse, transform * rasterio.Affine.scale(DECIMATE, DECIMATE)


def slope_degrees(elev, transform):
    """Horn's method, on a geographic grid, so the x spacing shrinks with
    latitude. At 4 degrees south the difference is under a percent, but doing
    it properly costs one cosine."""
    lat_mid = (BBOX[1] + BBOX[3]) / 2
    ky = abs(transform.e) * 111_320.0
    kx = abs(transform.a) * 111_320.0 * np.cos(np.radians(lat_mid))
    dy, dx = np.gradient(elev, ky, kx)
    return np.degrees(np.arctan(np.sqrt(dx ** 2 + dy ** 2)))


def main():
    elev, dem_transform = dem_mosaic()
    slope = slope_degrees(elev, dem_transform)
    # A 3x3 mean over the slope surface: thresholding a raw gradient traces
    # every gully wall separately, and the story is about hillsides.
    pad = np.pad(slope, 1, mode="edge")
    slope = sum(pad[i:i + slope.shape[0], j:j + slope.shape[1]]
                for i in range(3) for j in range(3)) / 9.0
    print(f"  DEM {elev.shape[0]}x{elev.shape[1]} cells, "
          f"elevation {np.nanmin(elev):.0f} to {np.nanmax(elev):.0f} m")
    for q in (50, 75, 90, 95, 99):
        print(f"    slope p{q}: {np.percentile(slope, q):.1f} deg")

    # What each epoch's NEW ground did, not the cumulative footprint. The
    # cumulative version is swamped by everything standing in 1975, so it
    # barely moves and hides the actual behaviour of each decade's growth.
    def slope_at(mask, bt):
        rows, cols = np.nonzero(mask)
        lons = bt.c + (cols + 0.5) * bt.a
        lats = bt.f + (rows + 0.5) * bt.e
        dr = ((lats - dem_transform.f) / dem_transform.e).astype(int)
        dc = ((lons - dem_transform.c) / dem_transform.a).astype(int)
        keep = (dr >= 0) & (dr < slope.shape[0]) & (dc >= 0) & (dc < slope.shape[1])
        return slope[dr[keep], dc[keep]]

    def shares(vals):
        out = {name: round(float((vals >= thr).sum()) / len(vals) * 100, 1)
               for name, thr in CLASSES}
        out["medianSlope"] = round(float(np.median(vals)), 1)
        out["cells"] = int(len(vals))
        return out

    built_stats, prev_mask = {}, None
    for epoch in EPOCHS:
        built, bt = read_builtup(epoch)
        cell_km2 = (abs(bt.a) * 111.32) * (abs(bt.e) * 111.32 *
                                           np.cos(np.radians((BBOX[1] + BBOX[3]) / 2)))
        mask = built >= BUILT_FRACTION * cell_km2 * 1e6
        entry = {"all": shares(slope_at(mask, bt))}
        if prev_mask is not None:
            new = mask & ~prev_mask
            if new.sum() > 50:
                entry["new"] = shares(slope_at(new, bt))
        built_stats[str(epoch)] = entry
        prev_mask = mask
        a = entry["all"]
        line = (f"  {epoch}: all built ground median {a['medianSlope']} deg, "
                f"{a['steep']}% above 10")
        if "new" in entry:
            n = entry["new"]
            line += (f"   |   ground added this epoch: median {n['medianSlope']} deg, "
                     f"{n['steep']}% above 10, {n['steepest']}% above 15")
        print(line)

    # Polygons for the map, coarsest class first so steep paints on top.
    features = []
    for name, thr in CLASSES:
        m = (slope >= thr).astype(np.uint8)
        polys = [shape(g) for g, v in rshapes(m, mask=m.astype(bool), transform=dem_transform)
                 if v == 1]
        lat_mid = (BBOX[1] + BBOX[3]) / 2
        polys = [p for p in polys
                 if p.area * 111.32 * 111.32 * np.cos(np.radians(lat_mid)) >= MIN_POLY_KM2]
        if not polys:
            print(f"  class {name}: empty, skipped")
            continue
        merged = unary_union(polys).simplify(0.0016, preserve_topology=True)
        features.append({"geometry": mapping(merged),
                         "properties": {"class": name, "min_deg": thr}})
        print(f"  class {name} (>={thr} deg): {len(polys)} polygons kept")

    write_geojson(DATA_DIR / "kinshasa-slope.geojson", features, ndigits=4,
                  extra={"builtOnSlope": built_stats})


if __name__ == "__main__":
    main()
