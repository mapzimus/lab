"""Transportation corridor layers: existing, planned/financed, and modeled.

Sources:
- Natural Earth 1:10m railroads + roads (public domain), filtered to Africa
  https://naciscdn.org/naturalearth/10m/cultural/
- Curated project list (waypoints through real city coordinates): AU/UNECA
  Trans-African Highway network; China-financed railways (Mombasa-Nairobi SGR,
  Addis-Djibouti, TAZARA, Lagos-Ibadan, Abuja-Kaduna); Egypt HSR (Siemens);
  LAPSSET; Lobito Corridor. Statuses and backers per AU/UNECA and public
  reporting; geometry is schematic (city-to-city), not engineering alignment.
- Modeled network: gravity model over the top WUP-2025 cities by 2050
  population (score = pop_i * pop_j / km^2), top links kept.

Outputs:
- data/corridors-existing.geojson  — NE rail + major roads in Africa
- data/corridors-planned.geojson   — curated projects with status/backer
- data/corridors-model.geojson     — gravity-model 2050 links (great circles)
"""

import io
import json
import math
import zipfile

import shapefile
from shapely.geometry import shape, mapping, box
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, write_geojson

AFRICA_BBOX = box(-26.0, -36.0, 58.0, 38.5)


def load_ne_lines(base, keep):
    zf = zipfile.ZipFile(RAW_DIR / f"{base}.zip")
    r = shapefile.Reader(
        shp=io.BytesIO(zf.read(base + ".shp")),
        dbf=io.BytesIO(zf.read(base + ".dbf")),
        shx=io.BytesIO(zf.read(base + ".shx")),
    )
    fields = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.shapeRecords():
        rec = dict(zip(fields, sr.record))
        if rec.get("continent") != "Africa":
            continue
        if not keep(rec):
            continue
        geom = shape(sr.shape.__geo_interface__)
        geom = geom.intersection(AFRICA_BBOX)
        if geom.is_empty:
            continue
        out.append((geom.simplify(0.02, preserve_topology=True), rec))
    return out


def existing_layer():
    rails = load_ne_lines("ne_10m_railroads", lambda rec: True)
    roads = load_ne_lines(
        "ne_10m_roads",
        lambda rec: rec.get("type") in ("Major Highway", "Beltway") or rec.get("expressway") == 1,
    )
    features = []
    rail_geom = unary_union([g for g, _ in rails]).simplify(0.02, preserve_topology=True)
    road_geom = unary_union([g for g, _ in roads]).simplify(0.02, preserve_topology=True)
    features.append({"geometry": mapping(rail_geom), "properties": {"kind": "rail"}})
    features.append({"geometry": mapping(road_geom), "properties": {"kind": "road"}})
    write_geojson(DATA_DIR / "corridors-existing.geojson", features, ndigits=3)


# ---------------------------------------------------------------------------
# Curated projects. Waypoints are (lon, lat) through the cities each corridor
# serves; schematic, not alignments. status: built | building | planned.
PLACES = {
    "Cairo": (31.24, 30.05), "Alexandria": (29.92, 31.20), "AinSokhna": (32.30, 29.60),
    "MarsaMatruh": (27.24, 31.35), "Tripoli": (13.19, 32.90), "Tunis": (10.18, 36.80),
    "Algiers": (3.06, 36.75), "Rabat": (-6.85, 34.02), "Nouakchott": (-15.98, 18.09),
    "Dakar": (-17.45, 14.70), "Tamanrasset": (5.52, 22.79), "Agadez": (7.98, 16.97),
    "Kano": (8.52, 12.00), "Lagos": (3.38, 6.52), "Ibadan": (3.90, 7.38),
    "Abuja": (7.49, 9.06), "Kaduna": (7.44, 10.52), "BeninCity": (5.62, 6.34),
    "PortHarcourt": (7.01, 4.82), "Calabar": (8.32, 4.96), "Bamako": (-8.00, 12.65),
    "Ouagadougou": (-1.52, 12.37), "Niamey": (2.11, 13.51), "Ndjamena": (15.05, 12.11),
    "Khartoum": (32.53, 15.60), "Djibouti": (43.15, 11.59), "AddisAbaba": (38.75, 9.02),
    "Conakry": (-13.68, 9.54), "Abidjan": (-4.02, 5.33), "Accra": (-0.19, 5.56),
    "Lome": (1.22, 6.13), "Cotonou": (2.43, 6.36), "Douala": (9.70, 4.05),
    "Bangui": (18.56, 4.36), "Kampala": (32.58, 0.32), "Nairobi": (36.82, -1.29),
    "Mombasa": (39.66, -4.04), "Naivasha": (36.43, -0.72), "DarEsSalaam": (39.28, -6.82),
    "Mbeya": (33.45, -8.90), "KapiriMposhi": (28.67, -13.97), "Lusaka": (28.28, -15.41),
    "Dodoma": (35.74, -6.17), "Gaborone": (25.92, -24.65), "CapeTown": (18.42, -33.93),
    "Harare": (31.05, -17.83), "Beira": (34.87, -19.84), "Lobito": (13.55, -12.36),
    "Lubumbashi": (27.48, -11.66), "Kolwezi": (25.47, -10.72), "Lamu": (40.90, -2.27),
    "Isiolo": (37.58, 0.35), "Juba": (31.60, 4.85), "Windhoek": (17.08, -22.56),
    "Kinshasa": (15.31, -4.32),
}

PROJECTS = [
    ("Mombasa–Nairobi SGR", "rail", "built", "China Exim Bank, 2017",
     ["Mombasa", "Nairobi", "Naivasha"]),
    ("Addis Ababa–Djibouti Railway", "rail", "built", "China Exim Bank, 2016",
     ["Djibouti", "AddisAbaba"]),
    ("TAZARA Railway", "rail", "built", "China, 1975 (rehab deal 2024)",
     ["DarEsSalaam", "Mbeya", "KapiriMposhi"]),
    ("Lagos–Ibadan SGR", "rail", "built", "China CCECC, 2021",
     ["Lagos", "Ibadan"]),
    ("Abuja–Kaduna SGR", "rail", "built", "China CCECC, 2016",
     ["Abuja", "Kaduna"]),
    ("Lagos–Kano SGR (remaining)", "rail", "building", "Nigeria / China CCECC",
     ["Ibadan", "Abuja"]),
    ("Lagos–Calabar Coastal Railway", "rail", "building", "Nigeria / CCECC, begun 2024",
     ["Lagos", "BeninCity", "PortHarcourt", "Calabar"]),
    ("Egypt High-Speed Rail", "rail", "building", "Siemens consortium",
     ["AinSokhna", "Cairo", "Alexandria", "MarsaMatruh"]),
    ("Lobito Corridor", "rail", "building", "US/EU-backed rehab, 2023",
     ["Lobito", "Kolwezi", "Lubumbashi"]),
    ("LAPSSET Corridor", "mixed", "planned", "Kenya / AU",
     ["Lamu", "Isiolo", "Juba"]),
    ("TAH 1 Cairo–Dakar", "road", "planned", "AU / UNECA Trans-African Highway",
     ["Cairo", "Tripoli", "Tunis", "Algiers", "Rabat", "Nouakchott", "Dakar"]),
    ("TAH 2 Algiers–Lagos", "road", "planned", "AU / UNECA Trans-African Highway",
     ["Algiers", "Tamanrasset", "Agadez", "Kano", "Lagos"]),
    ("TAH 4 Cairo–Cape Town", "road", "planned", "AU / UNECA Trans-African Highway",
     ["Cairo", "Khartoum", "AddisAbaba", "Nairobi", "Dodoma", "Lusaka", "Gaborone", "CapeTown"]),
    ("TAH 5 Dakar–N'Djamena", "road", "planned", "AU / UNECA Trans-African Highway",
     ["Dakar", "Bamako", "Ouagadougou", "Niamey", "Kano", "Ndjamena"]),
    ("TAH 6 N'Djamena–Djibouti", "road", "planned", "AU / UNECA Trans-African Highway",
     ["Ndjamena", "Khartoum", "Djibouti"]),
    ("TAH 7 Dakar–Lagos", "road", "planned", "AU / UNECA Trans-African Highway",
     ["Dakar", "Conakry", "Abidjan", "Accra", "Lome", "Cotonou", "Lagos"]),
    ("TAH 8 Lagos–Mombasa", "road", "planned", "AU / UNECA Trans-African Highway",
     ["Lagos", "Douala", "Bangui", "Kampala", "Nairobi", "Mombasa"]),
    ("TAH 3 Tripoli–Cape Town", "road", "planned", "AU / UNECA Trans-African Highway",
     ["Tripoli", "Ndjamena", "Kinshasa", "Windhoek", "CapeTown"]),
    ("TAH 9 Beira–Lobito", "road", "planned", "AU / UNECA Trans-African Highway",
     ["Beira", "Harare", "Lusaka", "Lubumbashi", "Lobito"]),
]


# Railways that exist on the ground get their real OSM alignment instead of a
# schematic city-to-city line. Planned/under-construction corridors stay
# schematic — drawing an alignment that isn't built yet would overclaim.
REAL_GEOMETRY = {
    "Mombasa–Nairobi SGR", "Addis Ababa–Djibouti Railway", "TAZARA Railway",
    "Lagos–Ibadan SGR", "Abuja–Kaduna SGR",
    "Lobito Corridor",  # the Benguela line being rehabilitated is fully built
}
OVERPASS_APIS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


# A real alignment is only worth drawing if it actually runs between the cities
# the card names. Without this gate the layer shipped a Lobito Corridor made of
# seven disconnected fragments that stopped 769 km short of Lobito, under copy
# describing a line "rebuilt from the Angolan coast" — a truncated real
# alignment misinforms in a way an honest schematic line does not.
SPAN_COVER = 0.8      # share of the schematic route that must have rail near it
SPAN_NEAR = 0.3       # degrees, about 33 km
WAYPOINT_NEAR = 0.35  # degrees: every named city has to be reached


def spans_corridor(geom, schematic_coords):
    """Does this geometry run the length of the corridor, and reach its ends?"""
    from shapely.geometry import LineString, Point
    sch = LineString(schematic_coords)
    pts = [sch.interpolate(i / 39, normalized=True) for i in range(40)]
    cover = sum(1 for q in pts if geom.distance(q) <= SPAN_NEAR) / len(pts)
    ends = max(geom.distance(Point(c)) for c in schematic_coords)
    return cover >= SPAN_COVER and ends <= WAYPOINT_NEAR, cover, ends


def real_rail_geometry(schematic_coords):
    """Stitched OSM railway ways within a buffer of the schematic corridor.

    © OpenStreetMap contributors (ODbL); the page already attributes OSM.
    Returns a MultiLineString mapping, or None when the query yields nothing
    usable or the result does not span the corridor (the caller keeps the
    schematic line).
    """
    import requests
    import osm2geojson
    from shapely.geometry import LineString
    from shapely.ops import linemerge

    corridor = LineString(schematic_coords).buffer(0.2).simplify(0.05)
    poly = " ".join(f"{lat:.3f} {lon:.3f}" for lon, lat in corridor.exterior.coords)
    query = f'[out:json][timeout:120];way["railway"="rail"](poly:"{poly}");out geom;'
    gj = None
    for api in OVERPASS_APIS:
        try:
            r = requests.post(api, data={"data": query}, timeout=180)
            r.raise_for_status()
            gj = osm2geojson.json2geojson(r.json())
            break
        except requests.RequestException:
            continue
    if not gj:
        return None
    lines = [shape(f["geometry"]) for f in gj["features"]
             if f["geometry"]["type"] in ("LineString", "MultiLineString")]
    if not lines:
        return None
    merged = linemerge(unary_union(lines))
    parts = [merged] if merged.geom_type == "LineString" else list(merged.geoms)
    # Yards, sidings and stubs merge into short pieces; the mainline is long.
    parts = [p for p in parts if p.length * 111 >= 25]  # ~km
    if not parts:
        return None
    simplified = unary_union(parts).simplify(0.01, preserve_topology=True)
    ok, cover, ends = spans_corridor(simplified, schematic_coords)
    if not ok:
        print(f"      OSM covers {cover*100:.0f}% and stops {ends*111:.0f} km "
              f"from a named city, keeping schematic")
        return None
    return mapping(simplified)


def planned_layer():
    import time
    features = []
    for name, kind, status, backer, stops in PROJECTS:
        coords = [PLACES[s] for s in stops]
        geometry = {"type": "LineString", "coordinates": [list(c) for c in coords]}
        real = 0
        if name in REAL_GEOMETRY:
            fetched = real_rail_geometry(coords)
            if fetched:
                geometry, real = fetched, 1
                print(f"  {name}: real OSM alignment")
            else:
                print(f"  {name}: OSM fetch empty, keeping schematic")
            time.sleep(2)  # be polite to the shared Overpass service
        features.append({
            "geometry": geometry,
            "properties": {"name": name, "kind": kind, "status": status, "backer": backer,
                           "china": 1 if "China" in backer else 0, "real": real},
        })
    write_geojson(DATA_DIR / "corridors-planned.geojson", features, ndigits=3)


# ---------------------------------------------------------------------------
def haversine_km(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h))


def great_circle(a, b, n=24):
    """Interpolated great-circle points between (lon, lat) pairs."""
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    d = 2 * math.asin(math.sqrt(
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2))
    if d == 0:
        return [list(a), list(b)]
    pts = []
    for i in range(n + 1):
        f = i / n
        A = math.sin((1 - f) * d) / math.sin(d)
        B = math.sin(f * d) / math.sin(d)
        x = A * math.cos(lat1) * math.cos(lon1) + B * math.cos(lat2) * math.cos(lon2)
        y = A * math.cos(lat1) * math.sin(lon1) + B * math.cos(lat2) * math.sin(lon2)
        z = A * math.sin(lat1) + B * math.sin(lat2)
        pts.append([math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y)))])
    return pts


def model_layer():
    with open(DATA_DIR / "cities.geojson") as fh:
        cities = json.load(fh)["features"]
    top = [f for f in cities if f["properties"]["african"] == 1][:30]
    links = []
    for i in range(len(top)):
        for j in range(i + 1, len(top)):
            a, b = top[i], top[j]
            ca, cb = a["geometry"]["coordinates"], b["geometry"]["coordinates"]
            km = haversine_km(ca, cb)
            if km < 150 or km > 3200:
                continue
            score = a["properties"]["p2050"] * b["properties"]["p2050"] / (km / 1000.0) ** 2
            links.append((score, km, a, b))
    links.sort(key=lambda t: -t[0])
    features = []
    for score, km, a, b in links[:36]:
        features.append({
            "geometry": {"type": "LineString",
                         "coordinates": great_circle(a["geometry"]["coordinates"],
                                                     b["geometry"]["coordinates"])},
            "properties": {"a": a["properties"]["name"], "b": b["properties"]["name"],
                           "km": round(km), "score": round(score, 1)},
        })
    write_geojson(DATA_DIR / "corridors-model.geojson", features, ndigits=3)
    for f in features[:8]:
        p = f["properties"]
        print(f"  model link: {p['a']} — {p['b']} ({p['km']} km, score {p['score']})")


if __name__ == "__main__":
    existing_layer()
    planned_layer()
    model_layer()
