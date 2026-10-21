"""Download OpenStreetMap data for downtown Lynn and write ../data/lynn.json in the Boston model's format.

Box: 42.452,-70.968 to 42.486,-70.925 (Lynn English High School, downtown and Lynn Harbor).
Coordinates are decimetres in a flat local frame centred on the box: x east, z south.
Heights: OSM height tag ("m"), else building:levels x 3.3 m + 1 m ("f"), else a typical height for the type ("e").

    python prep_lynn.py            # downloads to raw/ if missing, then converts
"""
import json, math, re, sys, os, time, urllib.parse, urllib.request
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point, box as sbox
from shapely.ops import linemerge, unary_union, polygonize

S, W, N, E = 42.452, -70.968, 42.486, -70.925
LAT0, LON0 = (S + N) / 2, (W + E) / 2
R = 6371008.8
KX = math.cos(math.radians(LAT0)) * R * math.pi / 180
KY = R * math.pi / 180


def xy(lat, lon):
    return ((lon - LON0) * KX, -(lat - LAT0) * KY)


BX0, BZ1 = xy(S, W)
BX1, BZ0 = xy(N, E)
BOX = sbox(BX0, BZ0, BX1, BZ1)
OCEAN_BOX = sbox(BX0 - 1000, BZ0 - 1000, BX1 + 1000, BZ1 + 1000)


HERE = Path(__file__).parent
RAW = HERE / "raw"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
BB = f"{S},{W},{N},{E}"
QUERIES = {
    "bld": f'[out:json][timeout:240];(way["building"]({BB});relation["building"]["type"="multipolygon"]({BB}););out geom;',
    "roads": f'[out:json][timeout:240];way["highway"]({BB});out geom;',
    "areas": f'[out:json][timeout:240];(way["leisure"~"park|pitch|playground|garden|golf_course|recreation_ground"]({BB});'
             f'relation["leisure"~"park|golf_course"]({BB});way["landuse"~"grass|recreation_ground|cemetery|forest|meadow"]({BB});'
             f'relation["landuse"~"cemetery|forest"]({BB});way["natural"~"water|wood"]({BB});relation["natural"="water"]({BB});'
             f'way["waterway"="riverbank"]({BB});way["natural"="coastline"](42.42,-71.0,42.52,-70.88);way["man_made"="pier"]({BB}););out geom;',
}


def load(name):
    path = RAW / (name + ".json")
    if not path.exists():
        RAW.mkdir(exist_ok=True)
        body = urllib.parse.urlencode({"data": QUERIES[name]}).encode()
        for url in OVERPASS * 2:
            try:
                req = urllib.request.Request(url, body, {"User-Agent": "mapzimus-lab/orbit-to-street"})
                path.write_bytes(urllib.request.urlopen(req, timeout=300).read())
                break
            except OSError as e:
                print(name, url, e, file=sys.stderr)
                time.sleep(10)
        else:
            sys.exit(f"could not download {name}")
    return json.load(open(path, encoding="utf8"))["elements"]


def ring(geom):
    return [xy(p["lat"], p["lon"]) for p in geom]


def flat(coords):
    out = []
    for x, z in coords:
        out += [round(x * 10), round(z * 10)]
    return out


def polys_of(el):
    """Polygons (shapely) for a closed way or a multipolygon relation."""
    if el["type"] == "way":
        g = el.get("geometry") or []
        if len(g) < 4 or (g[0]["lat"], g[0]["lon"]) != (g[-1]["lat"], g[-1]["lon"]):
            return []
        p = Polygon(ring(g))
        return [p if p.is_valid else p.buffer(0)]
    outers, inners = [], []
    for m in el.get("members", []):
        if m["type"] != "way" or not m.get("geometry"):
            continue
        (inners if m.get("role") == "inner" else outers).append(LineString(ring(m["geometry"])))
    out = []
    for p in polygonize(linemerge(outers) if outers else []):
        holes = [h for h in polygonize(linemerge(inners) if inners else []) if p.contains(h.representative_point())]
        q = Polygon(p.exterior.coords, [h.exterior.coords for h in holes])
        out.append(q if q.is_valid else q.buffer(0))
    return out


def parts(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if hasattr(geom, "geoms") else [geom]


def rec(poly):
    poly = poly.simplify(0.15)
    if poly.is_empty or poly.geom_type != "Polygon" or poly.area < 2:
        return None
    r = {"o": flat(list(poly.exterior.coords)[:-1])}
    if poly.interiors:
        r["i"] = [flat(list(h.coords)[:-1]) for h in poly.interiors]
    return r


def num(v):
    if v is None:
        return None
    v = v.strip().lower()
    m = re.match(r"^([\d.]+)\s*(m|ft|'|feet)?", v)
    if not m:
        return None
    x = float(m.group(1))
    return x * 0.3048 if m.group(2) in ("ft", "'", "feet") else x


TYPICAL = {"house": 9, "detached": 9, "semidetached_house": 9, "terrace": 10, "apartments": 15, "residential": 11,
           "school": 12, "warehouse": 9, "industrial": 10, "train_station": 15, "church": 15, "retail": 6,
           "commercial": 11, "office": 14, "garage": 3.5, "garages": 3.5, "shed": 3, "carport": 3, "roof": 4,
           "hospital": 20, "hotel": 18, "civic": 12, "public": 12, "parking": 10}

buildings = []
for el in load("bld"):
    t = el.get("tags", {})
    kind = t.get("building", "yes")
    h, s = num(t.get("height")), "m"
    if not h:
        lv = num(t.get("building:levels"))
        h, s = (lv * 3.3 + 1, "f") if lv else (TYPICAL.get(kind, 7 if kind == "yes" else 11), "e")
    base = num(t.get("min_height")) or ((num(t.get("building:min_level")) or 0) * 3.3)
    if h <= base:
        continue
    for p in polys_of(el):
        for q in parts(p.intersection(OCEAN_BOX)):
            r = rec(q)
            if not r:
                continue
            r["h"] = round(h, 1)
            r["s"] = s
            if base:
                r["b"] = round(base, 1)
            if t.get("building:colour"):
                r["c"] = t["building:colour"]
            if t.get("roof:colour"):
                r["rc"] = t["roof:colour"]
            if t.get("name"):
                r["n"] = t["name"]
            if t.get("addr:housenumber") and t.get("addr:street"):
                r["a"] = t["addr:housenumber"] + " " + t["addr:street"]
            if kind != "yes":
                r["t"] = kind
            buildings.append(r)

# The school's name sits on its grounds, not on a building: give it to the biggest building on the campus point.
SCHOOL = Point(*xy(42.4768852, -70.9439135))
cands = [b for b in buildings if "n" not in b]
if cands:
    def footprint(b):
        c = b["o"]
        return Polygon([(c[k] / 10, c[k + 1] / 10) for k in range(0, len(c), 2)])
    near = sorted(cands, key=lambda b: footprint(b).distance(SCHOOL))[:6]
    school = max(near, key=lambda b: footprint(b).area)
    school["n"] = "Lynn English High School"
    school["a"] = "50 Goodridge Street"

WIDTH = {"motorway": 16, "trunk": 14, "primary": 12, "secondary": 10, "tertiary": 9, "residential": 7,
         "unclassified": 7, "living_street": 6, "service": 4, "pedestrian": 4, "track": 3}
roads = []
for el in load("roads"):
    t = el.get("tags", {})
    hw = t.get("highway", "")
    if hw in ("proposed", "construction", "platform", "elevator", "bus_stop") or t.get("tunnel") in ("yes", "building_passage") or t.get("area") == "yes":
        continue
    w = WIDTH.get(hw, 7 if hw.endswith("_link") else 2)
    y = 6 if t.get("bridge") not in (None, "no") else 0
    g = el.get("geometry") or []
    line = LineString(ring(g)) if len(g) > 1 else None
    if not line:
        continue
    for seg in parts(line.intersection(OCEAN_BOX)):
        if seg.geom_type != "LineString" or seg.length < 1:
            continue
        roads.append([w, y] + flat(seg.coords))

parks, water, coast = [], [], []
for el in load("areas"):
    t = el.get("tags", {})
    if t.get("natural") == "coastline":
        g = el.get("geometry") or []
        if len(g) > 1:
            coast.append(LineString(ring(g)))
        continue
    if t.get("man_made") == "pier":
        continue
    is_water = t.get("natural") == "water" or t.get("waterway") == "riverbank"
    for p in polys_of(el):
        for q in parts(p.intersection(OCEAN_BOX)):
            r = rec(q)
            if r:
                (water if is_water else parks).append(r)

# Ocean: split the box by the coastline and keep the faces on the water side.
# OSM coastlines run with the land on the left, so a face whose inside point sits to the right of its nearest
# coastline segment is sea.
if coast:
    merged = linemerge(coast)
    lines = parts(merged)
    faces = polygonize(unary_union(lines + [OCEAN_BOX.exterior]))
    segs = []
    for ln in lines:
        c = list(ln.coords)
        segs += [(c[k], c[k + 1]) for k in range(len(c) - 1)]
    sea = 0
    for f in faces:
        if not OCEAN_BOX.contains(f.representative_point()):
            continue
        p = f.representative_point()
        best, bd = None, 1e18
        for a, b in segs:
            d = LineString([a, b]).distance(p)
            if d < bd:
                bd, best = d, (a, b)
        (ax, az), (bx, bz) = best
        # x east, z south: flip z to get a right-handed east/north frame before taking the cross product
        cross = (bx - ax) * (-(p.y) + az) - (-(bz) + az) * (p.x - ax)
        if cross < 0:
            for q in parts(f.buffer(0)):
                r = rec(q)
                if r:
                    water.append(r)
                    sea += 1
    print("sea faces", sea, file=sys.stderr)

out = {"lat0": round(LAT0, 5), "lon0": round(LON0, 5), "box": [round(BX0), round(BX1), round(BZ0), round(BZ1)],
       "buildings": buildings, "water": water, "parks": parks, "roads": roads, "bridges": []}
json.dump(out, open(HERE.parent / "data" / "lynn.json", "w", encoding="utf8"), separators=(",", ":"))
src = {k: sum(1 for b in buildings if b["s"] == k) for k in "mfe"}
print(f"buildings {len(buildings)} {src} roads {len(roads)} parks {len(parks)} water {len(water)} coast {len(coast)}", file=sys.stderr)
print("named:", sorted({b['n'] for b in buildings if 'n' in b})[:40], file=sys.stderr)
