// v112-progression-catalog.js -- frozen Flip Level, rival, arena, and Store data.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV112ProgressionCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function () {
  'use strict';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }
  function kebab(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function levelEntry(level, id, displayName) {
    return { level: level, id: id, displayName: displayName };
  }

  // Variant identity is deliberately independent from a color value.  Art may
  // supply an object-specific authored label/cast for any of these stable IDs,
  // while saves and progression only persist the canonical identity.
  var VARIANT_FLAVORS = freeze([
    { id: 'blue-steel', displayName: 'Blue Steel', color: '#1f9bff' },
    { id: 'sucker-punch', displayName: 'Sucker Punch', color: '#e3263c' },
    { id: 'lime-light', displayName: 'Lime Light', color: '#8ed11a' },
    { id: 'orange-crush', displayName: 'Orange Crush', color: '#ff7a00' },
    { id: 'grape-expectations', displayName: 'Grape Expectations', color: '#8a3ffc' },
    { id: 'ice-ice-baby', displayName: 'Ice Ice Baby', color: '#5fcfe6' },
    { id: 'apple-solutely', displayName: 'Apple-solutely', color: '#3fae1a' },
    { id: 'berry-nice', displayName: 'Berry Nice', color: '#ff5b86' },
    { id: 'making-waves', displayName: 'Making Waves', color: '#4f63e0' },
    { id: 'lemon-aid', displayName: 'Lemon Aid', color: '#ffc233' },
    { id: 'very-cherry', displayName: 'Very Cherry', color: '#c8203a' },
    { id: 'pink-fluff', displayName: 'Pink Fluff', color: '#ff9ecf' },
  ]);

  var DIRECT_OBJECTS = freeze([
    levelEntry(4, 'milk-carton', 'Milk Carton'),
    levelEntry(6, 'ketchup', 'Ketchup'),
    levelEntry(8, 'soup-can', 'Soup Can'),
    levelEntry(10, 'soda-can', 'Soda Can'),
    levelEntry(12, 'salt-pepper-shaker', 'Salt/Pepper Shaker'),
    levelEntry(14, 'maple', 'Maple Syrup'),
    levelEntry(16, 'honeybear', 'Honey Bear'),
    levelEntry(18, 'babybottle', 'Baby Bottle'),
    levelEntry(20, 'soap', 'Soap Pump'),
    levelEntry(22, 'smoothie', 'Smoothie'),
    levelEntry(24, 'teapot', 'Teapot'),
    levelEntry(26, 'tabasco', 'Hot Sauce'),
    levelEntry(28, 'coke', 'Cola Bottle'),
    levelEntry(30, 'stanley', 'Tumbler'),
    levelEntry(32, 'watering-can', 'Watering Can'),
    levelEntry(34, 'wineglass', 'Juice Glass'),
    levelEntry(36, 'flask', 'Lab Flask'),
    levelEntry(40, 'microphone-stand', 'Microphone on a Stand'),
    levelEntry(42, 'bowlingpin', 'Bowling Pin'),
    levelEntry(44, 'cone', 'Traffic Cone'),
    levelEntry(46, 'potted-plants', 'Potted Plants'),
    levelEntry(48, 'lawnchair', 'Lawn Chair'),
    levelEntry(51, 'box-of-snacks', 'Box of Snacks'),
    levelEntry(54, 'hourglass', 'Hourglass'),
    levelEntry(56, 'pawn', 'Chess Pawn'),
    levelEntry(58, 'buoy', 'Buoy'),
    levelEntry(60, 'extinguisher', 'Extinguisher'),
    levelEntry(68, 'whippedcream', 'Whipped Cream'),
    levelEntry(70, 'potion', 'Potion'),
    levelEntry(74, 'owl', 'Owl'),
    levelEntry(76, 'toucan', 'Toucan'),
    levelEntry(78, 'red-panda', 'Red Panda'),
    levelEntry(84, 'pinata', 'Piñata'),
    levelEntry(88, 'mechanical-metronome', 'Mechanical Metronome'),
    levelEntry(90, 'octopus', 'Octopus'),
    levelEntry(92, 'eyeball-monster', 'Eyeball Monster'),
    levelEntry(94, 'lavalamp', 'Lava Lamp'),
    levelEntry(96, 'shell', 'Artillery Shell'),
  ]);

  var ARENAS = freeze([
    levelEntry(3, 'rooftop', 'Rooftop'),
    levelEntry(7, 'school-cafeteria', 'School Cafeteria'),
    levelEntry(11, 'sports-locker-room', 'Sports Locker Room'),
    levelEntry(15, 'grand-library', 'Grand Library'),
    levelEntry(21, 'garden', 'Garden'),
    levelEntry(25, 'arcade', 'Arcade'),
    levelEntry(29, 'island-beach', 'Island Beach'),
    levelEntry(35, 'skate-park-sunset', 'Skate Park at Sunset'),
    levelEntry(39, 'pirate-ship-deck', 'Pirate Ship Deck'),
    levelEntry(43, 'aquarium-tunnel', 'Aquarium Tunnel'),
    levelEntry(47, 'rainforest-treehouse', 'Rainforest Treehouse'),
    levelEntry(55, 'movie-soundstage', 'Movie Soundstage'),
    levelEntry(59, 'haunted-hall', 'Haunted Hall'),
    levelEntry(63, 'ice-cave', 'Ice Cave'),
    levelEntry(69, 'moon-deck', 'Moon Deck'),
    levelEntry(73, 'neon-grid', 'Neon Grid'),
    levelEntry(79, 'volcano', 'Volcano'),
    levelEntry(85, 'storm-table', 'Storm Table'),
    levelEntry(89, 'mars-outpost', 'Mars Outpost'),
    levelEntry(93, 'stadium-night', 'Stadium at Night'),
    levelEntry(95, 'space-station', 'Space Station'),
    levelEntry(99, 'aurora-stage', 'Aurora Stage'),
  ]);

  var RIVALS = freeze([
    { level: 5, id: 'first-light', objectId: 'coffee-mug', displayName: 'Coffee Mug', rival: 'Mara Venn', callsign: 'First Light', tier: 1 },
    { level: 13, id: 'scatterline', objectId: 'gumball-machine', displayName: 'Gumball Machine', rival: 'Ivo Bell', callsign: 'Scatterline', tier: 2 },
    { level: 21, id: 'meridian', objectId: 'desk-globe', displayName: 'Desk Globe', rival: 'Safiya Rowan', callsign: 'Meridian', tier: 2 },
    { level: 29, id: 'cold-read', objectId: 'penguin', displayName: 'Penguin', rival: 'Jules Mercer', callsign: 'Cold Read', tier: 3 },
    { level: 37, id: 'true-axis', objectId: 'desk-gyroscope', displayName: 'Desk Gyroscope', rival: 'Niko Arden', callsign: 'True Axis', tier: 3 },
    { level: 45, id: 'standard-bearer', objectId: 'trophy-cup', displayName: 'Trophy Cup', rival: 'Reina Sol', callsign: 'Standard Bearer', tier: 4 },
    { level: 50, id: 'fine-point', objectId: 'microscope', displayName: 'Microscope', rival: 'Dr. Arun Vale', callsign: 'Fine Point', tier: 5 },
    { level: 61, id: 'white-noise', objectId: 'snow-globe', displayName: 'Snow Globe', rival: 'Inez Park', callsign: 'White Noise', tier: 5 },
    { level: 71, id: 'high-water', objectId: 'huge-rubber-duck', displayName: 'Huge Rubber Duck', rival: 'Beck Holloway', callsign: 'High Water', tier: 6 },
    { level: 81, id: 'ensemble', objectId: 'action-figures', displayName: 'Action Figures', rival: 'Ren Damar', callsign: 'Ensemble', tier: 6 },
    { level: 91, id: 'deep-time', objectId: 'trex', displayName: 'T-Rex', rival: 'Talia Quill', callsign: 'Deep Time', tier: 7 },
    { level: 100, id: 'visitor-zero', objectId: 'alien', displayName: 'Alien', rival: 'Veyr', callsign: 'Visitor Zero', tier: 8, alien: true },
  ]);

  var FC_BY_LEVEL = freeze({
    2: 50, 5: 50, 9: 50, 13: 50, 17: 50, 19: 50, 23: 50,
    27: 75, 31: 75, 33: 75, 37: 75, 38: 75, 41: 75, 45: 75, 49: 75,
    52: 100, 53: 100, 57: 100, 61: 100, 62: 100, 64: 100, 65: 100,
    66: 100, 67: 100, 71: 100, 72: 100, 75: 100,
    77: 150, 80: 150, 81: 150, 82: 150, 83: 150, 86: 150, 87: 150,
    91: 150, 97: 150, 98: 200,
  });

  var STORE_ROWS = [
    [200, ['finish.Chrome', 'trail.Sparks', 'burst.Impact Rings', 'nameplate.Clean Flip',
      'finish.Matte', 'trail.Bubbles', 'burst.Splash', 'nameplate.Table Tamer']],
    [225, ['finish.Porcelain', 'trail.Leaves', 'burst.Dust Cloud', 'nameplate.Spin Doctor',
      'finish.Woodgrain', 'trail.Stars', 'burst.Petals', 'nameplate.Clutch']],
    [250, ['finish.Frosted Glass', 'trail.Pixel', 'burst.Blocks', 'nameplate.Hot Hand',
      'finish.Neon', 'trail.Confetti', 'burst.Comic Pop', 'nameplate.Chaos Pilot']],
    [275, ['finish.Galaxy', 'trail.Snow', 'burst.Music Notes', 'nameplate.Cap Collector',
      'finish.Lava', 'trail.Smoke', 'burst.Feathers', 'nameplate.Orbit Breaker']],
    [300, ['finish.Ice', 'trail.Lightning', 'burst.Gears', 'nameplate.Crowd Favorite',
      'finish.Holographic', 'trail.Prism', 'burst.Aurora', 'nameplate.Flip Legend']],
  ];
  var STORE_COSMETICS = [];
  STORE_ROWS.forEach(function (row) {
    row[1].forEach(function (encoded) {
      var split = encoded.indexOf('.');
      var type = encoded.slice(0, split);
      var displayName = encoded.slice(split + 1);
      STORE_COSMETICS.push({
        id: type + '.' + kebab(displayName), type: type,
        displayName: displayName, price: row[0], currency: 'FC',
      });
    });
  });
  freeze(STORE_COSMETICS);

  var OBJECT_ALIASES = freeze({
    'trophy_gold': 'mechanical-metronome',
    'tall-buildings': 'mechanical-metronome',
    'giraffe': 'desk-gyroscope',
  });

  var DIRECT_BY_LEVEL = Object.create(null);
  var ARENA_BY_LEVEL = Object.create(null);
  var RIVAL_BY_ID = Object.create(null);
  var RIVAL_BY_OBJECT = Object.create(null);
  var STORE_BY_ID = Object.create(null);
  var OBJECT_BY_ID = Object.create(null);
  var ARENA_BY_ID = Object.create(null);
  DIRECT_OBJECTS.forEach(function (entry) { DIRECT_BY_LEVEL[entry.level] = entry; });
  ARENAS.forEach(function (entry) { ARENA_BY_LEVEL[entry.level] = entry; });
  RIVALS.forEach(function (entry) { RIVAL_BY_ID[entry.id] = entry; RIVAL_BY_OBJECT[entry.objectId] = entry; });
  STORE_COSMETICS.forEach(function (entry) { STORE_BY_ID[entry.id] = entry; });

  var OBJECTS = [{ id: 'bottle', displayName: 'Bottle', source: 'starter', level: 1 }]
    .concat(DIRECT_OBJECTS.map(function (entry) {
      return { id: entry.id, displayName: entry.displayName, source: 'level', level: entry.level };
    }), RIVALS.map(function (entry) {
      return { id: entry.objectId, displayName: entry.displayName, source: 'rival',
        level: entry.level, rivalId: entry.id };
    }))
    .sort(function (a, b) { return a.level - b.level || a.id.localeCompare(b.id); });
  freeze(OBJECTS);
  OBJECTS.forEach(function (entry) { OBJECT_BY_ID[entry.id] = entry; });
  ARENAS.forEach(function (entry) { ARENA_BY_ID[entry.id] = entry; });

  function integer(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
  function canonicalObjectId(id) {
    var value = String(id || '');
    var seen = Object.create(null);
    while (OBJECT_ALIASES[value] && !seen[value]) { seen[value] = true; value = OBJECT_ALIASES[value]; }
    return value;
  }
  function canonicalArenaId(id) {
    var value = String(id || '');
    return value.indexOf('arena.') === 0 ? value.slice(6) : value;
  }
  function canonicalVariantId(id) {
    var value = String(id || '');
    var split = value.indexOf('.');
    if (split < 0) return value;
    return canonicalObjectId(value.slice(0, split)) + value.slice(split);
  }
  function object(id) {
    var entry = OBJECT_BY_ID[canonicalObjectId(id)];
    return entry ? freeze(clone(entry)) : null;
  }
  function arena(id) {
    var entry = ARENA_BY_ID[canonicalArenaId(id)];
    if (!entry && canonicalArenaId(id) === 'baseline-table') {
      entry = { id: 'baseline-table', displayName: 'Baseline Table', level: 1 };
    }
    return entry ? freeze(clone(entry)) : null;
  }
  function variantIdsFor(objectId) {
    var id = canonicalObjectId(objectId);
    if (!OBJECT_BY_ID[id]) return freeze([]);
    return freeze(VARIANT_FLAVORS.map(function (flavor) { return id + '.' + flavor.id; }));
  }
  function variant(objectId, variantId) {
    var id = canonicalObjectId(objectId);
    if (!OBJECT_BY_ID[id]) return null;
    var requested = String(variantId || '');
    if (requested.indexOf('.') >= 0) {
      requested = canonicalVariantId(requested);
      if (requested.indexOf(id + '.') !== 0) return null;
      requested = requested.slice(id.length + 1);
    }
    var flavor = VARIANT_FLAVORS.find(function (entry) { return entry.id === requested; });
    return flavor ? freeze({ id: id + '.' + flavor.id, objectId: id,
      variantId: flavor.id, displayName: flavor.displayName, color: flavor.color }) : null;
  }
  function rewardsAtLevel(level) {
    var n = integer(level);
    var rewards = [];
    if (DIRECT_BY_LEVEL[n]) rewards.push({
      id: 'level.' + n + '.object.' + DIRECT_BY_LEVEL[n].id,
      type: 'object', contentId: DIRECT_BY_LEVEL[n].id, level: n,
    });
    if (ARENA_BY_LEVEL[n]) rewards.push({
      id: 'level.' + n + '.arena.' + ARENA_BY_LEVEL[n].id,
      type: 'arena', contentId: ARENA_BY_LEVEL[n].id, level: n,
    });
    if (n === 50) rewards.push({ id: 'level.50.feature.physics-lab', type: 'feature', contentId: 'physics-lab', level: 50 });
    if (FC_BY_LEVEL[n]) rewards.push({
      id: 'level.' + n + '.fc', type: 'fc', amount: FC_BY_LEVEL[n], level: n,
    });
    if (n === 100) rewards.push({
      id: 'level.100.gate.alien-insane', type: 'conditional-feature',
      contentId: 'alien-and-insane', condition: 'alien-defeated', level: 100,
    });
    return freeze(rewards);
  }
  function rewardsThroughLevel(level) {
    var rewards = [];
    for (var n = 2; n <= Math.min(100, integer(level)); n++) {
      rewards = rewards.concat(rewardsAtLevel(n));
    }
    return freeze(rewards);
  }
  function invitationsAtLevel(level) {
    var n = integer(level);
    return freeze(RIVALS.filter(function (entry) { return entry.level === n; }).map(clone));
  }
  function invitationsThroughLevel(level) {
    var n = integer(level);
    return freeze(RIVALS.filter(function (entry) { return entry.level <= n; }).map(clone));
  }
  function rival(idOrObjectId) {
    var key = canonicalObjectId(idOrObjectId);
    var entry = RIVAL_BY_ID[String(idOrObjectId)] || RIVAL_BY_OBJECT[key];
    return entry ? freeze(clone(entry)) : null;
  }
  function storeCosmetic(id) {
    var entry = STORE_BY_ID[String(id)];
    return entry ? freeze(clone(entry)) : null;
  }

  var fcTotal = Object.keys(FC_BY_LEVEL).reduce(function (sum, level) { return sum + FC_BY_LEVEL[level]; }, 0);
  var objectIds = ['bottle'].concat(DIRECT_OBJECTS.map(function (entry) { return entry.id; }),
    RIVALS.map(function (entry) { return entry.objectId; }));
  var uniqueObjects = new Set(objectIds);
  if (DIRECT_OBJECTS.length !== 38 || ARENAS.length !== 22 || RIVALS.length !== 12 ||
      STORE_COSMETICS.length !== 40 || uniqueObjects.size !== 51 || OBJECTS.length !== 51 ||
      VARIANT_FLAVORS.length !== 12 || OBJECTS.length * VARIANT_FLAVORS.length !== 612 ||
      fcTotal !== 3700) {
    throw new Error('v1.12 progression catalog count or FC invariant failed');
  }

  return freeze({
    schema: 'ProgressionCatalogV1', version: 1,
    defaults: { objectId: 'bottle', arenaId: 'baseline-table', cosmeticId: null },
    objects: clone(OBJECTS), variantFlavors: clone(VARIANT_FLAVORS),
    directObjects: clone(DIRECT_OBJECTS), arenas: clone(ARENAS), rivals: clone(RIVALS),
    storeCosmetics: clone(STORE_COSMETICS), levelFc: clone(FC_BY_LEVEL),
    counts: { objects: 51, directObjects: 38, rivalObjects: 12, arenas: 23,
      collectibleArenas: 22, storeCosmetics: 40, levelFcTotal: 3700 },
    variantCount: 612, variantsPerObject: 12,
    objectIds: Array.from(uniqueObjects), arenaIds: ['baseline-table'].concat(ARENAS.map(function (entry) { return entry.id; })),
    objectAliases: clone(OBJECT_ALIASES),
    canonicalObjectId: canonicalObjectId, canonicalArenaId: canonicalArenaId,
    canonicalVariantId: canonicalVariantId,
    object: object, arena: arena, variant: variant, variantIdsFor: variantIdsFor,
    rewardsAtLevel: rewardsAtLevel, rewardsThroughLevel: rewardsThroughLevel,
    invitationsAtLevel: invitationsAtLevel, invitationsThroughLevel: invitationsThroughLevel,
    rival: rival, storeCosmetic: storeCosmetic,
  });
});
