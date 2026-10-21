// v112-urth.js -- authored canon terms and flavor-only alternate spellings.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112Urth = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';
  var CANON = Object.freeze({
    planet: 'Urth',
    championship: 'Wurld Flip Championship',
    championshipShort: 'WFC',
    standardFormat: 'WFC Standard',
    refrain: 'Ten lives. Try not to yeet it.',
    storyTitle: 'Pressure Signal',
    physicsUnit: 'Field Physics Unit',
  });
  // Broadcast flavor never replaces the plain make/miss and rules vocabulary
  // used by settings, statistics, exports, errors, or accessibility output.
  var BROADCAST_TERMS = Object.freeze({
    federation: 'Wurld Flip Federation',
    federationShort: 'WFF',
    flipper: 'Flipper',
    entry: 'Entry',
    lineup: 'Lineup',
    table: 'Table',
    lane: 'Lane',
    set: 'Set',
    release: 'Release',
    flight: 'Flight',
    contact: 'Contact',
    settle: 'Settle',
    hold: 'Hold',
    stand: 'Stand',
    crown: 'Crown',
    noHold: 'No Hold',
    cleanHold: 'Clean Hold',
    recoveryHold: 'Recovery Hold',
    stake: 'Stake',
    risingStake: 'Rising Stake',
    pressure: 'Pressure',
    pressureShot: 'Pressure Shot',
    pressureSave: 'Pressure Save',
    rotation: 'Lineup Rotation',
    objectRotations: 'Object Rotations',
    ignition: 'Ignition',
    fullBurn: 'Full Burn',
    burnout: 'Burnout',
    signalEvent: 'Signal Event',
    signalCall: 'Signal Detected',
    recentForm: 'Recent Form',
    arcTrace: 'Arc Trace',
    holdRate: 'Hold Rate',
    crownRate: 'Crown Rate',
    pressureSaveRate: 'Pressure Save Rate',
    tableJudge: 'Table Judge',
    replayDesk: 'Replay Desk',
    trajectoryAnalyst: 'Trajectory Analyst',
    takesTheTable: 'Takes the Table',
    fairFormCertified: 'Fair-Form Certified',
    fairFormStandard: 'Fair-Form Standard',
  });
  var BROADCAST_DEFINITIONS = Object.freeze({
    federation: 'The sanctioning body for organized Flipgame on Urth.',
    federationShort: 'The official abbreviation for the Wurld Flip Federation.',
    flipper: 'The selected competition object or character.',
    entry: 'One player and their selected Flipper presented as one competitive entry.',
    lineup: 'Every Entry still active in the current contest.',
    table: 'The regulation field of play.',
    lane: 'One isolated play zone on a multi-Entry Battle table.',
    set: 'The ready position before input begins.',
    release: 'The qualified launch gesture leaving the table.',
    flight: 'The airborne portion of a shot.',
    contact: 'The first physical touch with a valid landing surface.',
    settle: 'The judging interval after contact and before a verdict.',
    hold: 'Any valid settled make.',
    stand: 'An upright hold.',
    crown: 'A valid top or inverted landing in the cap-result class.',
    noHold: 'A resolved miss.',
    cleanHold: 'A hold completed without a bounce or slide after first contact.',
    recoveryHold: 'A hold completed after a bounce, slide, or other physical recovery.',
    stake: 'The exact number of lives the current Entry would lose on a miss.',
    risingStake: 'The Sudden Death call indicating that the current stake can escalate.',
    pressure: 'The broadcast condition created by lives at risk, especially near elimination.',
    pressureShot: 'A shot where a miss would eliminate the current Entry.',
    pressureSave: 'A hold made on a Pressure Shot.',
    rotation: 'One allocated turn for every active Entry; retained ON FIRE shots do not advance it.',
    objectRotations: 'The physical revolutions completed by the Flipper during one attempt.',
    ignition: 'The moment an Entry enters ON FIRE.',
    fullBurn: 'An ON FIRE run that reaches the additive life cap.',
    burnout: 'An ON FIRE run ending on a miss.',
    signalEvent: 'A pre-announced unusual physical condition affecting the Flipper or table.',
    signalCall: 'The broadcast cue shown before a Signal Event launch.',
    recentForm: 'A compact recent make/miss sequence.',
    arcTrace: 'A replay visualization of the physical trajectory.',
    holdRate: 'Observed makes divided by qualified attempts.',
    crownRate: 'Observed Crown holds divided by qualified attempts.',
    pressureSaveRate: 'Observed Pressure Saves divided by Pressure Shots.',
    tableJudge: 'The official presentation role confirming the settled verdict.',
    replayDesk: 'The broadcast presentation role for close-land and trajectory review.',
    trajectoryAnalyst: 'The broadcast role explaining release and trajectory data.',
    takesTheTable: 'The broadcast winner call after the plain result is confirmed.',
    fairFormCertified: 'The equipment badge confirming compliance with the Fair-Form Standard.',
    fairFormStandard: 'The WFC rule giving every Flipper the same competitive collision envelope and contact plane.',
  });
  // Never apply these as a text transform. Writers opt into one authored token
  // per short flavor unit; functional and accessible copy stays conventional.
  var FLAVOR_SPELLINGS = Object.freeze({
    earth: 'urth',
    world: 'wurld',
    first: 'furst',
    perfect: 'purfect',
    work: 'wurk',
    early: 'urly',
    learn: 'lurn',
    heard: 'hurd',
    person: 'purson',
    journey: 'jurney',
  });
  var AUTHORED_LINES = Object.freeze({
    qualifierPoster: 'Furst WFC Qualifier — doors at seven.',
    stationBoard: 'Next transmission: WFC Standard.',
    inspectionSeal: 'Purfect form is optional. Fair form is not.',
    labCard: 'Calibration passed. The field still does not wurk as predicted.',
    maintenanceCard: 'Maintenance heard the clock twice.',
    crowdNotice: 'Spectator lanes open urly after the final horn.',
  });
  return Object.freeze({
    schema: 'UrthLexiconV1',
    canon: CANON,
    broadcastTerms: BROADCAST_TERMS,
    broadcastDefinitions: BROADCAST_DEFINITIONS,
    flavorSpellings: FLAVOR_SPELLINGS,
    authoredLines: AUTHORED_LINES,
  });
});
