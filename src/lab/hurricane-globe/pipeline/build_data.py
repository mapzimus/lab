"""Build the globe's per-basin storm files from NHC HURDAT2 and NOAA IBTrACS.

North Atlantic and NE/Central Pacific come from HURDAT2 (the NHC/CPHC record).
Every other basin comes from IBTrACS v04r01: West Pacific, North Indian, South
Indian, South Pacific and South Atlantic. Source files are downloaded into the
repo's .cache/ (git-ignored, and outside src/ so the build never ships them)
when they are missing. When a new release is posted, update the file names
below and rerun:

    python pipeline/build_data.py

Writes data/storms-<BASIN>.json for AL, EP, WP, NI, SI, SP and SA:
  {"source": [...], "status": [...], "storms": [
     {"id", "name", "year" (season), "basin", "w" (max kt), "p" (min mb or null),
      "t0" (ms epoch of first fix),
      "pts": [[lat, lon, wind_kt, pres_mb|0, hours_since_t0, status_idx, landfall], ...],
      "r": [[34kt NE,SE,SW,NW, 50kt x4, 64kt x4] or 0, ...]  (only when radii exist)}
  ]}

Winds are 1-minute sustained so the Saffir-Simpson colours mean the same thing
everywhere. IBTrACS fixes use the US agency wind (JTWC outside the Americas)
when there is one. Otherwise they use the WMO agency's wind, converted from
10-minute (Tokyo, Réunion, BoM, Nadi, Wellington) or 3-minute (New Delhi)
averaging with the usual 0.88 and 0.93 factors.
"""
import csv
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parents[4] / ".cache"
NHC = "https://www.nhc.noaa.gov/data/hurdat/"
ATLANTIC = "hurdat2-1851-2025-092326.txt"
PACIFIC = "hurdat2-nepac-1949-2025-092926.txt"
IBTRACS = "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/"
IBTRACS_BASINS = ["WP", "NI", "SI", "SP", "SA"]
STATUS = ["TD", "TS", "HU", "EX", "SD", "SS", "LO", "WV", "DB"]
TO_ONE_MINUTE = {"tokyo": 1 / 0.88, "reunion": 1 / 0.88, "bom": 1 / 0.88, "nadi": 1 / 0.88, "wellington": 1 / 0.88, "newdelhi": 1 / 0.93}
RADII = [f"USA_R{kt}_{q}" for kt in (34, 50, 64) for q in ("NE", "SE", "SW", "NW")]


def fetch(url, dest):
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {dest.name}", file=sys.stderr)
        urllib.request.urlretrieve(url, dest)
    return dest


def coord(s):
    v = float(s[:-1])
    return -v if s[-1] in "SW" else v


def finish(sid, name, year, basin, t0, pts, radii):
    pressures = [p[3] for p in pts if p[3]]
    storm = {
        "id": sid,
        "name": name,
        "year": year,
        "basin": basin,
        "w": max(p[2] for p in pts),
        "p": min(pressures) if pressures else None,
        "t0": int(t0.timestamp() * 1000),
        "pts": pts,
    }
    if any(radii):
        storm["r"] = radii
    return storm


def parse_hurdat(path, basin):
    storms = []
    lines = path.read_text().splitlines()
    i = 0
    while i < len(lines):
        head = [c.strip() for c in lines[i].split(",")]
        sid, name, n = head[0], head[1], int(head[2])
        pts, radii, t0 = [], [], None
        for row in lines[i + 1 : i + 1 + n]:
            c = [x.strip() for x in row.split(",")]
            t = datetime.strptime(c[0] + c[1], "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
            t0 = t0 or t
            wind = int(c[6])
            pres = int(c[7])
            pts.append([
                round(coord(c[4]), 1),
                round(coord(c[5]), 1),
                max(wind, 0),
                pres if pres > 0 else 0,
                round((t - t0).total_seconds() / 3600, 2),
                STATUS.index(c[3]) if c[3] in STATUS else 8,
                1 if c[2] == "L" else 0,
            ])
            r = [max(int(x), 0) for x in c[8:20]]
            radii.append(r if any(r) else 0)
        i += 1 + n
        storms.append(finish(sid, name.title(), int(sid[-4:]), basin, t0, pts, radii))
    return storms


def num(s):
    s = s.strip()
    return float(s) if s else None


def ib_status(nature, wind):
    if nature == "ET":
        return 3
    if nature == "DS":
        return 8
    if nature == "SS":
        return 4 if wind < 34 else 5
    return 0 if wind < 34 else 1 if wind < 64 else 2


def parse_ibtracs(paths):
    """Group main-track rows by storm, keep original (non-interpolated) fixes plus
    landfall moments, and assign each storm to the basin it formed in."""
    rows_by_sid, order = {}, []
    for path in paths:
        with open(path, newline="") as f:
            reader = csv.DictReader(f)
            next(reader)  # units row
            seen_here = set()
            for row in reader:
                if row["TRACK_TYPE"] != "main":
                    continue
                sid = row["SID"]
                if sid in rows_by_sid and sid not in seen_here:
                    continue  # already read from another basin's file
                if sid not in rows_by_sid:
                    rows_by_sid[sid] = []
                    order.append(sid)
                seen_here.add(sid)
                rows_by_sid[sid].append(row)

    storms, ids = {b: [] for b in IBTRACS_BASINS}, set()
    for sid in order:
        rows = rows_by_sid[sid]
        basin = next((r["BASIN"] for r in rows if r["BASIN"] not in ("MM", "")), "WP")
        if basin not in storms:
            continue  # formed in the Atlantic or East Pacific: HURDAT2 has it
        pts, radii, t0, prev_land = [], [], None, None
        for r in rows:
            dist = num(r["DIST2LAND"])
            landfall = prev_land is not None and prev_land > 0 and dist == 0
            prev_land = dist
            if not r["IFLAG"].startswith("O") and not landfall:
                continue
            t = datetime.strptime(r["ISO_TIME"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            t0 = t0 or t
            wind = num(r["USA_WIND"])
            if wind is None:
                wmo = num(r["WMO_WIND"])
                wind = wmo * TO_ONE_MINUTE.get(r["WMO_AGENCY"], 1) if wmo is not None else 0
            pres = num(r["USA_PRES"]) or num(r["WMO_PRES"]) or 0
            lon = float(r["LON"])
            lon = lon - 360 if lon > 180 else lon
            pts.append([
                round(float(r["LAT"]), 1),
                round(lon, 1),
                int(round(wind)),
                int(pres),
                round((t - t0).total_seconds() / 3600, 2),
                ib_status(r["NATURE"], wind),
                1 if landfall else 0,
            ])
            rad = [int(num(r[k]) or 0) for k in RADII]
            radii.append(rad if any(rad) else 0)
        if not pts:
            continue
        atcf = next((r["USA_ATCF_ID"].strip().upper() for r in rows if r["USA_ATCF_ID"].strip()), "")
        sid_out = atcf if atcf and atcf not in ids else sid
        ids.add(sid_out)
        raw_name = rows[0]["NAME"].strip()
        name = "Unnamed" if raw_name in ("", "NOT_NAMED", "UNNAMED") else raw_name.title()
        storms[basin].append(finish(sid_out, name, int(rows[0]["SEASON"]), basin, t0, pts, radii))
    return storms


def write(basin, storms, source):
    storms.sort(key=lambda s: s["t0"])
    dest = ROOT / "data" / f"storms-{basin}.json"
    dest.write_text(json.dumps({"source": source, "status": STATUS, "storms": storms}, separators=(",", ":")))
    npts = sum(len(s["pts"]) for s in storms)
    print(f"{basin}: {len(storms)} storms, {npts} fixes -> {dest.name} ({dest.stat().st_size / 1e6:.1f} MB)", file=sys.stderr)


def main():
    atl = fetch(NHC + ATLANTIC, CACHE / "hurdat2" / ATLANTIC)
    pac = fetch(NHC + PACIFIC, CACHE / "hurdat2" / PACIFIC)
    write("AL", parse_hurdat(atl, "AL"), [atl.name])
    write("EP", parse_hurdat(pac, "EP"), [pac.name])

    names = [f"ibtracs.{b}.list.v04r01.csv" for b in IBTRACS_BASINS]
    paths = [fetch(IBTRACS + n, CACHE / "ibtracs" / n) for n in names]
    for basin, storms in parse_ibtracs(paths).items():
        write(basin, storms, names)


if __name__ == "__main__":
    main()
