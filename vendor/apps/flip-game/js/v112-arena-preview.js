// Offline authored venue previews. Visuals only; callers own frame scheduling.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.FlipgameV112ArenaPreview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const INK = '#2a2430';
  const catalog = Object.freeze([
    ['baseline-table', 'Baseline Table'], ['rooftop', 'Rooftop'],
    ['school-cafeteria', 'School Cafeteria'], ['sports-locker-room', 'Sports Locker Room'],
    ['grand-library', 'Grand Library'], ['garden', 'Garden'], ['arcade', 'Arcade'],
    ['island-beach', 'Island Beach'], ['skate-park-sunset', 'Skate Park at Sunset'],
    ['pirate-ship-deck', 'Pirate Ship Deck'], ['aquarium-tunnel', 'Aquarium Tunnel'],
    ['rainforest-treehouse', 'Rainforest Treehouse'], ['movie-soundstage', 'Movie Soundstage'],
    ['haunted-hall', 'Haunted Hall'], ['ice-cave', 'Ice Cave'], ['moon-deck', 'Moon Deck'],
    ['neon-grid', 'Neon Grid'], ['volcano', 'Volcano'], ['storm-table', 'Storm Table'],
    ['mars-outpost', 'Mars Outpost'], ['stadium-night', 'Stadium at Night'],
    ['space-station', 'Space Station'], ['aurora-stage', 'Aurora Stage'],
  ].map(row => Object.freeze({ id: row[0], displayName: row[1] })));
  const byId = Object.create(null);
  catalog.forEach(entry => { byId[entry.id] = entry; });
  Object.freeze(byId);
  function canonical(id) {
    const key = typeof id === 'string' ? id.replace(/^arena\./, '') : '';
    return byId[key] ? key : 'baseline-table';
  }
  function rect(c, x, y, w, h, fill, stroke) {
    c.fillStyle = fill; c.fillRect(x, y, w, h);
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.strokeRect(x, y, w, h); }
  }
  function line(c, points, color, width) {
    c.beginPath(); c.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(p => c.lineTo(p[0], p[1]));
    c.strokeStyle = color || INK; c.lineWidth = width || 2; c.stroke();
  }
  function poly(c, points, fill, stroke) {
    c.beginPath(); c.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(p => c.lineTo(p[0], p[1])); c.closePath();
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
  }
  function oval(c, x, y, rx, ry, color, stroke) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fillStyle = color; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
  }
  function text(c, s, x, y, size, color, align) {
    c.font = '600 ' + size + 'px system-ui, sans-serif';
    c.textAlign = align || 'center'; c.fillStyle = color; c.fillText(s, x, y);
  }
  function sky(c, top, bottom, ground) {
    const g = c.createLinearGradient(0, 0, 0, 440);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    rect(c, 0, 0, 960, 540, g); rect(c, 0, 367, 960, 173, ground);
  }
  function stars(c, t) {
    for (let i = 0; i < 43; i++) {
      const x = (i * 173 + 51) % 960, y = (i * 67 + 19) % 325;
      c.globalAlpha = .38 + .3 * Math.sin(i + t * .4);
      oval(c, x, y, i % 5 ? 1 : 2, i % 5 ? 1 : 2, '#f5eddf');
    }
    c.globalAlpha = 1;
  }
  function cloud(c, x, y, scale, color) {
    oval(c, x, y, 70 * scale, 18 * scale, color);
    oval(c, x - 25 * scale, y - 13 * scale, 26 * scale, 25 * scale, color);
    oval(c, x + 17 * scale, y - 20 * scale, 34 * scale, 32 * scale, color);
  }
  function mountains(c, color, base, peaks) {
    poly(c, [[0, base]].concat(peaks).concat([[960, base]]), color);
  }
  function floor(c, color, seams) {
    poly(c, [[0, 356], [960, 356], [960, 540], [0, 540]], color);
    if (seams) for (let i = -4; i <= 8; i++) line(c, [[480 + i * 55, 356], [480 + i * 180, 540]], seams, 1);
  }
  function pennant(c, x, y, color, label) {
    poly(c, [[x - 26, y], [x + 26, y], [x + 26, y + 72], [x, y + 88], [x - 26, y + 72]], color, INK);
    if (label) text(c, label, x, y + 40, 14, '#f5ead6');
  }
  function poster(c, x, y, w, title, subtitle) {
    rect(c, x, y, w, 72, '#e8dbc5', INK);
    text(c, title, x + w / 2, y + 28, 15, INK);
    text(c, subtitle, x + w / 2, y + 50, 10, '#60576a');
  }
  function table(c, color, accent) {
    oval(c, 480, 503, 343, 18, '#00000020');
    poly(c, [[162, 395], [800, 395], [862, 440], [101, 440]], color, INK);
    poly(c, [[101, 440], [862, 440], [862, 459], [101, 459]], '#423740', INK);
    line(c, [[162, 403], [796, 403]], accent || '#e0c69e', 3);
    poly(c, [[166, 459], [196, 459], [179, 530], [154, 530]], '#59434a', INK);
    poly(c, [[768, 459], [798, 459], [813, 530], [788, 530]], '#59434a', INK);
    rect(c, 441, 442, 80, 14, '#e5d8be'); text(c, 'WFC', 481, 453, 10, INK);
    // A subtle registration mark, not a suggested launch/landing target.
    line(c, [[473, 420], [487, 420]], '#ffffff24', 1);
  }
  function tree(c, x, y, scale, color) {
    rect(c, x - 7 * scale, y - 80 * scale, 14 * scale, 100 * scale, '#66514b');
    poly(c, [[x, y - 185 * scale], [x - 57 * scale, y - 72 * scale], [x + 57 * scale, y - 72 * scale]], color);
    poly(c, [[x, y - 135 * scale], [x - 69 * scale, y - 18 * scale], [x + 69 * scale, y - 18 * scale]], color);
  }
  function person(c, x, y, color, dino) {
    // Tiny everyday official/spectator: a friendly long-neck dinosaur appears
    // only in selected venues, never as a replacement for playable T-Rex art.
    rect(c, x - 7, y - 19, 14, 23, color);
    if (dino) {
      rect(c, x + 1, y - 37, 6, 21, '#7a9f88');
      oval(c, x + 9, y - 39, 12, 6, '#7a9f88');
      oval(c, x + 13, y - 41, 1, 1, INK);
      line(c, [[x - 4, y - 6], [x - 19, y - 1]], '#7a9f88', 5);
    } else oval(c, x, y - 27, 7, 8, '#c89470');
    line(c, [[x - 4, y + 3], [x - 5, y + 13]], INK, 3);
    line(c, [[x + 4, y + 3], [x + 6, y + 13]], INK, 3);
  }
  function skyline(c, tint) {
    for (let i = 0; i < 13; i++) {
      const h = 55 + (i * 37) % 115, x = i * 81 - 20;
      rect(c, x, 342 - h, 72, h, tint);
      for (let row = 0; row < Math.floor(h / 22); row++)
        for (let col = 0; col < 3; col++) rect(c, x + 9 + col * 21, 350 - h + row * 22, 9, 9, '#e5cd9b55');
    }
  }
  function water(c, y, t, color) {
    for (let i = 0; i < 9; i++) {
      const x = (i * 143 + t * 5) % 1100 - 80;
      line(c, [[x, y + (i % 4) * 19], [x + 45, y + (i % 4) * 19 - 2], [x + 80, y + (i % 4) * 19]], color, 2);
    }
  }
  function lamp(c, x, y, color) {
    line(c, [[x, 0], [x, y]], INK, 3);
    poly(c, [[x - 30, y], [x + 30, y], [x + 47, y + 24], [x - 47, y + 24]], color, INK);
    oval(c, x, y + 25, 39, 5, '#ffe8ad');
  }
  const scenes = {
    'baseline-table'(c) {
      sky(c, '#d7d6ca', '#f1e7d4', '#908c80');
      rect(c, 0, 279, 960, 78, '#a6aca2'); line(c, [[0, 280], [960, 280]], '#75837d', 5);
      for (let x = 65; x < 960; x += 140) line(c, [[x, 290], [x, 355]], '#818f87', 2);
      poster(c, 355, 126, 250, 'WURLD FLIP CHAMPIONSHIP', 'TEN LIVES. TRY NOT TO YEET IT.');
      lamp(c, 180, 62, '#6a7f78'); lamp(c, 780, 62, '#6a7f78');
      floor(c, '#a9a18e', '#8e877c'); table(c, '#b98252');
    },
    rooftop(c, t) {
      sky(c, '#929fac', '#ebbd98', '#726773'); cloud(c, 200 + Math.sin(t * .07) * 15, 113, .8, '#e4d9cf');
      skyline(c, '#6a6a7c'); rect(c, 0, 330, 960, 45, '#a99080', INK);
      for (let i = 0; i < 19; i++) line(c, [[i * 57, 336], [i * 57, 371]], '#746674', 1);
      rect(c, 750, 277, 120, 52, '#8a9191', INK);
      for (let y = 288; y < 320; y += 8) line(c, [[760, y], [856, y]], '#586371', 3);
      line(c, [[95, 325], [95, 171], [126, 151], [63, 151]], INK, 3);
      table(c, '#956f5d');
    },
    'school-cafeteria'(c, t) {
      sky(c, '#dedac7', '#ede7d6', '#acb1a4');
      for (let x = 75; x <= 665; x += 295) {
        rect(c, x, 88, 200, 116, '#89a4ae', INK); line(c, [[x + 100, 88], [x + 100, 204]], '#e1d8c1', 8);
        line(c, [[x, 142], [x + 200, 142]], '#e1d8c1', 8);
      }
      rect(c, 0, 278, 960, 76, '#9aa391');
      for (const x of [60, 675]) {
        poly(c, [[x, 285], [x + 202, 285], [x + 227, 304], [x - 25, 304]], '#b7855c', INK);
        line(c, [[x, 318], [x + 203, 318]], '#778c7f', 12);
      }
      poster(c, 411, 220, 140, 'LUNCH LEAGUE', 'EVERY SEAT COUNTS');
      person(c, 835, 277, '#6d808c', true); person(c, 790, 280, '#b16e54');
      lamp(c, 475, 38, '#a7b8b1'); table(c, '#b7916a');
    },
    'sports-locker-room'(c) {
      sky(c, '#9ba7a9', '#c8cbbd', '#7c8687');
      for (let i = 0; i < 10; i++) {
        const x = 60 + i * 86; rect(c, x, 78, 76, 247, i % 3 ? '#687f84' : '#9d5d4f', INK);
        for (let y = 97; y < 126; y += 8) line(c, [[x + 15, y], [x + 60, y]], '#354951', 3);
        rect(c, x + 12, 193, 5, 30, '#c5bba6'); text(c, String(i + 1).padStart(2, '0'), x + 39, 160, 12, '#dddacb');
      }
      rect(c, 171, 326, 618, 15, '#ad7e56', INK); line(c, [[214, 342], [214, 375]], INK, 7);
      line(c, [[746, 342], [746, 375]], INK, 7); pennant(c, 485, 42, '#c88d49', 'WFC'); table(c, '#b9a07a');
    },
    'grand-library'(c) {
      sky(c, '#58484b', '#a88867', '#725e53');
      for (let bay = 0; bay < 5; bay++) {
        const x = 50 + bay * 180; rect(c, x, 52, 152, 281, '#342f37', INK);
        for (let row = 0; row < 4; row++) {
          for (let b = 0; b < 10; b++) {
            const h = 27 + (b * 17 + row * 7) % 24;
            rect(c, x + 9 + b * 14, 116 + row * 65 - h, 10, h, ['#829080', '#be9760', '#a56f5f', '#71828d'][(b + row) % 4]);
          }
          rect(c, x, 116 + row * 65, 152, 8, '#8f6c4f');
        }
      }
      line(c, [[733, 114], [705, 366]], '#c2a77a', 6); line(c, [[770, 114], [742, 366]], '#c2a77a', 6);
      for (let y = 145; y < 360; y += 31) line(c, [[728 - (y - 145) * .11, y], [764 - (y - 145) * .11, y]], '#b49970', 4);
      lamp(c, 350, 40, '#4b6d5b'); lamp(c, 610, 40, '#4b6d5b'); table(c, '#946843');
    },
    garden(c, t) {
      sky(c, '#aec0b5', '#e2dbb2', '#879773');
      for (let x = 0; x < 960; x += 42) { rect(c, x, 245, 25, 112, '#d8c8a7', INK); }
      for (const x of [85, 810]) {
        rect(c, x, 210, 45, 150, '#695c4c');
        for (let i = 0; i < 7; i++) oval(c, x + 20 + Math.sin(i * 4) * 55, 170 + i % 3 * 30, 48, 35, i % 2 ? '#668464' : '#7d9968');
      }
      for (let i = 0; i < 14; i++) {
        const x = 145 + i * 51, y = 339 + i % 2 * 12;
        line(c, [[x, 371], [x + Math.sin(t + i) * 2, y - 17]], '#536b4e', 3);
        oval(c, x + Math.sin(t + i) * 2, y - 19, 8, 6, ['#c88b77', '#ddbd62', '#a797b1'][i % 3]);
      }
      table(c, '#baa077');
    },
    arcade(c, t) {
      sky(c, '#292d43', '#666075', '#383747');
      for (let i = 0; i < 5; i++) {
        const x = 53 + i * 180; poly(c, [[x, 315], [x + 12, 204], [x + 7, 82], [x + 126, 82], [x + 121, 204], [x + 137, 315]], ['#9d6665', '#4e7880', '#9c895a'][i % 3], INK);
        rect(c, x + 21, 119, 92, 93, '#202c3b', INK); rect(c, x + 14, 89, 105, 24, '#c6b998');
        text(c, ['LANE RUN', 'ORBIT', 'CAP CLUB', 'FLIP 09', 'RALLY'][i], x + 68, 106, 12, INK);
        line(c, [[x + 29, 190], [x + 45, 155 + Math.sin(t + i) * 8], [x + 88, 176], [x + 108, 142]], '#b9d1b1', 3);
        poly(c, [[x + 17, 219], [x + 116, 219], [x + 129, 237], [x + 6, 237]], '#b5ab95', INK);
        oval(c, x + 90, 227, 4, 3, '#cc8965');
      }
      table(c, '#625769', '#cbb882');
    },
    'island-beach'(c, t) {
      sky(c, '#90bac1', '#e8d7b5', '#d3b88d'); rect(c, 0, 252, 960, 95, '#5eaaa8'); water(c, 270, t, '#c6e0ce');
      mountains(c, '#6c9084', 269, [[60, 252], [159, 202], [241, 260], [678, 254], [788, 219], [960, 267]]);
      for (const x of [80, 878]) {
        line(c, [[x, 390], [x - 15, 190], [x + 2, 136]], '#827055', 19);
        for (let i = 0; i < 5; i++) {
          const dx = (i - 2) * 41, sway = Math.sin(t * .5) * 3;
          poly(c, [[x, 146], [x + dx, 108 + Math.abs(i - 2) * 23 + sway], [x + dx * 1.3, 179], [x + dx * .5, 148]], '#527c66');
        }
      }
      oval(c, 796, 369, 16, 7, '#d9cbb1', INK); table(c, '#ab805c');
    },
    'skate-park-sunset'(c) {
      sky(c, '#a398ac', '#ecc197', '#9f9697'); oval(c, 700, 167, 55, 55, '#f3d2a5'); skyline(c, '#857c8c');
      floor(c, '#b2a7a3', '#918994');
      c.beginPath(); c.moveTo(0, 207); c.bezierCurveTo(95, 207, 97, 365, 288, 365); c.lineTo(0, 365); c.closePath(); c.fillStyle = '#b4a89a'; c.fill(); c.strokeStyle = INK; c.stroke();
      c.beginPath(); c.moveTo(960, 207); c.bezierCurveTo(860, 207, 864, 365, 675, 365); c.lineTo(960, 365); c.closePath(); c.fill(); c.stroke();
      line(c, [[340, 339], [340, 314], [620, 314], [620, 339]], '#575d69', 6);
      pennant(c, 476, 225, '#a16051', 'WFC'); table(c, '#9f8173');
    },
    'pirate-ship-deck'(c, t) {
      sky(c, '#8ca4b1', '#d9cbb4', '#907251'); rect(c, 0, 258, 960, 120, '#617e91'); water(c, 280, t, '#a4bbc0');
      rect(c, 751, 0, 22, 363, '#6e5244', INK);
      poly(c, [[748, 39], [748, 245], [542, 228], [590, 151], [562, 55]], '#e6d8b7', INK);
      line(c, [[563, 55], [749, 244], [900, 348]], '#b5a783', 3);
      for (let x = 0; x < 960; x += 68) rect(c, x, 302, 10, 78, '#6f544b', INK);
      rect(c, 0, 297, 960, 14, '#9d7a54', INK); floor(c, '#9a7853', '#6e5747');
      oval(c, 108, 318, 40, 41, '#927053', INK); line(c, [[69, 299], [147, 299]], '#424752', 8);
      line(c, [[68, 334], [148, 334]], '#424752', 8); table(c, '#ad875b');
    },
    'aquarium-tunnel'(c, t) {
      sky(c, '#294f64', '#72a8a4', '#637d81');
      for (let i = 0; i < 12; i++) {
        const x = ((i * 101 + t * (8 + i % 3)) % 1160) - 100, y = 80 + i % 5 * 45;
        const color = ['#b7b49b', '#8babae', '#cfb78e'][i % 3];
        oval(c, x, y, 17 + i % 3 * 5, 7, color); poly(c, [[x - 14, y], [x - 28, y - 10], [x - 28, y + 10]], color);
      }
      for (let i = 0; i < 4; i++) {
        c.beginPath(); c.ellipse(480, 365, 448 - i * 60, 335 - i * 43, 0, Math.PI, Math.PI * 2);
        c.strokeStyle = i ? '#9eb8b4' : '#384f5d'; c.lineWidth = i ? 9 : 19; c.stroke();
      }
      floor(c, '#8d9fa0', '#627c84');
      for (const x of [50, 910]) line(c, [[x, 355], [x + (480 - x) * .37, 295]], '#c5cac0', 7);
      table(c, '#779b9a', '#c7d4b6');
    },
    'rainforest-treehouse'(c, t) {
      sky(c, '#4c7065', '#a6b494', '#665e49');
      for (let i = 0; i < 8; i++) {
        const x = i * 145 - 25; rect(c, x, 0, 44, 390, i % 2 ? '#425c50' : '#60765b');
        cloud(c, x + 30, 70 + i % 3 * 40, 1.4, '#47705a');
      }
      rect(c, 70, 0, 50, 425, '#71604b', INK); rect(c, 830, 0, 50, 425, '#71604b', INK);
      for (let i = 0; i < 11; i++) line(c, [[110 + i * 72, 314], [110 + i * 72, 375]], '#ac9970', 5);
      line(c, [[90, 308], [870, 308]], '#c7b48b', 7); floor(c, '#99805b', '#655941');
      for (const x of [183, 720]) {
        c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 15, 80, x - 25 + Math.sin(t * .3) * 4, 120, x + 6, 206);
        c.strokeStyle = '#72845c'; c.lineWidth = 5; c.stroke();
      }
      table(c, '#b29466');
    },
    'movie-soundstage'(c) {
      sky(c, '#373942', '#696a70', '#53555d');
      rect(c, 246, 75, 470, 266, '#789294', INK); skyline(c, '#667e80');
      rect(c, 0, 0, 155, 357, '#46404b'); rect(c, 805, 0, 155, 357, '#46404b');
      for (let x = 165; x < 800; x += 95) line(c, [[x, 30], [x + 47, 61], [x + 95, 30]], '#92928a', 3);
      for (const x of [168, 793]) {
        line(c, [[x, 128], [x, 372], [x - 33, 400], [x, 372], [x + 33, 400]], '#b4b0a1', 4);
        rect(c, x - 29, 102, 58, 39, '#d5c6a4', INK);
        poly(c, [[x - 29, 102], [x - 44, 83], [x + 43, 83], [x + 29, 102]], '#42424c', INK);
      }
      poster(c, 351, 200, 256, 'PRESSURE SIGNAL', 'STAGE B / TAKE 09');
      person(c, 866, 333, '#849789', true); table(c, '#a68460');
    },
    'haunted-hall'(c, t) {
      sky(c, '#4b4855', '#827780', '#625662');
      for (const x of [77, 736]) {
        rect(c, x, 62, 145, 194, '#403f53', '#b59876');
        oval(c, x + 72, 121, 27, 33, '#999087'); poly(c, [[x + 37, 211], [x + 45, 152], [x + 95, 151], [x + 109, 211]], '#657678');
        text(c, 'FORMER CHAMPION', x + 72, 242, 9, '#d5c6af');
      }
      rect(c, 355, 84, 250, 263, '#4f505d', INK);
      c.beginPath(); c.arc(480, 183, 82, Math.PI, 0); c.strokeStyle = '#bba58b'; c.lineWidth = 9; c.stroke();
      line(c, [[398, 183], [398, 337], [562, 337], [562, 183]], '#bba58b', 9);
      for (const x of [283, 677]) { rect(c, x - 4, 195, 8, 50, '#decbb0'); oval(c, x, 185 + Math.sin(t * 2) * 2, 5, 10, '#dfc484'); }
      floor(c, '#776774', '#544952'); table(c, '#856453');
    },
    'ice-cave'(c, t) {
      sky(c, '#597e96', '#b7d2d4', '#9fb8c2');
      for (let i = 0; i < 11; i++) {
        const x = i * 94 - 10, length = 70 + (i * 53) % 180;
        poly(c, [[x, 0], [x + 89, 0], [x + 50, length]], i % 2 ? '#a7c6d0' : '#7ca5bb', INK);
        line(c, [[x + 51, 6], [x + 49, length - 20]], '#d9e7df', 2);
      }
      poly(c, [[0, 190], [103, 275], [155, 390], [0, 439]], '#739cae', INK);
      poly(c, [[960, 170], [829, 286], [801, 407], [960, 445]], '#769fb4', INK);
      for (let i = 0; i < 5; i++) oval(c, 238 + i * 121, 115 + ((t * 9 + i * 51) % 234), 2, 3, '#d6e8e5');
      table(c, '#9db9c3', '#e4eeee');
    },
    'moon-deck'(c, t) {
      sky(c, '#222b3e', '#4b5669', '#97999a'); stars(c, t);
      oval(c, 710, 135, 60, 60, '#83a3b0');
      poly(c, [[685, 86], [720, 100], [698, 123], [726, 149], [702, 171], [674, 129]], '#9cac83');
      mountains(c, '#707b89', 373, [[0, 332], [170, 285], [347, 331], [609, 309], [812, 331], [960, 268]]);
      for (let i = 0; i < 7; i++) oval(c, i * 160 + 17, 352 + i % 2 * 32, 43, 10, '#7b858d', '#adb0ac');
      rect(c, 100, 196, 6, 149, '#bec6c0'); poly(c, [[106, 199], [190, 199], [190, 244], [106, 244]], '#b78c67', INK);
      text(c, 'WFC', 147, 229, 15, '#f6e9ce'); table(c, '#a6afac');
    },
    'neon-grid'(c, t) {
      sky(c, '#272f3c', '#49576c', '#354555');
      c.globalAlpha = .4;
      for (let i = -7; i <= 7; i++) line(c, [[480, 240], [480 + i * 190, 540]], '#71b6b0', 1);
      for (let y = 252; y < 540; y += (y - 205) * .23) line(c, [[0, y], [960, y]], '#71b6b0', 1);
      c.globalAlpha = 1;
      for (const x of [240, 365, 595, 720]) {
        const h = Math.abs(x - 480) * .8;
        line(c, [[x, 315], [x, h - 60], [960 - x, h - 60], [960 - x, 315]], '#a58dba', 3);
      }
      text(c, 'WFC / NIGHT CIRCUIT', 480, 190, 18, '#a7c6c0');
      oval(c, 480 + Math.sin(t * .35) * 12, 249, 5, 5, '#dcc38e'); table(c, '#53647a', '#94c0b4');
    },
    volcano(c, t) {
      sky(c, '#675762', '#bb826f', '#655457');
      cloud(c, 494 + Math.sin(t * .1) * 12, 108, 1.6, '#867079');
      mountains(c, '#735360', 386, [[0, 345], [293, 311], [422, 172], [548, 172], [700, 329], [960, 302]]);
      poly(c, [[438, 180], [474, 196], [483, 247], [523, 284], [507, 332], [573, 382], [607, 382], [530, 324], [547, 277], [501, 232], [510, 181]], '#c48559');
      line(c, [[475, 185], [489, 238], [533, 279], [521, 328], [590, 379]], '#e6b774', 5);
      for (const x of [79, 892]) { rect(c, x, 295, 8, 106, '#9f9b91'); line(c, [[x, 323], [480 + (x - 480) * .7, 341]], '#d0b393', 4); }
      table(c, '#85706a', '#c4a27c');
    },
    'storm-table'(c, t) {
      sky(c, '#414f63', '#89969d', '#596f76');
      for (let i = 0; i < 6; i++) cloud(c, i * 205 - 45, 90 + i % 2 * 37, 1.6, i % 2 ? '#526176' : '#69768a');
      rect(c, 0, 284, 960, 88, '#617f87'); water(c, 293, t * 2, '#9bb8b8');
      for (let i = 0; i < 30; i++) {
        const x = (i * 137 - t * 24 % 137 + 1097) % 1097 - 70, y = (i * 47 + t * 42) % 370;
        line(c, [[x, y], [x - 5, y + 13]], '#a6bec277', 1);
      }
      rect(c, 0, 359, 960, 14, '#8b8882', INK);
      for (let x = 40; x < 960; x += 110) { rect(c, x, 310, 7, 63, '#b8b3a3'); }
      line(c, [[0, 317], [960, 317]], '#b8b3a3', 4); table(c, '#7b8b8b');
    },
    'mars-outpost'(c, t) {
      sky(c, '#a77970', '#d4a783', '#ac7960');
      oval(c, 730, 108, 22, 22, '#cfb5a0');
      mountains(c, '#a27568', 365, [[0, 284], [159, 274], [159, 240], [298, 243], [298, 313], [579, 324], [711, 267], [835, 268], [960, 308]]);
      oval(c, 245, 322, 116, 73, '#b6b4a5', INK); rect(c, 128, 321, 233, 33, '#9da49d', INK);
      for (let i = 0; i < 4; i++) rect(c, 170 + i * 41, 293, 25, 21, '#567c87', INK);
      line(c, [[790, 364], [790, 215]], '#786c65', 7);
      c.save(); c.translate(790, 215); c.rotate(-.2 + Math.sin(t * .15) * .04);
      c.beginPath(); c.arc(0, 0, 51, 0, Math.PI); c.fillStyle = '#d0baa0'; c.fill(); c.strokeStyle = INK; c.stroke();
      line(c, [[0, 0], [0, -31]], '#d0baa0', 4); c.restore(); table(c, '#a98c70');
    },
    'stadium-night'(c, t) {
      sky(c, '#29364b', '#657385', '#6a8273'); stars(c, t);
      for (let row = 0; row < 4; row++) {
        rect(c, 0, 211 + row * 32, 960, 30, row % 2 ? '#586773' : '#647280');
        for (let i = 0; i < 42; i++) oval(c, 10 + i * 23, 225 + row * 32, 5, 6, ['#b8a98d', '#98afb1', '#9f7f72'][(i + row) % 3]);
      }
      for (const x of [86, 874]) {
        line(c, [[x, 289], [x, 64]], '#8d9da1', 7); rect(c, x - 58, 59, 116, 39, '#636c76', INK);
        for (let i = 0; i < 6; i++) rect(c, x - 49 + i * 17, 68, 12, 21, '#ede2bc');
      }
      poster(c, 369, 104, 222, 'WFC / FINAL', 'TEN LIVES. TRY NOT TO YEET IT.');
      person(c, 89, 359, '#c6b694', true); person(c, 868, 359, '#899c96'); table(c, '#ab8a64');
    },
    'space-station'(c, t) {
      sky(c, '#243248', '#536477', '#879593'); stars(c, t);
      oval(c, 590, 291, 248, 201, '#698f9b');
      poly(c, [[448, 135], [531, 117], [568, 179], [523, 234], [588, 263], [568, 328], [481, 283], [450, 211]], '#a0b091');
      for (const x of [0, 315, 630, 945]) poly(c, [[x, 0], [x + 25, 0], [x + 40, 382], [x - 19, 382]], '#bbc1b6', INK);
      rect(c, 0, 0, 960, 42, '#a4afa9', INK); rect(c, 0, 335, 960, 46, '#a4afa9', INK);
      for (const x of [103, 771]) { rect(c, x, 329, 87, 36, '#596f7b', INK); for (let i = 0; i < 4; i++) rect(c, x + 10 + i * 18, 339, 10, 6, '#bad2ac'); }
      floor(c, '#8d9e9e', '#617982'); table(c, '#a9b8b2');
    },
    'aurora-stage'(c, t) {
      sky(c, '#2c3d50', '#718c8c', '#9daea8'); stars(c, t);
      for (let k = 0; k < 5; k++) {
        c.beginPath(); c.moveTo(-40, 58 + k * 21);
        c.bezierCurveTo(230, 248 + Math.sin(t * .3 + k) * 12, 524, -81 + k * 21, 1000, 111 + k * 32);
        c.strokeStyle = ['#84b99c40', '#91c5a245', '#b8cfb050', '#9aacbe45', '#8ab5b740'][k]; c.lineWidth = 30; c.stroke();
      }
      mountains(c, '#6d8289', 368, [[0, 318], [137, 237], [305, 342], [446, 272], [655, 334], [802, 251], [960, 310]]);
      for (let i = 0; i < 7; i++) tree(c, i * 167 - 24, 378, .55 + i % 2 * .25, '#425e5d');
      line(c, [[99, 369], [99, 173], [860, 173], [860, 369]], '#998e7e', 5);
      for (let i = 0; i < 15; i++) { line(c, [[116 + i * 51, 173], [116 + i * 51, 185 + i % 2 * 8]], '#998e7e', 2); oval(c, 116 + i * 51, 189 + i % 2 * 8, 4, 6, '#e2d0a1'); }
      table(c, '#9eaca3', '#e1dfc4');
    },
  };
  function draw(ctx, options) {
    const o = options || {}, width = o.width, height = o.height;
    if (!ctx || typeof ctx.save !== 'function') throw new TypeError('A Canvas 2D context is required.');
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
    const id = canonical(o.arenaId);
    const time = o.reducedMotion || !Number.isFinite(o.timeMs) ? 0 : Math.max(0, o.timeMs) / 1000;
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
      // Contain the whole authored scene. Wider/taller previews use the same
      // quiet border color instead of cropping table legs or important scenery.
      rect(ctx, 0, 0, width, height, INK);
      const scale = Math.min(width / 960, height / 540);
      ctx.translate((width - 960 * scale) / 2, (height - 540 * scale) / 2);
      ctx.scale(scale, scale); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      scenes[id](ctx, time);
    } finally { ctx.restore(); }
    return id;
  }
  return Object.freeze({ schema: 'ArenaPreviewV1', version: 1, visualOnly: true,
    draw: draw, label: id => byId[canonical(id)].displayName, list: () => catalog });
});
