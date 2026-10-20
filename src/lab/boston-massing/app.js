(async () => {
  const [DATA] = await Promise.all([fetch("/lab/boston-massing/data/boston.json").then(r => r.json())]);
(() => {
const B = DATA.buildings;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// footprints in metres; stored as decimetres, z positive = south
for (const b of B) {
  b.pts = [];
  for (let i = 0; i < b.o.length; i += 2) b.pts.push([b.o[i] / 10, b.o[i + 1] / 10]);
  b.base = b.b || 0;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of b.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  b.box = [x0, x1, z0, z1];
}

THREE.ColorManagement.legacyMode = false;
const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 3200, 9000);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 10, 20000);
camera.position.set(-2300, 2400, 1500);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, -1000);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 80;
controls.maxDistance = 6000;
controls.screenSpacePanning = false;

const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x8a8070, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
const SUN_DIR = new THREE.Vector3(-1300, 2000, 1100).normalize().multiplyScalar(3500);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 200; sun.shadow.camera.far = 8000;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
// keep the shadow frustum tight around what the camera looks at, so shadows sharpen as you zoom in
function updateShadow() {
  const s = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.85, 220, 2600);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - s) > 1) { sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.updateProjectionMatrix(); }
  sun.target.position.copy(controls.target).setY(0);
  sun.position.copy(sun.target.position).add(SUN_DIR);
}

const stdMat = (opts) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 1, metalness: 0 }, opts));
const groundMat = stdMat({});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.3;
ground.receiveShadow = true;
scene.add(ground);

function mergeFlat(geos) {
  let n = 0;
  const flat = geos.map(g => { const f = g.index ? g.toNonIndexed() : g; n += f.attributes.position.count; return f; });
  const p = new Float32Array(n * 3); let o = 0;
  for (const f of flat) { p.set(f.attributes.position.array, o * 3); o += f.attributes.position.count; f.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
const ringToVec = (arr) => { const v = []; for (let k = 0; k < arr.length; k += 2) v.push(new THREE.Vector2(arr[k] / 10, -arr[k + 1] / 10)); return v; };
function areaLayer(list, mat, y) {
  const geos = [];
  for (const r of list) {
    const sh = new THREE.Shape(ringToVec(r.o));
    if (r.i) for (const h of r.i) sh.holes.push(new THREE.Path(ringToVec(h)));
    try { geos.push(new THREE.ShapeGeometry(sh)); } catch (e) {}
  }
  const m = new THREE.Mesh(mergeFlat(geos), mat);
  m.geometry.rotateX(-Math.PI / 2);
  m.position.y = y;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}
const parkMat = stdMat({}), waterMat = stdMat({ roughness: 0.25, metalness: 0.1 }), roadMat = stdMat({ roughness: 0.95 }), pathMat = stdMat({});
areaLayer(DATA.parks, parkMat, 0.15);
areaLayer(DATA.water, waterMat, 0.25);
// roads: [width, height above ground, x, z, ...]; bridges carry their deck height
function ribbons(filter, mat, shadow) {
  const p = [];
  for (const r of DATA.roads) {
    if (!filter(r[0], r[1])) continue;
    const w = r[0] / 2, y = r[1];
    for (let k = 2; k + 3 < r.length; k += 2) {
      const x1 = r[k] / 10, z1 = r[k + 1] / 10, x2 = r[k + 2] / 10, z2 = r[k + 3] / 10;
      const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * w, nz = dx / L * w, ex = dx / L * w * 0.5, ez = dz / L * w * 0.5;
      const a = [x1 + nx - ex, z1 + nz - ez], b = [x1 - nx - ex, z1 - nz - ez], c = [x2 - nx + ex, z2 - nz + ez], d = [x2 + nx + ex, z2 + nz + ez];
      p.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], a[0], y, a[1], c[0], y, c[1], d[0], y, d[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(p), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(p.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  const m = new THREE.Mesh(g, mat);
  m.material.side = THREE.DoubleSide;
  m.receiveShadow = true;
  m.castShadow = !!shadow;
  scene.add(m);
}
ribbons((w, y) => w > 2 && y < 2, roadMat);
ribbons((w, y) => w <= 2 && y < 2, pathMat);
ribbons((w, y) => y >= 2, roadMat, true);

// bridge decks: slabs 2.2 m thick at their deck height
const bridgeMat = stdMat({ roughness: 0.85 });
{
  const geos = [];
  for (const b of DATA.bridges) {
    const sh = new THREE.Shape(ringToVec(b.o));
    try {
      const g = new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, b.y - 2.2, 0);
      geos.push(g);
    } catch (e) {}
  }
  const m = new THREE.Mesh(mergeFlat(geos), bridgeMat);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}

// Zakim Bridge: the deck is mapped, the towers and cables are not, so they are built here from its published
// dimensions: two inverted-Y towers (north 90 m, south 82 m) 227 m apart, cables fanned to both deck edges.
const towerMat = stdMat({ roughness: 0.6 }), cableMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75 });
const ZK = DATA.zakim;
if (ZK) {
  const ax = new THREE.Vector3(ZK.ax, 0, ZK.az).normalize(), px = new THREE.Vector3(-ax.z, 0, ax.x);
  const c0 = new THREE.Vector3(ZK.cx, 0, ZK.cz);
  const half = ZK.w / 2, deck = ZK.deck;
  const geos = [], cab = [];
  const strut = (a, b, t) => {
    const d = b.clone().sub(a), g = new THREE.BoxGeometry(t, d.length(), t);
    g.translate(0, d.length() / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
    geos.push(g);
  };
  // the north tower is the one toward Charlestown (more negative z)
  const ends = [-113.5, 113.5].map(s => c0.clone().addScaledVector(ax, s)).sort((a, b) => a.z - b.z);
  [[ends[0], 90], [ends[1], 82]].forEach(([base, top]) => {
    const apex = base.clone().setY(top * 0.68);
    for (const s of [-1, 1]) strut(base.clone().addScaledVector(px, s * (half + 5)), apex, 4.5);
    strut(apex, base.clone().setY(top), 4);
    strut(base.clone().addScaledVector(px, -half).setY(deck - 3), base.clone().addScaledVector(px, half).setY(deck - 3).add(new THREE.Vector3(0, 0.01, 0)), 3);
    const along = base.clone().sub(c0).dot(ax) > 0 ? 1 : -1;
    for (let k = 1; k <= 11; k++) {
      const yTop = top * 0.7 + (top * 0.27) * (k / 11);
      for (const dir of [-1, 1]) {
        const reach = dir === -along ? k * 9.5 : k * 7.5;
        for (const s of [-1, 1]) {
          const from = base.clone().setY(yTop), to = base.clone().addScaledVector(ax, dir * reach).addScaledVector(px, s * (half - 1)).setY(deck);
          cab.push(from.x, from.y, from.z, to.x, to.y, to.z);
        }
      }
    }
  });
  const tm = new THREE.Mesh(mergeFlat(geos), towerMat);
  tm.castShadow = tm.receiveShadow = true;
  scene.add(tm);
  const cg = new THREE.BufferGeometry();
  cg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cab), 3));
  scene.add(new THREE.LineSegments(cg, cableMat));
}

// buildings: one merged mesh; each building owns a contiguous vertex range (caps first, then walls)
const geos = [];
let total = 0, edgeCount = 0;
const edgeChunks = [];
for (const b of B) {
  const shape = new THREE.Shape(b.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  if (b.i) for (const ring of b.i) shape.holes.push(new THREE.Path(ringToVec(ring)));
  let g;
  try { g = new THREE.ExtrudeGeometry(shape, { depth: b.h - b.base, bevelEnabled: false }); } catch (e) { continue; }
  g.rotateX(-Math.PI / 2);
  g.translate(0, b.base, 0);
  b.start = total; b.count = g.attributes.position.count; b.cap = g.groups.length ? g.groups[0].count : 0;
  total += b.count;
  geos.push(g);
  const eg = new THREE.EdgesGeometry(g, 28);
  edgeChunks.push(eg.attributes.position.array); edgeCount += eg.attributes.position.count;
  eg.dispose();
}
const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
let off = 0;
for (const g of geos) {
  pos.set(g.attributes.position.array, off * 3);
  nor.set(g.attributes.normal.array, off * 3);
  off += g.attributes.position.count;
  g.dispose();
}
const geom = new THREE.BufferGeometry();
geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
geom.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
geom.setAttribute("color", new THREE.BufferAttribute(col, 3));
const city = new THREE.Mesh(geom, stdMat({ vertexColors: true, roughness: 0.82 }));
city.castShadow = city.receiveShadow = true;
scene.add(city);

const ep = new Float32Array(edgeCount * 3); off = 0;
for (const a of edgeChunks) { ep.set(a, off); off += a.length; }
const eGeom = new THREE.BufferGeometry();
eGeom.setAttribute("position", new THREE.BufferAttribute(ep, 3));
const edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.3 });
city.add(new THREE.LineSegments(eGeom, edgeMat));

// typical Boston materials for buildings without colour tags
const PAL = {
  brick: ["#9a5544", "#a8634d", "#8b4a3c", "#b07a5c", "#7e4636", "#a06a52"],
  stone: ["#d2cbbb", "#bdb6a8", "#ddd7ca", "#aaa69e", "#c6b99e", "#b9b4ab"],
  glass: ["#7f95a8", "#94a9b9", "#6f8597", "#a4b4c0", "#8a9aa3"],
  roof: ["#8f8f8b", "#9c9a95", "#7f807e", "#a7a49d", "#888a8c"]
};
const RES = new Set(["house", "detached", "semidetached_house", "terrace", "apartments", "residential", "dormitory"]);
const rnd = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const pickC = (arr, i) => new THREE.Color(arr[Math.floor(rnd(i) * arr.length)]);
B.forEach((b, i) => {
  const kind = b.h >= 70 ? "glass" : RES.has(b.t) || (b.h < 24 && rnd(i + 7) < 0.5) ? "brick" : "stone";
  b.wall = pickC(PAL[kind], i);
  if (b.c) b.wall.setStyle(b.c);
  b.roof = kind === "glass" ? pickC(PAL.glass, i + 3).multiplyScalar(0.8) : pickC(PAL.roof, i + 1);
  if (b.rc) b.roof.setStyle(b.rc);
});

let mode = "real", hovered = -1;
const cLo = new THREE.Color(), cHi = new THREE.Color(), cSrc = {}, cHover = new THREE.Color(), tmpW = new THREE.Color(), tmpR = new THREE.Color();
function colorsOf(b) {
  if (mode === "real") { tmpW.copy(b.wall); tmpR.copy(b.roof); return; }
  if (mode === "height") tmpW.copy(cLo).lerp(cHi, Math.pow(Math.min(b.h / 200, 1), 0.85));
  else tmpW.copy(cSrc[b.s]);
  tmpR.copy(tmpW).multiplyScalar(1.1);
}
function paint(b, wall, roof) {
  if (b.count == null) return;
  const end = b.start + b.count, capEnd = b.start + b.cap;
  for (let v = b.start; v < end; v++) {
    const c = v < capEnd ? roof : wall;
    col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
  }
}
function repaint(b) { colorsOf(b); paint(b, tmpW, tmpR); }
function repaintAll() {
  for (const b of B) repaint(b);
  if (hovered >= 0) paint(B[hovered], cHover, cHover);
  geom.attributes.color.needsUpdate = true;
}
function applyTheme() {
  const sky = new THREE.Color(css("--sky"));
  renderer.setClearColor(sky);
  scene.fog.color.copy(sky);
  groundMat.color.set(css("--ground"));
  parkMat.color.set(css("--park"));
  waterMat.color.set(css("--water"));
  roadMat.color.set(css("--road"));
  pathMat.color.set(css("--path"));
  edgeMat.color.set(css("--edge"));
  bridgeMat.color.set(css("--bridge")); towerMat.color.set(css("--tower")); cableMat.color.set(css("--tower"));
  cLo.set(css("--bld-lo")); cHi.set(css("--bld-hi"));
  for (const k of ["m", "f", "e"]) cSrc[k] = new THREE.Color(css("--src-" + k));
  cHover.set(css("--src-f"));
  const lit = parseFloat(css("--lit")) || 1;
  hemi.intensity = 0.6 * lit;
  sun.intensity = 2.4 * lit;
  edgeMat.opacity = lit < 1 ? 0.55 : 0.3;
  repaintAll();
}
applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// UI
const cnt = { m: 0, f: 0, e: 0 };
for (const b of B) cnt[b.s]++;
for (const k in cnt) document.getElementById("c-" + k).textContent = cnt[k].toLocaleString();
document.getElementById("count").textContent = B.length.toLocaleString() + " buildings and tower parts.";

const modeBtns = { real: document.getElementById("m-real"), height: document.getElementById("m-height"), src: document.getElementById("m-src") };
for (const [m, btn] of Object.entries(modeBtns)) btn.addEventListener("click", () => {
  mode = m;
  for (const [k, b2] of Object.entries(modeBtns)) b2.setAttribute("aria-pressed", String(k === m));
  document.getElementById("legend-real").hidden = m !== "real";
  document.getElementById("legend-height").hidden = m !== "height";
  document.getElementById("legend-src").hidden = m !== "src";
  repaintAll();
});

let exag = 1, grow = reduceMotion ? 1 : 0;
const exagIn = document.getElementById("exag"), exagOut = document.getElementById("exag-out");
exagIn.addEventListener("input", () => { exag = +exagIn.value; exagOut.textContent = exag.toFixed(1) + "×"; });

const seen = new Set();
const tallest = B.filter(b => b.n && b.s === "m").sort((a, b) => b.h - a.h).filter(b => !seen.has(b.n) && seen.add(b.n)).slice(0, 8);
const list = document.getElementById("tall");
for (const b of tallest) {
  const li = document.createElement("li"), btn = document.createElement("button");
  const a = document.createElement("span"); a.textContent = b.n;
  const h = document.createElement("span"); h.textContent = Math.round(b.h) + " m";
  btn.append(a, h); li.append(btn); list.append(li);
  btn.addEventListener("click", () => flyTo(b));
}

if (ZK) {
  const li = document.createElement("li"), btn = document.createElement("button");
  const a = document.createElement("span"); a.textContent = "Zakim Bridge towers";
  const h = document.createElement("span"); h.textContent = "90 m";
  btn.append(a, h); li.append(btn); list.append(li);
  btn.addEventListener("click", () => flyTo({ box: [ZK.cx - 1, ZK.cx + 1, ZK.cz - 1, ZK.cz + 1], h: 90 }));
}

const sheet = document.getElementById("sheet"), toggle = document.getElementById("toggle");
toggle.addEventListener("click", () => {
  const c = sheet.classList.toggle("collapsed");
  toggle.textContent = c ? "Show" : "Hide";
  toggle.setAttribute("aria-expanded", String(!c));
});

// camera flights
let flight = null;
function flyTo(b) {
  const cx = (b.box[0] + b.box[1]) / 2, cz = (b.box[2] + b.box[3]) / 2, h = b.h * exag;
  const toT = new THREE.Vector3(cx, h * 0.45, cz);
  const dir = camera.position.clone().sub(controls.target).setY(0).normalize();
  const dist = Math.max(420, h * 3);
  const toP = toT.clone().addScaledVector(dir, dist).setY(h * 0.45 + dist * 0.55);
  flight = { t: 0, fromP: camera.position.clone(), fromT: controls.target.clone(), toP, toT, dur: reduceMotion ? 1 : 1400 };
  setHover(B.indexOf(b));
}

// picking: AABB prefilter, then exact prism test
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function inPoly(x, z, p) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function pick(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction, s = city.scale.y;
  let best = -1, bestT = Infinity;
  for (let i = 0; i < B.length; i++) {
    const b = B[i], top = b.h * s, bot = b.base * s, [x0, x1, z0, z1] = b.box;
    let tmin = 0, tmax = bestT;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, x0, x1], [o.y, d.y, bot, top], [o.z, d.z, z0, z1]]) {
      if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { tmin = Infinity; break; } continue; }
      let ta = (lo - oo) / dd, tb = (hi - oo) / dd;
      if (ta > tb) [ta, tb] = [tb, ta];
      tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
      if (tmin > tmax) break;
    }
    if (tmin > tmax || tmin === Infinity) continue;
    let t = Infinity;
    if (d.y < 0) {
      const tt = (top - o.y) / d.y;
      if (tt > 0 && tt < t && inPoly(o.x + tt * d.x, o.z + tt * d.z, b.pts)) t = tt;
    }
    const p = b.pts;
    for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
      const ex = p[k][0] - p[j][0], ez = p[k][1] - p[j][1];
      const den = d.x * ez - d.z * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = p[j][0] - o.x, wz = p[j][1] - o.z;
      const tt = (wx * ez - wz * ex) / den, u = (wx * d.z - wz * d.x) / den;
      if (tt > 0 && tt < t && u >= 0 && u <= 1) {
        const y = o.y + tt * d.y;
        if (y >= bot && y <= top) t = tt;
      }
    }
    if (t < bestT) { bestT = t; best = i; }
  }
  return best;
}
function setHover(i) {
  if (i === hovered) return;
  if (hovered >= 0) repaint(B[hovered]);
  hovered = i;
  if (i >= 0) paint(B[i], cHover, cHover);
  geom.attributes.color.needsUpdate = true;
}
const SRC_LABEL = { m: "measured", f: "from floor count", e: "estimated from type" };
const tip = document.getElementById("tip");
function showTip(i, x, y) {
  if (i < 0) { tip.hidden = true; return; }
  const b = B[i];
  tip.replaceChildren();
  const s = document.createElement("strong");
  s.textContent = b.n || b.a || (b.t ? b.t.replace(/_/g, " ") : "Building");
  tip.append(s);
  if (b.n && b.a) { const a = document.createElement("div"); a.textContent = b.a; tip.append(a); }
  const m = document.createElement("div"); m.className = "m";
  m.textContent = `${Math.round(b.h)} m · ${Math.round(b.h * 3.281)} ft · ${SRC_LABEL[b.s]}`;
  tip.append(m);
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(x, innerWidth - w - 24) + "px";
  tip.style.top = Math.min(y, innerHeight - h - 24) + "px";
}
let pending = null, downAt = null;
renderer.domElement.addEventListener("pointermove", e => { if (e.pointerType === "mouse" && !e.buttons) pending = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointerleave", () => { pending = null; setHover(-1); showTip(-1); });
renderer.domElement.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; flight = null; });
renderer.domElement.addEventListener("pointerup", e => {
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) {
    const i = pick(e.clientX, e.clientY);
    setHover(i); showTip(i, e.clientX, e.clientY);
  }
  downAt = null;
});

// on wide screens, centre the model in the space right of the sheet
function fit() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  const shift = w > 640 ? (sheet.offsetWidth + 16) / 2 : 0;
  if (shift) camera.setViewOffset(w, h, -shift, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
fit();
addEventListener("resize", fit);

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = now - last; last = now;
  if (grow < 1) grow = Math.min(1, grow + dt / 2200);
  city.scale.y = Math.max(0.001, ease(grow)) * exag;
  if (flight) {
    flight.t = Math.min(1, flight.t + dt / flight.dur);
    const k = ease(flight.t);
    camera.position.lerpVectors(flight.fromP, flight.toP, k);
    controls.target.lerpVectors(flight.fromT, flight.toT, k);
    if (flight.t >= 1) flight = null;
  }
  controls.update();
  updateShadow();
  if (pending) { const [x, y] = pending; pending = null; const i = pick(x, y); setHover(i); showTip(i, x, y); }
  renderer.render(scene, camera);
});
})();
})();
