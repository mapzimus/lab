// v111-art-pack-a.js — authored vector art for manifest objects 1–8.
(function (root, factory) {
  'use strict';
  var Art = root && root.FlipArtV111;
  var Manifest = root && root.FLIP_V111_OBJECT_MANIFEST;
  var Reference = root && root.FlipArtV111Reference;
  if (typeof module === 'object' && module.exports) {
    if (!Art) Art = require('./v111-art-platform.js');
    if (!Manifest) Manifest = require('./v111-object-manifest.js');
    if (!Reference) Reference = require('./v111-art-reference.js');
  }
  var api = factory(Art, Manifest, Reference);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipArtV111PackA = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Art, Manifest, Reference) {
  'use strict';

  var OBJECT_IDS = Object.freeze([
    'coffee-mug',
    'milk-carton',
    'teapot',
    'salt-pepper-shaker',
    'soup-can',
    'smoothie',
    'gumball-machine',
    'microscope',
  ]);
  var BASE_METRICS = Object.freeze({
    viewBox: Object.freeze({ x: 0, y: 0, width: 300, height: 420 }),
    pivot: Art && Art.CANONICAL_MAPPING && Art.CANONICAL_MAPPING.pivot,
    baselineY: 376,
    artScale: 0.74,
    localContactOffset: 39,
  });
  var OUTLINE = '#17202a';
  var PAPER = '#fff9ec';
  var GLASS = '#dff7ff';
  var METAL = '#d8e1e8';

  if (!Art || typeof Art.registerObject !== 'function') {
    throw new Error('v111-art-pack-a.js requires FlipArtV111 first');
  }
  if (!Manifest || !Array.isArray(Manifest.objects)) {
    throw new Error('v111-art-pack-a.js requires FLIP_V111_OBJECT_MANIFEST first');
  }
  if (!BASE_METRICS.pivot ||
      Math.abs(Art.getLocalContactOffset(BASE_METRICS) - 39) > 1e-9) {
    throw new Error('v111-art-pack-a.js requires the canonical v111 art mapping');
  }

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function shade(hex, amount) {
    var raw = String(hex || '#777777').replace('#', '');
    var value = parseInt(raw, 16);
    var r = clampByte(((value >> 16) & 255) + amount * 255);
    var g = clampByte(((value >> 8) & 255) + amount * 255);
    var b = clampByte((value & 255) + amount * 255);
    return '#' + [r, g, b].map(function (part) {
      var text = part.toString(16);
      return text.length < 2 ? '0' + text : text;
    }).join('');
  }

  function palette(color) {
    return Object.freeze({
      base: color,
      light: shade(color, 0.22),
      pale: shade(color, 0.38),
      dark: shade(color, -0.24),
      deep: shade(color, -0.42),
      outline: OUTLINE,
      paper: PAPER,
      glass: GLASS,
      metal: METAL,
    });
  }

  function roundRect(ctx, x, y, width, height, radius) {
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

  function polygon(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
  }

  function fillStroke(ctx, fill, stroke, width) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke || OUTLINE;
    ctx.lineWidth = width == null ? 6 : width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function gradient(ctx, x0, y0, x1, y1, stops, fallback) {
    if (typeof ctx.createLinearGradient !== 'function') return fallback;
    var result = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(function (stop) { result.addColorStop(stop[0], stop[1]); });
    return result;
  }

  function glassFill(ctx, p, x, y, width, height) {
    return gradient(ctx, x, y, x + width, y + height, [
      [0, p.paper], [0.28, p.glass], [0.7, p.pale], [1, p.light],
    ], p.glass);
  }

  function bodyFill(ctx, p, x, y, width, height) {
    return gradient(ctx, x, y, x + width, y + height, [
      [0, p.pale], [0.3, p.light], [0.68, p.base], [1, p.dark],
    ], p.base);
  }

  function groundShadow(ctx, x, width) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.ellipse(x, 370, width / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function highlight(ctx, x, y, height) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 5, y + height * 0.3, x + 3, y + height * 0.7, x, y + height);
    ctx.stroke();
    ctx.restore();
  }

  function animatedTime(state) {
    return state && state.reducedMotion ? 0 : (state && state.time) || 0;
  }

  function variantIndex(variant) {
    return variant.tokens && Number.isFinite(variant.tokens.castIndex)
      ? variant.tokens.castIndex : 0;
  }

  function drawCarton(builderVariant) {
    var p = palette(builderVariant.color);
    var index = variantIndex(builderVariant);
    // Every cast is a full-size, tall carton rather than a juice-box shape.
    var widths = [148, 132, 150, 146, 160, 168, 152, 158, 148, 138, 158, 166];
    var tops = [78, 58, 72, 66, 82, 70, 64, 75, 68, 55, 73, 80];
    var width = widths[index];
    var top = tops[index];
    var left = 150 - width / 2;
    return function paintCarton(ctx, state) {
      var time = animatedTime(state);
      var flex = Math.sin(time * 3.2 + index) * 4;
      groundShadow(ctx, 150, width + 10);

      ctx.save();
      if (index === 4 || index === 11) {
        roundRect(ctx, left, top, width, 376 - top, index === 11 ? 15 : 9);
      } else if (index === 10) {
        polygon(ctx, [[left, top + 35], [150, top], [left + width, top + 35],
          [left + width - 6, 376], [left + 6, 376]]);
      } else if (index === 7) {
        ctx.beginPath();
        ctx.moveTo(left + 8, top + 15);
        ctx.quadraticCurveTo(150, top - 15, left + width - 8, top + 15);
        ctx.lineTo(left + width, 376);
        ctx.lineTo(left, 376);
        ctx.closePath();
      } else {
        polygon(ctx, [[left, top + 42], [left + width, top + 42],
          [left + width - 4, 376], [left + 4, 376]]);
      }
      fillStroke(ctx, bodyFill(ctx, p, left, top, width, 376 - top), p.deep, 7);

      if (index !== 4 && index !== 7 && index !== 10 && index !== 11) {
        polygon(ctx, [[left, top + 42], [left + 31, top + 5 + flex * 0.18],
          [150, top - 19 + flex * 0.25], [left + width - 31, top + 5 + flex * 0.18],
          [left + width, top + 42]]);
        fillStroke(ctx, p.light, p.deep, 6);
        ctx.strokeStyle = p.deep;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(150, top - 17); ctx.lineTo(150, top + 42); ctx.stroke();
      }

      ctx.globalAlpha = 0.2;
      ctx.fillStyle = p.deep;
      polygon(ctx, [[150, top + 44], [left + width, top + 44],
        [left + width - 4, 376], [150, 360]]);
      ctx.fill();
      ctx.globalAlpha = 1;

      roundRect(ctx, left + 18, Math.max(top + 68, 206), width - 36, 101, 12);
      ctx.fillStyle = p.paper;
      ctx.fill();
      ctx.strokeStyle = p.deep;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = p.base;
      ctx.beginPath();
      ctx.moveTo(150, Math.max(top + 89, 225));
      ctx.bezierCurveTo(123, Math.max(top + 105, 241), 127, Math.max(top + 135, 271),
        150, Math.max(top + 150, 286));
      ctx.bezierCurveTo(173, Math.max(top + 135, 271), 177, Math.max(top + 105, 241),
        150, Math.max(top + 89, 225));
      ctx.fill();

      // Original brand-free cow illustration: rounded ears, patch, muzzle, and
      // tiny horns form a clear dairy cue without text, logos, or trademarks.
      var cowY = Math.max(top + 104, 213);
      ctx.save();
      ctx.fillStyle = p.paper; ctx.strokeStyle = p.deep; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(150, cowY, 31, 27, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      [-1, 1].forEach(function (side) {
        ctx.beginPath(); ctx.ellipse(150 + side * 34, cowY - 12, 14, 8,
          side * 0.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(150 + side * 18, cowY - 22);
        ctx.lineTo(150 + side * 25, cowY - 37); ctx.lineTo(150 + side * 9, cowY - 25);
        ctx.stroke();
      });
      ctx.fillStyle = p.deep;
      ctx.beginPath(); ctx.ellipse(139, cowY - 5, 9, 12, -0.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(140, cowY - 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(160, cowY - 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f3b2bd';
      ctx.beginPath(); ctx.ellipse(150, cowY + 13, 20, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = p.deep;
      ctx.beginPath(); ctx.arc(143, cowY + 13, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(157, cowY + 13, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      if (index === 2) {
        ctx.strokeStyle = p.deep; ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(left + width - 5, top + 105);
        ctx.quadraticCurveTo(left + width + 25 + flex, top + 52,
          left + width + 13 + flex, top + 10); ctx.stroke();
        ctx.strokeStyle = p.paper; ctx.lineWidth = 4; ctx.stroke();
      } else if (index === 3) {
        ctx.fillStyle = p.paper; ctx.strokeStyle = p.deep; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(left + width - 37, top + 22, 18, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (index === 6) {
        ctx.fillStyle = p.deep; roundRect(ctx, 138, 315, 24, 61, 5); ctx.fill();
        ctx.fillStyle = p.paper; ctx.beginPath(); ctx.arc(155, 344, 3, 0, Math.PI * 2); ctx.fill();
      } else if (index === 8) {
        ctx.save(); ctx.globalAlpha = 0.78; ctx.fillStyle = GLASS;
        roundRect(ctx, left + width - 35, top + 72, 18, 180, 8); ctx.fill(); ctx.restore();
      } else if (index === 9) {
        ctx.strokeStyle = p.deep; ctx.lineWidth = 11; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(150, top + 35, 28, Math.PI, 0); ctx.stroke();
      } else if (index === 11) {
        polygon(ctx, [[left + 12, top], [left + width - 16, top],
          [left + width, top + 32], [left + 23, top + 42]]);
        fillStroke(ctx, p.light, p.deep, 6);
      }

      for (var i = 0; i < 4; i++) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = p.paper;
        ctx.beginPath();
        ctx.arc(left + 25 + i * (width - 50) / 3,
          339 + Math.sin(time * 2 + i) * 3, 4 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      highlight(ctx, left + 17, top + 59, Math.min(155, 330 - top));
      ctx.restore();
    };
  }

  function drawTeapot(builderVariant) {
    var p = palette(builderVariant.color);
    var index = variantIndex(builderVariant);
    var configs = [
      [150, 294, 79, 82], [150, 274, 62, 102], [150, 298, 73, 78],
      [150, 302, 82, 74], [150, 315, 89, 61], [150, 300, 75, 76],
      [150, 307, 78, 69], [150, 299, 84, 77], [150, 306, 87, 70],
      [150, 276, 62, 100], [150, 294, 70, 82], [150, 298, 82, 78],
    ];
    var c = configs[index];
    return function paintTeapot(ctx, state) {
      var time = animatedTime(state);
      var lidBounce = Math.sin(time * 4.5 + index) * 3;
      var handleBounce = Math.sin(time * 2.8 + index * 0.4) * 3;
      groundShadow(ctx, 150, 220);

      ctx.save();
      ctx.strokeStyle = p.deep;
      ctx.lineWidth = index === 4 ? 15 : 20;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (index === 3 || index === 4) {
        ctx.moveTo(90, 250 + handleBounce);
        ctx.bezierCurveTo(86, 112, 218, 108, 221, 246 + handleBounce);
      } else {
        ctx.moveTo(88, 265 + handleBounce);
        ctx.bezierCurveTo(30, 194, 31, 331, 91, 337 + handleBounce);
      }
      ctx.stroke();
      ctx.strokeStyle = index === 4 ? '#a87943' : p.base;
      ctx.lineWidth -= 9;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(205, 257);
      if (index === 2 || index === 9 || index === 10) {
        ctx.lineTo(275, 189);
        ctx.lineTo(261, 277);
        ctx.lineTo(218, 307);
      } else {
        ctx.bezierCurveTo(247, 240, 251, 194, 276, 184);
        ctx.bezierCurveTo(279, 242, 256, 292, 219, 307);
      }
      ctx.closePath();
      fillStroke(ctx, p.light, p.deep, 7);

      if (index === 2 || index === 10) {
        roundRect(ctx, c[0] - c[2], c[1] - c[3], c[2] * 2, c[3] * 2, index === 10 ? 9 : 18);
      } else if (index === 8) {
        ctx.beginPath();
        for (var lobe = 0; lobe < 7; lobe++) {
          var angle = -Math.PI / 2 + lobe * Math.PI * 2 / 7;
          var px = c[0] + Math.cos(angle) * c[2];
          var py = c[1] + Math.sin(angle) * c[3];
          if (lobe === 0) ctx.moveTo(px, py);
          else ctx.quadraticCurveTo(c[0] + Math.cos(angle - 0.3) * c[2] * 1.14,
            c[1] + Math.sin(angle - 0.3) * c[3] * 1.14, px, py);
        }
        ctx.closePath();
      } else if (index === 9) {
        polygon(ctx, [[150, c[1] - c[3]], [c[0] + c[2], 376], [c[0] - c[2], 376]]);
      } else {
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], c[2], c[3], 0, 0, Math.PI * 2);
      }
      ctx.fillStyle = index === 11 ? glassFill(ctx, p, 70, 190, 164, 170)
        : bodyFill(ctx, p, 70, 190, 164, 170);
      ctx.fill();
      ctx.strokeStyle = p.deep; ctx.lineWidth = 7; ctx.stroke();

      if (index === 5) {
        ctx.strokeStyle = p.paper; ctx.lineWidth = 11;
        [246, 283, 320].forEach(function (y) { ctx.beginPath(); ctx.moveTo(85, y); ctx.lineTo(216, y); ctx.stroke(); });
      } else if (index === 7) {
        ctx.fillStyle = p.dark; ctx.beginPath(); ctx.ellipse(150, 334, 58, 25, 0, 0, Math.PI * 2); ctx.fill();
      } else if (index === 8) {
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
        [112, 150, 188].forEach(function (x) { ctx.beginPath(); ctx.arc(x, 271, 24, 0, Math.PI * 2); ctx.fill(); });
        ctx.globalAlpha = 1;
      } else if (index === 9) {
        ctx.fillStyle = p.dark;
        polygon(ctx, [[90, 350], [57, 374], [106, 367]]); ctx.fill();
        polygon(ctx, [[210, 350], [243, 374], [194, 367]]); ctx.fill();
      } else if (index === 10) {
        ctx.fillStyle = p.paper; roundRect(ctx, 122, 305, 26, 51, 4); ctx.fill();
        ctx.fillStyle = p.pale;
        ctx.beginPath(); ctx.arc(177, 273, 13, 0, Math.PI * 2); ctx.fill();
      }

      ctx.save();
      ctx.translate(0, lidBounce);
      ctx.fillStyle = p.light;
      ctx.strokeStyle = p.deep;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(150, c[1] - c[3] - 4, 45, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(150, c[1] - c[3] - 20, index === 7 ? 13 : 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(266, 184);
      // Steam rises in world space rather than remaining glued to the rotating
      // teapot. Slosh gives the plume a small inertial hook during flight.
      ctx.rotate(-(state.angle || 0) + (state.slosh || 0) * 0.08);
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = p.paper;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      for (var i = 0; i < 2; i++) {
        var sway = Math.sin(time * 1.7 + i * 1.9) * 6;
        ctx.beginPath();
        ctx.moveTo(-i * 9, 0);
        ctx.bezierCurveTo(-16 + sway, -28 - i * 5, 17 - sway, -53,
          -2 + sway, -80 - i * 9);
        ctx.stroke();
      }
      ctx.restore();
      highlight(ctx, c[0] - c[2] * 0.48, c[1] - c[3] * 0.55, c[3] * 0.75);
      ctx.restore();
    };
  }

  function shakerBodyPath(ctx, index) {
    if (index === 6 || index === 11) {
      roundRect(ctx, index === 6 ? 79 : 68, index === 6 ? 115 : 137,
        index === 6 ? 142 : 164, index === 6 ? 261 : 239, index === 6 ? 10 : 20);
      return;
    }
    if (index === 9) {
      roundRect(ctx, 99, 82, 102, 294, 30);
      return;
    }
    var topWidth = [54, 58, 46, 48, 68, 46, 65, 50, 47, 52, 52, 70][index];
    var belly = [70, 66, 52, 91, 82, 62, 71, 67, 59, 66, 78, 82][index];
    var waist = [64, 50, 50, 63, 43, 48, 64, 55, 45, 54, 56, 76][index];
    var top = [108, 110, 72, 126, 102, 137, 102, 99, 79, 95, 95, 114][index];
    ctx.beginPath();
    ctx.moveTo(150 - topWidth, top);
    ctx.bezierCurveTo(150 - belly, top + 70, 150 - waist, 275, 150 - belly, 351);
    ctx.quadraticCurveTo(150 - belly + 4, 376, 150, 376);
    ctx.quadraticCurveTo(150 + belly - 4, 376, 150 + belly, 351);
    ctx.bezierCurveTo(150 + waist, 275, 150 + belly, top + 70, 150 + topWidth, top);
    ctx.closePath();
  }

  function drawShaker(builderVariant) {
    var p = palette(builderVariant.color);
    var index = variantIndex(builderVariant);
    return function paintShaker(ctx, state) {
      var time = animatedTime(state);
      var rattle = Math.sin(time * 5.8 + index) * 0.035;
      groundShadow(ctx, 150, 172);
      ctx.save();
      shakerBodyPath(ctx, index);
      var bodyColor = index === 5 || index === 6 || index === 7 || index === 11
        ? bodyFill(ctx, p, 70, 90, 160, 286)
        : glassFill(ctx, p, 70, 90, 160, 286);
      fillStroke(ctx, bodyColor, p.deep, 7);

      ctx.save();
      ctx.translate(150, index === 9 ? 88 : 103);
      ctx.rotate(rattle);
      ctx.translate(-150, -(index === 9 ? 88 : 103));
      ctx.fillStyle = index === 8 ? '#a87943' : p.metal;
      ctx.strokeStyle = p.deep; ctx.lineWidth = 6;
      if (index === 0 || index === 1) {
        ctx.beginPath(); ctx.arc(150, 106, 59, Math.PI, 0); ctx.lineTo(209, 119); ctx.lineTo(91, 119); ctx.closePath();
      } else if (index === 5) {
        ctx.beginPath(); ctx.ellipse(150, 129, 91, 38, 0, 0, Math.PI * 2);
      } else if (index === 8) {
        roundRect(ctx, 92, 63, 116, 51, 13);
      } else {
        roundRect(ctx, index === 6 ? 85 : 91, index === 6 ? 82 : 79,
          index === 6 ? 130 : 118, index === 6 ? 43 : 39, 10);
      }
      ctx.fill(); ctx.stroke();
      for (var hole = 0; hole < (index === 8 ? 3 : 6); hole++) {
        ctx.fillStyle = p.deep;
        ctx.beginPath();
        ctx.arc(116 + hole * (68 / Math.max(1, (index === 8 ? 2 : 5))),
          index === 5 ? 121 : 96, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (index === 6) {
        ctx.strokeStyle = p.deep; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(150, 81); ctx.lineTo(150, 55); ctx.stroke();
        ctx.beginPath(); ctx.arc(150, 48, 7, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = index === 5 || index === 6 || index === 7 || index === 8 || index === 11 ? 0.25 : 0.72;
      for (var i = 0; i < 19; i++) {
        var col = i % 5;
        var row = Math.floor(i / 5);
        var drift = Math.sin(time * 3 + i * 1.7) * 4;
        ctx.fillStyle = index === 1 ? '#4a3427' : (i % 3 === 0 ? p.base : p.paper);
        ctx.beginPath();
        ctx.arc(112 + col * 19 + drift, 269 + row * 21 + Math.cos(time * 2 + i) * 3,
          4 + i % 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (index === 7) {
        ctx.strokeStyle = p.paper; ctx.lineWidth = 16;
        [185, 237, 289].forEach(function (y) { ctx.beginPath(); ctx.moveTo(92, y); ctx.lineTo(208, y); ctx.stroke(); });
      } else if (index === 10) {
        ctx.strokeStyle = p.deep; ctx.lineWidth = 4;
        for (var rib = 0; rib < 5; rib++) {
          ctx.beginPath(); ctx.moveTo(101 + rib * 24, 145); ctx.bezierCurveTo(90 + rib * 27, 220, 99 + rib * 25, 310, 94 + rib * 28, 355); ctx.stroke();
        }
      } else if (index === 11) {
        ctx.strokeStyle = p.paper; ctx.lineWidth = 9;
        [169, 337].forEach(function (y) { ctx.beginPath(); ctx.moveTo(74, y); ctx.lineTo(226, y); ctx.stroke(); });
      } else if (index === 9) {
        ctx.fillStyle = p.metal; ctx.strokeStyle = p.deep; ctx.lineWidth = 5;
        roundRect(ctx, 95, 207, 110, 24, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(150, 220, 55, 10, 0, 0, Math.PI * 2); ctx.stroke();
      }
      highlight(ctx, 103, 145, 120);
      ctx.restore();
    };
  }

  function drawSoupCan(builderVariant) {
    var p = palette(builderVariant.color);
    var index = variantIndex(builderVariant);
    var widths = [150, 118, 184, 150, 152, 148, 150, 156, 152, 144, 169, 116];
    var tops = [124, 73, 173, 119, 116, 125, 121, 128, 130, 112, 145, 47];
    var width = widths[index];
    var top = tops[index];
    var left = 150 - width / 2;
    return function paintSoupCan(ctx, state) {
      var time = animatedTime(state);
      var twitch = Math.sin(time * 6 + index) * 0.14;
      var shimmer = (Math.sin(time * 2.3) + 1) * 0.5;
      groundShadow(ctx, 150, width + 10);
      ctx.save();

      if (index === 9) {
        polygon(ctx, [[left + 17, top], [left + width - 17, top],
          [left + width, 376], [left, 376]]);
      } else if (index === 10) {
        ctx.beginPath();
        ctx.moveTo(left + 12, top);
        ctx.lineTo(left + width - 12, top);
        ctx.quadraticCurveTo(left + width + 10, 257, left + width - 4, 376);
        ctx.lineTo(left + 4, 376);
        ctx.quadraticCurveTo(left - 10, 257, left + 12, top);
        ctx.closePath();
      } else {
        roundRect(ctx, left, top, width, 376 - top, 11);
      }
      fillStroke(ctx, bodyFill(ctx, p, left, top, width, 376 - top), p.deep, 7);

      ctx.fillStyle = p.metal; ctx.strokeStyle = p.deep; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(150, top + 2, width / 2, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(150, 365, width / 2, 11, 0, 0, Math.PI * 2); ctx.stroke();

      var labelTop = Math.max(top + 42, 159);
      roundRect(ctx, left + 8, labelTop, width - 16, Math.min(151, 345 - labelTop), 8);
      ctx.fillStyle = p.paper; ctx.fill();
      ctx.strokeStyle = p.deep; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = p.base;
      ctx.beginPath(); ctx.ellipse(150, labelTop + 57, Math.max(29, width * 0.24), 24, 0, 0, Math.PI * 2); ctx.fill();
      // A steaming bowl with visible peas/noodles/carrots makes this read as
      // soup immediately while remaining completely original and brand-free.
      ctx.fillStyle = '#ef9b3d';
      ctx.beginPath(); ctx.ellipse(150, labelTop + 57, Math.max(24, width * 0.20), 15, 0, 0, Math.PI * 2); ctx.fill();
      [132, 149, 167].forEach(function (ingredientX, ingredientIndex) {
        ctx.beginPath(); ctx.arc(ingredientX, labelTop + 54 + (ingredientIndex % 2) * 5,
          4.5, 0, Math.PI * 2);
        ctx.fillStyle = ingredientIndex === 1 ? '#e94c4c' : '#5caa4f'; ctx.fill();
      });
      ctx.strokeStyle = p.deep; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(150, labelTop + 55, Math.max(31, width * 0.25), 0.06, Math.PI - 0.06); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(120, labelTop + 62); ctx.quadraticCurveTo(150, labelTop + 79, 180, labelTop + 62); ctx.stroke();
      ctx.lineWidth = 3.5;
      [-13, 12].forEach(function (steamX) {
        ctx.beginPath(); ctx.moveTo(150 + steamX, labelTop + 38);
        ctx.bezierCurveTo(141 + steamX, labelTop + 29, 159 + steamX, labelTop + 20,
          150 + steamX, labelTop + 10); ctx.stroke();
      });

      ctx.save();
      ctx.translate(150, top - 1);
      ctx.rotate(twitch);
      ctx.strokeStyle = p.deep; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(150 - 150, 0, 25, 9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      if (index === 4) {
        ctx.strokeStyle = p.metal; ctx.lineWidth = 8;
        [top + 56, top + 91, top + 126].forEach(function (y) { ctx.beginPath(); ctx.moveTo(left + 4, y); ctx.lineTo(left + width - 4, y); ctx.stroke(); });
      } else if (index === 5) {
        ctx.strokeStyle = p.deep; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.ellipse(150, top + 19, width * 0.42, 10, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (index === 6) {
        ctx.fillStyle = GLASS; ctx.globalAlpha = 0.8;
        roundRect(ctx, left + width - 35, labelTop + 15, 18, 85, 8); ctx.fill(); ctx.globalAlpha = 1;
      } else if (index === 7) {
        ctx.strokeStyle = p.deep; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(150, top + 40, width * 0.55, Math.PI, 0); ctx.stroke();
      } else if (index === 8) {
        ctx.fillStyle = p.paper; ctx.strokeStyle = p.deep; ctx.lineWidth = 5;
        [112, 134, 160, 186].forEach(function (x, i) {
          ctx.beginPath(); ctx.arc(x, top - 2 - (i % 2) * 12, 26, Math.PI, 0); ctx.fill(); ctx.stroke();
        });
      } else if (index === 9) {
        ctx.fillStyle = p.dark;
        polygon(ctx, [[left + 6, 342], [left - 18, 374], [left + 35, 360]]); ctx.fill();
        polygon(ctx, [[left + width - 6, 342], [left + width + 18, 374], [left + width - 35, 360]]); ctx.fill();
      }

      ctx.save();
      ctx.globalAlpha = 0.15 + shimmer * 0.18;
      ctx.fillStyle = '#ffffff';
      polygon(ctx, [[left + 16 + shimmer * 42, labelTop + 4], [left + 42 + shimmer * 42, labelTop + 4],
        [left + 79 + shimmer * 42, labelTop + 113], [left + 52 + shimmer * 42, labelTop + 113]]);
      ctx.fill();
      ctx.restore();
      ctx.restore();
    };
  }

  function drawSmoothie(builderVariant) {
    var p = palette(builderVariant.color);
    var index = variantIndex(builderVariant);
    var widths = [154, 132, 145, 152, 150, 136, 163, 139, 152, 144, 169, 148];
    var tops = [141, 107, 129, 135, 148, 116, 143, 111, 132, 143, 109, 128];
    var width = widths[index];
    var top = tops[index];
    var left = 150 - width / 2;
    return function paintSmoothie(ctx, state) {
      var time = animatedTime(state);
      var liquidColor = Art.smoothieLiquidColor(state, p.base);
      var whip = Math.sin(time * 3.6 + index) * 9;
      var wobble = Math.sin(time * 4.2 + index * 0.5) * 2;
      groundShadow(ctx, 150, width + 14);
      ctx.save();

      if (index === 2) {
        ctx.strokeStyle = p.deep; ctx.lineWidth = 18; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(left - 2, 246, 38, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
      }

      if (index === 6 || index === 10) {
        ctx.beginPath();
        ctx.ellipse(150, 262, width / 2, index === 10 ? 114 : 107, 0, 0, Math.PI * 2);
      } else if (index === 8) {
        polygon(ctx, [[left + 14, top], [left + width - 14, top], [left + width, 346],
          [left + width - 28, 376], [left + 28, 376], [left, 346]]);
      } else if (index === 9) {
        polygon(ctx, [[left, top], [left + width, top], [188, 350], [180, 376], [120, 376], [112, 350]]);
      } else {
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(left + width, top);
        ctx.lineTo(left + width - (index === 7 ? 28 : 18), 376);
        ctx.lineTo(left + (index === 7 ? 28 : 18), 376);
        ctx.closePath();
      }
      ctx.fillStyle = glassFill(ctx, p, left, top, width, 376 - top);
      ctx.fill(); ctx.strokeStyle = p.deep; ctx.lineWidth = 7; ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.78;
      if (index === 5) {
        [shade(liquidColor, -0.22), liquidColor, shade(liquidColor, 0.25)].forEach(function (color, layer) {
          ctx.fillStyle = color;
          ctx.fillRect(left + 10, 226 + layer * 43, width - 20 - layer * 3, 43);
        });
      } else {
        ctx.fillStyle = liquidColor;
        ctx.beginPath();
        ctx.moveTo(left + 8, 212 + wobble);
        ctx.quadraticCurveTo(150, 197 - wobble, left + width - 8, 212 + wobble);
        ctx.lineTo(left + width - 20, 366);
        ctx.lineTo(left + 20, 366);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.translate(0, wobble);
      ctx.fillStyle = index === 4 ? p.pale : p.paper;
      ctx.strokeStyle = p.deep; ctx.lineWidth = 6;
      if (index === 0 || index === 6) {
        ctx.beginPath(); ctx.arc(150, top + 3, width * 0.43, Math.PI, 0); ctx.lineTo(left + width - 4, top + 12); ctx.lineTo(left + 4, top + 12); ctx.closePath();
      } else if (index === 4) {
        ctx.beginPath(); ctx.arc(150, top, 42, 0, Math.PI * 2);
      } else if (index === 10) {
        polygon(ctx, [[111, top + 19], [119, top - 35], [142, top - 4], [154, top - 42], [165, top - 3], [191, top - 30], [188, top + 19]]);
      } else {
        roundRect(ctx, left - 3, top - 8, width + 6, 24, 8);
      }
      ctx.fill(); ctx.stroke();
      ctx.restore();

      if (index !== 7 && index !== 10 && index !== 11) {
        ctx.strokeStyle = p.deep; ctx.lineWidth = 12; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(165, top + 4); ctx.quadraticCurveTo(177 + whip, 77, 158 + whip, 44); ctx.stroke();
        ctx.strokeStyle = p.pale; ctx.lineWidth = 6; ctx.stroke();
      } else if (index === 7) {
        ctx.fillStyle = p.dark; ctx.strokeStyle = p.deep; ctx.lineWidth = 5;
        roundRect(ctx, 134, top - 31, 32, 37, 8); ctx.fill(); ctx.stroke();
      }

      if (index === 3) {
        ctx.strokeStyle = p.paper; ctx.lineWidth = 6;
        for (var rib = 0; rib < 5; rib++) {
          ctx.beginPath(); ctx.bezierCurveTo(left + 17 + rib * 25, 190, left + 2 + rib * 29, 286, left + 25 + rib * 23, 351); ctx.stroke();
        }
      } else if (index === 9) {
        ctx.fillStyle = p.dark;
        polygon(ctx, [[119, 337], [78, 371], [126, 360]]); ctx.fill();
        polygon(ctx, [[181, 337], [222, 371], [174, 360]]); ctx.fill();
      } else if (index === 11) {
        ctx.fillStyle = p.deep; roundRect(ctx, 102, 337, 96, 39, 10); ctx.fill();
        ctx.fillStyle = p.paper; ctx.beginPath(); ctx.arc(150, 356, 7, 0, Math.PI * 2); ctx.fill();
      }

      for (var i = 0; i < 12; i++) {
        ctx.fillStyle = i % 3 === 0 ? p.pale : p.dark;
        ctx.globalAlpha = 0.52;
        ctx.beginPath();
        ctx.arc(left + 30 + (i % 4) * (width - 60) / 3 + Math.sin(time * 1.9 + i) * 3,
          244 + Math.floor(i / 4) * 33 + Math.cos(time * 2.1 + i) * 4,
          3 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Fruit wheel + chunky ingredient highlights give the cup a richer,
      // unmistakable smoothie silhouette at roster and gameplay sizes.
      ctx.save();
      ctx.translate(left + width - 26, top + 13);
      ctx.rotate(0.42);
      ctx.fillStyle = '#ffcf45'; ctx.strokeStyle = p.deep; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (var wedge = 0; wedge < 6; wedge++) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(wedge * Math.PI / 3) * 20, Math.sin(wedge * Math.PI / 3) * 20);
        ctx.strokeStyle = '#fff5b2'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
      highlight(ctx, left + 20, 178, 113);
      ctx.restore();
    };
  }

  function drawGumball(builderVariant) {
    var p = palette(builderVariant.color);
    var index = variantIndex(builderVariant);
    return function paintGumball(ctx, state) {
      var time = animatedTime(state);
      var spin = time * 1.7;
      groundShadow(ctx, 150, 190);
      ctx.save();

      var globeTop = index === 1 || index === 8 ? 54 : (index === 7 ? 132 : 78);
      var globeCy = index === 1 || index === 8 ? 154 : (index === 7 ? 204 : 167);
      var globeRx = index === 2 ? 74 : (index === 7 ? 61 : 82);
      var globeRy = index === 1 || index === 8 ? 103 : (index === 7 ? 67 : 84);

      if (index === 3) {
        [125, 206].forEach(function (cy) {
          ctx.beginPath(); ctx.arc(150, cy, 58, 0, Math.PI * 2);
          fillStroke(ctx, glassFill(ctx, p, 92, cy - 58, 116, 116), p.deep, 7);
        });
      } else if (index === 2 || index === 11) {
        roundRect(ctx, 150 - globeRx, globeTop, globeRx * 2, globeRy * 2, index === 11 ? 24 : 12);
        fillStroke(ctx, glassFill(ctx, p, 150 - globeRx, globeTop, globeRx * 2, globeRy * 2), p.deep, 7);
      } else if (index === 9) {
        ctx.beginPath();
        ctx.moveTo(85, 145); ctx.quadraticCurveTo(94, 72, 150, 66); ctx.quadraticCurveTo(206, 72, 215, 145);
        ctx.quadraticCurveTo(210, 247, 150, 258); ctx.quadraticCurveTo(90, 247, 85, 145); ctx.closePath();
        fillStroke(ctx, glassFill(ctx, p, 85, 66, 130, 192), p.deep, 7);
        ctx.fillStyle = '#a87943';
        ctx.beginPath(); ctx.arc(150, 75, 66, Math.PI, 0); ctx.lineTo(216, 95); ctx.lineTo(84, 95); ctx.closePath(); ctx.fill();
      } else if (index === 10) {
        ctx.beginPath();
        ctx.moveTo(85, 224); ctx.bezierCurveTo(79, 149, 96, 83, 150, 75);
        ctx.bezierCurveTo(204, 83, 221, 149, 215, 224); ctx.quadraticCurveTo(150, 266, 85, 224); ctx.closePath();
        fillStroke(ctx, glassFill(ctx, p, 85, 75, 130, 185), p.deep, 7);
      } else {
        ctx.beginPath(); ctx.ellipse(150, globeCy, globeRx, globeRy, 0, 0, Math.PI * 2);
        fillStroke(ctx, glassFill(ctx, p, 150 - globeRx, globeCy - globeRy, globeRx * 2, globeRy * 2), p.deep, 7);
      }

      ctx.save();
      if (index !== 2 && index !== 11) {
        for (var i = 0; i < 23; i++) {
          var column = i % 6;
          var row = Math.floor(i / 6);
          var ballX = 105 + column * 18 + Math.sin(spin + i * 1.8) * 5;
          var ballY = (index === 7 ? 188 : 151) + row * 21 + Math.cos(spin * 1.2 + i) * 6;
          ctx.fillStyle = [p.base, p.pale, '#ffcf33', '#ff6b80', '#56d7a5'][i % 5];
          ctx.beginPath(); ctx.arc(ballX, ballY, 9, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
        }
      } else {
        for (var j = 0; j < 24; j++) {
          ctx.fillStyle = [p.base, p.pale, '#ffcf33', '#ff6b80'][j % 4];
          ctx.beginPath(); ctx.arc(101 + (j % 6) * 20 + Math.sin(spin + j) * 3,
            118 + Math.floor(j / 6) * 27 + Math.cos(spin + j) * 3, 8, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();

      if (index === 8) {
        ctx.strokeStyle = p.deep; ctx.lineWidth = 8;
        ctx.beginPath();
        for (var turn = 0; turn < 4; turn++) {
          ctx.ellipse(150, 114 + turn * 37, 57 - turn * 7, 17, 0, 0, Math.PI * 2);
        }
        ctx.stroke();
      } else if (index === 6) {
        ctx.fillStyle = p.paper; ctx.strokeStyle = p.deep; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(150, 105, 88, Math.PI, 0); ctx.lineTo(238, 121); ctx.lineTo(62, 121); ctx.closePath();
        ctx.fill(); ctx.stroke();
        [82, 116, 150, 184, 218].forEach(function (x, stripe) {
          ctx.strokeStyle = stripe % 2 ? p.base : p.dark;
          ctx.lineWidth = 9;
          ctx.beginPath(); ctx.moveTo(x, 107); ctx.lineTo(x + (x - 150) * 0.11, 119); ctx.stroke();
        });
      }

      var baseTop = index === 7 ? 257 : 253;
      if (index === 4) {
        polygon(ctx, [[111, baseTop], [189, baseTop], [222, 376], [78, 376]]);
      } else if (index === 5 || index === 11) {
        roundRect(ctx, 80, baseTop, 140, 123, 16);
      } else {
        polygon(ctx, [[102, baseTop], [198, baseTop], [218, 376], [82, 376]]);
      }
      fillStroke(ctx, bodyFill(ctx, p, 80, baseTop, 140, 123), p.deep, 7);

      ctx.fillStyle = p.metal; ctx.strokeStyle = p.deep; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(150, baseTop + 48, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(150, baseTop + 48); ctx.rotate(spin);
      ctx.strokeStyle = p.deep; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(31, 0); ctx.stroke(); ctx.restore();
      roundRect(ctx, 128, baseTop + 78, 44, 25, 7); ctx.fillStyle = p.deep; ctx.fill();
      highlight(ctx, 105, globeTop + 26, Math.min(90, globeRy));
      ctx.restore();
    };
  }

  function drawMicroscope(builderVariant) {
    var p = palette(builderVariant.color);
    var index = variantIndex(builderVariant);
    return function paintMicroscope(ctx, state) {
      var time = animatedTime(state);
      var knobSpin = time * 2.7;
      var stageBounce = Math.sin(time * 4 + index) * 3;
      var glint = (Math.sin(time * 2.1) + 1) * 0.5;
      groundShadow(ctx, 150, 232);
      ctx.save();

      ctx.fillStyle = bodyFill(ctx, p, 45, 327, 220, 49);
      ctx.strokeStyle = p.deep; ctx.lineWidth = 7;
      if (index === 11) {
        polygon(ctx, [[150, 320], [176, 344], [250, 350], [194, 376], [106, 376], [50, 350], [124, 344]]);
      } else if (index === 0 || index === 10) {
        ctx.beginPath();
        ctx.moveTo(53, 363); ctx.quadraticCurveTo(88, 321, 150, 344); ctx.quadraticCurveTo(212, 321, 247, 363);
        ctx.quadraticCurveTo(200, 386, 150, 367); ctx.quadraticCurveTo(100, 386, 53, 363); ctx.closePath();
      } else {
        roundRect(ctx, index === 9 ? 88 : 45, 337, index === 9 ? 124 : 210, 39, 15);
      }
      ctx.fill(); ctx.stroke();
      // Secondary flat foot guarantees the illustration looks planted even for
      // the arched and faceted cast variants (visual only; collider is shared).
      roundRect(ctx, 50, 356, 200, 20, 8);
      ctx.fillStyle = p.deep; ctx.fill();
      roundRect(ctx, 61, 358, 178, 11, 5);
      ctx.fillStyle = p.light; ctx.fill();

      ctx.strokeStyle = p.deep;
      ctx.lineWidth = index === 3 || index === 7 ? 25 : 34;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (index === 6 || index === 11) {
        ctx.moveTo(93, 337); ctx.lineTo(91, 224); ctx.lineTo(161, 158);
      } else if (index === 4) {
        ctx.moveTo(89, 337); ctx.lineTo(90, 116); ctx.lineTo(161, 116);
      } else {
        ctx.moveTo(91, 337);
        ctx.bezierCurveTo(42, 226, 76, 121, 164, 129);
      }
      ctx.stroke();
      ctx.strokeStyle = index === 5 ? '#c69b42' : p.base;
      ctx.lineWidth -= 12; ctx.stroke();

      ctx.save();
      ctx.translate(0, stageBounce);
      ctx.fillStyle = p.metal; ctx.strokeStyle = p.deep; ctx.lineWidth = 6;
      roundRect(ctx, 93, 250, 139, 22, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = p.glass; ctx.globalAlpha = 0.75;
      roundRect(ctx, 137, 253, 49, 12, 3); ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();

      ctx.save();
      if (index === 4) {
        roundRect(ctx, 130, 65, 112, 91, 9);
        ctx.fillStyle = p.deep; ctx.fill(); ctx.strokeStyle = p.pale; ctx.lineWidth = 6; ctx.stroke();
        ctx.fillStyle = '#bdf5ff'; roundRect(ctx, 143, 79, 86, 57, 5); ctx.fill();
      } else if (index === 6) {
        polygon(ctx, [[125, 104], [215, 104], [229, 171], [145, 184], [116, 145]]);
        fillStroke(ctx, p.light, p.deep, 7);
      } else {
        var tubeY = index === 1 || index === 9 ? 48 : 69;
        var tubeWidth = index === 2 ? 105 : 82;
        var tubeHeight = index === 7 ? 103 : 119;
        ctx.translate(128 + tubeWidth / 2 + (index === 3 || index === 7 ? -8 : 0),
          tubeY + tubeHeight / 2);
        ctx.rotate(index === 3 ? -0.22 : -0.38);
        roundRect(ctx, -tubeWidth / 2, -tubeHeight / 2, tubeWidth, tubeHeight, 18);
        fillStroke(ctx, bodyFill(ctx, p, -tubeWidth / 2, -tubeHeight / 2,
          tubeWidth, tubeHeight), p.deep, 7);
        ctx.fillStyle = p.deep;
        roundRect(ctx, -tubeWidth / 2 + 14, -tubeHeight / 2 - 12,
          index === 2 ? 27 : 49, 28, 8); ctx.fill();
        if (index === 2) {
          roundRect(ctx, -tubeWidth / 2 + 53, -tubeHeight / 2 - 12, 27, 29, 8); ctx.fill();
        }
      }
      ctx.restore();

      ctx.save();
      ctx.translate(index === 7 ? 108 : 112, index === 7 ? 214 : 198);
      ctx.rotate(knobSpin);
      ctx.fillStyle = p.light; ctx.strokeStyle = p.deep; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, index === 7 ? 32 : 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (var tooth = 0; tooth < 8; tooth++) {
        ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -(index === 7 ? 27 : 18)); ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = p.metal; ctx.strokeStyle = p.deep; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(181, 204, index === 8 ? 29 : 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      var lenses = index === 8 ? 3 : 2;
      for (var lens = 0; lens < lenses; lens++) {
        ctx.save(); ctx.translate(181, 204); ctx.rotate(-0.5 + lens * 0.5);
        ctx.fillStyle = p.dark; roundRect(ctx, -8, 13, 16, 54, 6); ctx.fill(); ctx.restore();
      }

      // Fine/coarse focus controls, stage clips, condenser and light cone add
      // the missing authored detail while keeping the original silhouette.
      [0, 1].forEach(function (knob) {
        ctx.beginPath(); ctx.arc(211, 184 + knob * 35, 10 - knob * 2, 0, Math.PI * 2);
        ctx.fillStyle = knob ? p.dark : p.light; ctx.fill();
        ctx.strokeStyle = p.deep; ctx.lineWidth = 3; ctx.stroke();
      });
      ctx.strokeStyle = p.deep; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(104, 256); ctx.lineTo(125, 256);
      ctx.moveTo(200, 256); ctx.lineTo(221, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(166, 260); ctx.lineTo(166, 291);
      ctx.quadraticCurveTo(181, 301, 197, 291); ctx.lineTo(197, 260); ctx.stroke();
      ctx.globalAlpha = 0.32; ctx.fillStyle = '#bdf5ff';
      polygon(ctx, [[174, 227], [190, 227], [211, 252], [153, 252]]); ctx.fill();
      ctx.globalAlpha = 1;

      if (index === 10) {
        ctx.strokeStyle = '#a87943'; ctx.lineWidth = 10; ctx.setLineDash && ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(81, 275); ctx.bezierCurveTo(54, 184, 88, 123, 145, 132); ctx.stroke();
        ctx.setLineDash && ctx.setLineDash([]);
      }
      ctx.save();
      ctx.globalAlpha = 0.28 + glint * 0.58;
      ctx.fillStyle = '#ffffff';
      polygon(ctx, [[178, 186], [188, 196], [205, 199], [190, 208], [185, 224], [179, 210], [163, 203], [178, 199]]);
      ctx.fill(); ctx.restore();
      ctx.restore();
    };
  }

  var BUILDERS = Object.freeze({
    'milk-carton': drawCarton,
    'teapot': drawTeapot,
    'salt-pepper-shaker': drawShaker,
    'soup-can': drawSoupCan,
    'smoothie': drawSmoothie,
    'gumball-machine': drawGumball,
    'microscope': drawMicroscope,
  });

  var BOUNDS = Object.freeze({
    'milk-carton': Object.freeze({ x: 38, y: 35, width: 224, height: 345 }),
    'teapot': Object.freeze({ x: 5, y: 35, width: 290, height: 345 }),
    'salt-pepper-shaker': Object.freeze({ x: 48, y: 35, width: 204, height: 345 }),
    'soup-can': Object.freeze({ x: 38, y: 35, width: 224, height: 345 }),
    'smoothie': Object.freeze({ x: 22, y: 35, width: 256, height: 345 }),
    'gumball-machine': Object.freeze({ x: 35, y: 45, width: 230, height: 335 }),
    'microscope': Object.freeze({ x: 20, y: 30, width: 260, height: 350 }),
  });

  function manifestObject(id) {
    for (var i = 0; i < Manifest.objects.length; i++) {
      if (Manifest.objects[i].id === id) return Manifest.objects[i];
    }
    throw new Error('Pack A object missing from manifest: ' + id);
  }

  function assertVariantParity(definition, record) {
    if (!definition || definition.variants.length !== record.variants.length) {
      throw new Error('Art/manifest variant count mismatch for ' + record.id);
    }
    for (var i = 0; i < record.variants.length; i++) {
      var artVariant = definition.variants[i];
      var manifestVariant = record.variants[i];
      if (artVariant.canonicalId !== manifestVariant.id ||
          artVariant.id !== manifestVariant.variantId ||
          artVariant.color !== manifestVariant.color) {
        throw new Error('Art/manifest variant mismatch: ' + manifestVariant.id);
      }
    }
  }

  function registerManifestObject(record, builder) {
    var existing = Art.getObject(record.id);
    if (existing) {
      assertVariantParity(existing, record);
      return existing;
    }
    var definition = Art.registerObject({
      id: record.id,
      label: record.displayName,
      metrics: {
        viewBox: BASE_METRICS.viewBox,
        bounds: BOUNDS[record.id],
        pivot: BASE_METRICS.pivot,
        baselineY: BASE_METRICS.baselineY,
        artScale: BASE_METRICS.artScale,
        localContactOffset: BASE_METRICS.localContactOffset,
      },
      variants: record.variants.map(function (variant, castIndex) {
        return {
          id: variant.variantId,
          label: variant.label,
          color: variant.color,
          tokens: {
            castIndex: castIndex,
            castLabel: variant.castLabel,
            silhouette: variant.silhouette,
            finish: variant.finish,
          },
        };
      }),
      buildVariant: function (variant) {
        var basePainter = builder(variant);
        return function paintWithPhysicalDetails(ctx, state) {
          basePainter(ctx, state);
          Art.paintPhysicalDynamics(ctx, record.id, state, variant.color);
          Art.paintReactionFace(ctx, variant.face, state);
        };
      },
    });
    assertVariantParity(definition, record);
    return definition;
  }

  var definitions = [];
  OBJECT_IDS.forEach(function (id) {
    var record = manifestObject(id);
    if (id === 'coffee-mug') {
      if (!Reference || Reference.objectId !== id || !Art.getObject(id)) {
        throw new Error('Pack A requires the Coffee Mug reference before registration');
      }
      assertVariantParity(Art.getObject(id), record);
      definitions.push(Art.getObject(id));
      return;
    }
    definitions.push(registerManifestObject(record, BUILDERS[id]));
  });

  var canonicalVariantIds = [];
  OBJECT_IDS.forEach(function (id) {
    manifestObject(id).variants.forEach(function (variant) {
      canonicalVariantIds.push(variant.id);
    });
  });

  return Object.freeze({
    contractRevision: 3,
    objectIds: OBJECT_IDS,
    canonicalVariantIds: Object.freeze(canonicalVariantIds),
    definitions: Object.freeze(definitions),
    coffeeMugSource: 'v111-art-reference',
  });
});
