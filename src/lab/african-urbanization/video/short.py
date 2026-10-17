"""The Century of Africa as a 9:16 short (TikTok / Reels / Shorts), no audio.

One sentence on screen at a time, right under the map, so the eye never has
to choose between the picture and the words. Each scene uses one colour for
one meaning (blue = people, green = half under 18, orange = no power), and
the sentence names it. Those three were checked with the dataviz skill's
validator (all pairs, dark mode, against WATER): CVD and contrast pass.
Everything is drawn from the GeoJSON in ../data.

    python video/short.py                  # -> video/out/century_of_africa.mp4
    python video/short.py --short          # -> video/out/century_of_africa_short.mp4 (58.8 s)
    python video/short.py --stills 1,6,19,31,44,58,70
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
OUT = HERE / "out"

W, H = 1080, 1920
BOX = (0, 250, 1080, 1190)                 # full-width map; reel UI stays clear
TEXT_Y = 1222                              # the one place to read
FPS = 30
SS = 2                                     # map supersampling
FADE = 0.3                                 # sentence cross-fade, seconds

WATER = (13, 17, 23)
LAND = (30, 35, 44)
AFRICA = (54, 61, 74)
INK = (240, 239, 236)
MUTED = (150, 158, 172)
OLD_CITY = (128, 134, 146)
PERSON_OFF = (52, 58, 70)
ROW_Y = 470                                # top of the row of ten, map-box pixels
ROAD_DIM = (96, 104, 118)

BLUE = (0x39, 0x87, 0xE5)                  # people (dark-mode slot 1)
ORANGE = (0xD9, 0x59, 0x26)                # no electricity (slot 2)
GREEN = (0x19, 0x9E, 0x70)                 # half under 18 (slot 3)

TOP_COUNTRIES = {"NGA": "Nigeria", "ETH": "Ethiopia", "EGY": "Egypt", "COD": "DR Congo", "TZA": "Tanzania"}
LABEL_CITIES = {"Al-Qahirah (Cairo)": "Cairo", "Lagos": "Lagos", "Kinshasa": "Kinshasa",
                "Luanda": "Luanda", "Dar es Salaam": "Dar es Salaam"}

# (start, end, sentence). The last entry is the end card.
BEATS = [
    (0.0, 3.6, "1 in 5 people on Earth lives in Africa."),
    (3.6, 9.4, "By 2100, it will be more than 1 in 3."),
    (9.4, 13.6, "Nigeria alone will pass the USA around 2057."),
    (13.6, 17.6, "Why is everyone so sure? The parents of 2050 are already born."),
    (17.6, 21.8, "In the green countries, half of all people are under 18."),
    (21.8, 25.2, "So the growth is coming. Where will everyone live?"),
    (25.2, 29.8, "In 1975, just 6 African cities had over a million people."),
    (29.8, 33.6, "Today, 88 do."),
    (33.6, 38.2, "By 2050, 129 cities."),
    (38.2, 42.2, "Cities need power. In the orange countries, most people have none at home."),
    (42.2, 46.6, "Good news: since 2000, Africans with power went from 4 in 10 to 6 in 10."),
    (46.6, 51.0, "Bad news: there are so many more people that 600 million still have none. More than in 2000."),
    (51.0, 55.4, "Clean water, same story: 7 in 10 have it now, but 429 million still don't."),
    (55.4, 59.0, "Let's zoom in on one city: Kinshasa."),
    (59.0, 62.6, "Gray is what was built by 1975. Kinshasa had about 1 million people."),
    (62.6, 66.4, "Blue is everything built since. By 2000: 5 million."),
    (66.4, 70.2, "By 2020: 10 million people."),
    (70.2, 74.0, "The main roads are still mostly the ones built for 1 million."),
    (74.0, 77.8, "By 2100, Kinshasa could have 84 million people."),
    (77.8, 82.0, "The people are coming either way. Power, water and roads are a choice."),
    (82.0, 86.0, None),
]
DURATION = BEATS[-1][1]

# The under-a-minute cut (--short): stretches of the full timeline played back
# to back, cut where a sentence changes. Drops Nigeria, the median-age pair,
# the orange map and the share-rising line, the roads line, and part of the
# end card. 59.4 s.
SHORT = [(0.0, 9.4), (22.4, 38.2), (46.6, 70.2), (74.0, 84.6)]
SHORT_TEXT = {21.8: "Where will everyone live?",   # their setup lines are cut
              46.6: "Power is spreading, but people arrive faster. 600 million Africans still have none."}


def source_time(t, segments):
    """Output seconds -> seconds on the full timeline."""
    for a, b in segments:
        if t < b - a:
            return a + t
        t -= b - a
    return segments[-1][1]

FONT_DIRS = [Path("C:/Windows/Fonts"), Path("/usr/share/fonts/opentype/inter"),
             Path("/usr/share/fonts/truetype/dejavu")]
FONTS = {  # role: candidates, Windows (as in my-osrm) first, then Inter, then DejaVu
    "bold": ["segoeuib.ttf", "Inter-Bold.otf", "DejaVuSans-Bold.ttf"],
    "body": ["segoeui.ttf", "Inter-Regular.otf", "DejaVuSans.ttf"],
    "label": ["segoeuib.ttf", "Inter-SemiBold.otf", "DejaVuSans-Bold.ttf"],
    "clock": ["bahnschrift.ttf", "InterDisplay-SemiBold.otf", "DejaVuSans-Bold.ttf"],
}


def font(role: str, size: int) -> ImageFont.FreeTypeFont:
    for name in FONTS[role]:
        for d in FONT_DIRS:
            if (d / name).exists():
                return ImageFont.truetype(str(d / name), size)
    return ImageFont.load_default(size)


# ---------------------------------------------------------------- geometry

LON0, LAT0 = math.radians(17.0), math.radians(2.0)


def laea(lon, lat):
    """Lambert azimuthal equal-area centred on Africa, km."""
    lam, phi = np.radians(lon) - LON0, np.radians(lat)
    k = np.sqrt(2 / (1 + math.sin(LAT0) * np.sin(phi) + math.cos(LAT0) * np.cos(phi) * np.cos(lam)))
    x = k * np.cos(phi) * np.sin(lam)
    y = k * (math.cos(LAT0) * np.sin(phi) - math.sin(LAT0) * np.cos(phi) * np.cos(lam))
    return x * 6371.0, y * 6371.0


def rings(geom) -> list[np.ndarray]:
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    out = []
    for poly in polys:
        for ring in poly:
            a = np.asarray(ring, dtype=float)
            x, y = laea(a[:, 0], a[:, 1])
            out.append(np.column_stack([x, y]))
    return out


def lines(geom) -> list[np.ndarray]:
    parts = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
    return [np.column_stack(laea(np.asarray(p)[:, 0], np.asarray(p)[:, 1])) for p in parts]


class Camera:
    """(centre x, centre y, width) in km; keyframes eased per segment, zoom in log-width."""

    def __init__(self, keys):
        self.keys = keys

    def at(self, s):
        k = self.keys
        if s <= k[0][0]:
            return k[0][1]
        for (s0, v0), (s1, v1) in zip(k, k[1:]):
            if s <= s1:
                u = ease((s - s0) / (s1 - s0))
                w = math.exp(math.log(v0[2]) + (math.log(v1[2]) - math.log(v0[2])) * u)
                # Pan in step with the width, not the clock, so a zoom target
                # stays put on screen instead of sliding in late from a corner.
                f = u if v0[2] == v1[2] else (w - v0[2]) / (v1[2] - v0[2])
                return v0[0] + (v1[0] - v0[0]) * f, v0[1] + (v1[1] - v0[1]) * f, w
        return k[-1][1]


def ease(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def keyed(keys, s):
    """Value from (seconds, value) keyframes, eased per segment, held at the ends."""
    if s <= keys[0][0]:
        return keys[0][1]
    for (s0, v0), (s1, v1) in zip(keys, keys[1:]):
        if s <= s1:
            return v0 + (v1 - v0) * ease((s - s0) / (s1 - s0))
    return keys[-1][1]


def window(s, a, b, f=0.6):
    """0 -> 1 over f seconds after a, back to 0 over f seconds before b."""
    return max(0.0, min(1.0, (s - a) / f, (b - s) / f))


def mix(a, b, f):
    f = min(max(f, 0.0), 1.0)
    return tuple(int(x + (y - x) * f) for x, y in zip(a, b))


def interp(series: dict[int, float], year: float) -> float | None:
    ys = sorted(y for y, v in series.items() if v is not None)
    if not ys or year < ys[0]:
        return None
    return float(np.interp(year, ys, [series[y] for y in ys]))


# ---------------------------------------------------------------- timeline

POP_YEAR = [(3.8, 2026), (8.6, 2100)]                 # 2026 = "today"
CITY_YEAR = [(25.2, 1975), (28.4, 1975), (30.0, 2026), (33.4, 2026), (35.2, 2050)]
KIN_YEAR = [(62.6, 1975), (64.0, 2000), (66.4, 2000), (67.8, 2020)]
SHARE_YEAR = [(42.8, 2000), (45.6, 2022)]          # "4 in 10 to 6 in 10"
COUNT_YEAR = [(47.0, 2000), (49.6, 2022)]                   # re-run per beat, from 2000


def show_pop(s):
    return window(s, 0.0, 14.2, 0.4)


def show_young(s):
    return window(s, 14.0, 22.4, 0.8)


def show_cities(s):
    return window(s, 25.2, 38.6)


def show_power(s):
    return window(s, 38.6, 42.8, 0.8)


def show_people(s):
    """The row of ten people (power, then water)."""
    return window(s, 42.2, 55.6, 0.5)


def services(D, s):
    """(kind, people with it out of 10, millions without, year) for the row of ten."""
    if s < 46.6:
        y = keyed(SHARE_YEAR, s)
        return "power", interp(D["svc"]["elec"]["pct"], y) / 10, None, y
    kind = "power" if s < 51.0 else "water"
    y = keyed(COUNT_YEAR, s if kind == "power" else s - 4.0)
    ser = D["svc"][{"power": "elec", "water": "water"}[kind]]
    return kind, interp(ser["pct"], y) / 10, interp(ser["without"], y), y


D_GLOBAL = None                            # set in main(); year_label reads the series


def year_label(s):
    """The year drawn on the map while something is moving through time."""
    if 3.6 <= s < 13.6:
        return int(round(keyed(POP_YEAR, s))), window(s, 3.6, 13.6, 0.3)
    if 42.2 <= s < 55.4:
        return int(round(services(D_GLOBAL, s)[3])), window(s, 42.2, 55.4, 0.3)
    if 25.2 <= s < 38.2:
        return int(round(keyed(CITY_YEAR, s))), window(s, 25.2, 38.2, 0.3)
    if 59.0 <= s < 70.2:
        return int(round(keyed(KIN_YEAR, s))), window(s, 59.0, 70.2, 0.3)
    return None, 0.0


# ---------------------------------------------------------------- data

def load():
    countries = json.loads((DATA / "countries.geojson").read_text(encoding="utf-8"))["features"]
    pop = json.loads((DATA / "population.json").read_text(encoding="utf-8"))
    cities = json.loads((DATA / "cities.geojson").read_text(encoding="utf-8"))["features"]
    built = json.loads((DATA / "kinshasa-builtup.geojson").read_text(encoding="utf-8"))["features"]
    water = json.loads((DATA / "kinshasa-water.geojson").read_text(encoding="utf-8"))["features"]
    roads = json.loads((DATA / "kinshasa-roads.geojson").read_text(encoding="utf-8"))["features"]
    trend = json.loads((DATA / "services-trend.json").read_text(encoding="utf-8"))["series"]

    shapes = []
    for f in countries:
        lon_c, lat_c = _anchor(f["geometry"])
        if not (-35 <= lon_c <= 75 and -45 <= lat_c <= 50):   # near side of the globe only
            continue
        p = f["properties"]
        ax, ay = laea(lon_c, lat_c)
        shapes.append({"iso": p.get("iso3"), "rings": rings(f["geometry"]), "africa": bool(p.get("africa")),
                       "pop": dict(pop["countries"].get(p.get("iso3"), {}).get("series", [])),
                       "young": (p.get("medAge25") or 99) < 18,
                       "dark": p.get("elec") is not None and p["elec"] < 50,
                       "x": float(ax), "y": float(ay)})
    for s in shapes:
        allpts = np.vstack(s["rings"])
        s["bbox"] = (*allpts.min(0), *allpts.max(0))

    city_list = []
    for f in cities:
        p = f["properties"]
        x, y = laea(*f["geometry"]["coordinates"])
        city_list.append({"name": LABEL_CITIES.get(p["name"]), "x": float(x), "y": float(y),
                          "pop": {int(k[1:]): v for k, v in p.items()
                                  if k.startswith("p") and k[1:].isdigit() and int(k[1:]) <= 2050}})
    return {
        "shapes": shapes, "cities": city_list,
        "built": sorted(((f["properties"]["epoch"], rings(f["geometry"])) for f in built), reverse=True),
        "water": [r for f in water for r in rings(f["geometry"])],
        "roads": [ln for f in roads for ln in lines(f["geometry"])],
        "svc": {k: {"pct": {e["year"]: e["accessPct"] for e in trend[k]},
               "without": {e["year"]: e["withoutM"] for e in trend[k]}} for k in ("elec", "water")},
    }


def _anchor(geom):
    """Mean of the largest polygon's outer ring: keeps circles off islands."""
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    ring = np.asarray(max(polys, key=lambda p: len(p[0]))[0])
    return float(ring[:, 0].mean()), float(ring[:, 1].mean())


# ---------------------------------------------------------------- drawing

def wrap(text, fnt, max_w):
    out, cur = [], ""
    for w in text.split():
        t = f"{cur} {w}".strip()
        if cur and fnt.getlength(t) > max_w:
            out.append(cur)
            cur = w
        else:
            cur = t
    return out + [cur]


def country_fill(shp, s, close):
    if not shp["africa"]:
        return LAND
    if close:
        return AFRICA
    col = AFRICA
    if shp["young"]:
        col = mix(col, GREEN, show_young(s))
    if shp["dark"]:
        col = mix(col, ORANGE, show_power(s))
    return col


def draw_map(D, s, cam):
    bw, bh = BOX[2] - BOX[0], BOX[3] - BOX[1]
    img = Image.new("RGB", (bw * SS, bh * SS), WATER)
    d = ImageDraw.Draw(img)
    cx, cy, wkm = cam.at(s)
    scale = bw * SS / wkm
    hkm = wkm * bh / bw

    def px(a):
        return [(float((x - cx) * scale + bw * SS / 2), float((cy - y) * scale + bh * SS / 2)) for x, y in a]

    def visible(bb):
        return not (bb[2] < cx - wkm or bb[0] > cx + wkm or bb[3] < cy - hkm or bb[1] > cy + hkm)

    close = wkm < 2000
    for shp in D["shapes"]:
        if not visible(shp["bbox"]):
            continue
        col = country_fill(shp, s, close)
        for r in shp["rings"]:
            if len(r) > 2:
                d.polygon(px(r), fill=col, outline=WATER, width=SS)

    labels = []                                     # (x, y, text, size) in 1x box pixels
    if close:                                       # Kinshasa: gray 1975 city, blue growth since
        f = min(1.0, (2000 - wkm) / 1500)
        year = keyed(KIN_YEAR, s)
        for epoch, rs in D["built"]:                # newest first: 1975 ends on top
            if epoch == 1975:
                col = mix(AFRICA, OLD_CITY, f)
            else:
                k = (year - (epoch - 10)) / 10
                if k <= 0:
                    continue
                col = mix(AFRICA, BLUE, min(k, 1.0) * f)
            for r in rs:
                if len(r) > 2:
                    d.polygon(px(r), fill=col)
        for r in D["water"]:
            if len(r) > 2:
                d.polygon(px(r), fill=WATER)
        hi = window(s, 70.2, 74.2, 0.4)
        for ln in D["roads"]:
            d.line(px(ln), fill=mix(mix(AFRICA, ROAD_DIM, f), INK, hi), width=int((2 + 2 * hi) * SS))
        if wkm < 400:
            for name, lon, lat in (("Kinshasa", 15.31, -4.36), ("Brazzaville", 15.25, -4.24)):
                (x, y), = px([laea(lon, lat)])
                labels.append((x / SS, y / SS, name, 24, f))

    def circle(x, y, r, a):
        d.ellipse((x - r, y - r, x + r, y + r), fill=mix(AFRICA, BLUE, a), outline=WATER, width=2 * SS)

    a = show_pop(s)
    if a > 0 and not close:                         # countries as circles: bigger = more people
        year = keyed(POP_YEAR, s)
        focus = window(s, 9.4, 13.8, 0.4)           # the Nigeria beat dims the rest
        ranked = sorted((sh for sh in D["shapes"] if sh["africa"] and sh["pop"]),
                        key=lambda sh: -sh["pop"].get(2025, 0))
        for rank, sh in enumerate(ranked):
            grow = ease((s - 0.05 * min(rank, 12)) / 0.5)   # staggered pop-in for the hook
            p = interp(sh["pop"], year)
            r = math.sqrt(p) * 3.6 * SS * grow
            if r < 1:
                continue
            (x, y), = px([(sh["x"], sh["y"])])
            dim = 1 - 0.65 * focus if sh["iso"] != "NGA" else 1
            circle(x, y, r, a * dim)
            if sh["iso"] in TOP_COUNTRIES and grow > 0.9:
                la = a * (dim if sh["iso"] != "NGA" else 1)
                labels.append((x / SS, y / SS, f"{TOP_COUNTRIES[sh['iso']]}\n{p:.0f} M", 22, la))

    a = show_cities(s)
    if a > 0 and not close:
        year = keyed(CITY_YEAR, s)
        for c in sorted(D["cities"], key=lambda c: -(interp(c["pop"], year) or 0)):
            p = interp(c["pop"], year)
            if not p or p < 1:
                continue
            (x, y), = px([(c["x"], c["y"])])
            r = math.sqrt(p) * 8.5 * SS
            circle(x, y, r, a)
            if c["name"] and p >= 8:
                labels.append((x / SS + r / SS + 6, y / SS, f"{c['name']} {p:.0f} M", 22, a))
    a = window(s, 76.2, DURATION + 1, 0.8)           # Kinshasa's 2100 size, on the city scale
    if a > 0:
        (x, y), = px([laea(15.3276, -4.3869)])
        r = math.sqrt(83.5) * 8.5 * SS * ease((s - 76.2) / 1.2)
        circle(x, y, r, a)
        labels.append((x / SS + r / SS + 8, y / SS, "Kinshasa 84 M", 22, a))

    a = show_people(s)                              # ten people, bright = has it
    if a > 0:
        img = Image.blend(img, Image.new("RGB", img.size, WATER), 0.78 * a)
        d = ImageDraw.Draw(img)
        _, have, _, _ = services(D, s)
        for i in range(10):
            col = mix(WATER, mix(PERSON_OFF, INK, have - i), a)
            cx_, top = (90 + i * 100) * SS, ROW_Y * SS
            d.ellipse((cx_ - 17 * SS, top, cx_ + 17 * SS, top + 34 * SS), fill=col)
            d.rounded_rectangle((cx_ - 28 * SS, top + 42 * SS, cx_ + 28 * SS, top + 118 * SS),
                                radius=22 * SS, fill=col)
    return img.resize((bw, bh), Image.LANCZOS), labels


def render(D, s, cam, F, overrides=None):
    canvas = Image.new("RGB", (W, H), WATER)
    m, labels = draw_map(D, s, cam)
    canvas.paste(m, BOX[:2])
    d = ImageDraw.Draw(canvas)

    for x, y, text, size, a in labels:              # numbers sit on the places they describe
        if a <= 0:
            continue
        fnt = F["label22"] if size == 22 else F["label24"]
        x, y = x + BOX[0], y + BOX[1]
        anchor = "lm" if "\n" not in text and text not in ("Kinshasa", "Brazzaville") else "mm"
        d.multiline_text((x, y), text, font=fnt, fill=mix(WATER, INK, a), anchor=anchor, align="center",
                         stroke_width=4, stroke_fill=WATER, spacing=2)

    a = show_people(s)
    if a > 0:                                       # captions for the row of ten
        kind, _, without, _ = services(D, s)
        what = "power at home" if kind == "power" else "clean water"
        c, cm = mix(WATER, INK, a), mix(WATER, MUTED, a)
        y0 = BOX[1] + ROW_Y + 150
        d.text((W / 2, y0), f"Each person = 1 in 10 Africans. Bright = has {what}.",
               font=F["label24"], fill=cm, anchor="mt")
        if without is not None:
            d.text((W / 2, BOX[1] + ROW_Y - 150), f"{without:.0f} M", font=F["year"], fill=c, anchor="ms")
            d.text((W / 2, BOX[1] + ROW_Y - 120), f"Africans without {what}", font=F["label24"],
                   fill=cm, anchor="mt")

    year, ya = year_label(s)
    if year:
        d.text((44, BOX[3] - 40), str(year), font=F["year"], fill=mix(WATER, INK, ya), anchor="ls",
               stroke_width=5, stroke_fill=WATER)

    # The one sentence, cross-fading between beats.
    for start, end, text in BEATS:
        text = (overrides or {}).get(start, text)
        if start <= s < end or (end == DURATION and s >= end):
            a = window(s, start, end, FADE) if start > 0 else min(1.0, (end - s) / FADE)
            if end == DURATION:
                a = min(1.0, (s - start) / FADE)
            if text is None:                        # end card
                c, cm = mix(WATER, INK, a), mix(WATER, MUTED, a)
                d.text((44, TEXT_Y), "Full story + sources:", font=F["text"], fill=c)
                d.text((44, TEXT_Y + 72), "mapzimus.com/lab/african-urbanization", font=F["url"], fill=c)
                for k, line in enumerate((
                        "UN World Population Prospects 2024 · UN World Urbanization Prospects 2025",
                        "World Bank · EU Global Human Settlement Layer · Hoornweg & Pope (2100 cities)",
                        "Map data: Natural Earth, © OpenStreetMap contributors")):
                    d.text((44, TEXT_Y + 140 + 30 * k), line, font=F["small"], fill=cm)
            else:
                for k, line in enumerate(wrap(text, F["text"], W - 88)):
                    d.text((44, TEXT_Y + 70 * k), line, font=F["text"], fill=mix(WATER, INK, a))
            break
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", help="comma-separated seconds: write PNGs only")
    ap.add_argument("--short", action="store_true", help="the under-a-minute cut")
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    global D_GLOBAL
    D = D_GLOBAL = load()
    F = {"text": font("bold", 56), "url": font("bold", 40), "small": font("body", 20),
         "label22": font("label", 24), "label24": font("label", 28), "year": font("clock", 120)}

    # Mainland + Madagascar only: the far islands (Cabo Verde, Mauritius...) shrank the frame.
    bw, bh = BOX[2] - BOX[0], BOX[3] - BOX[1]
    pts = np.vstack([np.vstack(s["rings"]) for s in D["shapes"] if s["africa"]])
    lo_x, lo_y = laea(-18.0, -35.0)
    hi_x, hi_y = laea(51.5, 37.5)
    pts = pts[(pts[:, 0] > lo_x - 300) & (pts[:, 0] < hi_x + 300) & (pts[:, 1] > lo_y - 300) & (pts[:, 1] < hi_y + 300)]
    ax, ay = pts.T
    full = ((ax.max() + ax.min()) / 2, (ay.max() + ay.min()) / 2,
            max(ax.max() - ax.min(), (ay.max() - ay.min()) * bw / bh) * 1.04)
    kx, ky = laea(15.36, -4.36)
    kin = (float(kx), float(ky), 90.0)
    cam = Camera([(0, full), (55.6, full), (58.8, kin), (74.2, kin), (77.0, full), (DURATION, full)])

    if args.stills:
        for t in (float(v) for v in args.stills.split(",")):
            render(D, t, cam, F).save(OUT / f"still_{t:04.1f}s.png")
            print("still", t)
        return

    segments = SHORT if args.short else [(0.0, DURATION)]
    overrides = SHORT_TEXT if args.short else None
    mp4 = OUT / ("century_of_africa_short.mp4" if args.short else "century_of_africa.mp4")
    ff = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
        "-movflags", "+faststart", str(mp4)], stdin=subprocess.PIPE)
    n = int(round(sum(b - a for a, b in segments) * FPS))
    for f in range(n):
        ff.stdin.write(render(D, source_time(f / FPS, segments), cam, F, overrides).tobytes())
        if f % 300 == 0:
            print(f"  frame {f}/{n}", flush=True)
    ff.stdin.close()
    ff.wait()
    print("wrote", mp4)


if __name__ == "__main__":
    main()
