// physics.js — Matter.js world, bottle body, liquid sim

const Physics = (() => {
  const { Engine, Bodies, Body, World, Events } = Matter;

  let engine, world, bottle, ground, leftWall, rightWall;
  let stableFrames = 0, groundedFrames = 0;
  let angleWin = [];   // sliding window of recent angles (settle detection)
  let totalRotation = 0, hasFlipped = false, launchAngle = 0, hasLanded = false;
  let canvasW, canvasH;
  let groundY;

  // Spin tuning (rad/step) — see applyFlick. Single sweet spot near 1 turn:
  // soft flick under-rotates (<360, fails), medium ≈ one clean turn (make),
  // hard overshoots (~1.3 turns, miss). Rotation ranges ~0.8 to ~1.35.
  const SPIN_BASE   = 0.140;  // spin from a soft flick (~0.8 turn)
  const SPIN_RANGE_DEFAULT = 0.100;  // extra spin at full-strength flick (~1.35 turn)
  const POWER_SPEED = 4000;   // flick speed (px/s) that maps to full power
  const WALL_INSET  = 14;     // px from each screen edge to the wall's inner face (matches renderer)

  // "Feel" knob: a flatter spin curve widens the make window (soft/hard flicks
  // differ less), a steeper one narrows it. The curve PIVOTS around the sweet
  // spot (~2100 px/s) so every feel makes the same ideal flick — only the
  // punishment for being off-speed changes. 'standard' == the original curve.
  const SWEET_POWER = 2100 / POWER_SPEED;                              // 0.525
  const SWEET_SPIN  = SPIN_BASE + SWEET_POWER * SPIN_RANGE_DEFAULT;    // 0.1925 rad/step
  let   spinRange   = SPIN_RANGE_DEFAULT;
  let   spinBase    = SPIN_BASE;
  function setFeel(mode) {
    spinRange = { forgiving: 0.07, standard: 0.10, pro: 0.13 }[mode] ?? SPIN_RANGE_DEFAULT;
    spinBase  = SWEET_SPIN - SWEET_POWER * spinRange;   // standard → exactly 0.140
  }

  // ── Fixed-timestep accumulator ─────────────────────────────────────────────
  // Matter's integration is not dt-stable: feeding it the render frame's
  // variable dt makes the same flick behave differently at 60Hz vs 120Hz.
  // Physics always steps in fixed 1/60s slices; the render loop just tells us
  // how much real time passed. (Also multiplayer-lockstep prep — see HANDOFF.)
  const FIXED_DT = 1 / 60;
  let acc = 0;

  // ── Seeded PRNG (mulberry32) ───────────────────────────────────────────────
  // All in-flight randomness (launch jitter + landing kick) draws from this
  // stream. applyFlick reseeds per flick, records the seed in lastFlickInfo,
  // and accepts an explicit seed to replay a flick exactly (multiplayer prep).
  let rngState = 1;
  function seedRng(seed) { rngState = (seed >>> 0) || 1; }
  function rand() {
    rngState = (rngState + 0x6D2B79F5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Flight/judging state for the current flick
  let launched      = false;  // set by applyFlick, cleared by resetBottle
  let pendingResult = null;   // 'MAKE' | 'MISS' once judged
  let groundContact = false;  // first ground touch after launch (thud SFX)
  let onImpact      = null;   // callback: (type 'ground'|'wall', speed)

  let lastFlickInfo = null;   // debug/readout: { upSpeed, power, spin, seed }
  let lastLanding   = null;   // display-only: { flipped, finalAngle } of last judged stop

  function setImpactCallback(fn) { onImpact = fn; }

  // ── Liquid oscillator ──────────────────────────────────────────────────────
  // Virtual pendulum — tracks the slosh of liquid inside the bottle.
  // It is NOT a physics body; it's a visual/stability modifier only.
  const liquid = {
    slosh: 0,      // -1..1 offset of liquid mass center (bottle frame)
    vel: 0,        // rate of change
    settleTimer: 0,

    update(bottleAngVel, dt) {
      // Liquid behaves like a damped pendulum driven by bottle rotation
      const spring  = -0.10 * this.slosh;
      const drive   =  0.40 * bottleAngVel;
      const damping = -0.08 * this.vel;
      this.vel   += (spring + drive + damping) * dt;
      this.slosh += this.vel * dt;
      this.slosh  = Math.max(-1, Math.min(1, this.slosh));

      this.settleTimer = Math.abs(this.vel) < 0.10
        ? this.settleTimer + dt
        : 0;
    },

    renderOffset() { return this.slosh * 13; }, // px horizontal shift for drawing
    isSettled()    { return this.settleTimer > 0.25; },
    reset()        { this.slosh = 0; this.vel = 0; this.settleTimer = 0; },
  };

  // ── Landing detection — wait for a TRUE full stop ─────────────────────────
  // Don't judge mid-teeter. After landing the low-CG bottle slowly rights
  // itself (or tips over) — a slow rotation that must NOT be mistaken for
  // "settled". So we require very low spin + drift for a longer window before
  // reading the final angle, so the bowling-pin wobble fully resolves first.
  //
  // Runs once per FIXED physics step (so the 22-step window and 600-step
  // timeout are the same real duration on every display). The verdict lands in
  // pendingResult; checkLanding() just reads it.
  function evaluateLandingStep() {
    const angVel   = Math.abs(bottle.angularVelocity);
    const linSpeed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
    const grounded = bottle.position.y >= groundY - 80;

    if (!grounded) {
      stableFrames  = 0;
      groundedFrames = 0;
      return;
    }

    groundedFrames++;

    // Tight stillness thresholds AND an angle-stability guard: the slow
    // self-righting rotation must read as "still moving" so we never judge
    // mid-righting. We only call it once the angle has held steady (range
    // < 0.03 rad) across a 22-step window — i.e. the bottle has truly stopped.
    if (angVel < 0.010 && linSpeed < 7) {
      stableFrames++;
      angleWin.push(bottle.angle);
      if (angleWin.length > 22) angleWin.shift();
      let lo = Infinity, hi = -Infinity;
      for (const a of angleWin) { if (a < lo) lo = a; if (a > hi) hi = a; }
      if (angleWin.length >= 22 && (hi - lo) < 0.03) {
        // Must have completed a full rotation AND land upright
        let angle = ((bottle.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (angle > Math.PI) angle -= 2 * Math.PI;
        lastLanding = { flipped: hasFlipped, finalAngle: angle };  // display-only
        if (!hasFlipped) { pendingResult = 'MISS'; return; }
        pendingResult = Math.abs(angle) < 0.61 ? 'MAKE' : 'MISS';  // ±35° window
      }
    } else {
      stableFrames = 0;
      angleWin = [];
      // Hard timeout: ~10s on ground and still moving → MISS
      if (groundedFrames > 600) pendingResult = 'MISS';
    }
  }

  function checkLanding() { return pendingResult; }

  // ── Bottle creation ────────────────────────────────────────────────────────
  // Three-part compound body that mimics a ~¼-full Gatorade bottle:
  //   • Heavy bottom (liquid region) → low CG → "bowling pin" stability
  //   • Medium upper body
  //   • Light neck
  //
  // With this mass distribution the CG sits ~30px above the base edge, giving
  // a tipping angle ≈ 40°. A landing within ~35° of vertical can right itself;
  // steeper than that and gravity wins — producing the "almost stuck" teeter.
  function createBottle() {
    const cx = canvasW / 2;
    // Spawn resting on the table: base bottom edge (cy+73) sits ~3px above ground
    const cy = groundY - 76;

    // Gatorade bottle — wide, squat, thick base:
    //   liq:  74×70px heavy base (bottom 70px of body)
    //   body: 70×50px upper body
    //   neck: 44×35px wide short neck
    // Compound CG ends up ~34px below cy → bottle.position.y ≈ groundY - 90

    const liq  = Bodies.rectangle(cx, cy + 38, 74, 70, { density: 0.018 }); // heavy liquid base
    const body = Bodies.rectangle(cx, cy - 18, 70, 50, { density: 0.0015 });
    const neck = Bodies.rectangle(cx, cy - 62, 44, 36, { density: 0.0004 });

    const b = Body.create({
      parts: [liq, body, neck],
      frictionAir: 0.025,  // moderate decay — spin nearly stops before landing
      friction:    0.85,   // high — grips the table on landing
      restitution: 0.02,   // near-zero — no bounce, just a thud
      label: 'bottle',
    });

    return b;
  }

  // ── Static world bodies (ground + walls) ───────────────────────────────────
  function addStatics() {
    ground = Bodies.rectangle(canvasW / 2, groundY + 25, canvasW * 6, 50, {
      isStatic: true,
      label: 'ground',
      friction: 0.9,
      restitution: 0.01,
    });

    // Side walls (inner faces at x=WALL_INSET and w-WALL_INSET). A bottle that
    // drifts sideways caroms off them — clean vertical flicks never touch them.
    const wallOpts = { isStatic: true, label: 'wall', friction: 0.3, restitution: 0.5 };
    leftWall  = Bodies.rectangle(WALL_INSET - 20, canvasH / 2, 40, canvasH * 3, wallOpts);
    rightWall = Bodies.rectangle(canvasW - WALL_INSET + 20, canvasH / 2, 40, canvasH * 3, wallOpts);

    World.add(world, [ground, leftWall, rightWall]);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function init(w, h) {
    canvasW = w;
    canvasH = h;
    groundY = h - 30;          // top surface of the table
    acc     = 0;

    engine = Engine.create({ gravity: { y: 1.5, scale: 0.001 } });
    world  = engine.world;

    addStatics();

    // Wall hits → impact callback (bounce SFX). Collisions report compound
    // PARTS, so match via part.parent. Ground contact is detected positionally
    // in stepOnce (one thud per flick, exact landing moment).
    Events.on(engine, 'collisionStart', (ev) => {
      if (!onImpact || !launched || !bottle) return;
      for (const { bodyA, bodyB } of ev.pairs) {
        const aIsBottle = bodyA === bottle || bodyA.parent === bottle;
        const bIsBottle = bodyB === bottle || bodyB.parent === bottle;
        if (aIsBottle === bIsBottle) continue;
        const other = aIsBottle ? bodyB : bodyA;
        if (other.label === 'wall') {
          const speed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
          if (speed > 2) onImpact('wall', speed);
        }
      }
    });

    resetBottle();
  }

  // Rebuild statics for new dimensions (window resize / panel rotation) —
  // without this the bottle keeps landing on the OLD ground height. The bottle
  // itself survives; it's clamped inside the new walls and above the new table.
  function resizeWorld(w, h) {
    if (!engine) return;
    canvasW = w;
    canvasH = h;
    groundY = h - 30;
    World.remove(world, [ground, leftWall, rightWall]);
    addStatics();
    if (bottle) {
      const x = Math.max(WALL_INSET + 45, Math.min(w - WALL_INSET - 45, bottle.position.x));
      const y = Math.min(bottle.position.y, groundY - 90);
      Body.setPosition(bottle, { x, y });
    }
  }

  function resetBottle() {
    if (bottle) World.remove(world, bottle);
    stableFrames   = 0;
    groundedFrames = 0;
    angleWin       = [];
    totalRotation  = 0;
    hasFlipped     = false;
    launchAngle    = 0;
    hasLanded      = false;
    launched       = false;
    pendingResult  = null;
    groundContact  = false;
    liquid.reset();

    bottle = createBottle();
    World.add(world, bottle);
  }

  // Convert a flick gesture (px/s) into a launch — models a wrist snap.
  //   • A quick UPWARD flick tosses the bottle up AND spins it forward.
  //   • Flick STRENGTH (upward speed) drives the spin — harder snap = more
  //     rotation. This is the skill: snap hard enough for one clean 360°.
  //   • Sideways lean only nudges drift + which way it tumbles.
  // Launch height stays in a tight band so airtime is steady and the player
  // is really tuning the *spin* (rotation count) with their flick strength.
  //
  // Pass an explicit `seed` to replay a flick's exact randomness (multiplayer/
  // tuning); otherwise a fresh seed is drawn and recorded in lastFlickInfo.
  function applyFlick(vx, vy, seed) {
    const s = (seed !== undefined ? seed : Math.floor(Math.random() * 0xffffffff)) >>> 0;
    seedRng(s);

    const upSpeed = Math.max(0, -vy);                  // upward flick speed (px/s)
    const power   = Math.min(upSpeed / POWER_SPEED, 1.0); // 0..1 flick strength

    // Small randomness so the same flick isn't a guaranteed make — a centered
    // flick still usually lands, but a marginal one becomes a coin flip.
    const jSpin   = 1 + (rand() - 0.5) * 0.24;  // ±12% spin (dominant lever)
    const jLaunch = 1 + (rand() - 0.5) * 0.12;  // ±6% launch (scatters airtime)
    const jDrift  = (rand() - 0.5) * 2.4;       // ±1.2 px/frame stray drift

    // Fairly steady launch height so airtime is consistent — the player is
    // really tuning the *spin* (rotation count) with their flick strength.
    const launchY = -(16 + power * 5) * jLaunch;       // -16 (soft) .. -21 (hard)
    const launchX = Math.max(-6, Math.min(6, vx / 280)) + jDrift; // sideways drift

    // Wrist-snap spin scales with flick strength. Forward by default;
    // a sideways lean flips the tumble direction.
    const dir  = vx >= 0 ? 1 : -1;
    const spin = dir * (spinBase + power * spinRange) * jSpin;

    lastFlickInfo = { upSpeed: Math.round(upSpeed), power: +power.toFixed(2), spin: +spin.toFixed(3), seed: s };
    launchAngle = bottle.angle;
    launched    = true;
    Body.setVelocity(bottle, { x: launchX, y: launchY });
    Body.setAngularVelocity(bottle, spin);
  }

  // Slow-mo drama: the bottle is down, barely rotating, and near the tipping
  // angle — stretch the "will it stick?" moment. The verdict is unaffected:
  // judging waits for a full stop regardless of pacing, and slow-mo releases
  // (angVel bounds don't overlap the stillness threshold) before judging.
  function currentTimeScale() {
    if (!launched || pendingResult || !bottle) return 1;
    if (bottle.position.y < groundY - 80) return 1;          // airborne
    const angVel = Math.abs(bottle.angularVelocity);
    if (angVel <= 0.012 || angVel >= 0.15) return 1;          // stopped / tumbling
    let a = ((bottle.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (a > Math.PI) a -= 2 * Math.PI;
    const tilt = Math.abs(a);
    return (tilt > 0.25 && tilt < 1.15) ? 0.45 : 1;           // near tipping angle
  }

  function step(dt) {
    acc += dt * currentTimeScale();
    if (acc > 0.25) acc = 0.25;    // clamp after long stalls (tab-away etc.)
    while (acc >= FIXED_DT) {
      stepOnce();
      acc -= FIXED_DT;
    }
  }

  function stepOnce() {
    Engine.update(engine, FIXED_DT * 1000);

    // Require a full 360° flip: track angle traveled since launch.
    // Matter's body.angle accumulates (doesn't wrap) so this is exact.
    if (!hasFlipped) {
      totalRotation = Math.abs(bottle.angle - launchAngle);
      if (totalRotation >= 5.6) hasFlipped = true; // ~320° ≈ a completed flip
    }

    // Liquid-driven landing kick: the instant the bottle first comes down on
    // the table, the still-sloshing liquid gives it a shove. Sometimes it
    // sticks, sometimes that extra push tips it over — the "almost stuck then
    // falls" moment. Keeps a good flick from being a guaranteed make.
    if (hasFlipped && !hasLanded && bottle.velocity.y > 0 && bottle.position.y >= groundY - 55) {
      hasLanded = true;
      const kick = liquid.vel * 0.06 + (rand() - 0.5) * 0.16;
      Body.setAngularVelocity(bottle, bottle.angularVelocity + kick);
    }

    // First ground contact after launch → impact callback (landing thud SFX)
    if (launched && !groundContact && bottle.velocity.y > 0 && bottle.position.y >= groundY - 55) {
      groundContact = true;
      if (onImpact) onImpact('ground', Math.abs(bottle.velocity.y));
    }

    liquid.update(bottle.angularVelocity, FIXED_DT);

    if (launched && !pendingResult) evaluateLandingStep();
  }

  function getBottle()  { return bottle; }
  function getLiquid()  { return liquid; }
  function getGroundY() { return groundY; }
  // getRotations is a debug/console helper. getLastFlickInfo also feeds the
  // optional post-flick strength readout + practice meter in main.js;
  // getLandingInfo feeds the "So close!" near-miss banner.
  function getRotations()    { return bottle ? Math.abs(bottle.angle - launchAngle) / (2 * Math.PI) : 0; }
  function getLastFlickInfo() { return lastFlickInfo; }
  function getLandingInfo()   { return lastLanding; }

  return { init, setFeel, step, resetBottle, applyFlick, checkLanding, resizeWorld, setImpactCallback, getBottle, getLiquid, getGroundY, getRotations, getLastFlickInfo, getLandingInfo };
})();
