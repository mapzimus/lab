// v112-achievements.js -- canonical v1.12 achievement catalog and evaluator.
//
// This module deliberately does not persist achievement state or mutate the
// profile. It observes a bounded AchievementEvaluationV1 signal, evaluates the
// unchanged v1.11 catalog through the legacy evaluator, evaluates the twenty
// authored v1.12 additions here, and issues identity-bound reward evidence.
(function (root, factory) {
  'use strict';
  var commonJs = typeof module === 'object' && !!module && !!module.exports &&
    typeof require === 'function' && typeof process === 'object' && !!process &&
    !!process.versions && typeof process.versions.node === 'string';
  if (!commonJs && root && Object.prototype.hasOwnProperty.call(
    root, 'FlipgameV112Achievements')) {
    throw new Error('FlipgameV112Achievements is already defined');
  }
  var Legacy = root && root.Achievements;
  if (commonJs) Legacy = require('./achievements.js');
  var api = factory(Legacy, commonJs);
  if (commonJs) {
    module.exports = api;
  } else if (root) {
    Object.defineProperty(root, 'FlipgameV112Achievements', {
      value: api, enumerable: true, writable: false, configurable: false,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Legacy, trustedComposition) {
  'use strict';

  if (!Legacy || typeof Legacy.createStore !== 'function' ||
      typeof Legacy.catalogSummary !== 'function' || Legacy.catalogSummary().total !== 100) {
    throw new Error('The frozen 100-entry v1.11 achievement evaluator is required');
  }

  var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
  var RARITIES = Object.freeze(['common', 'notable', 'rare', 'legendary']);
  var REWARD_BY_RARITY = deepFreeze({
    common: { fxp: 15, fc: 10 },
    notable: { fxp: 30, fc: 20 },
    rare: { fxp: 50, fc: 30 },
    legendary: { fxp: 75, fc: 50 },
  });
  var LOCKED_VIEW = deepFreeze({ locked: true, symbol: '🔒', ariaLabel: 'Locked' });

  function deepFreeze(value, seen) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return value;
    var visited = seen || new Set();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.getOwnPropertyNames(value).forEach(function (key) { deepFreeze(value[key], visited); });
    return Object.freeze(value);
  }

  function exactRecord(value, allowed, required, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(label + ' must be a plain object');
    }
    var prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(label + ' must be a plain object');
    }
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) {
      throw new TypeError(label + ' cannot contain symbol fields');
    }
    var keys = Object.getOwnPropertyNames(value);
    keys.forEach(function (key) {
      if (!allowed.has(key)) throw new TypeError(label + ' contains unknown field: ' + key);
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + ' fields must be ordinary data properties');
      }
    });
    required.forEach(function (key) {
      if (keys.indexOf(key) < 0) throw new TypeError(label + ' is missing field: ' + key);
    });
    return value;
  }

  function exactString(value, label, maximum) {
    if (typeof value !== 'string' || !value || Array.from(value).length > (maximum || 96) ||
        /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
      throw new TypeError(label + ' must be a bounded non-empty string');
    }
    return value;
  }

  function exactId(value, label) {
    var id = exactString(value, label, 96);
    if (!ID_PATTERN.test(id)) throw new TypeError(label + ' must be a bounded canonical ID');
    return id;
  }

  function exactBoolean(value, label) {
    if (typeof value !== 'boolean') throw new TypeError(label + ' must be boolean');
    return value;
  }

  function exactNumber(value, label, maximum, integer) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum ||
        (integer && !Number.isSafeInteger(value))) {
      throw new TypeError(label + ' must be a bounded non-negative ' + (integer ? 'integer' : 'number'));
    }
    return value;
  }

  function exactArray(value, label, maximum, mapper) {
    if (!Array.isArray(value) || value.length > maximum) {
      throw new TypeError(label + ' must be an array of at most ' + maximum + ' entries');
    }
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) {
      throw new TypeError(label + ' cannot contain symbol fields');
    }
    var ownNames = Object.getOwnPropertyNames(value);
    ownNames.forEach(function (key) {
      if (key === 'length') return;
      if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) {
        throw new TypeError(label + ' cannot contain extra fields');
      }
    });
    var result = [];
    for (var index = 0; index < value.length; index += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(label + ' must be dense and contain ordinary data entries');
      }
      result.push(mapper(descriptor.value, index));
    }
    return result;
  }

  function definition(category, id, icon, name, description, rarity, generation, conditionKey) {
    if (RARITIES.indexOf(rarity) < 0) throw new Error('Unknown authored rarity: ' + rarity);
    return deepFreeze({
      schema: 'AchievementDefinitionV1', version: 1, id: id,
      category: category, icon: icon, name: name, description: description,
      rarity: rarity, reward: REWARD_BY_RARITY[rarity], generation: generation,
      conditionKey: conditionKey,
    });
  }

  var rows = [];
  function add(category, id, icon, name, description, rarity, generation, conditionKey) {
    rows.push(definition(category, id, icon, name, description, rarity,
      generation || 'v1.11', conditionKey || 'legacy-v111'));
  }

  // The first 100 IDs are copied in their exact v1.11 order. Names and
  // descriptions stay stable, while every ID now has an authored reward tier.
  [
    ['first_flip','🎬','First Flip','Take your first qualifying flip.','common'],
    ['first_make','🔩','Nailed It','Land your first MAKE.','common'],
    ['ignition','🔥','Ignition','Go ON FIRE with three makes in a row.','common'],
    ['inferno','🌋','Inferno','Reach seven bonus lives in an ON FIRE run.','rare'],
    ['supernova','☄️','Supernova','Reach ten bonus lives in an ON FIRE run.','legendary'],
    ['streak_master','⚡','Streak Master','String together ten makes.','notable'],
    ['high_roller','🎲','High Roller','Make a flip with eight lives on the line.','notable'],
    ['table_setter','🏦','Table Setter','Make a flip with twelve lives on the line.','rare'],
    ['bullseye','🎯','Bullseye','Stick a dead-vertical landing.','notable'],
    ['full_send','🚀','Full Send','Make a max-power flick.','common'],
    ['feather_touch','🩶','Feather Touch','Make a whisper-soft flick.','notable'],
    ['great_save','🧤','The Great Save','Tip far over and stand back up.','rare'],
    ['cap_land','🙃','Cap Land','Stick a landing on the cap.','rare'],
    ['mothership','👽','Mothership','Bank a shot through the tractor ring.','notable'],
    ['smooth_operator','🛝','Smooth Operator','Reach the tractor ring after three banks.','rare'],
    ['deadeye','🎯','Deadeye','Bank through the center of the tractor ring.','rare'],
    ['last_one_standing','🏆','Last One Standing','Win a qualifying match.','common'],
    ['dynasty','👑','Dynasty','Reach five wins with one player identity.','notable'],
    ['empire','🏰','Empire','Reach fifteen wins with one player identity.','rare'],
    ['iron_will','🛡️','Iron Will','Win after dropping to one life.','notable'],
    ['clean_sweep','🧹','Clean Sweep','Win without missing.','rare'],
    ['sudden_survivor','💀','Sudden Survivor','Win a sudden-death match.','notable'],
    ['comeback_kid','♻️','Comeback Kid','Win from one life in sudden death.','rare'],
    ['party_animal','🎉','Party Animal','Win with at least six players.','notable'],
    ['full_house','🎱','Full House','Win an eight-player match.','rare'],
    ['century_club','💯','Century Club','Reach 250 qualifying flips.','notable'],
    ['millennial','📚','Millennial','Reach 1,000 qualifying flips.','rare'],
    ['hot_hands','✋','Hot Hands','Ignite ON FIRE twice in one match.','notable'],
    ['ghost_protocol','👻','Ghost Protocol','Win a clean sweep in sudden death.','legendary'],
    ['close_encounter','🛸','Close Encounter','Escape through the tractor ring after six banks.','legendary'],
  ].forEach(function (row) { add('existing', row[0], row[1], row[2], row[3], row[4]); });

  [
    ['rainbow-corkscrew','Rainbow Corkscrew','🌈','common'],
    ['half-full','Half Full','🥤','common'],
    ['power-launch','Power Launch','🚀','common'],
    ['fizz-jet','Fizz Jet','💨','common'],
    ['golden-flip','Golden Flip','✨','common'],
    ['bouncy-bottle','Bouncy Bottle','🎾','notable'],
    ['earthquake','Earthquake','🌎','notable'],
    ['moon-gravity','Moon Gravity','🌙','notable'],
    ['ice-slide','Ice Slide','🧊','notable'],
    ['alien-invasion','Alien Invasion','🛸','notable'],
    ['gravity-slam','Gravity Slam','⬇️','notable'],
    ['trampoline','Trampoline','🦘','notable'],
    ['wind-tunnel','Wind Tunnel','🌬️','notable'],
    ['shrink-ray','Shrink Ray','🔬','rare'],
    ['portal-pair','Portal Pair','🌀','rare'],
    ['tether-swing','Tether Swing','🪢','rare'],
    ['mitosis','Mitosis','🦠','rare'],
    ['double-flip','Double Flip','✌️','rare'],
    ['ceiling-flip','Ceiling Flip','🦇','rare'],
    ['meteor-shower','Meteor Shower','☄️','rare'],
    ['magnet','Magnet','🧲','rare'],
    ['heart-rush','Heart Rush','❤️','rare'],
    ['black-hole','Black Hole','⚫','legendary'],
    ['boomerang','Boomerang','🪃','legendary'],
    ['roulette-table','Roulette Table','🎰','legendary'],
    ['rewind','Rewind','⏪','legendary'],
    ['plinko','Plinko','🟡','legendary'],
    ['mirror-match','Mirror Match','🪞','legendary'],
    ['cap-toss','Cap Toss','🧢','legendary'],
    ['life-drain','Life Drain','💔','legendary'],
  ].forEach(function (row) {
    add('events', 'event-' + row[0], row[2], row[1],
      'Finish a qualifying flip with ' + row[1] + ' active.', row[3]);
  });

  [
    ['opening-make','🎬','Opening Statement','Make the opening flip of a Classic match.','common'],
    ['edge-landing','📐','Living on the Edge','Make a Classic flip on the edge.','common'],
    ['two-rotation-make','🌀','Double Rotation','Make an ordinary Classic flip with at least two rotations.','common'],
    ['one-life-make','1️⃣','One Life Left','Make a Classic flip while starting the turn on one life.','common'],
    ['sudden-death-cap','💀','Sudden Cap','Land on the cap during Classic sudden death.','notable'],
    ['stake-20-make','🎲','Twenty on the Table','Make a Classic flip with at least twenty lives staked.','rare'],
    ['perfect-pair','🎯','Perfect Pair','Land two consecutive perfect Classic flips.','notable'],
    ['three-caps','🙃','Hat Trick','Land three cap makes in one Classic match.','notable'],
    ['on-fire-cap','🔥','Fire Ceiling','Reach the ON FIRE additive-life cap in Classic.','rare'],
    ['twenty-make-streak','⚡','Twenty Straight','Reach a twenty-make Classic streak.','legendary'],
  ].forEach(function (row) { add('classic', 'classic-' + row[0], row[1], row[2], row[3], row[4]); });

  [
    ['first-win','🏆','First Cup','Win a Cup.','common'],
    ['sweep-2-0','🧹','Two–Zero Sweep','Win a Cup two heats to none.','notable'],
    ['reverse-sweep','🌊','Reverse Sweep','Win a Cup after losing its first heat.','rare'],
    ['short-win','⏱️','Short Cup Champion','Win a Short Cup.','notable'],
    ['full-win','🏛️','Full Cup Champion','Win a Full Cup.','notable'],
    ['eight-player','8️⃣','Full Cup Table','Win an eight-player Cup.','rare'],
    ['all-starters','🔄','Every Starting Seat','Start a Cup from every seat position.','legendary'],
    ['three-lifetime','🥉','Cup Triple','Win three Cups on this device.','rare'],
  ].forEach(function (row) { add('cup', 'cup-' + row[0], row[1], row[2], row[3], row[4]); });

  [
    ['first-win','🤝','Team Debut','Win Team Clash.','common'],
    ['two-player-win','2️⃣','Two-Player Team Win','Win Team Clash with two players.','common'],
    ['eight-player-win','8️⃣','Eight-Player Team Win','Win Team Clash with eight players.','notable'],
    ['five-point-cancellation','⚖️','Five-Point Cancel','Cancel at least five points in one Team Clash round.','notable'],
    ['five-point-comeback','🔄','Five-Point Comeback','Win Team Clash after trailing by at least five points.','rare'],
    ['every-teammate-scored','🤜','Everyone Scores','Have every teammate score in Team Clash.','notable'],
    ['match-point-cancellation','🛡️','Match Point Denied','Cancel a score that would have won Team Clash.','rare'],
    ['every-teammate-made-round','🙌','Perfect Team Round','Have every teammate make in the same Team Clash round.','legendary'],
  ].forEach(function (row) { add('team', 'team-' + row[0], row[1], row[2], row[3], row[4]); });

  [
    ['use-5-objects','📦','Object Sampler','Use five different objects.','common'],
    ['use-15-objects','🗃️','Object Explorer','Use fifteen different objects.','notable'],
    ['use-30-objects','🏛️','Object Curator','Use thirty different objects.','rare'],
    ['use-all-objects','👑','Every Object','Use all fifty-one objects.','legendary'],
    ['equip-5-cosmetics','🎨','Style Sampler','Equip five different cosmetics.','common'],
    ['equip-25-cosmetics','✨','Style Curator','Equip twenty-five different cosmetics.','notable'],
    ['equip-all-cosmetics','🌈','Every Style','Equip all fifty cosmetics.','rare'],
    ['play-all-arenas','🌍','World Tour','Play in all ten arenas.','rare'],
  ].forEach(function (row) { add('collection', 'collection-' + row[0], row[1], row[2], row[3], row[4]); });

  [
    ['advanced-lab','🧪','Advanced Lab','Use an advanced Physics Lab control.','common'],
    ['improved-seed','👻','Better Replay','Improve the result of a replayed seed in Physics Lab.','notable'],
    ['hundred-perfect-landings','🎯','Perfect Century','Record one hundred perfect landings.','notable'],
    ['fifty-cap-landings','🙃','Cap Fifty','Record fifty cap landings.','notable'],
    ['hundred-matches','🧮','One Hundred Matches','Complete one hundred matches.','rare'],
    ['five-thousand-flips','📈','Five Thousand Flips','Record five thousand flips.','rare'],
  ].forEach(function (row) { add('lab-stats', 'stats-' + row[0], row[1], row[2], row[3], row[4]); });

  // v1.12 additions and their exact condition signals:
  //
  // Battle
  // battle-first-win                 Battle win
  // battle-duel-win                  Battle win, format=duel
  // battle-doubles-win               Battle win, format=doubles
  // battle-four-way-win              Battle win, format=four-way
  // battle-volley-sweep              Volley win with 2+ heat wins and 0 losses
  // battle-rush-win                  Timed Rush win
  // battle-stored-power-win          Win with a stored power on the winning play
  // battle-paired-sudden-death-win   Win a paired sudden-death volley
  //
  // Story / Rival
  // story-first-rival                First newly defeated rival
  // story-act-one                    Act I newly completed
  // story-all-urth-rivals            All eleven Urth rivals defeated
  // story-campaign-complete          Pressure Signal campaign completed
  // story-alien-defeated             Visitor Zero defeated
  // story-coop-chapter               Any Story chapter cleared in co-op
  // story-clean-rival-duel           Signature/Rival duel won without a miss
  // story-all-field-notes            All four optional Field Notes collected
  //
  // Store
  // store-first-purchase             1 cosmetic purchase
  // store-five-purchases             5 cosmetic purchases
  // store-twenty-purchases           20 cosmetic purchases
  // store-all-cosmetics              all 40 Store cosmetics purchased
  [
    ['battle','battle-first-win','🔔','First Bell','Win your first Battle match.','common'],
    ['battle','battle-duel-win','🥊','Head-to-Head','Win a Battle duel.','common'],
    ['battle','battle-doubles-win','🤝','Tag Team Timing','Win a Battle doubles match.','notable'],
    ['battle','battle-four-way-win','4️⃣','Four Lanes, One Winner','Win a four-way Battle match.','rare'],
    ['battle','battle-volley-sweep','🧹','Straight Sets','Sweep an Equal Volley Battle without losing a heat.','notable'],
    ['battle','battle-rush-win','⏱️','Beat the Horn','Win a Timed Rush Battle.','notable'],
    ['battle','battle-stored-power-win','🃏','Pocket Play','Win after using a stored power on the deciding play.','rare'],
    ['battle','battle-paired-sudden-death-win','🔔','Last Volley','Win a paired sudden-death Battle volley.','rare'],
    ['story-rival','story-first-rival','📨','Invitation Accepted','Defeat your first WFC rival.','common'],
    ['story-rival','story-act-one','📻','Signal Found','Complete Act I of Pressure Signal.','notable'],
    ['story-rival','story-all-urth-rivals','🌍','Urth\'s Roster','Defeat all eleven Urth rivals.','legendary'],
    ['story-rival','story-campaign-complete','📡','Pressure Signal','Complete the Pressure Signal campaign.','legendary'],
    ['story-rival','story-alien-defeated','🛸','Visitor Answered','Defeat Visitor Zero.','legendary'],
    ['story-rival','story-coop-chapter','👥','Two Against the Signal','Clear a Story chapter in co-op.','notable'],
    ['story-rival','story-clean-rival-duel','🎯','Clean Read','Win a signature rival duel without missing.','rare'],
    ['story-rival','story-all-field-notes','🗂️','Case File Complete','Collect all four Pressure Signal Field Notes.','rare'],
    ['store','store-first-purchase','🛒','First Kit','Buy your first Store cosmetic.','common'],
    ['store','store-five-purchases','🧥','Match Fit','Buy five Store cosmetics.','notable'],
    ['store','store-twenty-purchases','🎥','Broadcast Closet','Buy twenty Store cosmetics.','rare'],
    ['store','store-all-cosmetics','✨','Full Presentation','Buy all forty Store cosmetics.','legendary'],
  ].forEach(function (row) {
    add(row[0], row[1], row[2], row[3], row[4], row[5], 'v1.12', row[1]);
  });

  var CATALOG = deepFreeze(rows.slice());
  if (CATALOG.length !== 120) throw new Error('v1.12 achievement catalog must contain exactly 120 entries');
  var LEGACY_IDS = deepFreeze(CATALOG.slice(0, 100).map(function (entry) { return entry.id; }));
  var ADDED_IDS = deepFreeze(CATALOG.slice(100).map(function (entry) { return entry.id; }));
  var BY_ID = Object.create(null);
  CATALOG.forEach(function (entry) {
    if (BY_ID[entry.id]) throw new Error('Duplicate achievement ID: ' + entry.id);
    BY_ID[entry.id] = entry;
  });
  var LEGACY_ID_SET = new Set(LEGACY_IDS);
  var ALIASES = Object.freeze({ 'event-rainbow-trail': 'event-rainbow-corkscrew' });
  var LEGACY_PROGRESSION_SINK = Object.freeze({ addAchievement: function () {} });

  var BOOLEAN_FIELDS = new Set([
    'won','matchWon','humanParticipant','hasHumanPlayer','winnerIsHuman','humanWinner',
    'winningTeamHasHuman','qualifying','practice','isPractice','forced','isForced','test',
    'testData','testMode','ownerTest','ownerTestMode','simulated','aiOnly','lab','physicsLab',
    'qualifyingLabAction','eventResolved','capLand','onCap','justIgnited','perfect','greatSave',
    'droppedToOneLife','wonWithoutMiss','sawSuddenDeath','openingFlip','edgeLanding',
    'suddenDeathBefore','perfectPair','reachedOnFireCap','lostFirstHeat',
    'allCupStarterPositionsCovered','everyTeammateScored','matchPointCancellation',
    'everyTeammateMadeInRound','advancedLabUsed','replayedSeedImproved','tutorial','isTutorial',
    'imported','replay','rewardsEligible','progressionEligible','achievementsEligible',
    'statisticsDefaultEligible','battleStoredPowerWin','battlePairedSuddenDeathWin',
    'storyChapterCleared','storyCoop','rivalDuelWonWithoutMiss','campaignCompleted',
    'alienDefeated','storeAction',
  ]);
  var INTEGER_FIELDS = new Set([
    'humanPlayers','playerCount','totalFlipsLifetime','totalMakesLifetime','onFireBonus',
    'streak','pointCount','bankHits','winnerWins','ignitionsThisGame','livesBefore',
    'stakeBefore','capMakesThisMatch','loserHeatWins','lifetimeCupWins','cancellationPoints',
    'largestDeficit','distinctObjectsUsed','distinctCosmeticsEquipped','distinctArenasPlayed',
    'perfectLandingsLifetime','capLandingsLifetime','matchesLifetime','battleHeatWins',
    'battleHeatLosses','urthRivalsDefeated','fieldNoteCount','storePurchaseCount',
  ]);
  var NUMBER_FIELDS = new Set(['power','padOffset','rotations']);
  var STRING_FIELDS = new Set([
    'activity','mode','format','matchFormat','result','landingPose','pose','landingReason',
    'eventId','rareEvent','cupLength','battleFormatId','battlePaceId','newlyDefeatedRivalId',
  ]);
  var ARRAY_FIELDS = new Set(['players','newlyCompletedActIds']);
  var CONTEXT_FIELDS = new Set(Array.from(BOOLEAN_FIELDS).concat(Array.from(INTEGER_FIELDS),
    Array.from(NUMBER_FIELDS), Array.from(STRING_FIELDS), Array.from(ARRAY_FIELDS)));
  var RIVAL_IDS = new Set([
    'first-light','scatterline','meridian','cold-read','true-axis','standard-bearer',
    'fine-point','white-noise','high-water','ensemble','deep-time','visitor-zero',
  ]);

  function normalizePlayers(value) {
    return exactArray(value, 'Achievement context.players', 16, function (entry, index) {
      var player = exactRecord(entry, new Set(['isAI']), ['isAI'],
        'Achievement context.players[' + index + ']');
      return Object.freeze({ isAI: exactBoolean(player.isAI,
        'Achievement context.players[' + index + '].isAI') });
    });
  }

  function normalizeContext(value) {
    var source = exactRecord(value, CONTEXT_FIELDS, [], 'Achievement context');
    var output = {};
    Object.getOwnPropertyNames(source).forEach(function (key) {
      var raw = source[key];
      if (BOOLEAN_FIELDS.has(key)) output[key] = exactBoolean(raw, 'Achievement context.' + key);
      else if (INTEGER_FIELDS.has(key)) {
        var maximum = key === 'playerCount' || key === 'humanPlayers' ? 16
          : key === 'battleHeatWins' || key === 'battleHeatLosses' ? 3
          : key === 'urthRivalsDefeated' ? 11
          : key === 'fieldNoteCount' ? 4
          : key === 'storePurchaseCount' ? 40 : Number.MAX_SAFE_INTEGER;
        output[key] = exactNumber(raw, 'Achievement context.' + key, maximum, true);
      } else if (NUMBER_FIELDS.has(key)) {
        output[key] = exactNumber(raw, 'Achievement context.' + key, 1000000, false);
      } else if (STRING_FIELDS.has(key)) {
        output[key] = exactString(raw, 'Achievement context.' + key, 64);
      } else if (key === 'players') output.players = normalizePlayers(raw);
      else if (key === 'newlyCompletedActIds') {
        output.newlyCompletedActIds = exactArray(raw,
          'Achievement context.newlyCompletedActIds', 4, function (entry, index) {
            var id = exactString(entry, 'Achievement context.newlyCompletedActIds[' + index + ']', 1);
            if (['1','2','3','4'].indexOf(id) < 0) throw new RangeError('Unknown Story act ID: ' + id);
            return id;
          });
      }
    });
    if (output.newlyDefeatedRivalId && !RIVAL_IDS.has(output.newlyDefeatedRivalId)) {
      throw new RangeError('Unknown newly defeated rival: ' + output.newlyDefeatedRivalId);
    }
    return deepFreeze(output);
  }

  function normalizeEarnedIds(value) {
    var seen = new Set();
    return deepFreeze(exactArray(value, 'AchievementEvaluationV1.earnedIds', 256,
      function (entry, index) {
        var id = exactId(entry, 'AchievementEvaluationV1.earnedIds[' + index + ']');
        id = ALIASES[id] || id;
        if (seen.has(id)) throw new RangeError('Duplicate earned achievement ID: ' + id);
        seen.add(id);
        return id;
      }));
  }

  function AchievementEvaluationV1(value) {
    var fields = new Set(['schema','version','context','earnedIds']);
    var source = exactRecord(value, fields, ['schema','version','context','earnedIds'],
      'AchievementEvaluationV1');
    if (source.schema !== 'AchievementEvaluationV1' || source.version !== 1) {
      throw new TypeError('Achievement evaluation must use AchievementEvaluationV1');
    }
    return deepFreeze({ schema: 'AchievementEvaluationV1', version: 1,
      context: normalizeContext(source.context), earnedIds: normalizeEarnedIds(source.earnedIds) });
  }

  function activity(context) {
    return String(context.activity || context.mode || '').toLowerCase();
  }
  function matchFormat(context) {
    return String(context.format || context.matchFormat || '').toLowerCase();
  }
  function won(context) {
    return context.won === true || context.matchWon === true ||
      String(context.result || '').toLowerCase() === 'win';
  }
  function hasHumanSignal(context) {
    return context.humanParticipant === true || context.hasHumanPlayer === true ||
      context.winnerIsHuman === true || context.humanWinner === true ||
      context.winningTeamHasHuman === true || context.storeAction === true ||
      Number(context.humanPlayers) > 0 ||
      (Array.isArray(context.players) && context.players.some(function (player) { return player.isAI === false; }));
  }
  function eligible(context) {
    var active = activity(context);
    if (context.testData === true || context.test === true || context.testMode === true ||
        context.forced === true || context.isForced === true || context.ownerTest === true ||
        context.ownerTestMode === true || context.simulated === true || context.aiOnly === true ||
        context.imported === true || context.replay === true || context.practice === true ||
        context.isPractice === true || context.tutorial === true || context.isTutorial === true ||
        context.lab === true || context.physicsLab === true || active === 'practice' ||
        active === 'tutorial' || active === 'physics-lab' || active === 'lab' ||
        context.rewardsEligible === false || context.progressionEligible === false ||
        context.achievementsEligible === false || context.qualifying === false) return false;
    return context.qualifying === true || hasHumanSignal(context);
  }

  function isBattle(context) {
    return matchFormat(context) === 'battle' || activity(context) === 'battle';
  }
  function isStory(context) {
    var active = activity(context);
    return active === 'story' || active === 'rival-board';
  }
  function matchesAdded(id, context) {
    var battleWin = isBattle(context) && won(context);
    switch (id) {
      case 'battle-first-win': return battleWin;
      case 'battle-duel-win': return battleWin && context.battleFormatId === 'duel';
      case 'battle-doubles-win': return battleWin && context.battleFormatId === 'doubles';
      case 'battle-four-way-win': return battleWin && context.battleFormatId === 'four-way';
      case 'battle-volley-sweep': return battleWin && context.battlePaceId === 'volley' &&
        context.battleHeatWins >= 2 && context.battleHeatLosses === 0;
      case 'battle-rush-win': return battleWin && context.battlePaceId === 'rush';
      case 'battle-stored-power-win': return battleWin && context.battleStoredPowerWin === true;
      case 'battle-paired-sudden-death-win': return battleWin && context.battlePairedSuddenDeathWin === true;
      case 'story-first-rival': return isStory(context) && !!context.newlyDefeatedRivalId;
      case 'story-act-one': return isStory(context) &&
        Array.isArray(context.newlyCompletedActIds) && context.newlyCompletedActIds.indexOf('1') >= 0;
      case 'story-all-urth-rivals': return isStory(context) && context.urthRivalsDefeated === 11;
      case 'story-campaign-complete': return isStory(context) && context.campaignCompleted === true;
      case 'story-alien-defeated': return isStory(context) &&
        (context.alienDefeated === true || context.newlyDefeatedRivalId === 'visitor-zero');
      case 'story-coop-chapter': return activity(context) === 'story' &&
        context.storyChapterCleared === true && context.storyCoop === true;
      case 'story-clean-rival-duel': return isStory(context) && context.rivalDuelWonWithoutMiss === true;
      case 'story-all-field-notes': return isStory(context) && context.fieldNoteCount === 4;
      case 'store-first-purchase': return context.storeAction === true && context.storePurchaseCount >= 1;
      case 'store-five-purchases': return context.storeAction === true && context.storePurchaseCount >= 5;
      case 'store-twenty-purchases': return context.storeAction === true && context.storePurchaseCount >= 20;
      case 'store-all-cosmetics': return context.storeAction === true && context.storePurchaseCount === 40;
      default: return false;
    }
  }

  function legacyMatches(context, earnedIds) {
    var earned = earnedIds.filter(function (id) { return LEGACY_ID_SET.has(id); })
      .map(function (id) { return { id: id, earnedAt: null }; });
    var store = Legacy.createStore({
      // Legacy uses `opts.progression || defaultProgression`; a null value
      // would therefore mutate the v1.11 default store while merely checking a
      // condition. Supply an explicit no-op sink so this evaluator stays pure.
      progression: LEGACY_PROGRESSION_SINK,
      initialState: { schema: 'AchievementStateV3', version: 3, earned: earned },
      now: function () { return 'v1.12-evaluator'; },
    });
    return store.check(context).map(function (entry) { return entry.id; })
      .filter(function (id) { return LEGACY_ID_SET.has(id); });
  }

  function unlockedView(entry) {
    return deepFreeze({
      locked: false, id: entry.id, category: entry.category, icon: entry.icon,
      name: entry.name, description: entry.description, rarity: entry.rarity,
      reward: entry.reward, ariaLabel: entry.name,
    });
  }

  function createEvaluator() {
    // Membership and definition are deliberately held in separate weak
    // collections: membership is the unforgeable brand required by the reward
    // boundary; the map binds that brand to the evaluator-selected ID/rarity.
    var issuedEvidence = new WeakSet();
    var evidenceDefinitions = new WeakMap();
    var authority = Object.freeze({
      schema: 'AchievementRewardAuthorityV1', version: 1,
      verify: function (evidence) {
        if (!evidence || !issuedEvidence.has(evidence)) {
          throw new TypeError('Achievement evidence is not evaluator-issued');
        }
        var rewardDefinition = evidenceDefinitions.get(evidence);
        if (!rewardDefinition) throw new Error('Achievement evidence definition is unavailable');
        return rewardDefinition;
      },
    });

    function issue(entry) {
      var evidence = Object.freeze({ schema: 'AchievementRewardEvidenceV1', version: 1 });
      issuedEvidence.add(evidence);
      evidenceDefinitions.set(evidence, Object.freeze({ id: entry.id, rarity: entry.rarity }));
      return deepFreeze({
        schema: 'AchievementAwardV1', version: 1,
        achievement: unlockedView(entry), rewardEvidence: evidence,
      });
    }

    function evaluate(value) {
      var input = AchievementEvaluationV1(value);
      if (!eligible(input.context)) {
        return deepFreeze({ schema: 'AchievementEvaluationResultV1', version: 1,
          eligible: false, awards: [] });
      }
      var already = new Set(input.earnedIds);
      var matched = new Set(legacyMatches(input.context, input.earnedIds));
      ADDED_IDS.forEach(function (id) {
        if (!already.has(id) && matchesAdded(id, input.context)) matched.add(id);
      });
      var awards = CATALOG.filter(function (entry) {
        return !already.has(entry.id) && matched.has(entry.id);
      }).map(issue);
      return deepFreeze({ schema: 'AchievementEvaluationResultV1', version: 1,
        eligible: true, awards: awards });
    }

    return Object.freeze({ evaluate: evaluate, rewardAuthority: authority });
  }

  function canonicalAchievementId(value) {
    var id = exactId(value, 'achievement ID');
    return ALIASES[id] || id;
  }
  function lookupForMigration(value) {
    var id = canonicalAchievementId(value);
    return BY_ID[id] || null;
  }
  function isKnownId(value) {
    try { return !!lookupForMigration(value); } catch (_) { return false; }
  }
  function listViews(earnedIds) {
    var earned = new Set(normalizeEarnedIds(earnedIds));
    return deepFreeze(CATALOG.map(function (entry) {
      return earned.has(entry.id) ? unlockedView(entry) : LOCKED_VIEW;
    }));
  }
  function catalogSummary() {
    var categories = {};
    var rarities = {};
    CATALOG.forEach(function (entry) {
      categories[entry.category] = (categories[entry.category] || 0) + 1;
      rarities[entry.rarity] = (rarities[entry.rarity] || 0) + 1;
    });
    return deepFreeze({ total: 120, legacy: 100, added: 20,
      categoryCounts: categories, rarityCounts: rarities });
  }

  var catalogFacade = deepFreeze({
    schema: 'AchievementCatalogV1', version: 1,
    lookupForMigration: lookupForMigration,
    isKnownId: isKnownId,
    listViews: listViews,
    catalogSummary: catalogSummary,
    rewardForRarity: function (rarity) {
      var id = exactString(rarity, 'achievement rarity', 16).toLowerCase();
      return REWARD_BY_RARITY[id] || null;
    },
  });
  if (!trustedComposition) return catalogFacade;

  // Evaluation and its identity-bound reward authority are trusted
  // composition capabilities. They are intentionally available to CommonJS
  // integration code only; a browser global receives the read-only catalog
  // facade above and therefore cannot mint Profile-acceptable evidence from
  // caller-fabricated facts.
  var defaultEvaluator = createEvaluator();
  return deepFreeze({
    schema: catalogFacade.schema,
    version: catalogFacade.version,
    evaluate: defaultEvaluator.evaluate,
    rewardAuthority: defaultEvaluator.rewardAuthority,
    createEvaluator: createEvaluator,
    AchievementEvaluationV1: AchievementEvaluationV1,
    lookupForMigration: catalogFacade.lookupForMigration,
    isKnownId: catalogFacade.isKnownId,
    listViews: catalogFacade.listViews,
    catalogSummary: catalogFacade.catalogSummary,
    rewardForRarity: catalogFacade.rewardForRarity,
  });
});
