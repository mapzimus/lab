// Shared Playwright rig: opens Orbit to Street with a virtual clock so every frame is
// rendered on demand, swaps the stylised Earth for satellite imagery (see fetch_imagery.py),
// exposes the camera as window.__rig, and hides the UI. The live site is untouched:
// everything here is patched into app.js as it is served to the headless browser.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire(import.meta.url)("/opt/node22/lib/node_modules/playwright");

const CACHE = fileURLToPath(new URL("./cache/", import.meta.url));
export const W = 720, H = 1280, DPR = 1; // upscaled to 1080 x 1920 by ffmpeg

// 1:30 pm EDT, 23 Oct 2026: autumn sun with long shadows, Boston in daylight
export const SIM_START = Date.UTC(2026, 9, 23, 17, 30);

const CLOCK = `
(() => {
  let vt = 0, id = 0; const cbs = new Map();
  window.requestAnimationFrame = cb => { cbs.set(++id, cb); return id; };
  window.cancelAnimationFrame = i => cbs.delete(i);
  performance.now = () => vt;
  Date.now = () => ${SIM_START} + vt;
  window.__tick = ms => { vt += ms; const l = [...cbs.values()]; cbs.clear(); for (const cb of l) cb(vt); };
})();`;

const HIDE = `
#sheet, #dock, .ladder, nav, #caption, #tip, #labels, .zoom, .ctrl, .rail, header, footer { display: none !important; }
#cap {
  position: fixed; left: 0; right: 0; top: 200px; z-index: 50; text-align: center;
  font: 800 56px/1.15 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;
  padding: 0 50px; text-shadow: 0 2px 4px #000, 0 0 22px rgba(0,0,0,.9); letter-spacing: -0.01em;
}
#cap small { display: block; margin-top: 16px; font-weight: 600; font-size: 27px; color: #d6dce6; }
#altbig {
  position: fixed; left: 0; right: 0; bottom: 280px; z-index: 50; text-align: center;
  font: 700 28px/1 ui-monospace, Menlo, monospace; color: #eef2f8; text-shadow: 0 1px 3px #000, 0 0 12px #000;
}
#credit { position: fixed; left: 0; right: 0; bottom: 200px; z-index: 50; text-align: center;
  font: 500 13px/1.3 system-ui, sans-serif; color: rgba(255,255,255,.55); padding: 0 40px; }
`;

const META = JSON.parse(readFileSync(CACHE + "meta.json", "utf8"));

// [find, replace] pairs applied to app.js; each find must occur exactly once
const PATCHES = [
  // imagery textures, loaded alongside the generated masks
  // the regional patch grows from southern New England to the whole Northeast (fetch_imagery.NE_BOX)
  ["const REG = { lonA: -73.6, lonB: -68.6, latA: 40.4, latB: 44.2 };",
   `const IMG_G = new THREE.TextureLoader().load("/__img/globe8k.jpg"), IMG_R = new THREE.TextureLoader().load("/__img/northeast.jpg");
for (const t of [IMG_G, IMG_R]) { t.anisotropy = 8; }
IMG_R.wrapS = IMG_R.wrapT = THREE.ClampToEdgeWrapping;
const REG = { lonA: -80, lonB: -62, latA: 36, latB: 48 };`],
  // ...and takes over from the globe texture much higher up, so the globe's 5 km pixels are never magnified
  ["patch.visible = alt < 1.1e6;", "patch.visible = alt < 8e6;"],
  ["1 - smooth(6e5, 1.05e6, alt)", "1 - smooth(4.5e6, 7.5e6, alt)"],
  // cities (and their imagery planes) switch on from 1,500 km so the 160 km layer can fade in early
  ["C.on = alt < 1.8e5 && camera.position.distanceTo(C.origin) < 7e5;", "C.on = alt < 1.5e6 && camera.position.distanceTo(C.origin) < 3e6;"],
  ["uRegionOn: { value: region ? 1 : 0 }, uAlpha: { value: 1 },",
   "uRegionOn: { value: region ? 1 : 0 }, uAlpha: { value: 1 }, uImg: { value: region ? IMG_R : IMG_G },"],
  ["uniform sampler2D uMask, uLights, uPop;", "uniform sampler2D uMask, uLights, uPop, uImg;"],
  ["col += vec3(0.55, 0.2, 0.06) * tw * 0.18;", ""],
  ["vec3 col = base * (uAmb + uSunI * diff);", "vec3 col = base * (uAmb * 0.2 + uSunI * diff);"],
  ["vec3 base = mix(uOcean, landC, land);", "vec3 base = pow(texture2D(uImg, muv).rgb, vec3(2.2)) * 1.25;"],
  // no bars, no drawn lines: just the planet
  ["bars.visible = barFade > 0.01;", "bars.visible = false;"],
  ["gratLines.visible = coastLines.visible = borderLines.visible = lineFade > 0.01;", "gratLines.visible = coastLines.visible = borderLines.visible = false;"],
  // expose the rig, and swap each city's drawn ground for aerial imagery
  ["function worldTarget(out)", `
function addImagery(C, key, y, order, feather) {
  const [x0, x1, z0, z1] = ${JSON.stringify(META)}[key].rect;
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const tex = new THREE.TextureLoader().load("/__img/" + key + ".jpg"); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
  const fc = document.createElement("canvas"); fc.width = fc.height = 256; const fg = fc.getContext("2d");
  const fd = fg.createImageData(256, 256);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const e = Math.min(i, 255 - i, j, 255 - j) / feather; const v = Math.min(1, e) ** 1.5 * 255, o = (j * 256 + i) * 4; fd.data[o] = fd.data[o + 1] = fd.data[o + 2] = v; fd.data[o + 3] = 255; }
  fg.putImageData(fd, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaMap: new THREE.CanvasTexture(fc), transparent: true, roughness: 1, metalness: 0, depthWrite: false });
  const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.renderOrder = order;
  C.group.add(mesh);
  return mat;
}
const IMG = {};
for (const C of CITIES) {
  for (const m of [...C.group.children]) if ([groundMat, parkMat, waterMat, roadMat, pathMat].includes(m.material)) m.visible = false;
  IMG[C.name.toLowerCase()] = addImagery(C, C.name.toLowerCase(), -0.2, 3, 40);
}
IMG.metro = addImagery(BOSTON, "metro", -0.6, 2, 70);
IMG.state = addImagery(BOSTON, "state", -1.0, 1, 60);
window.__rig = { view, goal, flyTo, setRange, backBay, airliner, HOME, D2R, RE, rangeFor, toGeoXZ, cityGeo, BOSTON, LYNN,
  PLACES, setSim, IMG, get alt() { return alt; }, get flying() { return !!flight; }, stop() { flight = null; } };
function worldTarget(out)`],
];

export async function open({ base = "http://localhost:8765" } = {}) {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  page.on("pageerror", e => console.error("pageerror:", e.message));
  page.on("console", m => { if (m.type() === "error") console.error("console:", m.text()); });
  await page.addInitScript(CLOCK);
  await page.route("**/__img/*", route => {
    const f = route.request().url().split("/__img/")[1];
    route.fulfill({ body: readFileSync(CACHE + f), contentType: "image/jpeg" });
  });
  await page.route("**/orbit-to-street/app.js", async route => {
    const r = await route.fetch();
    let body = await r.text();
    for (const [a, b] of PATCHES) {
      if (body.split(a).length !== 2) throw new Error("patch point not unique/missing: " + a);
      body = body.replace(a, () => b);
    }
    await route.fulfill({ response: r, body });
  });
  await page.goto(base + "/lab/orbit-to-street/");
  await page.addStyleTag({ content: HIDE });
  await page.evaluate(() => {
    for (const id of ["cap", "altbig", "credit"]) { const d = document.createElement("div"); d.id = id; document.body.append(d); }
  });
  for (let i = 0; i < 90 && !(await page.evaluate(() => !!window.__rig)); i++) { await page.waitForTimeout(2000); if (i % 5 == 0) console.error("loading:", await page.evaluate(() => (document.getElementById("ld-msg") || {}).textContent)); }
  if (!(await page.evaluate(() => !!window.__rig))) throw new Error("scene never came up");
  await page.evaluate(() => dispatchEvent(new Event("resize")));
  // let the textures upload
  await page.waitForTimeout(1500);
  return { browser, page };
}
