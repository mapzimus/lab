/* Life Expectancy Globe.
   Countries are painted onto one equirectangular canvas that wraps the sphere;
   places too small to read as a shape get a constant-size dot instead.
   Picking converts the ray hit to lat/lon and runs point-in-polygon. */
(() => {
  "use strict";
  const BASE = "/lab/life-expectancy-globe/";
  const V = "1";
  const OCEAN = "#0b1426", NODATA = "#333c50", EDGE = "rgba(7,10,18,.75)";
  const STOPS = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const METRICS = {
    le: { title: "Years in 2026", min: 55, max: 87, ticks: [55, 60, 70, 80, 87], fmt: (v) => v.toFixed(1) },
    gain: { title: "Years gained since 1950", min: 5, max: 63, ticks: [5, 20, 35, 50, 63], fmt: (v) => "+" + v.toFixed(1) },
  };
  const DOT_AREA = 0.35; // square degrees; below this a country also gets a dot
  let metric = "le";

  const $ = (id) => document.getElementById(id);
  const ramp = (t) => {
    t = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
    const i = Math.min(STOPS.length - 2, Math.floor(t)), f = t - i;
    return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f));
  };
  const colorOf = (row) => { const m = METRICS[metric]; return ramp((row[metric] - m.min) / (m.max - m.min)); };
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const vec = (lat, lon, r) => {
    const p = lat * Math.PI / 180, l = lon * Math.PI / 180;
    return new THREE.Vector3(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l));
  };
  // Edges that only exist because a polygon was cut at the antimeridian or the pole.
  const seam = (a, b) => (Math.abs(a[0]) > 179.99 && Math.abs(b[0]) > 179.99) || (a[1] < -89.9 && b[1] < -89.9);

  function decodeTopo(t) {
    const [sx, sy] = t.transform.scale, [tx, ty] = t.transform.translate;
    const arcs = t.arcs.map((a) => { let x = 0, y = 0; return a.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; }); });
    const ring = (ids) => {
      const out = [];
      for (const i of ids) { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; for (let k = out.length ? 1 : 0; k < a.length; k++) out.push(a[k]); }
      return out;
    };
    return t.objects.countries.geometries.map((g) => ({
      name: g.properties.name,
      polys: (g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : []).map((p) => p.map(ring)),
    }));
  }
  const ringArea = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return Math.abs(s) / 2; };
  const inRing = (r, x, y) => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    return c;
  };

  Promise.all([
    fetch(`${BASE}data/countries-50m.json?v=${V}`).then((r) => r.json()),
    fetch(`${BASE}data/life.json?v=${V}`).then((r) => r.json()),
  ]).then(([topo, life]) => start(decodeTopo(topo), life));

  function start(geos, life) {
    const byGeo = new Map(geos.map((g) => [g.name, g]));
    // Somaliland is drawn separately by Natural Earth; the UN counts it within Somalia.
    if (byGeo.has("Somalia") && byGeo.has("Somaliland")) { byGeo.get("Somalia").polys.push(...byGeo.get("Somaliland").polys); byGeo.get("Somaliland").polys = []; }
    for (const g of geos) {
      let x0 = 180, x1 = -180, y0 = 90, y1 = -90, best = null, bestA = 0; g.area = 0;
      for (const p of g.polys) {
        const a = ringArea(p[0]); g.area += a;
        if (a >= bestA) { bestA = a; best = p[0]; }
        for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      g.bbox = [x0, y0, x1, y1];
      if (best) { let sx = 0, sy = 0; for (const [x, y] of best) { sx += x; sy += y; } g.at = [sy / best.length, sx / best.length]; }
    }
    const rows = life.rows;
    for (const r of rows) {
      const g = r.geo && byGeo.get(r.geo);
      if (g) { g.row = r; r.g = g; r.at = g.at; }
      r.dot = !g || g.area < DOT_AREA;
    }
    const dots = rows.filter((r) => r.dot);

    // ---------- scene ----------
    const stage = $("stage");
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50);
    camera.position.copy(vec(18, 20, 3.1));
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 1.12; controls.maxDistance = 6;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.35;

    const big = renderer.capabilities.maxTextureSize >= 8192 && matchMedia("(pointer: fine)").matches;
    const W = big ? 8192 : 4096, H = W / 2;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshBasicMaterial({ map: tex }));
    scene.add(globe);

    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.12, 64, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: "varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec3 n; void main(){ float i = pow(max(0.0, 0.62 - dot(n, vec3(0.0, 0.0, 1.0))), 3.0); gl_FragColor = vec4(0.35, 0.75, 0.85, 1.0) * i; }",
    })));

    const px = (lon) => (lon + 180) / 360 * W, py = (lat) => (90 - lat) / 180 * H;
    function paint() {
      ctx.fillStyle = OCEAN; ctx.fillRect(0, 0, W, H);
      ctx.lineJoin = "round"; ctx.lineWidth = W / 4096 * 1.1; ctx.strokeStyle = EDGE;
      for (const g of geos) {
        if (!g.polys.length) continue;
        ctx.beginPath();
        for (const p of g.polys) for (const r of p) { r.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y)))); ctx.closePath(); }
        ctx.fillStyle = g.row ? css(colorOf(g.row)) : NODATA; ctx.fill("evenodd");
        ctx.beginPath();
        for (const p of g.polys) for (const r of p) for (let i = 0; i < r.length; i++) {
          if (i && !seam(r[i - 1], r[i])) ctx.lineTo(px(r[i][0]), py(r[i][1])); else ctx.moveTo(px(r[i][0]), py(r[i][1]));
        }
        ctx.stroke();
      }
      tex.needsUpdate = true;
    }

    // dots: constant screen size, so tiny places stay findable at any zoom
    const dotCv = document.createElement("canvas"); dotCv.width = dotCv.height = 64;
    const d2 = dotCv.getContext("2d");
    d2.beginPath(); d2.arc(32, 32, 26, 0, 7); d2.fillStyle = "#fff"; d2.fill(); d2.lineWidth = 8; d2.strokeStyle = "#070a12"; d2.stroke();
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dots.flatMap((r) => vec(r.at[0], r.at[1], 1.004).toArray()), 3));
    dotGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(dots.length * 3), 3));
    const DOT_PX = 11;
    scene.add(new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: DOT_PX, sizeAttenuation: false, vertexColors: true, map: new THREE.CanvasTexture(dotCv), alphaTest: 0.5 })));
    function paintDots() {
      const a = dotGeo.attributes.color;
      dots.forEach((r, i) => { const c = colorOf(r); a.setXYZ(i, c[0] / 255, c[1] / 255, c[2] / 255); });
      a.needsUpdate = true;
    }

    // outline for the hovered / selected country
    const outline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
    scene.add(outline);
    const ring = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: DOT_PX + 8, sizeAttenuation: false, color: 0xffffff, map: new THREE.CanvasTexture(dotCv), alphaTest: 0.5 }));
    scene.add(ring);
    let outlined = null;
    function setOutline(row) {
      if (row === outlined) return; outlined = row;
      const pts = [];
      if (row && row.g) for (const p of row.g.polys) for (const r of p) for (let i = 1; i < r.length; i++) {
        if (!seam(r[i - 1], r[i])) pts.push(vec(r[i - 1][1], r[i - 1][0], 1.0015), vec(r[i][1], r[i][0], 1.0015));
      }
      outline.geometry.dispose(); outline.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      ring.geometry.dispose(); ring.geometry = new THREE.BufferGeometry().setFromPoints(row && row.dot ? [vec(row.at[0], row.at[1], 1.003)] : []);
    }

    // ---------- picking ----------
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
    function pick(cx, cy) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = cx - rect.left, y = cy - rect.top;
      ndc.set(x / rect.width * 2 - 1, -(y / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(globe)[0];
      if (!hit) return null;
      const camDir = camera.position.clone().normalize();
      let best = null, bestD = (DOT_PX / 2 + 4) ** 2;
      for (const r of dots) {
        tmp.copy(vec(r.at[0], r.at[1], 1));
        if (tmp.dot(camDir) < 1 / camera.position.length()) continue; // behind the limb
        tmp.project(camera);
        const dx = (tmp.x + 1) / 2 * rect.width - x, dy = (1 - tmp.y) / 2 * rect.height - y, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = r; }
      }
      if (best) return best;
      const p = hit.point, lon = Math.atan2(-p.z, p.x) * 180 / Math.PI, lat = Math.asin(p.y / p.length()) * 180 / Math.PI;
      for (const g of geos) {
        if (!g.row || lon < g.bbox[0] || lon > g.bbox[2] || lat < g.bbox[1] || lat > g.bbox[3]) continue;
        for (const poly of g.polys) { let inside = false; for (const r of poly) if (inRing(r, lon, lat)) inside = !inside; if (inside) return g.row; }
      }
      return null;
    }

    // ---------- UI ----------
    const tip = $("tip");
    let selected = null, ranks = new Map();
    const worldLine = (r) => { const d = r.le - life.world.le; return `${Math.abs(d).toFixed(1)} years ${d >= 0 ? "above" : "below"} the world average of ${life.world.le}`; };
    function showTip(row, x, y) {
      if (!row) { tip.hidden = true; return; }
      tip.replaceChildren();
      const nm = document.createElement("div"); nm.textContent = row.name;
      const st = document.createElement("strong"); st.textContent = `${row.le.toFixed(1)} years`;
      const m = document.createElement("div"); m.className = "m"; m.textContent = `+${row.gain.toFixed(1)} since 1950 · #${ranks.get(row)} of ${rows.length}`;
      tip.append(nm, st, m); tip.hidden = false;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = Math.min(window.innerWidth - w - 8, x + 14) + "px";
      tip.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y + 14)) + "px";
    }
    function select(row, fly) {
      selected = row; setOutline(row);
      $("card").hidden = !row;
      document.querySelectorAll("#rank button[aria-current]").forEach((b) => b.removeAttribute("aria-current"));
      if (!row) return;
      $("card-rank").textContent = `#${ranks.get(row)} of ${rows.length} · ${METRICS[metric].title}`;
      $("card-name").textContent = row.name;
      $("card-le").textContent = row.le.toFixed(1);
      $("card-gain").textContent = "+" + row.gain.toFixed(1);
      $("card-vs").textContent = worldLine(row);
      const b = row.btn; if (b) { b.setAttribute("aria-current", "true"); if (!fly) b.scrollIntoView({ block: "nearest" }); }
      if (fly) flyTo(row.at[0], row.at[1]);
    }

    let flight = null;
    function flyTo(lat, lon) {
      controls.autoRotate = false;
      const from = camera.position.clone(), d0 = from.length(), d1 = Math.min(d0, 2.4);
      flight = { a: from.normalize(), b: vec(lat, lon, 1), d0, d1, t0: performance.now() };
    }

    function buildList() {
      const m = METRICS[metric];
      const sorted = rows.slice().sort((a, b) => b[metric] - a[metric]);
      ranks = new Map(sorted.map((r, i) => [r, i + 1]));
      $("list-title").textContent = `Ranked · ${m.title}`;
      const ol = $("rank"); ol.replaceChildren();
      for (const r of sorted) {
        const li = document.createElement("li"), b = document.createElement("button");
        const n = document.createElement("span"); n.className = "n"; n.textContent = ranks.get(r);
        const sw = document.createElement("i"); sw.style.background = css(colorOf(r));
        const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = r.name;
        const v = document.createElement("span"); v.className = "v"; v.textContent = m.fmt(r[metric]);
        b.append(n, sw, nm, v); b.addEventListener("click", () => select(r, true));
        r.btn = b; r.li = li; li.append(b); ol.append(li);
      }
      applyFilter();
    }
    function applyFilter() {
      const q = $("filter").value.trim().toLowerCase();
      for (const r of rows) r.li.hidden = !!q && !r.name.toLowerCase().includes(q);
    }
    $("filter").addEventListener("input", applyFilter);

    function buildLegend() {
      const m = METRICS[metric];
      $("ramp").style.background = `linear-gradient(90deg, ${STOPS.map(css).join(",")})`;
      const t = $("ticks"); t.replaceChildren();
      for (const v of m.ticks) { const s = document.createElement("span"); s.style.left = (v - m.min) / (m.max - m.min) * 100 + "%"; s.textContent = metric === "gain" ? "+" + v : v; t.append(s); }
    }
    function setMetric(k) {
      metric = k;
      $("m-le").setAttribute("aria-pressed", String(k === "le")); $("m-gain").setAttribute("aria-pressed", String(k === "gain"));
      paint(); paintDots(); buildLegend(); buildList(); select(selected, false);
    }
    $("m-le").addEventListener("click", () => setMetric("le"));
    $("m-gain").addEventListener("click", () => setMetric("gain"));
    $("world-le").textContent = life.world.le; $("world-gain").textContent = life.world.gain;

    const sheet = $("sheet"), toggle = $("toggle");
    toggle.addEventListener("click", () => {
      const c = sheet.classList.toggle("collapsed");
      toggle.textContent = c ? "Show" : "Hide"; toggle.setAttribute("aria-expanded", String(!c));
    });

    const el = renderer.domElement;
    let down = null;
    el.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; controls.autoRotate = false; flight = null; tip.hidden = true; });
    el.addEventListener("wheel", () => { controls.autoRotate = false; flight = null; }, { passive: true });
    el.addEventListener("pointermove", (e) => {
      if (e.buttons || e.pointerType === "touch") return;
      const row = pick(e.clientX, e.clientY);
      el.style.cursor = row ? "pointer" : "grab";
      setOutline(row || selected); showTip(row, e.clientX, e.clientY);
    });
    el.addEventListener("pointerleave", () => { tip.hidden = true; setOutline(selected); });
    el.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      select(pick(e.clientX, e.clientY), false);
    });

    function resize() {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h;
      camera.fov = w < h ? 52 : 38; camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize); resize();

    setMetric("le");
    renderer.setAnimationLoop((now) => {
      if (flight) {
        const t = Math.min(1, (now - flight.t0) / 900), e = t * t * (3 - 2 * t);
        camera.position.copy(flight.a).lerp(flight.b, e).normalize().multiplyScalar(flight.d0 + (flight.d1 - flight.d0) * e);
        if (t === 1) flight = null;
      }
      controls.rotateSpeed = Math.min(1, Math.max(0.06, (camera.position.length() - 1) / 2));
      controls.update();
      renderer.render(scene, camera);
    });
    window.__globe = { pick, select, rows, camera, flyTo };
  }
})();
