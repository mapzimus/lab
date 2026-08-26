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
 *   unlockRule(id)    -> null (always on) | <number> (total wins needed — see Records.totalWins())
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
    // v67: larger baked sprites so cast editions read sharper on phones + panels.
    const VIEW_W = 300, GROUND_SVG = 376, GROUND_LOCAL = 39, SCALE = 0.74;
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

  // Sprites are SVG data URIs, so they decode a frame or two after they're
  // asked for. The game loop repaints constantly and doesn't care, but the
  // static setup-screen previews need a nudge once one lands.
  const loadListeners = [];
  function onSpriteLoad(cb) { if (typeof cb === 'function') loadListeners.push(cb); }
  function spriteLoaded() { for (const cb of loadListeners) { try { cb(); } catch (_) {} } }

  const spriteCache = new Map();
  function getParrotSprite(color) {
    let entry = spriteCache.get(color);
    if (entry) return entry;
    const p = parrotPalette(color);
    entry = { body: new Image(), wing: new Image(), loaded: 0, ready: false };
    const arm = (img, svg) => {
      img.onload = () => { if (++entry.loaded === 2) { entry.ready = true; spriteLoaded(); } };
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

  // ── Generic single-layer sprite cache ─────────────────────────────────────
  // Most skins (everything except the parrot's flapping wing) are one static
  // image per color. Keyed by "skinId|color"; built lazily from an SVG builder
  // fn(palette) -> string. Shares the parrot's SPR geometry (same 300×420
  // viewBox, ground at svg y=376), so every skin lands on the same contact
  // plane regardless of the scene's draw scale.
  const singleCache = new Map();
  function getSingleSprite(skinId, color, palette, buildSvg) {
    const key = skinId + '|' + color;
    let entry = singleCache.get(key);
    if (entry) return entry;
    entry = { img: new Image(), ready: false };
    entry.img.onload = () => { entry.ready = true; spriteLoaded(); };
    entry.img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildSvg(palette));
    singleCache.set(key, entry);
    return entry;
  }
  // Draws a ready single-layer sprite, or a plain silhouette placeholder (same
  // fallback shape the parrot uses) while its Image is still decoding.
  function drawSingleSprite(ctx, skinId, color, palette, buildSvg) {
    const spr = getSingleSprite(skinId, color, palette, buildSvg);
    if (spr.ready) {
      ctx.drawImage(spr.img, SPR.destX, SPR.destY, SPR.destW, SPR.destH);
    } else {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, -12, 30, 52, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── PNG cast sprites (retired) ─────────────────────────────────────────────
  // AI rasters under icons/skins/<edition>/<rrggbb>.png are no longer used
  // in-game (too 3D). Helpers remain for tools / parked editions only.
  const pngCache = new Map();
  const FLAVOR_HEXES = [
    '1f9bff', 'e3263c', '8ed11a', 'ff7a00', '8a3ffc', '5fcfe6',
    '3fae1a', 'ff5b86', '4f63e0', 'ffc233', 'c8203a', 'ff9ecf',
  ];
  function colorToHexKey(color) {
    const s = String(color || '').toLowerCase().replace('#', '');
    if (/^[0-9a-f]{6}$/.test(s)) return s;
    return FLAVOR_HEXES[0];
  }
  function getPngSprite(edition, color) {
    const hex = colorToHexKey(color);
    const key = edition + '|' + hex;
    let entry = pngCache.get(key);
    if (entry) return entry;
    entry = { img: new Image(), ready: false, failed: false };
    entry.img.onload = () => { entry.ready = true; spriteLoaded(); };
    entry.img.onerror = () => { entry.failed = true; spriteLoaded(); };
    entry.img.src = 'icons/skins/' + edition + '/' + hex + '.png';
    pngCache.set(key, entry);
    return entry;
  }
  function drawPngSprite(ctx, edition, color) {
    const spr = getPngSprite(edition, color);
    if (spr.ready) {
      ctx.drawImage(spr.img, SPR.destX, SPR.destY, SPR.destW, SPR.destH);
    } else {
      ctx.fillStyle = color || '#888';
      ctx.beginPath(); ctx.ellipse(0, -12, 30, 52, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function preloadPngEdition(edition, colors) {
    const list = (colors && colors.length) ? colors : FLAVOR_HEXES.map((h) => '#' + h);
    for (const c of list) getPngSprite(edition, c);
  }

  // ── Plunger skin ───────────────────────────────────────────────────────────
  // Rubber cup at the base (player-tinted, doubles as the physics contact
  // point) on a fixed wood handle, with a googly-eyed face for personality.
  const PLUNGER = {
    wood: '#a9754a', woodDk: '#8a5c37', ferrule: '#c3c9cf', ferruleDk: '#8b9299',
    eyeWhite: '#ffffff', pupil: '#1a1a1a', mouth: '#3a2418',
  };
  function plungerPalette(base) {
    return { base, hi: shadeHex(base, 0.16), lo: shadeHex(base, -0.28), line: shadeHex(base, -0.5) };
  }
  function plungerBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gP" x1="0" y1="270" x2="0" y2="378" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 70 366 C 70 322 90 282 150 276 C 210 282 230 322 230 366 Z" fill="url(#gP)" stroke="${p.line}" stroke-width="2"/>
<path d="M 82 352 C 88 318 112 292 150 286" fill="none" stroke="${p.hi}" stroke-width="3.5" opacity="0.55"/>
<path d="M 218 352 C 212 318 190 294 156 287" fill="none" stroke="${p.lo}" stroke-width="4" opacity="0.5"/>
<path d="M 58 296 L 62 306 L 52 302 L 60 312 L 49 309" fill="none" stroke="#fff6c8" stroke-width="2.5" opacity="0.9"/>
<path d="M 244 320 L 248 328 L 240 325" fill="none" stroke="#fff6c8" stroke-width="2" opacity="0.8"/>
<path d="M 76 354 C 72 364 64 372 56 376 L 244 376 C 236 372 228 364 224 354 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 80 358 C 78 364 74 369 68 372" fill="none" stroke="${p.hi}" stroke-width="2.5" opacity="0.4"/>
<rect x="118" y="266" width="64" height="20" rx="8" fill="${PLUNGER.ferrule}" stroke="${PLUNGER.ferruleDk}" stroke-width="1.5"/>
<path d="M 122 271 L 178 271" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.55"/>
<path d="M 132 270 L 132 76 Q 132 54 150 54 Q 168 54 168 76 L 168 270 Z" fill="${PLUNGER.wood}" stroke="${PLUNGER.woodDk}" stroke-width="2"/>
<path d="M 138 90 L 138 260 M 150 80 L 150 260 M 162 90 L 162 260" fill="none" stroke="${PLUNGER.woodDk}" stroke-width="1" opacity="0.45"/>
<path d="M 137 84 L 137 262" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.18"/>
<path d="M 104 300 L 122 306 M 196 300 L 178 306" fill="none" stroke="${p.line}" stroke-width="3.5"/>
<circle cx="124" cy="322" r="15" fill="${PLUNGER.eyeWhite}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="128" cy="324" r="6.5" fill="${PLUNGER.pupil}"/>
<circle cx="120" cy="317" r="3.2" fill="#ffffff"/>
<circle cx="176" cy="322" r="15" fill="${PLUNGER.eyeWhite}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="180" cy="324" r="6.5" fill="${PLUNGER.pupil}"/>
<circle cx="172" cy="317" r="3.2" fill="#ffffff"/>
<ellipse cx="150" cy="345" rx="12" ry="9" fill="${PLUNGER.mouth}"/>
<ellipse cx="150" cy="349" rx="7" ry="4" fill="#c2506a"/>
</g>
</svg>`;
  }
  function drawPlunger(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'plunger', color, plungerPalette(color), plungerBodySVG);
  }

  // ── T-Rex skin ─────────────────────────────────────────────────────────────
  // Side-profile, facing right (same convention as the parrot).
  const TREX = {
    belly: 'rgba(255,255,255,0.30)',
    spike: '#e8dfc8', spikeLine: '#a89972', tooth: '#fbf6ea',
    eyeWhite: '#ffffff', pupil: '#171008',
  };
  function trexPalette(base) {
    return { base, hi: shadeHex(base, 0.14), lo: shadeHex(base, -0.22), deep: shadeHex(base, -0.42), line: shadeHex(base, -0.55) };
  }
  // Upright "toy figurine" stance — torso stands roughly vertical with the
  // head held up and forward, NOT leaning/diving forward — a forward-diving
  // neck reads as a bird pecking the ground no matter how the head itself is
  // detailed. Tail and legs are separate overlapping shapes (generous overlap
  // at every join so there's no thin seam), and legs are single tapering
  // curves (no hard-cornered boxes) so they read as limbs, not stovepipes.
  function trexBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gT" x1="90" y1="70" x2="260" y2="290" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 100 366 L 88 375 L 100 377 L 106 368 Z M 106 366 L 108 378 L 116 378 L 112 368 Z M 112 366 L 124 374 L 115 377 L 110 368 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="1"/>
<path d="M 108 296 C 100 315 98 340 102 362 C 103 368 108 370 114 368 C 120 366 122 358 120 340 C 122 320 126 305 128 296 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 108 250 C 70 245 35 255 8 285 C 4 295 8 302 18 300 C 45 292 78 278 105 268 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 110 175 C 100 200 96 230 100 258 C 102 275 108 288 122 296 L 178 296 C 190 288 194 275 194 258 C 196 230 188 200 172 178 C 160 165 140 162 126 165 C 118 167 113 170 110 175 Z" fill="url(#gT)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 118 190 C 122 165 130 145 145 128 C 158 113 172 98 190 85 C 205 74 222 65 242 60 C 258 56 272 56 285 64 C 296 71 302 82 300 95 C 298 104 294 110 288 114 L 228 138 L 284 162 C 270 168 254 170 238 170 C 220 170 206 166 195 178 C 185 188 178 200 172 212 L 145 205 C 135 198 125 194 118 190 Z" fill="url(#gT)" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="148" cy="197" rx="35" ry="21" fill="url(#gT)"/>
<ellipse cx="148" cy="238" rx="19" ry="44" fill="${TREX.belly}" transform="rotate(-8 148 238)"/>
<path d="M 136 254 C 143 258 152 258 158 254 M 138 270 C 144 274 152 274 157 270" fill="none" stroke="${p.line}" stroke-width="2" opacity="0.3"/>
<path d="M 64 250 L 57 237 L 74 245 Z M 44 256 L 38 245 L 54 251 Z" fill="${TREX.spike}" stroke="${TREX.spikeLine}" stroke-width="1.2"/>
<path d="M 163 112 L 156 96 L 175 104 Z M 193 92 L 187 75 L 206 84 Z M 220 74 L 215 57 L 233 66 Z" fill="${TREX.spike}" stroke="${TREX.spikeLine}" stroke-width="1.2"/>
<path d="M 261 71 L 280 66" fill="none" stroke="${p.line}" stroke-width="3.5"/>
<circle cx="270" cy="80" r="8.5" fill="${TREX.eyeWhite}" stroke="${p.line}" stroke-width="1.2"/>
<circle cx="273" cy="81" r="4.4" fill="${TREX.pupil}"/>
<circle cx="296" cy="88" r="2" fill="${p.line}"/>
<path d="M 282 116 L 272 120 L 279 131 Z M 272 120 L 263 124 L 269 135 Z M 263 124 L 253 128 L 259 139 Z M 253 128 L 244 132 L 250 143 Z" fill="${TREX.tooth}" stroke="${TREX.spikeLine}" stroke-width="1"/>
<path d="M 240 143 L 250 148 L 246 134 Z M 250 148 L 261 152 L 256 138 Z M 261 152 L 271 156 L 266 143 Z" fill="${TREX.tooth}" stroke="${TREX.spikeLine}" stroke-width="1"/>
<path d="M 158 212 C 168 216 174 224 176 234 M 174 228 L 168 238 M 176 231 L 179 242" fill="none" stroke="${p.deep}" stroke-width="6"/>
<circle cx="277" cy="120" r="1.8" fill="#ffffff" opacity="0.9"/>
<path d="M 142 370 L 128 379 L 141 381 L 148 372 Z M 149 370 L 151 382 L 159 382 L 155 372 Z M 156 370 L 169 378 L 159 381 L 154 372 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="1"/>
<path d="M 148 296 C 140 317 138 344 142 366 C 143 372 149 374 156 372 C 163 370 165 361 163 342 C 165 321 170 305 172 296 Z" fill="url(#gT)" stroke="${p.line}" stroke-width="2"/>
</g>
</svg>`;
  }
  function drawTrex(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'trex', color, trexPalette(color), trexBodySVG);
  }

  // ── Vending machine skin ───────────────────────────────────────────────────
  // Player-tinted cabinet; the glass front, snack rows and control panel stay
  // fixed so it always reads as a vending machine rather than a colored box.
  const VEND = {
    glass: '#0e2438', glassLine: '#7f96ad', shelf: '#43596e',
    sign: '#f4f8fb', panel: '#2b333b', panelLine: '#151a1f',
    slot: '#11161b', button: '#9fb0c0', flap: '#1b2430',
    // Snack rows stay multi-colored — that's what sells "vending machine".
    snack: ['#ff5b1f', '#ffd23f', '#4fd1a5', '#ff7ab8', '#7cc4ff', '#c88cff'],
  };
  function vendPalette(base) {
    return { base, hi: shadeHex(base, 0.18), lo: shadeHex(base, -0.26), line: shadeHex(base, -0.52) };
  }
  function vendBodySVG(p) {
    // Four shelves of six snacks each, behind the glass.
    let snacks = '';
    for (let row = 0; row < 4; row++) {
      const y = 156 + row * 40;
      snacks += `<path d="M 84 ${y + 26} L 170 ${y + 26}" fill="none" stroke="${VEND.shelf}" stroke-width="2.5"/>`;
      for (let col = 0; col < 3; col++) {
        const x = 90 + col * 28;
        const c = VEND.snack[(row * 3 + col) % VEND.snack.length];
        snacks += `<rect x="${x}" y="${y}" width="19" height="24" rx="3" fill="${c}" opacity="0.95"/>`;
      }
    }
    // 2x3 keypad.
    let keys = '';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        keys += `<circle cx="${196 + c * 18}" cy="${158 + r * 20}" r="6" fill="${VEND.button}"/>`;
      }
    }
    // Scaled up 1.3× around bottom-center (150,376): a vending machine should
    // LOOM. Same contact plane, so it lands exactly like every other edition.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gV" x1="64" y1="0" x2="236" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round" transform="translate(150 376) scale(1.3) translate(-150 -376)">
<rect x="64" y="96" width="172" height="280" rx="14" fill="url(#gV)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 64 130 L 236 130" fill="none" stroke="${p.line}" stroke-width="2"/>
<rect x="82" y="106" width="136" height="17" rx="5" fill="${VEND.sign}" opacity="0.92"/>
<path d="M 94 114 L 128 114 M 136 114 L 164 114 M 172 114 L 206 114" fill="none" stroke="${p.lo}" stroke-width="4"/>
<rect x="78" y="142" width="98" height="174" rx="6" fill="${VEND.glass}" stroke="${VEND.glassLine}" stroke-width="2"/>
${snacks}
<rect x="82" y="145" width="90" height="5" rx="2.5" fill="#ffffff" opacity="0.35"/>
<path d="M 92 148 L 116 148 L 96 310 L 82 310 Z" fill="#ffffff" opacity="0.12"/>
<path d="M 128 148 L 140 148 L 124 262 L 114 262 Z" fill="#ffffff" opacity="0.07"/>
<rect x="184" y="142" width="44" height="96" rx="6" fill="${VEND.panel}" stroke="${VEND.panelLine}" stroke-width="1.5"/>
${keys}
<circle cx="206" cy="248" r="6" fill="#f4d35e" stroke="#a8862a" stroke-width="1.5"/>
<rect x="190" y="250" width="32" height="7" rx="3.5" fill="${VEND.slot}"/>
<rect x="192" y="268" width="28" height="20" rx="3" fill="${VEND.panel}" stroke="${VEND.panelLine}" stroke-width="1.5"/>
<rect x="78" y="322" width="146" height="32" rx="5" fill="${VEND.flap}" stroke="${p.line}" stroke-width="2"/>
<path d="M 90 338 L 212 338" fill="none" stroke="${VEND.glassLine}" stroke-width="2" opacity="0.5"/>
<rect x="64" y="358" width="172" height="18" rx="6" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
</g>
</svg>`;
  }
  function drawVend(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'vending', color, vendPalette(color), vendBodySVG);
  }

  // ── People skin ────────────────────────────────────────────────────────────
  // Every flavor color maps to a different little person (see PERSONS).
  //
  // Shared body is a semi-realistic chibi (smaller head, oval face, eye whites,
  // soft skin shading) so the cast reads as people rather than toys. Costume
  // layers stay keyed to the same attachment points. Color is a safe key
  // because every FLAVORS entry in main.js has a distinct hex.
  const PEOPLE = {
    skin: '#e8b892', skinHi: '#f3d0b0', skinLo: '#c9926e', skinLine: '#8f6348',
    eyeWhite: '#ffffff', iris: '#3a2a1c', pupil: '#14100c',
    mouth: '#a05048', lip: '#c46a62',
    boot: '#2f343c', bootLine: '#1a1d22', bootSole: '#171a1e',
  };
  // Costume layers. Each optional field is a function of the palette so a
  // costume can pick up the player's tint (capes, plastic army men, wizard
  // hats) or stay a fixed prop color (chef's toque, clown nose).
  const PERSONS = {
    '#1f9bff': {                                          // Astronaut
      label: 'astronaut',
      behind: () => `<rect x="90" y="210" width="26" height="64" rx="10" fill="#dfe6ec" stroke="#98a4ae" stroke-width="2"/>`,
      torso: (p) => `<rect x="130" y="222" width="40" height="28" rx="5" fill="#dfe6ec" stroke="#98a4ae" stroke-width="1.5"/>`
        + `<circle cx="140" cy="236" r="4" fill="#4fd1a5"/><circle cx="152" cy="236" r="4" fill="#ffd23f"/><circle cx="163" cy="236" r="4" fill="#ff5b1f"/>`
        + `<rect x="112" y="262" width="76" height="12" fill="#dfe6ec" stroke="#98a4ae" stroke-width="1.5"/>`
        + `<path d="M 120 282 L 180 282" fill="none" stroke="#dfe6ec" stroke-width="6"/>`
        + `<path d="M 126 300 L 140 300 M 160 300 L 174 300" fill="none" stroke="#dfe6ec" stroke-width="6"/>`
        + `<path d="M 126 330 L 140 330 M 160 330 L 174 330" fill="none" stroke="#dfe6ec" stroke-width="6"/>`,
      head: () => `<circle cx="150" cy="138" r="57" fill="none" stroke="#eef3f7" stroke-width="7" opacity="0.9"/>`
        + `<circle cx="150" cy="138" r="57" fill="#cfe0ee" opacity="0.16"/>`
        + `<path d="M 110 124 C 122 104 178 104 190 124 C 190 146 176 158 150 158 C 124 158 110 146 110 124 Z" fill="#123a55" opacity="0.72" stroke="#e6eef5" stroke-width="2.5"/>`
        + `<path d="M 122 118 C 133 108 151 106 164 109" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.55"/>`,
    },
    '#e3263c': {                                          // Pirate
      label: 'pirate',
      // Cutlass held out to one side, drawn behind so the hand overlaps the grip.
      behind: () => `<path d="M 214 300 C 236 268 244 232 240 196 C 234 214 224 246 208 276 Z" fill="#dfe6ec" stroke="#8b9299" stroke-width="2"/>`
        + `<rect x="200" y="292" width="26" height="9" rx="4" fill="#f4d35e" stroke="#a8862a" stroke-width="1.5" transform="rotate(-28 213 296)"/>`
        + `<rect x="204" y="300" width="12" height="26" rx="5" fill="#5b3a22" stroke="#3a2414" stroke-width="1.5" transform="rotate(-28 210 313)"/>`,
      // Open coat over a sash, plus a wide belt with a brass buckle.
      torso: (p) => `<path d="M 112 200 L 136 212 L 130 292 L 108 292 Z M 188 200 L 164 212 L 170 292 L 192 292 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`
        + `<path d="M 132 214 L 186 254 L 184 270 L 130 230 Z" fill="#f4d35e" stroke="#b9982c" stroke-width="1.5"/>`
        + `<rect x="112" y="266" width="76" height="18" fill="#3a2a1e" stroke="#20150e" stroke-width="1.5"/>`
        + `<rect x="140" y="264" width="22" height="22" rx="3" fill="#f4d35e" stroke="#a8862a" stroke-width="2"/>`,
      // Proper tricorn: broad brim that sweeps up at both corners, hat band,
      // and a skull-and-crossbones badge.
      head: () => `<path d="M 74 122 C 80 90 110 66 150 66 C 190 66 220 90 226 122 C 200 110 176 104 150 104 C 124 104 100 110 74 122 Z" fill="#241c16" stroke="#0d0906" stroke-width="2.5"/>`
        + `<path d="M 96 104 C 112 92 130 86 150 86 C 170 86 188 92 204 104" fill="none" stroke="#4a3a2c" stroke-width="4"/>`
        + `<path d="M 138 96 L 162 108 M 162 96 L 138 108" fill="none" stroke="#f0ece2" stroke-width="3"/>`
        + `<circle cx="150" cy="98" r="9" fill="#f0ece2"/>`
        + `<circle cx="146" cy="96" r="2.4" fill="#241c16"/><circle cx="154" cy="96" r="2.4" fill="#241c16"/>`
        + `<path d="M 146 104 L 154 104" fill="none" stroke="#241c16" stroke-width="1.6"/>`,
      // Eyepatch + strap, gold hoop, and a proper beard.
      front: () => `<path d="M 118 126 L 190 134" fill="none" stroke="#14100c" stroke-width="3.5"/>`
        + `<circle cx="168" cy="137" r="13" fill="#14100c"/>`
        + `<path d="M 122 150 C 124 178 134 196 150 202 C 166 196 176 178 178 150 C 168 160 132 160 122 150 Z" fill="#3a2a1e" stroke="#20150e" stroke-width="1.5"/>`
        + `<path d="M 136 162 C 142 158 158 158 164 162" fill="none" stroke="#20150e" stroke-width="1.5" opacity="0.7"/>`
        + `<circle cx="110" cy="152" r="6" fill="none" stroke="#f4d35e" stroke-width="3"/>`,
    },
    '#8ed11a': {                                          // Plastic army man
      // The display stand every figure now has IS his old molded base — he
      // just gets to keep being entirely one color.
      label: 'army man', plastic: true,
      head: (p) => `<path d="M 104 130 C 104 100 124 84 150 84 C 176 84 196 100 196 130 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`
        + `<rect x="96" y="126" width="108" height="11" rx="5.5" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`,
      front: (p) => `<rect x="126" y="224" width="48" height="20" rx="5" fill="${p.lo}" stroke="${p.line}" stroke-width="1.5"/>`
        + `<circle cx="138" cy="234" r="7" fill="${p.line}"/><circle cx="162" cy="234" r="7" fill="${p.line}"/>`
        // Molded rifle slung across, and the flash line every plastic figure has.
        + `<path d="M 196 226 L 232 300" fill="none" stroke="${p.lo}" stroke-width="9"/>`
        + `<path d="M 196 226 L 232 300" fill="none" stroke="${p.line}" stroke-width="2"/>`
        + `<path d="M 206 250 L 220 244" fill="none" stroke="${p.lo}" stroke-width="7"/>`
        + `<rect x="112" y="266" width="76" height="12" fill="${p.lo}" stroke="${p.line}" stroke-width="1.5"/>`
        + `<path d="M 96 366 L 204 366" fill="none" stroke="${p.line}" stroke-width="2" opacity="0.6"/>`,
    },
    '#ff7a00': {                                          // Construction worker
      label: 'builder',
      torso: () => `<path d="M 110 238 L 192 238 M 110 256 L 192 256" fill="none" stroke="#f7f36a" stroke-width="7"/>`
        // Tool belt with a pouch.
        + `<rect x="110" y="268" width="80" height="16" fill="#5b3a22" stroke="#331f10" stroke-width="1.5"/>`
        + `<rect x="118" y="282" width="22" height="24" rx="3" fill="#7a4f2e" stroke="#331f10" stroke-width="1.5"/>`,
      // Signature prop: the claw hammer — a keepsake from the retired edition.
      front: () => `<rect x="215" y="216" width="9" height="72" rx="4" fill="#a9754a" stroke="#6f4526" stroke-width="1.5"/>`
        + `<rect x="203" y="200" width="34" height="17" rx="4" fill="#c9d2d9" stroke="#5b6167" stroke-width="1.5"/>`
        + `<path d="M 203 206 C 192 202 186 194 184 186 C 192 188 200 192 205 199 Z" fill="#c9d2d9" stroke="#5b6167" stroke-width="1.5"/>`
        + `<path d="M 208 205 L 228 212" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.5"/>`,
      head: () => `<path d="M 106 126 C 106 96 126 80 150 80 C 174 80 194 96 194 126 Z" fill="#ffb020" stroke="#c07d0a" stroke-width="2"/>`
        + `<rect x="96" y="122" width="108" height="12" rx="6" fill="#ffb020" stroke="#c07d0a" stroke-width="2"/>`
        + `<path d="M 150 82 L 150 122" fill="none" stroke="#c07d0a" stroke-width="2.5" opacity="0.6"/>`,
    },
    '#8a3ffc': {                                          // Wizard
      label: 'wizard',
      head: (p) => `<path d="M 150 22 C 166 60 182 96 196 124 L 104 124 C 118 96 134 60 150 22 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`
        + `<ellipse cx="150" cy="124" rx="58" ry="12" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`
        + `<path d="M 150 54 L 154 64 L 164 64 L 156 71 L 159 82 L 150 75 L 141 82 L 144 71 L 136 64 L 146 64 Z" fill="#ffe27a"/>`,
      torso: () => `<path d="M 134 214 L 140 226 L 152 220 L 148 234 L 160 232 L 150 242" fill="none" stroke="#ffe27a" stroke-width="3"/>`
        + `<path d="M 118 262 L 126 274 L 138 268 M 168 250 L 176 262 L 188 256" fill="none" stroke="#ffe27a" stroke-width="2.6"/>`
        + `<rect x="112" y="272" width="76" height="14" fill="#4a2f5e" stroke="#2d1a3b" stroke-width="1.5"/>`,
      front: () => `<path d="M 126 158 C 128 202 140 228 150 238 C 160 228 172 202 174 158 C 166 172 134 172 126 158 Z" fill="#f2f2ee" stroke="#c9c9c4" stroke-width="1.5"/>`
        + `<path d="M 134 176 C 140 172 160 172 166 176 M 136 196 C 142 192 158 192 164 196" fill="none" stroke="#d4d4cf" stroke-width="1.8"/>`
        + `<rect x="206" y="176" width="9" height="200" rx="4" fill="#8a5c37" stroke="#5f3d21" stroke-width="1.5"/>`
        + `<circle cx="210" cy="166" r="15" fill="#8fe3ff" stroke="#4aa8cc" stroke-width="2"/>`
        + `<circle cx="210" cy="166" r="6" fill="#ffffff" opacity="0.7"/>`,
    },
    '#5fcfe6': {                                          // Scuba diver
      label: 'diver',
      behind: () => `<rect x="92" y="208" width="26" height="66" rx="11" fill="#c9d2d9" stroke="#8b9299" stroke-width="2"/>`,
      head: () => `<rect x="114" y="118" width="72" height="36" rx="13" fill="#9fe8ff" opacity="0.72" stroke="#3f8fae" stroke-width="3"/>`
        + `<path d="M 186 122 C 202 126 204 144 202 162" fill="none" stroke="#ff8a2b" stroke-width="8"/>`,
      // No flippers: on a standing figure they read as a puddle at the feet.
      // The mask, snorkel and tank already make the diver unmistakable.
      front: () => `<rect x="106" y="266" width="88" height="16" rx="4" fill="#2f7f95" stroke="#1d5568" stroke-width="2"/>`
        + `<rect x="140" y="262" width="20" height="24" rx="4" fill="#c9d2d9" stroke="#8b9299" stroke-width="1.5"/>`
        // Air hose looping from the tank round to the mask, plus a gauge.
        + `<path d="M 104 218 C 84 240 86 268 104 282" fill="none" stroke="#f0a03c" stroke-width="6"/>`
        + `<path d="M 104 218 C 108 200 118 150 124 140" fill="none" stroke="#f0a03c" stroke-width="6"/>`
        + `<circle cx="98" cy="290" r="9" fill="#e7edf2" stroke="#8b9299" stroke-width="2"/>`
        + `<path d="M 98 290 L 102 285" fill="none" stroke="#43586b" stroke-width="2"/>`
        + `<path d="M 116 128 L 184 122" fill="none" stroke="#1d5568" stroke-width="4" opacity="0.8"/>`
        // Signature prop: a little fish friend tagging along.
        + `<path d="M 216 176 C 224 168 234 166 242 170 C 236 178 226 182 218 180 Z" fill="#ff8a2b" stroke="#c25f12" stroke-width="1.5"/>`
        + `<path d="M 242 170 L 250 164 L 249 176 Z" fill="#ff8a2b" stroke="#c25f12" stroke-width="1.5"/>`
        + `<circle cx="223" cy="173" r="1.8" fill="#241c16"/>`
        + `<circle cx="212" cy="164" r="2.5" fill="none" stroke="#9fd7e8" stroke-width="1.5"/>`
        + `<circle cx="206" cy="155" r="3.5" fill="none" stroke="#9fd7e8" stroke-width="1.5"/>`,
    },
    '#3fae1a': {                                          // Chef
      label: 'chef',
      torso: () => `<path d="M 124 212 L 176 212 L 182 292 L 118 292 Z" fill="#fbfbfa" opacity="0.93" stroke="#cfcfc9" stroke-width="1.5"/>`
        + `<circle cx="150" cy="228" r="3.6" fill="#c9c9c4"/><circle cx="150" cy="248" r="3.6" fill="#c9c9c4"/><circle cx="150" cy="268" r="3.6" fill="#c9c9c4"/>`
        + `<path d="M 128 200 L 150 216 L 172 200" fill="none" stroke="#d94141" stroke-width="6"/>`
        // Wooden spoon in hand.
        + `<rect x="208" y="214" width="8" height="120" rx="4" fill="#c99a5c" stroke="#8a6534" stroke-width="1.5"/>`
        + `<ellipse cx="212" cy="204" rx="13" ry="17" fill="#c99a5c" stroke="#8a6534" stroke-width="1.5"/>`,
      head: () => `<path d="M 112 122 C 98 122 94 104 106 96 C 100 82 112 70 126 74 C 132 62 168 62 174 74 C 188 70 200 82 194 96 C 206 104 202 122 188 122 Z" fill="#fbfbfa" stroke="#cfcfc9" stroke-width="2"/>`
        + `<rect x="112" y="118" width="76" height="15" rx="5" fill="#f2f2ee" stroke="#cfcfc9" stroke-width="1.5"/>`,
      front: () => `<path d="M 132 156 C 141 149 146 151 150 156 C 154 151 159 149 168 156 C 158 166 142 166 132 156 Z" fill="#3a2a1e"/>`,
    },
    '#ff5b86': {                                          // Ballerina
      label: 'dancer',
      head: () => `<circle cx="150" cy="88" r="19" fill="#5b3a22" stroke="#3a2414" stroke-width="2"/>`
        + `<path d="M 106 138 C 106 106 126 90 150 90 C 174 90 194 106 194 138 C 180 120 120 120 106 138 Z" fill="#5b3a22" stroke="#3a2414" stroke-width="2"/>`,
      torso: () => `<path d="M 128 196 L 150 214 L 172 196 L 178 236 L 122 236 Z" fill="#ffd9ea" opacity="0.9" stroke="#e79ec0" stroke-width="1.8"/>`
        + `<path d="M 138 210 L 162 210 M 136 222 L 164 222" fill="none" stroke="#e79ec0" stroke-width="2"/>`,
      front: () => `<path d="M 94 284 C 112 266 188 266 206 284 C 188 302 112 302 94 284 Z" fill="#ffd9ea" opacity="0.95" stroke="#e79ec0" stroke-width="2"/>`
        + `<path d="M 100 280 C 118 270 182 270 200 280" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.6"/>`
        // Ribbon at the bun, and pointe-shoe laces.
        + `<path d="M 132 84 L 150 92 L 132 100 Z M 168 84 L 150 92 L 168 100 Z" fill="#ff7ab8" stroke="#d4548c" stroke-width="1.5"/>`
        + `<path d="M 118 344 L 142 336 M 158 336 L 182 344" fill="none" stroke="#ffd9ea" stroke-width="3.5"/>`,
    },
    '#4f63e0': {                                          // Superhero
      label: 'hero',
      behind: (p) => `<path d="M 114 202 C 78 240 72 312 86 358 C 106 342 118 300 120 260 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`
        + `<path d="M 186 202 C 222 240 228 312 214 358 C 194 342 182 300 180 260 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`,
      torso: (p) => `<circle cx="150" cy="240" r="27" fill="none" stroke="#ffd23f" stroke-width="4"/>`
        + `<path d="M 150 218 L 166 240 L 150 264 L 134 240 Z" fill="#ffd23f" stroke="${p.line}" stroke-width="1.5"/>`
        + `<rect x="110" y="270" width="80" height="18" fill="#ffd23f" stroke="${p.line}" stroke-width="1.5"/>`
        + `<rect x="140" y="266" width="22" height="26" rx="4" fill="${p.hi}" stroke="${p.line}" stroke-width="1.8"/>`,
      front: (p) => `<path d="M 110 124 L 190 124 L 186 148 L 160 152 L 150 143 L 140 152 L 114 148 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="1.5"/>`
        + `<circle cx="134" cy="136" r="6" fill="#ffffff"/><circle cx="166" cy="136" r="6" fill="#ffffff"/>`,
    },
    '#ffc233': {                                          // Cowboy
      label: 'cowpoke',
      head: () => `<path d="M 118 120 C 118 94 132 82 150 82 C 168 82 182 94 182 120 Z" fill="#a9754a" stroke="#6f4526" stroke-width="2"/>`
        + `<ellipse cx="150" cy="122" rx="68" ry="14" fill="#a9754a" stroke="#6f4526" stroke-width="2"/>`,
      torso: () => `<path d="M 112 200 L 134 210 L 128 292 L 108 292 Z M 188 200 L 166 210 L 172 292 L 192 292 Z" fill="#8a5c37" stroke="#5f3d21" stroke-width="1.8"/>`
        + `<path d="M 118 262 L 190 262" fill="none" stroke="#5f3d21" stroke-width="2" opacity="0.5"/>`
        + `<path d="M 148 232 L 156 240 L 148 248 L 140 240 Z" fill="#d8bb61" stroke="#a8862a" stroke-width="1.2"/>`,
      front: () => `<path d="M 126 182 L 174 182 L 168 208 L 132 208 Z" fill="#d94141" stroke="#96282b" stroke-width="1.5"/>`
        + `<path d="M 138 196 L 162 196" fill="none" stroke="#96282b" stroke-width="1.6" opacity="0.7"/>`
        + `<circle cx="104" cy="366" r="8" fill="none" stroke="#d8bb61" stroke-width="3"/>`
        + `<circle cx="196" cy="366" r="8" fill="none" stroke="#d8bb61" stroke-width="3"/>`
        // Coiled lasso on the hip.
        + `<circle cx="212" cy="284" r="15" fill="none" stroke="#d9c48a" stroke-width="3"/>`
        + `<circle cx="212" cy="284" r="8" fill="none" stroke="#d9c48a" stroke-width="2.5"/>`,
    },
    '#c8203a': {                                          // Firefighter
      label: 'firefighter',
      torso: () => `<path d="M 110 240 L 192 240 M 110 258 L 192 258" fill="none" stroke="#ffe9a8" stroke-width="7"/>`
        + `<rect x="110" y="272" width="80" height="16" fill="#2e2e33" stroke="#171719" stroke-width="1.5"/>`
        + `<rect x="140" y="268" width="22" height="24" rx="3" fill="#c9d2d9" stroke="#6d767f" stroke-width="1.8"/>`
        // Air tank on the back, showing past the shoulder.
        + `<rect x="92" y="212" width="24" height="62" rx="11" fill="#f0d24a" stroke="#a8862a" stroke-width="2"/>`
        + `<path d="M 104 212 C 108 198 116 190 124 186" fill="none" stroke="#2e2e33" stroke-width="5"/>`,
      head: () => `<path d="M 92 126 C 106 116 194 116 208 126 C 200 138 100 138 92 126 Z" fill="#d3232b" stroke="#8d1216" stroke-width="2"/>`
        + `<path d="M 106 126 C 106 96 126 80 150 80 C 174 80 194 96 194 126 Z" fill="#d3232b" stroke="#8d1216" stroke-width="2"/>`
        + `<path d="M 138 90 L 162 90 L 158 114 L 142 114 Z" fill="#f4d35e" stroke="#a8862a" stroke-width="1.5"/>`,
      front: () => `<rect x="208" y="176" width="9" height="200" rx="4" fill="#8a5c37" stroke="#5f3d21" stroke-width="1.5"/>`
        + `<path d="M 199 146 L 231 148 L 234 174 L 212 176 Z" fill="#c9d2d9" stroke="#8b9299" stroke-width="1.5"/>`,
    },
    '#ff9ecf': {                                          // Clown
      label: 'clown',
      head: () => `<circle cx="108" cy="128" r="25" fill="#ff5b1f"/><circle cx="192" cy="128" r="25" fill="#4fd1a5"/>`
        + `<circle cx="124" cy="100" r="23" fill="#ffd23f"/><circle cx="176" cy="100" r="23" fill="#7cc4ff"/>`
        + `<circle cx="150" cy="90" r="23" fill="#c88cff"/>`,
      torso: () => `<circle cx="126" cy="222" r="7" fill="#7cc4ff"/><circle cx="172" cy="238" r="7" fill="#ffd23f"/>`
        + `<circle cx="132" cy="262" r="7" fill="#4fd1a5"/><circle cx="176" cy="278" r="7" fill="#ff5b1f"/>`
        + `<circle cx="150" cy="244" r="7" fill="#c88cff"/>`,
      front: () => `<circle cx="150" cy="150" r="12" fill="#ff3b30" stroke="#b8231c" stroke-width="1.5"/>`
        + `<circle cx="146" cy="146" r="4" fill="#ffffff" opacity="0.6"/>`
        // Oversized bow tie and floppy shoes.
        + `<path d="M 150 196 L 126 186 L 126 208 Z M 150 196 L 174 186 L 174 208 Z" fill="#ffd23f" stroke="#c79a12" stroke-width="1.8"/>`
        + `<circle cx="150" cy="196" r="6" fill="#ff3b30" stroke="#b8231c" stroke-width="1.5"/>`
        + `<ellipse cx="100" cy="366" rx="36" ry="13" fill="#ff3b30" stroke="#b8231c" stroke-width="2"/>`
        + `<ellipse cx="200" cy="366" rx="36" ry="13" fill="#ff3b30" stroke="#b8231c" stroke-width="2"/>`
        + `<path d="M 74 362 C 84 356 96 356 104 360 M 226 362 C 216 356 204 356 196 360" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.45"/>`,
    },
  };
  const PERSON_FALLBACK = PERSONS['#1f9bff'];
  function peoplePalette(base) {
    return {
      base,
      hi: shadeHex(base, 0.18), lo: shadeHex(base, -0.26), line: shadeHex(base, -0.52),
      v: PERSONS[String(base).toLowerCase()] || PERSON_FALLBACK,
    };
  }
  function peopleBodySVG(p) {
    const v = p.v;
    const part = (f) => (typeof f === 'function' ? f(p) : '');
    // A plastic figure is molded in one color — no separate skin tone.
    const skin = v.plastic ? p.base : PEOPLE.skin;
    const skinHi = v.plastic ? p.hi : PEOPLE.skinHi;
    const skinLo = v.plastic ? p.lo : PEOPLE.skinLo;
    const skinLine = v.plastic ? p.line : PEOPLE.skinLine;
    const iris = v.plastic ? p.line : PEOPLE.iris;
    const pupil = v.plastic ? shadeHex(p.line, -0.35) : PEOPLE.pupil;
    const face = v.plastic
      ? `<circle cx="134" cy="136" r="5.5" fill="${iris}"/>
<circle cx="166" cy="136" r="5.5" fill="${iris}"/>
<circle cx="132" cy="134" r="1.8" fill="#ffffff" opacity="0.75"/>
<circle cx="164" cy="134" r="1.8" fill="#ffffff" opacity="0.75"/>
<path d="M 138 158 C 144 165 156 165 162 158" fill="none" stroke="${p.line}" stroke-width="2.8"/>`
      : `<ellipse cx="134" cy="136" rx="9.5" ry="11" fill="${PEOPLE.eyeWhite}" stroke="${skinLine}" stroke-width="1.2"/>
<ellipse cx="166" cy="136" rx="9.5" ry="11" fill="${PEOPLE.eyeWhite}" stroke="${skinLine}" stroke-width="1.2"/>
<circle cx="135" cy="138" r="4.6" fill="${iris}"/>
<circle cx="167" cy="138" r="4.6" fill="${iris}"/>
<circle cx="135" cy="138" r="2.2" fill="${pupil}"/>
<circle cx="167" cy="138" r="2.2" fill="${pupil}"/>
<circle cx="132.5" cy="134.5" r="1.8" fill="#ffffff"/>
<circle cx="164.5" cy="134.5" r="1.8" fill="#ffffff"/>
<path d="M 148 146 C 149 152 151 152 152 146" fill="none" stroke="${skinLo}" stroke-width="2" opacity="0.7"/>
<path d="M 146 152 L 154 152" fill="none" stroke="${skinLo}" stroke-width="1.4" opacity="0.45"/>
<path d="M 138 161 C 144 169 156 169 162 161" fill="none" stroke="${PEOPLE.mouth}" stroke-width="2.8"/>
<path d="M 142 163 C 146 167 154 167 158 163" fill="none" stroke="${PEOPLE.lip}" stroke-width="1.6" opacity="0.7"/>
<ellipse cx="118" cy="152" rx="7" ry="5" fill="#e89a90" opacity="0.32"/>
<ellipse cx="182" cy="152" rx="7" ry="5" fill="#e89a90" opacity="0.32"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gPe" x1="106" y1="0" x2="194" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
<linearGradient id="gSkin" x1="110" y1="90" x2="190" y2="180" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${skinHi}"/><stop offset="0.55" stop-color="${skin}"/><stop offset="1" stop-color="${skinLo}"/>
</linearGradient>
<linearGradient id="gBoot" x1="0" y1="350" x2="0" y2="376" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${v.plastic ? p.lo : PEOPLE.boot}"/><stop offset="1" stop-color="${v.plastic ? p.line : PEOPLE.bootSole}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
${part(v.behind)}
<!-- shoes -->
<path d="M 108 348 C 108 342 116 338 128 338 L 148 338 C 152 338 154 342 154 348 L 154 372 C 154 376 150 378 144 378 L 118 378 C 110 378 108 374 108 368 Z" fill="url(#gBoot)" stroke="${v.plastic ? p.line : PEOPLE.bootLine}" stroke-width="2"/>
<path d="M 146 348 C 146 342 154 338 166 338 L 186 338 C 192 338 194 342 194 348 L 194 372 C 194 376 190 378 184 378 L 158 378 C 150 378 146 374 146 368 Z" fill="url(#gBoot)" stroke="${v.plastic ? p.line : PEOPLE.bootLine}" stroke-width="2"/>
<path d="M 112 372 L 150 372 M 150 372 L 190 372" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.12"/>
<!-- legs -->
<path d="M 120 286 C 118 300 118 330 120 348 L 146 348 C 148 330 148 300 146 286 Z" fill="url(#gPe)" stroke="${p.line}" stroke-width="2"/>
<path d="M 154 286 C 152 300 152 330 154 348 L 180 348 C 182 330 182 300 180 286 Z" fill="url(#gPe)" stroke="${p.line}" stroke-width="2"/>
<path d="M 126 292 L 126 340 M 160 292 L 160 340" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.14"/>
<!-- neck -->
<path d="M 138 168 C 138 176 140 184 142 190 L 158 190 C 160 184 162 176 162 168 Z" fill="url(#gSkin)" stroke="${skinLine}" stroke-width="1.8"/>
<!-- torso -->
<path d="M 112 208 C 112 192 128 184 150 184 C 172 184 188 192 188 208 L 192 288 C 192 294 186 298 178 298 L 122 298 C 114 298 108 294 108 288 Z" fill="url(#gPe)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 120 200 C 134 194 166 194 180 200" fill="none" stroke="${p.line}" stroke-width="4" opacity="0.18"/>
<path d="M 116 214 C 114 242 114 268 116 288" fill="none" stroke="#ffffff" stroke-width="3.5" opacity="0.16"/>
${part(v.torso)}
<!-- arms + hands -->
<path d="M 112 206 C 96 214 86 236 82 262 C 80 274 84 286 94 288 C 102 274 108 248 114 224 Z" fill="url(#gPe)" stroke="${p.line}" stroke-width="2"/>
<path d="M 188 206 C 204 214 214 236 218 262 C 220 274 216 286 206 288 C 198 274 192 248 186 224 Z" fill="url(#gPe)" stroke="${p.line}" stroke-width="2"/>
<ellipse cx="88" cy="292" rx="12" ry="11" fill="url(#gSkin)" stroke="${skinLine}" stroke-width="1.8"/>
<ellipse cx="212" cy="292" rx="12" ry="11" fill="url(#gSkin)" stroke="${skinLine}" stroke-width="1.8"/>
<!-- head -->
<ellipse cx="150" cy="138" rx="44" ry="48" fill="url(#gSkin)" stroke="${skinLine}" stroke-width="2.4"/>
<path d="M 118 118 C 128 102 142 94 152 93" fill="none" stroke="#ffffff" stroke-width="4.5" opacity="0.22"/>
<!-- soft ears -->
<ellipse cx="106" cy="142" rx="8" ry="11" fill="${skinLo}" stroke="${skinLine}" stroke-width="1.5"/>
<ellipse cx="194" cy="142" rx="8" ry="11" fill="${skinLo}" stroke="${skinLine}" stroke-width="1.5"/>
<ellipse cx="106" cy="142" rx="4" ry="6" fill="${skin}" opacity="0.7"/>
<ellipse cx="194" cy="142" rx="4" ry="6" fill="${skin}" opacity="0.7"/>
${face}
${part(v.head)}
${part(v.front)}
</g>
</svg>`;
  }
  function drawPeople(ctx, opts) {
    const color = opts.color || '#d62828';
    // Flat cartoony SVG cast (AI PNG casts retired — they read too 3D).
    drawSingleSprite(ctx, 'people', color, peoplePalette(color), peopleBodySVG);
  }


  // ── Gods skin ──────────────────────────────────────────────────────────────
  // Mid-ladder pantheon (25 wins). Twelve deities on one shared semi-realistic
  // body — sprite changes with the player's colour (see GOD_CAST). Normal flip
  // physics; Alien is the only edition that changes the sport.
  //
  // Only HISTORICAL pantheons are used — Egyptian, Greek, Roman, Norse, Aztec,
  // Celtic. Living faiths are deliberately left out: turning a currently
  // worshipped deity into a flippable game object is the sort of thing a family
  // could reasonably object to, and it is a classroom that would absorb that.
  //
  // The cast is chosen so no two share a silhouette at game size — three animal
  // heads, two helmets, two beard-and-prop pairs, a serpent, a goggle mask,
  // antlers and an eye patch.
  //
  // Costume slots, painted over the shared body in this order:
  //   behind   — anything BEHIND the figure (capes, wings, staves)
  //   torso    — collars, armour, drapes
  //   headBase — replaces/recolours the skull itself (animal heads live here)
  //   face     — optional; REPLACES the default eyes+mouth entirely
  //   head     — crowns, helmets, ears, headdresses (over the face)
  //   front    — hand props, drawn last
  const GODS = {
    skin: '#e8b892', skinHi: '#f3d0b0', skinLo: '#c9926e', skinLine: '#8f6348',
    eye: '#14100c', eyeWhite: '#ffffff', iris: '#3a2a1c',
    mouth: '#a05048', lip: '#c46a62',
    gold: '#f4d35e', goldLine: '#a8862a',
    boot: '#2f343c', bootLine: '#1a1d22', bootSole: '#171a1e',
    white: '#f2f2ee', whiteLine: '#cfcfc9',
    jackal: '#2f2a33', jackalLo: '#1a171d',
    jade: '#3fae8f', jadeLo: '#2a7a63',
    falcon: '#9a7550', falconLo: '#71553a',
    cat: '#c8a06a', catLo: '#9c7b4e',
    serpent: '#3fae5a', serpentLo: '#2a7a3f',
    steel: '#c9d2d9', steelLo: '#8b9299',
    leather: '#8a5c37', leatherLo: '#5f3d21',
    sea: '#4fbfae', seaLo: '#2f8a7d',
    antler: '#d9c9a8',
    raven: '#2a2a30',
  };
  // The broad Egyptian collar, shared by the three Egyptian gods with
  // different inlay colours so they read as one pantheon without being clones.
  function egyptCollar(a, b) {
    return `<path d="M 110 196 C 122 226 178 226 190 196 C 196 210 194 224 186 232 C 166 244 134 244 114 232 C 106 224 104 210 110 196 Z" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="2"/>`
      + `<path d="M 118 208 C 132 226 168 226 182 208" fill="none" stroke="${a}" stroke-width="4"/>`
      + `<path d="M 124 220 C 136 234 164 234 176 220" fill="none" stroke="${b}" stroke-width="3.5"/>`;
  }
  const GOD_CAST = {
    '#1f9bff': {                                          // Zeus — Greek
      label: 'Zeus',
      torso: () => `<path d="M 112 200 L 150 224 L 188 200 L 192 292 L 108 292 Z" fill="${GODS.white}" opacity="0.93" stroke="${GODS.whiteLine}" stroke-width="1.5"/>`
        + `<path d="M 126 214 L 150 232 L 174 214" fill="none" stroke="${GODS.goldLine}" stroke-width="3" opacity="0.55"/>`,
      head: () => `<path d="M 126 154 C 122 190 132 216 150 224 C 168 216 178 190 174 154 C 166 166 134 166 126 154 Z" fill="${GODS.white}" stroke="${GODS.whiteLine}" stroke-width="1.8"/>`
        + `<path d="M 132 178 C 140 174 160 174 168 178 M 136 198 C 142 195 158 195 164 198" fill="none" stroke="${GODS.whiteLine}" stroke-width="1.8" opacity="0.8"/>`
        + `<path d="M 130 154 C 138 147 162 147 170 154 C 162 161 138 161 130 154 Z" fill="${GODS.white}" stroke="${GODS.whiteLine}" stroke-width="1.5"/>`
        + `<path d="M 104 116 C 116 100 184 100 196 116" fill="none" stroke="#4f8f3a" stroke-width="5"/>`
        + `<path d="M 112 108 l -9 -6 M 128 100 l -7 -8 M 150 96 l 0 -9 M 172 100 l 7 -8 M 188 108 l 9 -6" fill="none" stroke="#4f8f3a" stroke-width="4.5"/>`,
      front: () => `<path d="M 214 196 L 236 214 L 222 218 L 244 240 L 218 230 L 228 246 L 202 222 L 218 218 L 200 200 Z" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="2"/>`,
    },
    '#e3263c': {                                          // Thor — Norse
      label: 'Thor',
      // Red beard, then a winged helm over it.
      head: () => `<path d="M 126 152 C 122 190 132 218 150 226 C 168 218 178 190 174 152 C 166 164 134 164 126 152 Z" fill="#b8442a" stroke="#8d2f1c" stroke-width="1.8"/>`
        + `<path d="M 132 176 C 140 172 160 172 168 176 M 136 198 C 142 195 158 195 164 198" fill="none" stroke="#8d2f1c" stroke-width="1.8" opacity="0.8"/>`
        + `<path d="M 104 122 C 104 96 124 82 150 82 C 176 82 196 96 196 122 Z" fill="${GODS.steel}" stroke="${GODS.steelLo}" stroke-width="2.5"/>`
        + `<rect x="100" y="118" width="100" height="13" rx="6" fill="${GODS.steel}" stroke="${GODS.steelLo}" stroke-width="2"/>`
        + `<path d="M 104 112 C 88 100 76 84 74 66 C 90 74 102 88 108 104 Z" fill="${GODS.white}" stroke="${GODS.steelLo}" stroke-width="2"/>`
        + `<path d="M 196 112 C 212 100 224 84 226 66 C 210 74 198 88 192 104 Z" fill="${GODS.white}" stroke="${GODS.steelLo}" stroke-width="2"/>`
        + `<path d="M 150 84 L 150 118" fill="none" stroke="${GODS.steelLo}" stroke-width="2.5" opacity="0.7"/>`,
      torso: () => `<path d="M 112 196 L 188 232 M 188 196 L 112 232" fill="none" stroke="${GODS.leather}" stroke-width="9"/>`
        + `<rect x="108" y="248" width="84" height="16" fill="${GODS.leather}" stroke="${GODS.leatherLo}" stroke-width="1.5"/>`
        + `<rect x="138" y="244" width="24" height="24" rx="3" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="2"/>`,
      // Mjolnir.
      front: () => `<rect x="216" y="236" width="10" height="62" rx="4" fill="${GODS.leather}" stroke="${GODS.leatherLo}" stroke-width="1.5"/>`
        + `<rect x="192" y="200" width="58" height="36" rx="5" fill="${GODS.steel}" stroke="${GODS.steelLo}" stroke-width="2.5"/>`
        + `<rect x="206" y="200" width="30" height="36" fill="${GODS.steelLo}" opacity="0.25"/>`
        + `<path d="M 198 210 L 244 210 M 198 226 L 244 226" fill="none" stroke="${GODS.steelLo}" stroke-width="2" opacity="0.55"/>`,
    },
    '#8ed11a': {                                          // Quetzalcoatl — Aztec
      label: 'Quetzalcoatl',
      // Serpent head replaces the skull outright.
      headBase: () => `<circle cx="150" cy="140" r="48" fill="${GODS.serpent}"/>`
        + `<path d="M 108 148 C 120 140 180 140 192 148 C 194 168 178 186 150 190 C 122 186 106 168 108 148 Z" fill="${GODS.serpentLo}"/>`
        + `<path d="M 118 124 C 130 116 170 116 182 124" fill="none" stroke="${GODS.serpentLo}" stroke-width="3" opacity="0.6"/>`,
      // Slit-pupil reptile eyes and a fanged snout.
      face: () => `<ellipse cx="131" cy="136" rx="11" ry="9" fill="${GODS.gold}"/>`
        + `<ellipse cx="169" cy="136" rx="11" ry="9" fill="${GODS.gold}"/>`
        + `<ellipse cx="131" cy="136" rx="2.6" ry="8" fill="${GODS.eye}"/>`
        + `<ellipse cx="169" cy="136" rx="2.6" ry="8" fill="${GODS.eye}"/>`
        + `<ellipse cx="143" cy="164" rx="3" ry="2.2" fill="${GODS.eye}" opacity="0.8"/>`
        + `<ellipse cx="157" cy="164" rx="3" ry="2.2" fill="${GODS.eye}" opacity="0.8"/>`
        + `<path d="M 126 176 C 138 186 162 186 174 176 L 174 181 C 162 192 138 192 126 181 Z" fill="#2a1d16"/>`
        + `<path d="M 133 181 L 137 193 L 142 182 Z M 158 182 L 163 193 L 167 181 Z" fill="${GODS.white}"/>`
        + `<path d="M 150 190 L 150 202 L 144 208 M 150 202 L 156 208" fill="none" stroke="#e3263c" stroke-width="2.5"/>`,
      // Fan of quetzal plumes.
      head: (p) => `<path d="M 150 92 C 150 60 150 44 150 34 M 124 98 C 116 68 110 54 104 42 M 176 98 C 184 68 190 54 196 42 M 136 94 C 130 64 126 50 122 38 M 164 94 C 170 64 174 50 178 38" fill="none" stroke="${p.hi}" stroke-width="10"/>`
        + `<path d="M 150 34 l -6 12 l 12 0 Z M 104 42 l -4 13 l 12 -5 Z M 196 42 l 4 13 l -12 -5 Z" fill="#e3263c"/>`
        + `<path d="M 122 38 l -3 12 l 11 -4 Z M 178 38 l 3 12 l -11 -4 Z" fill="${GODS.gold}"/>`,
      torso: (p) => `<path d="M 110 196 C 124 224 176 224 190 196 C 194 212 190 228 180 234 C 160 244 140 244 120 234 C 110 228 106 212 110 196 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>`
        + `<path d="M 120 210 C 134 226 166 226 180 210" fill="none" stroke="#e3263c" stroke-width="4"/>`
        + `<path d="M 128 222 C 138 232 162 232 172 222" fill="none" stroke="${GODS.gold}" stroke-width="3.5"/>`,
    },
    '#ff7a00': {                                          // Ra — Egyptian
      label: 'Ra',
      // Falcon head.
      headBase: () => `<circle cx="150" cy="140" r="48" fill="${GODS.falcon}"/>`
        + `<path d="M 150 92 C 174 92 192 110 196 132 C 180 122 120 122 104 132 C 108 110 126 92 150 92 Z" fill="${GODS.falconLo}"/>`
        + `<path d="M 112 158 C 124 170 176 170 188 158 C 184 178 168 190 150 192 C 132 190 116 178 112 158 Z" fill="${GODS.falconLo}" opacity="0.7"/>`,
      face: () => `<circle cx="132" cy="138" r="10" fill="${GODS.eyeWhite}"/><circle cx="168" cy="138" r="10" fill="${GODS.eyeWhite}"/>`
        + `<circle cx="133" cy="139" r="5.2" fill="${GODS.eye}"/><circle cx="169" cy="139" r="5.2" fill="${GODS.eye}"/>`
        + `<path d="M 118 128 C 126 121 140 121 146 128 M 182 128 C 174 121 160 121 154 128" fill="none" stroke="${GODS.eye}" stroke-width="3.5"/>`
        + `<path d="M 121 148 L 110 159 M 179 148 L 190 159" fill="none" stroke="${GODS.eye}" stroke-width="3"/>`
        + `<path d="M 136 152 C 143 147 157 147 164 152 C 167 168 160 186 150 196 C 140 186 133 168 136 152 Z" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`
        + `<path d="M 150 178 C 155 184 155 191 150 196 C 145 191 145 184 150 178 Z" fill="${GODS.goldLine}" opacity="0.85"/>`
        + `<ellipse cx="143" cy="158" rx="2.2" ry="1.6" fill="${GODS.goldLine}" opacity="0.7"/>`,
      // Sun disc with the rearing cobra.
      head: () => `<circle cx="150" cy="70" r="27" fill="#ffb020" stroke="#c07d0a" stroke-width="2.5"/>`
        + `<circle cx="142" cy="62" r="8" fill="#ffd76e" opacity="0.7"/>`
        + `<path d="M 134 78 C 124 64 130 46 146 42 C 138 54 140 68 152 76 Z" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="2"/>`,
      torso: () => egyptCollar('#c8203a', '#2f6fb0'),
      front: () => `<rect x="216" y="184" width="9" height="118" rx="4" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`
        + `<path d="M 208 184 C 208 170 232 170 232 184 Z" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`,
    },
    '#8a3ffc': {                                          // Anubis — Egyptian
      label: 'Anubis',
      headBase: () => `<circle cx="150" cy="140" r="48" fill="${GODS.jackal}"/>`
        + `<path d="M 124 158 C 124 146 176 146 176 158 C 178 176 168 190 150 194 C 132 190 122 176 124 158 Z" fill="${GODS.jackalLo}"/>`,
      // Amber eyes: the default ink would vanish on a black skull.
      face: () => `<path d="M 122 126 C 132 118 142 118 148 124 M 178 126 C 168 118 158 118 152 124" fill="none" stroke="${GODS.gold}" stroke-width="3"/>`
        + `<ellipse cx="132" cy="140" rx="8" ry="6.5" fill="${GODS.gold}" transform="rotate(-12 132 140)"/>`
        + `<ellipse cx="168" cy="140" rx="8" ry="6.5" fill="${GODS.gold}" transform="rotate(12 168 140)"/>`
        + `<circle cx="132" cy="140" r="3" fill="#1a1208"/><circle cx="168" cy="140" r="3" fill="#1a1208"/>`
        + `<ellipse cx="150" cy="172" rx="9" ry="6" fill="#0f0d12"/>`
        + `<path d="M 138 186 C 144 191 156 191 162 186" fill="none" stroke="#0f0d12" stroke-width="2.5"/>`,
      head: () => `<path d="M 118 108 L 108 44 L 146 92 Z" fill="${GODS.jackal}" stroke="${GODS.jackalLo}" stroke-width="2"/>`
        + `<path d="M 182 108 L 192 44 L 154 92 Z" fill="${GODS.jackal}" stroke="${GODS.jackalLo}" stroke-width="2"/>`
        + `<path d="M 122 100 L 116 62 L 138 92 Z" fill="${GODS.gold}" opacity="0.45"/>`
        + `<path d="M 178 100 L 184 62 L 162 92 Z" fill="${GODS.gold}" opacity="0.45"/>`,
      torso: () => egyptCollar('#2f6fb0', GODS.jade),
      front: () => `<g transform="translate(214 236)">`
        + `<circle cx="0" cy="-26" r="13" fill="none" stroke="${GODS.gold}" stroke-width="5"/>`
        + `<path d="M 0 -13 L 0 34 M -15 -2 L 15 -2" fill="none" stroke="${GODS.gold}" stroke-width="5"/></g>`,
    },
    '#5fcfe6': {                                          // Neptune — Roman
      label: 'Neptune',
      head: () => `<path d="M 130 160 C 126 196 136 222 150 230 C 164 222 174 196 170 160 C 162 170 138 170 130 160 Z" fill="${GODS.sea}" stroke="${GODS.seaLo}" stroke-width="1.8"/>`
        + `<path d="M 134 184 C 142 179 158 179 166 184 M 137 206 C 143 202 157 202 163 206" fill="none" stroke="${GODS.seaLo}" stroke-width="1.8" opacity="0.85"/>`
        + `<path d="M 132 160 C 139 154 161 154 168 160 C 161 166 139 166 132 160 Z" fill="${GODS.sea}" stroke="${GODS.seaLo}" stroke-width="1.5"/>`
        // Coral crown.
        + `<path d="M 106 114 C 108 96 120 88 128 96 C 132 80 148 76 154 90 C 162 78 178 84 178 98 C 188 94 196 104 194 116 Z" fill="#e88b6a" stroke="#b95f43" stroke-width="2"/>`,
      torso: () => `<path d="M 112 202 C 126 214 138 202 150 214 C 162 202 174 214 188 202" fill="none" stroke="${GODS.sea}" stroke-width="5" opacity="0.9"/>`
        + `<path d="M 112 226 C 126 238 138 226 150 238 C 162 226 174 238 188 226" fill="none" stroke="${GODS.sea}" stroke-width="5" opacity="0.7"/>`,
      // Trident.
      front: () => `<rect x="216" y="176" width="9" height="126" rx="4" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`
        + `<path d="M 200 178 L 200 146 M 220.5 178 L 220.5 138 M 241 178 L 241 146" fill="none" stroke="${GODS.gold}" stroke-width="7"/>`
        + `<path d="M 198 180 L 243 180" fill="none" stroke="${GODS.gold}" stroke-width="7"/>`,
    },
    '#3fae1a': {                                          // Cernunnos — Celtic
      label: 'Cernunnos',
      // Antlers — the whole read, so they get plenty of spread.
      head: () => `<path d="M 122 96 C 110 78 96 66 82 60 M 96 70 L 76 66 M 104 80 L 86 82 M 112 88 L 98 96" fill="none" stroke="${GODS.antler}" stroke-width="6"/>`
        + `<path d="M 178 96 C 190 78 204 66 218 60 M 204 70 L 224 66 M 196 80 L 214 82 M 188 88 L 202 96" fill="none" stroke="${GODS.antler}" stroke-width="6"/>`
        + `<path d="M 126 148 C 124 178 134 200 150 206 C 166 200 176 178 174 148 C 166 158 134 158 126 148 Z" fill="#6b4a2a" stroke="#4a3320" stroke-width="1.8"/>`
        + `<path d="M 132 170 C 140 166 160 166 168 170" fill="none" stroke="#4a3320" stroke-width="1.8" opacity="0.8"/>`,
      // Torc at the throat.
      torso: () => `<path d="M 122 196 C 122 216 178 216 178 196" fill="none" stroke="${GODS.gold}" stroke-width="9"/>`
        + `<circle cx="122" cy="196" r="6" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`
        + `<circle cx="178" cy="196" r="6" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`
        + `<path d="M 118 240 C 132 250 168 250 182 240" fill="none" stroke="#4f8f3a" stroke-width="5" opacity="0.8"/>`,
      // A serpent coiled in the off hand.
      front: () => `<path d="M 210 300 C 232 296 240 278 228 268 C 216 258 200 266 202 280" fill="none" stroke="#4f8f3a" stroke-width="8"/>`
        + `<circle cx="203" cy="284" r="5.5" fill="#4f8f3a"/>`
        + `<circle cx="201" cy="283" r="1.6" fill="${GODS.eye}"/>`,
    },
    '#ff5b86': {                                          // Bastet — Egyptian
      label: 'Bastet',
      // Cat head.
      headBase: () => `<circle cx="150" cy="140" r="48" fill="${GODS.cat}"/>`
        + `<path d="M 112 156 C 124 148 176 148 188 156 C 188 176 172 190 150 192 C 128 190 112 176 112 156 Z" fill="${GODS.catLo}" opacity="0.55"/>`,
      face: () => `<ellipse cx="131" cy="136" rx="11" ry="9" fill="#7fd44a"/>`
        + `<ellipse cx="169" cy="136" rx="11" ry="9" fill="#7fd44a"/>`
        + `<ellipse cx="131" cy="136" rx="2.8" ry="8.5" fill="${GODS.eye}"/>`
        + `<ellipse cx="169" cy="136" rx="2.8" ry="8.5" fill="${GODS.eye}"/>`
        + `<path d="M 122 128 C 128 122 138 122 144 127 M 178 128 C 172 122 162 122 156 127" fill="none" stroke="${GODS.eye}" stroke-width="3"/>`
        + `<path d="M 144 162 L 156 162 L 150 170 Z" fill="#c2506a"/>`
        + `<path d="M 150 170 L 150 176 M 150 176 C 144 182 138 180 136 176 M 150 176 C 156 182 162 180 164 176" fill="none" stroke="${GODS.eye}" stroke-width="2.2"/>`
        + `<path d="M 118 166 L 96 162 M 118 174 L 98 176 M 182 166 L 204 162 M 182 174 L 202 176" fill="none" stroke="${GODS.catLo}" stroke-width="2.2" opacity="0.9"/>`,
      // Upright cat ears + a gold hoop.
      head: () => `<path d="M 116 106 L 112 56 L 152 92 Z" fill="${GODS.cat}" stroke="${GODS.catLo}" stroke-width="2"/>`
        + `<path d="M 184 106 L 188 56 L 148 92 Z" fill="${GODS.cat}" stroke="${GODS.catLo}" stroke-width="2"/>`
        + `<path d="M 121 100 L 119 70 L 141 92 Z" fill="#e8a0b4" opacity="0.75"/>`
        + `<path d="M 179 100 L 181 70 L 159 92 Z" fill="#e8a0b4" opacity="0.75"/>`
        + `<circle cx="104" cy="152" r="7" fill="none" stroke="${GODS.gold}" stroke-width="3.5"/>`,
      torso: () => egyptCollar(GODS.jade, '#c8203a'),
      // Sistrum rattle.
      front: () => `<rect x="216" y="230" width="8" height="66" rx="4" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`
        + `<path d="M 204 230 C 204 200 236 200 236 230" fill="none" stroke="${GODS.gold}" stroke-width="5"/>`
        + `<path d="M 206 214 L 234 214 M 207 222 L 233 222" fill="none" stroke="${GODS.goldLine}" stroke-width="2.5"/>`,
    },
    '#4f63e0': {                                          // Tlaloc — Aztec
      label: 'Tlaloc',
      headBase: () => `<circle cx="150" cy="140" r="48" fill="${GODS.jade}"/>`
        + `<path d="M 106 128 C 118 118 182 118 194 128" fill="none" stroke="${GODS.jadeLo}" stroke-width="3" opacity="0.7"/>`
        + `<path d="M 110 160 C 124 168 176 168 190 160" fill="none" stroke="${GODS.jadeLo}" stroke-width="3" opacity="0.5"/>`,
      // The signature goggle eyes and fangs.
      face: () => `<circle cx="130" cy="140" r="17" fill="none" stroke="${GODS.gold}" stroke-width="5"/>`
        + `<circle cx="170" cy="140" r="17" fill="none" stroke="${GODS.gold}" stroke-width="5"/>`
        + `<circle cx="130" cy="140" r="9" fill="${GODS.eyeWhite}"/><circle cx="170" cy="140" r="9" fill="${GODS.eyeWhite}"/>`
        + `<circle cx="131" cy="141" r="4.6" fill="${GODS.eye}"/><circle cx="171" cy="141" r="4.6" fill="${GODS.eye}"/>`
        + `<path d="M 126 172 C 136 182 164 182 174 172 L 174 178 C 164 190 136 190 126 178 Z" fill="#2a1d16"/>`
        + `<path d="M 134 178 L 138 190 L 143 179 Z M 157 179 L 162 190 L 166 178 Z" fill="${GODS.white}"/>`,
      head: (p) => `<path d="M 150 92 L 150 48 M 122 98 L 106 58 M 178 98 L 194 58 M 136 94 L 126 52 M 164 94 L 174 52" fill="none" stroke="${p.lo}" stroke-width="9"/>`
        + `<path d="M 150 48 l -7 12 l 14 0 Z M 106 58 l -3 14 l 13 -6 Z M 194 58 l 3 14 l -13 -6 Z" fill="${GODS.gold}"/>`
        + `<path d="M 100 106 C 118 88 182 88 200 106 C 182 100 118 100 100 106 Z" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="2"/>`
        + `<circle cx="120" cy="102" r="4" fill="${GODS.jade}"/><circle cx="150" cy="99" r="4" fill="#c8203a"/><circle cx="180" cy="102" r="4" fill="${GODS.jade}"/>`,
      torso: () => `<path d="M 112 198 C 126 222 174 222 188 198 C 192 212 188 226 178 232 C 160 242 140 242 122 232 C 112 226 108 212 112 198 Z" fill="${GODS.jade}" stroke="${GODS.jadeLo}" stroke-width="2"/>`
        + `<circle cx="150" cy="220" r="7" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`,
      front: () => `<path d="M 210 250 l -4 22 M 224 246 l -4 24 M 238 252 l -4 20" fill="none" stroke="#8fd3ff" stroke-width="4" opacity="0.85"/>`,
    },
    '#ffc233': {                                          // Mercury — Roman
      label: 'Mercury',
      // Winged sandals, drawn behind so the boots overlap them.
      behind: () => `<path d="M 106 352 C 90 344 78 330 74 316 C 90 320 102 330 110 342 Z" fill="${GODS.white}" stroke="${GODS.whiteLine}" stroke-width="1.8"/>`
        + `<path d="M 194 352 C 210 344 222 330 226 316 C 210 320 198 330 190 342 Z" fill="${GODS.white}" stroke="${GODS.whiteLine}" stroke-width="1.8"/>`,
      // Winged petasos.
      head: () => `<path d="M 108 112 C 108 88 128 74 150 74 C 172 74 192 88 192 112 Z" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="2.5"/>`
        + `<ellipse cx="150" cy="112" rx="52" ry="11" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="2.5"/>`
        + `<path d="M 100 104 C 84 96 70 84 64 70 C 82 74 96 84 104 96 Z" fill="${GODS.white}" stroke="${GODS.whiteLine}" stroke-width="1.8"/>`
        + `<path d="M 200 104 C 216 96 230 84 236 70 C 218 74 204 84 196 96 Z" fill="${GODS.white}" stroke="${GODS.whiteLine}" stroke-width="1.8"/>`,
      torso: () => `<path d="M 110 200 L 150 220 L 190 200 L 194 240 L 106 240 Z" fill="${GODS.white}" opacity="0.9" stroke="${GODS.whiteLine}" stroke-width="1.5"/>`,
      // Caduceus.
      front: () => `<rect x="216" y="180" width="8" height="122" rx="4" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`
        + `<path d="M 220 196 C 206 206 234 218 220 228 C 206 238 234 250 220 260" fill="none" stroke="#4f8f3a" stroke-width="4"/>`
        + `<path d="M 216 182 C 202 172 194 160 192 148 C 204 152 214 162 218 174 Z" fill="${GODS.white}" stroke="${GODS.whiteLine}" stroke-width="1.5"/>`
        + `<path d="M 224 182 C 238 172 246 160 248 148 C 236 152 226 162 222 174 Z" fill="${GODS.white}" stroke="${GODS.whiteLine}" stroke-width="1.5"/>`,
    },
    '#c8203a': {                                          // Odin — Norse
      label: 'Odin',
      // Raven perched on the shoulder, behind the arm.
      behind: () => `<path d="M 214 176 C 226 168 240 172 244 184 C 248 196 240 208 226 208 C 214 208 206 198 208 188 Z" fill="${GODS.raven}"/>`
        + `<path d="M 244 184 L 258 188 L 244 194 Z" fill="${GODS.gold}"/>`
        + `<circle cx="232" cy="184" r="2.4" fill="${GODS.gold}"/>`
        + `<path d="M 216 194 C 224 200 234 200 240 196" fill="none" stroke="#4a4a52" stroke-width="2"/>`,
      // Grey beard, wide-brimmed traveller's hat.
      head: () => `<path d="M 126 154 C 120 194 132 222 150 230 C 168 222 180 194 174 154 C 166 166 134 166 126 154 Z" fill="#cfd3d6" stroke="#9aa0a5" stroke-width="1.8"/>`
        + `<path d="M 130 178 C 140 173 160 173 170 178 M 134 202 C 142 197 158 197 166 202" fill="none" stroke="#9aa0a5" stroke-width="1.8" opacity="0.85"/>`
        + `<path d="M 130 154 C 138 147 162 147 170 154 C 162 161 138 161 130 154 Z" fill="#cfd3d6" stroke="#9aa0a5" stroke-width="1.5"/>`
        + `<path d="M 112 110 C 112 84 132 70 150 70 C 168 70 188 84 188 110 Z" fill="#5a4a38" stroke="#3a2f22" stroke-width="2.5"/>`
        + `<path d="M 90 112 C 104 100 196 100 210 112 C 196 124 104 124 90 112 Z" fill="#5a4a38" stroke="#3a2f22" stroke-width="2.5"/>`,
      // One eye, one patch.
      face: () => `<circle cx="167" cy="136" r="11.5" fill="${GODS.eyeWhite}" stroke="${GODS.skinLine}" stroke-width="1.3"/>`
        + `<circle cx="169" cy="138" r="5.8" fill="${GODS.eye}"/>`
        + `<circle cx="165" cy="133" r="2.6" fill="#ffffff"/>`
        + `<path d="M 120 126 L 186 132" fill="none" stroke="#2a2620" stroke-width="3.5"/>`
        + `<ellipse cx="133" cy="137" rx="13" ry="11" fill="#2a2620"/>`,
      torso: () => `<path d="M 106 196 C 120 210 180 210 194 196 L 198 244 L 102 244 Z" fill="#3f5a7a" stroke="#2a3d54" stroke-width="2"/>`
        + `<circle cx="120" cy="204" r="8" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`
        + `<circle cx="180" cy="204" r="8" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="1.5"/>`,
      // Gungnir.
      front: () => `<rect x="82" y="150" width="8" height="152" rx="4" fill="${GODS.leather}" stroke="${GODS.leatherLo}" stroke-width="1.5"/>`
        + `<path d="M 86 118 L 96 152 L 76 152 Z" fill="${GODS.steel}" stroke="${GODS.steelLo}" stroke-width="2"/>`,
    },
    '#ff9ecf': {                                          // Athena — Greek
      label: 'Athena',
      // Owl on the shoulder.
      behind: () => `<ellipse cx="228" cy="190" rx="19" ry="22" fill="#a08d6a" stroke="#7a6a4c" stroke-width="2"/>`
        + `<circle cx="221" cy="184" r="6.5" fill="${GODS.eyeWhite}" stroke="#7a6a4c" stroke-width="1.5"/>`
        + `<circle cx="235" cy="184" r="6.5" fill="${GODS.eyeWhite}" stroke="#7a6a4c" stroke-width="1.5"/>`
        + `<circle cx="221" cy="184" r="3" fill="${GODS.eye}"/><circle cx="235" cy="184" r="3" fill="${GODS.eye}"/>`
        + `<path d="M 228 190 L 224 196 L 232 196 Z" fill="${GODS.gold}"/>`
        + `<path d="M 214 174 L 218 166 L 222 174 M 234 174 L 238 166 L 242 174" fill="none" stroke="#7a6a4c" stroke-width="2"/>`,
      // Corinthian helmet pushed back off the face, with a tall crest.
      head: () => `<path d="M 108 116 C 108 88 128 72 150 72 C 172 72 192 88 192 116 C 180 106 120 106 108 116 Z" fill="${GODS.steel}" stroke="${GODS.steelLo}" stroke-width="2.5"/>`
        + `<path d="M 108 116 C 108 130 112 142 118 150 C 116 132 118 122 122 116 Z" fill="${GODS.steel}" stroke="${GODS.steelLo}" stroke-width="2"/>`
        + `<path d="M 192 116 C 192 130 188 142 182 150 C 184 132 182 122 178 116 Z" fill="${GODS.steel}" stroke="${GODS.steelLo}" stroke-width="2"/>`
        + `<path d="M 132 74 C 140 42 160 42 168 74 C 160 62 140 62 132 74 Z" fill="#c8203a" stroke="#8d1622" stroke-width="2"/>`
        + `<path d="M 150 44 C 158 30 176 30 184 44 C 172 38 158 36 150 44 Z" fill="#c8203a" stroke="#8d1622" stroke-width="2"/>`,
      torso: () => `<path d="M 110 200 L 150 222 L 190 200 L 194 292 L 106 292 Z" fill="${GODS.white}" opacity="0.93" stroke="${GODS.whiteLine}" stroke-width="1.5"/>`
        + `<path d="M 128 216 L 150 230 L 172 216" fill="none" stroke="${GODS.goldLine}" stroke-width="3" opacity="0.5"/>`,
      // Round hoplite shield in the off hand.
      front: () => `<circle cx="76" cy="272" r="34" fill="${GODS.gold}" stroke="${GODS.goldLine}" stroke-width="2.5"/>`
        + `<circle cx="76" cy="272" r="24" fill="none" stroke="${GODS.goldLine}" stroke-width="2"/>`
        + `<circle cx="76" cy="272" r="9" fill="${GODS.steel}" stroke="${GODS.steelLo}" stroke-width="1.5"/>`,
    },
  };
  const GOD_FALLBACK = GOD_CAST['#1f9bff'];
  function godPalette(base) {
    return {
      base,
      hi: shadeHex(base, 0.18), lo: shadeHex(base, -0.26), line: shadeHex(base, -0.52),
      v: GOD_CAST[String(base).toLowerCase()] || GOD_FALLBACK,
    };
  }
  function godBodySVG(p) {
    const v = p.v;
    const part = (f) => (typeof f === 'function' ? f(p) : '');
    // Default face — used unless the costume supplies its own (animal heads and
    // masks do, because ink-on-black or ink-on-mask would vanish).
    const face = v.face ? part(v.face) : `
<ellipse cx="133" cy="136" rx="10" ry="11.5" fill="${GODS.eyeWhite}" stroke="${GODS.skinLine}" stroke-width="1.2"/>
<ellipse cx="167" cy="136" rx="10" ry="11.5" fill="${GODS.eyeWhite}" stroke="${GODS.skinLine}" stroke-width="1.2"/>
<circle cx="134" cy="138" r="4.8" fill="${GODS.iris}"/>
<circle cx="168" cy="138" r="4.8" fill="${GODS.iris}"/>
<circle cx="134" cy="138" r="2.3" fill="${GODS.eye}"/>
<circle cx="168" cy="138" r="2.3" fill="${GODS.eye}"/>
<circle cx="131.5" cy="134.5" r="1.9" fill="#ffffff"/>
<circle cx="165.5" cy="134.5" r="1.9" fill="#ffffff"/>
<path d="M 148 146 C 149 153 151 153 152 146" fill="none" stroke="${GODS.skinLo}" stroke-width="2.1" opacity="0.75"/>
<path d="M 146 153 L 154 153" fill="none" stroke="${GODS.skinLo}" stroke-width="1.4" opacity="0.45"/>
<path d="M 138 162 C 144 171 156 171 162 162" fill="none" stroke="${GODS.mouth}" stroke-width="2.9"/>
<path d="M 142 164 C 146 169 154 169 158 164" fill="none" stroke="${GODS.lip}" stroke-width="1.5" opacity="0.65"/>
<ellipse cx="118" cy="152" rx="7" ry="5" fill="#e89a90" opacity="0.28"/>
<ellipse cx="182" cy="152" rx="7" ry="5" fill="#e89a90" opacity="0.28"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gGo" x1="106" y1="0" x2="194" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
<linearGradient id="gGodSkin" x1="110" y1="90" x2="190" y2="180" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${GODS.skinHi}"/><stop offset="0.55" stop-color="${GODS.skin}"/><stop offset="1" stop-color="${GODS.skinLo}"/>
</linearGradient>
<linearGradient id="gGodBoot" x1="0" y1="350" x2="0" y2="376" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${GODS.boot}"/><stop offset="1" stop-color="${GODS.bootSole}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
${part(v.behind)}
<!-- sandals / boots -->
<path d="M 106 348 C 106 342 114 338 126 338 L 148 338 C 152 338 154 342 154 348 L 154 372 C 154 376 150 378 144 378 L 116 378 C 108 378 106 374 106 368 Z" fill="url(#gGodBoot)" stroke="${GODS.bootLine}" stroke-width="2"/>
<path d="M 146 348 C 146 342 154 338 166 338 L 188 338 C 194 338 196 342 196 348 L 196 372 C 196 376 192 378 186 378 L 158 378 C 150 378 146 374 146 368 Z" fill="url(#gGodBoot)" stroke="${GODS.bootLine}" stroke-width="2"/>
<path d="M 114 356 L 148 356 M 152 356 L 188 356" fill="none" stroke="${GODS.gold}" stroke-width="2.2" opacity="0.55"/>
<!-- legs -->
<path d="M 118 284 C 116 300 116 330 118 348 L 146 348 C 148 330 148 300 146 284 Z" fill="url(#gGo)" stroke="${p.line}" stroke-width="2"/>
<path d="M 154 284 C 152 300 152 330 154 348 L 182 348 C 184 330 184 300 182 284 Z" fill="url(#gGo)" stroke="${p.line}" stroke-width="2"/>
<path d="M 124 290 L 124 338 M 160 290 L 160 338" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.14"/>
<!-- neck -->
<path d="M 138 166 C 138 176 140 184 142 190 L 158 190 C 160 184 162 176 162 166 Z" fill="url(#gGodSkin)" stroke="${GODS.skinLine}" stroke-width="1.8"/>
<!-- torso -->
<path d="M 110 208 C 110 192 126 184 150 184 C 174 184 190 192 190 208 L 194 288 C 194 294 188 298 180 298 L 120 298 C 112 298 106 294 106 288 Z" fill="url(#gGo)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 118 214 C 116 242 116 268 118 286" fill="none" stroke="#ffffff" stroke-width="3.5" opacity="0.16"/>
${part(v.torso)}
<!-- arms + hands -->
<path d="M 110 204 C 94 212 84 234 80 260 C 78 274 82 286 92 288 C 100 274 106 246 112 222 Z" fill="url(#gGo)" stroke="${p.line}" stroke-width="2"/>
<path d="M 190 204 C 206 212 216 234 220 260 C 222 274 218 286 208 288 C 200 274 194 246 188 222 Z" fill="url(#gGo)" stroke="${p.line}" stroke-width="2"/>
<ellipse cx="86" cy="292" rx="13" ry="12" fill="url(#gGodSkin)" stroke="${GODS.skinLine}" stroke-width="1.8"/>
<ellipse cx="214" cy="292" rx="13" ry="12" fill="url(#gGodSkin)" stroke="${GODS.skinLine}" stroke-width="1.8"/>
<!-- head -->
<ellipse cx="150" cy="138" rx="46" ry="50" fill="url(#gGodSkin)" stroke="${GODS.skinLine}" stroke-width="2.4"/>
${part(v.headBase)}
<path d="M 118 116 C 128 100 142 92 152 91" fill="none" stroke="#ffffff" stroke-width="4.5" opacity="0.2"/>
<ellipse cx="104" cy="144" rx="8" ry="12" fill="${GODS.skinLo}" stroke="${GODS.skinLine}" stroke-width="1.5"/>
<ellipse cx="196" cy="144" rx="8" ry="12" fill="${GODS.skinLo}" stroke="${GODS.skinLine}" stroke-width="1.5"/>
<ellipse cx="104" cy="144" rx="4" ry="6.5" fill="${GODS.skin}" opacity="0.7"/>
<ellipse cx="196" cy="144" rx="4" ry="6.5" fill="${GODS.skin}" opacity="0.7"/>
${face}
${part(v.head)}
${part(v.front)}
</g>
</svg>`;
  }
  function drawGods(ctx, opts) {
    const color = opts.color || '#1f9bff';
    drawSingleSprite(ctx, 'gods', color, godPalette(color), godBodySVG);
  }

  // ── Alien skin ─────────────────────────────────────────────────────────────
  // The 100-win capstone, and the ONLY edition that changes the rules (bank shot
  // instead of a flip). Also an edition whose SPRITE CHANGES WITH THE PLAYER'S
  // COLOUR — twelve distinct alien SPECIES on one shared spindly body. Cast is
  // keyed to FLAVORS hexes so each color summons a different looking visitor
  // (Grey, Greenie, Mantid, …).
  //
  // Species are classroom-safe archetypes (no living-faith symbols, no
  // trademarked franchise likenesses) chosen so no two share a silhouette at
  // game size.
  const ALIEN = {
    eye: '#0b0b12', glint: '#ffffff',
    mouth: '#6b756e', nostril: '#6b756e',
    bulb: '#c9f9ff', bulbLine: '#57b4c4',
    metal: '#c9d2d9', metalLo: '#6d767e',
    led: '#69f0ae',
  };
  const ALIEN_CAST = {
    '#1f9bff': {                                          // Roswell Grey
      label: 'grey',
      skin: '#b3bdb7',
      head: (p) => `
<path d="M 150 44 C 96 44 62 88 62 136 C 62 168 84 194 108 208 C 126 218 142 230 150 242 C 158 230 174 218 192 208 C 216 194 238 168 238 136 C 238 88 204 44 150 44 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 92 104 C 108 82 138 86 148 102" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.3"/>
<ellipse cx="112" cy="150" rx="31" ry="18" fill="${ALIEN.eye}" transform="rotate(-28 112 150)"/>
<ellipse cx="188" cy="150" rx="31" ry="18" fill="${ALIEN.eye}" transform="rotate(28 188 150)"/>
<ellipse cx="101" cy="142" rx="7.5" ry="4.5" fill="${ALIEN.glint}" opacity="0.85" transform="rotate(-28 101 142)"/>
<ellipse cx="177" cy="142" rx="7.5" ry="4.5" fill="${ALIEN.glint}" opacity="0.85" transform="rotate(28 177 142)"/>
<path d="M 145 190 L 144 196 M 155 190 L 156 196" fill="none" stroke="${ALIEN.nostril}" stroke-width="2.6" opacity="0.75"/>
<path d="M 142 212 L 158 212" fill="none" stroke="${ALIEN.mouth}" stroke-width="2.6"/>`,
    },
    '#e3263c': {                                          // Little Green Man
      label: 'greenie',
      skin: '#6cbc3a',
      head: (p) => `
<path d="M 118 52 L 108 18 L 128 44 Z M 182 52 L 192 18 L 172 44 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<circle cx="108" cy="14" r="10" fill="${ALIEN.bulb}" stroke="${ALIEN.bulbLine}" stroke-width="2"/>
<circle cx="192" cy="14" r="10" fill="${ALIEN.bulb}" stroke="${ALIEN.bulbLine}" stroke-width="2"/>
<circle cx="150" cy="132" r="78" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 100 90 C 118 70 150 68 170 82" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.28"/>
<ellipse cx="120" cy="128" rx="18" ry="24" fill="${ALIEN.eye}"/>
<ellipse cx="180" cy="128" rx="18" ry="24" fill="${ALIEN.eye}"/>
<circle cx="114" cy="118" r="5" fill="${ALIEN.glint}"/>
<circle cx="174" cy="118" r="5" fill="${ALIEN.glint}"/>
<path d="M 136 168 C 144 180 156 180 164 168" fill="none" stroke="${p.line}" stroke-width="3.5"/>
<path d="M 150 148 L 150 158" fill="none" stroke="${p.line}" stroke-width="2.5" opacity="0.7"/>`,
    },
    '#8ed11a': {                                          // Mantid
      label: 'mantid',
      skin: '#8ed11a',
      head: (p) => `
<path d="M 150 36 C 96 52 70 110 86 170 C 98 210 130 236 150 246 C 170 236 202 210 214 170 C 230 110 204 52 150 36 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 118 28 L 104 6 M 182 28 L 196 6" fill="none" stroke="${p.lo}" stroke-width="5"/>
<circle cx="104" cy="6" r="7" fill="${p.hi}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="196" cy="6" r="7" fill="${p.hi}" stroke="${p.line}" stroke-width="1.5"/>
<ellipse cx="118" cy="132" rx="28" ry="34" fill="${ALIEN.eye}"/>
<ellipse cx="182" cy="132" rx="28" ry="34" fill="${ALIEN.eye}"/>
<circle cx="124" cy="120" r="8" fill="#7CFF6A" opacity="0.55"/>
<circle cx="188" cy="120" r="8" fill="#7CFF6A" opacity="0.55"/>
<path d="M 138 188 C 144 204 156 204 162 188" fill="none" stroke="${p.line}" stroke-width="3"/>
<path d="M 132 200 L 120 220 M 168 200 L 180 220" fill="none" stroke="${p.lo}" stroke-width="4"/>`,
    },
    '#ff7a00': {                                          // Cyclops
      label: 'cyclops',
      skin: '#e8a060',
      head: (p) => `
<path d="M 150 40 C 92 48 68 110 78 168 C 86 214 118 240 150 248 C 182 240 214 214 222 168 C 232 110 208 48 150 40 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 40 L 150 8 L 136 28 L 164 28 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<circle cx="150" cy="132" r="48" fill="${ALIEN.eye}" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="132" r="22" fill="#1f9bff"/>
<circle cx="150" cy="132" r="10" fill="${ALIEN.eye}"/>
<circle cx="138" cy="118" r="8" fill="${ALIEN.glint}" opacity="0.85"/>
<path d="M 130 198 C 140 210 160 210 170 198" fill="none" stroke="${p.line}" stroke-width="3.5"/>`,
    },
    '#8a3ffc': {                                          // Cephalopod
      label: 'cephalopod',
      skin: '#7a4fd1',
      behind: (p) => `
<path d="M 96 220 C 70 250 62 300 74 340" fill="none" stroke="${p.lo}" stroke-width="10"/>
<path d="M 204 220 C 230 250 238 300 226 340" fill="none" stroke="${p.lo}" stroke-width="10"/>
<path d="M 110 230 C 90 270 88 320 104 356" fill="none" stroke="${p.base}" stroke-width="8"/>
<path d="M 190 230 C 210 270 212 320 196 356" fill="none" stroke="${p.base}" stroke-width="8"/>`,
      head: (p) => `
<path d="M 150 30 C 88 40 64 110 78 180 C 90 228 120 250 150 256 C 180 250 210 228 222 180 C 236 110 212 40 150 30 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 100 70 C 120 50 160 48 186 66" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.25"/>
<ellipse cx="118" cy="130" rx="20" ry="28" fill="${ALIEN.eye}"/>
<ellipse cx="182" cy="130" rx="20" ry="28" fill="${ALIEN.eye}"/>
<circle cx="112" cy="118" r="6" fill="${ALIEN.glint}"/>
<circle cx="176" cy="118" r="6" fill="${ALIEN.glint}"/>
<path d="M 124 200 C 130 230 140 250 150 258 C 160 250 170 230 176 200" fill="none" stroke="${p.lo}" stroke-width="7"/>
<path d="M 132 210 C 138 236 146 250 150 254 C 154 250 162 236 168 210" fill="none" stroke="${p.hi}" stroke-width="5"/>
<circle cx="128" cy="248" r="6" fill="${p.hi}"/><circle cx="150" cy="256" r="6" fill="${p.hi}"/><circle cx="172" cy="248" r="6" fill="${p.hi}"/>`,
    },
    '#5fcfe6': {                                          // Nordic
      label: 'nordic',
      skin: '#e8f4f8',
      head: (p) => `
<path d="M 150 48 C 104 48 78 96 82 148 C 86 190 112 222 150 236 C 188 222 214 190 218 148 C 222 96 196 48 150 48 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 110 70 C 130 52 170 52 190 70 C 176 92 124 92 110 70 Z" fill="#f7e7a0" stroke="#c6b36a" stroke-width="1.5"/>
<path d="M 120 78 C 136 68 164 68 180 78" fill="none" stroke="#fff6c8" stroke-width="3" opacity="0.7"/>
<ellipse cx="124" cy="140" rx="16" ry="10" fill="#3a6a88" transform="rotate(-12 124 140)"/>
<ellipse cx="176" cy="140" rx="16" ry="10" fill="#3a6a88" transform="rotate(12 176 140)"/>
<circle cx="120" cy="138" r="4" fill="${ALIEN.eye}"/>
<circle cx="172" cy="138" r="4" fill="${ALIEN.eye}"/>
<path d="M 138 176 C 146 184 154 184 162 176" fill="none" stroke="#9ab0bc" stroke-width="2.5"/>`,
    },
    '#3fae1a': {                                          // Reptilian
      label: 'reptilian',
      skin: '#3a9a4a',
      head: (p) => `
<path d="M 150 50 C 100 58 74 110 84 168 C 92 210 118 236 150 250 C 182 236 208 210 216 168 C 226 110 200 58 150 50 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 110 64 L 124 34 L 140 60 M 190 64 L 176 34 L 160 60 M 150 50 L 150 24" fill="none" stroke="${p.lo}" stroke-width="5"/>
<path d="M 118 168 L 150 210 L 182 168 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<ellipse cx="120" cy="128" rx="18" ry="14" fill="${ALIEN.eye}"/>
<ellipse cx="180" cy="128" rx="18" ry="14" fill="${ALIEN.eye}"/>
<path d="M 120 122 L 120 134 M 180 122 L 180 134" fill="none" stroke="#7CFF6A" stroke-width="3"/>
<path d="M 108 100 C 130 88 170 88 192 100" fill="none" stroke="${p.hi}" stroke-width="3" opacity="0.45"/>
<path d="M 130 200 C 140 214 160 214 170 200" fill="none" stroke="${p.line}" stroke-width="3"/>`,
    },
    '#ff5b86': {                                          // Blob
      label: 'blob',
      skin: '#ff7aa0',
      head: (p) => `
<path d="M 150 28 C 70 40 48 140 78 210 C 100 250 130 262 150 262 C 170 262 200 250 222 210 C 252 140 230 40 150 28 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 90 90 C 120 60 170 55 210 88" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.25"/>
<circle cx="118" cy="130" r="16" fill="${ALIEN.eye}"/>
<circle cx="170" cy="118" r="12" fill="${ALIEN.eye}"/>
<circle cx="156" cy="160" r="10" fill="${ALIEN.eye}"/>
<circle cx="112" cy="122" r="5" fill="${ALIEN.glint}"/>
<circle cx="166" cy="112" r="4" fill="${ALIEN.glint}"/>
<circle cx="152" cy="154" r="3" fill="${ALIEN.glint}"/>
<path d="M 124 200 C 140 220 168 216 180 196" fill="none" stroke="${p.line}" stroke-width="4"/>`,
    },
    '#4f63e0': {                                          // Android
      label: 'android',
      skin: '#9aa6b5',
      head: (p) => `
<rect x="86" y="52" width="128" height="170" rx="22" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 100 70 L 200 70" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.3"/>
<rect x="104" y="110" width="40" height="28" rx="6" fill="${ALIEN.led}" stroke="${p.line}" stroke-width="2"/>
<rect x="156" y="110" width="40" height="28" rx="6" fill="${ALIEN.led}" stroke="${p.line}" stroke-width="2"/>
<circle cx="124" cy="124" r="6" fill="${ALIEN.eye}"/>
<circle cx="176" cy="124" r="6" fill="${ALIEN.eye}"/>
<rect x="126" y="168" width="48" height="10" rx="4" fill="${ALIEN.metalLo}"/>
<path d="M 150 52 L 150 18" fill="none" stroke="${ALIEN.metal}" stroke-width="5"/>
<circle cx="150" cy="12" r="12" fill="${ALIEN.metal}" stroke="${ALIEN.metalLo}" stroke-width="2"/>
<circle cx="150" cy="12" r="5" fill="${ALIEN.led}"/>
<path d="M 86 140 L 68 140 M 214 140 L 232 140" fill="none" stroke="${ALIEN.metal}" stroke-width="6"/>
<circle cx="64" cy="140" r="8" fill="${ALIEN.metalLo}"/><circle cx="236" cy="140" r="8" fill="${ALIEN.metalLo}"/>`,
    },
    '#ffc233': {                                          // Conehead
      label: 'conehead',
      skin: '#d4c48a',
      head: (p) => `
<path d="M 150 8 L 230 200 L 70 200 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 8 L 170 120" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.25"/>
<ellipse cx="124" cy="150" rx="22" ry="14" fill="${ALIEN.eye}" transform="rotate(-18 124 150)"/>
<ellipse cx="176" cy="150" rx="22" ry="14" fill="${ALIEN.eye}" transform="rotate(18 176 150)"/>
<ellipse cx="116" cy="144" rx="5" ry="3" fill="${ALIEN.glint}" transform="rotate(-18 116 144)"/>
<ellipse cx="168" cy="144" rx="5" ry="3" fill="${ALIEN.glint}" transform="rotate(18 168 144)"/>
<path d="M 136 182 L 164 182" fill="none" stroke="${p.line}" stroke-width="3"/>
<path d="M 70 200 L 230 200 L 210 236 L 90 236 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`,
    },
    '#c8203a': {                                          // Trioptic
      label: 'trioptic',
      skin: '#c45a6a',
      head: (p) => `
<path d="M 150 40 C 94 50 68 112 80 172 C 90 218 118 242 150 250 C 182 242 210 218 220 172 C 232 112 206 50 150 40 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 104 84 C 126 64 174 64 196 84" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.28"/>
<circle cx="150" cy="100" r="22" fill="${ALIEN.eye}"/>
<circle cx="116" cy="148" r="20" fill="${ALIEN.eye}"/>
<circle cx="184" cy="148" r="20" fill="${ALIEN.eye}"/>
<circle cx="144" cy="92" r="6" fill="${ALIEN.glint}"/>
<circle cx="110" cy="140" r="5" fill="${ALIEN.glint}"/>
<circle cx="178" cy="140" r="5" fill="${ALIEN.glint}"/>
<path d="M 132 200 C 142 214 158 214 168 200" fill="none" stroke="${p.line}" stroke-width="3.5"/>`,
    },
    '#ff9ecf': {                                          // Fluffball
      label: 'fluff',
      skin: '#ffb6d9',
      head: (p) => `
<circle cx="150" cy="130" r="86" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 90 80 C 70 60 62 40 70 24 M 210 80 C 230 60 238 40 230 24" fill="none" stroke="${p.hi}" stroke-width="10"/>
<circle cx="70" cy="20" r="12" fill="${p.base}" stroke="${p.line}" stroke-width="2"/>
<circle cx="230" cy="20" r="12" fill="${p.base}" stroke="${p.line}" stroke-width="2"/>
<path d="M 84 70 C 100 40 130 28 150 28 C 170 28 200 40 216 70" fill="none" stroke="#ffffff" stroke-width="10" opacity="0.35"/>
<circle cx="122" cy="128" r="16" fill="${ALIEN.eye}"/>
<circle cx="178" cy="128" r="16" fill="${ALIEN.eye}"/>
<circle cx="116" cy="120" r="5" fill="${ALIEN.glint}"/>
<circle cx="172" cy="120" r="5" fill="${ALIEN.glint}"/>
<circle cx="118" cy="160" r="8" fill="#ff8fb0" opacity="0.45"/>
<circle cx="182" cy="160" r="8" fill="#ff8fb0" opacity="0.45"/>
<path d="M 136 176 C 144 188 156 188 164 176" fill="none" stroke="${p.line}" stroke-width="3.5"/>`,
    },
  };
  const ALIEN_FALLBACK = ALIEN_CAST['#1f9bff'];
  function alienPalette(base) {
    const v = ALIEN_CAST[String(base).toLowerCase()] || ALIEN_FALLBACK;
    // Race owns the skin tone; the player's color still tints it slightly so
    // two greys (etc.) from different slots stay distinguishable in a lobby.
    const skin = mixHex(v.skin || '#b3bdb7', base, 0.22);
    return {
      base: skin,
      hi:   shadeHex(skin, 0.20),
      lo:   shadeHex(skin, -0.24),
      line: shadeHex(skin, -0.5),
      accent: base,
      v,
    };
  }
  function alienBodySVG(p) {
    const v = p.v;
    const part = (f) => (typeof f === 'function' ? f(p) : '');
    // Shared spindly body — thin limbs, narrow torso, three-toed feet. Contact
    // plane sits at svg y≈376 like every other edition. Race art is the head
    // (and optional behind/front props).
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gAl" x1="80" y1="60" x2="230" y2="330" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round" transform="translate(150 376) scale(1.08) translate(-150 -376)">
${part(v.behind)}
<path d="M 132 344 L 112 372 L 136 374 L 142 348 Z M 168 344 L 188 372 L 164 374 L 158 348 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 136 288 L 134 350 L 148 350 L 148 288 Z M 164 288 L 166 350 L 152 350 L 152 288 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2"/>
<path d="M 126 232 C 122 226 136 220 150 220 C 164 220 178 226 174 232 L 168 292 L 132 292 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 226 L 150 258" fill="none" stroke="${p.line}" stroke-width="2" opacity="0.5"/>
<rect x="130" y="258" width="40" height="9" rx="4.5" fill="${p.lo}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="150" cy="262" r="4.5" fill="${ALIEN.bulb}" stroke="${ALIEN.bulbLine}" stroke-width="1.5"/>
<path d="M 128 238 C 106 250 92 268 86 288" fill="none" stroke="url(#gAl)" stroke-width="11"/>
<path d="M 86 288 L 74 300 M 86 288 L 82 304 M 86 288 L 94 302" fill="none" stroke="${p.lo}" stroke-width="5"/>
<path d="M 172 238 C 194 250 208 268 214 288" fill="none" stroke="url(#gAl)" stroke-width="11"/>
<path d="M 214 288 L 226 300 M 214 288 L 218 304 M 214 288 L 206 302" fill="none" stroke="${p.lo}" stroke-width="5"/>
<path d="M 140 232 L 138 250 L 162 250 L 160 232 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${part(v.head)}
${part(v.front)}
</g>
</svg>`;
  }
  function drawAlien(ctx, opts) {
    const color = opts.color || '#1f9bff';
    drawSingleSprite(ctx, 'alien', color, alienPalette(color), alienBodySVG);
  }

  // ── Buildings skin ─────────────────────────────────────────────────────────
  // Replaces the old gold-trophy edition. Twelve famous landmarks — one per
  // player colour — standing on a shared stone plinth. Distinct silhouettes at
  // game size; the player's tint lights windows / accents / flags.
  const BUILD = {
    stone: '#c9c2b2', stoneLo: '#8f8776', stoneHi: '#ebe6da', stoneLine: '#5c564a',
    glass: '#9ad7ef',
  };
  const BUILDING_CAST = {
    '#1f9bff': {                                          // Eiffel Tower
      label: 'eiffel',
      draw: (p) => `
<path d="M 112 348 L 130 168 L 150 88 L 170 168 L 188 348 Z" fill="url(#gBd)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 130 168 L 112 348 M 170 168 L 188 348" fill="none" stroke="${p.hi}" stroke-width="2.2" opacity="0.55"/>
<path d="M 124 318 L 176 318 M 128 278 L 172 278 M 132 238 L 168 238 M 136 198 L 164 198 M 140 158 L 160 158" fill="none" stroke="${p.line}" stroke-width="2.2"/>
<path d="M 122 318 L 128 278 L 124 238 L 130 198 L 136 158 M 178 318 L 172 278 L 176 238 L 170 198 L 164 158" fill="none" stroke="${p.hi}" stroke-width="1.6" opacity="0.65"/>
<path d="M 134 278 L 166 318 M 166 278 L 134 318 M 138 238 L 162 278 M 162 238 L 138 278 M 142 198 L 158 238 M 158 198 L 142 238" fill="none" stroke="${p.line}" stroke-width="1.4" opacity="0.55"/>
<rect x="142" y="118" width="16" height="18" rx="2" fill="${p.lo}" stroke="${p.line}" stroke-width="1.5"/>
<rect x="146" y="70" width="8" height="28" fill="${p.accent}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="150" cy="66" r="7" fill="${p.accent}" stroke="${p.line}" stroke-width="1.5"/>`,
    },
    '#e3263c': {                                          // Big Ben
      label: 'bigben',
      draw: (p) => `
<rect x="118" y="168" width="64" height="180" fill="url(#gBd)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 112 168 L 150 118 L 188 168 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<rect x="140" y="96" width="20" height="28" fill="${p.accent}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="150" cy="230" r="22" fill="${BUILD.stoneHi}" stroke="${p.line}" stroke-width="2"/>
<path d="M 150 230 L 150 214 M 150 230 L 162 230" fill="none" stroke="${p.line}" stroke-width="2.5"/>
<rect x="126" y="280" width="10" height="14" fill="${BUILD.glass}"/><rect x="146" y="280" width="10" height="14" fill="${BUILD.glass}"/><rect x="164" y="280" width="10" height="14" fill="${BUILD.glass}"/>
<rect x="126" y="310" width="10" height="14" fill="${BUILD.glass}"/><rect x="146" y="310" width="10" height="14" fill="${BUILD.glass}"/><rect x="164" y="310" width="10" height="14" fill="${BUILD.glass}"/>`,
    },
    '#8ed11a': {                                          // Statue of Liberty
      label: 'liberty',
      draw: (p) => `
<path d="M 108 348 L 108 318 L 192 318 L 192 348 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 118 318 L 118 300 L 182 300 L 182 318 Z" fill="url(#gBd)" stroke="${p.line}" stroke-width="2"/>
<path d="M 128 300 C 124 250 122 210 128 178 L 172 178 C 178 210 176 250 172 300 Z" fill="${p.base}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 136 250 Q 150 236 164 250" fill="none" stroke="${p.hi}" stroke-width="3" opacity="0.55"/>
<path d="M 134 178 L 134 148 C 134 132 142 122 150 122 C 158 122 166 132 166 148 L 166 178 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<circle cx="150" cy="108" r="24" fill="${p.base}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 86 L 140 62 L 150 72 L 160 62 Z M 128 100 L 104 88 L 126 108 Z M 172 100 L 196 88 L 174 108 Z M 134 78 L 118 58 L 140 74 Z M 166 78 L 182 58 L 160 74 Z" fill="${p.accent}" stroke="${p.line}" stroke-width="1.4"/>
<ellipse cx="142" cy="108" rx="3.5" ry="4.5" fill="${p.line}"/><ellipse cx="158" cy="108" rx="3.5" ry="4.5" fill="${p.line}"/>
<path d="M 144 118 Q 150 122 156 118" fill="none" stroke="${p.line}" stroke-width="1.8"/>
<path d="M 166 200 C 188 176 214 150 232 132 L 238 140 C 218 160 194 188 176 214 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.2"/>
<rect x="228" y="112" width="18" height="28" rx="3" fill="${p.accent}" stroke="${p.line}" stroke-width="1.5"/>
<path d="M 237 112 L 237 96" fill="none" stroke="${p.accent}" stroke-width="3"/>
<circle cx="237" cy="92" r="5" fill="${p.accent}" stroke="${p.line}" stroke-width="1.2"/>
<path d="M 118 230 C 108 238 102 250 100 262" fill="none" stroke="${p.lo}" stroke-width="8"/>`,
    },
    '#ff7a00': {                                          // Taj Mahal
      label: 'taj',
      draw: (p) => `
<rect x="78" y="250" width="144" height="98" fill="url(#gBd)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 110 250 L 110 180 Q 110 150 150 140 Q 190 150 190 180 L 190 250 Z" fill="${BUILD.stoneHi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 140 L 150 96" fill="none" stroke="${p.accent}" stroke-width="4"/>
<circle cx="150" cy="90" r="8" fill="${p.accent}" stroke="${p.line}" stroke-width="1.5"/>
<path d="M 78 250 L 78 210 Q 78 190 96 190 Q 114 190 114 210 L 114 250 Z M 186 250 L 186 210 Q 186 190 204 190 Q 222 190 222 210 L 222 250 Z" fill="${p.base}" stroke="${p.line}" stroke-width="2"/>
<path d="M 96 190 L 96 168 M 204 190 L 204 168" fill="none" stroke="${p.accent}" stroke-width="3"/>
<circle cx="96" cy="162" r="6" fill="${p.accent}"/><circle cx="204" cy="162" r="6" fill="${p.accent}"/>
<path d="M 130 280 Q 150 250 170 280" fill="none" stroke="${p.line}" stroke-width="3"/>
<rect x="142" y="280" width="16" height="40" fill="${BUILD.glass}" stroke="${p.line}" stroke-width="1.5"/>`,
    },
    '#8a3ffc': {                                          // Sydney Opera House
      label: 'opera',
      draw: (p) => `
<path d="M 56 348 L 244 348 L 232 304 L 68 304 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 68 304 L 78 292 L 222 292 L 232 304 Z" fill="${BUILD.stone}" stroke="${p.line}" stroke-width="2"/>
<path d="M 78 292 Q 96 168 148 292 Z" fill="url(#gBd)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 96 250 Q 118 198 140 250" fill="none" stroke="${BUILD.stoneHi}" stroke-width="5" opacity="0.7"/>
<path d="M 112 292 Q 150 128 196 292 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 132 236 Q 150 170 172 236" fill="none" stroke="${BUILD.stoneHi}" stroke-width="5" opacity="0.75"/>
<path d="M 150 292 Q 190 160 236 292 Z" fill="${p.base}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 172 240 Q 194 188 214 240" fill="none" stroke="${BUILD.stoneHi}" stroke-width="5" opacity="0.7"/>
<path d="M 188 292 Q 214 210 248 292 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.2"/>
<path d="M 104 268 L 128 268 M 148 220 L 172 220 M 186 250 L 214 250" fill="none" stroke="${p.accent}" stroke-width="3" opacity="0.75"/>
<path d="M 86 292 L 96 348 M 214 292 L 224 348" fill="none" stroke="${p.line}" stroke-width="2" opacity="0.35"/>`,
    },
    '#5fcfe6': {                                          // Empire State
      label: 'empire',
      draw: (p) => `
<rect x="108" y="200" width="84" height="148" fill="url(#gBd)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="120" y="140" width="60" height="60" fill="${p.base}" stroke="${p.line}" stroke-width="2"/>
<rect x="134" y="90" width="32" height="50" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<path d="M 150 90 L 150 48" fill="none" stroke="${p.accent}" stroke-width="4"/>
<circle cx="150" cy="44" r="6" fill="${p.accent}" stroke="${p.line}" stroke-width="1.5"/>
${[0,1,2,3,4,5].map((r) => [0,1,2].map((c) =>
  `<rect x="${118 + c * 22}" y="${214 + r * 20}" width="12" height="10" fill="${r % 2 ? BUILD.glass : p.accent}" opacity="0.85"/>`
).join('')).join('')}`,
    },
    '#3fae1a': {                                          // Great Pyramid
      label: 'pyramid',
      draw: (p) => `
<path d="M 52 348 L 150 96 L 248 348 Z" fill="url(#gBd)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 96 L 248 348 L 150 348 Z" fill="${p.lo}" opacity="0.35"/>
<path d="M 150 96 L 150 348" fill="none" stroke="${p.hi}" stroke-width="3.5" opacity="0.55"/>
${[0,1,2,3,4,5].map((i) => {
  const t = (i + 1) / 7;
  const y = 96 + t * 252;
  const half = t * 98;
  return `<path d="M ${150 - half} ${y} L ${150 + half} ${y}" fill="none" stroke="${p.line}" stroke-width="1.8" opacity="0.45"/>`;
}).join('')}
${[0,1,2,3].map((i) => {
  const x0 = 118 + i * 18;
  return `<path d="M ${x0} 300 L ${x0} 336" fill="none" stroke="${p.line}" stroke-width="1.6" opacity="0.35"/>`;
}).join('')}
<path d="M 132 292 L 168 292 L 168 328 L 132 328 Z" fill="${p.accent}" stroke="${p.line}" stroke-width="1.8"/>
<path d="M 140 292 L 140 328 M 150 292 L 150 328 M 160 292 L 160 328 M 132 310 L 168 310" fill="none" stroke="${p.line}" stroke-width="1.3" opacity="0.55"/>
<circle cx="150" cy="108" r="5" fill="${p.accent}" opacity="0.85"/>`,
    },
    '#ff5b86': {                                          // Leaning Tower of Pisa
      label: 'pisa',
      draw: (p) => `
<g transform="rotate(8 150 348)">
<rect x="118" y="140" width="64" height="208" rx="8" fill="url(#gBd)" stroke="${p.line}" stroke-width="2.5"/>
${[0,1,2,3,4,5].map((i) =>
  `<path d="M 122 ${160 + i * 30} Q 150 ${148 + i * 30} 178 ${160 + i * 30}" fill="none" stroke="${BUILD.stoneHi}" stroke-width="6"/>`
  + `<path d="M 122 ${160 + i * 30} Q 150 ${148 + i * 30} 178 ${160 + i * 30}" fill="none" stroke="${p.line}" stroke-width="2"/>`
).join('')}
<ellipse cx="150" cy="132" rx="28" ry="12" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<rect x="142" y="108" width="16" height="24" fill="${p.accent}" stroke="${p.line}" stroke-width="1.5"/>
</g>`,
    },
    '#4f63e0': {                                          // Parthenon
      label: 'parthenon',
      draw: (p) => `
<path d="M 70 180 L 150 120 L 230 180 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<rect x="78" y="180" width="144" height="24" fill="url(#gBd)" stroke="${p.line}" stroke-width="2"/>
${[0,1,2,3,4,5].map((i) =>
  `<rect x="${88 + i * 22}" y="204" width="14" height="120" fill="${i % 2 ? p.hi : BUILD.stoneHi}" stroke="${p.line}" stroke-width="1.5"/>`
).join('')}
<rect x="78" y="324" width="144" height="24" fill="${p.base}" stroke="${p.line}" stroke-width="2"/>
<path d="M 150 120 L 150 96" fill="none" stroke="${p.accent}" stroke-width="3"/>
<circle cx="150" cy="90" r="7" fill="${p.accent}"/>`,
    },
    '#ffc233': {                                          // Space Needle (Redeemer retired)
      label: 'needle',
      draw: (p) => `
<path d="M 120 348 L 140 220 L 160 220 L 180 348 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
<rect x="142" y="120" width="16" height="110" fill="url(#gBd)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 110 200 L 190 200 L 200 230 L 100 230 Z" fill="${BUILD.stoneHi}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="168" rx="42" ry="18" fill="${p.base}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="160" rx="28" ry="10" fill="${p.hi}" stroke="${p.line}" stroke-width="1.5"/>
<path d="M 150 120 L 150 72" fill="none" stroke="${p.accent}" stroke-width="4"/>
<circle cx="150" cy="66" r="8" fill="${p.accent}" stroke="${p.line}" stroke-width="1.5"/>`,
    },
    '#c8203a': {                                          // St. Basil's Cathedral
      label: 'basil',
      draw: (p) => `
<rect x="90" y="260" width="120" height="88" fill="url(#gBd)" stroke="${p.line}" stroke-width="2.5"/>
${[[110,220,'#e3263c'],[150,200,'#1f9bff'],[190,220,'#ffc233'],[130,240,'#8ed11a'],[170,240,'#8a3ffc']].map(([x,y,c]) =>
  `<path d="M ${x - 16} ${y + 40} Q ${x - 16} ${y} ${x} ${y - 10} Q ${x + 16} ${y} ${x + 16} ${y + 40} Z" fill="${c}" stroke="${p.line}" stroke-width="1.8"/>`
  + `<path d="M ${x} ${y - 10} L ${x} ${y - 28}" fill="none" stroke="${p.accent}" stroke-width="2.5"/>`
  + `<circle cx="${x}" cy="${y - 32}" r="4" fill="${p.accent}"/>`
).join('')}
<rect x="138" y="300" width="24" height="36" fill="${BUILD.glass}" stroke="${p.line}" stroke-width="1.5"/>`,
    },
    '#ff9ecf': {                                          // Japanese Pagoda
      label: 'pagoda',
      draw: (p) => `
${[0,1,2,3].map((i) => {
  const y = 300 - i * 48;
  const w = 110 - i * 14;
  return `<path d="M ${150 - w / 2 - 10} ${y} L ${150 - w / 2} ${y - 18} L ${150 + w / 2} ${y - 18} L ${150 + w / 2 + 10} ${y} Z" fill="${i % 2 ? p.hi : p.base}" stroke="${p.line}" stroke-width="2"/>`
    + `<rect x="${150 - w / 2 + 8}" y="${y}" width="${w - 16}" height="28" fill="${i % 2 ? BUILD.stoneHi : p.lo}" stroke="${p.line}" stroke-width="1.5"/>`;
}).join('')}
<path d="M 150 108 L 150 78" fill="none" stroke="${p.accent}" stroke-width="4"/>
<circle cx="150" cy="72" r="7" fill="${p.accent}" stroke="${p.line}" stroke-width="1.5"/>
<path d="M 136 90 L 164 90" fill="none" stroke="${p.accent}" stroke-width="3"/>`,
    },
  };
  const BUILDING_FALLBACK = BUILDING_CAST['#1f9bff'];
  function buildingPalette(base) {
    return {
      base: mixHex(BUILD.stone, base, 0.28),
      hi: shadeHex(mixHex(BUILD.stoneHi, base, 0.2), 0.08),
      lo: shadeHex(mixHex(BUILD.stoneLo, base, 0.25), -0.05),
      line: BUILD.stoneLine,
      accent: base,
      v: BUILDING_CAST[String(base).toLowerCase()] || BUILDING_FALLBACK,
    };
  }
  function buildingBodySVG(p) {
    const v = p.v;
    const art = typeof v.draw === 'function' ? v.draw(p) : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gBd" x1="90" y1="80" x2="210" y2="340" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<rect x="70" y="348" width="160" height="28" rx="4" fill="${BUILD.stoneLo}" stroke="${BUILD.stoneLine}" stroke-width="2.5"/>
<rect x="86" y="336" width="128" height="16" rx="3" fill="${BUILD.stone}" stroke="${BUILD.stoneLine}" stroke-width="2"/>
<rect x="102" y="356" width="96" height="10" rx="3" fill="${p.accent}" opacity="0.85"/>
${art}
</g>
</svg>`;
  }
  function drawBuildings(ctx, opts) {
    const color = opts.color || '#1f9bff';
    drawSingleSprite(ctx, 'buildings', color, buildingPalette(color), buildingBodySVG);
  }

  // ── Pineapple skin ─────────────────────────────────────────────────────────
  // A jaunty pineapple wearing the plunger's googly-eyed face (same eye/brow/
  // mouth kit, sized up for the bigger body) so the two read as the same cast.
  // The crown fronds carry the player's color at full strength and a little of
  // it is mixed into the golden fruit, so the whole thing shifts hue per player
  // while still reading as a pineapple. Bottom of the fruit sits on the contact
  // plane (svg y=376) like every other edition.
  const PINE = {
    gold: '#f4b93c',
    eyeWhite: '#ffffff', pupil: '#1a1a1a', mouth: '#6d2f1c', tongue: '#d9615f',
  };
  function pinePalette(base) {
    const body = mixHex(PINE.gold, base, 0.22);   // a hint of the player's color
    return {
      base,
      hi:   shadeHex(base, 0.20),
      lo:   shadeHex(base, -0.28),
      line: shadeHex(base, -0.52),
      body,
      bodyHi:    shadeHex(body, 0.26),
      bodyLo:    shadeHex(body, -0.28),
      lattice:   shadeHex(body, -0.44),
    };
  }
  // Crown blades as [baseX, baseY, tipX, tipY]. Each is drawn as a two-curve
  // lens (not a spike) so it reads as a leaf with a center vein.
  const PINE_FRONDS = [
    [128, 128, 56, 54], [134, 124, 86, 24], [142, 122, 120, 6],
    [150, 121, 152, 2], [158, 122, 184, 8], [166, 124, 216, 28],
    [172, 128, 244, 58],
  ];
  function pineBodySVG(p) {
    let crown = '';
    for (const [bx, by, tx, ty] of PINE_FRONDS) {
      const mx = (bx + tx) / 2, my = (by + ty) / 2;
      let nx = -(ty - by), ny = tx - bx;                 // perpendicular to the blade
      const nl = Math.hypot(nx, ny) || 1;
      nx = (nx / nl) * 15; ny = (ny / nl) * 15;          // half-width bulge
      crown +=
        `<path d="M ${bx} ${by} Q ${(mx + nx).toFixed(1)} ${(my + ny).toFixed(1)} ${tx} ${ty} ` +
        `Q ${(mx - nx).toFixed(1)} ${(my - ny).toFixed(1)} ${bx} ${by} Z" ` +
        `fill="url(#gPiC)" stroke="${p.line}" stroke-width="1.8"/>` +
        `<path d="M ${bx} ${by} L ${tx} ${ty}" fill="none" stroke="${p.lo}" stroke-width="1.6" opacity="0.5"/>`;
    }
    // Diamond lattice — CLIPPED to the fruit. Unclipped, the ends of these
    // lines stick out past the body outline like whiskers.
    let lattice = '';
    for (let i = -4; i <= 7; i++) {
      lattice += `<path d="M ${52 + i * 30} 150 L ${142 + i * 30} 384" fill="none" stroke="${p.lattice}" stroke-width="2.6" opacity="0.5"/>`;
      lattice += `<path d="M ${248 - i * 30} 150 L ${158 - i * 30} 384" fill="none" stroke="${p.lattice}" stroke-width="2.6" opacity="0.5"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gPi" x1="56" y1="0" x2="244" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.bodyHi}"/><stop offset="0.5" stop-color="${p.body}"/><stop offset="1" stop-color="${p.bodyLo}"/>
</linearGradient>
<linearGradient id="gPiC" x1="0" y1="0" x2="0" y2="132" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
<clipPath id="pineClip"><ellipse cx="150" cy="250" rx="94" ry="128"/></clipPath>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
${crown}
<ellipse cx="150" cy="250" rx="94" ry="128" fill="url(#gPi)" stroke="${p.lattice}" stroke-width="3"/>
<g clip-path="url(#pineClip)">${lattice}
<ellipse cx="150" cy="134" rx="92" ry="28" fill="${p.bodyHi}" opacity="0.45"/>
<ellipse cx="150" cy="368" rx="92" ry="30" fill="${p.bodyLo}" opacity="0.45"/>
</g>
<path d="M 80 214 C 88 184 106 160 128 146" fill="none" stroke="#ffffff" stroke-width="9" opacity="0.28"/>
<path d="M 98 210 L 124 219 M 202 210 L 176 219" fill="none" stroke="${p.lattice}" stroke-width="5"/>
<circle cx="120" cy="240" r="21" fill="${PINE.eyeWhite}" stroke="${p.lattice}" stroke-width="2"/>
<circle cx="125" cy="243" r="9" fill="${PINE.pupil}"/>
<circle cx="114" cy="233" r="4.5" fill="#ffffff"/>
<circle cx="180" cy="240" r="21" fill="${PINE.eyeWhite}" stroke="${p.lattice}" stroke-width="2"/>
<circle cx="185" cy="243" r="9" fill="${PINE.pupil}"/>
<circle cx="174" cy="233" r="4.5" fill="#ffffff"/>
<ellipse cx="150" cy="298" rx="17" ry="13" fill="${PINE.mouth}"/>
<ellipse cx="150" cy="304" rx="10" ry="6" fill="${PINE.tongue}"/>
</g>
</svg>`;
  }
  function drawPineapple(ctx, opts) {
    const color = opts.color || '#3fae1a';
    drawSingleSprite(ctx, 'pineapple', color, pinePalette(color), pineBodySVG);
  }

  // ── Gorilla skin ───────────────────────────────────────────────────────────
  // Deliberately a CUTE CHUNKY figurine, not a realistic ape — same chibi
  // language as the People edition (huge round head, stubby body, big friendly
  // eyes), which is what actually reads at game size. Several attempts at an
  // anatomical silverback all failed the same way: front-on and symmetrical it
  // came out a teddy bear, in profile it went blobby, and upright with arms at
  // its sides it just looked like a person in a costume. Charm beats accuracy
  // here. The gorilla read is carried by four cues that survive being cute:
  // big round ears out to the sides, the crest bump on top, a broad pale muzzle
  // patch with a flat wide nose, and long arms ending in fists that hang below
  // the body. Feet rest on the contact plane (svg y=376).
  const GOR = {
    face: '#c2b09a', faceLo: '#98866f',    // pale muzzle patch, so features read
    innerEar: '#a08d76',
    belly: 'rgba(255,255,255,0.26)',
    eyeWhite: '#ffffff', pupil: '#2b2118',
    nose: '#4a3c30', mouth: '#4a3c30', brow: '#4a3c30',
    blush: '#f79892',
  };
  function gorPalette(base) {
    return {
      base,
      hi:   shadeHex(base, 0.16),
      lo:   shadeHex(base, -0.26),
      deep: shadeHex(base, -0.42),
      line: shadeHex(base, -0.56),
    };
  }
  function gorBodySVG(p) {
    // Front-on chibi: naturally centred on x=150, so no re-centring transform.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gG" x1="96" y1="0" x2="204" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<rect x="116" y="286" width="32" height="68" rx="14" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="152" y="286" width="32" height="68" rx="14" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5"/>
<rect x="102" y="342" width="50" height="34" rx="15" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<rect x="148" y="342" width="50" height="34" rx="15" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 112 352 L 111 372 M 126 350 L 126 372 M 140 352 L 141 372" fill="none" stroke="${p.deep}" stroke-width="2.5" opacity="0.5"/>
<path d="M 160 352 L 159 372 M 174 350 L 174 372 M 188 352 L 189 372" fill="none" stroke="${p.deep}" stroke-width="2.5" opacity="0.5"/>
<path d="M 106 226 C 106 204 124 190 150 190 C 176 190 194 204 194 226 C 196 254 194 282 190 302 C 176 313 124 313 110 302 C 106 282 104 254 106 226 Z" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="256" rx="35" ry="38" fill="${GOR.belly}"/>
<path d="M 128 236 C 138 227 147 227 150 238 M 172 238 C 163 228 154 228 150 238" fill="none" stroke="${p.deep}" stroke-width="3" opacity="0.28"/>
<rect x="66" y="202" width="42" height="84" rx="21" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5" transform="rotate(10 87 202)"/>
<rect x="192" y="202" width="42" height="84" rx="21" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5" transform="rotate(-10 213 202)"/>
<circle cx="72" cy="285" r="24" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="228" cy="285" r="24" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 60 280 L 58 297 M 72 277 L 72 299 M 84 280 L 86 297" fill="none" stroke="${p.deep}" stroke-width="2.5" opacity="0.5"/>
<path d="M 216 280 L 214 297 M 228 277 L 228 299 M 240 280 L 242 297" fill="none" stroke="${p.deep}" stroke-width="2.5" opacity="0.5"/>
<circle cx="104" cy="120" r="15" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="196" cy="120" r="15" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="82" rx="34" ry="19" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="150" cy="130" r="54" fill="url(#gG)" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="99" cy="120" r="6.5" fill="${GOR.innerEar}" opacity="0.9"/>
<circle cx="201" cy="120" r="6.5" fill="${GOR.innerEar}" opacity="0.9"/>
<path d="M 116 102 C 124 88 138 80 152 79" fill="none" stroke="#ffffff" stroke-width="7" opacity="0.25"/>
<ellipse cx="150" cy="158" rx="45" ry="26" fill="${GOR.face}" stroke="${GOR.faceLo}" stroke-width="2"/>
<path d="M 110 112 C 122 96 140 92 150 98 C 160 92 178 96 190 112 C 176 104 160 104 150 108 C 140 104 124 104 110 112 Z" fill="${GOR.brow}"/>
<circle cx="132" cy="127" r="12.5" fill="${GOR.eyeWhite}" stroke="${p.line}" stroke-width="1.4"/>
<circle cx="168" cy="127" r="12.5" fill="${GOR.eyeWhite}" stroke="${p.line}" stroke-width="1.4"/>
<circle cx="134" cy="129" r="6.4" fill="${GOR.pupil}"/>
<circle cx="170" cy="129" r="6.4" fill="${GOR.pupil}"/>
<circle cx="130" cy="124" r="3" fill="#ffffff"/>
<circle cx="166" cy="124" r="3" fill="#ffffff"/>
<ellipse cx="150" cy="152" rx="17" ry="9" fill="${GOR.nose}" opacity="0.35"/>
<ellipse cx="142" cy="152" rx="3.6" ry="4.6" fill="${GOR.nose}"/>
<ellipse cx="158" cy="152" rx="3.6" ry="4.6" fill="${GOR.nose}"/>
<path d="M 132 168 C 141 179 159 179 168 168" fill="none" stroke="${GOR.mouth}" stroke-width="3.5"/>
<circle cx="116" cy="146" r="8" fill="${GOR.blush}" opacity="0.28"/>
<circle cx="184" cy="146" r="8" fill="${GOR.blush}" opacity="0.28"/>
</g>
</svg>`;
  }
  function drawGorilla(ctx, opts) {
    const color = opts.color || '#4a4a4a';
    drawSingleSprite(ctx, 'gorilla', color, gorPalette(color), gorBodySVG);
  }

  // Cartoon SVG casts (pets/garden/robots/ocean/snacks/cryptids) live in
  // js/cartoon-casts.js and register on window.FLIP_CARTOON_CASTS.
  const CC = (typeof window !== 'undefined' && window.FLIP_CARTOON_CASTS) || {};
  function drawCartoonEdition(edition, ctx, opts) {
    const pack = CC[edition];
    const color = (opts && opts.color) || '#1f9bff';
    if (!pack) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(0, -12, 30, 52, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    drawSingleSprite(ctx, edition, color, pack.palette(color), pack.bodySVG);
  }
  function drawPets(ctx, opts) { drawCartoonEdition('pets', ctx, opts); }
  function drawGarden(ctx, opts) { drawCartoonEdition('garden', ctx, opts); }
  function drawRobots(ctx, opts) { drawCartoonEdition('robots', ctx, opts); }
  function drawOcean(ctx, opts) { drawCartoonEdition('ocean', ctx, opts); }
  function drawSnacks(ctx, opts) { drawCartoonEdition('snacks', ctx, opts); }
  function drawCryptids(ctx, opts) { drawCartoonEdition('cryptids', ctx, opts); }

  // ── Unified character roster ───────────────────────────────────────────────
  // One unlock = one character. Setup is only color/character swatches — no
  // separate People/Buildings/Pets edition picker. Each entry paints via
  // `drawAs` (the old edition drawer) using `tint` (cast key / color).
  // Unlock cadence: free bottle, then every 3 wins; Alien species are LAST.
  const ALIEN_PHYSICS = {
    gravity: 1.28,
    frictionAir: 0.0045,
    friction: 0.02,
    restitution: 0.90,
    spinScale: 0.7,
    launchScale: 1.50,
    horizDivisor: 140,
    horizMax: 15,
    wallBounce: 0.96,
    ceiling: true,
    floorResolve: true,
    landOnTarget: true,
    // Bigger pad; any body overlap scores (not just center/feet).
    targetHalfWidth: 72,
    requireFlip: false,
    deflector: true,
    deflectorCount: 3,
    saucerCount: 6,
    keepWalls: true,
    minHorizRatio: 0.12,
    strictTarget: false,   // AABB overlap with pad = make (whole alien counts)
    allowSlideIn: true,    // can still slide onto the pad after touchdown
    hitScale: 0.90,        // nearly the full drawn pad scores
    // TRUE bigger arena (not camera-shrink): physics world is wider/taller than
    // the screen, camera fits wall-to-wall so the phone stays full-bleed while
    // bank shots actually have more travel. Old arenaZoom letterboxed a
    // postage stamp or cramped the court — expand replaces that.
    arenaExpand: 1.18,         // desktop: mild real widen
    mobileArenaExpand: 1.42,   // phone: proper bank-shot court
    arenaExpandY: 1.0,
    mobileArenaExpandY: 1.14,  // a bit more air for ceiling banks on phones
    arenaZoom: 1,
    mobileArenaZoom: 1,
  };

  // One silly default name per flavor color × object. Index-aligned to
  // FLAVOR_HEXES. Keep ≤14 chars (setup input maxlength). Used by Skins.nameFor.
  // Order: blue, red, lime, orange, purple, ice, green, berry, navy, lemon, cherry, pink.
  const FAMILY_COLOR_NAMES = {
    bottle: [
      'Blue Steel', 'Sucker Punch', 'Lime Light', 'Orange Crush',
      'Grape Juice', 'Ice Ice Baby', 'Apple Sauce', 'Berry Nice',
      'Making Waves', 'Lemon Aid', 'Very Cherry', 'Pink Fluff',
    ],
    ketchup: [
      'Blue Goo', 'Splat Attack', 'Slime Sauce', 'Orange Squirt',
      'Purple Plop', 'Chill Sauce', 'Relish Rush', 'Jam Session',
      'Navy Gravy', 'Mustard Buddy', 'Cherry Squish', 'Pink Puddle',
    ],
    maple: [
      'Blue Drizzle', 'Red Maple', 'Sappy Lime', 'OJ on Tap',
      'Grape Glaze', 'Ice Cap', 'Evergreen Sap', 'Berry Flapjack',
      'Midnight Snack', 'Lemon Butter', 'Cherry Waffle', 'Pink Pancake',
    ],
    honeybear: [
      'Blue Bear Hug', 'Red Teddy', 'Lime Cub Scout', 'Orange Squeeze',
      'Grrrape Bear', 'Polar Bear', 'Gummy Bear', 'Beary Berry',
      'Navy Grizzly', 'Goldilocks', 'Cherry Cub', 'Pink Paws',
    ],
    babybottle: [
      'Blue Binky', 'Red Rattle', 'Lil Limey', 'OJ Jr',
      'Grape Nap', 'Ice Ice Binky', 'Peas Please', 'Berry Burpy',
      'Nite Nite Navy', 'Lemon Drop', 'Cherry Tot', 'Pink Burp',
    ],
    extinguisher: [
      'Code Blue', 'Red Alert', 'Lime Fighter', 'Orange Alarm',
      'Grape Escape', 'Fire and Ice', 'Foam Ranger', 'Berry Blast',
      'Navy Nozzle', 'Lemon Squad', 'Cherry Sizzle', 'Pink Foam',
    ],
    soap: [
      'Squeaky Blue', 'Red Handed', 'Lime Scrub', 'Orange Zest',
      'Grape Suds', 'Cold Rinse', 'Green Clean', 'Berry Bubbly',
      'Deep Clean', 'Lemon Fresh', 'Cherry Lather', 'Bubblegum Pink',
    ],
    hourglass: [
      'Blue O\'Clock', 'Red Hot Minute', 'Lime is Money', 'Pumpkin Hour',
      'Grape Time', 'Frozen Time', 'Thyme Keeper', 'Berry Late',
      'Midnight Hour', 'Golden Hour', 'Cherry on Time', 'Pink Jiffy',
    ],
    bowlingpin: [
      'Blue Strike', 'Turkey Red', 'Lime Spare', 'Orange Roll',
      'Grape Gutter', 'Ice Bowler', 'Split Pea', 'Berry Kingpin',
      'Navy Alley', 'Lemon Tenpin', 'Cherry Picker', 'Pink Splits',
    ],
    cone: [
      'Blue Detour', 'Red Light', 'Lime Hazard', 'Cone-y Island',
      'Purple Pylon', 'Snow Cone', 'Green Light', 'Berry Bumpy',
      'Navy Roadwork', 'Caution Lemon', 'Cherry U-Turn', 'Pink Conefetti',
    ],
    flask: [
      'Blue Reaction', 'Red Shift', 'Lime Slime Lab', 'Vitamin C Lab',
      'Grape Genius', 'Absolute Zero', 'Green Slime', 'Berry Brew',
      'Navy Formula', 'Lemon Fizz', 'Cherry Reactor', 'Pink Eureka',
    ],
    shell: [
      'Blue Kaboom', 'Red Rocket', 'Sour Shell', 'Orange Boom',
      'Grape Shot', 'Cold Blast', 'Army Green', 'Boom Berry',
      'Navy Torpedo', 'Lemon Launch', 'Cherry Bomb', 'Pink Popper',
    ],
    pawn: [
      'Blue Gambit', 'Red Checkmate', 'Lime Stalemate', 'Orange Castle',
      'Purple Reign', 'Ice Endgame', 'Green Rookie', 'Berry Sneaky',
      'Navy Knight', 'Lemon Check', 'King Cherry', 'Pink Promotion',
    ],
    buoy: [
      'Buoy Oh Buoy', 'Red Tide', 'Bobbing Lime', 'Orange Anchor',
      'Grape Wave', 'Iceberg Ahead', 'Seasick Green', 'Berry Buoyant',
      'Navy Seal', 'Lemon Floatie', 'Cherry Splash', 'Pink Lifesaver',
    ],
    wineglass: [
      'Blue Raspberry', 'Fruit Punch', 'Limeade', 'Pulp Friction',
      'Grape Gulp', 'Iced Tea', 'Green Machine', 'Berry Blend',
      'Navy Nectar', 'Lemonade', 'Cherry Slush', 'Pink Smoothie',
    ],
    toucan: [
      'Blue Jay Bill', 'Toucan Tango', 'Lime in Flight', 'Orange Beak-on',
      'Grape Squawk', 'Ice Brrr-d', 'Green Wingman', 'Berry Big Bill',
      'Navy Aviator', 'Lemon Tweet', 'Cherry Chirp', 'Pink Flamingo',
    ],
    trex: [
      'Blue Rawr', 'Jurassic Red', 'Limeasaurus', 'Tea Rex',
      'Grape Scott', 'Ice Age', 'Dino-mite', 'Berrydactyl',
      'Claw Order', 'Gold Rex', 'Cherry Chomp', 'Pinkasaurus',
    ],
    whippedcream: [
      'Blue Dollop', 'Red Velvet', 'Key Lime Pie', 'Orange Swirl',
      'Grape Parfait', 'Frosty Peaks', 'Mint Whip', 'Berry Sundae',
      'Navy Nibble', 'Lemon Meringue', 'Cherry On Top', 'Pink Frosting',
    ],
    potion: [
      'Blue Moon Brew', 'Abraca-Red', 'Lime Elixir', 'Pumpkin Potion',
      'Hocus Grape-us', 'Freeze Spell', 'Goblin Green', 'Berry Bubble',
      'Navy Magic', 'Liquid Gold', 'Cherry Charm', 'Pixie Pink',
    ],
    tabasco: [
      'Blue Flame', 'Red Hot', 'Lime Jalapeno', 'Mango Habanero',
      'Grape Scorcher', 'Chilly Pepper', 'Salsa Verde', 'Berry Picante',
      'Navy Scoville', 'Lemon Zing', 'Cherry Inferno', 'Pink Pepper',
    ],
    coke: [
      'Big Blue Burp', 'Classic Red', 'Lime Twist', 'Orange Soda',
      'Grape Soda', 'Ice Cold Cola', 'Ginger Fizz', 'Root Berry',
      'Deep Sea Soda', 'Lemon Burst', 'Cherry Cola', 'Pink Fizz',
    ],
    stanley: [
      'Thirsty Blue', 'Big Red Sip', 'Lime Refill', 'Orange Chug',
      'Grape Hydrate', 'Ice Chips', 'Green Canteen', 'Berry Thirsty',
      'Navy Sipper', 'Lemon Water', 'Cherry Slurp', 'Pink Drink',
    ],
    lavalamp: [
      'Blue Groove', 'Red Hot Blob', 'Lime Lava', 'Orange Ooze',
      'Groovy Grape', 'Cool Lava', 'Green Glow-up', 'Berry Blobby',
      'Navy Nebula', 'Mellow Yellow', 'Cherry Magma', 'Funky Pink',
    ],
    lawnchair: [
      'Blue Skies', 'Red Recliner', 'Lime Lounger', 'Orange Sunset',
      'Grape Getaway', 'Chill Chair', 'Backyard Green', 'Berry Relaxed',
      'Navy Napper', 'Lazy Lemon', 'Cherry Chiller', 'Pretty in Pink',
    ],
    octopus: [
      'Octoblue', 'Kraken Red', 'Eight Limes', 'Orange Wiggle',
      'Grape Hugger', 'Cold Cuddles', 'Sea Pickle', 'Berry Grabby',
      'Inky Navy', 'Lemon Squeezy', 'Cherry Grip', 'Tickled Pink',
    ],
    alien: [
      'Blue Cosmos', 'Red Planet', 'Lime Life Form', 'Orange Orbit',
      'Grape Invader', 'Cosmic Ice', 'Little Green', 'Berry Spacey',
      'Navy Saucer', 'Solar Lemon', 'Cherry Comet', 'Pink Martian',
    ],
  };

  // All 12 flavor landmarks. Christ the Redeemer stays out — yellow is Space Needle.
  const BUILDING_HEXES = FLAVOR_HEXES.map((h) => '#' + h);

  function buildCharacters() {
    // Bare-bones ladder from js/cast25.js — free bottle, then one unlock every
    // 4 wins up to Alien at 100. Old people/buildings/gods/cartoon casts retired.
    const cast = (typeof window !== 'undefined' && window.FLIP_CAST25) || null;
    const roster = (cast && cast.ROSTER) || [
      { id: 'bottle', name: 'Bottle', emoji: '🍾', drawAs: 'bottle', unlock: null, tint: '#1f9bff', liquid: { mode: 'closed', fill: 0.32 } },
    ];
    return roster.map((r) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      drawAs: r.drawAs,
      unlock: r.unlock,
      tint: r.tint,
      color: r.tint,
      liquid: r.liquid || null,
      physics: r.id === 'alien' || r.drawAs === 'alien' ? ALIEN_PHYSICS : null,
    }));
  }

  const CHARACTERS = buildCharacters();
  const CHAR_BY_ID = Object.create(null);
  for (const c of CHARACTERS) CHAR_BY_ID[c.id] = c;

  // Legacy edition ids → character ids (migration for older saves).
  // Retired casts collapse onto the nearest bare-bones stand-in.
  const EDITION_TO_CHARS = {
    bottle: ['bottle'], parrot: ['toucan'], plunger: ['bowlingpin'], trex: ['trex'],
    vending: ['stanley'], pineapple: ['honeybear'], gorilla: ['octopus'],
    people: ['pawn'], buildings: ['cone'], gods: ['potion'],
    pets: ['toucan'], garden: ['maple'], robots: ['extinguisher'],
    ocean: ['buoy'], snacks: ['ketchup'], cryptids: ['shell'],
    alien: ['alien'],
  };

  function character(id) {
    return CHAR_BY_ID[id] || null;
  }
  function resolveDraw(id) {
    const c = character(id);
    if (c) return c.drawAs;
    return id; // legacy edition id
  }

  const CAST25_FNS = (typeof window !== 'undefined' && window.FLIP_CAST25 && window.FLIP_CAST25.drawFns) || {};
  const drawFns = Object.assign({
    // Kept from the classic set — T-Rex never gets touched; alien keeps bank-shot art.
    trex: drawTrex,
    alien: drawAlien,
    // Toucan can fall back to macaw paint if cast25 failed to load.
    toucan: CAST25_FNS.toucan || drawParrot,
    parrot: drawParrot,
  }, CAST25_FNS);   // 'bottle' is drawn by renderer.js

  // ── Per-deployment branding ────────────────────────────────────────────────
  // A branded port sets window.FLIP_BRAND before the scripts load. Setting
  // `baseSkin` makes a different character the free one by SWAPPING its unlock
  // slot with the bottle's.
  const BRAND = (typeof window !== 'undefined' && window.FLIP_BRAND) || {};
  const BASE_SKIN = BRAND.baseSkin || 'bottle';
  if (BASE_SKIN !== 'bottle') {
    const a = character(BASE_SKIN);
    const b = character('bottle');
    if (a && b) { const t = a.unlock; a.unlock = b.unlock; b.unlock = t; }
  }

  return {
    baseSkin: () => BASE_SKIN,
    list: () => CHARACTERS.slice(),
    character,
    metaFor: (id) => character(id),
    unlockRule: (id) => {
      const c = character(id);
      return c ? c.unlock : null;
    },
    namesFor: (drawAs) => (FAMILY_COLOR_NAMES[drawAs] || []).slice(),
    // Default player name for a skin family + color (always unique per flavor).
    nameFor: (id, color) => {
      const c = character(id);
      const family = (c && c.drawAs) || id;
      const list = FAMILY_COLOR_NAMES[family];
      const hex = colorToHexKey(color || (c && c.tint) || '#1f9bff');
      const idx = FLAVOR_HEXES.indexOf(hex);
      if (list && idx >= 0 && list[idx]) return list[idx];
      if (c && c.name) return c.name;
      return 'Player';
    },
    liquidFor: (id) => {
      const c = character(id);
      if (c && c.liquid) return c.liquid;
      const cast = typeof window !== 'undefined' && window.FLIP_CAST25;
      return cast && cast.liquidFor ? cast.liquidFor(id) : null;
    },
    physicsFor: (id) => {
      const c = character(id);
      if (c) return c.physics || null;
      return null;
    },
    editionChars: (edition) => (EDITION_TO_CHARS[edition] || []).slice(),
    hasDraw: (id) => {
      const drawAs = resolveDraw(id);
      return drawAs !== 'bottle' && !!drawFns[drawAs];
    },
    draw: (ctx, id, opts) => {
      const c = character(id);
      const drawAs = c ? c.drawAs : id;
      const f = drawFns[drawAs];
      if (!f) return;
      // Prefer the player's chosen color so the color picker always changes art.
      const color = (opts && opts.color) || (c && c.tint) || '#1f9bff';
      const liquid = (c && c.liquid) || null;
      f(ctx, Object.assign({}, opts || {}, { color, liquid }));
    },
    drawAs: resolveDraw,
    tintFor: (id) => {
      const c = character(id);
      return (c && c.tint) || null;
    },
    // Same-edition character for a given color (cast variants), if any.
    siblingForColor: (id, color) => {
      const c = character(id);
      if (!c) return null;
      const want = String(color || '').toLowerCase();
      return CHARACTERS.find((x) => x.drawAs === c.drawAs && String(x.tint || '').toLowerCase() === want) || null;
    },
    // Resolve which character id to use for a skin family + color. Casts swap
    // to the matching variant; singles stay put and just recolor.
    resolveForColor: (id, color) => {
      const c = character(id);
      if (!c) return id;
      const want = String(color || '').toLowerCase();
      const match = CHARACTERS.find((x) => x.drawAs === c.drawAs && String(x.tint || '').toLowerCase() === want);
      return (match && match.id) || id;
    },
    familyKey: (id) => {
      const c = character(id);
      return (c && c.drawAs) || id;
    },
    familyLabel: (id) => {
      const c = character(id);
      if (!c) return 'Character';
      return c.name || 'Character';
    },
    isCastFamily: (id) => {
      const c = character(id);
      if (!c) return false;
      let n = 0;
      for (const x of CHARACTERS) if (x.drawAs === c.drawAs && ++n > 1) return true;
      return false;
    },
    drawColor: (id, playerColor) => {
      const c = character(id);
      if (!c) return playerColor || '#1f9bff';
      return playerColor || c.tint || '#1f9bff';
    },
    onSpriteLoad,
    preload: (colors) => {
      const tints = (colors && colors.length)
        ? colors
        : FLAVOR_HEXES.map((h) => '#' + h);
      for (const c of tints) {
        getParrotSprite(c);
        getSingleSprite('plunger', c, plungerPalette(c), plungerBodySVG);
        getSingleSprite('trex', c, trexPalette(c), trexBodySVG);
        getSingleSprite('vending', c, vendPalette(c), vendBodySVG);
        getSingleSprite('people', c, peoplePalette(c), peopleBodySVG);
        getSingleSprite('alien', c, alienPalette(c), alienBodySVG);
        getSingleSprite('pineapple', c, pinePalette(c), pineBodySVG);
        getSingleSprite('gorilla', c, gorPalette(c), gorBodySVG);
        getSingleSprite('gods', c, godPalette(c), godBodySVG);
        getSingleSprite('buildings', c, buildingPalette(c), buildingBodySVG);
        ['pets', 'garden', 'robots', 'ocean', 'snacks', 'cryptids'].forEach((ed) => {
          const pack = CC[ed];
          if (pack) getSingleSprite(ed, c, pack.palette(c), pack.bodySVG);
        });
      }
    },
  };
})();
