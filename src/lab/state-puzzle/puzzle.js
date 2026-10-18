/* State Puzzle — the 50 states broken apart, packed back into one random
 * landmass, cracks filled, borders erased, cities kept. The player draws the
 * old borders back and gets scored on how much of them the ink found.
 *
 * Everything happens in the browser on a raster grid:
 *   1. Each state is projected on its own Lambert azimuthal equal-area
 *      projection (so shape and size survive) and rasterised at KM km/px.
 *   2. Pieces are packed one by one onto a coarse grid, each new piece glued
 *      against the boundary of what is already there.
 *   3. The union is "closed" (dilate, then erode) to heal the narrow cracks.
 *      Enclosed gaps become land when small and lakes when large.
 *   4. The result is painted as paper on water; cities are drawn on top.
 */
(() => {
  "use strict";

  const KM = 2.5;        // km per fine pixel
  const COARSE = 4;      // coarse pixels are COARSE fine pixels wide (10 km)
  const CW = 1400, CH = 1200; // coarse packing grid
  const R_EARTH = 6371;
  const D2R = Math.PI / 180;
  const CLOSE_R = 4;     // final tidy-up closing, fine px (10 km)
  const FILL_R = 20;     // cracks between pieces up to 2× this wide are filled (100 km)
  const ISLAND_R = 24;   // bridge archipelago states (AK, HI) so they pack as one piece
  const FILL_MAX = 800;  // enclosed gaps under this many px² (5,000 km²) become land
  const LAKE_OPEN = 4;   // smooth lakes with an opening of this radius
  const TOL = 5;         // ink counts as "on the border" within this many px (12.5 km)
  const MIN_RING = 40;   // rings under this many px² (250 km²) are left out of the target
  const INF = 1e9;       // "no feature": far beyond any squared distance on the grid

  const $ = (id) => document.getElementById(id);
  const landC = $("land"), resultC = $("result"), marksC = $("marks"), inkC = $("ink");
  const frame = $("frame"), statusEl = $("status");

  // ---------------------------------------------------------------- random
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randomSeed = () => Math.random().toString(36).slice(2, 8);

  // ------------------------------------------------------------ projection
  // Lambert azimuthal equal-area centred on each state. x right, y down, px.
  function laea(lon0, lat0) {
    const p0 = lat0 * D2R, l0 = lon0 * D2R, s0 = Math.sin(p0), c0 = Math.cos(p0);
    const f = R_EARTH / KM;
    return (lon, lat) => {
      const p = lat * D2R, dl = lon * D2R - l0;
      const sp = Math.sin(p), cp = Math.cos(p), cd = Math.cos(dl);
      const k = Math.sqrt(2 / (1 + s0 * sp + c0 * cp * cd));
      return [f * k * cp * Math.sin(dl), -f * k * (c0 * sp - s0 * cp * cd)];
    };
  }

  // -------------------------------------------------------- raster helpers
  function ringArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i += 2) {
      const j = (i + 2) % n;
      a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
    }
    return Math.abs(a) / 2;
  }
  function alphaMask(ctx, w, h) {
    const a = ctx.getImageData(0, 0, w, h).data;
    const m = new Uint8Array(w * h);
    for (let i = 0, j = 3; i < m.length; i++, j += 4) m[i] = a[j] > 127 ? 1 : 0;
    return m;
  }

  // Felzenszwalb & Huttenlocher squared Euclidean distance transform.
  // Returns, for every pixel, the squared distance to the nearest pixel whose
  // mask value equals `target`. `buf` is a reusable Float64Array(w*h).
  function dt1d(f, n, d, v, z) {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  }
  function edt(mask, w, h, target, buf) {
    const g = buf && buf.length >= w * h ? buf : new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = mask[i] === target ? 0 : INF;
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) f[x] = g[o + x];
      dt1d(f, w, d, v, z);
      for (let x = 0; x < w; x++) g[o + x] = d[x];
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = g[y * w + x];
      dt1d(f, h, d, v, z);
      for (let y = 0; y < h; y++) g[y * w + x] = d[y];
    }
    return g;
  }
  function dilate(mask, w, h, r, buf) {
    const d = edt(mask, w, h, 1, buf), r2 = r * r, out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i] <= r2 ? 1 : 0;
    return out;
  }
  function erode(mask, w, h, r, buf) {
    const d = edt(mask, w, h, 0, buf), r2 = r * r, out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i] > r2 ? 1 : 0;
    return out;
  }
  const close = (m, w, h, r, buf) => erode(dilate(m, w, h, r, buf), w, h, r, buf);
  const open = (m, w, h, r, buf) => dilate(erode(m, w, h, r, buf), w, h, r, buf);

  // ----------------------------------------------------------------- pieces
  function buildPiece(st, rot) {
    const proj = laea(st.lon0, st.lat0);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const xf = (lon, lat) => { const [x, y] = proj(lon, lat); return [x * cos - y * sin, x * sin + y * cos]; };
    const rings = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of st.polys) for (const flat of poly) {
      const pts = new Float64Array(flat.length);
      for (let i = 0; i < flat.length; i += 2) {
        const [x, y] = xf(flat[i], flat[i + 1]);
        pts[i] = x; pts[i + 1] = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      rings.push(pts);
    }
    const island = st.abbr === "AK" || st.abbr === "HI";
    const pad = island ? ISLAND_R + 2 : 2;
    const ox = Math.floor(minX) - pad, oy = Math.floor(minY) - pad;
    const w = Math.ceil(maxX) - ox + pad, h = Math.ceil(maxY) - oy + pad;

    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.translate(-ox, -oy);
    ctx.beginPath();
    for (const pts of rings) {
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
    }
    ctx.fillStyle = "#000";
    ctx.fill("evenodd");
    const shape = alphaMask(ctx, w, h);           // the true state
    // What gets packed and glued: island states are bridged first so the
    // archipelago travels as one piece and lands as one peninsula.
    const glue = island ? close(shape, w, h, ISLAND_R) : shape;

    // Coarse footprint for packing: any fine pixel in a block marks the block;
    // the piece's own footprint is grown by one block so that two pieces that
    // pass the overlap test can never touch at fine resolution.
    const cw = Math.ceil(w / COARSE), ch = Math.ceil(h / COARSE);
    const c0 = new Uint8Array(cw * ch);
    let area = 0, sx = 0, sy = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (shape[i]) { area++; sx += x; sy += y; }
      if (glue[i]) c0[((y / COARSE) | 0) * cw + ((x / COARSE) | 0)] = 1;
    }
    const grown = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (!c0[y * cw + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < ch && xx >= 0 && xx < cw) grown[yy * cw + xx] = 1;
      }
    }
    const cells = [], boundary = [];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (grown[i]) cells.push(x, y);
      if (c0[i] && (x === 0 || y === 0 || x === cw - 1 || y === ch - 1 ||
          !c0[i - 1] || !c0[i + 1] || !c0[i - cw] || !c0[i + cw])) boundary.push(x, y);
    }
    return { st, xf, rings, ox, oy, w, h, shape, glue, cw, ch, c0, cells, boundary, area, cx: sx / area, cy: sy / area };
  }

  // ---------------------------------------------------------------- packing
  function fits(L, p, ox, oy) {
    if (ox < 0 || oy < 0 || ox + p.cw > CW || oy + p.ch > CH) return false;
    const c = p.cells;
    for (let i = 0; i < c.length; i += 2) if (L[(oy + c[i + 1]) * CW + ox + c[i]]) return false;
    return true;
  }
  // Each piece is dropped from a random direction and slid in toward the
  // heart of the landmass until it touches. A few directions are tried and the
  // one that lands closest to the centre wins, which keeps the blob compact
  // without making it round.
  function pack(pieces, rng) {
    const L = new Uint8Array(CW * CH);
    let sx = 0, sy = 0, n = 0;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const stamp = (p, ox, oy) => {
      p.px = ox; p.py = oy;
      for (let y = 0; y < p.ch; y++) for (let x = 0; x < p.cw; x++) {
        if (!p.c0[y * p.cw + x]) continue;
        L[(oy + y) * CW + ox + x] = 1;
        sx += ox + x; sy += oy + y; n++;
      }
      bx0 = Math.min(bx0, ox); by0 = Math.min(by0, oy);
      bx1 = Math.max(bx1, ox + p.cw); by1 = Math.max(by1, oy + p.ch);
    };
    const order = pieces.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    stamp(order[0], ((CW - order[0].cw) / 2) | 0, ((CH - order[0].ch) / 2) | 0);
    for (let k = 1; k < order.length; k++) {
      const p = order[k];
      const cx = sx / n, cy = sy / n;
      const rb = Math.max(Math.hypot(bx0 - cx, by0 - cy), Math.hypot(bx1 - cx, by0 - cy), Math.hypot(bx0 - cx, by1 - cy), Math.hypot(bx1 - cx, by1 - cy));
      const rp = Math.hypot(p.cw, p.ch) / 2;
      const at = (dx, dy, t) => [Math.round(cx + dx * t - p.cw / 2), Math.round(cy + dy * t - p.ch / 2)];
      let best = null, bestD = Infinity, found = 0;
      for (let tries = 0; tries < 60 && found < 6; tries++) {
        const a = rng() * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
        let t = rb + rp + 2;
        let pos = at(dx, dy, t);
        // Out of the grid? Walk the start point back in along the ray.
        while (t > 0 && (pos[0] < 0 || pos[1] < 0 || pos[0] + p.cw > CW || pos[1] + p.ch > CH)) { t -= 2; pos = at(dx, dy, t); }
        if (!fits(L, p, pos[0], pos[1])) continue;
        // Slide inward: coarse steps, then back off and creep to contact.
        for (let step = 3; step >= 1; step = step === 3 ? 1 : 0) {
          while (t - step > 0) {
            const q = at(dx, dy, t - step);
            if (!fits(L, p, q[0], q[1])) break;
            t -= step; pos = q;
          }
        }
        found++;
        const d = Math.hypot(pos[0] + p.cw / 2 - cx, pos[1] + p.ch / 2 - cy);
        if (d < bestD) { bestD = d; best = pos; }
      }
      if (!best) throw new Error(`could not place ${p.st.name}`);
      stamp(p, best[0], best[1]);
    }
    return order;
  }

  // --------------------------------------------------------------- assemble
  function assemble(pieces) {
    const M = 40;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pieces) {
      x0 = Math.min(x0, p.px * COARSE); y0 = Math.min(y0, p.py * COARSE);
      x1 = Math.max(x1, p.px * COARSE + p.w); y1 = Math.max(y1, p.py * COARSE + p.h);
    }
    const W = x1 - x0 + 2 * M, H = y1 - y0 + 2 * M;
    const buf = new Float32Array(W * H);
    const union = new Uint8Array(W * H);
    const owner = new Int16Array(W * H).fill(-1);
    pieces.forEach((p, idx) => {
      p.fx = p.px * COARSE - x0 + M; p.fy = p.py * COARSE - y0 + M;
      for (let y = 0; y < p.h; y++) {
        const o = (p.fy + y) * W + p.fx, po = y * p.w;
        for (let x = 0; x < p.w; x++) if (p.glue[po + x]) { union[o + x] = 1; owner[o + x] = idx; }
      }
    });

    // Heal the cracks between pieces. A crack is water that lies between two
    // different pieces: close to the Voronoi seam separating them, and inside
    // a generous morphological closing of the whole union. Water deep inside
    // one piece's own bay is near no seam and stays water.
    const label = new Int16Array(W * H);
    const queue = new Int32Array(W * H);
    let qh = 0, qt = 0;
    for (let i = 0; i < W * H; i++) { label[i] = owner[i]; if (owner[i] >= 0) queue[qt++] = i; }
    while (qh < qt) {
      const i = queue[qh++], x = i % W, l = label[i];
      if (x > 0 && label[i - 1] < 0) { label[i - 1] = l; queue[qt++] = i - 1; }
      if (x < W - 1 && label[i + 1] < 0) { label[i + 1] = l; queue[qt++] = i + 1; }
      if (i >= W && label[i - W] < 0) { label[i - W] = l; queue[qt++] = i - W; }
      if (i + W < W * H && label[i + W] < 0) { label[i + W] = l; queue[qt++] = i + W; }
    }
    const seam = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (union[i]) continue;
      const l = label[i];
      if (label[i - 1] !== l || label[i + 1] !== l || label[i - W] !== l || label[i + W] !== l) seam[i] = 1;
    }
    const nearSeam = dilate(seam, W, H, FILL_R, buf);
    const closedBig = close(union, W, H, FILL_R, buf);
    const filled = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) filled[i] = union[i] || (closedBig[i] && nearSeam[i]) ? 1 : 0;
    const closed = close(filled, W, H, CLOSE_R, buf);

    // Water that still touches the edge of the world is sea; the rest are gaps.
    const outside = new Uint8Array(W * H);
    qh = 0; qt = 0;
    const push = (i) => { if (!closed[i] && !outside[i]) { outside[i] = 1; queue[qt++] = i; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (qh < qt) {
      const i = queue[qh++], x = i % W;
      if (x > 0) push(i - 1);
      if (x < W - 1) push(i + 1);
      if (i >= W) push(i - W);
      if (i + W < W * H) push(i + W);
    }
    // Label the gaps: small ones silt up into land, big ones become lakes.
    label.fill(-1);
    const lake = new Uint8Array(W * H);
    let comps = 0;
    for (let s = 0; s < W * H; s++) {
      if (closed[s] || outside[s] || label[s] >= 0) continue;
      qh = 0; qt = 0; queue[qt++] = s; label[s] = comps;
      while (qh < qt) {
        const i = queue[qh++], x = i % W;
        const visit = (j) => { if (!closed[j] && !outside[j] && label[j] < 0) { label[j] = comps; queue[qt++] = j; } };
        if (x > 0) visit(i - 1);
        if (x < W - 1) visit(i + 1);
        if (i >= W) visit(i - W);
        if (i + W < W * H) visit(i + W);
      }
      if (qt >= FILL_MAX) for (let k = 0; k < qt; k++) lake[queue[k]] = 1;
      comps++;
    }
    const lakes = open(lake, W, H, LAKE_OPEN, buf);
    const land = new Uint8Array(W * H);
    let lakeCount = 0, landArea = 0;
    for (let i = 0; i < W * H; i++) { land[i] = !outside[i] && !lakes[i] ? 1 : 0; landArea += land[i]; }
    // Count lakes as connected components of the final water inside the land.
    label.fill(-1);
    for (let s = 0; s < W * H; s++) {
      if (land[s] || outside[s] || label[s] >= 0) continue;
      lakeCount++; qh = 0; qt = 0; queue[qt++] = s; label[s] = 1;
      while (qh < qt) {
        const i = queue[qh++], x = i % W;
        const visit = (j) => { if (!land[j] && !outside[j] && label[j] < 0) { label[j] = 1; queue[qt++] = j; } };
        if (x > 0) visit(i - 1);
        if (x < W - 1) visit(i + 1);
        if (i >= W) visit(i - W);
        if (i + W < W * H) visit(i + W);
      }
    }

    // Crop to the land with a margin of sea around it.
    const MG = 28;
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (land[y * W + x]) {
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    const view = { x0: Math.max(0, bx0 - MG), y0: Math.max(0, by0 - MG) };
    view.w = Math.min(W, bx1 + MG + 1) - view.x0;
    view.h = Math.min(H, by1 + MG + 1) - view.y0;

    // Paint: paper land, shaded water, a dark hairline of coast.
    const img = new ImageData(view.w, view.h);
    const px = img.data;
    const toLand = edt(land, W, H, 1, buf);            // water → distance to land
    for (let y = 0; y < view.h; y++) for (let x = 0; x < view.w; x++) {
      const i = (y + view.y0) * W + x + view.x0, o = (y * view.w + x) * 4;
      if (land[i]) continue;
      const t = Math.min(1, Math.sqrt(toLand[i]) / 9);
      px[o] = 178 - 30 * t; px[o + 1] = 207 - 24 * t; px[o + 2] = 224 - 16 * t; px[o + 3] = 255;
    }
    const toWater = edt(land, W, H, 0, buf);           // land → distance to water
    const nearWater = new Uint8Array(view.w * view.h); // coast band, free in scoring
    for (let y = 0; y < view.h; y++) for (let x = 0; x < view.w; x++) {
      const i = (y + view.y0) * W + x + view.x0, o = (y * view.w + x) * 4;
      if (!land[i]) continue;
      const d = Math.sqrt(toWater[i]);
      if (d <= 3) nearWater[y * view.w + x] = 1;
      if (d <= 1.2) { px[o] = 122; px[o + 1] = 104; px[o + 2] = 74; px[o + 3] = 255; continue; }
      const t = Math.min(1, d / 14);
      px[o] = 214 + 20 * t; px[o + 1] = 200 + 24 * t; px[o + 2] = 168 + 30 * t; px[o + 3] = 255;
    }
    return { W, H, view, img, land, nearWater, lakeCount, landKm2: landArea * KM * KM };
  }

  // ------------------------------------------------------------------ state
  let STATES = null, CITIES = null;
  let world = null;      // { pieces, W, H, view, img, ... }
  let strokes = [];      // arrays of [x, y] in view grid coords
  let current = null;
  let revealed = false;
  let lastCheck = null;
  let seed = "", rotate = false;

  function setStatus(msg) { statusEl.textContent = msg; statusEl.hidden = !msg; }

  async function generate() {
    setStatus("Assembling the continent…");
    $("new").disabled = true;
    await new Promise((r) => setTimeout(r, 20));
    const rng = mulberry32(hashSeed(seed + (rotate ? "|rot" : "")));
    const t0 = performance.now();
    const pieces = STATES.map((st) => buildPiece(st, rotate ? rng() * Math.PI * 2 : 0));
    let order;
    try { order = pack(pieces, rng); }
    catch (e) { console.error(e); setStatus("That one would not fit. Try another landmass."); $("new").disabled = false; return; }
    const w = assemble(order);
    world = { ...w, pieces: order };
    strokes = []; lastCheck = null; revealed = false;
    $("reveal").setAttribute("aria-pressed", "false");
    $("numbers").hidden = true;
    frame.style.aspectRatio = `${w.view.w} / ${w.view.h}`;
    landC.width = w.view.w; landC.height = w.view.h;
    landC.getContext("2d").putImageData(w.img, 0, 0);
    resultC.width = w.view.w; resultC.height = w.view.h;
    resultC.getContext("2d").clearRect(0, 0, w.view.w, w.view.h);
    $("seed-label").textContent = seed + (rotate ? " (rotated)" : "");
    $("meta").textContent = `${(w.landKm2 / 1e6).toFixed(2)} million km² of land · ${w.lakeCount} lake${w.lakeCount === 1 ? "" : "s"} · built in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    await document.fonts.load("600 12px Archivo").catch(() => {});
    layout();
    setStatus("");
    $("new").disabled = false;
  }

  // ---------------------------------------------------------------- drawing
  function screenScale() {
    const rect = frame.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return { rect, dpr, k: (rect.width * dpr) / world.view.w };
  }
  function sizeCanvas(c, rect, dpr) {
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  function layout() {
    if (!world) return;
    const { rect, dpr } = screenScale();
    sizeCanvas(marksC, rect, dpr); sizeCanvas(inkC, rect, dpr);
    drawMarks(); drawInk();
  }

  function cityPoint(p, city) {
    const [x, y] = p.xf(city[2], city[1]);
    return [x - p.ox + p.fx - world.view.x0, y - p.oy + p.fy - world.view.y0];
  }

  function drawMarks() {
    const { dpr, k } = screenScale();
    const ctx = marksC.getContext("2d");
    ctx.clearRect(0, 0, marksC.width, marksC.height);

    if (revealed) {
      ctx.save();
      ctx.scale(k, k);
      ctx.lineWidth = 1.4 / k * dpr;
      ctx.strokeStyle = "rgba(60, 40, 20, 0.85)";
      ctx.setLineDash([4 / k * dpr, 3 / k * dpr]);
      for (const p of world.pieces) {
        ctx.beginPath();
        const tx = p.fx - world.view.x0 - p.ox, ty = p.fy - world.view.y0 - p.oy;
        for (const pts of p.rings) {
          if (ringArea(pts) < MIN_RING) continue;
          ctx.moveTo(pts[0] + tx, pts[1] + ty);
          for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] + tx, pts[i + 1] + ty);
          ctx.closePath();
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.font = `700 ${12 * dpr}px Archivo, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(60, 40, 20, 0.9)";
      ctx.strokeStyle = "rgba(240, 232, 210, 0.9)"; ctx.lineWidth = 3 * dpr;
      for (const p of world.pieces) {
        const x = (p.cx + p.fx - world.view.x0) * k, y = (p.cy + p.fy - world.view.y0) * k;
        ctx.strokeText(p.st.abbr, x, y); ctx.fillText(p.st.abbr, x, y);
      }
    }

    // Cities: dots for everyone, labels where there is room.
    const placed = [];
    const fontPx = 11 * dpr;
    ctx.font = `500 ${fontPx}px Archivo, sans-serif`;
    ctx.textBaseline = "middle";
    const tryLabel = (x, y, text, capital) => {
      const w = ctx.measureText(text).width, h = fontPx * 1.15, gap = 5 * dpr;
      const slots = [
        [x + gap, y, "left"], [x - gap, y, "right"],
        [x, y - gap - h / 2, "center"], [x, y + gap + h / 2, "center"],
      ];
      for (const [lx, ly, align] of slots) {
        const left = align === "left" ? lx : align === "right" ? lx - w : lx - w / 2;
        const box = [left - 1, ly - h / 2, left + w + 1, ly + h / 2];
        if (box[0] < 0 || box[1] < 0 || box[2] > marksC.width || box[3] > marksC.height) continue;
        if (placed.some((b) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) continue;
        placed.push(box);
        ctx.textAlign = align;
        ctx.lineWidth = 3 * dpr; ctx.strokeStyle = "rgba(240, 232, 210, 0.85)";
        ctx.strokeText(text, lx, ly);
        ctx.fillStyle = capital ? "#3a2a12" : "#4e4231";
        ctx.fillText(text, lx, ly);
        return;
      }
    };
    const cities = [];
    for (const p of world.pieces) for (const c of CITIES[p.st.abbr] || []) {
      const [gx, gy] = cityPoint(p, c);
      cities.push({ x: gx * k, y: gy * k, name: c[0], capital: c[3] === 1 });
    }
    cities.sort((a, b) => (b.capital - a.capital));
    for (const c of cities) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, (c.capital ? 3.2 : 2.3) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = c.capital ? "#b3261e" : "#3a2a12";
      ctx.fill();
      if (c.capital) { ctx.lineWidth = 1.2 * dpr; ctx.strokeStyle = "#f4ecd8"; ctx.stroke(); }
      placed.push([c.x - 4 * dpr, c.y - 4 * dpr, c.x + 4 * dpr, c.y + 4 * dpr]);
    }
    ctx.font = `600 ${fontPx}px Archivo, sans-serif`;
    for (const c of cities) if (c.capital) tryLabel(c.x, c.y, c.name, true);
    ctx.font = `500 ${fontPx}px Archivo, sans-serif`;
    for (const c of cities) if (!c.capital) tryLabel(c.x, c.y, c.name, false);
  }

  function drawInk() {
    const { dpr, k } = screenScale();
    const ctx = inkC.getContext("2d");
    ctx.clearRect(0, 0, inkC.width, inkC.height);
    ctx.lineWidth = 2.4 * dpr; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(170, 30, 40, 0.9)";
    for (const s of strokes) {
      if (s.length < 2) { ctx.beginPath(); ctx.arc(s[0][0] * k, s[0][1] * k, 1.2 * dpr, 0, 7); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); continue; }
      ctx.beginPath();
      ctx.moveTo(s[0][0] * k, s[0][1] * k);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0] * k, s[i][1] * k);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------------- input
  function gridPoint(ev) {
    const rect = frame.getBoundingClientRect();
    return [(ev.clientX - rect.left) / rect.width * world.view.w, (ev.clientY - rect.top) / rect.height * world.view.h];
  }
  inkC.addEventListener("pointerdown", (ev) => {
    if (!world || ev.button > 0) return;
    inkC.setPointerCapture(ev.pointerId);
    current = [gridPoint(ev)];
    strokes.push(current);
    drawInk();
  });
  inkC.addEventListener("pointermove", (ev) => {
    if (!current) return;
    const p = gridPoint(ev), last = current[current.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.6) return;
    current.push(p);
    const { dpr, k } = screenScale();
    const ctx = inkC.getContext("2d");
    ctx.lineWidth = 2.4 * dpr; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(170, 30, 40, 0.9)";
    ctx.beginPath(); ctx.moveTo(last[0] * k, last[1] * k); ctx.lineTo(p[0] * k, p[1] * k); ctx.stroke();
  });
  const endStroke = () => { current = null; };
  inkC.addEventListener("pointerup", endStroke);
  inkC.addEventListener("pointercancel", endStroke);

  // ------------------------------------------------------------------- check
  function check() {
    if (!world) return;
    const { view, pieces, nearWater, land } = world;
    const w = view.w, h = view.h;
    const buf = new Float32Array(w * h);

    // The target: every state outline that ended up inland. Outline pixels on
    // a coast or lake shore are visible already, so they are not asked for.
    const tc = document.createElement("canvas"); tc.width = w; tc.height = h;
    const tctx = tc.getContext("2d", { willReadFrequently: true });
    tctx.lineWidth = 1.1; tctx.strokeStyle = "#000";
    for (const p of pieces) {
      tctx.beginPath();
      const tx = p.fx - view.x0 - p.ox, ty = p.fy - view.y0 - p.oy;
      for (const pts of p.rings) {
        if (ringArea(pts) < MIN_RING) continue;   // specks of islands are not asked for
        tctx.moveTo(pts[0] + tx, pts[1] + ty);
        for (let i = 2; i < pts.length; i += 2) tctx.lineTo(pts[i] + tx, pts[i + 1] + ty);
        tctx.closePath();
      }
      tctx.stroke();
    }
    const outline = alphaMask(tctx, w, h);        // every old border, coast included
    const target = new Uint8Array(w * h);         // the ones that are now inland
    let total = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (outline[i] && !nearWater[i] && land[(y + view.y0) * world.W + x + view.x0]) { target[i] = 1; total++; }
    }

    const ic = document.createElement("canvas"); ic.width = w; ic.height = h;
    const ictx = ic.getContext("2d", { willReadFrequently: true });
    ictx.lineWidth = 2; ictx.lineCap = "round"; ictx.lineJoin = "round"; ictx.strokeStyle = "#000"; ictx.fillStyle = "#000";
    for (const s of strokes) {
      ictx.beginPath();
      ictx.moveTo(s[0][0], s[0][1]);
      for (let i = 1; i < s.length; i++) ictx.lineTo(s[i][0], s[i][1]);
      if (s.length === 1) ictx.arc(s[0][0], s[0][1], 1, 0, 7), ictx.fill(); else ictx.stroke();
    }
    const ink = alphaMask(ictx, w, h);

    const tol2 = TOL * TOL;
    const dInk = edt(ink, w, h, 1, buf);
    const found = new Uint8Array(w * h);
    let hit = 0;
    for (let i = 0; i < w * h; i++) if (target[i] && dInk[i] <= tol2) { found[i] = 1; hit++; }
    const dTgt = edt(outline, w, h, 1, buf);      // ink on a coast border is not stray
    let inkPx = 0, stray = 0;
    for (let i = 0; i < w * h; i++) if (ink[i]) { inkPx++; if (dTgt[i] > tol2) stray++; }

    const recall = total ? hit / total : 0;
    const strayF = inkPx ? stray / inkPx : 0;
    const score = Math.round(100 * recall * (1 - 0.5 * strayF));
    lastCheck = { recall, strayF, score };
    $("n-score").textContent = String(score);
    $("n-found").textContent = `${Math.round(recall * 100)}%`;
    $("n-stray").textContent = `${Math.round(strayF * 100)}%`;
    $("numbers").hidden = false;

    // Paint the verdict: teal where the ink found a border, red where it did not.
    const img = new ImageData(w, h), px = img.data;
    const paint = (i, r, g, b) => {
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const o = (yy * w + xx) * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 230;
      }
    };
    for (let i = 0; i < w * h; i++) if (target[i] && !found[i]) paint(i, 230, 70, 50);
    for (let i = 0; i < w * h; i++) if (found[i]) paint(i, 30, 170, 140);
    resultC.getContext("2d").putImageData(img, 0, 0);
  }

  // --------------------------------------------------------------- controls
  $("new").addEventListener("click", () => { seed = randomSeed(); syncUrl(); generate(); });
  $("rot").addEventListener("click", (ev) => {
    rotate = ev.currentTarget.getAttribute("aria-pressed") !== "true";
    ev.currentTarget.setAttribute("aria-pressed", String(rotate));
    syncUrl(); generate();
  });
  $("share").addEventListener("click", async (ev) => {
    try { await navigator.clipboard.writeText(location.href); ev.currentTarget.textContent = "Copied"; }
    catch { ev.currentTarget.textContent = location.href; }
    setTimeout(() => { ev.currentTarget.textContent = "Copy link"; }, 1500);
  });
  $("undo").addEventListener("click", () => { strokes.pop(); drawInk(); });
  $("clear").addEventListener("click", () => { strokes = []; drawInk(); resultC.getContext("2d").clearRect(0, 0, resultC.width, resultC.height); $("numbers").hidden = true; });
  $("check").addEventListener("click", () => { setStatus("Checking…"); setTimeout(() => { check(); setStatus(""); }, 10); });
  $("reveal").addEventListener("click", (ev) => {
    revealed = ev.currentTarget.getAttribute("aria-pressed") !== "true";
    ev.currentTarget.setAttribute("aria-pressed", String(revealed));
    drawMarks();
  });
  window.addEventListener("resize", layout);

  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set("seed", seed);
    if (rotate) u.searchParams.set("rot", "1"); else u.searchParams.delete("rot");
    history.replaceState(null, "", u);
  }

  // ------------------------------------------------------------------- boot
  (async () => {
    const u = new URL(location.href);
    seed = u.searchParams.get("seed") || new Date().toISOString().slice(0, 10);
    rotate = u.searchParams.get("rot") === "1";
    $("rot").setAttribute("aria-pressed", String(rotate));
    try {
      [STATES, CITIES] = await Promise.all([
        fetch("/lab/state-puzzle/data/states.json").then((r) => r.json()),
        fetch("/lab/state-puzzle/data/cities.json").then((r) => r.json()),
      ]);
    } catch (e) {
      setStatus("Could not load the state outlines."); console.error(e); return;
    }
    generate();
  })();
})();
