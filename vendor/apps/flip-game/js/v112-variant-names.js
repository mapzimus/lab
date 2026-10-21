// Authored gallery labels only. No drawing, progression, RNG or physics hooks.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.FLIP_V112_VARIANT_NAMES = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Exact Skins / v111 manifest order. A color refers to the swatch and shell,
  // not necessarily contents (Smoothie contents may change on every flip).
  const colors = Object.freeze([
    '#1f9bff', '#e3263c', '#8ed11a', '#ff7a00', '#8a3ffc', '#5fcfe6',
    '#3fae1a', '#ff5b86', '#4f63e0', '#ffc233', '#c8203a', '#ff9ecf',
  ]);
  const variantIds = Object.freeze([
    'blue-steel', 'sucker-punch', 'lime-light', 'orange-crush',
    'grape-expectations', 'ice-ice-baby', 'apple-solutely', 'berry-nice',
    'making-waves', 'lemon-aid', 'very-cherry', 'pink-fluff',
  ]);
  const names = {
    'coffee-mug': [
      'Blue Brew', 'Red Eye', 'Lime Latte', 'Orange Roast',
      'Grape Grounds', 'Iced Attitude', 'Green Grind', 'Berry Awake',
      'Midnight Mug', 'Mellow Yellow', 'Cherry Charge', 'Pink Sip',
    ],
    'milk-carton': [
      'Moo Blue', 'Red Herd', 'Lime Pasture', 'Orange Udder',
      'Purple Graze', 'Ice Cow', 'Green Moo', 'Berry Dairy',
      'Night Milk', 'Yellow Bellow', 'Cherry Chewer', 'Pink Pail',
    ],
    teapot: [
      'Blue Steep', 'Red Kettle', 'Lime Tea Time', 'Orange Pekoe',
      'Purple Pour', 'Ice Tea Sea', 'Green Gossip', 'Berry British',
      'Night Steeper', 'Lemon Drama', 'Cherry Chai', 'Pinkies Up',
    ],
    'salt-pepper-shaker': [
      'Sea Salt', 'Red Pepper', 'Lime Tower', 'Orange Zest',
      'Purple Pinch', 'Ice Shroom', 'Green Machine', 'Berry Beacon',
      'Night Grind', 'Lemon Twins', 'Cherry Flute', 'Pink Drumroll',
    ],
    'soup-can': [
      'Blue Broth', 'Tomato Drama', 'Lime Lentil', 'Carrot Chaos',
      'Purple Puree', 'Chilly Chowder', 'Pea Panic', 'Berry Bisque',
      'Midnight Stew', 'Corny Can', 'Cherry Chili', 'Pink Potluck',
    ],
    smoothie: [
      'Blue Blender', 'Red Whirl', 'Lime Crime', 'Orange Orbit',
      'Grape Escape', 'Ice Sipper', 'Green Gulp', 'Berry Dizzy',
      'Navy Nectar', 'Lemon Lurch', 'Cherry Swirl', 'Pink Plunge',
    ],
    'gumball-machine': [
      'Blue Chew', 'Red Rattle', 'Lime Chime', 'Orange Oops',
      'Grape Gumboss', 'Ice Dispenser', 'Green Gobstop', 'Berry Bubble',
      'Navy Nibbles', 'Lemon Loot', 'Cherry Chomp', 'Pink Popper',
    ],
    microscope: [
      'Blue Zoom', 'Red Research', 'Lime Slide', 'Orange Optics',
      'Purple Probe', 'Ice Inspector', 'Green Germ', 'Berry Buggy',
      'Navy Nerd', 'Lemon Lens', 'Cherry Check', 'Pink Petri',
    ],
    'desk-globe': [
      'Blue Latitude', 'Red Meridian', 'Lime Longitude', 'Orange Atlas',
      'Purple Pole', 'Ice Age', 'Green Grid', 'Berry Borders',
      'Night Shift', 'Sunny Side', 'Cherry Chart', 'Pink Planet',
    ],
    'microphone-stand': [
      'Blue Notes', 'Red Loud', 'Lime Mic', 'Orange Encore',
      'Purple Pitch', 'Ice Breaker', 'Green Room', 'Berry Vocal',
      'Night Host', 'Yellow Yodel', 'Cherry Chorus', 'Pink Feedback',
    ],
    'potted-plants': [
      'Blue Succulent', 'Red Prickles', 'Lime Fernado', 'Orange Sunny',
      'Purple Orchid', 'Ice Bonsai', 'Green Hiss', 'Berry Monstera',
      'Navy Aloe', 'Lemon Snap', 'Cherry Palm', 'Pink Climber',
    ],
    penguin: [
      'Blue Majesty', 'Red Rockhop', 'Lime Waddle', 'Orange Adelie',
      'Purple Chin', 'Ice Macaroni', 'Green Fisher', 'Berry Brave',
      'Navy Noodles', 'Lemon Bot', 'Cherry Snow', 'Pink Stardom',
    ],
    owl: [
      'Blue Who', 'Red Hoot', 'Lime Lookout', 'Orange Orator',
      'Purple Ponder', 'Ice Wise', 'Green Glare', 'Berry Beak',
      'Night Shift', 'Lemon Lecture', 'Cherry Chirp', 'Pink Blink',
    ],
    'desk-gyroscope': [
      'Blue Balance', 'Red Rotator', 'Lime Lean', 'Orange Axis',
      'Purple Pivot', 'Ice Orbit', 'Green Gimbal', 'Berry Bearing',
      'Navy Nutation', 'Lemon Looper', 'Cherry Center', 'Pink Precess',
    ],
    'red-panda': [
      'Blue Bamboo', 'Red Rascal', 'Lime Napper', 'Orange Snooze',
      'Purple Paws', 'Ice Tail', 'Green Gobbler', 'Berry Bandit',
      'Navy Naptime', 'Lemon Lounger', 'Cherry Cheeks', 'Pink Prowler',
    ],
    'trophy-cup': [
      'Blue Brag', 'Red Ribbon', 'Lime Legend', 'Orange Star',
      'Purple Pride', 'Ice Shield', 'Green Gleam', 'Berry Laurels',
      'Navy Rocket', 'Lemon Champ', 'Cherry Crown', 'Pink Podium',
    ],
    'snow-globe': [
      'Blue Cabin', 'Red Snow City', 'Lime Summit', 'Orange Waddle',
      'Purple Pines', 'Ice Moon', 'Green Keep', 'Berry Reef',
      'Navy Snowbot', 'Lemon Shroom', 'Cherry Rocket', 'Pink Aurora',
    ],
    'eyeball-monster': [
      'Blue Blinker', 'Red Stalker', 'Lime Lashes', 'Orange Goggles',
      'Purple Peeker', 'Ice Iris Bot', 'Green Crown', 'Berry Batwink',
      'Navy Petal', 'Lemon Moonwink', 'Cherry Reader', 'Pink Starer',
    ],
    'soda-can': [
      'Blue Burble', 'Red Fizz', 'Lime Pop', 'Orange Spritz',
      'Grape Geyser', 'Ice Hiss', 'Green Gas', 'Berry Bubbles',
      'Night Nectar', 'Lemon Pressure', 'Cherry Rumble', 'Pink Pssst',
    ],
    'watering-can': [
      'Blue Drizzle', 'Red Rain', 'Lime Trunk', 'Orange Reach',
      'Purple Rose', 'Ice Cube Can', 'Green Teatime', 'Berry Waterbot',
      'Navy Petals', 'Lemon Acorn', 'Cherry Boots', 'Pink Rocket',
    ],
    pinata: [
      'Blue Burro', 'Red Starburst', 'Lime Liftoff', 'Orange Cactus',
      'Purple Cupcake', 'Ice Partybot', 'Green Moon', 'Berry Ananas',
      'Navy Castle', 'Lemon Drum', 'Cherry Cloud', 'Pink Monster',
    ],
    'huge-rubber-duck': [
      'Blue Quacker', 'Red Stretch', 'Lime Puddle', 'Orange Ahoy',
      'Purple Paddle', 'Ice Quackbot', 'Green Duckrex', 'Berry Uniquack',
      'Navy Duckonaut', 'Lemon Slicker', 'Cherry Royal', 'Pink Patches',
    ],
    'action-figures': [
      'Blue Moonboot', 'Red Gearhead', 'Sir Lime', 'Orange Wiz',
      'Purple Scout', 'Ice Labcoat', 'Green Racer', 'Berry Diver',
      'Navy Sleuth', 'Lemon Aviator', 'Cherry Tinker', 'Pink Ranger',
    ],
    'mechanical-metronome': [
      'Blue Tick', 'Red Tempo', 'Lime Time', 'Orange Offbeat',
      'Purple Pulse', 'Ice Tock', 'Green Groove', 'Berry Beat',
      'Midnight Click', 'Lemon Largo', 'Cherry Chime', 'Pink Sync',
    ],
    'box-of-snacks': [
      'Blue Crackers', 'Red Popcorn', 'Lime Pretzel', 'Orange Bites',
      'Purple Trail', 'Ice Snackstack', 'Green Lunch', 'Berry Bytebot',
      'Navy Noshship', 'Lemon Puzzle', 'Cherry Party', 'Pink Surprise',
    ],
  };

  // These broad families change their authored cast with the swatch. Keep
  // descriptors separate from names so a pun never becomes an art instruction.
  const casts = {
    'salt-pepper-shaker': ['Diner Salt', 'Diner Pepper', 'Tower', 'Bulb', 'Hourglass', 'Mushroom', 'Robot', 'Lighthouse', 'Twist Mill', 'Stacked Pair', 'Fluted', 'Mini Drum'],
    'potted-plants': ['Succulent', 'Cactus', 'Fern', 'Sunflower', 'Orchid', 'Bonsai', 'Snake Plant', 'Monstera', 'Aloe', 'Flytrap', 'Palm', 'Flowering Vine'],
    'snow-globe': ['Pine Cabin', 'City', 'Mountain', 'Penguin', 'Forest', 'Moon', 'Castle', 'Ocean', 'Robot', 'Mushroom', 'Rocket', 'Aurora'],
    'eyeball-monster': ['Cyclops Blob', 'Tall Stalk', 'Three Lash', 'Goggle', 'Snail Eye', 'Robot Eye', 'Crown Eye', 'Wing Eye', 'Flower Eye', 'Moon Eye', 'Book Eye', 'Star Eye'],
    pinata: ['Donkey', 'Star', 'Rocket', 'Cactus', 'Cupcake', 'Robot', 'Moon', 'Pineapple', 'Castle', 'Drum', 'Cloud', 'Monster'],
    'action-figures': ['Astronaut', 'Robot', 'Knight', 'Wizard', 'Explorer', 'Scientist', 'Racer', 'Diver', 'Detective', 'Pilot', 'Inventor', 'Space Ranger'],
    'box-of-snacks': ['Cracker Box', 'Popcorn Box', 'Pretzel Carton', 'Fruit Bites', 'Trail Mix', 'Snack Tower', 'Lunch Pack', 'Robot Snacks', 'Rocket Snacks', 'Puzzle Box', 'Party Mix', 'Mystery Pack'],
  };
  const empty = Object.freeze([]);
  const byId = Object.create(null);
  const galleries = Object.freeze(Object.keys(names).map(function (objectId) {
    const variants = Object.freeze(names[objectId].map(function (name, index) {
      return Object.freeze({
        index: index, variantId: variantIds[index], color: colors[index], name: name,
        cast: casts[objectId] ? casts[objectId][index] : null,
      });
    }));
    byId[objectId] = variants;
    return Object.freeze({ objectId: objectId, variants: variants });
  }));
  Object.freeze(byId);

  function list(objectId) {
    if (objectId === undefined) return galleries;
    return typeof objectId === 'string' && byId[objectId] || empty;
  }
  function nameFor(objectId, colorOrIndex) {
    if (typeof objectId !== 'string' || !byId[objectId]) return null;
    let index = -1;
    if (Number.isInteger(colorOrIndex)) index = colorOrIndex;
    else if (typeof colorOrIndex === 'string') {
      const color = colorOrIndex.toLowerCase();
      index = /^#?[0-9a-f]{6}$/.test(color)
        ? colors.indexOf(color[0] === '#' ? color : '#' + color)
        : variantIds.indexOf(colorOrIndex);
    }
    return index >= 0 && index < 12 ? byId[objectId][index].name : null;
  }

  return Object.freeze({
    schema: 'VariantNamesV1', version: 1, colors: colors,
    variantIds: variantIds, nameFor: nameFor, list: list,
  });
});
