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
  the UN's low and high band around the Africa total, and per-country median
  age and total fertility
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

# Countries that get a name label on the continental map. Curated: big enough
# to hold a label at zoom ~2.5 without collisions; short display names.
LABELED = {
    "MAR": "Morocco", "DZA": "Algeria", "LBY": "Libya", "EGY": "Egypt",
    "MRT": "Mauritania", "MLI": "Mali", "NER": "Niger", "TCD": "Chad",
    "SDN": "Sudan", "ETH": "Ethiopia", "SOM": "Somalia", "NGA": "Nigeria",
    "GHA": "Ghana", "CIV": "Côte d'Ivoire", "SEN": "Senegal",
    "CMR": "Cameroon", "SSD": "South Sudan", "KEN": "Kenya",
    "COD": "DR Congo", "TZA": "Tanzania", "AGO": "Angola", "ZMB": "Zambia",
    "MOZ": "Mozambique", "NAM": "Namibia", "BWA": "Botswana",
    "ZAF": "South Africa", "MDG": "Madagascar", "UGA": "Uganda",
}


def load_wpp():
    med = defaultdict(dict)        # iso3 -> {year: millions}
    band = defaultdict(dict)       # variant -> {year: millions}, Africa only
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
            if loc in REGIONS and row["LocTypeName"] in ("Region", "World", "Geographic region"):
                if variant == "Medium":
                    regions[loc][year] = pop_m
                elif loc == "Africa":
                    # The story quotes one number for 2100; the band shows the
                    # spread the UN itself publishes around it.
                    band[variant][year] = pop_m
                continue
            iso3 = row["ISO3_code"]
            if not iso3:
                continue
            if variant != "Medium":
                continue
            if iso3 in AFRICA_ISO3 or iso3 in COMPARATOR_ISO3:
                med[iso3][year] = pop_m
                names[iso3] = loc
    return med, band, regions, names


def crossover_year(a, b):
    """First year a's population exceeds b's and stays ahead through 2100."""
    for year in range(1950, 2101):
        if year in a and year in b and a[year] > b[year]:
            if all(a.get(y, 0) > b.get(y, float("inf")) for y in range(year, 2101, 5)):
                return year
    return None


def load_indicators():
    """Median age and total fertility per country, from WPP indicators."""
    ages = defaultdict(dict)
    tfr = {}
    with gzip.open(RAW_DIR / "WPP2024_Demographic_Indicators_Medium.csv.gz",
                   "rt", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            iso3 = row["ISO3_code"]
            if not iso3:
                continue
            year = int(row["Time"])
            if year not in (2025, 2100):
                continue
            try:
                ages[iso3][year] = float(row["MedianAgePop"])
            except ValueError:
                pass
            if year == 2025:
                try:
                    tfr[iso3] = float(row["TFR"])
                except ValueError:
                    pass
    return ages, tfr


def build_countries(med, ages, tfr):
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
    labels = []
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
        age = ages.get(iso3, {})
        if age.get(2025):
            props["medAge25"] = round(age[2025], 1)
        if age.get(2100):
            props["medAge100"] = round(age[2100], 1)
        if tfr.get(iso3):
            props["tfr"] = round(tfr[iso3], 2)
        if iso3 in LABELED:
            # Label the biggest polygon's representative point so names land
            # on the mainland, not a centroid out at sea or on an island.
            biggest = max(getattr(geom, "geoms", [geom]), key=lambda g: g.area)
            pt = biggest.representative_point()
            labels.append([iso3, LABELED[iso3], round(pt.x, 2), round(pt.y, 2)])
        features.append({"geometry": mapping(simplified), "properties": props})
    write_geojson(DATA_DIR / "countries.geojson", features, ndigits=3)
    return labels


def main():
    med, band, regions, names = load_wpp()

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
        "africaBand": {var.lower(): [[y, round(vals[y], 1)] for y in years5 if y in vals]
                       for var, vals in band.items()},
    }
    ages, tfr = load_indicators()
    out["labels"] = build_countries(med, ages, tfr)
    write_json(DATA_DIR / "population.json", out)

    for c in crossovers:
        print(f"  {c['aName']} passes {c['bName']} in {c['year']}")


if __name__ == "__main__":
    main()
