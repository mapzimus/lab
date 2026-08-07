// renderer.js — canvas draw loop

const Renderer = (() => {
  let canvas, ctx, W, H;
  const particles = [];
  let reduceMotion = false;   // when on, suppress non-essential motion (particles, shake, pulses)
  // Visual size of every flippable edition (bottle + skins). Physics body stays
  // the same — this is paint-only (projectBottleCenter compensates so the base
  // still sits on the table). v87: 1.38 → 1.62 so everything reads bigger.
  const BOTTLE_DRAW_SCALE = 1.62;
  const FLIGHT_LIFT = 0.18;
  // Easter-egg cosmetics for the current frame (set in frame() from state).
  let fxGolden = false, fxGhost = false, fxParty = false;
  // Smooth camera for mobile open-arena: zoom out when the object leaves frame.
  let camZoom = 1, camX = 0, camY = 0;

  function setReduceMotion(v) { reduceMotion = !!v; }

  function init(cvs) {
    canvas = cvs;
    ctx    = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;
    camZoom = 1; camX = W / 2; camY = H / 2;
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
  function drawBackground(groundY, isOnFire, opts) {
    const skyOnly = opts && opts.skyOnly;
    const tableOnly = opts && opts.tableOnly;
    if (!tableOnly) {
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
    }
    if (skyOnly) return;

    // Extra-wide table so open-arena zoom-outs still show a floor.
    const x0 = -W * 2, tw = W * 5;
    ctx.fillStyle = '#3e2723';
    ctx.fillRect(x0, groundY, tw, Math.max(H, 800));

    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let x = x0; x < x0 + tw; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x + 20, groundY + 200);
      ctx.stroke();
    }

    ctx.fillStyle = '#5d4037';
    ctx.fillRect(x0, groundY - 3, tw, 4);

    // Party mode (secret player name): the table edge becomes a slow-cycling
    // rainbow strip. Pure cosmetics — nothing about the flip changes.
    if (fxParty) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      const base = (clock * 40) % 360;
      for (let i = 0; i <= 6; i++) {
        g.addColorStop(i / 6, `hsl(${(base + i * 60) % 360}, 90%, 60%)`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(x0, groundY - 5, tw, 6);
    }
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

    // Golden flip: warm aura + drifting sparkles (art already bakes in gold via
    // the overridden liquidColor).
    if (fxGolden) {
      const aura = ctx.createRadialGradient(x, y, 8, x, y, 90 * BOTTLE_DRAW_SCALE);
      aura.addColorStop(0, 'rgba(255,215,90,0.28)');
      aura.addColorStop(1, 'rgba(255,215,90,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(x, y, 90 * BOTTLE_DRAW_SCALE, 0, Math.PI * 2);
      ctx.fill();
      if (!reduceMotion && Math.random() < 0.35) {
        spawnSplash(x + (Math.random() - 0.5) * 90, y - Math.random() * 110, 1, 'rgba(255,220,110,0.9)');
      }
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(BOTTLE_DRAW_SCALE, BOTTLE_DRAW_SCALE);
    // Ghost name egg: the object flips see-through. Cosmetic only.
    if (fxGhost) ctx.globalAlpha = 0.55;

    // Skin dispatch: a non-bottle edition paints the object in the same local
    // frame (origin = CG, ground plane ≈ +39) and we're done. See js/skins.js.
    if (skin && skin !== 'bottle' && window.Skins && window.Skins.hasDraw(skin)) {
      // Pass angle so vessel skins can keep liquid world-level and pour when open.
      // Hourglass also gets sandBottom/sandFlow from the physics sand sim.
      window.Skins.draw(ctx, skin, {
        color: liquidColor,
        slosh: liquid.slosh,
        angle,
        pour: !!(window.Skins.liquidFor && (window.Skins.liquidFor(skin) || {}).mode === 'open'),
        sandBottom: liquid.sandBottom,
        sandFlow: liquid.sandFlow,
      });
      ctx.restore();
      // Open-top pour splash when really inverted + sloshing hard
      const liq = window.Skins.liquidFor && window.Skins.liquidFor(skin);
      if (!reduceMotion && liq && liq.mode === 'open' && Math.abs(angle) > 1.6 && Math.abs(liquid.vel) > 0.8) {
        spawnSplash(x, y - 40 * BOTTLE_DRAW_SCALE, 3, hexToRgba(liquidColor || '#0b86ff', 0.85));
      }
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

  // ── Flick indicator — "power gauge", not a thin arrow ───────────────────────
  // A charging ring around the object reads "how hard" at a glance from across
  // a room (a filling ring is a universal charge/cooldown language); bold
  // thrust chevrons stacked in the throw direction read "which way" and
  // reinforce "how hard" via count + brightness, like a throttle gauge. The
  // raw gesture path is traced faintly underneath. Strength math is unchanged —
  // this only repaints the same `drag` state, so the flick itself is untouched.
  // Input drag coords are screen/CSS pixels; world drawing sits under the
  // camera. Convert so the trail stays under the finger when zoomed out.
  function screenToWorld(sx, sy) {
    const z = camZoom || 1;
    return {
      x: camX + (sx - W / 2) / z,
      y: camY + (sy - H / 2) / z,
    };
  }

  function drawFlickIndicator(drag, bottle, groundY) {
    if (!drag || !bottle) return;
    const dx  = drag.curX - drag.startX;   // flick direction = throw direction
    const dy  = drag.curY - drag.startY;
    const len = Math.hypot(dx, dy);
    if (len < 18) return;

    const strength = Math.min(len / 220, 1);
    const ux = dx / len, uy = dy / len;
    const p = projectBottleCenter(bottle, groundY);
    const ox = p.x, oy = p.y - 40 * BOTTLE_DRAW_SCALE;
    const hue = 190 - strength * 150;                  // cyan → hot orange/red
    const color = `hsl(${hue}, 95%, 60%)`;
    const trailA = screenToWorld(drag.startX, drag.startY);
    const trailB = screenToWorld(drag.curX, drag.curY);

    ctx.save();

    // Faint raw gesture trail (the actual swipe path).
    ctx.strokeStyle = `hsla(${hue}, 95%, 72%, 0.35)`;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(trailA.x, trailA.y);
    ctx.lineTo(trailB.x, trailB.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Charging ring — the primary "how hard" readout, fills clockwise from
    // straight up as strength climbs 0→1 (full power = full circle).
    const ringR = 52;
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
      ctx.moveTo(cx + Math.cos(a) * size,              cy + Math.sin(a) * size);
      ctx.lineTo(cx + Math.cos(a + 2.35) * size * 0.7, cy + Math.sin(a + 2.35) * size * 0.7);
      ctx.lineTo(cx + Math.cos(a - 2.35) * size * 0.7, cy + Math.sin(a - 2.35) * size * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ── Side walls ───────────────────────────────────────────────────────────────
  function drawWalls(groundY, sideWalls) {
    if (sideWalls === false) return; // mobile open arena — no painted walls
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
  // `sub` is an optional second line under the verdict — the rare "Great Save"
  // callout, big enough for the whole room, not just a corner banner.
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
      ctx.font        = 'bold 30px system-ui, sans-serif';
      ctx.fillStyle   = '#ffd21a';
      ctx.shadowColor = '#ffd21a';
      ctx.shadowBlur  = 22;
      ctx.fillText(sub, 0, 60);
    }
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
  // ── Bounce-mode arena (see physics.js profiles) ────────────────────────────
  // Only drawn when the active edition asks for it: the landing pad on the
  // table, the wedge overhead that splits a straight-up shot, and the saucers
  // drifting in between.
  function drawTargetPad(target, groundY) {
    if (!target) return;
    const { x, halfWidth: hw } = target;
    const hitHW = target.hitHalfWidth != null ? target.hitHalfWidth : hw;
    const pulse = 0.5 + 0.5 * Math.sin(clock * 3);
    ctx.save();
    const glow = ctx.createRadialGradient(x, groundY, 4, x, groundY, hw * 1.15);
    glow.addColorStop(0, `rgba(105,240,174,${0.22 + pulse * 0.12})`);
    glow.addColorStop(1, 'rgba(105,240,174,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(x, groundY, hw * 1.15, hw * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    // Outer ring = visual pad (soft), inner ring = actual MAKE radius
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(105,240,174,${0.35 + pulse * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(x, groundY, hw, hw * 0.29, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(105,240,174,${0.85 + pulse * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(x, groundY, hitHW, hitHW * 0.29, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, groundY, hitHW * 0.35, hitHW * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawDeflectorPoly(d) {
    if (!d || !d.vertices || !d.vertices.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d.vertices[0].x, d.vertices[0].y);
    for (let i = 1; i < d.vertices.length; i++) ctx.lineTo(d.vertices[i].x, d.vertices[i].y);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, d.vertices[0].y, 0, d.vertices[0].y + 90);
    g.addColorStop(0, '#8fa7bd');
    g.addColorStop(1, '#4a5f75');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#26384a';
    ctx.stroke();
    ctx.restore();
  }

  function drawObstacles(obstacles) {
    if (!obstacles) return;
    const list = obstacles.deflectors && obstacles.deflectors.length
      ? obstacles.deflectors
      : (obstacles.deflector ? [obstacles.deflector] : []);
    for (const d of list) drawDeflectorPoly(d);

    for (const s of obstacles.saucers || []) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle * 0.35);
      ctx.beginPath();
      ctx.ellipse(0, -s.ry * 0.55, s.rx * 0.46, s.ry * 0.85, 0, Math.PI, 0);
      ctx.fillStyle = '#bfe7ff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#5d7f97';
      ctx.stroke();
      const g = ctx.createLinearGradient(0, -s.ry, 0, s.ry);
      g.addColorStop(0, '#e7edf2');
      g.addColorStop(1, '#8c99a5');
      ctx.beginPath();
      ctx.ellipse(0, 0, s.rx, s.ry * 0.62, 0, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#43586b';
      ctx.stroke();
      const blink = 0.45 + 0.55 * Math.sin(clock * 5 + s.x * 0.05);
      ctx.fillStyle = `rgba(255,210,63,${blink})`;
      for (const lx of [-s.rx * 0.62, 0, s.rx * 0.62]) {
        ctx.beginPath();
        ctx.arc(lx, s.ry * 0.22, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function applyCamera(view) {
    const targetZoom = view && view.zoom != null ? view.zoom : 1;
    const tx = view && view.camX != null ? view.camX : W / 2;
    const ty = view && view.camY != null ? view.camY : H / 2;
    // Ease toward the needed framing so zoom-outs aren't jumpy.
    const k = reduceMotion ? 1 : 0.14;
    camZoom += (targetZoom - camZoom) * k;
    camX += (tx - camX) * k;
    camY += (ty - camY) * k;
    ctx.translate(W / 2, H / 2);
    ctx.scale(camZoom, camZoom);
    ctx.translate(-camX, -camY);
    return true;
  }

  function frame(dt, state) {
    const { bottle, liquid, drag, groundY, result, resultAlpha, specialLabel, showGlow, isOnFire,
            liquidColor, intense, suddenDeath, awaitingFlick, stake, skin,
            target, obstacles, view } = state;
    fxGolden = !!state.golden;
    fxGhost  = !!state.ghostly;
    fxParty  = !!state.party;
    clock += dt;
    updateParticles(dt);

    // Reset any camera transform from the previous frame (DPR setTransform
    // lives on the canvas from main.resize — we only add a logical camera).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Re-apply DPR from the canvas backing store ratio.
    const dpr = canvas.width / Math.max(1, W);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, W, H);
    drawBackground(groundY, isOnFire, { skyOnly: true });

    ctx.save();
    applyCamera(view);
    drawBackground(groundY, isOnFire, { tableOnly: true });
    drawWalls(groundY, view ? view.sideWalls : true);
    drawTargetPad(target, groundY);
    drawObstacles(obstacles);
    drawFlickIndicator(drag, bottle, groundY);
    if (showGlow) drawLandingGlow(bottle, groundY);
    drawBottle(bottle, liquid, isOnFire, liquidColor, groundY, skin);
    drawParticles();
    ctx.restore();

    // HUD overlays stay screen-fixed (not affected by world zoom).
    drawStake(stake);
    drawIntense(intense, suddenDeath, awaitingFlick);

    if (result) {
      const color = result === 'MAKE' ? '#69f0ae' : '#ff5252';
      drawResult(result === 'MAKE' ? 'MAKE!' : 'MISS', color, resultAlpha, specialLabel);
    }
  }

  // Paint one upright object into some OTHER canvas (the setup-screen skin
  // previews). Borrows the module ctx for the call and puts it back, so this
  // must stay synchronous — it runs from setup, never from inside frame().
  // groundY is pushed far below so projectPoint's airborne lift clamps to 0
  // and the object is drawn flat-on rather than in flight perspective.
  function drawPreview(target, skin, liquidColor) {
    const prevCanvas = canvas, prevCtx = ctx, prevW = W, prevH = H;
    fxGolden = fxGhost = false;   // never leak in-game egg cosmetics into previews
    canvas = target;
    ctx = target.getContext('2d');
    W = target.width;
    H = target.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Fit box measured off the real drawn pixels of EVERY family (ink bounding
    // box per family, then the union). Widest is the T-Rex at x≈±148; the art
    // spans y≈-346 (pineapple's crown) to y≈+66 (the parrot's tail), so it
    // centers on y≈-140, not 0. Already includes the BOTTLE_DRAW_SCALE that
    // drawBottle applies. Re-measure if any family's art grows.
    //
    // The old 216x284 @ -81 box was ~27% too narrow, ~31% too short AND sat 59
    // units too low, so nearly every family was clipped — most at the top, and
    // trex/vending/ocean/pets/parrot at the sides too.
    // Scales with BOTTLE_DRAW_SCALE (box was measured at 1.38; ratio-adjusted).
    const CONTENT_W = 352, CONTENT_H = 493, CONTENT_MID_Y = -164;
    const scale = Math.min(W / CONTENT_W, H / CONTENT_H) * 0.95;
    ctx.translate(W / 2, H / 2 - CONTENT_MID_Y * scale);
    ctx.scale(scale, scale);
    try {
      drawBottle({ position: { x: 0, y: 0 }, angle: 0 }, { slosh: 0, vel: 0 },
        false, liquidColor, -10000, skin);
    } finally {
      canvas = prevCanvas; ctx = prevCtx; W = prevW; H = prevH;
    }
  }

  // drawBottle is exported for the art-iteration harness (drawing one object
  // without the full scene); the game itself only calls frame().
  return { init, resize, frame, setReduceMotion, projectPoint, projectBottleCenter, bottleDrawScale, drawBottle, drawPreview };
})();
