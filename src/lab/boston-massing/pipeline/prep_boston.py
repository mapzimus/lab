import json, math, re, sys

D = "data/"
LAT0, LON0 = 42.3530, -71.0680
S, N, Wl, E = 42.3405, 42.3860, -71.0905, -71.0455
KX = math.cos(math.radians(LAT0)) * 111320
KY = 110540
X0, X1 = (Wl - LON0) * KX, (E - LON0) * KX
Y0, Y1 = (S - LAT0) * KY, (N - LAT0) * KY  # y = north, metres

load = lambda f: json.load(open(D + f, encoding="utf-8"))["elements"]
bways = [e for e in load("b2/buildings.json") if e["type"] == "way"]
ctx = load("b2/ctx.json")
rels = load("b2/rels.json")
coast = load("b2/coast.json")

DEFAULT_H = {"house": 9, "detached": 9, "semidetached_house": 10, "terrace": 13, "apartments": 15,
             "residential": 13, "commercial": 15, "office": 22, "retail": 7, "garage": 4, "garages": 4,
             "parking": 14, "church": 18, "cathedral": 25, "hotel": 30, "hospital": 25, "university": 18,
             "college": 18, "school": 12, "train_station": 15, "industrial": 9, "warehouse": 9, "shed": 3,
             "roof": 5, "civic": 15, "government": 18, "public": 15, "dormitory": 18}


def num(v):
    m = re.search(r"-?[\d.]+", v or "")
    if not m: return None
    try: x = float(m.group())
    except ValueError: return None
    if "ft" in v or "'" in v: x *= 0.3048
    return x


def P(lat, lon):  # metres, x east, y north
    return ((lon - LON0) * KX, (lat - LAT0) * KY)


def enc(ring):  # decimetres, z = south
    out = []
    for x, y in ring: out += [round(x * 10), round(-y * 10)]
    return out


def stitch(segs):
    rings, segs = [], [list(s) for s in segs if len(s) > 1]
    while segs:
        r = segs.pop(0); changed = True
        while r[0] != r[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == r[-1]: r += s[1:]
                elif s[-1] == r[-1]: r += s[::-1][1:]
                elif s[-1] == r[0]: r = s[:-1] + r
                elif s[0] == r[0]: r = s[::-1][:-1] + r
                else: continue
                segs.pop(i); changed = True; break
        if r[0] == r[-1] and len(r) >= 4: rings.append(r)
    return rings


def polys(e):
    """[(outer, [holes])] in metres, rings open (no repeated last point)."""
    if e["type"] == "way":
        g = [P(p["lat"], p["lon"]) for p in e.get("geometry", [])]
        return [(g[:-1], [])] if len(g) >= 4 and g[0] == g[-1] else []
    mem = e.get("members", [])
    seg = lambda role: [[P(p["lat"], p["lon"]) for p in m["geometry"]] for m in mem if m.get("role") == role and m.get("geometry")]
    outers, inners = stitch(seg("outer")), stitch(seg("inner"))
    if not outers: return []
    return [(o[:-1], [i[:-1] for i in inners] if k == 0 else []) for k, o in enumerate(outers)]


def inpoly(x, y, p):
    ins = False; j = len(p) - 1
    for i in range(len(p)):
        xi, yi = p[i]; xj, yj = p[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi: ins = not ins
        j = i
    return ins


def area(p):
    return sum(p[i][0] * p[i - 1][1] - p[i - 1][0] * p[i][1] for i in range(len(p))) / 2


MAT = {"brick": "#9a5544", "glass": "#7f97a8", "concrete": "#b5b1a8", "stone": "#c4baa4", "metal": "#9aa1a6",
       "sandstone": "#c3a27c", "limestone": "#d3c9b0", "granite": "#a7a199", "plaster": "#d6d0c2", "wood": "#a98a66",
       "steel": "#9aa1a6", "masonry": "#b49a84", "cement_block": "#b5b1a8"}


def solid(e, t, is_part):
    h = num(t.get("height"))
    if h and h > 0: s = "m"
    elif num(t.get("building:levels")) is not None and num(t.get("building:levels")) > 0:
        h, s = num(t["building:levels"]) * 3.3 + (0 if is_part else 1), "f"
    else:
        h, s = DEFAULT_H.get(t.get("building:part") if is_part else t.get("building", "yes"), 11), "e"
    b = num(t.get("min_height"))
    if b is None and num(t.get("building:min_level")): b = num(t["building:min_level"]) * 3.3
    b = b or 0
    h = max(b + 1, min(h, 300))
    rec = {"h": round(h, 1), "s": s}
    if b: rec["b"] = round(b, 1)
    wc = t.get("building:colour") or MAT.get(t.get("building:material", ""))
    if wc: rec["c"] = wc
    if t.get("roof:colour"): rec["rc"] = t["roof:colour"]
    if t.get("name"): rec["n"] = t["name"]
    if t.get("addr:housenumber") and t.get("addr:street"): rec["a"] = f'{t["addr:housenumber"]} {t["addr:street"]}'
    bt = t.get("building", "yes")
    if bt not in ("yes", None): rec["t"] = bt
    return rec


buildings = [e for e in bways] + [e for e in rels if "building" in e.get("tags", {})]
parts = [e for e in ctx if "building:part" in e.get("tags", {}) and e["type"] == "way"] + \
        [e for e in rels if "building:part" in e.get("tags", {})]

part_recs = []
for e in parts:
    t = e["tags"]
    if t.get("building:part") in ("no",): continue
    for o, holes in polys(e):
        r = solid(e, t, True); r["o"] = enc(o)
        if holes: r["i"] = [enc(hh) for hh in holes]
        r["_c"] = (sum(x for x, _ in o) / len(o), sum(y for _, y in o) / len(o))
        part_recs.append(r)

out, hidden = [], 0
for e in buildings:
    t = e.get("tags", {})
    for o, holes in polys(e):
        xs = [x for x, _ in o]; ys = [y for _, y in o]
        bx = (min(xs), max(xs), min(ys), max(ys))
        has_parts = any(bx[0] <= p["_c"][0] <= bx[1] and bx[2] <= p["_c"][1] <= bx[3] and inpoly(*p["_c"], o) for p in part_recs)
        r = solid(e, t, False)
        if has_parts:
            hidden += 1
            # parts inherit the name for the tooltip
            for p in part_recs:
                if bx[0] <= p["_c"][0] <= bx[1] and bx[2] <= p["_c"][1] <= bx[3] and inpoly(*p["_c"], o):
                    for k in ("n", "a"):
                        if k in r and k not in p: p[k] = r[k]
            continue
        r["o"] = enc(o)
        if holes: r["i"] = [enc(hh) for hh in holes]
        out.append(r)
for p in part_recs:
    p.pop("_c"); p["p"] = 1; out.append(p)

# --- sea from coastline (land on the left of the way direction) ---
def clip_chain(ch):
    """split a polyline into pieces inside the box, with exact boundary crossings."""
    def inside(p): return X0 <= p[0] <= X1 and Y0 <= p[1] <= Y1
    pieces, cur = [], []
    for a, b in zip(ch, ch[1:]):
        t0, t1 = 0.0, 1.0; dx, dy = b[0] - a[0], b[1] - a[1]; ok = True
        for pp, qq in ((-dx, a[0] - X0), (dx, X1 - a[0]), (-dy, a[1] - Y0), (dy, Y1 - a[1])):
            if pp == 0:
                if qq < 0: ok = False; break
            else:
                r = qq / pp
                if pp < 0: t0 = max(t0, r)
                else: t1 = min(t1, r)
        if not ok or t0 > t1:
            if cur: pieces.append(cur); cur = []
            continue
        pa = (a[0] + t0 * dx, a[1] + t0 * dy); pb = (a[0] + t1 * dx, a[1] + t1 * dy)
        if not cur: cur = [pa]
        cur.append(pb)
        if t1 < 1:
            pieces.append(cur); cur = []
    if cur: pieces.append(cur)
    return pieces


def perim(p):  # clockwise (north-up) parameter from NW corner
    x, y = p; w, h = X1 - X0, Y1 - Y0
    if abs(y - Y1) < 1e-6: return x - X0
    if abs(x - X1) < 1e-6: return w + (Y1 - y)
    if abs(y - Y0) < 1e-6: return w + h + (X1 - x)
    return 2 * w + h + (y - Y0)


corners = [(X0, Y1), (X1, Y1), (X1, Y0), (X0, Y0)]
cps = [perim(c) for c in corners]; PER = 2 * ((X1 - X0) + (Y1 - Y0))
chains = stitch_open = []
segs = [[P(p["lat"], p["lon"]) for p in e["geometry"]] for e in coast]
# join coastline ways head-to-tail (direction preserved)
changed = True
while changed:
    changed = False
    for i in range(len(segs)):
        for j in range(len(segs)):
            if i != j and segs[i][-1] == segs[j][0]:
                segs[i] = segs[i] + segs[j][1:]; segs.pop(j); changed = True; break
        if changed: break
pieces = [pc for s in segs for pc in clip_chain(s) if len(pc) > 1]
sea = []
open_p = [pc for pc in pieces if pc[0] != pc[-1]]
used = [False] * len(open_p)
for k in range(len(open_p)):
    if used[k]: continue
    ring = []; cur = k
    while not used[cur]:
        used[cur] = True; ring += open_p[cur]
        s_exit = perim(open_p[cur][-1])
        # next entry clockwise from exit
        best, bd = None, None
        for m, pc in enumerate(open_p):
            d = (perim(pc[0]) - s_exit) % PER
            if (bd is None or d < bd) and (not used[m] or m == k): best, bd = m, d
        for c, cp in sorted(zip(corners, cps), key=lambda z: (z[1] - s_exit) % PER):
            if 0 < (cp - s_exit) % PER < bd: ring.append(c)
        cur = best
    sea.append(ring)
print("sea rings", len(sea), [round(abs(area(r)) / 1e6, 2) for r in sea], "km2")

water, parks = [], []
for e in ctx + [r for r in rels if r.get("tags", {}).get("natural") == "water" or r.get("tags", {}).get("leisure") == "park"]:
    t = e.get("tags", {})
    kind = "w" if t.get("natural") == "water" else "g" if t.get("leisure") in ("park", "garden", "pitch") or t.get("landuse") in ("grass", "cemetery") else None
    if not kind: continue
    for o, holes in polys(e):
        rec = {"o": enc(o)}
        if holes: rec["i"] = [enc(hh) for hh in holes]
        (water if kind == "w" else parks).append(rec)
for r in sea: water.append({"o": enc(r)})

RW = {"motorway": 14, "trunk": 13, "primary": 12, "secondary": 10, "tertiary": 9, "residential": 7, "unclassified": 7,
      "service": 4, "pedestrian": 5, "footway": 2, "motorway_link": 8, "trunk_link": 8, "primary_link": 8, "secondary_link": 7}
roads = []
for e in ctx:
    hw = e.get("tags", {}).get("highway")
    if hw not in RW or e["type"] != "way": continue
    if e["tags"].get("tunnel") in ("yes", "building_passage"): continue
    g = [P(p["lat"], p["lon"]) for p in e.get("geometry", [])]
    lay = num(e["tags"].get("layer")) or 0
    deck = round(max(lay, 1) * 7 + 0.8, 1) if e["tags"].get("bridge") not in (None, "no") else (0.4 if hw not in ("footway",) else 0.5)
    if len(g) > 1: roads.append([RW[hw], deck] + enc(g))

bridges, zakim = [], None
for e in ctx + [r for r in rels if r.get("tags", {}).get("man_made") == "bridge"]:
    t = e.get("tags", {})
    if t.get("man_made") != "bridge":
        continue
    lay = num(t.get("layer")) or 1
    for o, holes in polys(e):
        rec = {"o": enc(o), "y": round(max(lay, 1) * 7, 1)}
        if t.get("name"): rec["n"] = t["name"]
        bridges.append(rec)
        if "Zakim" in t.get("name", "") and zakim is None:
            import numpy as np
            pts = np.array(o); c = pts.mean(axis=0); u, sv, vt = np.linalg.svd(pts - c)
            ax = vt[0]; proj = (pts - c) @ ax; perp = (pts - c) @ vt[1]
            if ax[1] < 0: ax = -ax
            zakim = {"cx": round(c[0], 1), "cz": round(-c[1], 1), "ax": round(float(ax[0]), 4), "az": round(float(-ax[1]), 4),
                     "len": round(float(proj.max() - proj.min()), 1), "w": round(float(perp.max() - perp.min()), 1), "deck": round(max(lay, 1) * 7, 1)}
print("bridges", len(bridges), "zakim", zakim)

json.dump({"lat0": LAT0, "lon0": LON0, "box": [round(X0), round(X1), round(-Y1), round(-Y0)], "buildings": out,
           "water": water, "parks": parks, "roads": roads, "bridges": bridges, "zakim": zakim},
          open(D + "boston_min.json", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
print(len(out), "solids;", len(part_recs), "parts;", hidden, "outlines replaced by parts;", len(water), "water;", len(parks), "parks;", len(roads), "roads")
