"""Countries base layer + UN WPP 2024 population series.

Sources:
- Natural Earth 1:50m Admin 0 countries (public domain)
  https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip
- UN World Population Prospects 2024, total population by sex (CC BY 3.0 IGO)
  https://population.un.org/wpp/ (WPP2024_TotalPopulationBySex.csv.gz)

Outputs:
- data/countries.geojson  — world polygons, simplified, keyed by iso3, with
  pop2025 / pop2050 / pop2100 (millions, medium variant) and growth multiple
- data/population.json    — 5-year series per African country + comparators,
  annual series for crossover countries, regional aggregates, crossover years,
  and low/medium/high fan for Nigeria and DR Congo
"""

import csv
import gzip
import io
import zipfile
from collections import defaultdict

import shapefile
from shapely.geometry import shape, mapping
from shapely import unary_union

from common import RAW_DIR, DATA_DIR, AFRICA_ISO3, COMPARATOR_ISO3, write_geojson, write_json

# Countries whose annual series we keep so crossover years land on a year.
CROSSOVER_ISO3 = {
    "NGA", "COD", "ETH", "TZA", "EGY", "AGO", "UGA", "KEN", "SDN", "NER",
    "USA", "RUS", "JPN", "DEU", "GBR", "FRA", "ITA", "ESP", "CAN", "MEX",
}
CROSSOVER_PAIRS = [
    ("NGA", "USA"), ("COD", "DEU"), ("COD", "RUS"), ("COD", "JPN"),
    ("ETH", "RUS"), ("ETH", "JPN"), ("TZA", "RUS"), ("TZA", "DEU"),
    ("EGY", "RUS"), ("UGA", "GBR"), ("UGA", "FRA"), ("KEN", "ITA"),
    ("AGO", "ESP"), ("NER", "CAN"), ("SDN", "ESP"), ("NER", "DEU"),
]
REGIONS = {
    "Africa", "Europe", "Northern America", "Asia",
    "Latin America and the Caribbean", "Oceania", "World",
}


def load_wpp():
    med = defaultdict(dict)        # iso3 -> {year: millions}
    fan = defaultdict(lambda: defaultdict(dict))  # iso3 -> variant -> {year: millions}
    regions = defaultdict(dict)    # region name -> {year: millions}
    names = {}
    with gzip.open(RAW_DIR / "WPP2024_TotalPopulationBySex.csv.gz", "rt", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            variant = row["Variant"]
            if variant not in ("Medium", "Low", "High"):
                continue
            year = int(row["Time"])
            pop_m = float(row["PopTotal"]) / 1000.0
            loc = row["Location"]
            if variant == "Medium" and loc in REGIONS and row["LocTypeName"] in ("Region", "World", "Geographic region"):
                regions[loc][year] = pop_m
                continue
            iso3 = row["ISO3_code"]
            if not iso3:
                continue
            if iso3 in ("NGA", "COD") and variant in ("Low", "High"):
                fan[iso3][variant][year] = pop_m
            if variant != "Medium":
                continue
            if iso3 in AFRICA_ISO3 or iso3 in COMPARATOR_ISO3:
                med[iso3][year] = pop_m
                names[iso3] = loc
    return med, fan, regions, names


def crossover_year(a, b):
    """First year a's population exceeds b's and stays ahead through 2100."""
    for year in range(1950, 2101):
        if year in a and year in b and a[year] > b[year]:
            if all(a.get(y, 0) > b.get(y, float("inf")) for y in range(year, 2101, 5)):
                return year
    return None


def build_countries(med):
    zpath = RAW_DIR / "ne_50m_admin_0_countries.zip"
    zf = zipfile.ZipFile(zpath)
    base = "ne_50m_admin_0_countries"
    r = shapefile.Reader(
        shp=io.BytesIO(zf.read(base + ".shp")),
        dbf=io.BytesIO(zf.read(base + ".dbf")),
        shx=io.BytesIO(zf.read(base + ".shx")),
    )
    fields = [f[0] for f in r.fields[1:]]
    features = []
    for sr in r.shapeRecords():
        rec = dict(zip(fields, sr.record))
        iso3 = rec.get("ISO_A3_EH") or rec.get("ISO_A3")
        if iso3 in ("-99", None, ""):
            iso3 = rec.get("ADM0_A3")
        geom = shape(sr.shape.__geo_interface__).buffer(0)
        simplified = geom.simplify(0.06, preserve_topology=True)
        if simplified.is_empty:
            simplified = geom
        props = {
            "iso3": iso3,
            "name": rec.get("NAME_EN") or rec.get("NAME"),
            "continent": rec.get("CONTINENT"),
        }
        series = med.get(iso3)
        if series:
            p25, p50, p100 = series.get(2025), series.get(2050), series.get(2100)
            if p25 and p100:
                props.update({
                    "pop2025": round(p25, 2),
                    "pop2050": round(p50, 2),
                    "pop2100": round(p100, 2),
                    "multiple": round(p100 / p25, 2),
                    "africa": 1 if iso3 in AFRICA_ISO3 else 0,
                })
        features.append({"geometry": mapping(simplified), "properties": props})
    write_geojson(DATA_DIR / "countries.geojson", features, ndigits=3)


def main():
    med, fan, regions, names = load_wpp()

    years5 = list(range(1950, 2101, 5)) + [2025]
    years5 = sorted(set(years5))

    countries = {}
    for iso3, series in med.items():
        entry = {"name": names[iso3], "africa": iso3 in AFRICA_ISO3}
        entry["series"] = [[y, round(series[y], 2)] for y in years5 if y in series]
        if iso3 in CROSSOVER_ISO3:
            entry["annual"] = [[y, round(series[y], 2)] for y in sorted(series)]
        countries[iso3] = entry

    crossovers = []
    for a, b in CROSSOVER_PAIRS:
        y = crossover_year(med[a], med[b])
        if y:
            crossovers.append({"a": a, "b": b, "year": y,
                               "aName": names[a], "bName": names[b]})
    crossovers.sort(key=lambda c: c["year"])

    out = {
        "source": "UN World Population Prospects 2024, medium variant (thousands -> millions)",
        "countries": countries,
        "regions": {k: [[y, round(v[y], 1)] for y in years5 if y in v] for k, v in regions.items()},
        "crossovers": crossovers,
        "fan": {iso3: {var.lower(): [[y, round(s[y], 1)] for y in years5 if y in s]
                       for var, s in variants.items()}
                for iso3, variants in fan.items()},
    }
    write_json(DATA_DIR / "population.json", out)
    build_countries(med)

    for c in crossovers:
        print(f"  {c['aName']} passes {c['bName']} in {c['year']}")


if __name__ == "__main__":
    main()
