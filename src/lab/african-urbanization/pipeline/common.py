"""Shared helpers for the african-urbanization data pipeline.

Raw downloads live outside the repo (RAW_DIR); only the derived outputs in
../data/ are committed. Every script prints its sources on run.
"""

import json
import os
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
DATA_DIR = PIPELINE_DIR.parent / "data"
RAW_DIR = Path(os.environ.get(
    "AFRICAN_URBANIZATION_RAW",
    PIPELINE_DIR / "raw",
))

AFRICA_ISO3 = {
    "DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CPV", "CMR", "CAF", "TCD",
    "COM", "COG", "COD", "CIV", "DJI", "EGY", "GNQ", "ERI", "SWZ", "ETH",
    "GAB", "GMB", "GHA", "GIN", "GNB", "KEN", "LSO", "LBR", "LBY", "MDG",
    "MWI", "MLI", "MRT", "MUS", "MAR", "MOZ", "NAM", "NER", "NGA", "RWA",
    "STP", "SEN", "SYC", "SLE", "SOM", "ZAF", "SSD", "SDN", "TZA", "TGO",
    "TUN", "UGA", "ZMB", "ZWE", "ESH",
}

# Western / comparator countries the narrative measures Africa against.
COMPARATOR_ISO3 = {"USA", "RUS", "JPN", "DEU", "GBR", "FRA", "ITA", "ESP", "CAN", "CHN", "IND", "BRA", "MEX"}


def round_coords(obj, ndigits):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(v, ndigits) for v in obj]
        return [round_coords(v, ndigits) for v in obj]
    return obj


def write_geojson(path, features, ndigits=3, extra=None):
    fc = {"type": "FeatureCollection", "features": []}
    if extra:
        fc.update(extra)
    for f in features:
        g = dict(f["geometry"])
        g["coordinates"] = round_coords(g["coordinates"], ndigits)
        fc["features"].append({"type": "Feature", "properties": f["properties"], "geometry": g})
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fh:
        json.dump(fc, fh, separators=(",", ":"))
    print(f"wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB, {len(fc['features'])} features)")


def write_json(path, obj):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fh:
        json.dump(obj, fh, separators=(",", ":"))
    print(f"wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB)")
