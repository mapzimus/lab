"""African city agglomerations, 1975-2050, plus 2100 outlook for headline cities.

Sources:
- UN World Urbanization Prospects 2025, DEGURBA cities population surface data
  (CC BY 3.0 IGO), annual 1975-2050 per city with population-weighted centroids
  https://population.un.org/wup/ (WUP2025-DB-DEGURBA-Cities-Population-Surface-Data.csv.gz)
- Hoornweg & Pope (2017), "Population predictions for the world's largest
  cities in the 21st century", Environment & Urbanization 29(1) — 2100
  projections for headline cities (explicitly flagged as `p2100` and framed
  as a projection in the page).

Output:
- data/cities.geojson — point per city with pop (millions) at each epoch;
  African cities with >= 1M people by 2050, plus world benchmark cities.
"""

import csv
import gzip
from collections import defaultdict

from common import RAW_DIR, DATA_DIR, AFRICA_ISO3, write_geojson

EPOCHS = [1975, 1990, 2000, 2010, 2020, 2025, 2030, 2040, 2050]

# Benchmark agglomerations for scale comparisons. UN names carry local forms
# ("Tōkyō (Tokyo)"), so match by substring within the country.
BENCHMARKS = {
    ("USA", "New York"), ("JPN", "Tokyo"), ("FRA", "Paris"), ("GBR", "London"),
}


def match(table, iso3, city_name):
    lower = city_name.lower()
    for (t_iso3, t_name), value in (table.items() if isinstance(table, dict) else ((k, True) for k in table)):
        t = t_name.lower()
        if t_iso3 == iso3 and (lower.startswith(t) or f"({t})" in lower):
            return value
    return None

# Hoornweg & Pope (2017) 2100 projections, millions.
P2100 = {
    ("NGA", "Lagos"): 88.3,
    ("COD", "Kinshasa"): 83.5,
    ("TZA", "Dar es Salaam"): 73.7,
    ("SDN", "Khartoum"): 56.6,
    ("NER", "Niamey"): 56.1,
    ("KEN", "Nairobi"): 46.1,
    ("MWI", "Lilongwe"): 41.4,
    ("MWI", "Blantyre"): 40.9,
    ("EGY", "Cairo"): 40.5,
    ("UGA", "Kampala"): 40.1,
    ("ZMB", "Lusaka"): 37.7,
    ("SOM", "Mogadishu"): 36.4,
    ("ETH", "Addis Ababa"): 35.8,
    ("AGO", "Luanda"): 35.1,
    ("CIV", "Abidjan"): 32.0,
    ("CMR", "Douala"): 25.8,
}


def main():
    cities = defaultdict(dict)   # (iso3, code) -> {year: pop_thousands}
    meta = {}
    with gzip.open(RAW_DIR / "WUP2025-cities.csv.gz", "rt", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            iso3 = row["ISO3_Code"]
            african = iso3 in AFRICA_ISO3
            if not african and not match(BENCHMARKS, iso3, row["City_Name"]):
                continue
            year = int(row["Year"])
            if year not in EPOCHS:
                continue
            key = (iso3, row["City_Code"])
            try:
                pop = float(row["Pop_1Jan"])
            except ValueError:
                continue
            cities[key][year] = pop
            # Track the most recent centroid so the point sits on today's city.
            prev = meta.get(key)
            if prev is None or year >= prev["year"]:
                meta[key] = {
                    "year": year,
                    "name": row["City_Name"],
                    "iso3": iso3,
                    "capital": row["Capital"] == "1",
                    "lat": float(row["PWCent_Latitude"]),
                    "lon": float(row["PWCent_Longitude"]),
                    "african": african,
                }

    features = []
    for key, series in cities.items():
        m = meta[key]
        pop2050 = series.get(2050, 0.0)
        if m["african"] and pop2050 < 1000.0:  # thousands -> 1M cutoff
            continue
        props = {
            "name": m["name"],
            "iso3": m["iso3"],
            "african": 1 if m["african"] else 0,
        }
        if m["capital"]:
            props["capital"] = 1
        for y in EPOCHS:
            if y in series:
                props[f"p{y}"] = round(series[y] / 1000.0, 3)  # millions
        p2100 = match(P2100, m["iso3"], m["name"])
        if p2100:
            props["p2100"] = p2100
        features.append({
            "geometry": {"type": "Point", "coordinates": [m["lon"], m["lat"]]},
            "properties": props,
        })

    features.sort(key=lambda f: -f["properties"].get("p2050", 0))
    write_geojson(DATA_DIR / "cities.geojson", features, ndigits=4)

    top = features[:12]
    for f in top:
        p = f["properties"]
        print(f"  {p['name']} ({p['iso3']}): 2025 {p.get('p2025')}M -> 2050 {p.get('p2050')}M"
              + (f" -> 2100 {p['p2100']}M (H&P)" if "p2100" in p else ""))


if __name__ == "__main__":
    main()
