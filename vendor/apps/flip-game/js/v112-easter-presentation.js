// Lane-local broadcast cutaways. No camera, audio playback, RNG or game writes.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.FlipgameV112EasterPresentation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const INK = '#2a2430', PAPER = '#e4d6bb';
  const AUDIO = Object.freeze({
    'broadcast.globe-focus': 'wall', 'broadcast.return-chirp': 'wall',
    'arena.cafeteria-bell': 'capland', 'arena.library-shush': 'thud',
    'arena.ship-bell': 'capland', 'arena.molten-pulse': 'thud',
    'broadcast.instrument-lock': 'wall', 'arena.deep-time-crowd': 'greatsave',
    'arena.aquarium-bloop': 'wall', 'arena.arcade-trace': 'make',
    'arena.clock-thirteen': 'wall', 'signal.ninth-return': 'tension',
  });
  const CUES = Object.freeze([
    'globe.visible-hemisphere-focus', 'baseline.return-signal', 'cafeteria.lunch-judge',
    'library.quiet-table', 'pirate.crown-bell', 'volcano.molten-echo', 'station.fine-point',
    'stadium.deep-time-salute', 'aquarium.high-water-review', 'arcade.scatterline-trace',
    'haunted.thirteenth-tick', 'mars.ninth-return',
  ]);
  const labels = Object.freeze({
    'globe.visible-hemisphere-focus': 'THE WURLD IN FOCUS', 'baseline.return-signal': 'SIGNAL RECEIVED',
    'cafeteria.lunch-judge': 'LUNCH-LINE CERTIFIED', 'library.quiet-table': 'QUIET TABLE',
    'pirate.crown-bell': 'BELL ON THE CROWN', 'volcano.molten-echo': 'MOLTEN ECHO',
    'station.fine-point': 'FINE POINT FOUND', 'stadium.deep-time-salute': 'DEEP TIME SALUTE',
    'aquarium.high-water-review': 'HIGH WATER REVIEW', 'arcade.scatterline-trace': 'TRACE COMPLETE',
    'haunted.thirteenth-tick': 'THIRTEENTH TICK', 'mars.ninth-return': 'NINTH RETURN',
  });
  function rect(c, x, y, w, h, fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  function line(c, pts, color, width = 2) {
    c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p));
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
  function poly(c, pts, color) {
    c.beginPath(); c.moveTo(...pts[0]); pts.slice(1).forEach(p => c.lineTo(...p)); c.closePath();
    c.fillStyle = color; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke();
  }
  function oval(c, x, y, rx, ry, fill) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
  }
  function text(c, content, x, y, size = 12, fill = PAPER) {
    c.fillStyle = fill; c.font = '600 ' + size + 'px system-ui, sans-serif';
    c.textAlign = 'center'; c.fillText(content, x, y);
  }
  function background(c, color, floor) { rect(c, 0, 0, 420, 212, color); rect(c, 0, 162, 420, 50, floor || '#645b59'); }
  function instrument(c, x, y, w, h) {
    rect(c, x, y, w, h, '#344550'); line(c, [[x + 6, y + h - 5], [x + w - 6, y + h - 5]], '#b7b49e', 3);
  }
  function dinosaur(c, x, y, color, type, raised = 0) {
    // Original civilian silhouettes, never any playable T-Rex artwork.
    c.save(); c.translate(x, y);
    poly(c, [[-20, 59], [-24, 19], [0, 10], [19, 23], [21, 59]], '#869291');
    poly(c, [[-5, 13], [4, 13], [12, 54], [-11, 54]], '#ddd3b9');
    if (type === 'triceratops') {
      oval(c, -3, -5, 36, 31, '#a5b098');
      for (let i = 0; i < 7; i++) { const a = i * .48 + 2; oval(c, Math.cos(a) * 32 - 3, Math.sin(a) * 28 - 5, 5, 6, '#d4c9ab'); }
      oval(c, 10, 0, 27, 20, color); oval(c, 29, 8, 15, 12, color);
      poly(c, [[12, -13], [20, -36], [25, -10]], '#e4d8b9');
      poly(c, [[-7, -14], [-5, -34], [6, -10]], '#e4d8b9');
      poly(c, [[31, -1], [37, -12], [39, 7]], '#e4d8b9');
    } else {
      rect(c, -9, -4, 17, 26, color); oval(c, 0, -14, 24, 23, color);
      oval(c, 23, -4, 26, 11, color); oval(c, 33, -6, 10, 5, '#b8b79a');
      if (type === 'crested') poly(c, [[-18, -24], [-29, -55], [-4, -34]], color);
    }
    oval(c, 13, -8, 3, 4, INK); oval(c, 14, -9, .8, 1, PAPER);
    line(c, [[-18, 25], [-35, 17 - raised], [-42, 7 - raised]], color, 9);
    line(c, [[15, 29], [31, 34], [45, 26]], color, 9);
    rect(c, -25, 57, 52, 6, '#384650'); c.restore();
  }
  function gauge(c, x, y, progress) {
    oval(c, x, y, 47, 47, PAPER); oval(c, x, y, 39, 39, '#6a8790');
    for (let i = 0; i < 9; i++) { const a = Math.PI + i * Math.PI / 8; line(c, [[x + Math.cos(a) * 29, y + Math.sin(a) * 29], [x + Math.cos(a) * 36, y + Math.sin(a) * 36]], PAPER, 2); }
    const a = Math.PI + progress * Math.PI;
    line(c, [[x, y], [x + Math.cos(a) * 32, y + Math.sin(a) * 32]], '#e2b272', 3); oval(c, x, y, 4, 4, INK);
  }
  const scenes = {
    'baseline.return-signal'(c, p) {
      background(c, '#52626a', '#6b716a');
      rect(c, 35, 32, 265, 146, '#a1a597'); instrument(c, 44, 41, 247, 124);
      for (let i = 0; i < 5; i++) line(c, [[56, 57 + i * 21], [278, 57 + i * 21]], '#6c989138', 1);
      line(c, [[56, 137], [81, 136], [95, 117], [115, 127], [142, 82], [163, 123], [185, 71], [208, 118], [228, 89], [250, 119], [278, 118]], '#b8d2ad', 2.5);
      rect(c, 47 + p * 230, 43, 4, 120, '#d6e8bf44');
      text(c, 'LANE 09 / RETURN RECEIVED', 166, 158, 9);
      rect(c, 311, 63, 76, 108, '#c2b79d'); gauge(c, 349, 97, .8);
      text(c, 'VERIFIED', 349, 156, 9, INK);
    },
    'cafeteria.lunch-judge'(c, p) {
      background(c, '#b3beb0', '#8c9485');
      for (let x = 14; x < 420; x += 92) { rect(c, x, 30, 67, 48, '#88a6af'); line(c, [[x + 33, 30], [x + 33, 78]], PAPER, 4); }
      dinosaur(c, 164, 119, '#7d9b7a', 'triceratops', p * 12);
      c.save(); c.translate(113, 92 - p * 12); line(c, [[0, 0], [0, 42]], '#97784e', 6);
      oval(c, 0, -7, 37, 26, PAPER); text(c, 'CLEAN', 0, -7, 11, INK); text(c, 'HOLD', 0, 6, 11, INK); c.restore();
      rect(c, 24, 179, 370, 15, '#b4986f'); oval(c, 303, 175, 37, 7, '#849496');
      poly(c, [[279, 155], [310, 155], [317, 175], [272, 175]], '#d7d2ba');
    },
    'library.quiet-table'(c, p) {
      background(c, '#675659', '#776a59');
      for (let row = 0; row < 2; row++) for (let i = 0; i < 17; i++) rect(c, 9 + i * 25, 21 + row * 56, 17, 35 + i % 3 * 5, ['#a28d70', '#788e81', '#8b9da1'][i % 3]);
      for (const y of [68, 125]) rect(c, 0, y, 420, 7, '#aa8660');
      dinosaur(c, 284, 121, '#a1a688', 'crested', 4 + p * 10);
      oval(c, 298, 113, 8, 9, '#00000000'); line(c, [[289, 111], [307, 111], [307, 122], [289, 122], [289, 111]], '#c5ad83', 2);
      rect(c, 63, 136, 124, 41, PAPER); text(c, 'QUIET TABLE', 125, 161, 14, INK);
      poly(c, [[24, 182], [175, 176], [186, 195], [15, 201]], '#8da194'); line(c, [[33, 185], [171, 181]], PAPER, 2);
    },
    'pirate.crown-bell'(c, p) {
      background(c, '#819aa7', '#80674d'); rect(c, 0, 131, 420, 33, '#658b9a');
      rect(c, 76, 0, 14, 185, '#705744'); rect(c, 330, 0, 14, 185, '#705744');
      line(c, [[82, 34], [336, 34]], '#c8b58b', 5);
      c.save(); c.translate(208, 36); c.rotate(Math.sin(p * 8) * .16 * (1 - p));
      line(c, [[0, 0], [0, 26]], '#504944', 6);
      poly(c, [[-29, 38], [-47, 103], [47, 103], [29, 38], [10, 27], [-10, 27]], '#bb9554');
      oval(c, 0, 103, 48, 10, '#e0bd7b'); oval(c, 0, 104, 32, 5, '#775e42');
      line(c, [[0, 75], [0, 122]], '#b89d69', 4); oval(c, 0, 126, 7, 9, '#b89d69'); c.restore();
      poly(c, [[338, 50], [397, 62], [385, 101], [338, 91]], PAPER);
      poly(c, [[350, 75], [350, 66], [360, 73], [366, 62], [372, 75], [383, 69], [380, 83], [352, 83]], '#9c7e55');
    },
    'volcano.molten-echo'(c, p) {
      background(c, '#6a5966', '#67575a');
      poly(c, [[166, 172], [261, 71], [310, 71], [420, 172]], '#8e655d');
      oval(c, 285, 74, 25 + Math.sin(p * 9) * 2, 5, '#e6bc79');
      line(c, [[275, 80], [280, 107], [307, 128], [298, 160]], '#d59a65', 8);
      poly(c, [[58, 159], [70, 42], [113, 42], [126, 159]], '#81a0a255');
      for (let i = 0; i < 4; i++) oval(c, 88 + Math.sin(i * 5 + p * 3) * 13, 65 + i * 23, 11 + i % 2 * 5, 16, '#d5a266');
      poly(c, [[68, 44], [114, 44], [105, 26], [78, 26]], '#b7b2a2');
      poly(c, [[58, 160], [126, 160], [137, 192], [46, 192]], '#a3a79c');
      line(c, [[139, 113], [180, 113], [195, 101], [211, 113], [236, 113]], '#cbb489', 2);
    },
    'station.fine-point'(c, p, o) {
      background(c, '#536c7b', '#7b8c8e');
      poly(c, [[36, 184], [138, 184], [128, 169], [93, 169], [84, 112], [109, 54], [91, 45], [55, 111], [62, 169], [36, 169]], '#b7b5a6');
      poly(c, [[91, 46], [115, 37], [135, 67], [114, 78]], '#809594');
      rect(c, 78, 118, 66, 7, '#c9c6af'); oval(c, 84, 98, 10, 10, '#bfa275');
      oval(c, 290, 110, 80, 80, '#b8beb4'); oval(c, 290, 110, 70, 70, '#304856');
      line(c, [[222, 110], [358, 110]], '#749b9655', 1); line(c, [[290, 42], [290, 178]], '#749b9655', 1);
      const points = o.replayPoints;
      if (Array.isArray(points) && points.length >= 2 && points.length <= 256 && points.every(v => v && Number.isFinite(v.x) && Number.isFinite(v.y) && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1)) {
        const visible = points.slice(0, Math.max(2, Math.ceil(points.length * p)));
        c.save(); c.beginPath(); c.arc(290, 110, 67, 0, Math.PI * 2); c.clip();
        line(c, visible.map(v => [239 + v.x * 102, 59 + v.y * 102]), '#cbdbb6', 2); c.restore();
      }
      for (const x of [261, 319]) line(c, [[x, 92], [x, 82], [x + (x < 290 ? 10 : -10), 82]], '#c7d0b0', 2);
      text(c, 'FIELD OPTICS', 90, 203, 10); text(c, 'LENS 09', 290, 203, 10);
    },
    'stadium.deep-time-salute'(c, p) {
      background(c, '#3f5267', '#707975');
      for (let row = 0; row < 3; row++) for (let i = 0; i < 22; i++) oval(c, 8 + i * 19, 21 + row * 23, 4, 5, ['#a9967c', '#8fa5a2', '#b19283'][i % 3]);
      dinosaur(c, 102, 121, '#86a19b', 'crested', p * 15);
      dinosaur(c, 235, 126, '#a5ad83', 'triceratops', p * 15);
      dinosaur(c, 359, 124, '#ad9c82', 'hadrosaur', p * 15);
      rect(c, 0, 179, 420, 19, '#aaa68f');
      rect(c, 157, 153, 125, 40, PAPER); text(c, 'DEEP TIME', 219, 170, 12, INK); text(c, 'SUPPORTERS', 219, 184, 10, INK);
    },
    'aquarium.high-water-review'(c, p) {
      background(c, '#537c8d', '#79999c');
      for (let i = 0; i < 5; i++) { oval(c, 22 + i * 89, 47 + i % 2 * 23, 20, 7, '#b4c2ad'); poly(c, [[8 + i * 89, 47 + i % 2 * 23], [i * 89, 39 + i % 2 * 23], [i * 89, 55 + i % 2 * 23]], '#b4c2ad'); }
      dinosaur(c, 284, 127, '#a7b59a', 'hadrosaur');
      rect(c, 67, 92, 9, 92, '#a3b8ad'); gauge(c, 99, 110, .7 + Math.sin(p * 12) * .12);
      text(c, 'SPLASH', 99, 173, 10, PAPER);
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(181 + i % 2 * 11, 166 - i * 22 - p * 8, 4, 0, Math.PI * 2); c.strokeStyle = '#c0d6d1'; c.stroke(); }
      poly(c, [[326, 154], [370, 154], [370, 187], [326, 187]], PAPER); line(c, [[334, 165], [360, 165]], '#658488');
    },
    'arcade.scatterline-trace'(c, p) {
      background(c, '#363b51', '#57516a');
      for (let i = 0; i < 8; i++) {
        const x = 13 + i * 50, lit = i / 8 <= p;
        poly(c, [[x, 181], [x + 4, 112], [x + 3, 44], [x + 40, 44], [x + 39, 112], [x + 44, 181]], ['#95676d', '#67878c', '#9d8e68'][i % 3]);
        instrument(c, x + 8, 68, 28, 36); oval(c, x + 22, 54, 5, 3, lit ? '#eed29d' : '#655e63');
        const a = i * Math.PI * .85; line(c, [[x + 22 - Math.cos(a) * 10, 84 - Math.sin(a) * 10], [x + 22 + Math.cos(a) * 10, 84 + Math.sin(a) * 10]], lit ? '#c4d7b4' : '#536e76', 3);
        rect(c, x + 7, 113, 32, 5, '#c3b599');
      }
      text(c, 'SCATTERLINE / EIGHT RETURNS', 210, 204, 11);
    },
    'haunted.thirteenth-tick'(c, p) {
      background(c, '#605366', '#796a6d');
      poly(c, [[135, 204], [148, 48], [172, 24], [250, 24], [274, 48], [287, 204]], '#917857');
      oval(c, 211, 88, 60, 60, '#cab896'); oval(c, 211, 88, 51, 51, PAPER);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; line(c, [[211 + Math.sin(a) * 42, 88 - Math.cos(a) * 42], [211 + Math.sin(a) * 47, 88 - Math.cos(a) * 47]], INK, 2); }
      const a = -Math.PI / 2 + Math.min(1, p * 1.4) * Math.PI / 6;
      line(c, [[211, 88], [211 + Math.cos(a) * 37, 88 + Math.sin(a) * 37]], INK, 3);
      line(c, [[211, 88], [186, 69]], INK, 4); oval(c, 211, 88, 4, 4, '#9e7655');
      line(c, [[211, 144], [211 + Math.sin(p * 7) * 13, 180]], '#c6b786', 4); oval(c, 211 + Math.sin(p * 7) * 13, 181, 15, 15, '#b49b6c');
      text(c, '13', 317, 105, 27, '#dfc69a');
    },
    'mars.ninth-return'(c, p) {
      background(c, '#7d656c', '#a5816a');
      poly(c, [[0, 168], [58, 130], [114, 143], [176, 113], [235, 162], [342, 136], [420, 157], [420, 183], [0, 183]], '#946f66');
      for (let i = 0; i < 9; i++) {
        const a = i * Math.PI * 2 / 9 - Math.PI / 2, x = 210 + Math.cos(a) * 109, y = 103 + Math.sin(a) * 68;
        if (i === 0) { c.beginPath(); c.arc(x, y, 14, 0, Math.PI * 2); c.strokeStyle = '#bfb29e'; c.lineWidth = 1; c.stroke(); continue; }
        const dy = Math.sin(p * 4 + i) * 2;
        oval(c, x, y + dy, 18, 6, '#b7b9af'); oval(c, x, y - 5 + dy, 9, 6, '#83a5a7');
        for (let k = -1; k <= 1; k++) oval(c, x + k * 10, y + 3 + dy, 2, 1, '#e2cb99');
      }
      text(c, '08 ENTRIES / 09 RETURNS', 210, 200, 11);
    },
  };
  function valid(p) {
    return p && p.schema === 'EasterEggPresentationV1' && p.version === 1 && p.presentationOnly === true &&
      p.afterCommittedOutcome === true && p.cue && CUES.includes(p.cue.id) && p.visual &&
      p.visual.scope === 'lane' && Number.isFinite(p.visual.durationMs) && p.visual.durationMs > 0 && p.visual.durationMs <= 2000;
  }
  function audioCue(p) { return valid(p) && p.audio && p.audio.play === true && Object.prototype.hasOwnProperty.call(AUDIO, p.audio.cueId) ? AUDIO[p.audio.cueId] : null; }
  function draw(ctx, options) {
    const o = options || {}, p = o.presentation, elapsed = o.elapsedMs;
    if (!ctx || typeof ctx.save !== 'function' || !valid(p) || !Number.isFinite(o.width) || !Number.isFinite(o.height) || o.width < 1 || o.height < 1 ||
        !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= p.visual.durationMs) return false;
    let surface = null;
    if (p.cue.id === CUES[0]) {
      // Root supplies the already-created real globe surface and current/focus
      // orientation. Never create a second globe, fetch geography or fake land.
      if (!o.globeSurface || typeof o.globeSurface.render !== 'function' || !o.globeRequest ||
          !Number.isFinite(o.globeRequest.centerLon) || !Number.isFinite(o.globeRequest.centerLat)) return false;
      try { surface = o.globeSurface.render(o.globeRequest); } catch (_) { return false; }
      if (!surface || !surface.canvas) return false;
    }
    const phase = p.visual.reducedMotion ? .8 : elapsed / p.visual.durationMs;
    const width = Math.min(440, o.width * .86, (o.height * .6) * 420 / 242), height = width * 242 / 420;
    const x = (o.width - width) / 2, y = Math.min(62, o.height * .09);
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(0, 0, o.width, o.height); ctx.clip();
      ctx.translate(x, y); ctx.scale(width / 420, height / 242);
      ctx.globalAlpha = p.visual.reducedMotion ? 1 : Math.min(1, elapsed / 110, (p.visual.durationMs - elapsed) / 150);
      ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.rect(0, 0, 420, 242); ctx.clip();
      if (surface) {
        background(ctx, '#354b5c', '#4b626a');
        ctx.drawImage(surface.canvas, 108, 4, 204, 204);
      } else scenes[p.cue.id](ctx, phase, o);
      rect(ctx, 0, 212, 420, 30, INK); text(ctx, labels[p.cue.id], 210, 232, 13);
      line(ctx, [[1, 1], [419, 1], [419, 241], [1, 241], [1, 1]], '#b4a991', 2);
    } finally { ctx.restore(); }
    return true;
  }
  return Object.freeze({ schema: 'EasterPresentationRendererV1', version: 1, visualOnly: true, cueIds: CUES, draw, audioCue });
});
