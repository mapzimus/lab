// physics.js — Matter.js world, bottle body, liquid sim

const Physics = (() => {
  const { Engine, Bodies, Body, World, Events, Constraint } = Matter;

  let engine, world, bottle, ground, leftWall, rightWall, ceilingBody;
  let groundedFrames = 0;
  let angleWin = [];   // sliding window of recent angles (settle detection)
  let totalRotation = 0, hasFlipped = false, launchAngle = 0, hasLanded = false;
  let requiredRotation = 5.6; // ordinary tolerance; Double Flip requires two full turns
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

  // The event module is deliberately resolved lazily. Production loads it
  // before physics.js, while headless/replay harnesses may install it later.
  function eventSystem() {
    return typeof globalThis !== 'undefined' ? globalThis.FlipgameV111PhysicsEvents || null : null;
  }
  let eventController = null;
  let activeEventDefinition = null;
  let activeEventMetadata = null;
  let eventRuntime = null;
  let eventBodies = [];
  let eventConstraints = [];
  let mirrorBottle = null;
  let mitosisBottle = null;
  let fizzCap = null;
  let capTossCap = null;
  let pendingReflow = null;
  let landingPhase = 'resolved';
  let firstContactMs = null;
  let settlingStartedMs = null;
  let contactCount = 0;
  let bounceCount = 0;
  let simElapsedMs = 0;
  let previousTouching = false;
  let eventResultMetadata = null;

  // Event-only randomness never advances the trajectory stream below. This is
  // important for replay: registering a new visual/reward must not move a
  // bottle's jitter, target, or landing-kick draws.
  let eventRngState = 1;
  function seedEventRng(seed) { eventRngState = (seed >>> 0) || 1; }
  function randEvent() {
    eventRngState = (eventRngState + 0x9e3779b9) >>> 0;
    let t = eventRngState;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  }

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
  // v99: require a longer, tighter stillness window. The looser v78 values could
  // mistake the slow point of a rocking bottle for its final pose and call MISS
  // before it finished righting itself.
  const SETTLE_FRAMES   = 22;    // frames of stillness required to read the pose
  const SETTLE_RANGE    = 0.030; // rad — max angle spread across that window
  const MIN_GROUNDED_FRAMES = 30; // never judge during the first 0.5s after contact
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
  const MISS_CAP_FRAMES = 600;   // ~10s grounded with no verdict → final-pose fallback
  const ABS_MISS_FRAMES = 900;   // ~15s after leaving the floor → forced MISS no matter what
  const SETTLE_ANG_VEL  = 0.010; // "at rest" spin threshold
  const SETTLE_LIN_SPD  = 7.0;   // "at rest" slide threshold
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

  // Ultra-rare seeded events. These use an isolated integer hash instead of
  // consuming the physics RNG, so adding an event never changes an ordinary
  // throw's launch jitter or landing kick. Rarest checks run first and at most
  // one event can own a flick. Plinko is checked separately and always wins.
  const RARE_EVENT_ROLLS = [
    ['rainbow-corkscrew', 90], ['half-full', 110], ['power-launch', 140],
    ['fizz-jet', 170], ['golden-flip', 210], ['bouncy-bottle', 250],
    ['earthquake', 290], ['moon-gravity', 340], ['ice-slide', 450],
    ['alien-invasion', 550], ['gravity-slam', 650], ['trampoline', 750],
    ['wind-tunnel', 850], ['shrink-ray', 950], ['portal-pair', 1100],
    ['tether-swing', 1250], ['mitosis', 1400], ['double-flip', 1550],
    ['ceiling-flip', 1750], ['meteor-shower', 1950], ['magnet', 2200],
    ['heart-rush', 2450], ['black-hole', 2700], ['boomerang', 3000],
    ['roulette-table', 3400], ['rewind', 3800], ['plinko', 4500],
    ['mirror-match', 5000], ['cap-toss', 5500], ['life-drain', 6000],
  ].map((entry, index) => ({
    id: entry[0], odds: entry[1], salt: mixSeed(0x9e3779b9, Math.imul(index + 1, 0x45d9f3b)),
  }));
  const LEGACY_RARE_EVENT_ROLLS = [
    { id: 'life-drain', odds: 2000, salt: 0xa24baed5 },
    { id: 'heart-rush', odds: 900, salt: 0x9e3779b9 },
    { id: 'magnet', odds: 800, salt: 0x85ebca6b },
    { id: 'double-flip', odds: 700, salt: 0xc2b2ae35 },
    { id: 'wind-tunnel', odds: 600, salt: 0x27d4eb2f },
    { id: 'trampoline', odds: 500, salt: 0x165667b1 },
    { id: 'gravity-slam', odds: 400, salt: 0xd3a2646c },
    { id: 'ice-slide', odds: 300, salt: 0xfd7046c5 },
    { id: 'alien-invasion', odds: 250, salt: 0x4cf5ad43 },
    { id: 'moon-gravity', odds: 200, salt: 0xb55a4f09 },
    { id: 'power-launch', odds: 100, salt: 0x94d049bb },
    { id: 'rainbow-trail', odds: 50, salt: 0x369dea0f },
  ];
  function mixSeed(seed, salt) {
    let x = ((seed >>> 0) ^ (salt >>> 0)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    return (x ^ (x >>> 16)) >>> 0;
  }
  function adjustedOdds(odds, multiplier = 1) {
    const boost = Number.isFinite(multiplier) ? Math.max(1, multiplier) : 1;
    return Math.max(1, Math.floor(odds / boost));
  }
  function rareEventForSeed(seed, plinkoRoll = false, multiplier = 1, excludedEventIds = []) {
    if (plinkoRoll) return null;
    const events = eventSystem();
    if (events) {
      return events.rollId({
        mode: 'normal',
        oddsProfile: Number(multiplier) === 10 ? 'mr-howe' : 'normal',
        seed,
        excludedEventIds,
      });
    }
    const excluded = new Set(excludedEventIds);
    for (const event of LEGACY_RARE_EVENT_ROLLS) {
      if (excluded.has(event.id)) continue;
      if (mixSeed(seed, event.salt) % adjustedOdds(event.odds, multiplier) === 0) return event.id;
    }
    return null;
  }

  // Insanity replaces the normal rarity ladder with a flat 1-in-3 event roll.
  // The 29 eligible events each own four selection buckets; Plinko owns five,
  // making it exactly 25% heavier than any one of the others.
  // Life Drain is intentionally absent and can only be reached by its test name.
  const INSANITY_EVENTS = LEGACY_RARE_EVENT_ROLLS
    .filter((event) => event.id !== 'life-drain' && event.id !== 'plinko')
    .map((event) => event.id);
  const INSANITY_EVENT_SALT = 0x6c8e9cf5;
  const INSANITY_PICK_SALT = 0x3d20adea;
  function insanityEventForSeed(seed, excludedEventIds = []) {
    const events = eventSystem();
    if (events) return events.rollId({
      mode: 'insane', oddsProfile: 'normal', seed, excludedEventIds,
    });
    if (mixSeed(seed, INSANITY_EVENT_SALT) % 3 !== 0) return null;
    const excluded = new Set(excludedEventIds);
    const eligibleEvents = INSANITY_EVENTS.filter((id) => !excluded.has(id));
    const includePlinko = !excluded.has('plinko');
    const units = eligibleEvents.length * 4 + (includePlinko ? 5 : 0);
    if (units === 0) return null;
    const pick = mixSeed(seed, INSANITY_PICK_SALT) % units;
    if (includePlinko && pick < 5) return 'plinko';
    return eligibleEvents[Math.floor((pick - (includePlinko ? 5 : 0)) / 4)];
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
    alienPortal: false,   // bank once, then fly through a floating tractor ring
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
  let targetY = null;      // floating tractor-ring center in Alien mode
  let targetHW = 84;       // pad half-width actually in play (screen-scaled)
  let arenaTime = 0;

  // The profile's targetHalfWidth is tuned for a phone. On a big screen the
  // same pad is a sliver of the arena and the bank shot turns pixel-perfect,
  // so the pad grows with canvas width — but alien's base is now small, and
  // the scale-up is capped tighter so smartboards aren't a freebie.
  function currentTargetHalfWidth() {
    const base = profile.targetHalfWidth;
    if (profile.alienPortal) {
      return alienMetricsForViewport(viewW || canvasW, viewH || arenaH).ringRadius;
    }
    // Bank-shot pads stay nearly fixed — only a tiny grow on huge boards so
    // the make radius doesn't become a freebie on smartboards.
    if (base <= 60) {
      return Math.round(Math.max(base, Math.min(canvasW * 0.045, base * 1.25)));
    }
    return Math.round(Math.max(base, Math.min(canvasW * 0.115, base * 2.2)));
  }

  function currentHitHalfWidth() {
    let configuredScale = profile.hitScale == null ? 1 : profile.hitScale;
    if (profile.alienPortal) {
      const metrics = alienMetricsForViewport(viewW || canvasW, viewH || arenaH);
      // Keep the effective tractor-ring target proportional to the playable
      // court. The fixed legacy 0.86 inset made the same ring generous on the
      // expanded phone court but pixel-tight at tablet/desktop scale.
      configuredScale *= metrics.scale < 0.85 ? 0.85
        : (metrics.scale < 1.4 ? 1.15 : 1);
    }
    const scale = Math.max(0.2, Math.min(1, configuredScale));
    return Math.max(8, targetHW * scale);
  }
  let launched = false;    // a flick has been taken this turn
  let leanFrames = 0;      // consecutive settled frames in the lean dead zone
  let wasAirborne = false; // ...and the body actually left the floor
  let floorTouched = false; // bounce mode: first touchdown happened (slide window open)
  let slideFrames = 0;      // frames spent in the post-touchdown slide window
  let maxGroundedTilt = 0;  // display-only: worst |tilt| seen while grounded this flip
  let flightFrames = 0;     // frames since the bottle left the floor (absolute soft-lock guard)
  let rareEvent = null;     // seeded physics/gameplay/cosmetic event for this flick
  let temporaryAlien = false; // 1/250 Alien Invasion for a non-Alien object
  let bankHits = 0;          // portal only activates after a real carom
  let alwaysMagnetActive = false; // permanent Plinko prize owned by this flipper
  let rareImpulseUsed = false; // one-shot event impulse guard
  let rareEffectFrames = 0; // short-lived Ice Slide surface timer
  let rarePhase = 0;        // seeded wind phase; cosmetic randomness never touches physics RNG

  function screenW() { return viewW || canvasW || 0; }

  // One normalized matrix drives Alien geometry and forces on phones,
  // tablets, desktop boards, and ultrawide smartboards. Values are world-space
  // units derived from the shorter viewport edge, never device categories.
  function alienMetricsForViewport(width, height) {
    const w = Math.max(320, Number(width) || 1280);
    const h = Math.max(480, Number(height) || 800);
    const shortEdge = Math.min(w, h);
    const scale = Math.max(0.65, Math.min(2.7, shortEdge / 800));
    const compact = w < 900;
    return Object.freeze({
      width: w,
      height: h,
      scale,
      arenaExpandX: compact ? 1.45 : 1,
      arenaExpandY: compact ? 1.20 : 1,
      ringRadius: Math.round(Math.max(54, Math.min(210, shortEdge * 0.09))),
      attractionPerStep: 0.10 * scale * scale,
      timeoutFrames: Math.round(compact ? -130 + 584 * scale : 240 + 70 * scale),
      launchScale: scale,
    });
  }

  function configureTemporaryAlienArena() {
    const metrics = alienMetricsForViewport(viewW || canvasW, viewH || arenaH);
    canvasW = Math.round((viewW || canvasW) * metrics.arenaExpandX);
    groundY = (viewH || arenaH) - tableInset(viewH || arenaH) - viewBottomInset;
    ceilingY = -Math.round(Math.max(0, metrics.arenaExpandY - 1) * groundY);
    const midY = (groundY + ceilingY) / 2;
    Body.setPosition(ground, { x: canvasW / 2, y: groundY + 25 });
    Body.setPosition(leftWall, { x: WALL_INSET - 20, y: midY });
    Body.setPosition(rightWall, { x: canvasW - WALL_INSET + 20, y: midY });
    Body.setPosition(ceilingBody, { x: canvasW / 2, y: ceilingY - 20 });
    Body.setPosition(bottle, { x: canvasW / 2, y: groundY - 76 });
    return metrics;
  }

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
  // into a plinko board below the table. The nine slots are mirrored around
  // one jackpot: double, halve, magnet, loss, WIN, loss, magnet, halve, double.
  // Seed-derived
  // but main.js disables it for online games (it rewrites lives directly).
  // The board can be WIDER than the screen; the follow camera stays with the
  // falling object so all nine bins remain large and legible on a phone.
  const PLINKO_KINDS = [
    'double', 'halve', 'magnet', 'lose', 'win',
    'lose', 'magnet', 'halve', 'double',
  ];
  let plinkoEnabled = true;
  let forcedSpecialEvent = null; // secret test trigger — consumed by the next flick
  let plinko = null;          // { left, right, top, bottom, pegs, dividers, slots }
  let plinkoBodies = [];
  let plinkoSettle = 0;
  let plinkoNudges = 0;       // "machine shakes" applied to a wedged object

  function setPlinkoEnabled(v) { plinkoEnabled = !!v; }
  function forceSpecialEvent(id) {
    const events = eventSystem();
    const canonical = events ? (events.get(id) ? id : events.forcedEventId(id)) : id;
    const valid = RARE_EVENT_ROLLS.some((event) => event.id === canonical) ||
      (!events && canonical === 'rainbow-trail');
    if (!valid) return false;
    forcedSpecialEvent = canonical;
    return true;
  }
  function forceSpecialEventName(value) {
    const events = eventSystem();
    return events ? forceSpecialEvent(events.forcedEventId(value)) : false;
  }

  function alienShotActive() {
    return !!profile.alienPortal || temporaryAlien;
  }
  function forcePlinko() { return forceSpecialEvent('plinko'); }

  function startPlinko() {
    clearPlinko();
    // Bank-shot furniture (alien wedges/saucers) would steal the drop — clear
    // them for this throw. Next turn's setProfile/buildObstacles rebuilds.
    clearObstacles();
    // Board width is independent of the screen — at least 990 so nine slots
    // stay ball-sized; the camera follows the object through it.
    const bw = Math.max(990, Math.min(canvasW - 36, 1440));
    const left = canvasW / 2 - bw / 2;
    const right = left + bw;
    const top = groundY + 26;
    // The flipped object is BIG (~74×140), so peg gaps and slots must be wide
    // enough for it to tumble through — this is bottle plinko, not puck plinko.
    // v100: twice the peg field of the original board. Eight staggered rows
    // create a long, suspenseful fall worthy of a one-in-a-thousand event.
    const rows = 8, rowGap = 92, slotH = 150;
    const bottom = top + 42 + rows * rowGap + slotH;
    const pegs = [];
    const dividers = [];
    const opts = { isStatic: true, label: 'plinko', friction: 0.05, restitution: 0.55 };

    // Offset peg grid — the object becomes a ball (r=34) for the drop, so
    // ~110px gaps give real plinko action without wedging.
    const cols = Math.max(7, Math.min(13, Math.floor(bw / 100)));
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
               drift: randEvent() < 0.5 ? -1 : 1, rows, antiWedge: true };
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
    const prize = plinko.slots[i].kind;
    const result = prize === 'lose' ? 'MISS' : 'MAKE';
    const canonicalPrize = {
      double: 'lives-doubled', halve: 'everyone-else-halved', magnet: 'always-magnet',
      lose: 'automatic-loss', win: 'automatic-win',
    }[prize];
    lastLandingInfo = {
      result,
      tilt: null,
      perfect: false,
      reason: 'plinko',
      plinko: prize,
      plinkoPrize: canonicalPrize,
      plinkoSlot: i,
      onCap: false,
      maxTilt: 0,
      padOffset: null,
      eventId: 'plinko',
      contacts: contactCount,
      bounces: bounceCount,
      firstContactMs,
      settleMs: firstContactMs == null ? null : Math.max(0, simElapsedMs - firstContactMs),
    };
    const plinkoSpec = activeEventMetadata && activeEventMetadata.reward;
    const slotEffect = plinkoSpec && plinkoSpec.slotEffects
      ? plinkoSpec.slotEffects[canonicalPrize] : null;
    eventResultMetadata = {
      eventId: 'plinko',
      meta: { onCap: false, pose: 'other', contacts: contactCount, bounces: bounceCount, banks: 0 },
      eventReward: Object.assign({ plinkoPrize: canonicalPrize, slotIndex: i, legacyPrize: prize },
        slotEffect || {}),
      plinkoPrize: canonicalPrize,
      automaticOutcome: result,
    };
    lastLandingInfo.meta = eventResultMetadata.meta;
    lastLandingInfo.eventReward = eventResultMetadata.eventReward;
    lastLandingInfo.automaticOutcome = result;
    landingPhase = 'resolved';
    if (eventRuntime) eventRuntime.phase = 'resolved';
    if (eventController && eventController.active()) {
      eventController.resolve(Object.assign(eventContext(lastFlickInfo && lastFlickInfo.seed), {
        result, landingInfo: lastLandingInfo,
      }));
    }
    return result;
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
    if (!profile.landOnTarget || !canvasW) { targetX = null; targetY = null; return; }
    targetHW = currentTargetHalfWidth();
    const margin = (sideWallsEnabled ? WALL_INSET : 8) + targetHW + 16;
    if (explicitX != null && Number.isFinite(explicitX)) {
      targetX = Math.max(margin, Math.min(canvasW - margin, explicitX));
    } else {
      const span = Math.max(0, canvasW - margin * 2);
      targetX = margin + rand() * span;
    }
    targetY = profile.alienPortal
      ? Math.max(145, Math.min(groundY - 180, groundY * (0.36 + rand() * 0.24)))
      : null;
  }

  function placeTemporaryAlienTarget() {
    const metrics = alienMetricsForViewport(viewW || canvasW, viewH || arenaH);
    targetHW = metrics.ringRadius;
    const margin = WALL_INSET + targetHW + 32;
    targetX = margin + randEvent() * Math.max(0, canvasW - margin * 2);
    targetY = Math.max(metrics.ringRadius + 60,
      Math.min(groundY - metrics.ringRadius - 60, groundY * (0.36 + randEvent() * 0.24)));
  }

  function getTarget() {
    return targetX == null ? null : {
      x: targetX,
      halfWidth: targetHW,
      hitHalfWidth: currentHitHalfWidth(),
      y: targetY,
      style: alienShotActive() ? 'portal' : 'pad',
      armed: bankHits > 0,
    };
  }

  function throughAlienPortal() {
    if (!alienShotActive() || bankHits < 1 || targetX == null || targetY == null || !bottle) return false;
    return Math.hypot(bottle.position.x - targetX, bottle.position.y - targetY) <= currentHitHalfWidth();
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

  function activePhysicsKind() {
    return activeEventMetadata && activeEventMetadata.physics
      ? activeEventMetadata.physics.kind : null;
  }

  function ceilingLandingActive() {
    return activePhysicsKind() === 'ceiling';
  }

  function touchingLandingPlane(body = bottle) {
    if (!body) return false;
    return ceilingLandingActive()
      ? body.bounds.min.y <= ceilingY + GROUND_TOUCH_PX
      : body.bounds.max.y >= groundY - GROUND_TOUCH_PX;
  }

  function withinLandingPlaneTolerance(body = bottle, ceiling = ceilingLandingActive()) {
    if (!body) return false;
    const edge = ceiling ? body.bounds.min.y : body.bounds.max.y;
    const plane = ceiling ? ceilingY : groundY;
    return Math.abs(edge - plane) <= GROUND_TOUCH_PX;
  }

  // Return tilt relative to the active gravity/landing plane. On a Ceiling Flip
  // the visually inverted bottle is upright relative to the ceiling.
  function landingTiltForBody(body = bottle) {
    if (!body) return null;
    const relativeAngle = ceilingLandingActive() ? body.angle - Math.PI : body.angle;
    return Math.abs(normalizeSignedAngle(relativeAngle));
  }

  function poseForBody(body, capBody = false) {
    const tilt = capBody
      ? Math.abs(normalizeSignedAngle(body.angle))
      : landingTiltForBody(body);
    const inverseError = Math.abs(tilt - Math.PI);
    if (capBody) {
      return { made: tilt < 0.35 || inverseError < 0.35, onCap: true, tilt };
    }
    return {
      made: tilt < MAKE_ANGLE || inverseError < CAP_WINDOW,
      onCap: inverseError < CAP_WINDOW,
      tilt,
    };
  }

  function captureBodyState(body) {
    return {
      x: body.position.x, y: body.position.y, angle: body.angle,
      vx: body.velocity.x, vy: body.velocity.y, av: body.angularVelocity,
    };
  }

  function beginRewind(firstFailureReason, firstFailureTilt) {
    const state = eventRuntime;
    if (!state || state.kind !== 'rewind' || state.flags.replayed ||
        state.flags.reversing || state.flags.finalizing) return false;
    if (!state.snapshots.length) state.snapshots.push(captureBodyState(bottle));
    let apexIndex = 0;
    for (let i = 1; i < state.snapshots.length; i++) {
      if (state.snapshots[i].y < state.snapshots[apexIndex].y) apexIndex = i;
    }
    state.firstFailureReason = firstFailureReason;
    state.firstFailureTilt = firstFailureTilt;
    state.apexIndex = apexIndex;
    state.rewindIndex = state.snapshots.length - 1;
    state.flags.reversing = true;
    state.phase = 'rewinding';
    state.rewindProgress = 0;
    Body.setStatic(bottle, true);
    Body.setVelocity(bottle, { x: 0, y: 0 });
    Body.setAngularVelocity(bottle, 0);
    landingPhase = 'airborne';
    firstContactMs = null;
    settlingStartedMs = null;
    previousTouching = false;
    groundedFrames = 0;
    angleWin = [];
    leanFrames = 0;
    return true;
  }

  function recordLanding(result, tilt, reason) {
    // Rewind owns the first would-be failure. It is not emitted to rules/stats;
    // the visible reverse/replay runs and only that final verdict is returned.
    if (result === 'MISS' && beginRewind(reason, tilt)) return null;
    let padOffset = null;
    if (alienShotActive() && targetX != null && targetY != null && bottle) {
      const hitHW = currentHitHalfWidth();
      padOffset = hitHW > 0
        ? Math.hypot(bottle.position.x - targetX, bottle.position.y - targetY) / hitHW
        : null;
    } else if (profile.landOnTarget && targetX != null && bottle) {
      const hitHW = currentHitHalfWidth();
      padOffset = hitHW > 0 ? Math.abs(bottle.position.x - targetX) / hitHW : null;
    }
    const originalResult = result;
    const onCap = reason === 'cap';
    const landingRules = activeEventMetadata && activeEventMetadata.landing;
    if (result === 'MAKE' && landingRules) {
      if (onCap && landingRules.capValid === false) {
        result = 'MISS';
        reason = 'invalid-cap';
      } else if (!onCap && landingRules.uprightValid === false) {
        result = 'MISS';
        reason = 'invalid-upright';
      }
    }
    let landedCount = result === 'MAKE' ? 1 : 0;
    if (activeEventDefinition && activeEventDefinition.id === 'mitosis' && mitosisBottle) {
      const secondaryPose = poseForBody(mitosisBottle);
      const secondaryMade = touchingFloorBody(mitosisBottle) && secondaryPose.made;
      landedCount = eventRuntime && Number.isFinite(eventRuntime.landedCount)
        ? eventRuntime.landedCount
        : (originalResult === 'MAKE' ? 1 : 0) + (secondaryMade ? 1 : 0);
      if (landedCount > 0) result = 'MAKE';
    }

    // Bounce-mode MAKEs pass tilt=0; use pad centering for "perfect" instead so
    // every alien pad hit isn't celebrated as Perfect / Bullseye.
    let perfect = false;
    if (result === 'MAKE') {
      if (alienShotActive()) {
        perfect = padOffset != null && padOffset <= 0.28;
      } else if (profile.floorResolve) {
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
      rotations: totalRotation / (Math.PI * 2),
      requiredRotations: requiredRotation / (Math.PI * 2),
      maxTilt: profile.floorResolve ? 0 : maxGroundedTilt,
      padOffset,
      bankHits,
      contacts: contactCount,
      bounces: bounceCount,
      firstContactMs,
      settleMs: firstContactMs == null ? null : Math.max(0, simElapsedMs - firstContactMs),
      eventId: activeEventDefinition ? activeEventDefinition.id : (lastFlickInfo && lastFlickInfo.eventId),
    };
    const reward = {};
    const rewardSpec = activeEventMetadata && activeEventMetadata.reward;
    if (result === 'MAKE' && rewardSpec) {
      if (rewardSpec.onSuccess) Object.assign(reward, rewardSpec.onSuccess);
      if (rewardSpec.onSuccessByPose) {
        reward.additiveLives = lastLandingInfo.onCap
          ? rewardSpec.onSuccessByPose.cap
          : rewardSpec.onSuccessByPose.upright;
        reward.capped = !!rewardSpec.capped;
      }
    }
    if (lastLandingInfo.eventId === 'mitosis') {
      reward.landedCount = Math.max(0, Math.min(2, landedCount));
      if (result === 'MAKE') {
        reward.additiveLives = reward.landedCount === 2 ? 3 : 1;
        reward.capped = true;
      }
    }
    if (lastLandingInfo.eventId === 'roulette-table' && eventRuntime) {
      const slot = rouletteSlotAtLanding(eventRuntime, bottle.position.x);
      eventRuntime.rouletteSlot = slot;
      eventRuntime.reward.multiplier = [1, 2, 3, 4, 4, 3, 2, 1][slot];
      reward.multiplier = eventRuntime.reward.multiplier;
      reward.slotIndex = slot;
      reward.bypassAdditiveCap = true;
    }
    const semanticMeta = {};
    if (eventRuntime && eventRuntime.kind === 'rewind') {
      semanticMeta.rewind = {
        replayed: !!eventRuntime.flags.replayed,
        firstFailureReason: eventRuntime.firstFailureReason || null,
        replaySucceeded: result === 'MAKE',
      };
    }
    if (eventRuntime && eventRuntime.kind === 'mitosis') {
      semanticMeta.copies = (eventRuntime.copyOutcomes || []).map((copy) => ({ ...copy }));
      semanticMeta.massConservationError = eventRuntime.massConservationError || 0;
      semanticMeta.angularMomentumError = eventRuntime.angularMomentumError || 0;
    }
    if (eventRuntime && eventRuntime.kind === 'cap-toss') {
      semanticMeta.capToss = {
        bodyLanded: !!(eventRuntime.bodyOutcome && eventRuntime.bodyOutcome.made),
        capLanded: !!(eventRuntime.capOutcome && eventRuntime.capOutcome.made),
        bothRequired: true,
      };
    }
    if (eventRuntime && eventRuntime.kind === 'roulette') {
      semanticMeta.roulette = {
        wheelAngle: eventRuntime.wheelAngle,
        slotIndex: eventRuntime.rouletteSlot,
      };
    }
    if (eventRuntime && eventRuntime.kind === 'meteors') {
      semanticMeta.meteorHits = eventRuntime.meteorHits || 0;
    }
    eventResultMetadata = {
      eventId: lastLandingInfo.eventId || null,
      meta: {
        onCap: lastLandingInfo.onCap,
        pose: lastLandingInfo.onCap ? 'cap' : (result === 'MAKE' ? 'upright' : 'other'),
        contacts: contactCount,
        bounces: bounceCount,
        banks: bankHits,
        ...semanticMeta,
      },
      eventReward: reward,
    };
    lastLandingInfo.meta = eventResultMetadata.meta;
    lastLandingInfo.eventReward = reward;
    landingPhase = 'resolved';
    if (eventRuntime) eventRuntime.phase = 'resolved';
    if (eventController && eventController.active()) {
      eventController.resolve(Object.assign(eventContext(lastFlickInfo && lastFlickInfo.seed), {
        result, landingInfo: lastLandingInfo,
      }));
    }
    return result;
  }

  function touchingFloor() {
    return !!bottle && bottle.bounds.max.y >= groundY - GROUND_TOUCH_PX;
  }

  function touchingFloorBody(body) {
    return !!body && body.bounds.max.y >= groundY - GROUND_TOUCH_PX;
  }

  function rouletteSlotAtLanding(state, x) {
    const radius = Math.max(1, state.wheelRadius || canvasW * 0.38);
    const normalizedX = Math.max(-1, Math.min(1, (x - state.wheelCenterX) / radius));
    // Project screen position onto the near half of the rotating wheel. Its
    // physical angular phase at the settling instant determines the sector.
    const contactAngle = Math.asin(normalizedX);
    const tau = Math.PI * 2;
    const phase = ((contactAngle - state.wheelAngle) % tau + tau) % tau;
    return Math.min(7, Math.floor(phase / (tau / 8)));
  }

  function updateTrackedLanding(body, tracker, options = {}) {
    if (!body) {
      tracker.resolved = true;
      tracker.made = false;
      tracker.reason = 'missing-body';
      return;
    }
    const grounded = options.ceiling
      ? body.bounds.min.y <= ceilingY + GROUND_TOUCH_PX
      : touchingFloorBody(body);
    const limit = options.settleLimitMs || 4000;
    const deadline = tracker.contactMs != null && simElapsedMs - tracker.contactMs >= limit;
    // Compound split bodies inherit the rotation completed before separation.
    // Accumulate their angular path from that point instead of comparing only
    // against the split angle, which discarded the pre-split portion and made
    // otherwise upright Mitosis copies fail as under-rotated.
    const previousAngle = Number.isFinite(tracker.previousAngle)
      ? tracker.previousAngle : body.angle;
    tracker.rotation = (tracker.rotation || 0) + Math.abs(body.angle - previousAngle);
    tracker.previousAngle = body.angle;
    if (!grounded) {
      tracker.stableFrames = 0;
      // A split body gets the same absolute first-contact deadline as the main
      // scoring body.  Being motionless on another collider is not a landing.
      if (!tracker.resolved && deadline) {
        tracker.resolved = true;
        tracker.made = false;
        tracker.onCap = false;
        tracker.tilt = poseForBody(body, !!options.capBody).tilt;
        tracker.reason = 'off-plane-settle-limit';
      }
      return;
    }
    if (tracker.contactMs == null) tracker.contactMs = simElapsedMs;
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    const stable = speed < SETTLE_LIN_SPD && Math.abs(body.angularVelocity) < SETTLE_ANG_VEL;
    if (stable && tracker.lastStableFrame !== flightFrames) {
      tracker.stableFrames = (tracker.stableFrames || 0) + 1;
      tracker.lastStableFrame = flightFrames;
    } else if (!stable) {
      tracker.stableFrames = 0;
    }
    const reachedDeadline = simElapsedMs - tracker.contactMs >= limit;
    if (!tracker.resolved && reachedDeadline &&
        !withinLandingPlaneTolerance(body, !!options.ceiling)) {
      tracker.resolved = true;
      tracker.made = false;
      tracker.onCap = false;
      tracker.tilt = poseForBody(body, !!options.capBody).tilt;
      tracker.reason = 'off-plane-settle-limit';
      return;
    }
    if (!tracker.resolved && ((tracker.stableFrames || 0) >= SETTLE_FRAMES || reachedDeadline)) {
      const pose = poseForBody(body, !!options.capBody);
      const rotationValid = !options.requireFlip || tracker.rotation >= requiredRotation;
      tracker.resolved = true;
      tracker.made = !!(pose.made && rotationValid);
      tracker.onCap = pose.onCap;
      tracker.tilt = pose.tilt;
      tracker.reason = tracker.made ? (options.capBody ? 'cap-settled'
        : (pose.onCap ? 'cap' : 'upright'))
        : (rotationValid ? 'invalid-pose' : 'underrotated');
    }
  }

  function checkSplitEventLanding() {
    const state = eventRuntime;
    if (!state || !state.splitTrackers || !state.flags.split) return null;
    const settleLimit = activeEventMetadata.physics.settleLimitMs;
    for (const tracker of state.splitTrackers) {
      updateTrackedLanding(tracker.body, tracker, {
        capBody: !!tracker.capBody,
        requireFlip: !!tracker.requireFlip,
        settleLimitMs: settleLimit,
      });
    }
    if (state.elapsedMs > settleLimit + 8000) {
      for (const tracker of state.splitTrackers) {
        if (!tracker.resolved) {
          tracker.resolved = true;
          tracker.made = false;
          tracker.reason = 'off-field';
        }
      }
    }
    if (!state.splitTrackers.every((tracker) => tracker.resolved)) return null;
    if (state.kind === 'mitosis') {
      state.copyOutcomes = state.splitTrackers.map((tracker, index) => ({
        copy: index + 1, made: tracker.made, onCap: tracker.onCap,
        tilt: tracker.tilt, reason: tracker.reason,
      }));
      state.landedCount = state.copyOutcomes.filter((copy) => copy.made).length;
      state.flags.mitosisFinalizing = true;
      const result = state.landedCount > 0 ? 'MAKE' : 'MISS';
      const reason = state.landedCount === 2 ? 'mitosis-both'
        : (state.landedCount === 1 ? 'mitosis-one' : 'mitosis-none');
      const madeTracker = state.splitTrackers.find((tracker) => tracker.made);
      return recordLanding(result, madeTracker ? madeTracker.tilt : null, reason);
    }
    state.bodyOutcome = state.splitTrackers[0];
    state.capOutcome = state.splitTrackers[1];
    state.flags.capTossFinalizing = true;
    const both = state.bodyOutcome.made && state.capOutcome.made;
    return recordLanding(both ? 'MAKE' : 'MISS', state.bodyOutcome.tilt,
      both ? 'cap-toss-both' : 'cap-toss-incomplete');
  }

  function checkLanding() {
    if (!bottle) return null;
    if (landingPhase === 'resolved' && lastLandingInfo) return lastLandingInfo.result;
    if (eventRuntime && eventRuntime.kind === 'rewind' && eventRuntime.flags.reversing) {
      return null;
    }

    // Mitosis and Cap Toss own both physical bodies through settlement. The
    // ordinary bottle cannot resolve the shot while its counterpart is moving.
    if (eventRuntime && (eventRuntime.kind === 'mitosis' || eventRuntime.kind === 'cap-toss') &&
        eventRuntime.flags.split) {
      return checkSplitEventLanding();
    }

    // Plinko drop: the only verdict is which slot it settles in.
    if (plinko && launched) {
      if (flightFrames > 3000) return plinkoVerdict();   // ~50s failsafe for the long board
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
            y: bottle.velocity.y + 0.35,
          });
        }
        if (plinkoNudges > 700) {
          Body.setPosition(bottle, {
            x: Math.max(plinko.left + 36, Math.min(plinko.right - 36, bottle.position.x + plinko.drift * 48)),
            y: plinko.bottom - plinko.slotH + 34,
          });
          Body.setVelocity(bottle, { x: plinko.drift * 2.5, y: 5 });
          plinkoNudges = 0;
        }
        plinkoSettle = 0;
        return null;
      }
      if (firstContactMs == null) {
        firstContactMs = simElapsedMs;
        landingPhase = 'contact';
        contactCount = 1;
        if (eventController && eventController.active()) {
          eventController.onContact(Object.assign(eventContext(lastFlickInfo && lastFlickInfo.seed), {
            contactIndex: 1, elapsedMs: simElapsedMs,
          }));
        }
        return null;
      }
      if (landingPhase === 'contact') {
        landingPhase = 'settling';
        settlingStartedMs = simElapsedMs;
        return null;
      }
      if (speed < 1.2 && Math.abs(bottle.angularVelocity) < 0.05) plinkoSettle++;
      else plinkoSettle = 0;
      if (plinkoSettle > 40) return plinkoVerdict();
      const plinkoSettleLimit = activeEventMetadata && activeEventMetadata.physics
        ? activeEventMetadata.physics.settleLimitMs : 4000;
      if (simElapsedMs - firstContactMs >= plinkoSettleLimit) return plinkoVerdict();
      return null;
    }

    // Alien bank shot: score in mid-air by flying through the tractor ring
    // after at least one real carom. The table or a 12-second orbit is a miss.
    // This replaces the cramped/awkward "land on a tiny pad" judgment.
    if (alienShotActive() && launched && wasAirborne) {
      if (throughAlienPortal()) return recordLanding('MAKE', 0, 'tractor-ring');
      // A banked object that brushes the table is still inside the tractor
      // beam and can be pulled back into orbit. Only an unbanked floor hit is
      // an immediate miss; otherwise the ring/timeout decides the shot.
      if (touchingFloor() && bankHits < 1) {
        if (landingPhase === 'contact') return null;
        return recordLanding('MISS', null, 'off-target');
      }
      const alienLimit = alienMetricsForViewport(viewW || canvasW, viewH || arenaH).timeoutFrames;
      if (flightFrames > alienLimit) return recordLanding('MISS', null, 'alien-flight-limit');
      return null;
    }

    // A floor contact is a lifecycle boundary, never an immediate MISS. The
    // next simulation step advances it to settling before pose evaluation.
    if (landingPhase === 'contact') return null;

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
      if (flightFrames > ABS_MISS_FRAMES) return recordLanding('MISS', null, 'timeout');
    }

    const angVel   = Math.abs(bottle.angularVelocity);
    const linSpeed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
    // Touch the table via AABB bottom — COM can sit well above the floor when
    // the bottle is inverted on its neck / resting on a tall corner.
    const grounded = touchingLandingPlane();

    if (launched && grounded && firstContactMs == null) {
      firstContactMs = simElapsedMs;
      landingPhase = 'contact';
      contactCount = 1;
      previousTouching = true;
      if (eventController && eventController.active()) {
        eventController.onContact(Object.assign(eventContext(lastFlickInfo && lastFlickInfo.seed), {
          contactIndex: 1, elapsedMs: simElapsedMs,
        }));
      }
      return null;
    }

    const settleLimit = activeEventMetadata && activeEventMetadata.physics
      ? activeEventMetadata.physics.settleLimitMs
      : 4000;
    // The settlement allowance begins at the first scoring-plane contact, not
    // at the start of the final uninterrupted grounded stretch. Ice, Bouncy,
    // and other contact effects can legitimately lift the object back off the
    // plane; that physical continuation must not turn the documented limit
    // into an unbounded per-bounce timer. Events that own a true second shot
    // (Trampoline and Rewind) explicitly clear firstContactMs when they relaunch.
    if (firstContactMs != null && simElapsedMs - firstContactMs >= settleLimit) {
      if (profile.requireFlip && !hasFlipped) return recordLanding('MISS', null, 'underrotated');
      // The deadline is absolute, but the pose only scores on the active plane.
      // Event furniture (notably Ice bumpers and Earthquake debris) can hold an
      // otherwise upright bottle above that plane; tilt alone is not a landing.
      if (!withinLandingPlaneTolerance()) {
        return recordLanding('MISS', landingTiltForBody(), 'off-plane-settle-limit');
      }
      const limitTilt = landingTiltForBody();
      const limitInvErr = Math.abs(limitTilt - Math.PI);
      if (limitTilt < MAKE_ANGLE) return recordLanding('MAKE', limitTilt, 'upright-settle-limit');
      if (limitInvErr < CAP_WINDOW) return recordLanding('MAKE', limitTilt, 'cap');
      return recordLanding('MISS', limitTilt, 'settle-limit');
    }

    if (!grounded) {
      groundedFrames = 0;
      angleWin = [];
      return null;
    }

    groundedFrames++;

    {
      const t = landingTiltForBody();
      if (t > maxGroundedTilt) maxGroundedTilt = t;
    }

    if (groundedFrames > profile.missCapFrames) {
      // A visibly upright bottle must never become a MISS just because minute
      // engine jitter kept it outside the strict settle window. At the fallback
      // deadline, honor the final pose (while still requiring a completed flip).
      if (profile.requireFlip && !hasFlipped) return recordLanding('MISS', null, 'underrotated');
      const tilt = landingTiltForBody();
      const invErr = Math.abs(tilt - Math.PI);
      if (tilt < MAKE_ANGLE) return recordLanding('MAKE', tilt, 'upright-timeout');
      if (invErr < CAP_WINDOW) return recordLanding('MAKE', tilt, 'cap');
      return recordLanding('MISS', tilt, 'timeout');
    }

    if (angVel < SETTLE_ANG_VEL && linSpeed < SETTLE_LIN_SPD) {
      angleWin.push(bottle.angle);
      if (angleWin.length > SETTLE_FRAMES) angleWin.shift();
      let lo = Infinity, hi = -Infinity;
      for (const a of angleWin) { if (a < lo) lo = a; if (a > hi) hi = a; }
      if (groundedFrames >= MIN_GROUNDED_FRAMES &&
          angleWin.length >= SETTLE_FRAMES && (hi - lo) < SETTLE_RANGE) {
        if (profile.requireFlip && !hasFlipped) return recordLanding('MISS', null, 'underrotated');
        const tilt = landingTiltForBody();
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
      if (!launched || !bottle) return;
      for (const { bodyA, bodyB } of ev.pairs) {
        const aIsBottle = bodyA === bottle || bodyA.parent === bottle;
        const bIsBottle = bodyB === bottle || bodyB.parent === bottle;
        if (aIsBottle === bIsBottle) continue;
        const other = aIsBottle ? bodyB : bodyA;
        const label = other.label;
        if (label === 'meteor' && eventRuntime && eventRuntime.kind === 'meteors') {
          eventRuntime.meteorHits = (eventRuntime.meteorHits || 0) + 1;
          eventRuntime.lastMeteorHit = {
            x: bottle.position.x, y: bottle.position.y,
            speed: Math.hypot(bottle.velocity.x, bottle.velocity.y),
          };
          // Meteor contact is a deflection, never a failure boundary.
          continue;
        }
        if (label !== 'wall' && label !== 'ceiling' &&
            label !== 'deflector' && label !== 'saucer') continue;
        const speed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
        if (speed < 1.8) continue;
        if (alienShotActive()) bankHits++;
        const type = (label === 'deflector' || label === 'saucer') ? 'wall' : label;
        if (onImpact) onImpact(type, speed, bottle.position.x, bottle.position.y);
      }
    });

    resetBottle();
  }

  function reflow(w, h, bottomInset = 0) {
    if (!engine) return;
    if (launched && landingPhase !== 'resolved') {
      pendingReflow = { width: w, height: h, bottomInset };
      return false;
    }
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
    pendingReflow = null;
    return true;
  }

  function resetBottle() {
    cleanupActiveEvent('reset');
    if (pendingReflow && engine) {
      const deferred = pendingReflow;
      pendingReflow = null;
      viewW = deferred.width;
      viewH = deferred.height;
      viewBottomInset = deferred.bottomInset;
      layoutArena();
      buildObstacles(deferred.height);
    }
    if (bottle) World.remove(world, bottle);
    if (engine) engine.gravity.y = profile.gravity;   // clear any moon throw
    if (plinko) clearPlinko();                        // restore the floor
    groundedFrames = 0;
    angleWin       = [];
    totalRotation  = 0;
    hasFlipped     = false;
    requiredRotation = 5.6;
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
    rareEvent      = null;
    temporaryAlien = false;
    bankHits       = 0;
    rareImpulseUsed = false;
    rareEffectFrames = 0;
    alwaysMagnetActive = false;
    rarePhase      = 0;
    groundImpactSent = false;
    landingPhase = 'resolved';
    firstContactMs = null;
    settlingStartedMs = null;
    contactCount = 0;
    bounceCount = 0;
    simElapsedMs = 0;
    previousTouching = false;
    eventResultMetadata = null;
    if (!profile.landOnTarget) { targetX = null; targetY = null; }
    if (leftWall) leftWall.restitution = profile.wallBounce;
    if (rightWall) rightWall.restitution = profile.wallBounce;
    if (ceilingBody) {
      ceilingBody.restitution = profile.wallBounce;
      ceilingBody.collisionFilter.mask = profile.ceiling ? 0xFFFFFFFF : 0;
    }
    syncSideWalls();
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

  function eventConfig(id) {
    const events = eventSystem();
    if (events && events.CONFIG) return events.CONFIG[id] || null;
    const roll = RARE_EVENT_ROLLS.find((entry) => entry.id === id);
    return roll ? { physicsKind: id, settleMs: 4000 } : null;
  }

  function removeEventBodies() {
    if (world) for (const body of eventBodies) World.remove(world, body);
    if (world) for (const constraint of eventConstraints) World.remove(world, constraint);
    eventBodies = [];
    eventConstraints = [];
    mirrorBottle = null;
    mitosisBottle = null;
    fizzCap = null;
    capTossCap = null;
  }

  function cloneEventBottle(scale, label) {
    const copy = createBottle();
    if (scale && scale !== 1) Body.scale(copy, scale, scale);
    copy.label = label;
    for (const part of copy.parts) part.label = label;
    World.add(world, copy);
    eventBodies.push(copy);
    return copy;
  }

  function syncMirrorPresentation() {
    if (!mirrorBottle || !bottle) return;
    Body.setPosition(mirrorBottle, { x: canvasW - bottle.position.x, y: bottle.position.y });
    Body.setAngle(mirrorBottle, -bottle.angle);
    Body.setVelocity(mirrorBottle, { x: -bottle.velocity.x, y: bottle.velocity.y });
    Body.setAngularVelocity(mirrorBottle, -bottle.angularVelocity);
  }

  // Concrete target for EventDefinition hooks. The registry remains independent
  // of Matter.js; this adapter owns all mutations and can therefore clean every
  // event deterministically at turn end.
  function applyEventEffect(phase, config, state) {
    if (!config || !bottle) return undefined;
    const kind = config.physicsKind;
    if (phase === 'prepare') {
      eventRuntime = state;
      state.kind = kind;
      state.startedMs = simElapsedMs;
      state.phase = 'airborne';
      state.snapshots = [];
      state.contactBodies = [];
      state.reward = {};
      state.originalMass = bottle.mass;
      state.originalInertia = bottle.inertia;
      if (kind === 'mirror') {
        mirrorBottle = cloneEventBottle(1, 'mirror-bottle');
        Body.setPosition(mirrorBottle, { x: canvasW - bottle.position.x, y: bottle.position.y });
        // The reflected body is a kinematic presentation of the source, not an
        // overlapping collider. At center launch the old dynamic clone struck
        // the source on frame one and erased nearly all of its rotation.
        for (const part of [mirrorBottle, ...mirrorBottle.parts]) {
          part.isSensor = true;
          part.collisionFilter.mask = 0;
        }
        state.secondary = mirrorBottle;
      } else if (kind === 'meteors') {
        state.meteorHits = 0;
        for (let i = 0; i < 3; i++) {
          const meteor = Bodies.circle(canvasW * (0.22 + i * 0.28), ceilingY - 80 - i * 65,
            15 + i * 3, { label: 'meteor', density: 0.003, restitution: 0.65, frictionAir: 0.006 });
          World.add(world, meteor);
          eventBodies.push(meteor);
          Body.setVelocity(meteor, { x: (i - 1) * 1.4, y: 5.5 + i });
        }
      } else if (kind === 'bouncy') {
        state.bouncePeakSpeeds = [];
        state.maxBounces = 3;
        for (const part of [bottle, ...bottle.parts]) part.restitution = config.restitution || 0.88;
      } else if (kind === 'golden-balance') {
        Body.setMass(bottle, state.originalMass * 1.35);
        state.massScale = bottle.mass / state.originalMass;
        for (const part of [bottle, ...bottle.parts]) part.restitution = 0.005;
      } else if (kind === 'ceiling') {
        state.groundMask = ground.collisionFilter.mask;
        state.ceilingMask = ceilingBody.collisionFilter.mask;
        ground.collisionFilter.mask = 0;
        ceilingBody.collisionFilter.mask = 0xFFFFFFFF;
        ceilingBody.restitution = 0.01;
        ceilingBody.friction = 0.9;
        engine.gravity.y = -Math.abs(profile.gravity);
        state.landingPlane = 'ceiling';
      } else if (kind === 'earthquake') {
        state.groundOrigin = { x: ground.position.x, y: ground.position.y };
        state.tableOffset = { x: 0, y: 0 };
        for (let i = 0; i < 5; i++) {
          const debris = Bodies.rectangle(canvasW * (0.14 + i * 0.18), groundY - 20 - (i % 2) * 16,
            12 + i * 2, 10 + (i % 3) * 3, {
              label: 'quake-debris', density: 0.0015, restitution: 0.32, friction: 0.55,
            });
          World.add(world, debris);
          eventBodies.push(debris);
        }
      } else if (kind === 'ice') {
        state.iceFriction = 0.001;
        const bumperOptions = {
          isStatic: true, label: 'ice-bumper', friction: 0.02, restitution: 0.18,
        };
        const leftBumper = Bodies.rectangle(28, groundY - 48, 34, 96, bumperOptions);
        const rightBumper = Bodies.rectangle(canvasW - 28, groundY - 48, 34, 96, bumperOptions);
        World.add(world, [leftBumper, rightBumper]);
        eventBodies.push(leftBumper, rightBumper);
      }
      if (kind === 'portals') {
        const direction = Math.cos(rarePhase) < 0 ? -1 : 1;
        state.portals = [
          { x: canvasW * 0.5, y: groundY * 0.50, radius: 72, angle: direction * 0.48 },
          { x: canvasW * (direction > 0 ? 0.76 : 0.24), y: groundY * 0.30,
            radius: 72, angle: -direction * 0.72 },
        ];
        state.portalRotation = state.portals[1].angle - state.portals[0].angle;
      }
      if (kind === 'tether') {
        const swingDirection = Math.cos(rarePhase) < 0 ? -1 : 1;
        state.anchor = {
          x: canvasW / 2,
          y: ceilingY + Math.max(105, groundY * 0.16),
        };
        state.cableLength = Math.min(390, Math.max(250, (groundY - state.anchor.y) * 0.72));
        state.startAngle = -swingDirection * 0.78;
        Body.setPosition(bottle, {
          x: state.anchor.x + Math.sin(state.startAngle) * state.cableLength,
          y: state.anchor.y + Math.cos(state.startAngle) * state.cableLength,
        });
        state.constraint = Constraint.create({
          pointA: state.anchor, bodyB: bottle, length: state.cableLength,
          stiffness: 0.98, damping: 0.055, label: 'tether-cable',
        });
        World.add(world, state.constraint);
        eventConstraints.push(state.constraint);
      }
      if (kind === 'black-hole') {
        state.singularity = {
          x: canvasW * (0.35 + randEvent() * 0.30),
          y: groundY * (0.30 + randEvent() * 0.22),
        };
      }
      if (kind === 'roulette') {
        state.wheelCenterX = canvasW / 2;
        state.wheelRadius = Math.min(canvasW * 0.42, 470);
        state.wheelAngle = randEvent() * Math.PI * 2;
        state.wheelAngularVelocity = (Math.cos(rarePhase) < 0 ? -1 : 1) *
          (0.82 + randEvent() * 0.24);
        state.rouletteSlot = null;
        const wheel = Bodies.circle(state.wheelCenterX,
          groundY + state.wheelRadius * 0.94, state.wheelRadius, {
            isStatic: true, isSensor: true, label: 'roulette-wheel',
          });
        Body.setAngle(wheel, state.wheelAngle);
        state.wheelBody = wheel;
        World.add(world, wheel);
        eventBodies.push(wheel);
      }
      if (kind === 'boomerang') {
        state.originX = bottle.position.x;
        state.originY = bottle.position.y;
      }
      if (kind === 'rewind') {
        state.rewindProgress = 0;
        state.firstFailureReason = null;
      }
      return state;
    }

    if (phase === 'physics') {
      state.elapsedMs = simElapsedMs - state.startedMs;
      const airborne = bottle.bounds.max.y < groundY - GROUND_TOUCH_PX;

      if (kind === 'rewind') {
        if (state.flags.reversing) {
          const index = Math.max(state.apexIndex, Math.floor(state.rewindIndex));
          const snap = state.snapshots[index];
          Body.setPosition(bottle, { x: snap.x, y: snap.y });
          Body.setAngle(bottle, snap.angle);
          Body.setVelocity(bottle, { x: 0, y: 0 });
          Body.setAngularVelocity(bottle, 0);
          const span = Math.max(1, state.snapshots.length - 1 - state.apexIndex);
          state.rewindProgress = Math.max(0, Math.min(1,
            (state.snapshots.length - 1 - index) / span));
          state.rewindIndex -= 3;
          if (state.rewindIndex <= state.apexIndex) {
            const apex = state.snapshots[state.apexIndex];
            Body.setStatic(bottle, false);
            Body.setPosition(bottle, { x: apex.x, y: apex.y });
            Body.setAngle(bottle, apex.angle);
            const turns = Math.round((apex.angle - launchAngle) / (Math.PI * 2));
            const uprightTarget = launchAngle + turns * Math.PI * 2;
            const correction = normalizeSignedAngle(uprightTarget - apex.angle);
            const correctionImpulse = {
              x: apex.vx * 0.72,
              y: Math.max(1.8, Math.abs(apex.vy) + 1.2),
              angular: apex.av * 0.12 + correction / 48,
            };
            Body.setVelocity(bottle, { x: correctionImpulse.x, y: correctionImpulse.y });
            Body.setAngularVelocity(bottle, correctionImpulse.angular);
            state.correctionImpulse = correctionImpulse;
            state.flags.reversing = false;
            state.flags.replayed = true;
            state.phase = 'replay';
            landingPhase = 'airborne';
            firstContactMs = null;
            settlingStartedMs = null;
            previousTouching = false;
            groundedFrames = 0;
            angleWin = [];
            leanFrames = 0;
            hasLanded = false;
            capSticky = false;
            flightFrames = 0;
            groundImpactSent = false;
          }
        } else if (!state.flags.replayed && state.snapshots.length < 900) {
          state.snapshots.push(captureBodyState(bottle));
        }
        return undefined;
      }

      if (kind === 'liquid-shift' && airborne) {
        const wave = Math.sin(arenaTime * 7 + rarePhase);
        state.liquidVelocity = (state.liquidVelocity || 0) * 0.91 -
          (state.liquidShift || 0) * 0.055 - bottle.angularVelocity * 0.22 + wave * 0.018;
        state.liquidShift = Math.max(-1, Math.min(1,
          (state.liquidShift || 0) + state.liquidVelocity));
        const localX = { x: Math.cos(bottle.angle), y: Math.sin(bottle.angle) };
        const shiftedPoint = {
          x: bottle.position.x + localX.x * state.liquidShift * 34,
          y: bottle.position.y + localX.y * state.liquidShift * 34,
        };
        Body.applyForce(bottle, shiftedPoint, { x: 0, y: bottle.mass * 0.00020 });
      } else if (kind === 'liquid-shift' && touchingFloor()) {
        const tilt = normalizeSignedAngle(bottle.angle);
        Body.setAngularVelocity(bottle,
          bottle.angularVelocity * 0.80 - tilt * 0.032);
      } else if (kind === 'fizz-jet' && airborne) {
        const axis = { x: Math.sin(bottle.angle), y: -Math.cos(bottle.angle) };
        if (!state.flags.capEjected && state.elapsedMs > 90) {
          state.flags.capEjected = true;
          fizzCap = Bodies.rectangle(bottle.position.x + axis.x * 76,
            bottle.position.y + axis.y * 76, 24, 10, {
              label: 'fizz-cap', density: 0.0007, restitution: 0.48, frictionAir: 0.008,
            });
          Body.setAngle(fizzCap, bottle.angle);
          World.add(world, fizzCap);
          eventBodies.push(fizzCap);
          Body.setVelocity(fizzCap, {
            x: bottle.velocity.x + axis.x * 7,
            y: bottle.velocity.y + axis.y * 7,
          });
          Body.setAngularVelocity(fizzCap, bottle.angularVelocity * 1.4);
        }
        const pulse = 0.58 + Math.max(0, Math.sin(arenaTime * 13 + rarePhase)) * 0.42;
        state.thrustVector = {
          x: -axis.x * bottle.mass * 0.00030 * pulse,
          y: -axis.y * bottle.mass * 0.00030 * pulse,
        };
        Body.applyForce(bottle, bottle.position, {
          x: state.thrustVector.x,
          y: state.thrustVector.y,
        });
      } else if (kind === 'golden-balance' && hasFlipped && bottle.position.y > groundY - 180) {
        Body.setAngularVelocity(bottle,
          bottle.angularVelocity * 0.91 - normalizeSignedAngle(bottle.angle) * 0.035);
      } else if (kind === 'earthquake') {
        const offsetX = Math.sin(arenaTime * 25 + rarePhase) * 11;
        const offsetY = Math.sin(arenaTime * 37 + rarePhase * 0.7) * 4;
        state.tableOffset = { x: offsetX, y: offsetY };
        Body.setPosition(ground, {
          x: state.groundOrigin.x + offsetX,
          y: state.groundOrigin.y + offsetY,
        });
        if (bottle.position.y > groundY - 170) {
          Body.applyForce(bottle, { x: bottle.position.x, y: bottle.position.y + 45 }, {
            x: Math.sin(arenaTime * 25 + rarePhase) * bottle.mass * 0.0017,
            y: Math.cos(arenaTime * 37 + rarePhase) * bottle.mass * 0.00055,
          });
        }
      } else if (kind === 'shrink' && airborne && !state.flags.shrunk && state.elapsedMs >= 240) {
        state.flags.shrunk = true;
        state.bodyScale = config.bodyScale || 0.62;
        const angularMomentum = bottle.inertia * bottle.angularVelocity;
        Body.scale(bottle, state.bodyScale, state.bodyScale);
        if (Number.isFinite(bottle.inertia) && bottle.inertia > 0) {
          Body.setAngularVelocity(bottle, angularMomentum / bottle.inertia);
        }
        state.angularSpeedAfter = bottle.angularVelocity;
      } else if (kind === 'portals' && airborne && !state.flags.teleported) {
        const entry = state.portals[0], exitPortal = state.portals[1];
        if (Math.hypot(bottle.position.x - entry.x, bottle.position.y - entry.y) < entry.radius) {
          const beforeSpeed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
          const beforeSpin = bottle.angularVelocity;
          const c = Math.cos(state.portalRotation);
          const s = Math.sin(state.portalRotation);
          const vx = bottle.velocity.x * c - bottle.velocity.y * s;
          const vy = bottle.velocity.x * s + bottle.velocity.y * c;
          const speed = Math.max(0.000001, Math.hypot(vx, vy));
          state.flags.teleported = true;
          Body.setPosition(bottle, {
            x: exitPortal.x + vx / speed * (exitPortal.radius + 12),
            y: exitPortal.y + vy / speed * (exitPortal.radius + 12),
          });
          Body.setVelocity(bottle, { x: vx, y: vy });
          Body.setAngularVelocity(bottle, beforeSpin);
          state.conservation = {
            speedBefore: beforeSpeed,
            speedAfter: Math.hypot(vx, vy),
            spinBefore: beforeSpin,
            spinAfter: bottle.angularVelocity,
            directionRotation: state.portalRotation,
          };
        }
      } else if (kind === 'tether' && state.constraint && !state.flags.released) {
        const dx = bottle.position.x - state.anchor.x;
        const dy = bottle.position.y - state.anchor.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        state.cableDistance = dist;
        state.cableStretch = dist - state.cableLength;
        state.cableAngleFromDown = Math.atan2(dx, dy);
        const nearLowPoint = Math.abs(state.cableAngleFromDown) < 0.20;
        if (state.elapsedMs > 280 && bottle.velocity.y >= 0 && nearLowPoint) {
          World.remove(world, state.constraint);
          eventConstraints = eventConstraints.filter((item) => item !== state.constraint);
          state.constraint = null;
          state.flags.released = true;
          state.releaseAngle = state.cableAngleFromDown;
          state.releaseMs = state.elapsedMs;
        }
      } else if (kind === 'mitosis' && airborne && !state.flags.split && state.elapsedMs >= 240) {
        const initialVelocity = { ...bottle.velocity };
        const initialAngularVelocity = bottle.angularVelocity;
        const originalMass = bottle.mass;
        const originalInertia = bottle.inertia;
        mitosisBottle = cloneEventBottle(1, 'mitosis-bottle');
        Body.setPosition(mitosisBottle, { x: bottle.position.x + 42, y: bottle.position.y });
        Body.setAngle(mitosisBottle, bottle.angle);
        Body.setPosition(bottle, { x: bottle.position.x - 42, y: bottle.position.y });
        Body.setMass(bottle, originalMass * 0.5);
        Body.setMass(mitosisBottle, originalMass * 0.5);
        const splitVelocity = 2.6;
        Body.setVelocity(bottle, { x: initialVelocity.x - splitVelocity, y: initialVelocity.y });
        Body.setVelocity(mitosisBottle, { x: initialVelocity.x + splitVelocity, y: initialVelocity.y });
        Body.setAngularVelocity(bottle, initialAngularVelocity);
        Body.setAngularVelocity(mitosisBottle, initialAngularVelocity);
        state.secondary = mitosisBottle;
        state.flags.split = true;
        state.splitTrackers = [
          { body: bottle, launchAngle: bottle.angle, previousAngle: bottle.angle,
            rotation: totalRotation, requireFlip: true },
          { body: mitosisBottle, launchAngle: mitosisBottle.angle, previousAngle: mitosisBottle.angle,
            rotation: totalRotation, requireFlip: true },
        ];
        state.massConservationError = Math.abs(
          bottle.mass + mitosisBottle.mass - originalMass);
        state.angularMomentumError = Math.abs(
          bottle.inertia * bottle.angularVelocity +
          mitosisBottle.inertia * mitosisBottle.angularVelocity -
          originalInertia * initialAngularVelocity);
      } else if (kind === 'cap-toss' && airborne && !state.flags.split && state.elapsedMs >= 210) {
        const axis = { x: Math.sin(bottle.angle), y: -Math.cos(bottle.angle) };
        capTossCap = Bodies.rectangle(bottle.position.x + axis.x * 74,
          bottle.position.y + axis.y * 74, 28, 9, {
            label: 'cap-toss-cap', density: 0.00035, restitution: 0.28,
            friction: 0.76, frictionAir: 0.006,
          });
        Body.setAngle(capTossCap, bottle.angle);
        World.add(world, capTossCap);
        eventBodies.push(capTossCap);
        Body.setVelocity(capTossCap, {
          x: bottle.velocity.x + axis.x * 5.2,
          y: bottle.velocity.y + axis.y * 5.2,
        });
        Body.setAngularVelocity(capTossCap, bottle.angularVelocity * 1.65);
        state.secondary = capTossCap;
        state.flags.split = true;
        state.splitTrackers = [
          { body: bottle, launchAngle, rotation: totalRotation, requireFlip: true },
          { body: capTossCap, launchAngle: capTossCap.angle, rotation: 0, capBody: true },
        ];
      } else if (kind === 'meteors') {
        for (const meteor of eventBodies) {
          if (meteor.position.y > groundY + 100) {
            Body.setPosition(meteor, { x: canvasW * (0.15 + randEvent() * 0.7), y: ceilingY - 80 });
            Body.setVelocity(meteor, { x: (randEvent() - 0.5) * 4, y: 6 + randEvent() * 3 });
          }
        }
      } else if (kind === 'black-hole' && airborne && state.elapsedMs < 2200) {
        const dx = state.singularity.x - bottle.position.x;
        const dy = state.singularity.y - bottle.position.y;
        const d2 = Math.max(3600, dx * dx + dy * dy);
        const dist = Math.sqrt(d2);
        const pull = Math.min(0.002, 50 / d2) * bottle.mass;
        const vector = { x: dx / dist * pull, y: dy / dist * pull };
        Body.applyForce(bottle, bottle.position, vector);
        state.attractionVector = vector;
        state.attractionDistance = dist;
      } else if (kind === 'boomerang' && airborne) {
        if (!state.direction) {
          state.direction = bottle.velocity.x < 0 ? -1 : 1;
          state.targetX = state.originX - state.direction * Math.min(260, canvasW * 0.22);
        }
        const descending = bottle.velocity.y > 0;
        const desiredX = descending ? state.targetX
          : state.originX + state.direction * Math.min(300, canvasW * 0.25);
        const dx = desiredX - bottle.position.x;
        const curve = Math.max(-1, Math.min(1, dx / Math.max(180, canvasW * 0.18)));
        Body.applyForce(bottle, bottle.position, {
          x: curve * bottle.mass * (descending ? 0.00105 : 0.00072),
          y: descending ? bottle.mass * 0.00003 : 0,
        });
        state.returnArc = { targetX: state.targetX, desiredX, descending };
        if (descending && Math.abs(bottle.position.x - state.targetX) < 55) state.flags.returned = true;
      } else if (kind === 'roulette') {
        state.wheelAngle += state.wheelAngularVelocity * FIXED_DT;
        Body.setAngle(state.wheelBody, state.wheelAngle);
        if (touchingFloor()) {
          Body.applyForce(bottle, bottle.position, {
            x: state.wheelAngularVelocity * bottle.mass * 0.00046,
            y: 0,
          });
        }
      } else if (kind === 'mirror' && mirrorBottle) {
        syncMirrorPresentation();
      } else if ((kind === 'magnet' || kind === 'life-drain') && airborne && hasFlipped) {
        const target = canvasW / 2;
        const dx = target - bottle.position.x;
        const strength = kind === 'life-drain' ? 0.00055 : 0.00030;
        const force = Math.max(-1, Math.min(1, dx / Math.max(90, canvasW * 0.15))) *
          bottle.mass * strength;
        Body.applyForce(bottle, bottle.position, { x: force, y: bottle.mass * 0.000035 });
        state.magnetVector = { x: force, y: bottle.mass * 0.000035, targetX: target };
      }
      if (kind === 'gravity-slam') {
        const distance = Math.max(0, groundY - bottle.bounds.max.y);
        state.compression = Math.max(0, Math.min(1, 1 - distance / 150));
      }
      return undefined;
    }

    if (phase === 'contact') {
      state.phase = 'contact';
      if (kind === 'liquid-shift') state.flags.baseStabilizing = true;
      if (kind === 'bouncy') {
        const contact = Math.min(state.contacts, state.maxBounces);
        const restitution = [0.88, 0.58, 0.26][Math.max(0, contact - 1)] || 0.02;
        state.bounces = contact;
        state.bouncePeakSpeeds.push(Math.abs(bottle.velocity.y));
        for (const part of [bottle, ...bottle.parts]) part.restitution =
          state.contacts >= state.maxBounces ? 0.02 : restitution;
        if (state.contacts >= state.maxBounces && bottle.velocity.y < 0) {
          const finalBounceY = state.contacts === state.maxBounces
            ? bottle.velocity.y * 0.22 : 0;
          Body.setVelocity(bottle, { x: bottle.velocity.x * 0.72, y: finalBounceY });
          state.flags.bouncesComplete = true;
        }
      }
      return undefined;
    }

    if (phase === 'resolve') {
      state.phase = 'resolved';
      state.verdict = lastLandingInfo && lastLandingInfo.result;
      return undefined;
    }

    if (phase === 'cleanup') {
      if (kind === 'shrink' && state.bodyScale && bottle) {
        Body.scale(bottle, 1 / state.bodyScale, 1 / state.bodyScale);
      }
      if ((kind === 'golden-balance' || kind === 'mitosis') && state.originalMass && bottle) {
        Body.setMass(bottle, state.originalMass);
      }
      if (kind === 'rewind' && bottle.isStatic) Body.setStatic(bottle, false);
      if (kind === 'earthquake' && state.groundOrigin && ground) {
        Body.setPosition(ground, state.groundOrigin);
      }
      removeEventBodies();
      if (kind === 'plinko' && plinko) clearPlinko();
      applyBodyMaterial();
      if (engine) engine.gravity.y = profile.gravity;
      requiredRotation = 5.6;
      capThrowArmed = false;
      if (ground) ground.collisionFilter.mask = state.groundMask == null
        ? 0xFFFFFFFF : state.groundMask;
      if (ceilingBody) {
        ceilingBody.restitution = profile.wallBounce;
        ceilingBody.collisionFilter.mask = profile.ceiling ? 0xFFFFFFFF : 0;
      }
      if (kind === 'alien') {
        temporaryAlien = false;
        if (!profile.landOnTarget) { targetX = null; targetY = null; }
        layoutArena();
        buildObstacles(arenaH);
      }
      return undefined;
    }
    return undefined;
  }

  function eventContext(seed) {
    return { seed, physics: Physics, applyEventEffect };
  }

  function prepareActiveEvent(id, seed) {
    const events = eventSystem();
    activeEventDefinition = events ? events.get(id) : null;
    activeEventMetadata = activeEventDefinition ? activeEventDefinition.metadata : null;
    if (!activeEventDefinition || !events) return;
    eventController = events.createController();
    eventController.prepare(activeEventDefinition, eventContext(seed));
  }

  function cleanupActiveEvent(reason) {
    if (eventController && eventController.active()) {
      eventController.cleanup(Object.assign(eventContext(lastFlickInfo && lastFlickInfo.seed), { reason }));
    } else {
      removeEventBodies();
    }
    eventController = null;
    activeEventDefinition = null;
    activeEventMetadata = null;
    eventRuntime = null;
    rareEvent = null;
  }

  // Pass an explicit `seed` to replay a flick's exact randomness (multiplayer);
  // otherwise a fresh seed is drawn and recorded in lastFlickInfo.
  // Does NOT re-roll the pad — that was seeded in seedTurn().
  function applyFlick(vx, vy, seed, rareMultiplier = 1, eventMode = 'normal', alwaysMagnet = false, eventPolicy = {}) {
    const s = (seed !== undefined && seed !== null
      ? seed
      : Math.floor(Math.random() * 0xffffffff)) >>> 0;
    seedRng(s);
    seedEventRng(mixSeed(s, 0x51ed270b));
    simElapsedMs = 0;
    landingPhase = 'airborne';
    firstContactMs = null;
    settlingStartedMs = null;
    contactCount = 0;
    bounceCount = 0;
    previousTouching = false;
    eventResultMetadata = null;

    const eventMultiplier = Number.isFinite(rareMultiplier) ? Math.max(1, rareMultiplier) : 1;
    const excludedEventIds = Array.isArray(eventPolicy && eventPolicy.excludedEventIds)
      ? eventPolicy.excludedEventIds.map((id) => String(id))
      : [];
    const excludedEvents = new Set(excludedEventIds);
    const mode = String(eventMode || 'normal').toLowerCase();
    const eventsDisabled = mode === 'disabled' || mode === 'off' || mode === 'none';
    const pendingForcedEvent = forcedSpecialEvent;
    forcedSpecialEvent = null;
    const forcedEvent = eventsDisabled || excludedEvents.has(pendingForcedEvent)
      ? null
      : pendingForcedEvent;
    const modernEvents = eventSystem();
    const legacyPlinko = !modernEvents && !forcedEvent && plinkoEnabled &&
      (mode === 'insane' || mode === 'insanity'
        ? insanityEventForSeed(s, excludedEventIds) === 'plinko'
        : (s % adjustedOdds(1000, eventMultiplier)) ===
          (123 % adjustedOdds(1000, eventMultiplier)));
    const rolledEvent = forcedEvent || legacyPlinko ||
      (eventsDisabled
        ? null
        : (mode === 'insane' || mode === 'insanity'
          ? insanityEventForSeed(s, excludedEventIds)
          : rareEventForSeed(s, false, eventMultiplier, excludedEventIds)));
    const plinkoRoll = forcedEvent === 'plinko' ||
      (plinkoEnabled && (rolledEvent === 'plinko' || rolledEvent === true));
    const effectiveEvent = rolledEvent === 'plinko' && !plinkoRoll ? null : rolledEvent;
    if (plinkoRoll) startPlinko();

    rareEvent = plinkoRoll ? null : effectiveEvent;
    rareImpulseUsed = false;
    rareEffectFrames = 0;
    alwaysMagnetActive = !!alwaysMagnet;
    temporaryAlien = rareEvent === 'alien-invasion';
    bankHits = 0;
    if (temporaryAlien) {
      configureTemporaryAlienArena();
      openArena = false;
      sideWallsEnabled = true;
      leftWall.collisionFilter.mask = 0xFFFFFFFF;
      rightWall.collisionFilter.mask = 0xFFFFFFFF;
      ceilingBody.collisionFilter.mask = 0xFFFFFFFF;
      leftWall.restitution = rightWall.restitution = ceilingBody.restitution = 0.96;
      for (const part of [bottle, ...bottle.parts]) {
        part.frictionAir = 0.003;
        part.restitution = 0.90;
      }
      placeTemporaryAlienTarget();
    }
    rarePhase = randEvent() * Math.PI * 2;
    requiredRotation = rareEvent === 'double-flip' ? Math.PI * 4 : 5.6;

    const moon = rareEvent === 'moon-gravity';
    const gravityScale = temporaryAlien ? 0.08
      : (moon ? 0.28 : (rareEvent === 'gravity-slam' ? 2.55 : 1));
    if (engine) engine.gravity.y = temporaryAlien ? 0.10 : profile.gravity * gravityScale;
    prepareActiveEvent(plinkoRoll ? 'plinko' : effectiveEvent, s);

    // CAP THROW (~1/100, seed-rolled): normal spin tuning lands completed
    // flips upright, so an inverted touchdown never occurs naturally. These
    // throws over-rotate by ~an extra half turn so the object genuinely
    // arrives upside down, then the cap-sticky assist below can balance it
    // on the cap for the ×2. A cap throw that arrives badly just misses.
    const capOdds = adjustedOdds(101, eventMultiplier);
    capThrowArmed = !profile.floorResolve && !plinkoRoll &&
      (rareEvent === 'cap-toss' || (!rareEvent &&
      (s % capOdds) === (55 % capOdds)));

    const upSpeed = Math.max(0, -vy);
    const power   = Math.min(upSpeed / POWER_SPEED, 1.0);

    const jSpin   = 1 + (rand() - 0.5) * 0.10;   // mild spin chaos
    const jLaunch = 1 + (rand() - 0.5) * 0.06;   // mild height chaos
    const jDrift  = (rand() - 0.5) * 1.1;        // mild sideways chaos

    // Slightly lower arcs than the "harder/higher/wilder" feel (was 16 + power*5).
    const baseLaunchY = -(15.2 + power * 4.7) * jLaunch;
    let launchY = baseLaunchY * profile.launchScale;
    let launchX = Math.max(-profile.horizMax,
      Math.min(profile.horizMax, vx / profile.horizDivisor)) + jDrift;

    if (alienShotActive()) {
      const alienMetrics = alienMetricsForViewport(viewW || canvasW, viewH || arenaH);
      // Preserve the player's horizontal aim. The old fixed-speed/random-side
      // launch turned almost every gesture into the same guaranteed bank shot.
      // Scaling both axes with the arena keeps the gesture equivalent from a
      // phone through a 4K board while still requiring deliberate lateral aim.
      const lateralAim = Math.max(-1, Math.min(1, vx / 700));
      launchX = lateralAim * (34 + power * 8) * alienMetrics.launchScale;
      // Alien's gesture-to-arena normalization owns the viewport scale. Native
      // Alien's legacy profile also carries launchScale=1.5; applying both made
      // native shots 50% hotter than the identically scored Alien Invasion and
      // produced strong tablet/desktop outcome drift.
      const nativeLaunchCalibration = temporaryAlien ? 1 : 1.25;
      launchY = -Math.max(7, Math.abs(baseLaunchY) * 0.52 * nativeLaunchCalibration) *
        alienMetrics.launchScale;
    }

    // A tethered throw starts tangentially from the cable's low point. The
    // constraint supplies the centripetal force, replacing the usual parabola.
    if (rareEvent === 'tether-swing') {
      const swingDirection = Math.cos(rarePhase) < 0 ? -1 : 1;
      launchX = swingDirection * (15 + power * 4);
      launchY = 8 + power * 2;
    }

    if (profile.minHorizRatio > 0) {
      const minX = Math.abs(launchY) * profile.minHorizRatio;
      if (Math.abs(launchX) < minX) launchX = (launchX >= 0 ? 1 : -1) * minX;
    }

    const dir  = vx >= 0 ? 1 : -1;
    let spin = dir * (spinBase + power * spinRange) * jSpin * profile.spinScale *
      (capThrowArmed ? 1.52 : 1);
    if (temporaryAlien) spin *= 0.72;

    // Extreme gravity changes need matching spin timing so the spectacle does
    // not secretly predetermine a miss before the player can see it play out.
    if (rareEvent === 'moon-gravity') spin *= 0.76;
    if (rareEvent === 'gravity-slam') spin *= 1.72;
    if (rareEvent === 'wind-tunnel') spin *= 1.42;

    // 1/100 — POWER LAUNCH: a visibly taller, faster, harder-spinning throw.
    if (rareEvent === 'power-launch') {
      launchY *= 1.72;
      // Still reads as a stronger spin, but avoids the old tuning where every
      // possible gesture was normalized onto an upright final rotation.
      spin *= 1.34;
    }
    // Rainbow is now a physical corkscrew as well as a visible trail.
    if (rareEvent === 'rainbow-corkscrew' || rareEvent === 'rainbow-trail') {
      launchY *= 1.18;
      spin *= 0.94;
    }
    if (rareEvent === 'fizz-jet') {
      launchY *= 1.12;
      spin *= 1.08;
    }
    if (rareEvent === 'half-full') spin *= 0.90;
    if (rareEvent === 'tether-swing') spin *= 1.18;
    if (rareEvent === 'ceiling-flip') {
      // Inverted gravity supplies the rise. A slightly softer initial impulse
      // preserves normal-flip airtime instead of slamming into the ceiling
      // before the player's rotation can complete.
      launchY *= 0.65;
      spin *= 1.32;
    }
    // Life Drain's hidden magnet needs a completed rotation to catch. A small
    // initial spin assist keeps ordinary classroom flicks inside that catch.
    if (rareEvent === 'life-drain') spin *= 1.12;

    lastFlickInfo = {
      upSpeed: Math.round(upSpeed),
      power: +power.toFixed(2),
      spin: +spin.toFixed(3),
      seed: s,
      moon,
      gravityScale,
      plinko: plinkoRoll,
      rareEvent,
      eventId: plinkoRoll ? 'plinko' : effectiveEvent,
      eventMetadata: activeEventMetadata,
      alwaysMagnet: alwaysMagnetActive,
      rareMultiplier: eventMultiplier,
      requiredTurns: rareEvent === 'double-flip' ? 2 : 1,
      vx: Math.round(vx),
      vy: Math.round(vy),
      trajectoryJitter: { spin: jSpin, launch: jLaunch, drift: jDrift },
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
    simElapsedMs += FIXED_DT * 1000;

    if (eventController && eventController.active()) {
      eventController.applyPhysics(eventContext(lastFlickInfo && lastFlickInfo.seed));
    }

    if (launched && !wasAirborne && bottle.bounds.max.y < groundY - 24) wasAirborne = true;
    if (launched && wasAirborne) flightFrames++;

    if (launched && !plinko &&
        !(eventRuntime && eventRuntime.kind === 'rewind' && eventRuntime.flags.reversing)) {
      const nowTouching = touchingLandingPlane();
      if (wasAirborne && nowTouching && !previousTouching) {
        contactCount++;
        if (firstContactMs == null) {
          firstContactMs = simElapsedMs;
          landingPhase = 'contact';
        } else {
          bounceCount++;
        }
        if (eventController && eventController.active()) {
          eventController.onContact(Object.assign(eventContext(lastFlickInfo && lastFlickInfo.seed), {
            contactIndex: contactCount,
            elapsedMs: simElapsedMs,
          }));
        }
      } else if (landingPhase === 'contact' && simElapsedMs > firstContactMs) {
        landingPhase = 'settling';
        settlingStartedMs = simElapsedMs;
        if (eventRuntime) eventRuntime.phase = 'settling';
      }
      previousTouching = nowTouching;
    }

    // Once a bank arms the Alien tractor ring, its beam bends the zero-G path
    // toward the target. The bank remains the player-controlled challenge;
    // the pull makes the finish readable and avoids endless random orbiting.
    if (alienShotActive() && launched && wasAirborne && bankHits > 0 &&
        targetX != null && targetY != null) {
      const dx = targetX - bottle.position.x;
      const dy = targetY - bottle.position.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const metrics = alienMetricsForViewport(viewW || canvasW, viewH || arenaH);
      let nativePullCalibration = 1;
      if (profile.alienPortal && !temporaryAlien) {
        if (metrics.scale < 0.85) nativePullCalibration = 0.85;
        else if (metrics.scale >= 2) nativePullCalibration = 1.10;
      }
      const pull = metrics.attractionPerStep * nativePullCalibration;
      Body.setVelocity(bottle, {
        x: bottle.velocity.x + dx / dist * pull,
        y: bottle.velocity.y + dy / dist * pull,
      });
    }

    // 1/300 — ICE SLIDE: the first touchdown kicks into a long, slick lateral
    // skid before normal table friction returns. Direction is seed-derived.
    if (rareEvent === 'ice-slide' && launched && wasAirborne && !rareImpulseUsed &&
        bottle.bounds.max.y >= groundY - GROUND_TOUCH_PX && bottle.velocity.y > 0.5) {
      rareImpulseUsed = true;
      rareEffectFrames = 300;
      const direction = Math.cos(rarePhase) < 0 ? -1 : 1;
      Body.setVelocity(bottle, {
        x: direction * Math.max(27, Math.abs(bottle.velocity.x) + 20),
        y: -4.2,
      });
      Body.setAngularVelocity(bottle, bottle.angularVelocity + direction * 0.08);
      if (eventRuntime) {
        eventRuntime.flags.sliding = true;
        eventRuntime.slideDirection = direction;
      }
    }
    if (rareEvent === 'ice-slide' && rareEffectFrames > 0) {
      rareEffectFrames--;
      const returnProgress = rareEffectFrames > 120 ? 0 : (120 - rareEffectFrames) / 120;
      const friction = 0.001 + (profile.friction - 0.001) * returnProgress;
      for (const part of [bottle, ...bottle.parts]) part.friction = friction;
      if (eventRuntime) {
        eventRuntime.iceFriction = friction;
        eventRuntime.frictionReturnProgress = returnProgress;
      }
      if (rareEffectFrames === 0) {
        applyBodyMaterial();
        // Let the huge skid end decisively, then give the already-flipped
        // object a fair chance to stand instead of grading the slide a miss.
        Body.setVelocity(bottle, { x: bottle.velocity.x * 0.10, y: Math.min(0, bottle.velocity.y) });
        groundedFrames = 0;
        angleWin = [];
      }
    }

    // POWER LAUNCH starts with a visibly hotter spin, then its launch shock
    // normalizes angular momentum while leaving the 1.72x vertical impulse
    // intact. The old sustained spin multiplier mapped every possible gesture
    // to the same upright final rotation.
    if (rareEvent === 'power-launch' && launched && wasAirborne && !rareImpulseUsed &&
        flightFrames >= 1) {
      rareImpulseUsed = true;
      const gesturePower = Math.max(0, Math.min(1,
        lastFlickInfo && Number(lastFlickInfo.power) || 0));
      const skilledSpinMultiplier = 1 + 0.34 * Math.min(1, gesturePower / 0.65);
      Body.setAngularVelocity(bottle,
        bottle.angularVelocity * skilledSpinMultiplier / 1.34);
      if (eventRuntime) {
        eventRuntime.flags.powerShockReleased = true;
        eventRuntime.powerShockSpin = bottle.angularVelocity;
      }
    }

    // 1/500 — TRAMPOLINE TABLE: the first touchdown springs the object into a
    // second arc. It still has to complete a valid flip and settle normally.
    if (rareEvent === 'trampoline' && launched && wasAirborne && !rareImpulseUsed &&
        bottle.bounds.max.y >= groundY - GROUND_TOUCH_PX && bottle.velocity.y > 0.5) {
      rareImpulseUsed = true;
      Body.setVelocity(bottle, {
        x: bottle.velocity.x * 0.78,
        // A real second launch, not a table bounce: at least as powerful as a
        // strong original flick and even hotter after a hard impact.
        y: -Math.max(32, Math.abs(bottle.velocity.y) * 1.75),
      });
      Body.setPosition(bottle, { x: bottle.position.x, y: bottle.position.y - 18 });
      // Preserve the player's spin through the spring instead of injecting the
      // extra rotation that made even rejected inputs settle upright.
      const springPower = Math.max(0, Math.min(1,
        lastFlickInfo && Number(lastFlickInfo.power) || 0));
      const retainedSpringSpin = 0.80 + 0.20 * Math.min(1, springPower / 0.55);
      Body.setAngularVelocity(bottle, bottle.angularVelocity * retainedSpringSpin);
      groundedFrames = 0;
      angleWin = [];
      // The launch is a new airborne phase. The first trampoline compression
      // cannot consume the settle budget for the actual return landing.
      firstContactMs = null;
      settlingStartedMs = null;
      landingPhase = 'airborne';
      previousTouching = false;
      if (eventRuntime) {
        eventRuntime.flags.relaunched = true;
        eventRuntime.phase = 'relaunch';
        eventRuntime.relaunchVelocity = { ...bottle.velocity };
      }
    }

    // 1/600 — WIND TUNNEL: a strong deterministic crosswind sweeps the object
    // in one direction for the whole arc. Apply above center so the gust also
    // produces a visible lean. Force is mass-scaled across every edition.
    if (rareEvent === 'wind-tunnel' && launched && wasAirborne &&
        bottle.bounds.max.y < groundY - GROUND_TOUCH_PX) {
      const direction = Math.cos(rarePhase) < 0 ? -1 : 1;
      const pulse = 0.75 + Math.sin(arenaTime * 5.2 + rarePhase) * 0.25;
      const gust = direction * pulse * bottle.mass * 0.00155;
      const spinDir = bottle.angularVelocity < 0 ? -1 : 1;
      Body.applyForce(bottle, {
        x: bottle.position.x,
        // Put the gust on the side that reinforces the player's rotation.
        // The old fixed-above-center force cancelled half of all flips.
        y: bottle.position.y - 40 * spinDir * direction,
      }, { x: gust, y: 0 });
      if (eventRuntime) eventRuntime.gustVector = { x: gust, y: 0 };
    }

    // 1/700 — DOUBLE FLIP: on the first descent, a rocket-like impulse sends
    // the object through a second aerial arc with extra spin.
    if (rareEvent === 'double-flip' && launched && wasAirborne && !rareImpulseUsed &&
        bottle.velocity.y > 1 && bottle.position.y < groundY - 180) {
      rareImpulseUsed = true;
      Body.setVelocity(bottle, { x: bottle.velocity.x * 0.92, y: -18.0 });
      const spinDir = bottle.angularVelocity < 0 ? -1 : 1;
      Body.setAngularVelocity(bottle, bottle.angularVelocity + spinDir * 0.150);
      if (eventRuntime) {
        eventRuntime.flags.doubleFlipAssisted = true;
        eventRuntime.assistVelocity = { ...bottle.velocity };
      }
    }

    // HEART RUSH: three visible physical pulses, each smaller than the last,
    // stabilize the arc without converting the event into an automatic make.
    if (rareEvent === 'heart-rush' && eventRuntime && launched && wasAirborne &&
        bottle.bounds.max.y < groundY - 70) {
      const count = eventRuntime.heartbeatCount || 0;
      const threshold = 260 + count * 240;
      if (count < 3 && eventRuntime.elapsedMs >= threshold) {
        const direction = Math.cos(rarePhase + count) < 0 ? -1 : 1;
        const lift = [8.5, 6.2, 4.4][count];
        Body.setVelocity(bottle, {
          x: bottle.velocity.x + direction * (2.8 - count * 0.6),
          y: Math.min(bottle.velocity.y, -lift),
        });
        // The heartbeat steadies existing angular momentum; it must not create
        // the missing rotation for an under-powered throw.
        const dampedSpin = bottle.angularVelocity * (0.94 - count * 0.06);
        Body.setAngularVelocity(bottle, dampedSpin);
        eventRuntime.heartbeatCount = count + 1;
        eventRuntime.lastHeartbeatMs = eventRuntime.elapsedMs;
        if (eventRuntime.heartbeatCount === 3) eventRuntime.flags.threePulsesComplete = true;
      }
    }

    // 1/50 — RAINBOW COMET: a real corkscrew path, not merely a color change.
    if ((rareEvent === 'rainbow-corkscrew' || rareEvent === 'rainbow-trail') && launched && wasAirborne &&
        bottle.bounds.max.y < groundY - GROUND_TOUCH_PX) {
      const wave = Math.sin(arenaTime * 9 + rarePhase);
      const corkscrewForce = {
        x: wave * bottle.mass * 0.00062,
        y: -Math.abs(wave) * bottle.mass * 0.00010,
      };
      Body.applyForce(bottle, { x: bottle.position.x, y: bottle.position.y - 34 }, corkscrewForce);
      if (eventRuntime) eventRuntime.corkscrewForce = corkscrewForce;
    }

    // 1/800 — MAGNET LANDING, plus Life Drain's hidden stronger magnet. Once
    // the required rotation is complete, an upright torque guides the descent.
    let landingAssist = {
      'rainbow-corkscrew': 0.060,
      'rainbow-trail': 0.060,
      'moon-gravity': 0.070,
      'gravity-slam': 0.075,
      'double-flip': 0.050,
    }[rareEvent] || 0;
    // Power Launch is controlled rather than self-landing: only a genuinely
    // strong player gesture earns its modest stabilizing torque. Weak and
    // downward inputs retain the spectacle but remain ordinary misses.
    if (rareEvent === 'power-launch' && lastFlickInfo && lastFlickInfo.power >= 0.55) {
      landingAssist = 0.040;
    }
    if (rareEvent === 'trampoline' && lastFlickInfo && lastFlickInfo.power >= 0.55) {
      landingAssist = 0.040;
    }
    if (rareEvent === 'heart-rush' && lastFlickInfo && lastFlickInfo.power >= 0.55) {
      landingAssist = 0.055;
    }
    if (rareEvent === 'wind-tunnel' && lastFlickInfo && lastFlickInfo.power >= 0.55) {
      landingAssist = 0.050;
    }
    const magnetStrength = rareEvent === 'life-drain' ? 0.125
      : (rareEvent === 'magnet' ? 0.085
      : (rareEvent === 'ice-slide' && rareImpulseUsed ? 0.078
      : (alwaysMagnetActive ? 0.085 : landingAssist)));
    if (magnetStrength && launched && hasFlipped &&
        bottle.position.y > groundY - 210 && !plinko) {
      const tilt = normalizeSignedAngle(bottle.angle);
      const damping = rareEvent === 'life-drain' ? 0.70
        : (rareEvent === 'ice-slide' ? 0.82 : 0.86);
      Body.setAngularVelocity(bottle, bottle.angularVelocity * damping - tilt * magnetStrength);
    }
    if (rareEvent === 'ceiling-flip' && launched && hasFlipped &&
        bottle.position.y < ceilingY + 230) {
      // The inverted landing plane needs the same real, visible settling chance
      // ordinary table friction gives a base landing. Apply a bounded alignment
      // torque only after the required flip has completed; weak/under-rotated
      // attempts still fail normally.
      const ceilingTilt = normalizeSignedAngle(bottle.angle - Math.PI);
      Body.setAngularVelocity(bottle,
        bottle.angularVelocity * 0.84 - ceilingTilt * 0.072);
      if (eventRuntime) eventRuntime.ceilingTorque = -ceilingTilt * 0.072;
    }

    // One ground thud per flick (positional — Matter ground collisions are dead
    // / masked in bounce mode, so we can't rely on collisionStart for the floor).
    if (onImpact && launched && wasAirborne && !groundImpactSent && !plinko &&
        bottle.bounds.max.y >= groundY - GROUND_TOUCH_PX && bottle.velocity.y > 0.5) {
      groundImpactSent = true;
      const speed = Math.hypot(bottle.velocity.x, bottle.velocity.y);
      onImpact('ground', speed, bottle.position.x, groundY);
    }

    totalRotation = Math.max(totalRotation, Math.abs(bottle.angle - launchAngle));
    if (!hasFlipped && totalRotation >= requiredRotation) hasFlipped = true;

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

    // Several ordinary post-hook forces (landing assist/cap stick) can change
    // the source after EventController.applyPhysics. Resync at the end of the
    // fixed step so the visible clone is an exact reflection in the same frame.
    if (rareEvent === 'mirror-match') syncMirrorPresentation();
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
    // Plinko drop: follow the falling object instead of shrinking the entire
    // long board into one frame. This keeps the character readable and clear
    // of a crowded 8-player HUD; when it reaches the bins, their labels travel
    // into view with it.
    if (plinko && bottle) {
      const boardW = plinko.right - plinko.left;
      // Wide classroom boards stay nearly full-size. Compact screens still
      // retain enough nearby pegs to make the fall understandable.
      const contextW = Math.min(1100, Math.max(720, boardW + 120));
      const zoom = Math.max(0.68, Math.min(0.92, vw / contextW));
      return {
        openArena,
        sideWalls: false,   // arena walls are dead + the board has its own rails
        zoom,
        camX: bottle.position.x,
        camY: bottle.position.y + 20,
        worldW: canvasW,
        worldH: plinko.bottom + 90,
        tracking: 'plinko',
        trackingData: {
          boardTop: plinko.top,
          boardBottom: plinko.bottom,
          slotBandTop: plinko.bottom - plinko.slotH,
          progress: Math.max(0, Math.min(1,
            (bottle.position.y - plinko.top) / Math.max(1, plinko.bottom - plinko.top))),
          antiWedgeNudges: plinkoNudges,
          slots: plinko.slots.map((slot, index) => ({
            index, kind: slot.kind, x0: slot.x0, x1: slot.x1,
          })),
        },
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
  function getLandingLifecycle() {
    const input = {
      phase: landingPhase,
      result: landingPhase === 'resolved' && lastLandingInfo ? lastLandingInfo.result : null,
      pose: lastLandingInfo && lastLandingInfo.onCap ? 'cap'
        : (lastLandingInfo && lastLandingInfo.result === 'MAKE' ? 'upright' :
          (landingPhase === 'resolved' ? 'other' : 'unresolved')),
      reason: lastLandingInfo && lastLandingInfo.reason,
      firstContactMs,
      settleMs: firstContactMs == null ? null : Math.max(0, simElapsedMs - firstContactMs),
      tilt: lastLandingInfo && lastLandingInfo.tilt,
      perfect: !!(lastLandingInfo && lastLandingInfo.perfect),
      onCap: !!(lastLandingInfo && lastLandingInfo.onCap),
      rotations: totalRotation / (Math.PI * 2),
      contacts: contactCount,
      bounces: bounceCount,
      banks: bankHits,
      details: eventResultMetadata || {},
    };
    const root = typeof globalThis !== 'undefined' ? globalThis : null;
    const Interfaces = root && root.FlipgameV111Interfaces;
    return Interfaces ? Interfaces.LandingVerdict(input) : input;
  }
  function getEventMetadata() { return activeEventMetadata; }
  function getEventResultMetadata() { return eventResultMetadata; }
  function getEventRenderState(reducedMotion = false) {
    if (!activeEventDefinition) return null;
    const visual = reducedMotion && activeEventDefinition.reducedMotion
      ? activeEventDefinition.reducedMotion({})
      : (activeEventDefinition.render ? activeEventDefinition.render({}) : activeEventMetadata.visual);
    return {
      eventId: activeEventDefinition.id,
      visual,
      metadata: activeEventMetadata,
      runtime: eventRuntime ? {
        elapsedMs: eventRuntime.elapsedMs,
        contacts: eventRuntime.contacts,
        phase: eventRuntime.phase,
        flags: { ...eventRuntime.flags },
        portals: eventRuntime.portals || null,
        portalRotation: eventRuntime.portalRotation,
        conservation: eventRuntime.conservation || null,
        anchor: eventRuntime.anchor || null,
        cableLength: eventRuntime.cableLength,
        cableDistance: eventRuntime.cableDistance,
        cableStretch: eventRuntime.cableStretch,
        cableAngleFromDown: eventRuntime.cableAngleFromDown,
        releaseAngle: eventRuntime.releaseAngle,
        releaseMs: eventRuntime.releaseMs,
        singularity: eventRuntime.singularity || null,
        rouletteSlot: eventRuntime.rouletteSlot,
        wheelAngle: eventRuntime.wheelAngle,
        wheelAngularVelocity: eventRuntime.wheelAngularVelocity,
        wheelCenterX: eventRuntime.wheelCenterX,
        wheelRadius: eventRuntime.wheelRadius,
        landingPlane: eventRuntime.landingPlane || 'floor',
        liquidShift: eventRuntime.liquidShift,
        liquidVelocity: eventRuntime.liquidVelocity,
        angularSpeedAfter: eventRuntime.angularSpeedAfter,
        thrustVector: eventRuntime.thrustVector || null,
        corkscrewForce: eventRuntime.corkscrewForce || null,
        gustVector: eventRuntime.gustVector || null,
        slideDirection: eventRuntime.slideDirection,
        assistVelocity: eventRuntime.assistVelocity || null,
        tableOffset: eventRuntime.tableOffset || null,
        iceFriction: eventRuntime.iceFriction,
        frictionReturnProgress: eventRuntime.frictionReturnProgress,
        compression: eventRuntime.compression,
        bounces: eventRuntime.bounces || 0,
        maxBounces: eventRuntime.maxBounces,
        bouncePeakSpeeds: eventRuntime.bouncePeakSpeeds
          ? eventRuntime.bouncePeakSpeeds.slice() : null,
        heartbeatCount: eventRuntime.heartbeatCount || 0,
        magnetVector: eventRuntime.magnetVector || null,
        returnArc: eventRuntime.returnArc || null,
        originX: eventRuntime.originX,
        targetX: eventRuntime.targetX,
        attractionVector: eventRuntime.attractionVector || null,
        attractionDistance: eventRuntime.attractionDistance,
        rewindProgress: eventRuntime.rewindProgress,
        firstFailureReason: eventRuntime.firstFailureReason || null,
        correctionImpulse: eventRuntime.correctionImpulse || null,
        meteorHits: eventRuntime.meteorHits || 0,
        massConservationError: eventRuntime.massConservationError,
        angularMomentumError: eventRuntime.angularMomentumError,
      } : null,
    };
  }
  function getEventBodies() {
    return eventBodies.map((body) => ({
      label: body.label,
      x: body.position.x,
      y: body.position.y,
      angle: body.angle,
      mass: body.mass,
      inertia: body.inertia,
      velocity: { x: body.velocity.x, y: body.velocity.y },
      angularVelocity: body.angularVelocity,
      bounds: {
        min: { x: body.bounds.min.x, y: body.bounds.min.y },
        max: { x: body.bounds.max.x, y: body.bounds.max.y },
      },
    }));
  }
  function hasDeferredReflow() { return !!pendingReflow; }
  function getArenaProfiles() {
    const events = eventSystem();
    return events ? events.ARENA_PROFILES : null;
  }

  // Force a verdict from the network authority (hybrid lockstep).
  function forceLanding(result, info) {
    const detail = info || {};
    const reason = detail.onCap || detail.reason === 'cap' ? 'cap' : (detail.reason || 'net-authority');
    const verdict = recordLanding(result, detail.tilt != null ? detail.tilt : null, reason);
    if (verdict == null) return null;
    lastLandingInfo.perfect = !!detail.perfect;
    lastLandingInfo.maxTilt = detail.maxTilt || 0;
    if (detail.padOffset != null) lastLandingInfo.padOffset = detail.padOffset;
    return verdict;
  }

  return {
    init, reflow, step, resetBottle, applyFlick, checkLanding, forceLanding,
    getBottle, getLiquid, getGroundY, getLastLandingInfo, getLastFlickInfo,
    setProfile, getTarget, getObstacles, getViewHint, isOpenArena, placeTarget,
    seedTurn, setPlinkoEnabled, forcePlinko, forceSpecialEvent, forceSpecialEventName,
    getPlinko, setFeel,
    rareEventForSeed, insanityEventForSeed,
    getFeel: () => feelMode, setImpactCallback,
    getLandingLifecycle, getEventMetadata, getEventResultMetadata,
    getEventRenderState, getEventBodies, hasDeferredReflow,
    cleanupEvent: cleanupActiveEvent, alienMetricsForViewport, getArenaProfiles,
  };
})();
