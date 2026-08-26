// physics.js — Matter.js world, bottle body, liquid sim

const Physics = (() => {
  const { Engine, Bodies, Body, World, Events } = Matter;

  let engine, world, bottle, ground, leftWall, rightWall, ceilingBody;
  let groundedFrames = 0;
  let angleWin = [];   // sliding window of recent angles (settle detection)
  let totalRotation = 0, hasFlipped = false, launchAngle = 0, hasLanded = false;
  let capSticky = false;   // rare: this landing is damping toward an inverted settle
  let capThrowArmed = false; // seed-rolled over-spin throw aiming for a cap land
  let lastLandingInfo = null;
  let lastFlickInfo = null;
  let onImpact = null;          // (type, speed, x, y) → wall/ceiling/ground juice
  let groundImpactSent = false; // one thud per flick
  function setImpactCallback(fn) { onImpact = fn; }
  let canvasW;            // PHYSICS world width (may exceed the screen on alien)
  let groundY;
  let arenaH;             // view height — used for some camera / furniture math
  let viewW = 0;          // screen logical width (CSS px)
  let viewH = 0;          // screen logical height
  let viewBottomInset = 0;
  let ceilingY = 0;       // top of playable air (0 = flush with screen top)
  let sideWallsEnabled = true;
  let openArena = false;  // mobile open sides (no wall caroms)

  // Spin tuning (rad/step) — see applyFlick. Normal throws should usually land
  // if you give a decent flick; only wild overshoots tip. v78: cut high-end
  // over-rotation (hard flicks were falling ~70% of the time).
  //
  // "Feel" knob: a flatter spin curve widens the make window (soft/hard flicks
  // differ less), a steeper one narrows it. The curve PIVOTS around the sweet
  // spot (~2500 px/s) so every feel makes the same ideal flick — only the
  // punishment for being off-speed changes. 'standard' == today's default.
  const SPIN_BASE_DEFAULT  = 0.138;  // soft/medium flicks clear 360°
  const SPIN_RANGE_DEFAULT = 0.082;  // flat high end — hard flicks tip less
  const POWER_SPEED = 4000;   // flick px/s that maps to full power
  const SWEET_POWER = 2500 / POWER_SPEED; // AI / measured sweet-spot power
  const SWEET_SPIN  = SPIN_BASE_DEFAULT + SWEET_POWER * SPIN_RANGE_DEFAULT;
  // Relative to standard (0.082): forgiving ≈ 0.7×, pro ≈ 1.3× — same ratios
  // as the v8-era knob, retargeted onto the current spin curve.
  const FEEL_RANGES = { forgiving: 0.057, standard: 0.082, pro: 0.107 };
  let spinRange = SPIN_RANGE_DEFAULT;
  let spinBase  = SPIN_BASE_DEFAULT;
  let feelMode  = 'standard';
  function setFeel(mode) {
    const m = FEEL_RANGES[mode] != null ? mode : 'standard';
    feelMode  = m;
    spinRange = FEEL_RANGES[m];
    spinBase  = SWEET_SPIN - SWEET_POWER * spinRange; // standard → exactly 0.138
  }
  const WALL_INSET  = 14;     // px from each screen edge to the wall's inner face (matches renderer)
  const FIXED_DT    = 1 / 60; // multiplayer-safe fixed physics step
  let acc = 0;

  // ── Landing-detection knobs (the false-miss fix) ───────────────────────────
  // A verdict is read ONLY once the bottle has truly come to rest. A make is
  // called the instant it settles upright; an obvious miss (toppled flat, or
  // never completed a 360°) the instant it settles in that pose. But a
  // tipped-yet-recoverable pose — the bowling-pin bottle hovering near its ~40°
  // tipping point — is NOT judged: it can still slowly RIGHT itself into a make,
  // so we wait it out instead of calling a premature miss. Only if nothing
  // resolves within MISS_CAP_FRAMES (the glitch / teeter-stall fallback) do we
  // force a MISS so a turn can never soft-lock in EVALUATING.
  //
  // v78: normal throws — generous upright cone + softer settle / landing kick.
  const SETTLE_FRAMES   = 14;    // frames of stillness required to read the pose
  const SETTLE_RANGE    = 0.055; // rad — max angle spread across that window
  // v87: 1.00 rad (±57°!) let a bottle propped against a wall at a heavy lean
  // score as a MAKE (the "honey bear counted a miss" bug). ±36° reads upright.
  const MAKE_ANGLE      = 0.63;  // ≤±~36° upright = MAKE
  const PERFECT_ANGLE   = 0.22;  // perfect-landing flair
  const FALLEN_ANGLE    = 1.40;  // ≥~80° tilt = toppled past recovery → certain MISS
  const LEAN_MISS_FRAMES = 45;   // settled between MAKE and FALLEN this long → MISS
  // Cap / upside-down MAKE: settle within this of ±π. Normally the heavy base
  // tips these over; the rare "cap sticky" assist (see stepOnce) makes ~1/100
  // flips actually stick on the neck/cap — those are worth 2 in game.js.
  const CAP_WINDOW      = 0.48;  // ±~27° of fully inverted
  const CAP_ZONE        = 0.95;  // first-touch zone that can roll the sticky lottery
  const CAP_STICK_CHANCE = 0.09; // × share of landings in CAP_ZONE ≈ ~1/100 overall
  const MISS_CAP_FRAMES = 300;   // ~5s grounded with no verdict → forced MISS (fallback)
  const ABS_MISS_FRAMES = 600;   // ~10s after leaving the floor → forced MISS no matter what
  const SETTLE_ANG_VEL  = 0.018; // "at rest" spin threshold
  const SETTLE_LIN_SPD  = 10.0;  // "at rest" slide threshold
  const GROUND_TOUCH_PX = 6;     // AABB bottom within this of groundY = touching floor

  // ── Seeded PRNG (mulberry32) ───────────────────────────────────────────────
  // All in-flight randomness (launch jitter + landing kick + pad placement)
  // draws from this stream. applyFlick reseeds per flick, records the seed in
  // lastFlickInfo, and accepts an explicit seed to replay a flick exactly.
  let rngState = 1;
  function seedRng(seed) { rngState = (seed >>> 0) || 1; }
  function rand() {
    rngState = (rngState + 0x6D2B79F5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ── Per-edition physics profiles ───────────────────────────────────────────
  // Most editions are pure reskins and flip under the normal rules. An edition
  // can instead ship a profile (see META.physics in skins.js) that retunes
  // gravity, drag, bounce, the launch impulse and how a landing is judged.
  //
  // BOUNCE MODE (the 100-win alien — the ONLY non-flip edition) is a different
  // game: a bank shot, not a flip. You aim sideways, the object caroms off the
  // two walls and the ceiling, and the FLOOR is dead: the first time it touches
  // down is where it landed, and it counts if the body is over the pad.
  const DEFAULT_PROFILE = {
    gravity: 1.5,
    frictionAir: 0.024,    // a touch less drag so soft flicks still complete the turn
    friction: 0.85,
    restitution: 0.02,
    spinScale: 1,
    launchScale: 1,        // multiplies the upward launch speed
    horizDivisor: 280,     // px/s of flick per unit of sideways launch speed
    horizMax: 6,           // cap on sideways launch speed
    wallBounce: 0,         // restitution given to walls + ceiling
    ceiling: false,
    floorResolve: false,
    landOnTarget: false,
    targetHalfWidth: 84,
    requireFlip: true,
    missCapFrames: MISS_CAP_FRAMES,
    // Bounce-mode furniture (alien bank shot).
    deflector: false,
    deflectorCount: 1,
    saucerCount: 0,
    keepWalls: false,      // force side walls even on mobile (alien needs them)
    minHorizRatio: 0,
    strictTarget: false,   // true = bottle CENTER must be on the pad (not any overlap)
    allowSlideIn: true,    // bounce mode: off-pad touchdown can still slide onto a MAKE
    // Scored radius as a fraction of the drawn pad. 1 = whole pad counts;
    // 0.5 = only the inner half-radius scores (drawn pad stays readable).
    hitScale: 1,
    // True arena expand (bank-shot profiles): world size = view size × expand.
    // Camera then fits wall-to-wall. 1 = no expand. Prefer this over arenaZoom.
    arenaExpand: 1,
    mobileArenaExpand: 1,
    arenaExpandY: 1,
    mobileArenaExpandY: 1,
    // Optional extra camera pullback AFTER expand-fit (usually leave at 1).
    arenaZoom: null,
    mobileArenaZoom: null,
  };
  let profile = { ...DEFAULT_PROFILE };
  let targetX = null;      // pad center, only set when profile.landOnTarget
  let targetHW = 84;       // pad half-width actually in play (screen-scaled)
  let arenaTime = 0;

  // The profile's targetHalfWidth is tuned for a phone. On a big screen the
  // same pad is a sliver of the arena and the bank shot turns pixel-perfect,
  // so the pad grows with canvas width — but alien's base is now small, and
  // the scale-up is capped tighter so smartboards aren't a freebie.
  function currentTargetHalfWidth() {
    const base = profile.targetHalfWidth;
    // Bank-shot pads stay nearly fixed — only a tiny grow on huge boards so
    // the make radius doesn't become a freebie on smartboards.
    if (base <= 60) {
      return Math.round(Math.max(base, Math.min(canvasW * 0.045, base * 1.25)));
    }
    return Math.round(Math.max(base, Math.min(canvasW * 0.115, base * 2.2)));
  }

  function currentHitHalfWidth() {
    const scale = Math.max(0.2, Math.min(1, profile.hitScale == null ? 1 : profile.hitScale));
    return Math.max(8, targetHW * scale);
  }
  let launched = false;    // a flick has been taken this turn
  let leanFrames = 0;      // consecutive settled frames in the lean dead zone
  let wasAirborne = false; // ...and the body actually left the floor
  let floorTouched = false; // bounce mode: first touchdown happened (slide window open)
  let slideFrames = 0;      // frames spent in the post-touchdown slide window
  let maxGroundedTilt = 0;  // display-only: worst |tilt| seen while grounded this flip
  let flightFrames = 0;     // frames since the bottle left the floor (absolute soft-lock guard)

  function screenW() { return viewW || canvasW || 0; }

  function wantsOpenArena() {
    if (profile.keepWalls || profile.wallBounce > 0) return false;
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const w = screenW();
    // Phones / small tablets: no side walls so wall-caroms can't make mobile easier.
    return w < 900 || (coarse && w < 1100);
  }

  // Compact screens get the lighter bounce-mode furniture (1 wedge). Desktop
  // keeps the full set. Uses the SCREEN width — never the expanded physics
  // world width — so alien's bigger court doesn't flip us into "desktop" mode.
  function isCompactScreen() {
    const w = screenW();
    if (typeof window === 'undefined') return w < 900;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return w < 900 || (coarse && w < 1100);
  }

  function syncSideWalls() {
    openArena = wantsOpenArena();
    sideWallsEnabled = !openArena;
    const mask = sideWallsEnabled ? 0xFFFFFFFF : 0;
    if (leftWall)  leftWall.collisionFilter.mask = mask;
    if (rightWall) rightWall.collisionFilter.mask = mask;
  }

  // Bank-shot profiles can grow the PHYSICS world past the screen. Camera then
  // fits wall-to-wall so the phone stays full-bleed while caroms have room.
  function arenaExpandX() {
    if (!(profile.floorResolve || profile.keepWalls)) return 1;
    const compact = isCompactScreen();
    const x = compact
      ? (profile.mobileArenaExpand != null ? profile.mobileArenaExpand : profile.arenaExpand)
      : profile.arenaExpand;
    return Math.max(1, Number(x) || 1);
  }
  function arenaExpandY() {
    if (!(profile.floorResolve || profile.keepWalls)) return 1;
    const compact = isCompactScreen();
    const y = compact
      ? (profile.mobileArenaExpandY != null ? profile.mobileArenaExpandY : profile.arenaExpandY)
      : profile.arenaExpandY;
    return Math.max(1, Number(y) || 1);
  }

  function layoutArena() {
    if (!viewW || !viewH) return;
    canvasW = Math.round(viewW * arenaExpandX());
    groundY = viewH - tableInset(viewH) - viewBottomInset;
    // Extra air = raise the ceiling (more negative). Floor stays HUD-relative
    // so the table still meets the player cards.
    ceilingY = -Math.round(Math.max(0, arenaExpandY() - 1) * groundY);
    arenaH = viewH;
    if (!engine) return;
    const midY = (groundY + ceilingY) / 2;
    Body.setPosition(ground,      { x: canvasW / 2,                 y: groundY + 25 });
    Body.setPosition(leftWall,    { x: WALL_INSET - 20,             y: midY });
    Body.setPosition(rightWall,   { x: canvasW - WALL_INSET + 20,   y: midY });
    Body.setPosition(ceilingBody, { x: canvasW / 2,                 y: ceilingY - 20 });
    syncSideWalls();
  }

  // Apply before the turn's flick (main.js calls this per turn). Safe to call
  // with null/undefined to go back to normal physics.
  // IMPORTANT: call BEFORE resetBottle when the skin changes — layoutArena may
  // resize the world, and the bottle must spawn at the new center.
  function setProfile(next) {
    profile = { ...DEFAULT_PROFILE, ...(next || {}) };
    layoutArena();
    if (engine) engine.gravity.y = profile.gravity;
    if (ceilingBody) ceilingBody.collisionFilter.mask = profile.ceiling ? 0xFFFFFFFF : 0;
    // Walls and ceiling are normally dead (no carom, no spin transfer — see
    // init) so difficulty doesn't track screen width. Bounce mode needs them
    // live. The GROUND is deliberately left dead in every profile: in bounce
    // mode the floor is where the shot ends, so it must not throw the object
    // back up.
    if (leftWall)    leftWall.restitution    = profile.wallBounce;
    if (rightWall)   rightWall.restitution   = profile.wallBounce;
    if (ceilingBody) ceilingBody.restitution = profile.wallBounce;
    applyBodyMaterial();
    syncSideWalls();
    // Pad placement is seeded in seedTurn() so multiplayer peers share the same
    // target. Don't roll it here off the unseeded Math.random stream.
    buildObstacles(arenaH);
  }

  function applyBodyMaterial() {
    if (!bottle) return;
    const parts = [bottle, ...bottle.parts];
    for (const part of parts) {
      part.frictionAir = profile.frictionAir;
      part.friction    = profile.friction;
      part.restitution = profile.restitution;
    }
  }

  // ── PLINKO DROP (1/1000 easter egg) ────────────────────────────────────────
  // On the roll, the floor vanishes at the flick and the object falls through
  // into a plinko board below the table. Center slot = automatic game win;
  // mid slots zap every opponent −1 life; outer slots = +2 lives. Seed-derived
  // but main.js disables it for online games (it rewrites lives directly).
  // Always 5 slots. The board can be WIDER than the screen (the camera zooms
  // out to frame it), so slots stay big enough for the ball on any device.
  const PLINKO_KINDS = ['lives', 'zap', 'win', 'zap', 'lives'];
  let plinkoEnabled = true;
  let plinkoForced = false;   // secret test trigger — consumed by the next flick
  let plinko = null;          // { left, right, top, bottom, pegs, dividers, slots }
  let plinkoBodies = [];
  let plinkoSettle = 0;
  let plinkoNudges = 0;       // "machine shakes" applied to a wedged object

  function setPlinkoEnabled(v) { plinkoEnabled = !!v; }
  function forcePlinko() { plinkoForced = true; }

  function startPlinko() {
    clearPlinko();
    // Bank-shot furniture (alien wedges/saucers) would steal the drop — clear
    // them for this throw. Next turn's setProfile/buildObstacles rebuilds.
    clearObstacles();
    // Board width is independent of the screen — at least 640 so five slots
    // stay ball-sized; the camera pulls back to show all of it.
    const bw = Math.max(640, Math.min(canvasW - 36, 980));
    const left = canvasW / 2 - bw / 2;
    const right = left + bw;
    const top = groundY + 26;
    // The flipped object is BIG (~74×140), so peg gaps and slots must be wide
    // enough for it to tumble through — this is bottle plinko, not puck plinko.
    const rows = 4, rowGap = 82, slotH = 130;
    const bottom = top + 42 + rows * rowGap + slotH;
    const pegs = [];
    const dividers = [];
    const opts = { isStatic: true, label: 'plinko', friction: 0.05, restitution: 0.55 };

    // Offset peg grid — the object becomes a ball (r=34) for the drop, so
    // ~110px gaps give real plinko action without wedging.
    const cols = Math.max(3, Math.min(10, Math.floor(bw / 112)));
    for (let r = 0; r < rows; r++) {
      const y = top + 42 + r * rowGap;
      const n = cols + (r % 2 ? 0 : 1);
      for (let i = 0; i < n; i++) {
        const x = r % 2
          ? left + (bw / (n + 1)) * (i + 1)
          : left + (bw / n) * (i + 0.5);
        if (x < left + 20 || x > right - 20) continue;
        pegs.push({ x, y, r: 9 });
        plinkoBodies.push(Bodies.circle(x, y, 9, opts));
      }
    }
    // Dividers get a pointed cap so the object sheds off instead of balancing.
    const kinds = PLINKO_KINDS;
    for (let k = 1; k < kinds.length; k++) {
      const x = left + (bw / kinds.length) * k;
      dividers.push({ x, y0: bottom - slotH, y1: bottom });
      plinkoBodies.push(Bodies.rectangle(x, bottom - slotH / 2, 10, slotH, opts));
      plinkoBodies.push(Bodies.circle(x, bottom - slotH, 9, opts));
    }
    plinkoBodies.push(Bodies.rectangle(canvasW / 2, bottom + 22, Math.max(canvasW, bw) * 2, 44, {
      ...opts, friction: 0.8, restitution: 0.02,
    }));
    // The board brings its own side rails (it may be wider than the arena).
    const railH = bottom + 500;
    plinkoBodies.push(Bodies.rectangle(left - 24, bottom - railH / 2, 48, railH, opts));
    plinkoBodies.push(Bodies.rectangle(right + 24, bottom - railH / 2, 48, railH, opts));
    const slots = kinds.map((kind, i) => ({
      kind,
      x0: left + (bw / kinds.length) * i,
      x1: left + (bw / kinds.length) * (i + 1),
    }));
    World.add(world, plinkoBodies);

    // The floor "disappears", and the arena walls/ceiling go dead too — the
    // board's own rails take over (the board may extend past the screen edges).
    // Alien mode keeps a live ceiling for bank shots; kill it for the drop so
    // the ball isn't trapped bouncing under the roof.
    ground.collisionFilter.mask = 0;
    if (leftWall)  leftWall.collisionFilter.mask = 0;
    if (rightWall) rightWall.collisionFilter.mask = 0;
    if (ceilingBody) ceilingBody.collisionFilter.mask = 0;

    plinko = { left, right, top, bottom, slotH, pegs, dividers, slots,
               drift: rand() < 0.5 ? -1 : 1 };
    plinkoSettle = 0;
    plinkoNudges = 0;

    // The object "curls up" into a ball for the drop — a bottle-shaped body
    // bridges pegs and wedges, a ball plinkos properly. The renderer draws
    // the character at ~60% scale so it reads as the same object tumbling.
    const pos = { x: bottle.position.x, y: bottle.position.y };
    World.remove(world, bottle);
    bottle = Bodies.circle(pos.x, pos.y, 34, {
      label: 'bottle',
      density: 0.008,
      friction: 0.15,
      frictionAir: 0.004,
      restitution: 0.5,
    });
    World.add(world, bottle);
  }

  function clearPlinko() {
    for (const b of plinkoBodies) World.remove(world, b);
    plinkoBodies = [];
    plinko = null;
    plinkoSettle = 0;
    if (ground) ground.collisionFilter.mask = 0xFFFFFFFF;
    if (ceilingBody) ceilingBody.collisionFilter.mask = profile.ceiling ? 0xFFFFFFFF : 0;
    syncSideWalls();
  }

  function plinkoVerdict() {
    const bw = plinko.right - plinko.left;
    const n = plinko.slots.length;
    const i = Math.max(0, Math.min(n - 1,
      Math.floor((bottle.position.x - plinko.left) / (bw / n))));
    lastLandingInfo = {
      result: 'MAKE',
      tilt: null,
      perfect: false,
      reason: 'plinko',
      plinko: plinko.slots[i].kind,
      plinkoSlot: i,
      onCap: false,
      maxTilt: 0,
      padOffset: null,
    };
    return 'MAKE';
  }

  function getPlinko() { return plinko; }

  // ── Obstacles: deflector wedges + saucers (alien bank shot) ────────────────
  let deflectors = [];
  let saucers = [];      // { body, vx, phase, rx, ry }

  function clearObstacles() {
    for (const d of deflectors) World.remove(world, d);
    deflectors = [];
    for (const s of saucers) World.remove(world, s.body);
    saucers = [];
  }

  function addDeflector(cx, apexWorldY, halfW, height) {
    // fromVertices centers the body on the shape's centroid, which for this
    // triangle is height/6 above the middle — so the apex sits 2/3·height
    // below the centroid.
    const body = Bodies.fromVertices(cx, apexWorldY - (2 * height) / 3, [[
      { x: -halfW, y: -height / 2 },
      { x:  halfW, y: -height / 2 },
      { x: 0,      y:  height / 2 },
    ]], { isStatic: true, label: 'deflector', friction: 0, restitution: profile.wallBounce });
    if (body) {
      World.add(world, body);
      deflectors.push(body);
    }
  }

  function buildObstacles(h) {
    if (!world) return;
    clearObstacles();
    const arenaH = h || (groundY + 30);
    const compact = isCompactScreen();

    if (profile.deflector) {
      // Mobile: a single launch-spot wedge. Desktop: full count, flat-side
      // bolted to the ceiling so they read as roof teeth across a wide arena.
      const count = compact ? 1 : Math.max(1, profile.deflectorCount || 3);
      const halfW = compact ? 62 : 70;
      const height = compact ? 78 : 88;

      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const cx = WALL_INSET + 90 + t * Math.max(40, canvasW - WALL_INSET * 2 - 180);
        if (compact) {
          // Classic mid-arc deflector over the launch spot.
          const apexWorldY = groundY - 430;
          addDeflector(cx, apexWorldY, halfW, height);
        } else {
          // Roof-anchored: flat base sits just under the ceiling (y≈0), apex
          // hangs down into the flight path. Spread evenly across the arena.
          const roofY = 6;                          // flat top near ceiling
          const apexWorldY = roofY + height;        // apex = base + full height
          addDeflector(cx, apexWorldY, halfW - (i === 1 ? 0 : 8), height);
        }
      }
    }

    // Phones: fewer saucers so the court isn't a UFO traffic jam when the
    // camera is pulled back to show the whole bank-shot arena.
    const saucerN = compact
      ? Math.min(profile.saucerCount, 3)
      : profile.saucerCount;
    for (let i = 0; i < saucerN; i++) {
      const lane = (i + 0.5) / Math.max(1, saucerN);
      const x = WALL_INSET + 50 + lane * Math.max(40, canvasW - WALL_INSET * 2 - 100);
      const y = groundY - 150 - (i % 4) * 70 - (i % 3) * 18;
      const rx = 38 + (i % 3) * 4, ry = 16 + (i % 2) * 3;
      const body = Bodies.rectangle(x, y, rx * 2, ry * 2, {
        label: 'saucer',
        frictionAir: 0.05,
        friction: 0,
        restitution: Math.max(0.7, profile.wallBounce),
        density: 0.0011,
      });
      World.add(world, body);
      saucers.push({
        body,
        vx: (i % 2 ? 1 : -1) * (0.85 + 0.55 * (i % 4)),
        phase: i * 1.3,
        rx, ry,
      });
    }
  }

  function updateSaucers(dt) {
    if (!saucers.length) return;
    const gy = engine.gravity.y * engine.gravity.scale;
    for (const s of saucers) {
      const b = s.body;
      Body.applyForce(b, b.position, { x: 0, y: -b.mass * gy });
      const bob = Math.sin(arenaTime * 1.6 + s.phase) * 0.28;
      const lo = (sideWallsEnabled ? WALL_INSET : 8) + s.rx + 8;
      const hi = canvasW - (sideWallsEnabled ? WALL_INSET : 8) - s.rx - 8;
      if (b.position.x < lo) s.vx = Math.abs(s.vx);
      if (b.position.x > hi) s.vx = -Math.abs(s.vx);
      Body.setVelocity(b, {
        x: b.velocity.x + (s.vx - b.velocity.x) * 0.04,
        y: b.velocity.y * 0.96 + bob * 0.3,
      });
      Body.setAngularVelocity(b, b.angularVelocity * 0.9);
    }
  }

  function getObstacles() {
    return {
      theme: 'alien',
      deflectors: deflectors.map((d) => ({ vertices: d.vertices.map((v) => ({ x: v.x, y: v.y })) })),
      // Back-compat single deflector for older renderers
      deflector: deflectors[0]
        ? { vertices: deflectors[0].vertices.map((v) => ({ x: v.x, y: v.y })) }
        : null,
      saucers: saucers.map((s) => ({
        x: s.body.position.x, y: s.body.position.y,
        angle: s.body.angle, rx: s.rx, ry: s.ry,
      })),
    };
  }

  // Randomize the pad's spot each turn so it isn't the same shot every time.
  // Call only after seedTurn()/seedRng so multiplayer peers place identically.
  function placeTarget(explicitX) {
    if (!profile.landOnTarget || !canvasW) { targetX = null; return; }
    targetHW = currentTargetHalfWidth();
    const margin = (sideWallsEnabled ? WALL_INSET : 8) + targetHW + 16;
    if (explicitX != null && Number.isFinite(explicitX)) {
      targetX = Math.max(margin, Math.min(canvasW - margin, explicitX));
      return;
    }
    const span = Math.max(0, canvasW - margin * 2);
    targetX = margin + rand() * span;
  }

  function getTarget() {
    return targetX == null ? null : {
      x: targetX,
      halfWidth: targetHW,
      hitHalfWidth: currentHitHalfWidth(),
      style: 'pad',
    };
  }

  function overTarget() {
    if (!profile.landOnTarget || targetX == null || !bottle) return false;
    const hitHW = currentHitHalfWidth();
    // Strict: bottle CENTER must sit inside the hit radius (alien).
    // Generous: any bounds overlap with the hit radius.
    if (profile.strictTarget) {
      return Math.abs(bottle.position.x - targetX) <= hitHW;
    }
    return bottle.bounds.max.x >= targetX - hitHW &&
           bottle.bounds.min.x <= targetX + hitHW;
  }

  // ── Liquid / sand oscillator ───────────────────────────────────────────────
  // Closed liquids use slosh/vel. Hourglass sand ALSO tracks how much of the
  // grain sits in the local-bottom bulb (sandBottom 0..1) and drains through
  // the neck when the glass is upright or inverted — never when sideways.
  const SAND_FLOW_RATE = 0.42;   // fraction of bulb per second at full upright
  const liquid = {
    slosh: 0,
    vel: 0,
    settleTimer: 0,
    // Most sand starts in the top bulb so the hourglass visibly drains in play.
    sandBottom: 0.18,
    sandFlow: 0,       // signed: + drains top→bottom, − drains bottom→top

    update(bottleAngVel, dt, bottleAngle) {
      const spring  = -0.10 * this.slosh;
      const drive   =  0.40 * bottleAngVel;
      const damping = -0.08 * this.vel;
      this.vel   += (spring + drive + damping) * dt;
      this.slosh += this.vel * dt;
      this.slosh  = Math.max(-1, Math.min(1, this.slosh));

      this.settleTimer = Math.abs(this.vel) < 0.10
        ? this.settleTimer + dt
        : 0;

      // Sand drain: cos(angle) ≈ +1 upright, −1 inverted, 0 on its side.
      const a = bottleAngle == null ? 0 : bottleAngle;
      const uprightness = Math.cos(a);
      const aligned = Math.abs(uprightness) > 0.35;
      const room = uprightness > 0
        ? (1 - this.sandBottom)   // can still accept sand in bottom
        : this.sandBottom;        // can still leave the bottom
      if (aligned && room > 0.001) {
        const step = SAND_FLOW_RATE * uprightness * dt;
        this.sandBottom = Math.max(0, Math.min(1, this.sandBottom + step));
        this.sandFlow = uprightness * Math.min(1, room * 8);
      } else {
        this.sandFlow *= Math.max(0, 1 - 6 * dt); // stream fades when tipped over
        if (Math.abs(this.sandFlow) < 0.02) this.sandFlow = 0;
      }
    },

    renderOffset() { return this.slosh * 13; },
    isSettled()    { return this.settleTimer > 0.25; },
    reset() {
      this.slosh = 0; this.vel = 0; this.settleTimer = 0;
      this.sandBottom = 0.18; this.sandFlow = 0;
    },
  };

  function normalizeSignedAngle(a) {
    let angle = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (angle > Math.PI) angle -= 2 * Math.PI;
    return angle;
  }

  function recordLanding(result, tilt, reason) {
    let padOffset = null;
    if (profile.landOnTarget && targetX != null && bottle) {
      const hitHW = currentHitHalfWidth();
      padOffset = hitHW > 0 ? Math.abs(bottle.position.x - targetX) / hitHW : null;
    }
    // Bounce-mode MAKEs pass tilt=0; use pad centering for "perfect" instead so
    // every alien pad hit isn't celebrated as Perfect / Bullseye.
    let perfect = false;
    if (result === 'MAKE') {
      if (profile.floorResolve) {
        perfect = padOffset != null && padOffset <= 0.22;
      } else {
        perfect = tilt != null && tilt <= PERFECT_ANGLE;
      }
    }
    lastLandingInfo = {
      result,
      tilt,
      perfect,
      reason,
      onCap: reason === 'cap',
      maxTilt: profile.floorResolve ? 0 : maxGroundedTilt,
      padOffset,
    };
    return result;
  }

  function touchingFloor() {
    return !!bottle && bottle.bounds.max.y >= groundY - GROUND_TOUCH_PX;
  }

  function checkLanding() {
    if (!bottle) return null;

    // Plinko drop: the only verdict is which slot it settles in.
    if (plinko && launched) {
      flightFrames++;
      if (flightFrames > 1500) return plinkoVerdict();   // ~25s failsafe
      const speed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
      const inPegZone = bottle.position.y < plinko.bottom - plinko.slotH - 20;
      if (inPegZone) {
        // A bottle-sized puck loves to bridge two pegs and doze off, so the
        // machine "shakes" while it's slow up here: a continuous seeded drift
        // push (reversing periodically if it stays stuck) until it drops into
        // the slot zone. Verdict only happens down in the slots.
        if (speed < 2.5) {
          plinkoNudges++;   // shake-frame counter
          const dir = plinko.drift * (Math.floor(plinkoNudges / 70) % 2 === 0 ? 1 : -1);
          Body.setVelocity(bottle, {
            x: bottle.velocity.x + dir * 0.45,
            y: bottle.velocity.y - 0.12,
          });
        }
        if (plinkoNudges > 700) return plinkoVerdict();  // pathological wedge
        plinkoSettle = 0;
        return null;
      }
      if (speed < 1.2 && Math.abs(bottle.angularVelocity) < 0.05) plinkoSettle++;
      else plinkoSettle = 0;
      if (plinkoSettle > 40) return plinkoVerdict();
      return null;
    }

    // Bounce mode: first contact / slide-on is the verdict (alien profile).
    if (profile.floorResolve && launched && wasAirborne) {
      const grounded = touchingFloor();

      if (!floorTouched) {
        if (bottle.bounds.max.y < groundY - 2) return null;
        floorTouched = true;
        slideFrames = 0;
        for (const part of [bottle, ...bottle.parts]) {
          part.restitution = 0.02;
          part.friction = 0.35;
        }
        if (overTarget()) return recordLanding('MAKE', 0, 'on-target');
        if (!profile.landOnTarget || targetX == null) return recordLanding('MISS', null, 'off-target');
        if (!profile.allowSlideIn) return recordLanding('MISS', null, 'off-target');
        return null;
      }

      slideFrames++;
      if (profile.allowSlideIn && grounded && overTarget()) return recordLanding('MAKE', 0, 'slid-on');
      const speed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
      if ((grounded && speed < 0.35 && slideFrames > 20) || slideFrames > 360) {
        return recordLanding('MISS', null, 'off-target');
      }
      return null;
    }

    // Absolute soft-lock guard: once the bottle has left the floor, something
    // MUST resolve within ~10s (off-world, perpetual bounce, etc.).
    if (launched && wasAirborne) {
      flightFrames++;
      if (flightFrames > ABS_MISS_FRAMES) return recordLanding('MISS', null, 'timeout');
    }

    const angVel   = Math.abs(bottle.angularVelocity);
    const linSpeed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
    // Touch the table via AABB bottom — COM can sit well above the floor when
    // the bottle is inverted on its neck / resting on a tall corner.
    const grounded = touchingFloor();

    if (!grounded) {
      groundedFrames = 0;
      angleWin = [];
      return null;
    }

    groundedFrames++;

    {
      let a = ((bottle.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (a > Math.PI) a -= 2 * Math.PI;
      const t = Math.abs(a);
      if (t > maxGroundedTilt) maxGroundedTilt = t;
    }

    if (groundedFrames > profile.missCapFrames) return recordLanding('MISS', null, 'timeout');

    if (angVel < SETTLE_ANG_VEL && linSpeed < SETTLE_LIN_SPD) {
      angleWin.push(bottle.angle);
      if (angleWin.length > SETTLE_FRAMES) angleWin.shift();
      let lo = Infinity, hi = -Infinity;
      for (const a of angleWin) { if (a < lo) lo = a; if (a > hi) hi = a; }
      if (angleWin.length >= SETTLE_FRAMES && (hi - lo) < SETTLE_RANGE) {
        if (profile.requireFlip && !hasFlipped) return recordLanding('MISS', null, 'underrotated');
        const angle = normalizeSignedAngle(bottle.angle);
        const tilt = Math.abs(angle);
        const invErr = Math.abs(tilt - Math.PI);
        if (tilt < MAKE_ANGLE) {
          return recordLanding('MAKE', tilt, 'upright');
        }
        // Rare upside-down / on-cap settle — worth 2 in the rules layer.
        if (invErr < CAP_WINDOW) {
          return recordLanding('MAKE', tilt, 'cap');
        }
        if (tilt >= FALLEN_ANGLE) return recordLanding('MISS', tilt, 'fallen');
        // Fully at rest but leaning hard (propped on a wall / teetered pose).
        // A tipped bottle can still slowly right itself, so give it a moment —
        // but a sustained settled lean is a MISS, not a stall until timeout.
        leanFrames++;
        if (leanFrames > LEAN_MISS_FRAMES) return recordLanding('MISS', tilt, 'leaning');
      } else {
        leanFrames = 0;
      }
    } else {
      angleWin = [];
      leanFrames = 0;
    }

    return null;
  }

  function createBottle() {
    const cx = canvasW / 2;
    const cy = groundY - 76;

    const liq  = Bodies.rectangle(cx, cy + 38, 74, 70, { density: 0.018 });
    const body = Bodies.rectangle(cx, cy - 18, 70, 50, { density: 0.0015 });
    const neck = Bodies.rectangle(cx, cy - 62, 44, 36, { density: 0.0004 });

    const b = Body.create({
      parts: [liq, body, neck],
      frictionAir: profile.frictionAir,
      friction:    profile.friction,
      restitution: profile.restitution,
      label: 'bottle',
    });

    return b;
  }

  // The table surface sits this far above the canvas bottom. v87: raised from
  // a fixed 30px so the table reads as a real surface, scaling with screen.
  function tableInset(h) { return Math.max(64, Math.round(h * 0.13)); }

  function init(w, h, bottomInset = 0) {
    viewW = w;
    viewH = h;
    viewBottomInset = bottomInset;
    canvasW = w;
    arenaH  = h;
    groundY = h - tableInset(h) - bottomInset;
    ceilingY = 0;
    acc = 0;

    engine = Engine.create({ gravity: { y: profile.gravity, scale: 0.001 } });
    world  = engine.world;

    // Extra-wide ground so open-arena / expanded-court shots still have a floor.
    ground = Bodies.rectangle(w / 2, groundY + 25, Math.max(w * 8, 6000), 50, {
      isStatic: true,
      label: 'ground',
      friction: 0.9,
      restitution: 0.01,
    });

    const wallOpts = { isStatic: true, label: 'wall', friction: 0, restitution: 0 };
    leftWall  = Bodies.rectangle(WALL_INSET - 20, h / 2, 40, h * 5, wallOpts);
    rightWall = Bodies.rectangle(w - WALL_INSET + 20, h / 2, 40, h * 5, wallOpts);

    ceilingBody = Bodies.rectangle(w / 2, -20, Math.max(w * 8, 6000), 40, {
      isStatic: true, label: 'ceiling', friction: 0, restitution: 0.85,
      collisionFilter: { mask: profile.ceiling ? 0xFFFFFFFF : 0 },
    });

    World.add(world, [ground, leftWall, rightWall, ceilingBody]);
    layoutArena(); // honor any pre-set bank-shot expand profile
    syncSideWalls();

    // Wall / ceiling / furniture hits → impact juice (SFX + sparks). Ground
    // thuds are positional in stepOnce so we get exactly one per landing.
    Events.on(engine, 'collisionStart', (ev) => {
      if (!onImpact || !launched || !bottle) return;
      for (const { bodyA, bodyB } of ev.pairs) {
        const aIsBottle = bodyA === bottle || bodyA.parent === bottle;
        const bIsBottle = bodyB === bottle || bodyB.parent === bottle;
        if (aIsBottle === bIsBottle) continue;
        const other = aIsBottle ? bodyB : bodyA;
        const label = other.label;
        if (label !== 'wall' && label !== 'ceiling' &&
            label !== 'deflector' && label !== 'saucer') continue;
        const speed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
        if (speed < 1.8) continue;
        const type = (label === 'deflector' || label === 'saucer') ? 'wall' : label;
        onImpact(type, speed, bottle.position.x, bottle.position.y);
      }
    });

    resetBottle();
  }

  function reflow(w, h, bottomInset = 0) {
    if (!engine) return;
    viewW = w;
    viewH = h;
    viewBottomInset = bottomInset;
    layoutArena();
    buildObstacles(h);
    if (profile.landOnTarget) {
      targetHW = currentTargetHalfWidth();
      const margin = (sideWallsEnabled ? WALL_INSET : 8) + targetHW + 16;
      if (targetX != null) targetX = Math.max(margin, Math.min(canvasW - margin, targetX));
    }
  }

  function resetBottle() {
    if (bottle) World.remove(world, bottle);
    if (engine) engine.gravity.y = profile.gravity;   // clear any moon throw
    if (plinko) clearPlinko();                        // restore the floor
    groundedFrames = 0;
    angleWin       = [];
    totalRotation  = 0;
    hasFlipped     = false;
    launchAngle    = 0;
    hasLanded      = false;
    capSticky      = false;
    lastLandingInfo = null;
    lastFlickInfo  = null;
    launched       = false;
    leanFrames     = 0;
    capThrowArmed  = false;
    wasAirborne    = false;
    floorTouched   = false;
    slideFrames    = 0;
    maxGroundedTilt = 0;
    flightFrames   = 0;
    groundImpactSent = false;
    liquid.reset();
    acc = 0;

    bottle = createBottle();
    World.add(world, bottle);
    applyBodyMaterial();
  }

  // Seed arena RNG for this turn (pad placement + future furniture). Must run
  // AFTER setProfile/resetBottle and BEFORE the player aims, so peers that
  // share turnCounter + playerIndex place the same pad without a net message.
  function seedTurn(seed) {
    seedRng((seed >>> 0) || 1);
    arenaTime = 0;
    placeTarget();
  }

  // Pass an explicit `seed` to replay a flick's exact randomness (multiplayer);
  // otherwise a fresh seed is drawn and recorded in lastFlickInfo.
  // Does NOT re-roll the pad — that was seeded in seedTurn().
  function applyFlick(vx, vy, seed) {
    const s = (seed !== undefined && seed !== null
      ? seed
      : Math.floor(Math.random() * 0xffffffff)) >>> 0;
    seedRng(s);

    // Easter egg: ~1/200 throws happen on the moon — gravity drops to 42% for
    // this one flight. Seed-derived so online peers replaying the same seed
    // float identically. Bank-shot profiles (alien) keep normal gravity: their
    // furniture and pad tuning assume it.
    const moon = !profile.floorResolve && (s % 199) === 42;
    if (engine) engine.gravity.y = profile.gravity * (moon ? 0.42 : 1);

    // Easter egg: ~1/1000 flips the floor vanishes and this throw drops into
    // a plinko board (see startPlinko). Works in bank-shot/alien mode too —
    // checkLanding prioritizes the plinko slot verdict over floorResolve, and
    // startPlinko clears alien furniture so pegs own the drop. Secret trigger
    // (name "plinko" / typing "plinko") forces the next one. Still offline-only
    // (main.js disables it online — prizes rewrite lives).
    const plinkoRoll = plinkoForced || (plinkoEnabled && (s % 997) === 123);
    plinkoForced = false;
    if (plinkoRoll) startPlinko();

    // CAP THROW (~1/100, seed-rolled): normal spin tuning lands completed
    // flips upright, so an inverted touchdown never occurs naturally. These
    // throws over-rotate by ~an extra half turn so the object genuinely
    // arrives upside down, then the cap-sticky assist below can balance it
    // on the cap for the ×2. A cap throw that arrives badly just misses.
    capThrowArmed = !profile.floorResolve && !plinkoRoll && (s % 101) === 55;

    const upSpeed = Math.max(0, -vy);
    const power   = Math.min(upSpeed / POWER_SPEED, 1.0);

    const jSpin   = 1 + (rand() - 0.5) * 0.10;   // mild spin chaos
    const jLaunch = 1 + (rand() - 0.5) * 0.06;   // mild height chaos
    const jDrift  = (rand() - 0.5) * 1.1;        // mild sideways chaos

    // Slightly lower arcs than the "harder/higher/wilder" feel (was 16 + power*5).
    const launchY = -(15.2 + power * 4.7) * jLaunch * profile.launchScale;
    let launchX = Math.max(-profile.horizMax,
      Math.min(profile.horizMax, vx / profile.horizDivisor)) + jDrift;

    if (profile.minHorizRatio > 0) {
      const minX = Math.abs(launchY) * profile.minHorizRatio;
      if (Math.abs(launchX) < minX) launchX = (launchX >= 0 ? 1 : -1) * minX;
    }

    const dir  = vx >= 0 ? 1 : -1;
    const spin = dir * (spinBase + power * spinRange) * jSpin * profile.spinScale *
      (capThrowArmed ? 1.52 : 1);

    lastFlickInfo = {
      upSpeed: Math.round(upSpeed),
      power: +power.toFixed(2),
      spin: +spin.toFixed(3),
      seed: s,
      moon,
      plinko: plinkoRoll,
      vx: Math.round(vx),
      vy: Math.round(vy),
    };
    launchAngle = bottle.angle;
    launched = true;
    wasAirborne = false;
    flightFrames = 0;
    groundedFrames = 0;
    angleWin = [];
    lastLandingInfo = null;
    Body.setVelocity(bottle, { x: launchX, y: launchY });
    Body.setAngularVelocity(bottle, spin);
  }

  function stepOnce() {
    Engine.update(engine, FIXED_DT * 1000);
    arenaTime += FIXED_DT;

    if (launched && !wasAirborne && bottle.bounds.max.y < groundY - 24) wasAirborne = true;

    // One ground thud per flick (positional — Matter ground collisions are dead
    // / masked in bounce mode, so we can't rely on collisionStart for the floor).
    if (onImpact && launched && wasAirborne && !groundImpactSent && !plinko &&
        bottle.bounds.max.y >= groundY - GROUND_TOUCH_PX && bottle.velocity.y > 0.5) {
      groundImpactSent = true;
      const speed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
      onImpact('ground', speed, bottle.position.x, groundY);
    }

    if (!hasFlipped) {
      totalRotation = Math.abs(bottle.angle - launchAngle);
      if (totalRotation >= 5.6) hasFlipped = true;
    }

    // Landing kick is for normal flips (liquid slosh punch). Bank-shot editions
    // accumulate "hasFlipped" from wall caroms and must not get a random shove.
    // v78: softened — the old kick tipped a lot of near-makes into misses.
    if (!plinko && !profile.floorResolve && hasFlipped && !hasLanded &&
        bottle.velocity.y > 0 && bottle.position.y >= groundY - 55) {
      hasLanded = true;
      const a = normalizeSignedAngle(bottle.angle);
      const invErr = Math.abs(Math.abs(a) - Math.PI);
      // Rare cap-stick lottery: touch down roughly inverted → sometimes the
      // neck/cap grips and we damp hard toward ±π (~1-in-100 flips overall).
      // Seed-rolled cap throws (over-spun to arrive inverted) stick whenever
      // they get anywhere close.
      if (capThrowArmed && invErr < 1.35) capSticky = true;
      else if (invErr < CAP_ZONE && rand() < CAP_STICK_CHANCE) capSticky = true;
      const kickScale = (capSticky || invErr < CAP_WINDOW) ? 0.25 : 1;
      const kick = (liquid.vel * 0.028 + (rand() - 0.5) * 0.06) * kickScale;
      Body.setAngularVelocity(bottle, bottle.angularVelocity + kick);
    }

    // Cap-sticky assist: pull gently toward fully inverted and kill spin so a
    // rare on-cap balance can actually settle instead of tippling over.
    if (capSticky && launched && !profile.floorResolve && !plinko) {
      const a = normalizeSignedAngle(bottle.angle);
      const target = a >= 0 ? Math.PI : -Math.PI;
      const pull = (target - a) * 0.085;
      Body.setAngularVelocity(bottle, bottle.angularVelocity * 0.72 + pull);
    }

    liquid.update(bottle.angularVelocity, FIXED_DT, bottle.angle);
    updateSaucers(FIXED_DT);
  }

  function step(dt) {
    acc += dt;
    if (acc > 0.25) acc = 0.25;
    while (acc >= FIXED_DT) {
      stepOnce();
      acc -= FIXED_DT;
    }
  }

  // Optional extra camera pullback AFTER the expand-fit (usually 1 / unset).
  function profileZoomMul() {
    const compact = isCompactScreen();
    const z = compact
      ? (profile.mobileArenaZoom != null ? profile.mobileArenaZoom : profile.arenaZoom)
      : profile.arenaZoom;
    if (z == null || !(z > 0)) return 1;
    return Math.max(0.35, Math.min(1, z));
  }

  // Wall-to-wall fit for an expanded physics world (+ optional zoom mul).
  function courtFitZoom() {
    const vw = screenW() || canvasW;
    if (!vw || !canvasW) return profileZoomMul();
    const fit = Math.min(1, vw / canvasW);
    return Math.max(0.35, Math.min(1, fit * profileZoomMul()));
  }

  // Camera helper: when the bottle leaves the frame (mobile open arena), the
  // renderer zooms out so the shot stays visible. Expanded bank-shot courts
  // (alien) size the PHYSICS world past the screen and fit wall-to-wall so the
  // phone stays full-bleed while caroms have real room to travel.
  function getViewHint() {
    const cx = canvasW / 2;
    const cy = groundY / 2;
    const vw = screenW() || canvasW;
    const vh = viewH || arenaH || groundY;
    const expanded = canvasW > vw + 1 || ceilingY < -1;
    // Plinko drop: frame the whole board (plus the object) — this is what
    // makes the camera "zoom out" as the floor opens up.
    if (plinko && bottle) {
      const minX = Math.min(bottle.bounds.min.x - 40, plinko.left - 70);
      const maxX = Math.max(bottle.bounds.max.x + 40, plinko.right + 70);
      const minY = Math.min(bottle.bounds.min.y - 60, groundY - 280, ceilingY);
      const maxY = Math.max(bottle.bounds.max.y, plinko.bottom + 90);
      const spanX = maxX - minX, spanY = maxY - minY;
      // Fit to the SCREEN (not the possibly-expanded physics world).
      const zoom = Math.max(0.2,
        Math.min(1, vw / spanX, vh / Math.max(spanY, 1)) * 0.88);
      return {
        openArena,
        sideWalls: false,   // arena walls are dead + the board has its own rails
        zoom,
        camX: (minX + maxX) / 2,
        camY: (minY + maxY) / 2,
        worldW: canvasW,
        worldH: plinko.bottom + 90,
      };
    }
    // Expanded / walled courts: fit the physics world wall-to-wall and bias
    // the camera through the playable air column (ceiling → table).
    const courtZoom = courtFitZoom();
    const courtCamY = expanded ? (groundY + ceilingY) * 0.52 : cy;
    if (!bottle) {
      return {
        openArena, sideWalls: sideWallsEnabled,
        zoom: openArena ? 1 : courtZoom,
        camX: cx, camY: courtCamY,
        worldW: canvasW,
        worldH: groundY + 30,
        ceilingY,
        courtFrame: expanded,
      };
    }
    if (!openArena) {
      return {
        openArena: false,
        sideWalls: sideWallsEnabled,
        zoom: courtZoom,
        camX: cx,
        camY: courtCamY,
        worldW: canvasW,
        worldH: groundY + 30,
        ceilingY,
        courtFrame: expanded,
      };
    }
    const pad = 48;
    const minX = Math.min(0, bottle.bounds.min.x - pad);
    const maxX = Math.max(canvasW, bottle.bounds.max.x + pad);
    const minY = Math.min(ceilingY, bottle.bounds.min.y - pad);
    const maxY = Math.max(groundY + 30, bottle.bounds.max.y + 20);
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    // Open-arena follow-cam fits to the SCREEN.
    let z = Math.max(0.40, Math.min(1, vw / spanX, (groundY + 30 - ceilingY) / Math.max(spanY, 1)));
    return {
      openArena,
      sideWalls: sideWallsEnabled,
      zoom: z,
      camX: (minX + maxX) / 2,
      camY: (minY + maxY) / 2,
      worldW: canvasW,
      worldH: groundY + 30,
    };
  }

  function getBottle()  { return bottle; }
  function getLiquid()  { return liquid; }
  function getGroundY() { return groundY; }
  function getLastLandingInfo() { return lastLandingInfo; }
  function getLastFlickInfo() { return lastFlickInfo; }
  function isOpenArena() { return openArena; }

  // Force a verdict from the network authority (hybrid lockstep).
  function forceLanding(result, info) {
    lastLandingInfo = {
      result,
      tilt: info && info.tilt != null ? info.tilt : null,
      perfect: !!(info && info.perfect),
      reason: (info && info.reason) || 'net-authority',
      onCap: !!(info && (info.onCap || info.reason === 'cap')),
      maxTilt: (info && info.maxTilt) || 0,
    };
    return result;
  }

  return {
    init, reflow, step, resetBottle, applyFlick, checkLanding, forceLanding,
    getBottle, getLiquid, getGroundY, getLastLandingInfo, getLastFlickInfo,
    setProfile, getTarget, getObstacles, getViewHint, isOpenArena, placeTarget,
    seedTurn, setPlinkoEnabled, forcePlinko, getPlinko, setFeel,
    getFeel: () => feelMode, setImpactCallback,
  };
})();
