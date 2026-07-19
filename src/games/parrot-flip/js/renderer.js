// renderer.js — canvas draw loop

// roundRect polyfill — older Android System WebViews (the bundled offline APK
// target) lack CanvasRenderingContext2D.roundRect; without this the draw loop
// throws and the canvas renders blank. Manual arc/line fallback.
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    let radii = typeof r === 'number' ? [r, r, r, r]
              : (Array.isArray(r) ? r : [0, 0, 0, 0]);
    if (radii.length === 1) radii = [radii[0], radii[0], radii[0], radii[0]];
    if (radii.length === 2) radii = [radii[0], radii[1], radii[0], radii[1]];
    let [tl, tr, br, bl] = radii;
    const max = Math.min(Math.abs(w), Math.abs(h)) / 2;     // clamp oversized radii
    tl = Math.min(tl, max); tr = Math.min(tr, max);
    br = Math.min(br, max); bl = Math.min(bl, max);
    this.moveTo(x + tl, y);
    this.arcTo(x + w, y,     x + w, y + h, tr);
    this.arcTo(x + w, y + h, x,     y + h, br);
    this.arcTo(x,     y + h, x,     y,     bl);
    this.arcTo(x,     y,     x + w, y,     tl);
    this.closePath();
    return this;
  };
}

const Renderer = (() => {
  let canvas, ctx, W, H;
  const particles = [];

  // Screen shake (decaying): amp in px, decays to 0 over shakeDecay px/s.
  let shakeAmp = 0, shakeDecay = 0;
  let reduceMotion = false;             // set via setReduceMotion()

  function setReduceMotion(v) { reduceMotion = !!v; }

  // Celebration burst (MAKE) / shake (MISS). Called once per result by main.js.
  function kick(type, opts = {}) {
    if (type === 'MAKE') {
      const { x, y, color } = opts;
      spawnSplash(x, y - 30, reduceMotion ? 8 : 26, color || '#69f0ae');
    } else if (type === 'MISS') {
      if (reduceMotion) return;
      shakeAmp = 12; shakeDecay = 12 / 0.22;   // ~220ms to zero
    }
  }

  function init(cvs) {
    canvas = cvs;
    ctx    = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;
  }

  function resize(w, h) { W = w; H = h; }

  // ── Color helpers (per-player liquid flavor) ────────────────────────────────
  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  function darken(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 255) - amt);
    const g = Math.max(0, ((n >> 8) & 255) - amt);
    const b = Math.max(0, (n & 255) - amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function lighten(hex, amt, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 255) + amt);
    const g = Math.min(255, ((n >> 8) & 255) + amt);
    const b = Math.min(255, (n & 255) + amt);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // ── Particle helpers ───────────────────────────────────────────────────────
  function spawnSplash(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 180,
        vy: -Math.random() * 160 - 30,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        r: 2.5 + Math.random() * 2.5,
        color,
      });
    }
  }

  function spawnFire(x, y) {
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 28,
        y,
        vx: (Math.random() - 0.5) * 50,
        vy: -70 - Math.random() * 100,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        r: 5 + Math.random() * 5,
        color: Math.random() > 0.45 ? '#ff6600' : '#ffcc00',
        fire: true,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x   += p.vx * dt;
      p.y   += p.vy * dt;
      p.vy  += 300 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + 0.6 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Background & scene ─────────────────────────────────────────────────────
  function drawBackground(groundY, isOnFire) {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    if (isOnFire) {
      sky.addColorStop(0, '#1a0a04');
      sky.addColorStop(0.55, '#3a1408');
      sky.addColorStop(1, '#5a220c');
    } else {
      sky.addColorStop(0, '#071018');
      sky.addColorStop(0.45, '#0f2438');
      sky.addColorStop(1, '#16324a');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // Horizon haze / distant sea
    const haze = ctx.createLinearGradient(0, groundY - 90, 0, groundY);
    haze.addColorStop(0, 'rgba(40, 90, 120, 0)');
    haze.addColorStop(1, isOnFire ? 'rgba(120, 50, 20, 0.35)' : 'rgba(50, 110, 140, 0.28)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, groundY - 90, W, 90);

    // Sparse stars (skip when on fire)
    if (!isOnFire) {
      ctx.fillStyle = 'rgba(244, 239, 227, 0.55)';
      for (let i = 0; i < 28; i++) {
        const sx = ((i * 97) % W);
        const sy = 18 + ((i * 53) % Math.max(40, groundY - 120));
        const r = (i % 3 === 0) ? 1.4 : 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ship deck planks
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(0, groundY, W, H - groundY);

    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    for (let y = groundY + 18; y < H; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // Nail dots / plank seams
    ctx.fillStyle = 'rgba(197,154,74,0.18)';
    for (let x = 24; x < W; x += 64) {
      for (let y = groundY + 10; y < H; y += 22) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // Deck edge rail
    ctx.fillStyle = '#5a3a24';
    ctx.fillRect(0, groundY - 4, W, 5);
    ctx.fillStyle = 'rgba(197,154,74,0.35)';
    ctx.fillRect(0, groundY - 4, W, 1);
  }

  // -- Parrot ----------------------------------------------------------------
  // Draws a pirate macaw over the SAME physics body the bottle used.
  // Physics contract (do not break): CG at bottle.position; body spans roughly
  // y=-72..+43 in local coords, feet must sit at y~+43 so landings read true.
  // liquid.slosh drives the wing flap; kept name drawBottle for the call site.
  function drawBottle(bottle, liquid, isOnFire, liquidColor, accentColor) {
    const { x, y } = bottle.position;
    const angle = bottle.angle;
    const body   = liquidColor || '#d62828';
    const accent = accentColor || '#ffd166';
    const belly  = lighten(body, 70, 1);
    const OUTLINE = 'rgba(16, 24, 34, 0.9)';

    // ON FIRE glow
    if (isOnFire) {
      const glow = ctx.createRadialGradient(x, y, 10, x, y, 95);
      glow.addColorStop(0, 'rgba(255,100,0,0.30)');
      glow.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 95, 0, Math.PI * 2);
      ctx.fill();
      spawnFire(x, y - 100);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineJoin = 'round';

    const flap = Math.max(-0.35, Math.min(0.35, liquid.slosh)); // wing flap (rad)

    // Tail: 3 graduated feather layers sweeping down-left behind the body
    const tailCols = [darken(body, 40), body, accent];
    for (let i = 0; i < 3; i++) {
      const len = 62 - i * 14, wdt = 13 - i * 3;
      ctx.save();
      ctx.translate(-16, 34);
      ctx.rotate(-0.55 - i * 0.22 + flap * 0.3);
      ctx.fillStyle = tailCols[i];
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(-len / 2, 0, len / 2, wdt, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Feet: orange toes planted on the physics base (y~+43)
    ctx.fillStyle = '#e8912d';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    for (const fx of [-15, 13]) {
      ctx.beginPath();
      ctx.roundRect(fx - 3, 26, 8, 18, 3);   // leg
      ctx.fill(); ctx.stroke();
      for (const t of [-6, 0, 6]) {          // three toes
        ctx.beginPath();
        ctx.ellipse(fx + 1 + t, 43, 5.5, 3.4, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    }

    // Body: plump chest, feet-to-shoulders (y~+38 up to -60)
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -12, 34, 52, 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = belly;                  // belly patch
    ctx.beginPath();
    ctx.ellipse(6, 2, 20, 34, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexToRgba(darken(body, 60), 0.45);   // side shading
    ctx.beginPath();
    ctx.ellipse(-16, -12, 14, 46, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;              // body outline
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, -12, 34, 52, 0.06, 0, Math.PI * 2);
    ctx.stroke();

    // Wing: layered feathers, flaps with slosh
    ctx.save();
    ctx.translate(-8, -28);
    ctx.rotate(0.15 + flap);
    for (let i = 2; i >= 0; i--) {
      ctx.fillStyle = i === 0 ? accent : (i === 1 ? darken(body, 30) : darken(body, 55));
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(-8 - i * 2, 22 + i * 7, 15, 34 - i * 4, 0.35, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // Head: round, sits y~-92, crest + bandana + face
    const hy = -92;
    ctx.fillStyle = accent;                 // crest feathers above the bandana
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    for (const pair of [[-8, -0.5], [0, 0], [8, 0.5]]) {
      ctx.save();
      ctx.translate(pair[0], hy - 32);
      ctx.rotate(pair[1]);
      ctx.beginPath();
      ctx.ellipse(0, -8, 4.5, 12, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = body;                   // head ball
    ctx.beginPath();
    ctx.arc(0, hy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexToRgba(darken(body, 60), 0.35);
    ctx.beginPath();
    ctx.arc(-10, hy + 4, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, hy, 30, 0, Math.PI * 2);
    ctx.stroke();

    // bandana wrap (accent) with knot tails
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, hy, 30, Math.PI * 1.08, Math.PI * 1.92);
    ctx.lineTo(24, hy - 17);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = accent;                 // knot
    ctx.beginPath();
    ctx.ellipse(27, hy - 16, 6, 4.5, 0.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(34, hy - 11, 7, 3.5, 1.0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';   // polka dots
    for (const d of [[-14, -22], [0, -26], [13, -22]]) {
      ctx.beginPath();
      ctx.arc(d[0], hy + d[1], 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // white face patch (macaw cheek)
    ctx.fillStyle = '#f6efe2';
    ctx.beginPath();
    ctx.ellipse(11, hy + 4, 14, 16, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(16,24,34,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Big macaw beak: hooked upper + small lower mandible
    ctx.fillStyle = '#5a6570';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();                        // upper - deep hook
    ctx.moveTo(14, hy - 8);
    ctx.bezierCurveTo(38, hy - 12, 42, hy + 8, 30, hy + 22);
    ctx.bezierCurveTo(27, hy + 12, 22, hy + 6, 14, hy + 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#39424b';
    ctx.beginPath();                        // lower
    ctx.moveTo(16, hy + 8);
    ctx.quadraticCurveTo(28, hy + 14, 26, hy + 21);
    ctx.quadraticCurveTo(18, hy + 18, 15, hy + 12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';   // beak highlight
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, hy - 6);
    ctx.quadraticCurveTo(32, hy - 6, 34, hy + 4);
    ctx.stroke();

    // Right eye: bright, with highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(10, hy - 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(11.5, hy - 1, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(13, hy - 2.5, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // EYE PATCH (mandatory - the brand) + thick strap
    ctx.strokeStyle = '#101820';
    ctx.lineWidth = 4;
    ctx.beginPath();                        // strap across the head
    ctx.moveTo(-29, hy - 10);
    ctx.quadraticCurveTo(-8, hy - 16, 4, hy - 20);
    ctx.stroke();
    ctx.fillStyle = '#101820';
    ctx.beginPath();                        // the patch itself, left eye
    ctx.ellipse(-11, hy - 4, 9.5, 8.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';   // glint so the patch reads small
    ctx.beginPath();
    ctx.arc(-14, hy - 7, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Feather puffs on a hard flap
    if (Math.abs(liquid.vel) > 1.6) {
      spawnSplash(x, y - 30, 2, hexToRgba(accent, 0.85));
    }
  }

  // ── Landing ring ───────────────────────────────────────────────────────────
  function drawLandingGlow(bottle, groundY) {
    const cx = bottle.position.x;
    const glow = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, 55);
    glow.addColorStop(0, 'rgba(90, 255, 110, 0.50)');
    glow.addColorStop(1, 'rgba(90, 255, 110, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, groundY, 55, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Flick indicator ─────────────────────────────────────────────────────────
  // Points FROM the bottle in the direction you're flicking (the way it'll go),
  // length grows with flick strength. Reads as "throw this way", not "pull back".
  function drawFlickIndicator(drag, bottle) {
    if (!drag || !bottle) return;
    const dx  = drag.curX - drag.startX;   // flick direction = throw direction
    const dy  = drag.curY - drag.startY;
    const len = Math.hypot(dx, dy);
    if (len < 18) return;

    const strength = Math.min(len / 220, 1);
    const ux = dx / len, uy = dy / len;
    const reach = 28 + strength * 64;                 // 28..92px
    const ox = bottle.position.x, oy = bottle.position.y - 40;
    const ex = ox + ux * reach, ey = oy + uy * reach;
    const color = `hsl(${190 - strength * 150}, 95%, 62%)`; // cyan → hot orange

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    const a = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 14 * Math.cos(a - 0.45), ey - 14 * Math.sin(a - 0.45));
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 14 * Math.cos(a + 0.45), ey - 14 * Math.sin(a + 0.45));
    ctx.stroke();
    ctx.restore();
  }

  // ── Side walls ───────────────────────────────────────────────────────────────
  function drawWalls(groundY) {
    const WALL = 14; // matches physics WALL_INSET
    for (const x0 of [0, W - WALL]) {
      const g = ctx.createLinearGradient(x0, 0, x0 + WALL, 0);
      const flip = x0 === 0;
      g.addColorStop(0, flip ? 'rgba(42,28,18,0.95)' : 'rgba(90,60,36,0.75)');
      g.addColorStop(1, flip ? 'rgba(90,60,36,0.75)' : 'rgba(42,28,18,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, WALL, groundY);
    }
    // inner edge highlights
    ctx.fillStyle = 'rgba(197,154,74,0.28)';
    ctx.fillRect(WALL - 2, 0, 2, groundY);
    ctx.fillRect(W - WALL, 0, 2, groundY);
  }

  // ── Result text ────────────────────────────────────────────────────────────
  function drawResult(text, color, alpha) {
    // Pop: scale overshoots to ~1.18 as it appears, settles back to 1.0.
    const pop = reduceMotion ? 1 : 1 + 0.18 * Math.sin(Math.min(alpha, 1) * Math.PI);
    ctx.save();
    ctx.globalAlpha   = alpha;
    ctx.fillStyle     = color;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.shadowColor   = color;
    ctx.shadowBlur    = 36;
    ctx.translate(W / 2, H / 2 - 60);
    ctx.scale(pop, pop);
    ctx.font          = 'bold 76px Georgia, "Times New Roman", serif';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // ── Main frame ─────────────────────────────────────────────────────────────
  function frame(dt, state) {
    const { bottle, liquid, drag, groundY, result, resultAlpha, showGlow, isOnFire, liquidColor, accentColor } = state;
    updateParticles(dt);

    let sx = 0, sy = 0;
    if (shakeAmp > 0.2) {
      sx = (Math.random() - 0.5) * 2 * shakeAmp;
      sy = (Math.random() - 0.5) * 2 * shakeAmp;
      shakeAmp = Math.max(0, shakeAmp - shakeDecay * dt);
    }
    ctx.save();
    ctx.translate(sx, sy);

    drawBackground(groundY, isOnFire);
    drawWalls(groundY);
    drawFlickIndicator(drag, bottle);
    if (showGlow) drawLandingGlow(bottle, groundY);
    drawBottle(bottle, liquid, isOnFire, liquidColor, accentColor);
    drawParticles();

    if (result) {
      const color = result === 'MAKE' ? '#7dcea0' : '#c23b22';
      drawResult(result === 'MAKE' ? 'MAKE!' : 'MISS', color, resultAlpha);
    }
    ctx.restore();
  }

  return { init, resize, frame, kick, setReduceMotion };
})();
