"""The Century of Africa as a 9:16 short (TikTok / Reels / Shorts), no audio.

Same look as my-osrm's drive-time reels: dark map, title on top, a big
counter underneath, a progress bar and the credits, all inside Instagram's
safe zone. One file serves all three apps. Everything is drawn from the
GeoJSON in ../data, so the video and the web story can't disagree.

    python video/short.py                  # -> video/out/century_of_africa.mp4
    python video/short.py --stills 2,15,25,35,46,56
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
BOX = (30, 400, 1050, 1300)                # map box; reels keep UI clear of it
TITLE_Y = 236
HUD_Y = 1325
FPS = 30
SS = 2                                     # map supersampling
DURATION = 58.0
FADE = 0.35                                # text cross-fade, seconds

WATER = (13, 17, 23)
LAND = (33, 38, 48)
AFRICA = (48, 55, 68)
EDGE = (13, 17, 23)
INK = (236, 239, 244)
MUTED = (150, 158, 172)
ROAD = (150, 156, 168)

# The reel ramp (deep violet -> teal), and an amber one for electricity.
RAMP = [(60, 40, 130), (72, 80, 210), (60, 140, 245), (35, 185, 225), (30, 215, 185), (160, 235, 140)]
AMBER = [(52, 40, 34), (110, 70, 30), (180, 110, 30), (235, 170, 40), (255, 225, 110)]
EPOCH_COLORS = {1975: "#6e5f46", 1990: "#8a713f", 2000: "#a98738",
                2010: "#c99e33", 2020: "#e8b52e", 2030: "#ffd84d"}

LABEL_CITIES = {"Al-Qahirah (Cairo)": "Cairo", "Lagos": "Lagos", "Kinshasa": "Kinshasa",
                "Luanda": "Luanda", "Dar es Salaam": "Dar es Salaam",
                "Ādīs Ᾱbeba (Addis Ababa)": "Addis Ababa", "Johannesburg": "Johannesburg",
                "Al-Kharṭūm (Khartoum)": "Khartoum", "Abidjan": "Abidjan"}
LEFT = {"Abidjan", "Luanda", "Kinshasa"}

FONT_DIRS = [Path("C:/Windows/Fonts"), Path("/usr/share/fonts/opentype/inter"),
             Path("/usr/share/fonts/truetype/dejavu")]
FONTS = {  # role: candidates, Windows (as in my-osrm) first, then Inter, then DejaVu
    "title": ["segoeuib.ttf", "Inter-Bold.otf", "DejaVuSans-Bold.ttf"],
    "body": ["segoeui.ttf", "Inter-Regular.otf", "DejaVuSans.ttf"],
    "label": ["segoeuib.ttf", "Inter-SemiBold.otf", "DejaVuSans-Bold.ttf"],
    "clock": ["bahnschrift.ttf", "InterDisplay-Medium.otf", "DejaVuSans.ttf"],
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


def lerp_color(ramp, t):
    t = min(max(t, 0.0), 1.0) * (len(ramp) - 1)
    i = min(int(t), len(ramp) - 2)
    f = t - i
    return tuple(int(a + (b - a) * f) for a, b in zip(ramp[i], ramp[i + 1]))


def mix(a, b, f):
    f = min(max(f, 0.0), 1.0)
    return tuple(int(x + (y - x) * f) for x, y in zip(a, b))


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def interp(series: dict[int, float], year: float) -> float | None:
    ys = sorted(y for y, v in series.items() if v is not None)
    if not ys or year < ys[0]:
        return None
    return float(np.interp(year, ys, [series[y] for y in ys]))


# ---------------------------------------------------------------- data

def load():
    countries = json.loads((DATA / "countries.geojson").read_text(encoding="utf-8"))["features"]
    pop = json.loads((DATA / "population.json").read_text(encoding="utf-8"))
    cities = json.loads((DATA / "cities.geojson").read_text(encoding="utf-8"))["features"]
    built = json.loads((DATA / "kinshasa-builtup.geojson").read_text(encoding="utf-8"))["features"]
    water = json.loads((DATA / "kinshasa-water.geojson").read_text(encoding="utf-8"))["features"]
    roads = json.loads((DATA / "kinshasa-roads.geojson").read_text(encoding="utf-8"))["features"]
    elec = json.loads((DATA / "services-trend.json").read_text(encoding="utf-8"))["series"]["elec"]

    shapes = []
    for f in countries:
        lon_c, lat_c = _centroid(f["geometry"])
        if not (-35 <= lon_c <= 75 and -45 <= lat_c <= 50):   # near side of the globe only
            continue
        p = f["properties"]
        series = pop["countries"].get(p.get("iso3"), {}).get("series", [])
        shapes.append({"rings": rings(f["geometry"]), "africa": bool(p.get("africa")),
                       "pop": dict(series), "age": p.get("medAge25"), "elec": p.get("elec")})
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
    kin = next(f["properties"] for f in cities if f["properties"]["name"] == "Kinshasa")
    kin_pop = {int(k[1:]): v for k, v in kin.items() if k.startswith("p") and k[1:].isdigit()}

    regions = {k: dict(v) for k, v in pop["regions"].items()}
    return {
        "shapes": shapes, "cities": city_list, "kin_pop": kin_pop, "regions": regions,
        "built": sorted(((f["properties"]["epoch"], rings(f["geometry"])) for f in built), reverse=True),
        "water": [r for f in water for r in rings(f["geometry"])],
        "roads": [l for f in roads for l in lines(f["geometry"])],
        "elec": {e["year"]: e["withoutM"] for e in elec},
    }


def _centroid(geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    pts = np.vstack([np.asarray(p[0]) for p in polys])
    return float(pts[:, 0].mean()), float(pts[:, 1].mean())


# ---------------------------------------------------------------- scenes

# (start, end, chapter, title, subtitle, caption)
SCENES = [
    (0.0, 12.0, 0, "Africa triples this century.",
     "Countries shaded by population, 2025 to 2100.",
     "UN World Population Prospects 2024, medium variant."),
    (12.0, 19.0, 0, "And it's already locked in.",
     "Median age by country. The parents of 2050 are already born.",
     "Birth rates are falling everywhere. Momentum carries the growth anyway."),
    (19.0, 31.0, 1, "Where the people land.",
     "Every African city that reaches a million people by 2050.",
     "UN World Urbanization Prospects 2025."),
    (31.0, 38.0, 2, "The power isn't keeping up.",
     "Share of people with electricity at home.",
     "Access rose from 38% to 59% since 2000. The number without still grew."),
    (38.0, 50.0, 3, "Kinshasa, seen from space.",
     "Built ground by decade, on streets drawn for a city of one million.",
     "Built-up area: EU Global Human Settlement Layer. Roads: OpenStreetMap."),
    (50.0, DURATION, 3, "The people are arithmetic.",
     "Whether the power, water and roads arrive is a decision.",
     "2100 city figure: Hoornweg & Pope projection."),
]
CHAPTERS = ["Population", "Cities", "Power", "Kinshasa"]


def scene_at(s):
    for i, sc in enumerate(SCENES):
        if s < sc[1]:
            return i
    return len(SCENES) - 1


def text_alpha(s, i):
    a, b = SCENES[i][0], SCENES[i][1]
    fin = 1.0 if i == 0 else min(1.0, (s - a) / FADE)
    fout = 1.0 if i == len(SCENES) - 1 else min(1.0, (b - s) / FADE)
    return max(0.0, min(fin, fout))


def country_color(shp, s):
    """Choropleth per scene; colours cross-fade over 0.8 s at scene changes."""
    def scene_color(i):
        if not shp["africa"]:
            return LAND
        if i == 0:
            v = interp(shp["pop"], 2025 + 75 * ease((s - 1.0) / 9.0))
            return lerp_color(RAMP, math.log(v) / math.log(400)) if v else AFRICA
        if i == 1:
            return lerp_color(RAMP, (40 - shp["age"]) / 25) if shp["age"] else AFRICA
        if i == 3:
            return lerp_color(AMBER, shp["elec"] / 100) if shp["elec"] is not None else AFRICA
        if i == 5:
            v = shp["pop"].get(2100)
            return lerp_color(RAMP, math.log(v) / math.log(400)) if v else AFRICA
        return AFRICA
    i = scene_at(s)
    c = scene_color(i)
    if i > 0 and s - SCENES[i][0] < 0.8:
        c = mix(scene_color(i - 1), c, (s - SCENES[i][0]) / 0.8)
    return c


LEGENDS = {0: (RAMP, "1 M people", "400 M"), 1: (RAMP, "older (40)", "younger (15)"),
           3: (AMBER, "0% with power", "100%"), 5: (RAMP, "1 M people", "400 M")}


def legend(d, s, F, a):
    i = scene_at(s)
    if i not in LEGENDS:
        return
    ramp, lo, hi = LEGENDS[i]
    x0, y0, w = BOX[0] + 14, BOX[3] - 52, 260
    for k in range(w):
        d.line((x0 + k, y0, x0 + k, y0 + 12), fill=mix(WATER, lerp_color(ramp, k / (w - 1)), a))
    d.text((x0, y0 + 18), lo, font=F["small"], fill=mix(WATER, MUTED, a))
    d.text((x0 + w - d.textlength(hi, font=F["small"]), y0 + 18), hi, font=F["small"], fill=mix(WATER, MUTED, a))


def hud(D, s):
    """Big counter and the muted line beside it."""
    i = scene_at(s)
    a = SCENES[i][0]
    if i == 0:
        y = 2025 + 75 * ease((s - 1.0) / 9.0)
        afr, wld = interp(D["regions"]["Africa"], y), interp(D["regions"]["World"], y)
        return f"{int(round(y))}", f"{afr / 1000:.2f} B people · {afr / wld:.0%} of humanity"
    if i == 1:
        return "15.6", "median age in Niger. Japan: 49.8"
    if i == 2:
        y = 1975 + 75 * ease((s - a - 0.8) / 9.5)
        n = sum(1 for c in D["cities"] if (interp(c["pop"], y) or 0) >= 1)
        return f"{int(round(y))}", f"{n} cities over 1 million"
    if i == 3:
        y = 2000 + 22 * ease((s - a - 0.6) / 4.5)
        return f"{interp(D['elec'], y):.0f} M", f"Africans without power, {int(round(y))}"
    if i == 4:
        y = kin_year(s)
        return f"{int(round(y))}", f"Kinshasa: {interp(D['kin_pop'], y):.1f} million people"
    return "84 M", "Kinshasa in 2100. About Germany today."


def kin_year(s):
    return 1975 + 55 * ease((s - 42.5) / 6.5)


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
        col = AFRICA if close and shp["africa"] else country_color(shp, s)
        for r in shp["rings"]:
            if len(r) > 2:
                d.polygon(px(r), fill=col, outline=EDGE, width=max(1, SS))

    if close:                                       # Kinshasa layers
        f = min(1.0, (2000 - wkm) / 1500)
        year = kin_year(s) if s < 50 else 2030
        for epoch, rs in D["built"]:                # newest first: 1975 ends on top
            k = 1.0 if epoch == 1975 else (year - (epoch - 6)) / 6
            if k <= 0:
                continue
            col = mix(AFRICA, hexrgb(EPOCH_COLORS[epoch]), min(k, 1.0) * f)
            for r in rs:
                if len(r) > 2:
                    d.polygon(px(r), fill=col)
        for r in D["water"]:
            if len(r) > 2:
                d.polygon(px(r), fill=WATER)
        for ln in D["roads"]:
            d.line(px(ln), fill=mix(AFRICA, ROAD, f), width=2 * SS)

    i = scene_at(s)
    if i == 2 or (i == 3 and s < 31.8):
        year = 1975 + 75 * ease((s - 19.8) / 9.5)
        fade = 1.0 if i == 2 else 1 - (s - 31.0) / 0.8
        for c in sorted(D["cities"], key=lambda c: -(interp(c["pop"], year) or 0)):
            p = interp(c["pop"], year)
            if not p:
                continue
            (x, y), = px([(c["x"], c["y"])])
            r = math.sqrt(p) * 5.2 * SS
            d.ellipse((x - r, y - r, x + r, y + r), fill=mix(AFRICA, (30, 215, 185), 0.85 * fade),
                      outline=mix(AFRICA, WATER, fade), width=SS)
    return img.resize((bw, bh), Image.LANCZOS), px, scale


def render(D, s, cam, F):
    canvas = Image.new("RGB", (W, H), WATER)
    m, px, scale = draw_map(D, s, cam)
    canvas.paste(m, BOX[:2])
    d = ImageDraw.Draw(canvas)
    i = scene_at(s)
    a = text_alpha(s, i)
    ink, muted = mix(WATER, INK, a), mix(WATER, MUTED, a)
    _, title, sub, cap = SCENES[i][2:]

    # Title + subtitle
    d.text((40, TITLE_Y), title, font=F["title"], fill=ink)
    for k, line in enumerate(wrap(sub, F["sub"], W - 80)):
        d.text((42, TITLE_Y + 66 + 36 * k), line, font=F["sub"], fill=muted)

    # Map labels (unsupersampled coordinates)
    def label(x, y, text, left=False, col=INK):
        x, y = x / SS + BOX[0], y / SS + BOX[1]
        if not (BOX[0] < x < BOX[2] and BOX[1] < y < BOX[3]):
            return
        c = mix(WATER, col, a)
        d.ellipse((x - 4, y - 4, x + 4, y + 4), fill=c, outline=WATER)
        tw = d.textlength(text, font=F["label"])
        tx = x - 12 - tw if left else x + 12
        d.text((tx, y - 14), text, font=F["label"], fill=c, stroke_width=3, stroke_fill=WATER)

    if i == 2:
        year = 1975 + 75 * ease((s - 19.8) / 9.5)
        for c in D["cities"]:
            p = interp(c["pop"], year)
            if c["name"] and p and p >= 2:
                (x, y), = px([(c["x"], c["y"])])
                label(x, y, f"{c['name']} {p:.1f} M", c["name"] in LEFT)
    if i in (4, 5) and cam.at(s)[2] < 400:
        for name, lon, lat, left in (("Kinshasa", 15.307, -4.322, False),
                                     ("Brazzaville", 15.283, -4.266, True)):
            (x, y), = px([laea(lon, lat)])
            label(x, y, name, left)
    if i == 5 and cam.at(s)[2] > 3000:
        (x, y), = px([laea(15.3276, -4.3869)])
        label(x, y, "Kinshasa", True)

    legend(d, s, F, a)

    # HUD
    big, small = hud(D, s)
    d.text((40, HUD_Y), big, font=F["clock"], fill=ink)
    d.text((40 + d.textlength(big, font=F["clock"]) + 28, HUD_Y + 42), small, font=F["clock2"], fill=muted)

    # Chapter bar: four segments, marker = progress through the video
    bar_y, x0, x1 = HUD_Y + 128, 40, W - 40
    seg = (x1 - x0) / len(CHAPTERS)
    ch = SCENES[i][2]
    for k, name in enumerate(CHAPTERS):
        col = lerp_color(RAMP, k / 3) if k <= ch else (40, 46, 58)
        d.rectangle((x0 + k * seg + 1, bar_y, x0 + (k + 1) * seg - 1, bar_y + 16), fill=col)
        d.text((x0 + k * seg + 2, bar_y + 22), name, font=F["small"], fill=INK if k == ch else MUTED)
    mx = x0 + (x1 - x0) * min(s / DURATION, 1)
    d.polygon([(mx - 8, bar_y - 12), (mx + 8, bar_y - 12), (mx, bar_y - 2)], fill=INK)

    for k, line in enumerate(wrap(cap, F["small"], W - 80)):
        d.text((40, bar_y + 56 + 28 * k), line, font=F["small"], fill=muted)
    d.text((40, bar_y + 122), "Full story: mapzimus.com/lab/african-urbanization",
           font=F["small"], fill=MUTED)
    d.text((40, bar_y + 150), "Map data: Natural Earth, © OpenStreetMap contributors.",
           font=F["small"], fill=MUTED)
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", help="comma-separated seconds: write PNGs only")
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    D = load()
    F = {"title": font("title", 52), "sub": font("body", 28), "label": font("label", 21),
         "small": font("body", 19), "clock": font("clock", 92), "clock2": font("clock", 38)}

    # Whole continent fitted to the box; Kinshasa close-up ~90 km wide.
    bw, bh = BOX[2] - BOX[0], BOX[3] - BOX[1]
    # Mainland + Madagascar only: the far islands (Cabo Verde, Mauritius...) shrank the frame.
    pts = np.vstack([np.vstack(s["rings"]) for s in D["shapes"] if s["africa"]])
    lo_x, lo_y = laea(-18.0, -35.0)
    hi_x, hi_y = laea(51.5, 37.5)
    pts = pts[(pts[:, 0] > lo_x - 300) & (pts[:, 0] < hi_x + 300) & (pts[:, 1] > lo_y - 300) & (pts[:, 1] < hi_y + 300)]
    ax, ay = pts.T
    full = ((ax.max() + ax.min()) / 2, (ay.max() + ay.min()) / 2,
            max(ax.max() - ax.min(), (ay.max() - ay.min()) * bw / bh) * 1.04)
    kx, ky = laea(15.36, -4.36)
    kin = (float(kx), float(ky), 90.0)
    cam = Camera([(0, full), (38.6, full), (42.4, kin), (50.2, kin), (52.8, full), (DURATION, full)])

    if args.stills:
        for t in (float(v) for v in args.stills.split(",")):
            render(D, t, cam, F).save(OUT / f"still_{t:04.1f}s.png")
            print("still", t)
        return

    mp4 = OUT / "century_of_africa.mp4"
    ff = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow",
        "-movflags", "+faststart", str(mp4)], stdin=subprocess.PIPE)
    n = int(DURATION * FPS)
    for f in range(n):
        ff.stdin.write(render(D, f / FPS, cam, F).tobytes())
        if f % 150 == 0:
            print(f"  frame {f}/{n}", flush=True)
    ff.stdin.close()
    ff.wait()
    print("wrote", mp4)


if __name__ == "__main__":
    main()
