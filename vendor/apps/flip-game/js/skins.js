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
    entry.img.onload = () => { entry.ready = true; };
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
<path d="M 70 376 C 70 330 90 282 150 276 C 210 282 230 330 230 376 Z" fill="url(#gP)" stroke="${p.line}" stroke-width="2"/>
<path d="M 82 360 C 90 322 112 292 150 286" fill="none" stroke="${p.hi}" stroke-width="3" opacity="0.5"/>
<rect x="118" y="266" width="64" height="20" rx="8" fill="${PLUNGER.ferrule}" stroke="${PLUNGER.ferruleDk}" stroke-width="1.5"/>
<path d="M 132 270 L 132 76 Q 132 54 150 54 Q 168 54 168 76 L 168 270 Z" fill="${PLUNGER.wood}" stroke="${PLUNGER.woodDk}" stroke-width="2"/>
<path d="M 138 90 L 138 260 M 150 80 L 150 260 M 162 90 L 162 260" fill="none" stroke="${PLUNGER.woodDk}" stroke-width="1" opacity="0.45"/>
<circle cx="126" cy="322" r="13" fill="${PLUNGER.eyeWhite}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="129" cy="323" r="6" fill="${PLUNGER.pupil}"/>
<circle cx="174" cy="322" r="13" fill="${PLUNGER.eyeWhite}" stroke="${p.line}" stroke-width="1.5"/>
<circle cx="177" cy="323" r="6" fill="${PLUNGER.pupil}"/>
<ellipse cx="150" cy="352" rx="10" ry="7" fill="${PLUNGER.mouth}"/>
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
<path d="M 288 114 L 228 138 L 284 162 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="1.5"/>
<ellipse cx="148" cy="238" rx="19" ry="44" fill="${TREX.belly}" transform="rotate(-8 148 238)"/>
<path d="M 163 112 L 156 96 L 175 104 Z M 193 92 L 187 75 L 206 84 Z M 220 74 L 215 57 L 233 66 Z" fill="${TREX.spike}" stroke="${TREX.spikeLine}" stroke-width="1.2"/>
<circle cx="270" cy="80" r="8.5" fill="${TREX.eyeWhite}" stroke="${p.line}" stroke-width="1.2"/>
<circle cx="273" cy="81" r="4.4" fill="${TREX.pupil}"/>
<circle cx="296" cy="88" r="2" fill="${p.line}"/>
<path d="M 279 118 L 275 130 M 264 124 L 261 136 M 249 130 L 247 142 M 237 134 L 236 146" fill="none" stroke="${TREX.tooth}" stroke-width="3.5"/>
<path d="M 239 143 L 242 131 M 253 149 L 257 137 M 267 155 L 272 143" fill="none" stroke="${TREX.tooth}" stroke-width="3"/>
<path d="M 158 212 C 168 216 174 224 176 234 M 174 228 L 168 238" fill="none" stroke="${p.deep}" stroke-width="6"/>
<path d="M 142 370 L 128 379 L 141 381 L 148 372 Z M 149 370 L 151 382 L 159 382 L 155 372 Z M 156 370 L 169 378 L 159 381 L 154 372 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="1"/>
<path d="M 148 296 C 140 317 138 344 142 366 C 143 372 149 374 156 372 C 163 370 165 361 163 342 C 165 321 170 305 172 296 Z" fill="url(#gT)" stroke="${p.line}" stroke-width="2"/>
</g>
</svg>`;
  }
  function drawTrex(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'trex', color, trexPalette(color), trexBodySVG);
  }

  // ── Hammer skin ────────────────────────────────────────────────────────────
  // Player-tinted handle, fixed-steel claw head.
  const HAMMER = {
    steelHi: '#eef1f3', steelLo: '#8f979e', steelLine: '#5b6167',
    grip: '#242424', gripLine: '#111111', bolt: '#4a4f54',
  };
  function hammerPalette(base) {
    return { base, hi: shadeHex(base, 0.18), lo: shadeHex(base, -0.24) };
  }
  function hammerBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gH" x1="130" y1="0" x2="170" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
<linearGradient id="gS" x1="90" y1="110" x2="240" y2="190" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${HAMMER.steelHi}"/><stop offset="1" stop-color="${HAMMER.steelLo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 134 378 L 134 186 Q 134 168 150 168 Q 166 168 166 186 L 166 378 Q 150 386 134 378 Z" fill="url(#gH)" stroke="${HAMMER.steelLine}" stroke-width="1.5"/>
<rect x="130" y="300" width="40" height="34" rx="6" fill="${HAMMER.grip}" stroke="${HAMMER.gripLine}" stroke-width="1"/>
<path d="M 132 310 L 168 310 M 132 320 L 168 320 M 132 330 L 168 330" fill="none" stroke="${HAMMER.gripLine}" stroke-width="1.5" opacity="0.6"/>
<path d="M 168 138 C 150 128 122 126 100 145 C 108 156 126 158 148 154 C 152 148 152 140 168 138 Z" fill="url(#gS)" stroke="${HAMMER.steelLine}" stroke-width="1.5"/>
<path d="M 168 186 C 150 196 122 198 100 179 C 108 168 126 166 148 170 C 152 176 152 184 168 186 Z" fill="url(#gS)" stroke="${HAMMER.steelLine}" stroke-width="1.5"/>
<rect x="163" y="132" width="70" height="58" rx="8" fill="url(#gS)" stroke="${HAMMER.steelLine}" stroke-width="1.5"/>
<path d="M 176 142 L 214 178" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.35"/>
<circle cx="150" cy="176" r="7" fill="${HAMMER.bolt}" stroke="${HAMMER.steelLine}" stroke-width="1"/>
</g>
</svg>`;
  }
  function drawHammer(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'hammer', color, hammerPalette(color), hammerBodySVG);
  }

  // ── Spaceship skin ─────────────────────────────────────────────────────────
  // Player-tinted body, fixed white nose/fins. Landed, not launching — engine
  // off, resting on splayed landing legs (no flame).
  const SHIP = {
    hullHi: '#f4f6f8', hullLo: '#c3c9cf', hullLine: '#7c838a',
    window: '#bfe7ff', windowRim: '#ffffff',
    nozzle: '#3a3f44',
  };
  function shipPalette(base) {
    return { base, hi: shadeHex(base, 0.20), lo: shadeHex(base, -0.22), line: shadeHex(base, -0.5) };
  }
  function shipBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gSh" x1="120" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.5" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
<linearGradient id="gHull" x1="120" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${SHIP.hullHi}"/><stop offset="1" stop-color="${SHIP.hullLo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 150 56 C 128 92 118 128 118 158 L 182 158 C 182 128 172 92 150 56 Z" fill="url(#gHull)" stroke="${SHIP.hullLine}" stroke-width="2"/>
<path d="M 150 56 C 138 82 132 108 130 130" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.4"/>
<path d="M 118 158 L 122 292 L 178 292 L 182 158 Z" fill="url(#gSh)" stroke="${p.line}" stroke-width="2"/>
<circle cx="150" cy="205" r="20" fill="${SHIP.window}" stroke="${SHIP.windowRim}" stroke-width="4"/>
<path d="M 142 197 A 10 10 0 0 1 158 197" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.7"/>
<path d="M 122 240 C 96 250 78 272 70 302 C 92 296 110 282 124 264 Z" fill="url(#gHull)" stroke="${SHIP.hullLine}" stroke-width="1.5"/>
<path d="M 178 240 C 204 250 222 272 230 302 C 208 296 190 282 176 264 Z" fill="url(#gHull)" stroke="${SHIP.hullLine}" stroke-width="1.5"/>
<path d="M 138 296 L 104 368 L 118 374 L 148 300 Z" fill="${SHIP.hullLo}" stroke="${SHIP.hullLine}" stroke-width="1.5"/>
<rect x="90" y="368" width="30" height="8" rx="4" fill="${SHIP.hullLo}" stroke="${SHIP.hullLine}" stroke-width="1.5"/>
<rect x="128" y="288" width="44" height="26" rx="6" fill="${SHIP.nozzle}"/>
<path d="M 162 296 L 198 368 L 184 374 L 150 300 Z" fill="url(#gHull)" stroke="${SHIP.hullLine}" stroke-width="1.5"/>
<rect x="180" y="368" width="30" height="8" rx="4" fill="url(#gHull)" stroke="${SHIP.hullLine}" stroke-width="1.5"/>
</g>
</svg>`;
  }
  function drawShip(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'ship', color, shipPalette(color), shipBodySVG);
  }

  // ── Trophy skin ────────────────────────────────────────────────────────────
  // The one skin that stays a FIXED gold color for every player (it's a
  // trophy — it should read as "the gold prize"); the player's color shows up
  // only on the small ribbon/nameplate band on the base.
  const TROPHY = {
    goldHi: '#ffe27a', goldMid: '#e8b93f', goldLo: '#9c6a12', goldLine: '#5e3d09',
    baseWood: '#5b3a22', baseWoodLine: '#3a2414', sparkle: '#fff6c8',
  };
  function trophyPalette(base) {
    return { base, ribbonHi: shadeHex(base, 0.24), ribbonLo: shadeHex(base, -0.24) };
  }
  function trophyBodySVG(p) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gGold" x1="0" y1="70" x2="0" y2="260" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${TROPHY.goldHi}"/><stop offset="0.55" stop-color="${TROPHY.goldMid}"/><stop offset="1" stop-color="${TROPHY.goldLo}"/>
</linearGradient>
<linearGradient id="gRibbon" x1="110" y1="0" x2="190" y2="0" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.ribbonHi}"/><stop offset="1" stop-color="${p.ribbonLo}"/>
</linearGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M 110 90 C 90 96 78 112 82 130 C 86 152 106 166 128 168 L 128 150 C 114 146 102 136 100 122 C 98 110 104 100 116 96 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2"/>
<path d="M 190 90 C 210 96 222 112 218 130 C 214 152 194 166 172 168 L 172 150 C 186 146 198 136 200 122 C 202 110 196 100 184 96 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2"/>
<path d="M 104 78 L 196 78 C 196 130 182 172 150 184 C 118 172 104 130 104 78 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2.5"/>
<path d="M 116 90 L 184 90" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.4"/>
<path d="M 138 184 L 138 236 L 162 236 L 162 184 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2"/>
<path d="M 108 236 L 192 236 L 202 268 L 98 268 Z" fill="url(#gGold)" stroke="${TROPHY.goldLine}" stroke-width="2.5"/>
<rect x="86" y="268" width="128" height="108" rx="6" fill="${TROPHY.baseWood}" stroke="${TROPHY.baseWoodLine}" stroke-width="2.5"/>
<rect x="86" y="268" width="128" height="14" fill="${TROPHY.baseWoodLine}" opacity="0.35"/>
<rect x="102" y="304" width="96" height="36" rx="5" fill="url(#gRibbon)" stroke="${TROPHY.goldLine}" stroke-width="1.5"/>
<path d="M 68 96 L 74 108 L 62 104 L 72 116 L 58 112 Z" fill="${TROPHY.sparkle}"/>
<path d="M 226 130 L 232 140 L 222 138 L 230 148 L 218 144 Z" fill="${TROPHY.sparkle}"/>
<path d="M 150 66 L 154 76 L 164 74 L 156 82 L 162 92 L 150 86 L 138 92 L 144 82 L 136 74 L 146 76 Z" fill="${TROPHY.sparkle}" opacity="0.9"/>
</g>
</svg>`;
  }
  function drawTrophy(ctx, opts) {
    const color = opts.color || '#d62828';
    drawSingleSprite(ctx, 'trophy', color, trophyPalette(color), trophyBodySVG);
  }

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
        'Stormy Beak', 'Captain Squawk', 'Limey Lorikeet', 'Cannonball Carl',
        'Sir Chirpsalot', 'Whisper Wing', 'Barnacle Bill', 'Pegleg Polly',
        'Riptide Rover', 'Doubloon Dave', 'Cherry Corsair', 'Berry Bandit',
      ],
    },
    // Superhero plumber squad — the plunger saves the day, one clog at a time.
    { id: 'plunger', name: 'Plunger', emoji: '🪠', unlock: 3, names: [
      'Captain Plunge', 'Scarlet Sucker', 'Lime Justice', 'Sarge Suction',
      'Grape Avenger', 'Frosty Flush', 'Apple Unclog', 'Kiwi Kaboom',
      'Riptide Ranger', 'Citrus Sarge', 'Cherry Bomb', 'Berry Sidekick',
    ] },
    // B-movie monster cast — kaiju-sized roars, not a science lecture.
    { id: 'trex', name: 'T-Rex', emoji: '🦖', unlock: 5, names: [
      'Rex Rumble', 'Scarlet Chomp', 'Lime Fang', 'Orange Roarke',
      'Grape Gnasher', 'Frosty Claws', 'Apple Stomper', 'Kiwi Rex',
      'Riptide Fang', 'Citrus Chomper', 'Cherry Crusher', 'Berry Bite',
    ] },
    // Blacksmith/viking crew — mighty, a little Thor-ish, all business.
    { id: 'hammer', name: 'Hammer', emoji: '🔨', unlock: 7, names: [
      'Thor Blue', 'Scarlet Smash', 'Lime Wrecker', 'Orange Anvil',
      'Grape Crusher', 'Frosty Forge', 'Apple Driver', 'Kiwi Knocker',
      'Riptide Smith', 'Citrus Clang', 'Cherry Sledge', 'Berry Bonker',
    ] },
    // Astronaut call-signs — mission control chatter.
    { id: 'ship', name: 'Spaceship', emoji: '🚀', unlock: 9, names: [
      'Major Blue', 'Captain Punch', 'Lime Comet', 'Orbit Orange',
      'Grape Galaxy', 'Frosty Nova', 'Apple Astro', 'Kiwi Nebula',
      'Riptide Rocket', 'Citrus Cosmos', 'Cherry Meteor', 'Berry Star',
    ] },
    // Over-the-top award-show titles.
    { id: 'trophy', name: 'Trophy', emoji: '🏆', unlock: 11, names: [
      'Blue Champion', 'Punch Podium', 'Lime Legend', 'Orange Ace',
      'Grape Gold', 'Frosty First', 'Apple All-Star', 'Kiwi Kingpin',
      'Riptide Champ', 'Citrus Crown', 'Cherry Champ', 'Berry Best',
    ] },
    // future: { id: 'taco', name: 'Taco', emoji: '🌮', unlock: 13, names: [...] }, ...
  ];
  const drawFns = {
    parrot: drawParrot, plunger: drawPlunger, trex: drawTrex,
    hammer: drawHammer, ship: drawShip, trophy: drawTrophy,
  };   // 'bottle' is drawn by renderer.js

  return {
    list: () => META.slice(),
    metaFor: (id) => META.find((m) => m.id === id) || null,
    unlockRule: (id) => (META.find((m) => m.id === id) || {}).unlock ?? null,
    namesFor: (id) => (META.find((m) => m.id === id) || {}).names || null,
    hasDraw: (id) => !!drawFns[id],
    draw: (ctx, id, opts) => { const f = drawFns[id]; if (f) f(ctx, opts || {}); },
    preload: (colors) => {
      for (const c of colors || []) {
        getParrotSprite(c);
        getSingleSprite('plunger', c, plungerPalette(c), plungerBodySVG);
        getSingleSprite('trex', c, trexPalette(c), trexBodySVG);
        getSingleSprite('hammer', c, hammerPalette(c), hammerBodySVG);
        getSingleSprite('ship', c, shipPalette(c), shipBodySVG);
        getSingleSprite('trophy', c, trophyPalette(c), trophyBodySVG);
      }
    },
  };
})();
