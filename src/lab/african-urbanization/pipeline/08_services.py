"""Access to electricity and basic drinking water, per country, and the trend.

Source:
- World Bank Open Data (CC BY 4.0), indicators
  EG.ELC.ACCS.ZS  access to electricity, % of population
  SH.H2O.BASW.ZS  people using at least basic drinking water services, %
  https://api.worldbank.org/v2/  (no key required)

The story spends three chapters on where people will live and how they might
move between cities. This is the other half of the sentence: the services those
cities do not yet have. Merged into countries.geojson so the same choropleth
machinery can shade by it.

The snapshot alone understates the argument. The story claims a problem of
RATE, so this also builds the series back to 2000 and pairs the two curves that
matter: the share of Africans with access, which has climbed a long way, and
the absolute number without, which has not fallen. Both indicators show the
same shape independently. Electrification is working and is still losing to the
population it is chasing.

The per-country gain since 2000 is merged in as well, because the countries
that closed the gap fastest are the evidence that it can be closed at all.

Run after 01_countries_population.py, which writes the file this updates.
"""

import json

import requests

from common import DATA_DIR, AFRICA_ISO3, write_json

API = "https://api.worldbank.org/v2/country/all/indicator/{}"
INDICATORS = {"elec": "EG.ELC.ACCS.ZS", "water": "SH.H2O.BASW.ZS"}
YEARS = "2015:2023"
TREND_YEARS = "2000:2023"
# 2022 is the last year both indicators report broadly. 2023 is thin enough
# that including it would make the final point a different sample.
TREND_END = 2022
BASE_YEAR = 2000


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


def full_series(indicator):
    """Every non-null observation per country, keyed by year."""
    out, page, pages = {}, 1, 1
    while page <= pages:
        r = requests.get(API.format(indicator),
                         params={"format": "json", "date": TREND_YEARS,
                                 "per_page": 20000, "page": page},
                         timeout=120)
        r.raise_for_status()
        meta, rows = r.json()
        pages = meta["pages"]
        for row in rows or []:
            iso3, value, year = row["countryiso3code"], row["value"], int(row["date"])
            if iso3 and value is not None:
                out.setdefault(iso3, {})[year] = float(value)
        page += 1
    return out


def pop_at(series, year):
    """UN country series is five-yearly; interpolate to a single year."""
    pts = sorted(series)
    if year <= pts[0][0]:
        return pts[0][1]
    for (y0, v0), (y1, v1) in zip(pts, pts[1:]):
        if y0 <= year <= y1:
            return v0 + (v1 - v0) * (year - y0) / (y1 - y0)
    return pts[-1][1]


def trend(pop):
    """Share with access against the absolute number without, 2000 to 2022.

    Only countries reporting in a given year are counted, so the share and the
    total move together and neither is distorted by a country appearing late.
    """
    out = {}
    for key, code in INDICATORS.items():
        series = full_series(code)
        rows = []
        for year in range(BASE_YEAR, TREND_END + 1):
            total = without = 0.0
            countries = 0
            for iso3 in AFRICA_ISO3:
                pct = series.get(iso3, {}).get(year)
                if pct is None or iso3 not in pop:
                    continue
                people = pop_at(pop[iso3]["series"], year)
                total += people
                without += people * (100 - pct) / 100
                countries += 1
            if countries < 40:      # too thin a sample to plot honestly
                continue
            rows.append({"year": year,
                         "accessPct": round(100 * (1 - without / total), 1),
                         "withoutM": round(without),
                         "countries": countries})
        out[key] = rows
        first, last = rows[0], rows[-1]
        print(f"  {code}: access {first['accessPct']}% -> {last['accessPct']}%, "
              f"without {first['withoutM']}M -> {last['withoutM']}M "
              f"({first['year']} to {last['year']})")
    return out, full_series(INDICATORS["elec"])


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

    # --- the trend, which is the part the story actually argues ---
    pop = json.load(open(DATA_DIR / "population.json"))["countries"]
    rows, elec_series = trend(pop)

    gains = {}
    for iso3 in AFRICA_ISO3:
        s_ = elec_series.get(iso3, {})
        if BASE_YEAR in s_ and TREND_END in s_:
            gains[iso3] = round(s_[TREND_END] - s_[BASE_YEAR], 1)

    fc = json.load(open(path))
    for feature in fc["features"]:
        gain = gains.get(feature["properties"].get("iso3"))
        if gain is not None:
            feature["properties"]["elecGain"] = gain
    with open(path, "w") as fh:
        json.dump(fc, fh, separators=(",", ":"))
    print(f"  merged {len(gains)} electrification gains into countries.geojson")

    top = sorted(gains.items(), key=lambda kv: -kv[1])[:6]
    named = [(json.load(open(DATA_DIR / "population.json"))["countries"]
              .get(i, {}).get("name", i), g) for i, g in top]
    print("  biggest gains since 2000:", named)

    write_json(DATA_DIR / "services-trend.json", {
        "source": "World Bank Open Data (CC BY 4.0), EG.ELC.ACCS.ZS and "
                  "SH.H2O.BASW.ZS, against UN WPP 2024 country population",
        "note": "Share of Africans with access against the absolute number "
                "without, for the countries reporting in each year. The share "
                "climbs steeply and the absolute number does not fall, which "
                "is the gap the story is about.",
        "baseYear": BASE_YEAR,
        "endYear": TREND_END,
        "series": rows,
        "topGains": [{"iso3": i, "gainPts": g} for i, g in
                     sorted(gains.items(), key=lambda kv: -kv[1])[:12]],
    })


if __name__ == "__main__":
    main()
