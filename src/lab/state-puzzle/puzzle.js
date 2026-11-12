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
 *   4. The result gets fictional relief and is wrapped onto a planet with
 *      three.js; ink is drawn straight onto the globe.
 */
(() => {
  "use strict";

  const KM = 2.5;        // km per fine pixel
  const COARSE = 4;      // coarse pixels are COARSE fine pixels wide (10 km)
  const CW = 1800, CH = 1500; // coarse packing grid
  const R_EARTH = 6371;
  const D2R = Math.PI / 180;
  const CLOSE_R = 24;    // final closing of the whole coast, fine px (60 km): inlets under 120 km fill in
  const FILL_R = 32;     // cracks between pieces up to 2× this wide are filled (160 km)
  const CANDIDATES = 12; // landing spots tried per piece; the one with the longest contact wins
  const ISLAND_R = 24;   // bridge archipelago states (AK, HI) so they pack as one piece
  const FILL_MAX = 800;  // enclosed gaps under this many px² (5,000 km²) become land
  const LAKE_OPEN = 4;   // smooth lakes with an opening of this radius
  const TOL = 5;         // ink counts as "on the border" within this many px (12.5 km)
  const MIN_RING = 40;   // rings under this many px² (250 km²) are left out of the target
  const INF = 1e9;       // "no feature": far beyond any squared distance on the grid

  const $ = (id) => document.getElementById(id);
  const statusEl = $("status");

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
  // Squared Euclidean distance to the nearest pixel whose mask value equals
  // `target`: a vertical run-length pass, then the 1-D parabola transform along
  // each row (Felzenszwalb & Huttenlocher). `buf` is a reusable Float32Array.
  const BIGRUN = 1e6;
  function edt(mask, w, h, target, buf) {
    const g = buf && buf.length >= w * h ? buf : new Float32Array(w * h);
    const run = new Int32Array(w).fill(BIGRUN);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) { run[x] = mask[o + x] === target ? 0 : run[x] + 1; g[o + x] = run[x]; }
    }
    run.fill(BIGRUN);
    for (let y = h - 1; y >= 0; y--) {
      const o = y * w;
      for (let x = 0; x < w; x++) { run[x] = mask[o + x] === target ? 0 : run[x] + 1; if (run[x] < g[o + x]) g[o + x] = run[x]; }
    }
    const f = new Float64Array(w), d = new Float64Array(w), v = new Int32Array(w), z = new Float64Array(w + 1);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) { const t = g[o + x]; f[x] = t >= BIGRUN ? INF : t * t; }
      dt1d(f, w, d, v, z);
      for (let x = 0; x < w; x++) g[o + x] = d[x];
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
    const cells = [], halo = [];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (grown[i]) cells.push(x, y);
      if (grown[i] && !c0[i]) halo.push(x, y);   // the one-block skin: where contact is measured
    }
    // The piece's main body: the largest connected run of blocks. Pieces are
    // only allowed to count contact with main bodies, so nothing moors itself
    // to an offshore speck and drifts away from the continent.
    const comp = new Int32Array(cw * ch).fill(-1), sizes = [];
    const stack = [];
    for (let s0 = 0; s0 < cw * ch; s0++) {
      if (!c0[s0] || comp[s0] >= 0) continue;
      const id = sizes.length; let size = 0;
      stack.push(s0); comp[s0] = id;
      while (stack.length) {
        const i = stack.pop(); size++;
        const x = i % cw;
        const visit = (j) => { if (c0[j] && comp[j] < 0) { comp[j] = id; stack.push(j); } };
        if (x > 0) visit(i - 1);
        if (x < cw - 1) visit(i + 1);
        if (i >= cw) visit(i - cw);
        if (i + cw < cw * ch) visit(i + cw);
      }
      sizes.push(size);
    }
    const mainId = sizes.indexOf(Math.max(...sizes));
    const main = new Uint8Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) if (comp[i] === mainId) main[i] = 1;
    return { st, xf, rings, ox, oy, w, h, shape, glue, cw, ch, c0, main, cells, halo, area, cx: sx / area, cy: sy / area };
  }

  // ---------------------------------------------------------------- packing
  function fits(L, p, ox, oy) {
    if (ox < 0 || oy < 0 || ox + p.cw > CW || oy + p.ch > CH) return false;
    const c = p.cells;
    for (let i = 0; i < c.length; i += 2) if (L[(oy + c[i + 1]) * CW + ox + c[i]]) return false;
    return true;
  }
  // How much of the piece's skin touches land already placed. Long contact
  // means the piece has nestled into the pile instead of kissing it at a point.
  function contact(Lc, p, ox, oy) {
    const L = Lc;
    const hl = p.halo;
    let n = 0;
    for (let i = 0; i < hl.length; i += 2) {
      const x = ox + hl[i], y = oy + hl[i + 1], j = y * CW + x;
      if (L[j - 1] || L[j + 1] || L[j - CW] || L[j + CW]) n++;
    }
    return n;
  }
  const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // Each piece is dropped from a random direction, slid in toward the heart
  // of the landmass until it touches, then wiggled into the spot nearby with
  // the longest contact. Several directions are tried and the best contact
  // wins, which packs tight without making the blob round.
  function pack(pieces, rng) {
    const L = new Uint8Array(CW * CH);   // everything placed: what a piece may not overlap
    const Lc = new Uint8Array(CW * CH);  // main bodies only: what a piece may count as contact
    let sx = 0, sy = 0, n = 0;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const stamp = (p, ox, oy) => {
      p.px = ox; p.py = oy;
      for (let y = 0; y < p.ch; y++) for (let x = 0; x < p.cw; x++) {
        const i = y * p.cw + x;
        if (!p.c0[i]) continue;
        L[(oy + y) * CW + ox + x] = 1;
        if (p.main[i]) Lc[(oy + y) * CW + ox + x] = 1;
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
      let best = null, bestScore = -Infinity, found = 0;
      for (let tries = 0; tries < 80 && found < CANDIDATES; tries++) {
        const a = rng() * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
        let t = rb + rp + 2;
        let pos = at(dx, dy, t);
        // Out of the grid? Walk the start point back in along the ray.
        while (t > 0 && (pos[0] < 1 || pos[1] < 1 || pos[0] + p.cw > CW - 1 || pos[1] + p.ch > CH - 1)) { t -= 2; pos = at(dx, dy, t); }
        if (!fits(L, p, pos[0], pos[1])) continue;
        // Slide inward: coarse steps, then back off and creep to contact.
        for (let step = 3; step >= 1; step = step === 3 ? 1 : 0) {
          while (t - step > 0) {
            const q = at(dx, dy, t - step);
            if (!fits(L, p, q[0], q[1])) break;
            t -= step; pos = q;
          }
        }
        // Wiggle: hill-climb on contact over the eight neighbouring offsets.
        // Contact is cheap (skin only) and the overlap test is not, so rank
        // the neighbours by contact first and test only the promising ones.
        let c = contact(Lc, p, pos[0], pos[1]);
        for (let w = 0; w < 50; w++) {
          const ranked = [];
          for (const [ex, ey] of NEIGH) {
            const qx = pos[0] + ex, qy = pos[1] + ey;
            if (qx < 1 || qy < 1 || qx + p.cw > CW - 1 || qy + p.ch > CH - 1) continue;
            const cc = contact(Lc, p, qx, qy);
            if (cc > c) ranked.push([cc, qx, qy]);
          }
          ranked.sort((a, b) => b[0] - a[0]);
          let moved = false;
          for (const [cc, qx, qy] of ranked) {
            if (!fits(L, p, qx, qy)) continue;
            c = cc; pos = [qx, qy]; moved = true; break;
          }
          if (!moved) break;
        }
        if (c === 0) continue;   // only touching specks or nothing: not a landing
        found++;
        const score = c * 1000 - Math.hypot(pos[0] + p.cw / 2 - cx, pos[1] + p.ch / 2 - cy);
        if (score > bestScore) { bestScore = score; best = pos; }
      }
      if (!best) throw new Error(`could not place ${p.st.name}`);
      stamp(p, best[0], best[1]);
    }
    return order;
  }

  // --------------------------------------------------------------- assemble
  // Flood from the frame edge over `open` pixels; marks them in `out`.
  function floodEdge(open, W, H, out, queue) {
    let qh = 0, qt = 0;
    const push = (i) => { if (open[i] && !out[i]) { out[i] = 1; queue[qt++] = i; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (qh < qt) {
      const i = queue[qh++], x = i % W;
      if (x > 0) push(i - 1);
      if (x < W - 1) push(i + 1);
      if (i >= W) push(i - W);
      if (i + W < W * H) push(i + W);
    }
  }
  // Connected components of `open` pixels not already in `skip`; calls
  // onComponent(queue, size) with the member indices for each one.
  function components(open, skip, W, H, label, queue, onComponent) {
    label.fill(0);
    for (let s = 0; s < W * H; s++) {
      if (!open[s] || skip[s] || label[s]) continue;
      let qh = 0, qt = 0;
      queue[qt++] = s; label[s] = 1;
      while (qh < qt) {
        const i = queue[qh++], x = i % W;
        let j;
        if (x > 0 && open[j = i - 1] && !skip[j] && !label[j]) { label[j] = 1; queue[qt++] = j; }
        if (x < W - 1 && open[j = i + 1] && !skip[j] && !label[j]) { label[j] = 1; queue[qt++] = j; }
        if (i >= W && open[j = i - W] && !skip[j] && !label[j]) { label[j] = 1; queue[qt++] = j; }
        if (i + W < W * H && open[j = i + W] && !skip[j] && !label[j]) { label[j] = 1; queue[qt++] = j; }
      }
      onComponent(queue, qt);
    }
  }

  function assemble(pieces) {
    const M = 40;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pieces) {
      x0 = Math.min(x0, p.px * COARSE); y0 = Math.min(y0, p.py * COARSE);
      x1 = Math.max(x1, p.px * COARSE + p.w); y1 = Math.max(y1, p.py * COARSE + p.h);
    }
    const W = x1 - x0 + 2 * M, H = y1 - y0 + 2 * M;
    const union = new Uint8Array(W * H);
    const owner = new Int16Array(W * H).fill(-1);
    pieces.forEach((p, idx) => {
      p.fx = p.px * COARSE - x0 + M; p.fy = p.py * COARSE - y0 + M;
      for (let y = 0; y < p.h; y++) {
        const o = (p.fy + y) * W + p.fx, po = y * p.w;
        for (let x = 0; x < p.w; x++) if (p.glue[po + x]) { union[o + x] = 1; owner[o + x] = idx; }
      }
    });

    // The crack healing runs at half resolution: the radii are tens of
    // pixels, so nothing is lost, and the distance field is interpolated back
    // up, so the coast comes out smooth rather than blocky.
    const w2 = (W + 1) >> 1, h2 = (H + 1) >> 1, N2 = w2 * h2;
    const union2 = new Uint8Array(N2), owner2 = new Int16Array(N2).fill(-1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!union[i]) continue;
      const j = (y >> 1) * w2 + (x >> 1);
      union2[j] = 1; if (owner2[j] < 0) owner2[j] = owner[i];
    }
    const buf2 = new Float32Array(N2);

    // A crack is water between two different pieces: close to the Voronoi
    // seam separating them, and inside a generous closing of the whole union.
    // Water deep inside one piece's own bay is near no seam and stays water.
    const label2 = owner2;                  // grows outward from the pieces
    const queue2 = new Int32Array(N2);
    let qh = 0, qt = 0;
    for (let i = 0; i < N2; i++) if (label2[i] >= 0) queue2[qt++] = i;
    while (qh < qt) {
      const i = queue2[qh++], x = i % w2, l = label2[i];
      if (x > 0 && label2[i - 1] < 0) { label2[i - 1] = l; queue2[qt++] = i - 1; }
      if (x < w2 - 1 && label2[i + 1] < 0) { label2[i + 1] = l; queue2[qt++] = i + 1; }
      if (i >= w2 && label2[i - w2] < 0) { label2[i - w2] = l; queue2[qt++] = i - w2; }
      if (i + w2 < N2 && label2[i + w2] < 0) { label2[i + w2] = l; queue2[qt++] = i + w2; }
    }
    const seam2 = new Uint8Array(N2);
    for (let y = 1; y < h2 - 1; y++) for (let x = 1; x < w2 - 1; x++) {
      const i = y * w2 + x;
      if (union2[i]) continue;
      const l = label2[i];
      if (label2[i - 1] !== l || label2[i + 1] !== l || label2[i - w2] !== l || label2[i + w2] !== l) seam2[i] = 1;
    }
    const R2 = FILL_R / 2, C2 = CLOSE_R / 2;
    const nearSeam2 = dilate(seam2, w2, h2, R2, buf2);
    const closedBig2 = close(union2, w2, h2, R2, buf2);
    const filled2 = new Uint8Array(N2);
    for (let i = 0; i < N2; i++) filled2[i] = union2[i] || (closedBig2[i] && nearSeam2[i]) ? 1 : 0;
    // Final closing of the whole coast, kept as a distance field so it can be
    // sampled at full resolution: a pixel is land where it sits deeper than
    // C2 inside the dilated mask.
    const dil2 = dilate(filled2, w2, h2, C2, buf2);
    const deep = edt(dil2, w2, h2, 0, buf2);   // squared distance to the nearest non-dilated pixel
    const closed = new Uint8Array(W * H);
    const thr = C2 * C2;
    for (let y = 0; y < H; y++) {
      const v = Math.min(h2 - 1, Math.max(0, (y - 0.5) / 2)), vy = Math.floor(v), fy = v - vy, vy1 = Math.min(h2 - 1, vy + 1);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (union[i]) { closed[i] = 1; continue; }
        const u = Math.min(w2 - 1, Math.max(0, (x - 0.5) / 2)), ux = Math.floor(u), fx = u - ux, ux1 = Math.min(w2 - 1, ux + 1);
        const d = (deep[vy * w2 + ux] * (1 - fx) + deep[vy * w2 + ux1] * fx) * (1 - fy)
                + (deep[vy1 * w2 + ux] * (1 - fx) + deep[vy1 * w2 + ux1] * fx) * fy;
        if (d > thr) closed[i] = 1;
      }
    }

    // Water that still touches the edge of the world is sea; the rest are
    // gaps. Small gaps silt up into land, big ones become lakes.
    const water = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) water[i] = closed[i] ? 0 : 1;
    const outside = new Uint8Array(W * H);
    const queue = new Int32Array(W * H);
    floodEdge(water, W, H, outside, queue);
    const label = new Uint8Array(W * H);
    const lake = new Uint8Array(W * H);
    let lx0 = W, ly0 = H, lx1 = -1, ly1 = -1;
    components(water, outside, W, H, label, queue, (q, n) => {
      if (n < FILL_MAX) return;
      for (let k = 0; k < n; k++) {
        const i = q[k], x = i % W, y = (i / W) | 0;
        lake[i] = 1;
        if (x < lx0) lx0 = x; if (x > lx1) lx1 = x; if (y < ly0) ly0 = y; if (y > ly1) ly1 = y;
      }
    });
    const lakes = new Uint8Array(W * H);
    if (lx1 >= 0) {
      // Smooth the lakes with an opening, on just the rectangle that holds them.
      const pad = LAKE_OPEN + 2;
      const cx0 = Math.max(0, lx0 - pad), cy0 = Math.max(0, ly0 - pad);
      const cw = Math.min(W, lx1 + pad + 1) - cx0, ch = Math.min(H, ly1 + pad + 1) - cy0;
      const sub = new Uint8Array(cw * ch);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) sub[y * cw + x] = lake[(cy0 + y) * W + cx0 + x];
      const opened = open(sub, cw, ch, LAKE_OPEN);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (opened[y * cw + x]) lakes[(cy0 + y) * W + cx0 + x] = 1;
    }
    const land = new Uint8Array(W * H);
    let landArea = 0;
    for (let i = 0; i < W * H; i++) { land[i] = !outside[i] && !lakes[i] ? 1 : 0; landArea += land[i]; }
    let lakeCount = 0;
    components(lakes, outside, W, H, label, queue, () => { lakeCount++; });

    // Crop to the land with a margin of sea around it.
    const MG = 28;
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (land[y * W + x]) {
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    const view = { x0: Math.max(0, bx0 - MG), y0: Math.max(0, by0 - MG) };
    view.w = Math.min(W, bx1 + MG + 1) - view.x0;
    view.h = Math.min(H, by1 + MG + 1) - view.y0;

    // The coast band (free in scoring) is land within three steps of water;
    // the hairline is the outermost step.
    const vw = view.w, vh = view.h;
    const lv = new Uint8Array(vw * vh);
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) lv[y * vw + x] = land[(y + view.y0) * W + x + view.x0];
    const edgeOf = (m) => {
      const e = new Uint8Array(vw * vh);
      for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
        const i = y * vw + x;
        if (!m[i]) continue;
        if (x === 0 || y === 0 || x === vw - 1 || y === vh - 1 || !m[i - 1] || !m[i + 1] || !m[i - vw] || !m[i + vw]) e[i] = 1;
      }
      return e;
    };
    const hairline = edgeOf(lv);
    const nearWater = new Uint8Array(vw * vh);
    let shrink = lv;
    for (let k = 0; k < 3; k++) {
      const e = edgeOf(shrink);
      const next = new Uint8Array(vw * vh);
      for (let i = 0; i < vw * vh; i++) { if (e[i]) nearWater[i] = 1; next[i] = shrink[i] && !e[i] ? 1 : 0; }
      shrink = next;
    }


    return { W, H, view, lv, land, nearWater, lakeCount, landKm2: landArea * KM * KM };
  }

  // ---------------------------------------------------------------- terrain
  // The continent is fictional, so its relief is too: height rises with
  // distance from the sea and is broken up by fractal noise, then hillshaded
  // and coloured hypsometrically. Water gets a shallows ramp out to deep sea.
  const DEEP = [20, 52, 92];
  function terrain(w, salt) {
    const { view, lv } = w, vw = view.w, vh = view.h, N = vw * vh;
    const dl = Float32Array.from(edt(lv, vw, vh, 0));   // land: squared px to water
    const dw = edt(lv, vw, vh, 1);                       // water: squared px to land
    const hash = (x, y) => {
      let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + salt | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const vnoise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
    };
    const fbm = (x, y) => {
      let s = 0, a = 0.5, f = 1;
      for (let o = 0; o < 5; o++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
      return s / 0.97;
    };
    const ht = new Float32Array(N), wet = new Float32Array(N);
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
      const i = y * vw + x;
      if (!lv[i]) continue;
      const d = Math.sqrt(dl[i]);
      const n = fbm(x / 140, y / 140);
      const ridge = 1 - Math.abs(2 * fbm(x / 70 + 31.7, y / 70 - 12.3) - 1);
      const inland = 1 - Math.exp(-d / 45);
      ht[i] = Math.max(0, Math.min(1, inland * (0.15 + 0.75 * n * n * 1.6 + 0.35 * ridge * ridge * n)));
      wet[i] = fbm(x / 260 + 100, y / 260 + 100) + 0.25 * Math.exp(-d / 30);
    }
    const STOPS = [
      [0.00, [104, 140, 82]], [0.12, [122, 150, 88]], [0.28, [160, 164, 104]],
      [0.45, [178, 150, 100]], [0.62, [150, 118, 86]], [0.80, [126, 104, 88]],
      [0.92, [196, 192, 186]], [1.00, [242, 242, 240]],
    ];
    const ramp = (t, out) => {
      let k = 0; while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
      const [t0, c0] = STOPS[k], [t1, c1] = STOPS[k + 1];
      const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
      for (let j = 0; j < 3; j++) out[j] = c0[j] + (c1[j] - c0[j]) * f;
    };
    const L = [-0.55, -0.6, 0.58], c = [0, 0, 0];
    const data = new Uint8Array(N * 4);
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
      const i = y * vw + x, o = i * 4;
      if (lv[i]) {
        ramp(ht[i], c);
        // Dry interiors go ochre, wet ones stay green.
        const dry = Math.max(0, Math.min(1, (0.55 - wet[i]) * 2.2)) * (1 - Math.min(1, ht[i] * 1.4));
        c[0] += (196 - c[0]) * dry * 0.55; c[1] += (170 - c[1]) * dry * 0.55; c[2] += (118 - c[2]) * dry * 0.55;
        const hx = (ht[Math.min(i + 1, i - x + vw - 1)] - ht[Math.max(i - 1, i - x)]) * 14;
        const hy = (ht[Math.min(i + vw, N - vw + x)] - ht[Math.max(i - vw, x)]) * 14;
        const nl = Math.hypot(hx, hy, 1);
        const shade = (-hx * L[0] - hy * L[1] + L[2]) / nl;
        const k = 0.62 + 0.62 * shade;
        const beach = Math.sqrt(dl[i]) < 1.6 ? 0.5 : 0;
        for (let j = 0; j < 3; j++) data[o + j] = Math.max(0, Math.min(255, (c[j] + ([214, 200, 160][j] - c[j]) * beach) * k));
        data[o + 3] = 255;
      } else {
        const d = Math.sqrt(dw[i]);
        const t = Math.pow(Math.min(1, d / 26), 0.7);
        const foam = d < 1.5 ? 0.35 : 0;
        const sh = [86, 168, 178];
        for (let j = 0; j < 3; j++) {
          const v = sh[j] + (DEEP[j] - sh[j]) * t;
          data[o + j] = v + (235 - v) * foam;
        }
        data[o + 3] = 0;
      }
    }
    return data;
  }

  // ------------------------------------------------------------------ globe
  // The continent sits on an Earth-sized planet through a Lambert azimuthal
  // equal-area projection centred on it, so areas stay true. The fragment
  // shader projects every point of the sphere into the raster to sample it.
  const T = window.THREE;
  const glC = $("globe"), labC = $("labels");
  const renderer = new T.WebGLRenderer({ canvas: glC, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.001, 200);
  const controls = new T.OrbitControls(camera, glC);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.enablePan = false; controls.minDistance = 1.06; controls.maxDistance = 7;

  const LAT0 = 18 * D2R, LON0 = -28 * D2R;
  const vC = new T.Vector3(Math.cos(LAT0) * Math.sin(LON0), Math.sin(LAT0), Math.cos(LAT0) * Math.cos(LON0));
  const vE = new T.Vector3(Math.cos(LON0), 0, -Math.sin(LON0));
  const vN = new T.Vector3(-Math.sin(LAT0) * Math.sin(LON0), Math.cos(LAT0), -Math.sin(LAT0) * Math.cos(LON0));
  const PX_PER_RAD = R_EARTH / KM;

  const blank = new T.DataTexture(new Uint8Array(4), 1, 1); blank.needsUpdate = true;
  const overC = document.createElement("canvas");
  let overTex = new T.CanvasTexture(overC);
  const uniforms = {
    uLand: { value: blank }, uOver: { value: overTex },
    uC: { value: vC }, uE: { value: vE }, uN: { value: vN },
    uSize: { value: new T.Vector2(1, 1) }, uScale: { value: PX_PER_RAD },
    uSun: { value: new T.Vector3(-0.45, 0.55, 0.7).normalize() },
    uDeep: { value: new T.Vector3(DEEP[0] / 255, DEEP[1] / 255, DEEP[2] / 255) },
  };
  const planet = new T.Mesh(new T.SphereGeometry(1, 192, 96), new T.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vPos; varying vec3 vNrm; varying vec3 vView;
      void main() {
        vPos = position;
        vNrm = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uLand; uniform sampler2D uOver;
      uniform vec3 uC; uniform vec3 uE; uniform vec3 uN; uniform vec3 uSun; uniform vec3 uDeep;
      uniform vec2 uSize; uniform float uScale;
      varying vec3 vPos; varying vec3 vNrm; varying vec3 vView;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n3(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 p = normalize(vPos);
        float swell = n3(p * 6.0) * 0.6 + n3(p * 17.0) * 0.4;
        vec3 col = uDeep * (0.82 + 0.3 * swell);
        float land = 0.0;
        float cosc = dot(p, uC);
        if (cosc > -0.2) {
          float k = sqrt(2.0 / (1.0 + cosc));
          vec2 uv = vec2(0.5 + k * dot(p, uE) * uScale / uSize.x, 0.5 - k * dot(p, uN) * uScale / uSize.y);
          if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) {
            vec4 t = texture2D(uLand, uv);
            vec2 e = min(uv, 1.0 - uv) * uSize;
            float f = smoothstep(0.0, 14.0, min(e.x, e.y));
            col = mix(col, t.rgb, f);
            land = t.a * f;
            vec4 o = texture2D(uOver, uv);
            col = mix(col, o.rgb, o.a);
          }
        }
        vec3 n = normalize(vNrm), v = normalize(vView);
        float diff = max(dot(n, uSun), 0.0);
        col *= 0.42 + 0.78 * diff;
        vec3 hv = normalize(uSun + v);
        col += vec3(1.0, 0.96, 0.85) * pow(max(dot(n, hv), 0.0), 140.0) * 0.18 * (1.0 - land);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);
        col = mix(col, vec3(0.45, 0.68, 1.0), fres * 0.4);
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  scene.add(planet);

  // Atmosphere: a back-facing shell that glows at the limb.
  scene.add(new T.Mesh(new T.SphereGeometry(1.06, 96, 48), new T.ShaderMaterial({
    side: T.BackSide, blending: T.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV;
      void main() { float r = 1.0 - abs(dot(vN, vV)); float i = pow(smoothstep(0.0, 1.0, r * 1.02), 6.0) * 0.9; gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * i, i); }`,
  })));

  // Stars.
  {
    const n = 2400, pos = new Float32Array(n * 3), rng = mulberry32(7);
    for (let i = 0; i < n; i++) {
      const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      pos.set([r * Math.cos(a) * 90, z * 90, r * Math.sin(a) * 90], i * 3);
    }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3));
    scene.add(new T.Points(g, new T.PointsMaterial({ color: 0xbfd0ff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
  }

  const inkGroup = new T.Group(); scene.add(inkGroup);
  const inkMat = new T.MeshBasicMaterial({ color: 0xff3b5c, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 });

  // Raster (view px) <-> sphere.
  function toSphere(x, y, r = 1, out = new T.Vector3()) {
    const X = (x - world.view.w / 2) / PX_PER_RAD, Y = -(y - world.view.h / 2) / PX_PER_RAD;
    const rho = Math.hypot(X, Y);
    if (rho < 1e-12) return out.copy(vC).multiplyScalar(r);
    const c = 2 * Math.asin(Math.min(1, rho / 2)), s = Math.sin(c) / rho;
    return out.copy(vC).multiplyScalar(Math.cos(c)).addScaledVector(vE, X * s).addScaledVector(vN, Y * s).multiplyScalar(r);
  }
  function toRaster(p) {
    const cosc = p.dot(vC); if (cosc < -0.5) return null;
    const k = Math.sqrt(2 / (1 + cosc));
    return [world.view.w / 2 + k * p.dot(vE) * PX_PER_RAD, world.view.h / 2 - k * p.dot(vN) * PX_PER_RAD];
  }

  // ------------------------------------------------------------------ state
  let STATES = null, CITIES = null;
  let world = null;      // { pieces, W, H, view, lv, ... }
  let strokes = [];      // { pts: [[x, y], …] in view grid coords, w, mesh }
  let current = null;
  let revealed = false;
  let lastCheck = null;  // ImageData of the verdict, view-sized
  let seed = "", rotate = false;
  let cities3 = [], abbr3 = [];
  let mode = "draw", spaceHeld = false;
  let labelsDirty = true;

  function setStatus(msg) { statusEl.textContent = msg; statusEl.hidden = !msg; }

  async function generate() {
    setStatus("Assembling the continent…");
    $("new").disabled = true;
    await new Promise((r) => setTimeout(r, 30));
    const rng = mulberry32(hashSeed(seed + (rotate ? "|rot" : "")));
    const t0 = performance.now();
    const pieces = STATES.map((st) => buildPiece(st, rotate ? rng() * Math.PI * 2 : 0));
    let order;
    try { order = pack(pieces, rng); }
    catch (e) { console.error(e); setStatus("That one would not fit. Try another landmass."); $("new").disabled = false; return; }
    const w = assemble(order);
    world = { ...w, pieces: order };
    const tex = terrain(w, hashSeed(seed));
    console.debug(`state-puzzle: ${w.view.w}×${w.view.h} px, built in ${(performance.now() - t0) | 0} ms`);

    const max = renderer.capabilities.maxTextureSize;
    if (w.view.w > max || w.view.h > max) console.warn("state-puzzle: land texture exceeds GPU limit");
    if (uniforms.uLand.value !== blank) uniforms.uLand.value.dispose();
    const lt = new T.DataTexture(tex, w.view.w, w.view.h, T.RGBAFormat);
    lt.magFilter = T.LinearFilter; lt.minFilter = T.LinearMipmapLinearFilter; lt.generateMipmaps = true;
    lt.anisotropy = renderer.capabilities.getMaxAnisotropy();
    lt.needsUpdate = true;
    uniforms.uLand.value = lt;
    uniforms.uSize.value.set(w.view.w, w.view.h);
    const os = Math.min(2, 4096 / Math.max(w.view.w, w.view.h));
    overC.width = Math.round(w.view.w * os); overC.height = Math.round(w.view.h * os);
    overC.scale = os;
    overTex.dispose();   // a texture cannot change size once uploaded
    overTex = new T.CanvasTexture(overC);
    overTex.flipY = false;   // raster rows run top-down, like the land texture
    uniforms.uOver.value = overTex;

    clearInk(); lastCheck = null; revealed = false;
    $("reveal").setAttribute("aria-pressed", "false");
    $("numbers").hidden = true;
    cities3 = [];
    for (const p of order) for (const c of CITIES[p.st.abbr] || []) {
      const [gx, gy] = cityPoint(p, c);
      cities3.push({ pos: toSphere(gx, gy), name: c[0], capital: c[3] === 1 });
    }
    cities3.sort((a, b) => b.capital - a.capital);
    abbr3 = order.map((p) => ({ pos: toSphere(p.cx + p.fx - w.view.x0, p.cy + p.fy - w.view.y0), name: p.st.abbr }));
    drawOverlay();
    frameCamera(w);

    $("seed-label").textContent = seed + (rotate ? " (rotated)" : "");
    $("meta").textContent = `${(w.landKm2 / 1e6).toFixed(2)} M km² · ${w.lakeCount} lake${w.lakeCount === 1 ? "" : "s"}`;
    await document.fonts.load("600 12px Archivo").catch(() => {});
    labelsDirty = true;
    setStatus("");
    $("new").disabled = false;
  }

  function frameCamera(w) {
    const half = Math.max(w.view.w, w.view.h) / 2 / PX_PER_RAD;
    const a = Math.min(1.3, half);
    const fov = camera.fov * D2R / 2;
    const fit = Math.min(Math.tan(fov), Math.tan(fov) * camera.aspect) * 0.78;
    const d = Math.cos(a) + Math.sin(a) / fit;
    camera.position.copy(vC).multiplyScalar(Math.max(1.6, d));
    camera.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function cityPoint(p, city) {
    const [x, y] = p.xf(city[2], city[1]);
    return [x - p.ox + p.fx - world.view.x0, y - p.oy + p.fy - world.view.y0];
  }

  // Overlay texture: the verdict and the revealed borders, in raster space.
  function drawOverlay() {
    const ctx = overC.getContext("2d"), s = overC.scale;
    ctx.clearRect(0, 0, overC.width, overC.height);
    if (lastCheck) {
      const tmp = document.createElement("canvas"); tmp.width = lastCheck.width; tmp.height = lastCheck.height;
      tmp.getContext("2d").putImageData(lastCheck, 0, 0);
      ctx.drawImage(tmp, 0, 0, overC.width, overC.height);
    }
    if (revealed && world) {
      ctx.save(); ctx.scale(s, s);
      const rings = new Path2D();
      for (const p of world.pieces) {
        const tx = p.fx - world.view.x0 - p.ox, ty = p.fy - world.view.y0 - p.oy;
        for (const pts of p.rings) {
          if (ringArea(pts) < MIN_RING) continue;
          rings.moveTo(pts[0] + tx, pts[1] + ty);
          for (let i = 2; i < pts.length; i += 2) rings.lineTo(pts[i] + tx, pts[i + 1] + ty);
          rings.closePath();
        }
      }
      ctx.lineJoin = "round";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(15, 20, 30, 0.45)"; ctx.stroke(rings);
      ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255, 244, 210, 0.95)"; ctx.setLineDash([6, 3]); ctx.stroke(rings);
      ctx.restore();
    }
    overTex.needsUpdate = true;
    labelsDirty = true;
  }

  // Screen-space labels: cities, plus state abbreviations when revealed.
  const vtmp = new T.Vector3(), vcam = new T.Vector3();
  function drawLabels() {
    const dpr = renderer.getPixelRatio();
    const W = labC.width, H = labC.height;
    const ctx = labC.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (!world) return;
    const project = (pos) => {
      vcam.copy(camera.position).sub(pos).normalize();
      if (vcam.dot(pos) < 0.12) return null;
      vtmp.copy(pos).project(camera);
      if (vtmp.z > 1) return null;
      return [(vtmp.x + 1) / 2 * W, (1 - vtmp.y) / 2 * H];
    };
    const placed = [];
    if (revealed) {
      ctx.font = `800 ${13 * dpr}px Archivo, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      for (const a of abbr3) {
        const q = project(a.pos); if (!q) continue;
        ctx.lineWidth = 4 * dpr; ctx.strokeStyle = "rgba(10, 16, 28, 0.75)";
        ctx.strokeText(a.name, q[0], q[1]);
        ctx.fillStyle = "#ffe9a8"; ctx.fillText(a.name, q[0], q[1]);
        const m = ctx.measureText(a.name).width;
        placed.push([q[0] - m / 2, q[1] - 8 * dpr, q[0] + m / 2, q[1] + 8 * dpr]);
      }
    }
    const fontPx = 11.5 * dpr;
    ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    const pts = [];
    for (const c of cities3) {
      const q = project(c.pos); if (!q) continue;
      pts.push({ c, x: q[0], y: q[1] });
      ctx.beginPath();
      ctx.arc(q[0], q[1], (c.capital ? 3.4 : 2.4) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = c.capital ? "#ffd166" : "#f4f1ea";
      ctx.fill();
      ctx.lineWidth = 1.3 * dpr; ctx.strokeStyle = "rgba(10, 16, 28, 0.85)"; ctx.stroke();
      placed.push([q[0] - 4 * dpr, q[1] - 4 * dpr, q[0] + 4 * dpr, q[1] + 4 * dpr]);
    }
    const tryLabel = (x, y, text, capital) => {
      const w = ctx.measureText(text).width, h = fontPx * 1.15, gap = 6 * dpr;
      const slots = [[x + gap, y, "left"], [x - gap, y, "right"], [x, y - gap - h / 2, "center"], [x, y + gap + h / 2, "center"]];
      for (const [lx, ly, align] of slots) {
        const left = align === "left" ? lx : align === "right" ? lx - w : lx - w / 2;
        const box = [left - 2, ly - h / 2, left + w + 2, ly + h / 2];
        if (box[0] < 0 || box[1] < 0 || box[2] > W || box[3] > H) continue;
        if (placed.some((b) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) continue;
        placed.push(box);
        ctx.textAlign = align;
        ctx.lineWidth = 3.2 * dpr; ctx.strokeStyle = "rgba(10, 16, 28, 0.78)";
        ctx.strokeText(text, lx, ly);
        ctx.fillStyle = capital ? "#ffe2a0" : "#f1efe8";
        ctx.fillText(text, lx, ly);
        return;
      }
    };
    ctx.font = `700 ${fontPx}px Archivo, sans-serif`;
    for (const p of pts) if (p.c.capital) tryLabel(p.x, p.y, p.c.name, true);
    ctx.font = `500 ${fontPx}px Archivo, sans-serif`;
    for (const p of pts) if (!p.c.capital) tryLabel(p.x, p.y, p.c.name, false);
  }

  // -------------------------------------------------------------------- ink
  function ribbon(s) {
    const n = s.pts.length, hw = s.w / 2;
    const pos = new Float32Array(Math.max(2, n) * 2 * 3), v = new T.Vector3();
    const idx = [];
    const R = 1.0004;
    for (let i = 0; i < n; i++) {
      const a = s.pts[Math.max(0, i - 1)], b = s.pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      if (n === 1) { tx = 1; ty = 0; }
      const [x, y] = s.pts[i];
      toSphere(x - ty * hw, y + tx * hw, R, v); pos.set([v.x, v.y, v.z], i * 6);
      toSphere(x + ty * hw, y - tx * hw, R, v); pos.set([v.x, v.y, v.z], i * 6 + 3);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    if (n === 1) { // a dot: a short dash
      const [x, y] = s.pts[0];
      toSphere(x + hw, y - hw, R, v); pos.set([v.x, v.y, v.z], 6);
      toSphere(x + hw, y + hw, R, v); pos.set([v.x, v.y, v.z], 9);
      idx.push(0, 1, 2, 1, 3, 2);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    g.setIndex(idx);
    if (s.mesh) { s.mesh.geometry.dispose(); s.mesh.geometry = g; }
    else { s.mesh = new T.Mesh(g, inkMat); inkGroup.add(s.mesh); }
  }
  function clearInk() {
    for (const s of strokes) { inkGroup.remove(s.mesh); s.mesh.geometry.dispose(); }
    strokes = [];
  }

  // ------------------------------------------------------------------ input
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function pick(ev) {
    const r = glC.getBoundingClientRect();
    ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const b = o.dot(d), c = o.lengthSq() - 1, disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    const p = o.clone().addScaledVector(d, t);
    const g = toRaster(p);
    if (!g || g[0] < 0 || g[1] < 0 || g[0] >= world.view.w || g[1] >= world.view.h) return null;
    return g;
  }
  // Raster px per screen px at the centre of the view, to keep ink a steady width.
  function rasterPerScreenPx() {
    const d = camera.position.length() - 1;
    const px = glC.getBoundingClientRect().height;
    const worldPerPx = 2 * d * Math.tan(camera.fov * D2R / 2) / px;
    return worldPerPx * PX_PER_RAD;
  }
  const drawing = () => mode === "draw" && !spaceHeld;
  const touches = new Set();
  glC.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "touch") touches.add(ev.pointerId);
    if (touches.size > 1 && current) { // second finger: this was a pinch, not a stroke
      const s = strokes.pop(); inkGroup.remove(s.mesh); s.mesh.geometry.dispose(); current = null; return;
    }
    if (!world || !drawing() || ev.button > 0 || touches.size > 1) return;
    const g = pick(ev); if (!g) return;
    current = { pts: [g], w: Math.max(0.8, 2.6 * rasterPerScreenPx()), mesh: null, id: ev.pointerId };
    strokes.push(current); ribbon(current);
  });
  glC.addEventListener("pointermove", (ev) => {
    if (!current || ev.pointerId !== current.id) return;
    const g = pick(ev); if (!g) return;
    const last = current.pts[current.pts.length - 1];
    if (Math.hypot(g[0] - last[0], g[1] - last[1]) < current.w * 0.4) return;
    current.pts.push(g); ribbon(current);
  });
  const endStroke = (ev) => { touches.delete(ev.pointerId); if (current && ev.pointerId === current.id) current = null; };
  window.addEventListener("pointerup", endStroke);
  window.addEventListener("pointercancel", endStroke);

  function setMode(m) {
    mode = m;
    $("mode-draw").setAttribute("aria-pressed", String(m === "draw"));
    $("mode-spin").setAttribute("aria-pressed", String(m === "spin"));
    applyMode();
  }
  function applyMode() {
    const d = drawing();
    controls.mouseButtons = { LEFT: d ? null : T.MOUSE.ROTATE, MIDDLE: T.MOUSE.DOLLY, RIGHT: T.MOUSE.ROTATE };
    controls.touches = { ONE: d ? null : T.TOUCH.ROTATE, TWO: T.TOUCH.DOLLY_ROTATE };
    glC.style.cursor = d ? "crosshair" : "grab";
  }
  window.addEventListener("keydown", (ev) => {
    if (ev.code === "Space" && !ev.repeat && ev.target === document.body) { spaceHeld = true; applyMode(); ev.preventDefault(); }
  });
  window.addEventListener("keyup", (ev) => { if (ev.code === "Space") { spaceHeld = false; applyMode(); } });
  glC.addEventListener("contextmenu", (ev) => ev.preventDefault());

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
    for (const { pts: s } of strokes) {
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
    $("n-score").textContent = String(score);
    $("n-found").textContent = `${Math.round(recall * 100)}%`;
    $("n-stray").textContent = `${Math.round(strayF * 100)}%`;
    $("numbers").hidden = false;

    // Paint the verdict: teal where the ink found a border, orange where it did not.
    const img = new ImageData(w, h), px = img.data;
    const paint = (i, r, g, b) => {
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const o = (yy * w + xx) * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 235;
      }
    };
    for (let i = 0; i < w * h; i++) if (target[i] && !found[i]) paint(i, 255, 120, 60);
    for (let i = 0; i < w * h; i++) if (found[i]) paint(i, 40, 230, 190);
    lastCheck = img;
    drawOverlay();
  }

  // --------------------------------------------------------------- controls
  $("new").addEventListener("click", () => { seed = randomSeed(); syncUrl(); generate(); });
  $("rot").addEventListener("click", (ev) => {
    rotate = ev.currentTarget.getAttribute("aria-pressed") !== "true";
    ev.currentTarget.setAttribute("aria-pressed", String(rotate));
    syncUrl(); generate();
  });
  $("share").addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    try { await navigator.clipboard.writeText(location.href); b.textContent = "Copied"; }
    catch { b.textContent = "Copy failed"; }
    setTimeout(() => { b.textContent = "Copy link"; }, 1500);
  });
  $("undo").addEventListener("click", () => { const s = strokes.pop(); if (s) { inkGroup.remove(s.mesh); s.mesh.geometry.dispose(); } });
  $("clear").addEventListener("click", () => { clearInk(); lastCheck = null; drawOverlay(); $("numbers").hidden = true; });
  $("check").addEventListener("click", () => { setStatus("Checking…"); setTimeout(() => { check(); setStatus(""); }, 10); });
  $("reveal").addEventListener("click", (ev) => {
    revealed = ev.currentTarget.getAttribute("aria-pressed") !== "true";
    ev.currentTarget.setAttribute("aria-pressed", String(revealed));
    drawOverlay();
  });
  $("recenter").addEventListener("click", () => world && frameCamera(world));
  $("mode-draw").addEventListener("click", () => setMode("draw"));
  $("mode-spin").addEventListener("click", () => setMode("spin"));

  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set("seed", seed);
    if (rotate) u.searchParams.set("rot", "1"); else u.searchParams.delete("rot");
    history.replaceState(null, "", u);
  }

  // ------------------------------------------------------------- render loop
  function resize() {
    const w = window.innerWidth, h = window.innerHeight, dpr = renderer.getPixelRatio();
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    labC.width = Math.round(w * dpr); labC.height = Math.round(h * dpr);
    labelsDirty = true;
  }
  window.addEventListener("resize", resize);
  controls.addEventListener("change", () => {
    labelsDirty = true;
    // Slow the spin as the camera nears the ground.
    controls.rotateSpeed = Math.min(1, 0.15 + 0.6 * (camera.position.length() - 1));
  });
  function loop() {
    controls.update();
    renderer.render(scene, camera);
    if (labelsDirty) { labelsDirty = false; drawLabels(); }
    requestAnimationFrame(loop);
  }
  resize(); setMode("draw"); loop();

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
