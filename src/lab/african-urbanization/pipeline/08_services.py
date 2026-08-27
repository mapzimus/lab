"""Access to electricity and basic drinking water, per country.

Source:
- World Bank Open Data (CC BY 4.0), indicators
  EG.ELC.ACCS.ZS  access to electricity, % of population
  SH.H2O.BASW.ZS  people using at least basic drinking water services, %
  https://api.worldbank.org/v2/  (no key required)

The story spends three chapters on where people will live and how they might
move between cities. This is the other half of the sentence: the services those
cities do not yet have. Merged into countries.geojson so the same choropleth
machinery can shade by it.

Run after 01_countries_population.py, which writes the file this updates.
"""

import json

import requests

from common import DATA_DIR, AFRICA_ISO3

API = "https://api.worldbank.org/v2/country/all/indicator/{}"
INDICATORS = {"elec": "EG.ELC.ACCS.ZS", "water": "SH.H2O.BASW.ZS"}
YEARS = "2015:2023"


def latest_values(indicator):
    """Most recent non-null observation per country in the window."""
    out, page, pages = {}, 1, 1
    while page <= pages:
        r = requests.get(API.format(indicator),
                         params={"format": "json", "date": YEARS,
                                 "per_page": 20000, "page": page},
                         timeout=120)
        r.raise_for_status()
        meta, rows = r.json()
        pages = meta["pages"]
        for row in rows or []:
            iso3, value, year = row["countryiso3code"], row["value"], int(row["date"])
            if not iso3 or value is None:
                continue
            if iso3 not in out or year > out[iso3][1]:
                out[iso3] = (float(value), year)
        page += 1
    return out


def main():
    values = {key: latest_values(code) for key, code in INDICATORS.items()}
    for key, code in INDICATORS.items():
        got = values[key]
        afr = [v for iso3, (v, _) in got.items() if iso3 in AFRICA_ISO3]
        print(f"  {code}: {len(got)} countries, {len(afr)} African, "
              f"African median {sorted(afr)[len(afr) // 2]:.1f}%")

    path = DATA_DIR / "countries.geojson"
    fc = json.load(open(path))
    hits = 0
    for feature in fc["features"]:
        iso3 = feature["properties"].get("iso3")
        for key in INDICATORS:
            entry = values[key].get(iso3)
            if entry:
                feature["properties"][key] = round(entry[0], 1)
                hits += 1
    with open(path, "w") as fh:
        json.dump(fc, fh, separators=(",", ":"))
    print(f"  merged {hits} values into countries.geojson")

    worst = sorted(((v, i) for i, (v, _) in values["elec"].items() if i in AFRICA_ISO3))[:5]
    print("  lowest electricity access:", [(i, v) for v, i in worst])


if __name__ == "__main__":
    main()
