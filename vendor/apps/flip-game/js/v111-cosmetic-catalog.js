// v111-cosmetic-catalog.js -- the frozen odd-win reward sequence for v111.
//
// Unlock thresholds are deliberately kept behind internalCatalog(). Player-facing
// consumers must use view()/listForPlayer(), which disclose only owned entries.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111Cosmetics = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  var CYCLES = [
    ['Chrome', 'Sparks', 'Impact Rings', 'Clean Flip', 'Rooftop'],
    ['Matte', 'Bubbles', 'Splash', 'Table Tamer', 'Arcade'],
    ['Porcelain', 'Leaves', 'Dust Cloud', 'Spin Doctor', 'Moon Deck'],
    ['Woodgrain', 'Stars', 'Petals', 'Clutch', 'Ice Cave'],
    ['Frosted Glass', 'Pixel', 'Blocks', 'Hot Hand', 'Neon Grid'],
    ['Neon', 'Confetti', 'Comic Pop', 'Chaos Pilot', 'Garden'],
    ['Galaxy', 'Snow', 'Music Notes', 'Cap Collector', 'Space Station'],
    ['Lava', 'Smoke', 'Feathers', 'Orbit Breaker', 'Volcano'],
    ['Ice', 'Lightning', 'Gears', 'Crowd Favorite', 'Storm Table'],
    ['Holographic', 'Prism', 'Aurora', 'Flip Legend', 'Aurora Stage'],
  ];
  var TYPES = ['finish', 'trail', 'burst', 'nameplate', 'arena'];

  function kebab(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  var CATALOG = [];
  CYCLES.forEach(function (names, cycleIndex) {
    names.forEach(function (name, typeIndex) {
      var type = TYPES[typeIndex];
      var unlockAtWins = cycleIndex * 10 + typeIndex * 2 + 1;
      CATALOG.push({
        id: type + '.' + kebab(name),
        type: type,
        displayName: name,
        unlockAtWins: unlockAtWins,
        sequenceIndex: CATALOG.length,
        scope: type === 'arena' ? 'global' : 'personal',
      });
    });
  });
  freeze(CATALOG);

  var BY_ID = Object.create(null);
  CATALOG.forEach(function (entry) { BY_ID[entry.id] = entry; });

  function ownedSet(stateOrIds) {
    var ids = Array.isArray(stateOrIds) ? stateOrIds
      : (stateOrIds && Array.isArray(stateOrIds.ownedCosmeticIds)
        ? stateOrIds.ownedCosmeticIds : []);
    return new Set(ids.map(String));
  }

  function lockedView() {
    return Object.freeze({ locked: true, symbol: '🔒', ariaLabel: 'Locked' });
  }

  function unlockedView(entry) {
    return Object.freeze({
      locked: false,
      id: entry.id,
      type: entry.type,
      displayName: entry.displayName,
      scope: entry.scope,
      ariaLabel: entry.displayName,
    });
  }

  function view(stateOrIds, idOrIndex) {
    var entry = typeof idOrIndex === 'number' ? CATALOG[idOrIndex] : BY_ID[String(idOrIndex)];
    if (!entry) return null;
    return ownedSet(stateOrIds).has(entry.id) ? unlockedView(entry) : lockedView();
  }

  function listForPlayer(stateOrIds) {
    var owned = ownedSet(stateOrIds);
    return Object.freeze(CATALOG.map(function (entry) {
      return owned.has(entry.id) ? unlockedView(entry) : lockedView();
    }));
  }

  function earnedAt(qualifyingWins) {
    var wins = Math.max(0, Math.floor(Number(qualifyingWins) || 0));
    var entry = CATALOG.find(function (candidate) { return candidate.unlockAtWins === wins; });
    return entry ? clone(entry) : null;
  }

  return freeze({
    schema: 'FlipgameCosmeticCatalogV1',
    count: CATALOG.length,
    types: TYPES.slice(),
    earnedAt: earnedAt,
    view: view,
    listForPlayer: listForPlayer,
    // Rules/progression only. Never pass this data to a player-facing renderer.
    internalCatalog: function () { return clone(CATALOG); },
  });
});
