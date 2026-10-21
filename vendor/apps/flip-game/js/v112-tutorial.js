// v112-tutorial.js -- deterministic, reward-free First Flip Tour state machine.
(function (root, factory) {
  'use strict';
  var events = root && root.FlipgameV112Events;
  if (typeof module === 'object' && module.exports) events = require('./v112-events.js');
  var api = factory(events);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Tutorial = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Events) {
  'use strict';

  if (!Events) throw new Error('FlipgameV112Events must load before v112-tutorial.js');
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function seed32(value, fallback) {
    if (value == null || value === '') return fallback >>> 0;
    var number = Number(value);
    return Number.isFinite(number) ? number >>> 0 : fallback >>> 0;
  }
  function hash(seed, salt) {
    var x = (seed32(seed, 1) ^ seed32(salt, 0)) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
    return x >>> 0;
  }

  var STEPS = freeze([
    { id: 'welcome', kind: 'card', title: 'Welcome to the First Flip Tour',
      instruction: 'Flick upward. Power and sideways direction both matter.' },
    { id: 'gesture', kind: 'attempt', objective: 'qualified-launch', objectId: 'bottle',
      instruction: 'Flick upward from the table.' },
    { id: 'meter', kind: 'attempt', objective: 'meter-read', objectId: 'bottle',
      instruction: 'Use the meter to read the exact launch signal.' },
    { id: 'settling', kind: 'attempt', objective: 'resolved', objectId: 'bottle',
      instruction: 'Let the object finish settling before the verdict.' },
    { id: 'lives-turns', kind: 'card', title: 'Ten lives. Try not to yeet it.',
      instruction: 'A miss costs a life, then the turn moves on.' },
    { id: 'upright', kind: 'attempt', objective: 'upright-make', objectId: 'bottle',
      instruction: 'Land upright. Retry freely until it sticks.' },
    { id: 'cap', kind: 'attempt', objective: 'cap-make', objectId: 'bottle',
      instruction: 'A stable cap landing counts too.', guidedAfterAttempts: 2 },
    { id: 'deep-time-preview', kind: 'card', objectId: 'trex', temporaryObject: true,
      title: 'Try another Flipper', instruction: 'This preview does not unlock or alter the original T-Rex.' },
    { id: 'rainbow-demo', kind: 'attempt', objective: 'event-resolved', objectId: 'trex',
      eventId: 'rainbow-corkscrew', temporaryObject: true,
      instruction: 'The force changes the route, not the verdict.' },
    { id: 'trampoline-demo', kind: 'attempt', objective: 'event-resolved', objectId: 'trex',
      eventId: 'trampoline', temporaryObject: true,
      instruction: 'The first impact relaunches. Land the return.' },
    { id: 'complete', kind: 'complete', title: 'Tour complete',
      instruction: 'Nothing here affected your progression or statistics.' },
  ]);
  var BY_ID = Object.create(null);
  STEPS.forEach(function (step, index) { BY_ID[step.id] = { step: step, index: index }; });

  function initial(seed) {
    return freeze({ schema: 'TutorialStateV1', status: 'ready', stepId: 'welcome',
      baseSeed: seed32(seed, 1), attemptNumber: 0, stepAttemptCounts: {},
      completedStepIds: [], skipped: false, completed: false });
  }
  function normalize(value) {
    var source = value && typeof value === 'object' ? value : initial(1);
    var stepId = BY_ID[source.stepId] ? source.stepId : 'welcome';
    return freeze({ schema: 'TutorialStateV1', status: String(source.status || 'ready'),
      stepId: stepId, baseSeed: seed32(source.baseSeed, 1),
      attemptNumber: Math.max(0, Math.floor(Number(source.attemptNumber) || 0)),
      stepAttemptCounts: Object.keys(source.stepAttemptCounts && typeof source.stepAttemptCounts === 'object'
        ? source.stepAttemptCounts : {}).reduce(function (result, id) {
          if (BY_ID[id]) result[id] = Math.max(0, Math.floor(Number(source.stepAttemptCounts[id]) || 0));
          return result;
        }, {}),
      completedStepIds: Array.from(new Set(Array.isArray(source.completedStepIds)
        ? source.completedStepIds.map(String).filter(function (id) { return !!BY_ID[id]; }) : [])),
      skipped: source.skipped === true, completed: source.completed === true });
  }
  function current(state) { return BY_ID[normalize(state).stepId].step; }
  function advance(state) {
    var next = clone(normalize(state));
    var entry = BY_ID[next.stepId];
    if (next.completedStepIds.indexOf(next.stepId) < 0) next.completedStepIds.push(next.stepId);
    var nextEntry = STEPS[Math.min(STEPS.length - 1, entry.index + 1)];
    next.stepId = nextEntry.id;
    next.status = nextEntry.kind === 'complete' ? 'complete' : 'active';
    next.completed = nextEntry.kind === 'complete';
    return freeze(next);
  }
  function acknowledge(state) {
    var step = current(state);
    if (step.kind !== 'card') throw new Error('Current Tutorial step is not a card');
    return advance(state);
  }
  function prepareAttempt(state) {
    var currentState = normalize(state);
    var step = current(currentState);
    if (step.kind !== 'attempt') throw new Error('Current Tutorial step does not accept a flip');
    var attemptNumber = currentState.attemptNumber + 1;
    var stepAttemptNumber = (currentState.stepAttemptCounts[step.id] || 0) + 1;
    var seed = hash(currentState.baseSeed, attemptNumber ^ (BY_ID[step.id].index * 0x9e37));
    var selection = step.eventId ? Events.select({ activityId: 'tutorial',
      physicsModeId: 'normal', tutorialEventId: step.eventId, seed: seed }) : null;
    var guidedAssist = step.id === 'cap' && stepAttemptNumber > Number(step.guidedAfterAttempts || 0);
    return freeze({ schema: 'TutorialAttemptV1', attemptId: 'tour.' + step.id + '.' + attemptNumber,
      stepId: step.id, objective: step.objective, objectId: step.objectId,
      temporaryObject: step.temporaryObject === true, seed: seed,
      stepAttemptNumber: stepAttemptNumber,
      guidedAssist: guidedAssist,
      guidedAssistProfile: guidedAssist ? {
        id: 'cap-window', inputGuide: true, resultOverride: false,
        completesAfterQualifiedResolution: true, showCapDemonstrationOnFailure: true,
      } : null,
      eventSelection: selection, testData: true, progressionEligible: false,
      achievementsEligible: false, statisticsDefaultEligible: false });
  }
  function objectiveMet(attempt, outcome) {
    var objective = attempt.objective;
    var result = outcome && typeof outcome === 'object' ? outcome : {};
    if (objective === 'qualified-launch') return result.qualifiedManual === true;
    if (objective === 'meter-read') return result.qualifiedManual === true &&
      Number.isFinite(Number(result.normalizedPower)) && Number.isFinite(Number(result.normalizedDirection));
    if (objective === 'resolved') return result.phase === 'resolved';
    if (objective === 'upright-make') return result.result === 'MAKE' && result.pose === 'upright';
    if (objective === 'cap-make') return (result.result === 'MAKE' && result.pose === 'cap') ||
      (attempt.guidedAssist === true && result.phase === 'resolved' && result.qualifiedManual === true);
    if (objective === 'event-resolved') return result.phase === 'resolved';
    return false;
  }
  function resolveAttempt(state, attempt, outcome) {
    var currentState = normalize(state);
    if (!attempt || attempt.schema !== 'TutorialAttemptV1' || attempt.stepId !== currentState.stepId) {
      throw new TypeError('Tutorial attempt does not match the active step');
    }
    var next = clone(currentState);
    next.attemptNumber = Math.max(next.attemptNumber, Number(attempt.attemptId.split('.').pop()) || 0);
    next.stepAttemptCounts[attempt.stepId] = Math.max(next.stepAttemptCounts[attempt.stepId] || 0,
      Number(attempt.stepAttemptNumber) || 1);
    if (!objectiveMet(attempt, outcome)) {
      return freeze({ advanced: false, guidedCompletion: false,
        state: freeze(next), retry: true, awards: [] });
    }
    var guidedCompletion = attempt.guidedAssist === true &&
      !(outcome && outcome.result === 'MAKE' && outcome.pose === 'cap');
    return freeze({ advanced: true, guidedCompletion: guidedCompletion,
      state: advance(next), retry: false, awards: [] });
  }
  function skip(state) {
    var next = clone(normalize(state));
    next.status = 'skipped'; next.skipped = true; next.completed = false;
    return freeze(next);
  }

  return freeze({ schema: 'FirstFlipTourV1', steps: STEPS,
    targetDurationSeconds: { minimum: 45, maximum: 75 }, initial: initial,
    normalize: normalize, current: current, acknowledge: acknowledge,
    prepareAttempt: prepareAttempt, resolveAttempt: resolveAttempt, skip: skip });
});
