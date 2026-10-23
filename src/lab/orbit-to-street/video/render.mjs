// Orbit to Street as a 65 s 9:16 short (TikTok / Reels / Shorts), no audio.
// A real-imagery Earth (see fetch_imagery.py and rig.mjs), one camera move from orbit
// to Back Bay rooftops, a live altimeter, one sentence on screen at a time.
//
//   python3 -m http.server 8765 --directory src     # from the repo root, in another shell
//   python3 src/lab/orbit-to-street/video/fetch_imagery.py
//   node src/lab/orbit-to-street/video/render.mjs                 # -> video/out/orbit_to_street.mp4
//   node src/lab/orbit-to-street/video/render.mjs --dry           # altitude every second, no frames
//   node src/lab/orbit-to-street/video/render.mjs --stills 3,20,40
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { open } from "./rig.mjs";

const FPS = 30, DUR = 65;
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const stills = args.includes("--stills") ? args[args.indexOf("--stills") + 1].split(",").map(Number) : null;

// Camera keyframes: t (s), ground point (lat, lon, or city x/z in metres), range (m), heading and tilt (deg).
// Interpolated with Catmull-Rom, range in log space, so the camera never stops between keys.
const KEYS = [
  { t: 0, lat: 22, lon: -42, range: 2.6e7, hd: 0, tilt: 0 },
  { t: 9, lat: 34, lon: -60, range: 1.3e7, hd: 0, tilt: 0 },
  { t: 18, lat: 41.6, lon: -70.6, range: 1.6e6, hd: 0, tilt: 8 },
  { t: 26, x: 0, z: -800, range: 1.6e5, hd: 0, tilt: 30 },
  { t: 33, x: -300, z: -200, range: 2.6e4, hd: 15, tilt: 52 },
  { t: 41, x: -900, z: 150, range: 5000, hd: 40, tilt: 60 },
  { t: 49, x: -1050, z: 250, range: 1900, hd: 58, tilt: 63 },
  { t: 57, x: -1050, z: 250, range: 1500, hd: 110, tilt: 64 },
  { t: 65, x: -1050, z: 250, range: 1700, hd: 165, tilt: 62 },
];

// [start, end, sentence, small line]
const CAPS = [
  [0.4, 4.6, "Let's fall from space to one street in Boston."],
  [4.6, 10.4, "No cartoon map. Every pixel is a real satellite photo."],
  [10.4, 16.6, "The sun is already setting on Europe and Africa."],
  [16.6, 23.4, "That hook is Cape Cod. Boston is just above it."],
  [23.4, 30.4, "Below the Space Station, below the clouds…"],
  [30.4, 37.4, "Now the buildings rise, each one at its real height.", "15,116 of them, from OpenStreetMap"],
  [37.4, 45.0, "This is Back Bay."],
  [45.0, 53.0, "The shadows are from the real sun: 1:30 pm, late October."],
  [53.0, 65.0, "From space to the rooftops.<br>One scene. No cuts.", "mapzimus.com/lab/orbit-to-street"],
];
const CREDIT = "Imagery: Sentinel-2 cloudless by EOX (Copernicus Sentinel data 2020) · Esri, Maxar, Earthstar Geographics · Buildings © OpenStreetMap contributors";

const { browser, page } = await open();

// resolve city-frame keys to lat/lon once
for (const k of KEYS) if (k.x !== undefined) Object.assign(k, await page.evaluate(([x, z]) => { const g = __rig.toGeoXZ(x, z, 0); return { lat: g.lat, lon: g.lon }; }, [k.x, k.z]));

const cr = (p0, p1, p2, p3, u) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
function camAt(t) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[Math.max(0, i - 1)], b = KEYS[i], c = KEYS[i + 1], d = KEYS[Math.min(KEYS.length - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (t - b.t) / (c.t - b.t)));
  const f = k => cr(a[k], b[k], c[k], d[k], u);
  const D2R = Math.PI / 180;
  return {
    lat: f("lat"), lon: f("lon"), h: 0,
    range: Math.exp(cr(Math.log(a.range), Math.log(b.range), Math.log(c.range), Math.log(d.range), u)),
    heading: f("hd") * D2R, tilt: Math.max(0, f("tilt")) * D2R,
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fmtAlt = m => m >= 1e4 ? Math.round(m / 1000).toLocaleString("en-US") + " km" : m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m).toLocaleString("en-US") + " m";

async function frame(t) {
  const cam = camAt(t);
  const cap = CAPS.find(c => t >= c[0] && t < c[1]);
  const capOp = cap ? Math.min(1, (t - cap[0]) / 0.25, (cap[1] - t) / 0.25) : 0;
  return page.evaluate(({ cam, cap, capOp, credit, dt }) => {
    const r = __rig;
    r.stop();
    Object.assign(r.view, cam); Object.assign(r.goal, cam);
    __tick(dt);
    const a = r.alt;
    const sm = (a0, b0, x) => { const q = Math.min(1, Math.max(0, (x - a0) / (b0 - a0))); return q * q * (3 - 2 * q); };
    r.IMG.metro.opacity = sm(1.6e5, 6e4, a);
    r.IMG.boston.opacity = r.IMG.lynn.opacity = sm(3.5e4, 1.2e4, a);
    const el = document.getElementById("cap");
    const html = cap ? cap[2] + (cap[3] ? `<small>${cap[3]}</small>` : "") : "";
    if (el.innerHTML !== html) el.innerHTML = html;
    el.style.opacity = capOp;
    document.getElementById("credit").textContent = credit;
    return a;
  }, { cam, cap, capOp, credit: CREDIT, dt: 1000 / FPS });
}
const setAlt = (a, t) => page.evaluate(([s, op]) => { const e = document.getElementById("altbig"); e.textContent = s; e.style.opacity = op; }, ["ALTITUDE  " + fmtAlt(a), t < 53 ? 1 : Math.max(0, 1 - (t - 53) / 0.5)]);

mkdirSync(OUT, { recursive: true });
if (dry) {
  for (let f = 0; f <= DUR * FPS; f++) { const t = f / FPS, a = await frame(t); if (f % FPS === 0) console.log(t.toFixed(0) + "s", fmtAlt(a)); }
} else if (stills) {
  // run the clock up to each still so the bars/ease state matches the video
  let f = 0;
  for (const s of stills) {
    let a; for (; f <= s * FPS; f++) a = await frame(f / FPS);
    await setAlt(a, s);
    await page.screenshot({ path: `${OUT}still_${s}.jpg`, type: "jpeg", quality: 90, timeout: 180000 });
    console.log("still", s, fmtAlt(a));
  }
} else {
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-vf", "scale=1080:1920:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    OUT + "orbit_to_street.mp4"], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let f = 0; f < DUR * FPS; f++) {
    const t = f / FPS, a = await frame(t);
    await setAlt(a, t);
    const buf = await page.screenshot({ type: "jpeg", quality: 94, timeout: 180000 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (f % 60 === 0) console.log(`frame ${f}/${DUR * FPS}  t=${t.toFixed(1)}s  ${fmtAlt(a)}  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  console.log("wrote", OUT + "orbit_to_street.mp4");
}
await browser.close();
