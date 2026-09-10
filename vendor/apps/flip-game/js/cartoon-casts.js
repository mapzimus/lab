// cartoon-casts.js — chunky cartoony SVG casts for Pets / Garden / Robots /
// Ocean / Snacks / Cryptids. Loaded before skins.js; exposes builders on
// window.FLIP_CARTOON_CASTS that skins.js wires into drawFns + the roster.
//
// Every entry draws into a 300×420 viewBox with the physics contact plane at
// y≈376, so feet / bases land on the same ground line as the parrot & plunger.
// Bodies are painted with the player-tinted url(#gC) gradient; url(#gL) is a
// lighter belly gradient and url(#gG) a soft radial for domes / bulbs.
(function () {
  // ── tint helpers ────────────────────────────────────────────────────────────
  function shade(hex, t) {
    const n = parseInt(String(hex).slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = t >= 0 ? 255 : 0, u = Math.abs(t);
    const rr = Math.round(r + (m - r) * u);
    const gg = Math.round(g + (m - g) * u);
    const bb = Math.round(b + (m - b) * u);
    return '#' + [rr, gg, bb].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  // ── shared (non-tinted) material colors ─────────────────────────────────────
  const INK = '#2a2430';        // outlines / pupils
  const CHEEK = '#ff8fb8';      // blush / inner ear / snout
  const LEAF = '#4caf3f';       // stems / greens
  const LEAF_D = '#2f7a28';
  const BROWN = '#8a5a34';      // cones / soil / wood
  const BROWN_D = '#5f3d21';
  const SEED = '#3a2418';       // sunflower / poppy seeds
  const GOLD = '#ffc233';
  const GOLD_D = '#c8901a';
  const GLASS = '#bfe8f5';      // screens / bubbles / windows
  const GLASS_D = '#7fb8cf';
  const GRAY = '#cfd6dd';       // metal
  const GRAY_D = '#8b9299';
  const DARK = '#22303b';       // dark cavities
  const TEETH = '#fdfbf3';
  const CREAM = '#f6ead0';

  // ── googly eyes: white + pupil + glint (a pair) ─────────────────────────────
  function eyes(x1, y1, x2, y2, r, o) {
    r = r || 10; o = o || {};
    const lx = o.look || 0, ly = (o.lookY == null ? 1 : o.lookY);
    const pr = r * 0.52, gr = Math.max(2.2, r * 0.3);
    return `<circle cx="${x1}" cy="${y1}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`
      + `<circle cx="${x2}" cy="${y2}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`
      + `<circle cx="${x1 + lx}" cy="${y1 + ly}" r="${pr}" fill="${INK}"/>`
      + `<circle cx="${x2 + lx}" cy="${y2 + ly}" r="${pr}" fill="${INK}"/>`
      + `<circle cx="${x1 + lx - gr * 0.9}" cy="${y1 + ly - gr}" r="${gr}" fill="#fff"/>`
      + `<circle cx="${x2 + lx - gr * 0.9}" cy="${y2 + ly - gr}" r="${gr}" fill="#fff"/>`;
  }
  // single googly eye for side-profile characters
  function eye(cx, cy, r, look) {
    r = r || 11; look = look || 0;
    const pr = r * 0.52, gr = Math.max(2.2, r * 0.3);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`
      + `<circle cx="${cx + look}" cy="${cy + 1}" r="${pr}" fill="${INK}"/>`
      + `<circle cx="${cx + look - gr * 0.9}" cy="${cy + 1 - gr}" r="${gr}" fill="#fff"/>`;
  }
  // soft smile; depth controls how happy
  function smile(x, y, w, depth) {
    depth = depth == null ? 12 : depth;
    return `<path d="M ${x} ${y} Q ${x + w / 2} ${y + depth} ${x + w} ${y}" fill="none" stroke="${INK}" stroke-width="3.5"/>`;
  }
  // little cat/critter nose + mouth
  function muzzle(cx, y, nose) {
    return `<path d="M ${cx - 8} ${y} L ${cx + 8} ${y} L ${cx} ${y + 9} Z" fill="${nose || CHEEK}" stroke="${INK}" stroke-width="1.5"/>`
      + `<path d="M ${cx} ${y + 9} L ${cx} ${y + 16} M ${cx} ${y + 16} Q ${cx - 12} ${y + 24} ${cx - 18} ${y + 15} M ${cx} ${y + 16} Q ${cx + 12} ${y + 24} ${cx + 18} ${y + 15}" fill="none" stroke="${INK}" stroke-width="2.5"/>`;
  }
  // blush cheeks
  function blush(x1, x2, y, r) {
    r = r || 12;
    return `<ellipse cx="${x1}" cy="${y}" rx="${r}" ry="${r * 0.7}" fill="${CHEEK}" opacity="0.5"/>`
      + `<ellipse cx="${x2}" cy="${y}" rx="${r}" ry="${r * 0.7}" fill="${CHEEK}" opacity="0.5"/>`;
  }
  // oval foot with toe lines
  function paw(cx, y, w, fill, line, toes) {
    let s = `<ellipse cx="${cx}" cy="${y}" rx="${w}" ry="${w * 0.58}" fill="${fill}" stroke="${line}" stroke-width="3"/>`;
    if (toes) {
      s += `<path d="M ${cx - w * 0.5} ${y - 2} L ${cx - w * 0.5} ${y + w * 0.35} M ${cx} ${y - 3} L ${cx} ${y + w * 0.4} M ${cx + w * 0.5} ${y - 2} L ${cx + w * 0.5} ${y + w * 0.35}"`
        + ` fill="none" stroke="${line}" stroke-width="2"/>`;
    }
    return s;
  }

  function wrap(p, art) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420">
<defs>
<linearGradient id="gC" x1="80" y1="40" x2="220" y2="380" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.hi}"/><stop offset="0.52" stop-color="${p.base}"/><stop offset="1" stop-color="${p.lo}"/>
</linearGradient>
<linearGradient id="gL" x1="120" y1="150" x2="180" y2="360" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="${p.belly}"/><stop offset="1" stop-color="${p.hi}"/>
</linearGradient>
<radialGradient id="gG" cx="0.36" cy="0.3" r="0.85">
<stop offset="0" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.lo}"/>
</radialGradient>
</defs>
<g stroke-linecap="round" stroke-linejoin="round">
<ellipse cx="150" cy="384" rx="80" ry="13" fill="#00000018"/>${art}</g></svg>`;
  }

  // ══ Pets ════════════════════════════════════════════════════════════════════
  const PET_CAST = {
    '#1f9bff': { label: 'cat', draw: (p) => `
<path d="M 208 320 Q 268 300 254 232 Q 248 204 226 218 Q 244 246 226 292 Q 214 314 198 320 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="302" rx="74" ry="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="322" rx="40" ry="46" fill="url(#gL)"/>
${paw(116, 366, 24, p.lo, p.line, true)}
${paw(184, 366, 24, p.lo, p.line, true)}
<circle cx="150" cy="176" r="66" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 96 136 L 76 70 L 134 114 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 204 136 L 224 70 L 166 114 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 100 124 L 90 88 L 122 112 Z M 200 124 L 210 88 L 178 112 Z" fill="${CHEEK}"/>
${blush(112, 188, 196, 15)}
${eyes(126, 170, 174, 170, 12)}
${muzzle(150, 190)}
<path d="M 92 184 L 56 176 M 92 196 L 54 200 M 208 184 L 244 176 M 208 196 L 246 200" fill="none" stroke="${INK}" stroke-width="2" opacity="0.65"/>` },
    '#e3263c': { label: 'dog', draw: (p) => `
<path d="M 214 316 Q 258 300 260 258 Q 260 236 240 246 Q 250 272 226 302 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="300" rx="76" ry="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="322" rx="40" ry="44" fill="url(#gL)"/>
${paw(114, 366, 24, p.lo, p.line, true)}
${paw(186, 366, 24, p.lo, p.line, true)}
<circle cx="150" cy="176" r="64" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 92 150 Q 60 150 62 200 Q 66 244 100 224 Q 92 190 100 158 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 208 150 Q 240 150 238 200 Q 234 244 200 224 Q 208 190 200 158 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
${eyes(126, 168, 174, 168, 12)}
<ellipse cx="150" cy="200" rx="42" ry="30" fill="${p.belly}"/>
<ellipse cx="150" cy="196" rx="15" ry="12" fill="${INK}"/>
<circle cx="145" cy="192" r="4" fill="#fff" opacity="0.8"/>
<path d="M 150 208 L 150 218 M 150 218 Q 132 228 124 216 M 150 218 Q 168 228 176 216" fill="none" stroke="${INK}" stroke-width="3"/>
<path d="M 150 224 Q 138 244 128 238 Q 134 230 140 224 Z" fill="${CHEEK}" stroke="${INK}" stroke-width="1.5"/>` },
    '#8ed11a': { label: 'rabbit', draw: (p) => `
<ellipse cx="150" cy="308" rx="62" ry="62" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="326" rx="34" ry="40" fill="url(#gL)"/>
${paw(112, 366, 22, p.lo, p.line, true)}
${paw(188, 366, 22, p.lo, p.line, true)}
<circle cx="150" cy="204" r="58" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 120 152 Q 104 60 128 50 Q 148 58 138 150 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 180 152 Q 196 60 172 50 Q 152 58 162 150 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 122 145 Q 112 76 126 66 Q 136 74 132 144 Z" fill="${CHEEK}" opacity="0.8"/>
<path d="M 178 145 Q 188 76 174 66 Q 164 74 168 144 Z" fill="${CHEEK}" opacity="0.8"/>
${blush(114, 186, 214, 14)}
${eyes(128, 198, 172, 198, 11)}
<path d="M 150 214 L 142 222 L 158 222 Z" fill="${CHEEK}" stroke="${INK}" stroke-width="1.5"/>
<path d="M 150 222 L 150 230 M 142 236 L 150 230 L 158 236" fill="none" stroke="${INK}" stroke-width="2.5"/>
<rect x="143" y="234" width="6" height="10" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.2"/>
<rect x="151" y="234" width="6" height="10" rx="2" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` },
    '#ff7a00': { label: 'fish', draw: (p) => `
<path d="M 74 228 L 22 172 L 34 228 L 22 288 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 178 Q 132 132 168 148 Q 174 176 150 180 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 278 Q 134 320 166 306 Q 172 284 150 276 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="158" cy="228" rx="96" ry="58" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="252" rx="70" ry="30" fill="url(#gL)" opacity="0.85"/>
<path d="M 108 200 Q 118 210 108 222 M 132 194 Q 142 206 132 220 M 156 194 Q 166 206 156 220" fill="none" stroke="${p.line}" stroke-width="2.5" opacity="0.5"/>
${eye(196, 214, 14, 3)}
<path d="M 208 240 Q 232 250 208 262" fill="none" stroke="${INK}" stroke-width="3.5"/>
<circle cx="52" cy="150" r="7" fill="${GLASS}" opacity="0.8" stroke="${GLASS_D}" stroke-width="1.5"/>
<circle cx="70" cy="120" r="5" fill="${GLASS}" opacity="0.7" stroke="${GLASS_D}" stroke-width="1.2"/>` },
    '#8a3ffc': { label: 'hamster', draw: (p) => `
<ellipse cx="150" cy="262" rx="86" ry="92" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="290" rx="52" ry="58" fill="url(#gL)"/>
<circle cx="96" cy="180" r="22" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="204" cy="180" r="22" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="96" cy="180" r="11" fill="${CHEEK}" opacity="0.75"/>
<circle cx="204" cy="180" r="11" fill="${CHEEK}" opacity="0.75"/>
<ellipse cx="106" cy="250" rx="24" ry="20" fill="${p.belly}" opacity="0.9"/>
<ellipse cx="194" cy="250" rx="24" ry="20" fill="${p.belly}" opacity="0.9"/>
${eyes(126, 210, 174, 210, 12)}
<path d="M 150 228 L 142 236 L 158 236 Z" fill="${CHEEK}" stroke="${INK}" stroke-width="1.5"/>
<path d="M 150 236 L 150 242 M 138 246 L 150 242 L 162 246" fill="none" stroke="${INK}" stroke-width="2.5"/>
<rect x="144" y="240" width="5" height="9" rx="2" fill="#fff" stroke="${INK}" stroke-width="1"/>
<rect x="151" y="240" width="5" height="9" rx="2" fill="#fff" stroke="${INK}" stroke-width="1"/>
${paw(120, 348, 16, p.lo, p.line, false)}
${paw(180, 348, 16, p.lo, p.line, false)}` },
    '#5fcfe6': { label: 'bird', draw: (p) => `
<path d="M 150 130 Q 150 74 172 92 Q 168 112 158 130 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="258" rx="62" ry="76" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="278" rx="38" ry="52" fill="url(#gL)"/>
<circle cx="150" cy="164" r="52" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 96 250 Q 44 226 68 174 Q 96 210 106 250 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 204 250 Q 256 226 232 174 Q 204 210 194 250 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
${blush(118, 182, 176, 12)}
${eyes(134, 158, 166, 158, 11)}
<path d="M 150 172 L 132 184 L 150 196 L 168 184 Z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
<path d="M 132 184 L 168 184" fill="none" stroke="${GOLD_D}" stroke-width="1.8"/>
<path d="M 128 336 L 116 366 M 138 340 L 132 368 M 172 340 L 168 368 M 162 336 L 176 366" fill="none" stroke="${GOLD}" stroke-width="6"/>` },
    '#3fae1a': { label: 'turtle', draw: (p) => `
<circle cx="228" cy="252" r="40" fill="url(#gL)" stroke="${p.line}" stroke-width="3"/>
${eyes(218, 244, 244, 244, 9)}
${smile(220, 262, 26, 8)}
<path d="M 60 262 Q 44 252 40 236 M 92 320 L 78 358 M 208 320 L 222 358" fill="none" stroke="${p.lo}" stroke-width="16"/>
${paw(78, 360, 14, p.lo, p.line, false)}
${paw(222, 360, 14, p.lo, p.line, false)}
<path d="M 60 262 Q 40 260 30 250 Q 42 268 58 270 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="130" cy="256" rx="106" ry="78" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="130" cy="256" rx="72" ry="48" fill="${p.lo}" opacity="0.5"/>
<path d="M 130 190 L 130 322 M 62 256 L 198 256 M 82 210 L 178 302 M 82 302 L 178 210" fill="none" stroke="${p.line}" stroke-width="2.5" opacity="0.55"/>
<circle cx="130" cy="256" r="18" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>` },
    '#ff5b86': { label: 'pig', draw: (p) => `
<path d="M 216 314 Q 258 306 254 272 Q 250 250 236 262 Q 246 280 226 300 Q 250 296 250 314 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="292" rx="80" ry="72" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="312" rx="42" ry="46" fill="url(#gL)"/>
${paw(116, 366, 22, p.lo, p.line, false)}
${paw(184, 366, 22, p.lo, p.line, false)}
<circle cx="150" cy="182" r="66" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 100 132 Q 84 108 112 108 Q 122 122 118 142 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 200 132 Q 216 108 188 108 Q 178 122 182 142 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${blush(108, 192, 200, 15)}
${eyes(126, 172, 174, 172, 11)}
<ellipse cx="150" cy="210" rx="32" ry="24" fill="${p.belly}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="139" cy="210" rx="5" ry="8" fill="${INK}"/>
<ellipse cx="161" cy="210" rx="5" ry="8" fill="${INK}"/>` },
    '#4f63e0': { label: 'ferret', draw: (p) => `
<path d="M 176 300 Q 258 296 278 224 Q 288 186 258 196 Q 268 236 226 268 Q 200 284 176 286 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 348 Q 84 300 96 200 Q 108 128 150 120 Q 178 128 180 178 Q 172 260 150 300 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 132 320 Q 108 260 122 194 Q 134 156 150 152 Q 160 200 152 268 Q 146 306 138 330 Z" fill="url(#gL)"/>
${paw(120, 360, 18, p.lo, p.line, false)}
${paw(172, 360, 18, p.lo, p.line, false)}
<circle cx="150" cy="132" r="46" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="118" cy="104" r="15" fill="url(#gC)" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="182" cy="104" r="15" fill="url(#gC)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 108 132 Q 150 116 192 132 Q 190 156 150 160 Q 110 156 108 132 Z" fill="${p.deep}" opacity="0.7"/>
${eyes(132, 128, 168, 128, 10)}
<path d="M 150 146 L 143 153 L 157 153 Z" fill="${INK}"/>
${smile(140, 158, 20, 7)}` },
    '#ffc233': { label: 'corgi', draw: (p) => `
<ellipse cx="150" cy="308" rx="90" ry="58" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="322" rx="52" ry="40" fill="url(#gL)"/>
${paw(96, 366, 20, p.lo, p.line, true)}
${paw(140, 368, 18, p.lo, p.line, true)}
${paw(184, 368, 18, p.lo, p.line, true)}
${paw(220, 366, 20, p.lo, p.line, true)}
<circle cx="150" cy="192" r="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 100 158 L 72 92 L 130 138 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 200 158 L 228 92 L 170 138 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 106 148 L 90 108 L 124 138 Z M 194 148 L 210 108 L 176 138 Z" fill="${CHEEK}"/>
<ellipse cx="150" cy="212" rx="46" ry="30" fill="${p.belly}"/>
${blush(112, 188, 208, 13)}
${eyes(128, 184, 172, 184, 11)}
<ellipse cx="150" cy="212" rx="13" ry="10" fill="${INK}"/>
<path d="M 150 222 L 150 230 M 150 230 Q 136 240 130 230 M 150 230 Q 164 240 170 230" fill="none" stroke="${INK}" stroke-width="3"/>
<path d="M 150 236 Q 140 252 132 246 Z" fill="${CHEEK}" stroke="${INK}" stroke-width="1.5"/>` },
    '#c8203a': { label: 'bowtie-cat', draw: (p) => `
<path d="M 210 322 Q 266 300 252 234 Q 246 208 224 220 Q 242 248 224 292 Q 214 316 200 322 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="308" rx="70" ry="64" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="326" rx="36" ry="40" fill="url(#gL)"/>
${paw(118, 366, 22, p.lo, p.line, true)}
${paw(182, 366, 22, p.lo, p.line, true)}
<path d="M 150 262 L 118 246 L 130 266 L 118 286 L 150 270 L 182 286 L 170 266 L 182 246 Z" fill="${INK}"/>
<circle cx="150" cy="266" r="8" fill="${GOLD}" stroke="${INK}" stroke-width="1.5"/>
<circle cx="150" cy="184" r="62" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 100 146 L 82 82 L 136 124 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 200 146 L 218 82 L 164 124 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 104 134 L 96 98 L 126 122 Z M 196 134 L 204 98 L 174 122 Z" fill="${CHEEK}"/>
${blush(112, 188, 202, 14)}
${eyes(126, 178, 174, 178, 12)}
${muzzle(150, 196)}
<path d="M 92 192 L 58 184 M 208 192 L 242 184" fill="none" stroke="${INK}" stroke-width="2" opacity="0.65"/>` },
    '#ff9ecf': { label: 'goldfish', draw: (p) => `
<path d="M 78 226 Q 20 168 26 214 Q 12 226 26 240 Q 20 288 78 232 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 176 Q 116 118 158 130 Q 176 160 156 184 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 276 Q 116 336 160 320 Q 178 288 156 268 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="164" cy="228" rx="88" ry="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="156" cy="252" rx="60" ry="28" fill="url(#gL)" opacity="0.85"/>
<path d="M 120 206 Q 130 216 120 228 M 146 200 Q 156 212 146 226" fill="none" stroke="${p.line}" stroke-width="2.5" opacity="0.5"/>
${eye(202, 216, 15, 3)}
<path d="M 216 244 Q 240 254 216 266" fill="none" stroke="${INK}" stroke-width="3.5"/>
<circle cx="60" cy="150" r="6" fill="${GLASS}" opacity="0.8" stroke="${GLASS_D}" stroke-width="1.2"/>` },
  };

  // ══ Garden ══════════════════════════════════════════════════════════════════
  const GARDEN_CAST = {
    '#1f9bff': { label: 'sunflower', draw: (p) => `
<rect x="142" y="230" width="18" height="140" rx="9" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<path d="M 150 300 Q 96 286 90 244 Q 130 250 152 288 Z" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<path d="M 150 330 Q 208 320 214 278 Q 172 282 148 320 Z" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
      const a = (i / 12) * Math.PI * 2;
      const x = 150 + Math.cos(a) * 74, y = 168 + Math.sin(a) * 74;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="26" ry="14" transform="rotate(${((a * 180) / Math.PI).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#gC)" stroke="${p.line}" stroke-width="2.5"/>`;
    }).join('')}
<circle cx="150" cy="168" r="48" fill="${BROWN}" stroke="${BROWN_D}" stroke-width="3"/>
<circle cx="150" cy="168" r="48" fill="url(#gG)" opacity="0.15"/>
${[[128, 150], [172, 150], [138, 186], [162, 186], [150, 168]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${SEED}"/>`).join('')}
${blush(122, 178, 176, 12)}
${eyes(136, 160, 164, 160, 10)}
${smile(138, 184, 24, 9)}` },
    '#e3263c': { label: 'tomato', draw: (p) => `
${paw(120, 366, 16, p.lo, p.line, false)}
${paw(180, 366, 16, p.lo, p.line, false)}
<ellipse cx="150" cy="250" rx="94" ry="86" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="118" cy="222" rx="26" ry="34" fill="${p.hi}" opacity="0.55"/>
<path d="M 108 168 Q 150 128 192 168 Q 178 152 150 150 Q 122 152 108 168 Z" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<path d="M 122 172 L 100 150 M 150 160 L 150 132 M 178 172 L 200 150" fill="none" stroke="${LEAF}" stroke-width="6"/>
<path d="M 150 150 L 150 120" fill="none" stroke="${LEAF}" stroke-width="8"/>
${blush(112, 188, 258, 16)}
${eyes(124, 244, 176, 244, 13)}
${smile(126, 282, 48, 14)}` },
    '#8ed11a': { label: 'mushroom', draw: (p) => `
<rect x="112" y="228" width="76" height="140" rx="26" fill="${CREAM}" stroke="${BROWN_D}" stroke-width="3"/>
<ellipse cx="140" cy="290" rx="10" ry="18" fill="${p.hi}" opacity="0.4"/>
<path d="M 56 216 Q 56 108 150 96 Q 244 108 244 216 Q 150 244 56 216 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="104" cy="158" rx="18" ry="12" fill="#fff" opacity="0.9" stroke="${p.line}" stroke-width="1.5"/>
<ellipse cx="168" cy="140" rx="22" ry="14" fill="#fff" opacity="0.85" stroke="${p.line}" stroke-width="1.5"/>
<ellipse cx="200" cy="176" rx="14" ry="10" fill="#fff" opacity="0.8" stroke="${p.line}" stroke-width="1.5"/>
<ellipse cx="72" cy="188" rx="11" ry="8" fill="#fff" opacity="0.8" stroke="${p.line}" stroke-width="1.5"/>
${blush(120, 180, 272, 13)}
${eyes(128, 262, 172, 262, 12)}
${smile(132, 292, 36, 12)}` },
    '#ff7a00': { label: 'cactus', draw: (p) => `
<ellipse cx="150" cy="356" rx="60" ry="22" fill="${BROWN}" stroke="${BROWN_D}" stroke-width="3"/>
<rect x="121" y="150" width="58" height="200" rx="29" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 121 232 Q 66 222 66 274 Q 66 306 106 300" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 179 208 Q 234 198 234 250 Q 234 282 194 276" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[180, 214, 248, 282, 316].map((y) => `<path d="M 132 ${y} L 140 ${y - 9} M 168 ${y} L 160 ${y - 9}" fill="none" stroke="${p.hi}" stroke-width="2.5"/>`).join('')}
<path d="M 88 258 L 78 250 M 88 276 L 78 284 M 212 234 L 222 226 M 212 252 L 222 260" fill="none" stroke="${p.hi}" stroke-width="2.5"/>
<path d="M 150 138 Q 130 120 140 108 Q 156 118 150 138 M 150 138 Q 170 120 160 108 Q 144 118 150 138 Z" fill="${CHEEK}" stroke="${p.line}" stroke-width="2"/>
${blush(118, 182, 202, 12)}
${eyes(134, 194, 166, 194, 11)}
${smile(138, 220, 24, 9)}` },
    '#8a3ffc': { label: 'carrot', draw: (p) => `
<path d="M 150 108 Q 90 116 96 100 Q 130 90 140 106 M 150 108 Q 150 70 162 78 Q 160 100 154 110 M 150 108 Q 210 116 204 100 Q 170 90 160 106" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<path d="M 150 120 L 108 350 L 192 350 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 130 190 L 170 202 M 122 240 L 178 254 M 116 288 L 184 302" fill="none" stroke="${p.hi}" stroke-width="3.5" opacity="0.6"/>
${blush(126, 174, 224, 13)}
${eyes(133, 216, 167, 216, 11)}
${smile(137, 244, 26, 10)}` },
    '#5fcfe6': { label: 'strawberry', draw: (p) => `
<path d="M 150 148 Q 236 176 224 288 Q 190 370 150 372 Q 110 370 76 288 Q 64 176 150 148 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 116 156 L 92 112 L 124 134 M 150 150 L 150 104 L 168 132 M 184 156 L 208 112 L 176 134" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
${[[112, 236], [150, 218], [188, 236], [128, 278], [172, 278], [150, 314]].map(([x, y]) => `<path d="M ${x} ${y - 6} L ${x + 4} ${y + 2} L ${x} ${y + 8} L ${x - 4} ${y + 2} Z" fill="${GOLD}"/>`).join('')}
${blush(114, 186, 230, 14)}
${eyes(126, 224, 174, 224, 12)}
${smile(128, 258, 44, 13)}` },
    '#3fae1a': { label: 'broccoli', draw: (p) => `
<rect x="128" y="240" width="44" height="128" rx="16" fill="${CREAM}" stroke="${BROWN_D}" stroke-width="3"/>
<ellipse cx="150" cy="300" rx="10" ry="20" fill="#e6d3a8"/>
<circle cx="102" cy="204" r="46" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="198" cy="204" r="46" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="156" r="54" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[[92, 190], [118, 210], [186, 196], [208, 214], [138, 150], [168, 148], [150, 178], [110, 226], [196, 232]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${p.deep}" opacity="0.45"/>`).join('')}
${blush(120, 180, 172, 12)}
${eyes(134, 162, 166, 162, 11)}
${smile(138, 188, 24, 9)}` },
    '#ff5b86': { label: 'pumpkin', draw: (p) => `
<path d="M 150 168 L 150 128" fill="none" stroke="${BROWN}" stroke-width="12"/>
<path d="M 150 132 Q 186 108 180 148 Q 168 138 152 146 Z" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<ellipse cx="150" cy="256" rx="104" ry="88" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="96" cy="256" rx="30" ry="84" fill="${p.lo}" opacity="0.4"/>
<ellipse cx="204" cy="256" rx="30" ry="84" fill="${p.lo}" opacity="0.4"/>
<path d="M 120 178 Q 100 256 120 334 M 180 178 Q 200 256 180 334" fill="none" stroke="${p.lo}" stroke-width="3" opacity="0.6"/>
${blush(108, 192, 264, 16)}
${eyes(120, 246, 180, 246, 14)}
${smile(122, 288, 56, 15)}` },
    '#4f63e0': { label: 'rose', draw: (p) => `
<rect x="143" y="234" width="16" height="136" rx="8" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<path d="M 143 286 Q 92 270 96 234 Q 132 244 148 280 Z" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<path d="M 157 320 Q 208 304 204 268 Q 168 278 152 314 Z" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<circle cx="150" cy="176" r="66" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 118 Q 210 148 196 200 Q 176 158 150 154 Q 124 158 104 200 Q 90 148 150 118 Z" fill="${p.hi}" opacity="0.7"/>
<circle cx="150" cy="176" r="30" fill="${p.deep}" opacity="0.5"/>
<path d="M 150 150 Q 172 168 150 200 Q 128 168 150 150 Z" fill="${p.hi}"/>
${blush(120, 180, 180, 12)}
${eyes(135, 172, 165, 172, 10)}
${smile(138, 196, 24, 9)}` },
    '#ffc233': { label: 'corn', draw: (p) => `
<path d="M 100 176 Q 52 214 82 320 M 200 176 Q 248 214 218 320" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<ellipse cx="150" cy="252" rx="54" ry="116" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[0, 1, 2, 3, 4, 5, 6].map((r) => [0, 1, 2].map((c) => {
      const x = 122 + c * 28, y = 158 + r * 30;
      return `<ellipse cx="${x}" cy="${y}" rx="13" ry="12" fill="${p.hi}" stroke="${p.line}" stroke-width="1.5"/>`;
    }).join('')).join('')}
${eyes(133, 244, 167, 244, 11)}
${smile(137, 272, 26, 10)}` },
    '#c8203a': { label: 'avocado', draw: (p) => `
<path d="M 150 116 Q 232 152 220 276 Q 200 366 150 368 Q 100 366 80 276 Q 68 152 150 116 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 132 Q 214 164 204 272 Q 188 348 150 350 Q 112 348 96 272 Q 86 164 150 132 Z" fill="${p.belly}"/>
<circle cx="150" cy="272" r="46" fill="${BROWN}" stroke="${BROWN_D}" stroke-width="3"/>
<circle cx="136" cy="258" r="14" fill="${p.hi}" opacity="0.6"/>
${blush(118, 182, 200, 14)}
${eyes(126, 190, 174, 190, 12)}
${smile(130, 222, 40, 12)}` },
    '#ff9ecf': { label: 'chili', draw: (p) => `
<path d="M 156 140 Q 152 96 176 86 Q 190 116 164 146" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2.5"/>
<path d="M 160 130 Q 238 190 210 316 Q 172 372 118 328 Q 84 288 96 220 Q 108 154 148 138 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 168 Q 132 240 148 320" fill="none" stroke="${p.hi}" stroke-width="5" opacity="0.5"/>
${blush(122, 176, 224, 13)}
${eyes(132, 216, 172, 224, 12)}
${smile(136, 254, 34, 11)}` },
  };

  // ══ Robots ══════════════════════════════════════════════════════════════════
  const ROBOT_CAST = {
    '#1f9bff': { label: 'toaster', draw: (p) => `
<rect x="96" y="132" width="42" height="46" rx="6" fill="${GRAY}" stroke="${GRAY_D}" stroke-width="2.5"/>
<rect x="162" y="132" width="42" height="46" rx="6" fill="${GRAY}" stroke="${GRAY_D}" stroke-width="2.5"/>
<path d="M 104 132 Q 117 116 130 132 M 170 132 Q 183 116 196 132" fill="${BROWN}" stroke="${BROWN_D}" stroke-width="2.5"/>
<rect x="66" y="176" width="168" height="164" rx="24" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="86" y="196" width="128" height="128" rx="16" fill="${p.belly}" opacity="0.4"/>
<rect x="232" y="240" width="24" height="46" rx="8" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
${blush(104, 196, 250, 14)}
${eyes(116, 236, 184, 236, 15)}
${smile(122, 278, 56, 16)}
<ellipse cx="98" cy="342" rx="18" ry="14" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="202" cy="342" rx="18" ry="14" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>` },
    '#e3263c': { label: 'vacuum', draw: (p) => `
<path d="M 190 200 Q 252 150 258 92" fill="none" stroke="${GRAY_D}" stroke-width="14"/>
<circle cx="258" cy="82" r="18" fill="${GRAY}" stroke="${GRAY_D}" stroke-width="2.5"/>
<circle cx="258" cy="82" r="8" fill="${p.lo}"/>
<ellipse cx="150" cy="330" rx="98" ry="46" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="322" rx="98" ry="30" fill="${DARK}" opacity="0.5"/>
<rect x="106" y="150" width="88" height="176" rx="26" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="122" y="168" width="56" height="60" rx="12" fill="${p.belly}" opacity="0.4"/>
${blush(122, 178, 220, 12)}
${eyes(130, 208, 170, 208, 12)}
${smile(134, 240, 32, 11)}
<circle cx="150" cy="358" r="12" fill="${GRAY}" stroke="${p.line}" stroke-width="2.5"/>` },
    '#8ed11a': { label: 'boombox', draw: (p) => `
<path d="M 92 176 L 92 148 L 208 148 L 208 176" fill="none" stroke="${GRAY_D}" stroke-width="7"/>
<rect x="52" y="172" width="196" height="152" rx="18" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="98" cy="250" r="36" fill="${DARK}" stroke="${p.line}" stroke-width="3"/>
<circle cx="98" cy="250" r="22" fill="${GRAY_D}"/>
<circle cx="98" cy="250" r="10" fill="${p.hi}"/>
<circle cx="202" cy="250" r="36" fill="${DARK}" stroke="${p.line}" stroke-width="3"/>
<circle cx="202" cy="250" r="22" fill="${GRAY_D}"/>
<circle cx="202" cy="250" r="10" fill="${p.hi}"/>
<rect x="134" y="192" width="32" height="16" rx="4" fill="${DARK}"/>
${eyes(140, 232, 160, 232, 8)}
${smile(140, 256, 20, 8)}
<ellipse cx="96" cy="326" rx="16" ry="10" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="204" cy="326" rx="16" ry="10" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>` },
    '#ff7a00': { label: 'tin-can', draw: (p) => `
<path d="M 96 148 L 96 340 Q 96 356 150 356 Q 204 356 204 340 L 204 148 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="148" rx="54" ry="18" fill="${p.hi}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="148" rx="42" ry="11" fill="${DARK}" opacity="0.35"/>
<path d="M 60 156 Q 40 150 44 130 Q 60 128 66 148 Z" fill="${GRAY}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 96 168 L 204 168 M 96 320 L 204 320" fill="none" stroke="${p.lo}" stroke-width="4" opacity="0.6"/>
<rect x="112" y="196" width="76" height="60" rx="8" fill="${p.belly}" opacity="0.55" stroke="${p.line}" stroke-width="2"/>
${blush(110, 190, 290, 13)}
${eyes(128, 282, 172, 282, 12)}
${smile(132, 314, 36, 12)}` },
    '#8a3ffc': { label: 'washer', draw: (p) => `
<rect x="72" y="120" width="156" height="226" rx="22" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="90" y="136" width="120" height="34" rx="10" fill="${p.deep}" opacity="0.55"/>
<circle cx="196" cy="153" r="8" fill="${GOLD}"/>
<circle cx="172" cy="153" r="8" fill="${CHEEK}"/>
<circle cx="150" cy="248" r="66" fill="${GRAY_D}" stroke="${p.line}" stroke-width="4"/>
<circle cx="150" cy="248" r="52" fill="${GLASS}" stroke="${p.line}" stroke-width="3"/>
<path d="M 108 248 Q 130 224 150 248 Q 170 272 192 248" fill="none" stroke="${GLASS_D}" stroke-width="6" opacity="0.7"/>
<path d="M 118 264 Q 140 244 160 264 Q 180 284 190 268" fill="none" stroke="#fff" stroke-width="5" opacity="0.6"/>
<circle cx="128" cy="222" r="10" fill="#fff" opacity="0.6"/>
${eyes(118, 152, 142, 152, 8)}
<ellipse cx="102" cy="346" rx="16" ry="12" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="198" cy="346" rx="16" ry="12" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>` },
    '#5fcfe6': { label: 'blender', draw: (p) => `
<path d="M 108 250 L 118 132 L 182 132 L 192 250 Z" fill="${GLASS}" stroke="${p.line}" stroke-width="3" opacity="0.9"/>
<ellipse cx="150" cy="132" rx="34" ry="12" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 130 210 L 170 210 L 165 248 L 135 248 Z" fill="${p.belly}" opacity="0.6"/>
<path d="M 128 176 L 150 168 L 172 176 L 150 184 Z" fill="${GRAY}" stroke="${p.line}" stroke-width="2"/>
<path d="M 96 250 L 204 250 L 214 344 Q 214 356 150 356 Q 86 356 86 344 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="118" y="300" width="64" height="30" rx="8" fill="${p.deep}" opacity="0.5"/>
<circle cx="196" cy="290" r="9" fill="${GOLD}" stroke="${p.line}" stroke-width="2"/>
${blush(122, 178, 278, 12)}
${eyes(130, 282, 170, 282, 11)}
${smile(134, 314, 32, 10)}` },
    '#3fae1a': { label: 'tv', draw: (p) => `
<path d="M 118 148 L 108 104 M 182 148 L 192 104" fill="none" stroke="${GRAY_D}" stroke-width="5"/>
<circle cx="106" cy="98" r="9" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<circle cx="194" cy="98" r="9" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
<rect x="56" y="144" width="188" height="160" rx="20" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="74" y="162" width="126" height="112" rx="12" fill="${GLASS}" stroke="${p.line}" stroke-width="3"/>
<path d="M 78 168 L 116 168 L 78 210 Z" fill="#fff" opacity="0.4"/>
<rect x="212" y="168" width="24" height="24" rx="6" fill="${p.deep}"/>
<circle cx="224" cy="220" r="10" fill="${GOLD}" stroke="${p.line}" stroke-width="2"/>
<circle cx="224" cy="252" r="10" fill="${CHEEK}" stroke="${p.line}" stroke-width="2"/>
${eyes(112, 210, 162, 210, 15)}
${smile(118, 250, 46, 14)}
<rect x="94" y="304" width="16" height="42" rx="6" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>
<rect x="190" y="304" width="16" height="42" rx="6" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="102" cy="348" rx="18" ry="10" fill="${GRAY_D}"/>
<ellipse cx="198" cy="348" rx="18" ry="10" fill="${GRAY_D}"/>` },
    '#ff5b86': { label: 'calculator', draw: (p) => `
<rect x="86" y="108" width="128" height="234" rx="18" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="102" y="126" width="96" height="46" rx="8" fill="${DARK}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 112 158 L 148 158 M 158 148 L 188 148" fill="none" stroke="${p.hi}" stroke-width="4" opacity="0.85"/>
${[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => {
      const x = 108 + c * 34, y = 190 + r * 36;
      const cols = [p.belly, GOLD, CHEEK, GLASS];
      return `<rect x="${x}" y="${y}" width="26" height="26" rx="6" fill="${cols[(r + c) % 4]}" stroke="${p.line}" stroke-width="2"/>`;
    }).join('')).join('')}
${eyes(126, 149, 174, 149, 8)}` },
    '#4f63e0': { label: 'drone', draw: (p) => `
${[[70, 168], [230, 168], [70, 300], [230, 300]].map(([x, y]) => `<line x1="150" y1="234" x2="${x}" y2="${y}" stroke="${p.lo}" stroke-width="9"/>`
      + `<ellipse cx="${x}" cy="${y}" rx="42" ry="12" fill="${GLASS}" opacity="0.55" stroke="${GLASS_D}" stroke-width="2"/>`
      + `<circle cx="${x}" cy="${y}" r="8" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>`).join('')}
<ellipse cx="150" cy="238" rx="62" ry="44" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="228" rx="40" ry="22" fill="${GLASS}" opacity="0.5"/>
${blush(122, 178, 244, 12)}
${eyes(132, 232, 168, 232, 12)}
${smile(136, 258, 28, 10)}
<circle cx="120" cy="282" r="7" fill="${GOLD}"/><circle cx="180" cy="282" r="7" fill="${CHEEK}"/>` },
    '#ffc233': { label: 'alarm', draw: (p) => `
<path d="M 92 156 L 66 118 M 208 156 L 234 118" fill="none" stroke="${GRAY_D}" stroke-width="9"/>
<circle cx="62" cy="112" r="20" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="238" cy="112" r="20" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="236" r="92" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="236" r="76" fill="${CREAM}" stroke="${p.line}" stroke-width="3"/>
${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<circle cx="${(150 + Math.cos(a) * 64).toFixed(1)}" cy="${(236 + Math.sin(a) * 64).toFixed(1)}" r="3" fill="${INK}"/>`;
    }).join('')}
<path d="M 150 236 L 150 196 M 150 236 L 182 250" fill="none" stroke="${INK}" stroke-width="5"/>
<circle cx="150" cy="236" r="6" fill="${INK}"/>
${blush(116, 184, 262, 13)}
${eyes(124, 254, 176, 254, 11)}
${smile(130, 284, 40, 12)}
<path d="M 126 328 L 112 358 M 174 328 L 188 358" fill="none" stroke="${GRAY_D}" stroke-width="9"/>` },
    '#c8203a': { label: 'microwave', draw: (p) => `
<rect x="54" y="150" width="192" height="164" rx="18" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<rect x="72" y="168" width="118" height="128" rx="10" fill="${DARK}" stroke="${p.line}" stroke-width="3"/>
<rect x="80" y="176" width="102" height="112" rx="6" fill="${GLASS}" opacity="0.25"/>
<circle cx="130" cy="240" r="24" fill="${p.belly}" opacity="0.5" stroke="${p.line}" stroke-width="2"/>
<rect x="202" y="170" width="34" height="126" rx="8" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
${[0, 1, 2, 3].map((i) => `<circle cx="219" cy="${190 + i * 26}" r="7" fill="${[GOLD, CHEEK, GLASS, p.hi][i]}"/>`).join('')}
${blush(96, 156, 246, 12)}
${eyes(104, 238, 156, 238, 12)}
${smile(108, 270, 44, 12)}
<rect x="86" y="314" width="16" height="34" rx="6" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>
<rect x="198" y="314" width="16" height="34" rx="6" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>` },
    '#ff9ecf': { label: 'lamp', draw: (p) => `
<path d="M 150 96 L 150 66" fill="none" stroke="${GOLD}" stroke-width="4"/>
<circle cx="150" cy="58" r="13" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2"/>
<path d="M 120 74 L 138 60 M 180 74 L 162 60 M 108 100 L 90 92 M 192 100 L 210 92" fill="none" stroke="${GOLD}" stroke-width="4" opacity="0.8"/>
<path d="M 82 210 L 150 92 L 218 210 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 118 150 L 150 96 L 168 132 Z" fill="${p.hi}" opacity="0.5"/>
<rect x="140" y="208" width="20" height="122" fill="${GRAY_D}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="336" rx="58" ry="20" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="330" rx="58" ry="14" fill="${p.hi}" opacity="0.4"/>
${blush(120, 180, 170, 12)}
${eyes(132, 162, 168, 162, 11)}
${smile(136, 188, 28, 10)}` },
  };

  // ══ Ocean ═══════════════════════════════════════════════════════════════════
  const OCEAN_CAST = {
    '#1f9bff': { label: 'whale', draw: (p) => `
<path d="M 46 236 L 8 190 L 22 236 L 8 288 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 154 172 Q 148 132 132 118 Q 138 112 150 118 Q 168 138 176 168 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 132 118 Q 116 106 130 96 M 140 120 Q 132 100 148 98 M 150 118 Q 152 98 166 104" fill="none" stroke="${GLASS}" stroke-width="4" opacity="0.7"/>
<ellipse cx="158" cy="240" rx="116" ry="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 74 268 Q 158 300 240 268 Q 220 300 158 306 Q 96 300 74 268 Z" fill="${p.belly}"/>
<path d="M 90 288 L 90 300 M 118 296 L 118 308 M 150 298 L 150 310 M 182 296 L 182 308 M 214 288 L 214 300" fill="none" stroke="${p.line}" stroke-width="2" opacity="0.4"/>
${blush(178, 224, 236, 13)}
${eye(190, 224, 14, 3)}
<path d="M 206 250 Q 232 262 206 274" fill="none" stroke="${INK}" stroke-width="3.5"/>` },
    '#e3263c': { label: 'dolphin', draw: (p) => `
<path d="M 78 232 Q 30 200 22 240 Q 42 244 62 244 Q 42 250 22 274 Q 44 288 82 254 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 156 178 Q 138 128 172 148 Q 176 176 164 186 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 120 288 Q 128 322 100 318 Q 108 300 116 286 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 90 244 Q 120 176 210 190 Q 268 202 254 244 Q 248 268 216 270 Q 150 300 90 264 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 110 258 Q 170 288 226 262 Q 200 278 158 278 Q 120 276 110 258 Z" fill="${p.belly}"/>
<path d="M 246 240 Q 268 236 274 224 Q 260 226 250 232 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="2"/>
${blush(214, 240, 226, 11)}
${eye(220, 220, 12, 3)}
<path d="M 244 236 Q 262 244 250 254" fill="none" stroke="${INK}" stroke-width="3"/>` },
    '#8ed11a': { label: 'shark', draw: (p) => `
<path d="M 66 244 L 22 210 L 36 244 L 22 282 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 180 L 148 116 L 186 182 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 128 296 Q 120 330 150 320 L 156 296 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="158" cy="242" rx="108" ry="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 66 250 Q 150 290 250 252 Q 200 278 150 278 Q 96 278 66 250 Z" fill="${p.belly}"/>
<path d="M 214 262 L 250 258 Q 244 244 214 240 Z" fill="#fff" stroke="${p.line}" stroke-width="2"/>
<path d="M 220 240 L 224 258 M 232 240 L 236 258 M 244 244 L 246 256" fill="none" stroke="${INK}" stroke-width="1.6"/>
<path d="M 118 262 Q 96 244 84 250 Q 100 254 110 264 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2"/>
${eye(200, 224, 13, 3)}
<path d="M 176 214 Q 190 206 204 210" fill="none" stroke="${INK}" stroke-width="3" opacity="0.7"/>` },
    '#ff7a00': { label: 'octopus', draw: (p) => `
${[[62, 320], [98, 342], [134, 352], [170, 352], [206, 342], [242, 320], [50, 268], [254, 268]].map(([x, y], i) => {
      const sx = 108 + (i % 4) * 28;
      return `<path d="M ${sx} 244 Q ${x} ${y - 44} ${x} ${y}" fill="none" stroke="${p.lo}" stroke-width="16"/>`
        + `<circle cx="${x}" cy="${y}" r="10" fill="${p.belly}" stroke="${p.line}" stroke-width="2"/>`;
    }).join('')}
<ellipse cx="150" cy="188" rx="82" ry="78" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="120" cy="152" rx="24" ry="30" fill="${p.hi}" opacity="0.45"/>
${blush(112, 188, 200, 14)}
${eyes(124, 180, 176, 180, 14)}
${smile(126, 216, 48, 13)}` },
    '#8a3ffc': { label: 'crab', draw: (p) => `
<path d="M 84 236 Q 28 200 40 148 Q 54 132 70 150 Q 60 186 100 214 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 40 148 L 20 128 M 40 148 L 24 158" fill="none" stroke="${p.lo}" stroke-width="7"/>
<path d="M 216 236 Q 272 200 260 148 Q 246 132 230 150 Q 240 186 200 214 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 260 148 L 280 128 M 260 148 L 276 158" fill="none" stroke="${p.lo}" stroke-width="7"/>
${[86, 116, 184, 214].map((x, i) => `<path d="M ${x} 292 Q ${x - 20} ${330 + (i % 2) * 8} ${x - 30} 360" fill="none" stroke="${p.lo}" stroke-width="9"/>`).join('')}
<ellipse cx="150" cy="252" rx="86" ry="58" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 82 250 Q 150 288 218 250" fill="none" stroke="${p.deep}" stroke-width="2.5" opacity="0.5"/>
<path d="M 128 208 L 128 176 M 172 208 L 172 176" fill="none" stroke="${p.lo}" stroke-width="6"/>
<circle cx="128" cy="172" r="12" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="130" cy="173" r="6" fill="${INK}"/><circle cx="126" cy="169" r="3" fill="#fff"/>
<circle cx="172" cy="172" r="12" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="174" cy="173" r="6" fill="${INK}"/><circle cx="170" cy="169" r="3" fill="#fff"/>
${smile(128, 262, 44, 12)}` },
    '#5fcfe6': { label: 'seahorse', draw: (p) => `
<path d="M 168 118 Q 232 154 210 216 Q 190 262 176 300 Q 172 340 148 356 Q 120 366 116 338 Q 128 322 142 310 Q 158 274 150 240 Q 128 214 132 178 Q 118 150 138 132 Q 150 124 158 130 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 150 200 L 122 190 M 154 232 L 126 226 M 152 264 L 128 262 M 168 172 L 200 172" fill="none" stroke="${p.hi}" stroke-width="5" opacity="0.7"/>
<path d="M 160 122 L 152 100 L 172 112 M 176 130 L 172 106 L 190 122" fill="none" stroke="${p.hi}" stroke-width="4"/>
<path d="M 200 150 Q 230 148 236 166 Q 224 172 210 166 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
${blush(160, 190, 160, 10)}
${eye(180, 150, 12, 3)}
<path d="M 196 168 Q 214 176 200 186" fill="none" stroke="${INK}" stroke-width="3"/>` },
    '#3fae1a': { label: 'fishy', draw: (p) => `
<path d="M 68 240 L 22 190 L 34 240 L 22 300 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 158 186 Q 140 146 176 158 Q 182 184 162 190 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 290 Q 132 328 168 316 Q 174 296 154 288 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="160" cy="240" rx="98" ry="58" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 116 240 Q 160 272 214 244" fill="none" stroke="${p.belly}" stroke-width="10" opacity="0.7"/>
<path d="M 110 214 Q 122 226 110 238 M 138 208 Q 150 222 138 236" fill="none" stroke="${p.line}" stroke-width="2.5" opacity="0.5"/>
${blush(184, 212, 236, 12)}
${eye(196, 226, 14, 3)}
${smile(196, 250, 22, 9)}` },
    '#ff5b86': { label: 'clam', draw: (p) => `
<ellipse cx="150" cy="252" rx="30" ry="26" fill="${CREAM}" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="150" cy="200" r="14" fill="#fff" stroke="${GLASS_D}" stroke-width="2"/>
<circle cx="146" cy="196" r="5" fill="#fff"/>
<path d="M 50 250 Q 150 116 250 250 Q 232 258 150 258 Q 68 258 50 250 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 90 236 Q 100 176 150 156 M 150 156 Q 200 176 210 236 M 120 226 Q 128 190 150 174 M 180 226 Q 172 190 150 174" fill="none" stroke="${p.lo}" stroke-width="3" opacity="0.6"/>
<path d="M 46 254 Q 150 336 254 254 Q 244 288 150 294 Q 56 288 46 254 Z" fill="url(#gL)" stroke="${p.line}" stroke-width="3"/>
${blush(112, 188, 268, 13)}
${eyes(126, 262, 174, 262, 11)}
${smile(132, 284, 36, 10)}` },
    '#4f63e0': { label: 'lobster', draw: (p) => `
<path d="M 112 206 Q 44 172 50 122 Q 66 106 84 124 Q 74 158 118 186 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 50 122 L 30 104 M 50 122 L 34 132" fill="none" stroke="${p.lo}" stroke-width="7"/>
<path d="M 188 206 Q 256 172 250 122 Q 234 106 216 124 Q 226 158 182 186 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 250 122 L 270 104 M 250 122 L 266 132" fill="none" stroke="${p.lo}" stroke-width="7"/>
${[0, 1, 2, 3].map((i) => `<path d="M 120 ${240 + i * 22} L 88 ${256 + i * 24} M 180 ${240 + i * 22} L 212 ${256 + i * 24}" fill="none" stroke="${p.lo}" stroke-width="7"/>`).join('')}
<ellipse cx="150" cy="220" rx="48" ry="52" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 116 300 Q 108 350 150 358 Q 192 350 184 300 Q 168 322 150 322 Q 132 322 116 300 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 124 278 L 176 278 M 128 296 L 172 296" fill="none" stroke="${p.deep}" stroke-width="2.5" opacity="0.5"/>
<path d="M 134 178 L 128 152 M 166 178 L 172 152" fill="none" stroke="${p.lo}" stroke-width="5"/>
${blush(126, 174, 218, 12)}
${eyes(134, 210, 166, 210, 11)}
${smile(138, 236, 26, 9)}` },
    '#ffc233': { label: 'starfish', draw: (p) => `
<path d="M 150 92 Q 168 168 176 176 Q 244 168 252 182 Q 200 220 194 232 Q 214 300 202 312 Q 168 276 150 274 Q 132 276 98 312 Q 86 300 106 232 Q 100 220 48 182 Q 56 168 124 176 Q 132 168 150 92 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[[150, 140], [190, 200], [172, 268], [128, 268], [110, 200], [150, 210]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${p.deep}" opacity="0.4"/>`).join('')}
${blush(124, 176, 214, 13)}
${eyes(132, 206, 168, 206, 12)}
${smile(136, 234, 28, 11)}` },
    '#c8203a': { label: 'jellyfish', draw: (p) => `
${[92, 118, 150, 182, 208].map((x, i) => `<path d="M ${x} 218 Q ${x + (i % 2 ? 18 : -18)} ${272 + i * 12} ${x} ${340 + (i % 2) * 12}" fill="none" stroke="${p.lo}" stroke-width="7" opacity="0.85"/>`).join('')}
${[108, 150, 192].map((x, i) => `<path d="M ${x} 214 Q ${x} ${300 + i * 8} ${x + (i - 1) * 14} ${356}" fill="none" stroke="${p.belly}" stroke-width="9" opacity="0.7"/>`).join('')}
<path d="M 66 176 Q 66 100 150 92 Q 234 100 234 176 Q 234 214 150 222 Q 66 214 66 176 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 90 130 Q 110 110 138 108" fill="none" stroke="#fff" stroke-width="5" opacity="0.5"/>
<path d="M 78 190 Q 150 208 222 190" fill="none" stroke="${p.deep}" stroke-width="2.5" opacity="0.4"/>
${blush(118, 182, 168, 13)}
${eyes(126, 158, 174, 158, 12)}
${smile(130, 186, 40, 12)}` },
    '#ff9ecf': { label: 'narwhal', draw: (p) => `
<path d="M 60 246 L 20 210 L 34 246 L 20 288 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 224 200 L 286 108" fill="none" stroke="#f0e6ef" stroke-width="12"/>
<path d="M 224 200 L 286 108" fill="none" stroke="${p.line}" stroke-width="2"/>
<path d="M 240 176 L 258 148 M 250 162 L 268 134" fill="none" stroke="${GLASS_D}" stroke-width="3" opacity="0.7"/>
<ellipse cx="158" cy="248" rx="104" ry="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 74 264 Q 158 296 244 262 Q 220 290 158 296 Q 96 290 74 264 Z" fill="${p.belly}"/>
${blush(184, 224, 240, 12)}
${eye(200, 230, 13, 3)}
${smile(198, 256, 24, 9)}` },
  };

  // ══ Snacks ══════════════════════════════════════════════════════════════════
  const SNACK_CAST = {
    '#1f9bff': { label: 'donut', draw: (p) => `
<circle cx="150" cy="238" r="98" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 62 210 Q 150 150 238 210 Q 240 246 220 268 Q 210 210 150 202 Q 90 210 80 268 Q 60 246 62 210 Z" fill="${CHEEK}" stroke="${shade(CHEEK, -0.25)}" stroke-width="2.5"/>
<circle cx="150" cy="238" r="40" fill="${CREAM}" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="238" r="40" fill="url(#gG)" opacity="0.2"/>
${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const cols = [GOLD, LEAF, '#e3263c', GLASS, '#8a3ffc', '#ff7a00'];
      const x = 150 + Math.cos(a) * 66, y = 200 + Math.sin(a) * 24;
      return `<rect x="${(x - 5).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="10" height="6" rx="3" transform="rotate(${(i * 40).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${cols[i % 6]}"/>`;
    }).join('')}
${blush(116, 184, 250, 14)}
${eyes(124, 246, 176, 246, 12)}
${smile(128, 278, 44, 12)}` },
    '#e3263c': { label: 'taco', draw: (p) => `
<path d="M 52 296 Q 52 148 150 138 Q 248 148 248 296 Q 200 274 150 274 Q 100 274 52 296 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="3"/>
<path d="M 68 288 Q 150 232 232 288 Q 232 300 150 300 Q 68 300 68 288 Z" fill="${CREAM}" stroke="${GOLD_D}" stroke-width="2.5"/>
<path d="M 84 268 L 108 226 L 132 268 M 150 264 L 174 222 L 198 264" fill="${LEAF}" stroke="${LEAF_D}" stroke-width="2"/>
<circle cx="118" cy="256" r="10" fill="url(#gC)" stroke="${p.line}" stroke-width="2"/>
<circle cx="182" cy="256" r="10" fill="url(#gC)" stroke="${p.line}" stroke-width="2"/>
<circle cx="150" cy="262" r="10" fill="url(#gC)" stroke="${p.line}" stroke-width="2"/>
${blush(112, 188, 210, 14)}
${eyes(122, 202, 178, 202, 13)}
${smile(126, 232, 48, 13)}` },
    '#8ed11a': { label: 'pretzel', draw: (p) => `
<path d="M 92 296 Q 54 196 116 150 Q 150 128 184 150 Q 246 196 208 296 Q 186 336 150 312 Q 114 336 92 296 M 122 210 Q 150 250 178 210" fill="none" stroke="url(#gC)" stroke-width="30"/>
<path d="M 92 296 Q 54 196 116 150 Q 150 128 184 150 Q 246 196 208 296 Q 186 336 150 312 Q 114 336 92 296 M 122 210 Q 150 250 178 210" fill="none" stroke="${p.line}" stroke-width="3"/>
<path d="M 92 296 Q 54 196 116 150 Q 150 128 184 150 Q 246 196 208 296 Q 186 336 150 312 Q 114 336 92 296 M 122 210 Q 150 250 178 210" fill="none" stroke="${p.hi}" stroke-width="8" opacity="0.35"/>
${[[104, 186], [140, 156], [180, 168], [212, 224], [110, 262], [196, 276], [150, 320]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="${GLASS_D}" stroke-width="1"/>`).join('')}
${blush(120, 202, 232, 12)}
${eyes(128, 226, 196, 226, 11)}
${smile(142, 252, 26, 9)}` },
    '#ff7a00': { label: 'juice', draw: (p) => `
<path d="M 100 158 L 200 158 L 190 130 L 110 130 Z" fill="${p.hi}" stroke="${p.line}" stroke-width="3"/>
<path d="M 118 130 L 108 108 L 128 108 L 132 130 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 100 158 L 110 344 Q 110 356 150 356 Q 190 356 190 344 L 200 158 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 104 190 Q 150 202 196 190 L 194 210 Q 150 222 106 210 Z" fill="${p.belly}" opacity="0.7"/>
<rect x="146" y="86" width="14" height="76" rx="6" fill="${GLASS}" stroke="${GLASS_D}" stroke-width="2.5" transform="rotate(12 153 124)"/>
<circle cx="176" cy="230" r="8" fill="#fff" opacity="0.35"/>
${blush(120, 188, 268, 13)}
${eyes(128, 260, 178, 260, 12)}
${smile(134, 294, 34, 11)}` },
    '#8a3ffc': { label: 'pizza', draw: (p) => `
<path d="M 150 112 L 254 320 L 46 320 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="3"/>
<path d="M 46 320 Q 150 300 254 320 Q 254 336 150 336 Q 46 336 46 320 Z" fill="${BROWN}" stroke="${BROWN_D}" stroke-width="2.5"/>
<path d="M 150 134 L 236 306 L 64 306 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="2"/>
${[[128, 214], [176, 234], [118, 272], [178, 280], [150, 250]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="#d43a2f" stroke="#a02318" stroke-width="1.5"/><circle cx="${x - 3}" cy="${y - 3}" r="4" fill="#e87a72" opacity="0.7"/>`).join('')}
${blush(126, 174, 210, 12)}
${eyes(132, 202, 168, 214, 11)}
${smile(136, 240, 28, 10)}` },
    '#5fcfe6': { label: 'cookie', draw: (p) => `
<circle cx="150" cy="238" r="98" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="150" cy="238" r="98" fill="url(#gG)" opacity="0.12"/>
${[[104, 184], [190, 176], [206, 250], [110, 288], [188, 292], [150, 320], [96, 236]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="${SEED}"/><circle cx="${x - 3}" cy="${y - 3}" r="3.5" fill="#5a3a24"/>`).join('')}
${[[150, 150], [128, 214], [176, 208]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${BROWN}" opacity="0.5"/>`).join('')}
${blush(112, 188, 252, 14)}
${eyes(122, 244, 178, 244, 13)}
${smile(126, 278, 46, 13)}` },
    '#3fae1a': { label: 'icecream', draw: (p) => `
<path d="M 106 244 L 150 366 L 194 244 Z" fill="${BROWN}" stroke="${BROWN_D}" stroke-width="3"/>
<path d="M 118 258 L 138 258 M 130 284 L 150 284 M 142 310 L 162 310 M 118 258 L 150 300 M 182 258 L 150 300" fill="none" stroke="${BROWN_D}" stroke-width="1.6" opacity="0.6"/>
<circle cx="150" cy="196" r="70" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<circle cx="116" cy="158" r="36" fill="${p.belly}" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="182" cy="162" r="32" fill="${p.hi}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 150 124 L 150 94" fill="none" stroke="#c8203a" stroke-width="5"/>
<circle cx="150" cy="88" r="10" fill="#e3263c" stroke="#a02318" stroke-width="2"/>
${[[118, 210], [180, 214], [150, 236]].map(([x, y]) => `<rect x="${x - 4}" y="${y - 2}" width="8" height="5" rx="2" fill="${[GOLD, CHEEK, GLASS][(x + y) % 3]}"/>`).join('')}
${blush(120, 180, 202, 13)}
${eyes(130, 194, 170, 194, 12)}
${smile(134, 224, 32, 11)}` },
    '#ff5b86': { label: 'popcorn', draw: (p) => `
<path d="M 84 204 L 76 344 Q 76 356 150 356 Q 224 356 224 344 L 216 204 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[0, 1, 2, 3, 4].map((i) => `<rect x="${84 + i * 28}" y="204" width="14" height="152" fill="${i % 2 ? '#fff' : 'none'}" opacity="0.3"/>`).join('')}
<path d="M 84 204 L 216 204" fill="none" stroke="${p.line}" stroke-width="3"/>
${[[104, 168], [148, 146], [196, 170], [124, 186], [172, 184], [150, 196]].map(([x, y]) => `<path d="M ${x} ${y - 22} Q ${x + 20} ${y - 18} ${x + 18} ${y + 2} Q ${x + 26} ${y + 20} ${x + 4} ${y + 20} Q ${x - 22} ${y + 24} ${x - 20} ${y + 2} Q ${x - 26} ${y - 18} ${x} ${y - 22} Z" fill="${CREAM}" stroke="${GOLD_D}" stroke-width="2"/>`).join('')}
${blush(118, 182, 256, 13)}
${eyes(126, 250, 174, 250, 12)}
${smile(130, 284, 40, 12)}` },
    '#4f63e0': { label: 'hotdog', draw: (p) => `
<path d="M 48 220 Q 48 168 150 160 Q 252 168 252 220 Q 252 268 150 276 Q 48 268 48 220 Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="3"/>
<path d="M 48 220 Q 48 250 150 258 Q 252 250 252 220 Q 252 300 150 308 Q 48 300 48 220 Z" fill="${shade(GOLD, -0.12)}" stroke="${GOLD_D}" stroke-width="3"/>
<path d="M 70 210 Q 70 184 150 178 Q 230 184 230 210 Q 230 240 150 246 Q 70 240 70 210 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 84 202 Q 116 186 150 190 Q 190 186 216 202" fill="none" stroke="#ffe14d" stroke-width="5"/>
<path d="M 92 220 Q 128 232 162 224 Q 196 232 210 220" fill="none" stroke="#e3263c" stroke-width="5"/>
${blush(116, 184, 214, 13)}
${eyes(124, 208, 176, 208, 12)}
${smile(128, 236, 44, 12)}` },
    '#ffc233': { label: 'cupcake', draw: (p) => `
<path d="M 92 232 L 104 342 Q 106 356 150 356 Q 194 356 196 342 L 208 232 Z" fill="${CREAM}" stroke="${BROWN_D}" stroke-width="3"/>
${[0, 1, 2, 3, 4].map((i) => `<path d="M ${104 + i * 22} 236 L ${100 + i * 22} 350" fill="none" stroke="${BROWN_D}" stroke-width="2" opacity="0.5"/>`).join('')}
<path d="M 82 236 Q 82 196 116 192 Q 124 160 150 158 Q 176 160 184 192 Q 218 196 218 236 Q 150 258 82 236 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 96 224 Q 130 210 150 214 Q 172 210 204 224" fill="none" stroke="${p.hi}" stroke-width="6" opacity="0.5"/>
<circle cx="150" cy="150" r="12" fill="#e3263c" stroke="#a02318" stroke-width="2"/>
<path d="M 150 138 L 150 122" fill="none" stroke="${LEAF_D}" stroke-width="3"/>
${[[112, 226], [150, 232], [188, 226]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${[GLASS, CHEEK, LEAF][(x) % 3]}"/>`).join('')}
${blush(114, 186, 210, 12)}
${eyes(130, 208, 170, 208, 12)}
${smile(134, 234, 32, 11)}` },
    '#c8203a': { label: 'chips', draw: (p) => `
<path d="M 96 132 Q 150 118 204 132 L 214 348 Q 214 360 150 360 Q 86 360 86 348 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 96 132 Q 150 148 204 132 L 202 156 Q 150 172 98 156 Z" fill="${GRAY}" opacity="0.55"/>
<path d="M 96 132 Q 108 122 120 132 Q 132 122 144 132 Q 156 122 168 132 Q 180 122 192 132 Q 200 128 204 132" fill="none" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 100 300 Q 150 288 200 300 L 202 348 Q 150 360 98 348 Z" fill="${p.belly}" opacity="0.5"/>
${[[128, 176], [172, 172], [150, 190]].map(([x, y]) => `<path d="M ${x - 16} ${y} L ${x + 4} ${y - 14} L ${x + 18} ${y + 4} L ${x + 2} ${y + 16} Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2"/><path d="M ${x - 6} ${y} L ${x + 6} ${y}" fill="none" stroke="${GOLD_D}" stroke-width="1.2" opacity="0.6"/>`).join('')}
${blush(116, 184, 244, 13)}
${eyes(126, 236, 174, 236, 12)}
${smile(130, 268, 40, 12)}` },
    '#ff9ecf': { label: 'candy', draw: (p) => `
<path d="M 96 228 L 44 190 L 56 228 L 44 268 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 204 228 L 256 190 L 244 228 L 256 268 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 96 228 L 78 206 M 96 240 L 76 246 M 204 228 L 222 206 M 204 240 L 224 246" fill="none" stroke="${p.line}" stroke-width="2"/>
<ellipse cx="150" cy="236" rx="60" ry="56" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 108 220 Q 150 234 192 220 M 106 240 Q 150 254 194 240 M 108 260 Q 150 272 192 260" fill="none" stroke="#fff" stroke-width="5" opacity="0.4"/>
<ellipse cx="128" cy="212" rx="16" ry="12" fill="#fff" opacity="0.4"/>
${blush(120, 180, 244, 12)}
${eyes(130, 228, 170, 228, 12)}
${smile(134, 256, 32, 11)}` },
  };

  // ══ Cryptids ════════════════════════════════════════════════════════════════
  const CRYPTID_CAST = {
    '#1f9bff': { label: 'bigfoot', draw: (p) => `
<ellipse cx="150" cy="286" rx="76" ry="80" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[110, 130, 150, 170, 190].map((x) => `<path d="M ${x} 214 L ${x - 4} 250 M ${x + 8} 240 L ${x + 4} 280 M ${x - 6} 300 L ${x - 10} 336" fill="none" stroke="${p.deep}" stroke-width="3" opacity="0.5"/>`).join('')}
<ellipse cx="150" cy="300" rx="42" ry="52" fill="url(#gL)"/>
<path d="M 92 240 Q 40 268 52 336 Q 62 356 84 344 Q 74 300 108 262 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 208 240 Q 260 268 248 336 Q 238 356 216 344 Q 226 300 192 262 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="112" cy="366" rx="30" ry="14" fill="${p.deep}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="188" cy="366" rx="30" ry="14" fill="${p.deep}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="164" rx="56" ry="52" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 96 150 L 90 118 M 116 132 L 110 108 M 204 150 L 210 118 M 184 132 L 190 108" fill="none" stroke="${p.deep}" stroke-width="3" opacity="0.55"/>
<ellipse cx="150" cy="180" rx="34" ry="24" fill="${p.belly}"/>
${eyes(132, 158, 168, 158, 11, { look: 1 })}
<ellipse cx="150" cy="176" rx="7" ry="5" fill="${INK}"/>
${smile(134, 190, 32, 10)}` },
    '#e3263c': { label: 'nessie', draw: (p) => `
<path d="M 36 322 Q 78 276 118 300 Q 158 328 196 288 Q 236 246 268 208" fill="none" stroke="url(#gC)" stroke-width="34"/>
<path d="M 36 322 Q 78 276 118 300 Q 158 328 196 288 Q 236 246 268 208" fill="none" stroke="${p.line}" stroke-width="3"/>
<path d="M 60 306 Q 96 276 122 292 M 150 316 Q 180 296 200 272" fill="none" stroke="${p.hi}" stroke-width="6" opacity="0.4"/>
<path d="M 248 226 L 252 188 M 236 232 L 232 200 M 224 232 L 216 206" fill="none" stroke="${p.hi}" stroke-width="6"/>
<ellipse cx="252" cy="180" rx="42" ry="46" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="266" cy="192" rx="20" ry="16" fill="${p.belly}"/>
${eyes(242, 168, 268, 166, 10)}
${smile(246, 194, 26, 9)}
<circle cx="266" cy="192" r="3" fill="${INK}"/>
<path d="M 262 138 L 266 118 M 244 138 L 240 120" fill="none" stroke="${p.hi}" stroke-width="5"/>` },
    '#8ed11a': { label: 'mothman', draw: (p) => `
<path d="M 108 224 Q 24 172 42 96 Q 96 132 122 200 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 192 224 Q 276 172 258 96 Q 204 132 178 200 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 60 130 Q 78 156 100 178 M 70 108 Q 92 140 116 162" fill="none" stroke="${p.deep}" stroke-width="3" opacity="0.5"/>
<path d="M 240 130 Q 222 156 200 178 M 230 108 Q 208 140 184 162" fill="none" stroke="${p.deep}" stroke-width="3" opacity="0.5"/>
<ellipse cx="150" cy="264" rx="46" ry="66" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="278" rx="26" ry="40" fill="url(#gL)"/>
${[130, 170].map((x) => `<path d="M ${x} 330 L ${x - 8} 362" fill="none" stroke="${p.deep}" stroke-width="7"/>`).join('')}
<ellipse cx="122" cy="360" rx="18" ry="10" fill="${p.deep}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="178" cy="360" rx="18" ry="10" fill="${p.deep}" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="150" cy="172" r="42" fill="${p.deep}" stroke="${p.line}" stroke-width="3"/>
<circle cx="130" cy="170" r="17" fill="#ff2a2a" stroke="#7a0000" stroke-width="2.5"/>
<circle cx="170" cy="170" r="17" fill="#ff2a2a" stroke="#7a0000" stroke-width="2.5"/>
<circle cx="126" cy="165" r="6" fill="#fff" opacity="0.9"/>
<circle cx="166" cy="165" r="6" fill="#fff" opacity="0.9"/>
<path d="M 138 196 L 162 196" fill="none" stroke="${INK}" stroke-width="3"/>` },
    '#ff7a00': { label: 'chupacabra', draw: (p) => `
<path d="M 214 320 Q 262 300 258 258 Q 240 268 226 300 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="288" rx="60" ry="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${[112, 130, 150, 170, 188].map((x, i) => `<path d="M ${x} 236 L ${x} ${196 - (i === 2 ? 8 : Math.abs(i - 2) * 4)}" fill="none" stroke="${p.deep}" stroke-width="6"/>`).join('')}
<ellipse cx="150" cy="300" rx="34" ry="40" fill="url(#gL)"/>
<path d="M 96 250 Q 54 272 60 322 M 204 250 Q 246 272 240 322" fill="none" stroke="${p.lo}" stroke-width="11"/>
<ellipse cx="112" cy="352" rx="22" ry="12" fill="${p.deep}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 100 352 L 96 366 M 112 354 L 112 368 M 124 352 L 128 366" fill="none" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="188" cy="352" rx="22" ry="12" fill="${p.deep}" stroke="${p.line}" stroke-width="2.5"/>
<path d="M 176 352 L 172 366 M 188 354 L 188 368 M 200 352 L 204 366" fill="none" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="196" rx="52" ry="50" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 118 168 L 100 132 L 134 158 M 182 168 L 200 132 L 166 158 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="2.5"/>
${eyes(130, 188, 170, 188, 11, { look: 1 })}
<path d="M 150 208 L 143 216 L 157 216 Z" fill="${INK}"/>
<path d="M 132 224 L 140 232 L 148 224 L 156 232 L 164 224" fill="none" stroke="#fff" stroke-width="3.5"/>` },
    '#8a3ffc': { label: 'jersey', draw: (p) => `
<path d="M 104 210 Q 30 168 44 104 Q 92 140 116 196 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 196 210 Q 270 168 256 104 Q 208 140 184 196 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 60 130 Q 82 156 106 174 M 240 130 Q 218 156 194 174" fill="none" stroke="${p.deep}" stroke-width="3" opacity="0.5"/>
<path d="M 206 300 Q 258 288 268 236" fill="none" stroke="${p.base}" stroke-width="11"/>
<ellipse cx="150" cy="276" rx="46" ry="74" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="292" rx="26" ry="46" fill="url(#gL)"/>
<path d="M 130 344 L 122 372 M 170 344 L 178 372" fill="none" stroke="${p.deep}" stroke-width="8"/>
<path d="M 116 372 L 132 372 M 168 372 L 184 372" fill="none" stroke="${p.line}" stroke-width="6"/>
<ellipse cx="150" cy="160" rx="42" ry="40" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 122 132 Q 112 84 100 74 Q 130 90 138 128 M 178 132 Q 188 84 200 74 Q 170 90 162 128" fill="${CREAM}" stroke="${p.line}" stroke-width="2.5"/>
${eyes(134, 156, 166, 156, 10, { look: 1 })}
<path d="M 150 168 L 144 174 L 156 174 Z" fill="${INK}"/>
<path d="M 136 184 L 144 190 L 152 184 L 160 190 L 168 184" fill="none" stroke="#fff" stroke-width="3"/>` },
    '#5fcfe6': { label: 'yeti', draw: (p) => `
<ellipse cx="150" cy="288" rx="80" ry="82" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="302" rx="46" ry="54" fill="#f4fbff"/>
${[104, 130, 150, 170, 196].map((x) => `<path d="M ${x} 220 Q ${x - 4} 246 ${x} 272" fill="none" stroke="#eaf6fb" stroke-width="4" opacity="0.8"/>`).join('')}
<path d="M 88 236 Q 34 262 46 332 Q 56 354 80 342 Q 70 296 106 258 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 212 236 Q 266 262 254 332 Q 244 354 220 342 Q 230 296 194 258 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="110" cy="360" rx="30" ry="14" fill="#eaf6fb" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="190" cy="360" rx="30" ry="14" fill="#eaf6fb" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="156" rx="60" ry="54" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 96 130 Q 104 108 120 118 M 204 130 Q 196 108 180 118 M 150 100 Q 150 84 164 96" fill="none" stroke="#eaf6fb" stroke-width="5"/>
<ellipse cx="150" cy="172" rx="36" ry="24" fill="#f4fbff"/>
${eyes(132, 150, 168, 150, 11, { look: 1 })}
<path d="M 150 166 L 143 174 L 157 174 Z" fill="${INK}"/>
<path d="M 132 182 Q 150 200 168 182" fill="none" stroke="${INK}" stroke-width="3"/>
<path d="M 140 184 L 142 194 M 160 184 L 158 194" fill="none" stroke="#fff" stroke-width="4"/>` },
    '#3fae1a': { label: 'jackalope', draw: (p) => `
<path d="M 206 306 Q 250 288 246 244" fill="none" stroke="${p.base}" stroke-width="12"/>
<circle cx="212" cy="240" r="16" fill="${p.belly}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="298" rx="66" ry="62" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="316" rx="36" ry="40" fill="url(#gL)"/>
${paw(114, 362, 22, p.lo, p.line, true)}
${paw(186, 362, 22, p.lo, p.line, true)}
<circle cx="150" cy="200" r="56" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 118 156 Q 100 72 122 62 Q 140 70 132 154 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 182 156 Q 200 72 178 62 Q 160 70 168 154 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 122 150 Q 112 82 124 74 Z" fill="${CHEEK}" opacity="0.7"/>
<path d="M 178 150 Q 188 82 176 74 Z" fill="${CHEEK}" opacity="0.7"/>
<path d="M 108 168 L 86 112 L 100 132 L 82 96 L 104 128 M 192 168 L 214 112 L 200 132 L 218 96 L 196 128" fill="none" stroke="${CREAM}" stroke-width="6"/>
${blush(116, 184, 210, 13)}
${eyes(130, 194, 170, 194, 11)}
<path d="M 150 210 L 143 218 L 157 218 Z" fill="${CHEEK}" stroke="${INK}" stroke-width="1.5"/>
<path d="M 150 218 L 150 226 M 142 232 L 150 226 L 158 232" fill="none" stroke="${INK}" stroke-width="2.5"/>` },
    '#ff5b86': { label: 'thunderbird', draw: (p) => `
<path d="M 116 210 Q 18 176 26 92 Q 92 132 124 190 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 184 210 Q 282 176 274 92 Q 208 132 176 190 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 44 116 Q 70 150 100 178 M 60 96 Q 90 138 118 166" fill="none" stroke="${p.deep}" stroke-width="4" opacity="0.5"/>
<path d="M 256 116 Q 230 150 200 178 M 240 96 Q 210 138 182 166" fill="none" stroke="${p.deep}" stroke-width="4" opacity="0.5"/>
<ellipse cx="150" cy="252" rx="44" ry="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="266" rx="26" ry="38" fill="url(#gL)"/>
<path d="M 128 306 L 120 340 M 172 306 L 180 340" fill="none" stroke="${GOLD}" stroke-width="7"/>
<path d="M 108 340 L 132 340 M 168 340 L 192 340" fill="none" stroke="${GOLD}" stroke-width="6"/>
<circle cx="150" cy="164" r="40" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
${eyes(133, 158, 167, 158, 11, { look: 1 })}
<path d="M 150 172 L 128 186 L 150 198 L 172 186 Z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
<path d="M 128 186 L 172 186" fill="none" stroke="${GOLD_D}" stroke-width="1.8"/>
<path d="M 34 90 L 18 60 L 30 78 L 20 52" fill="none" stroke="#fff23a" stroke-width="4"/>
<path d="M 266 90 L 282 60 L 270 78 L 280 52" fill="none" stroke="#fff23a" stroke-width="4"/>` },
    '#4f63e0': { label: 'flatwoods', draw: (p) => `
<path d="M 82 210 Q 150 96 218 210 Q 210 250 150 254 Q 90 250 82 210 Z" fill="${p.deep}" stroke="${p.line}" stroke-width="3"/>
<path d="M 96 200 Q 150 118 204 200 Q 198 232 150 236 Q 102 232 96 200 Z" fill="${p.lo}"/>
<path d="M 118 178 Q 150 150 182 178 Q 178 200 150 202 Q 122 200 118 178 Z" fill="${DARK}"/>
<ellipse cx="128" cy="178" rx="9" ry="14" fill="#7bff5a" stroke="#2a7a1a" stroke-width="2"/>
<ellipse cx="172" cy="178" rx="9" ry="14" fill="#7bff5a" stroke="#2a7a1a" stroke-width="2"/>
<ellipse cx="126" cy="173" rx="3" ry="5" fill="#eaffe0"/>
<ellipse cx="170" cy="173" rx="3" ry="5" fill="#eaffe0"/>
<path d="M 86 248 Q 66 320 84 372 L 216 372 Q 234 320 214 248 Q 150 288 86 248 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 116 256 Q 108 320 120 370 M 184 256 Q 192 320 180 370 M 150 262 L 150 372" fill="none" stroke="${p.deep}" stroke-width="3" opacity="0.45"/>
<path d="M 104 246 Q 60 264 58 316" fill="none" stroke="${p.lo}" stroke-width="11"/>
<path d="M 196 246 Q 240 264 242 316" fill="none" stroke="${p.lo}" stroke-width="11"/>` },
    '#ffc233': { label: 'kraken', draw: (p) => `
${[[54, 330], [92, 356], [128, 366], [172, 366], [208, 356], [246, 330], [40, 268], [260, 268]].map(([x, y], i) => {
      const sx = 106 + (i % 4) * 30;
      return `<path d="M ${sx} 236 Q ${x} ${y - 48} ${x} ${y}" fill="none" stroke="${p.lo}" stroke-width="17"/>`
        + `<circle cx="${x}" cy="${y}" r="9" fill="${p.belly}" stroke="${p.line}" stroke-width="2"/>`
        + `<circle cx="${x + (i % 2 ? 14 : -14)}" cy="${y - 20}" r="7" fill="${p.belly}" stroke="${p.line}" stroke-width="1.8"/>`;
    }).join('')}
<path d="M 150 96 L 116 132 L 122 118 M 150 96 L 184 132 L 178 118" fill="none" stroke="${p.deep}" stroke-width="6"/>
<ellipse cx="150" cy="186" rx="80" ry="76" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="118" cy="150" rx="22" ry="28" fill="${p.hi}" opacity="0.4"/>
<circle cx="120" cy="182" r="24" fill="#fff" stroke="${INK}" stroke-width="3"/>
<circle cx="180" cy="182" r="24" fill="#fff" stroke="${INK}" stroke-width="3"/>
<circle cx="126" cy="186" r="12" fill="${INK}"/><circle cx="174" cy="186" r="12" fill="${INK}"/>
<circle cx="120" cy="178" r="5" fill="#fff"/><circle cx="168" cy="178" r="5" fill="#fff"/>
<path d="M 128 224 L 150 240 L 172 224" fill="none" stroke="${INK}" stroke-width="3.5"/>` },
    '#c8203a': { label: 'bunyip', draw: (p) => `
<path d="M 206 312 Q 258 322 274 288 Q 252 288 234 300 Q 250 280 230 274 Q 210 288 200 300 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="288" rx="74" ry="60" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="150" cy="302" rx="42" ry="40" fill="url(#gL)"/>
<path d="M 92 250 Q 44 272 56 322 Q 66 340 88 330 Q 78 292 108 262 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<ellipse cx="108" cy="356" rx="28" ry="14" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 92 354 L 88 368 M 108 356 L 108 370 M 124 354 L 128 368" fill="none" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="192" cy="358" rx="28" ry="14" fill="${p.lo}" stroke="${p.line}" stroke-width="3"/>
<path d="M 176 356 L 172 370 M 192 358 L 192 372 M 208 356 L 212 370" fill="none" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="188" rx="62" ry="56" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 114 150 L 96 104 L 128 138 M 186 150 L 204 104 L 172 138 Z" fill="${p.lo}" stroke="${p.line}" stroke-width="2.5"/>
<ellipse cx="150" cy="206" rx="40" ry="26" fill="${p.belly}"/>
${eyes(128, 180, 172, 180, 12, { look: 1 })}
<ellipse cx="150" cy="200" rx="14" ry="9" fill="${INK}"/>
<circle cx="144" cy="197" r="3" fill="#fff"/>
<path d="M 130 218 Q 150 232 170 218" fill="none" stroke="${INK}" stroke-width="3"/>
<path d="M 134 222 L 132 234 M 166 222 L 168 234" fill="none" stroke="#fff" stroke-width="5"/>` },
    '#ff9ecf': { label: 'nightcrawler', draw: (p) => `
<path d="M 132 96 Q 176 130 168 216 Q 160 290 156 350 Q 152 366 140 356 Q 128 300 132 220 Q 118 150 122 118 Q 118 100 132 96 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 168 96 Q 200 130 192 216 Q 186 300 178 356 Q 168 368 160 352 Q 168 290 156 216 Q 152 130 156 108 Q 154 96 168 96 Z" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 138 340 Q 132 364 124 356 M 176 340 Q 182 364 190 356" fill="none" stroke="${p.deep}" stroke-width="4"/>
<path d="M 140 200 Q 150 210 160 200 M 138 250 Q 150 262 162 250 M 140 300 Q 150 312 162 300" fill="none" stroke="${p.deep}" stroke-width="3" opacity="0.4"/>
<ellipse cx="150" cy="118" rx="44" ry="40" fill="url(#gC)" stroke="${p.line}" stroke-width="3"/>
<path d="M 126 88 L 116 58 M 174 88 L 184 58" fill="none" stroke="${p.lo}" stroke-width="5"/>
<ellipse cx="132" cy="116" rx="10" ry="18" fill="#c6ffe6" stroke="#2a7a5a" stroke-width="2.5"/>
<ellipse cx="168" cy="116" rx="10" ry="18" fill="#c6ffe6" stroke="#2a7a5a" stroke-width="2.5"/>
<ellipse cx="132" cy="110" rx="4" ry="7" fill="#effff8"/>
<ellipse cx="168" cy="110" rx="4" ry="7" fill="#effff8"/>
<circle cx="132" cy="122" r="4" fill="${INK}"/><circle cx="168" cy="122" r="4" fill="${INK}"/>
<path d="M 140 140 Q 150 148 160 140" fill="none" stroke="${INK}" stroke-width="2.5"/>` },
  };

  // ── edition factory ─────────────────────────────────────────────────────────
  function makeEdition(name, CAST) {
    const fallback = CAST['#1f9bff'];
    function palette(base) {
      return {
        base,
        hi: shade(base, 0.22),
        lo: shade(base, -0.28),
        deep: shade(base, -0.45),
        line: shade(base, -0.58),
        belly: shade(base, 0.5),
        v: CAST[String(base).toLowerCase()] || fallback,
      };
    }
    function bodySVG(p) {
      const art = typeof p.v.draw === 'function' ? p.v.draw(p) : '';
      return wrap(p, art);
    }
    return { CAST, palette, bodySVG, name };
  }

  window.FLIP_CARTOON_CASTS = {
    pets: makeEdition('pets', PET_CAST),
    garden: makeEdition('garden', GARDEN_CAST),
    robots: makeEdition('robots', ROBOT_CAST),
    ocean: makeEdition('ocean', OCEAN_CAST),
    snacks: makeEdition('snacks', SNACK_CAST),
    cryptids: makeEdition('cryptids', CRYPTID_CAST),
  };
})();
