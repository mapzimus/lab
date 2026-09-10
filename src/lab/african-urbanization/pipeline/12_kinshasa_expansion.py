"""How Kinshasa expanded, measured in rings from the colonial core.

Chapter 4 shows the footprint filling in and asserts that the city thickened
more than it spread. This script measures it, so the claim can be a chart
instead of an adjective.

For each 5 km ring out from the old river-front core, it reports built area
per GHSL epoch and population in 1975 and 2025 from GHS-POP. Two things fall
out: how far the built edge travelled, and how much of the extra population
landed on ground that was already built rather than on new ground.

Sources (both already downloaded for scripts 04 and 07):
- JRC GHS-BUILT-S R2023A, 3 arcsec, epochs 1975-2030, tile R10_C20 (CC BY 4.0)
- JRC GHS-POP R2023A, 3 arcsec, 1975 and 2025, tile R10_C20 (CC BY 4.0)

Output:
- data/kinshasa-expansion.json — per-ring built km^2 by epoch, population in
  1975 and 2025, and the headline splits the copy quotes.
"""

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from common import RAW_DIR, DATA_DIR, write_json

BBOX = (14.95, -4.75, 15.80, -3.95)   # same window as 04 and 07
EPOCHS = [1975, 1990, 2000, 2010, 2020, 2030]
BUILT_FRACTION = 0.20                 # matching 04_kinshasa.py
# The colonial town sat on the river at the west end of the modern city; the
# rings measure outward from there, which is the direction growth actually ran.
CORE = (15.313, -4.305)               # lon, lat — Gombe / the old river front
RINGS = [5, 10, 15, 20, 25, 30]       # km, upper edge of each band


def read_window(name):
    path = f"zip://{RAW_DIR}/{name}.zip!/{name}.tif"
    with rasterio.open(path) as src:
        win = from_bounds(*BBOX, transform=src.transform)
        return src.read(1, window=win), src.window_transform(win)


def main():
    built = {}
    for epoch in EPOCHS:
        arr, transform = read_window(
            f"GHS_BUILT_S_E{epoch}_GLOBE_R2023A_4326_3ss_V1_0_R10_C20")
        built[epoch] = arr
    pop75, _ = read_window("GHS_POP_E1975_GLOBE_R2023A_4326_3ss_V1_0_R10_C20")
    pop25, _ = read_window("GHS_POP_E2025_GLOBE_R2023A_4326_3ss_V1_0_R10_C20")

    rows, cols = pop25.shape
    cell_deg = abs(transform.a)
    lat_mid = (BBOX[1] + BBOX[3]) / 2
    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * np.cos(np.radians(lat_mid))
    cell_km2 = (cell_deg * km_per_deg_lat) * (cell_deg * km_per_deg_lon)

    # Distance from the core to every cell centre, in kilometres.
    xs = transform.c + (np.arange(cols) + 0.5) * transform.a
    ys = transform.f + (np.arange(rows) + 0.5) * transform.e
    dx = (xs[None, :] - CORE[0]) * km_per_deg_lon
    dy = (ys[:, None] - CORE[1]) * km_per_deg_lat
    dist = np.sqrt(dx ** 2 + dy ** 2)

    built_threshold = BUILT_FRACTION * cell_km2 * 1e6
    masks = {e: built[e] >= built_threshold for e in EPOCHS}

    bands = []
    lo = 0
    for hi in RINGS:
        ring = (dist >= lo) & (dist < hi)
        bands.append({
            "from": lo,
            "to": hi,
            "built": {str(e): round(float(masks[e][ring].sum()) * cell_km2, 1) for e in EPOCHS},
            "pop1975": round(float(pop75[ring].sum()) / 1e6, 3),
            "pop2025": round(float(pop25[ring].sum()) / 1e6, 3),
        })
        lo = hi

    # The headline the copy needs: of the people added since 1975, how many
    # stand on ground that was already built in 1975?
    old_ground = masks[1975]
    added_total = float(pop25.sum() - pop75.sum())
    added_on_old = float(pop25[old_ground].sum() - pop75[old_ground].sum())
    inner = sum(b["pop2025"] for b in bands if b["to"] <= 10)
    total_pop = sum(b["pop2025"] for b in bands)

    out = {
        "source": "JRC GHS-BUILT-S and GHS-POP R2023A (CC BY 4.0), 3 arcsec, tile R10_C20",
        "core": {"lon": CORE[0], "lat": CORE[1], "note": "Gombe, the old river front"},
        "epochs": EPOCHS,
        "bands": bands,
        "stats": {
            "added_since_1975_m": round(added_total / 1e6, 2),
            "added_on_1975_ground_m": round(added_on_old / 1e6, 2),
            "share_added_on_old_ground": round(added_on_old / added_total * 100, 1),
            "built_km2_1975": round(float(masks[1975].sum()) * cell_km2, 1),
            "built_km2_2030": round(float(masks[2030].sum()) * cell_km2, 1),
            "built_growth_x": round(float(masks[2030].sum()) / float(masks[1975].sum()), 2),
            "share_pop_within_10km": round(inner / total_pop * 100, 1),
        },
    }
    write_json(DATA_DIR / "kinshasa-expansion.json", out)

    s = out["stats"]
    print(f"  built ground {s['built_km2_1975']} km2 (1975) -> "
          f"{s['built_km2_2030']} km2 (2030), x{s['built_growth_x']}")
    print(f"  people added since 1975: {s['added_since_1975_m']}M, of which "
          f"{s['added_on_1975_ground_m']}M ({s['share_added_on_old_ground']}%) "
          f"stand on ground already built in 1975")
    print(f"  {s['share_pop_within_10km']}% of 2025 population lives within 10 km of the core")
    for b in bands:
        print(f"    {b['from']:>2}-{b['to']:<2} km  built {b['built']['1975']:>6} -> "
              f"{b['built']['2030']:>6} km2   pop {b['pop1975']:>6} -> {b['pop2025']:>6} M")


if __name__ == "__main__":
    main()
