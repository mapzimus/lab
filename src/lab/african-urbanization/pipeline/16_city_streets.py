"""Streets per resident across nine African cities, so Kinshasa is not an anecdote.

Chapter 4 measures Kinshasa's street supply falling from about nine metres per
resident to one, and that is the sharpest number in the story. On its own it is
also a single case, and the obvious objection is that Kinshasa is exceptional:
a capital that grew through state collapse and two wars.

This runs the identical measurement over eight more cities, chosen to span the
range rather than to flatter the argument. Cairo and Accra are included
precisely because they are the cities most likely to contradict it.

The method is deliberately the same as 10_kinshasa_streets.py: total length of
drivable OSM street inside the GHS-BUILT-S footprint, against the UN's city
population for the matching year. Two epochs only, 1975 and 2020, because the
question here is the direction and the spread, not each city's full curve.

Sources:
- OpenStreetMap (ODbL), (c) OpenStreetMap contributors, via Overpass. Cached
  under RAW_DIR so a rerun costs nothing.
- JRC GHS-BUILT-S R2023A, 3 arcsec (CC BY 4.0).
- UN World Urbanization Prospects 2025, read from the cities.geojson this
  pipeline already produced.

Known limit, and it is the same one chapter 4 already declares: OSM has no
history, so the 1975 figure counts today's streets inside the 1975 footprint
and is an upper bound. That biases every city the same way, which is what makes
the comparison between them fair even though each absolute 1975 value is
generous.

Output:
- data/city-streets.json
"""

import json
import time

import numpy as np
import rasterio
import requests
import osm2geojson
from rasterio.windows import from_bounds
from shapely.geometry import shape, box
from shapely.prepared import prep
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_json

EPOCHS = (1975, 2020)
BUILT_FRACTION = 0.20
HALF = 0.42          # degrees: the window each city is measured inside
CACHE = RAW_DIR / "city-osm"
APIS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
CLASSES = ("motorway", "trunk", "primary", "secondary", "tertiary",
           "residential", "unclassified", "living_street")

# name in cities.geojson, centre, GHSL tile.
CITIES = [
    ("Kinshasa",       15.313, -4.305, "R10_C20"),
    ("Lagos",           3.390,  6.520, "R9_C19"),
    ("Cairo",          31.240, 30.040, "R6_C22"),
    ("Nairobi",        36.820, -1.290, "R10_C22"),
    ("Dar es Salaam",  39.280, -6.790, "R10_C22"),
    ("Addis Ababa",    38.740,  9.030, "R9_C22"),
    ("Luanda",         13.230, -8.840, "R10_C20"),
    ("Abidjan",        -4.020,  5.360, "R9_C18"),
    ("Accra",          -0.190,  5.600, "R9_C18"),
]


def overpass(query, key):
    CACHE.mkdir(parents=True, exist_ok=True)
    cached = CACHE / f"{key}.json"
    if cached.exists() and cached.stat().st_size > 0:
        return json.load(open(cached))
    # Same backoff as 15_corridor_coverage.py: nine large city queries in a row
    # will hit a public mirror's rate limit, and rotating once is not enough.
    last = None
    for attempt in range(5):
        for api in APIS:
            try:
                r = requests.post(api, data={"data": query}, timeout=600)
                r.raise_for_status()
                payload = r.json()
                tmp = cached.with_suffix(".part")
                json.dump(payload, open(tmp, "w"))
                tmp.rename(cached)
                return payload
            except (requests.RequestException, ValueError) as e:
                last = e
        wait = 20 * 2 ** attempt
        print(f"      mirrors busy, waiting {wait}s before retry {attempt + 2}")
        time.sleep(wait)
    raise last


def built_footprint(tile, epoch, bbox):
    name = f"GHS_BUILT_S_E{epoch}_GLOBE_R2023A_4326_3ss_V1_0_{tile}"
    with rasterio.open(f"zip://{RAW_DIR}/{name}.zip!/{name}.tif") as src:
        win = from_bounds(*bbox, transform=src.transform)
        arr = src.read(1, window=win)
        t = src.window_transform(win)
    lat_mid = (bbox[1] + bbox[3]) / 2
    cell_km2 = (abs(t.a) * 111.32) * (abs(t.e) * 111.32 * np.cos(np.radians(lat_mid)))
    mask = arr >= BUILT_FRACTION * cell_km2 * 1e6
    rows, cols = np.nonzero(mask)
    if not len(rows):
        return None, 0.0
    cells = [box(t.c + c * t.a, t.f + (r + 1) * t.e, t.c + (c + 1) * t.a, t.f + r * t.e)
             for r, c in zip(rows, cols)]
    return unary_union(cells), float(mask.sum()) * cell_km2


def km(geom, lat_mid):
    kx = 111.32 * np.cos(np.radians(lat_mid))
    total = 0.0
    for part in getattr(geom, "geoms", [geom]):
        c = np.asarray(part.coords)
        if len(c) < 2:
            continue
        dx = np.diff(c[:, 0]) * kx
        dy = np.diff(c[:, 1]) * 111.32
        total += float(np.sqrt(dx ** 2 + dy ** 2).sum())
    return total


def un_city(name):
    for f in json.load(open(DATA_DIR / "cities.geojson"))["features"]:
        if (f["properties"].get("name") or "").lower().startswith(name.lower()):
            return f["properties"]
    return {}


def main():
    rows = []
    for name, lon, lat, tile in CITIES:
        bbox = (lon - HALF, lat - HALF, lon + HALF, lat + HALF)
        key = name.replace(" ", "_")
        query = (f'[out:json][timeout:600];'
                 f'way["highway"~"^({"|".join(CLASSES)})$"]'
                 f'({bbox[1]:.3f},{bbox[0]:.3f},{bbox[3]:.3f},{bbox[2]:.3f});out geom;')
        raw = overpass(query, key)
        lines = [shape(f["geometry"]) for f in osm2geojson.json2geojson(raw)["features"]
                 if f["geometry"]["type"].endswith("LineString")]

        props = un_city(name)
        row = {"city": name, "years": {}}
        for epoch in EPOCHS:
            fp, area = built_footprint(tile, epoch, bbox)
            if fp is None:
                continue
            inside = [g for g in lines if prep(fp).intersects(g)]
            length = km(unary_union(inside), lat) if inside else 0.0
            people = props.get(f"p{epoch}")
            entry = {"streetKm": round(length, 1), "builtKm2": round(area, 1)}
            if people:
                entry["popM"] = people
                entry["metresPerPerson"] = round(length * 1000 / (people * 1e6), 2)
            row["years"][str(epoch)] = entry
        now = row["years"].get(str(EPOCHS[-1]), {})
        then = row["years"].get(str(EPOCHS[0]), {})
        if "metresPerPerson" in now and "metresPerPerson" in then:
            row["fallX"] = round(then["metresPerPerson"] / now["metresPerPerson"], 1)
        rows.append(row)
        print(f"  {name:<15} 1975 {then.get('metresPerPerson', float('nan')):>6.2f} m/person"
              f"   2020 {now.get('metresPerPerson', float('nan')):>6.2f} m/person"
              f"   {row.get('fallX', float('nan')):>4}x fall")
        time.sleep(2)

    have = [r for r in rows if "fallX" in r]
    by_now = sorted(have, key=lambda r: r["years"]["2020"]["metresPerPerson"])
    out = {
        "source": "OpenStreetMap (ODbL) drivable street network measured inside JRC "
                  "GHS-BUILT-S R2023A footprints (CC BY 4.0); population from UN "
                  "World Urbanization Prospects 2025",
        "note": "Identical method to kinshasa-streets.json, run over nine cities. "
                "OSM has no history, so the 1975 value counts today's streets "
                "inside the 1975 footprint and is an upper bound. That bias is the "
                "same for every city, so the comparison between them holds even "
                "though each 1975 figure is generous.",
        "epochs": list(EPOCHS),
        "cities": rows,
        "summary": {
            "measured": len(have),
            "allFell": all(r["fallX"] > 1 for r in have),
            "medianNow": sorted(r["years"]["2020"]["metresPerPerson"] for r in have)[len(have) // 2],
            "thinnest": {"city": by_now[0]["city"],
                         "metresPerPerson": by_now[0]["years"]["2020"]["metresPerPerson"]},
            "widest": {"city": by_now[-1]["city"],
                       "metresPerPerson": by_now[-1]["years"]["2020"]["metresPerPerson"]},
        },
    }
    write_json(DATA_DIR / "city-streets.json", out)

    s = out["summary"]
    print(f"\n  {s['measured']} cities measured, every one fell: {s['allFell']}")
    print(f"  median today {s['medianNow']} m per resident")
    print(f"  thinnest {s['thinnest']['city']} at {s['thinnest']['metresPerPerson']}, "
          f"widest {s['widest']['city']} at {s['widest']['metresPerPerson']}")


if __name__ == "__main__":
    main()
