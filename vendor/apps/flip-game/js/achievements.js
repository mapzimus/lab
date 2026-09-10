// achievements.js -- deterministic 100-entry v111 achievement catalog.
// Checks observe reported outcomes only and never advance gameplay RNG.
(function (root, factory) {
  'use strict';
  var Interfaces = root && root.FlipgameV111Interfaces;
  var Progression = root && root.FlipgameV111Progression;
  if (typeof module === 'object' && module.exports) {
    Interfaces = require('./v111-interfaces.js');
    Progression = require('./v111-progression.js');
  }
  var api = factory(Interfaces, Progression, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Achievements = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Interfaces, Progression, root) {
  'use strict';

  var KEY = 'flipgame.achievements.v3';
  var LEGACY_KEY = 'flipgame.achievements.v1';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function canonicalEventId(value) {
    return value === 'rainbow-trail' ? 'rainbow-corkscrew' : String(value || '');
  }
  function format(c) { return String(c.format || c.matchFormat || '').toLowerCase(); }
  function won(c) { return c.won === true || c.result === 'win' || c.matchWon === true; }
  function made(c) { return String(c.result || '').toUpperCase() === 'MAKE'; }
  function capMade(c) {
    return made(c) && (!!c.capLand || !!c.onCap || c.landingPose === 'cap' || c.pose === 'cap');
  }

  var CATALOG = [];
  function add(category, id, emoji, name, desc, rare) {
    CATALOG.push({ category: category, id: id, emoji: emoji, name: name, desc: desc, rare: !!rare });
  }

  // Original IDs stay unchanged so the v1 earned-id array migrates losslessly.
  var EXISTING = [
    ['first_flip','🎬','First Flip','Take your first qualifying flip.'],
    ['first_make','🔩','Nailed It','Land your first MAKE.'],
    ['ignition','🔥','Ignition','Go ON FIRE with three makes in a row.'],
    ['inferno','🌋','Inferno','Reach seven bonus lives in an ON FIRE run.'],
    ['supernova','☄️','Supernova','Reach ten bonus lives in an ON FIRE run.'],
    ['streak_master','⚡','Streak Master','String together ten makes.'],
    ['high_roller','🎲','High Roller','Make a flip with eight lives on the line.'],
    ['table_setter','🏦','Table Setter','Make a flip with twelve lives on the line.'],
    ['bullseye','🎯','Bullseye','Stick a dead-vertical landing.'],
    ['full_send','🚀','Full Send','Make a max-power flick.'],
    ['feather_touch','🪶','Feather Touch','Make a whisper-soft flick.'],
    ['great_save','🧤','The Great Save','Tip far over and stand back up.',true],
    ['cap_land','🙃','Cap Land','Stick a landing on the cap.',true],
    ['mothership','👽','Mothership','Bank a shot through the tractor ring.'],
    ['smooth_operator','🛝','Smooth Operator','Reach the tractor ring after three banks.'],
    ['deadeye','🎯','Deadeye','Bank through the center of the tractor ring.'],
    ['last_one_standing','🏆','Last One Standing','Win a qualifying match.'],
    ['dynasty','👑','Dynasty','Reach five wins with one player identity.'],
    ['empire','🏰','Empire','Reach fifteen wins with one player identity.'],
    ['iron_will','🛡️','Iron Will','Win after dropping to one life.'],
    ['clean_sweep','🧹','Clean Sweep','Win without missing.'],
    ['sudden_survivor','💀','Sudden Survivor','Win a sudden-death match.'],
    ['comeback_kid','♻️','Comeback Kid','Win from one life in sudden death.',true],
    ['party_animal','🎉','Party Animal','Win with at least six players.'],
    ['full_house','🎱','Full House','Win an eight-player match.'],
    ['century_club','💯','Century Club','Reach 250 qualifying flips.'],
    ['millennial','📚','Millennial','Reach 1,000 qualifying flips.'],
    ['hot_hands','✋','Hot Hands','Ignite ON FIRE twice in one match.'],
    ['ghost_protocol','👻','Ghost Protocol','Win a clean sweep in sudden death.',true],
    ['close_encounter','🛸','Close Encounter','Escape through the tractor ring after six banks.',true],
  ];
  EXISTING.forEach(function (a) { add('existing', a[0], a[1], a[2], a[3], a[4]); });

  var EVENT_EMOJI = ['🌈','🥤','🚀','💨','✨','🎾','🌎','🌙','🧊','🛸','⬇️','🦘','🌬️','🔬','🌀','🪢','🦠','✌️','🦇','☄️','🧲','❤️','⚫','🪃','🎰','⏪','🟡','🪞','🧢','💔'];
  Interfaces.EVENT_CATALOG.forEach(function (event, index) {
    add('events', 'event-' + event.id, EVENT_EMOJI[index], event.displayName,
      'Finish a qualifying flip with ' + event.displayName + ' active.');
  });

  var CLASSIC = [
    ['opening-make','🎬','Opening Statement','Make the opening flip of a Classic match.'],
    ['edge-landing','📐','Living on the Edge','Make a Classic flip on the edge.'],
    ['two-rotation-make','🌀','Double Rotation','Make an ordinary Classic flip with at least two rotations.'],
    ['one-life-make','1️⃣','One Life Left','Make a Classic flip while starting the turn on one life.'],
    ['sudden-death-cap','💀','Sudden Cap','Land on the cap during Classic sudden death.'],
    ['stake-20-make','🎲','Twenty on the Table','Make a Classic flip with at least twenty lives staked.'],
    ['perfect-pair','🎯','Perfect Pair','Land two consecutive perfect Classic flips.'],
    ['three-caps','🙃','Hat Trick','Land three cap makes in one Classic match.'],
    ['on-fire-cap','🔥','Fire Ceiling','Reach the ON FIRE additive-life cap in Classic.'],
    ['twenty-make-streak','⚡','Twenty Straight','Reach a twenty-make Classic streak.'],
  ];
  CLASSIC.forEach(function (a) { add('classic', 'classic-' + a[0], a[1], a[2], a[3]); });

  var CUP = [
    ['first-win','🏆','First Cup','Win a Cup.'],
    ['sweep-2-0','🧹','Two–Zero Sweep','Win a Cup two heats to none.'],
    ['reverse-sweep','🌊','Reverse Sweep','Win a Cup after losing its first heat.'],
    ['short-win','⏱️','Short Cup Champion','Win a Short Cup.'],
    ['full-win','🏛️','Full Cup Champion','Win a Full Cup.'],
    ['eight-player','8️⃣','Full Cup Table','Win an eight-player Cup.'],
    ['all-starters','🔄','Every Starting Seat','Start a Cup from every seat position.'],
    ['three-lifetime','🥉','Cup Triple','Win three Cups on this device.'],
  ];
  CUP.forEach(function (a) { add('cup', 'cup-' + a[0], a[1], a[2], a[3], a[4]); });

  var TEAM = [
    ['first-win','🤝','Team Debut','Win Team Clash.'],
    ['two-player-win','2️⃣','Two-Player Team Win','Win Team Clash with two players.'],
    ['eight-player-win','8️⃣','Eight-Player Team Win','Win Team Clash with eight players.'],
    ['five-point-cancellation','⚖️','Five-Point Cancel','Cancel at least five points in one Team Clash round.'],
    ['five-point-comeback','🔄','Five-Point Comeback','Win Team Clash after trailing by at least five points.'],
    ['every-teammate-scored','🤜','Everyone Scores','Have every teammate score in Team Clash.'],
    ['match-point-cancellation','🛡️','Match Point Denied','Cancel a score that would have won Team Clash.'],
    ['every-teammate-made-round','🙌','Perfect Team Round','Have every teammate make in the same Team Clash round.'],
  ];
  TEAM.forEach(function (a) { add('team', 'team-' + a[0], a[1], a[2], a[3]); });

  var COLLECTION = [
    ['use-5-objects','📦','Object Sampler','Use five different objects.'],
    ['use-15-objects','🗃️','Object Explorer','Use fifteen different objects.'],
    ['use-30-objects','🏛️','Object Curator','Use thirty different objects.'],
    ['use-all-objects','👑','Every Object','Use all fifty-one objects.',true],
    ['equip-5-cosmetics','🎨','Style Sampler','Equip five different cosmetics.'],
    ['equip-25-cosmetics','✨','Style Curator','Equip twenty-five different cosmetics.'],
    ['equip-all-cosmetics','🌈','Every Style','Equip all fifty cosmetics.',true],
    ['play-all-arenas','🌍','World Tour','Play in all ten arenas.',true],
  ];
  COLLECTION.forEach(function (a) { add('collection', 'collection-' + a[0], a[1], a[2], a[3], a[4]); });

  var LAB_STATS = [
    ['advanced-lab','🧪','Advanced Lab','Use an advanced Physics Lab control.'],
    ['improved-seed','👻','Better Replay','Improve the result of a replayed seed in Physics Lab.'],
    ['hundred-perfect-landings','🎯','Perfect Century','Record one hundred perfect landings.'],
    ['fifty-cap-landings','🙃','Cap Fifty','Record fifty cap landings.'],
    ['hundred-matches','🧮','One Hundred Matches','Complete one hundred matches.'],
    ['five-thousand-flips','📈','Five Thousand Flips','Record five thousand flips.'],
  ];
  LAB_STATS.forEach(function (a) { add('lab-stats', 'stats-' + a[0], a[1], a[2], a[3], a[4]); });

  freeze(CATALOG);
  if (CATALOG.length !== 100) throw new Error('v111 achievement catalog must contain exactly 100 entries');
  var BY_ID = Object.create(null);
  CATALOG.forEach(function (achievement) {
    if (BY_ID[achievement.id]) throw new Error('Duplicate achievement id: ' + achievement.id);
    BY_ID[achievement.id] = achievement;
  });

  function matchExisting(id, c) {
    switch (id) {
      case 'first_flip': return c.totalFlipsLifetime === 1;
      case 'first_make': return c.result === 'MAKE' && c.totalMakesLifetime === 1;
      case 'ignition': return !!c.justIgnited;
      case 'inferno': return c.onFireBonus >= 7;
      case 'supernova': return c.onFireBonus >= 10;
      case 'streak_master': return c.streak >= 10;
      case 'high_roller': return c.result === 'MAKE' && c.pointCount >= 8;
      case 'table_setter': return c.result === 'MAKE' && c.pointCount >= 12;
      case 'bullseye': return !!c.perfect;
      case 'full_send': return c.result === 'MAKE' && c.power != null && c.power >= 0.95;
      case 'feather_touch': return c.result === 'MAKE' && c.power > 0 && c.power <= 0.25;
      case 'great_save': return !!c.greatSave;
      case 'cap_land': return !!c.capLand;
      case 'mothership': return c.landingReason === 'tractor-ring';
      case 'smooth_operator': return c.landingReason === 'tractor-ring' && (c.bankHits || 0) >= 3;
      case 'deadeye': return c.landingReason === 'tractor-ring' && c.padOffset != null && c.padOffset <= 0.22;
      case 'last_one_standing': return won(c);
      case 'dynasty': return c.winnerWins >= 5;
      case 'empire': return c.winnerWins >= 15;
      case 'iron_will': return won(c) && !!c.droppedToOneLife;
      case 'clean_sweep': return won(c) && !!c.wonWithoutMiss;
      case 'sudden_survivor': return won(c) && !!c.sawSuddenDeath;
      case 'comeback_kid': return won(c) && !!c.droppedToOneLife && !!c.sawSuddenDeath;
      case 'party_animal': return won(c) && (c.playerCount || 0) >= 6;
      case 'full_house': return won(c) && (c.playerCount || 0) >= 8;
      case 'century_club': return c.totalFlipsLifetime >= 250;
      case 'millennial': return c.totalFlipsLifetime >= 1000;
      case 'hot_hands': return (c.ignitionsThisGame || 0) >= 2;
      case 'ghost_protocol': return won(c) && !!c.wonWithoutMiss && !!c.sawSuddenDeath;
      case 'close_encounter': return c.landingReason === 'tractor-ring' && (c.bankHits || 0) >= 6;
      default: return false;
    }
  }

  // Outcome-context contract used by main.js and the statistics bridge:
  // Classic: openingFlip, edgeLanding, rotations, livesBefore, suddenDeathBefore,
  // stakeBefore, perfectPair, capMakesThisMatch, reachedOnFireCap, streak.
  // Cup: loserHeatWins, lostFirstHeat, cupLength, playerCount,
  // allCupStarterPositionsCovered, lifetimeCupWins.
  // Team: cancellationPoints, largestDeficit, everyTeammateScored,
  // matchPointCancellation, everyTeammateMadeInRound.
  // Collection: distinctObjectsUsed, distinctCosmeticsEquipped, distinctArenasPlayed.
  // Lab/stat: advancedLabUsed, replayedSeedImproved, perfectLandingsLifetime,
  // capLandingsLifetime, matchesLifetime, totalFlipsLifetime.
  function matches(achievement, c) {
    var id = achievement.id;
    if (achievement.category === 'existing') return matchExisting(id, c);
    if (achievement.category === 'events') {
      return canonicalEventId(c.eventId || c.rareEvent) === id.slice(6) && c.eventResolved !== false;
    }
    switch (id) {
      case 'classic-opening-make': return format(c) === 'classic' && made(c) && !!c.openingFlip;
      case 'classic-edge-landing': return format(c) === 'classic' && made(c) && !!c.edgeLanding;
      case 'classic-two-rotation-make': return format(c) === 'classic' && made(c) &&
        !canonicalEventId(c.eventId || c.rareEvent) && Number(c.rotations) >= 2;
      case 'classic-one-life-make': return format(c) === 'classic' && made(c) && Number(c.livesBefore) === 1;
      case 'classic-sudden-death-cap': return format(c) === 'classic' && !!c.suddenDeathBefore && capMade(c);
      case 'classic-stake-20-make': return format(c) === 'classic' && made(c) && Number(c.stakeBefore) >= 20;
      case 'classic-perfect-pair': return format(c) === 'classic' && !!c.perfectPair;
      case 'classic-three-caps': return format(c) === 'classic' && Number(c.capMakesThisMatch) >= 3;
      case 'classic-on-fire-cap': return format(c) === 'classic' && !!c.reachedOnFireCap;
      case 'classic-twenty-make-streak': return format(c) === 'classic' && Number(c.streak) >= 20;
      case 'cup-first-win': return format(c) === 'cup' && won(c);
      case 'cup-sweep-2-0': return format(c) === 'cup' && won(c) && Number(c.loserHeatWins) === 0;
      case 'cup-reverse-sweep': return format(c) === 'cup' && won(c) && !!c.lostFirstHeat;
      case 'cup-short-win': return format(c) === 'cup' && won(c) && c.cupLength === 'short';
      case 'cup-full-win': return format(c) === 'cup' && won(c) && c.cupLength === 'full';
      case 'cup-eight-player': return format(c) === 'cup' && won(c) && Number(c.playerCount) === 8;
      case 'cup-all-starters': return format(c) === 'cup' && !!c.allCupStarterPositionsCovered;
      case 'cup-three-lifetime': return Number(c.lifetimeCupWins) >= 3;
      case 'team-first-win': return format(c) === 'team' && won(c);
      case 'team-two-player-win': return format(c) === 'team' && won(c) && Number(c.playerCount) === 2;
      case 'team-eight-player-win': return format(c) === 'team' && won(c) && Number(c.playerCount) === 8;
      case 'team-five-point-cancellation': return format(c) === 'team' && Number(c.cancellationPoints) >= 5;
      case 'team-five-point-comeback': return format(c) === 'team' && won(c) && Number(c.largestDeficit) >= 5;
      case 'team-every-teammate-scored': return format(c) === 'team' && !!c.everyTeammateScored;
      case 'team-match-point-cancellation': return format(c) === 'team' && !!c.matchPointCancellation;
      case 'team-every-teammate-made-round': return format(c) === 'team' && !!c.everyTeammateMadeInRound;
      case 'collection-use-5-objects': return Number(c.distinctObjectsUsed) >= 5;
      case 'collection-use-15-objects': return Number(c.distinctObjectsUsed) >= 15;
      case 'collection-use-30-objects': return Number(c.distinctObjectsUsed) >= 30;
      case 'collection-use-all-objects': return Number(c.distinctObjectsUsed) >= 51;
      case 'collection-equip-5-cosmetics': return Number(c.distinctCosmeticsEquipped) >= 5;
      case 'collection-equip-25-cosmetics': return Number(c.distinctCosmeticsEquipped) >= 25;
      case 'collection-equip-all-cosmetics': return Number(c.distinctCosmeticsEquipped) >= 50;
      case 'collection-play-all-arenas': return Number(c.distinctArenasPlayed) >= 10;
      case 'stats-advanced-lab': return !!c.advancedLabUsed;
      case 'stats-improved-seed': return !!c.replayedSeedImproved;
      case 'stats-hundred-perfect-landings': return Number(c.perfectLandingsLifetime) >= 100;
      case 'stats-fifty-cap-landings': return Number(c.capLandingsLifetime) >= 50;
      case 'stats-hundred-matches': return Number(c.matchesLifetime) >= 100;
      case 'stats-five-thousand-flips': return Number(c.totalFlipsLifetime) >= 5000;
      default: return false;
    }
  }

  // `qualifying:true` is the trusted compatibility signal. Otherwise a caller
  // must provide one of these explicit human-participation signals.
  function hasHumanSignal(c) {
    return c.humanParticipant === true || c.hasHumanPlayer === true || Number(c.humanPlayers) > 0 ||
      c.winnerIsHuman === true || c.humanWinner === true || c.winningTeamHasHuman === true ||
      (Array.isArray(c.players) && c.players.some(function (player) { return player && player.isAI === false; }));
  }

  function isEligibleContext(context, achievement) {
    var c = context && typeof context === 'object' ? context : {};
    var activity = String(c.mode || c.activity || '').toLowerCase();
    if (c.practice || c.isPractice || c.forced || c.isForced || c.test || c.testData || c.testMode ||
        c.simulated || c.aiOnly || activity === 'practice') return false;

    var isLab = !!c.lab || !!c.physicsLab || activity === 'lab' || activity === 'physics-lab';
    if (isLab) {
      var labId = achievement && achievement.id;
      var explicitLabAchievement = labId === 'stats-advanced-lab' || labId === 'stats-improved-seed';
      return explicitLabAchievement && c.qualifyingLabAction === true && hasHumanSignal(c);
    }
    if (c.qualifying === false) return false;
    return c.qualifying === true || hasHumanSignal(c);
  }

  function parse(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }
  function normalizeState(value, legacy) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var ids = [];
    (Array.isArray(source.earned) ? source.earned : []).forEach(function (entry) {
      if (entry && entry.id && !ids.some(function (known) { return known.id === String(entry.id); })) {
        ids.push({ id: String(entry.id), earnedAt: entry.earnedAt || null });
      }
    });
    (Array.isArray(legacy) ? legacy : []).forEach(function (id) {
      if (!ids.some(function (entry) { return entry.id === String(id); })) ids.push({ id: String(id), earnedAt: null });
    });
    return { schema: 'AchievementStateV3', version: 3, earned: ids };
  }

  function createMemoryStorage(seed) {
    var values = Object.assign({}, seed || {});
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) { values[key] = String(value); },
      dump: function () { return clone(values); },
    };
  }

  function createStore(options) {
    var opts = options || {};
    var storage = opts.storage || null;
    var progressionStore = opts.progression || Progression;
    var now = typeof opts.now === 'function' ? opts.now : function () { return new Date().toISOString(); };
    var state = normalizeState(opts.initialState || (storage ? parse(storage.getItem(KEY), {}) : {}),
      opts.legacyIds || (storage ? parse(storage.getItem(LEGACY_KEY), []) : []));
    function save() { if (storage) { try { storage.setItem(KEY, JSON.stringify(state)); } catch (_) {} } }
    function earnedMap() {
      var map = new Map();
      state.earned.forEach(function (entry) { map.set(entry.id, entry); });
      return map;
    }
    function check(context) {
      var c = context && typeof context === 'object' ? context : {};
      var map = earnedMap();
      var fresh = [];
      CATALOG.forEach(function (achievement) {
        if (map.has(achievement.id) || !isEligibleContext(c, achievement) || !matches(achievement, c)) return;
        var earnedAt = now();
        state.earned.push({ id: achievement.id, earnedAt: earnedAt });
        var result = { id: achievement.id, category: achievement.category, emoji: achievement.emoji,
          name: achievement.name, desc: achievement.desc, rare: achievement.rare, earnedAt: earnedAt };
        fresh.push(freeze(result));
        if (progressionStore && typeof progressionStore.addAchievement === 'function') progressionStore.addAchievement(achievement.id);
      });
      if (fresh.length) save();
      return fresh;
    }
    function isUnlocked(id) { return earnedMap().has(String(id)); }
    function unlockedCount() {
      var map = earnedMap();
      return CATALOG.filter(function (achievement) { return map.has(achievement.id); }).length;
    }
    function lockedView() { return freeze({ locked: true, symbol: '🔒', ariaLabel: 'Locked' }); }
    function unlockedView(achievement, entry) {
      return freeze({ locked: false, id: achievement.id, category: achievement.category,
        emoji: achievement.emoji, name: achievement.name, desc: achievement.desc,
        rare: achievement.rare, earnedAt: entry.earnedAt || null, ariaLabel: achievement.name });
    }
    function list() {
      var map = earnedMap();
      return Object.freeze(CATALOG.map(function (achievement) {
        return map.has(achievement.id) ? unlockedView(achievement, map.get(achievement.id)) : lockedView();
      }));
    }
    function earned() {
      var map = earnedMap();
      return Object.freeze(CATALOG.filter(function (achievement) { return map.has(achievement.id); })
        .map(function (achievement) { return unlockedView(achievement, map.get(achievement.id)); }));
    }
    function renderGridHtml() {
      var views = list();
      var cards = views.filter(function (view) { return !view.locked; }).map(function (view) {
        return '<div class="ach-card unlocked' + (view.rare ? ' rare' : '') + '" title="' + esc(view.desc) +
          '" aria-label="' + esc(view.name) + '"><div class="ach-emoji" aria-hidden="true">' + esc(view.emoji) +
          '</div><div class="ach-name">' + esc(view.name) + '</div></div>';
      });
      if (views.some(function (view) { return view.locked; })) {
        cards.push('<div class="ach-card locked" aria-label="Locked"><div class="ach-emoji" aria-hidden="true">🔒</div></div>');
      }
      return '<div class="records-title ach-heading">🏅 Achievements · ' + unlockedCount() + ' discovered</div>' +
        '<div class="ach-grid">' + cards.join('') + '</div>';
    }
    function exportState() { return freeze(clone(state)); }
    function reset() { state = normalizeState({}, []); save(); }
    if (progressionStore && typeof progressionStore.addAchievement === 'function') {
      state.earned.forEach(function (entry) { progressionStore.addAchievement(entry.id); });
    }
    save();
    return Object.freeze({ check: check, list: list, earned: earned, isUnlocked: isUnlocked,
      unlockedCount: unlockedCount, total: function () { return CATALOG.length; },
      renderGridHtml: renderGridHtml, exportState: exportState, reset: reset });
  }

  var browserStorage = null;
  try { browserStorage = root && root.localStorage ? root.localStorage : null; } catch (_) {}
  var defaultStore = createStore({ storage: browserStorage });
  return Object.freeze({
    check: defaultStore.check, list: defaultStore.list, earned: defaultStore.earned,
    isUnlocked: defaultStore.isUnlocked, unlockedCount: defaultStore.unlockedCount,
    total: defaultStore.total, renderGridHtml: defaultStore.renderGridHtml,
    exportState: defaultStore.exportState, reset: defaultStore.reset,
    isEligibleContext: isEligibleContext, createStore: createStore, createMemoryStorage: createMemoryStorage,
    // Aggregate catalog QA only; individual locked IDs remain undisclosed.
    catalogSummary: function () {
      var counts = {};
      CATALOG.forEach(function (achievement) { counts[achievement.category] = (counts[achievement.category] || 0) + 1; });
      return freeze({ total: CATALOG.length, categoryCounts: counts });
    },
  });
});
