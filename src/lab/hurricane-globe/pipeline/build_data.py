"""Parse NHC HURDAT2 best-track files into compact JSON for the globe.

Downloads the two HURDAT2 files below into the repo's .cache/hurdat2/ (git-ignored,
and outside src/ so the build never ships them) if they are missing. When NHC posts a new release, update the file names and rerun:

    python pipeline/build_data.py

Output data/storms.json:
  {"source": [...], "status": [...], "storms": [
     {"id", "name", "year", "basin", "w" (max kt), "p" (min mb or null),
      "t0" (ms epoch of first fix),
      "pts": [[lat, lon, wind_kt, pres_mb|0, hours_since_t0, status_idx, landfall], ...],
      "r": [[34kt NE,SE,SW,NW, 50kt x4, 64kt x4] or 0, ...]  (only when radii exist, 2004+)}
  ]}
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = Path(__file__).resolve().parents[4] / ".cache" / "hurdat2"
NHC = "https://www.nhc.noaa.gov/data/hurdat/"
ATLANTIC = "hurdat2-1851-2025-092326.txt"
PACIFIC = "hurdat2-nepac-1949-2025-092926.txt"
STATUS = ["TD", "TS", "HU", "EX", "SD", "SS", "LO", "WV", "DB"]


def coord(s):
    v = float(s[:-1])
    return -v if s[-1] in "SW" else v


def parse(path, basin):
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
        pressures = [p[3] for p in pts if p[3]]
        storm = {
            "id": sid,
            "name": name.title(),
            "year": int(sid[-4:]),
            "basin": basin,
            "w": max(p[2] for p in pts),
            "p": min(pressures) if pressures else None,
            "t0": int(t0.timestamp() * 1000),
            "pts": pts,
        }
        if any(radii):
            storm["r"] = radii
        storms.append(storm)
    return storms


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    atl, pac = RAW / ATLANTIC, RAW / PACIFIC
    for f in (atl, pac):
        if not f.exists():
            print(f"downloading {f.name}", file=sys.stderr)
            urllib.request.urlretrieve(NHC + f.name, f)
    storms = parse(atl, "AL") + parse(pac, "EP")
    storms.sort(key=lambda s: s["t0"])
    out = {"source": [atl.name, pac.name], "status": STATUS, "storms": storms}
    dest = ROOT / "data" / "storms.json"
    dest.write_text(json.dumps(out, separators=(",", ":")))
    npts = sum(len(s["pts"]) for s in storms)
    print(f"{len(storms)} storms, {npts} fixes -> {dest} ({dest.stat().st_size / 1e6:.1f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
