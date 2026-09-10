// v111-art-pack-b.js — authored Canvas 2D art for v111 objects 9–16.
(function (root, factory) {
  'use strict';
  var Art = root && root.FlipArtV111;
  var Manifest = root && root.FLIP_V111_OBJECT_MANIFEST;
  if (typeof module === 'object' && module.exports) {
    Art = Art || require('./v111-art-platform.js');
    Manifest = Manifest || require('./v111-object-manifest.js');
  }
  var api = factory(Art, Manifest);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlipArtV111PackB = api;
})(typeof globalThis !== 'undefined' ? globalThis
  : (typeof self !== 'undefined' ? self
  : (typeof window !== 'undefined' ? window : this)), function (Art, Manifest) {
  'use strict';

  if (!Art || typeof Art.registerObject !== 'function') {
    throw new Error('v111-art-pack-b.js requires FlipArtV111 first');
  }
  if (!Manifest || !Array.isArray(Manifest.objects)) {
    throw new Error('v111-art-pack-b.js requires FLIP_V111_OBJECT_MANIFEST first');
  }

  var OBJECT_IDS = [
    'desk-globe',
    'microphone-stand',
    'potted-plants',
    'penguin',
    'owl',
    'giraffe',
    'red-panda',
    'trophy-cup',
  ];

  var BOUNDS = {
    'desk-globe': { x: 34, y: 48, width: 232, height: 328 },
    'microphone-stand': { x: 34, y: 42, width: 232, height: 334 },
    'potted-plants': { x: 32, y: 48, width: 236, height: 328 },
    'penguin': { x: 40, y: 54, width: 220, height: 322 },
    'owl': { x: 42, y: 50, width: 216, height: 326 },
    'giraffe': { x: 46, y: 24, width: 208, height: 352 },
    'red-panda': { x: 32, y: 50, width: 236, height: 326 },
    'trophy-cup': { x: 38, y: 44, width: 224, height: 332 },
  };

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function shade(hex, amount) {
    var raw = String(hex || '#777777').replace('#', '');
    var value = parseInt(raw, 16);
    var red = clampByte(((value >> 16) & 255) + amount * 255);
    var green = clampByte(((value >> 8) & 255) + amount * 255);
    var blue = clampByte((value & 255) + amount * 255);
    return '#' + [red, green, blue].map(function (channel) {
      return channel.toString(16).padStart(2, '0');
    }).join('');
  }

  function makePalette(base) {
    return Object.freeze({
      base: base,
      light: shade(base, 0.22),
      bright: shade(base, 0.38),
      dark: shade(base, -0.22),
      deep: shade(base, -0.40),
      ink: '#172330',
      white: '#fffaf0',
      glass: '#bfeaff',
      leaf: '#3c9b58',
      leafDark: '#17633c',
      soil: '#6f4428',
      gold: '#ffd45c',
      silver: '#dce8ef',
      warm: '#f2a85c',
      blush: '#ff9fb0',
    });
  }

  function motion(state, speed, amount, phase) {
    if (!state || state.reducedMotion) return 0;
    var time = Number.isFinite(state.time) ? state.time : 0;
    return Math.sin(time * speed + (phase || 0)) * amount;
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

  function ellipsePath(ctx, x, y, radiusX, radiusY, rotation) {
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, rotation || 0, 0, Math.PI * 2);
  }

  function polygonPath(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
  }

  function starPath(ctx, x, y, outer, inner, points, rotation) {
    var vertices = [];
    for (var i = 0; i < points * 2; i++) {
      var radius = i % 2 === 0 ? outer : inner;
      var angle = (rotation || -Math.PI / 2) + i * Math.PI / points;
      vertices.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
    }
    polygonPath(ctx, vertices);
  }

  function paintPath(ctx, fill, stroke, width) {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width || 5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  function line(ctx, points, color, width) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function gradient(ctx, x1, y1, x2, y2, light, dark) {
    if (typeof ctx.createLinearGradient !== 'function') return light;
    var result = ctx.createLinearGradient(x1, y1, x2, y2);
    result.addColorStop(0, light);
    result.addColorStop(0.48, shade(light, -0.08));
    result.addColorStop(1, dark);
    return result;
  }

  function rotatedEllipse(ctx, x, y, radiusX, radiusY, angle, fill, stroke, width) {
    ellipsePath(ctx, x, y, radiusX, radiusY, angle);
    paintPath(ctx, fill, stroke, width);
  }

  function drawEyes(ctx, palette, leftX, rightX, y, radius, look) {
    var glance = look || 0;
    [leftX, rightX].forEach(function (x) {
      ellipsePath(ctx, x, y, radius, radius * 1.12);
      paintPath(ctx, palette.white, palette.ink, 4);
      ellipsePath(ctx, x + glance, y + 2, radius * 0.42, radius * 0.48);
      paintPath(ctx, palette.ink);
      ellipsePath(ctx, x + glance - 2, y - 1, radius * 0.12, radius * 0.12);
      paintPath(ctx, palette.white);
    });
  }

  function drawLeaf(ctx, x, y, length, width, angle, palette) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-width, -length * 0.28, -width, -length * 0.76, 0, -length);
    ctx.bezierCurveTo(width, -length * 0.76, width, -length * 0.28, 0, 0);
    paintPath(ctx, palette.leaf, palette.leafDark, 3);
    line(ctx, [[0, -3], [0, -length + 7]], palette.leafDark, 2);
    ctx.restore();
  }

  function drawPot(ctx, palette, index, topY, bottomY) {
    var x = 91 + (index % 3) * 4;
    var width = 118 - (index % 3) * 8;
    var lipY = topY;
    roundedRect(ctx, x - 8, lipY, width + 16, 25, 9);
    paintPath(ctx, palette.light, palette.deep, 5);
    if (index === 3 || index === 9) {
      polygonPath(ctx, [[x, lipY + 22], [x + width, lipY + 22], [x + width - 15, bottomY], [x + 15, bottomY]]);
    } else if (index === 5) {
      ctx.beginPath();
      ctx.moveTo(x, lipY + 22);
      ctx.bezierCurveTo(x + 4, bottomY - 8, x + width - 4, bottomY - 8, x + width, lipY + 22);
      ctx.closePath();
    } else {
      polygonPath(ctx, [[x, lipY + 22], [x + width, lipY + 22], [x + width - 10, bottomY], [x + 10, bottomY]]);
    }
    paintPath(ctx, gradient(ctx, x, lipY, x + width, bottomY, palette.base, palette.dark), palette.deep, 5);
    ellipsePath(ctx, x + width / 2, lipY + 5, width / 2 - 8, 9);
    paintPath(ctx, palette.soil, palette.deep, 3);
    ctx.globalAlpha = 0.34;
    roundedRect(ctx, x + 17, lipY + 32, 13, bottomY - lipY - 45, 6);
    paintPath(ctx, palette.bright);
    ctx.globalAlpha = 1;
  }

  // Natural Earth 1:110m land, simplified to half-degree coordinates for this
  // 76px-radius globe. The source is public domain; see docs/v111-art-pack-b.md.
  // Each ring is pipe-separated, points are comma-separated, and lon/lat are
  // stored as signed base-36 integers at two units per degree. Keeping the
  // geographic data packed makes the offline/APK payload smaller than GeoJSON.
  var DESK_GLOBE_LAND_PACKED = '-2i.-4c,-2f.-4g,-30.-4h,-2i.-4c|-6q.-43,-6o.-43,-6l.-43,-6t.-43,-6q.-43|-6z.-43,-6w.-44,-73.-43,-71.-42,-6z.-43|-5i.-40,-5c.-41,-5p.-40,-5i.-40|-3t.-3y,-3y.-41,-46.-3z,-3x.-3u,-3t.-3y|-39.-3k,-3n.-3s,-3e.-43,-4a.-49,-43.-4c,-4c.-4e,-38.-4m,-1l.-4h,-20.-4d,-z.-46,-e.-3y,1i.-3x,1w.-3t,25.-3w,31.-3o,3u.-3s,3s.-40,3t.-40,3w.-41,4w.-3o,6o.-3r,7i.-3n,7n.-3q,9i.-3z,93.-48,9a.-4e,8w.-4i,a0.-4p,a0.-50,-a0.-50,-9y.-4o,-7y.-4q,-8j.-4n,-8i.-4k,-8q.-4i,-85.-4h,-8n.-4e,-8t.-4a,-8f.-4b,-7i.-45,-5k.-46,-5r.-41,-46.-44,-3r.-41,-3r.-3r,-36.-3j,-37.-3k,-39.-3k|-3r.-30,-3p.-31,-3m.-31,-3u.-33,-45.-2y,-3r.-30|83.-2a,89.-2a,88.-2e,84.-2f,83.-2a|9m.-2a,9o.-2b,9m.-2g,9f.-2l,99.-2k,9m.-2a|9p.-20,9x.-23,9q.-2b,9l.-1x,9p.-20|2s.-r,2m.-1e,2g.-1e,2h.-w,2q.-o,2s.-r|7z.-s,8i.-1g,8i.-1r,8c.-23,85.-26,7t.-24,7o.-1x,7n.-1y,7m.-1z,7o.-1u,7k.-1y,7b.-1r,6k.-1y,6e.-1w,6c.-18,6q.-13,6z.-s,77.-u,7d.-m,7l.-o,7j.-u,7s.-z,7x.-l,7z.-s|6p.-k,6p.-l,6m.-j,6p.-k|6k.-g,6m.-h,6h.-i,6k.-g|61.-e,6f.-h,5v.-e,61.-e|8g.-b,89.-b,8f.-8,8g.-b|7g.-2,7h.-6,7j.-7,7p.-3,81.-8,8d.-l,81.-f,7x.-j,7n.-h,7o.-b,7e.-8,7c.-6,7f.-4,79.-2,7g.-2|6y.3,6o.0,6o.-1,6q.-3,6r.-2,6v.-1,6r.-4,6u.-b,6q.-5,6n.-b,6o.1,6y.3|75.2,74.-2,74.4,75.2|5w.-c,5p.-8,5b.b,5s.0,5w.-c|6k.4,6m.2,6g.-8,64.-6,62.-1,63.4,6h.e,6m.b,6k.4|71.h,6z.b,6v.g,6s.e,6z.k,71.h|6l.j,6i.h,6n.n,6l.j|6z.o,6y.k,6x.p,6y.p,6z.o|6r.11,6r.t,6w.p,6o.u,6r.11|-41.14,-3t.11,-45.11,-41.14|65.11,61.13,66.14,65.11|-4f.1a,-44.15,-4c.14,-4k.19,-4q.18,-4f.1a|v.24,u.21,p.23,v.24|7u.22,7t.1y,7k.1v,7a.1w,78.1r,77.1v,7j.1z,7v.2b,7u.22|80.2g,83.2f,7s.2b,7w.2j,7y.2h,80.2g|-3j.2l,-3i.2l,-3g.2l,-3j.2l|-34.2t,-2z.2q,-2y.2l,-3b.2n,-34.2t|7z.2t,81.2q,7y.2r,7z.2k,7x.2l,7w.2k,7w.30,7z.2t|-e.2x,-h.2v,-k.2w,-i.2y,-j.30,-d.32,-e.2x|p.33,m.34,p.34,p.33|-6.39,-6.34,3.2v,-a.2s,-6.30,-c.36,-6.39|-4q.3n,-4g.3j,-4u.3j,-4q.3n|-t.3p,-t.3o,-r.3m,-11.3j,-1d.3n,-t.3p|-48.3q,-4a.3q,-4a.3r,-48.3q|-9q.3p,-9g.3o,-9m.3l,-9x.3o,-a0.3m,-a0.3u,-9q.3p|-9x.3y,-a0.3y,-a0.3z,-9x.3y|-51.3v,-4v.3q,-4r.3w,-4o.3w,-4l.3v,-4j.3r,-56.3g,-59.3a,-55.36,-4l.32,-4g.2u,-4e.2v,-4d.2x,-4e.30,-4g.31,-49.35,-4d.3a,-4c.3h,-44.3h,-3v.3e,-3r.38,-3l.3d,-33.2w,-3p.2s,-3y.2m,-3m.2q,-3l.2k,-3c.2k,-3n.2f,-3l.2j,-3o.2j,-3q.2i,-3x.2e,-3w.2b,-47.27,-48.22,-49.26,-47.1z,-4j.1r,-4h.1e,-4o.1o,-5d.1l,-5g.19,-5d.13,-54.11,-4u.17,-4y.w,-4n.v,-4o.m,-4j.i,-4a.h,-40.p,-3z.i,-3w.o,-3s.l,-3g.l,-36.c,-2v.8,-2t.0,-28.-6,-1x.-f,-25.-q,-2a.-18,-2n.-1e,-30.-1x,-39.-1w,-36.-22,-3m.-2a,-3j.-2d,-3r.-2j,-3o.-2o,-3y.-30,-46.-2x,-44.-2m,-47.-2l,-41.-2d,-45.-2e,-3w.-14,-48.-t,-4i.-c,-4g.-5,-4i.-2,-4a.8,-4c.h,-4i.e,-4r.k,-4v.r,-5r.11,-6e.1s,-63.1a,-68.1d,-6x.29,-6x.2o,-6t.2m,-6u.2q,-73.2u,-7g.38,-86.3e,-8f.3a,-8d.3f,-8t.34,-96.31,-8q.3a,-90.39,-98.3f,-8y.3m,-9c.3n,-8z.3o,-9a.3t,-8p.3z,-7l.3u,-74.3x,-62.3r,-5w.3u,-5c.3r,-58.3u,-5b.3v,-5d.3w,-5d.3y,-5a.40,-51.3v|-6c.42,-60.3z,-5z.40,-61.42,-5z.42,-5x.42,-5m.3v,-6b.3t,-6j.3w,-69.3x,-6n.3z,-6c.42|-5t.43,-5v.42,-5y.43,-5t.43|-4t.42,-40.3z,-3g.3q,-3g.3o,-3k.3m,-3s.3p,-3l.3j,-3u.3j,-3o.3g,-4b.3k,-44.3n,-42.3r,-50.3y,-50.40,-4z.42,-4t.42|-5l.44,-5i.43,-5f.44,-5d.3z,-5p.41,-5l.44|-56.42,-5c.43,-51.44,-54.42,-56.42|-6p.3z,-70.40,-6y.45,-6f.43,-6p.3z|-5h.49,-5g.46,-5p.47,-5h.49|-60.48,-5v.47,-6j.46,-60.48|37.3x,2v.40,33.46,3u.49,39.45,36.43,33.41,33.3z,37.3x|-59.4a,-4g.46,-50.45,-5e.4a,-5d.4a,-59.4a|5y.4a,6c.48,63.44,72.43,7b.3y,7t.42,9f.3t,9h.3w,9n.3w,9r.3w,9x.3v,a0.3u,a0.3m,9v.3l,9y.3h,93.3c,90.32,8q.2u,8o.36,95.3h,8w.3d,8v.3g,8p.3f,8k.3c,8m.3a,7w.3a,7q.36,7i.31,7s.30,7v.2y,7v.2w,7o.2l,73.28,76.1y,71.1x,6z.27,6q.26,6r.2a,6k.26,6m.23,6t.23,6m.1y,6s.1r,6r.1k,6g.1a,5w.14,63.r,5u.h,5k.r,5i.i,5s.3,5h.g,5e.y,58.w,53.1a,4u.17,4h.w,4g.l,4b.g,41.17,3y.16,3x.16,3p.1f,37.1f,2o.1o,2w.1c,35.1h,3c.19,33.y,2f.p,1y.1n,1w.1j,1t.1o,2d.n,2h.l,2u.o,2u.l,2n.8,26.-9,2a.-t,1y.-14,1z.-1b,1t.-1f,1s.-1m,1g.-1w,11.-1w,o.-10,r.-l,i.-2,j.7,9.d,-i.a,-x.o,-y.18,-c.20,j.23,m.22,l.1w,12.1p,17.1u,1w.1q,20.21,1j.21,1g.27,1v.2c,2b.2c,21.2i,26.2n,1w.2h,1p.2l,1j.2d,1m.2a,19.29,1c.23,19.21,13.2b,q.2j,p.2g,11.28,y.29,w.24,i.2h,6.2e,-4.21,-i.22,-j.2e,-3.2g,-2.2k,-9.2p,g.2z,h.36,l.37,m.30,13.31,17.37,1c.36,1b.3a,1m.3c,17.3d,17.3i,1f.3m,18.3n,10.3h,12.3c,w.34,q.33,l.3b,b.39,b.3b,a.3g,1d.3y,2a.3r,1u.3p,22.3k,2g.3o,2f.3t,2l.3t,2l.3p,2z.3u,3c.3t,3d.3w,3t.3s,3p.3y,41.42,41.3o,46.3s,42.3z,46.40,45.42,49.3y,4j.40,4h.41,4h.43,4u.46,5y.4a|2q.2b,2t.29,2q.23,30.22,2x.28,31.2a,2t.2h,2y.2j,2y.2k,2y.2m,2l.2h,2q.2b|-64.4b,-68.4b,-6b.4b,-64.4b|1d.4c,19.4b,15.4b,1d.4c|-63.4d,-66.4d,-69.4d,-63.4d|5u.4d,5j.4c,5n.4e,5o.4f,5u.4d|11.4f,17.4e,w.4a,l.4f,11.4f|1f.4h,1j.4g,z.4h,1f.4h|5k.4e,52.4h,58.4i,5c.4j,5k.4e|-4u.4f,-4s.4f,-52.4c,-5d.4g,-55.4j,-4u.4f|-3t.4m,-3g.4l,-4a.4f,-47.4d,-4h.48,-4z.49,-4q.4b,-4t.4c,-4w.4d,-4q.4f,-4t.4f,-4u.4h,-4k.4h,-53.4k,-3t.4m|-1i.4n,-16.4l,-1s.4k,-o.4j,-14.4g,-z.4g,-12.4f,-13.4e,-13.4b,-11.4a,-14.4a,-17.49,-13.45,-1e.41,-18.3x,-1h.3w,-1b.3w,-19.3w,-28.3n,-2f.3c,-2p.3e,-2v.3j,-30.3q,-2u.3w,-31.3v,-2v.3x,-34.3z,-31.41,-39.47,-43.4c,-3n.4f,-3n.4g,-3s.4g,-3h.4k,-1i.4n';
  var DESK_GLOBE_DEGREES = Math.PI / 180;
  var DESK_GLOBE_ROTATION_RADIANS_PER_SECOND = 0.34;
  var deskGlobeLandCache = null;

  function deskGlobeCoordinate(lon, lat) {
    var longitude = lon * DESK_GLOBE_DEGREES;
    var latitude = lat * DESK_GLOBE_DEGREES;
    return {
      cosLon: Math.cos(longitude),
      sinLon: Math.sin(longitude),
      cosLat: Math.cos(latitude),
      sinLat: Math.sin(latitude),
    };
  }

  function deskGlobeLand() {
    if (deskGlobeLandCache) return deskGlobeLandCache;
    deskGlobeLandCache = DESK_GLOBE_LAND_PACKED.split('|').map(function (ring) {
      return ring.split(',').map(function (point) {
        var pair = point.split('.');
        return deskGlobeCoordinate(parseInt(pair[0], 36) / 2, parseInt(pair[1], 36) / 2);
      });
    });
    return deskGlobeLandCache;
  }

  function deskGlobeProjection(centerLongitude, centerX, centerY, radius) {
    var cosCenter = Math.cos(centerLongitude);
    var sinCenter = Math.sin(centerLongitude);
    var centerLatitude = 12 * DESK_GLOBE_DEGREES;
    var cosLatitude = Math.cos(centerLatitude);
    var sinLatitude = Math.sin(centerLatitude);
    return function project(point) {
      var cosDelta = point.cosLon * cosCenter + point.sinLon * sinCenter;
      var sinDelta = point.sinLon * cosCenter - point.cosLon * sinCenter;
      return {
        x: centerX + radius * point.cosLat * sinDelta,
        y: centerY - radius * (cosLatitude * point.sinLat - sinLatitude * point.cosLat * cosDelta),
        z: sinLatitude * point.sinLat + cosLatitude * point.cosLat * cosDelta,
      };
    };
  }

  function deskGlobeHorizon(a, b, centerX, centerY, radius) {
    var t = a.z / (a.z - b.z);
    var x = a.x + (b.x - a.x) * t - centerX;
    var y = a.y + (b.y - a.y) * t - centerY;
    var length = Math.sqrt(x * x + y * y) || 1;
    return { x: centerX + x / length * radius, y: centerY + y / length * radius, z: 0 };
  }

  function deskGlobeVisibleRuns(points, centerX, centerY, radius) {
    var runs = [];
    var run = null;
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i];
      var b = points[i + 1];
      if (a.z >= 0) {
        if (!run) run = [a];
        if (b.z >= 0) {
          run.push(b);
        } else {
          run.push(deskGlobeHorizon(a, b, centerX, centerY, radius));
          runs.push(run);
          run = null;
        }
      } else if (b.z >= 0) {
        run = [deskGlobeHorizon(a, b, centerX, centerY, radius), b];
      }
    }
    if (run) runs.push(run);
    if (runs.length > 1 && points[0].z >= 0) {
      var tail = runs.pop();
      runs[0] = tail.concat(runs[0].slice(1));
    }
    return runs;
  }

  function deskGlobeTraceRun(ctx, run, close) {
    if (run.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(run[0].x, run[0].y);
    for (var i = 1; i < run.length; i++) ctx.lineTo(run[i].x, run[i].y);
    if (close) ctx.closePath();
  }

  function drawDeskGlobeGraticule(ctx, project, centerX, centerY, radius, palette) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = palette.white;
    ctx.lineWidth = 1.5;
    var lines = [];
    [-60, -30, 0, 30, 60].forEach(function (latitude) {
      var parallel = [];
      for (var lon = -180; lon <= 180; lon += 10) parallel.push(deskGlobeCoordinate(lon, latitude));
      lines.push(parallel);
    });
    for (var longitude = -150; longitude <= 180; longitude += 30) {
      var meridian = [];
      for (var lat = -80; lat <= 80; lat += 10) meridian.push(deskGlobeCoordinate(longitude, lat));
      lines.push(meridian);
    }
    lines.forEach(function (linePoints) {
      deskGlobeVisibleRuns(linePoints.map(project), centerX, centerY, radius).forEach(function (run) {
        deskGlobeTraceRun(ctx, run, false);
        ctx.stroke();
      });
    });
    ctx.restore();
  }

  function drawDeskGlobeGeography(ctx, project, centerX, centerY, radius, palette) {
    var landColors = [palette.leaf, '#7fbd63', palette.gold, '#d9a957'];
    deskGlobeLand().forEach(function (ring, ringIndex) {
      var projected = ring.map(project);
      var entirelyVisible = projected.every(function (point) { return point.z >= 0; });
      deskGlobeVisibleRuns(projected, centerX, centerY, radius).forEach(function (run) {
        if (run.length < 3) return;
        deskGlobeTraceRun(ctx, run, true);
        paintPath(ctx, landColors[ringIndex % landColors.length], palette.deep, 1.25);
      });
      if (entirelyVisible && projected.length >= 3) {
        // Closed rings already include their first coordinate. This branch is
        // intentionally empty; the flag documents the exact full-ring case.
      }
    });
  }

  function drawDeskGlobeSphere(ctx, state, palette, index, centerX, centerY, radius) {
    var renderState = state || {};
    var dynamics = typeof Art.physicalDynamicsSnapshot === 'function'
      ? Art.physicalDynamicsSnapshot('desk-globe', renderState)
      : renderState;
    var time = Number.isFinite(renderState.time) ? renderState.time : 0;
    var objectAngle = Number.isFinite(dynamics.angle) ? dynamics.angle
      : (Number.isFinite(renderState.angle) ? renderState.angle : 0);
    var accessoryLag = Number.isFinite(dynamics.accessoryLag) ? dynamics.accessoryLag : 0;
    var spin = renderState.reducedMotion ? 0
      : time * DESK_GLOBE_ROTATION_RADIANS_PER_SECOND;
    var centerLongitude = (-25 + index * 29) * DESK_GLOBE_DEGREES
      + spin - objectAngle * 0.32 - accessoryLag * 0.16;
    var project = deskGlobeProjection(centerLongitude, centerX, centerY, radius);

    ellipsePath(ctx, centerX, centerY, radius, radius);
    paintPath(ctx, gradient(ctx, centerX - radius, centerY - radius,
      centerX + radius, centerY + radius, '#55c8ef', '#175187'), palette.deep, 5);
    drawDeskGlobeGraticule(ctx, project, centerX, centerY, radius, palette);
    drawDeskGlobeGeography(ctx, project, centerX, centerY, radius, palette);

    // Atmospheric rim and a fixed specular highlight make the sphere read as
    // a physical globe while the real geography rotates underneath it.
    ctx.save();
    ctx.globalAlpha = index === 6 ? 0.52 : 0.28;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 5, -1.34, 1.14);
    ctx.strokeStyle = palette.white;
    ctx.lineWidth = index === 6 ? 8 : 4;
    ctx.stroke();
    ellipsePath(ctx, centerX - radius * 0.32, centerY - radius * 0.34,
      radius * 0.14, radius * 0.25, -0.55);
    paintPath(ctx, palette.white);
    ctx.restore();
    ellipsePath(ctx, centerX, centerY, radius, radius);
    paintPath(ctx, null, palette.deep, 5);

    return centerLongitude;
  }

  function drawDeskGlobe(variant) {
    var palette = makePalette(variant.color);
    var index = variant.order;
    return function paintDeskGlobe(ctx, state) {
      var centers = [166, 137, 165, 168, 164, 165, 166, 163, 181, 161, 171, 157];
      var radii = [82, 63, 74, 76, 75, 73, 74, 71, 62, 67, 84, 69];
      var centerY = centers[index];
      var radius = radii[index];
      var dynamics = typeof Art.physicalDynamicsSnapshot === 'function'
        ? Art.physicalDynamicsSnapshot('desk-globe', state || {}) : (state || {});
      var impact = Number.isFinite(dynamics.impact) ? dynamics.impact : 0;
      var axisFlex = state && state.reducedMotion ? 0
        : Math.max(-3, Math.min(3, impact * 2.4));
      centerY += axisFlex;

      // Rear stand geometry. Each cast keeps its own authored structure while
      // every sphere uses the same true rotating geographic projection.
      if (index === 4) {
        ctx.beginPath();
        ctx.arc(111, 191, 103, Math.PI * 0.55, Math.PI * 1.45);
        ctx.strokeStyle = palette.deep; ctx.lineWidth = 15; ctx.stroke();
        ctx.strokeStyle = palette.light; ctx.lineWidth = 7; ctx.stroke();
      } else if (index !== 9) {
        ctx.beginPath();
        ctx.ellipse(150, centerY, radius + 13, radius + 6, -0.38,
          -Math.PI * 0.55, Math.PI * 0.55);
        ctx.strokeStyle = palette.deep; ctx.lineWidth = index === 10 ? 16 : 10; ctx.stroke();
        ctx.strokeStyle = palette.light; ctx.lineWidth = 4; ctx.stroke();
      }

      if (index === 2) {
        ctx.save(); ctx.translate(150, centerY); ctx.rotate(0.64);
        ellipsePath(ctx, 0, 0, radius + 18, radius * 0.38);
        paintPath(ctx, null, palette.light, 7); ctx.restore();
      }
      if (index === 9) {
        [-0.72, 0.05, 0.74].forEach(function (angle, ringIndex) {
          ctx.save(); ctx.translate(150, centerY); ctx.rotate(angle);
          ellipsePath(ctx, 0, 0, radius + 18 + ringIndex * 3, radius * (0.30 + ringIndex * 0.04));
          paintPath(ctx, null, ringIndex === 1 ? palette.gold : palette.light, 6);
          ctx.restore();
        });
      }

      var longitude = drawDeskGlobeSphere(ctx, state, palette, index, 150, centerY, radius);

      if (index === 6) {
        ctx.globalAlpha = 0.45;
        ellipsePath(ctx, 150, centerY, radius + 10, radius + 10);
        paintPath(ctx, palette.glass, palette.bright, 5);
        ctx.globalAlpha = 1;
      }

      if (index === 7) {
        line(ctx, [[211, 117], [239, 83]], palette.deep, 6);
        var moonX = 244 + Math.cos(longitude * 0.58) * 7;
        var moonY = 79 + Math.sin(longitude * 0.58) * 5;
        ellipsePath(ctx, moonX, moonY, 13, 13); paintPath(ctx, palette.silver, palette.deep, 4);
        ellipsePath(ctx, moonX - 4, moonY - 3, 3, 2); paintPath(ctx, palette.dark);
      }
      if (index === 10) {
        ellipsePath(ctx, 69, centerY, 13, 18); paintPath(ctx, palette.gold, palette.deep, 4);
        ellipsePath(ctx, 231, centerY, 13, 18); paintPath(ctx, palette.gold, palette.deep, 4);
      }

      if (index === 11) {
        ctx.globalAlpha = 0.48;
        polygonPath(ctx, [[150, centerY - radius - 9], [207, centerY - 49],
          [225, centerY + 15], [192, centerY + 65], [150, centerY + radius + 8],
          [105, centerY + 63], [75, centerY + 12], [94, centerY - 50]]);
        paintPath(ctx, null, palette.bright, 6);
        ctx.globalAlpha = 1;
      }

      var stemTop = centerY + radius - 2;
      if (index === 8) {
        polygonPath(ctx, [[102, 342], [150, 270], [198, 342]]); paintPath(ctx, palette.dark, palette.deep, 6);
        line(ctx, [[117, 342], [150, 294], [183, 342]], palette.light, 5);
      } else {
        roundedRect(ctx, index === 1 ? 137 : 130, stemTop, index === 1 ? 26 : 40, 350 - stemTop, 10);
        paintPath(ctx, gradient(ctx, 130, stemTop, 176, 350, palette.light, palette.deep), palette.deep, 5);
      }
      if (index === 3) {
        roundedRect(ctx, 87, 338, 126, 38, 7); paintPath(ctx, palette.dark, palette.deep, 6);
        roundedRect(ctx, 99, 347, 102, 13, 4); paintPath(ctx, palette.base, palette.deep, 2);
      } else if (index === 11) {
        polygonPath(ctx, [[91, 376], [105, 332], [195, 332], [209, 376]]); paintPath(ctx, palette.deep, palette.ink, 6);
        roundedRect(ctx, 125, 343, 50, 13, 6); paintPath(ctx, palette.bright);
      } else if (index === 5) {
        ellipsePath(ctx, 150, 358, 77, 18); paintPath(ctx, '#8b6b3e', palette.deep, 6);
        roundedRect(ctx, 74, 356, 152, 20, 10); paintPath(ctx, palette.gold, palette.deep, 5);
      } else {
        ellipsePath(ctx, 150, 358, index === 8 ? 70 : 78, 18); paintPath(ctx, palette.dark, palette.deep, 6);
        roundedRect(ctx, 74, 356, 152, 20, 10); paintPath(ctx, palette.base, palette.deep, 5);
      }
    };
  }

  function drawMicrophone(variant) {
    var palette = makePalette(variant.color);
    var index = variant.order;
    return function paintMicrophone(ctx, state) {
      var pulse = motion(state, 2.1, 6, index * 0.35);
      var cable = motion(state, 1.4, 9, index);
      var headY = index === 10 ? 166 : (index === 1 ? 112 : 105);

      // Sound rings are decorative and freeze to a compact fixed ring.
      ctx.save();
      ctx.globalAlpha = 0.20;
      ctx.strokeStyle = palette.light;
      ctx.lineWidth = 5;
      [0, 1].forEach(function (ring) {
        ellipsePath(ctx, 150, headY, 58 + ring * 18 + pulse, 43 + ring * 14 + pulse * 0.6);
        ctx.stroke();
      });
      ctx.restore();

      // Cable and stand.
      ctx.beginPath();
      ctx.moveTo(151, 171);
      ctx.bezierCurveTo(203 + cable, 224, 84 - cable, 282, 142, 357);
      ctx.strokeStyle = palette.deep; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();

      if (index === 2) {
        line(ctx, [[105, 151], [177, 118], [211, 92]], palette.deep, 13);
        line(ctx, [[105, 151], [177, 118], [211, 92]], palette.light, 5);
        line(ctx, [[105, 148], [105, 351]], palette.deep, 15);
      } else if (index === 6) {
        line(ctx, [[150, 166], [150, 351]], palette.deep, 17);
        ellipsePath(ctx, 150, 156, 55, 61); paintPath(ctx, null, palette.light, 10);
      } else if (index === 7) {
        line(ctx, [[150, 162], [132, 226], [151, 351]], palette.deep, 17);
        [226].forEach(function (y) { ellipsePath(ctx, 132, y, 11, 11); paintPath(ctx, palette.gold, palette.deep, 4); });
      } else {
        line(ctx, [[150, 164], [150, 351]], palette.deep, index === 10 ? 18 : 14);
        line(ctx, [[150, 169], [150, 348]], palette.light, 5);
      }

      // Twelve distinct microphone head structures.
      if (index === 0) {
        ellipsePath(ctx, 150, headY, 42, 52); paintPath(ctx, palette.silver, palette.deep, 6);
        for (var y0 = 79; y0 < 131; y0 += 13) line(ctx, [[119, y0], [181, y0]], palette.dark, 3);
      } else if (index === 1) {
        roundedRect(ctx, 105, 58, 90, 113, 38); paintPath(ctx, palette.silver, palette.deep, 7);
        for (var x1 = 119; x1 <= 181; x1 += 15) line(ctx, [[x1, 75], [x1, 143]], palette.dark, 4);
      } else if (index === 2) {
        roundedRect(ctx, 193, 63, 62, 42, 21); paintPath(ctx, palette.base, palette.deep, 6);
        line(ctx, [[204, 76], [244, 76]], palette.silver, 4);
      } else if (index === 3) {
        roundedRect(ctx, 102, 55, 96, 92, 12); paintPath(ctx, palette.dark, palette.deep, 7);
        line(ctx, [[91, 72], [91, 135], [209, 135], [209, 72]], palette.light, 6);
        for (var y3 = 71; y3 < 134; y3 += 15) line(ctx, [[118, y3], [182, y3]], palette.silver, 3);
      } else if (index === 4) {
        ctx.save(); ctx.translate(150, 112); ctx.rotate(-0.32);
        roundedRect(ctx, -24, -69, 48, 138, 22); paintPath(ctx, palette.base, palette.deep, 6);
        ellipsePath(ctx, 0, -48, 22, 29); paintPath(ctx, palette.silver, palette.deep, 5);
        ctx.restore();
        roundedRect(ctx, 111, 130, 62, 22, 8); paintPath(ctx, palette.dark, palette.deep, 5);
      } else if (index === 5) {
        roundedRect(ctx, 119, 45, 62, 126, 12); paintPath(ctx, palette.dark, palette.deep, 7);
        for (var y5 = 65; y5 < 151; y5 += 14) line(ctx, [[130, y5], [170, y5]], palette.silver, 4);
      } else if (index === 6) {
        roundedRect(ctx, 111, 62, 78, 96, 34); paintPath(ctx, palette.base, palette.deep, 7);
        for (var x6 = 126; x6 < 180; x6 += 13) line(ctx, [[x6, 78], [x6, 135]], palette.silver, 3);
      } else if (index === 7) {
        roundedRect(ctx, 105, 55, 90, 100, 15); paintPath(ctx, palette.base, palette.deep, 7);
        drawEyes(ctx, palette, 131, 169, 94, 9, pulse * 0.1);
        line(ctx, [[132, 123], [168, 123]], palette.ink, 5);
      } else if (index === 8) {
        for (var petal = 0; petal < 8; petal++) {
          var angle = petal * Math.PI / 4;
          rotatedEllipse(ctx, 150 + Math.cos(angle) * 38, 104 + Math.sin(angle) * 38, 18, 31, angle, palette.light, palette.deep, 4);
        }
        ellipsePath(ctx, 150, 104, 29, 29); paintPath(ctx, palette.silver, palette.deep, 5);
      } else if (index === 9) {
        polygonPath(ctx, [[150, 42], [190, 126], [172, 154], [128, 154], [110, 126]]); paintPath(ctx, palette.base, palette.deep, 7);
        line(ctx, [[133, 80], [167, 80]], palette.silver, 5);
      } else if (index === 10) {
        ellipsePath(ctx, 150, 159, 43, 40); paintPath(ctx, palette.silver, palette.deep, 6);
        roundedRect(ctx, 108, 188, 84, 22, 8); paintPath(ctx, palette.base, palette.deep, 5);
      } else {
        ellipsePath(ctx, 150, 103, 42, 51); paintPath(ctx, palette.silver, palette.deep, 6);
        ellipsePath(ctx, 150, 103, 67, 67); paintPath(ctx, null, palette.bright, 9);
      }

      if (index === 10) {
        roundedRect(ctx, 82, 341, 136, 35, 17); paintPath(ctx, palette.dark, palette.deep, 6);
      } else if (index === 9) {
        polygonPath(ctx, [[91, 376], [111, 343], [189, 343], [209, 376]]); paintPath(ctx, palette.base, palette.deep, 6);
      } else {
        ellipsePath(ctx, 150, 359, 82, 17); paintPath(ctx, palette.dark, palette.deep, 6);
        roundedRect(ctx, 67, 358, 166, 18, 9); paintPath(ctx, palette.base, palette.deep, 5);
      }
    };
  }

  function drawPottedPlant(variant) {
    var palette = makePalette(variant.color);
    // The public order is the locked succulent→flowering-vine matrix. Reuse
    // proven authored silhouettes where possible while keeping color/IDs in
    // manifest order; Orchid and Flytrap are new dedicated drawings.
    var index = [3, 0, 1, 7, 12, 5, 2, 4, 9, 13, 10, 6][variant.order];
    return function paintPottedPlant(ctx, state) {
      var sway = motion(state, 1.65, 0.11, index * 0.6);
      var flutter = motion(state, 2.7, 5, index);
      var topY = index === 6 ? 225 : 300;

      if (index === 0) {
        roundedRect(ctx, 127 + flutter * 0.12, 84, 46, 231, 22); paintPath(ctx, palette.leaf, palette.leafDark, 6);
        roundedRect(ctx, 91 + flutter * 0.2, 161, 45, 39, 18); paintPath(ctx, palette.leaf, palette.leafDark, 6);
        roundedRect(ctx, 91 + flutter * 0.2, 157, 23, 79, 12); paintPath(ctx, palette.leaf, palette.leafDark, 5);
        roundedRect(ctx, 164 - flutter * 0.2, 130, 46, 39, 18); paintPath(ctx, palette.leaf, palette.leafDark, 6);
        roundedRect(ctx, 187 - flutter * 0.2, 121, 23, 77, 12); paintPath(ctx, palette.leaf, palette.leafDark, 5);
        for (var c = 0; c < 11; c++) {
          ellipsePath(ctx, 141 + (c % 3) * 11, 111 + c * 16, 2, 3); paintPath(ctx, palette.bright);
        }
      } else if (index === 1) {
        for (var f = 0; f < 11; f++) {
          var fAngle = -1.2 + f * 0.24 + sway;
          line(ctx, [[150, 306], [150 + Math.sin(fAngle) * 93, 145 - Math.cos(fAngle) * 42]], palette.leafDark, 4);
          for (var leaflet = 0; leaflet < 4; leaflet++) {
            var fy = 270 - leaflet * 29;
            rotatedEllipse(ctx, 150 + Math.sin(fAngle) * (25 + leaflet * 18), fy, 8, 21, fAngle, palette.leaf, palette.leafDark, 2);
          }
        }
      } else if (index === 2) {
        for (var blade = 0; blade < 8; blade++) {
          var bx = 105 + blade * 13;
          var bh = 125 + (blade % 4) * 33;
          ctx.beginPath(); ctx.moveTo(bx, 306); ctx.quadraticCurveTo(bx + Math.sin(sway + blade) * 18, 306 - bh * 0.58, bx + flutter * 0.25, 306 - bh);
          ctx.quadraticCurveTo(bx + 18, 306 - bh * 0.45, bx + 15, 306); ctx.closePath();
          paintPath(ctx, blade % 2 ? palette.leaf : palette.light, palette.leafDark, 4);
        }
      } else if (index === 3) {
        for (var ring = 0; ring < 3; ring++) {
          for (var petal = 0; petal < 9; petal++) {
            var pa = petal * Math.PI * 2 / 9 + ring * 0.25 + sway;
            rotatedEllipse(ctx, 150 + Math.cos(pa) * ring * 19, 245 + Math.sin(pa) * ring * 10,
              13, 52 - ring * 9, pa + Math.PI / 2, ring === 0 ? palette.bright : palette.leaf, palette.leafDark, 3);
          }
        }
      } else if (index === 4) {
        [
          [114, 133, -0.55], [176, 115, 0.48], [92, 215, -0.95],
          [203, 204, 0.92], [145, 180, 0.05],
        ].forEach(function (leaf, leafIndex) {
          line(ctx, [[150, 306], [leaf[0], leaf[1] + flutter * 0.25]], palette.leafDark, 6);
          rotatedEllipse(ctx, leaf[0], leaf[1] + flutter * 0.25, 31, 51, leaf[2] + sway, palette.leaf, palette.leafDark, 4);
          line(ctx, [[leaf[0] - 16, leaf[1]], [leaf[0] + 16, leaf[1]]], palette.bright, 3);
          if (leafIndex % 2 === 0) line(ctx, [[leaf[0], leaf[1] - 38], [leaf[0], leaf[1] + 34]], palette.bright, 3);
        });
      } else if (index === 5) {
        line(ctx, [[150, 306], [150, 204], [111 + flutter * 0.2, 151], [95, 108]], palette.deep, 13);
        line(ctx, [[150, 224], [195 + flutter * 0.2, 174]], palette.deep, 11);
        [[91, 103, 46], [121, 140, 42], [199, 166, 49], [161, 97, 43]].forEach(function (cloud) {
          ellipsePath(ctx, cloud[0], cloud[1], cloud[2], cloud[2] * 0.54); paintPath(ctx, palette.leaf, palette.leafDark, 5);
        });
      } else if (index === 6) {
        line(ctx, [[105, 228], [87 + flutter, 276], [110, 326], [79 - flutter, 366]], palette.leafDark, 8);
        line(ctx, [[195, 229], [219 - flutter, 279], [190, 328], [224 + flutter, 371]], palette.leafDark, 8);
        for (var vine = 0; vine < 6; vine++) {
          drawLeaf(ctx, vine % 2 ? 205 : 95, 255 + vine * 20, 28, 10, vine % 2 ? 0.8 : -0.8, palette);
        }
      } else if (index === 7) {
        line(ctx, [[150, 306], [150 + flutter * 0.4, 122]], palette.leafDark, 10);
        drawLeaf(ctx, 147, 250, 58, 18, -0.9 + sway, palette);
        drawLeaf(ctx, 154, 222, 58, 18, 0.9 + sway, palette);
        for (var sun = 0; sun < 16; sun++) {
          var sa = sun * Math.PI / 8;
          rotatedEllipse(ctx, 150 + flutter * 0.4 + Math.cos(sa) * 41, 102 + Math.sin(sa) * 41,
            13, 31, sa + Math.PI / 2, palette.gold, palette.deep, 3);
        }
        ellipsePath(ctx, 150 + flutter * 0.4, 102, 33, 33); paintPath(ctx, palette.dark, palette.deep, 5);
      } else if (index === 8) {
        [[105, 220, 36], [151, 174, 48], [202, 228, 32], [161, 254, 29], [76, 258, 25]].forEach(function (mushroom, mushroomIndex) {
          line(ctx, [[mushroom[0], 309], [mushroom[0] + flutter * 0.15, mushroom[1] + 11]], palette.white, 14);
          ellipsePath(ctx, mushroom[0] + flutter * 0.15, mushroom[1], mushroom[2], mushroom[2] * 0.48);
          paintPath(ctx, mushroomIndex % 2 ? palette.light : palette.base, palette.deep, 4);
          ellipsePath(ctx, mushroom[0] - 8, mushroom[1] - 4, 4, 3); paintPath(ctx, palette.white);
        });
      } else if (index === 9) {
        for (var spike = 0; spike < 13; spike++) {
          var spa = -1.3 + spike * 0.22 + sway;
          ctx.beginPath(); ctx.moveTo(150, 311); ctx.quadraticCurveTo(150 + Math.sin(spa) * 65, 212, 150 + Math.sin(spa) * 104, 107 + Math.abs(spike - 6) * 12);
          ctx.strokeStyle = spike % 2 ? palette.light : palette.leaf; ctx.lineWidth = 13 - Math.abs(spike - 6) * 0.6; ctx.lineCap = 'round'; ctx.stroke();
        }
      } else if (index === 10) {
        roundedRect(ctx, 136, 171, 28, 138, 11); paintPath(ctx, palette.dark, palette.deep, 5);
        for (var palm = 0; palm < 10; palm++) {
          var palmAngle = -1.35 + palm * 0.30 + sway;
          drawLeaf(ctx, 150, 176, 115 - (palm % 3) * 10, 17, palmAngle, palette);
        }
      } else if (index === 12) {
        // Orchid: broad grounded leaves plus two arched stems carrying
        // unmistakable five-petal flowers.
        [-0.9, -0.45, 0.45, 0.9].forEach(function (leafAngle, leafIndex) {
          drawLeaf(ctx, 150 + (leafIndex - 1.5) * 7, 291, 82 - leafIndex * 4,
            21, leafAngle + sway, palette);
        });
        [-1, 1].forEach(function (side) {
          ctx.beginPath();
          ctx.moveTo(150, 306);
          ctx.bezierCurveTo(150 + side * 7, 235, 151 + side * (52 + flutter), 174,
            150 + side * 45, 111);
          ctx.strokeStyle = palette.leafDark; ctx.lineWidth = 7; ctx.stroke();
          [0, 1, 2].forEach(function (flower) {
            var fx = 150 + side * (30 + flower * 8) + flutter * 0.16;
            var fy = 208 - flower * 48;
            for (var petal = 0; petal < 5; petal++) {
              var pa = petal * Math.PI * 2 / 5;
              rotatedEllipse(ctx, fx + Math.cos(pa) * 12, fy + Math.sin(pa) * 12,
                8, 15, pa, palette.bright, palette.deep, 2.5);
            }
            ellipsePath(ctx, fx, fy, 6, 6); paintPath(ctx, palette.gold, palette.deep, 2);
          });
        });
      } else if (index === 13) {
        // Flytrap: hinged paired lobes remain friendly and toy-like; their lag
        // makes the loose heads visibly react to rotation.
        [-1, 0, 1].forEach(function (side, trapIndex) {
          var tx = 150 + side * 48 + flutter * (0.10 + trapIndex * 0.04);
          var ty = 142 + Math.abs(side) * 48;
          ctx.beginPath(); ctx.moveTo(150, 306); ctx.quadraticCurveTo(tx - side * 18, 230, tx, ty + 22);
          ctx.strokeStyle = palette.leafDark; ctx.lineWidth = 9; ctx.stroke();
          ctx.save(); ctx.translate(tx, ty); ctx.rotate(side * 0.28 + sway);
          rotatedEllipse(ctx, -10, 0, 25, 13, -0.18, palette.leaf, palette.leafDark, 3);
          rotatedEllipse(ctx, 10, 0, 25, 13, 0.18, palette.light, palette.leafDark, 3);
          for (var tooth = -2; tooth <= 2; tooth++) {
            line(ctx, [[tooth * 7, -6], [tooth * 7, 6]], palette.white, 2);
          }
          ctx.restore();
        });
      } else {
        for (var alien = 0; alien < 7; alien++) {
          var ax = 84 + alien * 22;
          ctx.beginPath(); ctx.moveTo(150, 307); ctx.bezierCurveTo(ax + flutter, 249, 230 - ax, 163, ax + flutter * 0.3, 91 + (alien % 3) * 31);
          ctx.strokeStyle = alien % 2 ? palette.bright : palette.leaf; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.stroke();
          ellipsePath(ctx, ax + flutter * 0.3, 84 + (alien % 3) * 31, 10, 15); paintPath(ctx, palette.light, palette.deep, 3);
        }
        ctx.globalAlpha = 0.42;
        [
          [79, 159, 10], [218, 124, 14], [108, 75, 8], [196, 235, 9],
        ].forEach(function (bubble) { ellipsePath(ctx, bubble[0], bubble[1], bubble[2], bubble[2]); paintPath(ctx, palette.glass, palette.bright, 2); });
        ctx.globalAlpha = 1;
      }

      drawPot(ctx, palette, index, topY, 376);
    };
  }

  function drawPenguin(variant) {
    var palette = makePalette(variant.color);
    var index = variant.order;
    return function paintPenguin(ctx, state) {
      var flap = motion(state, 2.6, 0.22, index);
      var bob = motion(state, 1.8, 3, index * 0.4);
      var bodyRx = index === 10 ? 88 : (index === 2 ? 67 : 75);
      var bodyRy = index === 10 ? 82 : (index === 1 ? 99 : 112);
      var bodyY = 256 + bob;
      var headY = index === 1 ? 142 + bob : 133 + bob;

      // Animated flippers remain decorative and freeze at the neutral pose.
      [-1, 1].forEach(function (side) {
        ctx.save(); ctx.translate(150 + side * 58, 230 + bob); ctx.rotate(side * (0.52 + flap));
        ellipsePath(ctx, 0, 49, 24, 72); paintPath(ctx, palette.deep, palette.ink, 5);
        ctx.restore();
      });
      ellipsePath(ctx, 150, bodyY, bodyRx, bodyRy); paintPath(ctx, gradient(ctx, 80, 140, 220, 360, palette.dark, palette.deep), palette.ink, 6);
      ellipsePath(ctx, 150, bodyY + 11, bodyRx * 0.64, bodyRy * 0.72); paintPath(ctx, palette.white, palette.deep, 4);
      ellipsePath(ctx, 150, headY, index === 1 ? 67 : 70, index === 1 ? 61 : 68); paintPath(ctx, palette.dark, palette.ink, 6);
      drawEyes(ctx, palette, 127, 173, headY - 7, index === 3 ? 17 : 12, flap * 8);
      polygonPath(ctx, [[150, headY + 7], [174, headY + 22], [150, headY + 32], [126, headY + 22]]); paintPath(ctx, palette.warm, palette.deep, 4);

      // Cast-specific plumage and costume structures.
      if (index === 0) {
        polygonPath(ctx, [[104, 179], [126, 217], [150, 188], [174, 217], [196, 179], [182, 259], [150, 235], [118, 259]]); paintPath(ctx, palette.gold, null);
      } else if (index === 1) {
        polygonPath(ctx, [[95, 102], [126, 119], [116, 82], [148, 114], [184, 78], [174, 119], [207, 101], [180, 137], [119, 137]]); paintPath(ctx, palette.gold, palette.deep, 4);
      } else if (index === 2) {
        ellipsePath(ctx, 150, 226, 52, 64); paintPath(ctx, palette.light, null);
      } else if (index === 3) {
        ellipsePath(ctx, 124, headY - 7, 23, 27); paintPath(ctx, null, palette.white, 6);
        ellipsePath(ctx, 176, headY - 7, 23, 27); paintPath(ctx, null, palette.white, 6);
      } else if (index === 4) {
        line(ctx, [[111, headY + 13], [150, headY + 31], [189, headY + 13]], palette.ink, 6);
      } else if (index === 5) {
        polygonPath(ctx, [[93, 106], [125, 118], [116, 83], [147, 113], [184, 81], [175, 121], [208, 108], [177, 140], [120, 139]]); paintPath(ctx, palette.gold, palette.deep, 4);
      } else if (index === 6) {
        ctx.beginPath(); ctx.arc(150, headY - 35, 63, Math.PI, Math.PI * 2); paintPath(ctx, palette.light, palette.deep, 5);
        ellipsePath(ctx, 198, headY - 31, 14, 14); paintPath(ctx, palette.bright, palette.deep, 3);
        roundedRect(ctx, 185, 254, 35, 49, 8); paintPath(ctx, palette.base, palette.deep, 4);
      } else if (index === 7) {
        line(ctx, [[94, 170], [206, 170]], palette.deep, 8);
        ellipsePath(ctx, 124, headY - 7, 22, 18); paintPath(ctx, palette.glass, palette.deep, 5);
        ellipsePath(ctx, 176, headY - 7, 22, 18); paintPath(ctx, palette.glass, palette.deep, 5);
        line(ctx, [[93, 270], [207, 308]], palette.light, 12);
      } else if (index === 8) {
        ctx.beginPath(); ctx.arc(150, headY - 34, 61, Math.PI, Math.PI * 2); paintPath(ctx, palette.white, palette.deep, 5);
        roundedRect(ctx, 126, headY - 89, 48, 42, 12); paintPath(ctx, palette.white, palette.deep, 4);
      } else if (index === 9) {
        line(ctx, [[105, 236], [195, 236]], palette.light, 6);
        line(ctx, [[105, 266], [195, 266]], palette.light, 6);
        ellipsePath(ctx, 150, 283, 15, 15); paintPath(ctx, palette.gold, palette.deep, 3);
      } else if (index === 10) {
        ellipsePath(ctx, 150, bodyY, 93, 91); paintPath(ctx, null, palette.light, 8);
      } else {
        [
          [126, 226, 9], [176, 244, 8], [142, 284, 10], [171, 317, 7], [113, 304, 6],
        ].forEach(function (star) { starPath(ctx, star[0], star[1], star[2], star[2] * 0.45, 5); paintPath(ctx, palette.bright, palette.deep, 2); });
      }

      // Feet always terminate at the canonical baseline.
      ellipsePath(ctx, 112, 365, 43, 11, -0.12); paintPath(ctx, palette.warm, palette.deep, 5);
      ellipsePath(ctx, 188, 365, 43, 11, 0.12); paintPath(ctx, palette.warm, palette.deep, 5);
    };
  }

  function drawOwl(variant) {
    var palette = makePalette(variant.color);
    var index = variant.order;
    return function paintOwl(ctx, state) {
      var ruffle = motion(state, 2.2, 4, index);
      var glance = motion(state, 1.2, 5, index * 0.5);
      var tall = index === 3 || index === 11;
      var bodyY = tall ? 240 : 256;
      var bodyRy = tall ? 119 : (index === 2 || index === 10 ? 103 : 111);
      var bodyRx = index === 4 ? 70 : 82;

      ellipsePath(ctx, 150, bodyY, bodyRx, bodyRy); paintPath(ctx, gradient(ctx, 72, 90, 225, 360, palette.light, palette.dark), palette.deep, 6);
      // Layered wing scallops make motion readable without changing the outline.
      [-1, 1].forEach(function (side) {
        ctx.save(); ctx.translate(150 + side * 58, 226); ctx.rotate(side * (0.17 + ruffle * 0.006));
        ellipsePath(ctx, 0, 42, 30, 78); paintPath(ctx, palette.dark, palette.deep, 5);
        for (var feather = 0; feather < 3; feather++) {
          ellipsePath(ctx, side * 2, 22 + feather * 25, 17, 28); paintPath(ctx, palette.base, null);
        }
        ctx.restore();
      });

      if (index === 0) {
        polygonPath(ctx, [[81, 119], [103, 59], [132, 112], [168, 112], [199, 59], [219, 122]]); paintPath(ctx, palette.dark, palette.deep, 6);
      } else if (index === 1) {
        ctx.beginPath(); ctx.moveTo(78, 123); ctx.bezierCurveTo(88, 72, 132, 77, 150, 118); ctx.bezierCurveTo(169, 77, 211, 72, 222, 123); ctx.bezierCurveTo(212, 180, 172, 192, 150, 218); ctx.bezierCurveTo(128, 192, 87, 179, 78, 123); ctx.closePath(); paintPath(ctx, palette.white, palette.deep, 5);
      } else {
        ellipsePath(ctx, 150, 132, 75, 73); paintPath(ctx, palette.light, palette.deep, 6);
      }

      if (index !== 8) {
        drawEyes(ctx, palette, 121, 179, 131, index === 5 ? 20 : 17, glance);
        polygonPath(ctx, [[150, 144], [163, 157], [150, 168], [137, 157]]); paintPath(ctx, palette.gold, palette.deep, 3);
      }

      if (index === 2) {
        [[102, 194], [199, 201], [122, 250], [180, 276], [143, 321]].forEach(function (spot) {
          ellipsePath(ctx, spot[0], spot[1], 7, 9); paintPath(ctx, palette.deep);
        });
      } else if (index === 3) {
        line(ctx, [[116, 336], [109, 374]], palette.deep, 8); line(ctx, [[184, 336], [191, 374]], palette.deep, 8);
      } else if (index === 4) {
        for (var scallop = 0; scallop < 5; scallop++) {
          ctx.beginPath(); ctx.arc(104 + scallop * 23, 327 + (scallop % 2) * 7, 18, 0, Math.PI); ctx.strokeStyle = palette.bright; ctx.lineWidth = 6; ctx.stroke();
        }
      } else if (index === 5) {
        ellipsePath(ctx, 118, 131, 30, 31); paintPath(ctx, null, palette.deep, 9);
        ellipsePath(ctx, 182, 131, 30, 31); paintPath(ctx, null, palette.deep, 9);
      } else if (index === 6) {
        ellipsePath(ctx, 118, 131, 28, 25); paintPath(ctx, null, palette.ink, 5);
        ellipsePath(ctx, 182, 131, 28, 25); paintPath(ctx, null, palette.ink, 5);
        line(ctx, [[146, 131], [154, 131]], palette.ink, 5);
        roundedRect(ctx, 126, 260, 67, 69, 6); paintPath(ctx, palette.white, palette.deep, 5);
        line(ctx, [[159, 264], [159, 325]], palette.gold, 3);
      } else if (index === 7) {
        [118, 182].forEach(function (x) {
          ellipsePath(ctx, x, 131, 32, 32); paintPath(ctx, null, palette.gold, 7);
          for (var tooth = 0; tooth < 8; tooth++) {
            var a = tooth * Math.PI / 4;
            line(ctx, [[x + Math.cos(a) * 32, 131 + Math.sin(a) * 32], [x + Math.cos(a) * 39, 131 + Math.sin(a) * 39]], palette.deep, 4);
          }
        });
      } else if (index === 8) {
        roundedRect(ctx, 69, 60, 162, 316, 66); paintPath(ctx, '#805332', '#4b2d20', 7);
        ellipsePath(ctx, 150, 179, 61, 72); paintPath(ctx, '#3e261b', '#281711', 6);
        ellipsePath(ctx, 150, 190, 55, 66); paintPath(ctx, palette.base, palette.deep, 5);
        drawEyes(ctx, palette, 129, 171, 184, 13, glance);
      } else if (index === 9) {
        polygonPath(ctx, [[84, 195], [150, 99], [216, 195], [188, 183], [150, 139], [113, 184]]); paintPath(ctx, palette.bright, null);
        [[124, 246], [168, 272], [143, 311]].forEach(function (star) { starPath(ctx, star[0], star[1], 10, 4, 5); paintPath(ctx, palette.gold); });
      } else if (index === 10) {
        polygonPath(ctx, [[116, 81], [128, 51], [150, 77], [173, 51], [185, 82], [150, 102]]); paintPath(ctx, palette.gold, palette.deep, 5);
      } else if (index === 11) {
        for (var row = 0; row < 4; row++) {
          polygonPath(ctx, [[99 + row * 7, 227 + row * 30], [150, 247 + row * 30], [201 - row * 7, 227 + row * 30], [188 - row * 5, 263 + row * 30], [112 + row * 5, 263 + row * 30]]);
          paintPath(ctx, row % 2 ? palette.light : palette.base, palette.deep, 3);
        }
      }

      if (index !== 3 && index !== 8) {
        ellipsePath(ctx, 115, 367, 35, 9); paintPath(ctx, palette.gold, palette.deep, 4);
        ellipsePath(ctx, 185, 367, 35, 9); paintPath(ctx, palette.gold, palette.deep, 4);
      }
    };
  }

  function drawGiraffe(variant) {
    var palette = makePalette(variant.color);
    var index = variant.order;
    return function paintGiraffe(ctx, state) {
      var flex = motion(state, 1.45, 5, index);
      var twitch = motion(state, 3.1, 0.12, index * 0.4);
      var baby = index === 1;
      var headY = baby ? 115 : (index === 2 || index === 9 ? 54 : 69);
      var neckTop = headY + 35;
      var neckWidth = index === 3 || index === 11 ? 66 : 49;

      // Tail, body, legs, then the flexible neck.
      ctx.beginPath(); ctx.moveTo(89, 285); ctx.quadraticCurveTo(49 + flex, 294, 66, 336); ctx.strokeStyle = palette.deep; ctx.lineWidth = 9; ctx.stroke();
      ellipsePath(ctx, 135, 288, baby ? 74 : 80, baby ? 60 : 68); paintPath(ctx, gradient(ctx, 66, 220, 215, 355, palette.light, palette.dark), palette.deep, 6);
      [94, 132, 166, 198].forEach(function (x, legIndex) {
        var top = 319 + (legIndex % 2) * 3;
        roundedRect(ctx, x, top, baby ? 19 : 22, 53, 9); paintPath(ctx, palette.base, palette.deep, 5);
        ellipsePath(ctx, x + (baby ? 9 : 11), 371, baby ? 15 : 17, 5); paintPath(ctx, palette.deep);
      });
      roundedRect(ctx, 125 + flex, neckTop, neckWidth, 252 - neckTop, neckWidth / 2); paintPath(ctx, gradient(ctx, 125, neckTop, 195, 270, palette.light, palette.dark), palette.deep, 6);
      ellipsePath(ctx, 151 + flex, headY, baby ? 64 : 55, baby ? 49 : 42); paintPath(ctx, palette.light, palette.deep, 6);
      roundedRect(ctx, 127 + flex, headY + 17, 79, 37, 17); paintPath(ctx, palette.bright, palette.deep, 5);
      drawEyes(ctx, palette, 132 + flex, 174 + flex, headY - 6, baby ? 12 : 9, twitch * 22);

      // Ossicones and ears visibly animate unless reduced motion is requested.
      [-1, 1].forEach(function (side) {
        var rootX = 151 + flex + side * 20;
        ctx.save(); ctx.translate(rootX, headY - 30); ctx.rotate(side * twitch);
        line(ctx, [[0, 0], [side * 3, -32]], palette.deep, 7);
        ellipsePath(ctx, side * 3, -36, 9, 7); paintPath(ctx, palette.dark, palette.deep, 3);
        rotatedEllipse(ctx, side * 25, 1, 13, 28, side * 0.8, palette.base, palette.deep, 4);
        ctx.restore();
      });

      // Cast details: patches change shape; costumes and bases change structure.
      var patchFill = index === 8 ? palette.white : (index === 9 ? palette.gold : palette.deep);
      if (index === 2) {
        [[149, 135, 11], [153, 177, 9], [145, 221, 12], [111, 278, 13], [164, 299, 10]].forEach(function (spot) {
          polygonPath(ctx, [[spot[0], spot[1] - spot[2]], [spot[0] + spot[2], spot[1] - 3], [spot[0] + 7, spot[1] + spot[2]], [spot[0] - 8, spot[1] + 7], [spot[0] - spot[2], spot[1] - 5]]); paintPath(ctx, patchFill);
        });
      } else if (index === 9) {
        [[151, 128, 11], [149, 184, 9], [153, 232, 10], [108, 283, 12], [173, 299, 11]].forEach(function (spot) { starPath(ctx, spot[0], spot[1], spot[2], spot[2] * 0.45, 5); paintPath(ctx, patchFill); });
        starPath(ctx, 198 + flex, headY - 13, 9, 4, 5); paintPath(ctx, palette.gold);
      } else {
        [[150, 132, 10, 14], [148, 181, 12, 17], [155, 230, 11, 14], [105, 277, 16, 13], [164, 301, 14, 17], [194, 265, 11, 10]].forEach(function (spot) {
          ellipsePath(ctx, spot[0], spot[1], spot[2], spot[3]); paintPath(ctx, patchFill);
        });
      }

      if (index === 4) {
        line(ctx, [[119, 147], [184, 164]], palette.bright, 12);
        roundedRect(ctx, 188, 250, 37, 46, 7); paintPath(ctx, palette.base, palette.deep, 4);
      } else if (index === 5) {
        polygonPath(ctx, [[118, 24], [151, 42], [186, 24], [178, 70], [125, 70]]); paintPath(ctx, palette.leaf, palette.leafDark, 5);
        polygonPath(ctx, [[91, 272], [180, 246], [211, 330], [119, 348]]); paintPath(ctx, palette.white, palette.deep, 4);
      } else if (index === 6) {
        for (var segment = 0; segment < 4; segment++) line(ctx, [[128 + flex, 123 + segment * 34], [176 + flex, 123 + segment * 34]], palette.silver, 4);
        ellipsePath(ctx, 136, 287, 9, 9); paintPath(ctx, palette.gold, palette.deep, 3);
      } else if (index === 7) {
        line(ctx, [[150, 340], [150, 376]], palette.gold, 13);
        ellipsePath(ctx, 150, 371, 57, 5); paintPath(ctx, palette.dark, palette.deep, 4);
      } else if (index === 8) {
        [[112, 274, 26], [151, 250, 30], [184, 293, 24], [138, 320, 26]].forEach(function (cloud) { ellipsePath(ctx, cloud[0], cloud[1], cloud[2], cloud[2] * 0.55); paintPath(ctx, palette.white, palette.light, 3); });
      } else if (index === 10) {
        roundedRect(ctx, 83, 244, 135, 107, 37); paintPath(ctx, palette.light, palette.deep, 5);
        for (var rib = 0; rib < 4; rib++) line(ctx, [[92, 267 + rib * 18], [208, 267 + rib * 18]], palette.bright, 3);
      } else if (index === 11) {
        [[91, 252], [135, 240], [175, 258], [103, 302], [154, 316], [190, 299]].forEach(function (patch, patchIndex) {
          polygonPath(ctx, [[patch[0] - 17, patch[1] - 13], [patch[0] + 14, patch[1] - 17], [patch[0] + 19, patch[1] + 12], [patch[0] - 10, patch[1] + 18]]); paintPath(ctx, patchIndex % 2 ? palette.bright : palette.base, palette.deep, 2);
        });
      }
    };
  }

  function drawRedPanda(variant) {
    var palette = makePalette(variant.color);
    var index = variant.order;
    return function paintRedPanda(ctx, state) {
      var curl = motion(state, 1.8, 9, index);
      var twitch = motion(state, 3.0, 0.13, index * 0.3);
      var tailX = index === 1 ? 213 : 74;

      // Oversized striped tail is a defining silhouette and moves only decoratively.
      ctx.beginPath();
      ctx.moveTo(index === 1 ? 180 : 113, 311);
      ctx.bezierCurveTo(tailX + curl, 297, tailX - curl, index === 1 ? 135 : 174, index === 1 ? 195 : 62, index === 1 ? 77 : 109);
      ctx.strokeStyle = palette.deep; ctx.lineWidth = index === 1 ? 62 : 48; ctx.lineCap = 'round'; ctx.stroke();
      for (var stripe = 0; stripe < 5; stripe++) {
        var sy = 273 - stripe * 37;
        ctx.beginPath();
        ctx.moveTo(index === 1 ? 196 : 92, sy);
        ctx.lineTo(index === 1 ? 229 : 62, sy - 9);
        ctx.strokeStyle = stripe % 2 ? palette.white : palette.base; ctx.lineWidth = 15; ctx.stroke();
      }

      ellipsePath(ctx, 150, 274, index === 3 ? 85 : 75, index === 3 ? 91 : 99); paintPath(ctx, gradient(ctx, 78, 150, 223, 363, palette.light, palette.dark), palette.deep, 6);
      ellipsePath(ctx, 150, 286, 50, 66); paintPath(ctx, palette.white, palette.deep, 4);
      ellipsePath(ctx, 150, 149, index === 3 ? 73 : 69, index === 3 ? 63 : 67); paintPath(ctx, palette.base, palette.deep, 6);

      [-1, 1].forEach(function (side) {
        ctx.save(); ctx.translate(150 + side * 47, 100); ctx.rotate(side * twitch);
        polygonPath(ctx, [[0, 20], [side * 11, -30], [side * 42, 9]]); paintPath(ctx, palette.deep, palette.ink, 5);
        ctx.restore();
      });
      // Cream facial mask.
      rotatedEllipse(ctx, 120, 151, 31, 42, 0.28, palette.white, palette.deep, 3);
      rotatedEllipse(ctx, 180, 151, 31, 42, -0.28, palette.white, palette.deep, 3);
      drawEyes(ctx, palette, 124, 176, 145, 10, twitch * 18);
      polygonPath(ctx, [[150, 157], [163, 168], [150, 177], [137, 168]]); paintPath(ctx, palette.ink);
      ctx.beginPath(); ctx.moveTo(150, 177); ctx.bezierCurveTo(140, 190, 132, 188, 126, 185); ctx.moveTo(150, 177); ctx.bezierCurveTo(160, 190, 168, 188, 174, 185); ctx.strokeStyle = palette.ink; ctx.lineWidth = 4; ctx.stroke();

      if (index === 0) {
        line(ctx, [[91, 326], [70, 370], [125, 370]], palette.deep, 13);
      } else if (index === 2) {
        polygonPath(ctx, [[99, 205], [150, 236], [202, 205], [178, 258], [123, 258]]); paintPath(ctx, palette.bright, palette.deep, 4);
        roundedRect(ctx, 189, 263, 33, 42, 7); paintPath(ctx, palette.base, palette.deep, 4);
      } else if (index === 3) {
        line(ctx, [[109, 118], [125, 126]], palette.deep, 8); line(ctx, [[175, 126], [191, 118]], palette.deep, 8);
      } else if (index === 4) {
        drawLeaf(ctx, 150, 342, 136, 49, -0.05, palette);
      } else if (index === 5) {
        ctx.beginPath(); ctx.arc(150, 139, 85, Math.PI, Math.PI * 2); paintPath(ctx, palette.white, palette.deep, 6);
        line(ctx, [[93, 207], [208, 218]], palette.light, 14);
      } else if (index === 6) {
        line(ctx, [[99, 240], [201, 240]], palette.silver, 5); line(ctx, [[101, 279], [199, 279]], palette.silver, 5);
        ellipsePath(ctx, 150, 306, 14, 14); paintPath(ctx, palette.gold, palette.deep, 3);
      } else if (index === 7) {
        ellipsePath(ctx, 124, 145, 24, 21); paintPath(ctx, null, palette.ink, 5);
        ellipsePath(ctx, 176, 145, 24, 21); paintPath(ctx, null, palette.ink, 5);
        line(ctx, [[147, 145], [153, 145]], palette.ink, 5);
        line(ctx, [[204, 96], [218, 57]], palette.gold, 5);
      } else if (index === 8) {
        ellipsePath(ctx, 150, 82, 56, 32); paintPath(ctx, palette.dark, palette.deep, 5);
        polygonPath(ctx, [[150, 51], [163, 21], [175, 56]]); paintPath(ctx, palette.leaf, palette.leafDark, 4);
      } else if (index === 9) {
        roundedRect(ctx, 111, 241, 78, 74, 8); paintPath(ctx, palette.gold, palette.deep, 5);
        ctx.globalAlpha = 0.38; roundedRect(ctx, 124, 254, 52, 47, 5); paintPath(ctx, palette.white); ctx.globalAlpha = 1;
        line(ctx, [[150, 226], [150, 241]], palette.deep, 7);
      } else if (index === 10) {
        [[102, 239], [149, 224], [184, 266], [121, 301], [170, 320]].forEach(function (patch, patchIndex) {
          polygonPath(ctx, [[patch[0] - 18, patch[1] - 15], [patch[0] + 16, patch[1] - 11], [patch[0] + 13, patch[1] + 18], [patch[0] - 16, patch[1] + 14]]); paintPath(ctx, patchIndex % 2 ? palette.bright : palette.dark, palette.deep, 2);
        });
      } else if (index === 11) {
        for (var tailStar = 0; tailStar < 4; tailStar++) {
          starPath(ctx, 71 + tailStar * 8, 122 + tailStar * 43, 10, 4, 5); paintPath(ctx, palette.gold, palette.deep, 2);
        }
      }

      ellipsePath(ctx, 111, 366, 40, 10); paintPath(ctx, palette.deep, palette.ink, 4);
      ellipsePath(ctx, 189, 366, 40, 10); paintPath(ctx, palette.deep, palette.ink, 4);
    };
  }

  function drawTrophy(variant) {
    var palette = makePalette(variant.color);
    var index = variant.order;
    return function paintTrophy(ctx, state) {
      var gleam = motion(state, 1.7, 18, index);
      var ribbon = motion(state, 2.2, 8, index * 0.3);
      var metal = gradient(ctx, 70, 60, 224, 348, palette.bright, palette.dark);

      if (index === 5) {
        polygonPath(ctx, [[150, 60], [217, 89], [206, 208], [150, 256], [94, 208], [83, 89]]); paintPath(ctx, metal, palette.deep, 7);
        polygonPath(ctx, [[150, 91], [190, 107], [181, 190], [150, 217], [119, 190], [110, 107]]); paintPath(ctx, palette.light, palette.deep, 4);
      } else if (index === 6) {
        polygonPath(ctx, [[95, 77], [205, 77], [188, 219], [164, 253], [136, 253], [112, 219]]); paintPath(ctx, palette.glass, palette.deep, 6);
        polygonPath(ctx, [[112, 93], [188, 93], [174, 204], [150, 231], [126, 204]]); paintPath(ctx, palette.bright, null);
      } else if (index === 3) {
        starPath(ctx, 150, 95, 54, 24, 5); paintPath(ctx, palette.gold, palette.deep, 6);
        roundedRect(ctx, 130, 137, 40, 130, 14); paintPath(ctx, metal, palette.deep, 5);
      } else {
        var bowlTop = index === 1 ? 99 : (index === 9 ? 112 : 88);
        var bowlWidth = index === 2 ? 152 : (index === 9 ? 104 : 128);
        ctx.beginPath(); ctx.moveTo(150 - bowlWidth / 2, bowlTop); ctx.bezierCurveTo(150 - bowlWidth / 2 + 9, bowlTop + 91, 120, 223, 150, 228); ctx.bezierCurveTo(180, 223, 150 + bowlWidth / 2 - 9, bowlTop + 91, 150 + bowlWidth / 2, bowlTop); ctx.closePath(); paintPath(ctx, metal, palette.deep, 7);
        ellipsePath(ctx, 150, bowlTop, bowlWidth / 2, 18); paintPath(ctx, palette.light, palette.deep, 5);

        if (index === 10) {
          polygonPath(ctx, [[90, 91], [105, 57], [128, 85], [150, 48], [172, 85], [195, 57], [210, 91]]); paintPath(ctx, palette.gold, palette.deep, 5);
        }
        if (index === 8) {
          polygonPath(ctx, [[107, 214], [150, 87], [193, 214], [174, 231], [126, 231]]); paintPath(ctx, palette.base, palette.deep, 5);
        }

        // Handles vary by cast and ring subtly on the animated pose.
        if (index === 7) {
          [-1, 1].forEach(function (side) {
            ctx.beginPath(); ctx.moveTo(150 + side * 53, 111); ctx.bezierCurveTo(150 + side * (100 + ribbon), 123, 150 + side * 92, 194, 150 + side * 44, 204); ctx.strokeStyle = palette.leaf; ctx.lineWidth = 22; ctx.stroke();
          });
        } else {
          [-1, 1].forEach(function (side) {
            ctx.beginPath(); ctx.moveTo(150 + side * (bowlWidth / 2 - 4), 111); ctx.bezierCurveTo(150 + side * (101 + ribbon * 0.2), 112, 150 + side * 94, 188, 150 + side * 46, 196); ctx.strokeStyle = palette.deep; ctx.lineWidth = index === 2 ? 22 : 15; ctx.stroke();
            ctx.strokeStyle = palette.light; ctx.lineWidth = index === 2 ? 11 : 6; ctx.stroke();
          });
        }
      }

      if (index === 4) {
        roundedRect(ctx, 118, 220, 64, 105, 7); paintPath(ctx, metal, palette.deep, 6);
        for (var band = 0; band < 4; band++) line(ctx, [[120, 240 + band * 21], [180, 240 + band * 21]], band % 2 ? palette.base : palette.gold, 7);
      } else {
        roundedRect(ctx, 134, 218, 32, 107, 12); paintPath(ctx, metal, palette.deep, 5);
      }

      if (index === 11) {
        ctx.beginPath(); ctx.moveTo(117, 167); ctx.bezierCurveTo(89 + ribbon, 224, 128 - ribbon, 277, 99, 343); ctx.strokeStyle = palette.light; ctx.lineWidth = 14; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(183, 167); ctx.bezierCurveTo(211 - ribbon, 224, 172 + ribbon, 277, 201, 343); ctx.strokeStyle = palette.bright; ctx.lineWidth = 14; ctx.stroke();
      }

      if (index === 0 || index === 1 || index === 2 || index === 7 || index === 9 || index === 10) {
        ctx.save(); ctx.globalAlpha = 0.55;
        polygonPath(ctx, [[111 + gleam, 104], [124 + gleam, 104], [162 + gleam, 213], [147 + gleam, 213]]); paintPath(ctx, palette.white);
        ctx.restore();
      }

      // Original championship treatment: a broad medallion and two pedestal
      // tiers make the cup feel large and ceremonial without copying any real
      // trophy silhouette or trademark.
      starPath(ctx, 150, 169, 28, 13, 8, -Math.PI / 2);
      paintPath(ctx, palette.gold, palette.deep, 4);
      ellipsePath(ctx, 150, 169, 12, 12); paintPath(ctx, palette.bright, palette.deep, 3);
      roundedRect(ctx, 116, 286, 68, 22, 7); paintPath(ctx, metal, palette.deep, 4);
      roundedRect(ctx, 103, 305, 94, 19, 6); paintPath(ctx, palette.gold, palette.deep, 4);

      if (index === 1) {
        roundedRect(ctx, 112, 319, 76, 25, 7); paintPath(ctx, palette.dark, palette.deep, 5);
      } else {
        roundedRect(ctx, 91, 315, 118, 33, 8); paintPath(ctx, palette.dark, palette.deep, 5);
      }
      polygonPath(ctx, [[76, 376], [89, 345], [211, 345], [224, 376]]); paintPath(ctx, palette.deep, palette.ink, 6);
      roundedRect(ctx, 96, 351, 108, 17, 5); paintPath(ctx, palette.base, palette.deep, 3);
    };
  }

  var BUILDERS = {
    'desk-globe': drawDeskGlobe,
    'microphone-stand': drawMicrophone,
    'potted-plants': drawPottedPlant,
    'penguin': drawPenguin,
    'owl': drawOwl,
    'giraffe': drawGiraffe,
    'red-panda': drawRedPanda,
    'trophy-cup': drawTrophy,
  };

  function manifestObject(objectId) {
    for (var i = 0; i < Manifest.objects.length; i++) {
      if (Manifest.objects[i].id === objectId) return Manifest.objects[i];
    }
    throw new Error('Missing v111 manifest object: ' + objectId);
  }

  function metricsFor(objectId) {
    return {
      viewBox: { x: 0, y: 0, width: 300, height: 420 },
      bounds: BOUNDS[objectId],
      pivot: { x: 150, y: 323.2972972973 },
      baselineY: 376,
      artScale: 0.74,
      localContactOffset: 39,
    };
  }

  function faceOverride(objectId, index) {
    if (objectId === 'owl' && index === 8) {
      return { anchor: { x: 150, y: 184 }, scale: 0.78, focusRadius: 70, supportsEmotion: true };
    }
    if (objectId === 'giraffe' && index === 1) {
      return { anchor: { x: 151, y: 115 }, scale: 0.70, focusRadius: 64, supportsEmotion: true };
    }
    if (objectId === 'microphone-stand' && index === 10) {
      return { anchor: { x: 150, y: 159 }, scale: 0.68, focusRadius: 66, supportsEmotion: true };
    }
    return null;
  }

  var definitions = OBJECT_IDS.map(function (objectId) {
    var source = manifestObject(objectId);
    var current = Art.getObject(objectId);
    if (current) return current;
    return Art.registerObject({
      id: objectId,
      label: source.displayName,
      metrics: metricsFor(objectId),
      variants: source.variants.map(function (sourceVariant, index) {
        return {
          id: sourceVariant.variantId,
          label: sourceVariant.displayName,
          color: sourceVariant.color,
          face: faceOverride(objectId, index),
          tokens: {
            castIndex: index,
            castLabel: sourceVariant.castLabel,
            silhouette: sourceVariant.silhouette,
            finish: sourceVariant.finish,
            dynamicArt: source.dynamicArt,
            material: source.material,
          },
        };
      }),
      buildVariant: function (variant) {
        var basePainter = BUILDERS[objectId](variant);
        return function paintWithPhysicalDetails(ctx, state) {
          basePainter(ctx, state);
          // Desk Globe owns its detailed 360-degree motion in a separate art
          // shard; the shared profile remains available as an interface hook.
          if (objectId !== 'desk-globe') {
            Art.paintPhysicalDynamics(ctx, objectId, state, variant.color);
          }
          Art.paintReactionFace(ctx, variant.face, state);
        };
      },
    });
  });

  var canonicalVariantIds = [];
  definitions.forEach(function (definition) {
    definition.variants.forEach(function (variant) {
      canonicalVariantIds.push(variant.canonicalId);
    });
  });

  return Object.freeze({
    objectIds: Object.freeze(OBJECT_IDS.slice()),
    definitions: Object.freeze(definitions),
    variantIds: Object.freeze(canonicalVariantIds),
    deskGlobe: Object.freeze({
      face: null,
      supportsEmotion: false,
      projection: 'orthographic',
      centerLatitudeDegrees: 12,
      rotationPeriodSeconds: Math.PI * 2 / DESK_GLOBE_ROTATION_RADIANS_PER_SECOND,
      geography: Object.freeze({
        source: 'Natural Earth ne_110m_land',
        license: 'public-domain',
        ringCount: 65,
        quantizationDegrees: 0.5,
        simplificationDegrees: 1.2,
      }),
    }),
  });
});
