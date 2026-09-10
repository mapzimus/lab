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
  let fxMoon = false, fxNinja = false, fxRainbow = false, fxTrail = false, fxSize = 1;
  let fxRareEvent = null;
  let fxEventState = null;
  let fxCosmeticId = null;
  let fxVisualArenaId = null;
  let fxPlinko = null;   // plinko board geometry while a drop is live
  let trailAccumulator = 0;
  const rainbowTrailPoints = [];
  let motionFlipKey = null, motionElapsed = 0;
  // Smooth camera for mobile open-arena: zoom out when the object leaves frame.
  let camZoom = 1, camX = 0, camY = 0;
  const reactionFocus = typeof FlipReactionRendererV111 !== 'undefined'
    ? FlipReactionRendererV111.createFocusController() : null;
  let shakeAmp = 0;   // brief impact / verdict screen shake (screen space)
  let seasonalAmbience = { spooky: false, snowy: false, hearts: false, newyr: false };
  let nextSeasonCheck = 0;

  function setReduceMotion(v) { reduceMotion = !!v; }

  function cosmeticColor(id, fallback) {
    if (!id) return fallback || '#69f0ae';
    let hash = 0;
    for (const letter of String(id)) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
    return `hsl(${hash % 360} 92% 68%)`;
  }

  function burst(x, y, color, count = 14, cosmeticId = null) {
    if (reduceMotion) return;
    const active = String(cosmeticId || '').startsWith('burst.') ? cosmeticId : null;
    spawnSplash(x, y, active ? Math.round(count * 1.35) : count,
      active ? cosmeticColor(active, color) : (color || '#69f0ae'), active ? String(active).slice(6) : null);
  }

  function nudge(amount = 3) {
    if (reduceMotion) return;
    shakeAmp = Math.max(shakeAmp, amount);
  }

  function init(cvs) {
    canvas = cvs;
    ctx    = canvas.getContext('2d');
    W = canvas.width;
    H = canvas.height;
    camZoom = 1; camX = W / 2; camY = H / 2;
    motionFlipKey = null; motionElapsed = 0;
    if (reactionFocus) reactionFocus.reset();
  }

  function resize(w, h) { W = w; H = h; }

  function projectPoint(x, y, groundY) {
    // Normal flips get a slight visual lift for a more dramatic arc. During
    // Plinko the camera follows the physics body directly, so suppress that
    // projection or the painted object would sit above the camera's center.
    const airborne = fxPlinko ? 0 : Math.max(0, groundY - y - 55);
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
  function spawnSplash(x, y, count, color, style = null) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 180,
        vy: -Math.random() * 160 - 30,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        r: 2.5 + Math.random() * 2.5,
        color,
        style,
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

  function spawnRainbowTrail(x, y) {
    for (let i = 0; i < 3; i++) {
      const hue = Math.round((clock * 300 + i * 115 + Math.random() * 35) % 360);
      particles.push({
        x: x + (Math.random() - 0.5) * 38,
        y: y + (Math.random() - 0.5) * 28,
        vx: (Math.random() - 0.5) * 45,
        vy: 12 + Math.random() * 42,
        life: 0.7 + Math.random() * 0.35,
        maxLife: 1.05,
        r: 6 + Math.random() * 6,
        color: `hsl(${hue} 100% 64%)`,
        trail: true,
      });
    }
  }

  function updateParticles(dt) {
    // Compact in place so expiring bursts do not trigger repeated array shifts.
    let write = 0;
    for (let read = 0; read < particles.length; read++) {
      const p = particles[read];
      p.x   += p.vx * dt;
      p.y   += p.vy * dt;
      p.vy  += 300 * dt;
      p.life -= dt;
      if (p.life > 0) particles[write++] = p;
    }
    particles.length = write;
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle   = p.color;
      if (p.trail) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 18;
      }
      const size = p.r * (0.4 + 0.6 * a);
      if (p.style && /blocks|gears|comic-pop/.test(p.style)) {
        ctx.fillRect(p.x - size, p.y - size, size * 2, size * 2);
      } else if (p.style && /aurora|impact-rings/.test(p.style)) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, size * 1.8, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  function drawRainbowAura(bottle, groundY) {
    if (!fxTrail || !bottle) return;
    const p = projectBottleCenter(bottle, groundY);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 7;
    for (let i = 0; i < 3; i++) {
      const hue = ((reduceMotion ? 0 : clock * 280) + i * 120) % 360;
      ctx.strokeStyle = `hsla(${hue} 100% 65% / 0.72)`;
      ctx.shadowColor = `hsl(${hue} 100% 60%)`;
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 58 + i * 10, 88 + i * 12, bottle.angle, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // A true persistent path behind the object. The earlier implementation was
  // a loose particle cloud, which read as sparkles rather than a tail.
  function rememberRainbowPoint(bottle, groundY) {
    if (!fxTrail || !bottle) {
      rainbowTrailPoints.length = 0;
      return;
    }
    const p = projectBottleCenter(bottle, groundY);
    const prev = rainbowTrailPoints[rainbowTrailPoints.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= 5) {
      rainbowTrailPoints.push({ x: p.x, y: p.y });
      if (rainbowTrailPoints.length > 72) rainbowTrailPoints.shift();
    }
  }

  function drawRainbowTail() {
    const pts = rainbowTrailPoints;
    if (pts.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const bands = ['#ff3d57', '#ffb300', '#fff04a', '#44ef83', '#35bfff', '#a86cff'];
    for (let b = 0; b < bands.length; b++) {
      ctx.strokeStyle = bands[b];
      ctx.shadowColor = bands[b];
      ctx.shadowBlur = reduceMotion ? 5 : 15;
      ctx.lineWidth = 6;
      for (let i = 1; i < pts.length; i++) {
        const fade = i / pts.length;
        ctx.globalAlpha = 0.10 + fade * 0.72;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y + (b - 2.5) * 5);
        ctx.lineTo(pts[i].x, pts[i].y + (b - 2.5) * 5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Each rare event owns a strong arena treatment. These are paint-only and
  // deliberately use the same event id as physics, keeping the spectacle in
  // lockstep with the actual special throw.
  function drawRareEventOverlay(event) {
    if (!event) return;
    const colors = {
      'rainbow-trail': ['rgba(255,40,120,0.14)', 'rgba(40,210,255,0.13)'],
      'rainbow-corkscrew': ['rgba(255,40,120,0.14)', 'rgba(40,210,255,0.13)'],
      'half-full': ['rgba(30,150,255,0.18)', 'rgba(80,220,255,0.04)'],
      'power-launch': ['rgba(255,70,0,0.22)', 'rgba(255,190,30,0.04)'],
      'fizz-jet': ['rgba(100,235,255,0.18)', 'rgba(255,255,255,0.04)'],
      'golden-flip': ['rgba(255,192,25,0.22)', 'rgba(255,245,170,0.04)'],
      'bouncy-bottle': ['rgba(95,255,120,0.16)', 'rgba(255,225,70,0.04)'],
      earthquake: ['rgba(255,115,50,0.19)', 'rgba(80,20,10,0.06)'],
      'moon-gravity': ['rgba(75,70,180,0.24)', 'rgba(120,210,255,0.04)'],
      'ice-slide': ['rgba(80,225,255,0.23)', 'rgba(180,245,255,0.04)'],
      'alien-invasion': ['rgba(80,255,125,0.24)', 'rgba(70,40,170,0.06)'],
      'gravity-slam': ['rgba(230,20,35,0.23)', 'rgba(20,0,0,0.08)'],
      trampoline: ['rgba(70,255,120,0.18)', 'rgba(255,235,40,0.04)'],
      'wind-tunnel': ['rgba(80,220,255,0.18)', 'rgba(255,255,255,0.03)'],
      'double-flip': ['rgba(185,70,255,0.22)', 'rgba(70,30,200,0.04)'],
      'shrink-ray': ['rgba(65,255,205,0.17)', 'rgba(20,90,80,0.04)'],
      'portal-pair': ['rgba(135,75,255,0.21)', 'rgba(35,220,255,0.05)'],
      'tether-swing': ['rgba(255,205,80,0.18)', 'rgba(255,255,255,0.03)'],
      mitosis: ['rgba(80,255,190,0.18)', 'rgba(150,80,255,0.05)'],
      'ceiling-flip': ['rgba(255,90,190,0.17)', 'rgba(255,255,255,0.03)'],
      'meteor-shower': ['rgba(255,85,25,0.23)', 'rgba(40,0,0,0.07)'],
      magnet: ['rgba(40,210,255,0.21)', 'rgba(255,45,80,0.04)'],
      'heart-rush': ['rgba(255,40,105,0.22)', 'rgba(255,160,190,0.04)'],
      'black-hole': ['rgba(95,50,180,0.26)', 'rgba(0,0,0,0.12)'],
      boomerang: ['rgba(255,165,45,0.17)', 'rgba(255,240,100,0.03)'],
      'roulette-table': ['rgba(220,30,75,0.19)', 'rgba(20,170,90,0.04)'],
      rewind: ['rgba(60,160,255,0.19)', 'rgba(150,90,255,0.04)'],
      plinko: ['rgba(255,195,45,0.17)', 'rgba(50,160,255,0.04)'],
      'mirror-match': ['rgba(170,225,255,0.18)', 'rgba(255,255,255,0.06)'],
      'cap-toss': ['rgba(255,125,30,0.18)', 'rgba(255,215,70,0.04)'],
      'life-drain': ['rgba(60,255,75,0.23)', 'rgba(0,70,15,0.08)'],
    };
    const pair = colors[event] || ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)'];
    ctx.save();
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.10,
      W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, pair[1]);
    g.addColorStop(1, pair[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const phase = reduceMotion ? 0 : clock;
    if (event === 'wind-tunnel') {
      ctx.strokeStyle = 'rgba(190,245,255,0.60)';
      ctx.lineWidth = 4;
      for (let i = 0; i < 13; i++) {
        const y = (i + 0.5) * H / 13;
        const x = ((phase * 520 + i * 137) % (W + 260)) - 130;
        ctx.beginPath(); ctx.moveTo(x - 110, y); ctx.lineTo(x + 110, y - 18); ctx.stroke();
      }
    } else if (event === 'gravity-slam') {
      ctx.strokeStyle = 'rgba(255,80,65,0.56)';
      ctx.lineWidth = 5;
      for (let i = 0; i < 12; i++) {
        const x = (i + 0.5) * W / 12;
        const y = ((phase * 700 + i * 83) % (H + 180)) - 90;
        ctx.beginPath(); ctx.moveTo(x, y - 80); ctx.lineTo(x, y + 80); ctx.stroke();
      }
    } else if (event === 'moon-gravity' || event === 'alien-invasion') {
      ctx.fillStyle = 'rgba(220,240,255,0.72)';
      for (let i = 0; i < 28; i++) {
        const x = (i * 193) % Math.max(W, 1);
        const y = (i * 97) % Math.max(H, 1);
        const r = 1 + (i % 3);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (event === 'rainbow-trail' || event === 'rainbow-corkscrew') {
      ctx.lineWidth = 12;
      ctx.strokeStyle = `hsl(${(phase * 150) % 360} 100% 62% / 0.75)`;
      ctx.strokeRect(6, 6, W - 12, H - 12);
    }
    ctx.restore();
  }

  function drawRareEventWorld(event, bottle, groundY) {
    if (!event || !bottle || fxPlinko) return;
    const p = projectBottleCenter(bottle, groundY);
    const pulse = reduceMotion ? 0.7 : 0.55 + 0.45 * Math.sin(clock * 8);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (event === 'ice-slide') {
      const g = ctx.createLinearGradient(p.x - 520, groundY, p.x + 520, groundY);
      g.addColorStop(0, 'rgba(80,220,255,0)');
      g.addColorStop(0.5, 'rgba(170,245,255,0.72)');
      g.addColorStop(1, 'rgba(80,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 520, groundY - 15, 1040, 30);
      ctx.strokeStyle = 'rgba(225,255,255,0.9)'; ctx.lineWidth = 3;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath(); ctx.moveTo(p.x + i * 82, groundY - 13);
        ctx.lineTo(p.x + i * 82 + 48, groundY + 10); ctx.stroke();
      }
    } else if (event === 'trampoline') {
      ctx.strokeStyle = `rgba(80,255,130,${0.65 + pulse * 0.3})`;
      ctx.lineWidth = 9; ctx.shadowColor = '#55ff88'; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.ellipse(p.x, groundY + 2, 145 + pulse * 25, 28, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const x = p.x - 110 + i * 18.3;
        const y = groundY + 10 + (i % 2 ? 24 : 0);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (event === 'magnet' || event === 'life-drain') {
      const c = event === 'life-drain' ? '#62ff57' : '#4de8ff';
      ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 26;
      for (let i = 1; i <= 4; i++) {
        ctx.globalAlpha = 0.82 / i;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 55 + i * 32 + pulse * 8, 75 + i * 42, 0, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (event === 'heart-rush') {
      ctx.fillStyle = `rgba(255,65,125,${0.55 + pulse * 0.35})`;
      ctx.font = `900 ${54 + pulse * 22}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      for (const [dx, dy] of [[-95,-25],[100,-70],[-55,90],[75,70]]) ctx.fillText('♥', p.x + dx, p.y + dy);
    } else if (event === 'power-launch' || event === 'double-flip') {
      const c = event === 'power-launch' ? '#ff8a20' : '#cf67ff';
      ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 25; ctx.lineWidth = 9;
      const tail = Math.min(260, 90 + Math.abs(bottle.velocity.y || 0) * 7);
      for (let i = -2; i <= 2; i++) {
        ctx.globalAlpha = 0.72 - Math.abs(i) * 0.11;
        ctx.beginPath(); ctx.moveTo(p.x + i * 18, p.y + 55); ctx.lineTo(p.x + i * 28, p.y + tail); ctx.stroke();
      }
      if (event === 'double-flip') {
        ctx.globalAlpha = 0.65;
        ctx.font = '900 88px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = c; ctx.fillText('×2', p.x, p.y - 115);
      }
    }
    ctx.restore();
  }

  function spawnCosmeticTrail(x, y, id) {
    const color = cosmeticColor(id, '#72d8ff');
    const style = String(id).slice(6);
    particles.push({ x, y, vx: (Math.random() - .5) * 24, vy: 20 + Math.random() * 30,
      life: .65, maxLife: .65, r: 4 + Math.random() * 4, color, trail: true, style });
  }

  function drawPersonalFinish(bottle, groundY) {
    if (!String(fxCosmeticId || '').startsWith('finish.') || !bottle) return;
    const p = projectBottleCenter(bottle, groundY);
    const color = cosmeticColor(fxCosmeticId, '#fff');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = /matte|woodgrain/.test(fxCosmeticId) ? 5 : 22;
    ctx.globalAlpha = /matte/.test(fxCosmeticId) ? .28 : .62;
    ctx.lineWidth = /porcelain|frosted/.test(fxCosmeticId) ? 9 : 5;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 62 * fxSize, 96 * fxSize, bottle.angle, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawCosmeticNameplate(name) {
    if (!String(fxCosmeticId || '').startsWith('nameplate.') || !name) return;
    const color = cosmeticColor(fxCosmeticId, '#fff');
    ctx.save();
    ctx.font = '900 18px system-ui, sans-serif';
    const width = Math.min(W - 32, Math.max(170, ctx.measureText(name).width + 54));
    const x = (W - width) / 2, y = 72;
    ctx.fillStyle = 'rgba(7,19,34,.88)'; ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x, y, width, 42, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, W / 2, y + 21);
    ctx.restore();
  }

  function drawSuccessfulShotGhost(ghost) {
    if (!ghost) return;
    const path = Array.isArray(ghost.path)
      ? ghost.path.filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)))
      : [];
    const finalPoint = Number.isFinite(Number(ghost.x)) && Number.isFinite(Number(ghost.y))
      ? { x: Number(ghost.x), y: Number(ghost.y), angle: Number(ghost.angle) || 0 }
      : path[path.length - 1];
    if (!finalPoint) return;
    ctx.save();
    ctx.globalAlpha = reduceMotion ? .24 : .32;
    ctx.strokeStyle = '#d8f7ff';
    ctx.setLineDash([12, 9]);
    if (path.length > 1) {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Number(path[0].x), Number(path[0].y));
      for (let index = 1; index < path.length; index++) ctx.lineTo(Number(path[index].x), Number(path[index].y));
      ctx.stroke();
    }
    ctx.lineWidth = 5;
    ctx.translate(Number(finalPoint.x), Number(finalPoint.y));
    ctx.rotate(Number(finalPoint.angle) || 0);
    ctx.beginPath(); ctx.roundRect(-42, -78, 84, 126, 18); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawVisualArena(layer, groundY) {
    if (!String(fxVisualArenaId || '').startsWith('arena.')) return;
    const id = String(fxVisualArenaId);
    const color = cosmeticColor(id, '#58c8ff');
    ctx.save();
    if (layer === 'sky') {
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, /volcano/.test(id) ? 'rgba(110,12,0,.58)' : /ice-cave/.test(id) ? 'rgba(40,170,220,.28)' : 'rgba(85,35,150,.30)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = color; ctx.globalAlpha = .34;
      const count = reduceMotion ? 12 : 28;
      for (let i = 0; i < count; i++) {
        const x = (i * 193) % Math.max(W, 1), y = (i * 79) % Math.max(H * .72, 1);
        if (/neon-grid|arcade/.test(id)) ctx.fillRect(x, y, 8, 8);
        else { ctx.beginPath(); ctx.arc(x, y, 2 + i % 4, 0, Math.PI * 2); ctx.fill(); }
      }
    } else {
      ctx.strokeStyle = color; ctx.globalAlpha = .62; ctx.lineWidth = 5;
      if (/neon-grid|storm-table|aurora-stage/.test(id)) {
        for (let x = -W; x < W * 3; x += 90) { ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x + 55, groundY + 260); ctx.stroke(); }
      } else {
        ctx.beginPath(); ctx.moveTo(-W, groundY + 10); ctx.lineTo(W * 3, groundY + 10); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawModernEventWorld(eventState, bottle, groundY, bodies) {
    if (!eventState || !bottle) return;
    const id = eventState.eventId;
    const runtime = eventState.runtime || {};
    const visual = eventState.visual || {};
    const p = projectBottleCenter(bottle, groundY);
    const phase = reduceMotion ? 0 : clock;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (id === 'half-full') {
      ctx.fillStyle = 'rgba(75,195,255,.28)'; ctx.fillRect(0, groundY - 28, W, 28);
    } else if (id === 'fizz-jet') {
      ctx.strokeStyle = '#b9f5ff'; ctx.lineWidth = 3;
      for (let i=0;i<12;i++) { const r=4+(i%4)*2, x=p.x+Math.sin(i*5+phase)*48, y=p.y+65+i*15; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); }
    } else if (id === 'bouncy-bottle') {
      ctx.strokeStyle = '#85ff9b'; ctx.lineWidth = 5; for(let i=0;i<4;i++){ctx.globalAlpha=.75-i*.15;ctx.beginPath();ctx.ellipse(p.x,groundY,70+i*35,12+i*7,0,0,Math.PI*2);ctx.stroke();}
    } else if (id === 'earthquake') {
      ctx.strokeStyle='#ff8b55';ctx.lineWidth=5;ctx.beginPath();for(let x=0;x<=W;x+=40){const y=groundY-8-(x/40%2)*16;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    } else if (id === 'shrink-ray') {
      ctx.strokeStyle='#6dffd1';ctx.lineWidth=3;for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(p.x,p.y,45+i*22,phase+i,phase+i+1.6);ctx.stroke();}
    } else if (id === 'portal-pair' && runtime.portals) {
      runtime.portals.forEach((portal,index)=>{ctx.strokeStyle=index?'#4ee8ff':'#b66cff';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=18;ctx.lineWidth=10;ctx.beginPath();ctx.ellipse(portal.x,portal.y,48,76,0,0,Math.PI*2);ctx.stroke();});
    } else if (id === 'tether-swing' && runtime.anchor) {
      ctx.strokeStyle='#ffe187';ctx.lineWidth=5;ctx.setLineDash([14,10]);ctx.beginPath();ctx.moveTo(runtime.anchor.x,runtime.anchor.y);ctx.lineTo(bottle.position.x,bottle.position.y);ctx.stroke();ctx.setLineDash([]);
    } else if (id === 'ceiling-flip') {
      ctx.fillStyle='rgba(255,105,195,.55)';ctx.fillRect(0,32,W,10);ctx.fillStyle='#fff';ctx.font='800 22px system-ui';ctx.textAlign='center';ctx.fillText('CEILING TARGET',W/2,28);
    } else if (id === 'black-hole' && runtime.singularity) {
      const s=runtime.singularity,g=ctx.createRadialGradient(s.x,s.y,3,s.x,s.y,92);g.addColorStop(0,'#000');g.addColorStop(.45,'#090014');g.addColorStop(.7,'rgba(148,76,255,.82)');g.addColorStop(1,'rgba(70,15,130,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.x,s.y,92,0,Math.PI*2);ctx.fill();
    } else if (id === 'boomerang') {
      ctx.strokeStyle='#ffbf58';ctx.lineWidth=6;ctx.setLineDash([18,10]);ctx.beginPath();ctx.arc(p.x,p.y,150,-2.8,.5);ctx.stroke();ctx.setLineDash([]);
    } else if (id === 'roulette-table') {
      const slot=runtime.rouletteSlot||0;for(let i=0;i<8;i++){ctx.fillStyle=i===slot?'#ffe15a':(i%2?'#178755':'#bc264b');ctx.beginPath();ctx.moveTo(p.x,groundY);ctx.arc(p.x,groundY,115,i*Math.PI/4,(i+1)*Math.PI/4);ctx.fill();}ctx.fillStyle='#fff';ctx.font='900 26px system-ui';ctx.textAlign='center';ctx.fillText(`×${[1,2,3,4,4,3,2,1][slot]}`,p.x,groundY+8);
    } else if (id === 'rewind') {
      ctx.strokeStyle='#75bdff';ctx.lineWidth=7;ctx.beginPath();ctx.arc(p.x,p.y,95,.45,Math.PI*1.8);ctx.stroke();ctx.fillStyle='#75bdff';ctx.beginPath();ctx.moveTo(p.x-96,p.y-10);ctx.lineTo(p.x-70,p.y-34);ctx.lineTo(p.x-63,p.y+2);ctx.fill();
    } else if (id === 'mirror-match') {
      const x=W/2;ctx.strokeStyle='rgba(210,245,255,.8)';ctx.lineWidth=5;ctx.setLineDash([12,8]);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,groundY);ctx.stroke();ctx.setLineDash([]);
    } else if (id === 'cap-toss') {
      ctx.strokeStyle='#ff9d42';ctx.lineWidth=8;ctx.beginPath();ctx.arc(p.x,groundY-7,42,0,Math.PI*2);ctx.stroke();
    }
    if ((id === 'mitosis' || id === 'mirror-match' || id === 'meteor-shower') && Array.isArray(bodies)) {
      bodies.forEach((body)=>{const r=Math.max(12,Math.min(42,(body.bounds.max.x-body.bounds.min.x)/2));ctx.fillStyle=id==='meteor-shower'?'#ff713b':'rgba(120,240,255,.55)';ctx.beginPath();ctx.arc(body.x,body.y,r,0,Math.PI*2);ctx.fill();});
    }
    if (visual.theme === 'gold') { ctx.strokeStyle='#ffe27a';ctx.lineWidth=4;ctx.strokeRect(12,12,W-24,H-24); }
    ctx.restore();
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
    if (fxPlinko) return;   // plinko drop: the floor has vanished

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

  // ── Sky ambience: moon throws + seasonal easter eggs ───────────────────────
  // Drawn in screen space right after the sky, before the camera transform.
  // Pure cosmetics; dates use the device clock.
  function drawAmbience() {
    // Date flags cannot change frame-to-frame; refresh them once a minute.
    const timestamp = Date.now();
    if (timestamp >= nextSeasonCheck) {
      const now = new Date(timestamp);
      const mo = now.getMonth(), day = now.getDate();
      seasonalAmbience = {
        spooky: mo === 9 && day >= 24,  // late October
        snowy:  mo === 11,              // December
        hearts: mo === 1 && day === 14, // Valentine's
        newyr:  mo === 0 && day === 1,  // New Year's Day
      };
      nextSeasonCheck = timestamp + 60000;
    }
    const { spooky, snowy, hearts, newyr } = seasonalAmbience;

    if (fxMoon || spooky) {
      const mx = W - 86, my = 84;
      ctx.save();
      ctx.fillStyle = spooky ? '#f4d9a8' : '#f2ecdc';
      ctx.beginPath(); ctx.arc(mx, my, 36, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (const [cx2, cy2, r2] of [[-12, -8, 7], [10, 6, 9], [2, -16, 4]]) {
        ctx.beginPath(); ctx.arc(mx + cx2, my + cy2, r2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (snowy || hearts || newyr) {
      ctx.save();
      for (let i = 0; i < 22; i++) {
        // Deterministic drift lanes so no particle state is needed.
        const seed = (i * 2654435761 % 1000) / 1000;
        const x = ((seed * W + clock * (12 + seed * 16) * (i % 2 ? 1 : -1)) % W + W) % W;
        const y = ((seed * 700 + clock * (26 + seed * 30)) % (H + 40)) - 20;
        if (snowy) {
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath(); ctx.arc(x, y, 1.6 + seed * 2.2, 0, Math.PI * 2); ctx.fill();
        } else if (hearts) {
          ctx.fillStyle = `rgba(255,110,150,${0.25 + seed * 0.3})`;
          const s2 = 5 + seed * 6;
          ctx.beginPath();
          ctx.moveTo(x, y + s2 * 0.8);
          ctx.bezierCurveTo(x - s2, y - s2 * 0.2, x - s2 * 0.5, y - s2, x, y - s2 * 0.3);
          ctx.bezierCurveTo(x + s2 * 0.5, y - s2, x + s2, y - s2 * 0.2, x, y + s2 * 0.8);
          ctx.fill();
        } else {
          ctx.fillStyle = `hsl(${Math.round(seed * 360)}, 90%, 62%)`;
          ctx.fillRect(x, y, 4, 7);
        }
      }
      ctx.restore();
    }
  }

  // ── Bottle ─────────────────────────────────────────────────────────────────
  // Wide squat Gatorade bottle: 74px body, short neck, wide orange cap, blue fill.
  // Local coords centered at bottle.position (physics CG, ~40px above visual base).
  function drawBottle(bottle, liquid, isOnFire, liquidColor, groundY, skin, variantId, renderState) {
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
    // tiny/giant name eggs scale the paint; the extra y shift keeps the drawn
    // base on the table (projectBottleCenter compensates for the stock scale).
    const drawScale = BOTTLE_DRAW_SCALE * (fxSize || 1);
    ctx.translate(x, y + (BOTTLE_DRAW_SCALE - drawScale) * 43);
    ctx.rotate(angle);
    ctx.scale(drawScale, drawScale);
    // Ghost name egg: the object flips see-through. Cosmetic only.
    if (fxGhost) ctx.globalAlpha = 0.55;
    // Ninja: darken toward silhouette where ctx.filter is supported (the dark
    // color re-bake from main.js carries the effect everywhere else).
    if (fxNinja) ctx.filter = 'brightness(0.3)';

    const dynamics = typeof window !== 'undefined' && window.FlipLegacyDynamicsV111;
    const artState = Object.assign({
      color: liquidColor,
      variantId: variantId || 'blue-steel',
      reducedMotion: reduceMotion,
      time: clock,
      elapsed: clock,
      slosh: liquid.slosh,
      angle,
    }, renderState || {});
    if (dynamics && dynamics.paintUnderlay) dynamics.paintUnderlay(ctx, skin || 'bottle', artState);

    // Skin dispatch: a non-bottle edition paints the object in the same local
    // frame (origin = CG, ground plane ≈ +39) and we're done. See js/skins.js.
    if (skin && skin !== 'bottle' && window.Skins && window.Skins.hasDraw(skin)) {
      // Pass angle so vessel skins can keep liquid world-level and pour when open.
      // Hourglass also gets sandBottom/sandFlow from the physics sand sim.
      window.Skins.draw(ctx, skin, Object.assign({}, artState, {
        pour: !!(window.Skins.liquidFor && (window.Skins.liquidFor(skin) || {}).mode === 'open'),
        sandBottom: liquid.sandBottom,
        sandFlow: liquid.sandFlow,
      }));
      if (dynamics && dynamics.paintOverlay) dynamics.paintOverlay(ctx, skin, artState);
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

    if (dynamics && dynamics.paintOverlay) dynamics.paintOverlay(ctx, skin || 'bottle', artState);

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
  // `worldW` is the physics arena width (may exceed the screen on alien).
  function drawWalls(groundY, sideWalls, worldW) {
    if (sideWalls === false) return; // mobile open arena — no painted walls
    const WALL = 14; // matches physics WALL_INSET
    const ww = worldW > 0 ? worldW : W;
    for (const x0 of [0, ww - WALL]) {
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
    ctx.fillRect(ww - WALL, 0, 2, groundY);
  }

  // Safety net for expanded courts: if the fit-zoom leaves a sub-pixel gutter
  // (or an older profile still letterboxes), paint outer hull + table so the
  // phone never shows empty sky beside the walls. Runs in SCREEN space.
  function drawCourtGutters(view, groundY) {
    if (!view || !view.courtFrame || view.sideWalls === false || view.openArena) return;
    if (fxPlinko) return;
    if (camZoom >= 0.985) return;

    const ww = view.worldW > 0 ? view.worldW : W;
    const leftEdge = W / 2 + camZoom * (0 - camX);
    const rightEdge = W / 2 + camZoom * (ww - camX);
    const tableY = H / 2 + camZoom * (groundY - camY);
    const roofY = H / 2 + camZoom * (0 - camY);
    const courtTop = Math.max(0, Math.min(H, roofY));
    const courtBot = Math.max(0, Math.min(H, tableY));

    if (leftEdge > 1.5) {
      const g = ctx.createLinearGradient(0, 0, leftEdge, 0);
      g.addColorStop(0, '#070c14');
      g.addColorStop(0.65, '#0e1724');
      g.addColorStop(1, '#1c283a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, leftEdge + 1, H);
      ctx.fillStyle = 'rgba(150,185,215,0.22)';
      ctx.fillRect(leftEdge - 2, courtTop, 2, Math.max(0, courtBot - courtTop));
    }
    if (rightEdge < W - 1.5) {
      const g = ctx.createLinearGradient(W, 0, rightEdge, 0);
      g.addColorStop(0, '#070c14');
      g.addColorStop(0.65, '#0e1724');
      g.addColorStop(1, '#1c283a');
      ctx.fillStyle = g;
      ctx.fillRect(rightEdge - 1, 0, W - rightEdge + 2, H);
      ctx.fillStyle = 'rgba(150,185,215,0.22)';
      ctx.fillRect(rightEdge, courtTop, 2, Math.max(0, courtBot - courtTop));
    }
    if (tableY < H) {
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(0, tableY, W, H - tableY + 2);
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(0, tableY - 2, W, 3);
    }
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
  function drawTargetPad(target, groundY, aiming) {
    if (!target) return;
    const { x, halfWidth: hw } = target;
    const hitHW = target.hitHalfWidth != null ? target.hitHalfWidth : hw;
    const pulse = 0.5 + 0.5 * Math.sin(clock * (aiming ? 5.5 : 3));
    if (target.style === 'portal') {
      const y = target.y == null ? groundY * 0.52 : target.y;
      const armed = !!target.armed;
      const c = armed ? '#69f0ae' : '#8b7cff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(x, y - hw * 1.4, x, y + hw * 1.4);
      beam.addColorStop(0, 'rgba(80,255,150,0)');
      beam.addColorStop(0.5, armed ? 'rgba(80,255,150,0.18)' : 'rgba(140,120,255,0.12)');
      beam.addColorStop(1, 'rgba(80,255,150,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(x - hw * 0.72, y - hw * 1.45, hw * 1.44, hw * 2.9);
      ctx.translate(x, y);
      ctx.rotate(reduceMotion ? 0 : clock * 0.25);
      ctx.strokeStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 28 + pulse * 18;
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(0, 0, hitHW, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, hw + 12 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        ctx.fillStyle = i % 2 ? '#d9fff0' : c;
        ctx.beginPath(); ctx.arc(Math.cos(a) * (hw + 12), Math.sin(a) * (hw + 12), 4 + pulse * 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.max(15, hw * 0.18)}px system-ui, sans-serif`;
      ctx.fillStyle = armed ? '#baffd4' : '#d6cfff';
      ctx.shadowColor = c; ctx.shadowBlur = 12;
      ctx.fillText(armed ? 'TRACTOR RING ARMED' : 'BANK TO ARM', x, y + hw + 36);
      ctx.restore();
      return;
    }
    // Aim telegraph: brighter / wider while the player is dragging a bank shot.
    const aim = aiming ? 1 : 0;
    const glowR = hw * (1.15 + aim * 0.28);
    ctx.save();
    const glow = ctx.createRadialGradient(x, groundY, 4, x, groundY, glowR);
    glow.addColorStop(0, `rgba(105,240,174,${0.22 + pulse * 0.12 + aim * 0.22})`);
    glow.addColorStop(1, 'rgba(105,240,174,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(x, groundY, glowR, hw * (0.34 + aim * 0.08), 0, 0, Math.PI * 2);
    ctx.fill();
    // Outer ring = visual pad (soft), inner ring = actual MAKE radius
    ctx.lineWidth = 2 + aim;
    ctx.strokeStyle = `rgba(105,240,174,${0.35 + pulse * 0.15 + aim * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(x, groundY, hw, hw * 0.29, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3 + aim;
    ctx.strokeStyle = `rgba(105,240,174,${0.85 + pulse * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(x, groundY, hitHW, hitHW * 0.29, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, groundY, hitHW * 0.35, hitHW * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (aiming) {
      ctx.fillStyle = `rgba(255,255,255,${0.45 + pulse * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, groundY - 1, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Bank-shot ceiling rail — the bounce plane is physical but was invisible.
  function drawCeiling(view) {
    if (!view || view.sideWalls === false || view.openArena) return;
    if (view.ceilingY == null && !(view.worldW > 0)) return;
    // Only draw when a bounce profile is active (ceiling collisions live).
    // getViewHint always sends ceilingY for walled courts; skip open arena.
    const ww = view.worldW > 0 ? view.worldW : W;
    const y = view.ceilingY != null ? view.ceilingY : 0;
    ctx.save();
    const g = ctx.createLinearGradient(0, y - 6, 0, y + 18);
    g.addColorStop(0, 'rgba(90,120,160,0.55)');
    g.addColorStop(1, 'rgba(90,120,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 6, ww, 24);
    ctx.fillStyle = 'rgba(170,205,235,0.55)';
    ctx.fillRect(0, y, ww, 3);
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

  // ── Plinko board (1/1000 drop) ──────────────────────────────────────────────
  function drawPlinko(p) {
    const bw = p.right - p.left;
    ctx.save();
    // Backboard
    ctx.fillStyle = 'rgba(12, 24, 40, 0.92)';
    ctx.strokeStyle = 'rgba(150, 190, 230, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(p.left - 8, p.top - 8, bw + 16, (p.bottom - p.top) + 20, 14);
    ctx.fill();
    ctx.stroke();
    // Marquee dots around the rim
    ctx.fillStyle = 'rgba(255, 210, 63, 0.9)';
    const per = Math.max(10, Math.round(bw / 46));
    for (let i = 0; i <= per; i++) {
      const t = 0.35 + 0.65 * Math.abs(Math.sin(clock * 4 + i));
      ctx.globalAlpha = t;
      ctx.beginPath();
      ctx.arc(p.left - 8 + ((bw + 16) / per) * i, p.top - 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Slots (behind pegs so long labels never hide a peg)
    const n = p.slots.length;
    const slotW = bw / n;
    for (let i = 0; i < n; i++) {
      const s = p.slots[i];
      const x = p.left + slotW * i;
      const isWin = s.kind === 'win';
      const isLoss = s.kind === 'lose';
      if (isWin) {
        const pulse = 0.28 + 0.2 * Math.sin(clock * 5);
        ctx.fillStyle = `rgba(255, 200, 40, ${pulse})`;
      } else if (isLoss) {
        ctx.fillStyle = 'rgba(255, 45, 65, 0.30)';
      } else if (s.kind === 'magnet') {
        ctx.fillStyle = 'rgba(50, 215, 255, 0.23)';
      } else {
        ctx.fillStyle = s.kind === 'halve' ? 'rgba(140, 90, 255, 0.18)' : 'rgba(90, 220, 140, 0.15)';
      }
      ctx.fillRect(x + 3, p.bottom - p.slotH, slotW - 6, p.slotH);
      // Two compact lines remain readable across nine bins.
      const labels = {
        win: ['👑 AUTO', 'WIN'],
        lose: ['☠ AUTO', 'LOSS'],
        magnet: ['🧲 ALWAYS', 'MAGNET'],
        halve: ['½', 'OTHERS'],
        double: ['×2', 'LIVES'],
      };
      const lines = labels[s.kind] || [String(s.kind), ''];
      ctx.fillStyle = isWin ? '#ffd23f' : (isLoss ? '#ff6b78' : '#e8f2fa');
      ctx.font = `900 ${Math.max(12, Math.min(isWin ? 23 : 18, slotW * 0.15))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lines[0], x + slotW / 2, p.bottom - p.slotH / 2 + 2);
      ctx.fillText(lines[1], x + slotW / 2, p.bottom - p.slotH / 2 + 28);
    }
    // Dividers
    ctx.fillStyle = '#9fb6c8';
    for (const d of p.dividers) {
      ctx.beginPath();
      ctx.roundRect(d.x - 5, d.y0, 10, d.y1 - d.y0, 5);
      ctx.fill();
    }
    // Floor lip
    ctx.fillStyle = '#7d93a6';
    ctx.fillRect(p.left - 8, p.bottom, bw + 16, 8);
    // Pegs
    for (const peg of p.pegs) {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y + 2, peg.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
      ctx.fillStyle = '#dfe9f2';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(peg.x - 2, peg.y - 2, peg.r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  function applyCamera(view) {
    const targetZoom = view && view.zoom != null ? view.zoom : 1;
    const tx = view && view.camX != null ? view.camX : W / 2;
    const ty = view && view.camY != null ? view.camY : H / 2;
    // Plinko needs a responsive follow-cam so a fast drop cannot outrun the
    // frame. Other arena zooms retain the gentler cinematic ease.
    const k = reduceMotion ? 1 : (view && view.tracking === 'plinko' ? 0.30
      : (view && view.tracking === 'reaction' ? 0.24 : 0.14));
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
    fxGolden  = !!state.golden;
    fxGhost   = !!state.ghostly;
    fxParty   = !!state.party;
    fxMoon    = !!state.moon;
    fxNinja   = !!state.ninja;
    fxRainbow = !!state.rainbow;
    fxCosmeticId = state.cosmeticId || null;
    fxVisualArenaId = state.visualArenaId || null;
    fxEventState = state.eventRenderState || null;
    fxTrail   = state.rareEvent === 'rainbow-trail' || state.rareEvent === 'rainbow-corkscrew' || fxEventState?.eventId === 'rainbow-corkscrew';
    fxRareEvent = fxEventState?.eventId || state.rareEvent || (state.alwaysMagnet ? 'magnet' : null);
    fxPlinko  = state.plinkoBoard || null;
    // During a plinko drop the physics body is a ball — draw the character
    // curled up small so it visually fits the peg gaps it's bouncing through.
    fxSize    = (state.sizeFx || 1) * (fxPlinko ? 0.6 : 1);
    clock += dt;
    const nextMotionKey = state.flipSeed == null ? 'idle' : `flip:${String(state.flipSeed)}`;
    if (nextMotionKey !== motionFlipKey) {
      motionFlipKey = nextMotionKey;
      motionElapsed = 0;
    } else {
      motionElapsed += Math.max(0, dt || 0);
    }

    const reactions = typeof window !== 'undefined' && window.FlipReactionRendererV111;
    const lifecycle = state.landingLifecycle || null;
    const velocity = bottle && bottle.velocity ? bottle.velocity : { x: 0, y: 0 };
    const renderState = reactions ? reactions.artState({
      objectId: skin || 'bottle',
      variantId: state.variantId || 'blue-steel',
      result: result,
      lifecycle: lifecycle,
      flipSeed: state.flipSeed,
      time: motionElapsed,
      reducedMotion: reduceMotion,
      angle: bottle && bottle.angle,
      slosh: liquid && liquid.slosh,
      angularVelocity: bottle && bottle.angularVelocity,
      velocity: velocity,
    }) : null;
    const face = reactions ? reactions.faceFor(window, skin || 'bottle', state.variantId) : null;
    let activeView = view;
    if (reactionFocus && face && bottle) {
      const center = projectBottleCenter(bottle, groundY);
      const drawScale = BOTTLE_DRAW_SCALE * (fxSize || 1);
      const centerY = center.y + (BOTTLE_DRAW_SCALE - drawScale) * 43;
      const cosine = Math.cos(bottle.angle || 0);
      const sine = Math.sin(bottle.angle || 0);
      const facePoint = {
        x: center.x + (face.anchor.x * cosine - face.anchor.y * sine) * drawScale,
        y: centerY + (face.anchor.x * sine + face.anchor.y * cosine) * drawScale,
      };
      activeView = reactionFocus.next({
        view: view, width: W, height: H, dt: dt, result: result,
        reducedMotion: reduceMotion, face: face, point: facePoint,
        radius: face.focusRadius * drawScale, key: state.flipSeed,
      });
    } else if (reactionFocus) {
      activeView = reactionFocus.next({ view: view, width: W, height: H, result: null });
    }
    if (fxTrail && !reduceMotion && bottle && bottle.bounds.max.y < groundY - 10) {
      trailAccumulator += dt;
      const trailStep = 0.018;
      while (trailAccumulator >= trailStep) {
        trailAccumulator -= trailStep;
        const p = projectBottleCenter(bottle, groundY);
        spawnRainbowTrail(p.x, p.y + 40);
      }
    } else {
      trailAccumulator = 0;
    }
    if (!reduceMotion && String(fxCosmeticId || '').startsWith('trail.') && bottle && bottle.bounds.max.y < groundY - 10) {
      const p = projectBottleCenter(bottle, groundY);
      spawnCosmeticTrail(p.x, p.y + 40, fxCosmeticId);
    }
    rememberRainbowPoint(bottle, groundY);
    updateParticles(dt);
    if (shakeAmp > 0) shakeAmp = Math.max(0, shakeAmp - dt * 18);

    // Reset any camera transform from the previous frame (DPR setTransform
    // lives on the canvas from main.resize — we only add a logical camera).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Re-apply DPR from the canvas backing store ratio.
    const dpr = canvas.width / Math.max(1, W);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, W, H);
    drawBackground(groundY, isOnFire, { skyOnly: true });
    drawVisualArena('sky', groundY);
    drawAmbience();
    drawRareEventOverlay(fxRareEvent);

    // Brief impact/verdict shake — screen space, before the world camera.
    if (shakeAmp > 0.05) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp);
    }

    ctx.save();
    applyCamera(activeView);
    drawBackground(groundY, isOnFire, { tableOnly: true });
    drawVisualArena('table', groundY);
    drawWalls(groundY, activeView ? activeView.sideWalls : true, activeView && activeView.worldW);
    if (target) drawCeiling(activeView);
    const aimingPad = !!(target && drag && awaitingFlick);
    drawTargetPad(target, groundY, aimingPad);
    drawObstacles(obstacles);
    if (fxPlinko) drawPlinko(fxPlinko);
    drawFlickIndicator(drag, bottle, groundY);
    if (showGlow && !fxPlinko) drawLandingGlow(bottle, groundY);
    drawRareEventWorld(fxRareEvent, bottle, groundY);
    drawModernEventWorld(fxEventState, bottle, groundY, state.eventBodies);
    drawSuccessfulShotGhost(state.successfulShotGhost);
    drawRainbowTail();
    drawBottle(bottle, liquid, isOnFire, liquidColor, groundY, skin, state.variantId, renderState);
    drawPersonalFinish(bottle, groundY);
    drawRainbowAura(bottle, groundY);
    drawParticles();
    ctx.restore();

    // Alien (etc.) pulled-back courts: fill letterbox gutters so the phone
    // still feels full-screen instead of a floating postage-stamp arena.
    drawCourtGutters(activeView, groundY);

    // HUD overlays stay screen-fixed (not affected by world zoom).
    drawStake(stake);
    drawIntense(intense, suddenDeath, awaitingFlick);
    drawCosmeticNameplate(state.playerName);

    if (result) {
      const color = result === 'MAKE' ? '#69f0ae' : '#ff5252';
      drawResult(result === 'MAKE' ? 'MAKE!' : 'MISS', color, resultAlpha, specialLabel);
    }

    if (shakeAmp > 0.05) ctx.restore();
  }

  // Paint one upright object into some OTHER canvas (the setup-screen skin
  // previews). Borrows the module ctx for the call and puts it back, so this
  // must stay synchronous — it runs from setup, never from inside frame().
  // groundY is pushed far below so projectPoint's airborne lift clamps to 0
  // and the object is drawn flat-on rather than in flight perspective.
  function drawPreview(target, skin, liquidColor) {
    const art = typeof window !== 'undefined' && window.FlipArtV111;
    if (art && art.getObject(skin)) {
      const flavors = window.FLIP_V111_OBJECT_MANIFEST?.flavorOrder || [];
      const flavor = flavors.find((entry) => String(entry.color).toLowerCase() === String(liquidColor).toLowerCase());
      const previewCtx = target.getContext('2d');
      previewCtx.setTransform(1, 0, 0, 1, 0, 0); previewCtx.clearRect(0, 0, target.width, target.height);
      art.renderPreview(previewCtx, { objectId: skin, variantId: flavor?.id || 'blue-steel',
        box: { x: 0, y: 0, width: target.width, height: target.height }, reducedMotion: reduceMotion });
      return;
    }
    const prevCanvas = canvas, prevCtx = ctx, prevW = W, prevH = H;
    fxGolden = fxGhost = fxNinja = fxRainbow = fxTrail = false; // never leak cosmetics into previews
    fxRareEvent = null;
    fxSize = 1;
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
        false, liquidColor, -10000, skin, null);
    } finally {
      canvas = prevCanvas; ctx = prevCtx; W = prevW; H = prevH;
    }
  }

  // drawBottle is exported for the art-iteration harness (drawing one object
  // without the full scene); the game itself only calls frame().
  return {
    init, resize, frame, setReduceMotion, projectPoint, projectBottleCenter,
    bottleDrawScale, drawBottle, drawPreview, burst, nudge,
  };
})();
