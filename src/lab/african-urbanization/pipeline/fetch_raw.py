"""Download every raw input the pipeline expects.

The numbered scripts read fixed filenames out of RAW_DIR. This fetches all of
them from their public homes so the pipeline can be rerun from nothing:

    python3 fetch_raw.py            # into ./raw
    AFRICAN_URBANIZATION_RAW=/tmp/raw python3 fetch_raw.py

Files already present are left alone, so a failed run can be resumed. About
1.5 GB in total, most of it the six GHSL built-up tiles.

Sources and licences are listed in the page footer and the project README.
"""

import sys

import requests

from common import RAW_DIR

GHSL = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL"
NE = "https://naciscdn.org/naturalearth"
UN_WPP = "https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES"

FILES = {}

# Natural Earth: country polygons, rail and roads (public domain).
FILES["ne_50m_admin_0_countries.zip"] = f"{NE}/50m/cultural/ne_50m_admin_0_countries.zip"
for name in ("ne_10m_railroads", "ne_10m_roads", "ne_10m_populated_places"):
    FILES[f"{name}.zip"] = f"{NE}/10m/cultural/{name}.zip"

# UN World Population Prospects 2024 (CC BY 3.0 IGO).
FILES["WPP2024_TotalPopulationBySex.csv.gz"] = f"{UN_WPP}/WPP2024_TotalPopulationBySex.csv.gz"
FILES["WPP2024_Demographic_Indicators_Medium.csv.gz"] = (
    f"{UN_WPP}/WPP2024_Demographic_Indicators_Medium.csv.gz")

# UN World Urbanization Prospects 2025 city database (CC BY 3.0 IGO).
FILES["WUP2025-cities.csv.gz"] = ("https://population.un.org/wup/assets/Download/Cities/"
                                  "WUP2025-DB-DEGURBA-Cities-Population-Surface-Data.csv.gz")

# JRC Global Human Settlement Layer, tile R10_C20 covers Kinshasa (CC BY 4.0).
for epoch in (1975, 1990, 2000, 2010, 2020, 2030):
    stem = f"GHS_BUILT_S_E{epoch}_GLOBE_R2023A_4326_3ss"
    FILES[f"{stem}_V1_0_R10_C20.zip"] = (
        f"{GHSL}/GHS_BUILT_S_GLOBE_R2023A/{stem}/V1-0/tiles/{stem}_V1_0_R10_C20.zip")
for epoch in (1975, 2025):
    stem = f"GHS_POP_E{epoch}_GLOBE_R2023A_4326_3ss"
    FILES[f"{stem}_V1_0_R10_C20.zip"] = (
        f"{GHSL}/GHS_POP_GLOBE_R2023A/{stem}/V1-0/tiles/{stem}_V1_0_R10_C20.zip")

# Harmonized DMSP/VIIRS nighttime lights, 2020 layer (Li et al., CC BY 4.0).
FILES["Harmonized_DN_NTL_2020_simVIIRS.tif"] = "https://ndownloader.figshare.com/files/57065297"

# Copernicus DEM GLO-30 (ESA, free and open licence). Four 1-degree tiles cover
# the Kinshasa window; 09_kinshasa_terrain.py mosaics them and derives slope.
COP_DEM = "https://copernicus-dem-30m.s3.amazonaws.com"
for tile in ("S05_00_E014", "S05_00_E015", "S04_00_E014", "S04_00_E015"):
    stem = f"Copernicus_DSM_COG_10_{tile}_00_DEM"
    FILES[f"{stem}.tif"] = f"{COP_DEM}/{stem}/{stem}.tif"


def download(name, url):
    target = RAW_DIR / name
    if target.exists() and target.stat().st_size > 0:
        print(f"  have {name}")
        return True
    print(f"  get  {name}", flush=True)
    try:
        with requests.get(url, stream=True, timeout=600) as r:
            r.raise_for_status()
            tmp = target.with_suffix(target.suffix + ".part")
            with open(tmp, "wb") as fh:
                for chunk in r.iter_content(1 << 20):
                    fh.write(chunk)
            tmp.rename(target)
    except requests.RequestException as e:
        print(f"       failed: {e}")
        return False
    return True


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    print(f"raw directory: {RAW_DIR}")
    failed = [name for name, url in FILES.items() if not download(name, url)]
    if failed:
        print(f"\n{len(failed)} file(s) failed: {', '.join(failed)}")
        print("Rerun to retry; files already downloaded are skipped.")
        return 1
    print(f"\nall {len(FILES)} raw inputs present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
