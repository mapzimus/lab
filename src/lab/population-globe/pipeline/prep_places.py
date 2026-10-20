import json

D = "data/ne/"
fc = json.load(open(D + "ne_10m_populated_places_simple.geojson", encoding="utf-8"))
cities = []
for f in fc["features"]:
    p = f["properties"]
    pop = p.get("pop_max") or 0
    if pop < 250000:
        continue
    lon, lat = f["geometry"]["coordinates"][:2]
    cities.append([p.get("name") or p.get("nameascii"), round(lat, 3), round(lon, 3), int(pop), p.get("adm0name") or ""])
cities.sort(key=lambda c: -c[3])
seen, uniq = set(), []
for c in cities:
    k = (c[0], round(c[1]), round(c[2]))
    if k in seen: continue
    seen.add(k); uniq.append(c)


def lines(fname):
    out = []
    for f in json.load(open(D + fname, encoding="utf-8"))["features"]:
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for ln in parts:
            flat = []
            for lon, lat in ln:
                flat += [round(lon, 2), round(lat, 2)]
            if len(flat) >= 4: out.append(flat)
    return out


json.dump({"cities": uniq, "borders": lines("ne_50m_admin_0_boundary_lines_land.geojson"), "coast": lines("ne_50m_coastline.geojson")},
          open("data/ne_min.json", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
print(len(uniq), "cities", uniq[:5])
