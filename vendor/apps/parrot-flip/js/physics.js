// physics.js — Matter.js world, bottle body, liquid sim

const Physics = (() => {
  const { Engine, Bodies, Body, World, Events } = Matter;

  let engine, world, bottle, ground, leftWall, rightWall;
  let groundedFrames = 0;
  let angleWin = [];   // sliding window of recent angles (settle detection)
  let totalRotation = 0, hasFlipped = false, launchAngle = 0, hasLanded = false;
  let lastLandingInfo = null;
  let lastFlickInfo = null;
  let canvasW;
  let groundY;

  // Spin tuning (rad/step) — see applyFlick. Single sweet spot near 1 turn:
  // soft flick under-rotates (<360, fails), medium ≈ one clean turn (make),
  // hard overshoots (~1.3 turns, miss). Rotation ranges ~0.8 to ~1.35.
  const SPIN_BASE   = 0.140;  // spin from a soft flick (~0.8 turn)
  const SPIN_RANGE  = 0.100;  // extra spin at full-strength flick (~1.35 turn)
  const POWER_SPEED = 4000;   // flick speed (px/s) that maps to full power
  const WALL_INSET  = 14;     // px from each screen edge to the wall's inner face (matches renderer)

  // ── Landing-detection knobs (the false-miss fix) ───────────────────────────
  // A verdict is read ONLY once the bottle has truly come to rest. A make is
  // called the instant it settles upright; an obvious miss (toppled flat, or
  // never completed a 360°) the instant it settles in that pose. But a
  // tipped-yet-recoverable pose — the bowling-pin bottle hovering near its ~40°
  // tipping point — is NOT judged: it can still slowly RIGHT itself into a make,
  // so we wait it out instead of calling a premature miss. Only if nothing
  // resolves within MISS_CAP_FRAMES (the glitch / teeter-stall fallback) do we
  // force a MISS so a turn can never soft-lock in EVALUATING.
  const SETTLE_FRAMES   = 22;    // frames of stillness required to read the pose
  const SETTLE_RANGE    = 0.03;  // rad — max angle spread across that window
  const MAKE_ANGLE      = 0.61;  // ≤±35° upright = MAKE
  const PERFECT_ANGLE   = 0.16;  // ≤~9° upright = perfect landing flair
  const FALLEN_ANGLE    = 1.20;  // ≥~69° tilt = toppled past recovery → certain MISS
  const MISS_CAP_FRAMES = 300;   // ~5s grounded with no verdict → forced MISS (fallback)


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

  // ── Landing detection — judge only once the bottle has COMMITTED ──────────
  // The low-CG "bowling pin" bottle can land tipped, hover near its ~40° tipping
  // point, then slowly RIGHT itself into a make. The old logic judged the first
  // moment it went still — so a bottle paused mid-teeter (tilted past the make
  // window) was called a MISS even though it then stood up: a false miss.
  //
  // Fix: never call a miss on a pose that can still become a make. Once the
  // bottle is genuinely at rest we read the pose:
  //   • upright (≤ MAKE_ANGLE)         → MAKE   (it won't un-right — call it now)
  //   • toppled past recovery (≥ FALLEN_ANGLE) or never flipped → MISS (certain)
  //   • in between (the teeter zone)   → DON'T judge; wait for it to commit up
  //     (→ MAKE) or fall over (→ MISS), or for the cap to fire.
  // MISS_CAP_FRAMES (~5s grounded) is the fallback: a bottle that never resolves
  // (a rare wall-lean / glitch) is forced to MISS so the turn can't soft-lock.
  function recordLanding(result, tilt, reason) {
    lastLandingInfo = {
      result,
      tilt,
      perfect: result === 'MAKE' && tilt != null && tilt <= PERFECT_ANGLE,
      reason,
    };
    return result;
  }

  function checkLanding() {
    if (!bottle) return null;

    const angVel   = Math.abs(bottle.angularVelocity);
    const linSpeed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
    const grounded = bottle.position.y >= groundY - 80;

    if (!grounded) {
      groundedFrames = 0;
      angleWin = [];
      return null;
    }

    groundedFrames++;

    // Fallback cap: grounded this long without committing (a teeter that neither
    // rights nor falls, a wall-lean, or a glitch) → force a MISS so EVALUATING
    // can't soft-lock. This is the "wait ~5s, then it's a miss" safety net.
    if (groundedFrames > MISS_CAP_FRAMES) return recordLanding('MISS', null, 'timeout');

    // Read the pose ONLY when truly at rest: very low spin + drift, held with a
    // stable angle across the settle window. A momentary teeter pause can't fill
    // the whole window, so we never judge mid-teeter.
    if (angVel < 0.010 && linSpeed < 7) {
      angleWin.push(bottle.angle);
      if (angleWin.length > SETTLE_FRAMES) angleWin.shift();
      let lo = Infinity, hi = -Infinity;
      for (const a of angleWin) { if (a < lo) lo = a; if (a > hi) hi = a; }
      if (angleWin.length >= SETTLE_FRAMES && (hi - lo) < SETTLE_RANGE) {
        if (!hasFlipped) return recordLanding('MISS', null, 'underrotated');   // never completed a 360° — a certain miss
        let angle = ((bottle.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (angle > Math.PI) angle -= 2 * Math.PI;
        const tilt = Math.abs(angle);
        if (tilt < MAKE_ANGLE)    return recordLanding('MAKE', tilt, 'upright');   // upright & settled — won't un-right
        if (tilt >= FALLEN_ANGLE) return recordLanding('MISS', tilt, 'fallen');   // toppled past recovery — certain miss
        // else: settled in the teeter zone — still able to right itself into a
        // make. Don't judge; wait for it to commit (or the cap to fire) below.
      }
    } else {
      angleWin = [];
    }

    return null; // still evaluating
  }

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

  // ── Public API ─────────────────────────────────────────────────────────────
  function init(w, h, bottomInset = 0) {
    canvasW = w;
    groundY = h - 30 - bottomInset;          // top surface of the table

    engine = Engine.create({ gravity: { y: 1.5, scale: 0.001 } });
    world  = engine.world;

    ground = Bodies.rectangle(w / 2, groundY + 25, w * 6, 50, {
      isStatic: true,
      label: 'ground',
      friction: 0.9,
      restitution: 0.01,
    });

    // Side walls (inner faces at x=WALL_INSET and w-WALL_INSET) — pure inelastic
    // CONTAINMENT only: friction 0 + restitution 0, so a bottle that reaches a
    // wall neither bounces nor gets spin imparted. (Before, the springy carom
    // could right a landing — and because the walls track screen WIDTH, a narrow
    // phone got far more of that free correction than a wide panel, making
    // difficulty inconsistent across devices. Neutralizing equalizes it.)
    const wallOpts = { isStatic: true, label: 'wall', friction: 0, restitution: 0 };
    leftWall  = Bodies.rectangle(WALL_INSET - 20, h / 2, 40, h * 3, wallOpts);
    rightWall = Bodies.rectangle(w - WALL_INSET + 20, h / 2, 40, h * 3, wallOpts);

    World.add(world, [ground, leftWall, rightWall]);

    resetBottle();
  }

  // Re-fit the static world to a new canvas size (resize / orientation change).
  // Without this, groundY + walls keep their original dimensions and the bottle
  // flips against an off-screen floor. Statics only — the caller decides whether
  // to re-place the bottle (safe when it's at rest, not mid-flight).
  function reflow(w, h, bottomInset = 0) {
    if (!engine) return;
    canvasW = w;
    groundY = h - 30 - bottomInset;
    Body.setPosition(ground,    { x: w / 2,                 y: groundY + 25 });
    Body.setPosition(leftWall,  { x: WALL_INSET - 20,       y: h / 2 });
    Body.setPosition(rightWall, { x: w - WALL_INSET + 20,   y: h / 2 });
  }

  function resetBottle() {
    if (bottle) World.remove(world, bottle);
    groundedFrames = 0;
    angleWin       = [];
    totalRotation  = 0;
    hasFlipped     = false;
    launchAngle    = 0;
    hasLanded      = false;
    lastLandingInfo = null;
    lastFlickInfo    = null;
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
  function applyFlick(vx, vy) {
    const upSpeed = Math.max(0, -vy);                  // upward flick speed (px/s)
    const power   = Math.min(upSpeed / POWER_SPEED, 1.0); // 0..1 flick strength
    lastFlickInfo = { upSpeed, power, vx, vy };

    // Small randomness so the same flick isn't a guaranteed make — a centered
    // flick still usually lands, but a marginal one becomes a coin flip.
    const jSpin   = 1 + (Math.random() - 0.5) * 0.24;  // ±12% spin (dominant lever)
    const jLaunch = 1 + (Math.random() - 0.5) * 0.12;  // ±6% launch (scatters airtime)
    const jDrift  = (Math.random() - 0.5) * 2.4;       // ±1.2 px/frame stray drift

    // Fairly steady launch height so airtime is consistent — the player is
    // really tuning the *spin* (rotation count) with their flick strength.
    const launchY = -(16 + power * 5) * jLaunch;       // -16 (soft) .. -21 (hard)
    const launchX = Math.max(-6, Math.min(6, vx / 280)) + jDrift; // sideways drift

    // Wrist-snap spin scales with flick strength. Forward by default;
    // a sideways lean flips the tumble direction.
    const dir  = vx >= 0 ? 1 : -1;
    const spin = dir * (SPIN_BASE + power * SPIN_RANGE) * jSpin;

    launchAngle = bottle.angle;
    Body.setVelocity(bottle, { x: launchX, y: launchY });
    Body.setAngularVelocity(bottle, spin);
  }

  function step(dt) {
    Engine.update(engine, dt * 1000);
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
      const kick = liquid.vel * 0.06 + (Math.random() - 0.5) * 0.16;
      Body.setAngularVelocity(bottle, bottle.angularVelocity + kick);
    }

    liquid.update(bottle.angularVelocity, dt);
  }

  function getBottle()  { return bottle; }
  function getLiquid()  { return liquid; }
  function getGroundY() { return groundY; }
  function getLastLandingInfo() { return lastLandingInfo; }
  function getLastFlickInfo()   { return lastFlickInfo; }

  return { init, reflow, step, resetBottle, applyFlick, checkLanding, getBottle, getLiquid, getGroundY, getLastLandingInfo, getLastFlickInfo };
})();
