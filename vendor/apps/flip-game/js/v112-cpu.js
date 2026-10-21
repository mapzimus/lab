// v112-cpu.js -- deterministic, physical CPU launch intent for v1.12.
//
// Difficulty changes only the gesture a CPU attempts. This module never sees a
// landing verdict, lives, scores, streaks, leaders, or match history, so it
// cannot force a result, adapt mid-match, rubber-band, or grant hidden mercy.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Cpu = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function uint32Seed(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        !Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new TypeError('CPU launch requires an unsigned 32-bit seed');
    }
    return value;
  }

  function mix32(seed, salt) {
    var value = ((Number(seed) >>> 0) ^ (Number(salt) >>> 0)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
  }

  function unit(seed, salt) {
    return mix32(seed, salt) / 4294967296;
  }

  function gaussian(seed, saltA, saltB) {
    var u1 = Math.max(1 / 4294967296, unit(seed, saltA));
    var u2 = unit(seed, saltB);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  var TARGET_BANDS = freeze({
    easy: { minimum: 0.30, maximum: 0.40 },
    medium: { minimum: 0.45, maximum: 0.55 },
    hard: { minimum: 0.60, maximum: 0.70 },
  });

  // Canonical CSS-gesture units, shared with Input's 1280x720 transfer. These
  // are distributions, not scripted outcomes: every tier retains genuine
  // variance and all shots are resolved by the ordinary physics engine.
  var CLASSIC = freeze({
    // Hard used to sit on the 2500 sweet spot with almost no shank. That is
    // how a CPU heater can run for a whole match. Mishits are weak physical
    // releases, not fabricated MISS verdicts.
    easy:   { upMean: 2320, upSigma: 1850, sideSigma: 620, sideLimit: 1040, mishit: 0.16 },
    medium: { upMean: 2410, upSigma: 1280, sideSigma: 440, sideLimit: 840, mishit: 0.07 },
    hard:   { upMean: 2480, upSigma: 640,  sideSigma: 260, sideLimit: 560, mishit: 0.04 },
  });

  // Alien is a different physical technique: aim away from the ring to earn a
  // visible bank, then let the tractor field bend the return. Aim error and
  // launch-height variance shrink with skill, but the ring, forces, and verdict
  // remain exactly the same as a human Alien shot.
  var ALIEN = freeze({
    easy:   { sideMean: 350, sideSigma: 300, upMean: 1800, upSigma: 1100,
      wrongWay: 0.40, mishit: 0.04, readsRing: false },
    medium: { sideMean: 0, sideSigma: 220, upMean: 0, upSigma: 650,
      wrongWay: 0.30, mishit: 0.18, readsRing: true },
    hard:   { sideMean: 0, sideSigma: 90, upMean: 0, upSigma: 260,
      wrongWay: 0.15, mishit: 0.04, readsRing: true },
  });

  // Coarse public shot chart: [canonical sideways speed, canonical up speed].
  // It depends only on the visible court class and ring quadrant. No outcome or
  // prior-shot data is involved. Intermediate viewports select the nearest
  // physical court family rather than receiving an invisible tolerance change.
  var ALIEN_AIM_CHART = freeze({
    phone:   [[700, 600], [700, 1000], [700, 2000], [700, 2200]],
    tablet:  [[700, 1000], [700, 1000], [700, 1600], [700, 1000]],
    desktop: [[700, 2400], [700, 2000], [700, 1400], [700, 2600]],
    wide:    [[700, 2400], [700, 1800], [700, 600], [700, 1200]],
    hd:      [[700, 2600], [700, 3200], [700, 2400], [700, 2200]],
    uhd: {
      '0,0': [450, 2000], '0,1': [650, 1600],
      '1,0': [750, 2400], '1,1': [250, 1600],
      '2,0': [750, 2400], '2,1': [450, 2800],
      '3,0': [450, 2000], '3,1': [450, 1200],
    },
  });

  var ALIEN_EXECUTION = freeze({
    easy: {
      // The portrait tablet court otherwise over-penalizes Easy's intentionally
      // broad aim. Keep the same general (non-ring-reading) shot, but vary its
      // wall choice more often so its physical make rate remains in the Easy band.
      tablet: { sideSigma: 300, upSigma: 1100, wrongWay: 0.55, mishit: 0.04 },
    },
    medium: {
      phone:  { sideSigma: 220, upSigma: 650, wrongWay: 0.30, mishit: 0.18 },
      tablet: { sideSigma: 60,  upSigma: 180, wrongWay: 0.08, mishit: 0.05 },
      desktop:{ sideSigma: 220, upSigma: 650, wrongWay: 0.30, mishit: 0.18 },
      wide:   { sideSigma: 250, upSigma: 760, wrongWay: 0.36, mishit: 0.22 },
      hd:     { sideSigma: 80,  upSigma: 230, wrongWay: 0.12, mishit: 0.08 },
      uhd:    { sideSigma: 30,  upSigma: 100, wrongWay: 0.08, mishit: 0.08 },
    },
    hard: {
      // The narrow phone court needs a deliberately clean Hard release. The
      // target and tractor field are unchanged; seeded launch jitter and the
      // moving physical furniture still leave roughly one shot in three as a
      // genuine miss over the distributed qualification corpus.
      phone:  { sideSigma: 30, upSigma: 80, wrongWay: 0.04, mishit: 0.01 },
      tablet: { sideSigma: 2,  upSigma: 2,   wrongWay: 0,    mishit: 0.10 },
      desktop:{ sideSigma: 60, upSigma: 200, wrongWay: 0.10, mishit: 0.03 },
      wide:   { sideSigma: 90, upSigma: 260, wrongWay: 0.15, mishit: 0.04 },
      hd:     { sideSigma: 2,  upSigma: 2,   wrongWay: 0,    mishit: 0.10 },
      uhd:    { sideSigma: 2,  upSigma: 2,   wrongWay: 0,    mishit: 0 },
    },
  });

  function difficultyOf(value) {
    var normalized = String(value == null ? 'medium' : value).toLowerCase();
    return Object.prototype.hasOwnProperty.call(TARGET_BANDS, normalized)
      ? normalized : 'medium';
  }

  function modeOf(source) {
    var value = String(source.physicsModeId || source.mode || '').toLowerCase();
    return value === 'alien' || value === 'alien-invasion' || value === 'invasion'
      ? 'alien' : 'classic';
  }

  function arenaWidth(source) {
    var arena = object(source.arena);
    return Math.max(1, finite(arena.worldW,
      finite(arena.width, finite(source.worldWidth, 1280))));
  }

  function ringX(source, worldWidth) {
    var target = object(source.target);
    return finite(target.x, worldWidth / 2);
  }

  function alienCourtFamily(source) {
    var target = object(source.target);
    var viewWidth = Math.max(320, finite(target.viewW,
      finite(object(source.arena).viewW, 1280)));
    var viewHeight = Math.max(480, finite(target.viewH,
      finite(object(source.arena).viewH, 720)));
    var shortEdge = Math.min(viewWidth, viewHeight);
    if (viewWidth < 600) return 'phone';
    if (viewWidth / viewHeight < 1) return 'tablet';
    if (shortEdge >= 1500) return 'uhd';
    if (shortEdge >= 900) return 'hd';
    if (viewWidth >= 1330) return 'wide';
    return 'desktop';
  }

  function alienAim(source, targetX, worldWidth) {
    var target = object(source.target);
    var xBand = Math.max(0, Math.min(3, Math.floor(targetX / worldWidth * 4)));
    var family = alienCourtFamily(source);
    if (family !== 'uhd') return ALIEN_AIM_CHART[family][xBand];
    var worldHeight = Math.max(1, finite(target.worldH, 2190));
    var normalizedY = (finite(target.y, worldHeight * 0.46) / worldHeight - 0.31) / 0.30;
    var yBand = Math.max(0, Math.min(1, Math.floor(normalizedY * 2)));
    return ALIEN_AIM_CHART.uhd[xBand + ',' + yBand];
  }

  function classicLaunch(source, difficulty, seed) {
    var profile = CLASSIC[difficulty];
    if (profile.mishit && unit(seed, 0xbe5466cf) < profile.mishit) {
      var side = (unit(seed, 0x34e90c6c) < 0.5 ? -1 : 1) *
        (90 + Math.abs(gaussian(seed, 0xc97c50dd, 0x3f84d5b5)) * 70);
      return {
        vx: Math.max(-profile.sideLimit, Math.min(profile.sideLimit, side)),
        vy: -(420 + Math.abs(gaussian(seed, 0x243f6a88, 0x85a308d3)) * 240),
      };
    }
    var up = profile.upMean + gaussian(seed, 0x243f6a88, 0x85a308d3) * profile.upSigma;
    var sideAim = gaussian(seed, 0x13198a2e, 0x03707344) * profile.sideSigma;
    return {
      vx: Math.max(-profile.sideLimit, Math.min(profile.sideLimit, sideAim)),
      vy: -Math.max(500, Math.min(4400, up)),
    };
  }

  function alienLaunch(source, difficulty, seed) {
    var profile = ALIEN[difficulty];
    var family = alienCourtFamily(source);
    var familyExecution = ALIEN_EXECUTION[difficulty] && ALIEN_EXECUTION[difficulty][family];
    var execution = familyExecution || profile;
    var width = arenaWidth(source);
    var targetX = ringX(source, width);
    // Bank off the wall opposite the ring, producing a readable return arc.
    var direction = targetX < width / 2 ? 1 : -1;
    if (unit(seed, 0xa4093822) < execution.wrongWay) direction *= -1;
    // The stronger profiles read the public ring position just as a human
    // does. Broad court/quadrant bands are intentionally approximate; Matter.js
    // still decides every collision and outcome. Easy keeps one general aim.
    var aim = profile.readsRing ? alienAim(source, targetX, width) : null;
    var aimedSide = aim ? aim[0] : profile.sideMean;
    var aimedUp = aim ? aim[1] : profile.upMean;
    var magnitude = aimedSide +
      gaussian(seed, 0x299f31d0, 0x082efa98) * execution.sideSigma;
    var up = aimedUp + gaussian(seed, 0xec4e6c89, 0x452821e6) * execution.upSigma;
    // A physical execution error is a weak diagonal release, not a fabricated
    // MISS. It may still catch furniture and score, just as a human mishit can.
    if (unit(seed, 0xbe5466cf) < execution.mishit) {
      magnitude = 90 + Math.abs(gaussian(seed, 0x34e90c6c, 0xc0ac29b7)) * 55;
      up = 720 + Math.abs(gaussian(seed, 0xc97c50dd, 0x3f84d5b5)) * 180;
    }
    return {
      vx: direction * Math.max(110, Math.min(900, Math.abs(magnitude))),
      vy: -Math.max(700, Math.min(3600, up)),
    };
  }

  function createLaunch(value) {
    var source = object(value);
    var seed = uint32Seed(source.seed);
    var difficulty = difficultyOf(source.difficulty);
    var mode = modeOf(source);
    var signal = mode === 'alien'
      ? alienLaunch(source, difficulty, seed)
      : classicLaunch(source, difficulty, seed);
    return freeze({
      schema: 'CpuLaunchIntentV1',
      version: 1,
      seed: seed >>> 0,
      difficulty: difficulty,
      physicsModeId: mode === 'alien' ? 'alien' : 'normal',
      // Human Physics Feel is an accessibility/input preference. CPU tiers
      // always use their frozen canonical transfer so changing that preference
      // cannot secretly change opponent difficulty.
      inputFeelMode: 'standard',
      vx: signal.vx,
      vy: signal.vy,
    });
  }

  // Story's eight authored tiers intentionally span the physical Easy-to-Hard
  // range without inventing hidden per-rival result logic.
  function difficultyForTier(value) {
    var tier = Math.max(1, Math.min(8, Math.floor(finite(value, 4))));
    if (tier <= 2) return 'easy';
    if (tier <= 5) return 'medium';
    return 'hard';
  }

  return freeze({
    schema: 'CpuProfileV1',
    version: 1,
    targetBands: TARGET_BANDS,
    createLaunch: createLaunch,
    difficultyForTier: difficultyForTier,
  });
});
