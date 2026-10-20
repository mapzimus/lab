(async () => {
  const [POP, NE, COUNTRIES, TL, LY] = await Promise.all([fetch("/lab/population-globe/data/density.json").then(r => r.json()), fetch("/lab/population-globe/data/places.json").then(r => r.json()), fetch("/lab/population-globe/data/countries.json").then(r => r.json()), fetch("/lab/population-globe/data/timeline.json").then(r => r.json()), fetch("/lab/population-globe/data/layers.json").then(r => r.json())]);
(() => {
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = id => document.getElementById(id);
const R = 100, STEP = POP.step, W = POP.w, H = POP.h;
const b64 = (s, T) => { const raw = atob(s), u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); return new T(u.buffer); };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + " billion" : n >= 1e6 ? (n / 1e6).toFixed(1) + " million" : n >= 1e3 ? Math.round(n).toLocaleString() : n.toFixed(n < 10 ? 1 : 0);
const fmtShort = v => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M" : v >= 1000 ? Math.round(v / 1000) + "k" : String(Math.round(v));
const fmtDen = d => d < 10 ? d.toFixed(1) : Math.round(d).toLocaleString();

// ---------- data ----------
const q25 = b64(POP.q, Uint16Array);
const dens = new Float32Array(q25.length);
for (let i = 0; i < q25.length; i++) dens[i] = Math.pow(10, q25[i] / POP.k) - 1;
const KM = 6371.0088 * STEP * Math.PI / 180;
const cellArea = row => KM * KM * Math.cos((90 - (row + 0.5) * STEP) * Math.PI / 180);
const cells = [];
for (let g = 0; g < dens.length; g++) if (dens[g] >= 1) cells.push(g);
const N = cells.length;
const instOf = new Int32Array(W * H).fill(-1);
cells.forEach((g, i) => instOf[g] = i);
const areaOf = Float32Array.from(cells, g => cellArea(Math.floor(g / W)));

const EP = { 2025: Float32Array.from(cells, g => dens[g]) };
const tlIdx = b64(TL.idx, Uint32Array);
for (const y of TL.years) {
  const qq = b64(TL.ep[y], Uint16Array), a = Float32Array.from(EP[2025]);
  for (let j = 0; j < tlIdx.length; j++) { const i = instOf[tlIdx[j]]; if (i >= 0) a[i] = Math.pow(10, qq[j] / TL.k) - 1; }
  EP[y] = a;
}
const YEARS = Object.keys(EP).map(Number).sort((a, b) => a - b);
let dmax = 0, pmax = 0;
for (const y of YEARS) { const a = EP[y]; for (let i = 0; i < N; i++) { if (a[i] > dmax) dmax = a[i]; if (a[i] * areaOf[i] > pmax) pmax = a[i] * areaOf[i]; } }

const dcur = new Float32Array(N), pcur = new Float32Array(N);
function densAt(y, out) {
  let a = YEARS[0], b = YEARS[YEARS.length - 1];
  for (let k = 0; k < YEARS.length - 1; k++) if (y >= YEARS[k] && y <= YEARS[k + 1]) { a = YEARS[k]; b = YEARS[k + 1]; break; }
  const t = b === a ? 0 : (y - a) / (b - a), A = EP[a], B = EP[b];
  for (let i = 0; i < N; i++) out[i] = A[i] + (B[i] - A[i]) * t;
  return out;
}

const lyIdx = b64(LY.idx, Uint32Array), cen8 = b64(LY.centre, Uint8Array), clu8 = b64(LY.cluster, Uint8Array), lq = b64(LY.lights, Uint16Array);
const shareC = new Float32Array(N), shareT = new Float32Array(N), light = new Float32Array(N);
for (let j = 0; j < lyIdx.length; j++) {
  const i = instOf[lyIdx[j]];
  if (i < 0) continue;
  shareC[i] = cen8[j] / 250; shareT[i] = clu8[j] / 250; light[i] = (Math.pow(10, lq[j] / LY.k) - 1) / 1000;
}
const d16 = densAt(LY.lightsYear, new Float32Array(N));
// light per person, relative to the world's total light divided by the world's people
const lpp = new Float32Array(N);
let sumL = 0, sumP = 0;
for (let i = 0; i < N; i++) { const p = d16[i] * areaOf[i]; lpp[i] = light[i] / Math.max(p, 1); sumL += light[i]; sumP += p; }
const lppMed = sumL / sumP;
let wC = 0, wT = 0, wAll = 0;
for (let i = 0; i < N; i++) { const p = EP[2025][i] * areaOf[i]; wC += shareC[i] * p; wT += shareT[i] * p; wAll += p; }
const URB = [wC / wAll, wT / wAll, 1 - (wC + wT) / wAll];

const CT = COUNTRIES.countries.map(([name, a3, pop, area, dens, lat, lon]) => ({ name, a3, pop, area, dens, lat, lon }));
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const medPop = median(CT.map(c => c.pop)), medDen = median(CT.map(c => c.dens));
CT.forEach(c => { c.cls = (c.pop >= medPop ? 2 : 0) + (c.dens >= medDen ? 1 : 0); });
const CLS_NAME = ["small and sparse", "small and crowded", "big and sparse", "big and crowded"];
const ccode = b64(COUNTRIES.grid, Uint8Array);

// ---------- scene ----------
const stage = $("stage");
THREE.ColorManagement.legacyMode = false;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
stage.appendChild(renderer.domElement);
const el = renderer.domElement;
el.tabIndex = 0;
el.setAttribute("role", "application");
el.setAttribute("aria-label", "Population globe. Arrow keys turn it, plus and minus zoom, Page Up and Page Down tilt, Space plays the years.");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.5, 2000);
// controls drive an invisible "orbit" camera; the real camera is derived from it with tilt applied
const orbit = new THREE.PerspectiveCamera();
const controls = new THREE.OrbitControls(orbit, el);
controls.enablePan = false;
controls.enableDamping = true;
controls.minDistance = 112;
controls.maxDistance = 760;
controls.autoRotateSpeed = 0.35;
const toVec = (lat, lon, r, out = new THREE.Vector3()) => {
  const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
  return out.set(r * Math.cos(a) * Math.sin(b), r * Math.sin(a), r * Math.cos(a) * Math.cos(b));
};
const HOME = [25, 80, innerWidth <= 760 ? 680 : 440];
orbit.position.copy(toVec(HOME[0], HOME[1], HOME[2]));
camera.position.copy(orbit.position);

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

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 0.75);
scene.add(camera); camera.add(key); key.position.set(-1, 1, 1);
scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshPhongMaterial({ color: css("--ocean"), shininess: 8 })));
scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 64, 48), new THREE.ShaderMaterial({
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  uniforms: { c: { value: new THREE.Color(0x4d6fd6) } },
  vertexShader: "varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: "uniform vec3 c; varying vec3 n; void main(){ float i = pow(max(0.0, 0.62 - dot(n, vec3(0.,0.,1.))), 3.0); gl_FragColor = vec4(c, 1.0) * i * 2.2; }"
})));
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
const grat = [];
for (let lat = -60; lat <= 60; lat += 30) for (let lon = 0; lon < 360; lon += 2) grat.push(lon, lat, lon + 2, lat);
for (let lon = -180; lon < 180; lon += 30) for (let lat = -88; lat < 88; lat += 2) grat.push(lon, lat, lon, lat + 2);
const gratLines = []; for (let k = 0; k < grat.length; k += 4) gratLines.push(grat.slice(k, k + 4));
scene.add(lineLayer(gratLines, 0x5c6f9e, 0.16, R * 1.001));
lineGroup.add(lineLayer(NE.coast, 0x9fb4e6, 0.5, R * 1.0012), lineLayer(NE.borders, 0xc7d2f0, 0.32, R * 1.0015));
scene.add(lineGroup);

const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
const bars = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), N);
bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(bars);
const UPS = new Float32Array(N * 3);
const IM = bars.instanceMatrix.array;
cells.forEach((g, i) => {
  const r = Math.floor(g / W), c = g % W;
  const lat = 90 - (r + 0.5) * STEP, lon = -180 + (c + 0.5) * STEP;
  const up = toVec(lat, lon, 1), b = lon * Math.PI / 180;
  const east = new THREE.Vector3(Math.cos(b), 0, -Math.sin(b));
  const north = new THREE.Vector3().crossVectors(east, up).negate();
  const w = R * STEP * Math.PI / 180 * 0.9, we = w * Math.max(0.05, Math.cos(lat * Math.PI / 180));
  const o = i * 16;
  IM[o] = east.x * we; IM[o + 1] = east.y * we; IM[o + 2] = east.z * we; IM[o + 3] = 0;
  IM[o + 8] = north.x * w; IM[o + 9] = north.y * w; IM[o + 10] = north.z * w; IM[o + 11] = 0;
  IM[o + 12] = up.x * R; IM[o + 13] = up.y * R; IM[o + 14] = up.z * R; IM[o + 15] = 1;
  UPS[i * 3] = up.x; UPS[i * 3 + 1] = up.y; UPS[i * 3 + 2] = up.z;
});
const cur = new Float32Array(N), target = new Float32Array(N);
function writeMatrices() {
  for (let i = 0; i < N; i++) { const o = i * 16, h = cur[i]; IM[o + 4] = UPS[i * 3] * h; IM[o + 5] = UPS[i * 3 + 1] * h; IM[o + 6] = UPS[i * 3 + 2] * h; IM[o + 7] = 0; }
  bars.instanceMatrix.needsUpdate = true;
}

// ---------- layers ----------
const col = n => new THREE.Color(css(n));
const RAMP = { stops: [0, 0.4, 0.72, 1], c: ["--r0", "--r1", "--r2", "--r3"].map(col) };
const GROW = { stops: [-2, -1, 0, 1, 2, 3], c: ["--g0", "--g1", "--g2", "--g3", "--g4", "--g5"].map(col) };
const LIGHT = { stops: [-4, -2, 0, 1.5, 3], c: ["--l0", "--l1", "--l2", "--l3", "--l4"].map(col) };
const URBC = ["--u0", "--u1", "--u2"].map(col);
const BIV = ["--b0", "--b1", "--b2", "--b3"].map(col);
const NOCLS = new THREE.Color(0x3a4256);
function piece(P, x, out) {
  const s = P.stops;
  if (x <= s[0]) return out.copy(P.c[0]);
  if (x >= s[s.length - 1]) return out.copy(P.c[P.c.length - 1]);
  let i = 0; while (x > s[i + 1]) i++;
  return out.copy(P.c[i]).lerp(P.c[i + 1], (x - s[i]) / (s[i + 1] - s[i]));
}
const gradCss = (P, vars) => {
  const a = P.stops[0], b = P.stops[P.stops.length - 1];
  return "linear-gradient(90deg, " + vars.map((v, i) => `var(${v}) ${((P.stops[i] - a) / (b - a) * 100).toFixed(1)}%`).join(", ") + ")";
};
const RAMP_CSS = gradCss(RAMP, ["--r0", "--r1", "--r2", "--r3"]);
const GROW_CSS = gradCss(GROW, ["--g0", "--g1", "--g2", "--g3", "--g4", "--g5"]);
const LIGHT_CSS = gradCss(LIGHT, ["--l0", "--l1", "--l2", "--l3", "--l4"]);

const LAYERS = [
  { id: "density", name: "Density", sub: "People per km²", metric: "dens", timeline: true, sw: RAMP_CSS },
  { id: "people", name: "People", sub: "Residents per 28 km cell", metric: "pop", timeline: true, sw: RAMP_CSS },
  { id: "growth", name: "Growth", sub: "Change since 1975", metric: "dens", timeline: true, sw: GROW_CSS },
  { id: "urban", name: "City or country", sub: "Cities, towns, rural", metric: "dens", timeline: false, year: 2025, sw: "conic-gradient(var(--u0) 0 44%, var(--u1) 0 80%, var(--u2) 0)" },
  { id: "lights", name: "Lights per person", sub: "Night light ÷ residents", metric: "dens", timeline: false, year: LY.lightsYear, sw: LIGHT_CSS },
  { id: "country", name: "Country type", sub: "Big vs crowded", metric: "dens", timeline: false, year: 2025, sw: "conic-gradient(var(--b2) 0 25%, var(--b3) 0 50%, var(--b1) 0 75%, var(--b0) 0)" },
];
let layer = LAYERS[0], year = 2025, selected = -1, hovered = -1;
const tD = i => Math.log10(1 + dcur[i]) / Math.log10(1 + dmax);
const tP = i => Math.log10(1 + pcur[i]) / Math.log10(1 + pmax);
const tmpC = new THREE.Color();
function colorFor(i, out) {
  const g = cells[i];
  switch (layer.id) {
    case "density": piece(RAMP, tD(i), out); break;
    case "people": piece(RAMP, tP(i), out); break;
    case "growth": piece(GROW, Math.log2((dcur[i] + 1) / (EP[1975][i] + 1)), out).multiplyScalar(0.62 + 0.38 * tD(i)); break;
    case "urban": {
      const c = shareC[i], t = shareT[i], r = Math.max(0, 1 - c - t);
      out.setRGB(URBC[0].r * c + URBC[1].r * t + URBC[2].r * r, URBC[0].g * c + URBC[1].g * t + URBC[2].g * r, URBC[0].b * c + URBC[1].b * t + URBC[2].b * r).multiplyScalar(0.5 + 0.5 * tD(i));
      break;
    }
    case "lights": piece(LIGHT, light[i] > 0 ? Math.log2(lpp[i] / lppMed) : -9, out); break;
    case "country": { const k = ccode[g]; out.copy(k === 255 ? NOCLS : BIV[CT[k].cls]).multiplyScalar(0.5 + 0.5 * tD(i)); break; }
  }
  if (selected >= 0 && layer.id === "country" && ccode[g] !== selected) out.multiplyScalar(0.22);
  return out;
}
function recolorAll() {
  for (let i = 0; i < N; i++) bars.setColorAt(i, colorFor(i, tmpC));
  if (hovered >= 0) bars.setColorAt(hovered, tmpC.set(0xffffff));
  bars.instanceColor.needsUpdate = true;
}

const SCALES = [
  { id: "lin", name: "Linear", f: x => x, max: 60, note: "True proportions. A handful of megacity cells tower over everything else." },
  { id: "sqrt", name: "Square root", f: x => Math.sqrt(x), max: 34, note: "Tames the tallest spikes so whole regions like the Ganges plain stand out." },
  { id: "log", name: "Log", f: null, max: 16, note: "Every tenfold step adds the same height, so sparse places show up too." },
];
let scale = SCALES[1];
function setTargets() {
  const pop = layer.metric === "pop";
  for (let i = 0; i < N; i++) {
    const x = scale.f ? scale.f(pop ? pcur[i] / pmax : dcur[i] / dmax) : (pop ? tP(i) : tD(i));
    target[i] = Math.max(0.15, x * scale.max);
  }
  $("scale-note").textContent = scale.note;
}

// ---------- year ----------
const yr = $("yr"), playBtn = $("play"), timeline = $("timeline");
let worldTotal = 0;
const EPOCHS = new Set(YEARS);
function setYear(y) {
  year = Math.round(y);
  densAt(year, dcur);
  worldTotal = 0;
  for (let i = 0; i < N; i++) { pcur[i] = dcur[i] * areaOf[i]; dens[cells[i]] = dcur[i]; worldTotal += pcur[i]; }
  yr.value = year;
  $("year").textContent = year;
  const note = !layer.timeline ? `${layer.name} uses ${layer.year} data` : year > 2025 ? "projection" : EPOCHS.has(year) ? "GHS-POP estimate" : "interpolated between estimates";
  $("tl-note").textContent = note;
  yr.setAttribute("aria-valuetext", `${year}, ${note}, ${fmt(worldTotal)} people`);
  $("tl-total").textContent = "≈ " + fmt(worldTotal) + " people";
  setTargets(); recolorAll(); updateCityList();
  if (layer.id === "growth") updateGrowthStat();
  if (reduceMotion) { cur.set(target); writeMatrices(); }
}
const tlTicks = $("tl-ticks");
for (const y of YEARS) {
  const s = document.createElement("span");
  s.style.left = ((y - 1975) / 55 * 100) + "%";
  s.textContent = y === 2030 ? "2030*" : y;
  if (y === 2025) s.className = "t2025";
  tlTicks.append(s);
}
yr.addEventListener("input", () => { setPlaying(false); setYear(+yr.value); });
let playing = false, yearF = 2025;
function setPlaying(on) {
  if (on && !layer.timeline) return;
  playing = on;
  if (on) { if (year >= 2030) setYear(1975); yearF = year; }
  $("play-icon").setAttribute("d", on ? "M5 3h3.5v14H5zM11.5 3H15v14h-3.5z" : "M5 3l12 7-12 7z");
  playBtn.setAttribute("aria-label", on ? "Pause" : "Play the years from 1975");
}
playBtn.addEventListener("click", () => setPlaying(!playing));

// ---------- legend + layer picker ----------
function radioGroup(container, items, isOn, render, onPick) {
  container.replaceChildren();
  const btns = items.map(it => {
    const b = document.createElement("button");
    b.type = "button"; b.setAttribute("role", "radio");
    render(b, it);
    b.addEventListener("click", () => pick(it));
    container.append(b);
    return b;
  });
  const sync = () => btns.forEach((b, k) => { const on = isOn(items[k]); b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
  function pick(it) { onPick(it); sync(); }
  container.addEventListener("keydown", e => {
    const k = btns.indexOf(document.activeElement);
    if (k < 0) return;
    const cols = container.classList.contains("layers") ? 2 : 1;
    const step = { ArrowRight: 1, ArrowDown: cols, ArrowLeft: -1, ArrowUp: -cols, Home: -k, End: btns.length - 1 - k }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const n = (k + step + btns.length) % btns.length;
    btns[n].focus(); pick(items[n]);
  });
  sync();
  return sync;
}
radioGroup($("layers"), LAYERS, it => it === layer, (b, it) => {
  b.className = "layer";
  b.innerHTML = `<span class="sw" style="background:${it.sw}" aria-hidden="true"></span><span><b>${it.name}</b><small>${it.sub}</small></span>`;
}, setLayer);
radioGroup($("scales"), SCALES, it => it === scale, (b, it) => { b.textContent = it.name; }, it => {
  scale = it; setTargets();
  if (reduceMotion) { cur.set(target); writeMatrices(); }
});

function ticksHtml(list) {
  return `<div class="ticks">${list.map(([pos, label], k) => `<span class="${k === 0 && pos < 0.02 ? "first" : ""}${pos > 0.98 ? "last" : ""}" style="left:${(pos * 100).toFixed(1)}%">${label}</span>`).join("")}</div>`;
}
const pos = (P, x) => (x - P.stops[0]) / (P.stops[P.stops.length - 1] - P.stops[0]);
function updateGrowthStat() {
  const s = $("growth-stat");
  if (!s) return;
  let p75 = 0; for (let i = 0; i < N; i++) p75 += EP[1975][i] * areaOf[i];
  s.textContent = `World: ${fmt(p75)} in 1975 → ${fmt(worldTotal)} in ${year} (×${(worldTotal / p75).toFixed(2)})`;
}
function setLayer(L) {
  const prev = layer;
  layer = L;
  if (L.id !== "country") selected = -1;
  timeline.classList.toggle("off", !L.timeline);
  yr.disabled = !L.timeline; playBtn.disabled = !L.timeline;
  if (!L.timeline) setPlaying(false);
  const lg = $("legend");
  if (L.id === "density" || L.id === "people") {
    const m = L.id === "density" ? dmax : pmax;
    const vals = L.id === "density" ? [1, 10, 100, 1000, 10000] : [100, 1000, 1e4, 1e5, 1e6];
    const t = v => Math.log10(1 + v) / Math.log10(1 + m);
    lg.innerHTML = `<h2>${L.id === "density" ? "People per km²" : "People in each cell"}</h2>
      <div class="ramp" style="background:${RAMP_CSS}"></div>
      ${ticksHtml(vals.filter(v => t(v) > 0.04 && t(v) < 0.86).map(v => [t(v), fmtShort(v)]).concat([[1, L.id === "density" ? Math.round(m).toLocaleString() : fmtShort(m)]]))}
      <p class="note">${L.id === "density" ? "How crowded each place is. Height and colour both show it." : "Total residents in each 28 km cell. Cells narrow toward the poles, so the same crowding holds fewer people in Scandinavia than in Nigeria."}</p>`;
  } else if (L.id === "growth") {
    lg.innerHTML = `<h2>Change in density since 1975</h2>
      <div class="ramp" style="background:${GROW_CSS}"></div>
      ${ticksHtml([[pos(GROW, -2), "÷4"], [pos(GROW, -1), "÷2"], [pos(GROW, 0), "same"], [pos(GROW, 1), "×2"], [pos(GROW, 2), "×4"], [pos(GROW, 3), "×8"]])}
      <p class="note">Blue cells lost people, amber and red gained. Bar height is density in the chosen year. Press play to watch it happen.</p>
      <p class="stat" id="growth-stat"></p>`;
    if (year < 1990) setYear(2025);
  } else if (L.id === "urban") {
    lg.innerHTML = `<h2>City, town or countryside</h2>
      <div class="keys1">
        <span><i style="background:var(--u0)"></i>Cities<em>${Math.round(URB[0] * 100)}%</em></span>
        <span><i style="background:var(--u1)"></i>Towns and suburbs<em>${Math.round(URB[1] * 100)}%</em></span>
        <span><i style="background:var(--u2)"></i>Rural<em>${Math.round(URB[2] * 100)}%</em></span>
      </div>
      <p class="note">Colour mixes the share of each cell's people living in each class, 2025. <strong>Cities</strong> are 1,500+ people per km² in clusters of 50,000 or more; <strong>towns</strong> are 300+ per km² in clusters of 5,000 or more. Percentages are shares of world population.</p>`;
  } else if (L.id === "lights") {
    lg.innerHTML = `<h2>Night light per person</h2>
      <div class="ramp" style="background:${LIGHT_CSS}"></div>
      ${ticksHtml([[pos(LIGHT, -4), "¹⁄₁₆×"], [pos(LIGHT, -2), "¼×"], [pos(LIGHT, 0), "world"], [pos(LIGHT, 1.5), "3×"], [pos(LIGHT, 3), "8×"]])}
      <p class="note">Satellite night light in each cell divided by the people living there, compared with the world as a whole. Bright and sparse: the US, the Gulf, oil and gas fields. Dim and crowded: much of sub-Saharan Africa, Myanmar, North Korea.</p>
      <p class="note">From NASA's 2016 Black Marble imagery, which is display-scaled: the brightest city cores max out, so dense cities read lower than they are. Treat it as relative.</p>`;
  } else {
    lg.innerHTML = `<h2>Big is not the same as crowded</h2>
      <div class="keys2">
        <span><i style="background:var(--b2)"></i>Big and sparse</span>
        <span><i style="background:var(--b3)"></i>Big and crowded</span>
        <span><i style="background:var(--b0)"></i>Small and sparse</span>
        <span><i style="background:var(--b1)"></i>Small and crowded</span>
      </div>
      <p class="note">Each country is split at the median country on total population and on average density, 2025.</p>
      <canvas id="scatter" role="img" aria-label="Countries plotted by total population and average density"></canvas>
      <p id="cmp-read"></p>
      <button class="btn" id="cmp-clear" hidden>Clear highlight</button>`;
    initScatter();
  }
  if (!L.timeline) setYear(L.year);
  else if (!prev.timeline && L.id !== "growth") setYear(2025);
  else setYear(year);
}

// ---------- country scatter ----------
const LABELED = new Set(["IND", "CHN", "USA", "RUS", "CAN", "AUS", "BGD", "SGP", "MNG", "NLD", "BRA", "ISL"]);
const SX = [4, 9.3], SY = [-1, 4.2], PAD = { l: 30, r: 8, t: 10, b: 22 };
let scHover = -1, scPts = [], sc = null, sctx = null;
const READ0 = "Each dot is a country. Point at one to read it; click or tap to fly there and highlight it.";
const describe = c => `<b>${esc(c.name)}</b> · ${fmt(c.pop)} people · ${fmtDen(c.dens)} per km² · ${CLS_NAME[c.cls]}`;
function initScatter() {
  sc = $("scatter"); sctx = sc.getContext("2d");
  $("cmp-read").innerHTML = selected >= 0 ? describe(CT[selected]) : READ0;
  $("cmp-clear").hidden = selected < 0;
  $("cmp-clear").addEventListener("click", () => selectCountry(-1));
  const nearest = e => {
    const r = sc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = e.pointerType === "touch" ? 400 : 100;
    for (const p of scPts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p.i; } }
    return best;
  };
  sc.addEventListener("pointermove", e => {
    const i = nearest(e);
    if (i === scHover) return;
    scHover = i;
    $("cmp-read").innerHTML = i >= 0 ? describe(CT[i]) : selected >= 0 ? describe(CT[selected]) : READ0;
    drawScatter();
  });
  sc.addEventListener("pointerleave", () => { scHover = -1; $("cmp-read").innerHTML = selected >= 0 ? describe(CT[selected]) : READ0; drawScatter(); });
  sc.addEventListener("click", e => { const i = nearest(e); if (i >= 0) selectCountry(i); });
  requestAnimationFrame(drawScatter);
}
function drawScatter() {
  if (!sc || !sc.isConnected) return;
  const w = sc.clientWidth, h = sc.clientHeight, dpr = devicePixelRatio || 1;
  if (!w) return;
  sc.width = w * dpr; sc.height = h * dpr;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.clearRect(0, 0, w, h);
  const X = v => PAD.l + (Math.log10(v) - SX[0]) / (SX[1] - SX[0]) * (w - PAD.l - PAD.r);
  const Y = v => PAD.t + (1 - (Math.log10(Math.max(v, 0.1)) - SY[0]) / (SY[1] - SY[0])) * (h - PAD.t - PAD.b);
  const muted = css("--muted"), rule = css("--rule"), ink = css("--ink");
  sctx.font = "10px 'IBM Plex Mono', monospace";
  sctx.lineWidth = 1;
  for (const [v, l] of [[1e4, "10k"], [1e5, "100k"], [1e6, "1M"], [1e7, "10M"], [1e8, "100M"], [1e9, "1B"]]) {
    const x = Math.round(X(v)) + 0.5;
    sctx.strokeStyle = rule; sctx.beginPath(); sctx.moveTo(x, PAD.t); sctx.lineTo(x, h - PAD.b); sctx.stroke();
    sctx.fillStyle = muted; sctx.textAlign = "center"; sctx.fillText(l, x, h - 8);
  }
  for (const [v, l] of [[1, "1"], [10, "10"], [100, "100"], [1000, "1k"], [10000, "10k"]]) {
    const y = Math.round(Y(v)) + 0.5;
    sctx.strokeStyle = rule; sctx.beginPath(); sctx.moveTo(PAD.l, y); sctx.lineTo(w - PAD.r, y); sctx.stroke();
    sctx.fillStyle = muted; sctx.textAlign = "right"; sctx.fillText(l, PAD.l - 4, y + 3);
  }
  sctx.setLineDash([3, 3]); sctx.strokeStyle = muted;
  sctx.beginPath(); sctx.moveTo(X(medPop), PAD.t); sctx.lineTo(X(medPop), h - PAD.b); sctx.stroke();
  sctx.beginPath(); sctx.moveTo(PAD.l, Y(medDen)); sctx.lineTo(w - PAD.r, Y(medDen)); sctx.stroke();
  sctx.setLineDash([]);
  sctx.fillStyle = muted; sctx.textAlign = "left"; sctx.fillText("per km² ↑", PAD.l + 3, PAD.t + 8);
  sctx.textAlign = "right"; sctx.fillText("people →", w - PAD.r - 2, h - PAD.b - 4);
  scPts = CT.map((c, i) => ({ i, x: X(c.pop), y: Y(c.dens) }));
  for (const p of scPts) {
    const c = CT[p.i], on = p.i === selected || p.i === scHover;
    sctx.globalAlpha = selected >= 0 && !on ? 0.35 : 0.9;
    sctx.fillStyle = "#" + BIV[c.cls].getHexString();
    sctx.beginPath(); sctx.arc(p.x, p.y, on ? 5 : 3, 0, Math.PI * 2); sctx.fill();
    if (on) { sctx.strokeStyle = ink; sctx.stroke(); }
  }
  sctx.globalAlpha = 1;
  sctx.font = "600 10.5px sans-serif"; sctx.fillStyle = ink;
  const placed = [];
  const order = [...scPts].sort((a, b) => (b.i === selected || b.i === scHover) - (a.i === selected || a.i === scHover));
  for (const p of order) {
    const c = CT[p.i];
    if (!LABELED.has(c.a3) && p.i !== selected && p.i !== scHover) continue;
    const name = c.a3 === "USA" ? "USA" : c.name;
    const tw = sctx.measureText(name).width, right = p.x + tw + 8 > w;
    const x0 = right ? p.x - 6 - tw : p.x + 6, bx = [x0 - 2, p.y - 7, x0 + tw + 2, p.y + 6];
    if (placed.some(b => bx[0] < b[2] && bx[2] > b[0] && bx[1] < b[3] && bx[3] > b[1])) continue;
    placed.push(bx);
    sctx.textAlign = "left";
    sctx.fillText(name, x0, p.y + 3);
  }
}
function selectCountry(i) {
  selected = i;
  if ($("cmp-clear")) { $("cmp-clear").hidden = i < 0; $("cmp-read").innerHTML = i >= 0 ? describe(CT[i]) : READ0; }
  if (i >= 0) { const c = CT[i]; flyTo(c.lat, c.lon, Math.min(430, 150 + Math.sqrt(c.area) * 0.06)); }
  recolorAll(); drawScatter();
}

// ---------- places, search, labels ----------
const cellAt = (lat, lon) => {
  const r = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / STEP)));
  const c = ((Math.floor((lon + 180) / STEP) % W) + W) % W;
  return r * W + c;
};
const PLACES = [["Dhaka", 23.81, 90.41], ["Delhi", 28.61, 77.21], ["Tokyo", 35.68, 139.69], ["Shanghai", 31.23, 121.47], ["Cairo", 30.04, 31.24], ["Lagos", 6.52, 3.38], ["São Paulo", -23.55, -46.63], ["Mexico City", 19.43, -99.13], ["New York", 40.71, -74.01], ["Boston", 42.36, -71.06]];
const placeVals = [];
for (const [name, lat, lon] of PLACES) {
  const li = document.createElement("li"), btn = document.createElement("button");
  const a = document.createElement("span"); a.textContent = name;
  const b = document.createElement("span");
  btn.append(a, b); li.append(btn); $("cities").append(li);
  btn.addEventListener("click", () => flyTo(lat, lon));
  placeVals.push([b, cellAt(lat, lon)]);
}
function updateCityList() { for (const [b, g] of placeVals) b.textContent = fmtDen(dens[g]) + " /km²"; }

const spinIn = $("spin");
function setSpin(on) { controls.autoRotate = on; spinIn.checked = on; }
spinIn.addEventListener("change", () => setSpin(spinIn.checked));
setSpin(!reduceMotion);
$("lines").addEventListener("change", e => { lineGroup.visible = e.target.checked; });
const labelLayer = $("labels");
let showNames = true;
$("names").addEventListener("change", e => { showNames = e.target.checked; labelLayer.hidden = !showNames; });

let flight = null, zoomGoal = null;
function flyTo(lat, lon, dist) {
  setSpin(false); zoomGoal = null;
  const from = orbit.position.clone(), dist0 = from.length();
  flight = { t: 0, from: from.normalize(), to: toVec(lat, lon, 1), dist0, dist1: dist || Math.min(dist0, 230), dur: reduceMotion ? 1 : 1600 };
  hoverCell(cellAt(lat, lon));
}
function setTilt(v) {
  tiltTarget = Math.max(0, Math.min(72, Math.round(v)));
  $("tilt").value = tiltTarget; $("tilt-out").textContent = tiltTarget + "°";
  $("tiltbtn").setAttribute("aria-pressed", String(tiltTarget > 0));
  if (reduceMotion) tilt = tiltTarget;
}
$("tilt").addEventListener("input", e => setTilt(+e.target.value));
$("tiltbtn").addEventListener("click", () => setTilt(tiltTarget > 0 ? 0 : 60));
function zoomBy(f) { setSpin(false); flight = null; zoomGoal = Math.max(controls.minDistance, Math.min(controls.maxDistance, (zoomGoal || orbit.position.length()) * f)); }
$("zin").addEventListener("click", () => zoomBy(0.75));
$("zout").addEventListener("click", () => zoomBy(1.33));
function resetView() { setTilt(0); flyTo(HOME[0], HOME[1], HOME[2]); hoverCell(-1); hideTip(); }
$("home").addEventListener("click", resetView);

const CITY = NE.cities.map(([name, lat, lon, pop, country]) => ({ name, lat, lon, pop, country, inst: instOf[cellAt(lat, lon)], n: toVec(lat, lon, 1) }));
const seenName = new Set();
for (const c of CITY) {
  const k = c.name + ", " + c.country;
  if (seenName.has(k)) continue;
  seenName.add(k);
  const o = document.createElement("option"); o.value = k; $("city-list").append(o);
}
const search = $("search");
function doSearch() {
  const v = search.value.trim().toLowerCase();
  if (!v) return;
  const c = CITY.find(c => (c.name + ", " + c.country).toLowerCase() === v) || CITY.find(c => c.name.toLowerCase() === v) || CITY.find(c => c.name.toLowerCase().startsWith(v));
  if (c) { flyTo(c.lat, c.lon, 175); search.setCustomValidity(""); search.blur(); }
  else { search.setCustomValidity("No city by that name. Try a city of 250,000 or more."); search.reportValidity(); }
}
search.addEventListener("change", doSearch);
search.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
search.addEventListener("input", () => search.setCustomValidity(""));
$("go").addEventListener("click", doSearch);

const POOL = [];
const fmtPop = p => p >= 1e6 ? (p / 1e6).toFixed(p >= 1e7 ? 0 : 1) + "M" : Math.round(p / 1e3) + "k";
function labelEl(i) {
  while (POOL.length <= i) {
    const b = document.createElement("button");
    b.className = "lbl"; b.tabIndex = -1;
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
    _p.copy(c.n).multiplyScalar(R + (c.inst >= 0 ? cur[c.inst] : 0) + 0.3);
    _v.copy(camera.position).sub(_p);
    if (_v.dot(c.n) < _v.length() * 0.12) continue;
    _p.project(camera);
    if (_p.z > 1) continue;
    const x = (_p.x + 1) / 2 * w, y = (1 - _p.y) / 2 * h, big = c.pop >= 1e7;
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
    L.el.style.transform = `translate(${(x - 4.5).toFixed(1)}px, ${(y - lh / 2).toFixed(1)}px)`;
  }
  for (let i = used; i < POOL.length; i++) if (!POOL[i].el.hidden) POOL[i].el.hidden = true;
}

// ---------- reading a place ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), sphere = new THREE.Sphere(new THREE.Vector3(), R), hit = new THREE.Vector3();
const tip = $("tip");
function hoverCell(g) {
  const i = g >= 0 ? instOf[g] : -1;
  if (hovered >= 0) bars.setColorAt(hovered, colorFor(hovered, tmpC));
  hovered = i;
  if (i >= 0) bars.setColorAt(i, tmpC.set(0xffffff));
  bars.instanceColor.needsUpdate = true;
}
function hideTip() { tip.hidden = true; }
function layerLine(i) {
  switch (layer.id) {
    case "growth": { const a = EP[1975][i], r = (dcur[i] + 1) / (a + 1); return `${r >= 1 ? "×" + r.toFixed(r < 10 ? 1 : 0) : "÷" + (1 / r).toFixed(1)} since 1975 (${fmtDen(a)} → ${fmtDen(dcur[i])} per km²)`; }
    case "urban": { const c = shareC[i], t = shareT[i]; return `${Math.round(c * 100)}% city · ${Math.round(t * 100)}% town · ${Math.round(Math.max(0, 1 - c - t) * 100)}% rural`; }
    case "lights": return light[i] > 0 ? `Light per person: ${(lpp[i] / lppMed).toFixed(lpp[i] / lppMed < 10 ? 1 : 0)}× the world figure` : "No measurable night light";
    default: return "";
  }
}
function probe(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectSphere(sphere, hit)) { hoverCell(-1); hideTip(); return; }
  const lat = Math.asin(hit.y / R) * 180 / Math.PI, lon = Math.atan2(hit.x, hit.z) * 180 / Math.PI;
  const g = cellAt(lat, lon), d = dens[g], r = Math.floor(g / W), i = instOf[g];
  hoverCell(g);
  tip.replaceChildren();
  const s = document.createElement("strong");
  s.textContent = d < 0.5 ? "Uninhabited" : fmtDen(d) + " per km²";
  const p = document.createElement("div");
  p.textContent = d < 0.5 ? "Fewer than one person per km²" : `≈ ${fmt(d * cellArea(r))} people in this cell, ${year}`;
  tip.append(s, p);
  if (i >= 0) { const extra = layerLine(i); if (extra) { const x2 = document.createElement("div"); x2.className = "x"; x2.textContent = extra; tip.append(x2); } }
  if (ccode[g] !== 255) {
    const c = CT[ccode[g]], cl = document.createElement("div");
    cl.textContent = `${c.name}: ${fmt(c.pop)} people, ${fmtDen(c.dens)} per km² (${CLS_NAME[c.cls]})`;
    tip.append(cl);
  }
  const m = document.createElement("div"); m.className = "m";
  const cLat = 90 - (r + 0.5) * STEP, cLon = -180 + (g % W + 0.5) * STEP;
  m.textContent = `${Math.abs(cLat).toFixed(2)}°${cLat >= 0 ? "N" : "S"} ${Math.abs(cLon).toFixed(2)}°${cLon >= 0 ? "E" : "W"}`;
  tip.append(m);
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - tw - 8)) + "px";
  tip.style.top = Math.max(8, Math.min(y + 14, innerHeight - th - 8)) + "px";
}
let pending = null, downAt = null;
el.addEventListener("pointermove", e => { if (e.pointerType === "mouse" && !e.buttons) pending = [e.clientX, e.clientY]; });
el.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { pending = null; hoverCell(-1); hideTip(); } });
el.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; setSpin(false); flight = null; zoomGoal = null; if (e.pointerType !== "mouse") hideTip(); $("reticle").hidden = true; });
el.addEventListener("pointerup", e => {
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < (e.pointerType === "mouse" ? 6 : 12)) probe(e.clientX, e.clientY);
  downAt = null;
});
el.addEventListener("wheel", () => { setSpin(false); zoomGoal = null; }, { passive: true });

// keyboard: the globe itself is focusable; the centre reticle marks the place being read
const sph = new THREE.Spherical();
function centreXY() { _p.copy(_f).project(camera); return [(_p.x + 1) / 2 * innerWidth, (1 - _p.y) / 2 * innerHeight]; }
let kbRead = false;
function rotateBy(dLon, dLat) {
  setSpin(false); flight = null;
  sph.setFromVector3(orbit.position);
  sph.theta += dLon; sph.phi = Math.max(0.15, Math.min(Math.PI - 0.15, sph.phi - dLat));
  orbit.position.setFromSpherical(sph);
  kbRead = true;
}
el.addEventListener("keydown", e => {
  const a = (e.shiftKey ? 12 : 4) * Math.PI / 180 * Math.min(1, (orbit.position.length() - R) / 200 + 0.15);
  switch (e.key) {
    case "ArrowLeft": rotateBy(-a, 0); break;
    case "ArrowRight": rotateBy(a, 0); break;
    case "ArrowUp": rotateBy(0, a); break;
    case "ArrowDown": rotateBy(0, -a); break;
    case "+": case "=": zoomBy(0.8); break;
    case "-": case "_": zoomBy(1.25); break;
    case "PageUp": setTilt(tiltTarget + 12); break;
    case "PageDown": setTilt(tiltTarget - 12); break;
    case "Home": resetView(); break;
    case "Enter": kbRead = true; break;
    default: return;
  }
  e.preventDefault();
});
el.addEventListener("focus", () => { if (el.matches(":focus-visible")) { $("reticle").hidden = false; kbRead = true; } });
el.addEventListener("blur", () => { $("reticle").hidden = true; });
document.addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input:not([type=range]):not([type=checkbox]), textarea")) return;
  if (e.key === "/") { e.preventDefault(); search.focus(); }
  else if (e.key === " " && (e.target === document.body || e.target === el)) { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === "Escape") { hideTip(); hoverCell(-1); }
});

// ---------- layout ----------
const sheet = $("sheet"), toggle = $("toggle");
function setSheet(open) {
  sheet.classList.toggle("collapsed", !open);
  toggle.textContent = open ? "Hide" : "Layers";
  toggle.setAttribute("aria-expanded", String(open));
}
toggle.addEventListener("click", () => setSheet(sheet.classList.contains("collapsed")));
if (innerWidth <= 760) setSheet(false);
function fit() {
  const w = innerWidth, h = innerHeight, mobile = w <= 760;
  document.documentElement.style.setProperty("--sheet-h", (mobile ? sheet.offsetHeight : 0) + "px");
  camera.aspect = w / h;
  const tlH = timeline.offsetHeight + 16;
  const sx = mobile ? 0 : (sheet.offsetWidth + 16) / 2;
  const sy = mobile ? (sheet.offsetHeight + tlH) / 2 : tlH / 2;
  camera.setViewOffset(w, h, -sx, sy, w, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  drawScatter();
}
new ResizeObserver(fit).observe(sheet);
addEventListener("resize", fit);

// ---------- start ----------
document.querySelector('#scales [aria-checked="true"]');
setLayer(LAYERS[0]);
fit();
if (reduceMotion) { cur.set(target); writeMatrices(); }

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let last = performance.now(), growDelay = reduceMotion ? 0 : 300, yearAcc = 0;
renderer.setAnimationLoop(now => {
  const dt = Math.min(64, now - last); last = now;
  if (playing) {
    yearF = Math.min(2030, yearF + dt / 1000 * 4.5);
    if (Math.round(yearF) !== year) setYear(yearF);
    if (yearF >= 2030) setPlaying(false);
  }
  if (growDelay > 0) growDelay -= dt;
  else {
    let moving = false;
    const k = 1 - Math.pow(0.0025, dt / 1000);
    for (let i = 0; i < N; i++) { const diff = target[i] - cur[i]; if (Math.abs(diff) > 0.01) { cur[i] += diff * k; moving = true; } }
    if (moving) writeMatrices();
  }
  if (flight) {
    flight.t = Math.min(1, flight.t + dt / flight.dur);
    const e = ease(flight.t);
    orbit.position.copy(flight.from.clone().lerp(flight.to, e).normalize().multiplyScalar(flight.dist0 + (flight.dist1 - flight.dist0) * e));
    if (flight.t >= 1) flight = null;
  }
  if (zoomGoal) {
    const L = orbit.position.length(), n = L + (zoomGoal - L) * (reduceMotion ? 1 : 1 - Math.pow(0.002, dt / 1000));
    orbit.position.setLength(n);
    if (Math.abs(n - zoomGoal) < 0.3) zoomGoal = null;
  }
  controls.rotateSpeed = Math.min(1, (orbit.position.length() - R) / 200);
  controls.update();
  tilt += (tiltTarget - tilt) * (reduceMotion ? 1 : 1 - Math.pow(0.004, dt / 1000));
  updateRig();
  placeLabels();
  const [cx, cy] = centreXY();
  const ret = $("reticle");
  if (!ret.hidden) { ret.style.left = cx + "px"; ret.style.top = cy + "px"; }
  if (kbRead) { kbRead = false; probe(cx, cy); }
  if (pending) { const [x, y] = pending; pending = null; probe(x, y); }
  renderer.render(scene, camera);
});
})();
})();
