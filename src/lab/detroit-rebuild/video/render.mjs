// Detroit, torn down and built back, as a 65 s 9:16 short (TikTok / Reels / Shorts), no audio.
// scene.html draws the page's hex grid as 3D columns over a dark basemap; this script serves it
// with its data to headless Chromium and records it frame by frame.
//
//   node src/lab/detroit-rebuild/video/render.mjs                    # -> video/out/detroit_master.mp4
//   node src/lab/detroit-rebuild/video/render.mjs --peek 3,20,45     # single frames
//   node src/lab/detroit-rebuild/video/render.mjs --range 40,50      # a short clip -> video/out/preview.mp4
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("/opt/node22/lib/node_modules/playwright");

const FPS = 30, DUR = 65, VW = 720, VH = 1280;
const HERE = fileURLToPath(new URL("./", import.meta.url));
const OUT = HERE + "out/";
const args = process.argv.slice(2);
const range = args.includes("--range") ? args[args.indexOf("--range") + 1].split(",").map(Number) : [0, DUR];
const outName = args.includes("--range") ? "preview.mp4" : "detroit_master.mp4";
const peek = args.includes("--peek") ? args[args.indexOf("--peek") + 1].split(",").map(Number) : null;

const FILES = {
  "scene.html": [HERE + "scene.html", "text/html"],
  "maplibre-gl.js": [HERE + "../vendor/maplibre-gl.js", "text/javascript"],
  "maplibre-gl.css": [HERE + "../vendor/maplibre-gl.css", "text/css"],
  "detroit-grid.geojson": [HERE + "../data/detroit-grid.geojson", "application/json"],
  "detroit-boundary.geojson": [HERE + "../data/detroit-boundary.geojson", "application/json"],
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
page.on("pageerror", e => console.error("pageerror:", e.message));
page.on("console", m => { if (m.type() === "error") console.error("console:", m.text()); });
await page.route("http://scene.local/**", route => {
  const f = FILES[new URL(route.request().url()).pathname.slice(1)];
  if (!f) return route.fulfill({ status: 404, body: "" });
  route.fulfill({ body: readFileSync(f[0]), contentType: f[1] });
});
await page.goto("http://scene.local/scene.html");
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 300000 });
const err = await page.evaluate(() => window.__error);
if (err) throw new Error(err);

const frame = t => page.evaluate(t => __scene.frame(t), t);
mkdirSync(OUT, { recursive: true });
if (peek) {
  for (const t of peek) {
    await frame(t);
    await page.screenshot({ path: `${OUT}peek_${t}.jpg`, type: "jpeg", quality: 90, timeout: 180000 });
    console.log("peek", t);
  }
} else {
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-vf", "scale=1080:1920:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    OUT + outName], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let f = Math.round(range[0] * FPS); f < range[1] * FPS; f++) {
    await frame(f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 94, timeout: 180000 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (f % 150 === 0) console.log(`frame ${f}/${DUR * FPS}  ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  console.log("wrote", OUT + outName);
}
await browser.close();
