"""Recompute the choropleth class breaks, and show why they are not linear.

The chapter 1 maps were first drawn with linear colour ramps stretched across a
global range. On a frame that only shows Africa that produced a continent of
one colour: half of Africa's median ages fall between 15 and 22, which was a
single segment of the old ramp, so Niger at 15.6 and Botswana at 26 came out
indistinguishable.

This runs Fisher-Jenks over the African values for each mapped variable and
prints the breaks, plus how many countries land in each class. The numbers in
app.js are these, rounded, and extended upward where the rest of the world
needs somewhere to sit (Japan's median age of 49.8 has to read as a different
world from Tunisia's 32.9, or chapter 1 loses its contrast).

Nothing here writes to data/. It is a decision record you can rerun: if the UN
revises its projections, run this and see whether the breaks still hold.

Source: data/countries.geojson, as produced by 01_countries_population.py and
extended by 08_services.py.
"""

import json

from common import DATA_DIR

# What app.js actually ships, so the report can be checked against the page.
SHIPPED = {
    "multiple": [1, 1.8, 2.5, 3.1],
    "medAge25": [17.5, 20.5, 27.5, 35, 45],
    "pop2025": [5, 15, 40, 100, 250],
    "elec": [25, 50, 70, 85],
    "elecGain": [0, 10, 25, 40],
}
CLASSES = 5


def jenks(data, k):
    """Fisher-Jenks natural breaks. n is ~55, so the exact DP is cheap."""
    d = sorted(data)
    n = len(d)
    m1 = [[0] * (k + 1) for _ in range(n + 1)]
    m2 = [[float("inf")] * (k + 1) for _ in range(n + 1)]
    for j in range(1, k + 1):
        m1[1][j], m2[1][j] = 1, 0
    var = 0.0
    for l in range(2, n + 1):
        s1 = s2 = w = 0.0
        for m in range(1, l + 1):
            i3 = l - m + 1
            val = d[i3 - 1]
            s2 += val * val
            s1 += val
            w += 1
            var = s2 - (s1 * s1) / w
            if i3 - 1 != 0:
                for j in range(2, k + 1):
                    if m2[l][j] >= var + m2[i3 - 1][j - 1]:
                        m1[l][j] = i3
                        m2[l][j] = var + m2[i3 - 1][j - 1]
        m1[l][1], m2[l][1] = 1, var
    kk, brk = n, [d[-1]]
    for j in range(k, 1, -1):
        brk.append(d[int(m1[kk][j]) - 1])
        kk = int(m1[kk][j]) - 1
    brk.append(d[0])
    return sorted(set(brk))


def spread(values, breaks):
    """How many countries land in each shipped class."""
    counts = [0] * (len(breaks) + 1)
    for v in values:
        i = sum(1 for b in breaks if v >= b)
        counts[i] += 1
    return counts


def main():
    fc = json.load(open(DATA_DIR / "countries.geojson"))
    afr = [f["properties"] for f in fc["features"] if f["properties"].get("africa") == 1]
    world = [f["properties"] for f in fc["features"]]

    for key, shipped in SHIPPED.items():
        vals = [v for p in afr if (v := p.get(key)) is not None]
        if len(vals) < CLASSES + 1:
            print(f"  {key}: too few African values ({len(vals)}), skipped")
            continue
        nat = jenks(vals, CLASSES)
        counts = spread(vals, shipped)
        biggest = max(counts) / len(vals) * 100
        out = [v for p in world
               if p.get("africa") != 1 and (v := p.get(key)) is not None]
        print(f"\n  {key}")
        print(f"    jenks on Africa   {[round(b, 2) for b in nat]}")
        print(f"    shipped breaks    {shipped}")
        print(f"    countries/class   {counts}   (largest class {biggest:.0f}% of Africa)")
        if out:
            print(f"    rest of world     {min(out):.1f} to {max(out):.1f}")
        if biggest > 60:
            print("    WARNING: one class holds most of the continent, which is the "
                  "flat-map failure these breaks exist to avoid")


if __name__ == "__main__":
    main()
