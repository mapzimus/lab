// The Population Relief Globe as a 65 s 9:16 short (TikTok / Reels / Shorts), no audio.
// Records the live page headlessly with a virtual clock and a scripted camera; every caption
// is a number read from the page's own data (GHS-POP 2025), checked in the notes below.
//
//   python3 -m http.server 8765 --directory src          # from the repo root, in another shell
//   node src/lab/population-globe/video/render.mjs        # -> video/out/population_globe_master.mp4
//   node src/lab/population-globe/video/render.mjs --stills 3,20,40
//
// Caption facts, from data/density.json and data/countries.json at 0.25°:
//   total 8,191,988,517; half of it lives in the densest cells covering 2.1% of land (140.6 M km²);
//   52% of land is under 1 person/km²; densest cell 24.88N 67.12E (Karachi), 23,545/km²;
//   China: half of 1,412 M in its densest cells covering 5.3% of its area;
//   USA: half of 341.2 M on 2.0% of its area.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("/opt/node22/lib/node_modules/playwright");

const FPS = 30, DUR = 65, VW = 720, VH = 1280;
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const args = process.argv.slice(2);
const stills = args.includes("--stills") ? args[args.indexOf("--stills") + 1].split(",").map(Number) : null;

// t (s), point under the camera, distance from the globe centre (globe radius 100), tilt toward the horizon (deg)
const KEYS = [
  { t: 0, lat: 22, lon: 70, dist: 720, tilt: 0 },
  { t: 7, lat: 24, lon: 62, dist: 700, tilt: 0 },
  { t: 14, lat: 24, lon: 74, dist: 420, tilt: 8 },
  { t: 21, lat: 25, lon: 70, dist: 260, tilt: 30 },
  { t: 27, lat: 24.2, lon: 67.6, dist: 190, tilt: 42 },
  { t: 33, lat: 33, lon: 98, dist: 420, tilt: 15 },
  { t: 39, lat: 31, lon: 111, dist: 330, tilt: 30 },
  // east across the Pacific (longitude kept continuous past 180 so the path doesn't swing back over Asia)
  { t: 45, lat: 38, lon: 200, dist: 620, tilt: 10 },
  { t: 51, lat: 37, lon: 263, dist: 340, tilt: 25 },
  { t: 58, lat: 28, lon: 278, dist: 720, tilt: 0 },
  { t: 65, lat: 25, lon: 290, dist: 740, tilt: 0 },
];

// [start, end, line, small line]
const CAPS = [
  [0.4, 7.0, "8.2 billion people", "Each bar: one 28 km square"],
  [7.0, 14.0, "Half of them live on 2% of the land"],
  [14.0, 21.0, "South Asia"],
  [21.0, 29.5, "Karachi", "23,500 people per km², the densest square on Earth"],
  [29.5, 36.0, "China", "1.4 billion people"],
  [36.0, 43.0, "Half of them live on 5% of China's land"],
  [43.0, 49.0, "United States"],
  [49.0, 56.0, "Half of Americans live on 2% of the land"],
  [56.0, 65.0, "Population Relief Globe", "mapzimus.com/lab/population-globe"],
];
const CREDIT = "Data: GHS-POP 2025, European Commission JRC · Borders: Natural Earth";

const CLOCK = `(() => {
  let vt = 0, id = 0; const cbs = new Map();
  window.requestAnimationFrame = cb => { cbs.set(++id, cb); return id; };
  window.cancelAnimationFrame = i => cbs.delete(i);
  performance.now = () => vt;
  window.__tick = ms => { vt += ms; const l = [...cbs.values()]; cbs.clear(); for (const cb of l) cb(vt); };
})();`;
const CSS = `
#sheet, #tip, #labels { display: none !important; }
#cap { position: fixed; left: 0; right: 0; top: 200px; z-index: 50; text-align: center;
  font: 800 56px/1.12 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
  padding: 0 50px; text-shadow: 0 2px 4px #000, 0 0 22px rgba(0,0,0,.9); letter-spacing: -0.01em; }
#cap small { display: block; margin-top: 16px; font-weight: 600; font-size: 27px; color: #d6dce6; }
#credit { position: fixed; left: 0; right: 0; bottom: 200px; z-index: 50; text-align: center;
  font: 500 13px/1.3 system-ui, sans-serif; color: rgba(255,255,255,.55); padding: 0 40px; }`;
const PATCHES = [
  ["controls.update();", "if (!window.__drive) controls.update();"],
  ["tilt += (tiltTarget - tilt)", "if (!window.__drive) tilt += (tiltTarget - tilt)"],
  ["renderer.setAnimationLoop(now => {", "window.__rig = { orbit, toVec, setTilt: v => { tilt = v; }, setSpin };\nrenderer.setAnimationLoop(now => {"],
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
page.on("pageerror", e => console.error("pageerror:", e.message));
await page.addInitScript(CLOCK);
await page.route("**/population-globe/app.js", async route => {
  const r = await route.fetch();
  let body = await r.text();
  for (const [a, b] of PATCHES) {
    if (body.split(a).length !== 2) throw new Error("patch point not unique/missing: " + a);
    body = body.replace(a, () => b);
  }
  await route.fulfill({ response: r, body });
});
await page.goto("http://localhost:8765/lab/population-globe/");
await page.addStyleTag({ content: CSS });
await page.evaluate(() => { for (const id of ["cap", "credit"]) { const d = document.createElement("div"); d.id = id; document.body.append(d); } });
for (let i = 0; i < 120 && !(await page.evaluate(() => !!window.__rig)); i++) await page.waitForTimeout(1000);
await page.evaluate(() => { window.__drive = true; __rig.setSpin(false); dispatchEvent(new Event("resize")); });

const cr = (p0, p1, p2, p3, u) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
function camAt(t) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[Math.max(0, i - 1)], b = KEYS[i], c = KEYS[i + 1], d = KEYS[Math.min(KEYS.length - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (t - b.t) / (c.t - b.t)));
  const f = k => cr(a[k], b[k], c[k], d[k], u);
  return { lat: f("lat"), lon: f("lon"), dist: Math.exp(cr(...[a, b, c, d].map(k => Math.log(k.dist)), u)), tilt: Math.max(0, f("tilt")) };
}
async function frame(t) {
  const cam = camAt(t);
  const cap = CAPS.find(c => t >= c[0] && t < c[1]);
  const capOp = cap ? Math.min(1, (t - cap[0]) / 0.25, (cap[1] - t) / 0.25) : 0;
  await page.evaluate(({ cam, cap, capOp, credit, dt }) => {
    __rig.toVec(cam.lat, cam.lon, cam.dist, __rig.orbit.position);
    __rig.setTilt(cam.tilt);
    __tick(dt);
    const el = document.getElementById("cap");
    const html = cap ? cap[2] + (cap[3] ? `<small>${cap[3]}</small>` : "") : "";
    if (el.innerHTML !== html) el.innerHTML = html;
    el.style.opacity = capOp;
    document.getElementById("credit").textContent = credit;
  }, { cam, cap, capOp, credit: CREDIT, dt: 1000 / FPS });
}

mkdirSync(OUT, { recursive: true });
if (stills) {
  let f = 0;
  for (const s of stills) {
    for (; f <= s * FPS; f++) { await frame(f / FPS); if (f % 5 === 0) await page.screenshot({ type: "jpeg", quality: 30, timeout: 180000 }); }
    await page.screenshot({ path: `${OUT}still_${s}.jpg`, type: "jpeg", quality: 90, timeout: 180000 });
    console.log("still", s);
  }
} else {
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-vf", "scale=1080:1920:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    OUT + "population_globe_master.mp4"], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let f = 0; f < DUR * FPS; f++) {
    await frame(f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 94, timeout: 180000 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (f % 150 === 0) console.log(`frame ${f}/${DUR * FPS}  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  console.log("wrote", OUT + "population_globe_master.mp4");
}
await browser.close();
