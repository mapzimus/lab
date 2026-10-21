(async () => {
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------- data: fetched in parallel; the globe grid and places are shared with the Population Relief Globe ----------
let POP, NE, TL, LY, DATA, LYNN_DATA;
{
  const files = [
    ["/lab/population-globe/data/density.json", d => POP = d],
    ["/lab/population-globe/data/places.json", d => NE = d],
    ["/lab/orbit-to-street/data/timeline.json", d => TL = d],
    ["/lab/orbit-to-street/data/lights.json", d => LY = d],
    ["/lab/orbit-to-street/data/boston.json", d => DATA = d],
    ["/lab/orbit-to-street/data/lynn.json", d => LYNN_DATA = d],
  ];
  let done = 0;
  try {
    await Promise.all(files.map(async ([url, put]) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(url);
      put(await r.json());
      done++; $("ld-bar").style.width = (done / files.length * 100) + "%";
    }));
  } catch (e) {
    $("ld-msg").textContent = "Couldn't load " + e.message + ". Reload the page to try again.";
    return;
  }
  $("ld-msg").textContent = "Building the globe and the cities…";
  await new Promise(r => setTimeout(r, 30));
}

const RE = 6371008.8, D2R = Math.PI / 180, KMH = 1000;
const STEP = POP.step, W = POP.w, H = POP.h;
const b64 = (s, T) => { const raw = atob(s), u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); return new T(u.buffer); };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + " billion" : n >= 1e6 ? (n / 1e6).toFixed(1) + " million" : n >= 1e3 ? Math.round(n).toLocaleString() : n.toFixed(n < 10 ? 1 : 0);
const fmtShort = v => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M" : v >= 1000 ? Math.round(v / 1000) + "k" : String(Math.round(v));
const fmtDen = d => d < 10 ? d.toFixed(1) : Math.round(d).toLocaleString();
const fmtAlt = m => m >= 1e6 ? Math.round(m / 1000).toLocaleString() + " km" : m >= 1e4 ? Math.round(m / 1000) + " km" : m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m";
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const wrap180 = d => ((d + 540) % 360) - 180;

// ---------- frames ----------
// World space is metres in Boston's local frame: x east, y up, z south, origin on the ground at the model's centre.
// The Earth is a group whose centre sits RE below the origin, rotated so Boston is at its top. The city then
// needs no big numbers at all, which keeps street-level rendering steady.
const toVec = (lat, lon, r, out = new THREE.Vector3()) => {
  const a = lat * D2R, b = lon * D2R;
  return out.set(r * Math.cos(a) * Math.sin(b), r * Math.sin(a), r * Math.cos(a) * Math.cos(b));
};
const LAT0 = DATA.lat0, LON0 = DATA.lon0;
const UP0 = toVec(LAT0, LON0, 1);
const EAST0 = new THREE.Vector3(Math.cos(LON0 * D2R), 0, -Math.sin(LON0 * D2R));
const NORTH0 = new THREE.Vector3().crossVectors(UP0, EAST0);
const earth = new THREE.Group();
earth.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(
  EAST0.x, EAST0.y, EAST0.z, 0,
  UP0.x, UP0.y, UP0.z, 0,
  -NORTH0.x, -NORTH0.y, -NORTH0.z, 0,
  0, 0, 0, 1));
earth.position.set(0, -RE, 0);
earth.updateMatrixWorld(true);
const E2W = earth.matrixWorld.clone(), W2E = E2W.clone().invert();
const CENTER = new THREE.Vector3(0, -RE, 0);
const AXIS = new THREE.Vector3(0, 1, 0).applyQuaternion(earth.quaternion);
const geoToWorld = (lat, lon, h, out = new THREE.Vector3()) => toVec(lat, lon, RE + h, out).applyMatrix4(E2W);
const _g = new THREE.Vector3();
const worldToGeo = p => { _g.copy(p).applyMatrix4(W2E); const r = _g.length(); return { lat: Math.asin(_g.y / r) / D2R, lon: Math.atan2(_g.x, _g.z) / D2R, h: r - RE }; };

// ---------- renderer ----------
THREE.ColorManagement.legacyMode = false;
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000);
$("stage").appendChild(renderer.domElement);
const el = renderer.domElement;
el.tabIndex = 0;
el.setAttribute("role", "application");
el.setAttribute("aria-label", "Earth and Boston in 3D. Arrow keys move, plus and minus change altitude, Q and E turn, Page Up and Page Down tilt.");
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 6000, 1e12);
scene.add(earth);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 4e9);
scene.add(camera);

// ---------- sun ----------
// Low-precision solar position (Astronomical Almanac): subsolar point plus Greenwich sidereal time.
function sunAt(ms) {
  const d = ms / 86400000 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * D2R, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const e = (23.439 - 0.00000036 * d) * D2R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  return { lat: dec / D2R, lon: wrap180(ra / D2R - gmst * 15), gmst };
}
const sunLocal = new THREE.Vector3(), sunWorld = new THREE.Vector3(), lightDir = new THREE.Vector3();
let sunGMST = 0;
const elevAt = ms => { const s = sunAt(ms); return Math.asin(clamp(toVec(s.lat, s.lon, 1).dot(UP0), -1, 1)) / D2R; };

// ---------- textures built from the vector data ----------
// Coastline rings are stitched where Natural Earth splits them, then filled even-odd into a land mask.
const COAST = (() => {
  const open = [], rings = [];
  for (const l of NE.coast) {
    if (l[0] === l[l.length - 2] && l[1] === l[l.length - 1]) rings.push(l); else open.push(l.slice());
  }
  let merged = true;
  while (merged) {
    merged = false;
    for (let a = 0; a < open.length && !merged; a++) for (let b = 0; b < open.length; b++) {
      if (a === b) continue;
      const A = open[a], B = open[b];
      if (A[A.length - 2] === B[0] && A[A.length - 1] === B[1]) { open[a] = A.concat(B.slice(2)); open.splice(b, 1); merged = true; break; }
    }
  }
  for (const l of open) rings.push(l);
  return rings;
})();
function maskCanvas(w, h, lonA, lonB, latA, latB) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  const X = lon => (lon - lonA) / (lonB - lonA) * w, Y = lat => (latB - lat) / (latB - latA) * h;
  g.beginPath();
  for (const l of COAST) {
    const n = l.length, closed = l[0] === l[n - 2] && l[1] === l[n - 1];
    g.moveTo(X(l[0]), Y(l[1]));
    for (let k = 2; k < n; k += 2) g.lineTo(X(l[k]), Y(l[k + 1]));
    // Antarctica runs the whole way round: close it along the bottom edge
    if (!closed && Math.abs(l[0] - l[n - 2]) > 300) { g.lineTo(X(l[n - 2]), Y(-90)); g.lineTo(X(l[0]), Y(-90)); }
    g.closePath();
  }
  g.fillStyle = "#fff"; g.fill("evenodd");
  return cv;
}
const dataTex = cv => { const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = THREE.RepeatWrapping; return t; };
const landTex = dataTex(maskCanvas(4096, 2048, -180, 180, -90, 90));
const REG = { lonA: -73.6, lonB: -68.6, latA: 40.4, latB: 44.2 };
const regTex = dataTex(maskCanvas(2048, 2048, REG.lonA, REG.lonB, REG.latA, REG.latB));
regTex.wrapS = THREE.ClampToEdgeWrapping;

// ---------- population data ----------
const q25 = b64(POP.q, Uint16Array);
const dens = new Float32Array(q25.length);
for (let i = 0; i < q25.length; i++) dens[i] = Math.pow(10, q25[i] / POP.k) - 1;
const KM = 6371.0088 * STEP * Math.PI / 180;
const cellArea = row => KM * KM * Math.cos((90 - (row + 0.5) * STEP) * D2R);
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
const cellAt = (lat, lon) => {
  const r = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / STEP)));
  const c = ((Math.floor((lon + 180) / STEP) % W) + W) % W;
  return r * W + c;
};

// night lights, display-scaled, into a texture the dark side of the Earth glows with
const lightTex = (() => {
  const lyIdx = b64(LY.idx, Uint32Array), lq = b64(LY.lights, Uint16Array);
  const small = document.createElement("canvas"); small.width = W; small.height = H;
  const sg = small.getContext("2d"), img = sg.createImageData(W, H);
  for (let j = 0; j < lyIdx.length; j++) {
    const v = (Math.pow(10, lq[j] / LY.k) - 1) / 1000;
    if (v <= 0) continue;
    const t = Math.min(1, Math.pow(v / 30, 0.55)) * 255, o = lyIdx[j] * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = t; img.data[o + 3] = 255;
  }
  sg.putImageData(img, 0, 0);
  const cv = document.createElement("canvas"); cv.width = W * 2; cv.height = H * 2;
  const g = cv.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
  g.imageSmoothingEnabled = true;
  g.filter = "blur(1.2px)";
  g.drawImage(small, 0, 0, cv.width, cv.height);
  return dataTex(cv);
})();

// population density as a soft tint: built-up land reads grey, farmland and forest olive
const popTex = (() => {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d"), img = g.createImageData(W, H), top = Math.log10(1 + 8000);
  for (let k = 0; k < W * H; k++) { const t = Math.min(1, Math.log10(1 + dens[k]) / top) * 255, o = k * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = t; img.data[o + 3] = 255; }
  g.putImageData(img, 0, 0);
  return dataTex(cv);
})();

// ---------- shaders ----------
const LOGV = ["#include <common>", "#include <logdepthbuf_pars_vertex>"].join("\n");
const LOGF = ["#include <common>", "#include <logdepthbuf_pars_fragment>"].join("\n");
const OUTF = ["#include <tonemapping_fragment>", "#include <encodings_fragment>"].join("\n");
const U = {
  sun: { value: new THREE.Vector3(0, 1, 0) },
  flat: { value: 0 },
  sunI: { value: 2.1 },
  amb: { value: 0.05 },
  ocean: { value: new THREE.Color("#10294a") },
  land: { value: new THREE.Color("#5f6744") },
  urban: { value: new THREE.Color("#7b766b") },
  ice: { value: new THREE.Color("#dfe6ee") },
  glow: { value: new THREE.Color("#ffb45c") },
  hazeC: { value: new THREE.Color() },
  hazeK: { value: 0 },
};
function surfaceMaterial(mask, region) {
  return new THREE.ShaderMaterial({
    transparent: !!region, depthWrite: true,
    uniforms: {
      uMask: { value: mask }, uLights: { value: lightTex }, uPop: { value: popTex },
      uSun: U.sun, uFlat: U.flat, uSunI: U.sunI, uAmb: U.amb, uOcean: U.ocean, uLand: U.land, uUrban: U.urban, uIce: U.ice, uGlow: U.glow, uHazeC: U.hazeC, uHazeK: U.hazeK,
      uRegion: { value: region ? new THREE.Vector4(region.lonA, region.latA, region.lonB - region.lonA, region.latB - region.latA) : new THREE.Vector4() },
      uRegionOn: { value: region ? 1 : 0 }, uAlpha: { value: 1 },
    },
    vertexShader: `${LOGV}
      varying vec3 vLocal; varying vec3 vNW; varying vec3 vPW;
      void main() {
        vLocal = position;
        vNW = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `${LOGF}
      uniform sampler2D uMask, uLights, uPop; uniform vec3 uSun, uOcean, uLand, uUrban, uIce, uGlow, uHazeC; uniform float uHazeK;
      uniform float uFlat, uSunI, uAmb, uRegionOn, uAlpha; uniform vec4 uRegion;
      varying vec3 vLocal; varying vec3 vNW; varying vec3 vPW;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vLocal);
        float lat = asin(clamp(n.y, -1.0, 1.0)), lon = atan(n.x, n.z);
        vec2 uv = vec2(lon / PI * 0.5 + 0.5, lat / PI + 0.5);
        vec2 muv = uv; float edge = 1.0;
        if (uRegionOn > 0.5) {
          muv = (vec2(lon, lat) * (180.0 / PI) - uRegion.xy) / uRegion.zw;
          edge = smoothstep(0.0, 0.18, muv.x) * smoothstep(1.0, 0.82, muv.x) * smoothstep(0.0, 0.18, muv.y) * smoothstep(1.0, 0.82, muv.y);
        }
        float land = texture2D(uMask, muv).r;
        vec3 N = normalize(vNW), V = normalize(cameraPosition - vPW);
        float ndl = dot(N, uSun);
        float built = smoothstep(0.35, 0.85, texture2D(uPop, uv).r);
        vec2 nq = muv * (uRegionOn > 0.5 ? 900.0 : 2400.0);
        vec2 ni = floor(nq), nf = fract(nq); nf = nf * nf * (3.0 - 2.0 * nf);
        float h00 = fract(sin(dot(ni, vec2(127.1, 311.7))) * 43758.5), h10 = fract(sin(dot(ni + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5);
        float h01 = fract(sin(dot(ni + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5), h11 = fract(sin(dot(ni + vec2(1.0), vec2(127.1, 311.7))) * 43758.5);
        float grain = mix(mix(h00, h10, nf.x), mix(h01, h11, nf.x), nf.y);
        vec3 landC = mix(uLand, uUrban, built) * (0.94 + 0.12 * grain);
        landC = mix(landC, uIce, smoothstep(60.0, 74.0, abs(lat) * 57.2958));
        vec3 base = mix(uOcean, landC, land);
        float diff = mix(max(ndl, 0.0), 0.85, uFlat);
        vec3 col = base * (uAmb + uSunI * diff);
        vec3 Hh = normalize(uSun + V);
        col += vec3(1.0, 0.9, 0.75) * pow(max(dot(N, Hh), 0.0), 260.0) * (1.0 - land) * 0.28 * step(0.0, ndl) * (1.0 - uFlat);
        float tw = exp(-ndl * ndl * 140.0) * (1.0 - uFlat);
        col += vec3(0.55, 0.2, 0.06) * tw * 0.18;
        float night = smoothstep(0.06, -0.14, ndl) * (1.0 - uFlat);
        float li = texture2D(uLights, uv).r;
        col += uGlow * li * li * night * 2.2;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 5.0);
        col = mix(col, vec3(0.3, 0.52, 1.0) * (0.06 + 0.9 * max(diff, 0.0)), rim * 0.6);
        // aerial haze inside the atmosphere, so distant land fades into the sky instead of meeting it at a line
        col = mix(col, uHazeC, (1.0 - exp(-length(cameraPosition - vPW) / 260000.0)) * uHazeK);
        gl_FragColor = vec4(col, edge * uAlpha);
        ${OUTF}
      }`,
  });
}
const globe = new THREE.Mesh(new THREE.SphereGeometry(RE - 30, 360, 180), surfaceMaterial(landTex, null));
earth.add(globe);

// regional patch around Boston: a sharper coastline than the global mask, draped on the sphere
const patch = (() => {
  const nx = 120, ny = 120, pos = [], nor = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const lat = REG.latA + (REG.latB - REG.latA) * j / ny, lon = REG.lonA + (REG.lonB - REG.lonA) * i / nx;
    const v = toVec(lat, lon, RE - 1.2); pos.push(v.x, v.y, v.z);
    v.normalize(); nor.push(v.x, v.y, v.z);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, surfaceMaterial(regTex, REG));
  m.renderOrder = 1;
  earth.add(m);
  return m;
})();

// atmosphere halo seen from space
const haloU = { uFade: { value: 1 }, uSun: U.sun, uFlat: U.flat };
const halo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.06, 96, 64), new THREE.ShaderMaterial({
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, uniforms: haloU,
  vertexShader: `${LOGV}
    varying vec3 vN; varying vec3 vNW;
    void main() { vN = normalize(normalMatrix * normal); vNW = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `${LOGF}
    uniform float uFade, uFlat; uniform vec3 uSun; varying vec3 vN; varying vec3 vNW;
    void main() {
      #include <logdepthbuf_fragment>
      float i = pow(max(0.0, 0.64 - dot(vN, vec3(0.0, 0.0, 1.0))), 3.0) * 2.4;
      float s = mix(smoothstep(-0.35, 0.35, dot(normalize(vNW), uSun)), 1.0, uFlat);
      vec3 c = mix(vec3(0.05, 0.08, 0.22), vec3(0.32, 0.55, 1.0), s);
      c += vec3(0.6, 0.25, 0.08) * exp(-pow(dot(normalize(vNW), uSun), 2.0) * 30.0) * (1.0 - uFlat) * 0.6;
      gl_FragColor = vec4(c * i * uFade, 1.0);
      ${OUTF}
    }`,
}));
earth.add(halo);

// sky dome: drawn first, under everything; fades in as you enter the atmosphere
const skyU = { uUp: { value: new THREE.Vector3(0, 1, 0) }, uSun: U.sun, uSky: { value: 0 }, uFlat: U.flat };
const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthTest: false, depthWrite: false, uniforms: skyU,
  vertexShader: `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 uUp, uSun; uniform float uSky, uFlat; varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir), sun = normalize(mix(uSun, uUp + vec3(0.3, 0.0, 0.2), uFlat));
      float h = dot(d, uUp), sh = dot(uUp, sun), mu = dot(d, sun);
      float day = smoothstep(-0.14, 0.1, sh);
      vec3 zen = mix(vec3(0.003, 0.005, 0.016), vec3(0.05, 0.17, 0.5), day);
      vec3 hor = mix(vec3(0.016, 0.024, 0.055), vec3(0.5, 0.66, 0.88), day);
      float hh = clamp(h, 0.0, 1.0);
      vec3 col = mix(hor, zen, pow(hh, 0.42));
      float dusk = exp(-abs(sh + 0.03) * 10.0);
      col += vec3(0.95, 0.36, 0.1) * dusk * (0.25 + pow(max(mu, 0.0), 3.0)) * pow(1.0 - hh, 4.0) * 0.8;
      col += vec3(1.0, 0.9, 0.72) * (pow(max(mu, 0.0), 900.0) * 6.0 + pow(max(mu, 0.0), 14.0) * 0.22) * smoothstep(-0.04, 0.02, sh);
      col = mix(col, hor * 0.5, smoothstep(0.0, -0.2, h));
      gl_FragColor = vec4(col * uSky, 1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`,
}));
sky.renderOrder = -10; sky.frustumCulled = false;
scene.add(sky);

// stars: fixed on the sky, so they wheel with sidereal time; decorative positions
const starPivot = new THREE.Group(), starSpin = new THREE.Group();
starPivot.quaternion.copy(earth.quaternion);
starPivot.add(starSpin);
scene.add(starPivot);
const stars = (() => {
  const n = 5200, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    p.set([r * Math.cos(a) * 1e9, z * 1e9, r * Math.sin(a) * 1e9], i * 3);
    const m = Math.pow(rnd(), 5) * 0.9 + 0.1, t = rnd();
    c.set([m * (0.85 + 0.15 * t), m * 0.9, m * (1.05 - 0.2 * t)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ fog: false, size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  pts.frustumCulled = false;
  starSpin.add(pts);
  return pts;
})();
const sunSprite = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 256;
  const g = cv.getContext("2d"), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,250,235,1)"); gr.addColorStop(0.06, "rgba(255,240,200,1)"); gr.addColorStop(0.1, "rgba(255,210,140,0.55)");
  gr.addColorStop(0.35, "rgba(255,170,90,0.12)"); gr.addColorStop(1, "rgba(255,150,80,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false, map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.setScalar(1.3e8);
  scene.add(s);
  return s;
})();

// coastlines, borders, graticule: floated a little above the ground, faded out low down
function lineLayer(list, color, opacity, h) {
  const p = [];
  for (const ln of list) for (let k = 0; k + 3 < ln.length; k += 2) {
    const a = toVec(ln[k + 1], ln[k], RE + h), b = toVec(ln[k + 3], ln[k + 2], RE + h);
    p.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(p), 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.userData.base = opacity;
  return m;
}
const grat = [];
for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 2) grat.push([lon, lat, lon + 2, lat]);
for (let lon = -180; lon < 180; lon += 30) for (let lat = -88; lat < 88; lat += 2) grat.push([lon, lat, lon, lat + 2]);
const gratLines = lineLayer(grat, 0x6b7fb0, 0.14, 2000);
const coastLines = lineLayer(NE.coast, 0xa9bcea, 0.45, 600), borderLines = lineLayer(NE.borders, 0xc7d2f0, 0.3, 700);
const lineGroup = new THREE.Group();
lineGroup.add(coastLines, borderLines);
earth.add(gratLines, lineGroup);

// ---------- population bars ----------
// heights live in "globe units" (the original R = 100 globe) and a shader uniform squashes them as you descend
const UNIT = RE / 100;
const barU = { uBarScale: { value: 1 }, uMinH: { value: 600 } };
const barMat = new THREE.MeshLambertMaterial();
barMat.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, barU);
  sh.vertexShader = "uniform float uBarScale; uniform float uMinH;\n" + sh.vertexShader.replace("#include <begin_vertex>", `vec3 transformed = vec3(position);
    #ifdef USE_INSTANCING
      float hh = max(length(instanceMatrix[1].xyz), 1.0);
      transformed.y *= max(hh * uBarScale, uMinH) / hh;
    #endif`);
};
const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
const bars = new THREE.InstancedMesh(box, barMat, N);
bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
bars.frustumCulled = false;
earth.add(bars);
const UPS = new Float32Array(N * 3), IM = bars.instanceMatrix.array;
cells.forEach((g, i) => {
  const r = Math.floor(g / W), c = g % W;
  const lat = 90 - (r + 0.5) * STEP, lon = -180 + (c + 0.5) * STEP;
  const up = toVec(lat, lon, 1), b = lon * D2R;
  const east = new THREE.Vector3(Math.cos(b), 0, -Math.sin(b));
  const north = new THREE.Vector3().crossVectors(up, east);
  const w = RE * STEP * D2R * 0.9, we = w * Math.max(0.05, Math.cos(lat * D2R)), o = i * 16;
  IM[o] = east.x * we; IM[o + 1] = east.y * we; IM[o + 2] = east.z * we; IM[o + 3] = 0;
  IM[o + 8] = north.x * w; IM[o + 9] = north.y * w; IM[o + 10] = north.z * w; IM[o + 11] = 0;
  IM[o + 12] = up.x * RE; IM[o + 13] = up.y * RE; IM[o + 14] = up.z * RE; IM[o + 15] = 1;
  UPS[i * 3] = up.x; UPS[i * 3 + 1] = up.y; UPS[i * 3 + 2] = up.z;
});
const cur = new Float32Array(N), target = new Float32Array(N);
function writeMatrices() {
  for (let i = 0; i < N; i++) { const o = i * 16, h = cur[i] * UNIT; IM[o + 4] = UPS[i * 3] * h; IM[o + 5] = UPS[i * 3 + 1] * h; IM[o + 6] = UPS[i * 3 + 2] * h; IM[o + 7] = 0; }
  bars.instanceMatrix.needsUpdate = true;
}

const col = n => new THREE.Color(css(n));
const SEQ = ["--s0", "--s1", "--s2", "--s3", "--s4", "--s5"], DIV = ["--d0", "--d1", "--d2", "--d3", "--d4", "--d5", "--d6"];
const RAMP = { stops: [0, 0.2, 0.4, 0.6, 0.8, 1], c: SEQ.map(col) };
const GROW = { stops: [-3, -2, -1, 0, 1, 2, 3], c: DIV.map(col) };
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
const RAMP_CSS = gradCss(RAMP, SEQ);
const GROW_CSS = gradCss(GROW, DIV);
const LAYERS = [
  { id: "density", name: "Density", metric: "dens", sw: RAMP_CSS },
  { id: "people", name: "People", metric: "pop", sw: RAMP_CSS },
  { id: "growth", name: "Growth", metric: "dens", sw: GROW_CSS },
];
const SCALES = [
  { id: "lin", name: "Linear", f: x => x, max: 60 },
  { id: "sqrt", name: "Square root", f: x => Math.sqrt(x), max: 34 },
  { id: "log", name: "Log", f: null, max: 16 },
];
let layer = LAYERS[0], scale = SCALES[1], year = 2025, hovered = -1, worldTotal = 0;
const tD = i => Math.log10(1 + dcur[i]) / Math.log10(1 + dmax);
const tP = i => Math.log10(1 + pcur[i]) / Math.log10(1 + pmax);
const tmpC = new THREE.Color();
function colorFor(i, out) {
  if (layer.id === "density") return piece(RAMP, tD(i), out);
  if (layer.id === "people") return piece(RAMP, tP(i), out);
  return piece(GROW, Math.log2((dcur[i] + 1) / (EP[1975][i] + 1)), out);
}
function recolorAll() {
  for (let i = 0; i < N; i++) bars.setColorAt(i, colorFor(i, tmpC));
  if (hovered >= 0) bars.setColorAt(hovered, tmpC.set(0xffffff));
  bars.instanceColor.needsUpdate = true;
}
function setTargets() {
  const pop = layer.metric === "pop";
  for (let i = 0; i < N; i++) {
    const x = scale.f ? scale.f(pop ? pcur[i] / pmax : dcur[i] / dmax) : (pop ? tP(i) : tD(i));
    target[i] = Math.max(0.15, x * scale.max);
  }
}

// ---------- the cities ----------
// Each city is modelled in its own flat local frame (metres, x east, z south) and the whole model sits on the
// globe at its centre point, tilted to that spot's horizon. Boston's frame is the world frame.
const stdMat = opts => new THREE.MeshStandardMaterial(Object.assign({ roughness: 1, metalness: 0 }, opts));
const fadeMap = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const g = cv.getContext("2d"), img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const ex = Math.min(x, 127 - x) / 22, ey = Math.min(y, 127 - y) / 22, a = Math.min(1, ex, ey);
    const o = (y * 128 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(255 * a * a * (3 - 2 * a)); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(cv);
})();
function mergeFlat(geos) {
  let n = 0;
  const flat = geos.map(g => { const f = g.index ? g.toNonIndexed() : g; n += f.attributes.position.count; return f; });
  const p = new Float32Array(n * 3); let o = 0;
  for (const f of flat) { p.set(f.attributes.position.array, o * 3); o += f.attributes.position.count; f.dispose(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  if (n) g.computeVertexNormals();
  return g;
}
const ringToVec = arr => { const v = []; for (let k = 0; k < arr.length; k += 2) v.push(new THREE.Vector2(arr[k] / 10, -arr[k + 1] / 10)); return v; };
const groundMat = stdMat({ color: "#66625a", alphaMap: fadeMap, transparent: true });
const parkMat = stdMat({ color: "#6f8a52" }), waterMat = stdMat({ color: "#183a5e", roughness: 0.35, metalness: 0.05, alphaMap: fadeMap, transparent: true });
const roadMat = stdMat({ color: "#6c7074", roughness: 0.95 }), pathMat = stdMat({ color: "#9a968c" });
const bridgeMat = stdMat({ color: "#a9a59c", roughness: 0.85 });
const towerMat = stdMat({ color: "#eeeee8", roughness: 0.6 }), cableMat = new THREE.LineBasicMaterial({ color: "#eeeee8", transparent: true, opacity: 0.75 });
const edgeMat = new THREE.LineBasicMaterial({ color: "#20262b", transparent: true, opacity: 0.3 });
// lit windows after dark: a floor-and-bay grid on every wall, about 45% of windows on, warm white
const nightU = { value: 0 };
const bldMat = stdMat({ vertexColors: true, roughness: 0.82 });
bldMat.onBeforeCompile = sh => {
  sh.uniforms.uNight = nightU;
  sh.vertexShader = "varying vec3 vLP; varying vec3 vON;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvLP = position; vON = normal;");
  sh.fragmentShader = "uniform float uNight; varying vec3 vLP; varying vec3 vON;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
    if (uNight > 0.001 && abs(vON.y) < 0.5) {
      vec2 t = normalize(vec2(-vON.z, vON.x));
      float u = dot(vLP.xz, t), fy = vLP.y / 3.4, fx = u / 2.9;
      float win = step(0.3, fract(fy)) * step(fract(fy), 0.78) * step(0.18, fract(fx)) * step(fract(fx), 0.82);
      float r = fract(sin(dot(floor(vec3(fx, fy, dot(vLP.xz, vec2(0.013, 0.017)))), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float on = step(0.55, r) * step(1.0, vLP.y);
      totalEmissiveRadiance += win * on * uNight * vec3(1.0, 0.74, 0.42) * (0.55 + 0.9 * fract(r * 7.13));
    }`);
};
// typical New England materials for buildings without colour tags
const PAL = {
  brick: ["#9a5544", "#a8634d", "#8b4a3c", "#b07a5c", "#7e4636", "#a06a52"],
  stone: ["#d2cbbb", "#bdb6a8", "#ddd7ca", "#aaa69e", "#c6b99e", "#b9b4ab"],
  glass: ["#7f95a8", "#94a9b9", "#6f8597", "#a4b4c0", "#8a9aa3"],
  clap: ["#d9d4c7", "#c8cfd2", "#e2dccb", "#b9c2b4", "#d6c8b0", "#a9b4bd"],
  roof: ["#8f8f8b", "#9c9a95", "#7f807e", "#a7a49d", "#888a8c"]
};
const RES = new Set(["house", "detached", "semidetached_house", "terrace", "apartments", "residential", "dormitory"]);
const rnd = i => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const pickC = (arr, i) => new THREE.Color(arr[Math.floor(rnd(i) * arr.length)]);
const cHover = new THREE.Color("#f6a34a");

function makeCity(D, opts) {
  const C = { name: opts.name, D, B: D.buildings, box: D.box, timber: !!opts.timber };
  const B = C.B;
  for (const b of B) {
    b.pts = [];
    for (let i = 0; i < b.o.length; i += 2) b.pts.push([b.o[i] / 10, b.o[i + 1] / 10]);
    b.base = b.b || 0;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of b.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    b.box = [x0, x1, z0, z1];
  }
  const group = new THREE.Group(), top = new THREE.Group();
  C.group = group; C.top = top;
  group.add(top);
  scene.add(group);
  // place the local frame on the globe: origin on the ground at (lat0, lon0), y along that spot's vertical
  {
    const up = toVec(D.lat0, D.lon0, 1), east = new THREE.Vector3(Math.cos(D.lon0 * D2R), 0, -Math.sin(D.lon0 * D2R)), north = new THREE.Vector3().crossVectors(up, east);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, north.negate()));
    group.quaternion.copy(earth.quaternion).multiply(q);
    geoToWorld(D.lat0, D.lon0, 0, group.position);
    group.updateMatrixWorld(true);
    C.inv = group.matrixWorld.clone().invert();
    C.origin = group.position.clone();
  }
  const [bx0, bx1, bz0, bz1] = D.box;
  // The mapped ground and water stop at a rectangle. Both are feathered out over its last kilometre so they
  // melt into the regional coastline patch underneath instead of ending in a hard edge.
  const FADE = (() => {
    let x0 = bx0, x1 = bx1, z0 = bz0, z1 = bz1;
    for (const r of D.water) for (let k = 0; k < r.o.length; k += 2) { x0 = Math.min(x0, r.o[k] / 10); x1 = Math.max(x1, r.o[k] / 10); z0 = Math.min(z0, r.o[k + 1] / 10); z1 = Math.max(z1, r.o[k + 1] / 10); }
    return [x0 - 300, x1 + 300, z0 - 300, z1 + 300];
  })();
  // uv across the feather rectangle, for geometry already lying in the x–z plane
  function fadeUV(geo) {
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - FADE[0]) / (FADE[1] - FADE[0]); uv[i * 2 + 1] = (p.getZ(i) - FADE[2]) / (FADE[3] - FADE[2]); }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geo;
  }
  {
    const g = new THREE.PlaneGeometry(FADE[1] - FADE[0], FADE[3] - FADE[2]);
    g.rotateX(-Math.PI / 2);
    g.translate((FADE[0] + FADE[1]) / 2, -0.3, (FADE[2] + FADE[3]) / 2);
    const ground = new THREE.Mesh(fadeUV(g), groundMat);
    ground.receiveShadow = true;
    ground.renderOrder = 2;
    group.add(ground);
  }
  function areaLayer(list, mat, y) {
    if (!list || !list.length) return;
    const geos = [];
    for (const r of list) {
      const sh = new THREE.Shape(ringToVec(r.o));
      if (r.i) for (const h of r.i) sh.holes.push(new THREE.Path(ringToVec(h)));
      try { geos.push(new THREE.ShapeGeometry(sh)); } catch (e) {}
    }
    const g = mergeFlat(geos);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    const m = new THREE.Mesh(fadeUV(g), mat);
    m.receiveShadow = true;
    m.renderOrder = 3;
    group.add(m);
  }
  areaLayer(D.parks, parkMat, 0.15);
  areaLayer(D.water, waterMat, 0.25);
  function ribbons(filter, mat, shadow) {
    const p = [];
    for (const r of D.roads) {
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
    if (!p.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(p), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(p.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    const m = new THREE.Mesh(g, mat);
    m.material.side = THREE.DoubleSide;
    m.receiveShadow = true;
    m.castShadow = !!shadow;
    group.add(m);
  }
  ribbons((w, y) => w > 2 && y < 2, roadMat);
  ribbons((w, y) => w <= 2 && y < 2, pathMat);
  ribbons((w, y) => y >= 2, roadMat, true);
  if (D.bridges && D.bridges.length) {
    const geos = [];
    for (const b of D.bridges) {
      const sh = new THREE.Shape(ringToVec(b.o));
      try {
        const g = new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: false });
        g.rotateX(-Math.PI / 2); g.translate(0, b.y - 2.2, 0);
        geos.push(g);
      } catch (e) {}
    }
    const m = new THREE.Mesh(mergeFlat(geos), bridgeMat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  // Zakim Bridge: the deck is mapped, the towers and cables are not, so they are built from its published
  // dimensions: two inverted-Y towers (north 90 m, south 82 m) 227 m apart, cables fanned to both deck edges.
  const ZK = D.zakim;
  if (ZK) {
    const ax = new THREE.Vector3(ZK.ax, 0, ZK.az).normalize(), px = new THREE.Vector3(-ax.z, 0, ax.x);
    const c0 = new THREE.Vector3(ZK.cx, 0, ZK.cz), half = ZK.w / 2, deck = ZK.deck;
    const geos = [], cab = [];
    const strut = (a, b, t) => {
      const d = b.clone().sub(a), g = new THREE.BoxGeometry(t, d.length(), t);
      g.translate(0, d.length() / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      g.translate(a.x, a.y, a.z);
      geos.push(g);
    };
    const ends = [-113.5, 113.5].map(s => c0.clone().addScaledVector(ax, s)).sort((a, b) => a.z - b.z);
    [[ends[0], 90], [ends[1], 82]].forEach(([base, topH]) => {
      const apex = base.clone().setY(topH * 0.68);
      for (const s of [-1, 1]) strut(base.clone().addScaledVector(px, s * (half + 5)), apex, 4.5);
      strut(apex, base.clone().setY(topH), 4);
      strut(base.clone().addScaledVector(px, -half).setY(deck - 3), base.clone().addScaledVector(px, half).setY(deck - 3).add(new THREE.Vector3(0, 0.01, 0)), 3);
      const along = base.clone().sub(c0).dot(ax) > 0 ? 1 : -1;
      for (let k = 1; k <= 11; k++) {
        const yTop = topH * 0.7 + (topH * 0.27) * (k / 11);
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
    top.add(tm);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(cab), 3));
    top.add(new THREE.LineSegments(cg, cableMat));
  }
  // buildings: one merged mesh; each building owns a contiguous vertex range (caps first, then walls)
  const bgeos = [], edgeChunks = [];
  let total = 0, edgeCount = 0;
  for (const b of B) {
    const shape = new THREE.Shape(b.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    if (b.i) for (const ring of b.i) shape.holes.push(new THREE.Path(ringToVec(ring)));
    let g;
    try { g = new THREE.ExtrudeGeometry(shape, { depth: b.h - b.base, bevelEnabled: false }); } catch (e) { continue; }
    g.rotateX(-Math.PI / 2);
    g.translate(0, b.base, 0);
    b.start = total; b.count = g.attributes.position.count; b.cap = g.groups.length ? g.groups[0].count : 0;
    total += b.count;
    bgeos.push(g);
    const eg = new THREE.EdgesGeometry(g, 28);
    edgeChunks.push(eg.attributes.position.array); edgeCount += eg.attributes.position.count;
    eg.dispose();
  }
  const bpos = new Float32Array(total * 3), bnor = new Float32Array(total * 3), bcol = new Float32Array(total * 3);
  { let off = 0; for (const g of bgeos) { bpos.set(g.attributes.position.array, off * 3); bnor.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; g.dispose(); } }
  const bgeom = new THREE.BufferGeometry();
  bgeom.setAttribute("position", new THREE.BufferAttribute(bpos, 3));
  bgeom.setAttribute("normal", new THREE.BufferAttribute(bnor, 3));
  bgeom.setAttribute("color", new THREE.BufferAttribute(bcol, 3));
  C.bgeom = bgeom; C.bcol = bcol;
  const bld = new THREE.Mesh(bgeom, bldMat);
  bld.castShadow = bld.receiveShadow = true;
  top.add(bld);
  const ep = new Float32Array(edgeCount * 3);
  { let off = 0; for (const a of edgeChunks) { ep.set(a, off); off += a.length; } }
  const eGeom = new THREE.BufferGeometry();
  eGeom.setAttribute("position", new THREE.BufferAttribute(ep, 3));
  top.add(new THREE.LineSegments(eGeom, edgeMat));
  // Boston's houses are mostly brick; Lynn's are mostly wood-sided, so its small houses take clapboard colours
  B.forEach((b, i) => {
    const small = RES.has(b.t) || (b.h < 24 && rnd(i + 7) < 0.5);
    const kind = b.h >= 70 ? "glass" : small ? (C.timber && b.h < 14 && rnd(i + 11) < 0.8 ? "clap" : "brick") : "stone";
    b.wall = pickC(PAL[kind], i);
    if (b.c) b.wall.setStyle(b.c);
    b.roof = kind === "glass" ? pickC(PAL.glass, i + 3).multiplyScalar(0.8) : pickC(PAL.roof, i + 1);
    if (b.rc) b.roof.setStyle(b.rc);
    paintB(C, b, b.wall, b.roof);
  });
  // labelled buildings: the tallest named ones with measured heights, plus any the caller asks for
  const seen = new Set();
  C.named = B.filter(b => b.n && b.s === "m").sort((a, b) => b.h - a.h).filter(b => !seen.has(b.n) && seen.add(b.n));
  const extra = (opts.labels || []).map(n => B.find(b => b.n === n)).filter(Boolean);
  C.labels = extra.concat(C.named.filter(b => !extra.includes(b))).slice(0, 12)
    .map(b => ({ name: b.n, h: b.h, x: (b.box[0] + b.box[1]) / 2, z: (b.box[2] + b.box[3]) / 2, b, city: C }));
  C.on = false;
  return C;
}
function paintB(C, b, wall, roof) {
  if (b.count == null) return;
  const end = b.start + b.count, capEnd = b.start + b.cap, col = C.bcol;
  for (let v = b.start; v < end; v++) { const c = v < capEnd ? roof : wall; col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
}
const BOSTON = makeCity(DATA, { name: "Boston" });
const LYNN = makeCity(LYNN_DATA, { name: "Lynn", timber: true, labels: ["Lynn English High School", "Lynn Memorial City Hall and Auditorium", "Lynn Public Library", "Lynn Museum & Arts Center", "Lynn District Court"] });
const CITIES = [BOSTON, LYNN];
const B = BOSTON.B, ZK = DATA.zakim;
const BUILDING_TOTAL = CITIES.reduce((s, c) => s + c.B.length, 0);
let bHover = null;
function setBHover(h) {
  if (h === bHover || (h && bHover && h.city === bHover.city && h.i === bHover.i)) return;
  if (bHover) { const b = bHover.city.B[bHover.i]; paintB(bHover.city, b, b.wall, b.roof); bHover.city.bgeom.attributes.color.needsUpdate = true; }
  bHover = h;
  if (h) { paintB(h.city, h.city.B[h.i], cHover, cHover); h.city.bgeom.attributes.color.needsUpdate = true; }
}
// a point in a city's local frame, as a ground position on the globe
const cityGeo = (C, x, z, h = 0) => { const g = worldToGeo(new THREE.Vector3(x, 0, z).applyMatrix4(C.group.matrixWorld)); g.h = h; return g; };

// ---------- lights ----------
const ambient = new THREE.AmbientLight(0xbfcbe6, 0.22);
const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x8a8070, 0);
const sun = new THREE.DirectionalLight(0xfff1dc, U.sunI.value);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 100; sun.shadow.camera.far = 14000;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.6;
scene.add(ambient, hemi, sun, sun.target);

// ---------- camera rig ----------
// The view is a point on the ground (lat, lon, h), a distance to it, a compass heading and a tilt from straight down.
const HOME = { lat: 28, lon: -38, h: 0, range: innerWidth <= 760 ? 3.6e7 : 2.5e7, heading: 0, tilt: 0 };
const view = { ...HOME }, goal = { ...HOME };
const _T = new THREE.Vector3(), _U = new THREE.Vector3(), _E = new THREE.Vector3(), _N = new THREE.Vector3(), _F = new THREE.Vector3();
let alt = 0, userTilted = false;
function frameAt(lat, lon, h) {
  geoToWorld(lat, lon, h, _T);
  _U.copy(_T).sub(CENTER).normalize();
  _E.crossVectors(AXIS, _U).normalize();
  _N.crossVectors(_U, _E);
}
function placeCamera() {
  frameAt(view.lat, view.lon, view.h);
  const hd = view.heading, t = view.tilt;
  _F.copy(_N).multiplyScalar(Math.cos(hd)).addScaledVector(_E, Math.sin(hd));
  camera.position.copy(_T).addScaledVector(_U, view.range * Math.cos(t)).addScaledVector(_F, -view.range * Math.sin(t));
  camera.up.copy(_F).multiplyScalar(Math.cos(t)).addScaledVector(_U, Math.sin(t));
  camera.lookAt(_T);
  camera.updateMatrixWorld();
  alt = camera.position.distanceTo(CENTER) - RE;
}
// range that puts the camera at a given altitude above a ground point, for the current tilt
const rangeFor = (a, t = goal.tilt) => -RE * Math.cos(t) + Math.sqrt(RE * RE * Math.cos(t) ** 2 + (RE + a) ** 2 - RE * RE);
const MAXR = 4.6e7, MINR = 90;
const autoTilt = r => 60 * D2R * smooth(Math.log(60e3), Math.log(4e3), Math.log(r));
function setRange(r) {
  goal.range = clamp(r, MINR, MAXR);
  if (!userTilted) goal.tilt = autoTilt(goal.range);
}

let flight = null;
function flyTo(d, opts = {}) {
  stopTip();
  const to = Object.assign({ h: 0, heading: 0, tilt: 0 }, d);
  if (reduceMotion) { Object.assign(view, to); Object.assign(goal, to); flight = null; return; }
  const from = { ...view };
  const a = toVec(from.lat, from.lon, 1), b = toVec(to.lat, to.lon, 1);
  const ang = a.angleTo(b);
  const lr0 = Math.log(from.range), lr1 = Math.log(to.range);
  const peak = Math.log(Math.max(from.range, to.range, RE * ang * 1.25));
  const bump = Math.max(0, peak - Math.max(lr0, lr1));
  const dur = opts.dur || clamp(1600 + 380 * Math.abs(lr1 - lr0) + 1700 * ang + 500 * bump, 1400, 9000);
  flight = { t: 0, from, to, a, b, ang, lr0, lr1, bump, dur, done: opts.done };
  userTilted = to.tilt > autoTilt(to.range) + 0.05 || to.tilt < autoTilt(to.range) - 0.05;
}
const _q = new THREE.Vector3();
function stepFlight(dt) {
  const f = flight;
  f.t = Math.min(1, f.t + dt / f.dur);
  const e = ease(f.t);
  if (f.ang > 1e-6) {
    const s = Math.sin(f.ang), ka = Math.sin((1 - e) * f.ang) / s, kb = Math.sin(e * f.ang) / s;
    _q.copy(f.a).multiplyScalar(ka).addScaledVector(f.b, kb);
    view.lat = Math.asin(clamp(_q.y / _q.length(), -1, 1)) / D2R; view.lon = Math.atan2(_q.x, _q.z) / D2R;
  } else { view.lat = f.to.lat; view.lon = f.to.lon; }
  view.h = f.from.h + (f.to.h - f.from.h) * e;
  view.range = Math.exp(f.lr0 + (f.lr1 - f.lr0) * e + f.bump * Math.sin(Math.PI * e));
  view.heading = f.from.heading + wrap180((f.to.heading - f.from.heading) / D2R) * D2R * e;
  // tilt late on the way down, early on the way up, and level out over the top of a long arc
  const te = f.to.tilt > f.from.tilt ? e * e : 1 - (1 - e) * (1 - e);
  view.tilt = (f.from.tilt + (f.to.tilt - f.from.tilt) * te) * (1 - 0.75 * Math.sin(Math.PI * e) * Math.min(1, f.bump));
  if (f.t >= 1) { flight = null; Object.assign(goal, view); if (f.done) f.done(); }
}
function follow(dt) {
  const k = reduceMotion ? 1 : 1 - Math.pow(0.0004, dt / 1000);
  view.lat += (goal.lat - view.lat) * k;
  view.lon += wrap180(goal.lon - view.lon) * k; view.lon = wrap180(view.lon);
  view.h += (goal.h - view.h) * k;
  view.range = Math.exp(Math.log(view.range) + (Math.log(goal.range) - Math.log(view.range)) * k);
  view.heading += wrap180((goal.heading - view.heading) / D2R) * D2R * k;
  view.tilt += (goal.tilt - view.tilt) * k;
}
const metersPerPixel = () => view.range * 2 * Math.tan(camera.fov * D2R / 2) / innerHeight;
function panBy(dx, dy) {
  const m = metersPerPixel(), hd = goal.heading, ty = 1 / Math.max(Math.cos(goal.tilt), 0.35);
  const dN = dx * m * Math.sin(hd) + dy * m * ty * Math.cos(hd);
  const dE = -dx * m * Math.cos(hd) + dy * m * ty * Math.sin(hd);
  goal.lat = clamp(goal.lat + dN / RE / D2R, -84, 84);
  goal.lon = wrap180(goal.lon + dE / (RE * Math.cos(goal.lat * D2R)) / D2R);
  if (goal.h && alt > 3000) goal.h = 0;
}
function turnBy(dHeading, dTilt) {
  goal.heading += dHeading;
  if (dTilt) { goal.tilt = clamp(goal.tilt + dTilt, 0, 80 * D2R); userTilted = true; syncTiltBtn(); }
}

// ---------- picking ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), sphere = new THREE.Sphere(CENTER, RE), hit = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function castFrom(x, y) { ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
function groundAt(x, y) {
  castFrom(x, y);
  const C = nearestCity();
  if (C && C.on) {
    const r = ray.ray.clone().applyMatrix4(C.inv);
    if (r.intersectPlane(groundPlane, hit) && hit.length() < 40000) return worldToGeo(hit.applyMatrix4(C.group.matrixWorld));
  }
  return ray.ray.intersectSphere(sphere, hit) ? worldToGeo(hit) : null;
}
function inPoly(x, z, p) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
const nearestCity = () => { let best = null, bd = Infinity; for (const C of CITIES) { const d = camera.position.distanceTo(C.origin); if (d < bd) { bd = d; best = C; } } return best; };
// nearest building under the pointer across every city in view, tested in each city's own frame
function pickBuilding(x, y) {
  castFrom(x, y);
  let found = null, foundT = Infinity;
  for (const C of CITIES) {
    if (!C.on) continue;
    const [i, t] = pickIn(C, ray.ray.clone().applyMatrix4(C.inv));
    if (i >= 0 && t < foundT) { foundT = t; found = { city: C, i }; }
  }
  return found;
}
function pickIn(C, r) {
  const B = C.B, o = r.origin, d = r.direction, s = C.top.scale.y;
  let best = -1, bestT = Infinity;
  for (let i = 0; i < B.length; i++) {
    const b = B[i], top = b.h * s, bot = b.base * s, [x0, x1, z0, z1] = b.box;
    let tmin = 0, tmax = bestT;
    for (const [oo, dd, lo, hi] of [[o.x, d.x, x0, x1], [o.y, d.y, bot, top], [o.z, d.z, z0, z1]]) {
      if (Math.abs(dd) < 1e-12) { if (oo < lo || oo > hi) { tmin = Infinity; break; } continue; }
      let ta = (lo - oo) / dd, tb = (hi - oo) / dd;
      if (ta > tb) [ta, tb] = [tb, ta];
      tmin = Math.max(tmin, ta); tmax = Math.min(tmax, tb);
      if (tmin > tmax) break;
    }
    if (tmin > tmax || tmin === Infinity) continue;
    let t = Infinity;
    if (d.y < 0) { const tt = (top - o.y) / d.y; if (tt > 0 && tt < t && inPoly(o.x + tt * d.x, o.z + tt * d.z, b.pts)) t = tt; }
    const p = b.pts;
    for (let k = 0, j = p.length - 1; k < p.length; j = k++) {
      const ex = p[k][0] - p[j][0], ez = p[k][1] - p[j][1], den = d.x * ez - d.z * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = p[j][0] - o.x, wz = p[j][1] - o.z, tt = (wx * ez - wz * ex) / den, u = (wx * d.z - wz * d.x) / den;
      if (tt > 0 && tt < t && u >= 0 && u <= 1) { const yy = o.y + tt * d.y; if (yy >= bot && yy <= top) t = tt; }
    }
    if (t < bestT) { bestT = t; best = i; }
  }
  return [best, bestT];
}
const tip = $("tip");
function hoverCell(g) {
  const i = g >= 0 ? instOf[g] : -1;
  if (hovered >= 0) bars.setColorAt(hovered, colorFor(hovered, tmpC));
  hovered = i;
  if (i >= 0) bars.setColorAt(i, tmpC.set(0xffffff));
  bars.instanceColor.needsUpdate = true;
}
function stopTip() { tip.hidden = true; hoverCell(-1); setBHover(null); }
function showTip(parts, x, y) {
  tip.replaceChildren(...parts);
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - tw - 8)) + "px";
  tip.style.top = Math.max(8, Math.min(y + 14, innerHeight - th - 8)) + "px";
}
const elx = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; };
const SRC_LABEL = { m: "measured height", f: "height from floor count", e: "height estimated from type" };
function probe(x, y) {
  if (CITIES.some(C => C.on) && BOSTON.top.scale.y > 0.3) {
    const hitB = pickBuilding(x, y);
    if (hitB) {
      hoverCell(-1); setBHover(hitB);
      const b = hitB.city.B[hitB.i], parts = [elx("strong", "", b.n || b.a || (b.t ? b.t.replace(/_/g, " ") : "Building"))];
      parts.push(elx("div", "", [b.n && b.a ? b.a : "", hitB.city.name].filter(Boolean).join(", ")));
      const h = b.h, e = Math.max(sunElev, 0);
      parts.push(elx("div", "m", `${Math.round(h)} m · ${Math.round(h * 3.281)} ft · ${SRC_LABEL[b.s]}`));
      if (e > 0.5) parts.push(elx("div", "", `Shadow right now: about ${fmtDist(h / Math.tan(e * D2R))} long`));
      showTip(parts, x, y);
      return;
    }
    setBHover(null);
  }
  castFrom(x, y);
  if (!ray.ray.intersectSphere(sphere, hit)) { stopTip(); return; }
  const geo = worldToGeo(hit), g = cellAt(geo.lat, geo.lon), d = dens[g], r = Math.floor(g / W), i = instOf[g];
  hoverCell(g);
  const parts = [elx("strong", "", d < 0.5 ? "Uninhabited" : fmtDen(d) + " per km²"), elx("div", "", d < 0.5 ? "Fewer than one person per km²" : `≈ ${fmt(d * cellArea(r))} people in this 28 km cell, ${year}`)];
  if (i >= 0 && layer.id === "growth") { const a = EP[1975][i], q = (dcur[i] + 1) / (a + 1); parts.push(elx("div", "", `${q >= 1 ? "×" + q.toFixed(q < 10 ? 1 : 0) : "÷" + (1 / q).toFixed(1)} since 1975`)); }
  const cLat = 90 - (r + 0.5) * STEP, cLon = -180 + (g % W + 0.5) * STEP;
  parts.push(elx("div", "m", `${Math.abs(cLat).toFixed(2)}°${cLat >= 0 ? "N" : "S"} ${Math.abs(cLon).toFixed(2)}°${cLon >= 0 ? "E" : "W"}`));
  showTip(parts, x, y);
}
const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m";

// ---------- input ----------
const pointers = new Map();
let gesture = null, downAt = null, pendingHover = null;
const stopAuto = () => { flight = null; if (tour) endTour(); };
el.addEventListener("contextmenu", e => e.preventDefault());
el.addEventListener("pointerdown", e => {
  el.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stopAuto();
  if (pointers.size === 1) { downAt = [e.clientX, e.clientY, performance.now()]; gesture = { mode: e.button === 2 || e.ctrlKey || e.shiftKey ? "turn" : "pan" }; }
  else { downAt = null; gesture = { mode: "multi", ...twoFinger() }; }
  if (e.pointerType !== "mouse") tip.hidden = true;
});
function twoFinger() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2, mx: (a.x + b.x) / 2 };
}
el.addEventListener("pointermove", e => {
  if (!pointers.has(e.pointerId)) { if (e.pointerType === "mouse") pendingHover = [e.clientX, e.clientY]; return; }
  const p = pointers.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (!gesture) return;
  if (gesture.mode === "pan") panBy(dx, dy);
  else if (gesture.mode === "turn") turnBy(-dx * 0.006, -dy * 0.005);
  else if (gesture.mode === "multi" && pointers.size >= 2) {
    const g = twoFinger();
    setRange(goal.range * gesture.d / Math.max(g.d, 1));
    turnBy(-(g.ang - gesture.ang), -(g.my - gesture.my) * 0.005);
    panBy(g.mx - gesture.mx, 0);
    Object.assign(gesture, g);
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (downAt && pointers.size === 0) {
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    if (moved < (e.pointerType === "mouse" ? 6 : 12) && performance.now() - downAt[2] < 600) probe(e.clientX, e.clientY);
  }
  downAt = null;
  gesture = pointers.size === 1 ? { mode: "pan" } : pointers.size ? { mode: "multi", ...twoFinger() } : null;
}
el.addEventListener("pointerup", endPointer);
el.addEventListener("pointercancel", endPointer);
el.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !pointers.size) { pendingHover = null; stopTip(); } });
el.addEventListener("wheel", e => {
  e.preventDefault();
  stopAuto();
  const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  const f = Math.exp(clamp(dy, -400, 400) * 0.0016);
  // zoom toward the point under the pointer
  if (f < 1) {
    const gp = groundAt(e.clientX, e.clientY);
    if (gp) {
      const k = 1 - f;
      goal.lat = clamp(goal.lat + (gp.lat - goal.lat) * k, -84, 84);
      goal.lon = wrap180(goal.lon + wrap180(gp.lon - goal.lon) * k);
      goal.h *= f;
    }
  }
  setRange(goal.range * f);
}, { passive: false });
el.addEventListener("keydown", e => {
  const step = (e.shiftKey ? 0.2 : 0.07) * innerHeight;
  switch (e.key) {
    case "ArrowLeft": panBy(step, 0); break;
    case "ArrowRight": panBy(-step, 0); break;
    case "ArrowUp": panBy(0, step); break;
    case "ArrowDown": panBy(0, -step); break;
    case "+": case "=": setRange(goal.range * 0.6); break;
    case "-": case "_": setRange(goal.range / 0.6); break;
    case "q": case "Q": turnBy(-15 * D2R, 0); break;
    case "e": case "E": turnBy(15 * D2R, 0); break;
    case "n": case "N": goal.heading = 0; break;
    case "PageUp": turnBy(0, 10 * D2R); break;
    case "PageDown": turnBy(0, -10 * D2R); break;
    case "Home": goHome(); break;
    case "Enter": probe(innerWidth / 2, innerHeight / 2); break;
    default: return;
  }
  stopAuto();
  e.preventDefault();
});
document.addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input:not([type=range]):not([type=checkbox]), textarea")) return;
  if (e.key === " " && (e.target === document.body || e.target === el)) { e.preventDefault(); setClockPlaying(!clockPlaying); }
  else if (e.key === "Escape") { stopTip(); if (tour) endTour(); }
});

// ---------- sun clock ----------
const TZ = "America/New_York";
const dtfParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
const dtfClock = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dtfZone = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "short" });
const dtfDate = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric" });
function localParts(ms) {
  const p = {}; for (const x of dtfParts.formatToParts(new Date(ms))) p[x.type] = +x.value;
  return { y: p.year, m: p.month, d: p.day, min: (p.hour % 24) * 60 + p.minute, s: p.second };
}
const tzOffset = ms => { const p = localParts(ms); return Date.UTC(p.y, p.m - 1, p.d, 0, p.min, p.s) - Math.floor(ms / 1000) * 1000; };
function fromLocal(y, m, d, min) {
  const guess = Date.UTC(y, m - 1, d, 0, min);
  let ms = guess - tzOffset(guess);
  const o2 = tzOffset(ms); if (guess - o2 !== ms) ms = guess - o2;
  return ms;
}
let simMs = Date.now(), live = true, clockPlaying = false, sunElev = 0, sunAz = 0;
const todIn = $("tod"), doyIn = $("doy");
const yearStart = y => Date.UTC(y, 0, 1);
const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
let riseSetKey = "";
function riseSet(ms) {
  const p = localParts(ms), key = p.y + "-" + p.m + "-" + p.d;
  if (key === riseSetKey) return;
  riseSetKey = key;
  const t0 = fromLocal(p.y, p.m, p.d, 0), ev = [];
  let prev = elevAt(t0) + 0.833;
  for (let k = 1; k <= 144; k++) {
    const t = t0 + k * 600000, v = elevAt(t) + 0.833;
    if ((prev < 0) !== (v < 0)) ev.push([prev < 0 ? "Sunrise" : "Sunset", t - 600000 * v / (v - prev)]);
    prev = v;
  }
  $("sun-extra").textContent = ev.length ? ev.map(([n, t]) => `${n} ${dtfClock.format(new Date(t))}`).join(" · ") : "";
}
function syncClockUI() {
  const p = localParts(simMs);
  todIn.value = p.min;
  doyIn.value = Math.min(364, Math.floor((Date.UTC(p.y, p.m - 1, p.d) - yearStart(p.y)) / 86400000));
  const zone = (dtfZone.formatToParts(new Date(simMs)).find(x => x.type === "timeZoneName") || {}).value || "";
  $("clock").innerHTML = `${esc(dtfClock.format(new Date(simMs)))}<small>${esc(zone)}</small>`;
  $("date-out").textContent = dtfDate.format(new Date(simMs));
  const e = sunElev, dir = COMPASS[Math.round(((sunAz % 360) + 360) % 360 / 45) % 8];
  $("sun-out").innerHTML = e > 0
    ? `Sun <b>${Math.round(e)}°</b> up in the ${dir} · shadows ${e < 1 ? "very long" : (1 / Math.tan(e * D2R)).toFixed(1) + "× height"}`
    : `Sun <b>${Math.round(-e)}°</b> below the horizon`;
  todIn.setAttribute("aria-valuetext", dtfClock.format(new Date(simMs)));
  doyIn.setAttribute("aria-valuetext", dtfDate.format(new Date(simMs)));
  $("now").setAttribute("aria-pressed", String(live));
  riseSet(simMs);
}
function setSim(ms) {
  simMs = ms;
  const s = sunAt(ms);
  sunGMST = s.gmst;
  toVec(s.lat, s.lon, 1, sunLocal);
  sunWorld.copy(sunLocal).transformDirection(E2W);
  sunElev = Math.asin(clamp(sunWorld.y, -1, 1)) / D2R;
  sunAz = Math.atan2(sunWorld.x, -sunWorld.z) / D2R;
}
let clockUIAt = 0;
todIn.addEventListener("input", () => { live = false; const p = localParts(simMs); setSim(fromLocal(p.y, p.m, p.d, +todIn.value)); syncClockUI(); });
doyIn.addEventListener("input", () => {
  live = false;
  const p = localParts(simMs), dt = new Date(yearStart(p.y) + +doyIn.value * 86400000);
  setSim(fromLocal(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), p.min)); syncClockUI();
});
$("now").addEventListener("click", () => { live = true; setClockPlaying(false); setSim(Date.now()); syncClockUI(); });
document.querySelectorAll("[data-md]").forEach(b => b.addEventListener("click", () => {
  live = false;
  const [m, d] = b.dataset.md.split("-").map(Number), p = localParts(simMs);
  setSim(fromLocal(p.y, m, d, p.min)); syncClockUI();
}));
function setClockPlaying(on) {
  clockPlaying = on && !reduceMotion;
  if (clockPlaying) live = false;
  $("clock-icon").setAttribute("d", clockPlaying ? "M5 3h3.5v14H5zM11.5 3H15v14h-3.5z" : "M5 3l12 7-12 7z");
  $("clock-play").setAttribute("aria-label", clockPlaying ? "Pause the clock" : "Play the day");
}
$("clock-play").addEventListener("click", () => setClockPlaying(!clockPlaying));

// ---------- population controls ----------
const yrIn = $("yr");
const EPOCHS = new Set(YEARS);
let yrPlaying = false, yearF = 2025;
function setYear(y) {
  year = Math.round(y);
  densAt(year, dcur);
  worldTotal = 0;
  for (let i = 0; i < N; i++) { pcur[i] = dcur[i] * areaOf[i]; dens[cells[i]] = dcur[i]; worldTotal += pcur[i]; }
  yrIn.value = year; $("yr-out").textContent = year;
  const note = year > 2025 ? "Projection" : EPOCHS.has(year) ? "GHS-POP estimate" : "Interpolated between estimates";
  $("yr-note").textContent = `${note} · ≈ ${fmt(worldTotal)} people`;
  yrIn.setAttribute("aria-valuetext", `${year}, ${note}, ${fmt(worldTotal)} people`);
  setTargets(); recolorAll(); updatePlaceList(); updateTopTable();
  if (typeof refreshStageNote === "function") refreshStageNote();
  if (reduceMotion) { cur.set(target); writeMatrices(); }
}
yrIn.addEventListener("input", () => { setYrPlaying(false); setYear(+yrIn.value); });
function setYrPlaying(on) {
  yrPlaying = on;
  if (on) { if (year >= 2025) setYear(1975); yearF = year; }
  $("yr-icon").setAttribute("d", on ? "M5 3h3.5v14H5zM11.5 3H15v14h-3.5z" : "M5 3l12 7-12 7z");
  $("yr-play").setAttribute("aria-label", on ? "Pause" : "Play the years from 1975");
}
$("yr-play").addEventListener("click", () => setYrPlaying(!yrPlaying));
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
    const st = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (st === undefined) return;
    e.preventDefault();
    const n = (k + st + btns.length) % btns.length;
    btns[n].focus(); pick(items[n]);
  });
  sync();
}
function ticksHtml(list) {
  return `<div class="ticks">${list.map(([pos, label], k) => `<span class="${k === 0 && pos < 0.02 ? "first" : ""}${pos > 0.98 ? "last" : ""}" style="left:${(pos * 100).toFixed(1)}%">${label}</span>`).join("")}</div>`;
}
function setLayer(L) {
  layer = L;
  const lg = $("legend");
  if (L.id === "growth") {
    const pos = x => (x + 3) / 6;
    lg.innerHTML = `<div class="ramp" style="background:${GROW_CSS}"></div>${ticksHtml([[pos(-3), "÷8"], [pos(-2), "÷4"], [pos(-1), "÷2"], [pos(0), "same"], [pos(1), "×2"], [pos(2), "×4"], [pos(3), "×8"]])}<p class="note">Change in density since 1975. Blue cells lost people, red cells gained them, gray cells stayed about the same. Height is still density.</p>`;
    if (year < 1990) setYear(2025); else setYear(year);
  } else {
    const m = L.id === "density" ? dmax : pmax, vals = L.id === "density" ? [1, 10, 100, 1000, 10000] : [100, 1000, 1e4, 1e5, 1e6];
    const t = v => Math.log10(1 + v) / Math.log10(1 + m);
    lg.innerHTML = `<div class="ramp" style="background:${RAMP_CSS}"></div>${ticksHtml(vals.filter(v => t(v) > 0.04 && t(v) < 0.86).map(v => [t(v), fmtShort(v)]).concat([[1, fmtShort(m)]]))}<p class="note">${L.id === "density" ? "People per km². Height and color both show it." : "Residents in each 28 km cell."}</p>`;
    setYear(year);
  }
}
radioGroup($("layers"), LAYERS, it => it === layer, (b, it) => { b.className = "layer"; b.innerHTML = `<span class="sw" style="background:${it.sw}" aria-hidden="true"></span><b>${it.name}</b>`; }, setLayer);
radioGroup($("scales"), SCALES, it => it === scale, (b, it) => { b.textContent = it.name; }, it => { scale = it; setTargets(); if (reduceMotion) { cur.set(target); writeMatrices(); } });

// display switches
let realSun = true, showNames = true;
$("realsun").addEventListener("change", e => { realSun = e.target.checked; });
$("names").addEventListener("change", e => { showNames = e.target.checked; $("labels").hidden = !showNames; });
$("lines").addEventListener("change", e => { lineGroup.visible = e.target.checked; });

// ---------- places ----------
const toGeoXZ = (x, z, h = 0) => cityGeo(BOSTON, x, z, h);
const named = BOSTON.named;
const tallest = named[0];
const BOS_CELL = cellAt(42.36, -71.06);
const backBay = { ...toGeoXZ(-1050, 250, 30), range: 1900, heading: 58 * D2R, tilt: 63 * D2R };
// tilted far enough that the horizon and sky show above the city
const airliner = { ...toGeoXZ(0, -1100, 0), range: rangeFor(11e3, 72 * D2R), heading: 40 * D2R, tilt: 72 * D2R };
const PLACES = [
  { name: "Whole Earth", go: () => HOME },
  { name: "Ganges plain", g: [25.6, 85.1], go: () => ({ lat: 24.5, lon: 85, range: 2.6e6, heading: 0, tilt: 28 * D2R }) },
  { name: "Nile valley and delta", g: [30.05, 31.24], go: () => ({ lat: 28.5, lon: 31.2, range: 1.5e6, heading: 0, tilt: 30 * D2R }) },
  { name: "New England", g: [42.36, -71.06], go: () => ({ lat: 41.8, lon: -71.4, range: 7.5e5, heading: 10 * D2R, tilt: 32 * D2R }) },
  { name: "Boston from an airliner", go: () => airliner },
  { name: "Back Bay rooftops", go: () => backBay },
  { name: tallest.n, sub: Math.round(tallest.h) + " m", go: () => { const cx = (tallest.box[0] + tallest.box[1]) / 2, cz = (tallest.box[2] + tallest.box[3]) / 2; return { ...toGeoXZ(cx, cz, tallest.h * 0.5), range: 650, heading: 210 * D2R, tilt: 66 * D2R }; } },
];
if (ZK) PLACES.push({ name: "Zakim Bridge", sub: "90 m", go: () => ({ ...toGeoXZ(ZK.cx, ZK.cz, 35), range: 520, heading: 300 * D2R, tilt: 70 * D2R }) });
// Lynn, 15 km up the coast
const lynnSchool = LYNN.B.find(b => b.n === "Lynn English High School");
const lynnEnglish = lynnSchool
  ? { ...cityGeo(LYNN, (lynnSchool.box[0] + lynnSchool.box[1]) / 2, (lynnSchool.box[2] + lynnSchool.box[3]) / 2, 8), range: 700, heading: 200 * D2R, tilt: 62 * D2R }
  : { ...cityGeo(LYNN, 0, 0, 0), range: 2500, heading: 0, tilt: 55 * D2R };
const lynnCenter = { ...cityGeo(LYNN, 0, 0, 0), range: 3600, heading: 150 * D2R, tilt: 58 * D2R };
PLACES.push({ name: "Lynn English High School", go: () => lynnEnglish }, { name: "Lynn from above the harbor", go: () => lynnCenter });
const placeVals = [];
for (const p of PLACES) {
  const li = document.createElement("li"), btn = document.createElement("button");
  const a = elx("span", "", p.name), b = elx("span", "", p.sub || "");
  btn.append(a, b); li.append(btn); $("places").append(li);
  btn.addEventListener("click", () => { stopAuto(); flyTo(p.go()); });
  if (p.g) placeVals.push([b, cellAt(p.g[0], p.g[1])]);
}
function updatePlaceList() { for (const [b, g] of placeVals) b.textContent = fmtDen(dens[g]) + " /km²"; }
// the same numbers as the bars, as a table: the eight most crowded cells for the chosen year
const nearCity = (lat, lon) => {
  let best = null, bd = 0.8 * 0.8;
  for (const [name, la, lo, , country] of NE.cities) { const d = (la - lat) ** 2 + ((lo - lon) * Math.cos(lat * D2R)) ** 2; if (d < bd) { bd = d; best = name; } }
  return best;
};
function updateTopTable() {
  const top = [];
  for (let i = 0; i < N; i++) {
    if (top.length < 8 || dcur[i] > dcur[top[top.length - 1]]) { top.push(i); top.sort((a, b) => dcur[b] - dcur[a]); if (top.length > 8) top.pop(); }
  }
  $("top-year").textContent = year;
  $("top-body").replaceChildren(...top.map(i => {
    const g = cells[i], lat = 90 - (Math.floor(g / W) + 0.5) * STEP, lon = -180 + (g % W + 0.5) * STEP;
    const tr = document.createElement("tr"), btn = document.createElement("button");
    btn.textContent = nearCity(lat, lon) || `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
    btn.addEventListener("click", () => { stopAuto(); flyTo({ lat, lon, range: 9e5, heading: 0, tilt: 30 * D2R }); });
    const td = document.createElement("td"); td.append(btn);
    tr.append(td, elx("td", "", fmtDen(dcur[i])), elx("td", "", fmtShort(pcur[i])));
    return tr;
  }));
}
function goHome() { userTilted = false; flyTo(HOME); }
$("dive").addEventListener("click", () => { stopAuto(); flyTo(backBay); });
$("home").addEventListener("click", () => { stopAuto(); goHome(); });
$("zin").addEventListener("click", () => { stopAuto(); setRange(goal.range * 0.45); });
$("zout").addEventListener("click", () => { stopAuto(); setRange(goal.range / 0.45); });
$("compass").addEventListener("click", () => { stopAuto(); goal.heading = 0; });
function syncTiltBtn() { $("tiltbtn").setAttribute("aria-pressed", String(goal.tilt > 20 * D2R)); }
$("tiltbtn").addEventListener("click", () => { stopAuto(); userTilted = true; goal.tilt = goal.tilt > 20 * D2R ? 0 : 62 * D2R; syncTiltBtn(); });

// ---------- altitude ladder ----------
const LMIN = Math.log10(60), LMAX = Math.log10(4.2e7);
const RUNGS = [
  [35786e3, "Geostationary satellites"],
  [20200e3, "GPS satellites"],
  [RE, "One Earth radius"],
  [408e3, "Space Station"],
  [100e3, "Edge of space"],
  [11e3, "Airliner"],
  [tallest.h, tallest.n],
];
const ladder = $("ladder");
const ladderY = a => (LMAX - Math.log10(clamp(a, 60, 4.2e7))) / (LMAX - LMIN);
for (let p = 2; p <= 7; p++) {
  const r = document.createElement("button"); r.className = "rung pow"; r.style.top = `calc(8px + (100% - 16px) * ${ladderY(10 ** p)})`;
  r.innerHTML = `<span>10<sup>${p}</sup> m</span><i></i>`;
  r.setAttribute("aria-label", `Go to ${fmtAlt(10 ** p)} altitude`);
  r.addEventListener("click", () => climbTo(10 ** p));
  ladder.append(r);
}
for (const [a, name] of RUNGS) {
  const r = document.createElement("button"); r.className = "rung"; r.style.top = `calc(8px + (100% - 16px) * ${ladderY(a)})`;
  r.innerHTML = `<span>${esc(name)}<small>${fmtAlt(a)}</small></span><i></i>`;
  r.setAttribute("aria-label", `Go to ${fmtAlt(a)}, ${name}`);
  r.addEventListener("click", () => climbTo(a));
  ladder.append(r);
}
const marker = document.createElement("div"); marker.className = "marker"; marker.innerHTML = `<b id="alt-tag"></b><i></i>`;
ladder.append(marker);
function climbTo(a) {
  stopAuto();
  const near = alt < 2e5 && camera.position.length() < 3e5;
  const base = near ? { lat: view.lat, lon: view.lon } : { lat: LAT0 - 0.02, lon: LON0 - 0.01 };
  const tilt = userTilted ? goal.tilt : autoTilt(a);
  flyTo({ ...base, h: a < 3000 ? view.h : 0, heading: view.heading, tilt, range: rangeFor(a, tilt) });
}

// ---------- scale stages ----------
// share of inhabited land that holds half of everyone, for the year on the slider
let halfYear = -1, halfPct = 0;
function halfLand() {
  if (halfYear !== year) {
    const idx = Array.from({ length: N }, (_, i) => i).sort((a, b) => pcur[b] - pcur[a]);
    let p = 0, a = 0, all = 0;
    for (let i = 0; i < N; i++) all += areaOf[i];
    for (const i of idx) { if (p >= worldTotal / 2) break; p += pcur[i]; a += areaOf[i]; }
    halfYear = year; halfPct = a / all * 100;
  }
  return halfPct < 1 ? halfPct.toFixed(1) : Math.round(halfPct);
}
const STAGES = [
  [1e7, "The whole planet", () => "Each bar is a 28 km square of land. Taller, lighter bars hold more people per km². Sunlight and night sit where they really are for the time on the clock."],
  [1.5e6, "A continent", () => `In ${year}, half of all people lived on ${halfLand()}% of the inhabited land shown here.`],
  [2.5e5, "A region", () => "Below a few thousand km the bars shrink until they lie flat on the land as a density map."],
  [4e4, "A metro area", () => "The 28 km cells fade out. Below about 50 km Boston's buildings start to rise."],
  [3e3, "A neighborhood", () => `${BUILDING_TOTAL.toLocaleString()} buildings in Boston and Lynn from OpenStreetMap at their recorded heights, each casting its shadow for the time on the clock.`],
  [0, "Street level", () => "Drag the time slider to move the shadows. Click a building to read its height."],
];
const refreshStageNote = () => { if (stageIdx >= 0) $("stage-note").textContent = STAGES[stageIdx][2](); };
let stageIdx = -1, altShown = "";
function updateStage() {
  const s = fmtAlt(alt);
  if (s !== altShown) {
    altShown = s;
    $("alt-big").innerHTML = s.replace(/ (k?m)$/, "<small>$1</small>");
    $("alt-tag").textContent = s;
    marker.style.top = `calc(8px + (100% - 16px) * ${ladderY(alt)})`;
  }
  const k = STAGES.findIndex(s => alt >= s[0]);
  if (k !== stageIdx) { stageIdx = k; $("stage-name").textContent = STAGES[k][1]; refreshStageNote(); }
}

// ---------- tour ----------
let tour = null;
const sumRegion = (la0, la1, lo0, lo1) => { let s = 0; for (let i = 0; i < N; i++) { const g = cells[i], lat = 90 - (Math.floor(g / W) + 0.5) * STEP, lon = -180 + (g % W + 0.5) * STEP; if (lat >= la0 && lat <= la1 && lon >= lo0 && lon <= lo1) s += pcur[i]; } return s; };
const TOUR = [
  { title: "Earth, 25,000 km up", text: () => `About ${fmt(worldTotal)} people in ${year}. Each bar is a 28 km square of land, and the taller it stands the more crowded the land beneath it. Sunlight and night are where they really are at ${dtfClock.format(new Date(simMs))} Boston time.`, view: () => HOME },
  { title: "The Ganges plain", text: () => { const dhaka = dens[cellAt(23.81, 90.41)]; return `From Delhi to Dhaka, this strip of farmland and cities holds about ${fmt(sumRegion(22, 31, 75, 92))} people. Dhaka's cell averages ${fmtDen(dhaka)} per km².`; }, view: () => ({ lat: 24.5, lon: 85, range: 2.6e6, heading: 0, tilt: 28 * D2R }) },
  { title: "Descending on New England", text: () => `Boston's 28 km cell averages ${fmtDen(dens[BOS_CELL])} people per km². From here down, the bars shrink and flatten into the land so the city can take over.`, view: () => ({ lat: 41.8, lon: -71.4, range: 7.5e5, heading: 10 * D2R, tilt: 32 * D2R }) },
  { title: "Airliner altitude, 11 km", text: () => `The population cells have faded. In their place, ${BOSTON.B.length.toLocaleString()} Boston buildings and tower parts from OpenStreetMap rise to their recorded heights.`, view: () => airliner },
  { title: "Back Bay", text: () => sunElev > 0 ? `The sun is ${Math.round(sunElev)}° up, so every shadow is ${(1 / Math.tan(Math.max(sunElev, 0.5) * D2R)).toFixed(1)} times as long as the thing casting it. Drag the time slider below to sweep them across the city.` : `The sun is ${Math.round(-sunElev)}° below the horizon, so the windows are lit. Drag the time slider below to bring the day back and watch the shadows.`, view: () => backBay },
  { title: "Lynn English High School", text: () => { const low = LYNN.B.filter(b => b.h < 12).length; return `15 km up the coast from downtown Boston. Of the ${LYNN.B.length.toLocaleString()} mapped buildings around the school and downtown Lynn, ${Math.round(low / LYNN.B.length * 100)}% are under 12 m tall, about three stories. Back Bay's tallest tower is ${Math.round(tallest.h)} m.`; }, view: () => lynnEnglish },
];
function showStop() {
  const s = TOUR[tour.i];
  $("caption").hidden = false;
  $("cap-step").textContent = `Tour · ${tour.i + 1} of ${TOUR.length}`;
  $("cap-title").textContent = s.title;
  $("cap-text").textContent = s.text();
  $("cap-dots").innerHTML = TOUR.map((_, k) => `<i class="${k === tour.i ? "on" : ""}"></i>`).join("");
  $("cap-next").textContent = tour.i === TOUR.length - 1 ? "Finish" : "Next";
  clearTimeout(tour.timer);
  userTilted = true;
  flyTo(s.view(), { done: () => { if (tour && tour.i < TOUR.length - 1) tour.timer = setTimeout(nextStop, reduceMotion ? 12000 : 7500); } });
}
function nextStop() { if (!tour) return; if (tour.i >= TOUR.length - 1) { endTour(); return; } tour.i++; showStop(); }
function startTour() { tour = { i: 0, timer: 0 }; showStop(); }
function endTour() { if (!tour) return; clearTimeout(tour.timer); tour = null; $("caption").hidden = true; }
$("tour-btn").addEventListener("click", () => { flight = null; endTour(); startTour(); });
$("cap-next").addEventListener("click", nextStop);
$("cap-stop").addEventListener("click", endTour);

// ---------- labels ----------
const labelLayer = $("labels");
const CITY = NE.cities.map(([name, lat, lon, pop, country]) => {
  const g = cellAt(lat, lon);
  return { name, lat, lon, pop, country, inst: instOf[g], base: geoToWorld(lat, lon, 0), up: toVec(lat, lon, 1).transformDirection(E2W) };
});

const POOL = [];
const fmtPop = p => p >= 1e6 ? (p / 1e6).toFixed(p >= 1e7 ? 0 : 1) + "M" : Math.round(p / 1e3) + "k";
function labelEl(i) {
  while (POOL.length <= i) {
    const b = document.createElement("button");
    b.className = "lbl"; b.tabIndex = -1;
    const t = document.createElement("span"), s = document.createElement("small");
    b.append(t, s);
    b.addEventListener("click", () => { const it = b._it; if (!it) return; stopAuto(); if (it.b) { const bb = it.b; flyTo({ ...cityGeo(it.city, it.x, it.z, bb.h * 0.5), range: Math.max(450, bb.h * 3), heading: view.heading, tilt: 64 * D2R }); } else flyTo({ lat: it.lat, lon: it.lon, range: Math.min(view.range, 1.2e6), heading: 0, tilt: 25 * D2R }); });
    labelLayer.append(b);
    POOL.push({ el: b, t, s, it: null });
  }
  return POOL[i];
}
const _p = new THREE.Vector3(), _v = new THREE.Vector3();
function placeLabels() {
  if (!showNames) return;
  const w = innerWidth, h = innerHeight, boxes = [];
  let used = 0;
  const put = (it, x, y, text, sub, cls, aria) => {
    const lw = text.length * (cls === "big" ? 8 : 7) + 50, lh = cls === "big" ? 24 : 21, r = [x - 4, y - lh / 2, x + lw, y + lh / 2];
    if (r[2] < 0 || r[0] > w || r[1] < 0 || r[3] > h) return false;
    if (boxes.some(b => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1])) return false;
    boxes.push(r);
    const L = labelEl(used++);
    if (L.it !== it) { L.it = it; L.el._it = it; L.t.textContent = text; L.s.textContent = sub; L.el.className = "lbl" + (cls ? " " + cls : ""); L.el.setAttribute("aria-label", aria); }
    L.el.hidden = false;
    L.el.style.transform = `translate(${(x - 4.5).toFixed(1)}px, ${(y - lh / 2).toFixed(1)}px)`;
    return true;
  };
  if (CITIES.some(C => C.on) && BOSTON.top.scale.y > 0.6 && alt < 9000) {
    for (const it of CITIES.flatMap(C => C.on ? C.labels : [])) {
      if (used >= 9) break;
      _p.set(it.x, it.h * it.city.top.scale.y + 6, it.z).applyMatrix4(it.city.group.matrixWorld);
      _v.copy(_p).sub(camera.position);
      if (_v.length() > 9000) continue;
      _p.project(camera);
      if (_p.z > 1 || _p.z < -1) continue;
      put(it, (_p.x + 1) / 2 * w, (1 - _p.y) / 2 * h, it.name, Math.round(it.h) + " m", "bld", `${it.name}, ${Math.round(it.h)} meters. Fly here.`);
    }
  } else if (alt > 9e4) {
    const maxN = alt > 1.6e7 ? 20 : alt > 6e6 ? 30 : alt > 1e6 ? 42 : 55;
    for (const c of CITY) {
      if (used >= maxN) break;
      const top = (c.inst >= 0 ? Math.max(cur[c.inst] * UNIT * barU.uBarScale.value, barU.uMinH.value) : 0) + 300;
      _p.copy(c.base).addScaledVector(c.up, top);
      _v.copy(camera.position).sub(_p);
      if (_v.dot(c.up) < _v.length() * 0.12) continue;
      _p.project(camera);
      if (_p.z > 1) continue;
      put(c, (_p.x + 1) / 2 * w, (1 - _p.y) / 2 * h, c.name, fmtPop(c.pop), c.pop >= 1e7 ? "big" : "", `${c.name}, ${c.country}, metro population ${c.pop.toLocaleString()}. Fly here.`);
    }
  }
  for (let i = used; i < POOL.length; i++) if (!POOL[i].el.hidden) POOL[i].el.hidden = true;
}

// ---------- layout ----------
const sheet = $("sheet"), toggle = $("toggle");
function setSheet(open) {
  sheet.classList.toggle("collapsed", !open);
  toggle.textContent = open ? "Hide" : "Controls";
  toggle.setAttribute("aria-expanded", String(open));
}
toggle.addEventListener("click", () => setSheet(sheet.classList.contains("collapsed")));
if (innerWidth <= 760) setSheet(false);
function fit() {
  const w = innerWidth, h = innerHeight, mobile = w <= 760;
  document.documentElement.style.setProperty("--sheet-h", (mobile ? sheet.offsetHeight : 0) + "px");
  camera.aspect = w / h;
  const dockH = $("dock").offsetHeight + 16, railW = w > 1100 ? 148 : 0;
  const sx = mobile ? 0 : (sheet.offsetWidth + 16 - railW) / 2;
  const sy = mobile ? (sheet.offsetHeight + dockH) / 2 : dockH / 2;
  camera.setViewOffset(w, h, -sx, sy, w, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
new ResizeObserver(fit).observe(sheet);
addEventListener("resize", fit);

// ---------- start ----------
setSim(simMs);
syncClockUI();
setLayer(LAYERS[0]);
fit();
if (reduceMotion) { cur.set(target); writeMatrices(); }
placeCamera();
$("loader").classList.add("gone");
setTimeout(() => $("loader").remove(), 800);

let last = performance.now(), growDelay = reduceMotion ? 0 : 400, liveTick = 0, shadowCool = 0;
const _sunPos = new THREE.Vector3(), _st = new THREE.Vector3(), skyBlue = new THREE.Color();
renderer.setAnimationLoop(now => {
  const dt = Math.min(64, now - last); last = now;

  // clocks
  if (clockPlaying) { setSim(simMs + dt * 3600); if (now - clockUIAt > 120) { clockUIAt = now; syncClockUI(); } }
  else if (live && now - liveTick > 15000) { liveTick = now; setSim(Date.now()); syncClockUI(); }
  if (yrPlaying) { yearF = Math.min(2030, yearF + dt / 1000 * 4.5); if (Math.round(yearF) !== year) setYear(yearF); if (yearF >= 2030) setYrPlaying(false); }

  // bars grow toward their targets
  if (growDelay > 0) growDelay -= dt;
  else {
    let moving = false;
    const k = 1 - Math.pow(0.0025, dt / 1000);
    for (let i = 0; i < N; i++) { const diff = target[i] - cur[i]; if (Math.abs(diff) > 0.01) { cur[i] += diff * k; moving = true; } }
    if (moving) writeMatrices();
  }

  // camera
  if (flight) stepFlight(dt); else follow(dt);
  placeCamera();
  $("needle").setAttribute("transform", `rotate(${(-view.heading / D2R).toFixed(1)} 10 10)`);

  // how the scene changes with altitude
  const la = Math.log(Math.max(alt, 1));
  barU.uBarScale.value = 0.002 + 0.998 * smooth(Math.log(3e5), Math.log(7e6), la);
  const barFade = smooth(Math.log(7e4), Math.log(2.2e5), la);
  bars.visible = barFade > 0.01;
  const wantT = barFade < 0.99;
  if (barMat.transparent !== wantT) { barMat.transparent = wantT; barMat.depthWrite = !wantT; barMat.needsUpdate = true; }
  barMat.opacity = barFade;
  const lineFade = smooth(Math.log(9e4), Math.log(4e5), la);
  for (const m of [coastLines, borderLines, gratLines]) m.material.opacity = m.userData.base * lineFade;
  gratLines.visible = coastLines.visible = borderLines.visible = lineFade > 0.01;
  patch.visible = alt < 1.1e6;
  patch.material.uniforms.uAlpha.value = 1 - smooth(6e5, 1.05e6, alt);
  haloU.uFade.value = smooth(Math.log(8e4), Math.log(6e5), la);
  const skyK = 1 - smooth(Math.log(2.5e4), Math.log(1.6e5), la);
  skyU.uSky.value = skyK;
  // haze matches the sky dome's horizon colour (linear), day to night
  {
    const d = realSun ? smooth(-0.14, 0.1, lightDir.dot(_U.copy(camera.position).sub(CENTER).normalize())) : 1;
    U.hazeC.value.setRGB(0.016 + (0.5 - 0.016) * d, 0.024 + (0.66 - 0.024) * d, 0.055 + (0.88 - 0.055) * d).multiplyScalar(0.85);
    U.hazeK.value = skyK * 0.6;
    scene.fog.color.copy(U.hazeC.value);
    scene.fog.near = 20000; scene.fog.far = skyK > 0.01 ? 500000 / skyK : 1e12;
  }
  for (const C of CITIES) { C.on = alt < 1.8e5 && camera.position.distanceTo(C.origin) < 7e5; C.group.visible = C.on; }
  const anyCity = CITIES.some(C => C.on);
  const grow = 1 - smooth(Math.log(9e3), Math.log(5.5e4), la);
  for (const C of CITIES) { C.top.scale.y = Math.max(0.001, reduceMotion ? (grow > 0.02 ? 1 : 0.001) : ease(grow)); C.top.visible = grow > 0.005; }
  edgeMat.opacity = 0.32 * grow;

  // light: the real sun, or an even light from over the viewer's shoulder
  if (realSun) lightDir.copy(sunWorld);
  else lightDir.copy(camera.position).sub(CENTER).normalize().multiplyScalar(2).add(_E.copy(camera.up).multiplyScalar(0.8)).normalize();
  U.sun.value.copy(lightDir);
  U.flat.value = realSun ? 0 : 1;
  frameAt(view.lat, view.lon, 0);
  const localDay = smooth(-0.12, 0.12, lightDir.dot(_U));
  const nearK = 1 - smooth(Math.log(4e4), Math.log(4e5), la);
  U.amb.value = 0.05 + 0.25 * nearK * (0.4 + 0.6 * localDay);
  ambient.intensity = 0.3 + (0.06 + 0.2 * localDay - 0.3) * nearK;
  hemi.intensity = nearK * (0.08 + 0.55 * localDay);
  skyU.uUp.value.copy(camera.position).sub(CENTER).normalize();
  const nightCity = realSun ? smooth(4, -5, sunElev) : 0;
  nightU.value = nightCity * 1.6;
  roadMat.emissive.setRGB(0.22, 0.13, 0.05).multiplyScalar(nightCity * 0.5);
  starSpin.rotation.y = -sunGMST * 15 * D2R;
  stars.position.copy(camera.position);
  stars.material.opacity = realSun ? 1 - skyK * (0.15 + 0.85 * localDay) : 1 - skyK;
  sunSprite.position.copy(camera.position).addScaledVector(sunWorld, 1e9);
  sunSprite.visible = realSun && skyK < 0.98;
  sunSprite.material.opacity = 1 - skyK;
  sky.position.copy(camera.position);
  // shadow frustum hugs the ground around the view point, so shadows sharpen as you descend
  if (anyCity) {
    const s = clamp(view.range * 0.85, 260, 3400);
    const sc = sun.shadow.camera;
    if (Math.abs(sc.right - s) > 1) { sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.updateProjectionMatrix(); }
    worldTarget(_st);
    sun.target.position.copy(_st);
    sun.position.copy(_st).addScaledVector(lightDir, 7000);
    renderer.shadowMap.autoUpdate = true;
  } else {
    sun.position.copy(lightDir).multiplyScalar(1e7);
    sun.target.position.set(0, 0, 0);
    renderer.shadowMap.autoUpdate = false;
  }

  updateStage();
  placeLabels();
  // hover reads whatever is under the mouse, but not while the camera is flying itself
  if (pendingHover && !pointers.size && !flight) { const [x, y] = pendingHover; pendingHover = null; probe(x, y); }
  renderer.render(scene, camera);
});
function worldTarget(out) { return geoToWorld(view.lat, view.lon, 0, out); }
})();
