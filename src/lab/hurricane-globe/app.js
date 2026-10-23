import {
  THREE, OrbitControls, LineSegments2, LineSegmentsGeometry, LineMaterial, CSS2DRenderer, CSS2DObject,
  feature, mesh, geoEquirectangular, geoPath,
} from '/lab/hurricane-globe/vendor/libs-three-0.160.0.js';

// ---------- constants ----------

const R = 1;
const HOUR = 36e5;
const DEG = Math.PI / 180;
const EARTH_KM = 6371;
const CELL = 2; // density grid, degrees
const $ = (id) => document.getElementById(id);

// Saffir-Simpson thresholds (kt), colors after the NHC/Wikipedia track-map scheme
const CATS = [
  { key: 'TD', name: 'Tropical depression', min: 0, hex: '#5ebaff' },
  { key: 'TS', name: 'Tropical storm', min: 34, hex: '#00faf4' },
  { key: 'C1', name: 'Category 1', min: 64, hex: '#ffffcc' },
  { key: 'C2', name: 'Category 2', min: 83, hex: '#ffe775' },
  { key: 'C3', name: 'Category 3', min: 96, hex: '#ffc140' },
  { key: 'C4', name: 'Category 4', min: 113, hex: '#ff8f20' },
  { key: 'C5', name: 'Category 5', min: 137, hex: '#ff6060' },
];
CATS.forEach((c) => (c.color = new THREE.Color(c.hex)));
const NONTROP = { hex: '#7d8794', color: new THREE.Color('#7d8794') };
// HURDAT2 status codes (index into data.status): EX, LO, WV, DB are not tropical
const NONTROP_STATUS = new Set([3, 6, 7, 8]);
const TROPICAL_FOR_ACE = new Set([1, 2, 5]); // TS, HU, SS

// wind radii thresholds, drawn innermost first so the stencil keeps one color per pixel
const WIND_LEVELS = [
  { kt: 64, slice: [8, 12], hex: '#ff6060', opacity: 0.3 },
  { kt: 50, slice: [4, 8], hex: '#ffc140', opacity: 0.22 },
  { kt: 34, slice: [0, 4], hex: '#00faf4', opacity: 0.15 },
];

const DENSITY_RAMP = ['#2a0b4a', '#6a1b6e', '#b8336a', '#f0605d', '#fca65f', '#fcfdbf'].map((h) => new THREE.Color(h));

// HURDAT2 for the two NHC basins, IBTrACS for the rest; one file per basin
const BASINS = [
  { key: 'AL', name: 'North Atlantic', short: 'N. Atlantic', file: '/lab/hurricane-globe/data/storms-AL.json' },
  { key: 'EP', name: 'Eastern & Central Pacific', short: 'E. Pacific', file: '/lab/hurricane-globe/data/storms-EP.json' },
  { key: 'WP', name: 'Western Pacific', short: 'W. Pacific', file: '/lab/hurricane-globe/data/storms-WP.json' },
  { key: 'NI', name: 'North Indian Ocean', short: 'N. Indian', file: '/lab/hurricane-globe/data/storms-NI.json' },
  { key: 'SI', name: 'South Indian Ocean', short: 'S. Indian', file: '/lab/hurricane-globe/data/storms-SI.json' },
  { key: 'SP', name: 'South Pacific', short: 'S. Pacific', file: '/lab/hurricane-globe/data/storms-SP.json' },
  { key: 'SA', name: 'South Atlantic', short: 'S. Atlantic', file: '/lab/hurricane-globe/data/storms-SA.json' },
];
const BASIN = Object.fromEntries(BASINS.map((b) => [b.key, b]));

// what forecasters in each basin call a storm of this (1-minute) peak wind
function regionalName(basin, w) {
  if (basin === 'AL' || basin === 'EP') return w >= 64 ? 'Hurricane' : w >= 34 ? 'Tropical storm' : 'Tropical depression';
  if (basin === 'WP') return w >= 130 ? 'Super typhoon' : w >= 64 ? 'Typhoon' : w >= 34 ? 'Tropical storm' : 'Tropical depression';
  if (basin === 'NI') return w >= 64 ? 'Very severe cyclonic storm' : w >= 48 ? 'Severe cyclonic storm' : w >= 34 ? 'Cyclonic storm' : 'Depression';
  return w >= 64 ? 'Severe tropical cyclone' : w >= 34 ? 'Tropical cyclone' : 'Tropical low';
}

const PLACES = [
  ['Lynn, MA', 42.4668, -70.9495],
  ['New York, NY', 40.7128, -74.006],
  ['Cape Hatteras, NC', 35.2235, -75.5288],
  ['Charleston, SC', 32.7765, -79.9311],
  ['Miami, FL', 25.7617, -80.1918],
  ['Tampa, FL', 27.9506, -82.4572],
  ['New Orleans, LA', 29.9511, -90.0715],
  ['Houston, TX', 29.7604, -95.3698],
  ['San Juan, PR', 18.4655, -66.1057],
  ['Havana, Cuba', 23.1136, -82.3666],
  ['Cancún, Mexico', 21.1619, -86.8515],
  ['Bermuda', 32.3078, -64.7505],
  ['Acapulco, Mexico', 16.8531, -99.8237],
  ['Cabo San Lucas, Mexico', 22.8905, -109.9167],
  ['Honolulu, HI', 21.3069, -157.8583],
  ['Guam', 13.4443, 144.7937],
  ['Tokyo, Japan', 35.6762, 139.6503],
  ['Okinawa, Japan', 26.2124, 127.6809],
  ['Shanghai, China', 31.2304, 121.4737],
  ['Taipei, Taiwan', 25.033, 121.5654],
  ['Hong Kong', 22.3193, 114.1694],
  ['Manila, Philippines', 14.5995, 120.9842],
  ['Tacloban, Philippines', 11.2433, 125.0045],
  ['Busan, South Korea', 35.1796, 129.0756],
  ['Da Nang, Vietnam', 16.0544, 108.2022],
  ['Kolkata, India', 22.5726, 88.3639],
  ['Mumbai, India', 19.076, 72.8777],
  ['Chittagong, Bangladesh', 22.3569, 91.7832],
  ['Yangon, Myanmar', 16.8409, 96.1735],
  ['Muscat, Oman', 23.588, 58.3829],
  ['Darwin, Australia', -12.4634, 130.8456],
  ['Cairns, Australia', -16.9186, 145.7781],
  ['Port Hedland, Australia', -20.3106, 118.6011],
  ['Suva, Fiji', -18.1248, 178.4501],
  ['Port Vila, Vanuatu', -17.7333, 168.3273],
  ['Réunion', -20.8823, 55.4504],
  ['Toamasina, Madagascar', -18.1492, 49.4023],
  ['Beira, Mozambique', -19.8436, 34.8389],
];

const catIndex = (w) => {
  let i = 0;
  for (let k = 0; k < CATS.length; k++) if (w >= CATS[k].min) i = k;
  return i;
};
const fixColor = (status, w) => (NONTROP_STATUS.has(status) ? NONTROP.color : CATS[catIndex(w)].color);
const wrapLon = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);

const state = {
  basins: new Set(BASINS.map((b) => b.key)),
  y0: 1842,
  y1: 2026,
  minW: 34,
  name: '',
  extrude: true,
  mode: 'tracks', // or 'density'
  landfalls: false,
  swath: true,
  selected: null,
  query: null, // { lat, lon, km, label, results }
  picking: false,
  play: null,
};

// ---------- geo helpers ----------

function toVec(lat, lon, r = R, out = new THREE.Vector3()) {
  const phi = lat * DEG, lam = lon * DEG;
  return out.set(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
}

function toLatLon(v) {
  const n = v.clone().normalize();
  return [Math.asin(n.y) / DEG, Math.atan2(-n.z, n.x) / DEG];
}

// great-circle destination from a start point, bearing (deg) and distance (km)
function dest(lat, lon, brg, km) {
  const d = km / EARTH_KM, p1 = lat * DEG, t = brg * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = lon * DEG + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / DEG, wrapLon(l2 / DEG)];
}

const alt = (w) => R + 0.003 + (state.extrude ? (w / 170) * 0.16 : 0);

// fix interpolated at time t (ms), handling the antimeridian; radii come back as the 8th element
function interp(s, t) {
  const pts = s.pts;
  const h = (t - s.t0) / HOUR;
  let i = 1;
  while (i < pts.length && pts[i][4] < h) i++;
  if (i >= pts.length) return [...pts.at(-1), s.r?.at(-1) || 0];
  const a = pts[i - 1], b = pts[i];
  const f = (h - a[4]) / (b[4] - a[4] || 1);
  let r = 0;
  const ra = s.r?.[i - 1], rb = s.r?.[i];
  if (ra && rb) r = ra.map((v, k) => v + (rb[k] - v) * f);
  else if (ra || rb) r = ra || rb;
  return [a[0] + (b[0] - a[0]) * f, a[1] + wrapLon(b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, 0, h, a[5], 0, r];
}

function aceOf(s, tMax = Infinity) {
  let sum = 0;
  for (const p of s.pts) {
    const t = s.t0 + p[4] * HOUR;
    if (t > tMax) break;
    const d = new Date(t);
    if (d.getUTCMinutes() === 0 && d.getUTCHours() % 6 === 0 && p[2] >= 34 && TROPICAL_FOR_ACE.has(p[5])) sum += p[2] * p[2];
  }
  return sum / 1e4;
}

// closest approach of each storm's track to a point, plus the strongest wind inside the radius
function nearPoint(list, lat0, lon0, km) {
  const kx = 111.32 * Math.cos(lat0 * DEG), ky = 110.57;
  const out = [];
  for (const s of list) {
    let best = Infinity, bw = 0, px = 0, py = 0, pw = 0, pdl = 0;
    s.pts.forEach((p, i) => {
      const dl = wrapLon(p[1] - lon0);
      const x = dl * kx, y = (p[0] - lat0) * ky;
      let d = Math.hypot(x, y), w = p[2];
      // a step across the query point's antimeridian wraps from +180° to -180° in
      // local x, and its straight segment would falsely sweep past the query point
      const wrapped = Math.abs(dl - pdl) > 180;
      pdl = dl;
      if (i > 0 && !wrapped) {
        const dx = x - px, dy = y - py, len2 = dx * dx + dy * dy || 1;
        const t = Math.min(1, Math.max(0, -(px * dx + py * dy) / len2));
        d = Math.hypot(px + t * dx, py + t * dy);
        w = pw + t * (p[2] - pw);
      }
      if (d < best) best = d;
      if (d <= km) bw = Math.max(bw, w);
      px = x; py = y; pw = p[2];
    });
    if (best <= km) out.push({ s, dist: best, w: Math.round(bw) });
  }
  return out;
}

// ---------- scene ----------

const container = $('globe');
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 200);
toVec(24, -72, 2.9, camera.position);
scene.add(camera);

// only the density columns are lit; everything else is unlit
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-1, 1.5, 2);
camera.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.15;
controls.maxDistance = 6;

// stars
{
  const n = 2500, pos = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) v.randomDirection().multiplyScalar(60 + Math.random() * 40).toArray(pos, i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8aa0b8, size: 0.12, sizeAttenuation: true })));
}

// atmosphere rim
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(R * 1.08, 64, 64),
  new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vP;
      void main(){ float d = abs(dot(normalize(-vP), vN)); float f = pow(smoothstep(0.0, 0.4, d), 2.5); gl_FragColor = vec4(0.25, 0.55, 1.0, 1.0) * f * 0.55; }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }),
));

const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 128), new THREE.MeshBasicMaterial({ color: 0x08131f }));
scene.add(globe);
const globeSphere = new THREE.Sphere(new THREE.Vector3(), R);

function lineLayer(positions, color, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

function graticule(step = 10) {
  const pos = [], a = new THREE.Vector3(), b = new THREE.Vector3(), r = R + 0.0005;
  for (let lon = -180; lon < 180; lon += step)
    for (let lat = -90; lat < 90; lat += 2) {
      toVec(lat, lon, r, a); toVec(lat + 2, lon, r, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  for (let lat = -80; lat <= 80; lat += step)
    for (let lon = -180; lon < 180; lon += 2) {
      toVec(lat, lon, r, a); toVec(lat, lon + 2, r, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  return lineLayer(pos, 0x1d3a55, 0.45);
}

function meshLines(mls, color, opacity) {
  const pos = [], a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const line of mls.coordinates)
    for (let i = 1; i < line.length; i++) {
      toVec(line[i - 1][1], line[i - 1][0], R + 0.0008, a);
      toVec(line[i][1], line[i][0], R + 0.0008, b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  return lineLayer(pos, color, opacity);
}

// land fill painted into an equirectangular texture (d3-geo handles antimeridian cuts)
function landTexture(world) {
  const W = 4096, H = 2048;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#08131f';
  ctx.fillRect(0, 0, W, H);
  const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  ctx.beginPath();
  geoPath(proj, ctx)(feature(world, world.objects.land));
  ctx.fillStyle = '#18263a';
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 8;
  g.stroke();
  return new THREE.CanvasTexture(c);
}
const dotTex = dotTexture();

// ---------- track layer ----------

const lineMats = [];
function makeLineMat(width) {
  const m = new LineMaterial({
    vertexColors: true,
    linewidth: width,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  m.resolution.set(innerWidth, innerHeight);
  lineMats.push(m);
  return m;
}

const tracks = new LineSegments2(new LineSegmentsGeometry(), makeLineMat(1.3));
scene.add(tracks);

function setTrackGeometry(pos, col) {
  tracks.geometry.dispose();
  const g = new LineSegmentsGeometry();
  if (pos.length) {
    g.setPositions(pos);
    g.setColors(col);
  }
  tracks.geometry = g;
  tracks.userData.empty = pos.length === 0;
}

// segments for every storm in list, optionally cut off at time tCut
function trackArrays(list, tCut = Infinity) {
  const pos = [], col = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const s of list) {
    if (s.t0 > tCut) continue;
    const pts = s.pts;
    let prev = pts[0], prevC = fixColor(prev[5], prev[2]);
    toVec(prev[0], prev[1], alt(prev[2]), a);
    for (let i = 1; i < pts.length; i++) {
      let p = pts[i];
      const cut = s.t0 + p[4] * HOUR > tCut;
      if (cut) p = interp(s, tCut);
      const c = fixColor(p[5], p[2]);
      toVec(p[0], p[1], alt(p[2]), b);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      col.push(prevC.r, prevC.g, prevC.b, c.r, c.g, c.b);
      if (cut) break;
      a.copy(b); prevC = c;
    }
  }
  return [pos, col];
}

// every fix for screen-space hover picking, binned by 5° of ground position so a
// hover only projects the fixes near the point under the cursor
const PICK_BIN = 5;
const pickBin = (lat, lon) => Math.floor((lat + 90) / PICK_BIN) * 1000 + Math.floor((wrapLon(lon) + 180) / PICK_BIN);
let pick = { xyz: new Float32Array(0), ref: [], bins: new Map() };
function buildPick(list) {
  const n = list.reduce((k, s) => k + s.pts.length, 0);
  const xyz = new Float32Array(n * 3), ref = new Array(n), bins = new Map(), v = new THREE.Vector3();
  let k = 0;
  for (const s of list)
    for (const p of s.pts) {
      toVec(p[0], p[1], alt(p[2]), v).toArray(xyz, k * 3);
      ref[k] = s;
      const key = pickBin(p[0], p[1]);
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(k++);
    }
  pick = { xyz, ref, bins };
}

// ---------- landfall layer ----------

const landfallPts = new THREE.Points(
  new THREE.BufferGeometry(),
  new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, map: dotTex, alphaTest: 0.5 }),
);
scene.add(landfallPts);

function buildLandfalls(list) {
  const pos = [], col = [], v = new THREE.Vector3();
  let n = 0;
  for (const s of list)
    for (const p of s.pts)
      if (p[6]) {
        toVec(p[0], p[1], R + 0.003, v);
        const c = fixColor(p[5], p[2]);
        pos.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
        n++;
      }
  landfallPts.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  landfallPts.geometry = g;
  return n;
}

// ---------- density columns ----------

const MAX_CELLS = (360 / CELL) * (180 / CELL);
const columnGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
const columns = new THREE.InstancedMesh(columnGeo, new THREE.MeshLambertMaterial(), MAX_CELLS);
columns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
columns.setColorAt(0, new THREE.Color());
columns.count = 0;
scene.add(columns);
let density = { cells: new Map(), max: 0 };

const cellKey = (lat, lon) =>
  Math.min(180 / CELL - 1, Math.floor((lat + 90) / CELL)) * (360 / CELL) + Math.min(360 / CELL - 1, Math.floor((wrapLon(lon) + 180) / CELL));

function rampColor(f, out) {
  const x = Math.min(0.9999, Math.max(0, f)) * (DENSITY_RAMP.length - 1);
  const i = Math.floor(x);
  return out.copy(DENSITY_RAMP[i]).lerp(DENSITY_RAMP[i + 1], x - i);
}

// count distinct storms whose tropical track crosses each cell, sampling segments every half degree
function buildDensity(list) {
  const cells = new Map();
  for (const s of list) {
    const seen = new Set();
    const pts = s.pts;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (NONTROP_STATUS.has(p[5])) continue;
      seen.add(cellKey(p[0], p[1]));
      const q = pts[i + 1];
      if (!q || NONTROP_STATUS.has(q[5])) continue;
      const dlon = wrapLon(q[1] - p[1]), dlat = q[0] - p[0];
      const steps = Math.ceil(Math.max(Math.abs(dlon), Math.abs(dlat)) / 0.5);
      for (let k = 1; k < steps; k++) seen.add(cellKey(p[0] + (dlat * k) / steps, p[1] + (dlon * k) / steps));
    }
    for (const key of seen) cells.set(key, (cells.get(key) || 0) + 1);
  }
  let max = 0;
  for (const n of cells.values()) max = Math.max(max, n);
  density = { cells, max };

  const m = new THREE.Matrix4(), e = new THREE.Vector3(), nth = new THREE.Vector3(), up = new THREE.Vector3();
  const c = new THREE.Color();
  let i = 0;
  for (const [key, n] of cells) {
    const lat = Math.floor(key / (360 / CELL)) * CELL - 90 + CELL / 2;
    const lon = (key % (360 / CELL)) * CELL - 180 + CELL / 2;
    const f = Math.pow(n / max, 0.7);
    const phi = lat * DEG, lam = lon * DEG;
    toVec(lat, lon, 1, up);
    e.set(-Math.sin(lam), 0, -Math.cos(lam));
    nth.crossVectors(up, e);
    m.makeBasis(e, nth, up)
      .scale(new THREE.Vector3(CELL * DEG * Math.cos(phi) * 0.86, CELL * DEG * 0.86, 0.003 + f * 0.28))
      .setPosition(toVec(lat, lon, R + 0.001));
    columns.setMatrixAt(i, m);
    columns.setColorAt(i, rampColor(f, c));
    i++;
  }
  columns.count = i;
  columns.instanceMatrix.needsUpdate = true;
  columns.instanceColor.needsUpdate = true;
  $('densityMax').textContent = max.toLocaleString();
}

// ---------- wind fields ----------

// NHC-style wind field: each quadrant is a quarter circle with its own radius (radii in nm)
function windRing(lat, lon, r4) {
  const ring = [];
  for (let q = 0; q < 4; q++)
    for (let b = q * 90; b <= q * 90 + 90; b += 7.5) ring.push(dest(lat, lon, b, r4[q] * 1.852));
  return ring;
}

function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// convex hull of two wind rings (in a local plane around the first center) as a lat/lon ring
function hullRing(c0, ringA, ringB) {
  const k = Math.cos(c0[0] * DEG);
  const local = [...ringA, ...ringB].map(([la, lo]) => [wrapLon(lo - c0[1]) * k, la - c0[0]]);
  return hull(local).map(([x, y]) => [c0[0] + y, c0[1] + x / k]);
}

// triangulate a ring that is star-shaped around its center, in concentric bands so it hugs the sphere
function addStar(buf, ring, center, r) {
  const K = 5, n = ring.length, base = buf.pos.length / 3;
  const v = new THREE.Vector3();
  toVec(center[0], center[1], r, v);
  buf.pos.push(v.x, v.y, v.z);
  for (let k = 1; k <= K; k++)
    for (const [la, lo] of ring) {
      const f = k / K;
      toVec(center[0] + (la - center[0]) * f, center[1] + wrapLon(lo - center[1]) * f, r, v);
      buf.pos.push(v.x, v.y, v.z);
    }
  for (let j = 0; j < n; j++) {
    const j1 = (j + 1) % n;
    buf.idx.push(base, base + 1 + j, base + 1 + j1);
    for (let k = 1; k < K; k++) {
      const a = base + 1 + (k - 1) * n, b = base + 1 + k * n;
      buf.idx.push(a + j, b + j, b + j1, a + j, b + j1, a + j1);
    }
  }
}

const centroid = (ring) => {
  const lat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lon0 = ring[0][1];
  const lon = lon0 + ring.reduce((s, p) => s + wrapLon(p[1] - lon0), 0) / ring.length;
  return [lat, lon];
};

function windMeshes(buffers) {
  const group = new THREE.Group();
  WIND_LEVELS.forEach((L, i) => {
    const buf = buffers[i];
    if (!buf.idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    g.setIndex(buf.idx);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: L.hex, transparent: true, opacity: L.opacity, depthWrite: false, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    }));
    mesh.renderOrder = i + 1;
    group.add(mesh);
  });
  return group;
}

// footprint of a storm's whole life: union of hulls between consecutive wind fields
function swathGroup(s) {
  const buffers = WIND_LEVELS.map(() => ({ pos: [], idx: [] }));
  WIND_LEVELS.forEach((L, li) => {
    const rings = s.pts.map((p, i) => {
      const r4 = s.r[i] && s.r[i].slice(...L.slice);
      return r4 && r4.some((x) => x > 0) ? { c: [p[0], p[1]], ring: windRing(p[0], p[1], r4) } : null;
    });
    rings.forEach((a, i) => {
      if (!a) return;
      const b = rings[i + 1];
      const ring = b ? hullRing(a.c, a.ring, b.ring) : a.ring;
      addStar(buffers[li], ring, b ? centroid(ring) : a.c, R + 0.0016);
    });
  });
  return windMeshes(buffers);
}

const liveWind = new THREE.Group();
scene.add(liveWind);

function clearGroup(g) {
  g.traverse((o) => { if (o !== g) { o.geometry?.dispose(); o.material?.dispose(); } });
  g.clear();
}

// ---------- selected storm ----------

const selGroup = new THREE.Group();
scene.add(selGroup);

function drawSelection(s) {
  clearGroup(selGroup);
  if (!s) return;
  const pts = s.pts.map((p) => toVec(p[0], p[1], alt(p[2]) + 0.0006));
  if (pts.length < 2) pts.push(pts[0].clone().multiplyScalar(1.0001));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const segs = (pts.length - 1) * 6, radial = 6;
  const tube = new THREE.TubeGeometry(curve, segs, 0.0032, radial, false);
  const colors = [];
  for (let j = 0; j <= segs; j++) {
    const t = curve.getUtoTmapping(j / segs);
    const p = s.pts[Math.min(s.pts.length - 1, Math.round(t * (s.pts.length - 1)))];
    const c = fixColor(p[5], p[2]);
    for (let r = 0; r <= radial; r++) colors.push(c.r, c.g, c.b);
  }
  tube.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  selGroup.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ vertexColors: true })));

  // translucent curtain from the surface up to the track so height reads as wind
  if (state.extrude) {
    const pos = [], col = [], base = new THREE.Vector3(), top = new THREE.Vector3();
    s.pts.forEach((p) => {
      toVec(p[0], p[1], R + 0.001, base);
      toVec(p[0], p[1], alt(p[2]), top);
      const c = fixColor(p[5], p[2]);
      pos.push(base.x, base.y, base.z, top.x, top.y, top.z);
      col.push(c.r * 0.05, c.g * 0.05, c.b * 0.05, c.r * 0.45, c.g * 0.45, c.b * 0.45);
    });
    const idx = [];
    for (let i = 0; i < s.pts.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    selGroup.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));
  }

  if (s.r && state.swath) selGroup.add(swathGroup(s));

  // landfall points
  const lf = s.pts.filter((p) => p[6]);
  if (lf.length) {
    const g = new THREE.BufferGeometry().setFromPoints(lf.map((p) => toVec(p[0], p[1], R + 0.003)));
    selGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 9, sizeAttenuation: false, map: dotTex, alphaTest: 0.5 })));
  }
}

// ---------- point query ----------

const queryGroup = new THREE.Group();
scene.add(queryGroup);

function drawQuery() {
  clearGroup(queryGroup);
  const q = state.query;
  if (!q) return;
  const pts = [];
  for (let b = 0; b <= 360; b += 3) {
    const [la, lo] = dest(q.lat, q.lon, b, q.km);
    pts.push(toVec(la, lo, R + 0.0025));
  }
  queryGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  ));
  queryGroup.add(new THREE.Points(
    new THREE.BufferGeometry().setFromPoints([toVec(q.lat, q.lon, R + 0.003)]),
    new THREE.PointsMaterial({ color: 0xffffff, size: 8, sizeAttenuation: false, map: dotTex, alphaTest: 0.5 }),
  ));
}

function runQuery(lat, lon, label) {
  state.query = { lat, lon, km: +$('radius').value, label };
  state.selected = null;
  drawSelection(null);
  $('clearQuery').hidden = false;
  refresh();
  drawQuery();
  showInfo();
  flyTo(lat, lon, Math.max(1.35, camera.position.length() * 0.7));
}

function clearQuery() {
  state.query = null;
  $('place').value = '';
  $('clearQuery').hidden = true;
  drawQuery();
  refresh();
  showInfo(state.selected);
}

// ---------- playback eyes ----------

function eyeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.1, 'rgba(255,255,255,0)');
  grd.addColorStop(0.14, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.3)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(0, 0, 128, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineCap = 'round';
  for (let arm = 0; arm < 4; arm++) {
    for (let k = 1; k <= 60; k++) {
      const f0 = (k - 1) / 60, f1 = k / 60;
      const pt = (f) => {
        const ang = -f * Math.PI * 1.5 + (arm * Math.PI) / 2;
        const r = 16 + f * 108;
        return [Math.cos(ang) * r, Math.sin(ang) * r];
      };
      g.lineWidth = 12 * (1 - f1) + 2;
      g.beginPath(); g.moveTo(...pt(f0)); g.lineTo(...pt(f1)); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const eyeTex = eyeTexture();
const eyeGeo = new THREE.PlaneGeometry(1, 1);
const eyes = [];
function eye(i) {
  if (!eyes[i]) {
    const mesh = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({
      map: eyeTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    mesh.renderOrder = 10;
    const div = document.createElement('div');
    div.className = 'eye-label';
    const label = new CSS2DObject(div);
    scene.add(mesh, label);
    eyes[i] = { mesh, label, div };
  }
  return eyes[i];
}

// vertical stems tie each surface eye to the raised track tip
const stems = new THREE.LineSegments(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
);
scene.add(stems);

function hideEyes(from = 0) {
  for (let i = from; i < eyes.length; i++) eyes[i].mesh.visible = eyes[i].label.visible = false;
}

// ---------- filters + layers ----------

let storms = [];
let current = [];

function filtered() {
  const q = state.name.trim().toLowerCase();
  return storms.filter((s) =>
    state.basins.has(s.basin) && s.year >= state.y0 && s.year <= state.y1 && s.w >= state.minW &&
    (!q || s.name.toLowerCase().includes(q)));
}

function syncLayerVisibility() {
  const playing = !!state.play;
  tracks.visible = !tracks.userData.empty && (state.mode === 'tracks' || playing);
  columns.visible = state.mode === 'density' && !playing;
  landfallPts.visible = state.landfalls && !playing;
  selGroup.visible = !playing;
  liveWind.visible = playing;
  stems.visible = playing;
  $('densityLegend').hidden = state.mode !== 'density';
}

function refresh() {
  current = filtered();
  if (state.query) {
    const q = state.query;
    q.results = nearPoint(current, q.lat, q.lon, q.km);
    current = q.results.map((r) => r.s);
  }
  if (!state.play) {
    const [pos, col] = trackArrays(current);
    setTrackGeometry(pos, col);
    tracks.material.opacity = THREE.MathUtils.clamp(1.05 - Math.log10(current.length + 1) * 0.3, 0.12, 0.95);
    if (state.selected) tracks.material.opacity *= 0.3;
  }
  buildPick(current);
  if (state.mode === 'density') buildDensity(current);
  const nLand = state.landfalls ? buildLandfalls(current) : null;
  syncLayerVisibility();

  const hu = current.filter((s) => s.w >= 64).length;
  const maj = current.filter((s) => s.w >= 96).length;
  $('stats').innerHTML = `<b>${current.length.toLocaleString()}</b> storms · <b>${hu.toLocaleString()}</b> hurricanes · <b>${maj.toLocaleString()}</b> major` +
    (nLand != null ? ` · <b>${nLand.toLocaleString()}</b> landfalls` : '');
  $('yearsOut').textContent = state.y0 === state.y1 ? state.y0 : `${state.y0}–${state.y1}`;
  drawChart();
  if (state.query && !state.selected) showInfo();
}

// sliders and typing fire faster than a global rebuild, so coalesce to one per frame
let refreshQueued = false;
function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => { refreshQueued = false; refresh(); });
}

// ---------- annual chart ----------

let chartYears = [];
function drawChart() {
  const W = 268, H = 64, y0 = state.y0, y1 = state.y1, n = y1 - y0 + 1;
  const counts = Array.from({ length: n }, (_, i) => ({ year: y0 + i, all: 0, hu: 0, maj: 0, ace: 0 }));
  for (const s of current) {
    const c = counts[s.year - y0];
    c.all++; c.hu += s.w >= 64; c.maj += s.w >= 96; c.ace += s.ace;
  }
  chartYears = counts;
  const max = Math.max(1, ...counts.map((c) => c.all));
  const bw = W / n;
  const bar = (i, v, fill) => v ? `<rect x="${i * bw}" y="${H - (v / max) * H}" width="${Math.max(bw - (bw > 3 ? 1 : 0), 0.6)}" height="${(v / max) * H}" fill="${fill}"/>` : '';
  $('chart').innerHTML = counts.map((c, i) => bar(i, c.all, '#2c5170') + bar(i, c.hu, CATS[3].hex) + bar(i, c.maj, CATS[5].hex)).join('') +
    `<rect id="chartHover" x="0" y="0" width="${bw}" height="${H}" fill="#fff" fill-opacity="0.12" visibility="hidden"/>`;
  $('chart').setAttribute('viewBox', `0 0 ${W} ${H}`);
  $('chartA').textContent = y0;
  $('chartB').textContent = y1;
  $('chartRead').textContent = `max ${max} / yr`;
}

function chartYearAt(e) {
  const r = $('chart').getBoundingClientRect();
  const i = Math.floor(((e.clientX - r.left) / r.width) * chartYears.length);
  return chartYears[Math.max(0, Math.min(chartYears.length - 1, i))];
}

// ---------- UI wiring ----------

function initUI() {
  $('basins').innerHTML = BASINS.map((b) =>
    `<label title="${b.name}"><input type="checkbox" name="basin" value="${b.key}" checked> ${b.short}</label>`).join('');
  document.querySelectorAll('input[name=basin]').forEach((el) =>
    el.addEventListener('change', () => {
      el.checked ? state.basins.add(el.value) : state.basins.delete(el.value);
      scheduleRefresh();
    }));

  const y0 = $('y0'), y1 = $('y1');
  for (const el of [y0, y1]) { el.min = yearMin; el.max = yearMax; }
  y0.value = state.y0 = yearMin;
  y1.value = state.y1 = yearMax;
  const onYears = (e) => {
    let a = +y0.value, b = +y1.value;
    if (a > b) e.target === y0 ? (b = a, y1.value = b) : (a = b, y0.value = a);
    state.y0 = a; state.y1 = b;
    scheduleRefresh();
  };
  y0.addEventListener('input', onYears);
  y1.addEventListener('input', onYears);
  const setYears = (a, b) => {
    y0.value = a; y1.value = b;
    state.y0 = a; state.y1 = b;
    refresh();
  };
  document.querySelectorAll('[data-years]').forEach((b) =>
    b.addEventListener('click', () => {
      const [a, z] = b.dataset.years.split('-').map(Number);
      setYears(a || yearMin, z || yearMax);
    }));

  $('minW').addEventListener('change', (e) => { state.minW = +e.target.value; refresh(); });
  $('q').addEventListener('input', (e) => { state.name = e.target.value; scheduleRefresh(); });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && current.length) select(current.at(-1), true);
  });

  document.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      refresh();
    }));
  $('extrude').addEventListener('change', (e) => {
    state.extrude = e.target.checked;
    refresh();
    drawSelection(state.selected);
    if (state.play) state.play.dirty = true;
  });
  $('landfalls').addEventListener('change', (e) => { state.landfalls = e.target.checked; refresh(); });

  // chart: hover reads out a year, click narrows to it
  const chart = $('chart');
  chart.addEventListener('mousemove', (e) => {
    const c = chartYearAt(e);
    const hover = $('chartHover');
    hover.setAttribute('x', (c.year - state.y0) * (268 / chartYears.length));
    hover.setAttribute('visibility', 'visible');
    $('chartRead').textContent = `${c.year}: ${c.all} storms · ${c.hu} hu · ${c.maj} major · ACE ${c.ace.toFixed(0)}`;
  });
  chart.addEventListener('mouseleave', () => drawChart());
  chart.addEventListener('click', (e) => {
    const c = chartYearAt(e);
    setYears(c.year, c.year);
    $('seasonYear').value = c.year;
  });

  // point query
  const place = $('place');
  const regionOf = ([, lat, lon]) =>
    lat < 0 ? 'Australia, South Pacific & South Indian' : lon < -30 ? 'Americas, Caribbean & Hawaii' : lon >= 100 ? 'East Asia & West Pacific' : 'North Indian Ocean';
  const groups = new Map();
  PLACES.forEach((pl, i) => {
    const g = regionOf(pl);
    if (!groups.has(g)) groups.set(g, Object.assign(document.createElement('optgroup'), { label: g }));
    groups.get(g).append(new Option(pl[0], i));
  });
  place.append(...groups.values());
  place.addEventListener('change', () => {
    if (place.value === '') return;
    const [name, lat, lon] = PLACES[+place.value];
    runQuery(lat, lon, name);
  });
  $('radius').addEventListener('change', () => {
    if (!state.query) return;
    state.query.km = +$('radius').value;
    refresh();
    drawQuery();
  });
  $('pickPoint').addEventListener('click', () => {
    state.picking = !state.picking;
    $('pickPoint').setAttribute('aria-pressed', state.picking);
    renderer.domElement.style.cursor = state.picking ? 'crosshair' : '';
  });
  $('clearQuery').addEventListener('click', clearQuery);

  const ys = $('seasonYear');
  for (let y = yearMax; y >= yearMin; y--) ys.add(new Option(y, y));
  ys.value = 2005;
  $('playSeason').addEventListener('click', () => {
    const y = +ys.value;
    const list = storms.filter((s) => s.year === y && state.basins.has(s.basin));
    if (list.length) startPlayback(list, `${y} season`);
  });

  $('legend').innerHTML = [...CATS, { name: 'Post-tropical / low', hex: NONTROP.hex }]
    .map((c) => `<div><i style="--c:${c.hex}"></i>${c.name}</div>`).join('');
  $('densityRamp').style.background = `linear-gradient(90deg, ${DENSITY_RAMP.map((c) => '#' + c.getHexString()).join(',')})`;

  $('pp').addEventListener('click', togglePlay);
  $('scrub').addEventListener('input', (e) => {
    const p = state.play;
    p.t = p.t0 + (p.t1 - p.t0) * (e.target.value / 1000);
    p.playing = false;
    p.dirty = true;
    syncPlayButton();
  });
  $('pstop').addEventListener('click', stopPlayback);

  addEventListener('keydown', (e) => {
    if (e.target.matches('input[type=search], select')) return;
    if (e.key === ' ' && state.play) { e.preventDefault(); togglePlay(); }
    if (e.key === 'Escape') {
      if (state.play) stopPlayback();
      else if (state.picking) $('pickPoint').click();
      else if (state.selected) select(null);
      else if (state.query) clearQuery();
    }
  });
}

// ---------- info panel ----------

const fmtDate = (t, opts = {}) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC', ...opts });
const hexOf = (c) => '#' + c.getHexString(THREE.SRGBColorSpace);

function sparkline(s) {
  const W = 288, H = 80, pad = 4;
  const maxH = s.pts.at(-1)[4] || 1;
  const top = Math.max(150, s.w + 10);
  const x = (h) => pad + (h / maxH) * (W - pad * 2);
  const y = (w) => H - pad - (w / top) * (H - pad * 2);
  let out = CATS.slice(1).map((c) =>
    `<line x1="0" x2="${W}" y1="${y(c.min)}" y2="${y(c.min)}" stroke="${c.hex}" stroke-opacity="0.25" stroke-dasharray="2 3"/>`).join('');
  s.pts.forEach((p) => { if (p[6]) out += `<line x1="${x(p[4])}" x2="${x(p[4])}" y1="0" y2="${H}" stroke="#fff" stroke-opacity="0.35"/>`; });
  for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1], b = s.pts[i];
    out += `<line x1="${x(a[4])}" y1="${y(a[2])}" x2="${x(b[4])}" y2="${y(b[2])}" stroke="${hexOf(fixColor(b[5], b[2]))}" stroke-width="2" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Wind speed over time; white lines mark landfalls">${out}</svg>`;
}

function stormHTML(s) {
  const cat = CATS[catIndex(s.w)];
  const days = (s.end - s.t0) / (24 * HOUR);
  const back = state.query ? `<button class="back" id="backToQuery">← ${state.query.results.length} storms near ${state.query.label}</button>` : '';
  const swath = s.r
    ? `<label class="toggle swath"><input type="checkbox" id="swathToggle" ${state.swath ? 'checked' : ''}> Wind-field swath
         <span class="sw" style="--c:${WIND_LEVELS[2].hex}"></span>34 <span class="sw" style="--c:${WIND_LEVELS[1].hex}"></span>50 <span class="sw" style="--c:${WIND_LEVELS[0].hex}"></span>64 kt</label>`
    : '<p class="hint">No wind-radii record for this storm. They start in 2001–04, depending on the basin.</p>';
  return `
    ${back}
    <h2>${s.name} <span>${s.year}</span></h2>
    <div class="meta">${BASIN[s.basin].name} · ${regionalName(s.basin, s.w)} · ${s.id}</div>
    <span class="chip" style="--c:${cat.hex}">Peak: ${cat.name}</span>
    <dl>
      <dt>Peak wind</dt><dd>${s.w} kt (${Math.round(s.w * 1.15078)} mph)</dd>
      <dt>Min pressure</dt><dd>${s.p ? s.p + ' mb' : 'not recorded'}</dd>
      <dt>Active</dt><dd>${fmtDate(s.t0)} – ${fmtDate(s.end)} (${days.toFixed(1)} days)</dd>
      <dt>Landfalls</dt><dd>${s.landfalls || 'none recorded'}</dd>
      <dt>ACE</dt><dd>${s.ace.toFixed(1)}</dd>
    </dl>
    ${sparkline(s)}
    ${swath}
    <div class="actions"><button id="playStorm">Play track</button><button id="flyStorm">Fly to</button></div>`;
}

function queryHTML() {
  const q = state.query;
  const sort = $('info').dataset.sort || 'w';
  const rows = q.results.slice().sort((a, b) =>
    sort === 'w' ? b.w - a.w || b.s.year - a.s.year : sort === 'year' ? b.s.t0 - a.s.t0 : a.dist - b.dist);
  const hu = q.results.filter((r) => r.w >= 64).length;
  const maj = q.results.filter((r) => r.w >= 96).length;
  const last = q.results.filter((r) => r.w >= 64).sort((a, b) => b.s.t0 - a.s.t0)[0];
  return `
    <div class="eyebrow">Within ${q.km} km of</div>
    <h2>${q.label}</h2>
    <p class="meta">${q.results.length} storms under current filters · ${hu} at 64 kt+ (hurricane or typhoon strength) inside the circle · ${maj} at 96 kt+${last ? ` · most recent 64 kt+: ${last.s.name} ${last.s.year}` : ''}</p>
    <div class="sort">Sort:
      <button data-sort="w" aria-pressed="${sort === 'w'}">Strongest</button>
      <button data-sort="year" aria-pressed="${sort === 'year'}">Recent</button>
      <button data-sort="dist" aria-pressed="${sort === 'dist'}">Closest</button>
    </div>
    <ol class="results">${rows.map((r, i) => `
      <li><button data-i="${q.results.indexOf(r)}">
        <i style="--c:${CATS[catIndex(r.w)].hex}"></i>
        <span class="n">${r.s.name} ${r.s.year}</span>
        <span class="w">${r.w} kt</span>
        <span class="d">${Math.round(r.dist)} km</span>
      </button></li>`).join('')}</ol>
    <p class="hint">Wind is the strongest the storm had inside the circle; distance is its closest approach.</p>`;
}

function showInfo(s = state.selected) {
  const el = $('info');
  if (!s && !state.query) { el.hidden = true; return; }
  el.innerHTML = `<button class="close" aria-label="Close">✕</button>` + (s ? stormHTML(s) : queryHTML());
  el.hidden = false;
  el.querySelector('.close').onclick = () => (s ? select(null) : clearQuery());
  if (s) {
    $('playStorm').onclick = () => startPlayback([s], s.name);
    $('flyStorm').onclick = () => flyToStorm(s);
    $('backToQuery')?.addEventListener('click', () => select(null));
    $('swathToggle')?.addEventListener('change', (e) => { state.swath = e.target.checked; drawSelection(s); });
  } else {
    el.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { el.dataset.sort = b.dataset.sort; showInfo(); }));
    el.querySelectorAll('.results button').forEach((b) =>
      b.addEventListener('click', () => select(state.query.results[+b.dataset.i].s, true)));
  }
}

function select(s, fly = false) {
  state.selected = s;
  drawSelection(s);
  refresh();
  showInfo(s);
  history.replaceState(null, '', s ? '#' + s.id : location.pathname);
  if (s && fly) flyToStorm(s);
}

// ---------- camera fly ----------

let fly = null;
function flyTo(lat, lon, dist) {
  fly = { from: camera.position.clone(), to: toVec(lat, lon, dist), t: 0 };
}

function flyToStorm(s) {
  flyToStorms([s]);
}

function flyToStorms(list) {
  const c = new THREE.Vector3();
  const vs = list.flatMap((s) => s.pts.map((p) => toVec(p[0], p[1])));
  vs.forEach((v) => c.add(v));
  c.normalize();
  const spread = Math.max(...vs.map((v) => v.angleTo(c)));
  const [lat, lon] = toLatLon(c);
  flyTo(lat, lon, 1 + THREE.MathUtils.clamp(spread * 2.6, 0.6, 3));
}

function stepFly(dt) {
  if (!fly) return;
  fly.t = Math.min(1, fly.t + dt / 1.4);
  const k = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
  const len = THREE.MathUtils.lerp(fly.from.length(), fly.to.length(), k);
  camera.position.copy(fly.from).normalize().lerp(fly.to.clone().normalize(), k).normalize().multiplyScalar(len);
  if (fly.t >= 1) fly = null;
}

// ---------- playback ----------

function startPlayback(list, label) {
  const t0 = Math.min(...list.map((s) => s.t0));
  const t1 = Math.max(...list.map((s) => s.end));
  state.play = { list, label, t0, t1, t: t0, playing: true, dirty: true };
  $('player').hidden = false;
  $('tip').hidden = true;
  syncLayerVisibility();
  syncPlayButton();
  flyToStorms(list);
}

function stopPlayback() {
  state.play = null;
  $('player').hidden = true;
  hideEyes();
  clearGroup(liveWind);
  refresh();
}

function togglePlay() {
  const p = state.play;
  if (!p) return;
  if (p.t >= p.t1) p.t = p.t0;
  p.playing = !p.playing;
  syncPlayButton();
}

function syncPlayButton() {
  const p = state.play;
  $('pp').textContent = p?.playing ? '❚❚' : '▶';
  $('pp').setAttribute('aria-label', p?.playing ? 'Pause' : 'Play');
}

function stepPlayback(dt, time) {
  const p = state.play;
  if (!p) return;
  if (p.playing) {
    p.t = Math.min(p.t1, p.t + dt * +$('speed').value * HOUR);
    p.dirty = true;
    if (p.t >= p.t1) { p.playing = false; syncPlayButton(); }
  }

  if (p.dirty) {
    p.dirty = false;
    const [pos, col] = trackArrays(p.list, p.t);
    setTrackGeometry(pos, col);
    tracks.visible = pos.length > 0;
    tracks.material.opacity = 0.9;
    $('scrub').value = ((p.t - p.t0) / (p.t1 - p.t0 || 1)) * 1000;
    $('pdate').textContent = `${p.label} · ${new Date(p.t).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
    })} UTC`;
    let named = 0, hu = 0, maj = 0, ace = 0;
    const buffers = WIND_LEVELS.map(() => ({ pos: [], idx: [] }));
    for (const s of p.list) {
      if (s.t0 > p.t) continue;
      let w = 0;
      for (const q of s.pts) if (s.t0 + q[4] * HOUR <= p.t) w = Math.max(w, q[2]);
      named += w >= 34; hu += w >= 64; maj += w >= 96;
      ace += aceOf(s, p.t);
      // live wind field around each active storm
      if (s.r && p.t <= s.end) {
        const q = interp(s, p.t);
        if (q[7]) WIND_LEVELS.forEach((L, li) => {
          const r4 = q[7].slice(...L.slice);
          if (r4.some((x) => x > 0)) addStar(buffers[li], windRing(q[0], q[1], r4), [q[0], q[1]], R + 0.0016);
        });
      }
    }
    clearGroup(liveWind);
    liveWind.add(windMeshes(buffers));
    $('pstats').textContent = p.list.length === 1
      ? `${Math.round(interp(p.list[0], p.t)[2])} kt · ACE ${ace.toFixed(1)}`
      : `${named} named · ${hu} hurricanes · ${maj} major · ACE ${ace.toFixed(1)}`;
  }

  // eyes for storms active right now
  let n = 0;
  const v = new THREE.Vector3(), out = new THREE.Vector3(), tip = new THREE.Vector3();
  const stemPos = [];
  for (const s of p.list) {
    if (p.t < s.t0 || p.t > s.end) continue;
    const q = interp(s, p.t);
    const e = eye(n++);
    toVec(q[0], q[1], R + 0.004, v);
    if (state.extrude) {
      toVec(q[0], q[1], alt(q[2]), tip);
      stemPos.push(v.x, v.y, v.z, tip.x, tip.y, tip.z);
    }
    e.mesh.position.copy(v);
    e.mesh.lookAt(out.copy(v).multiplyScalar(2));
    // cyclones turn clockwise south of the equator: mirror the spiral and reverse the spin
    const south = q[0] < 0 ? -1 : 1;
    const size = 0.025 + (q[2] / 160) * 0.06;
    e.mesh.rotateZ(south * time * (1 + q[2] / 40));
    e.mesh.scale.set(south * size, size, size);
    e.mesh.material.color.copy(fixColor(q[5], q[2]));
    e.label.position.copy(v);
    e.div.textContent = s.name === 'Unnamed' ? '' : s.name;
    e.mesh.visible = true;
    e.label.visible = v.dot(camera.position) > R * R;
  }
  hideEyes(n);
  stems.geometry.setAttribute('position', new THREE.Float32BufferAttribute(stemPos, 3));
  stems.geometry.computeBoundingSphere();
}

// ---------- hover / click ----------

const mouse = { x: 0, y: 0, dirty: false, down: null };
const raycaster = new THREE.Raycaster();
let hovered = null;

function globePoint(x, y) {
  raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const hit = raycaster.ray.intersectSphere(globeSphere, new THREE.Vector3());
  return hit && toLatLon(hit);
}

renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.dirty = true;
});
renderer.domElement.addEventListener('pointerleave', () => { hovered = null; $('tip').hidden = true; });
renderer.domElement.addEventListener('pointerdown', (e) => { mouse.down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!mouse.down || state.play) return;
  const moved = Math.hypot(e.clientX - mouse.down[0], e.clientY - mouse.down[1]);
  mouse.down = null;
  if (moved > 5) return;
  mouse.x = e.clientX; mouse.y = e.clientY;

  if (state.picking || state.mode === 'density') {
    const ll = globePoint(e.clientX, e.clientY);
    if (!ll) return;
    if (state.picking) $('pickPoint').click();
    runQuery(ll[0], ll[1], `${Math.abs(ll[0]).toFixed(1)}°${ll[0] >= 0 ? 'N' : 'S'}, ${Math.abs(ll[1]).toFixed(1)}°${ll[1] >= 0 ? 'E' : 'W'}`);
    return;
  }
  doPick();
  select(hovered);
});

function showTip(html) {
  const tip = $('tip');
  tip.hidden = !html;
  if (!html) return;
  tip.innerHTML = html;
  tip.style.left = mouse.x + 'px';
  tip.style.top = mouse.y + 'px';
  tip.style.transform = mouse.x > innerWidth - tip.offsetWidth - 24 ? 'translate(calc(-100% - 12px), -50%)' : '';
}

function doPick() {
  mouse.dirty = false;
  if (state.play) return;
  if (state.picking) { showTip(''); return; }

  if (state.mode === 'density') {
    const ll = globePoint(mouse.x, mouse.y);
    const n = ll && density.cells.get(cellKey(ll[0], ll[1]));
    showTip(n ? `<b>${n}</b> storm${n > 1 ? 's' : ''} crossed this ${CELL}° cell<br><span class="muted">click to list storms near here</span>` : '');
    renderer.domElement.style.cursor = n ? 'pointer' : '';
    return;
  }

  const v = new THREE.Vector3(), cam = camera.position, r2 = R * R;
  const W = innerWidth, H = innerHeight;
  let best = null, bd = 10 * 10;
  const { xyz, ref, bins } = pick;
  // raised tracks drift off their ground point on screen, so search a 10° margin around it
  const ll = globePoint(mouse.x, mouse.y);
  const near = [];
  if (ll) {
    const dLat = 10, dLon = Math.min(180, 10 / Math.max(0.15, Math.cos(ll[0] * DEG)));
    for (let la = ll[0] - dLat; la <= ll[0] + dLat + PICK_BIN; la += PICK_BIN) {
      if (la < -90 || la > 90) continue;
      for (let lo = ll[1] - dLon; lo <= ll[1] + dLon + PICK_BIN; lo += PICK_BIN) {
        const b = bins.get(pickBin(Math.min(la, 89.9), lo));
        if (b) near.push(b);
      }
    }
  }
  for (const list of near) for (const k of list) {
    v.fromArray(xyz, k * 3);
    if (v.dot(cam) < r2) continue;
    v.project(camera);
    const dx = (v.x + 1) / 2 * W - mouse.x, dy = (1 - v.y) / 2 * H - mouse.y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = ref[k]; }
  }
  hovered = best;
  showTip(best && `<b>${best.name}</b> ${best.year} · ${regionalName(best.basin, best.w)}${best.w >= 64 ? `, ${CATS[catIndex(best.w)].name}` : ''}`);
  renderer.domElement.style.cursor = best ? 'pointer' : '';
}

// ---------- loop ----------

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
  lineMats.forEach((m) => m.resolution.set(innerWidth, innerHeight));
});

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.1);
  stepFly(dt);
  controls.rotateSpeed = THREE.MathUtils.clamp((camera.position.length() - R) * 0.6, 0.08, 1);
  controls.zoomSpeed = THREE.MathUtils.clamp((camera.position.length() - R) * 0.8, 0.2, 1);
  controls.update();
  stepPlayback(dt, clock.elapsedTime);
  if (mouse.dirty) doPick();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ---------- boot ----------

const [world, ...basinData] = await Promise.all([
  fetch('/lab/hurricane-globe/data/countries-50m.json').then((r) => r.json()),
  ...BASINS.map((b) => fetch(b.file).then((r) => r.json())),
]);

globe.material.map = landTexture(world);
globe.material.color.set(0xffffff);
globe.material.needsUpdate = true;
scene.add(graticule());
scene.add(meshLines(mesh(world, world.objects.land), 0x4f6d88, 0.9));
scene.add(meshLines(mesh(world, world.objects.countries, (a, b) => a !== b), 0x2c4258, 0.8));

storms = basinData.flatMap((d) => d.storms).sort((a, b) => a.t0 - b.t0);
const yearMin = Math.min(...storms.map((s) => s.year));
const yearMax = Math.max(...storms.map((s) => s.year));
for (const s of storms) {
  s.end = s.t0 + s.pts.at(-1)[4] * HOUR;
  s.ace = aceOf(s);
  s.landfalls = s.pts.filter((p) => p[6]).length;
}

initUI();
if (innerWidth < 700) $('panel').open = false;
refresh();
const fromHash = storms.find((s) => s.id === location.hash.slice(1));
if (fromHash) select(fromHash, true);
$('loading').remove();
animate();
