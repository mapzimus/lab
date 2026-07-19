/*
 * Black Sam & the Whydah — SVG scene art
 *
 * window.ART maps art keys to builder functions returning inline SVG strings.
 * Everything is hand-drawn vector: no external assets, so the game stays
 * fully self-contained for GitHub Pages. Scenes reference art by key via
 * `art: "whydah"` etc. Palette matches css/style.css.
 */
(function () {
  "use strict";

  // Shared palette
  var C = {
    sky1: "#16394a", sky2: "#0e2a38", skyStorm: "#0b1720",
    sea1: "#1d4a5c", sea2: "#12303e", foam: "#7fb0b3",
    hull: "#241a10", hullLight: "#3a2c1a", sail: "#e9dcc0", sailDim: "#c9b78f",
    gold: "#d8a24a", goldBright: "#f0c463", blood: "#7d2a1e",
    moon: "#e8e2cc", land: "#2c3a26", landLight: "#4a5a38",
    ink: "#0a1a24", lantern: "#f0c463"
  };

  // svg wrapper: fixed viewBox, responsive width, decorative role.
  function svg(inner, opts) {
    opts = opts || {};
    var vb = opts.viewBox || "0 0 640 240";
    var cls = opts.cls ? ' class="' + opts.cls + '"' : "";
    return '<svg viewBox="' + vb + '" role="img" aria-label="' + (opts.label || "Scene illustration") + '"' +
      cls + ' preserveAspectRatio="xMidYMid slice">' + inner + "</svg>";
  }

  function skyGrad(id, top, bottom) {
    return '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/>' +
      "</linearGradient></defs>";
  }

  // A layered sea with three drifting wave bands (CSS animates .art-wave).
  function sea(y, height) {
    var s = "";
    s += '<rect x="0" y="' + y + '" width="640" height="' + height + '" fill="' + C.sea2 + '"/>';
    for (var i = 0; i < 3; i++) {
      var yy = y + 8 + i * 16;
      s += '<path class="art-wave art-wave-' + i + '" fill="none" stroke="' + C.foam + '" stroke-opacity="' +
        (0.35 - i * 0.09) + '" stroke-width="2" d="M-80 ' + yy +
        ' q 40 -10 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0 t 80 0"/>';
    }
    return s;
  }

  function stars(n, maxY) {
    var s = "", x, y, r;
    // deterministic pseudo-random scatter
    for (var i = 0; i < n; i++) {
      x = (i * 137.5) % 640;
      y = (i * 73.3) % maxY;
      r = 0.6 + (i % 3) * 0.4;
      s += '<circle class="art-star" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r +
        '" fill="' + C.moon + '" opacity="' + (0.3 + (i % 5) * 0.12) + '"/>';
    }
    return s;
  }

  // A square-rigged ship silhouette. scale/x/y position it; cls for animation.
  //
  // IMPORTANT: placement lives on the OUTER group's `transform` attribute,
  // while the animation class rides an INNER group. In SVG a CSS `transform`
  // (from an @keyframes rule) overrides the `transform` *attribute* on the
  // same element — so if the animation class and the placement transform
  // shared one element, every animating ship would snap to the origin at
  // scale 1. Nesting keeps placement and motion independent, and lets the
  // inner group roll around the ship's own waterline (its local 0,0).
  function ship(x, y, scale, opts) {
    opts = opts || {};
    var hull = opts.hull || C.hull;
    var sail = opts.sail || C.sail;
    var flag = opts.flag; // e.g. black pirate flag
    var g = '<g transform="translate(' + x + ',' + y + ') scale(' + scale + ')">' +
      '<g class="' + (opts.cls || "art-ship") + '">';
    // hull
    g += '<path d="M-60 0 L60 0 L48 18 Q0 30 -48 18 Z" fill="' + hull + '"/>';
    g += '<path d="M-60 0 L60 0 L57 6 L-57 6 Z" fill="' + C.hullLight + '"/>';
    // optional row of gunports along the wale — drawn inside the animated
    // group so the ports ride the hull as it rolls.
    if (opts.gunports) {
      g += '<g fill="' + C.ink + '">';
      for (var px = -46; px <= 44; px += 18) {
        g += '<rect x="' + px + '" y="1.4" width="6.5" height="4.4" rx="0.9"/>';
      }
      g += "</g>";
    }
    // optional stern lamp on a little post; its glow rolls with the ship.
    if (opts.lantern) {
      g += '<rect x="-57" y="-8" width="3" height="9" fill="' + hull + '"/>' +
        '<circle cx="-55.5" cy="-11" r="7" fill="' + C.lantern + '" opacity="0.18"/>' +
        '<circle class="art-lantern" cx="-55.5" cy="-11" r="2.6" fill="' + C.lantern + '"/>';
    }
    // masts
    g += '<rect x="-26" y="-58" width="3" height="58" fill="' + hull + '"/>';
    g += '<rect x="8" y="-70" width="3" height="70" fill="' + hull + '"/>';
    g += '<rect x="38" y="-44" width="2.5" height="44" fill="' + hull + '"/>';
    // sails
    g += '<path d="M-25 -54 q -20 14 0 30 l 0 0 q 14 -15 0 -30 Z" fill="' + sail + '"/>';
    g += '<path d="M9 -66 q -24 16 0 36 q 17 -18 0 -36 Z" fill="' + sail + '"/>';
    g += '<path d="M9 -28 q -18 11 0 24 q 12 -12 0 -24 Z" fill="' + C.sailDim + '"/>';
    g += '<path d="M39 -40 q -14 10 0 22 q 10 -11 0 -22 Z" fill="' + C.sailDim + '"/>';
    // bowsprit
    g += '<path d="M58 -2 L82 -14" stroke="' + hull + '" stroke-width="3" fill="none"/>';
    if (flag) {
      // The black flag flutters on its own (inner group is placement-safe too).
      g += '<g class="art-flag"><path d="M10 -70 l 22 4 l -22 5 Z" fill="' + C.ink + '"/>' +
        '<circle cx="18" cy="-66.5" r="1.6" fill="' + C.sail + '"/>' +
        '<path d="M15.5 -64 l 5 2.4 M20.5 -64 l -5 2.4" stroke="' + C.sail + '" stroke-width="0.9"/></g>';
    }
    g += "</g></g>";
    return g;
  }

  function moon(x, y, r) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + C.moon + '" opacity="0.9"/>' +
      '<circle cx="' + (x + r * 0.4) + '" cy="' + (y - r * 0.2) + '" r="' + r * 0.85 + '" fill="url(#g_sky)" opacity="0.85"/>';
  }

  // The seagull. Always nearby. Never impressed. Placement on the outer
  // group; the inner group carries the glide animation (nested pattern).
  function gull(x, y, scale, opts) {
    opts = opts || {};
    var stroke = opts.stroke || C.sail;
    var cls = opts.slow ? "art-gull art-gull-slow" : "art-gull";
    return '<g transform="translate(' + x + ',' + y + ') scale(' + scale + ')">' +
      '<g class="' + cls + '">' +
      '<path d="M-16 2 Q -8 -8 0 0 Q 8 -8 16 2" fill="none" stroke="' + stroke +
      '" stroke-width="2.6" stroke-linecap="round"/>' +
      "</g></g>";
  }

  // A soft drifting cloud. Placement on the outer group; the inner group
  // carries the slow drift animation (same nested pattern as ship()).
  function cloud(x, y, scale, opts) {
    opts = opts || {};
    var fill = opts.fill || "#5a6b74";
    var op = opts.opacity != null ? opts.opacity : 0.5;
    var cls = opts.slow ? "art-cloud art-cloud-slow" : "art-cloud";
    return '<g transform="translate(' + x + ',' + y + ') scale(' + scale + ')">' +
      '<g class="' + cls + '" opacity="' + op + '">' +
      '<ellipse cx="0" cy="0" rx="34" ry="13" fill="' + fill + '"/>' +
      '<ellipse cx="-22" cy="4" rx="20" ry="10" fill="' + fill + '"/>' +
      '<ellipse cx="24" cy="5" rx="22" ry="10" fill="' + fill + '"/>' +
      '<ellipse cx="4" cy="-8" rx="18" ry="11" fill="' + fill + '"/>' +
      '</g></g>';
  }

  window.ART = {

    // Cape Cod shore at dusk — arrival
    shore: function () {
      return svg(
        skyGrad("g_sky", C.sky1, C.sky2) +
        '<rect width="640" height="170" fill="url(#g_sky)"/>' +
        stars(26, 120) +
        moon(520, 52, 26) +
        cloud(150, 44, 1, { fill: "#3a4c56", opacity: 0.45 }) +
        gull(300, 92, 1.1) +
        cloud(400, 30, 0.7, { fill: "#33454e", opacity: 0.4, slow: true }) +
        gull(360, 78, 0.7, { slow: true }) +
        sea(150, 90) +
        // moonlight shivering on the water
        '<g stroke="' + C.moon + '" stroke-width="2" opacity="0.3" stroke-linecap="round"><path d="M506 158 h 26 M513 166 h 15 M509 173 h 21"/></g>' +
        // dunes
        '<path d="M0 190 Q 120 150 260 186 T 640 178 L 640 240 L 0 240 Z" fill="' + C.land + '"/>' +
        '<path d="M0 208 Q 180 176 400 208 T 640 200 L 640 240 L 0 240 Z" fill="' + C.landLight + '" opacity="0.5"/>' +
        // beach grass nodding on the dune crests
        '<g stroke="#5a6b3a" stroke-width="2" fill="none" stroke-linecap="round">' +
        '<path d="M120 174 q -2 -10 -7 -13 M124 174 q 0 -11 4 -15 M129 175 q 4 -8 9 -10"/>' +
        '<path d="M528 182 q -2 -9 -6 -12 M532 182 q 1 -10 5 -13"/></g>' +
        // beached rowboat
        '<g transform="translate(150,196) rotate(-4)"><path d="M-30 0 Q 0 14 30 0 L 24 8 Q 0 18 -24 8 Z" fill="' + C.hull + '"/></g>' +
        // a small sideways local pauses to inspect the new arrivals
        '<g transform="translate(205,224)"><ellipse rx="5" ry="3.2" fill="' + C.blood + '"/>' +
        '<path d="M-4 -2 q -3 -4 -7 -4 M4 -2 q 3 -4 7 -4 M-5 2 l -4 3 M-2 3 l -2 4 M2 3 l 2 4 M5 2 l 4 3" stroke="' + C.blood + '" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        '<circle cx="-1.6" cy="-2.4" r="0.7" fill="' + C.ink + '"/><circle cx="1.6" cy="-2.4" r="0.7" fill="' + C.ink + '"/></g>' +
        ship(430, 150, 0.7, { cls: "art-ship art-bob", lantern: true }),
        { label: "A sailing ship off a dune-lined shore at dusk" }
      );
    },

    // The orchard — Maria
    orchard: function () {
      var blossoms = "";
      for (var i = 0; i < 18; i++) {
        var bx = 90 + (i * 61.7) % 460, by = 60 + (i * 37.3) % 90;
        blossoms += '<circle class="art-star" cx="' + bx.toFixed(0) + '" cy="' + by.toFixed(0) +
          '" r="' + (2 + (i % 3)) + '" fill="#e8cfd8" opacity="0.85"/>';
      }
      return svg(
        skyGrad("g_sky", "#243d3d", C.sky2) +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' +
        stars(18, 90) + moon(560, 44, 22) +
        '<path d="M0 200 Q 200 170 420 198 T 640 192 L 640 240 L 0 240 Z" fill="' + C.land + '"/>' +
        // apple tree
        '<g transform="translate(300,196)">' +
        '<path d="M0 0 C -6 -40 -28 -52 -20 -86 M0 0 C 4 -44 30 -50 22 -90 M0 0 L 0 -60" stroke="' + C.hullLight + '" stroke-width="9" fill="none" stroke-linecap="round"/>' +
        '<ellipse cx="-24" cy="-96" rx="44" ry="30" fill="#33502f"/>' +
        '<ellipse cx="26" cy="-102" rx="50" ry="34" fill="#3d5c36"/>' +
        '<ellipse cx="0" cy="-120" rx="40" ry="26" fill="#48693e"/>' +
        // ripe apples hiding in the canopy
        '<g fill="' + C.blood + '"><circle cx="-38" cy="-88" r="3.4"/><circle cx="-10" cy="-104" r="3.2"/><circle cx="20" cy="-90" r="3.4"/><circle cx="40" cy="-110" r="3"/><circle cx="4" cy="-126" r="3"/></g>' +
        "</g>" + blossoms +
        // windfalls in the grass
        '<g fill="' + C.blood + '"><circle cx="268" cy="200" r="3"/><circle cx="322" cy="204" r="3"/><circle cx="296" cy="207" r="2.6"/></g>' +
        // fireflies drifting over the meadow
        '<g fill="' + C.goldBright + '"><circle class="art-star" cx="112" cy="174" r="1.6"/><circle class="art-star" cx="164" cy="182" r="1.4"/><circle class="art-star" cx="210" cy="168" r="1.5"/><circle class="art-star" cx="490" cy="178" r="1.5"/><circle class="art-star" cx="540" cy="166" r="1.3"/></g>' +
        // a basket already half full
        '<g transform="translate(452,198)"><path d="M-9 0 L 9 0 L 12 -13 L -12 -13 Z" fill="#4a3a22"/><path d="M-12 -13 q 12 -9 24 0" stroke="#6b5533" stroke-width="2" fill="none"/><circle cx="-4" cy="-14" r="2.6" fill="' + C.blood + '"/><circle cx="3" cy="-15" r="2.6" fill="' + C.blood + '"/></g>' +
        // two figures
        '<g transform="translate(392,196)"><path d="M0 0 L0 -26 M0 -26 q -6 -4 0 -12 q 7 8 0 12 M-7 -14 L 7 -14" stroke="' + C.ink + '" stroke-width="4.6" fill="none" stroke-linecap="round"/></g>' +
        '<g transform="translate(420,198)"><path d="M0 0 L0 -24 M0 -24 q -5 -4 0 -11 q 6 7 0 11 M0 -20 q -9 8 -5 20 M0 -20 q 9 8 5 20" stroke="#5a3a44" stroke-width="4.2" fill="none" stroke-linecap="round"/></g>',
        { label: "Two figures beneath an apple tree under the stars" }
      );
    },

    // Tavern at Great Island
    tavern: function () {
      return svg(
        skyGrad("g_sky", C.sky2, C.ink) +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' + stars(22, 130) +
        '<path d="M0 210 L 640 210 L 640 240 L 0 240 Z" fill="' + C.land + '"/>' +
        // tavern building
        '<g transform="translate(220,90)">' +
        '<rect x="0" y="40" width="200" height="80" fill="#2a2018"/>' +
        '<path d="M-14 44 L 100 -8 L 214 44 Z" fill="#1c140c"/>' +
        // chimney (so the smoke has somewhere to come from)
        '<rect x="34" y="-16" width="15" height="40" fill="#1c140c"/><rect x="31" y="-20" width="21" height="6" rx="2" fill="#140e08"/>' +
        '<rect class="art-lantern" x="24" y="66" width="26" height="32" fill="' + C.lantern + '" opacity="0.9"/>' +
        '<rect class="art-lantern" x="150" y="66" width="26" height="32" fill="' + C.lantern + '" opacity="0.75"/>' +
        '<rect x="86" y="72" width="30" height="48" fill="#140e08"/>' +
        // hanging sign
        '<g class="art-swing"><path d="M188 52 l 22 0" stroke="#140e08" stroke-width="3"/><rect x="192" y="54" width="16" height="18" rx="2" fill="' + C.gold + '"/><circle cx="200" cy="63" r="5" fill="' + C.blood + '"/></g>' +
        "</g>" +
        // lamplight pooling on the ground below the windows
        '<g fill="' + C.lantern + '" opacity="0.14"><path d="M244 210 L 270 210 L 282 228 L 232 228 Z"/><path d="M370 210 L 396 210 L 408 228 L 358 228 Z"/></g>' +
        // a rain barrel by the door
        '<g transform="translate(352,210)"><rect x="-11" y="-27" width="22" height="27" rx="3" fill="#3a2c1a"/><path d="M-11 -19 L 11 -19 M -11 -9 L 11 -9" stroke="#241a10" stroke-width="2.5"/></g>' +
        // the tavern cat keeps the night watch from the ridge
        '<g transform="translate(320,83)" fill="' + C.ink + '">' +
        '<ellipse cx="0" cy="-5" rx="5" ry="6"/><circle cx="0" cy="-13" r="3.6"/>' +
        '<path d="M-2.6 -15.5 l -1.4 -3.5 l 3 1.4 Z M2.6 -15.5 l 1.4 -3.5 l -3 1.4 Z"/>' +
        '<path d="M5 -2 q 7 2 6 -7" stroke="' + C.ink + '" stroke-width="2" fill="none" stroke-linecap="round"/></g>' +
        // a fiddle tune drifting out of the doorway
        '<g class="art-smoke" fill="' + C.moon + '" opacity="0.5">' +
        '<g transform="translate(300,150)"><ellipse cx="0" cy="0" rx="2.6" ry="2" transform="rotate(-20)"/><path d="M2.4 -0.8 l 0 -10 l 5 -1.6" stroke="' + C.moon + '" stroke-width="1.4" fill="none"/></g>' +
        '<g transform="translate(316,138)"><ellipse cx="0" cy="0" rx="2.2" ry="1.7" transform="rotate(-20)"/><path d="M2 -0.7 l 0 -8" stroke="' + C.moon + '" stroke-width="1.3" fill="none"/></g>' +
        "</g>" +
        // smoke
        '<path class="art-smoke" d="M262 78 q 8 -14 -2 -26 q -10 -12 2 -24" stroke="#6b7b80" stroke-width="5" fill="none" opacity="0.5" stroke-linecap="round"/>',
        { label: "A lamplit tavern under a night sky" }
      );
    },

    // Florida wrecks — treasure coast
    florida: function () {
      return svg(
        skyGrad("g_sky", "#3a5a4d", "#16394a") +
        '<rect width="640" height="150" fill="url(#g_sky)"/>' +
        '<circle cx="90" cy="46" r="30" fill="' + C.goldBright + '" opacity="0.85"/>' +
        cloud(300, 40, 1, { fill: "#d8c8a2", opacity: 0.5 }) +
        gull(210, 78, 1) + gull(250, 64, 0.7, { slow: true }) +
        cloud(520, 62, 0.7, { fill: "#cbb894", opacity: 0.45, slow: true }) +
        sea(130, 110) +
        // broken mast in the surf
        '<g transform="translate(410,160) rotate(24)"><rect x="-4" y="-70" width="8" height="88" fill="' + C.hull + '"/><path d="M-2 -60 q -26 16 -4 38" fill="' + C.sailDim + '" opacity="0.8"/></g>' +
        '<g transform="translate(300,178) rotate(-12)"><path d="M-44 0 L44 0 L34 14 Q 0 24 -34 14 Z" fill="' + C.hull + '" opacity="0.9"/></g>' +
        // beach
        '<path d="M0 196 Q 160 168 340 200 T 640 194 L 640 240 L 0 240 Z" fill="#c9b78f"/>' +
        '<path d="M0 214 Q 200 192 640 214 L 640 240 L 0 240 Z" fill="#b8a377"/>' +
        // scattered coins
        '<g fill="' + C.gold + '"><circle cx="180" cy="212" r="4"/><circle cx="196" cy="220" r="3"/><circle cx="168" cy="222" r="3"/><circle cx="480" cy="216" r="4"/><circle cx="497" cy="222" r="3"/></g>' +
        // palm
        '<g transform="translate(70,206)"><path d="M0 0 C 6 -28 2 -48 -6 -66" stroke="#4a3a22" stroke-width="7" fill="none"/><g fill="#3d5c36"><path d="M-6 -66 q -30 -8 -44 8 q 26 6 44 -2 Z"/><path d="M-6 -66 q 28 -12 44 2 q -24 10 -44 4 Z"/><path d="M-6 -66 q -6 -26 -26 -32 q 4 22 20 30 Z"/><path d="M-6 -66 q 10 -24 30 -28 q -6 22 -24 28 Z"/></g></g>',
        { label: "Wreckage and scattered coins on a bright Florida beach" }
      );
    },

    // Nassau pirate republic
    nassau: function () {
      return svg(
        skyGrad("g_sky", "#5a4326", "#16394a") +
        '<rect width="640" height="160" fill="url(#g_sky)"/>' +
        '<circle cx="540" cy="60" r="34" fill="' + C.goldBright + '" opacity="0.9"/>' +
        cloud(200, 46, 1, { fill: "#6a5a3e", opacity: 0.4 }) +
        gull(480, 96, 1) +
        cloud(430, 34, 0.7, { fill: "#5a4a30", opacity: 0.38, slow: true }) +
        sea(140, 100) +
        // late sun rippling on the harbour
        '<g stroke="' + C.goldBright + '" stroke-width="2" opacity="0.35" stroke-linecap="round"><path d="M524 150 h 32 M531 160 h 19 M527 170 h 25"/></g>' +
        ship(120, 138, 0.55, { flag: true, cls: "art-ship art-bob" }) +
        ship(320, 132, 0.42, { flag: true, cls: "art-ship art-bob-slow" }) +
        // shanty town on the strand
        '<path d="M0 196 Q 200 176 640 196 L 640 240 L 0 240 Z" fill="#c9b78f"/>' +
        // driftwood fire, with company
        '<g transform="translate(250,212)">' +
        '<path d="M-12 0 L 12 -4 M -10 -4 L 10 2" stroke="#4a3a22" stroke-width="4" stroke-linecap="round"/>' +
        '<circle class="art-lantern" cx="0" cy="-8" r="14" fill="' + C.lantern + '" opacity="0.2"/>' +
        '<path class="art-lantern" d="M0 -22 q 8 10 5 16 q -5 8 -10 0 q -3 -6 5 -16 Z" fill="' + C.goldBright + '"/>' +
        '<path class="art-smoke" d="M2 -24 q 6 -10 -2 -20" stroke="#6b7b80" stroke-width="3" fill="none" opacity="0.4" stroke-linecap="round"/>' +
        "</g>" +
        '<g fill="' + C.ink + '"><circle cx="222" cy="200" r="6"/><path d="M214 218 q 2 -14 8 -14 q 8 0 10 14 Z"/><circle cx="282" cy="202" r="6"/><path d="M272 219 q 3 -13 10 -13 q 7 1 8 13 Z"/></g>' +
        // plunder stacked above the tide line
        '<g transform="translate(398,214)"><rect x="0" y="-16" width="18" height="16" fill="#4a3a22"/><path d="M0 -16 L 18 0 M 18 -16 L 0 0" stroke="#33261a" stroke-width="1.6"/><rect x="20" y="-12" width="13" height="12" fill="#3a2c1a"/></g>' +
        // a leaning palm at the strand end
        '<g transform="translate(602,208)"><path d="M0 0 C 5 -24 2 -40 -5 -56" stroke="#4a3a22" stroke-width="6" fill="none"/>' +
        '<g fill="#3d5c36"><path d="M-5 -56 q -26 -7 -38 7 q 22 5 38 -1 Z"/><path d="M-5 -56 q 24 -10 38 2 q -20 8 -38 4 Z"/><path d="M-5 -56 q -5 -22 -22 -28 q 3 19 17 26 Z"/><path d="M-5 -56 q 9 -20 26 -24 q -5 19 -21 24 Z"/></g></g>' +
        '<g transform="translate(430,168)">' +
        '<rect x="0" y="12" width="52" height="26" fill="#3a2c1a"/><path d="M-6 12 L 26 -6 L 58 12 Z" fill="#2a2018"/>' +
        '<rect x="70" y="18" width="44" height="20" fill="#4a3a22"/><path d="M66 18 L 92 4 L 118 18 Z" fill="#33261a"/>' +
        '<rect class="art-lantern" x="14" y="20" width="10" height="12" fill="' + C.lantern + '"/>' +
        "</g>" +
        // black flag on a pole
        '<g transform="translate(90,206)"><rect x="-2" y="-58" width="4" height="58" fill="' + C.hull + '"/><path class="art-swing" d="M2 -58 l 40 6 l -40 8 Z" fill="' + C.ink + '"/><circle cx="16" cy="-51" r="2.6" fill="' + C.sail + '"/></g>',
        { label: "Pirate ships anchored off a shanty-lined Nassau beach" }
      );
    },

    // Sea chase / raiding
    chase: function () {
      return svg(
        skyGrad("g_sky", C.sky1, C.sky2) +
        '<rect width="640" height="170" fill="url(#g_sky)"/>' + stars(16, 100) +
        cloud(120, 40, 1, { fill: "#2c3f49", opacity: 0.5 }) +
        gull(260, 80, 1, { slow: true }) +
        cloud(470, 52, 0.8, { fill: "#26383f", opacity: 0.42, slow: true }) +
        sea(150, 90) +
        ship(180, 156, 0.8, { flag: true, cls: "art-ship art-chase" }) +
        ship(470, 146, 0.55, { sail: C.sailDim, cls: "art-ship art-flee" }),
        { label: "A pirate ship chasing a merchant sloop across open sea" }
      );
    },

    // The Whydah herself — grand flagship
    whydah: function () {
      return svg(
        skyGrad("g_sky", "#2c4a56", C.sky2) +
        '<rect width="640" height="170" fill="url(#g_sky)"/>' +
        '<circle cx="100" cy="54" r="26" fill="' + C.moon + '" opacity="0.85"/>' +
        stars(20, 110) +
        gull(210, 66, 0.9, { slow: true }) +
        sea(150, 90) +
        // moonlight scattered on the swell
        '<g stroke="' + C.moon + '" stroke-width="2" opacity="0.25" stroke-linecap="round"><path d="M84 158 h 32 M92 168 h 18 M87 178 h 26"/></g>' +
        // her little consort keeps station off the quarter
        ship(560, 140, 0.32, { sail: C.sailDim, cls: "art-ship art-bob-slow" }) +
        // gunports ride the hull now (drawn inside the bobbing group)
        ship(320, 152, 1.25, { flag: true, gunports: true, lantern: true, cls: "art-ship art-bob" }),
        { label: "The great ship Whydah under a black flag, gunports open" }
      );
    },

    // Cannon battle
    battle: function () {
      return svg(
        skyGrad("g_sky", C.sky2, C.ink) +
        '<rect width="640" height="170" fill="url(#g_sky)"/>' + stars(12, 80) +
        sea(150, 90) +
        // powder haze hanging between the ships
        cloud(320, 118, 1.2, { fill: "#3a4448", opacity: 0.22, slow: true }) +
        ship(160, 158, 0.85, { flag: true, gunports: true }) +
        ship(480, 150, 0.7, { sail: C.sailDim, gunports: true }) +
        // cannon smoke + fire
        '<g class="art-flash"><circle cx="238" cy="146" r="10" fill="' + C.goldBright + '"/><circle cx="252" cy="144" r="6" fill="#fff" opacity="0.8"/></g>' +
        '<path class="art-smoke" d="M245 140 q 20 -12 44 -6" stroke="#8a949a" stroke-width="10" fill="none" opacity="0.55" stroke-linecap="round"/>' +
        '<circle class="art-ball" cx="300" cy="140" r="4" fill="' + C.ink + '" stroke="#555" stroke-width="1"/>' +
        // the merchant answers (mirrored container flies her ball leftward)
        '<g class="art-flash"><circle cx="415" cy="142" r="7" fill="' + C.goldBright + '"/></g>' +
        '<path class="art-smoke" d="M412 137 q -16 -10 -34 -5" stroke="#8a949a" stroke-width="8" fill="none" opacity="0.45" stroke-linecap="round"/>' +
        '<g transform="translate(400,138) scale(-1,1)"><circle class="art-ball" cx="0" cy="0" r="3.4" fill="' + C.ink + '" stroke="#555" stroke-width="1"/></g>' +
        // her shot splashes short
        '<g class="art-flash" fill="none" stroke="' + C.foam + '" stroke-width="2.4" stroke-linecap="round"><path d="M250 170 q -2 -12 -8 -16 M256 171 q 1 -13 -2 -19 M262 170 q 4 -10 9 -13"/></g>',
        { label: "Two ships exchanging cannon fire at dusk" }
      );
    },

    // Boarding action — crossed swords
    boarding: function () {
      return svg(
        skyGrad("g_sky", C.sky2, C.ink) +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' + stars(14, 90) +
        // deck planks
        '<g stroke="#1c140c" stroke-width="2">' +
        '<path d="M0 190 L 640 178" stroke="#241a10" stroke-width="60"/>' +
        '<path d="M0 176 L 640 164"/><path d="M0 200 L 640 188"/><path d="M0 220 L 640 210"/>' +
        "</g>" +
        // crossed cutlasses
        '<g transform="translate(320,110)">' +
        '<g class="art-sword-l"><path d="M-70 44 L 34 -40 q 10 -8 16 -2 q -2 8 -10 12 L -62 52 Z" fill="#aeb6ba"/><rect x="-78" y="42" width="22" height="9" rx="4" transform="rotate(-38 -70 46)" fill="' + C.gold + '"/></g>' +
        '<g class="art-sword-r"><path d="M70 44 L -34 -40 q -10 -8 -16 -2 q 2 8 10 12 L 62 52 Z" fill="#c6ccd0"/><rect x="56" y="42" width="22" height="9" rx="4" transform="rotate(38 70 46)" fill="' + C.gold + '"/></g>' +
        '<g class="art-flash"><path d="M0 2 l 5 -12 l 4 10 l 11 -5 l -7 10 l 12 3 l -13 3 l 6 10 l -11 -6 l -3 11 l -4 -12 l -10 6 l 6 -10 l -12 -3 l 12 -3 l -6 -9 Z" fill="' + C.goldBright + '"/></g>' +
        "</g>",
        { label: "Crossed cutlasses sparking above a ship deck" }
      );
    },

    // Treasure — gold in the hold
    treasure: function () {
      var coins = "";
      for (var i = 0; i < 26; i++) {
        var cx = 240 + (i * 29.7) % 170, cy = 160 - (i % 5) * 7 + (i % 3) * 3;
        coins += '<ellipse cx="' + cx.toFixed(0) + '" cy="' + cy.toFixed(0) + '" rx="7" ry="4" fill="' +
          (i % 3 ? C.gold : C.goldBright) + '" stroke="#8a6420" stroke-width="0.8"/>';
      }
      return svg(
        skyGrad("g_sky", "#241a10", "#140e08") +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' +
        // the hold itself: a deck beam overhead and two stout ribs
        '<rect x="0" y="0" width="640" height="16" fill="#1c140c"/>' +
        '<g fill="#1c140c" opacity="0.8"><path d="M34 16 q -12 112 8 224 l -22 0 q -16 -112 -6 -224 Z"/><path d="M606 16 q 12 112 -8 224 l 22 0 q 16 -112 6 -224 Z"/></g>' +
        // chest
        '<g transform="translate(320,150)">' +
        '<rect x="-92" y="-4" width="184" height="72" rx="6" fill="#3a2c1a" stroke="#241a10" stroke-width="4"/>' +
        '<path d="M-92 -4 q 92 -58 184 0 Z" fill="#4a3a22" stroke="#241a10" stroke-width="4"/>' +
        '<rect x="-10" y="8" width="20" height="26" rx="3" fill="' + C.gold + '"/>' +
        '<g stroke="' + C.gold + '" stroke-width="5"><path d="M-92 14 L 92 14 M -60 -34 L -60 64 M 60 -34 L 60 64"/></g>' +
        // a necklace spilling over the lip
        '<g fill="' + C.goldBright + '"><circle cx="-72" cy="-8" r="1.8"/><circle cx="-76" cy="-1" r="1.8"/><circle cx="-78" cy="7" r="1.8"/><circle cx="-77" cy="15" r="1.8"/><circle cx="-73" cy="22" r="1.8"/><circle cx="-67" cy="27" r="1.8"/><circle cx="-64" cy="33" r="2.6"/></g>' +
        '<path d="M-64 36 l 3.4 3.4 l -3.4 3.4 l -3.4 -3.4 Z" fill="' + C.blood + '"/>' +
        "</g>" + coins +
        // a few stray jewels among the coins
        '<path d="M252 150 l 4.6 4.6 l -4.6 4.6 l -4.6 -4.6 Z" fill="' + C.blood + '"/>' +
        '<path d="M384 144 l 4.6 4.6 l -4.6 4.6 l -4.6 -4.6 Z" fill="#3d5c36"/>' +
        // glints waking on the gold
        '<g fill="' + C.goldBright + '"><path class="art-star" d="M296 128 l 2 5 l 5 2 l -5 2 l -2 5 l -2 -5 l -5 -2 l 5 -2 Z"/><path class="art-star" d="M356 136 l 1.6 4 l 4 1.6 l -4 1.6 l -1.6 4 l -1.6 -4 l -4 -1.6 l 4 -1.6 Z"/><path class="art-star" d="M262 140 l 1.4 3.6 l 3.6 1.4 l -3.6 1.4 l -1.4 3.6 l -1.4 -3.6 l -3.6 -1.4 l 3.6 -1.4 Z"/></g>' +
        // a toppled goblet beside the chest
        '<g transform="translate(450,216)"><path d="M-9 -24 L 9 -24 q 0 13 -9 13 q -9 0 -9 -13 Z" fill="' + C.gold + '"/><rect x="-2" y="-11" width="4" height="8" fill="' + C.gold + '"/><path d="M-8 0 L 8 0 L 4 -4 L -4 -4 Z" fill="' + C.gold + '"/><ellipse cx="0" cy="-24" rx="8" ry="2.4" fill="' + C.goldBright + '"/></g>' +
        // the lantern, hung properly from the beam
        '<path d="M120 16 L 120 56" stroke="#1c140c" stroke-width="2.5"/>' +
        '<circle class="art-lantern" cx="120" cy="80" r="32" fill="' + C.lantern + '" opacity="0.25"/>' +
        '<rect x="110" y="56" width="20" height="5" rx="2" fill="#241a10"/>' +
        '<rect x="112" y="62" width="16" height="24" rx="3" fill="' + C.lantern + '" opacity="0.9"/>' +
        '<path d="M112 69 L 128 69 M 112 79 L 128 79 M 120 62 L 120 86" stroke="#241a10" stroke-width="1.4" opacity="0.6"/>' +
        '<rect x="111" y="86" width="18" height="4" rx="2" fill="#241a10"/>',
        { label: "An open treasure chest spilling gold coins by lantern light" }
      );
    },

    // The nor'easter storm
    storm: function () {
      return svg(
        skyGrad("g_sky", C.skyStorm, "#050b10") +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' +
        // sheet lightning flickering deep inside the cloud bank
        '<g opacity="0.2"><circle class="art-flash" cx="150" cy="34" r="70" fill="#9fb4c0"/></g>' +
        cloud(140, 30, 1.4, { fill: "#0d181f", opacity: 0.7 }) +
        cloud(480, 44, 1.1, { fill: "#101c24", opacity: 0.65, slow: true }) +
        // rain, two sheets deep
        '<g class="art-rain" stroke="#6b8a94" stroke-width="1.6" opacity="0.5">' +
        '<path d="M40 0 l -12 40 M120 -10 l -12 40 M200 6 l -12 40 M280 -6 l -12 40 M360 2 l -12 40 M440 -12 l -12 40 M520 4 l -12 40 M600 -4 l -12 40"/>' +
        "</g>" +
        '<g class="art-rain" stroke="#4e6a75" stroke-width="1.2" opacity="0.35">' +
        '<path d="M80 60 l -10 34 M160 48 l -10 34 M240 64 l -10 34 M320 52 l -10 34 M400 66 l -10 34 M480 46 l -10 34 M560 58 l -10 34"/>' +
        "</g>" +
        '<path class="art-bolt" d="M420 6 l -30 62 l 22 -6 l -34 66 l 52 -78 l -20 6 l 28 -50 Z" fill="' + C.goldBright + '" opacity="0.9"/>' +
        // violent sea
        '<path class="art-wave art-wave-0" d="M-40 168 q 60 -42 120 0 t 120 0 t 120 0 t 120 0 t 120 0 L 640 240 L 0 240 Z" fill="' + C.sea2 + '"/>' +
        // spume torn off the crests (same drift class, so it rides the band)
        '<path class="art-wave art-wave-0" d="M-40 166 q 60 -42 120 0 t 120 0 t 120 0 t 120 0 t 120 0" fill="none" stroke="' + C.foam + '" stroke-width="2.5" stroke-opacity="0.35"/>' +
        '<path class="art-wave art-wave-1" d="M-80 196 q 70 -34 140 0 t 140 0 t 140 0 t 140 0 t 140 0 L 640 240 L 0 240 Z" fill="' + C.ink + '" opacity="0.8"/>' +
        ship(300, 158, 0.9, { flag: true, cls: "art-ship art-pitch" }),
        { label: "A ship pitching in a violent storm with lightning" }
      );
    },

    // The wreck on the bar
    wreck: function () {
      return svg(
        skyGrad("g_sky", "#131c22", "#0a1015") +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' +
        '<circle cx="86" cy="50" r="22" fill="' + C.moon + '" opacity="0.5"/>' +
        // the last of the rain, thinning as the storm moves off
        '<g class="art-rain" stroke="#4e6a75" stroke-width="1.2" opacity="0.25"><path d="M110 10 l -10 34 M230 -4 l -10 34 M350 14 l -10 34 M470 0 l -10 34 M590 10 l -10 34"/></g>' +
        // the low dune line of the Cape, so near
        '<path d="M400 148 Q 500 132 640 142 L 640 240 L 400 240 Z" fill="#10181a"/>' +
        '<path class="art-wave art-wave-0" d="M-40 150 q 60 -30 120 0 t 120 0 t 120 0 t 120 0 t 120 0 L 640 240 L 0 240 Z" fill="' + C.sea2 + '"/>' +
        // moonlight scattered on the swell
        '<g stroke="' + C.moon + '" stroke-width="2" opacity="0.18" stroke-linecap="round"><path d="M64 162 h 40 M74 172 h 22 M68 182 h 32"/></g>' +
        // broken ship, heeled over
        '<g transform="translate(340,158) rotate(-28)">' +
        '<path d="M-70 0 L70 0 L56 20 Q 0 34 -56 20 Z" fill="' + C.hull + '"/>' +
        '<rect x="-20" y="-64" width="4" height="64" fill="' + C.hull + '" transform="rotate(14 -18 0)"/>' +
        '<path d="M-16 -58 q -22 14 -4 34" fill="' + C.sailDim + '" opacity="0.6"/>' +
        "</g>" +
        // a spar and a torn scrap of sail, adrift
        '<g transform="translate(520,196)"><g class="art-bob-slow"><rect x="-34" y="-3" width="68" height="6" rx="3" fill="' + C.hull + '"/><path d="M-10 -2 q 14 -12 30 -4 l -4 6 q -14 -5 -26 -2 Z" fill="' + C.sailDim + '" opacity="0.5"/></g></g>' +
        // a cask riding the swell
        '<g transform="translate(236,198)"><g class="art-bob-slow"><rect x="-12" y="-10" width="24" height="16" rx="5" fill="#3a2c1a"/><path d="M-12 -2 L 12 -2" stroke="#241a10" stroke-width="2"/></g></g>' +
        // snapped mast in the foam
        '<g transform="translate(150,196) rotate(64)"><rect x="-3" y="-46" width="6" height="52" fill="' + C.hull + '"/></g>' +
        '<path class="art-wave art-wave-2" d="M-80 206 q 70 -26 140 0 t 140 0 t 140 0 t 140 0 t 140 0 L 640 240 L 0 240 Z" fill="' + C.ink + '"/>',
        { label: "A broken ship heeled over on a sandbar in moonlit surf" }
      );
    },

    // Boston gallows
    gallows: function () {
      return svg(
        skyGrad("g_sky", "#2a3540", "#141c24") +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' + stars(12, 80) +
        '<path d="M0 204 L 640 204 L 640 240 L 0 240 Z" fill="#22302a"/>' +
        // crowd silhouettes
        '<g fill="' + C.ink + '"><circle cx="120" cy="196" r="8"/><rect x="112" y="196" width="16" height="14"/><circle cx="150" cy="198" r="7"/><rect x="143" y="198" width="14" height="12"/><circle cx="500" cy="196" r="8"/><rect x="492" y="196" width="16" height="14"/><circle cx="536" cy="199" r="7"/><rect x="529" y="199" width="14" height="12"/></g>' +
        // gallows frame
        '<g stroke="#241a10" stroke-width="10" fill="none">' +
        '<path d="M280 204 L 280 70 L 400 70 M 300 70 L 280 96"/>' +
        "</g>" +
        '<path class="art-swing" d="M380 70 l 0 34 m 0 0 a 9 11 0 1 0 0.01 0" stroke="#8a7a5a" stroke-width="4" fill="none"/>',
        { label: "A gallows frame against an evening sky above a silent crowd" }
      );
    },

    // Old map / pardon / charts
    map: function () {
      return svg(
        '<rect width="640" height="240" fill="#d8c8a2"/>' +
        '<rect x="10" y="10" width="620" height="220" fill="none" stroke="#8a6420" stroke-width="2" stroke-dasharray="6 4"/>' +
        // coastlines
        '<path d="M60 40 Q 140 90 110 160 Q 96 200 150 224" fill="none" stroke="#6b5533" stroke-width="3"/>' +
        '<path d="M470 26 Q 520 80 500 130 T 560 226" fill="none" stroke="#6b5533" stroke-width="3"/>' +
        // route
        '<path class="art-route" d="M130 190 Q 240 150 320 168 T 520 90" fill="none" stroke="' + C.blood + '" stroke-width="2.5" stroke-dasharray="8 6"/>' +
        '<circle cx="130" cy="190" r="5" fill="' + C.blood + '"/>' +
        '<path d="M512 82 l 16 16 m 0 -16 l -16 16" stroke="' + C.blood + '" stroke-width="3.4"/>' +
        // compass rose
        '<g transform="translate(320,60)"><circle r="24" fill="none" stroke="#6b5533" stroke-width="2"/><path d="M0 -22 L 5 0 L 0 22 L -5 0 Z" fill="#6b5533"/><path d="M-22 0 L 0 -5 L 22 0 L 0 5 Z" fill="#8a6420"/></g>' +
        // sea monster doodle
        '<path d="M220 210 q 10 -14 22 0 q 10 12 22 0 q 8 -10 18 -2" fill="none" stroke="#6b5533" stroke-width="2.4"/>',
        { label: "A weathered chart with a dashed route and compass rose" }
      );
    },

    // Storm bluff — Maria watching / sea witch
    bluff: function () {
      return svg(
        skyGrad("g_sky", C.skyStorm, "#0a1a24") +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' +
        '<circle cx="520" cy="48" r="24" fill="' + C.moon + '" opacity="0.7"/>' +
        cloud(300, 36, 1.2, { fill: "#0d181f", opacity: 0.55 }) +
        cloud(110, 26, 0.9, { fill: "#101c24", opacity: 0.5, slow: true }) +
        '<path class="art-wave art-wave-0" d="M-40 176 q 60 -34 120 0 t 120 0 t 120 0 t 120 0 t 120 0 L 640 240 L 0 240 Z" fill="' + C.sea2 + '"/>' +
        // bluff
        '<path d="M0 240 L 0 150 Q 60 130 120 148 L 180 172 Q 220 190 240 240 Z" fill="' + C.land + '"/>' +
        // grass bent flat by the same wind
        '<g stroke="#3a4a30" stroke-width="2" fill="none" stroke-linecap="round">' +
        '<path d="M36 146 q -7 -7 -13 -8 M42 145 q -5 -9 -11 -11 M140 158 q -6 -8 -12 -9 M146 158 q -4 -10 -10 -12 M196 186 q -6 -7 -12 -8"/></g>' +
        // spray bursting at the bluff foot
        '<g class="art-smoke" stroke="' + C.foam + '" stroke-width="2.4" fill="none" opacity="0.5" stroke-linecap="round">' +
        '<path d="M236 206 q -6 -12 -16 -16 M244 210 q 0 -16 -6 -24 M252 214 q 8 -12 4 -24"/></g>' +
        // woman on the bluff, wind in her dress and hair
        '<g transform="translate(96,148)">' +
        '<path d="M0 0 q -4 -6 0 -11 q 6 5 0 11 M0 0 L 0 14 q -12 14 -20 26 L 8 40 Q 4 24 0 14" fill="#3a2432"/>' +
        '<path class="art-hair" d="M-1 -8 q -16 2 -26 -4 M-1 -5 q -14 5 -24 2" stroke="#241820" stroke-width="2.6" fill="none"/>' +
        // she holds a lantern out, to be seen
        '<path d="M0 5 L 13 10 M 13 10 l 0 4" stroke="#3a2432" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
        '<circle cx="13" cy="19" r="8" fill="' + C.lantern + '" opacity="0.15"/>' +
        '<rect class="art-lantern" x="10" y="14" width="6" height="9" rx="1.5" fill="' + C.lantern + '" opacity="0.8"/>' +
        "</g>" +
        ship(430, 168, 0.6, { flag: true, cls: "art-ship art-pitch" }),
        { label: "A woman on a windy bluff watching a ship fight a storm" }
      );
    },

    // Courtroom / trial
    trial: function () {
      return svg(
        '<rect width="640" height="240" fill="#2a2018"/>' +
        '<rect x="0" y="0" width="640" height="240" fill="url(#g_sky)" opacity="0"/>' + skyGrad("g_sky", "#000", "#000") +
        // panelling
        '<g stroke="#1c140c" stroke-width="3"><path d="M0 60 L 640 60 M 0 150 L 640 150"/><path d="M80 0 L 80 150 M 200 0 L 200 150 M 320 0 L 320 150 M 440 0 L 440 150 M 560 0 L 560 150"/></g>' +
        // bench
        '<rect x="180" y="120" width="280" height="60" fill="#3a2c1a"/><rect x="160" y="110" width="320" height="14" fill="#4a3a22"/>' +
        // judge silhouette with wig
        '<g transform="translate(320,106)"><circle cx="0" cy="-10" r="12" fill="#c9c2b2"/><path d="M-14 -12 q -4 16 2 22 M14 -12 q 4 16 -2 22" stroke="#c9c2b2" stroke-width="5" fill="none"/><path d="M-16 4 q 16 12 32 0 l 0 12 l -32 0 Z" fill="#141014"/></g>' +
        // gavel
        '<g transform="translate(420,120) rotate(-24)"><rect x="-4" y="-20" width="8" height="26" fill="#6b5533"/><rect x="-16" y="-30" width="32" height="12" rx="4" fill="#4a3a22"/></g>' +
        // dock rail + prisoner
        '<g transform="translate(140,190)"><path d="M-40 0 L 40 0 M -34 0 L -34 -26 M 0 0 L 0 -26 M 34 0 L 34 -26" stroke="#241a10" stroke-width="5"/><circle cx="0" cy="-42" r="9" fill="#a08868"/><path d="M-10 -32 q 10 8 20 0 l 0 14 l -20 0 Z" fill="#33261a"/></g>',
        { label: "A dim courtroom with judge, gavel and a prisoner at the dock" }
      );
    },

    // Quiet farm / honest life
    farm: function () {
      return svg(
        skyGrad("g_sky", "#4a5a66", "#2c4a56") +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' +
        '<circle cx="120" cy="56" r="28" fill="' + C.goldBright + '" opacity="0.8"/>' +
        cloud(320, 40, 1, { fill: "#6a7a84", opacity: 0.5 }) +
        cloud(520, 66, 0.75, { fill: "#5e6e78", opacity: 0.45, slow: true }) +
        '<path d="M0 180 Q 160 150 320 176 T 640 168 L 640 240 L 0 240 Z" fill="' + C.landLight + '"/>' +
        '<path d="M0 206 Q 220 184 640 204 L 640 240 L 0 240 Z" fill="' + C.land + '"/>' +
        // farmhouse
        '<g transform="translate(430,132)">' +
        '<rect x="0" y="16" width="90" height="44" fill="#3a2c1a"/><path d="M-8 16 L 45 -14 L 98 16 Z" fill="#241a10"/>' +
        '<rect class="art-lantern" x="14" y="30" width="14" height="16" fill="' + C.lantern + '" opacity="0.9"/>' +
        '<rect x="56" y="30" width="18" height="30" fill="#140e08"/>' +
        "</g>" +
        // fence
        '<g stroke="#4a3a22" stroke-width="4"><path d="M40 206 L 40 186 M 80 208 L 80 188 M 120 210 L 120 190 M 160 210 L 160 190 M 24 196 L 176 198 M 24 204 L 176 206"/></g>' +
        // distant sail on the horizon — the life not chosen
        ship(560, 96, 0.22, { cls: "art-ship" }),
        { label: "A lamplit farmhouse and fence, a tiny sail on the far horizon" }
      );
    },

    // Two skeletal survivors on the beach at dawn
    dawnbeach: function () {
      return svg(
        skyGrad("g_sky", "#5a5a56", "#38434c") +
        '<rect width="640" height="150" fill="url(#g_sky)"/>' +
        '<circle cx="320" cy="140" r="60" fill="' + C.goldBright + '" opacity="0.25"/>' +
        cloud(180, 40, 0.9, { fill: "#6a6a64", opacity: 0.45 }) +
        gull(410, 88, 1) +
        cloud(470, 30, 0.7, { fill: "#5e5e58", opacity: 0.4, slow: true }) +
        sea(132, 60) +
        // first light laid out across the water
        '<g stroke="' + C.goldBright + '" stroke-width="2" opacity="0.3" stroke-linecap="round"><path d="M298 142 h 44 M306 152 h 28 M310 162 h 20 M302 172 h 36"/></g>' +
        '<path d="M0 180 Q 180 158 380 186 T 640 180 L 640 240 L 0 240 Z" fill="#b8a377"/>' +
        // flotsam
        '<g fill="' + C.hull + '"><rect x="180" y="196" width="60" height="7" rx="3" transform="rotate(-8 210 200)"/><rect x="420" y="204" width="44" height="6" rx="3" transform="rotate(6 442 207)"/></g>' +
        // a torn scrap of sail draped over the plank
        '<path d="M196 190 q 22 -12 46 -4 l -7 10 q -18 -7 -34 1 Z" fill="' + C.sailDim + '" opacity="0.55"/>' +
        '<g fill="' + C.gold + '"><circle cx="300" cy="212" r="3.4"/><circle cx="316" cy="218" r="2.6"/></g>' +
        // footprints, up from the waterline
        '<g fill="#9c8a62" opacity="0.8"><ellipse cx="404" cy="194" rx="2.6" ry="1.3"/><ellipse cx="396" cy="199" rx="2.6" ry="1.3"/><ellipse cx="387" cy="203" rx="2.6" ry="1.3"/><ellipse cx="378" cy="207" rx="2.6" ry="1.3"/><ellipse cx="370" cy="211" rx="2.6" ry="1.3"/></g>' +
        // one figure kneeling, one standing, both looking back at the sea
        '<g transform="translate(360,196)"><path d="M0 0 q -3 -5 0 -9 q 5 4 0 9 M0 0 q -8 4 -10 14 M 0 0 q 7 5 6 14 M -10 14 L 8 14" stroke="' + C.ink + '" stroke-width="4" fill="none" stroke-linecap="round"/></g>' +
        '<g transform="translate(286,190)"><path d="M0 0 q -3 -5 0 -9 q 5 4 0 9 M0 0 L 0 16 M 0 3 q -7 3 -9 12 M 0 3 q 6 4 6 13 M 0 16 l -4 12 M 0 16 l 4 12" stroke="' + C.ink + '" stroke-width="3.6" fill="none" stroke-linecap="round"/></g>',
        { label: "Two weary survivors among wreckage on a dawn beach" }
      );
    },

    // Free prince — speech on deck
    prince: function () {
      return svg(
        skyGrad("g_sky", C.sky1, C.sky2) +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' + stars(18, 100) +
        moon(560, 50, 22) +
        // deck from low angle
        '<path d="M0 200 L 640 184 L 640 240 L 0 240 Z" fill="#241a10"/>' +
        '<path d="M0 214 L 640 200" stroke="#1c140c" stroke-width="2"/>' +
        // mast + rigging behind
        '<rect x="308" y="20" width="8" height="182" fill="#1c140c"/>' +
        '<path d="M312 30 L 120 200 M312 30 L 500 190 M312 66 L 190 200 M312 66 L 440 194" stroke="#1c140c" stroke-width="2" opacity="0.7"/>' +
        // a lantern hung in the rigging lights the gathering
        '<path d="M410 164 l 0 9" stroke="#1c140c" stroke-width="2"/>' +
        '<circle cx="410" cy="180" r="14" fill="' + C.lantern + '" opacity="0.12"/>' +
        '<rect class="art-lantern" x="405" y="173" width="10" height="13" rx="2" fill="' + C.lantern + '" opacity="0.85"/>' +
        // the helm, unattended while everyone listens
        '<g transform="translate(568,184)" stroke="#1c140c" fill="none">' +
        '<path d="M0 14 L 0 26 M -8 26 L 8 26" stroke-width="5"/>' +
        '<circle r="13" stroke-width="3.5"/>' +
        '<path d="M0 -17 L 0 17 M -17 0 L 17 0 M -12 -12 L 12 12 M -12 12 L 12 -12" stroke-width="2.5"/>' +
        '<circle r="3.5" fill="#1c140c" stroke="none"/>' +
        "</g>" +
        // captain figure, arm raised
        '<g transform="translate(312,196)">' +
        '<path d="M0 0 L 0 -40 M 0 -40 q -7 -5 0 -14 q 8 8 0 14 M 0 -34 L -20 -22 M 0 -34 L 22 -52" stroke="' + C.ink + '" stroke-width="6" fill="none" stroke-linecap="round"/>' +
        '<path d="M-6 -50 q 6 -6 12 0 l 4 -4 q -10 -8 -20 0 Z" fill="' + C.ink + '"/>' +
        "</g>" +
        // listening crew silhouettes
        '<g fill="' + C.ink + '"><circle cx="130" cy="212" r="9"/><rect x="121" y="212" width="18" height="18"/><circle cx="180" cy="216" r="8"/><rect x="172" y="216" width="16" height="16"/><circle cx="238" cy="218" r="9"/><rect x="229" y="218" width="18" height="22"/><circle cx="412" cy="220" r="8"/><rect x="404" y="220" width="16" height="20"/><circle cx="480" cy="210" r="9"/><rect x="471" y="210" width="18" height="20"/><circle cx="530" cy="214" r="8"/><rect x="522" y="214" width="16" height="16"/></g>',
        { label: "A captain addressing his crew on deck beneath the rigging" }
      );
    },

    // Bartholomew the ship's goat, on deck with a stolen hat
    goat: function () {
      return svg(
        skyGrad("g_sky", "#2c4a56", C.sky2) +
        '<rect width="640" height="150" fill="url(#g_sky)"/>' +
        stars(14, 90) + moon(560, 46, 20) +
        cloud(180, 40, 0.9, { fill: "#3a4c56", opacity: 0.45 }) +
        sea(140, 40) +
        // mast and rigging, to say whose deck this is
        '<rect x="150" y="8" width="7" height="172" fill="#1c140c"/>' +
        '<path d="M153 16 L 40 176 M153 16 L 268 172 M153 58 L 96 178" stroke="#1c140c" stroke-width="1.8" opacity="0.6" fill="none"/>' +
        // deck
        '<path d="M0 178 L 640 168 L 640 240 L 0 240 Z" fill="#241a10"/>' +
        '<g stroke="#1c140c" stroke-width="2"><path d="M0 196 L 640 187"/><path d="M0 216 L 640 208"/></g>' +
        // a barrel and a coil of rope for deck-clutter
        '<g transform="translate(96,196)"><rect x="-16" y="-30" width="32" height="34" rx="4" fill="#4a3a22"/><path d="M-16 -20 L 16 -20 M -16 -8 L 16 -8" stroke="#2a2018" stroke-width="3"/></g>' +
        '<g transform="translate(540,206)" fill="none" stroke="#6b5533" stroke-width="3"><circle r="10"/><circle r="5"/></g>' +
        // the seagull has claimed the barrel, and is not impressed
        '<g transform="translate(96,161)">' +
        '<path d="M-8 -6 l -6 1.5" stroke="' + C.sail + '" stroke-width="3" stroke-linecap="round"/>' +
        '<ellipse cx="0" cy="-6" rx="8" ry="5.5" fill="' + C.sail + '"/>' +
        '<path d="M-5 -6 q 4 -3 9 -1" stroke="' + C.sailDim + '" stroke-width="2" fill="none"/>' +
        '<circle cx="7" cy="-11" r="3.6" fill="' + C.sail + '"/>' +
        '<path d="M10 -11.5 l 5 1.2 l -5 1.6 Z" fill="' + C.gold + '"/>' +
        '<circle cx="7.6" cy="-12.2" r="0.8" fill="' + C.ink + '"/>' +
        '<path d="M-2 -1 L -2 5 M 3 -1 L 3 5" stroke="' + C.gold + '" stroke-width="1.6"/>' +
        "</g>" +
        // the rope has clearly been sampled; the frayed end trails to his mouth
        '<path d="M540 206 Q 470 220 430 204 Q 402 192 388 172" stroke="#6b5533" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M388 172 l -4 -5 M388 172 l 2 -6" stroke="#6b5533" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
        // the goat: stout body, stubby legs, little horns, a beard, and a
        // stolen tricorn hat. Placement rides the outer group; the chew
        // animation rides the inner one (nested pattern — see ship()).
        '<g transform="translate(320,182)"><g class="art-goat">' +
        '<ellipse cx="0" cy="6" rx="46" ry="26" fill="#cdbfa4"/>' +               // body
        '<rect x="-34" y="24" width="8" height="24" rx="3" fill="#b7a98e"/>' +      // legs
        '<rect x="-14" y="26" width="8" height="24" rx="3" fill="#b7a98e"/>' +
        '<rect x="10" y="26" width="8" height="24" rx="3" fill="#b7a98e"/>' +
        '<rect x="30" y="24" width="8" height="24" rx="3" fill="#b7a98e"/>' +
        '<path d="M40 4 l 22 -6 l -4 -10" stroke="#cdbfa4" stroke-width="10" fill="none" stroke-linecap="round"/>' + // neck
        '<ellipse cx="60" cy="-14" rx="15" ry="12" fill="#d8cbb0"/>' +             // head
        '<path d="M58 -24 q -4 -12 -12 -16 M66 -24 q 4 -12 12 -16" stroke="#8a7a5a" stroke-width="4" fill="none" stroke-linecap="round"/>' + // horns
        '<circle cx="64" cy="-16" r="2.2" fill="#241a10"/>' +                      // eye
        '<path d="M58 -4 q 4 8 8 0" stroke="#8a7a5a" stroke-width="3" fill="none" stroke-linecap="round"/>' + // beard
        '<path d="M-46 -2 q -6 4 0 8" stroke="#b7a98e" stroke-width="4" fill="none" stroke-linecap="round"/>' + // tail
        // the stolen tricorn hat, perched on the horns
        '<g transform="translate(60,-30)"><path d="M-18 0 Q 0 -14 18 0 Q 0 6 -18 0 Z" fill="#2a2018"/><path d="M-18 0 Q 0 -20 18 0" fill="none" stroke="#4a3a22" stroke-width="3"/></g>' +
        "</g></g>",
        { label: "A stout ship's goat wearing a stolen tricorn hat on deck" }
      );
    },

    // Fog at sea — the lookout scene
    fog: function () {
      return svg(
        skyGrad("g_sky", "#4a5560", "#38434c") +
        '<rect width="640" height="240" fill="url(#g_sky)"/>' +
        // faint sea band
        '<rect x="0" y="150" width="640" height="90" fill="#2c3a42" opacity="0.7"/>' +
        // a ghostly half-seen sail in the murk
        '<g opacity="0.35"><rect x="318" y="60" width="4" height="96" fill="#1c242a"/>' +
        '<path d="M322 66 q 34 20 0 44 Z" fill="#c9d2d6"/><path d="M318 66 q -34 20 0 44 Z" fill="#b7c0c4"/></g>' +
        // rolling fog banks (soft drifting ellipses)
        cloud(150, 120, 1.6, { fill: "#6a7580", opacity: 0.5 }) +
        cloud(430, 150, 1.9, { fill: "#5e6975", opacity: 0.5, slow: true }) +
        cloud(540, 100, 1.4, { fill: "#6a7580", opacity: 0.45, slow: true }) +
        // a gull, going by ear
        '<g opacity="0.4">' + gull(420, 70, 0.9, { slow: true, stroke: "#9aa5ad" }) + "</g>" +
        // our own bow rail, the only solid thing in the world
        '<path d="M0 226 Q 320 210 640 226 L 640 240 L 0 240 Z" fill="#1c242a"/>' +
        '<path d="M0 220 Q 320 204 640 220" stroke="#141c22" stroke-width="5" fill="none"/>' +
        // the fog bell, swinging gently at its bracket
        '<g transform="translate(520,214)">' +
        '<path d="M0 0 L 0 -24 L 11 -24" stroke="#141c22" stroke-width="3.5" fill="none"/>' +
        '<g class="art-swing"><path d="M11 -24 l 0 4" stroke="#5a4c34" stroke-width="2"/><path d="M4 -8 q 0 -13 7 -13 q 7 0 7 13 l 1 3 l -16 0 Z" fill="#8a7a5a"/><circle cx="11" cy="-3" r="2" fill="#5a4c34"/></g>' +
        "</g>" +
        // the lookout, lantern raised against the murk
        '<g transform="translate(130,216)">' +
        '<path d="M0 0 L 0 -30 M 0 -26 q -6 -5 0 -13 q 7 8 0 13 M 0 -22 L -13 -14 M 0 -22 L 13 -18" stroke="#141c22" stroke-width="5" fill="none" stroke-linecap="round"/>' +
        '<circle cx="17" cy="-14" r="10" fill="' + C.lantern + '" opacity="0.12"/>' +
        '<rect class="art-lantern" x="14" y="-19" width="7" height="10" rx="2" fill="' + C.lantern + '" opacity="0.55"/>' +
        "</g>" +
        // the nearest fog bank drifts in front of everything
        cloud(300, 212, 2.2, { fill: "#525d68", opacity: 0.55 }),
        { label: "A lookout at the bow rail as a half-seen sail looms through thick fog" }
      );
    }
  };
})();
