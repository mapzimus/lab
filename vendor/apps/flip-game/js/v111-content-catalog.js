// v111-content-catalog.js -- canonical object ladder and lock-safe views.
(function (root, factory) {
  'use strict';
  var manifest = root && root.FLIP_V111_OBJECT_MANIFEST;
  if (typeof module === 'object' && module.exports) {
    manifest = require('./v111-object-manifest.js');
  }
  var api = factory(manifest);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipgameV111Content = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Manifest) {
  'use strict';
  if (!Manifest) throw new Error('Flipgame v111 object manifest must load before the content catalog');

  var EXISTING = [
    ['bottle', 'Bottle', '🍾', 0],
    ['ketchup', 'Ketchup', '🍅', 4],
    ['maple', 'Maple Syrup', '🍁', 8],
    ['honeybear', 'Honey Bear', '🐻', 12],
    ['babybottle', 'Baby Bottle', '🍼', 16],
    ['extinguisher', 'Extinguisher', '🧯', 20],
    ['soap', 'Soap Pump', '🧼', 24],
    ['hourglass', 'Hourglass', '⌛', 28],
    ['bowlingpin', 'Bowling Pin', '🎳', 32],
    ['cone', 'Traffic Cone', '🚧', 36],
    ['flask', 'Lab Flask', '🧪', 40],
    ['shell', 'Artillery Shell', '💥', 44],
    ['pawn', 'Chess Pawn', '♟️', 48],
    ['buoy', 'Buoy', '🟠', 52],
    ['wineglass', 'Juice Glass', '🧃', 56],
    ['toucan', 'Toucan', '🦜', 60],
    ['trex', 'T-Rex', '🦖', 64],
    ['whippedcream', 'Whipped Cream', '🍦', 68],
    ['potion', 'Potion', '✨', 72],
    ['tabasco', 'Hot Sauce', '🌶️', 76],
    ['coke', 'Cola Bottle', '🥤', 80],
    ['stanley', 'Tumbler', '🥤', 84],
    ['lavalamp', 'Lava Lamp', '💡', 88],
    ['lawnchair', 'Lawn Chair', '🪑', 92],
    ['octopus', 'Octopus', '🐙', 96],
    ['alien', 'Alien', '👽', 100],
  ];
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  var FLAVORS = Manifest.flavorOrder.map(function (flavor) {
    return { id: flavor.id, displayName: flavor.displayName, color: flavor.color };
  });
  var NEW_BY_ID = Object.create(null);
  Manifest.objects.forEach(function (entry) { NEW_BY_ID[entry.id] = entry; });

  function genericVariants(object) {
    return FLAVORS.map(function (flavor) {
      return {
        id: object.id + '.' + flavor.id,
        objectId: object.id,
        variantId: flavor.id,
        displayName: object.displayName + ' — ' + flavor.displayName,
        label: object.displayName + ' — ' + flavor.displayName,
        color: flavor.color,
        availability: 'with-object',
      };
    });
  }

  var OBJECTS = EXISTING.map(function (row) {
    var record = { id: row[0], displayName: row[1], emoji: row[2], unlockAtWins: row[3] };
    record.variants = genericVariants(record);
    return record;
  }).concat(Manifest.objects.map(function (record) {
    return {
      id: record.id,
      displayName: record.displayName,
      emoji: record.emoji,
      unlockAtWins: record.unlockAtWins,
      variants: record.variants.map(function (variant) {
        return {
          id: variant.id,
          objectId: variant.objectId,
          variantId: variant.variantId,
          displayName: variant.displayName,
          label: variant.label,
          color: variant.color,
          availability: 'with-object',
        };
      }),
    };
  })).sort(function (a, b) { return a.unlockAtWins - b.unlockAtWins; });
  OBJECTS.forEach(function (entry, index) { entry.rosterOrder = index; });
  freeze(OBJECTS);

  var OBJECT_BY_ID = Object.create(null);
  var VARIANT_BY_ID = Object.create(null);
  OBJECTS.forEach(function (object) {
    OBJECT_BY_ID[object.id] = object;
    object.variants.forEach(function (variant) { VARIANT_BY_ID[variant.id] = variant; });
  });
  var FEATURES = freeze([
    { id: 'insane-mode', displayName: 'Insane Mode', unlockAtWins: 100 },
    { id: 'physics-lab', displayName: 'Physics Lab', unlockAtWins: 100 },
  ]);
  var FEATURE_BY_ID = Object.create(null);
  FEATURES.forEach(function (feature) { FEATURE_BY_ID[feature.id] = feature; });

  function idSet(value, key) {
    var ids = Array.isArray(value) ? value : (value && Array.isArray(value[key]) ? value[key] : []);
    return new Set(ids.map(String));
  }
  function claimedSet(state) { return idSet(state, 'claimedRewardIds'); }
  function ownsObject(state, id) {
    return idSet(state, 'ownedObjectIds').has(id) || claimedSet(state).has('object.' + id);
  }
  function ownsFeature(state, id) {
    return claimedSet(state).has('feature.' + id);
  }
  function lockedView() {
    return Object.freeze({ locked: true, symbol: '🔒', ariaLabel: 'Locked' });
  }
  function variantView(variant) {
    return Object.freeze({
      locked: false,
      id: variant.id,
      objectId: variant.objectId,
      variantId: variant.variantId,
      displayName: variant.displayName,
      label: variant.label,
      color: variant.color,
      ariaLabel: variant.displayName,
    });
  }
  function objectView(state, object) {
    if (!ownsObject(state, object.id)) return lockedView();
    return Object.freeze({
      locked: false,
      id: object.id,
      displayName: object.displayName,
      emoji: object.emoji,
      ariaLabel: object.displayName,
      variants: Object.freeze(object.variants.map(variantView)),
    });
  }
  function viewObject(state, idOrIndex) {
    var object = typeof idOrIndex === 'number' ? OBJECTS[idOrIndex] : OBJECT_BY_ID[String(idOrIndex)];
    return object ? objectView(state, object) : null;
  }
  function listObjectsForPlayer(state) {
    return Object.freeze(OBJECTS.map(function (object) { return objectView(state, object); }));
  }
  function viewVariant(state, id) {
    var variant = VARIANT_BY_ID[String(id)];
    return variant && ownsObject(state, variant.objectId) ? variantView(variant) : (variant ? lockedView() : null);
  }
  function viewFeature(state, id) {
    var feature = FEATURE_BY_ID[String(id)];
    if (!feature) return null;
    return ownsFeature(state, feature.id)
      ? Object.freeze({ locked: false, id: feature.id, displayName: feature.displayName, ariaLabel: feature.displayName })
      : lockedView();
  }
  function rewardsAt(wins) {
    var n = Math.max(0, Math.floor(Number(wins) || 0));
    var rewards = OBJECTS.filter(function (object) { return object.unlockAtWins === n; })
      .map(function (object) { return { id: 'object.' + object.id, type: 'object', contentId: object.id }; });
    FEATURES.filter(function (feature) { return feature.unlockAtWins === n; })
      .forEach(function (feature) {
        rewards.push({ id: 'feature.' + feature.id, type: 'feature', contentId: feature.id });
      });
    return clone(rewards);
  }

  return freeze({
    schema: 'FlipgameContentCatalogV1',
    objectCount: OBJECTS.length,
    variantCount: OBJECTS.length * FLAVORS.length,
    flavorCount: FLAVORS.length,
    featureCount: FEATURES.length,
    rewardsAt: rewardsAt,
    ownsObject: ownsObject,
    ownsFeature: ownsFeature,
    viewObject: viewObject,
    viewVariant: viewVariant,
    viewFeature: viewFeature,
    listObjectsForPlayer: listObjectsForPlayer,
    // Rules/progression only. Never pass this data to a player-facing renderer.
    internalObjects: function () { return clone(OBJECTS); },
    internalFeatures: function () { return clone(FEATURES); },
  });
});
