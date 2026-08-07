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
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (isOnFire) {
      sky.addColorStop(0, '#140400');
      sky.addColorStop(1, '#2e0800');
    } else {
      sky.addColorStop(0, '#0a1628');
      sky.addColorStop(1, '#112240');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Table surface
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(0, groundY, W, H - groundY);

    // Subtle wood grain lines
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x + 20, H);
      ctx.stroke();
    }

    // Table edge highlight
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(0, groundY - 3, W, 4);
  }

  // ── Bottle ─────────────────────────────────────────────────────────────────
  // Wide squat Gatorade bottle: 74px body, short neck, wide orange cap, blue fill.
  // Local coords centered at bottle.position (physics CG, ~40px above visual base).
  function drawBottle(bottle, liquid, isOnFire, liquidColor) {
    const { x, y } = bottle.position;
    const angle  = bottle.angle;
    const fillCol = hexToRgba(liquidColor || '#0b86ff', 0.92);
    const meniscusCol = lighten(liquidColor || '#0b86ff', 110, 0.9);

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

    // Reusable body outline (wide, flat-bottomed Gatorade shape, y=-72..+43)
    const traceBody = () => { ctx.beginPath(); ctx.roundRect(-37, -72, 74, 115, 10); };

    // Clear-plastic glass tint — translucent so the blue liquid shows through
    const glass = ctx.createLinearGradient(-37, 0, 37, 0);
    glass.addColorStop(0,    'rgba(198, 224, 245, 0.30)');
    glass.addColorStop(0.20, 'rgba(244, 251, 255, 0.46)');
    glass.addColorStop(0.55, 'rgba(208, 234, 250, 0.32)');
    glass.addColorStop(1,    'rgba(186, 218, 240, 0.26)');

    // ── Shoulder + neck (drawn first, body covers the junction) ────────────
    ctx.fillStyle   = glass;
    ctx.strokeStyle = 'rgba(90, 150, 205, 0.55)';
    ctx.lineWidth   = 1.6;
    ctx.beginPath();
    ctx.moveTo(-37, -68);
    ctx.lineTo(-22, -86);
    ctx.lineTo( 22, -86);
    ctx.lineTo( 37, -68);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-22, -122, 44, 40, 7);
    ctx.fill();
    ctx.stroke();

    // ── Body: clear glass fill ─────────────────────────────────────────────
    traceBody();
    ctx.fillStyle = glass;
    ctx.fill();

    // ── Vivid blue liquid — surface stays LEVEL in world space ─────────────
    // Clip to the (tilted) bottle interior, then UNDO the bottle's rotation so
    // we fill in world-aligned axes. A world-horizontal fill ∩ the tilted bottle
    // = liquid that finds its own level no matter how the bottle spins. The body
    // interior is y=-72..+43 rel. to the CG; max corner distance ~81px, so the
    // -120..120 / down-to-240 fill amply covers it once clipped.
    ctx.save();
    traceBody();
    ctx.clip();
    ctx.rotate(-angle);                                    // → world-aligned axes
    const surfaceY = 15;                                   // ~30% full when upright
    const tilt  = Math.max(-0.28, Math.min(0.28, liquid.slosh)); // slosh wobble (rad)
    const slope = Math.tan(tilt);
    const yL = surfaceY - 120 * slope, yR = surfaceY + 120 * slope;
    ctx.fillStyle = fillCol;
    ctx.beginPath();
    ctx.moveTo(-120, yL);
    ctx.lineTo( 120, yR);
    ctx.lineTo( 120, 240);
    ctx.lineTo(-120, 240);
    ctx.closePath();
    ctx.fill();
    // bright meniscus line along the surface
    ctx.strokeStyle = meniscusCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-120, yL);
    ctx.lineTo( 120, yR);
    ctx.stroke();
    ctx.restore();

    // ── Specular highlights (clipped to body) ──────────────────────────────
    ctx.save();
    traceBody();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(-30, -72, 6, 115);   // left bright strip
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(23, -72, 4, 115);    // right faint reflection
    ctx.restore();

    // ── Crisp body outline ─────────────────────────────────────────────────
    traceBody();
    ctx.strokeStyle = 'rgba(85, 145, 200, 0.80)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // ── Label band (upper body, above the waterline) ──────────────────────
    ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    ctx.beginPath();
    ctx.roundRect(-35, -58, 70, 28, 4);
    ctx.fill();
    ctx.fillStyle = '#ff6d00';        // brand stripe
    ctx.fillRect(-35, -47, 70, 5);

    // ── Wide orange Gatorade cap ───────────────────────────────────────────
    ctx.fillStyle = '#ff6d00';
    ctx.beginPath();
    ctx.roundRect(-24, -146, 48, 26, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.roundRect(-21, -144, 12, 7, 2);
    ctx.fill();

    ctx.restore();

    // Blue splash on hard slosh
    if (Math.abs(liquid.vel) > 1.6) {
      spawnSplash(x, y - 30, 2, 'rgba(0, 170, 255, 0.85)');
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

  // ── Flick indicator — "power gauge", not an arrow ───────────────────────────
  // A charging ring around the bottle reads "how hard" at a glance from
  // across a room (a filling ring is a universal charge/cooldown language);
  // bold thrust chevrons stacked in the throw direction read "which way" and
  // reinforce "how hard" via count + brightness, like a throttle gauge. The
  // actual gesture path is still traced faintly underneath for players who
  // liked seeing their swipe. Strength math is unchanged from before — this
  // only repaints the same `drag` state, so the flick itself is untouched.
  function drawFlickIndicator(drag, bottle) {
    if (!drag || !bottle) return;
    const dx  = drag.curX - drag.startX;   // flick direction = throw direction
    const dy  = drag.curY - drag.startY;
    const len = Math.hypot(dx, dy);
    if (len < 18) return;

    const strength = Math.min(len / 220, 1);
    const ux = dx / len, uy = dy / len;
    const ox = bottle.position.x, oy = bottle.position.y - 40;
    const hue = 190 - strength * 150;                  // cyan → hot orange/red
    const color = `hsl(${hue}, 95%, 60%)`;

    ctx.save();

    // Faint raw gesture trail (the actual swipe path).
    ctx.strokeStyle = `hsla(${hue}, 95%, 72%, 0.35)`;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(drag.startX, drag.startY);
    ctx.lineTo(drag.curX, drag.curY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Charging ring — the primary "how hard" readout, fills clockwise from
    // straight up as strength climbs from 0 to 1 (full power = full circle).
    const ringR = 46;
    ctx.lineWidth = 7;
    ctx.lineCap   = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(ox, oy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(ox, oy, ringR, -Math.PI / 2, -Math.PI / 2 + strength * Math.PI * 2);
    ctx.stroke();

    // Thrust chevrons stacked outward in the throw direction — count and
    // brightness climb with power, like a rocket-throttle gauge.
    const a = Math.atan2(uy, ux);
    const chevronCount = 1 + Math.round(strength * 2);   // 1..3
    for (let i = 0; i < chevronCount; i++) {
      const reach = ringR + 16 + i * 22;
      const cx = ox + ux * reach, cy = oy + uy * reach;
      const size = 11 + strength * 5;
      ctx.globalAlpha = 0.5 + 0.5 * (i + 1) / chevronCount;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * size,          cy + Math.sin(a) * size);
      ctx.lineTo(cx + Math.cos(a + 2.35) * size * 0.7, cy + Math.sin(a + 2.35) * size * 0.7);
      ctx.lineTo(cx + Math.cos(a - 2.35) * size * 0.7, cy + Math.sin(a - 2.35) * size * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ── Side walls ───────────────────────────────────────────────────────────────
  function drawWalls(groundY) {
    const WALL = 14; // matches physics WALL_INSET
    for (const x0 of [0, W - WALL]) {
      const g = ctx.createLinearGradient(x0, 0, x0 + WALL, 0);
      const flip = x0 === 0;
      g.addColorStop(0, flip ? 'rgba(28,40,58,0.95)' : 'rgba(58,78,105,0.75)');
      g.addColorStop(1, flip ? 'rgba(58,78,105,0.75)' : 'rgba(28,40,58,0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, WALL, groundY);
    }
    // inner edge highlights
    ctx.fillStyle = 'rgba(150,185,215,0.30)';
    ctx.fillRect(WALL - 2, 0, 2, groundY);
    ctx.fillRect(W - WALL, 0, 2, groundY);
  }

  // ── Result text ────────────────────────────────────────────────────────────
  // `sub` is an optional second line below the verdict — used for the rare
  // "Great Save" callout so the whole room notices, not just a corner toast.
  function drawResult(text, color, alpha, sub) {
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
    ctx.font          = 'bold 76px system-ui, sans-serif';
    ctx.fillText(text, 0, 0);
    if (sub) {
      ctx.font        = 'bold 28px system-ui, sans-serif';
      ctx.fillStyle   = '#ffd21a';
      ctx.shadowColor = '#ffd21a';
      ctx.shadowBlur  = 22;
      ctx.fillText(sub, 0, 58);
    }
    ctx.restore();
  }

  // ── Main frame ─────────────────────────────────────────────────────────────
  function frame(dt, state) {
    const { bottle, liquid, drag, groundY, result, resultAlpha, specialLabel, showGlow, isOnFire, liquidColor } = state;
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
    drawBottle(bottle, liquid, isOnFire, liquidColor);
    drawParticles();

    if (result) {
      const color = result === 'MAKE' ? '#69f0ae' : '#ff5252';
      drawResult(result === 'MAKE' ? 'MAKE!' : 'MISS', color, resultAlpha, specialLabel);
    }
    ctx.restore();
  }

  return { init, resize, frame, kick, setReduceMotion };
})();
