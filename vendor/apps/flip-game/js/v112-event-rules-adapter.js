// v112-event-rules-adapter.js -- sole event-verdict to match-rule boundary.
(function (factory) {
  'use strict';
  var nodeModule = null;
  try {
    if (typeof process === 'object' && process !== null &&
        typeof process.getBuiltinModule === 'function') nodeModule = process.getBuiltinModule('module');
  } catch (_) { nodeModule = null; }
  var commonJs = typeof nodeModule === 'function' && nodeModule._cache &&
    typeof module === 'object' && module !== null && module.constructor === nodeModule &&
    Object.getPrototypeOf(module) === nodeModule.prototype &&
    nodeModule._cache[module.filename] === module &&
    Object.prototype.hasOwnProperty.call(module, 'exports') &&
    module.require === nodeModule.prototype.require && typeof module.filename === 'string' &&
    typeof process === 'object' && process !== null &&
    process.release && process.release.name === 'node' &&
    process.versions && typeof process.versions.node === 'string';
  if (!commonJs) {
    throw new Error('v112-event-rules-adapter.js is a private CommonJS core and cannot initialize as a classic script');
  }
  module.exports = factory(module.require('./v112-event-kernel.js'));
})(function (Kernel) {
  'use strict';

  if (!Kernel || Kernel.schema !== 'FlipgameEventKernelV2') {
    throw new Error('FlipgameV112EventKernel V2 must load before v112-event-rules-adapter.js');
  }

  var ROULETTE_MULTIPLIERS = Object.freeze([1, 2, 3, 4, 4, 3, 2, 1]);
  var PLINKO_SLOTS = Object.freeze([
    'lives-doubled', 'everyone-else-halved', 'always-magnet', 'automatic-loss',
    'automatic-win', 'automatic-loss', 'always-magnet',
    'everyone-else-halved', 'lives-doubled',
  ]);

  function metadata(outcome) {
    return { eventId: outcome.eventId, eventClass: outcome.eventClass,
      laneId: outcome.laneId, launchClaimId: outcome.launchClaimId,
      outcomeFacts: outcome.facts.values };
  }

  function validatePhysicalVerdict(outcome) {
    var id = outcome.eventId;
    var made = outcome.result === 'MAKE';
    var facts = outcome.facts.values;
    function madeRequires(condition, message) {
      if (made && !condition) throw new Error(id + ' cannot report MAKE: ' + message);
    }
    function exactVerdict(condition, message) {
      if (made !== !!condition) throw new Error(id + ' verdict conflicts with ' + message);
    }
    if (id === 'bouncy-bottle') madeRequires(facts.fullySettled, 'bounce sequence is not settled');
    if (id === 'alien-invasion') exactVerdict(facts.bankCount >= 1 && facts.ringEntered,
      'bank-and-ring facts');
    if (id === 'trampoline') madeRequires(facts.relaunchCount >= 1 && facts.returnedToTable,
      'the return landing did not occur');
    if (id === 'portal-pair') madeRequires(facts.portalPasses >= 1, 'no portal was traversed');
    if (id === 'tether-swing') madeRequires(facts.cableAttached && facts.released,
      'the tether arc was incomplete');
    if (id === 'mitosis') exactVerdict(facts.landedCopies >= 1, 'clone landing evidence');
    if (id === 'double-flip') madeRequires(facts.rotations >= 2, 'fewer than two rotations completed');
    if (id === 'ceiling-flip') madeRequires(facts.ceilingContact, 'the ceiling plane was not reached');
    if (id === 'boomerang') madeRequires(facts.returnedToOrigin, 'the marked return was not reached');
    if (id === 'cap-toss') exactVerdict(facts.bodyLanded && facts.topLanded,
      'body/top collider verdicts');
  }

  function classicReward(outcome, rulesInput, output) {
    var id = outcome.eventId;
    var facts = outcome.facts.values;
    if (id === 'mirror-match') {
      output.deferred = { schema: 'EventDeferredEffectV1', kind: 'mirror-match',
        normalizedLaunchX: facts.normalizedLaunchX,
        normalizedLaunchY: facts.normalizedLaunchY, spin: facts.spin,
        profileSeed: facts.profileSeed, physicsProfileId: facts.physicsProfileId,
        nestedEvents: false };
    }
    if (rulesInput.result !== 'MAKE') return;
    if (id === 'rainbow-corkscrew') rulesInput.effects.additiveLives = 1;
    if (id === 'golden-flip') rulesInput.golden = true;
    if (id === 'shrink-ray') rulesInput.effects.additiveLives = rulesInput.pose === 'cap' ? 3 : 2;
    if (id === 'mitosis' && facts.landedCopies === 2) rulesInput.effects.additiveLives = 3;
    if (id === 'double-flip') {
      rulesInput.effects.lifeMultiplier = 2;
      rulesInput.effects.halveOpponents = true;
    }
    if (id === 'heart-rush') rulesInput.effects.additiveLives = 3;
    if (id === 'roulette-table') rulesInput.effects.lifeMultiplier =
      ROULETTE_MULTIPLIERS[facts.sectorIndex];
    if (id === 'cap-toss') rulesInput.effects.additiveLives = 5;
    if (id === 'life-drain') rulesInput.effects.setOpponentsTo = 1;
  }

  function teamReward(outcome, rulesInput, output) {
    var id = outcome.eventId;
    var facts = outcome.facts.values;
    if (id === 'mirror-match') {
      output.deferred = { schema: 'EventDeferredEffectV1', kind: 'mirror-match',
        normalizedLaunchX: facts.normalizedLaunchX,
        normalizedLaunchY: facts.normalizedLaunchY, spin: facts.spin,
        profileSeed: facts.profileSeed, physicsProfileId: facts.physicsProfileId,
        nestedEvents: false };
    }
    if (rulesInput.result !== 'MAKE') return;
    if (id === 'golden-flip') rulesInput.golden = true;
    if (id === 'rainbow-corkscrew') rulesInput.effects.additivePoints = 1;
    // These are total raw flip values, not bonuses on top of the base point.
    if (id === 'shrink-ray') rulesInput.rawPoints = rulesInput.pose === 'cap' ? 3 : 2;
    if (id === 'mitosis' && facts.landedCopies === 2) rulesInput.rawPoints = 3;
    if (id === 'double-flip') {
      rulesInput.effects.scoreMultiplier = 2;
      rulesInput.effects.halveOpponentRound = true;
    }
    if (id === 'heart-rush') rulesInput.effects.additivePoints = 3;
    if (id === 'roulette-table') rulesInput.effects.scoreMultiplier =
      ROULETTE_MULTIPLIERS[facts.sectorIndex];
    if (id === 'cap-toss') rulesInput.rawPoints = 5;
  }

  function applyPlinko(outcome, formatId, rulesInput, output) {
    var facts = outcome.facts.values;
    if (facts.completionKind === 'no-contest') {
      output.noContest = true;
      return;
    }
    var slot = PLINKO_SLOTS[facts.slotIndex];
    rulesInput.result = slot === 'automatic-loss' ? 'MISS' : 'MAKE';
    rulesInput.pose = slot === 'automatic-loss' ? 'miss' : 'upright';
    if (slot === 'automatic-win') {
      output.terminalOutcome = 'current-win';
      if (formatId === 'team-clash') rulesInput.effects.automaticWinner = 'current';
    } else if (slot === 'automatic-loss') {
      output.terminalOutcome = 'current-loss';
      if (formatId === 'team-clash') rulesInput.effects.automaticWinner = 'opponent';
      else rulesInput.effects.forceEliminateActor = true;
    } else if (slot === 'lives-doubled') {
      if (formatId === 'team-clash') rulesInput.effects.scoreMultiplier = 2;
      else rulesInput.effects.lifeMultiplier = 2;
    } else if (slot === 'everyone-else-halved') {
      if (formatId === 'team-clash') rulesInput.effects.halveOpponentScore = true;
      else rulesInput.effects.halveOpponents = true;
    } else if (slot === 'always-magnet') {
      rulesInput.effects.grantAlwaysMagnet = true;
    }
  }

  function mapOutcome(outcome, formatId) {
    validatePhysicalVerdict(outcome);
    var rulesInput = { result: outcome.result, pose: outcome.pose,
      effects: { metadata: metadata(outcome) } };
    var output = { terminalOutcome: null, deferred: null, noContest: false };
    if (outcome.eventId === 'plinko') applyPlinko(outcome, formatId, rulesInput, output);
    else if (formatId === 'team-clash') teamReward(outcome, rulesInput, output);
    else classicReward(outcome, rulesInput, output);
    return Kernel.immutableData({ rulesInput: output.noContest || output.terminalOutcome
      ? null : rulesInput, terminalOutcome: output.terminalOutcome,
      deferred: output.deferred, noContest: output.noContest,
      metadata: metadata(outcome) }, 'event rule mapping');
  }

  function createRulesAdapter(options) {
    if (!Kernel.isPlainObject(options)) throw new TypeError('Rules adapter options are required');
    Kernel.exactKeys(options, ['authority'], 'Rules adapter options');
    var authority = options.authority;
    var authorityInfo = Kernel.rulesAuthorityInfo(authority);
    Kernel.claimRulesAdapter(authority);
    var namespace = authorityInfo.namespace;
    var formatId = authorityInfo.formatId;
    var closed = false;

    function resolve(value) {
      if (closed) throw new Error('Event rules adapter is closed');
      if (!Kernel.isPlainObject(value)) throw new TypeError('Event rules resolution request is required');
      Kernel.exactKeys(value, ['resolutionIdentity', 'outcome'],
        'Event rules resolution request');
      var identity = value.resolutionIdentity;
      var outcome = value.outcome;
      Kernel.outcomeInfo(authority, outcome);
      if (formatId === 'team-clash' && outcome.eventId === 'life-drain') {
        throw new Error('Life Drain is excluded from Team Clash');
      }
      var mapped = mapOutcome(outcome, formatId);
      var consumed = Kernel.consumeOutcome(authority, outcome, identity, mapped);
      var live = Kernel.rulesAuthorityInfo(authority);
      var result = Kernel.immutableData({ schema: 'EventRulesResolutionV1',
        namespace: namespace, resolutionId: identity.id, eventId: outcome.eventId,
        formatId: formatId, claimed: !consumed.duplicate, duplicate: consumed.duplicate,
        rulesInput: consumed.duplicate ? null : mapped.rulesInput,
        terminalOutcome: consumed.duplicate ? null : mapped.terminalOutcome,
        noContest: consumed.duplicate ? false : mapped.noContest,
        deferred: consumed.duplicate ? null : mapped.deferred,
        transition: consumed.consume.transition, resolvedThrough: live.resolvedThrough },
      'event rules resolution');
      return result;
    }

    function snapshot() {
      var live = Kernel.rulesAuthorityInfo(authority);
      return Object.freeze({ schema: 'EventRulesAdapterSnapshotV1', namespace: namespace,
        formatId: formatId, closed: closed, resolvedThrough: live.resolvedThrough,
        nextOrdinal: live.nextOrdinal });
    }
    function cleanup() {
      closed = true;
      return snapshot();
    }
    return Object.freeze({ schema: 'EventRulesAdapterV2', namespace: namespace,
      resolve: resolve, snapshot: snapshot, cleanup: cleanup });
  }

  return Object.freeze({ schema: 'FlipgameEventRulesAdapterV2',
    ROULETTE_MULTIPLIERS: ROULETTE_MULTIPLIERS, PLINKO_SLOTS: PLINKO_SLOTS,
    createRulesAdapter: createRulesAdapter });
});
