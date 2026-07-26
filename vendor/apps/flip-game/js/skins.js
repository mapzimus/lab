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
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gV" x1="64" y1="0" x2="236" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
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
  // The only edition whose SHAPE varies per player, not just its color: every
  // flavor color maps to a different little person (see PERSONS).
  //
  // The unifying THEME is a toy-box figurine collection — all twelve are the
  // same molded collectible: identical chibi body, glossy injection-mold
  // highlight down one side, and the same face kit (dot eyes + glints +
  // blush). Only the costume layer and one signature prop change per figure,
  // so the cast reads as one boxed set rather than twelve unrelated sprites.
  // No display stands — just the figures. Color is a safe key because every
  // FLAVORS entry in main.js has a distinct hex.
  const PEOPLE = {
    skin: '#f4c9a2', skinLine: '#c1946b',
    eye: '#20160e', mouth: '#93413f',
    boot: '#39404a', bootLine: '#20252c',
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
    const skinLine = v.plastic ? p.line : PEOPLE.skinLine;
    const ink = v.plastic ? p.line : PEOPLE.eye;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gPe" x1="106" y1="0" x2="194" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
${part(v.behind)}
<rect x="110" y="352" width="40" height="24" rx="9" fill="${v.plastic ? p.lo : PEOPLE.boot}" stroke="${v.plastic ? p.line : PEOPLE.bootLine}" stroke-width="2"/>
<rect x="150" y="352" width="40" height="24" rx="9" fill="${v.plastic ? p.lo : PEOPLE.boot}" stroke="${v.plastic ? p.line : PEOPLE.bootLine}" stroke-width="2"/>
<path d="M 115 358 L 145 358 M 155 358 L 185 358" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.22"/>
<rect x="120" y="286" width="26" height="72" rx="9" fill="url(#gPe)" stroke="${p.line}" stroke-width="2"/>
<rect x="154" y="286" width="26" height="72" rx="9" fill="url(#gPe)" stroke="${p.line}" stroke-width="2"/>
<path d="M 126 292 L 126 344" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.16"/>
<rect x="136" y="172" width="28" height="28" fill="${skin}" stroke="${skinLine}" stroke-width="2"/>
<path d="M 110 210 C 110 197 123 190 150 190 C 177 190 190 197 190 210 L 194 292 L 106 292 Z" fill="url(#gPe)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 178 206 C 186 232 188 264 186 290" fill="none" stroke="${p.line}" stroke-width="6" opacity="0.16"/>
<path d="M 114 214 C 112 240 111 266 112 288" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.18"/>
<path d="M 120 200 C 132 194 168 194 180 200" fill="none" stroke="${p.line}" stroke-width="5" opacity="0.22"/>
${part(v.torso)}
<rect x="86" y="204" width="24" height="76" rx="12" fill="url(#gPe)" stroke="${p.line}" stroke-width="2" transform="rotate(14 98 204)"/>
<rect x="190" y="204" width="24" height="76" rx="12" fill="url(#gPe)" stroke="${p.line}" stroke-width="2" transform="rotate(-14 202 204)"/>
<circle cx="80" cy="282" r="13" fill="${skin}" stroke="${skinLine}" stroke-width="2"/>
<circle cx="220" cy="282" r="13" fill="${skin}" stroke="${skinLine}" stroke-width="2"/>
<circle cx="150" cy="140" r="46" fill="${skin}" stroke="${skinLine}" stroke-width="2.5"/>
<path d="M 116 116 C 124 102 137 95 150 94" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.25"/>
<circle cx="134" cy="136" r="6.5" fill="${ink}"/>
<circle cx="166" cy="136" r="6.5" fill="${ink}"/>
<circle cx="131.5" cy="133" r="2.4" fill="#ffffff" opacity="0.9"/>
<circle cx="163.5" cy="133" r="2.4" fill="#ffffff" opacity="0.9"/>
${v.plastic ? '' : '<circle cx="120" cy="153" r="6.5" fill="#f79892" opacity="0.35"/><circle cx="180" cy="153" r="6.5" fill="#f79892" opacity="0.35"/>'}
<path d="M 136 158 C 143 168 157 168 164 158" fill="none" stroke="${v.plastic ? p.line : PEOPLE.mouth}" stroke-width="3.5"/>
${part(v.head)}
${part(v.front)}
</g>
</svg>`;
  }
  function drawPeople(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'people', color, peoplePalette(color), peopleBodySVG);
  }

  // ── Alien skin ─────────────────────────────────────────────────────────────
  // The 25-win secret. Classic little grey/green: big tapering cranium, huge
  // black almond eyes, spindly limbs. Flips under its own low-gravity physics
  // profile (see META.physics) so it drifts instead of dropping.
  const ALIEN = {
    eye: '#0b0b12', glint: '#ffffff', mouth: '#22301f',
    bulb: '#c9f9ff', bulbLine: '#57b4c4',
  };
  function alienPalette(base) {
    return { base, hi: shadeHex(base, 0.22), lo: shadeHex(base, -0.26), line: shadeHex(base, -0.54) };
  }
  function alienBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gAl" x1="80" y1="60" x2="230" y2="330" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 112 78 C 104 52 96 38 88 30" fill="none" stroke="${p.lo}" stroke-width="7"/>
<circle cx="85" cy="24" r="17" fill="${ALIEN.bulb}" opacity="0.22"/>
<circle cx="85" cy="24" r="10" fill="${ALIEN.bulb}" stroke="${ALIEN.bulbLine}" stroke-width="2"/>
<circle cx="82" cy="21" r="3" fill="#ffffff" opacity="0.85"/>
<path d="M 188 78 C 196 52 204 38 212 30" fill="none" stroke="${p.lo}" stroke-width="7"/>
<circle cx="215" cy="24" r="17" fill="${ALIEN.bulb}" opacity="0.22"/>
<circle cx="215" cy="24" r="10" fill="${ALIEN.bulb}" stroke="${ALIEN.bulbLine}" stroke-width="2"/>
<circle cx="212" cy="21" r="3" fill="#ffffff" opacity="0.85"/>
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
<path d="M 150 56 C 100 56 68 96 68 138 C 68 174 98 202 120 214 C 133 222 150 228 150 228 C 150 228 167 222 180 214 C 202 202 232 174 232 138 C 232 96 200 56 150 56 Z" fill="url(#gAl)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 96 106 C 110 88 138 92 146 106" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.28"/>
<circle cx="116" cy="94" r="2.5" fill="${p.lo}" opacity="0.55"/>
<circle cx="132" cy="84" r="2" fill="${p.lo}" opacity="0.55"/>
<circle cx="106" cy="112" r="2" fill="${p.lo}" opacity="0.55"/>
<ellipse cx="115" cy="146" rx="24" ry="16" fill="${ALIEN.eye}" transform="rotate(-24 115 146)"/>
<ellipse cx="185" cy="146" rx="24" ry="16" fill="${ALIEN.eye}" transform="rotate(24 185 146)"/>
<ellipse cx="108" cy="140" rx="6" ry="4" fill="${ALIEN.glint}" opacity="0.85" transform="rotate(-24 108 140)"/>
<ellipse cx="178" cy="140" rx="6" ry="4" fill="${ALIEN.glint}" opacity="0.85" transform="rotate(24 178 140)"/>
<path d="M 140 194 Q 150 202 160 194" fill="none" stroke="${ALIEN.mouth}" stroke-width="3.5"/>
</g>
</svg>`;
  }
  function drawAlien(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'alien', color, alienPalette(color), alienBodySVG);
  }

  // ── Trophy skins (bronze / silver / gold tiers) ────────────────────────────
  // Each tier gets its OWN metal — bronze, silver, gold — and the statuette on
  // top is a metal cast of one of the other editions (including each of the
  // twelve People figures), picked from TOPPER_ROSTER by tier + player color so
  // all of them turn up across the three trophies. The player's own color shows
  // up on the plaque band.
  const TROPHY = {
    baseWood: '#5b3a22', baseWoodLine: '#3a2414',
  };
  const METALS = {
    bronze: { hi: '#f0b98a', mid: '#c1763c', lo: '#7a4318', line: '#4a2810', sparkle: '#ffd9b8', ink: '#3a1e0a' },
    silver: { hi: '#f6f9fb', mid: '#b9c4cd', lo: '#78858f', line: '#4b545c', sparkle: '#ffffff', ink: '#2b3238' },
    gold:   { hi: '#ffe27a', mid: '#e8b93f', lo: '#9c6a12', line: '#5e3d09', sparkle: '#fff6c8', ink: '#2a1c06' },
  };
  // Recolor an edition's own artwork into a single-metal casting: every fill and
  // stroke becomes the metal, gradient references collapse to flat metal, and
  // partial opacity is forced solid. That way a statuette of ANY edition comes
  // free from the art that already exists, instead of hand-drawing silhouettes.
  // `fill="none"` is preserved — those are stroke-only paths (limbs, antennae).
  function monoSVG(svg, fillCol, lineCol) {
    return svg
      .replace(/fill="url\([^"]*\)"/g, `fill="${fillCol}"`)
      .replace(/stroke="url\([^"]*\)"/g, `stroke="${lineCol}"`)
      .replace(/fill="(?!none")[^"]*"/g, `fill="${fillCol}"`)
      .replace(/stroke="(?!none")[^"]*"/g, `stroke="${lineCol}"`)
      .replace(/opacity="[^"]*"/g, 'opacity="1"');
  }

  // Flavor colors in main.js order — lets a skin key off the player's color slot.
  const FLAVOR_ORDER = [
    '#1f9bff', '#e3263c', '#8ed11a', '#ff7a00', '#8a3ffc', '#5fcfe6',
    '#3fae1a', '#ff5b86', '#4f63e0', '#ffc233', '#c8203a', '#ff9ecf',
  ];

  // Everything that can stand on a trophy: the base bottle, every unlockable
  // object, and all twelve People figures. Toppers are picked from here by
  // tier + color slot so all 18 show up across the three tiers.
  const TOPPER_ROSTER = [
    { svg: () => BOTTLE_STATUE },
    { svg: () => parrotBodySVG(parrotPalette('#8ed11a')) },
    { svg: () => plungerBodySVG(plungerPalette('#8ed11a')) },
    { svg: () => trexBodySVG(trexPalette('#8ed11a')) },
    { svg: () => vendBodySVG(vendPalette('#8ed11a')) },
    { svg: () => alienBodySVG(alienPalette('#8ed11a')) },
    ...FLAVOR_ORDER.map((hex) => ({ svg: () => peopleBodySVG(peoplePalette(hex)) })),
  ];
  // The bottle is drawn by renderer.js rather than from an SVG, so it's the one
  // topper that needs its own outline.
  const BOTTLE_STATUE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<g><rect x="132" y="40" width="36" height="24" rx="5" fill="#000"/>
<path d="M 136 64 L 164 64 L 164 104 C 186 122 194 156 194 196 L 194 344 C 194 358 186 366 170 366 L 130 366 C 114 366 106 358 106 344 L 106 196 C 106 156 114 122 136 104 Z" fill="#000"/>
<path d="M 112 214 L 188 214 M 112 246 L 188 246" fill="none" stroke="#fff" stroke-width="7"/></g>
</svg>`;

  function trophyPalette(base, tier, plaque) {
    const idx = Math.max(0, FLAVOR_ORDER.indexOf(String(base).toLowerCase()));
    const tierIdx = Math.max(0, ['bronze', 'silver', 'gold'].indexOf(tier));
    // Keep the index non-negative: a negative one silently indexes past the end
    // of the array and yields undefined.
    const n = TOPPER_ROSTER.length;
    const pick = TOPPER_ROSTER[((tierIdx * 12 + idx) % n + n) % n];
    const m = METALS[tier] || METALS.gold;
    return {
      base, plaque, m,
      ribbonHi: shadeHex(base, 0.24), ribbonLo: shadeHex(base, -0.24),
      // Nested <svg> crops the mostly-empty margins of the source art and
      // bottom-aligns it, so the statuette stands on the cup rim at any scale.
      topSvg: `<svg x="92" y="6" width="116" height="132" viewBox="10 18 280 366" preserveAspectRatio="xMidYMax meet">`
        + monoSVG(pick.svg(), m.mid, m.line) + `</svg>`,
    };
  }
  function trophyBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gMetal" x1="0" y1="130" x2="0" y2="290" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.m.hi}"/><stop offset="0.55" stop-color="${p.m.mid}"/><stop offset="1" stop-color="${p.m.lo}"/>
</linearGradient>
<linearGradient id="gRibbon" x1="110" y1="0" x2="190" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.ribbonHi}"/><stop offset="1" stop-color="${p.ribbonLo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
${p.topSvg}
<path d="M 114 148 C 96 154 86 168 90 184 C 94 202 110 212 128 214 L 128 200 C 116 196 106 188 104 176 C 102 166 108 158 118 154 Z" fill="url(#gMetal)" stroke="${p.m.line}" stroke-width="2"/>
<path d="M 186 148 C 204 154 214 168 210 184 C 206 202 190 212 172 214 L 172 200 C 184 196 194 188 196 176 C 198 166 192 158 182 154 Z" fill="url(#gMetal)" stroke="${p.m.line}" stroke-width="2"/>
<path d="M 108 138 L 192 138 C 192 184 180 214 150 226 C 120 214 108 184 108 138 Z" fill="url(#gMetal)" stroke="${p.m.line}" stroke-width="2.5"/>
<path d="M 120 148 L 180 148" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.4"/>
<path d="M 130 154 L 121 206" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.20"/>
<path d="M 142 156 L 136 200" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.14"/>
<path d="M 138 226 L 138 258 L 162 258 L 162 226 Z" fill="url(#gMetal)" stroke="${p.m.line}" stroke-width="2"/>
<path d="M 112 258 L 188 258 L 198 282 L 102 282 Z" fill="url(#gMetal)" stroke="${p.m.line}" stroke-width="2.5"/>
<rect x="88" y="282" width="124" height="94" rx="6" fill="${TROPHY.baseWood}" stroke="${TROPHY.baseWoodLine}" stroke-width="2.5"/>
<rect x="88" y="282" width="124" height="12" fill="${TROPHY.baseWoodLine}" opacity="0.35"/>
<rect x="102" y="306" width="96" height="34" rx="5" fill="url(#gRibbon)" stroke="${p.m.line}" stroke-width="1.5"/>
<circle cx="109" cy="313" r="1.8" fill="${p.m.lo}"/><circle cx="191" cy="313" r="1.8" fill="${p.m.lo}"/>
<circle cx="109" cy="333" r="1.8" fill="${p.m.lo}"/><circle cx="191" cy="333" r="1.8" fill="${p.m.lo}"/>
<text x="150" y="329" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="16" font-weight="bold" fill="${p.m.ink}" opacity="0.85">${p.plaque}</text>
<path d="M 74 158 L 80 170 L 68 166 L 78 178 L 64 174 Z" fill="${p.m.sparkle}"/>
<path d="M 224 190 L 230 200 L 220 198 L 228 208 L 216 204 Z" fill="${p.m.sparkle}"/>
</g>
</svg>`;
  }
  // Each tier is its own skin id so the sprite cache keeps them separate.
  function drawTrophyTier(ctx, opts, id, tier, plaque) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, id, color, trophyPalette(color, tier, plaque), trophyBodySVG);
  }
  function drawTrophyBronze(ctx, opts) { drawTrophyTier(ctx, opts, 'trophy', 'bronze', 'BRONZE'); }
  function drawTrophySilver(ctx, opts) { drawTrophyTier(ctx, opts, 'trophy_silver', 'silver', 'SILVER'); }
  function drawTrophyGold(ctx, opts) { drawTrophyTier(ctx, opts, 'trophy_gold', 'gold', 'GOLD'); }

  // ── Registry ────────────────────────────────────────────────────────────────
  // Add a new edition by pushing META + a drawFns entry. `unlock`: null = always
  // available; a number = unlocked once Records.totalWins() reaches it.
  const META = [
    { id: 'bottle', name: 'Bottle', emoji: '🍾', unlock: null },
    {
      id: 'parrot', name: 'Parrot', emoji: '🦜', unlock: 1,
      // Default player names for this skin, aligned BY INDEX to the base
      // engine's FLAVORS array (js/main.js) — so switching skins swaps the
      // auto-filled name without touching which color/flavor is selected.
      // A skin with no `names` just falls back to the flavor name.
      names: [
        'Stormy Beak', 'Captain Squawk', 'Limey Lorikeet', 'Cannonball Cal',
        'Sir Chirpsalot', 'Whisper Wing', 'Barnacle Bill', 'Pegleg Polly',
        'Riptide Rover', 'Doubloon Dave', 'Cherry Corsair', 'Berry Bandit',
      ],
    },
    // Pun-forward plumbing heroics.
    { id: 'plunger', name: 'Plunger', emoji: '🪠', unlock: 3, names: [
      'Flush Gordon', 'Plumb Fiction', 'Lime Clogzilla', 'Sir Plungelot',
      'Count Suckula', 'Cold Plunge', 'Drain Bramage', 'Plungerella',
      'The Unclogger', 'Potty Trained', 'Cherry Bomb', 'Loo-Tenant',
    ] },
    // B-movie monster casting sheet.
    { id: 'trex', name: 'T-Rex', emoji: '🦖', unlock: 5, names: [
      'Tea Rex', 'Jurassic Mark', 'Veloci-rapper', 'Tiny Arms Tony',
      'Grape Chompsky', 'Chillasaurus', 'Applesaurus', 'Sue Nami',
      'Dino Mite', 'Rexcalibur', 'Pit Spitter', 'Berry-dactyl',
    ] },
    // Everything that has ever gone wrong at a vending machine.
    { id: 'vending', name: 'Vending Machine', emoji: '🥤', unlock: 7, names: [
      'Ven Diesel', 'Vendetta', 'Vend Diagram', 'Quarter Back',
      'Snacky Chan', 'Out of Order', 'Snack Overflow', 'Insert Coin',
      'Press B4', 'Exact Change', 'Jammed Cherry', 'Snackzilla',
    ] },
    // One name per figure — this edition's sprite changes with the color, so
    // the names are matched to the PERSONS costume at the same index:
    // astronaut, pirate, army man, builder, wizard, diver, chef, dancer,
    // hero, cowpoke, firefighter, clown.
    { id: 'people', name: 'People', emoji: '🧑‍🚀', unlock: 9, names: [
      'Astro-Nut', 'Plank Sinatra', 'Sole Survivor', 'Permit Pending',
      'Merlin Monroe', 'Bubbles McGee', 'Sir Loin-a-Lot', 'Tutu Much',
      'Capt. Obvious', 'Tumbleweed Ted', 'Stop Drop Bob', 'Balloonatic',
    ] },
    // Three trophy tiers. Kept as id 'trophy' so anyone who already unlocked
    // it at 11 wins keeps it when the silver/gold tiers land above.
    // Third place, and coping about it.
    { id: 'trophy', name: 'Bronze Trophy', emoji: '🥉', unlock: 11, names: [
      'Third Wheel', 'Patina Turner', 'Barely Bronze', 'Participation',
      'Humble Brag', 'Shiny-ish', 'Effort Award', 'Nice Try Nigel',
      'Consolation', 'Top Three-ish', 'Bronze Age', 'Almost Silver',
    ] },
    // Second place, and NOT coping about it.
    { id: 'trophy_silver', name: 'Silver Trophy', emoji: '🥈', unlock: 13, names: [
      'First Loser', 'Second Fiddle', 'Almost Gold', 'Hi-Yo Silver',
      'Silver Spoon', 'Silver Lining', 'Moral Victory', 'Runner-Up Rick',
      'Second Best', 'So Close Simon', 'Not Quite Nate', 'Silver Fox',
    ] },
    // First place, completely insufferable about it.
    { id: 'trophy_gold', name: 'Gold Trophy', emoji: '🥇', unlock: 15, names: [
      'Sir Wins-a-Lot', 'The G.O.A.T.', 'Midas Touch', 'Top Banana',
      'Numero Uno', 'Gold Standard', 'Golden Boy', 'Goldilocks',
      'Victory Lap', 'Peaked Early', 'Big Cheese', 'Humble Winner',
    ] },
    // ── The secret one. Not a reskin: it brings its own physics. ─────────────
    // A bank shot instead of a flip — the alien is rubbery, the walls and
    // ceiling are springy, the floor is dead, and it only has to come down
    // touching the pad. A wedge hangs over the launch spot so straight-up gets
    // deflected, and drifting saucers are in the way to carom off.
    {
      id: 'alien', name: 'Alien', emoji: '👽', unlock: 25,
      physics: {
        gravity: 1.35,
        frictionAir: 0.004,     // keeps its energy so it really does ricochet
        friction: 0.02,
        restitution: 0.92,      // the object itself is the bouncy part
        spinScale: 0.7,
        launchScale: 1.55,      // hard enough that a big flick reaches the ceiling
        horizDivisor: 150,      // wider aim range than a normal flick
        horizMax: 15,
        wallBounce: 0.98,       // walls + ceiling + wedge are near-perfect
        ceiling: true,
        floorResolve: true,     // first floor contact IS the landing
        landOnTarget: true,
        targetHalfWidth: 88,
        requireFlip: false,     // aim, not rotation
        deflector: true,
        saucerCount: 3,
      },
      names: [
        'UFOh No', 'Beam Me Up Bob', 'Little Greenie', 'Crop Circler',
        'Grey Matter', 'Not From Here', 'E.T. Cetera', 'Galaxy Brain',
        'Roswell Rick', 'Cosmic Carl', 'Abducted Andy', 'Space Case',
      ],
    },
  ];
  const drawFns = {
    parrot: drawParrot, plunger: drawPlunger, trex: drawTrex,
    vending: drawVend, people: drawPeople, alien: drawAlien,
    trophy: drawTrophyBronze, trophy_silver: drawTrophySilver, trophy_gold: drawTrophyGold,
  };   // 'bottle' is drawn by renderer.js

  return {
    list: () => META.slice(),
    metaFor: (id) => META.find((m) => m.id === id) || null,
    unlockRule: (id) => (META.find((m) => m.id === id) || {}).unlock ?? null,
    namesFor: (id) => (META.find((m) => m.id === id) || {}).names || null,
    // null for a plain reskin; a profile object for an edition that changes the
    // rules (see physics.js setProfile).
    physicsFor: (id) => (META.find((m) => m.id === id) || {}).physics || null,
    hasDraw: (id) => !!drawFns[id],
    draw: (ctx, id, opts) => { const f = drawFns[id]; if (f) f(ctx, opts || {}); },
    onSpriteLoad,
    preload: (colors) => {
      for (const c of colors || []) {
        getParrotSprite(c);
        getSingleSprite('plunger', c, plungerPalette(c), plungerBodySVG);
        getSingleSprite('trex', c, trexPalette(c), trexBodySVG);
        getSingleSprite('vending', c, vendPalette(c), vendBodySVG);
        getSingleSprite('people', c, peoplePalette(c), peopleBodySVG);
        getSingleSprite('alien', c, alienPalette(c), alienBodySVG);
        getSingleSprite('trophy', c, trophyPalette(c, 'bronze', 'BRONZE'), trophyBodySVG);
        getSingleSprite('trophy_silver', c, trophyPalette(c, 'silver', 'SILVER'), trophyBodySVG);
        getSingleSprite('trophy_gold', c, trophyPalette(c, 'gold', 'GOLD'), trophyBodySVG);
      }
    },
  };
})();
