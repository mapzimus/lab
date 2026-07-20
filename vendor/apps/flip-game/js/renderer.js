// renderer.js — canvas draw loop

const Renderer = (() => {
  let canvas, ctx, W, H;
  const particles = [];
  let reduceMotion = false;   // when on, suppress non-essential motion (particles, shake, pulses)
  const BOTTLE_DRAW_SCALE = 1.15;
  const FLIGHT_LIFT = 0.18;

  function setReduceMotion(v) { reduceMotion = !!v; }

  function init(cvs) {
    canvas = cvs;
    ctx    = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;
  }

  function resize(w, h) { W = w; H = h; }

  function projectPoint(x, y, groundY) {
    const airborne = Math.max(0, groundY - y - 55);
    return { x, y: y - airborne * FLIGHT_LIFT };
  }

  function projectBottleCenter(bottle, groundY) {
    const p = projectPoint(bottle.position.x, bottle.position.y, groundY);
    return {
      x: p.x,
      y: p.y - (BOTTLE_DRAW_SCALE - 1) * 43,
    };
  }

  function bottleDrawScale() { return BOTTLE_DRAW_SCALE; }

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
  function drawBottle(bottle, liquid, isOnFire, liquidColor, groundY, skin) {
    const { x, y } = projectBottleCenter(bottle, groundY);
    const angle  = bottle.angle;
    const fillCol = hexToRgba(liquidColor || '#0b86ff', 0.92);
    const meniscusCol = lighten(liquidColor || '#0b86ff', 110, 0.9);

    // ON FIRE glow
    if (isOnFire) {
      const glow = ctx.createRadialGradient(x, y, 10, x, y, 95 * BOTTLE_DRAW_SCALE);
      glow.addColorStop(0, 'rgba(255,100,0,0.30)');
      glow.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 95 * BOTTLE_DRAW_SCALE, 0, Math.PI * 2);
      ctx.fill();
      if (!reduceMotion) spawnFire(x, y - 100 * BOTTLE_DRAW_SCALE);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(BOTTLE_DRAW_SCALE, BOTTLE_DRAW_SCALE);

    // Skin dispatch: a non-bottle edition paints the object in the same local
    // frame (origin = CG, ground plane ≈ +39) and we're done. See js/skins.js.
    if (skin && skin !== 'bottle' && window.Skins && window.Skins.hasDraw(skin)) {
      window.Skins.draw(ctx, skin, { color: liquidColor, slosh: liquid.slosh });
      ctx.restore();
      return;
    }

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
    if (!reduceMotion && Math.abs(liquid.vel) > 1.6) {
      spawnSplash(x, y - 30 * BOTTLE_DRAW_SCALE, 2, 'rgba(0, 170, 255, 0.85)');
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
  function drawFlickIndicator(drag, bottle, groundY) {
    if (!drag || !bottle) return;
    const dx  = drag.curX - drag.startX;   // flick direction = throw direction
    const dy  = drag.curY - drag.startY;
    const len = Math.hypot(dx, dy);
    if (len < 18) return;

    const strength = Math.min(len / 220, 1);
    const ux = dx / len, uy = dy / len;
    const reach = 28 + strength * 64;                 // 28..92px
    const p = projectBottleCenter(bottle, groundY);
    const ox = p.x, oy = p.y - 40 * BOTTLE_DRAW_SCALE;
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
  function drawResult(text, color, alpha) {
    ctx.save();
    ctx.globalAlpha   = alpha;
    ctx.fillStyle     = color;
    ctx.font          = 'bold 76px system-ui, sans-serif';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.shadowColor   = color;
    ctx.shadowBlur    = 36;
    ctx.fillText(text, W / 2, H / 2 - 60);
    ctx.restore();
  }

  // ── "Make it or break it" intense overlay + sudden-death tag ─────────────────
  let clock = 0;
  function drawIntense(intense, suddenDeath, awaitingFlick) {
    if (suddenDeath) {
      const fs = Math.round(Math.min(W, H) * 0.032);
      ctx.save();
      ctx.globalAlpha = reduceMotion ? 0.85 : 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(clock * 5));
      ctx.fillStyle = '#ff3b3b';
      ctx.font = `bold ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 16;
      ctx.fillText('⚡ SUDDEN DEATH ⚡', W / 2, 10);
      ctx.restore();
    }
    if (!intense) return;
    const pulse = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(clock * 6);
    // Pulsing red vignette — darkens the edges, "time stands still" mood.
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.18, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(110,0,0,0)');
    g.addColorStop(1, `rgba(${90 + Math.round(70 * pulse)},0,0,${0.42 + 0.22 * pulse})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (awaitingFlick) {
      const fs = Math.min(H * 0.115, W * 0.14);
      ctx.save();
      ctx.globalAlpha = 0.82 + 0.18 * pulse;
      ctx.fillStyle = '#ff2e2e';
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 34;
      ctx.fillText('MAKE IT', W / 2, H * 0.26);
      ctx.fillText('OR BREAK IT', W / 2, H * 0.26 + fs * 1.05);
      ctx.restore();
    }
  }

  // ── Stake display — lives at risk, grows bigger + scarier as it climbs ───────
  function drawStake(stake) {
    if (!stake || stake < 1) return;
    const s = Math.min(stake, 12);
    const danger = Math.min(1, (stake - 1) / 7);          // 0 at 1 → 1 at 8+
    const fs = Math.min(W, H) * (0.075 + s * 0.017);      // grows with stake
    const pulse = reduceMotion ? 1 : 1 + (0.04 + danger * 0.06) * Math.sin(clock * (5 + danger * 7));
    const g = Math.round(190 * (1 - danger));             // amber → red
    const col = `rgb(255,${g},40)`;
    const shake = (!reduceMotion && danger > 0.45) ? (danger - 0.45) * 14 : 0;
    const ox = shake ? Math.sin(clock * 41) * shake : 0;
    const oy = shake ? Math.cos(clock * 37) * shake : 0;

    ctx.save();
    ctx.translate(W / 2 + ox, H * 0.165 + oy);
    ctx.scale(pulse, pulse);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 14 + danger * 46;
    ctx.font = `900 ${fs}px system-ui, sans-serif`;
    ctx.fillText(String(stake), 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,${g + 30},80,0.92)`;
    ctx.font = `800 ${fs * 0.19}px system-ui, sans-serif`;
    ctx.fillText(stake === 1 ? 'LIFE ON THE LINE' : 'LIVES ON THE LINE', 0, fs * 0.62);
    ctx.restore();
  }

  // ── Main frame ─────────────────────────────────────────────────────────────
  function frame(dt, state) {
    const { bottle, liquid, drag, groundY, result, resultAlpha, showGlow, isOnFire,
            liquidColor, intense, suddenDeath, awaitingFlick, stake, skin } = state;
    clock += dt;
    updateParticles(dt);

    drawBackground(groundY, isOnFire);
    drawWalls(groundY);
    drawFlickIndicator(drag, bottle, groundY);
    if (showGlow) drawLandingGlow(bottle, groundY);
    drawBottle(bottle, liquid, isOnFire, liquidColor, groundY, skin);
    drawParticles();
    drawStake(stake);
    drawIntense(intense, suddenDeath, awaitingFlick);

    if (result) {
      const color = result === 'MAKE' ? '#69f0ae' : '#ff5252';
      drawResult(result === 'MAKE' ? 'MAKE!' : 'MISS', color, resultAlpha);
    }
  }

  return { init, resize, frame, setReduceMotion, projectPoint, projectBottleCenter, bottleDrawScale };
})();
