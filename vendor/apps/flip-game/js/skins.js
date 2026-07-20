/* skins.js — flippable "editions" for the Bottle Game.
 *
 * The base object you flip is the Bottle. Skins are alternate objects that draw
 * over the SAME physics body (same flick, spin, landing rules) — only the paint
 * changes. Parrot is the first; the registry is built so future silly editions
 * drop in with just a draw function + an unlock rule.
 *
 * A skin's draw(ctx, opts) is called by renderer.js AFTER it has already
 * translated to the object's on-screen center, rotated by the body angle, and
 * scaled by the scene's draw scale — so a skin just paints in local object
 * coords (origin = physics CG, ground-contact plane at y≈+39, like the bottle).
 *
 * window.Skins API:
 *   list()            -> [{id,name,emoji,unlock}]  (includes 'bottle')
 *   hasDraw(id)       -> is there a skin-specific draw fn (false for 'bottle')
 *   draw(ctx,id,opts) -> paint skin `id`; opts: {color, slosh}
 *   unlockRule(id)    -> null (always on) | 'first-win' | ...
 *   preload(colors)   -> warm any sprite caches for these player colors
 *
 * No external libraries; SVG skins bake to data: URIs, so it stays offline-safe.
 */
window.Skins = (function () {
  'use strict';

  // ── Color helpers ──────────────────────────────────────────────────────────
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(
      Math.round(A[0] + (B[0] - A[0]) * t),
      Math.round(A[1] + (B[1] - A[1]) * t),
      Math.round(A[2] + (B[2] - A[2]) * t)
    );
  }
  const shadeHex = (hex, t) => (t >= 0 ? mixHex(hex, '#ffffff', t) : mixHex(hex, '#000000', -t));

  // ── Parrot skin (authored SVG macaw) ────────────────────────────────────────
  // Side-profile Caribbean macaw baked per player color into offscreen Images.
  // Two layers: BODY + WING (wing flaps a few degrees off the slosh signal).
  // Foot soles map to local y≈+39 (the physics contact plane), so it lands like
  // the bottle regardless of the scene's draw scale.
  const SPR = (() => {
    const VIEW_W = 300, GROUND_SVG = 376, GROUND_LOCAL = 39, SCALE = 0.62;
    const VIEW_H = 420;
    const destW = VIEW_W * SCALE, destH = VIEW_H * SCALE;
    return {
      destX: -destW / 2,
      destY: GROUND_LOCAL - GROUND_SVG * SCALE,
      destW, destH,
      pivX: (132 - VIEW_W / 2) * SCALE,
      pivY: (150 - GROUND_SVG) * SCALE + GROUND_LOCAL,
    };
  })();

  const ANAT = {
    beakHi: '#f7efdf', beakLo: '#d9c7a3', beakEdge: '#8f7d5c',
    mandible: '#3c3733', nostril: '#77664c',
    face: '#f4efe3', iris: '#e3c584', pupil: '#17110c', eyeRing: '#9c8a6a',
    legNear: '#8d8577', legFar: '#6e6759', claw: '#4a443c',
    patch: '#1b1b1b', strap: '#141414',
  };

  function parrotPalette(base) {
    return {
      base,
      crown:  shadeHex(base,  0.10),
      chest:  shadeHex(base,  0.18),
      deep:   shadeHex(base, -0.30),
      wing:   shadeHex(base, -0.10),
      wingLn: shadeHex(base, -0.26),
      covert: mixHex(base, '#e9c46a', 0.55),
      covertEdge: shadeHex(mixHex(base, '#e9c46a', 0.55), -0.25),
      prim:   mixHex(base, '#1f3a5f', 0.60),
      primHi: shadeHex(mixHex(base, '#1f3a5f', 0.60), 0.25),
      tail:   mixHex(base, '#1f3a5f', 0.38),
      line:   shadeHex(base, -0.52),
    };
  }

  function parrotBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gB" x1="0" y1="60" x2="0" y2="345" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.crown}"/><stop offset="0.45" stop-color="${p.base}"/><stop offset="1" stop-color="${p.deep}"/>
</linearGradient>
<linearGradient id="gK" x1="222" y1="56" x2="266" y2="140" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${ANAT.beakHi}"/><stop offset="1" stop-color="${ANAT.beakLo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 118 312 C 92 350 66 378 50 404 C 62 407 78 396 91 372 C 103 350 113 331 121 317 Z" fill="${p.tail}"/>
<path d="M 118 312 C 95 346 72 374 56 398" fill="none" stroke="${p.primHi}" stroke-width="2" opacity="0.55"/>
<path d="M 127 316 C 109 348 93 372 82 391 C 94 391 107 374 117 352 C 123 340 127 328 129 318 Z" fill="${p.prim}"/>
<path d="M 134 318 C 124 340 113 357 106 367 C 117 365 127 350 135 331 Z" fill="${p.deep}"/>
<path d="M 148 336 L 146 365" fill="none" stroke="${ANAT.legFar}" stroke-width="9"/>
<path d="M 146 365 L 127 375 M 146 365 L 145 377 M 146 365 L 161 375" fill="none" stroke="${ANAT.legFar}" stroke-width="6"/>
<path d="M 168 106 C 136 118 116 140 112 168 C 106 208 96 252 100 292 C 102 318 118 334 142 340 C 168 346 190 338 202 318 C 218 292 228 250 230 210 C 232 178 224 148 208 128 C 196 114 182 106 168 106 Z" fill="url(#gB)" stroke="${p.line}" stroke-width="1.5" opacity="0.98"/>
<ellipse cx="214" cy="212" rx="24" ry="66" fill="${p.chest}" opacity="0.32" transform="rotate(-7 214 212)"/>
<circle cx="195" cy="88" r="44" fill="${p.crown}"/>
<path d="M 153 66 A 44 44 0 0 1 233 72" fill="none" stroke="${p.line}" stroke-width="1.5"/>
<path d="M 224 58 C 200 52 178 58 170 74 C 164 88 166 104 176 114 C 188 124 206 126 218 120 L 220 118 C 214 98 216 76 224 58 Z" fill="${ANAT.face}" stroke="${p.line}" stroke-width="1" opacity="0.96"/>
<path d="M 176 72 C 190 66 204 64 216 64 M 172 86 C 188 82 204 82 218 84 M 174 100 C 188 100 202 102 214 106" fill="none" stroke="${p.base}" stroke-width="1.6" opacity="0.8"/>
<path d="M 222 54 C 244 52 262 62 268 80 C 274 100 268 126 252 146 C 248 130 240 122 228 116 L 224 112 C 230 94 228 72 222 54 Z" fill="url(#gK)" stroke="${ANAT.beakEdge}" stroke-width="1.2"/>
<path d="M 226 58 C 244 58 258 68 263 82" fill="none" stroke="#fbf6ea" stroke-width="2" opacity="0.7"/>
<path d="M 224 112 C 236 116 246 128 252 144" fill="none" stroke="${ANAT.beakEdge}" stroke-width="1.5" opacity="0.8"/>
<path d="M 220 116 C 228 120 238 128 244 138 C 236 142 224 142 214 136 C 210 130 212 122 220 116 Z" fill="${ANAT.mandible}"/>
<ellipse cx="233" cy="64" rx="3" ry="2.4" fill="${ANAT.nostril}" transform="rotate(15 233 64)"/>
<circle cx="190" cy="84" r="8" fill="${ANAT.iris}" stroke="${ANAT.eyeRing}" stroke-width="1"/>
<circle cx="190" cy="84" r="4.4" fill="${ANAT.pupil}"/>
<circle cx="192" cy="81" r="1.8" fill="#ffffff"/>
<path d="M 214 56 C 196 60 178 64 162 72 C 152 78 146 86 142 96" fill="none" stroke="${ANAT.strap}" stroke-width="3.5"/>
<g transform="rotate(-16 173 67)">
<rect x="159" y="57" width="28" height="20" rx="6" fill="${ANAT.patch}"/>
<path d="M 164 62 C 169 59 177 58 182 60" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
</g>
<path d="M 176 332 L 174 363" fill="none" stroke="${ANAT.legNear}" stroke-width="10"/>
<path d="M 174 363 L 152 375 M 174 363 L 172 377 M 174 363 L 192 373" fill="none" stroke="${ANAT.legNear}" stroke-width="7"/>
<path d="M 152 375 L 147 378 M 172 377 L 171 381 M 192 373 L 196 377" fill="none" stroke="${ANAT.claw}" stroke-width="3"/>
</g>
</svg>`;
  }

  function parrotWingSVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gW" x1="0" y1="150" x2="0" y2="350" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.wing}"/><stop offset="1" stop-color="${p.deep}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 130 148 C 104 162 90 192 92 226 C 94 262 104 300 126 330 C 138 344 154 350 166 340 C 176 330 178 310 172 280 C 165 242 158 200 148 172 C 144 158 138 150 130 148 Z" fill="url(#gW)" stroke="${p.line}" stroke-width="1.5" opacity="0.98"/>
<path d="M 106 192 C 116 200 128 204 138 202 M 116 172 C 126 180 138 184 148 182 M 100 216 C 112 226 128 230 142 228" fill="none" stroke="${p.wingLn}" stroke-width="1.8" opacity="0.7"/>
<path d="M 100 242 C 116 256 138 262 158 256" fill="none" stroke="${p.covert}" stroke-width="12" opacity="0.95"/>
<path d="M 101 248 C 117 262 139 268 157 262" fill="none" stroke="${p.covertEdge}" stroke-width="2.5" opacity="0.8"/>
<path d="M 104 260 C 114 292 130 318 152 338 L 162 341 C 142 318 126 288 116 258 Z" fill="${p.prim}"/>
<path d="M 118 258 C 128 288 144 314 164 332 L 169 326 C 152 306 138 280 130 254 Z" fill="${p.prim}" opacity="0.85"/>
<path d="M 104 260 C 116 294 134 322 158 340 M 118 256 C 130 288 146 314 166 330" fill="none" stroke="${p.primHi}" stroke-width="1.6" opacity="0.6"/>
</g>
</svg>`;
  }

  const spriteCache = new Map();
  function getParrotSprite(color) {
    let entry = spriteCache.get(color);
    if (entry) return entry;
    const p = parrotPalette(color);
    entry = { body: new Image(), wing: new Image(), loaded: 0, ready: false };
    const arm = (img, svg) => {
      img.onload = () => { if (++entry.loaded === 2) entry.ready = true; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };
    arm(entry.body, parrotBodySVG(p));
    arm(entry.wing, parrotWingSVG(p));
    spriteCache.set(color, entry);
    return entry;
  }

  // draw(ctx, opts) — ctx already at object center, rotated + scaled by renderer.
  function drawParrot(ctx, opts) {
    const color = opts.color || '#d62828';
    const flap = Math.max(-0.45, Math.min(0.45, (opts.slosh || 0) * 0.55));
    const spr = getParrotSprite(color);
    if (spr.ready) {
      ctx.drawImage(spr.body, SPR.destX, SPR.destY, SPR.destW, SPR.destH);
      ctx.save();
      ctx.translate(SPR.pivX, SPR.pivY);
      ctx.rotate(flap * 0.5);
      ctx.translate(-SPR.pivX, -SPR.pivY);
      ctx.drawImage(spr.wing, SPR.destX, SPR.destY, SPR.destW, SPR.destH);
      ctx.restore();
    } else {
      // brief placeholder while the SVG Images decode
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, -12, 30, 52, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(14, -72, 22, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Registry ────────────────────────────────────────────────────────────────
  // Add a new edition by pushing META + a drawFns entry. `unlock`: null = always
  // available; 'first-win' = unlocked after winning a game (see records.js).
  const META = [
    { id: 'bottle', name: 'Bottle', emoji: '🍾', unlock: null },
    { id: 'parrot', name: 'Parrot', emoji: '🦜', unlock: 'first-win' },
    // future: { id: 'taco', name: 'Taco', emoji: '🌮', unlock: 'first-win' }, ...
  ];
  const drawFns = { parrot: drawParrot };   // 'bottle' is drawn by renderer.js

  return {
    list: () => META.slice(),
    metaFor: (id) => META.find((m) => m.id === id) || null,
    unlockRule: (id) => (META.find((m) => m.id === id) || {}).unlock ?? null,
    hasDraw: (id) => !!drawFns[id],
    draw: (ctx, id, opts) => { const f = drawFns[id]; if (f) f(ctx, opts || {}); },
    preload: (colors) => { for (const c of colors || []) getParrotSprite(c); },
  };
})();
