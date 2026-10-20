(async () => {
  const POP = await (await fetch("/lab/population-globe/data/density.json")).json();
  const NE = await (await fetch("/lab/population-globe/data/places.json")).json();
(() => {
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const R = 100, STEP = POP.step, W = POP.w, H = POP.h;

const raw = atob(POP.q), bytes = new Uint8Array(raw.length);
for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
const q = new Uint16Array(bytes.buffer);
const dens = new Float32Array(q.length);
let dmax = 0;
for (let i = 0; i < q.length; i++) { dens[i] = Math.pow(10, q[i] / POP.k) - 1; if (dens[i] > dmax) dmax = dens[i]; }
const KM = 6371.0088 * STEP * Math.PI / 180;
const cellArea = row => KM * KM * Math.cos((90 - (row + 0.5) * STEP) * Math.PI / 180);

const cells = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const d = dens[r * W + c];
  if (d >= 1) cells.push(r * W + c);
}
const instOf = new Int32Array(W * H).fill(-1);
cells.forEach((g, i) => instOf[g] = i);

const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + " billion" : n >= 1e6 ? (n / 1e6).toFixed(1) + " million" : n >= 1e3 ? Math.round(n).toLocaleString() : n.toFixed(n < 10 ? 1 : 0);
document.getElementById("total").textContent = fmt(POP.total);
document.getElementById("cells").textContent = cells.length.toLocaleString() + " cells with at least 1 person per km².";

// scene
const stage = document.getElementById("stage");
THREE.ColorManagement.legacyMode = false;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.5, 2000);
// controls drive an invisible "orbit" camera; the real camera is derived from it with tilt applied
const orbit = new THREE.PerspectiveCamera();
const controls = new THREE.OrbitControls(orbit, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 112;
controls.maxDistance = 600;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.35;

const toVec = (lat, lon, r, out = new THREE.Vector3()) => {
  const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
  return out.set(r * Math.cos(a) * Math.sin(b), r * Math.sin(a), r * Math.cos(a) * Math.cos(b));
};
orbit.position.copy(toVec(25, 80, 440));
camera.position.copy(orbit.position);
camera.lookAt(0, 0, 0);

let tilt = 0, tiltTarget = 0;
const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _f = new THREE.Vector3();
function updateRig() {
  const P = orbit.position, alt = P.length() - R, a = tilt * Math.PI / 180;
  _n.copy(P).normalize();
  _f.copy(_n).multiplyScalar(R);
  _t.set(0, 1, 0).addScaledVector(_n, -_n.y);
  if (_t.lengthSq() < 1e-6) _t.set(0, 0, -1);
  _t.normalize();
  camera.position.copy(_f).addScaledVector(_n, Math.cos(a) * alt).addScaledVector(_t, -Math.sin(a) * alt);
  camera.up.copy(_t).multiplyScalar(Math.cos(a)).addScaledVector(_n, Math.sin(a));
  camera.lookAt(_f);
}

function lineLayer(list, color, opacity, r) {
  const p = [];
  for (const ln of list) for (let k = 0; k + 3 < ln.length; k += 2) {
    const a = toVec(ln[k + 1], ln[k], r), b = toVec(ln[k + 3], ln[k + 2], r);
    p.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(p), 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}
const lineGroup = new THREE.Group();
lineGroup.add(lineLayer(NE.coast, 0x9fb4e6, 0.5, R * 1.0012), lineLayer(NE.borders, 0xc7d2f0, 0.32, R * 1.0015));
scene.add(lineGroup);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 0.75);
scene.add(camera); camera.add(key); key.position.set(-1, 1, 1);

const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshPhongMaterial({ color: css("--ocean"), shininess: 8 }));
scene.add(globe);

const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 64, 48), new THREE.ShaderMaterial({
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  uniforms: { c: { value: new THREE.Color(0x4d6fd6) } },
  vertexShader: "varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: "uniform vec3 c; varying vec3 n; void main(){ float i = pow(max(0.0, 0.62 - dot(n, vec3(0.,0.,1.))), 3.0); gl_FragColor = vec4(c, 1.0) * i * 2.2; }"
}));
scene.add(atmo);

const grat = [];
for (let lat = -60; lat <= 60; lat += 30) for (let lon = 0; lon < 360; lon += 2) grat.push(toVec(lat, lon, R * 1.001), toVec(lat, lon + 2, R * 1.001));
for (let lon = -180; lon < 180; lon += 30) for (let lat = -88; lat < 88; lat += 2) grat.push(toVec(lat, lon, R * 1.001), toVec(lat + 2, lon, R * 1.001));
scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grat), new THREE.LineBasicMaterial({ color: 0x5c6f9e, transparent: true, opacity: 0.18 })));

// bars
const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
const bars = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), cells.length);
bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(bars);

const ramp = ["--r0", "--r1", "--r2", "--r3"].map(n => new THREE.Color(css(n)));
const stops = [0, 0.4, 0.72, 1];
const lmax = Math.log10(1 + dmax);
const tOf = d => Math.log10(1 + d) / lmax;
function rampColor(t, out) {
  let i = 0; while (i < stops.length - 2 && t > stops[i + 1]) i++;
  const k = (t - stops[i]) / (stops[i + 1] - stops[i]);
  return out.copy(ramp[i]).lerp(ramp[i + 1], Math.min(1, Math.max(0, k)));
}
const tmpC = new THREE.Color();
cells.forEach((g, i) => bars.setColorAt(i, rampColor(tOf(dens[g]), tmpC)));

const SCALES = {
  lin: { f: d => d / dmax, max: 60, note: "True proportions. A handful of megacity cells tower over everything else." },
  sqrt: { f: d => Math.sqrt(d / dmax), max: 34, note: "Compresses the tallest spikes so dense regions like the Ganges plain and eastern China stand out." },
  log: { f: d => tOf(d), max: 16, note: "Every tenfold step in density adds the same height, so sparse regions show up too." }
};
let scaleKey = "sqrt";
const cur = new Float32Array(cells.length), target = new Float32Array(cells.length);
function setTargets() { const s = SCALES[scaleKey]; cells.forEach((g, i) => target[i] = Math.max(0.15, s.f(dens[g]) * s.max)); document.getElementById("scale-note").textContent = s.note; }
setTargets();
if (reduceMotion) cur.set(target);

const basis = cells.map(g => {
  const r = Math.floor(g / W), c = g % W;
  const lat = 90 - (r + 0.5) * STEP, lon = -180 + (c + 0.5) * STEP;
  const up = toVec(lat, lon, 1), b = lon * Math.PI / 180;
  const east = new THREE.Vector3(Math.cos(b), 0, -Math.sin(b));
  const north = new THREE.Vector3().crossVectors(east, up).negate();
  const w = R * STEP * Math.PI / 180 * 0.9;
  return { p: up.clone().multiplyScalar(R), up, east, north, we: w * Math.max(0.05, Math.cos(lat * Math.PI / 180)), wn: w };
});
const IM = bars.instanceMatrix.array;
basis.forEach((s, i) => {
  const o = i * 16;
  IM[o] = s.east.x * s.we; IM[o + 1] = s.east.y * s.we; IM[o + 2] = s.east.z * s.we; IM[o + 3] = 0;
  IM[o + 8] = s.north.x * s.wn; IM[o + 9] = s.north.y * s.wn; IM[o + 10] = s.north.z * s.wn; IM[o + 11] = 0;
  IM[o + 12] = s.p.x; IM[o + 13] = s.p.y; IM[o + 14] = s.p.z; IM[o + 15] = 1;
});
function writeMatrices() {
  for (let i = 0; i < cells.length; i++) {
    const u = basis[i].up, h = cur[i], o = i * 16;
    IM[o + 4] = u.x * h; IM[o + 5] = u.y * h; IM[o + 6] = u.z * h; IM[o + 7] = 0;
  }
  bars.instanceMatrix.needsUpdate = true;
}
writeMatrices();

// UI
const scaleBtns = { lin: "s-lin", sqrt: "s-sqrt", log: "s-log" };
for (const [k, id] of Object.entries(scaleBtns)) document.getElementById(id).addEventListener("click", () => {
  scaleKey = k;
  for (const [k2, id2] of Object.entries(scaleBtns)) document.getElementById(id2).setAttribute("aria-pressed", String(k2 === k));
  setTargets();
  if (reduceMotion) { cur.set(target); writeMatrices(); }
});

const ticks = document.getElementById("ticks");
for (const v of [1, 10, 100, 1000, 10000].filter(v => tOf(v) < 0.86)) {
  const s = document.createElement("span");
  s.style.left = (tOf(v) * 100) + "%";
  s.textContent = v >= 1000 ? v / 1000 + "k" : v;
  ticks.append(s);
}
const lastTick = document.createElement("span");
lastTick.style.left = "100%"; lastTick.textContent = Math.round(dmax).toLocaleString();
ticks.append(lastTick);

const cellAt = (lat, lon) => {
  const r = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / STEP)));
  const c = ((Math.floor((lon + 180) / STEP) % W) + W) % W;
  return r * W + c;
};
const CITIES = [["Dhaka", 23.81, 90.41], ["Delhi", 28.61, 77.21], ["Tokyo", 35.68, 139.69], ["Shanghai", 31.23, 121.47], ["Cairo", 30.04, 31.24], ["Lagos", 6.52, 3.38], ["São Paulo", -23.55, -46.63], ["Mexico City", 19.43, -99.13], ["New York", 40.71, -74.01], ["Boston", 42.36, -71.06]];
const ul = document.getElementById("cities");
for (const [name, lat, lon] of CITIES) {
  const li = document.createElement("li"), btn = document.createElement("button");
  const a = document.createElement("span"); a.textContent = name;
  const b = document.createElement("span"); b.textContent = Math.round(dens[cellAt(lat, lon)]).toLocaleString() + " /km²";
  btn.append(a, b); li.append(btn); ul.append(li);
  btn.addEventListener("click", () => flyTo(lat, lon));
}

const sheet = document.getElementById("sheet"), toggle = document.getElementById("toggle");
toggle.addEventListener("click", () => {
  const c = sheet.classList.toggle("collapsed");
  toggle.textContent = c ? "Show" : "Hide";
  toggle.setAttribute("aria-expanded", String(!c));
});

const spinBtn = document.getElementById("spin");
function setSpin(on) { controls.autoRotate = on; spinBtn.textContent = on ? "Pause spin" : "Spin"; }
setSpin(!reduceMotion);
spinBtn.addEventListener("click", () => setSpin(!controls.autoRotate));

let flight = null;
function flyTo(lat, lon, dist) {
  setSpin(false);
  const from = orbit.position.clone(), dist0 = from.length();
  const dist1 = dist || Math.min(dist0, 230);
  const to = toVec(lat, lon, 1);
  flight = { t: 0, from: from.normalize(), to, dist0, dist1, dur: reduceMotion ? 1 : 1600 };
  hoverCell(cellAt(lat, lon));
}

const tiltIn = document.getElementById("tilt"), tiltOut = document.getElementById("tilt-out");
tiltIn.addEventListener("input", () => { tiltTarget = +tiltIn.value; tiltOut.textContent = tiltTarget + "°"; if (reduceMotion) tilt = tiltTarget; });
document.getElementById("lines").addEventListener("change", e => { lineGroup.visible = e.target.checked; });

// city labels: anchored on top of their cell's bar, decluttered by population each frame
const CITY = NE.cities.map(([name, lat, lon, pop, country]) => {
  const g = cellAt(lat, lon);
  return { name, lat, lon, pop, country, g, inst: instOf[g], n: toVec(lat, lon, 1) };
});
const dl = document.getElementById("city-list");
const seenName = new Set();
for (const c of CITY) {
  const key = c.name + ", " + c.country;
  if (seenName.has(key)) continue;
  seenName.add(key);
  const o = document.createElement("option"); o.value = key; dl.append(o);
}
const search = document.getElementById("search");
function doSearch() {
  const v = search.value.trim().toLowerCase();
  if (!v) return;
  const c = CITY.find(c => (c.name + ", " + c.country).toLowerCase() === v) || CITY.find(c => c.name.toLowerCase() === v) || CITY.find(c => c.name.toLowerCase().startsWith(v));
  if (c) { flyTo(c.lat, c.lon, 175); search.setCustomValidity(""); }
  else { search.setCustomValidity("No city by that name in the list"); search.reportValidity(); }
}
search.addEventListener("change", doSearch);
search.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
search.addEventListener("input", () => search.setCustomValidity(""));

const labelLayer = document.getElementById("labels");
let showNames = true;
document.getElementById("names").addEventListener("change", e => { showNames = e.target.checked; labelLayer.hidden = !showNames; });
const POOL = [];
const fmtPop = p => p >= 1e6 ? (p / 1e6).toFixed(p >= 1e7 ? 0 : 1) + "M" : Math.round(p / 1e3) + "k";
function labelEl(i) {
  while (POOL.length <= i) {
    const b = document.createElement("button");
    b.className = "lbl";
    b.tabIndex = -1;
    const t = document.createElement("span"), s = document.createElement("small");
    b.append(t, s);
    b.addEventListener("click", () => { const c = b._city; if (c) flyTo(c.lat, c.lon, Math.min(orbit.position.length(), 175)); });
    labelLayer.append(b);
    POOL.push({ el: b, t, s, city: null });
  }
  return POOL[i];
}
const _p = new THREE.Vector3(), _v = new THREE.Vector3();
function placeLabels() {
  if (!showNames) return;
  const w = innerWidth, h = innerHeight, alt = orbit.position.length() - R;
  const maxN = alt > 320 ? 22 : alt > 200 ? 34 : alt > 110 ? 45 : 55;
  const boxes = [];
  let used = 0;
  for (const c of CITY) {
    if (used >= maxN) break;
    const top = R + (c.inst >= 0 ? cur[c.inst] : 0) + 0.3;
    _p.copy(c.n).multiplyScalar(top);
    _v.copy(camera.position).sub(_p);
    if (_v.dot(c.n) < _v.length() * 0.12) continue;
    _p.project(camera);
    if (_p.z > 1) continue;
    const x = (_p.x + 1) / 2 * w, y = (1 - _p.y) / 2 * h;
    const big = c.pop >= 1e7;
    const lw = c.name.length * (big ? 8 : 7) + 52, lh = big ? 24 : 21;
    const r = [x - 4, y - lh / 2, x + lw, y + lh / 2];
    if (r[2] < 0 || r[0] > w || r[1] < 0 || r[3] > h) continue;
    if (boxes.some(b => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1])) continue;
    boxes.push(r);
    const L = labelEl(used++);
    if (L.city !== c) {
      L.city = c; L.el._city = c;
      L.t.textContent = c.name; L.s.textContent = fmtPop(c.pop);
      L.el.classList.toggle("big", big);
      L.el.setAttribute("aria-label", `${c.name}, ${c.country}, metro population ${c.pop.toLocaleString()}. Fly here.`);
    }
    L.el.hidden = false;
    L.el.style.transform = `translate(${(x - 2.5).toFixed(1)}px, ${(y - lh / 2).toFixed(1)}px)`;
  }
  for (let i = used; i < POOL.length; i++) if (!POOL[i].el.hidden) POOL[i].el.hidden = true;
}

// hover: intersect the sphere analytically and look up the grid cell beneath
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), sphere = new THREE.Sphere(new THREE.Vector3(), R), hit = new THREE.Vector3();
const tip = document.getElementById("tip");
let hovered = -1;
function hoverCell(g) {
  const i = g >= 0 ? instOf[g] : -1;
  if (hovered >= 0) bars.setColorAt(hovered, rampColor(tOf(dens[cells[hovered]]), tmpC));
  hovered = i;
  if (i >= 0) bars.setColorAt(i, tmpC.set(0xffffff));
  bars.instanceColor.needsUpdate = true;
}
function probe(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectSphere(sphere, hit)) { hoverCell(-1); tip.hidden = true; return; }
  const lat = Math.asin(hit.y / R) * 180 / Math.PI, lon = Math.atan2(hit.x, hit.z) * 180 / Math.PI;
  const g = cellAt(lat, lon), d = dens[g], r = Math.floor(g / W);
  hoverCell(g);
  tip.replaceChildren();
  const s = document.createElement("strong");
  s.textContent = d < 0.5 ? "Uninhabited" : Math.round(d).toLocaleString() + " per km²";
  const p = document.createElement("div");
  p.textContent = d < 0.5 ? "Fewer than one person per km²" : "≈ " + fmt(d * cellArea(r)) + " people in this cell";
  const m = document.createElement("div"); m.className = "m";
  const cLat = 90 - (r + 0.5) * STEP, cLon = -180 + (g % W + 0.5) * STEP;
  m.textContent = `${Math.abs(cLat).toFixed(2)}°${cLat >= 0 ? "N" : "S"} ${Math.abs(cLon).toFixed(2)}°${cLon >= 0 ? "E" : "W"}`;
  tip.append(s, p, m);
  tip.hidden = false;
  tip.style.left = Math.min(x + 14, innerWidth - tip.offsetWidth - 16) + "px";
  tip.style.top = Math.min(y + 14, innerHeight - tip.offsetHeight - 16) + "px";
}
let pending = null, downAt = null;
const el = renderer.domElement;
el.addEventListener("pointermove", e => { if (e.pointerType === "mouse" && !e.buttons) pending = [e.clientX, e.clientY]; });
el.addEventListener("pointerleave", () => { pending = null; hoverCell(-1); tip.hidden = true; });
el.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; setSpin(false); flight = null; });
el.addEventListener("pointerup", e => {
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) probe(e.clientX, e.clientY);
  downAt = null;
});
el.addEventListener("wheel", () => setSpin(false), { passive: true });

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
let last = performance.now(), growDelay = reduceMotion ? 0 : 300;
renderer.setAnimationLoop(now => {
  const dt = Math.min(64, now - last); last = now;
  if (growDelay > 0) growDelay -= dt;
  else {
    let moving = false;
    const k = 1 - Math.pow(0.0025, dt / 1000);
    for (let i = 0; i < cur.length; i++) {
      const diff = target[i] - cur[i];
      if (Math.abs(diff) > 0.01) { cur[i] += diff * k; moving = true; }
    }
    if (moving) writeMatrices();
  }
  if (flight) {
    flight.t = Math.min(1, flight.t + dt / flight.dur);
    const e = ease(flight.t);
    const dir = flight.from.clone().lerp(flight.to, e).normalize();
    orbit.position.copy(dir.multiplyScalar(flight.dist0 + (flight.dist1 - flight.dist0) * e));
    if (flight.t >= 1) flight = null;
  }
  controls.rotateSpeed = Math.min(1, (orbit.position.length() - R) / 200);
  controls.update();
  tilt += (tiltTarget - tilt) * (1 - Math.pow(0.004, dt / 1000));
  updateRig();
  placeLabels();
  if (pending) { const [x, y] = pending; pending = null; probe(x, y); }
  renderer.render(scene, camera);
});
})();
})();
