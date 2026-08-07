// cast25.js — bare-bones 25-character unlock ladder for Bottle Game.
// Loaded before skins.js. Exposes window.FLIP_CAST25 { ROSTER, drawFns, liquidFor }.
//
// Art pipeline matches the parrot/T-Rex in skins.js: each character is an
// authored SVG (300×420 viewBox, ground plane at svg y=376) baked per player
// color into an offscreen Image and blitted at ×0.74 so the contact plane maps
// to local y≈+39. Vessels paint their dynamic liquid/sand on canvas FIRST
// (clipped to the glass interior), then the sprite draws on top with a
// translucent glass body so the physics-driven liquid shows through.
(function () {
  'use strict';

  const INK = '#2a2430';
  const FLAVORS = [
    '#1f9bff', '#e3263c', '#8ed11a', '#ff7a00', '#8a3ffc', '#5fcfe6',
    '#3fae1a', '#ff5b86', '#4f63e0', '#ffc233', '#c8203a', '#ff9ecf',
  ];

  // ── Color helpers ──────────────────────────────────────────────────────────
  function hexRgb(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbHex(r, g, b) {
    return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
  }
  function mix(a, b, t) {
    const A = hexRgb(a), B = hexRgb(b);
    return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  const shade = (hex, t) => (t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t));
  // Standard 5-stop palette in the trex/parrot idiom.
  const P = (c) => ({
    c,
    hi:   shade(c, 0.18),
    lo:   shade(c, -0.22),
    deep: shade(c, -0.42),
    line: shade(c, -0.55),
  });

  // ── Sprite infrastructure (same geometry as skins.js) ─────────────────────
  const SCALE = 0.74, GROUND_SVG = 376, GROUND_LOCAL = 39;
  const DEST = {
    x: -150 * SCALE,
    y: GROUND_LOCAL - GROUND_SVG * SCALE,
    w: 300 * SCALE,
    h: 420 * SCALE,
  };
  // svg-space → local canvas-space (for liquid clip paths).
  const X = (x) => (x - 150) * SCALE;
  const Y = (y) => (y - GROUND_SVG) * SCALE + GROUND_LOCAL;

  const loadCbs = [];
  function onSpriteLoad(cb) { if (typeof cb === 'function') loadCbs.push(cb); }
  function fireLoaded() { for (const cb of loadCbs) { try { cb(); } catch (_) {} } }

  const cache = new Map();
  function sprite(id, color, build) {
    const key = id + '|' + color;
    let e = cache.get(key);
    if (e) return e;
    e = { img: new Image(), ready: false };
    e.img.onload = () => { e.ready = true; fireLoaded(); };
    e.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><g stroke-linecap="round" stroke-linejoin="round">${build(color)}</g></svg>`
    );
    cache.set(key, e);
    return e;
  }
  function blit(ctx, id, color, build) {
    const s = sprite(id, color, build);
    if (s.ready) { ctx.drawImage(s.img, DEST.x, DEST.y, DEST.w, DEST.h); return; }
    // 1–2 frame placeholder while the data-URI decodes.
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.roundRect(-26, -95, 52, 134, 12); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Shared SVG snippets ────────────────────────────────────────────────────
  const eye = (x, y, r) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" stroke="${INK}" stroke-width="2"/>` +
    `<circle cx="${x + r * 0.16}" cy="${y + r * 0.16}" r="${r * 0.46}" fill="${INK}"/>` +
    `<circle cx="${x - r * 0.32}" cy="${y - r * 0.32}" r="${Math.max(1.4, r * 0.2)}" fill="#ffffff"/>`;
  const gloss = (d, w, o) =>
    `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="${w || 5}" opacity="${o || 0.35}"/>`;
  const spark = (x, y, s, col, op) =>
    `<path d="M ${x} ${y - s} L ${x + s * 0.28} ${y - s * 0.28} L ${x + s} ${y} L ${x + s * 0.28} ${y + s * 0.28} L ${x} ${y + s} L ${x - s * 0.28} ${y + s * 0.28} L ${x - s} ${y} L ${x - s * 0.28} ${y - s * 0.28} Z" fill="${col}" opacity="${op == null ? 0.9 : op}"/>`;
  const GLASS = 'rgba(216,238,250,0.22)';
  const GLASS_EDGE = '#94b2c6';
  // Interior box helper for paintLiquid — svg-space rect → local center/extents.
  const IB = (x0, y0, x1, y1) => ({
    cy: Y((y0 + y1) / 2),
    hh: ((y1 - y0) / 2) * SCALE,
    hw: ((x1 - x0) / 2) * SCALE,
  });

  // ── Dynamic liquid (canvas, world-level, drawn under the sprite) ───────────
  // The fill plane is anchored to the vessel's interior in WORLD space: `box`
  // is the interior's local center + half-extents ({cy, hh, hw}); the plane
  // sits `fill` of the way up the interior's current world-projected height.
  // That keeps the apparent volume constant at any rotation (the old fixed
  // local offset made inverted vessels look brim-full or empty).
  // Open vessels pour when past ~70° from upright — fill drops + drip stream.
  function paintLiquid(ctx, opts, clipFn, box, mouthY) {
    const liq = opts.liquid;
    if (!liq) return;
    const angle = opts.angle || 0;
    const color = opts.color || '#1f9bff';
    const fillCol = liq.lava ? shade(color, 0.15) : color;
    let fill = liq.fill == null ? 0.35 : liq.fill;
    const abs = Math.abs(((angle + Math.PI) % (2 * Math.PI)) - Math.PI);
    const inverted = abs > 1.2;
    let pouring = false;
    if (liq.mode === 'open' && inverted) {
      fill = Math.max(0.02, fill * (1 - (abs - 1.2) * 0.9));
      pouring = fill < 0.18 || abs > 1.8;
    }
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const yc = box.cy * cosA;                                        // interior center, world y
    const projH = box.hh * Math.abs(cosA) + box.hw * Math.abs(sinA); // world half-height
    const sy = yc + projH * (1 - 2 * fill);
    ctx.save();
    clipFn();
    ctx.clip();
    ctx.rotate(-angle);
    const tilt = Math.max(-0.28, Math.min(0.28, opts.slosh || 0));
    const slope = Math.tan(tilt);
    const yL = sy - 120 * slope, yR = sy + 120 * slope;
    ctx.fillStyle = fillCol;
    ctx.globalAlpha = liq.lava ? 0.85 : 0.92;
    ctx.beginPath();
    ctx.moveTo(-120, yL); ctx.lineTo(120, yR); ctx.lineTo(120, 280); ctx.lineTo(-120, 280);
    ctx.closePath(); ctx.fill();
    if (liq.lava) {
      ctx.fillStyle = shade(color, -0.28);
      const bh = Math.max(20, projH);
      for (const [bx, ft, br] of [[-7, 0.28, 15], [11, 0.58, 19], [-13, 0.86, 12]]) {
        ctx.beginPath(); ctx.arc(bx, sy + bh * 2 * ft * 0.8, br, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-120, yL); ctx.lineTo(120, yR); ctx.stroke();
    ctx.restore();

    if (pouring && liq.mode === 'open') {
      const my = mouthY == null ? -118 : mouthY;
      ctx.save();
      ctx.strokeStyle = fillCol;
      ctx.fillStyle = fillCol;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, my);
      ctx.quadraticCurveTo(18 * Math.sin(angle * 2), my - 34, 8, my - 74);
      ctx.stroke();
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(6 + i * 4, my - 38 - i * 14, 3.5 - i * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ══ KETCHUP — glass bottle, metal cap, keystone label ══════════════════════
  function ketchupSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="130" y1="112" x2="170" y2="140" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#e6e9ee"/><stop offset="0.5" stop-color="#aeb6c0"/><stop offset="1" stop-color="#7c848e"/></linearGradient></defs>
<path d="M 134 140 L 134 190 C 134 214 112 226 110 250 L 110 344 Q 110 368 134 368 L 166 368 Q 190 368 190 344 L 190 250 C 188 226 166 214 166 190 L 166 140 Z" fill="rgba(255,255,255,0.13)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 134 196 L 120 242 M 166 196 L 180 242" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
<rect x="129" y="110" width="42" height="32" rx="6" fill="url(#g1)" stroke="#5c636c" stroke-width="2"/>
<path d="M 138 114 L 138 138 M 150 114 L 150 138 M 162 114 L 162 138" stroke="#8d949e" stroke-width="1.6" opacity="0.8"/>
<path d="M 118 254 L 182 254 L 176 324 L 124 324 Z" fill="#f8f4ea" stroke="#d9cfb8" stroke-width="2"/>
<circle cx="150" cy="282" r="14" fill="${p.c}" stroke="${p.deep}" stroke-width="1.5"/>
<path d="M 148 268 C 146 262 152 260 154 264 C 158 261 162 265 158 269" fill="#3fae1a"/>
<rect x="128" y="304" width="44" height="10" rx="3" fill="${p.c}" opacity="0.9"/>
<path d="M 132 264 L 142 264 M 158 264 L 168 264" stroke="#b9ad92" stroke-width="2"/>
${gloss('M 122 262 C 118 300 120 336 127 354', 5, 0.3)}
${gloss('M 138 152 L 138 184', 3.5, 0.5)}`;
  }
  function drawKetchup(ctx, opts) {
    const c = opts.color || '#e3263c';
    paintLiquid(ctx, Object.assign({}, opts, { color: shade(c, -0.12), liquid: { mode: 'closed', fill: 0.52 } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(138), Y(146));
      ctx.lineTo(X(138), Y(192));
      ctx.bezierCurveTo(X(138), Y(216), X(116), Y(228), X(114), Y(252));
      ctx.lineTo(X(114), Y(344));
      ctx.quadraticCurveTo(X(114), Y(364), X(136), Y(364));
      ctx.lineTo(X(164), Y(364));
      ctx.quadraticCurveTo(X(186), Y(364), X(186), Y(344));
      ctx.lineTo(X(186), Y(252));
      ctx.bezierCurveTo(X(184), Y(228), X(162), Y(216), X(162), Y(192));
      ctx.lineTo(X(162), Y(146));
      ctx.closePath();
    }, IB(114, 146, 186, 364));
    blit(ctx, 'ketchup', c, ketchupSVG);
  }

  // ══ MAPLE SYRUP — glass jug with loop handle + leaf label ══════════════════
  function mapleSVG(c) {
    const p = P(c);
    return `<path d="M 136 168 L 136 202 L 112 216 Q 106 222 106 238 L 106 346 Q 106 370 130 370 L 170 370 Q 194 370 194 346 L 194 238 Q 194 222 188 216 L 164 202 L 164 168 Z" fill="rgba(255,250,238,0.15)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 166 178 C 192 172 202 198 180 210" fill="none" stroke="${p.deep}" stroke-width="9"/>
<path d="M 168 181 C 188 177 196 196 178 206" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="3"/>
<rect x="131" y="140" width="38" height="32" rx="6" fill="${p.deep}" stroke="${p.line}" stroke-width="2"/>
<path d="M 140 144 L 140 168 M 150 144 L 150 168 M 160 144 L 160 168" stroke="${shade(c, -0.25)}" stroke-width="1.6"/>
<rect x="118" y="248" width="64" height="84" rx="10" fill="#f6efdd" stroke="#d6c9a8" stroke-width="2"/>
<g transform="translate(150 284)" fill="${p.c}" stroke="${p.deep}" stroke-width="1">
<path d="M 0 -22 L 4 -13 L 13 -17 L 10 -7 L 19 -5 L 12 2 L 17 10 L 7 8 L 8 17 L 0 10 L -8 17 L -7 8 L -17 10 L -12 2 L -19 -5 L -10 -7 L -13 -17 L -4 -13 Z"/>
<path d="M 0 10 L 0 20" fill="none" stroke-width="2.5"/></g>
<path d="M 126 316 L 174 316" stroke="#b9ad92" stroke-width="2"/>
${gloss('M 118 236 C 112 280 114 330 122 352', 5, 0.3)}
${gloss('M 141 176 L 141 198', 3.5, 0.5)}`;
  }
  function drawMaple(ctx, opts) {
    const c = opts.color || '#ff7a00';
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.46 } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(140), Y(174));
      ctx.lineTo(X(140), Y(204));
      ctx.lineTo(X(116), Y(220));
      ctx.quadraticCurveTo(X(110), Y(226), X(110), Y(240));
      ctx.lineTo(X(110), Y(344));
      ctx.quadraticCurveTo(X(110), Y(366), X(132), Y(366));
      ctx.lineTo(X(168), Y(366));
      ctx.quadraticCurveTo(X(190), Y(366), X(190), Y(344));
      ctx.lineTo(X(190), Y(240));
      ctx.quadraticCurveTo(X(190), Y(226), X(184), Y(220));
      ctx.lineTo(X(160), Y(204));
      ctx.lineTo(X(160), Y(174));
      ctx.closePath();
    }, IB(110, 174, 190, 366));
    blit(ctx, 'maple', c, mapleSVG);
  }

  // ══ HONEY BEAR — bear-shaped squeeze bottle, honey inside ══════════════════
  function honeybearSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="150" y1="160" x2="150" y2="244" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.c}"/></linearGradient></defs>
<circle cx="119" cy="172" r="13" fill="${p.c}" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="181" cy="172" r="13" fill="${p.c}" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="119" cy="172" r="6" fill="${p.lo}"/>
<circle cx="181" cy="172" r="6" fill="${p.lo}"/>
<rect x="141" y="132" width="18" height="14" rx="3" fill="#d84a5e" stroke="#8f1626" stroke-width="2"/>
<rect x="135" y="142" width="30" height="14" rx="4" fill="#e33a4e" stroke="#8f1626" stroke-width="2"/>
<circle cx="150" cy="202" r="38" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="219" rx="15" ry="11" fill="${shade(c, 0.32)}" stroke="${p.line}" stroke-width="1.5"/>
<ellipse cx="150" cy="213" rx="6" ry="4.5" fill="${p.deep}"/>
<path d="M 150 218 L 150 223 M 145 226 Q 150 230 155 226" fill="none" stroke="${p.deep}" stroke-width="2"/>
${eye(134, 197, 6)}
${eye(166, 197, 6)}
<path d="M 150 238 C 116 238 100 268 100 312 C 100 352 118 372 150 372 C 182 372 200 352 200 312 C 200 268 184 238 150 238 Z" fill="rgba(255,255,255,0.15)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 106 262 C 94 274 92 294 102 306 C 108 312 116 310 116 302 C 110 292 110 276 116 266 Z" fill="rgba(255,255,255,0.16)" stroke="${p.line}" stroke-width="2"/>
<path d="M 194 262 C 206 274 208 294 198 306 C 192 312 184 310 184 302 C 190 292 190 276 184 266 Z" fill="rgba(255,255,255,0.16)" stroke="${p.line}" stroke-width="2"/>
<path d="M 122 372 C 124 360 138 360 140 372 M 160 372 C 162 360 176 360 178 372" fill="none" stroke="${p.line}" stroke-width="2.5" opacity="0.65"/>
${gloss('M 116 280 C 112 306 114 336 122 354', 5, 0.28)}`;
  }
  function drawHoneybear(ctx, opts) {
    const c = opts.color || '#ffc233';
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.52 } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(150), Y(243));
      ctx.bezierCurveTo(X(120), Y(243), X(105), Y(270), X(105), Y(312));
      ctx.bezierCurveTo(X(105), Y(349), X(121), Y(367), X(150), Y(367));
      ctx.bezierCurveTo(X(179), Y(367), X(195), Y(349), X(195), Y(312));
      ctx.bezierCurveTo(X(195), Y(270), X(180), Y(243), X(150), Y(243));
      ctx.closePath();
    }, IB(105, 243, 195, 367));
    blit(ctx, 'honeybear', c, honeybearSVG);
  }

  // ══ BABY BOTTLE — graduated glass, milk, nipple ════════════════════════════
  function babybottleSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="108" y1="176" x2="192" y2="210" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient></defs>
<rect x="114" y="206" width="72" height="164" rx="16" fill="rgba(228,242,252,0.26)" stroke="#8fb6c8" stroke-width="2.5"/>
<path d="M 168 244 L 180 244 M 164 268 L 180 268 M 168 292 L 180 292 M 164 316 L 180 316 M 168 340 L 180 340" stroke="rgba(20,70,100,0.4)" stroke-width="2"/>
<path d="M 144 156 C 144 136 146 124 150 124 C 154 124 156 136 156 156 Z" fill="#f2bcd0" stroke="#c88aa4" stroke-width="2"/>
<path d="M 128 178 C 128 158 138 146 150 146 C 162 146 172 158 172 178 Z" fill="#f6c8d8" stroke="#c88aa4" stroke-width="2.5"/>
<rect x="108" y="176" width="84" height="34" rx="10" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 118 180 L 118 206 M 130 180 L 130 206 M 142 180 L 142 206 M 154 180 L 154 206 M 166 180 L 166 206 M 178 180 L 178 206" stroke="${p.deep}" stroke-width="1.5" opacity="0.4"/>
${gloss('M 124 222 C 120 262 122 322 128 352', 5, 0.35)}
${gloss('M 138 156 C 140 148 144 142 148 140', 3, 0.6)}`;
  }
  function drawBabybottle(ctx, opts) {
    const c = opts.color || '#5fcfe6';
    paintLiquid(ctx, Object.assign({}, opts, { color: '#f7f2e2', liquid: { mode: 'closed', fill: 0.5 } }), () => {
      ctx.beginPath();
      ctx.roundRect(X(118), Y(210), (186 - 118) * SCALE + 2.96, (366 - 210) * SCALE, 10);
    }, IB(118, 210, 186, 366));
    blit(ctx, 'babybottle', c, babybottleSVG);
  }

  // ══ FIRE EXTINGUISHER — tank, gauge, hose, lever ═══════════════════════════
  function extinguisherSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="114" y1="200" x2="186" y2="260" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient></defs>
<path d="M 168 168 C 200 180 206 240 198 292 C 195 312 186 320 178 318" fill="none" stroke="#1b1e22" stroke-width="10"/>
<g transform="rotate(16 176 318)"><rect x="169" y="304" width="15" height="30" rx="4" fill="#31363c" stroke="#14171a" stroke-width="1.5"/></g>
<rect x="114" y="192" width="72" height="176" rx="18" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="120" y="360" width="60" height="14" rx="6" fill="${p.deep}" stroke="${p.line}" stroke-width="2"/>
<rect x="140" y="170" width="20" height="26" fill="#3a3f46" stroke="#22262b" stroke-width="1.5"/>
<rect x="130" y="150" width="40" height="24" rx="6" fill="#22262b" stroke="#0f1114" stroke-width="2"/>
<path d="M 132 150 L 176 130" stroke="#2c3138" stroke-width="9"/>
<path d="M 130 162 C 112 156 102 146 104 136 L 112 132 C 116 142 128 150 138 154 Z" fill="#2c3138" stroke="#14171a" stroke-width="1.5"/>
<circle cx="172" cy="141" r="7" fill="none" stroke="#c9cfd6" stroke-width="3"/>
<circle cx="150" cy="212" r="13" fill="#f4f6f8" stroke="#22262b" stroke-width="3"/>
<path d="M 150 212 L 157 204" stroke="#d23b2f" stroke-width="2.5"/>
<circle cx="150" cy="212" r="2" fill="#22262b"/>
<rect x="126" y="248" width="48" height="84" rx="8" fill="#f7f4ec" stroke="#d8d2c2" stroke-width="2"/>
<rect x="126" y="248" width="48" height="18" rx="8" fill="${p.c}" opacity="0.9"/>
<path d="M 150 284 C 144 292 144 300 150 304 C 156 300 156 292 150 284 Z" fill="#e3263c"/>
<path d="M 134 314 L 166 314 M 134 322 L 166 322" stroke="#b9b2a2" stroke-width="2"/>
${gloss('M 126 210 C 122 254 122 318 128 350', 6, 0.28)}`;
  }
  function drawExtinguisher(ctx, opts) {
    blit(ctx, 'extinguisher', opts.color || '#e3263c', extinguisherSVG);
  }

  // ══ SOAP PUMP — translucent bottle, bubbles, pump head ═════════════════════
  function soapSVG(c) {
    const p = P(c);
    return `<path d="M 166 124 L 188 124 Q 194 124 194 132 L 194 140 L 186 140 L 186 133 L 166 133 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="2"/>
<rect x="136" y="118" width="32" height="30" rx="6" fill="${p.deep}" stroke="${p.line}" stroke-width="2"/>
<rect x="144" y="146" width="12" height="34" fill="#c8ccd4" stroke="#8b939e" stroke-width="2"/>
<rect x="134" y="178" width="32" height="24" rx="5" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 118 216 C 126 204 174 204 182 216 L 188 244 L 188 344 Q 188 368 164 368 L 136 368 Q 112 368 112 344 L 112 244 Z" fill="rgba(230,245,255,0.22)" stroke="#8fb0c4" stroke-width="2.5"/>
<circle cx="134" cy="234" r="6" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.8"/>
<circle cx="148" cy="226" r="4" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.6"/>
<circle cx="161" cy="233" r="5" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.8"/>
<rect x="128" y="262" width="44" height="62" rx="12" fill="rgba(255,255,255,0.85)" stroke="#d9d4c8" stroke-width="2"/>
<circle cx="141" cy="286" r="7" fill="none" stroke="${p.c}" stroke-width="2.5"/>
<circle cx="157" cy="280" r="5" fill="none" stroke="${p.c}" stroke-width="2.2"/>
<circle cx="154" cy="298" r="4" fill="none" stroke="${p.c}" stroke-width="2"/>
${gloss('M 122 236 C 118 276 120 330 126 352', 5, 0.32)}`;
  }
  function drawSoap(ctx, opts) {
    const c = opts.color || '#1f9bff';
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.5 } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(122), Y(220));
      ctx.bezierCurveTo(X(130), Y(210), X(170), Y(210), X(178), Y(220));
      ctx.lineTo(X(184), Y(246));
      ctx.lineTo(X(184), Y(344));
      ctx.quadraticCurveTo(X(184), Y(364), X(162), Y(364));
      ctx.lineTo(X(138), Y(364));
      ctx.quadraticCurveTo(X(116), Y(364), X(116), Y(344));
      ctx.lineTo(X(116), Y(246));
      ctx.closePath();
    }, IB(116, 212, 184, 364));
    blit(ctx, 'soap', c, soapSVG);
  }

  // ══ HOURGLASS — turned wood frame, glass bulbs, physics sand ═══════════════
  function hourglassSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="100" y1="126" x2="200" y2="150" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient></defs>
<rect x="103" y="148" width="10" height="204" rx="5" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<rect x="187" y="148" width="10" height="204" rx="5" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<ellipse cx="108" cy="176" rx="7" ry="9" fill="${p.c}" stroke="${p.line}" stroke-width="1.5"/>
<ellipse cx="192" cy="176" rx="7" ry="9" fill="${p.c}" stroke="${p.line}" stroke-width="1.5"/>
<ellipse cx="108" cy="324" rx="7" ry="9" fill="${p.c}" stroke="${p.line}" stroke-width="1.5"/>
<ellipse cx="192" cy="324" rx="7" ry="9" fill="${p.c}" stroke="${p.line}" stroke-width="1.5"/>
<path d="M 116 152 C 116 208 146 228 146 250 C 146 272 116 292 116 350 L 184 350 C 184 292 154 272 154 250 C 154 228 184 208 184 152 Z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="2.5"/>
<rect x="100" y="126" width="100" height="24" rx="9" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="100" y="350" width="100" height="24" rx="9" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="108" y="370" width="84" height="6" rx="3" fill="${p.deep}"/>
${gloss('M 124 162 C 124 192 138 214 144 228', 3.5, 0.5)}
${gloss('M 124 340 C 124 316 136 300 143 288', 3.5, 0.4)}`;
  }
  // Physics-driven sand behind the glass (piles settle toward WORLD-down).
  const SAND = '#d4b06a', SAND_LO = '#a8843e', SAND_HI = '#e8d49a';
  function paintSand(ctx, opts) {
    const bottom = Math.max(0, Math.min(1, opts.sandBottom == null ? 0.18 : opts.sandBottom));
    const top = 1 - bottom;
    const flow = opts.sandFlow || 0;
    const angle = opts.angle || 0;
    const upright = Math.cos(angle) >= 0;
    const tilt = Math.max(-0.5, Math.min(0.5, (opts.slosh || 0) * 1.3));

    ctx.save();
    // Clip: glass interior, inset ~4 from the sprite's bulb outline.
    ctx.beginPath();
    ctx.moveTo(X(120), Y(156));
    ctx.bezierCurveTo(X(120), Y(210), X(147), Y(229), X(147), Y(250));
    ctx.bezierCurveTo(X(147), Y(271), X(120), Y(291), X(120), Y(346));
    ctx.lineTo(X(180), Y(346));
    ctx.bezierCurveTo(X(180), Y(291), X(153), Y(271), X(153), Y(250));
    ctx.bezierCurveTo(X(153), Y(229), X(180), Y(210), X(180), Y(156));
    ctx.closePath();
    ctx.clip();

    const floorB = Y(346), neckB = Y(262), floorT = Y(156), neckT = Y(238);
    function mound(amt, floorY, towardY, halfW) {
      if (amt < 0.01) return;
      const dir = towardY < floorY ? -1 : 1;
      const h = (5 + amt * 32) * dir;
      let surface = floorY + h;
      surface = dir < 0 ? Math.max(towardY, surface) : Math.min(towardY, surface);
      const halfTop = Math.max(5, halfW * (0.3 + amt * 0.4));
      ctx.fillStyle = SAND;
      ctx.beginPath();
      ctx.moveTo(-halfW, floorY);
      ctx.lineTo(-halfTop + tilt * 9, surface);
      ctx.lineTo(halfTop + tilt * 9, surface + tilt * 5);
      ctx.lineTo(halfW, floorY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = SAND_HI;
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(-halfTop + tilt * 9, surface);
      ctx.lineTo(halfTop + tilt * 9, surface + tilt * 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = SAND_LO;
      const span = Math.abs(surface - floorY);
      for (let i = 0; i < 5; i++) {
        const t = 0.18 + (i % 4) * 0.2;
        const gx = (-halfW + halfW * 2 * ((i * 0.41) % 1)) * 0.65 + tilt * 4;
        const gy = floorY + dir * span * t;
        ctx.beginPath(); ctx.arc(gx, gy, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Bottom bulb (local +Y): floor is outer edge when upright, neck when inverted.
    if (upright) mound(bottom, floorB, neckB, 21);
    else mound(bottom, neckB, floorB, 8);
    // Top bulb (local −Y): rests on the neck when upright, outer tip when inverted.
    if (upright) mound(top, neckT, floorT, 8);
    else mound(top, floorT, neckT, 21);

    // Neck stream
    if (Math.abs(flow) > 0.05) {
      ctx.strokeStyle = SAND;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.globalAlpha = Math.min(1, Math.abs(flow) * 1.2);
      ctx.beginPath();
      if (flow > 0) { ctx.moveTo(tilt * 3, neckT); ctx.lineTo(tilt * 2, floorB - 6); }
      else { ctx.moveTo(tilt * 3, neckB); ctx.lineTo(tilt * 2, floorT + 6); }
      ctx.stroke();
      ctx.fillStyle = SAND_LO;
      const t = Math.abs(angle) * 7 + bottom * 20;
      for (let i = 0; i < 4; i++) {
        const gy = flow > 0
          ? (neckT + 6 + ((t * 30 + i * 9) % 46))
          : (neckB - 6 - ((t * 30 + i * 9) % 46));
        ctx.beginPath();
        ctx.arc(tilt * 3 + (i % 2 ? 2 : -2), gy, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function drawHourglass(ctx, opts) {
    paintSand(ctx, opts);
    blit(ctx, 'hourglass', opts.color || '#8a3ffc', hourglassSVG);
  }

  // ══ BOWLING PIN — ivory body, tinted neck stripes, glossy ══════════════════
  function bowlingpinSVG(c) {
    const body = mix(c, '#f8f4ea', 0.88);
    const bLine = '#6d6357';
    return `<defs><linearGradient id="g1" x1="116" y1="240" x2="188" y2="260" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${shade(body, 0.1)}"/><stop offset="0.55" stop-color="${body}"/><stop offset="1" stop-color="${shade(body, -0.16)}"/></linearGradient></defs>
<path d="M 150 130 C 168 130 178 144 178 160 C 178 178 168 188 164 204 C 160 220 168 240 176 262 C 186 288 190 320 184 344 C 180 362 168 372 150 372 C 132 372 120 362 116 344 C 110 320 114 288 124 262 C 132 240 140 220 136 204 C 132 188 122 178 122 160 C 122 144 132 130 150 130 Z" fill="url(#g1)" stroke="${bLine}" stroke-width="2.5"/>
<path d="M 129 196 C 141 204 159 204 171 196 L 172 210 C 159 218 141 218 128 210 Z" fill="${c}" stroke="${shade(c, -0.35)}" stroke-width="1.2"/>
<path d="M 127 222 C 140 230 160 230 173 222 L 175 236 C 160 244 140 244 125 236 Z" fill="${c}" stroke="${shade(c, -0.35)}" stroke-width="1.2"/>
<circle cx="150" cy="150" r="4.5" fill="${c}" opacity="0.85"/>
${gloss('M 134 150 C 128 168 130 188 134 200', 5.5, 0.55)}
${gloss('M 128 276 C 122 308 124 338 131 356', 7, 0.4)}`;
  }
  function drawBowlingpin(ctx, opts) {
    blit(ctx, 'bowlingpin', opts.color || '#e3263c', bowlingpinSVG);
  }

  // ══ TRAFFIC CONE — reflective bands, square base ═══════════════════════════
  function coneSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="110" y1="240" x2="196" y2="250" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient>
<linearGradient id="g2" x1="130" y1="220" x2="176" y2="226" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#dfe7ee"/><stop offset="1" stop-color="#b9c6d2"/></linearGradient></defs>
<rect x="84" y="350" width="132" height="26" rx="10" fill="${p.deep}" stroke="${p.line}" stroke-width="2.5"/>
<rect x="92" y="344" width="116" height="14" rx="7" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 142 142 C 142 133 158 133 158 142 L 172 240 L 194 348 L 106 348 L 128 240 Z" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="140" rx="8" ry="4.5" fill="${p.deep}"/>
<path d="M 133 208 L 167 208 L 171 238 L 129 238 Z" fill="url(#g2)" stroke="#aab8c4" stroke-width="1.5"/>
<path d="M 126 262 L 174 262 L 180 302 L 120 302 Z" fill="url(#g2)" stroke="#aab8c4" stroke-width="1.5"/>
<path d="M 135 214 L 168 214 M 128 270 L 175 270" stroke="#ffffff" stroke-width="3" opacity="0.8"/>
${gloss('M 141 158 C 136 200 128 280 122 330', 4, 0.3)}`;
  }
  function drawCone(ctx, opts) {
    blit(ctx, 'cone', opts.color || '#ff7a00', coneSVG);
  }

  // ══ LAB FLASK — Erlenmeyer, graduations, open pour ═════════════════════════
  function flaskSVG(c) {
    return `<path d="M 138 142 L 138 216 L 100 352 Q 96 366 112 366 L 188 366 Q 204 366 200 352 L 162 216 L 162 142 Z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="2.5"/>
<rect x="130" y="128" width="40" height="16" rx="7" fill="rgba(216,238,250,0.45)" stroke="${GLASS_EDGE}" stroke-width="2.5"/>
<path d="M 158 288 L 172 288 M 162 308 L 178 308 M 166 328 L 184 328 M 170 348 L 190 348" stroke="rgba(25,80,105,0.45)" stroke-width="2"/>
<circle cx="138" cy="266" r="4" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.6"/>
<circle cx="150" cy="252" r="3" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.4"/>
${gloss('M 134 158 L 134 210', 4, 0.55)}
${gloss('M 122 262 C 116 296 110 330 108 350', 4.5, 0.4)}`;
  }
  function drawFlask(ctx, opts) {
    const c = opts.color || '#8ed11a';
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'open', fill: 0.4 } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(142), Y(150));
      ctx.lineTo(X(142), Y(218));
      ctx.lineTo(X(106), Y(348));
      ctx.quadraticCurveTo(X(103), Y(361), X(115), Y(361));
      ctx.lineTo(X(185), Y(361));
      ctx.quadraticCurveTo(X(197), Y(361), X(194), Y(348));
      ctx.lineTo(X(158), Y(218));
      ctx.lineTo(X(158), Y(150));
      ctx.closePath();
    }, IB(106, 150, 194, 361), -140);
    blit(ctx, 'flask', c, flaskSVG);
  }

  // ══ ARTILLERY SHELL — brass casing, tinted warhead ═════════════════════════
  function shellSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="120" y1="290" x2="180" y2="300" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#e5c67e"/><stop offset="0.5" stop-color="#c9a45c"/><stop offset="1" stop-color="#8f6f34"/></linearGradient>
<linearGradient id="g2" x1="120" y1="170" x2="180" y2="180" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient></defs>
<path d="M 120 226 C 120 172 136 142 150 132 C 164 142 180 172 180 226 Z" fill="url(#g2)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="118" y="220" width="64" height="12" rx="3" fill="${p.deep}" stroke="${p.line}" stroke-width="2"/>
<rect x="120" y="230" width="60" height="136" rx="6" fill="url(#g1)" stroke="#6b521f" stroke-width="2.5"/>
<rect x="120" y="322" width="60" height="9" fill="#8f6f34"/>
<rect x="120" y="338" width="60" height="6" fill="#8f6f34"/>
<rect x="114" y="360" width="72" height="14" rx="5" fill="#7c5f28" stroke="#57431a" stroke-width="2"/>
<path d="M 132 262 L 168 262" stroke="#fdf8ec" stroke-width="2.5" opacity="0.9"/>
<path d="M 138 276 L 138 288 M 150 276 L 150 288 M 162 276 L 162 288" stroke="#fdf8ec" stroke-width="2.5" opacity="0.85"/>
${gloss('M 132 240 C 128 276 128 320 132 350', 5, 0.4)}
${gloss('M 138 168 C 134 188 132 208 132 222', 4, 0.35)}`;
  }
  function drawShell(ctx, opts) {
    blit(ctx, 'shell', opts.color || '#c8203a', shellSVG);
  }

  // ══ CHESS PAWN — glossy turned piece ═══════════════════════════════════════
  function pawnSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="118" y1="170" x2="186" y2="220" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient></defs>
<circle cx="150" cy="196" r="40" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="124" y="232" width="52" height="20" rx="8" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 134 252 C 130 292 124 320 120 340 L 180 340 C 176 320 170 292 166 252 Z" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="116" y="336" width="68" height="20" rx="8" fill="${p.c}" stroke="${p.line}" stroke-width="2.5"/>
<rect x="106" y="352" width="88" height="22" rx="10" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="136" cy="182" r="9" fill="#ffffff" opacity="0.5"/>
${gloss('M 134 262 C 131 292 127 318 124 334', 5, 0.35)}
${gloss('M 116 360 L 184 360', 3, 0.25)}`;
  }
  function drawPawn(ctx, opts) {
    blit(ctx, 'pawn', opts.color || '#4f63e0', pawnSVG);
  }

  // ══ BUOY — flotation ring, banded body, lamp mast, cute face ═══════════════
  function buoySVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="120" y1="250" x2="182" y2="260" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient></defs>
<rect x="146" y="156" width="8" height="36" fill="#3a3f46" stroke="#22262b" stroke-width="1.5"/>
<circle cx="150" cy="142" r="14" fill="#ffd23f" stroke="#c8901a" stroke-width="2.5"/>
<circle cx="146" cy="138" r="4" fill="#fff3c0" opacity="0.9"/>
<path d="M 140 132 C 145 126 155 126 160 132 M 136 142 L 164 142" fill="none" stroke="#3a3f46" stroke-width="2"/>
<circle cx="150" cy="124" r="4.5" fill="#3a3f46"/>
<path d="M 122 344 C 118 300 126 250 134 214 C 138 196 142 186 150 186 C 158 186 162 196 166 214 C 174 250 182 300 178 344 Z" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 128 246 L 172 246 L 175 280 L 125 280 Z" fill="#f4f7fa" stroke="#d3dbe2" stroke-width="1.5"/>
${eye(140, 260, 6)}
${eye(160, 260, 6)}
<path d="M 142 271 Q 150 277 158 271" fill="none" stroke="${INK}" stroke-width="2.5"/>
<ellipse cx="150" cy="352" rx="62" ry="22" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="344" rx="52" ry="15" fill="${p.c}" stroke="${p.line}" stroke-width="2"/>
<circle cx="118" cy="350" r="2.5" fill="${p.deep}"/><circle cx="150" cy="356" r="2.5" fill="${p.deep}"/><circle cx="182" cy="350" r="2.5" fill="${p.deep}"/>
${gloss('M 133 226 C 128 260 126 300 128 330', 5, 0.3)}`;
  }
  function drawBuoy(ctx, opts) {
    blit(ctx, 'buoy', opts.color || '#ff7a00', buoySVG);
  }

  // ══ WINE GLASS — bowl, stem, foot, open pour ═══════════════════════════════
  function wineglassSVG() {
    return `<path d="M 106 148 L 110 210 C 114 258 186 258 190 210 L 194 148 Z" fill="${GLASS}" stroke="${GLASS_EDGE}" stroke-width="2.5"/>
<ellipse cx="150" cy="148" rx="44" ry="7" fill="none" stroke="${GLASS_EDGE}" stroke-width="2" opacity="0.85"/>
<path d="M 147 252 L 145 344 L 155 344 L 153 252 Z" fill="rgba(216,238,250,0.5)" stroke="${GLASS_EDGE}" stroke-width="2"/>
<ellipse cx="150" cy="356" rx="42" ry="12" fill="rgba(216,238,250,0.4)" stroke="${GLASS_EDGE}" stroke-width="2.5"/>
<path d="M 112 362 A 42 12 0 0 0 188 362" fill="none" stroke="${GLASS_EDGE}" stroke-width="1.5" opacity="0.6"/>
${gloss('M 116 160 C 114 192 120 222 132 240', 4, 0.55)}
${spark(178, 166, 5, '#ffffff', 0.8)}`;
  }
  function drawWineglass(ctx, opts) {
    const c = opts.color || '#c8203a';
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'open', fill: 0.35 } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(111), Y(154));
      ctx.lineTo(X(114), Y(210));
      ctx.bezierCurveTo(X(118), Y(252), X(182), Y(252), X(186), Y(210));
      ctx.lineTo(X(189), Y(154));
      ctx.closePath();
    }, IB(111, 154, 189, 252), -128);
    blit(ctx, 'wineglass', c, wineglassSVG);
  }

  // ══ TOUCAN — side-profile, huge banana bill (macaw's cousin) ═══════════════
  function toucanSVG(c) {
    const body = mix(c, '#17141c', 0.72);
    const bHi = shade(body, 0.16), bLo = shade(body, -0.3), bLine = shade(body, -0.5);
    const bib = '#f7f1dc';
    const billHi = shade(c, 0.28), billLo = shade(c, -0.2), billLine = shade(c, -0.48);
    return `<defs><linearGradient id="g1" x1="120" y1="170" x2="190" y2="330" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${bHi}"/><stop offset="0.5" stop-color="${body}"/><stop offset="1" stop-color="${bLo}"/></linearGradient>
<linearGradient id="g2" x1="210" y1="126" x2="270" y2="200" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${billHi}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
<path d="M 128 320 C 112 342 100 360 96 376 L 118 372 C 128 356 137 340 141 324 Z" fill="${bLo}" stroke="${bLine}" stroke-width="2"/>
<path d="M 132 324 C 124 344 116 360 112 372" fill="none" stroke="${bHi}" stroke-width="1.8" opacity="0.5"/>
<path d="M 138 332 L 136 362" fill="none" stroke="#7c92a8" stroke-width="7"/>
<path d="M 136 362 L 120 372 M 136 362 L 135 374 M 136 362 L 150 372" fill="none" stroke="#7c92a8" stroke-width="5"/>
<path d="M 150 168 C 118 176 102 210 104 252 C 106 296 122 330 152 336 C 180 340 198 316 200 280 C 202 244 194 204 178 184 C 170 174 160 168 150 168 Z" fill="url(#g1)" stroke="${bLine}" stroke-width="2"/>
<path d="M 142 220 C 128 246 128 282 140 308 C 150 320 164 320 170 308 C 174 292 170 264 162 238 Z" fill="${bLo}" stroke="${bLine}" stroke-width="1.5" opacity="0.9"/>
<path d="M 138 244 C 148 250 158 252 166 250 M 136 268 C 146 274 158 276 166 274 M 138 292 C 148 298 158 298 166 296" fill="none" stroke="${bHi}" stroke-width="1.8" opacity="0.5"/>
<path d="M 176 190 C 190 212 196 244 194 272 C 182 282 166 280 158 268 C 162 242 166 214 170 196 Z" fill="${bib}" stroke="#d9d2ba" stroke-width="1.5"/>
<circle cx="172" cy="152" r="34" fill="url(#g1)" stroke="${bLine}" stroke-width="2"/>
<path d="M 144 136 A 34 34 0 0 1 200 140" fill="none" stroke="${bLine}" stroke-width="1.5"/>
<path d="M 196 132 C 232 120 268 126 284 146 C 293 158 291 176 281 187 C 263 203 233 201 211 189 L 205 183 C 209 165 205 146 196 132 Z" fill="url(#g2)" stroke="${billLine}" stroke-width="2"/>
<path d="M 205 185 C 221 195 245 199 263 193 C 255 203 235 209 217 203 C 209 199 205 193 205 185 Z" fill="${billLo}" stroke="${billLine}" stroke-width="1.5"/>
<path d="M 207 183 C 229 195 255 197 275 187" fill="none" stroke="${billLine}" stroke-width="2"/>
<path d="M 272 146 C 284 152 290 168 282 184 C 276 188 270 184 272 176 C 274 166 272 154 268 148 Z" fill="#26222b"/>
<path d="M 198 132 C 232 122 264 128 280 146" fill="none" stroke="#ffd23f" stroke-width="4" opacity="0.9"/>
<ellipse cx="206" cy="142" rx="3" ry="2.2" fill="${billLine}" transform="rotate(18 206 142)"/>
<circle cx="178" cy="150" r="12.5" fill="#69c6dd"/>
${eye(178, 150, 8.5)}
<path d="M 168 332 L 166 362" fill="none" stroke="#8fa6bc" stroke-width="9"/>
<path d="M 166 362 L 146 374 M 166 362 L 164 376 M 166 362 L 184 373" fill="none" stroke="#8fa6bc" stroke-width="6"/>
<path d="M 146 374 L 141 377 M 164 376 L 163 380 M 184 373 L 188 377" fill="none" stroke="#4a5665" stroke-width="3"/>
${gloss('M 128 200 C 118 234 116 274 122 304', 4, 0.2)}`;
  }
  function drawToucan(ctx, opts) {
    blit(ctx, 'toucan', opts.color || '#e3263c', toucanSVG);
  }

  // ══ WHIPPED CREAM — steel can, tinted label, fluted nozzle ═════════════════
  function whippedcreamSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="116" y1="280" x2="184" y2="290" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#f4f6f8"/><stop offset="0.5" stop-color="#dbe0e6"/><stop offset="1" stop-color="#aab2bc"/></linearGradient>
<linearGradient id="g2" x1="116" y1="280" x2="184" y2="290" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient></defs>
<path d="M 140 158 L 160 158 L 167 132 L 157 139 L 150 127 L 143 139 L 133 132 Z" fill="#e8ebef" stroke="#9aa2ac" stroke-width="2"/>
<rect x="142" y="156" width="16" height="44" rx="3" fill="#dde1e6" stroke="#9aa2ac" stroke-width="2"/>
<path d="M 116 210 Q 150 190 184 210 L 184 216 L 116 216 Z" fill="#c9ced6" stroke="#8b939e" stroke-width="2"/>
<rect x="114" y="212" width="72" height="158" rx="10" fill="url(#g1)" stroke="#8b939e" stroke-width="2.5"/>
<rect x="114" y="244" width="72" height="94" fill="url(#g2)" stroke="${p.deep}" stroke-width="1.5"/>
<path d="M 130 306 L 170 306 L 164 318 L 136 318 Z" fill="#ffffff" stroke="#e3e6ea" stroke-width="1.2"/>
<path d="M 128 306 C 126 296 132 292 138 294 C 134 284 142 278 149 282 C 147 272 156 268 161 274 C 168 270 174 278 169 285 C 177 288 175 298 168 300 C 172 304 168 308 162 306 Z" fill="#ffffff" stroke="#e3e6ea" stroke-width="1.5"/>
<path d="M 150 270 C 148 264 152 258 156 262" fill="none" stroke="#ffffff" stroke-width="3"/>
<rect x="118" y="356" width="64" height="14" rx="6" fill="#aab2bc" stroke="#7c848e" stroke-width="2"/>
${gloss('M 126 224 C 122 268 122 322 128 352', 6, 0.5)}`;
  }
  function drawWhippedcream(ctx, opts) {
    blit(ctx, 'whippedcream', opts.color || '#ff5b86', whippedcreamSVG);
  }

  // ══ POTION — round-bulb flask, cork, sparkles ══════════════════════════════
  function potionSVG(c) {
    const p = P(c);
    const edge = mix(c, GLASS_EDGE, 0.55);
    return `<rect x="138" y="130" width="24" height="34" rx="5" fill="#c89a5e" stroke="#8f6b38" stroke-width="2"/>
<path d="M 142 136 L 142 158 M 150 134 L 150 160 M 158 136 L 158 158" stroke="#a87e44" stroke-width="1.5"/>
<rect x="132" y="158" width="36" height="16" rx="7" fill="rgba(220,235,255,0.4)" stroke="${edge}" stroke-width="2.5"/>
<path d="M 138 172 L 138 250 L 162 250 L 162 172 Z" fill="${GLASS}" stroke="${edge}" stroke-width="2.5"/>
<path d="M 138 246 C 110 254 96 288 104 320 C 110 350 128 366 150 366 C 172 366 190 350 196 320 C 204 288 190 254 162 246 Z" fill="${GLASS}" stroke="${edge}" stroke-width="2.5"/>
<path d="M 164 182 L 182 194 L 186 190" fill="none" stroke="#c9b28a" stroke-width="1.5"/>
<g transform="rotate(14 186 200)"><rect x="178" y="192" width="18" height="13" rx="2" fill="#f6efdd" stroke="#d6c9a8" stroke-width="1.5"/></g>
${spark(128, 286, 6, '#fff3c8', 0.95)}
${spark(170, 302, 8, '#ffffff', 0.9)}
${spark(146, 326, 5, '#fff3c8', 0.85)}
<circle cx="136" cy="300" r="3" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.5"/>
${gloss('M 118 286 C 112 308 116 334 128 350', 4.5, 0.45)}`;
  }
  function drawPotion(ctx, opts) {
    const c = opts.color || '#8a3ffc';
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.5 } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(142), Y(200));
      ctx.lineTo(X(142), Y(250));
      ctx.bezierCurveTo(X(116), Y(258), X(102), Y(290), X(109), Y(320));
      ctx.bezierCurveTo(X(114), Y(347), X(130), Y(361), X(150), Y(361));
      ctx.bezierCurveTo(X(170), Y(361), X(186), Y(347), X(191), Y(320));
      ctx.bezierCurveTo(X(198), Y(290), X(184), Y(258), X(158), Y(250));
      ctx.lineTo(X(158), Y(200));
      ctx.closePath();
    }, IB(109, 200, 191, 361));
    blit(ctx, 'potion', c, potionSVG);
  }

  // ══ HOT SAUCE — slim bottle, diamond label, foil band ══════════════════════
  function tabascoSVG(c) {
    const p = P(c);
    return `<rect x="136" y="126" width="28" height="36" rx="5" fill="${p.deep}" stroke="${p.line}" stroke-width="2"/>
<rect x="136" y="156" width="28" height="14" fill="#3fae1a" stroke="#2b7d10" stroke-width="1.5"/>
<path d="M 141 186 L 159 186 C 170 190 172 202 172 214 L 172 352 Q 172 368 156 368 L 144 368 Q 128 368 128 352 L 128 214 C 128 202 130 190 141 186 Z" fill="rgba(255,255,255,0.13)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="141" y="166" width="18" height="24" fill="rgba(255,255,255,0.2)" stroke="${p.line}" stroke-width="2"/>
<path d="M 150 238 L 177 282 L 150 326 L 123 282 Z" fill="#f7f3e8" stroke="${p.c}" stroke-width="3"/>
<path d="M 150 248 L 169 282 L 150 316 L 131 282 Z" fill="none" stroke="${p.deep}" stroke-width="1.2"/>
<path d="M 146 272 C 142 280 144 290 152 294 C 158 290 160 282 156 274 C 154 270 149 268 146 272 Z" fill="${p.c}"/>
<path d="M 148 270 C 147 266 150 264 152 266" fill="none" stroke="#3fae1a" stroke-width="2"/>
<path d="M 140 296 L 160 296" stroke="#b9ad92" stroke-width="1.6"/>
${gloss('M 134 216 C 132 258 132 322 137 354', 4, 0.35)}`;
  }
  function drawTabasco(ctx, opts) {
    const c = opts.color || '#e3263c';
    paintLiquid(ctx, Object.assign({}, opts, { color: shade(c, -0.1), liquid: { mode: 'closed', fill: 0.58 } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(143), Y(190));
      ctx.lineTo(X(157), Y(190));
      ctx.bezierCurveTo(X(166), Y(194), X(168), Y(204), X(168), Y(216));
      ctx.lineTo(X(168), Y(352));
      ctx.quadraticCurveTo(X(168), Y(364), X(154), Y(364));
      ctx.lineTo(X(146), Y(364));
      ctx.quadraticCurveTo(X(132), Y(364), X(132), Y(352));
      ctx.lineTo(X(132), Y(216));
      ctx.bezierCurveTo(X(132), Y(204), X(134), Y(194), X(143), Y(190));
      ctx.closePath();
    }, IB(132, 190, 168, 364));
    blit(ctx, 'tabasco', c, tabascoSVG);
  }

  // ══ COLA — contour glass bottle, crown cap, ribbon disc ════════════════════
  function cokeSVG(c) {
    const p = P(c);
    return `<path d="M 132 112 L 168 112 L 170 128 L 163 124 L 158 131 L 153 125 L 150 132 L 147 125 L 142 131 L 137 124 L 130 128 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="2"/>
<path d="M 138 128 L 138 168 C 128 184 118 198 116 218 C 114 238 124 248 126 262 C 128 276 118 288 116 306 C 114 330 122 352 134 366 L 166 366 C 178 352 186 330 184 306 C 182 288 172 276 174 262 C 176 248 186 238 184 218 C 182 198 172 184 162 168 L 162 128 Z" fill="rgba(212,238,228,0.2)" stroke="#6f9c8c" stroke-width="2.5"/>
<path d="M 130 190 C 124 220 130 246 131 264 C 132 284 124 300 124 320 M 170 190 C 176 220 170 246 169 264 C 168 284 176 300 176 320" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2.5"/>
<circle cx="150" cy="268" r="26" fill="${p.c}" stroke="${p.deep}" stroke-width="2.5"/>
<path d="M 128 264 C 140 256 160 278 172 270" fill="none" stroke="#ffffff" stroke-width="4.5"/>
${gloss('M 134 180 C 128 210 132 250 130 290', 4, 0.35)}
${gloss('M 143 134 L 143 162', 3.5, 0.5)}`;
  }
  function drawCoke(ctx, opts) {
    const c = opts.color || '#c8203a';
    paintLiquid(ctx, Object.assign({}, opts, { color: shade(c, -0.52), liquid: { mode: 'closed', fill: 0.55 } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(142), Y(136));
      ctx.lineTo(X(142), Y(170));
      ctx.bezierCurveTo(X(132), Y(186), X(122), Y(200), X(120), Y(218));
      ctx.bezierCurveTo(X(118), Y(238), X(128), Y(248), X(130), Y(262));
      ctx.bezierCurveTo(X(132), Y(276), X(122), Y(288), X(120), Y(306));
      ctx.bezierCurveTo(X(118), Y(328), X(126), Y(350), X(137), Y(362));
      ctx.lineTo(X(163), Y(362));
      ctx.bezierCurveTo(X(174), Y(350), X(182), Y(328), X(180), Y(306));
      ctx.bezierCurveTo(X(178), Y(288), X(168), Y(276), X(170), Y(262));
      ctx.bezierCurveTo(X(172), Y(248), X(182), Y(238), X(180), Y(218));
      ctx.bezierCurveTo(X(178), Y(200), X(168), Y(186), X(158), Y(170));
      ctx.lineTo(X(158), Y(136));
      ctx.closePath();
    }, IB(120, 136, 180, 362));
    blit(ctx, 'coke', c, cokeSVG);
  }

  // ══ TUMBLER — steel cup, big handle, lid + straw ═══════════════════════════
  function stanleySVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="112" y1="270" x2="188" y2="280" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.45" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient></defs>
<path d="M 160 92 C 160 80 174 78 178 86" fill="none" stroke="#f4f7fa" stroke-width="9"/>
<path d="M 160 92 L 158 164" fill="none" stroke="#f4f7fa" stroke-width="9"/>
<path d="M 160 94 L 158 162" fill="none" stroke="#c9d2da" stroke-width="2" opacity="0.7"/>
<path d="M 182 216 C 212 220 218 264 190 278" fill="none" stroke="${p.line}" stroke-width="13"/>
<path d="M 182 216 C 212 220 218 264 190 278" fill="none" stroke="${p.lo}" stroke-width="8"/>
<rect x="116" y="156" width="68" height="18" rx="7" fill="${p.deep}" stroke="${p.line}" stroke-width="2"/>
<rect x="108" y="168" width="84" height="30" rx="10" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 112 198 L 118 320 C 120 348 132 366 150 366 C 168 366 180 348 182 320 L 188 198 Z" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 116 262 L 184 262" stroke="${p.deep}" stroke-width="2" opacity="0.4"/>
<circle cx="150" cy="238" r="11" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.55"/>
${gloss('M 124 212 C 122 256 126 316 134 348', 6, 0.3)}`;
  }
  function drawStanley(ctx, opts) {
    blit(ctx, 'stanley', opts.color || '#1f9bff', stanleySVG);
  }

  // ══ LAVA LAMP — rocket glass, metal base, live lava ════════════════════════
  function lavalampSVG(c) {
    const edge = mix(c, GLASS_EDGE, 0.5);
    return `<defs><linearGradient id="g1" x1="134" y1="350" x2="166" y2="356" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#dbe0e6"/><stop offset="0.5" stop-color="#aab2bc"/><stop offset="1" stop-color="#7c848e"/></linearGradient></defs>
<path d="M 141 130 L 159 130 L 156 158 L 144 158 Z" fill="url(#g1)" stroke="#6b727c" stroke-width="2"/>
<path d="M 144 158 L 156 158 L 176 330 L 124 330 Z" fill="rgba(232,224,252,0.2)" stroke="${edge}" stroke-width="2.5"/>
<path d="M 122 330 L 178 330 L 163 374 L 137 374 Z" fill="url(#g1)" stroke="#6b727c" stroke-width="2.5"/>
<ellipse cx="150" cy="336" rx="24" ry="4.5" fill="#ffd23f" opacity="0.5"/>
${gloss('M 142 172 C 138 220 134 280 132 318', 4, 0.45)}`;
  }
  function drawLavalamp(ctx, opts) {
    const c = opts.color || '#ff5b86';
    paintLiquid(ctx, Object.assign({}, opts, { liquid: { mode: 'closed', fill: 0.62, lava: true } }), () => {
      ctx.beginPath();
      ctx.moveTo(X(147), Y(162));
      ctx.lineTo(X(153), Y(162));
      ctx.lineTo(X(172), Y(326));
      ctx.lineTo(X(128), Y(326));
      ctx.closePath();
    }, IB(128, 162, 172, 326));
    blit(ctx, 'lavalamp', c, lavalampSVG);
  }

  // ══ LAWN CHAIR — aluminum frame, woven webbing ═════════════════════════════
  function lawnchairSVG(c) {
    const web2 = mix(c, '#f4f2ea', 0.72);
    const alu = '#d4dae0', aluLine = '#707a84';
    return `<path d="M 112 254 L 112 162 Q 112 148 126 148 L 174 148 Q 188 148 188 162 L 188 254" fill="none" stroke="${aluLine}" stroke-width="12"/>
<path d="M 112 254 L 112 162 Q 112 148 126 148 L 174 148 Q 188 148 188 162 L 188 254" fill="none" stroke="${alu}" stroke-width="8"/>
<path d="M 117 158 L 183 158 L 183 174 Q 150 180 117 174 Z" fill="${c}" stroke="${shade(c, -0.35)}" stroke-width="1.2"/>
<path d="M 117 180 L 183 180 L 183 196 Q 150 202 117 196 Z" fill="${web2}" stroke="#c9c2b2" stroke-width="1.2"/>
<path d="M 117 202 L 183 202 L 183 218 Q 150 224 117 218 Z" fill="${c}" stroke="${shade(c, -0.35)}" stroke-width="1.2"/>
<path d="M 117 224 L 183 224 L 183 240 Q 150 246 117 240 Z" fill="${web2}" stroke="#c9c2b2" stroke-width="1.2"/>
<path d="M 136 152 L 136 246 L 150 246 L 150 152 Z" fill="${web2}" opacity="0.55"/>
<path d="M 158 152 L 158 246 L 172 246 L 172 152 Z" fill="${c}" opacity="0.5"/>
<path d="M 110 198 C 88 208 84 246 98 270 M 190 198 C 212 208 216 246 202 270" fill="none" stroke="#8a939d" stroke-width="9"/>
<path d="M 110 198 C 88 208 84 246 98 270 M 190 198 C 212 208 216 246 202 270" fill="none" stroke="#c6ccd3" stroke-width="4"/>
<path d="M 112 252 L 101 294 M 188 252 L 199 294" fill="none" stroke="${aluLine}" stroke-width="11"/>
<path d="M 112 252 L 101 294 M 188 252 L 199 294" fill="none" stroke="${alu}" stroke-width="7"/>
<path d="M 108 256 L 190 256 L 198 290 L 102 290 Z" fill="${c}" stroke="${shade(c, -0.35)}" stroke-width="1.5"/>
<path d="M 106 268 L 195 268" stroke="${web2}" stroke-width="9"/>
<path d="M 101 292 L 111 374 M 199 292 L 189 374" fill="none" stroke="${aluLine}" stroke-width="11"/>
<path d="M 101 292 L 111 374 M 199 292 L 189 374" fill="none" stroke="${alu}" stroke-width="7"/>
<path d="M 106 330 L 194 340 M 194 330 L 106 340" fill="none" stroke="#9aa4ae" stroke-width="4"/>
<rect x="103" y="368" width="16" height="10" rx="4" fill="#3a3f46"/>
<rect x="181" y="368" width="16" height="10" rx="4" fill="#3a3f46"/>`;
  }
  function drawLawnchair(ctx, opts) {
    blit(ctx, 'lawnchair', opts.color || '#3fae1a', lawnchairSVG);
  }

  // ══ OCTOPUS — mottled mantle, curling tentacles, big eyes ══════════════════
  function octopusSVG(c) {
    const p = P(c);
    return `<defs><linearGradient id="g1" x1="100" y1="160" x2="200" y2="280" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient></defs>
<path d="M 100 288 C 84 316 82 348 98 368 C 106 376 118 372 116 362 C 106 354 104 332 112 308 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 200 288 C 216 316 218 348 202 368 C 194 376 182 372 184 362 C 194 354 196 332 188 308 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 124 282 C 110 316 104 348 116 370 C 124 380 138 376 136 364 C 126 356 126 334 134 308 C 138 296 138 288 136 282 Z" fill="${p.c}" stroke="${p.line}" stroke-width="2"/>
<path d="M 176 282 C 190 316 196 348 184 370 C 176 380 162 376 164 364 C 174 356 174 334 166 308 C 162 296 162 288 164 282 Z" fill="${p.c}" stroke="${p.line}" stroke-width="2"/>
<path d="M 144 284 C 138 318 138 350 148 372 C 154 380 166 376 164 366 C 156 358 154 336 158 310 C 160 298 158 290 156 284 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<circle cx="130" cy="330" r="2.2" fill="${p.hi}"/><circle cx="128" cy="344" r="2" fill="${p.hi}"/>
<circle cx="152" cy="336" r="2.2" fill="${shade(c, 0.35)}"/><circle cx="152" cy="352" r="2" fill="${shade(c, 0.35)}"/>
<circle cx="170" cy="330" r="2.2" fill="${p.hi}"/><circle cx="172" cy="344" r="2" fill="${p.hi}"/>
<path d="M 150 148 C 108 148 88 184 90 224 C 91 252 104 274 126 286 L 174 286 C 196 274 209 252 210 224 C 212 184 192 148 150 148 Z" fill="url(#g1)" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="122" cy="178" r="5" fill="${p.hi}" opacity="0.6"/>
<circle cx="150" cy="164" r="4" fill="${p.hi}" opacity="0.6"/>
<circle cx="178" cy="182" r="6" fill="${p.hi}" opacity="0.6"/>
${eye(128, 216, 13)}
${eye(172, 216, 13)}
<path d="M 141 248 Q 150 256 159 248" fill="none" stroke="${INK}" stroke-width="3"/>
<ellipse cx="107" cy="234" rx="8" ry="5" fill="#ff8fa0" opacity="0.5"/>
<ellipse cx="193" cy="234" rx="8" ry="5" fill="#ff8fa0" opacity="0.5"/>
${gloss('M 108 190 C 102 214 104 246 114 266', 5, 0.3)}`;
  }
  function drawOctopus(ctx, opts) {
    blit(ctx, 'octopus', opts.color || '#ff5b86', octopusSVG);
  }

  // ── Dispatch table ─────────────────────────────────────────────────────────
  const drawFns = {
    ketchup: drawKetchup,
    maple: drawMaple,
    honeybear: drawHoneybear,
    babybottle: drawBabybottle,
    extinguisher: drawExtinguisher,
    soap: drawSoap,
    hourglass: drawHourglass,
    bowlingpin: drawBowlingpin,
    cone: drawCone,
    flask: drawFlask,
    shell: drawShell,
    pawn: drawPawn,
    buoy: drawBuoy,
    wineglass: drawWineglass,
    toucan: drawToucan,
    whippedcream: drawWhippedcream,
    potion: drawPotion,
    tabasco: drawTabasco,
    coke: drawCoke,
    stanley: drawStanley,
    lavalamp: drawLavalamp,
    lawnchair: drawLawnchair,
    octopus: drawOctopus,
  };
  const BUILDERS = {
    ketchup: ketchupSVG, maple: mapleSVG, honeybear: honeybearSVG,
    babybottle: babybottleSVG, extinguisher: extinguisherSVG, soap: soapSVG,
    hourglass: hourglassSVG, bowlingpin: bowlingpinSVG, cone: coneSVG,
    flask: flaskSVG, shell: shellSVG, pawn: pawnSVG, buoy: buoySVG,
    wineglass: wineglassSVG, toucan: toucanSVG, whippedcream: whippedcreamSVG,
    potion: potionSVG, tabasco: tabascoSVG, coke: cokeSVG, stanley: stanleySVG,
    lavalamp: lavalampSVG, lawnchair: lawnchairSVG, octopus: octopusSVG,
  };

  const ROSTER = [
    { id: 'bottle', name: 'Bottle', emoji: '🍾', drawAs: 'bottle', unlock: null, tint: '#1f9bff', liquid: { mode: 'closed', fill: 0.32 } },
    { id: 'ketchup', name: 'Ketchup', emoji: '🍅', drawAs: 'ketchup', unlock: 4, tint: '#e3263c', liquid: { mode: 'closed', fill: 0.45 } },
    { id: 'maple', name: 'Maple Syrup', emoji: '🍁', drawAs: 'maple', unlock: 8, tint: '#ff7a00', liquid: { mode: 'closed', fill: 0.4 } },
    { id: 'honeybear', name: 'Honey Bear', emoji: '🐻', drawAs: 'honeybear', unlock: 12, tint: '#ffc233', liquid: { mode: 'closed', fill: 0.42 } },
    { id: 'babybottle', name: 'Baby Bottle', emoji: '🍼', drawAs: 'babybottle', unlock: 16, tint: '#5fcfe6', liquid: { mode: 'closed', fill: 0.35 } },
    { id: 'extinguisher', name: 'Extinguisher', emoji: '🧯', drawAs: 'extinguisher', unlock: 20, tint: '#e3263c', liquid: { mode: 'closed', fill: 0.3 } },
    { id: 'soap', name: 'Soap Pump', emoji: '🧼', drawAs: 'soap', unlock: 24, tint: '#1f9bff', liquid: { mode: 'closed', fill: 0.38 } },
    { id: 'hourglass', name: 'Hourglass', emoji: '⌛', drawAs: 'hourglass', unlock: 28, tint: '#8a3ffc', liquid: { mode: 'sand', fill: 0.5, sand: true } },
    { id: 'bowlingpin', name: 'Bowling Pin', emoji: '🎳', drawAs: 'bowlingpin', unlock: 32, tint: '#e3263c', liquid: null },
    { id: 'cone', name: 'Traffic Cone', emoji: '🚧', drawAs: 'cone', unlock: 36, tint: '#ff7a00', liquid: null },
    { id: 'flask', name: 'Lab Flask', emoji: '🧪', drawAs: 'flask', unlock: 40, tint: '#8ed11a', liquid: { mode: 'open', fill: 0.4 } },
    { id: 'shell', name: 'Artillery Shell', emoji: '💥', drawAs: 'shell', unlock: 44, tint: '#c8203a', liquid: null },
    { id: 'pawn', name: 'Chess Pawn', emoji: '♟️', drawAs: 'pawn', unlock: 48, tint: '#4f63e0', liquid: null },
    { id: 'buoy', name: 'Buoy', emoji: '🟠', drawAs: 'buoy', unlock: 52, tint: '#ff7a00', liquid: null },
    { id: 'wineglass', name: 'Juice Glass', emoji: '🧃', drawAs: 'wineglass', unlock: 56, tint: '#c8203a', liquid: { mode: 'open', fill: 0.35 } },
    { id: 'toucan', name: 'Toucan', emoji: '🦜', drawAs: 'toucan', unlock: 60, tint: '#e3263c', liquid: null },
    { id: 'trex', name: 'T-Rex', emoji: '🦖', drawAs: 'trex', unlock: 64, tint: '#ff7a00', liquid: null },
    { id: 'whippedcream', name: 'Whipped Cream', emoji: '🍦', drawAs: 'whippedcream', unlock: 68, tint: '#ff5b86', liquid: { mode: 'closed', fill: 0.35 } },
    { id: 'potion', name: 'Potion', emoji: '✨', drawAs: 'potion', unlock: 72, tint: '#8a3ffc', liquid: { mode: 'closed', fill: 0.4 } },
    { id: 'tabasco', name: 'Hot Sauce', emoji: '🌶️', drawAs: 'tabasco', unlock: 76, tint: '#e3263c', liquid: { mode: 'closed', fill: 0.38 } },
    { id: 'coke', name: 'Cola Bottle', emoji: '🥤', drawAs: 'coke', unlock: 80, tint: '#c8203a', liquid: { mode: 'closed', fill: 0.4 } },
    { id: 'stanley', name: 'Tumbler', emoji: '🧊', drawAs: 'stanley', unlock: 84, tint: '#1f9bff', liquid: { mode: 'closed', fill: 0.45 } },
    { id: 'lavalamp', name: 'Lava Lamp', emoji: '💡', drawAs: 'lavalamp', unlock: 88, tint: '#ff5b86', liquid: { mode: 'closed', fill: 0.55, lava: true } },
    { id: 'lawnchair', name: 'Lawn Chair', emoji: '🪑', drawAs: 'lawnchair', unlock: 92, tint: '#3fae1a', liquid: null },
    { id: 'octopus', name: 'Octopus', emoji: '🐙', drawAs: 'octopus', unlock: 96, tint: '#ff5b86', liquid: null },
    { id: 'alien', name: 'Alien', emoji: '👽', drawAs: 'alien', unlock: 100, tint: '#8ed11a', liquid: null },
  ];

  const BY_ID = Object.create(null);
  for (const r of ROSTER) BY_ID[r.id] = r;

  // Bake the default-tint sprite for every character once the page is idle so
  // roster tiles and first equips never show the placeholder silhouette.
  function warm() {
    for (const r of ROSTER) {
      const b = BUILDERS[r.drawAs];
      if (b) sprite(r.drawAs, r.tint, b);
    }
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warm);
  else setTimeout(warm, 400);

  window.FLIP_CAST25 = {
    ROSTER,
    drawFns,
    flavors: FLAVORS,
    liquidFor: (id) => (BY_ID[id] && BY_ID[id].liquid) || null,
    entry: (id) => BY_ID[id] || null,
    onSpriteLoad,
  };
})();
