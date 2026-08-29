"""Cross-check the modelled layers against an independent source.

Every layer in chapter 4 is model output: GHSL infers built-up surface and
population from satellite imagery. The UN, working from national statistics,
estimates the same cities by a completely different route. Neither is ground
truth, but two methods landing in the same place is evidence, and the places
they diverge are worth naming rather than hiding.

This sums the GHS-POP grid inside the real administrative boundaries of
Kinshasa and Brazzaville, and compares each against the UN's city series for
the same years. It also re-derives the density figure the story quotes, so the
headline number has a second derivation behind it.

Sources (all already downloaded or committed):
- JRC GHS-POP R2023A, 3 arcsec, 1975 and 2025, tile R10_C20 (CC BY 4.0)
- OpenStreetMap commune boundaries, via data/kinshasa-communes.geojson (ODbL)
- UN World Urbanization Prospects 2025, via data/cities.geojson

Output:
- data/validation.json
"""

import json

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.features import geometry_mask
from shapely.geometry import shape
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_json

BBOX = (14.95, -4.75, 15.80, -3.95)   # the window 04, 07 and 12 use
# The Pool runs roughly along this latitude through the window; communes north
# of it are Brazzaville's side, south of it Kinshasa's.
RIVER_LAT = -4.28


def read_window(name):
    """Same access pattern as 07_kinshasa_density.py."""
    path = f"zip://{RAW_DIR}/{name}.zip!/{name}.tif"
    with rasterio.open(path) as src:
        win = from_bounds(*BBOX, transform=src.transform)
        return src.read(1, window=win), src.window_transform(win)


def un_series(name):
    for f in json.load(open(DATA_DIR / "cities.geojson"))["features"]:
        if (f["properties"].get("name") or "").lower().startswith(name.lower()):
            return f["properties"]
    return {}


def main():
    pop75, transform = read_window("GHS_POP_E1975_GLOBE_R2023A_4326_3ss_V1_0_R10_C20")
    pop25, _ = read_window("GHS_POP_E2025_GLOBE_R2023A_4326_3ss_V1_0_R10_C20")

    cell_deg = abs(transform.a)
    lat_mid = (BBOX[1] + BBOX[3]) / 2
    cell_km2 = (cell_deg * 111.32) * (cell_deg * 111.32 * np.cos(np.radians(lat_mid)))

    communes = json.load(open(DATA_DIR / "kinshasa-communes.geojson"))["features"]
    sides = {"south": [], "north": []}
    for f in communes:
        sides[f["properties"]["side"]].append(shape(f["geometry"]))

    checks = []
    for side, city_name, label in (("south", "Kinshasa", "Kinshasa"),
                                   ("north", "Brazzaville", "Brazzaville")):
        if not sides[side]:
            print(f"  {label}: no commune polygons on this side, skipped")
            continue
        area = unary_union(sides[side])
        # True inside the administrative city, so the grid is summed over the
        # same footprint the UN is describing rather than a square window.
        inside = geometry_mask([area], out_shape=pop25.shape, transform=transform,
                               invert=True)
        un = un_series(city_name)
        row = {
            "city": label,
            "adminAreaKm2": round(float(inside.sum()) * cell_km2, 1),
            "years": {},
        }
        for year, grid in ((1975, pop75), (2025, pop25)):
            ghs = float(grid[inside].sum()) / 1e6
            unv = un.get(f"p{year}")
            entry = {"ghsPopM": round(ghs, 2), "unWupM": unv}
            if unv:
                entry["ratio"] = round(ghs / unv, 2)
                entry["differenceM"] = round(ghs - unv, 2)
            row["years"][str(year)] = entry
        checks.append(row)
        y = row["years"]
        print(f"  {label} ({row['adminAreaKm2']:.0f} km2 of communes)")
        for year in ("1975", "2025"):
            e = y[year]
            if "ratio" in e:
                print(f"    {year}: GHS-POP {e['ghsPopM']:>6.2f}M   UN {e['unWupM']:>6.3f}M"
                      f"   ratio {e['ratio']:.2f}")
            else:
                print(f"    {year}: GHS-POP {e['ghsPopM']:>6.2f}M   UN not published")

    # Second derivation of the density figure the story quotes.
    density = np.where(pop25 > 0, pop25 / cell_km2, 0.0)
    kin = geometry_mask([unary_union(sides["south"])], out_shape=pop25.shape,
                        transform=transform, invert=True)
    kin_density = density[kin]
    peak = {
        "cellsOver60k": int((kin_density >= 60_000).sum()),
        "shareOver60k": round(float((kin_density >= 60_000).mean()) * 100, 2),
        "p99": round(float(np.percentile(kin_density[kin_density > 0], 99))),
        "max": round(float(kin_density.max())),
    }
    print(f"  density inside Kinshasa's communes: 99th percentile "
          f"{peak['p99']:,}/km2, peak {peak['max']:,}/km2, "
          f"{peak['cellsOver60k']} cells at or above 60,000")

    out = {
        "note": "GHS-POP is modelled from imagery; UN WUP is estimated from national "
                "statistics. Neither is ground truth. Agreement is evidence, and the "
                "years they diverge are reported rather than hidden.",
        "sources": {
            "grid": "JRC GHS-POP R2023A, 3 arcsec, tile R10_C20 (CC BY 4.0)",
            "boundaries": "OpenStreetMap admin_level 7 (ODbL)",
            "reference": "UN World Urbanization Prospects 2025",
        },
        "cities": checks,
        "kinshasaDensity": peak,
    }
    write_json(DATA_DIR / "validation.json", out)


if __name__ == "__main__":
    main()
