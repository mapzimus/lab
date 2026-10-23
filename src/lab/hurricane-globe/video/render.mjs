// The Hurricane Globe as a 65 s 9:16 short (TikTok / Reels / Shorts), no audio.
// Records the live page headlessly with a virtual clock and a scripted camera, driving the page's own
// season and storm playback. Every caption is read from data/storms.json (NOAA HURDAT2):
//   3,250 storms 1851-2025; 2020 Atlantic: 30 storms reached 34 kt (the most in the record);
//   Melissa 2025 (AL132025) 165 kt, tied with Allen 1980 for the highest Atlantic wind;
//   Patricia 2015 (EP202015) 185 kt and 872 mb, the highest wind and lowest pressure in the record.
//
//   python3 -m http.server 8765 --directory src          # from the repo root, in another shell
//   node src/lab/hurricane-globe/video/render.mjs         # -> video/out/hurricane_globe_master.mp4
//   node src/lab/hurricane-globe/video/render.mjs --peek 5,20,38
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("/opt/node22/lib/node_modules/playwright");

const FPS = 30, DUR = 65, VW = 720, VH = 1280;
const OUT = fileURLToPath(new URL("./out/", import.meta.url));
const args = process.argv.slice(2);
const peek = args.includes("--peek") ? args[args.indexOf("--peek") + 1].split(",").map(Number) : null;

// camera: point on the globe under the view (lat, lon), distance from the centre (globe radius 1),
// tilt toward the horizon (deg, looking north). Catmull-Rom between keys, distance in log space.
const KEYS = [
  { t: 0, lat: 26, lon: -62, dist: 3.4, tilt: 0 },
  { t: 7, lat: 24, lon: -68, dist: 3.0, tilt: 0 },
  { t: 12, lat: 20, lon: -70, dist: 2.3, tilt: 32 },
  { t: 20, lat: 22, lon: -66, dist: 2.3, tilt: 28 },
  { t: 28, lat: 23, lon: -66, dist: 2.2, tilt: 22 },
  { t: 33, lat: 20, lon: -72, dist: 1.75, tilt: 35 },
  { t: 43, lat: 27, lon: -66, dist: 1.85, tilt: 32 },
  { t: 47, lat: 13, lon: -101, dist: 1.55, tilt: 38 },
  { t: 56, lat: 15, lon: -101, dist: 1.5, tilt: 40 },
  { t: 65, lat: 22, lon: -84, dist: 3.2, tilt: 0 },
];

// [start, end, line, small line]
const CAPS = [
  [0.4, 7.0, "Every hurricane since 1851", "3,250 storms, NOAA records"],
  [7.0, 13.0, "Height = wind speed"],
  [13.5, 29.5, "2020", "30 named storms, a record"],
  [30.5, 44.0, "Melissa, 2025", "165 kt (190 mph), tied for the strongest Atlantic winds"],
  [45.5, 57.5, "Patricia, 2015", "185 kt (213 mph), the strongest winds on record"],
  [58.0, 65.0, "Hurricane Globe", "mapzimus.com/lab/hurricane-globe"],
];
const CREDIT = "Data: NOAA National Hurricane Center, HURDAT2 best tracks (Atlantic 1851–2025, Eastern Pacific 1949–2025)";

// page actions at fixed times: [t, action, arg]
const ACTIONS = [
  [0, "extrude", false],
  [7.5, "extrude", true],
  [13.3, "season", { year: 2020, basin: "AL", hours: 5034, secs: 15.5 }],
  [30.0, "storm", { id: "AL132025", secs: 13 }],
  [45.0, "storm", { id: "EP202015", secs: 11 }],
  [57.5, "all", null],
];

const CLOCK = `(() => {
  let vt = 0, id = 0; const cbs = new Map();
  window.requestAnimationFrame = cb => { cbs.set(++id, cb); return id; };
  window.cancelAnimationFrame = i => cbs.delete(i);
  performance.now = () => vt;
  window.__tick = ms => { vt += ms; const l = [...cbs.values()]; cbs.clear(); for (const cb of l) cb(vt); };
})();`;
const CSS = `
#panel, #info, #player, #tip, #loading { display: none !important; }
#cap { position: fixed; left: 0; right: 0; top: 200px; z-index: 50; text-align: center;
  font: 800 56px/1.12 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
  padding: 0 50px; text-shadow: 0 2px 4px #000, 0 0 22px rgba(0,0,0,.9); letter-spacing: -0.01em; }
#cap small { display: block; margin-top: 16px; font-weight: 600; font-size: 27px; color: #d6dce6; }
#hud { position: fixed; left: 0; right: 0; bottom: 260px; z-index: 50; text-align: center; color: #eef2f8;
  font: 700 25px/1.5 ui-monospace, Menlo, monospace; text-shadow: 0 1px 3px #000, 0 0 12px #000; }
#credit { position: fixed; left: 0; right: 0; bottom: 200px; z-index: 50; text-align: center;
  font: 500 13px/1.3 system-ui, sans-serif; color: rgba(255,255,255,.6); padding: 0 40px; }`;
const PATCHES = [
  ["if (!fly) return;", "if (!fly || window.__drive) return;"],
  ["  controls.update();\n  stepPlayback", "  if (!window.__drive) controls.update();\n  stepPlayback"],
  ["p.t + dt * +$('speed').value * HOUR", "p.t + dt * (window.__speed || +$('speed').value) * HOUR"],
  ["const clock = new THREE.Clock();", `window.__h = { camera, select, startPlayback, stopPlayback, refresh,
  get storms() { return storms; }, get state() { return state; } };
const clock = new THREE.Clock();`],
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
page.on("pageerror", e => console.error("pageerror:", e.message));
await page.addInitScript(CLOCK);
await page.route("**/hurricane-globe/app.js", async route => {
  const r = await route.fetch();
  let body = await r.text();
  for (const [a, b] of PATCHES) {
    if (body.split(a).length !== 2) throw new Error("patch point not unique/missing: " + a);
    body = body.replace(a, () => b);
  }
  await route.fulfill({ response: r, body });
});
await page.goto("http://localhost:8765/lab/hurricane-globe/");
await page.addStyleTag({ content: CSS });
await page.evaluate(() => { for (const id of ["cap", "hud", "credit"]) { const d = document.createElement("div"); d.id = id; document.body.append(d); } });
for (let i = 0; i < 120 && !(await page.evaluate(() => !!(window.__h && window.__h.storms))); i++) await page.waitForTimeout(1000);
await page.evaluate(() => { window.__drive = true; __tick(16); });

// ---------- camera ----------
const D2R = Math.PI / 180;
const toVec = (lat, lon, r) => { const a = lat * D2R, b = lon * D2R; return [r * Math.cos(a) * Math.sin(b), r * Math.sin(a), r * Math.cos(a) * Math.cos(b)]; };
const cr = (p0, p1, p2, p3, u) => 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
function camAt(t) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[Math.max(0, i - 1)], b = KEYS[i], c = KEYS[i + 1], d = KEYS[Math.min(KEYS.length - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (t - b.t) / (c.t - b.t)));
  const f = k => cr(a[k], b[k], c[k], d[k], u);
  const lat = f("lat"), lon = f("lon"), dist = Math.exp(cr(...[a, b, c, d].map(k => Math.log(k.dist)), u)), tilt = Math.max(0, f("tilt")) * D2R;
  // target on the surface, camera pulled back along the normal and tipped south so it looks north over it
  const n = toVec(lat, lon, 1), north = [-Math.sin(lat * D2R) * Math.sin(lon * D2R), Math.cos(lat * D2R), -Math.sin(lat * D2R) * Math.cos(lon * D2R)];
  const h = dist - 1;
  const pos = n.map((v, k) => v + n[k] * h * Math.cos(tilt) - north[k] * h * Math.sin(tilt));
  const up = n.map((v, k) => north[k] * Math.cos(tilt) + n[k] * Math.sin(tilt));
  return { pos, look: n, up };
}

// ---------- frames ----------
let next = 0;
async function frame(t) {
  while (next < ACTIONS.length && ACTIONS[next][0] <= t) {
    const [, kind, arg] = ACTIONS[next++];
    await page.evaluate(([kind, arg]) => {
      const h = __h, box = document.getElementById("extrude");
      if (kind === "extrude") { box.checked = arg; box.dispatchEvent(new Event("change")); }
      if (kind === "season") {
        h.stopPlayback(); h.select(null);
        window.__speed = arg.hours / arg.secs;
        h.startPlayback(h.storms.filter(s => s.year === arg.year && s.basin === arg.basin), `${arg.year} season`);
      }
      if (kind === "storm") {
        const s = h.storms.find(x => x.id === arg.id);
        h.stopPlayback(); h.select(s);
        window.__speed = (s.end - s.t0) / 36e5 / arg.secs;
        h.startPlayback([s], s.name);
      }
      if (kind === "all") { h.stopPlayback(); h.select(null); h.refresh(); }
    }, [kind, arg]);
  }
  const cam = camAt(t);
  const cap = CAPS.find(c => t >= c[0] && t < c[1]);
  const capOp = cap ? Math.min(1, (t - cap[0]) / 0.25, (cap[1] - t) / 0.25) : 0;
  await page.evaluate(({ cam, cap, capOp, credit, dt }) => {
    const c = __h.camera;
    c.position.set(...cam.pos); c.up.set(...cam.up); c.lookAt(...cam.look);
    __tick(dt);
    const el = document.getElementById("cap");
    const html = cap ? cap[2] + (cap[3] ? `<small>${cap[3]}</small>` : "") : "";
    if (el.innerHTML !== html) el.innerHTML = html;
    el.style.opacity = capOp;
    // playback readout from the page's own player: date, and counts or wind
    const p = __h.state.play, hud = document.getElementById("hud");
    hud.innerHTML = p ? `${document.getElementById("pdate").textContent.replace(/^.*? · /, "")}<br>${document.getElementById("pstats").textContent}` : "";
    document.getElementById("credit").textContent = credit;
  }, { cam, cap, capOp, credit: CREDIT, dt: 1000 / FPS });
}

mkdirSync(OUT, { recursive: true });
if (peek) {
  let f = 0;
  for (const s of peek) {
    // run the clock up to each peek (cheaply: screenshots only every 15 frames keep the GPU queue short)
    for (; f <= s * FPS; f++) { await frame(f / FPS); if (f % 15 === 0) await page.screenshot({ type: "jpeg", quality: 20, timeout: 180000 }); }
    await page.screenshot({ path: `${OUT}peek_${s}.jpg`, type: "jpeg", quality: 90, timeout: 180000 });
    console.log("peek", s);
  }
} else {
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-vf", "scale=1080:1920:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    OUT + "hurricane_globe_master.mp4"], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let f = 0; f < DUR * FPS; f++) {
    await frame(f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 94, timeout: 180000 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (f % 150 === 0) console.log(`frame ${f}/${DUR * FPS}  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  console.log("wrote", OUT + "hurricane_globe_master.mp4");
}
await browser.close();
