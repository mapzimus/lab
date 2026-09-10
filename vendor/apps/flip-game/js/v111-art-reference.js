// v111-art-reference.js — Coffee Mug golden reference for FlipArtV111.
(function (root, factory) {
  'use strict';
  var platform = root && root.FlipArtV111;
  if (!platform && typeof module === 'object' && module.exports) {
    platform = require('./v111-art-platform.js');
  }
  var api = factory(platform);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipArtV111Reference = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Art) {
  'use strict';

  if (!Art || typeof Art.registerObject !== 'function') {
    throw new Error('v111-art-reference.js requires FlipArtV111 first');
  }

  var FLAVORS = [
    { id: 'blue-steel',         label: 'Blue Steel',         color: '#1f9bff' },
    { id: 'sucker-punch',       label: 'Sucker Punch',       color: '#e3263c' },
    { id: 'lime-light',         label: 'Lime Light',         color: '#8ed11a' },
    { id: 'orange-crush',       label: 'Orange Crush',       color: '#ff7a00' },
    { id: 'grape-expectations', label: 'Grape Expectations', color: '#8a3ffc' },
    { id: 'ice-ice-baby',       label: 'Ice Ice Baby',       color: '#5fcfe6' },
    { id: 'apple-solutely',     label: 'Apple-solutely',     color: '#3fae1a' },
    { id: 'berry-nice',         label: 'Berry Nice',         color: '#ff5b86' },
    { id: 'making-waves',       label: 'Making Waves',       color: '#4f63e0' },
    { id: 'lemon-aid',          label: 'Lemon Aid',          color: '#ffc233' },
    { id: 'very-cherry',        label: 'Very Cherry',        color: '#c8203a' },
    { id: 'pink-fluff',         label: 'Pink Fluff',         color: '#ff9ecf' },
  ];

  function clampByte(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  function shade(hex, amount) {
    var raw = String(hex).replace('#', '');
    var n = parseInt(raw, 16);
    var r = clampByte(((n >> 16) & 255) + amount * 255);
    var g = clampByte(((n >> 8) & 255) + amount * 255);
    var b = clampByte((n & 255) + amount * 255);
    return '#' + [r, g, b].map(function (v) {
      return v.toString(16).padStart(2, '0');
    }).join('');
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function buildCoffeeMug(variant) {
    // Palette work is done once, lazily, when this variant is first rendered.
    var base = variant.color;
    var palette = Object.freeze({
      base: base,
      light: shade(base, 0.20),
      highlight: shade(base, 0.36),
      dark: shade(base, -0.25),
      outline: shade(base, -0.43),
      coffee: '#5b2f19',
      coffeeLight: '#9a6037',
      cream: '#fff5dd',
      ink: '#17202a',
      blush: '#ff9aaa',
    });

    return function paintCoffeeMug(ctx, state) {
      var time = state.reducedMotion ? 0 : state.time;
      var steamLift = state.reducedMotion ? 0 : Math.sin(time * 2.4) * 5;

      // Handle sits behind the cup so its inner opening stays clean.
      ctx.save();
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 30;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(202, 190);
      ctx.bezierCurveTo(277, 176, 282, 306, 207, 305);
      ctx.stroke();
      ctx.strokeStyle = palette.base;
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(202, 194);
      ctx.bezierCurveTo(260, 185, 264, 291, 207, 296);
      ctx.stroke();
      ctx.restore();

      // Cup body: fixed silhouette for every color variant.
      ctx.save();
      roundedRect(ctx, 64, 134, 154, 242, 25);
      if (typeof ctx.createLinearGradient === 'function') {
        var bodyGradient = ctx.createLinearGradient(64, 134, 218, 376);
        bodyGradient.addColorStop(0, palette.highlight);
        bodyGradient.addColorStop(0.42, palette.base);
        bodyGradient.addColorStop(1, palette.dark);
        ctx.fillStyle = bodyGradient;
      } else {
        ctx.fillStyle = palette.base;
      }
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = palette.outline;
      ctx.stroke();

      // Left-side glaze shine.
      ctx.globalAlpha = 0.46;
      ctx.fillStyle = palette.cream;
      roundedRect(ctx, 83, 166, 17, 142, 9);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Rim and visible coffee surface.
      ctx.save();
      ctx.fillStyle = palette.light;
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.ellipse(141, 137, 78, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = palette.coffee;
      ctx.beginPath();
      ctx.ellipse(141, 139, 64, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = palette.coffeeLight;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(139, 136, 45, 8, -0.04, Math.PI * 0.1, Math.PI * 1.1);
      ctx.stroke();
      ctx.restore();

      // Steam is render-state animation only; reduced motion freezes it.
      ctx.save();
      ctx.translate(141, 118);
      ctx.rotate(-(state.angle || 0) + (state.slosh || 0) * 0.07);
      ctx.globalAlpha = 0.68;
      ctx.strokeStyle = palette.cream;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      [-29, 17, 55].forEach(function (offset, index) {
        var sway = state.reducedMotion ? 0 : Math.sin(time * 1.8 + index * 1.7) * 7;
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.bezierCurveTo(-16 + offset + sway, -19 - steamLift,
          18 + offset - sway, -32 - steamLift, offset + sway, -50 - steamLift);
        ctx.stroke();
      });
      ctx.restore();

      Art.paintPhysicalDynamics(ctx, 'coffee-mug', state, variant.color);
      Art.paintReactionFace(ctx, variant.face, state);
    };
  }

  var definition = Art.getObject('coffee-mug');
  if (!definition) {
    definition = Art.registerObject({
      id: 'coffee-mug',
      label: 'Coffee Mug',
      metrics: {
        viewBox: { x: 0, y: 0, width: 300, height: 420 },
        // Includes the widest handle and highest reduced-motion steam pose.
        bounds: { x: 54, y: 60, width: 222, height: 316 },
        pivot: { x: 150, y: 323.2972972973 },
        baselineY: 376,
        artScale: 0.74,
        localContactOffset: 39,
      },
      variants: FLAVORS.map(function (flavor) {
        return {
          id: flavor.id,
          label: flavor.label + ' Coffee Mug',
          color: flavor.color,
          tokens: { flavor: flavor.label },
        };
      }),
      buildVariant: buildCoffeeMug,
    });
  }

  return Object.freeze({
    objectId: 'coffee-mug',
    definition: definition,
    variantIds: Object.freeze(FLAVORS.map(function (flavor) {
      return 'coffee-mug.' + flavor.id;
    })),
  });
});
