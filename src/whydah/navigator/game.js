/* =====================================================================
   Whydah’s Voyage (v9) — formerly First Sail
   A voyage roguelite that mirrors the real story. February 1717: the
   crew has taken the Whydah near the Bahamas. Run her north for Maine.
   Random events from a 40-card pool, ship battles, a sea serpent (a
   yarn, and tagged as one), navigator mini-games for points, gold that
   banks between runs, a Harbor refit shop, and the nor'easter finale.
   Self-contained: pure Canvas 2D, no libraries, no external assets.
   ===================================================================== */
(function () {
  "use strict";

  // ---------------------------------------------------------------- canvas
  var canvas = document.getElementById("scene");
  var ctx = canvas.getContext("2d");
  var W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", function () { setTimeout(resize, 250); });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ---------------------------------------------------------------- rng + helpers
  function rand(a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function chance(p) { return Math.random() < p; }
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ---------------------------------------------------------------- audio (muted by default)
  var AC = null, muted = true;
  function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } return AC; }
  function beep(freq, dur, type, vol) {
    if (muted) return; var ac = audio(); if (!ac) return;
    try {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "sine"; o.frequency.value = freq;
      g.gain.value = (vol || 0.15);
      o.connect(g); g.connect(ac.destination);
      var t = ac.currentTime; o.start(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.15));
      o.stop(t + (dur || 0.15) + 0.02);
    } catch (e) {}
  }
  var SFX = {
    fire: function () { beep(220, 0.18, "square", 0.10); },
    hit: function () { beep(90, 0.25, "sawtooth", 0.18); },
    point: function () { beep(880, 0.10, "triangle", 0.12); },
    coin: function () { beep(1180, 0.08, "triangle", 0.10); },
    good: function () { beep(660, 0.12, "triangle", 0.14); beep(990, 0.14, "triangle", 0.10); },
    bad: function () { beep(140, 0.3, "sawtooth", 0.16); },
    buy: function () { beep(520, 0.1, "triangle", 0.12); beep(780, 0.12, "triangle", 0.1); },
    thunder: function () { beep(60, 0.6, "sawtooth", 0.22); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { beep(f, 0.22, "triangle", 0.14); }, i * 140); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { setTimeout(function () { beep(f, 0.35, "sawtooth", 0.16); }, i * 200); }); }
  };

  // ---------------------------------------------------------------- input
  var input = { left: false, right: false, up: false, down: false, fire: false, firePressed: false,
                leftPressed: false, rightPressed: false,
                px: 0, py: 0, pDown: false, pPressed: false };

  // the secret word: typing it on the title screen opens INSANE mode —
  // the only way in. (Touch path: tap the locked 🌀 chip five times.)
  var secretBuf = "";
  function grantSecret() {
    if (SAVE.secretUnlock) return;
    SAVE.secretUnlock = true; persist();
    toast("🌀 SIDEQUEST ACCEPTED");
    SFX.win();
  }
  // feats: permanent one-way flags that unlock ship skins
  function feat(id) {
    if (!SAVE.feats) SAVE.feats = {};
    if (SAVE.feats[id]) return;
    SAVE.feats[id] = true; persist();
  }
  function keydown(e) {
    var k = e.key.toLowerCase();
    if (scene && scene.isTitle && /^[a-z]$/.test(k)) {
      secretBuf = (secretBuf + k).slice(-12);
      if (secretBuf.indexOf("sidequest") >= 0) { secretBuf = ""; grantSecret(); }
    }
    if (k === "arrowleft" || k === "a") { if (!input.left) input.leftPressed = true; input.left = true; }
    else if (k === "arrowright" || k === "d") { if (!input.right) input.rightPressed = true; input.right = true; }
    else if (k === "arrowup" || k === "w") input.up = true;
    else if (k === "arrowdown" || k === "s") input.down = true;
    else if (k === " " || k === "spacebar" || k === "enter") { if (!input.fire) input.firePressed = true; input.fire = true; }
    else if (k === "q" || k === "e") { if (G && (G.special || 0) >= 1) G.blastReq = true; }
    else if (k === "escape" || k === "p") { togglePause(); }
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "spacebar"].indexOf(k) >= 0) e.preventDefault();
  }
  function keyup(e) {
    var k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") input.left = false;
    else if (k === "arrowright" || k === "d") input.right = false;
    else if (k === "arrowup" || k === "w") input.up = false;
    else if (k === "arrowdown" || k === "s") input.down = false;
    else if (k === " " || k === "spacebar" || k === "enter") input.fire = false;
  }
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);

  function canvasPoint(e) {
    var r = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    input.px = t.clientX - r.left; input.py = t.clientY - r.top;
  }
  canvas.addEventListener("pointerdown", function (e) { canvasPoint(e); input.pDown = true; input.pPressed = true; if (AC && AC.state === "suspended") AC.resume(); });
  canvas.addEventListener("pointermove", function (e) { if (input.pDown) canvasPoint(e); });
  window.addEventListener("pointerup", function () { input.pDown = false; });

  function holdBtn(id, prop) {
    var el = document.getElementById(id); if (!el) return;
    var set = function (v) { return function (e) { e.preventDefault(); input[prop] = v; if (v && prop === "fire") input.firePressed = true; el.classList.toggle("held", v); }; };
    el.addEventListener("pointerdown", set(true));
    el.addEventListener("pointerup", set(false));
    el.addEventListener("pointerleave", set(false));
    el.addEventListener("pointercancel", set(false));
  }
  holdBtn("btn-left", "left");
  holdBtn("btn-right", "right");
  holdBtn("btn-fire", "fire");
  var blastBtn = document.getElementById("btn-blast");
  if (blastBtn) blastBtn.addEventListener("pointerdown", function (e) { e.preventDefault(); if (G && (G.special || 0) >= 1) G.blastReq = true; });

  function consumeFire() { var f = input.firePressed; input.firePressed = false; return f; }
  function consumeTap() { var p = input.pPressed || input.firePressed; input.pPressed = false; input.firePressed = false; return p; }
  // canvas tap-button: draw + hit-test in one call
  function uiButton(x, y, w, h, label, opts) {
    opts = opts || {};
    var on = !opts.disabled;
    ctx.fillStyle = opts.disabled ? "rgba(60,70,78,.7)" : (opts.color || "#96341f");
    ctx.strokeStyle = opts.disabled ? "rgba(150,150,150,.4)" : "#e0b25c"; ctx.lineWidth = 2;
    roundRect(x, y, w, h, Math.min(14, h / 2)); ctx.fill(); ctx.stroke();
    text(label, x + w / 2, y + h / 2 + (opts.size || 15) * 0.36, opts.size || 15, opts.disabled ? "rgba(230,230,230,.5)" : "#f4e7c9", "center", "bold");
    if (opts.sub) text(opts.sub, x + w / 2, y + h + 14, 11, "rgba(244,231,201,.65)", "center");
    if (on && input.pPressed && input.px >= x && input.px <= x + w && input.py >= y && input.py <= y + h) {
      input.pPressed = false; return true;
    }
    return false;
  }

  var isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) document.body.classList.add("hide-touch");

  // ---------------------------------------------------------------- persistence
  var SAVE = { bank: 0, best: 0, wins: 0, runs: 0, sndHint: 0, seen: {}, mode: "hard", extremeWon: false, secretUnlock: false, feats: {}, skin: "auto", suggestions: [],
    furthest: 0, furthestInsane: 0, prologueDone: false, whydahTaken: false, bellSeen: false,
    upg: { hull: 0, pumps: 0, shot: 0, nest: 0, helm: 0, charm: 0, canvas: 0, guns: 0 } };
  function loadSave() {
    try {
      var raw = localStorage.getItem("firstsail-save-v3");
      if (raw) { var s = JSON.parse(raw); for (var k in SAVE) if (s[k] !== undefined) SAVE[k] = s[k]; if (s.upg) for (var u in SAVE.upg) if (s.upg[u] !== undefined) SAVE.upg[u] = s.upg[u]; }
      else { var oldBest = parseInt(localStorage.getItem("firstsail-best-v2") || "0", 10) || 0; SAVE.best = oldBest; }
    } catch (e) {}
  }
  function persist() { try { localStorage.setItem("firstsail-save-v3", JSON.stringify(SAVE)); } catch (e) {} }
  loadSave();
  // Suggestion box → Supabase. Student ideas go to the same project that holds
  // the class photo uploads, via a SECURITY DEFINER function `submit_suggestion`
  // that anon may only *call* — it can't read, edit, or delete the suggestions
  // table any other way. The key below is the PUBLISHABLE (anon) key, public by
  // design. Mr. Howe reviews the whole list in the Supabase Table Editor. The
  // localStorage copy stays as an offline fallback if the call ever fails.
  var SB_URL = "https://segzgdlqqymqlfuahosd.supabase.co";
  var SB_KEY = "sb_publishable_fBBZAVo-ljKvaBKNVMukmA_TopYb6D8";
  function sendSuggestion(bodyText, cb) {
    var rec = { p_body: bodyText.slice(0, 500), p_mode: (SAVE.mode || "hard").slice(0, 20), p_page: "first-sail" };
    try {
      fetch(SB_URL + "/rest/v1/rpc/submit_suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY },
        body: JSON.stringify(rec)
      }).then(function (r) { cb(r && r.ok); }).catch(function () { cb(false); });
    } catch (e) { cb(false); }
  }
  // seen-count is scanned once and cached; invalidated whenever a new tale is logged
  var seenCache = null;
  function invalidateSeenCache() { seenCache = null; }
  function countSeen() {
    if (seenCache != null) return seenCache;
    var n = 0;
    for (var i = 0; i < EVENTS.length; i++) if (SAVE.seen && SAVE.seen[EVENTS[i].id]) n++;
    seenCache = n;
    return n;
  }

  // ---------------------------------------------------------------- upgrades
  var UPG = [
    { id: "hull",  icon: "🛡", name: "Oak Timbers",  desc: "Thicker hull. One more heart per level.",            max: 3, cost: [80, 180, 320] },
    { id: "pumps", icon: "🪣", name: "Bilge Pumps",  desc: "Crew shrugs off storm hits. 25% per level.",         max: 3, cost: [70, 150, 280] },
    { id: "shot",  icon: "⛓",  name: "Chain Shot",   desc: "Cannonballs can strike double. 25% per level.",      max: 3, cost: [60, 140, 250] },
    { id: "nest",  icon: "🔭", name: "Crow's Nest",  desc: "Longer warnings before waves and lunges.",           max: 3, cost: [60, 130, 220] },
    { id: "helm",  icon: "☸",  name: "Weather Helm", desc: "She answers the wheel faster.",                      max: 2, cost: [80, 180] },
    { id: "charm", icon: "🧿", name: "Lucky Charm",  desc: "Bad luck sometimes passes you by.",                  max: 2, cost: [50, 110] },
    { id: "canvas",icon: "⛵", name: "Full Canvas",  desc: "More sail aloft. Each leg passes quicker.",          max: 3, cost: [60, 150, 280] },
    { id: "guns",  icon: "💣", name: "Long Nines",   desc: "Faster shot, then a twin broadside.",                max: 2, cost: [90, 210] }
  ];
  function upgLvl(id) { return SAVE.upg[id] || 0; }
  function steerSpeed() { return 0.9 + upgLvl("helm") * 0.18; }
  function shotBonus() { return upgLvl("shot") * 0.25; }
  function stormShrug() { return upgLvl("pumps") * 0.25; }
  function warnBonus() { return upgLvl("nest") * 0.4; }
  function legSpeedMul() { return 1 - upgLvl("canvas") * 0.12; }   // full canvas shortens each leg
  function ballSpeedMul() { return 1 + (upgLvl("guns") >= 1 ? 0.3 : 0); }
  function twinShot() { return upgLvl("guns") >= 2; }
  function fireCooldown() { return upgLvl("guns") >= 1 ? 0.24 : 0.3; }
  // fire the player's guns: returns the balls to push (twin broadside at Long Nines II)
  function playerShot(x, y, vy) {
    var v = vy * ballSpeedMul();
    if (twinShot()) return [{ x: x - 9, y: y, vy: v, own: 1 }, { x: x + 9, y: y, vy: v, own: 1 }];
    return [{ x: x, y: y, vy: v, own: 1 }];
  }
  // hold-to-autofire: each scene makes a gunner and asks it every frame
  function gunner() {
    var cd = 0;
    return function (dt) {
      cd -= dt;
      if (consumeFire()) { cd = fireCooldown(); return true; }
      if (input.fire && cd <= 0) { cd = fireCooldown(); return true; }
      return false;
    };
  }

  // ==================================================================
  // PROJECTILES & FORCES — shared by every combat/hazard scene
  // ==================================================================
  // One projectile stepper for every scene: moves balls, resolves player-owned
  // balls against `targets` ({x,y,r,onHit(ball)} — onHit always consumes the
  // ball), enemy-owned balls against `ship` ({x,y,r,onHit(ball)}, defaults to
  // damage(1)), and culls anything off-screen. Replaces six near-identical loops.
  function stepBalls(balls, dt, targets, ship) {
    targets = targets || [];
    fireBlast(balls, targets, ship);   // set off a charged Powder Blast, if requested this frame
    for (var bi = balls.length - 1; bi >= 0; bi--) {
      var b = balls[bi];
      b.y += b.vy * dt; if (b.vx) b.x += b.vx * dt;
      var hit = false;
      if (b.own) {
        for (var ti = 0; ti < targets.length; ti++) {
          var tg = targets[ti];
          if (Math.hypot(b.x - tg.x, b.y - tg.y) < (tg.r != null ? tg.r : 24) + (b.hr != null ? b.hr : 6)) {
            hit = true; tg.onHit(b);
            comboHit(b.x, b.y); addScore(comboMult());   // the chain climbs and pays a small rising trickle
            break;
          }
        }
      } else if (ship) {
        var sr = ship.r != null ? ship.r : 18, d = Math.hypot(b.x - ship.x, b.y - ship.y);
        if (d < sr) {
          hit = true; (ship.onHit || function () { damage(1); })(b);
        } else if (d < sr + 22) {
          grazeBall(b);   // whistled past by a hair — a graze charges the blast
        }
      }
      if (hit || b.y < -40 || b.y > H + 40) balls.splice(bi, 1);
    }
  }
  // draw balls with an optional per-ball `style` (used by the insane roster —
  // tennis balls, toast, snowballs, etc.); normal mode is always the plain ball.
  function drawBalls(balls) {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i], style = b.style || "ball";
      if (style === "tennis") {
        ctx.fillStyle = "#c6e84a"; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0.3, 2.2); ctx.stroke();
      } else if (style === "toast") {
        ctx.fillStyle = "#d9a45c"; ctx.beginPath(); ctx.moveTo(b.x - 7, b.y + 6); ctx.lineTo(b.x - 7, b.y - 4); ctx.quadraticCurveTo(b.x, b.y - 12, b.x + 7, b.y - 4); ctx.lineTo(b.x + 7, b.y + 6); ctx.closePath(); ctx.fill();
      } else if (style === "snowball") {
        ctx.fillStyle = "#f0f6fa"; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill(); ctx.strokeStyle = "#c8d8e0"; ctx.lineWidth = 1; ctx.stroke();
      } else if (style === "quack") {
        ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, 7); ctx.stroke();
      } else if (style === "note") {
        text("♪", b.x, b.y + 5, 16, "#e0b25c", "center", "bold");
      } else if (style === "bubble") {
        ctx.strokeStyle = "rgba(200,235,255,.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.stroke();
      } else if (style === "venom") {
        ctx.fillStyle = "#8fd6a0"; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = b.own ? "#f4e7c9" : "#e08c6a"; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, 7); ctx.fill();
      }
    }
  }
  // INSANE per-run mutators: persistent for the whole voyage, unlike consumeMod's one-shots
  function hasMut(id) { return !!(G && G.mutators && G.mutators.indexOf(id) >= 0); }
  var MUTATOR_LINES = {
    cheese: "🧀 coins are cheese wheels",
    gullswatch: "👀 the gulls are watching",
    bighead: "🗣 big head mode",
    bouncy: "🎈 everything is bouncier"
  };
  // one-shot G.mods flag: read then clear in one call so scenes never forget to reset a mod
  function consumeMod(name) {
    var v = G.mods[name];
    G.mods[name] = false;
    return v;
  }
  // whirlpools: a force field on top of the helm. Inside R, pull grows toward
  // the center and swirls tangentially; you can out-row it at the rim, not the
  // core. Small ones drift down-screen like any hazard; the Old Sow is fixed.
  function applyWhirlpool(dt, wp, shipPX, shipPY) {
    var dx = wp.x - shipPX, dy = wp.y - shipPY, d = Math.hypot(dx, dy);
    if (d > wp.R) return false;
    var pull = wp.k * (1 - d / wp.R);
    var nx = dx / (d || 1), ny = dy / (d || 1);
    var tx = -ny, ty = nx;   // tangent for the swirl
    G.shipX += (nx * pull + tx * pull * 0.7) * dt;
    G.shipY += (ny * pull + ty * pull * 0.7) * dt / Y_SPAN;
    G.shipX = clamp(G.shipX, steerLo(), steerHi());
    G.shipY = clamp(G.shipY, 0, 1);
    return d < wp.R * 0.22;   // true = you've been sucked into the core
  }
  function drawWhirlpool(wp) {
    // deliberately cheap: 4 spirals × 13 segments (was 5 × 27) — the Old Sow
    // draws this across the whole screen every frame, and Chromebooks noticed
    ctx.save(); ctx.translate(wp.x, wp.y);
    for (var ring = 0; ring < 4; ring++) {
      var rr = wp.R * (1 - ring * 0.22);
      ctx.strokeStyle = "rgba(20,40,55," + (0.16 + ring * 0.1) + ")";
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (var a = 0; a <= 13; a++) {
        var ang = a + seaT * (2.4 - ring * 0.3);
        var rad = rr * (0.6 + 0.4 * (a / 13));
        var px = Math.cos(ang) * rad, py = Math.sin(ang) * rad * 0.6;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(5,10,15,.55)"; ctx.beginPath(); ctx.ellipse(0, 0, wp.R * 0.16, wp.R * 0.1, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- difficulty modes
  // The kids asked for tiers. The original tuning is HARD. EASY breathes,
  // EXTREME bites, and beating EXTREME unlocks INSANE — the multiverse run.
  var DIFF = {
    // pickup = how lively the sea feels (higher → more coins/cargo); hazGap = spacing
    // between hazards (higher → fewer, more room); bossThreat = scales EVERY boss's
    // secondary threats (dashes, kegs, spouts, sweeps, mortars, rams) so easy sheds
    // the pile-ups that used to wall players out.
    easy:    { label: "EASY",    color: "#2c5e38", spawn: 1.35, hp: 0.62, fire: 1.5,  spit: 1.5,  storm: 0.8,  heart: 2, score: 0.75, pickup: 1.9,  hazGap: 1.6,  bossThreat: 0.45 },
    hard:    { label: "HARD",    color: "#96341f", spawn: 1,    hp: 1,    fire: 1,    spit: 1,    storm: 1,    heart: 1, score: 1,    pickup: 1.25, hazGap: 1.0,  bossThreat: 1.0 },
    extreme: { label: "EXTREME", color: "#7a1f1f", spawn: 0.72, hp: 1.35, fire: 0.75, spit: 0.65, storm: 1.15, heart: 0, score: 1.3,  pickup: 1.1,  hazGap: 0.82, bossThreat: 1.3 },
    insane:  { label: "INSANE",  color: "#8a2be2", spawn: 0.72, hp: 1.35, fire: 0.75, spit: 0.6,  storm: 1.15, heart: 0, score: 1.5,  pickup: 1.1,  hazGap: 0.82, bossThreat: 1.3 }
  };
  var MODE_ORDER = ["easy", "hard", "extreme", "insane"];
  function gameMode() { return G && DIFF[G.mode] ? G.mode : (DIFF[SAVE.mode] ? SAVE.mode : "hard"); }
  function diff() { return DIFF[gameMode()]; }
  // secondary-threat scaler for bosses: <1 slows/thins the barrage (easy), >1 piles it on.
  function bossThreat() { return diff().bossThreat != null ? diff().bossThreat : 1; }
  // slower cadence on easy, faster on extreme — divide an interval by this to space threats out
  function threatGap(base) { return base / bossThreat(); }
  function insane() { return gameMode() === "insane"; }

  // ---------------------------------------------------------------- the 40-event pool
  // tag: "record" = from the real Whydah story · "yarn" = a sea story · "" = life at sea
  // w: draw weight (3 common, 2 uncommon, 1 rare). fx: {s: score, g: gold, h: hull}
  // mod: run modifier flag. choice: [{l: label, fx, r: result line}]
  var EVENTS = [
    { id: "prize",     w: 3, tag: "record", t: "A prize strikes her colors", b: "A sloop gives up without a fight. Bellamy's way: take the goods, spare the crew.", fx: { g: 35, s: 25 } },
    { id: "golddust",  w: 2, tag: "record", t: "Gold dust in the hold", b: "The Whydah was a trading ship before you took her. Her hold still carries gold and ivory.", fx: { g: 50 } },
    { id: "julian",    w: 2, tag: "record", t: "Julian reads the shoals", b: "John Julian, your Miskito pilot, steers you clear of hidden sandbars. He knows these waters.", fx: { s: 35 } },
    { id: "king",      w: 2, tag: "record", t: "The boy pirate", b: "John King is aboard. He was about nine when he chose to join the crew. The men look out for him.", fx: { s: 20 } },
    { id: "williams",  w: 2, tag: "record", t: "Williams turns for Block Island", b: "Paulsgrave Williams takes his sloop to visit his family. Your consort is gone. You sail alone now.", fx: { s: -10 } },
    { id: "maryanne",  w: 2, tag: "record", t: "The Mary Anne's wine", b: "You take a ship full of Madeira wine. The crew celebrates hard. Too hard.", fx: { g: 40, s: -10 } },
    { id: "careen",    w: 2, tag: "record", t: "Careening", b: "You beach her at low tide and scrape the weed off her hull. Slow work. Good work.", fx: { h: 1 } },
    { id: "council",   w: 2, tag: "record", t: "Council on deck", b: "The crew votes on the next course. Every man gets a say. That was the pirate way.", fx: { s: 25 } },
    { id: "shares",    w: 2, tag: "record", t: "Equal shares", b: "The loot is counted and split. One share for every man, no matter where he was born.", fx: { g: 25, s: 15 } },
    { id: "articles",  w: 2, tag: "record", t: "New hands sign on", b: "Sailors from a prize choose to sign your articles. More hands make her stronger.", fx: { h: 1, s: 10 } },
    { id: "drill",     w: 2, tag: "record", t: "Gun drill", b: "The Whydah carries over two dozen guns. The crew drills until the smoke stings.", fx: { s: 10 }, mod: "drill" },
    { id: "capestorm", w: 2, tag: "record", t: "Storm off the Capes", b: "A gale slams the ship near Virginia. The real crew survived one here too. Barely.", fx: { h: -1, s: 15 } },
    { id: "freeship",  w: 2, tag: "record", t: "What this ship was", b: "The Whydah carried enslaved people before you took her. Some of your crew were enslaved once. Now they are free men aboard her. Nobody says much. Everybody knows.", fx: { s: 30 } },
    { id: "chase",     w: 2, tag: "record", t: "Three day chase", b: "That is how Bellamy caught this very ship. The old hands tell it again. The new hands listen.", fx: { s: 15 } },
    { id: "chart",     w: 2, tag: "record", t: "A better chart", b: "A captured navigator hands over his charts. Now you can see trouble coming.", fx: { s: 15 }, mod: "chart" },
    { id: "freeprince",w: 1, tag: "yarn",   t: "The Free Prince", b: "They say Bellamy made a grand speech about robbing the rich. It comes from a book written years later. The crew likes the story anyway.", fx: { s: 20 } },
    { id: "navysail",  w: 2, tag: "record", t: "A King's ship on the horizon", b: "Man-of-war. Big guns. The crew waits on your word.", choice: [
        { l: "Fight her", r: "You turn to fight. Bold. Maybe too bold.", fx: { s: 30 }, mod: "navy" },
        { l: "Run north", r: "You crowd on sail and slip away in the dark.", fx: { s: 10 } } ] },
    { id: "scurvy",    w: 2, tag: "",       t: "Scurvy signs", b: "Gums bleeding. Old sailors know what comes next without fresh food.", choice: [
        { l: "Buy fresh stores (20 gold)", r: "Limes and greens from a fishing town. The crew mends.", fx: { g: -20 } },
        { l: "Sail on", r: "You push on. Some of the crew get weaker.", fx: { h: -1 } } ] },
    { id: "derelict",  w: 2, tag: "",       t: "A ghost ship drifts past", b: "Sails ragged. Nobody at the wheel. Nobody anywhere.", choice: [
        { l: "Board her", r: "You find a sea chest of coin. And a smell you will not forget.", fx: { g: 45, s: 10 } },
        { l: "Let her pass", r: "Some doors are better left shut. The crew agrees.", fx: { s: 10 } } ] },
    { id: "leaks",     w: 3, tag: "",       t: "Working the pumps", b: "She takes water at the seams. All hands pump through the night.", fx: { s: -10 } },
    { id: "rats",      w: 3, tag: "",       t: "Rats in the bread room", b: "They got into the stores. The cook is furious.", fx: { g: -10 } },
    { id: "doldrums",  w: 3, tag: "",       t: "Dead calm", b: "No wind. The sails hang like laundry. You drift and wait.", fx: { s: -10 } },
    { id: "fog",       w: 2, tag: "record", t: "Fog on the water", b: "A grey wall rolls in. These coasts are famous for it. Sail careful.", fx: { s: 5 }, mod: "fog" },
    { id: "waterspout",w: 2, tag: "",       t: "Waterspout", b: "A twisting rope of sea and sky crosses your bow. The helmsman earns his pay.", fx: { h: -1, s: 20 } },
    { id: "barnacle",  w: 2, tag: "",       t: "Barnacles", b: "Her bottom is fouled and she drags. She will answer the helm slower.", fx: { s: -5 }, mod: "slow" },
    { id: "fishcatch", w: 3, tag: "",       t: "Cod on every line", b: "The Grand Banks feed you well tonight. A fed crew is a strong crew.", fx: { h: 1 } },
    { id: "bilgefire", w: 2, tag: "",       t: "Fire below!", b: "The cook's fire gets loose. Buckets fly. You douse it, but she is scorched.", fx: { h: -1 } },
    { id: "bottle",    w: 2, tag: "",       t: "A bottle in the swell", b: "Inside: half a chart and three coins. Somebody's whole fortune, once.", fx: { g: 20 } },
    { id: "deserter",  w: 2, tag: "",       t: "Navy deserter", b: "He climbs aboard half drowned. He knows how the King's ships fight.", fx: { s: 10 }, mod: "navyintel" },
    { id: "gullthief", w: 3, tag: "",       t: "Gull overboard", b: "A gull steals the lookout's biscuit right out of his hand. The whole watch laughs.", fx: { s: 5 } },
    { id: "dolphins",  w: 3, tag: "",       t: "Dolphins on the bow", b: "They ride your bow wave for a mile. Sailors call it good luck.", fx: { s: 15 } },
    { id: "whale",     w: 2, tag: "",       t: "A whale sounds", b: "A right whale rises beside the hull, breathes, and is gone. The sea goes quiet.", fx: { s: 20 } },
    { id: "sharks",    w: 2, tag: "",       t: "Sharks astern", b: "Fins follow the galley scraps. The fishing lines come in empty. And shorter.", fx: { g: -5 } },
    { id: "turtle",    w: 2, tag: "",       t: "Sea turtle", b: "The old navigator nods at it. Turtles mean land is near, he says.", fx: { s: 10 } },
    { id: "stelmo",    w: 1, tag: "",       t: "St. Elmo's fire", b: "Cold blue flame dances on the mast tops. No heat. No sound. The crew goes quiet.", fx: { s: 20 } },
    { id: "kraken",    w: 1, tag: "yarn",   t: "The old salt's kraken", b: "He swears an arm as thick as the mainmast passed under the keel. It was probably an eel.", fx: { s: 10 } },
    { id: "mermaid",   w: 1, tag: "yarn",   t: "Mermaid off the bow", b: "The new hand spots a mermaid. It is a seal. He will not live this down.", fx: { s: 10 } },
    { id: "dutchman",  w: 1, tag: "yarn",   t: "A sail that glows", b: "A ship crosses the moon with all canvas set and no crew on deck. The watch will not look at her.", fx: { s: 15 } },
    { id: "petrel",    w: 1, tag: "yarn",   t: "Mother Carey's chicken", b: "A storm petrel lands on the rail. Sailors say it carries the souls of drowned men. It stares at you.", fx: { s: 15 } },
    { id: "treasure",  w: 1, tag: "yarn",   t: "A map with an X", b: "Folded in a stolen coat: a map of the Maine islands with a cross in walnut ink. Probably nothing. Probably.", fx: { g: 60 } },
    { id: "warning",   w: 1, tag: "record", t: "The fisherman's warning", b: "An old dory man trades you cod and news. Weather is building to the northeast, he says. Big weather.", fx: { s: 10 }, mod: "warned" },
    // route-exclusive cards: only drawn after the fork, on the matching route
    { id: "sandbar",   w: 3, tag: "",       t: "Aground on a sandbar", route: "shore", b: "She shudders and stops. The tide is falling. Choose fast.", choice: [
        { l: "Kedge her off", r: "Hours of sweat on the capstan. You lose time, not cargo.", fx: { s: -15 } },
        { l: "Throw cargo over", r: "Barrels of loot go over the side. She floats free at once.", fx: { g: -25, s: 10 } } ] },
    { id: "town",      w: 3, tag: "",       t: "A friendly harbor town", route: "shore", b: "No King's men here. Fresh food, pitch, and rested backs. The crew mends the ship and themselves.", fx: { h: 1, s: 10 } },
    { id: "battery",   w: 2, tag: "record", t: "The militia battery", route: "shore", b: "A shore gun barks at your colors. Colonial militias watched these coasts for pirates. You run the point in style.", fx: { h: -1, s: 25 } },
    { id: "wreckers",  w: 2, tag: "yarn",   t: "Lights on the beach", route: "shore", b: "Lanterns swing where no harbor is. Wreckers, luring ships onto the rocks. Or so the old hands swear.", choice: [
        { l: "Steer wide", r: "You give the false lights a wide berth. Wise.", fx: { s: 15 } },
        { l: "Investigate", r: "Just fishermen mending nets by lamplight. The crew feels foolish. The fish is good though.", fx: { g: 15 } } ] },
    { id: "squall",    w: 3, tag: "",       t: "A squall line ahead", route: "sea", b: "A black wall of wind and rain rolls across open water. Nowhere to hide out here.", choice: [
        { l: "Reef the sails", r: "You shorten sail and take it slow and safe.", fx: { s: 10 } },
        { l: "Run before it", r: "You keep every stitch flying. She flies — and the rigging screams.", fx: { s: 35, h: -1 } } ] },
    { id: "following", w: 3, tag: "",       t: "Following seas", route: "sea", b: "Wind and wave line up at your back and shove her north. Best sailing of the whole voyage.", fx: { s: 15 } },
    { id: "whalepod",  w: 2, tag: "",       t: "A whale pod all around", route: "sea", b: "Backs like islands rise on every side. The whole crew hangs on the rail in silence.", fx: { s: 20 } },
    { id: "brendan",   w: 1, tag: "yarn",   t: "St. Brendan's isle", route: "sea", b: "The lookout swears there is an island where no chart shows one. By dawn it is gone. Sailors have told that one for a thousand years.", fx: { s: 15 } },
    // -------- INSANE mode only: the multiverse cards (tag "multi" = 🤯 MULTIVERSE)
    { id: "gullchoir",  w: 3, tag: "multi", ins: true, t: "The gulls start harmonizing", b: "Every gull on the water turns to face the ship and sings one long, perfect chord. Then they all pretend it never happened.", fx: { s: 20 } },
    { id: "wigdolph",   w: 2, tag: "multi", ins: true, t: "A dolphin in a powdered wig", b: "It surfaces wearing a magistrate's wig and regards the crew with enormous disappointment. Three sailors apologize without knowing why.", fx: { s: 25, g: 10 } },
    { id: "biscuittax", w: 2, tag: "multi", ins: true, t: "THE SEAGULL TAX", b: "An extremely organized flock presents the ship with paperwork and levies one biscuit per crewman. No court in the multiverse will hear your case.", fx: { g: -25 } },
    { id: "upsidesea",  w: 2, tag: "multi", ins: true, t: "You drift through the Upside-Sea", b: "For one full watch the fish fly, the gulls swim, and the anchor floats. The less said about what the soup did, the better.", fx: { s: 30, h: -1 } },
    { id: "politewhale", w: 2, tag: "multi", ins: true, t: "A very polite whale", b: "It surfaces alongside, says nothing, nods respectfully at each member of the crew in turn, and leaves. Everyone stands a little straighter.", fx: { s: 10 } },
    { id: "hydrate",   w: 2, tag: "multi", ins: true, t: "A giant emotional-support cup", b: "An enormous pastel tumbler drifts by, full of ice-cold fresh water. The crew is so hydrated. So, so hydrated.", fx: { h: 1 } },
    { id: "gymbird",    w: 2, tag: "multi", ins: true, t: "The bodybuilding albatross", b: "It refuses to fly with the flock. It stays on the bowsprit doing wing exercises with two pieces of driftwood. The crew is inspired.", fx: { s: 15 } },
    { id: "luckwave",   w: 2, tag: "multi", ins: true, t: "A wave of impossible luck", b: "Every rope coils itself. Every knot unties on request. The bosun wins three card games in a row against himself and refuses to explain how.", fx: { s: 35 } },
    { id: "countcrab",  w: 1, tag: "multi", ins: true, t: "The counting crab", b: "A crab boards the ship and counts the cannonballs. It gets a different number every time. Every number is somehow correct.", fx: { s: 15 } },
    { id: "lorefish",  w: 1, tag: "multi", ins: true, t: "The fish with lore", b: "A cod surfaces and explains its tragic backstory in full. It takes forty minutes. Honestly? Kind of fire.", fx: { s: 20, g: 5 } },
    { id: "pugcaptain", w: 1, tag: "multi", ins: true, t: "The pug takes the wheel", b: "For six glorious minutes the ship's pug is captain. It makes no orders, changes no headings, and is the best captain anyone has ever served under.", fx: { s: 20 } },
    { id: "duckdirect",w: 1, tag: "multi", ins: true, t: "A duck asks for directions", b: "A duck the size of a longboat paddles up alongside and asks, quite politely, if this is the way to Maine. The crew is too stunned to lie.", fx: { s: 15, g: 5 } },
    // the 2026 wave — the great meme reset, in period costume
    { id: "memereset",  w: 2, tag: "multi", ins: true, t: "THE GREAT MEME RESET", b: "A wave rolls through the multiverse and every joke on the ship resets to the classics. The bosun tells a knock-knock joke. It absolutely destroys the whole crew.", fx: { s: 30 } },
    { id: "pbplease",   w: 2, tag: "multi", ins: true, t: "\"Peanut butter, please.\"", b: "A colossal, extremely polite grouper surfaces and asks for peanut butter. You have none. It says, \"Peanut butter, please,\" again, exactly as politely. This continues for one hour.", fx: { s: 20, g: -5 } },
    { id: "doomscroll", w: 2, tag: "multi", ins: true, t: "Doomscrolling the logbook", b: "The navigator has been re-reading the same three pages of the ship's log for four hours. 'One more entry,' he says. He does not mean it.", fx: { s: 15, h: -1 } },
    { id: "cityboy",    w: 2, tag: "multi", ins: true, t: "A city boy joins the crew", b: "He has never seen the sea. He calls the mast 'the big pole' and the anchor 'the heavy.' Somehow he is the best sailor aboard by Thursday.", fx: { s: 20, g: 5 } },
    { id: "googoo",     w: 1, tag: "multi", ins: true, t: "The parrot regresses", b: "The ship's parrot, a decorated veteran of four voyages, abruptly switches to baby talk. 'Googoo gaga,' it announces, with the confidence of an admiral. The crew salutes.", fx: { s: 15 } },
    { id: "talltales",  w: 2, tag: "multi", ins: true, t: "Tall tales about the captain", b: "The crew starts a game: the captain once rowed to Maine in one night. The captain counted every fish in the sea, twice. The captain's stare becalms storms. Points for the best one.", fx: { s: 25 } },
    // legends and myths, mission-weighted via m: so they surface near where they belong
    { id: "davyjones", w: 2, tag: "yarn", ins: true,   m: "rhodeisland", t: "Davy Jones' Locker", b: "The old sailors say the locker is where the sea keeps everything it takes — ships, sailors, secrets. Nobody's ever brought back an inventory.", fx: { s: 12 } },
    { id: "fiddlers",  w: 2, tag: "yarn", ins: true,   m: "rhodeisland", t: "Fiddler's Green", b: "Fiddler's Green, the old hands call it — the far shore where the rum never runs dry and the fiddler never stops playing. You have to drown to get there, though. Mixed review.", fx: { s: 12 } },
    { id: "jonah",     w: 2, tag: "",       m: "rhodeisland", t: "A Jonah aboard", b: "A hand swears somebody's bad luck is following the ship. A Jonah, sailors call it — a man who curses a voyage just by being on it.", choice: [
        { l: "Keep him aboard", r: "He stays. The crew mutters, but he's a fine hand with a gun.", fx: { s: -15 } },
        { l: "Set him ashore (10 gold)", r: "You pay him off at the next landing. The crew breathes easier.", fx: { g: -10, s: 10 } } ] },
    { id: "klabauter", w: 2, tag: "yarn", ins: true,   m: "virginia", t: "The Klabautermann", b: "The ship's klabautermann only shows himself when she's doomed, the old hands say. Something small and quick just ducked behind a barrel.", fx: { s: -5 } },
    { id: "selkie",    w: 2, tag: "yarn", ins: true,   m: "gulfstream", t: "A seal with a person's eyes", b: "A seal surfaces close alongside and watches the ship pass, eyes too knowing for a seal's. The new hand swears it sang.", fx: { s: 15 } },
    { id: "aspido",    w: 2, tag: "yarn", ins: true,   m: "windward", t: "The island that swam away", b: "The reef you anchored by last night is gone this morning — the whole island, swum off in the dark. Some islands, the old charts warn, are not islands at all.", fx: { s: 15 } },
    { id: "blackbeard",w: 2, tag: "record", m: "carolina", t: "Tavern talk of Blackbeard", b: "Talk in the tavern is all Edward Thatch — Blackbeard, they're calling him now. Fought these same waters not long before you came through.", fx: { s: 10, g: 5 } },
    { id: "bonnyread", w: 2, tag: "record", t: "Word of Bonny and Read", b: "Word reaches the ship of two more gone on the account — dressed as men, fighting harder than most of the crew. Anne Bonny and Mary Read, the talk says.", fx: { s: 15 } },
    { id: "oldsowlore",w: 2, tag: "record", m: "capecod", t: "An old dory man's warning", b: "An old dory man at the dock warns you: past Eastport the sea turns on itself, wide enough to swallow a sloop whole. Row wide of it, he says. Row wide.", fx: { s: 10 } },
    { id: "chantey",   w: 2, tag: "",       t: "A new chantey", b: "A new chantey spreads through the crew, one hand teaching it to the next until the whole ship is singing it on the capstan.", fx: { s: 12 } }
  ];
  // The guaranteed Cape Cod story beat — not part of the random pool, dealt
  // directly by the "hallett" beat kind. Sets a blessed/cursed mod the storm
  // reads at the Nor'easter finale.
  var HALLETT_EVENT = { id: "hallett", tag: "yarn", t: "Goody Hallett's Curse",
    b: "Maria Hallett — Bellamy's sweetheart, left behind on this same Cape Cod shore. The story says she cursed him for it, and cursed any ship that sails past without paying respect.",
    choice: [
      { l: "Leave an offering (20 gold)", r: "You set gold on the rocks where she's said to walk. The crew feels lighter for it.", fx: { g: -20 }, mod: "blessed" },
      { l: "Sail on", r: "You crowd on sail and don't look back. Some of the crew won't stop looking at the shore.", mod: "cursed" }
    ] };

  // ==================================================================
  // MISSIONS — the campaign. Ten stops, each with its own theme, hazard
  // profile, and objective. This replaces the old shuffled-pool voyage.
  // ==================================================================
  var MISSIONS = [
    { id: "election",    name: "Robin Hood's Men",      nameInsane: "The Group-Chat Coup",
      sub: "Summer 1716 — the Bahamas",
      obj: "Hornigold won't raid an English ship. Take her yourself — and take the crew.",
      decor: "tropics", pal: null, legCount: 0, legMods: {}, slots: { event: [0, 0], mini: [0, 0], battle: 0 },
      signature: "election", battleTier: 0, routeVariant: false, prologue: true },
    { id: "chase",       name: "The Three-Day Chase",   nameInsane: "The Three-Day Staring Contest",
      sub: "February 1717",
      obj: "Ride her wake to close the gap, then pull up alongside and board.",
      decor: "tropics", pal: null, legCount: 0, legMods: {}, slots: { event: [0, 0], mini: [0, 0], battle: 0 },
      signature: "chase", battleTier: 0, routeVariant: false, prologue: true },
    { id: "windward",    name: "Windward Passage",      nameInsane: "The Rubber Duck Shallows",
      sub: "The Island Maze",
      obj: "Thread the channels. A bounty sloop hunts the maze.",
      objInsane: "Thread the channels. Something moves below.",
      decor: "tropics", pal: null, legCount: 2, legMods: { hazChance: 0.24, sharkT: null, narrows: true, whirlpool: 0, fog: false, current: 0, night: false, waterspout: 0, icy: false, mooncusser: false },
      slots: { event: [1, 2], mini: [0, 1], battle: 0 }, signature: "sloopboss", sigInsane: "kraken", battleTier: 1, routeVariant: false },
    { id: "gulfstream",  name: "Florida Straits",       nameInsane: "The Soup Current",
      sub: "The Gulf Stream",
      obj: "Ride the current north. Choose your water.",
      decor: "tropics", pal: null, legCount: 2, legMods: { hazChance: 0.20, sharkT: null, narrows: false, whirlpool: 0, fog: false, current: 0.5, night: false, waterspout: 0, icy: false, mooncusser: false },
      slots: { event: [1, 1], mini: [0, 1], battle: 0 }, signature: "fork", battleTier: 1, routeVariant: false },
    { id: "carolina",    name: "Carolina Coast",        nameInsane: "The Fog of Utter Nonsense",
      sub: "Fog and Shoals",
      obj: "Mind the false lights. Follow the steady flame, not the flicker.",
      decor: "dunes", pal: null, legCount: 2, legMods: { hazChance: 0.26, sharkT: null, narrows: true, whirlpool: 0, fog: true, current: 0, night: false, waterspout: 0, icy: false, mooncusser: true },
      slots: { event: [1, 2], mini: [0, 1], battle: 0 }, signature: "mooncusser", battleTier: 1, routeVariant: true },
    { id: "virginia",    name: "Virginia Capes",        nameInsane: "The Sideways Squall",
      sub: "The Squall",
      obj: "Weather the twisting wind. A powder brig bars the capes.",
      objInsane: "Weather the twisting wind. The forecast says sharks.",
      decor: "dunes", pal: null, legCount: 1, legMods: { hazChance: 0.22, sharkT: null, narrows: false, whirlpool: 0, fog: false, current: 0, night: false, waterspout: 0.5, icy: true, mooncusser: false },
      slots: { event: [1, 1], mini: [0, 1], battle: 0 }, signature: "brigboss", sigInsane: "sharknado", battleTier: 2, routeVariant: true },
    { id: "longisland",  name: "Long Island Sound",     nameInsane: "Duckling Sound",
      sub: "The Hunt",
      obj: "Privateers are working these waters. Sink them before they sink you.",
      decor: "sounds", pal: null, legCount: 1, legMods: { hazChance: 0.20, sharkT: null, narrows: false, whirlpool: 0.3, fog: false, current: 0, night: false, waterspout: 0, icy: true, mooncusser: false },
      slots: { event: [0, 1], mini: [0, 1], battle: 2 }, signature: "flagship", battleTier: 2, routeVariant: true },
    { id: "rhodeisland", name: "Rhode Island Sound",    nameInsane: "The Haunted Piano Sound",
      sub: "The Ghost Light",
      obj: "A light burns where no ship should be. Keep clear of it.",
      decor: "sounds", pal: null, legCount: 2, legMods: { hazChance: 0.20, sharkT: null, narrows: false, whirlpool: 0.3, fog: false, current: 0, night: true, waterspout: 0, icy: true, mooncusser: false },
      slots: { event: [1, 2], mini: [0, 1], battle: 0 }, signature: "palatine", battleTier: 3, routeVariant: false },
    { id: "capecod",     name: "Cape Cod",              nameInsane: "Cape Absurdity",
      sub: "Hallett's Curse",
      obj: "The King's ships bar the last passage north.",
      objInsane: "The last landfall before the run to Maine. Something wants to play.",
      decor: "cape", pal: null, legCount: 1, legMods: { hazChance: 0.22, sharkT: null, narrows: false, whirlpool: 0.5, fog: false, current: 0, night: false, waterspout: 0, icy: true, mooncusser: false },
      slots: { event: [0, 1], mini: [0, 0], battle: 0 }, signature: "blockade", sigInsane: "serpent", battleTier: 3, routeVariant: false },
    // the multiverse runs longer than history: two mythic legs exist only in INSANE
    { id: "locker",      name: "The Locker",            nameInsane: "Davy Jones' Locker", insaneOnly: true,
      sub: "Below everything",
      obj: "The sea keeps what it takes. Sail through the keeper's yard.",
      decor: "cape", pal: null, legCount: 1, legMods: { hazChance: 0.26, sharkT: null, narrows: false, whirlpool: 0.5, fog: false, current: 0, night: true, waterspout: 0, icy: false, mooncusser: false },
      slots: { event: [1, 2], mini: [0, 1], battle: 0 }, signature: "davyjones", battleTier: 3, routeVariant: false },
    { id: "poseidon",    name: "Poseidon's Domain",     nameInsane: "Poseidon's Domain", insaneOnly: true,
      sub: "The old god has noticed you",
      obj: "Nobody sails through his water without paying the toll.",
      decor: "none", pal: null, legCount: 1, legMods: { hazChance: 0.22, sharkT: null, narrows: false, whirlpool: 0.6, fog: false, current: 0.4, night: false, waterspout: 0.6, icy: false, mooncusser: false },
      slots: { event: [1, 2], mini: [0, 1], battle: 0 }, signature: "poseidon", battleTier: 3, routeVariant: false },
    { id: "noreaster",   name: "The Nor'easter",        nameInsane: "The Chaos Vortex",
      sub: "April 26, 1717",
      obj: "The wolf pack, the storm, and whatever waits past it.",
      decor: "cape", pal: null, legCount: 0, legMods: {}, slots: { event: [0, 0], mini: [0, 0], battle: 0 },
      signature: "finale", battleTier: 3, routeVariant: false }
  ];
  function mission() { return MISSIONS[clamp(G ? G.mIndex : 0, 0, MISSIONS.length - 1)]; }
  function missionName() { var m = mission(); return (insane() && m.nameInsane) ? m.nameInsane : m.name; }
  function runPos() { var i = G.runMissions ? G.runMissions.indexOf(G.mIndex) : -1; return i >= 0 ? i : G.mIndex; }
  function runCount() { return (G.runMissions && G.runMissions.length) || MISSIONS.length; }
  function setProgress() { G.progress = clamp((runPos() + G.mFrac) / runCount(), 0, 1); }

  // ---------------------------------------------------------------- palettes
  var PALETTES = [
    { name: "Clear morning", sky: ["#bfe0e8", "#7fb2c0"], sea: ["#2b6c86", "#0f3448"], foam: "#dff1f4", land: "#6f8f5a", tint: "#ffe9b0" },
    { name: "Bright noon",   sky: ["#a9d8ef", "#6fb0d6"], sea: ["#227a9b", "#0c3a52"], foam: "#eafaff", land: "#7a9a5e", tint: "#fff6d6" },
    { name: "Golden dusk",   sky: ["#f4c98a", "#c9718a"], sea: ["#3a5f7a", "#152a3f"], foam: "#ffe6cf", land: "#5f7350", tint: "#ffcf8a" },
    { name: "Grey fog",      sky: ["#c7cdd0", "#9aa7ae"], sea: ["#3d5964", "#182833"], foam: "#e8eef0", land: "#66756a", tint: "#dfe6e6" },
    { name: "Moonlit night", sky: ["#25324a", "#141d30"], sea: ["#1b3a52", "#08182a"], foam: "#bcd6e8", land: "#3f5148", tint: "#9fb6d6" }
  ];
  var STORM_PAL = { sky: ["#3a3c46", "#15161c"], sea: ["#25313b", "#0a1016"], foam: "#c4d2da", land: "#3a473f", tint: "#8ea0b4" };
  // insane mode: the sea forgot what color it is
  var PALETTES_INSANE = [
    { name: "Hot pink dimension", sky: ["#ff9de2", "#c94fb8"], sea: ["#7a1f6e", "#2e0a3f"], foam: "#ffd6f4", land: "#5e8a3a", tint: "#ff9de2" },
    { name: "Slime tide",         sky: ["#d8ff9d", "#7ec94f"], sea: ["#2e7a1f", "#0a3f14"], foam: "#eaffd6", land: "#8a5e3a", tint: "#d8ff9d" },
    { name: "Vaporwave",          sky: ["#9dc8ff", "#7a4fc9"], sea: ["#1f2e7a", "#0a0a3f"], foam: "#d6e2ff", land: "#c95e8a", tint: "#b49dff" },
    { name: "Orange juice sea",   sky: ["#ffe29d", "#ff9d4f"], sea: ["#b8641f", "#5c2a0a"], foam: "#fff0d6", land: "#3a8a5e", tint: "#ffd08a" }
  ];

  // ---------------------------------------------------------------- run state
  var G = null;
  function isBad(ev) { if (ev.choice) return false; var f = ev.fx || {}; return (f.s || 0) < 0 || (f.g || 0) < 0 || (f.h || 0) < 0; }
  function pickEvents(n, route, exclude, preferMission) {
    exclude = exclude || [];
    var pool = EVENTS.filter(function (e) {
      if (!!e.ins !== insane()) return false;   // multiverse cards only in insane mode — and only them
      return (!e.route || e.route === route) && exclude.indexOf(e.id) < 0;
    }), out = [];
    function wOf(e) {
      var w = e.w + (e.route && e.route === route ? 2 : 0);   // route cards front and center
      if (preferMission && e.m === preferMission) w += 3;      // cards weighted toward their home mission
      return w;
    }
    function draw() {
      var tot = 0, i; for (i = 0; i < pool.length; i++) tot += wOf(pool[i]);
      var r = Math.random() * tot;
      for (i = 0; i < pool.length; i++) { r -= wOf(pool[i]); if (r <= 0) break; }
      return pool.splice(Math.min(i, pool.length - 1), 1)[0];
    }
    while (out.length < n && pool.length) {
      var ev = draw();
      if (isBad(ev) && chance(upgLvl("charm") * 0.3) && pool.length) {
        var ev2 = draw();
        out.push(ev2);                      // the charm turns the bad card face down
      } else out.push(ev);
    }
    return out;
  }
  // after the fork: swap every not-yet-played event card for a route-flavored draw
  function rerollEvents(route) {
    var used = [], slots = [], i;
    for (i = 0; i < G.seq.length; i++) if (G.seq[i].ev) {
      if (i <= G.seqIndex) used.push(G.seq[i].ev.id);
      else slots.push(i);
    }
    var fresh = pickEvents(slots.length, route, used);
    for (i = 0; i < slots.length && i < fresh.length; i++) G.seq[slots[i]].ev = fresh[i];
    G.events = [];
    for (i = 0; i < G.seq.length; i++) if (G.seq[i].ev) G.events.push(G.seq[i].ev.id);
  }

  // stamp every beat with its position within its own mission, so the HUD
  // (and StormScene's continuous fury-based fraction) can compute mFrac
  function stampMissionBeats() {
    var byM = {};
    for (var i = 0; i < G.seq.length; i++) { var b = G.seq[i]; (byM[b.m] = byM[b.m] || []).push(b); }
    for (var mk in byM) { var arr = byM[mk]; for (var j = 0; j < arr.length; j++) { arr[j].mBeatIdx = j; arr[j].mBeatCount = arr.length; } }
  }

  function newGame(fromMission) {
    var runMode = DIFF[SAVE.mode] ? SAVE.mode : "hard";
    if (runMode === "insane" && !(SAVE.extremeWon || SAVE.secretUnlock)) runMode = "hard";   // no sneaking in — beat EXTREME or speak the secret word
    var startM = clamp(fromMission || 0, 0, MISSIONS.length - 1);
    var maxH = 5 + upgLvl("hull") + (runMode === "easy" ? 1 : 0);
    G = {
      score: 0, gold: 0, hull: maxH, maxHull: maxH, mode: runMode, unlockedInsane: false,
      seq: [], seqIndex: -1, progress: 0, mIndex: startM, mFrac: 0, startMission: startM,
      pal: choice(runMode === "insane" ? PALETTES_INSANE : PALETTES), shipX: 0.5, shipY: 0.7, route: "", iframes: 0, coinStreak: 0,
      combo: 0, comboT: 0, comboBest: 0, comboPop: 0, comboGold: 0, special: 0, blastReq: false, blastReady: false, blastFx: 0, taughtCombo: false,
      preStormScore: 0, reachedStorm: false, stormT: 0, capped: false, won: false, stormCleared: false, ended: false, banked: false,
      rank: "", serpentBeaten: false, bossBeaten: false, shipsBeaten: 0, battleNum: 0,
      firstRun: SAVE.runs === 0, mods: {}, curBeat: "title", events: [], gullFlip: false, cargo: 0,
      // INSANE: two per-run mutators, drawn fresh every voyage and announced on the first mission card
      mutators: runMode === "insane" ? shuffle(["cheese", "gullswatch", "bighead", "bouncy"]).slice(0, 2) : []
    };
    // Build the voyage mission by mission: an intro card, then sail legs with
    // that mission's random events/minis/battles spread through the gaps,
    // then the mission's signature beat, then a port call before the next.
    var usedEventIds = [];
    G.seq = [];
    // the run's mission list: INSANE sails the whole multiverse (extra mythic
    // legs included); every other mode sails only the historical ladder. This
    // is the FULL campaign for the mode (numbering/pips/progress context) — a
    // resumed run still shows "M9 of 10", not "M1 of 2".
    G.runMissions = [];
    for (var rm = 0; rm < MISSIONS.length; rm++) {
      if (MISSIONS[rm].insaneOnly && runMode !== "insane") continue;
      G.runMissions.push(rm);
    }
    // but only build beats from the resume point forward
    var buildFrom = G.runMissions.filter(function (m) { return m >= startM; });
    for (var ri = 0; ri < buildFrom.length; ri++) {
      var mi = buildFrom[ri];
      var msn = MISSIONS[mi];
      G.seq.push({ kind: "missionIntro", m: mi });

      var randomBeats = [];
      var nEv = randInt(msn.slots.event[0], msn.slots.event[1]);
      if (nEv > 0) {
        var evs = pickEvents(nEv, G.route, usedEventIds, msn.id);
        evs.forEach(function (e) { usedEventIds.push(e.id); G.events.push(e.id); randomBeats.push({ kind: "event", ev: e, m: mi }); });
      }
      var nMini = randInt(msn.slots.mini[0], msn.slots.mini[1]);
      if (nMini > 0) {
        var minisPool = shuffle(["backstaff", "leadline", "logline"]);
        for (var k = 0; k < nMini; k++) randomBeats.push({ kind: "mini", which: minisPool[k % 3], m: mi });
      }
      for (var k2 = 0; k2 < msn.slots.battle; k2++) randomBeats.push({ kind: "battle", m: mi });
      // a trading brig works these waters: sail legs from Windward on have a
      // fair chance of a merchant hail (buy repairs, powder, or port cargo)
      if (msn.legCount > 0 && mi >= 2 && chance(0.5)) randomBeats.push({ kind: "merchant", m: mi });
      shuffle(randomBeats);

      var legs = msn.legCount;
      if (legs > 0) {
        var gaps = legs + 1, bucket = [];
        for (var gi = 0; gi < gaps; gi++) bucket.push([]);
        randomBeats.forEach(function (rb, idx) { bucket[idx % gaps].push(rb); });
        for (var li = 0; li < legs; li++) {
          bucket[li].forEach(function (rb) { G.seq.push(rb); });
          G.seq.push({ kind: "sail", m: mi });
        }
        bucket[legs].forEach(function (rb) { G.seq.push(rb); });
      } else {
        randomBeats.forEach(function (rb) { G.seq.push(rb); });
      }

      // Goody Hallett's curse: a guaranteed story beat, not part of the
      // random pool, right before Cape Cod's serpent encounter
      if (msn.id === "capecod") G.seq.push({ kind: "hallett", m: mi });

      var sig = (runMode === "insane" && msn.sigInsane) ? msn.sigInsane : msn.signature;
      if (sig === "finale") {
        G.seq.push({ kind: "squadron", m: mi });
        G.seq.push({ kind: "storm", m: mi });
        G.seq.push({ kind: "boss", m: mi });
        G.seq.push({ kind: "oldsow", m: mi });   // the great whirlpool guarding the harbor mouth, after the boss
      } else if (sig) {
        G.seq.push({ kind: sig, m: mi });
      }

      if (ri < buildFrom.length - 1) G.seq.push({ kind: "port", m: mi });
    }
    stampMissionBeats();
  }

  function addScore(n) { G.score += n; if (G.score < 0) G.score = 0; }
  function addGold(n) { G.gold += n; if (G.gold < 0) G.gold = 0; }
  var redFlash = 0;
  function damage(n) {
    if (G.iframes > 0 || G.ended) return;    // a hit buys a breath of grace
    G.hull -= n; G.iframes = gameMode() === "easy" ? 1.05 : 0.7; G.coinStreak = 0; redFlash = 0.15;   // easy gets a longer breath of grace
    comboBreak();                                        // a hit snaps the chain
    G.special = Math.max(0, (G.special || 0) - (gameMode() === "easy" ? 0.12 : 0.25)); if (G.special < 1) G.blastReady = false;
    SFX.hit(); shake(6 + n * 2);
    spawn(G.shipX * W, shipYPx() - 50, { vy: -55, life: 1.0, r: 15, c: "#ff8a7a", shape: "txt", txt: "-" + n + " ♥" });
    if (G.hull <= 0) { G.hull = 0; endRun(false, true); }
  }
  function repair(n) { G.hull = clamp(G.hull + n, 0, G.maxHull); }
  // little banner queue for "your upgrade just did something" moments
  var toasts = [];
  function toast(msg) { toasts.push({ msg: msg, t: 0 }); if (toasts.length > 3) toasts.shift(); }
  function drawToasts(dt) {
    for (var i = toasts.length - 1; i >= 0; i--) {
      var tt = toasts[i]; tt.t += dt;
      if (tt.t > 1.4) { toasts.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(1.4 - tt.t, 0, 1) * clamp(tt.t * 6, 0, 1);
      text(tt.msg, W / 2, 72 + i * 20, 13, "#ffe1b0", "center", "bold");
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- particles + shake
  var parts = [];
  function spawn(x, y, opt) {
    if (parts.length > 200) parts.shift();   // hard cap — burst-heavy scenes (storm) can't pile up a lag swamp
    parts.push({ x: x, y: y, vx: opt.vx || 0, vy: opt.vy || 0, life: opt.life || 0.6, t: 0,
      r: opt.r || 3, c: opt.c || "#fff", g: opt.g || 0, fade: opt.fade !== false, shape: opt.shape || "dot", txt: opt.txt || "" });
  }
  function splash(x, y, n, col) { for (var i = 0; i < (n || 8); i++) spawn(x, y, { vx: rand(-70, 70), vy: rand(-160, -40), g: 320, life: rand(0.4, 0.9), r: rand(1.5, 3.5), c: col || "#dff1f4" }); }
  function smoke(x, y, n) { for (var i = 0; i < (n || 6); i++) spawn(x, y, { vx: rand(-25, 25), vy: rand(-40, -10), g: -8, life: rand(0.6, 1.2), r: rand(4, 9), c: "rgba(60,60,66,.6)", shape: "smoke" }); }
  function coinBurst(x, y) { for (var c = 0; c < 6; c++) spawn(x, y, { vx: rand(-40, 40), vy: rand(-90, -20), g: 200, life: 0.6, r: 2.5, c: "#f7d84a" }); }
  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.t += dt;
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t >= p.life) parts.splice(i, 1);
    }
  }
  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], a = p.fade ? clamp(1 - p.t / p.life, 0, 1) : 1;
      ctx.globalAlpha = a;
      if (p.shape === "txt") { text(p.txt, p.x, p.y, p.r, p.c, "center", "bold"); ctx.globalAlpha = 1; continue; }
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.shape === "smoke" ? p.r * (1 + p.t) : p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  var shakeAmt = 0;
  function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

  // ==================================================================
  // COMBO CHAIN + POWDER BLAST — a skill loop that rides on top of every
  // fight. Land hits without getting tagged and the chain climbs, paying
  // an escalating plunder bonus every fifth link; dodge shots by a hair to
  // charge the BLAST — a screen-clearing broadside you set off (Q / ⚡) when
  // the fire gets thick. It all funnels through stepBalls + damage, so it
  // lights up every combat scene at once. Getting hit snaps the chain.
  // ==================================================================
  var COMBO_WINDOW = 2.4;   // seconds after the last hit before the chain cools
  function comboColor() {
    var c = G ? G.combo : 0;
    return c >= 24 ? "#ff5a4a" : c >= 16 ? "#ff9a3c" : c >= 8 ? "#ffd24a" : "#f4e7c9";
  }
  function comboMult() { return 1 + Math.min(5, Math.floor((G.combo || 0) / 4)); }   // +1 score per hit at x1, up to +6
  // every enemy hit: the chain climbs, the window refreshes, each rung of
  // five pays plunder and tops up the blast.
  var COMBO_GOLD_CAP = 300;   // combo-milestone gold is capped per run so a long chain can't farm the bank
  function comboHit(x, y) {
    if (!G) return;
    G.combo++; G.comboT = COMBO_WINDOW; G.comboPop = 1;
    if (G.combo > (G.comboBest || 0)) G.comboBest = G.combo;
    charge(0.05);
    if (G.combo === 3 && !G.taughtCombo) { G.taughtCombo = true; toast("🔥 CHAIN! keep hitting — don't get tagged"); }
    if (G.combo % 5 === 0) {
      var tier = G.combo / 5, bonus = 10 * tier;
      addScore(bonus * 2); charge(0.15); SFX.win();
      // gold is the banked currency — reward it, but cap the run's combo gold
      var gold = clamp(COMBO_GOLD_CAP - (G.comboGold || 0), 0, bonus);
      G.comboGold = (G.comboGold || 0) + gold; addGold(gold);
      spawn(x != null ? x : W / 2, (y != null ? y : H * 0.4) - 24, { vy: -60, life: 1.1, r: 16, c: comboColor(), shape: "txt", txt: "x" + G.combo + "  PLUNDER" + (gold > 0 ? " +" + gold + "🪙" : " +" + (bonus * 2)) });
    }
  }
  function comboBreak() { if (G) { G.combo = 0; G.comboT = 0; } }
  function charge(a) {
    if (!G) return;
    G.special = clamp((G.special || 0) + a, 0, 1);
    if (G.special >= 1 && !G.blastReady) { G.blastReady = true; SFX.good(); toast("⚡ BLAST READY — press Q / tap ⚡"); }
  }
  // a near-miss: an enemy shot that whistles past within a hair. Charges the
  // blast and keeps the chain warm — the reward for sailing into the teeth.
  function grazeBall(b) {
    if (b.grazed || !G) return;
    b.grazed = true; charge(0.08); addScore(2);
    if (G.comboT > 0) G.comboT = Math.min(COMBO_WINDOW, G.comboT + 0.5);
    spawn(b.x, b.y, { vy: -30, life: 0.5, r: 11, c: "#bfe6ff", shape: "txt", txt: "✦" });
    SFX.point();
  }
  // set off the blast: sweep the shots coming at you, land one free hit on
  // every live target, buy a breath of grace. Consumed once per press.
  function fireBlast(balls, targets, ship) {
    if (!G || !G.blastReq) return;
    G.blastReq = false;
    if ((G.special || 0) < 1 || !ship) return;
    G.special = 0; G.blastReady = false; G.blastFx = 0.5; G.iframes = Math.max(G.iframes, 0.6);
    SFX.fire(); SFX.win(); shake(15);
    for (var i = balls.length - 1; i >= 0; i--) { if (!balls[i].own) { splash(balls[i].x, balls[i].y, 4, "#bfe6ff"); balls.splice(i, 1); } }
    var fake = { x: ship.x, y: (ship.y || 0) - 40, own: 1, blast: 1 };
    for (var ti = 0; ti < targets.length; ti++) { try { targets[ti].onHit(fake); } catch (e) {} }
    for (var k = 0; k < 26; k++) spawn(ship.x, ship.y, { vx: rand(-260, 260), vy: rand(-260, 60), g: 220, life: rand(0.4, 0.8), r: rand(2, 4), c: choice(["#ffd24a", "#bfe6ff", "#fff", "#ffcf6a"]) });
  }
  // combo/blast timers tick from the main loop so every scene shares them
  function updateCombo(dt) {
    if (!G) return;
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) comboBreak(); }
    if (G.comboPop > 0) G.comboPop = Math.max(0, G.comboPop - dt * 3);
    if (G.blastFx > 0) G.blastFx -= dt;
    var bb = typeof document !== "undefined" && document.getElementById("btn-blast");
    if (bb) bb.classList.toggle("ready", (G.special || 0) >= 1);
  }
  // the combo/blast HUD overlay — drawn by drawHUD, so it shows in combat only
  function drawComboHUD() {
    if (!G) return;
    var pad = 12;
    if (G.combo >= 2) {
      var pop = 1 + (G.comboPop || 0) * 0.55, sz = 19 * pop, cy = 70;
      ctx.textAlign = "right"; ctx.font = "bold " + sz.toFixed(1) + "px Georgia, serif";
      ctx.fillStyle = comboColor(); ctx.fillText("🔥 x" + G.combo, W - pad, cy);
      ctx.textAlign = "left";
      var cw = 74, cx = W - pad - cw;
      ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.fillRect(cx, cy + 6, cw, 3);
      ctx.fillStyle = comboColor(); ctx.fillRect(cx, cy + 6, cw * clamp(G.comboT / COMBO_WINDOW, 0, 1), 3);
    }
    var full = (G.special || 0) >= 1;
    if ((G.special || 0) > 0.001 || full) {
      var sw = clamp(W * 0.3, 120, 240), sx = (W - sw) / 2, sy = H - 24;
      ctx.fillStyle = "rgba(11,22,32,.5)"; roundRect(sx - 3, sy - 3, sw + 6, 12, 6); ctx.fill();
      ctx.fillStyle = full ? "#ffd24a" : "rgba(191,230,255,.9)";
      roundRect(sx, sy, sw * clamp(G.special || 0, 0, 1), 6, 3); ctx.fill();
      if (full) {
        ctx.globalAlpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(seaT * 8));
        text("⚡ BLAST READY " + (isTouch ? "— tap ⚡" : "— press Q"), W / 2, sy - 8, 11, "#ffe1b0", "center", "bold");
        ctx.globalAlpha = 1;
      } else {
        text("⚡", sx - 14, sy + 6, 11, "rgba(244,231,201,.55)", "center");
      }
    }
    if (G.blastFx > 0) {
      ctx.fillStyle = "rgba(255,225,150," + clamp(G.blastFx * 0.6, 0, 0.4) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------------------------------------------------------------- sea + ambient life
  var seaT = 0, coast = [], gulls = [];
  function seedCoast() {
    coast = [];
    // You're coasting north with the mainland to the west — so land sits on the
    // LEFT (port) side, open ocean to the right. A few small islands stand off
    // to seaward for variety, clearly surrounded by water.
    for (var i = 0; i < 40; i++) {
      var isle = chance(0.15);
      coast.push({
        y: rand(-H, H), side: isle ? 1 : 0, isle: isle,
        w: isle ? rand(16, 28) : rand(34, 92),
        h: isle ? rand(24, 44) : rand(50, 130),
        d: Math.random()
      });
    }
  }
  // gulls wheel over the open water to seaward — never over the shore on the left
  var GULL_LO = 0.30, GULL_HI = 0.80;
  function spawnGull() {
    if (gulls.length >= 4) return;   // they wheel forever now, so cap the flock
    gulls.push({ x: rand(GULL_LO, GULL_HI) * W, y: rand(H * 0.05, H * 0.17), vx: (chance(0.5) ? 1 : -1) * rand(20, 40), ph: rand(0, 6), s: rand(0.7, 1.15) });
  }
  function updateGulls(dt) {
    if (gulls.length < 3 && chance(0.006)) spawnGull();
    var watching = hasMut("gullswatch");
    for (var i = gulls.length - 1; i >= 0; i--) {
      var g = gulls[i]; g.x += g.vx * dt; g.ph += dt * 9; g.y += Math.sin(g.ph * 0.3) * 6 * dt;
      if (g.x < GULL_LO * W || g.x > GULL_HI * W) g.vx *= -1;   // wheel back over the water, don't drift onto land
      if (watching && G) g.vx = lerp(g.vx, Math.sign(G.shipX * W - g.x) * 26, 0.4 * dt);   // they track the ship, unblinking
    }
  }
  function drawGulls(pal) {
    ctx.strokeStyle = pal.sky[1] === "#141d30" ? "rgba(200,215,230,.7)" : "rgba(40,50,60,.75)";
    ctx.lineWidth = 2; ctx.lineCap = "round";
    var flip = (G && G.gullFlip) ? -1 : 1;   // insane-mode chaos: they fly upside down
    for (var i = 0; i < gulls.length; i++) {
      var g = gulls[i], f = Math.sin(g.ph) * 4 * g.s, s = 7 * g.s;
      ctx.beginPath();
      ctx.moveTo(g.x - s, g.y + f); ctx.quadraticCurveTo(g.x - s * 0.4, g.y - 3 * g.s * flip, g.x, g.y);
      ctx.quadraticCurveTo(g.x + s * 0.4, g.y - 3 * g.s * flip, g.x + s, g.y + f);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }
  // what stands on the shore is driven by the current mission's decor bucket
  function drawCoastDecor(cx, y, o) {
    var decor = (G && MISSIONS[G.mIndex]) ? MISSIONS[G.mIndex].decor : "tropics";
    var top = y - o.h * 0.55;
    if (decor === "tropics") {
      if (o.d < 0.6) drawPalm(cx + (o.d - 0.3) * o.w, top, 0.8 + o.d * 0.5);
    } else if (decor === "dunes") {
      if (o.d < 0.5) drawPine(cx + (o.d - 0.25) * o.w, top, 0.7 + o.d * 0.6);
      else if (o.d < 0.7) { ctx.fillStyle = "#d8c690"; ctx.beginPath(); ctx.ellipse(cx, top + 6, o.w * 0.5, 8, 0, 0, 7); ctx.fill(); }
    } else if (decor === "sounds") {
      if (o.d < 0.55) { drawPine(cx - o.w * 0.2, top, 0.9); drawPine(cx + o.w * 0.25, top + 4, 0.7); }
      else if (o.d < 0.7) drawCottage(cx, top);
    } else {                                            // cape: lighthouses on the rocks
      if (o.d < 0.35) drawLighthouse(cx, top);
      else if (o.d < 0.7) drawPine(cx + (o.d - 0.5) * o.w, top, 0.75);
    }
  }
  function drawPalm(x, y, s) {
    ctx.strokeStyle = "#7a5a34"; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 5 * s, y - 12 * s, x + 8 * s, y - 24 * s); ctx.stroke();
    ctx.strokeStyle = "#4e7a3a"; ctx.lineWidth = 2.5 * s;
    for (var a = 0; a < 5; a++) { var ang = -2.4 + a * 0.55; ctx.beginPath(); ctx.moveTo(x + 8 * s, y - 24 * s); ctx.quadraticCurveTo(x + 8 * s + Math.cos(ang) * 10 * s, y - 24 * s + Math.sin(ang) * 10 * s - 4 * s, x + 8 * s + Math.cos(ang) * 16 * s, y - 24 * s + Math.sin(ang) * 16 * s); ctx.stroke(); }
  }
  function drawPine(x, y, s) {
    ctx.fillStyle = "#2f4d33";
    ctx.beginPath(); ctx.moveTo(x, y - 26 * s); ctx.lineTo(x + 9 * s, y - 6 * s); ctx.lineTo(x - 9 * s, y - 6 * s); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y - 18 * s); ctx.lineTo(x + 12 * s, y + 2 * s); ctx.lineTo(x - 12 * s, y + 2 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#5a3a22"; ctx.fillRect(x - 2 * s, y + 2 * s, 4 * s, 6 * s);
  }
  function drawCottage(x, y) {
    ctx.fillStyle = "#8a7a5e"; ctx.fillRect(x - 9, y - 8, 18, 10);
    ctx.fillStyle = "#5a3a22"; ctx.beginPath(); ctx.moveTo(x - 11, y - 8); ctx.lineTo(x, y - 17); ctx.lineTo(x + 11, y - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffd98a"; ctx.fillRect(x - 3, y - 5, 5, 5);
  }
  function drawLighthouse(x, y) {
    ctx.fillStyle = "#e8e2d4";
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 4, y - 26); ctx.lineTo(x + 4, y - 26); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#96341f"; ctx.fillRect(x - 5.4, y - 18, 10.8, 5);
    ctx.fillStyle = "#ffd24a"; ctx.fillRect(x - 4, y - 31, 8, 5);
    ctx.fillStyle = "#3a3f45"; ctx.beginPath(); ctx.moveTo(x - 5, y - 31); ctx.lineTo(x, y - 36); ctx.lineTo(x + 5, y - 31); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,210,74," + (0.15 + 0.15 * Math.sin(seaT * 2)) + ")";
    ctx.beginPath(); ctx.moveTo(x, y - 29); ctx.lineTo(x + 34, y - 40); ctx.lineTo(x + 34, y - 18); ctx.closePath(); ctx.fill();
  }
  function drawSea(pal, scroll, stormy) {
    var skyH = H * 0.2;
    var sg = ctx.createLinearGradient(0, 0, 0, skyH);
    sg.addColorStop(0, pal.sky[0]); sg.addColorStop(1, pal.sky[1]);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, skyH);
    var g = ctx.createLinearGradient(0, skyH, 0, H);
    g.addColorStop(0, pal.sea[0]); g.addColorStop(1, pal.sea[1]);
    ctx.fillStyle = g; ctx.fillRect(0, skyH, W, H - skyH);
    ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(0, skyH - 2, W, 4);
    ctx.strokeStyle = pal.foam;
    // 16 rows at a 34px step (was 22 × 24px) — halves the per-frame line work
    // in the busiest scenes (storm) with no visible change at these alphas
    for (var r = 0; r < 16; r++) {
      var y = skyH + ((r * 62 + (scroll % 62)) % (H - skyH));
      var depth = (y - skyH) / (H - skyH);
      ctx.globalAlpha = 0.05 + depth * 0.12;
      ctx.lineWidth = 1 + depth * 1.6;
      ctx.beginPath();
      for (var x = 0; x <= W; x += 34) {
        var yy = y + Math.sin((x * 0.02) + seaT * (stormy ? 4 : 1.6) + r) * (2 + depth * (stormy ? 10 : 5));
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    var shoreMul = (G && G.route === "shore") ? 1.35 : 1;   // the fork changes what the coast looks like
    for (var c = 0; c < coast.length; c++) {
      var o = coast[c];
      if (G && G.route === "sea" && !o.isle && c % 4 !== 0) continue;  // out to sea: land is only a rumor
      o.y += (stormy ? 90 : 55) * 0.016 * (0.6 + (c % 3) * 0.2);
      var yy2 = (o.y % (H + 260)); if (yy2 < -160) yy2 += H + 260;
      if (yy2 > skyH - 40 && yy2 < H + 40) {
        var ew = o.isle ? o.w : o.w * shoreMul;
        // mainland hugs the left edge; islands stand off in open water to the right
        var cx = o.isle ? (W - ew * 1.5 - W * 0.02) : (-10 + ew * 0.4);
        ctx.fillStyle = pal.land; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(cx, yy2, ew, o.h, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.15)";
        ctx.beginPath(); ctx.ellipse(cx, yy2 + o.h * 0.6, ew * 1.05, o.h * 0.25, 0, 0, 7); ctx.fill();
        drawCoastDecor(cx, yy2, o);
        ctx.globalAlpha = 1;
      }
    }
    drawGulls(pal);
    ctx.fillStyle = pal.tint; ctx.globalAlpha = stormy ? 0.05 : 0.045; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    if (G && G.mods.fogNow) { ctx.fillStyle = "rgba(200,208,212,.32)"; ctx.fillRect(0, 0, W, H); }
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.35)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- sprites
  function drawShip(x, y, s, opt) {
    opt = opt || {};
    ctx.save(); ctx.translate(x, y); ctx.rotate(opt.rot || 0);
    if (opt.blink) ctx.globalAlpha = 0.35;
    if (opt.whydah) s *= 1.094;   // she's a bigger ship once you've boarded her
    var bob = Math.sin(seaT * 2 + (opt.phase || 0)) * 2 * (hasMut("bouncy") ? 2.4 : 1);
    ctx.translate(0, bob);
    if (opt.wake) { ctx.fillStyle = "rgba(223,241,244,.5)"; ctx.beginPath(); ctx.moveTo(-6 * s, 10 * s); ctx.lineTo(6 * s, 10 * s); ctx.lineTo(2 * s, 30 * s); ctx.lineTo(-2 * s, 30 * s); ctx.closePath(); ctx.fill(); }
    var hullC = opt.hull || "#5a3a22", deck = opt.deck || "#8a5a34";
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(0, 14 * s, 15 * s, 5 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = hullC;
    ctx.beginPath();
    ctx.moveTo(0, -22 * s); ctx.quadraticCurveTo(15 * s, -6 * s, 12 * s, 12 * s);
    ctx.quadraticCurveTo(0, 20 * s, -12 * s, 12 * s);
    ctx.quadraticCurveTo(-15 * s, -6 * s, 0, -22 * s); ctx.fill();
    if (opt.trim) { ctx.strokeStyle = opt.trim; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(-11 * s, 6 * s); ctx.quadraticCurveTo(0, 12 * s, 11 * s, 6 * s); ctx.stroke(); }
    ctx.fillStyle = deck; ctx.beginPath();
    ctx.moveTo(0, -16 * s); ctx.quadraticCurveTo(9 * s, -4 * s, 7 * s, 9 * s);
    ctx.quadraticCurveTo(0, 14 * s, -7 * s, 9 * s);
    ctx.quadraticCurveTo(-9 * s, -4 * s, 0, -16 * s); ctx.fill();
    ctx.strokeStyle = "#3a2414"; ctx.lineWidth = 1.4 * s;
    ctx.beginPath(); ctx.moveTo(0, 10 * s); ctx.lineTo(0, -20 * s); ctx.stroke();
    ctx.fillStyle = opt.sail || "#f3ead2";
    ctx.beginPath(); ctx.moveTo(-9 * s, -14 * s); ctx.quadraticCurveTo(0, -18 * s, 9 * s, -14 * s); ctx.lineTo(6 * s, -2 * s); ctx.quadraticCurveTo(0, -5 * s, -6 * s, -2 * s); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.15)"; ctx.stroke();
    if (opt.flag) { ctx.fillStyle = opt.flag; ctx.fillRect(0, -22 * s, 9 * s, 5 * s); }
    if (opt.dmg) { for (var d = 0; d < opt.dmg; d++) if (chance(0.15)) smoke(x + rand(-8, 8), y - 6, 1); }
    ctx.restore();
  }
  function playerShipOpts(extra) {
    var lvls = 0; for (var u in SAVE.upg) lvls += upgLvl(u);
    var o = { wake: true, flag: "#111", dmg: G ? (G.maxHull - G.hull) : 0 };
    // once the Three-Day Chase is won, the player sails the Whydah herself —
    // black flag always flew, so this just locks in her darker hull and trim
    if (SAVE.whydahTaken) { o.whydah = true; o.hull = "#2a1a10"; o.trim = "#e0b25c"; }
    // an earned livery repaints her (she keeps the Whydah's size once taken)
    var skn = currentSkin();
    if (skn.id !== "auto") for (var sk2 in skn.opts) o[sk2] = skn.opts[sk2];
    if (G && G.iframes > 0 && Math.floor(G.iframes / 0.08) % 2 === 0) o.blink = true;   // hit grace: she flickers
    if (lvls >= 3) o.trim = "#e0b25c";
    if (lvls >= 6) o.sail = "#fdf6e0";
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function drawSerpent(seg, headOpen, flash) {
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    var rainbow = insane();   // multiverse serpents come in rainbow
    for (var i = seg.length - 1; i >= 1; i--) {
      var w = lerp(8, 30, i / seg.length);
      ctx.strokeStyle = flash ? "#d6ffd0" : (rainbow ? "hsl(" + ((seaT * 90 + i * 30) % 360) + ",75%,45%)" : (i % 2 ? "#2f6b4a" : "#3c7f58"));
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(seg[i].x, seg[i].y); ctx.lineTo(seg[i - 1].x, seg[i - 1].y); ctx.stroke();
      if (i % 3 === 0) { ctx.fillStyle = "#245239"; ctx.beginPath(); ctx.ellipse(seg[i].x, seg[i].y, w * 0.7, w * 0.35, 0, 0, 7); ctx.fill(); }
    }
    var hd = seg[0];
    if (rainbow) {
      if (hasMut("bighead")) { ctx.translate(hd.x, hd.y); ctx.scale(1.35, 1.35); ctx.translate(-hd.x, -hd.y); }
      drawPugHead(hd.x, hd.y, headOpen, flash); ctx.restore(); return;
    }
    ctx.fillStyle = flash ? "#efffe9" : "#357a55";
    ctx.beginPath(); ctx.ellipse(hd.x, hd.y, 26, 20, 0, 0, 7); ctx.fill();
    if (headOpen) { ctx.fillStyle = "#7a1f1f"; ctx.beginPath(); ctx.ellipse(hd.x, hd.y + 8, 15, 10, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#f7d84a"; ctx.beginPath(); ctx.arc(hd.x - 9, hd.y - 6, 4.5, 0, 7); ctx.arc(hd.x + 9, hd.y - 6, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(hd.x - 9, hd.y - 6, 2, 0, 7); ctx.arc(hd.x + 9, hd.y - 6, 2, 0, 7); ctx.fill();
    ctx.strokeStyle = "#8fae7d"; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(hd.x - 10, hd.y - 16); ctx.lineTo(hd.x - 16, hd.y - 28);
    ctx.moveTo(hd.x + 10, hd.y - 16); ctx.lineTo(hd.x + 16, hd.y - 28); ctx.stroke();
    ctx.restore();
  }
  // the Sea Pug / Pugnarok head: a round fawn head, black-mask muzzle, floppy
  // ears, huge eyes, pink tongue — insane mode's serpent/boss reskin
  function drawPugHead(x, y, mouthOpen, flash) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = flash ? "#fff3dc" : "#e8c087";
    ctx.beginPath(); ctx.ellipse(0, 0, 27, 23, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#c9905a";   // floppy ears
    ctx.beginPath(); ctx.ellipse(-24, -6, 11, 16, -0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(24, -6, 11, 16, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = "#4a3020";   // black mask muzzle
    ctx.beginPath(); ctx.ellipse(0, 8, 15, 11, 0, 0, 7); ctx.fill();
    if (mouthOpen) { ctx.fillStyle = "#ff8a9a"; ctx.beginPath(); ctx.ellipse(0, 13, 8, 7, 0, 0, 7); ctx.fill(); }   // pink tongue
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-11, -3, 8, 0, 7); ctx.arc(11, -3, 8, 0, 7); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(-10, -2, 4.5, 0, 7); ctx.arc(10, -2, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#4a3020"; ctx.beginPath(); ctx.arc(0, 4, 3.5, 0, 7); ctx.fill();   // nose
    ctx.strokeStyle = "#4a3020"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-6, 6); ctx.quadraticCurveTo(0, 12, 6, 6); ctx.stroke();   // wrinkly mouth line
    ctx.restore();
  }
  function drawFin(x, y, dir) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = "#33454e";
    ctx.beginPath(); ctx.moveTo(-10, 4); ctx.quadraticCurveTo(0, -16, 8, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(223,241,244,.5)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, 5); ctx.lineTo(12, 5); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD + panel text
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function panel(cx, cy, w, h) {
    ctx.fillStyle = "rgba(20,32,42,.92)";
    ctx.strokeStyle = "rgba(224,178,92,.8)"; ctx.lineWidth = 2;
    roundRect(cx - w / 2, cy - h / 2, w, h, 14); ctx.fill(); ctx.stroke();
  }
  function text(str, x, y, size, col, align, weight) {
    ctx.font = (weight || "") + " " + (size || 16) + "px Georgia, serif";
    ctx.fillStyle = col || "#f4e7c9"; ctx.textAlign = align || "center";
    ctx.fillText(str, x, y);
    ctx.textAlign = "left";
  }
  function wrapText(str, x, y, maxW, lh, size, col) {
    ctx.font = size + "px Georgia, serif"; ctx.fillStyle = col || "#f4e7c9"; ctx.textAlign = "center";
    var words = str.split(" "), line = "", yy = y;
    for (var i = 0; i < words.length; i++) {
      var t = line + words[i] + " ";
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = words[i] + " "; yy += lh; }
      else line = t;
    }
    ctx.fillText(line, x, yy); ctx.textAlign = "left";
    return yy;
  }
  function drawHUD() {
    var pad = 12;
    for (var i = 0; i < G.maxHull; i++) {
      ctx.font = "18px serif";
      ctx.globalAlpha = i < G.hull ? 1 : 0.25;
      ctx.fillStyle = "#e05c5c";
      ctx.fillText(i < G.hull ? "♥" : "♡", pad + i * 20, 28);
    }
    ctx.globalAlpha = 1;
    if (G.mode && G.mode !== "hard") text((G.mode === "insane" ? "🌀 " : "") + DIFF[G.mode].label, pad + 2, 46, 10.5, G.mode === "easy" ? "#8fd6a0" : "#ff9de2", "left", "bold");
    ctx.font = "bold 19px Georgia, serif"; ctx.textAlign = "right"; ctx.fillStyle = "#f4e7c9";
    ctx.fillText("⚑ " + Math.round(G.score), W - pad, 26);
    ctx.fillStyle = "#f7d84a";
    ctx.fillText("🪙 " + G.gold, W - pad, 48);
    ctx.textAlign = "left";
    var bw = clamp(W * 0.44, 140, 340), bx = (W - bw) / 2, by = 14, bh = 9;
    ctx.fillStyle = "rgba(11,22,32,.55)"; roundRect(bx - 4, by - 4, bw + 8, bh + 8, 8); ctx.fill();
    ctx.fillStyle = "rgba(244,231,201,.25)"; roundRect(bx, by, bw, bh, 5); ctx.fill();
    ctx.fillStyle = "#e0b25c"; roundRect(bx, by, bw * clamp(G.progress, 0, 1), bh, 5); ctx.fill();
    ctx.font = "13px serif"; ctx.fillStyle = "#f4e7c9";
    ctx.fillText("⚓", bx + bw * clamp(G.progress, 0, 1) - 6, by + bh + 14);
    text("MAINE", bx + bw + 26, by + 9, 10, "#cdeccf", "center", "bold");
    // small pips, one per mission in THIS run, filled up to the current one
    var nM = runCount(), pipW = bw / nM, curPos = runPos();
    for (var pm = 0; pm < nM; pm++) {
      ctx.fillStyle = pm <= curPos ? "rgba(224,178,92,.85)" : "rgba(244,231,201,.25)";
      ctx.fillRect(bx + pm * pipW + 1, by + bh + 4, pipW - 2, 2);
    }
    text("M" + (curPos + 1) + " · " + missionName(), W / 2, by + bh + 26, 11.5, "rgba(244,231,201,.85)", "center");
    drawComboHUD();
  }

  // ==================================================================
  // SCENES
  // ==================================================================
  var scene = null;
  // Scene changes crossfade through black instead of hard-cutting: fadeT runs
  // 0→1 (out, old scene still drawn), the swap happens at the midpoint, then
  // 1→0 (in). setScene(s, true) skips the fade for boot/instant swaps.
  var fadeT = 0, fadeDir = 0, pendingScene = null;
  var FADE_LEN = 0.55;
  function setScene(s, instant) {
    if (G) G.blastReq = false;   // a blast queued at the end of one scene never carries into the next
    if (instant || !scene) { scene = s; if (s.enter) s.enter(); fadeT = scene ? 0.999 : 0; fadeDir = -1; return; }
    pendingScene = s; fadeDir = 1;
  }
  function stepFade(dt) {
    if (!fadeDir) return;
    fadeT += fadeDir * dt / (FADE_LEN / 2);
    if (fadeDir > 0 && fadeT >= 1) {
      fadeT = 1; fadeDir = -1;
      if (pendingScene) { var s = pendingScene; pendingScene = null; scene = s; if (s.enter) s.enter(); }
    } else if (fadeDir < 0 && fadeT <= 0) { fadeT = 0; fadeDir = 0; }
  }
  function drawFade() {
    if (fadeT <= 0) return;
    ctx.fillStyle = "rgba(6,12,18," + clamp(fadeT, 0, 1) + ")";
    ctx.fillRect(0, 0, W, H);
  }
  function fading() { return fadeDir !== 0 || pendingScene !== null; }
  // debug/test path: complete any in-flight fade instantly so state() reflects
  // the destination scene right away
  function flushFade() {
    if (pendingScene) { var s = pendingScene; pendingScene = null; scene = s; if (s.enter) s.enter(); }
    fadeT = 0; fadeDir = 0;
  }

  // ---------------------------------------------------------------- pause
  // Meta scenes (Title/Log/Harbor/Port/Result) mark themselves noPause:true —
  // pausing is only meaningful while a voyage is actually underway.
  var paused = false;
  function setPause(v) {
    if (v && scene && scene.noPause) return;
    paused = !!v;
  }
  function togglePause() { setPause(!paused); }
  document.addEventListener("visibilitychange", function () { if (document.hidden) setPause(true); });
  function drawPauseOverlay() {
    ctx.fillStyle = "rgba(5,10,15,.6)"; ctx.fillRect(0, 0, W, H);
    var w = clamp(W * 0.7, 240, 380), h = 190;
    panel(W / 2, H / 2, w, h);
    text("⏸ PAUSED", W / 2, H / 2 - h / 2 + 42, 24, "#e0b25c", "center", "bold");
    var bw = w - 60, by1 = H / 2 - 10, by2 = H / 2 + 46;
    if (uiButton(W / 2 - bw / 2, by1, bw, 44, "▶ RESUME", { size: 15 })) setPause(false);
    if (uiButton(W / 2 - bw / 2, by2, bw, 44, "⚓ QUIT TO TITLE", { size: 14, color: "#1f4a5e" })) { setPause(false); setScene(TitleScene()); }
  }

  function advance() {
    if (pendingScene) return;   // a scene change is already in flight
    G.seqIndex++;
    if (G.seqIndex >= G.seq.length) { endRun(true, false); return; }
    var beat = G.seq[G.seqIndex];
    G.mIndex = beat.m; G.mFrac = beat.mBeatCount > 1 ? beat.mBeatIdx / (beat.mBeatCount - 1) : 0; setProgress();
    // remember how far the crew has ever gotten, so a death never wipes the afternoon
    if (G.mode === "insane") { if (G.mIndex > SAVE.furthestInsane) { SAVE.furthestInsane = G.mIndex; persist(); } }
    else if (G.mIndex > SAVE.furthest) { SAVE.furthest = G.mIndex; persist(); }
    if (G.mIndex >= 2 && !SAVE.prologueDone) { SAVE.prologueDone = true; persist(); }
    G.curBeat = beat.kind + (beat.which ? ":" + beat.which : "") + (beat.ev ? ":" + beat.ev.id : "");
    if (beat.kind === "sail") setScene(SailScene());
    else if (beat.kind === "battle") setScene(BattleScene());
    else if (beat.kind === "serpent") setScene(SerpentScene());
    else if (beat.kind === "storm") setScene(StormScene());
    else if (beat.kind === "boss") setScene(BossScene());
    else if (beat.kind === "squadron") setScene(SquadronScene());
    else if (beat.kind === "fork") setScene(ForkScene());
    else if (beat.kind === "event") setScene(EventScene(beat.ev));
    else if (beat.kind === "mini") setScene(MiniScene(beat.which));
    else if (beat.kind === "missionIntro") setScene(MissionIntroScene(beat.m));
    // the following kinds get real scenes in later phases; a plain sail leg
    // is a safe, playable stand-in until then so the campaign never breaks
    else if (beat.kind === "port") setScene(typeof PortScene === "function" ? PortScene() : SailScene());
    else if (beat.kind === "election") setScene(typeof ElectionScene === "function" ? ElectionScene() : SailScene());
    else if (beat.kind === "dive") setScene(typeof DiveScene === "function" ? DiveScene() : SailScene());
    else if (beat.kind === "chase") setScene(typeof ChaseScene === "function" ? ChaseScene() : SailScene());
    else if (beat.kind === "kraken") setScene(typeof KrakenScene === "function" ? KrakenScene() : SerpentScene());
    else if (beat.kind === "palatine") setScene(typeof PalatineScene === "function" ? PalatineScene() : SailScene());
    else if (beat.kind === "oldsow") setScene(typeof OldSowScene === "function" ? OldSowScene() : SailScene());
    else if (beat.kind === "mooncusser") setScene(MooncusserScene());
    else if (beat.kind === "sharknado") setScene(SharknadoScene());
    else if (beat.kind === "flagship") setScene(FlagshipScene());
    else if (beat.kind === "merchant") setScene(MerchantScene());
    else if (beat.kind === "sloopboss") setScene(SloopBossScene());
    else if (beat.kind === "brigboss") setScene(BrigBossScene());
    else if (beat.kind === "blockade") setScene(BlockadeScene());
    else if (beat.kind === "davyjones") setScene(DavyJonesScene());
    else if (beat.kind === "poseidon") setScene(PoseidonScene());
    else if (beat.kind === "hallett") setScene(EventScene(HALLETT_EVENT));
    else setScene(SailScene());
  }

  // ---------------------------------------------------------------- MISSION INTRO
  function MissionIntroScene(mi) {
    var msn = MISSIONS[mi], t = 0;
    var name = (insane() && msn.nameInsane) ? msn.nameInsane : msn.name;
    return {
      enter: function () {
        document.body.classList.add("playing"); if (chance(0.5)) G.pal = choice(insane() ? PALETTES_INSANE : PALETTES);
        // announce the run's two multiverse mutators on the very first mission card
        if (mi === G.startMission && G.mutators && G.mutators.length) {
          toast("Today's multiverse: " + G.mutators.map(function (m) { return MUTATOR_LINES[m]; }).join("  ·  "));
        }
      },
      update: function (dt) { seaT += dt; t += dt; updateGulls(dt); if (t > 0.4 && consumeTap()) advance(); },
      render: function () {
        drawSea(G.pal, seaT * 30, false);
        drawShip(W / 2, H * 0.72, 1.7, playerShipOpts());
        drawParts(); drawHUD();
        var w = clamp(W * 0.86, 290, 480), h = 214, cy = H * 0.4;
        panel(W / 2, cy, w, h);
        var pos2 = G.runMissions ? G.runMissions.indexOf(mi) : mi;
        text("MISSION " + ((pos2 >= 0 ? pos2 : mi) + 1) + " OF " + runCount(), W / 2, cy - h / 2 + 26, 11, "#9fb6d6", "center", "bold");
        text(name, W / 2, cy - h / 2 + 56, 24, "#e0b25c", "center", "bold");
        var yy = wrapText(msn.sub, W / 2, cy - h / 2 + 84, w - 46, 20, 14, "#f4e7c9");
        wrapText((insane() && msn.objInsane) ? msn.objInsane : msn.obj, W / 2, yy + 26, w - 60, 18, 13, "#cdeccf");
        text("tap or press SPACE to begin", W / 2, cy + h / 2 - 14, 11.5, "rgba(244,231,201,.6)");
      }
    };
  }

  function Prompt(title, body, cb, tagline) {
    return { t: 0, update: function (dt) {
        this.t += dt;
        if (this.t > 0.35 && consumeTap()) cb();
      }, render: function () {
        var w = clamp(W * 0.84, 260, 470), h = tagline ? 178 : 156;
        panel(W / 2, H / 2, w, h);
        text(title, W / 2, H / 2 - h / 2 + 34, 23, "#e0b25c", "center", "bold");
        var yy = wrapText(body, W / 2, H / 2 - h / 2 + 62, w - 44, 21, 14.5, "#f4e7c9");
        if (tagline) text(tagline, W / 2, yy + 26, 12, "#9fb6d6", "center", "bold");
        text("tap or press SPACE", W / 2, H / 2 + h / 2 - 14, 11.5, "rgba(244,231,201,.6)");
      } };
  }

  // ---------------------------------------------------------------- TITLE
  function TitleScene() {
    var hint = false, skipPrologue = false, secretTaps = 0;
    function beginVoyage() { startRun(skipPrologue ? 2 : 0); }
    return {
      noPause: true,
      isTitle: true,
      enter: function () {
        document.body.classList.remove("playing"); seedCoast(); if (!G) newGame();
        if (muted && (SAVE.sndHint || 0) < 3) { SAVE.sndHint = (SAVE.sndHint || 0) + 1; persist(); hint = true; }
      },
      update: function (dt) { seaT += dt; updateGulls(dt); },
      render: function () {
        drawSea(G.pal || PALETTES[1], seaT * 40, false);
        drawShip(W / 2, H * 0.56, 2, playerShipOpts({ dmg: 0 }));
        var w = clamp(W * 0.88, 300, 540);
        panel(W / 2, H * 0.3, w, 196);
        text("WHYDAH\u2019S VOYAGE", W / 2, H * 0.3 - 58, 32, "#e0b25c", "center", "bold");
        wrapText("February 1717. The crew took the Whydah after a three day chase. Sam Bellamy is captain. Run her north. Make Maine. Beat the storm the real crew never did.",
          W / 2, H * 0.3 - 24, w - 46, 20, 14, "#f4e7c9");
        text("steer with ← → ↑ ↓ or WASD  ·  SPACE fires (hold for a broadside)", W / 2, H * 0.3 + 62, 13, "#cdb98a");
        text("Best " + SAVE.best + "  ·  Bank 🪙 " + SAVE.bank + "  ·  Voyages " + SAVE.runs + (SAVE.bellSeen ? "  ·  🔔 wreck found, 1984" : ""), W / 2, H * 0.3 + 84, 12, "rgba(244,231,201,.7)");
        if (hint && muted) {
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(seaT * 3);
          text("tap 🔇 up top for sound", W - 16, 64, 12, "#ffe1b0", "right", "bold");
          ctx.globalAlpha = 1;
        }
        var seen = countSeen(), tot = EVENTS.length;
        var bw = clamp(W * 0.36, 130, 172), by = H * 0.8;
        // difficulty picker: the kids' tiers. Beating EXTREME opens the multiverse.
        var mw = (bw * 2 + 20 - 18) / 4, my = by - 66;
        if (!DIFF[SAVE.mode]) SAVE.mode = "hard";
        for (var mi = 0; mi < MODE_ORDER.length; mi++) {
          var mid2 = MODE_ORDER[mi], md = DIFF[mid2], mx = W / 2 - bw - 10 + mi * (mw + 6);
          var locked = mid2 === "insane" && !(SAVE.extremeWon || SAVE.secretUnlock);
          var sel = SAVE.mode === mid2;
          var label = locked ? "🔒" : (mid2 === "insane" ? "🌀 " + md.label : md.label);
          if (uiButton(mx, my, mw, 30, label, { size: mw < 74 ? 9.5 : 10.5, disabled: locked, color: sel ? md.color : "#3a4550" }) && !locked) { SAVE.mode = mid2; persist(); SFX.buy(); }
          // the touch path to the secret word: five taps on the lock
          if (locked && input.pPressed && input.px >= mx && input.px <= mx + mw && input.py >= my && input.py <= my + 30) {
            input.pPressed = false;
            secretTaps++;
            if (secretTaps >= 5) {
              secretTaps = 0;
              var w2 = null; try { w2 = window.prompt("Speak the secret word…"); } catch (e2) {}
              if (w2 && w2.trim().toLowerCase() === "sidequest") grantSecret(); else if (w2 != null) SFX.bad();
            }
          }
          if (sel) { ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2.5; roundRect(mx - 2, my - 2, mw + 4, 34, 12); ctx.stroke(); }
        }
        text(SAVE.mode === "insane" ? "the multiverse is waiting. good luck." : ((SAVE.extremeWon || SAVE.secretUnlock) ? "difficulty" : "difficulty  ·  beat EXTREME to unlock 🌀 (or know the word)"), W / 2, my - 10, 10.5, "rgba(244,231,201,.6)");
        // resume the furthest voyage reached, or start fresh (with a prologue-skip toggle once it's been seen once)
        var curMode = insane() ? SAVE.furthestInsane : SAVE.furthest;
        var canResume = curMode > 2;
        var resumeY = my - 80;
        if (canResume) {
          // outside INSANE the mythic-only legs don't exist: land the resume on
          // the next real mission, and number it by its place in THIS mode's run
          var resumeIdx = clamp(curMode, 0, MISSIONS.length - 1);
          if (!insane()) while (resumeIdx < MISSIONS.length - 1 && MISSIONS[resumeIdx].insaneOnly) resumeIdx++;
          var resumeMsn = MISSIONS[resumeIdx], dispN = 0;
          for (var rq = 0; rq <= resumeIdx; rq++) if (insane() || !MISSIONS[rq].insaneOnly) dispN++;
          var rName = (insane() && resumeMsn.nameInsane) ? resumeMsn.nameInsane : resumeMsn.name;
          if (uiButton(W / 2 - bw - 10, resumeY, bw * 2 + 20, 32, "↪ RESUME — M" + dispN + " " + rName, { size: 12.5, color: "#6a3f9e" })) { startRun(resumeIdx); }
        }
        if (SAVE.prologueDone) {
          var toggleLbl = (skipPrologue ? "☑" : "☐") + " skip the prologue (+160 pts)";
          if (uiButton(W / 2 - 110, resumeY - (canResume ? 34 : 0), 220, 22, toggleLbl, { size: 10.5, color: "rgba(30,40,50,.4)" })) { skipPrologue = !skipPrologue; SFX.point(); }
        }
        if (uiButton(W / 2 - bw - 10, by - 26, bw, 52, "⚓ SET SAIL", { size: 17 })) { beginVoyage(); }
        if (uiButton(W / 2 + 10, by - 26, bw, 52, "⚒ HARBOR", { size: 17, color: "#1f4a5e" })) { setScene(HarborScene(false)); }
        if (uiButton(W / 2 - bw / 2 - 5, by + 34, bw + 10, 36, "📖 LOG  " + seen + " / " + tot, { size: 13, color: "#4a3a5e" })) { setScene(LogScene()); }
        if (consumeTap()) beginVoyage();
      }
    };
  }

  // ---------------------------------------------------------------- TALES LOGBOOK
  function LogScene() {
    var page = 0, perPage = 8;
    return {
      noPause: true,
      enter: function () { document.body.classList.remove("playing"); },
      update: function (dt) { seaT += dt; updateGulls(dt); },
      render: function () {
        drawSea(PALETTES[4], seaT * 25, false);
        var pages = Math.ceil(EVENTS.length / perPage);
        var w = clamp(W * 0.92, 300, 540), rowH = clamp(H * 0.062, 34, 44);
        var h = 116 + perPage * rowH;
        h = Math.min(h, H * 0.86);
        var top = clamp(H * 0.05, 8, 40);
        panel(W / 2, top + h / 2, w, h);
        var seen = countSeen();
        text("📖  THE TALES LOGBOOK", W / 2, top + 32, 20, "#e0b25c", "center", "bold");
        text(seen + " of " + EVENTS.length + " tales found  ·  page " + (page + 1) + " / " + pages + (SAVE.bellSeen ? "  ·  🔔 1984: the wreck is found" : ""), W / 2, top + 54, 12, "rgba(244,231,201,.75)", "center");
        var innerRowH = (h - 130) / perPage;
        for (var i = 0; i < perPage; i++) {
          var idx = page * perPage + i;
          if (idx >= EVENTS.length) break;
          var ev = EVENTS[idx], got = SAVE.seen && SAVE.seen[ev.id];
          var ry = top + 70 + i * innerRowH;
          var tagCol = ev.tag === "record" ? "#8fd6a0" : (ev.tag === "yarn" ? "#9fb6d6" : (ev.tag === "multi" ? "#ff9de2" : "#cdb98a"));
          var tagIco = ev.tag === "record" ? "⚓" : (ev.tag === "yarn" ? "🌀" : (ev.tag === "multi" ? "🤯" : "·"));
          text(tagIco, W / 2 - w / 2 + 26, ry + innerRowH * 0.62, 13, got ? tagCol : "rgba(150,150,150,.4)", "center");
          if (got) {
            text(ev.t + (ev.route ? (ev.route === "shore" ? "  🏝" : "  🌊") : ""), W / 2 - w / 2 + 44, ry + innerRowH * 0.62, 13.5, "#f4e7c9", "left");
          } else {
            text("? ? ?", W / 2 - w / 2 + 44, ry + innerRowH * 0.62, 13.5, "rgba(244,231,201,.35)", "left");
          }
        }
        var by = top + h - 46;
        if (page > 0 && uiButton(W / 2 - w / 2 + 16, by, 88, 34, "◀ BACK", { size: 12.5, color: "#1f4a5e" })) page--;
        if (page < pages - 1 && uiButton(W / 2 + w / 2 - 104, by, 88, 34, "MORE ▶", { size: 12.5, color: "#1f4a5e" })) page++;
        if (uiButton(W / 2 - 55, by, 110, 34, "⚓ DONE", { size: 13 })) setScene(TitleScene());
      }
    };
  }

  // ---------------------------------------------------------------- SAIL leg
  // Phones have far less left-right room than a desktop canvas, which made
  // dodging much harder there. narrowEase() > 1 on tall/narrow screens; we use
  // it to thin out spawns, slow things down, and widen the steering band so a
  // portrait phone plays about as fair as a widescreen.
  function narrowEase() { var ar = W / H; return ar >= 1 ? 1 : clamp(1 + (1 - ar) * 0.85, 1, 1.55); }
  function steerLo() { return W / H < 0.85 ? 0.05 : 0.08; }
  function steerHi() { return W / H < 0.85 ? 0.95 : 0.92; }

  // The ship holds a fore-aft position too: G.shipY (0..1) maps onto a band in
  // the lower part of the sea, so you can press ahead or hang back to dodge.
  var Y_LO = 0.58, Y_SPAN = 0.34;
  function shipYPx() { return (Y_LO + (G ? G.shipY : 0.7) * Y_SPAN) * H; }
  // One helm for every scene: eased on both axes — a quick tap is a precise
  // nudge, holding moves at full speed, releasing stops fast. Touch drags to
  // the finger. `mirror` flips port and starboard (an insane-mode prank).
  var steerVX = 0, steerVY = 0;
  function helm(dt, slowMul, touchY, mirror) {
    var maxV = steerSpeed() * (slowMul || 1);
    var m = mirror ? -1 : 1;
    var dirX = ((input.left ? -1 : 0) + (input.right ? 1 : 0)) * m;
    var dirY = (input.up ? -1 : 0) + (input.down ? 1 : 0);
    if (input.pDown && input.py > H * (touchY || 0.4)) {
      var tx = mirror ? 1 - input.px / W : input.px / W;
      G.shipX = lerp(G.shipX, clamp(tx, steerLo(), steerHi()), 0.18);
      G.shipY = lerp(G.shipY, clamp((input.py / H - Y_LO) / Y_SPAN, 0, 1), 0.18);
      steerVX = 0; steerVY = 0;
    } else {
      var accel = maxV * 7, maxVY = maxV * 1.3;
      if (dirX !== 0) steerVX += clamp(dirX * maxV - steerVX, -accel * dt, accel * dt);
      else steerVX += clamp(-steerVX, -accel * 2 * dt, accel * 2 * dt);
      if (dirY !== 0) steerVY += clamp(dirY * maxVY - steerVY, -accel * dt, accel * dt);
      else steerVY += clamp(-steerVY, -accel * 2 * dt, accel * 2 * dt);
      G.shipX += steerVX * dt;
      G.shipY += steerVY * dt;
    }
    G.shipX = clamp(G.shipX, steerLo(), steerHi());
    G.shipY = clamp(G.shipY, 0, 1);
  }

  // ==================================================================
  // SCENES: PROLOGUE — the making of a pirate captain (M0 election, M1 chase)
  // ==================================================================
  // M0 — ROBIN HOOD'S MEN. The real hook of Bellamy's story, and the tutorial:
  // the Florida salvage was a bust, so he fell in with Hornigold's pirates — but
  // Hornigold wouldn't raid English ships, so in the summer of 1716 the crew
  // VOTED him out and elected Bellamy captain. Here you earn that vote: take the
  // wheel, run down the English prize Hornigold wouldn't touch, force her to
  // strike, and choose how to treat her crew. Either way, the men elect you.
  function ElectionScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], fireGun = gunner();
    var hp = Math.max(4, Math.round(7 * diff().hp)), max = hp;   // a light merchant — the gentle first fight
    var mx2 = W * 0.5, mdir = 1, fireT = 2.2;
    var picked = -1, resultTitle = "", resultLine = "", loot = 0;
    var CHOICES = [
      { l: "Spare her crew — a berth for any who'll join, plunder split even", gold: 40, score: 70,
        title: "ROBIN HOOD'S MEN", r: "You put her crew ashore unharmed and split every coin even. The men roar your name — Bellamy, captain, by a show of hands. They'll call themselves Robin Hood's Men." },
      { l: "Strip her hold and set them adrift", gold: 65, score: 45,
        title: "ELECTED CAPTAIN", r: "You take everything worth taking and cut her loose. Hard, but the hold is full — and a crew follows a captain who fills it. They elect you all the same." }
    ];
    function elect(i) {
      picked = i; var c = CHOICES[i];
      addGold(c.gold); addScore(c.score); loot = c.gold; resultTitle = c.title; resultLine = c.r;
      feat("election"); SFX.win(); phase = "done";
    }
    return {
      debugWin: function () { hp = 0; phase = "vote"; },
      debugChoose: function (i) { if (phase === "vote" && picked < 0) elect(i); },
      enter: function () {
        document.body.classList.add("playing"); G.shipY = 0.68;
        prompt = Prompt("ROBIN HOOD'S MEN", "The Florida wrecks were a bust — you came up with nearly nothing, like every diver on that coast. So you went on the account with Hornigold's pirates. But Hornigold won't raise a hand against an English ship, and the crew has had their fill of his caution. There's a fat English merchantman off the bow. Take the wheel. Show them who ought to be captain.", function () { phase = "fight"; }, "⚓ THE CREW ELECTED BELLAMY, SUMMER 1716");
      },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "vote") return;             // waits on the crew's vote (buttons in render)
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -430).forEach(function (b) { balls.push(b); }); SFX.fire(); smoke(px, py - 18, 2); }
        // she runs from you and pops the odd swivel gun — slow and telegraphed;
        // this is the first shots-fired the player ever sees.
        mx2 += mdir * 58 * dt;
        if (mx2 < W * 0.16) mdir = 1;
        if (mx2 > W * 0.84) mdir = -1;
        fireT -= dt;
        if (fireT <= 0) {
          fireT = rand(2.2, 3.0) * diff().fire;
          balls.push({ x: mx2, y: H * 0.18 + 14, vy: 245, vx: clamp((px - mx2) * 0.4, -110, 110), own: 0 });
          SFX.fire(); smoke(mx2, H * 0.18 + 10, 1);
        }
        stepBalls(balls, dt, [{ x: mx2, y: H * 0.18, r: 22, onHit: function (b) {
          hp--; splash(b.x, b.y, 8, "#e08c6a"); SFX.hit();
          if (hp <= 0 && phase === "fight") {
            phase = "vote"; balls = []; SFX.win(); shake(10);   // clear her in-flight shot so nothing hangs under the vote panel
            for (var k = 0; k < 22; k++) spawn(mx2, H * 0.18, { vx: rand(-130, 130), vy: rand(-160, 40), g: 260, life: rand(0.6, 1.2), r: rand(2, 4), c: choice(["#f7d84a", "#e08c6a", "#fff"]) });
          }
        } }], { x: px, y: py, r: 18 });
      },
      render: function () {
        var ph = phase;   // snapshot: a vote click flips phase mid-render, so branch on the phase we entered with (no one-frame panel overlap)
        drawSea(G.pal || PALETTES[0], seaT * 55, false);
        if (ph !== "intro" && ph !== "done" && ph !== "vote") {
          var bw = 140, hx = W / 2 - bw / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(hx - 2, 6, bw + 4, 12, 5); ctx.fill();
          ctx.fillStyle = "#3a5a3a"; roundRect(hx, 8, bw * clamp(hp / max, 0, 1), 8, 4); ctx.fill();
          text("THE ENGLISH MERCHANTMAN", W / 2, 32, 11, "#cdeccf", "center", "bold");
        }
        if (ph !== "done") drawShip(mx2, H * 0.18, 1.7, { rot: Math.PI, flag: "#c8c8d0", hull: "#5a4326", deck: "#75603e", sail: "#f0e7cf", dmg: max - hp });
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (ph === "intro") prompt.render();
        if (ph === "fight" && t < 3.2) { ctx.globalAlpha = clamp(3.2 - t, 0, 1); text("Hold FIRE to rake her — dodge her swivel shot — force her to strike.", W / 2, H * 0.52, 14, "#f4e7c9", "center", "bold"); ctx.globalAlpha = 1; }
        if (ph === "vote") {
          var w = clamp(W * 0.82, 300, 470);
          panel(W / 2, H * 0.42, w, 150);
          text("SHE STRIKES HER COLORS", W / 2, H * 0.42 - 44, 20, "#8fd6a0", "center", "bold");
          wrapText("The men gather at the mast. Hornigold's caution cost them prizes like this one — and they look to you now. How do you take her?", W / 2, H * 0.42 - 16, w - 50, 17, 12.5, "#f4e7c9");
          var by0 = H * 0.42 + 40, bh = 34, bwid = w - 40;
          if (uiButton(W / 2 - bwid / 2, by0, bwid, bh, "⚖ " + CHOICES[0].l, { size: 11.5, color: "#2c5e38" })) elect(0);
          if (uiButton(W / 2 - bwid / 2, by0 + bh + 8, bwid, bh, "💰 " + CHOICES[1].l, { size: 11.5, color: "#6a4a1e" })) elect(1);
        }
        if (ph === "done") {
          var w2 = clamp(W * 0.8, 280, 460);
          panel(W / 2, H / 2, w2, 168);
          text(resultTitle, W / 2, H / 2 - 56, 21, "#ffd24a", "center", "bold");
          wrapText(resultLine, W / 2, H / 2 - 26, w2 - 50, 18, 13, "#cdeccf");
          text("+" + loot + " gold   ·   you are captain now", W / 2, H / 2 + 46, 13, "#e0b25c", "center", "bold");
          text("tap to take the account north", W / 2, H / 2 + 70, 11.5, "rgba(244,231,201,.6)");
        }
      }
    };
  }

  function drawDiver(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.beginPath(); ctx.ellipse(0, 20, 14, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#d9a97a"; ctx.beginPath(); ctx.arc(0, -8, 7, 0, 7); ctx.fill();
    ctx.fillStyle = "#5a4632"; ctx.beginPath(); ctx.arc(0, -11, 7.2, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#3a5f6a"; ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(6, -1); ctx.lineTo(4, 13); ctx.lineTo(-4, 13); ctx.closePath(); ctx.fill();
    var kick = Math.sin(seaT * 8) * 6;
    ctx.strokeStyle = "#3a5f6a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-3, 13); ctx.lineTo(-3 + kick, 22); ctx.moveTo(3, 13); ctx.lineTo(3 - kick, 22); ctx.stroke();
    if (chance(0.06)) spawn(x + rand(-4, 4), y - 12, { vy: -30, life: 0.8, r: 2.5, c: "rgba(220,240,250,.7)" });
    ctx.restore();
  }
  function drawAspido(x, y, t) {
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#2a4a3a";
    ctx.beginPath(); ctx.ellipse(0, 0, 90, 34, 0, 0, 7); ctx.fill();
    for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * 26, 6, 16, 10, 0, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(-100, 4, 22, 14, 0, 0, 7); ctx.fill();   // head end, low and slow
    ctx.restore();
  }
  // M0 — The Wreck Diver (1716, before the pirate life). Three descents into
  // the sunken plate fleet, each deeper, darker, richer, and meaner: the
  // shallow wreck (sharks), the gun deck (moray eels in the timbers, air
  // pockets to grab), and the treasure hold (falling timbers, near-dark, big
  // gold). Breath drains faster with depth, so the deep sites live and die on
  // air pockets. History does the failing for you: come up light and the exit
  // card says what it really said — they found nearly nothing, and went on
  // the account instead.
  function DiveScene() {
    var SITES = [
      { name: "THE SHALLOW WRECK", dur: 18, drain: 0.05,  goldV: 8,  target: 40,  dark: 0,    sharkN: 2, eels: 0, timbers: false },
      { name: "THE GUN DECK",      dur: 22, drain: 0.065, goldV: 12, target: 100, dark: 0.35, sharkN: 3, eels: 2, timbers: false },
      { name: "THE TREASURE HOLD", dur: 24, drain: 0.085, goldV: 18, target: 180, dark: 0.7,  sharkN: 3, eels: 2, timbers: true }
    ];
    var site = 0, t = 0, siteT = 0, descendT = -1;
    var breath = 1, gasp = false;
    var objs = [], eels = [], spawnT = 0.9, airT = rand(5, 8), timberT = rand(4, 7), timber = null;
    var turtleAt = rand(20, 32), turtleDone = false, turtleT = 0, turtleTouched = false;
    var done = false;
    function seedEels(n) {
      eels = [];
      for (var e = 0; e < n; e++) {
        var side = e % 2 === 0 ? 1 : -1;
        eels.push({ x: side > 0 ? rand(0.04, 0.1) * W : rand(0.9, 0.96) * W, y: rand(0.35, 0.8) * H, dir: side, state: "hide", st: rand(2, 5), lx: 0 });
      }
    }
    function descend() {
      site++; siteT = 0; descendT = 0;
      objs = []; timber = null; airT = rand(3, 6); timberT = rand(3, 6);
      seedEels(SITES[site].eels);
      SFX.good();
    }
    return {
      debugWin: function () { site = SITES.length - 1; G.gold = Math.max(G.gold, SITES[site].target); siteT = SITES[site].dur; },
      enter: function () { document.body.classList.add("playing"); G.shipY = 0.25; toast(SITES[0].name); },
      update: function (dt) {
        if (done) return;
        seaT += dt; t += dt;
        if (descendT >= 0) { descendT += dt; if (descendT > 1.2) descendT = -1; return; }   // a black-water beat between sites
        siteT += dt;
        var s = SITES[site];
        helm(dt, 0.8, 0.4, false);
        var dx = G.shipX * W, dy = (0.14 + G.shipY * 0.74) * H;
        var deep = G.shipY > 0.22;
        breath = clamp(breath + (deep ? -s.drain : 0.4) * dt, 0, 1);
        if (breath <= 0 && !gasp) { gasp = true; damage(1); breath = 0.4; }
        if (breath > 0.06) gasp = false;
        // gold sinks past; sharks patrol lanes (a shade quicker per site); air
        // pockets bubble up from the wreck on the deeper sites
        spawnT -= dt;
        if (spawnT <= 0 && siteT < s.dur - 1.2) {
          spawnT = rand(0.6, 1.05);
          var sharksNow = 0; for (var sc = 0; sc < objs.length; sc++) if (objs[sc].kind === "shark") sharksNow++;
          if (sharksNow < s.sharkN && chance(0.3)) objs.push({ kind: "shark", x: rand(0.15, 0.85) * W, y: rand(0.3, 0.8) * H, dir: chance(0.5) ? 1 : -1, sp: rand(32, 50) + site * 12 });
          else if (site === 2 && chance(0.25)) objs.push({ kind: "gem", x: rand(0.12, 0.88) * W, y: -20, sp: rand(48, 70), r: 11, a: 0, spin: rand(-2, 2) });
          else objs.push({ kind: "gold", x: rand(0.12, 0.88) * W, y: -20, sp: rand(58, 88) + site * 8, r: 12, a: 0, spin: rand(-1.5, 1.5) });
        }
        if (site > 0) {
          airT -= dt;
          if (airT <= 0) { airT = rand(5.5, 8.5) - site; objs.push({ kind: "air", x: rand(0.15, 0.85) * W, y: H + 20, sp: -rand(34, 50), r: 13, a: 0, spin: 0 }); }
        }
        // the treasure hold is coming down around you: telegraphed falling timbers
        if (s.timbers) {
          if (!timber) timberT -= dt;
          if (!timber && timberT <= 0) timber = { x: clamp(dx + rand(-W * 0.2, W * 0.2), W * 0.1, W * 0.9), warn: 1.0 + warnBonus() * 0.3, y: -30, live: false };
          if (timber) {
            if (!timber.live) { timber.warn -= dt; if (timber.warn <= 0) { timber.live = true; SFX.bad(); } }
            else {
              timber.y += 340 * dt;
              if (Math.abs(timber.x - dx) < 26 && Math.abs(timber.y - dy) < 24) { damage(1); shake(10); splash(timber.x, timber.y, 10); timber = null; timberT = rand(3.5, 6); }
              else if (timber.y > H + 30) { timber = null; timberT = rand(3.5, 6); }
            }
          }
        }
        // moray eels nest at the screen edges: a head pokes out with a pulsing
        // tell, then a short horizontal lunge across the lane
        for (var ei = 0; ei < eels.length; ei++) {
          var el = eels[ei]; el.st -= dt;
          if (el.state === "hide") { if (el.st <= 0) { el.state = "warn"; el.st = 0.9 + warnBonus() * 0.25; } }
          else if (el.state === "warn") { if (el.st <= 0) { el.state = "lunge"; el.st = 0.55; el.lx = 0; SFX.bad(); } }
          else if (el.state === "lunge") {
            el.lx += el.dir * 300 * dt;
            var ex = el.x + el.lx;
            if (Math.abs(ex - dx) < 22 && Math.abs(el.y - dy) < 20) { damage(1); shake(8); splash(ex, el.y, 8, "#8fae7d"); el.state = "retreat"; el.st = 0.5; }
            else if (el.st <= 0) { el.state = "retreat"; el.st = 0.5; }
          } else {
            el.lx = lerp(el.lx, 0, clamp(6 * dt, 0, 1));
            if (el.st <= 0) { el.state = "hide"; el.st = rand(2.5, 6); el.y = rand(0.35, 0.8) * H; }
          }
        }
        // the island that swims: drift close while it passes and it counts
        if (!turtleDone && insane() && t >= turtleAt) { turtleDone = true; toast("Something vast, and slow, swims off."); }
        if (turtleDone && turtleT < 7) {
          turtleT += dt;
          var tx = W * (0.5 - turtleT * 0.09), ty = H * 0.28;
          if (!turtleTouched && Math.hypot(tx - dx, ty - dy) < 70) {
            turtleTouched = true; addScore(25); SFX.win(); toast("You touched the island that swims. +25");
          }
        } else if (turtleDone) turtleT += dt;
        for (var i = objs.length - 1; i >= 0; i--) {
          var o = objs[i];
          if (o.kind === "shark") {
            o.x += o.dir * o.sp * dt;
            if (o.x < 24 || o.x > W - 24) o.dir *= -1;
            if (Math.hypot(o.x - dx, o.y - dy) < 26) { damage(1); shake(8); splash(o.x, o.y, 8, "#9fb6c9"); o.x = rand(0.15, 0.85) * W; o.y = rand(0.3, 0.8) * H; }
            continue;
          }
          o.y += o.sp * dt; o.a += o.spin * dt;
          if (Math.hypot(o.x - dx, o.y - dy) < o.r + 18) {
            if (o.kind === "air") { breath = clamp(breath + 0.45, 0, 1); SFX.good(); splash(o.x, o.y, 8, "#cfeef8"); toast("💨 air pocket"); }
            else if (o.kind === "gem") { addGold(18); addScore(14); SFX.coin(); coinBurst(o.x, o.y); }
            else { addGold(s.goldV); addScore(6); SFX.coin(); coinBurst(o.x, o.y); }
            objs.splice(i, 1); continue;
          }
          if (o.y > H + 40 || o.y < -50) objs.splice(i, 1);
        }
        // a site ends on its timer, or early once you've stripped it
        if (siteT >= s.dur || G.gold >= s.target) {
          if (site < SITES.length - 1) { descend(); return; }
          done = true;
          if (G.gold >= SITES[2].target) {
            addScore(80);
            setScene(Prompt("THE WRECK, STRIPPED", "You came up heavier than any diver on that coast — in this telling, at least. The real crews found nearly nothing. It's why they went on the account instead.", advance, "+80 dive bonus · recorded in the log"));
          } else if (G.gold >= 60) {
            setScene(Prompt("THE WRECK", "A few handfuls of eight-reales and a lot of dead men's timber. Bellamy and Williams came south for the sunken Spanish fleet and found nearly nothing. They went on the account instead.", advance, "recorded in the log"));
          } else {
            setScene(Prompt("NEARLY NOTHING", "Empty hands and burning lungs. This part is true: the wreck divers of 1716 came up with nearly nothing. It is exactly why Bellamy turned pirate.", advance, "recorded in the log"));
          }
        }
      },
      render: function () {
        var s = SITES[site];
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, ["#3f93a8", "#2e7690", "#1e5a78"][site]); g.addColorStop(0.55, ["#175a72", "#0f4a62", "#0a3a52"][site]); g.addColorStop(1, "#061c28");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.globalAlpha = 0.12 * (1 - s.dark * 0.7); ctx.fillStyle = "#eafaff";
        for (var r = 0; r < 5; r++) { ctx.save(); ctx.translate(W * (0.15 + r * 0.2), 0); ctx.rotate(0.25); ctx.fillRect(-14, -20, 26, H * 1.3); ctx.restore(); }
        ctx.restore();
        ctx.fillStyle = "rgba(20,15,10,.6)";
        var nT = 4 + site * 2;
        for (var wt = 0; wt < nT; wt++) { var wx = W * (0.08 + wt * 0.86 / nT); ctx.save(); ctx.translate(wx, H - 24 - (wt % 3) * 14); ctx.rotate((wt % 2 ? 1 : -1) * 0.08); ctx.fillRect(-40, -8, 80, 16); ctx.restore(); }
        if (turtleDone && turtleT < 7) drawAspido(W * (0.5 - turtleT * 0.09), H * 0.28, turtleT);
        // eels: nest, tell, lunge
        for (var ei = 0; ei < eels.length; ei++) {
          var el = eels[ei];
          if (el.state === "hide") continue;
          var ex = el.x + el.lx;
          if (el.state === "warn") { var wp2 = 0.5 + 0.5 * Math.sin(seaT * 12); ctx.globalAlpha = wp2; text("!", el.x + el.dir * 18, el.y - 18, 18, "#ffd24a", "center", "bold"); ctx.globalAlpha = 1; }
          ctx.save();
          ctx.strokeStyle = "#5e7a4a"; ctx.lineWidth = 9; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(el.x - el.dir * 14, el.y); ctx.quadraticCurveTo(el.x + el.lx * 0.5, el.y + Math.sin(seaT * 9) * 5, ex, el.y); ctx.stroke();
          ctx.fillStyle = "#6e8a58"; ctx.beginPath(); ctx.ellipse(ex, el.y, 9, 6.5, 0, 0, 7); ctx.fill();
          ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(ex + el.dir * 3, el.y - 2, 1.6, 0, 7); ctx.fill();
          ctx.restore();
        }
        // falling timber: a marked column, then the beam
        if (timber) {
          if (!timber.live) { var tp = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 10)); ctx.globalAlpha = tp * 0.5; ctx.fillStyle = "#ffd24a"; ctx.fillRect(timber.x - 20, 0, 40, H); ctx.globalAlpha = 1; text("⚠", timber.x, 40, 18, "#ffd24a", "center", "bold"); }
          else { ctx.save(); ctx.translate(timber.x, timber.y); ctx.rotate(0.12); ctx.fillStyle = "#5a3a22"; ctx.fillRect(-10, -34, 20, 68); ctx.restore(); }
        }
        for (var i = 0; i < objs.length; i++) {
          var o = objs[i];
          if (o.kind === "shark") { drawShark(o.x, o.y, o.dir); continue; }
          ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a);
          if (o.kind === "air") { ctx.strokeStyle = "rgba(210,240,250,.9)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(210,240,250,.25)"; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 7); ctx.fill(); }
          else if (o.kind === "gem") { ctx.fillStyle = "#7adfc8"; ctx.beginPath(); ctx.moveTo(0, -o.r); ctx.lineTo(o.r, 0); ctx.lineTo(0, o.r); ctx.lineTo(-o.r, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.moveTo(0, -o.r * 0.5); ctx.lineTo(o.r * 0.5, 0); ctx.lineTo(0, o.r * 0.5); ctx.lineTo(-o.r * 0.5, 0); ctx.closePath(); ctx.fill(); }
          else { ctx.fillStyle = "#f7d84a"; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 7); ctx.fill(); ctx.fillStyle = "#b98f20"; ctx.font = "13px serif"; ctx.textAlign = "center"; ctx.fillText("$", 0, 4); ctx.textAlign = "left"; }
          ctx.restore();
        }
        var dx = G.shipX * W, dy = (0.14 + G.shipY * 0.74) * H;
        drawDiver(dx, dy);
        drawParts();
        // depth darkness with a lantern circle around the diver (deep sites)
        if (s.dark > 0) {
          var lr = clamp(W * 0.26, 110, 190);
          var dg = ctx.createRadialGradient(dx, dy, lr * 0.3, dx, dy, lr);
          dg.addColorStop(0, "rgba(4,10,16,0)"); dg.addColorStop(1, "rgba(4,10,16," + (s.dark * 0.9) + ")");
          ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
        }
        if (descendT >= 0) {
          ctx.fillStyle = "rgba(4,10,16," + clamp(Math.sin(descendT / 1.2 * Math.PI) * 0.85, 0, 0.85) + ")"; ctx.fillRect(0, 0, W, H);
          text("⬇ " + s.name, W / 2, H / 2, 22, "#7fd6ea", "center", "bold");
        }
        drawHUD();
        var bw = clamp(W * 0.44, 140, 340), bx = (W - bw) / 2, by = 58, bh2 = 8;
        ctx.fillStyle = "rgba(11,22,32,.55)"; roundRect(bx - 4, by - 4, bw + 8, bh2 + 8, 8); ctx.fill();
        ctx.fillStyle = "rgba(160,220,240,.25)"; roundRect(bx, by, bw, bh2, 5); ctx.fill();
        ctx.fillStyle = breath < 0.25 ? "#e05c5c" : "#7fd6ea"; roundRect(bx, by, bw * breath, bh2, 5); ctx.fill();
        text("BREATH", bx + bw / 2, by + bh2 + 13, 10.5, "rgba(224,246,252,.75)", "center", "bold");
        text("DIVE " + (site + 1) + "/3 · " + s.name, W / 2, H * 0.9, 11, "#7fd6ea", "center", "bold");
        text("gold: " + G.gold + " / " + s.target + (site < 2 ? "  ·  strip the site to descend early" : ""), W / 2, H * 0.94, 12, "rgba(244,231,201,.8)", "center", "bold");
        if (t < 2.2) { ctx.globalAlpha = clamp(2.2 - t, 0, 1); text("Dive for gold. Mind your breath. Sharks patrol, slow and lazy — just don't touch them.", W / 2, H * 0.5, 15, "#eafaff", "center", "bold"); ctx.globalAlpha = 1; }
        else if (site === 1 && siteT < 2.4) { ctx.globalAlpha = clamp(2.4 - siteT, 0, 1); text("Eels nest in the timbers — watch for the head. Grab air pockets to stay down.", W / 2, H * 0.5, 15, "#eafaff", "center", "bold"); ctx.globalAlpha = 1; }
        else if (site === 2 && siteT < 2.4) { ctx.globalAlpha = clamp(2.4 - siteT, 0, 1); text("The hold is coming down. Stay out of the marked columns. The big gold is here.", W / 2, H * 0.5, 15, "#eafaff", "center", "bold"); ctx.globalAlpha = 1; }
      }
    };
  }
  // M1 — The Three-Day Chase (Feb 1717), rebuilt to require actual sailing.
  // The Whydah weaves ahead; her wake is a 2D pocket (fore-aft band AND
  // behind her stern left-right). Inside the pocket you CLOSE distance;
  // outside you lose it, and her stern-chasers and wake debris try to shake
  // you off. Fire escalates by day (aimed → spread → aimed + powder kegs in
  // the wake), a gust leans in with a warning before it shoves. Close the
  // distance and it ends in a grapple flurry — miss the flurry and she pulls
  // back ahead. Fail to catch her by the end of day three and she's gone:
  // the day restarts and the score pays for it. Doing nothing now fails.
  function ChaseScene() {
    // A PURSUIT, not a gun duel — no cannons at all. She runs ahead and weaves;
    // you ride the bright slipstream lane behind her stern to CLOSE THE GAP,
    // dodging the debris and kegs she throws in her wake. When the gap closes
    // she's in reach — steer UP alongside her broadside and grapple across.
    var DAYS = [
      { label: "DAY ONE — DAWN",    pal: PALETTES[0], lane: 150, gain: 0.115, slip: 0.05,  dur: 15, weave: 40, debrisT: 1.4, kegs: false },
      { label: "DAY TWO — NOON",    pal: PALETTES[1], lane: 126, gain: 0.115, slip: 0.06,  dur: 16, weave: 56, debrisT: 1.15, kegs: false },
      { label: "DAY THREE — NIGHT", pal: PALETTES[4], lane: 104, gain: 0.115, slip: 0.075, dur: 17, weave: 74, debrisT: 0.95, kegs: true }
    ];
    var day = 0, t = 0, dayT = 0, objs = [], spawnT = 1.2, kegT = rand(3, 5);
    var gap = 0.25;                       // 0 = two miles astern, 1 = right on her stern
    var whX = W * 0.5, whDir = 1, whY = H * 0.13;
    var gust = null, gustT = rand(6, 9);
    var phase = "chase";                   // "chase" (close the gap) → "board" (pull alongside)
    var board = 0, grapple = null, retries = 0, done = false, forceWin = false;
    var WHR = 2.0;                          // she's drawn large — clearly the ship you're catching
    function inLane(px) { return Math.abs(px - whX) < DAYS[day].lane; }
    function boardHer() {
      done = true; SAVE.whydahTaken = true; persist(); addScore(140); SFX.win();
      setScene(Prompt("BOARDED!", "Three days on her stern, then up alongside her rail in a flurry of grapples. Bellamy took her as his own — the Whydah Gally, forty guns.", advance, "+140 · your ship, from here on"));
    }
    return {
      debugWin: function () { forceWin = true; },
      enter: function () { document.body.classList.add("playing"); G.pal = DAYS[0].pal; G.shipY = 0.62; toast(DAYS[0].label); if (chance(0.5)) spawnGull(); },
      update: function (dt) {
        if (done) return;
        if (forceWin) { boardHer(); return; }
        seaT += dt; t += dt; updateGulls(dt);
        var d = DAYS[day];
        if (window.__FS_DEBUG) { window.__chase = { whX: whX, gap: +gap.toFixed(3), phase: phase, board: +board.toFixed(2), lane: d.lane }; }
        helm(dt, 1, 0.5, false);
        var px = G.shipX * W, py = shipYPx();
        // she sails on, weaving across the water, quicker and wilder each day
        whX += whDir * d.weave * dt;
        if (whX < W * 0.2) whDir = 1;
        if (whX > W * 0.8) whDir = -1;
        if (chance(0.004 + day * 0.002)) whDir *= -1;

        // ---- PHASE 2: she slows and you overhaul her — she drops back into your
        // own waters so you can pull up on her beam. Match her lane and draw even.
        if (phase === "board") {
          whY = lerp(whY, H * (Y_LO + 0.02), 1.4 * dt);   // she falls back to the top of your reachable band
          var beside = inLane(px) && (py - whY) < 120;      // you're up alongside her, in her lane
          if (beside) {
            board = clamp(board + 0.55 * dt, 0, 1);
            if (!grapple) grapple = 1;
            if (chance(12 * dt)) spawn(whX + (px < whX ? 30 : -30), whY + rand(-20, 20), { vx: (px < whX ? 60 : -60), vy: rand(-20, 20), life: 0.4, r: 2, c: "#e0b25c" });
          } else { board = clamp(board - 0.35 * dt, 0, 1); }
          if (board >= 1) { boardHer(); return; }
          return;
        }

        // ---- PHASE 1: ride her slipstream to close the gap
        var drafting = inLane(px);
        gap = clamp(gap + (drafting ? d.gain : -d.slip) * dt, 0, 1);
        if (drafting) addScore(4 * dt);
        if (gap >= 1) { phase = "board"; objs = []; SFX.good(); toast("SHE'S IN REACH — pull up alongside her!"); return; }   // she stops throwing wake as you overhaul her (no frozen debris)

        // wind gusts lean in before they shove you off her wake
        gustT -= dt;
        if (!gust && gustT <= 0) { gust = { push: chance(0.5) ? 0.26 : -0.26, warn: 0.8 + warnBonus() * 0.3, t: 1.4 }; gustT = rand(7, 10); }
        if (gust) { if (gust.warn > 0) gust.warn -= dt; else { G.shipX = clamp(G.shipX + gust.push * dt, steerLo(), steerHi()); gust.t -= dt; if (gust.t <= 0) gust = null; } }

        // debris she throws in her wake — dodge it (steering, not shooting)
        spawnT -= dt;
        if (spawnT <= 0) { spawnT = rand(0.7, 1.2) * d.debrisT; objs.push({ kind: "debris", x: clamp(whX + rand(-150, 150), 20, W - 20), y: whY + 20, sp: rand(150, 200) + day * 15, r: rand(12, 18), a: 0, spin: rand(-1.5, 1.5) }); }
        if (d.kegs) { kegT -= dt; if (kegT <= 0) { kegT = rand(2.8, 4.2); objs.push({ kind: "keg", x: clamp(whX + rand(-90, 90), 30, W - 30), y: whY + 20, sp: rand(150, 185), r: 13, a: 0, spin: rand(-1, 1) }); } }
        for (var i = objs.length - 1; i >= 0; i--) {
          var o = objs[i]; o.y += o.sp * dt; o.a += o.spin * dt;
          if (Math.hypot(o.x - px, o.y - py) < o.r + 16) {
            if (o.kind === "keg") { damage(1); shake(14); splash(o.x, o.y, 14, "#ffcf6a"); gap = clamp(gap - 0.1, 0, 1); }
            else { damage(1); splash(o.x, o.y, 8); gap = clamp(gap - 0.05, 0, 1); }
            objs.splice(i, 1); continue;
          }
          if (o.y > H + 40) objs.splice(i, 1);
        }
        // the days turn; run out of them without catching her and she's away
        dayT += dt;
        if (dayT >= d.dur) {
          dayT = 0; day++;
          if (day >= DAYS.length) {
            day = DAYS.length - 1; retries++;
            addScore(-40); gap = clamp(gap - 0.35, 0, 1); objs = [];
            G.pal = DAYS[day].pal; toast("SHE SLIPPED AHEAD IN THE DARK — run her down again! (−40)"); SFX.lose();
            return;
          }
          G.pal = DAYS[day].pal; toast(DAYS[day].label);
        }
      },
      render: function () {
        drawSea(G.pal, seaT * 70, false);
        var d = DAYS[day], px = G.shipX * W, py = shipYPx(), drafting = inLane(px);
        // ---- the SLIPSTREAM lane: a bright glowing channel from her stern to you.
        // This is the whole game — ride it to gain. It pulses green when you're in it.
        var laneW = d.lane, top = whY + 26;
        var g = ctx.createLinearGradient(0, top, 0, H);
        var lit = (phase === "chase" && drafting);
        g.addColorStop(0, lit ? "rgba(143,214,160,.34)" : "rgba(224,178,92,.28)");
        g.addColorStop(1, lit ? "rgba(143,214,160,.05)" : "rgba(224,178,92,.04)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(whX - 20, top); ctx.lineTo(whX + 20, top); ctx.lineTo(whX + laneW, H); ctx.lineTo(whX - laneW, H); ctx.closePath(); ctx.fill();
        // dashed edges so the lane reads as a channel to stay inside
        ctx.strokeStyle = lit ? "rgba(143,214,160,.8)" : "rgba(224,178,92,.7)"; ctx.lineWidth = 2.5; ctx.setLineDash([10, 9]);
        ctx.beginPath(); ctx.moveTo(whX - 20, top); ctx.lineTo(whX - laneW, H); ctx.moveTo(whX + 20, top); ctx.lineTo(whX + laneW, H); ctx.stroke(); ctx.setLineDash([]);
        // debris/kegs
        for (var i = 0; i < objs.length; i++) {
          var o = objs[i]; ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a);
          if (o.kind === "keg") { ctx.fillStyle = "#6b4a2a"; ctx.fillRect(-9, -12, 18, 24); ctx.strokeStyle = "#3a2414"; ctx.lineWidth = 2; ctx.strokeRect(-9, -12, 18, 24); ctx.strokeStyle = "#c9962e"; ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(9, -4); ctx.moveTo(-9, 4); ctx.lineTo(9, 4); ctx.stroke(); }
          else { ctx.fillStyle = "#8a5a34"; blob(o.r); }
          ctx.restore();
        }
        // the Whydah — drawn LARGE so she's obviously the ship you're running down
        drawShip(whX, whY, WHR, { flag: "#111", hull: "#3a2818", deck: "#5a4326", sail: "#f3ead2", wake: true });
        // grapple lines when you're pulling alongside
        if (phase === "board" && grapple) {
          ctx.strokeStyle = "rgba(224,178,92,.85)"; ctx.lineWidth = 2;
          for (var gl = 0; gl < 3; gl++) { ctx.beginPath(); ctx.moveTo(px, py - 10 + gl * 12); ctx.lineTo(whX, whY + 20 + gl * 8); ctx.stroke(); }
        }
        drawShip(px, py, 1.6, playerShipOpts());
        drawParts();
        drawHUD();
        // ---- the big, unmistakable objective gauge
        var mw = clamp(W * 0.56, 220, 420), mx = (W - mw) / 2, my2 = 56;
        ctx.fillStyle = "rgba(11,22,32,.6)"; roundRect(mx - 5, my2 - 5, mw + 10, 20, 9); ctx.fill();
        ctx.fillStyle = "rgba(244,231,201,.18)"; roundRect(mx, my2, mw, 10, 5); ctx.fill();
        var barCol = phase === "board" ? "#8fd6a0" : (drafting ? "#8fd6a0" : "#e0b25c");
        ctx.fillStyle = barCol; roundRect(mx, my2, mw * (phase === "board" ? 1 : gap), 10, 5); ctx.fill();
        text(phase === "board" ? "IN REACH — GET ALONGSIDE" : "CLOSE THE GAP", mx + mw / 2, my2 + 27, 11.5, "#f4e7c9", "center", "bold");
        text(d.label + (retries ? "  ·  attempt " + (retries + 1) : ""), W / 2, H * 0.24, 14, "#ffd24a", "center", "bold");
        // ---- live coaching so the objective is never a mystery
        if (phase === "chase") {
          if (!drafting) { ctx.globalAlpha = 0.55 + 0.45 * Math.sin(seaT * 8); text("◀ STEER INTO HER WAKE — the glowing lane ▶", W / 2, H * 0.34, 15, "#ff8a7a", "center", "bold"); ctx.globalAlpha = 1; }
          else { text("GAINING ON HER! hold the lane", W / 2, H * 0.34, 14, "#8fd6a0", "center", "bold"); }
        } else {
          panel(W / 2, H * 0.5, clamp(W * 0.7, 250, 420), 96);
          text("PULL UP ALONGSIDE HER!", W / 2, H * 0.5 - 16, 20, "#8fd6a0", "center", "bold");
          text("steer UP into her wake lane, right off her beam", W / 2, H * 0.5 + 12, 13, "#f4e7c9", "center", "bold");
          var bw2 = clamp(W * 0.5, 200, 340);
          ctx.fillStyle = "rgba(244,231,201,.2)"; roundRect(W / 2 - bw2 / 2, H * 0.5 + 26, bw2, 8, 4); ctx.fill();
          ctx.fillStyle = "#e0b25c"; roundRect(W / 2 - bw2 / 2, H * 0.5 + 26, bw2 * board, 8, 4); ctx.fill();
        }
        if (gust && gust.warn > 0) text("💨 WIND RISING " + (gust.push > 0 ? "→" : "←") + " — brace the wheel!", W / 2, H * 0.4, 14, "#bfe0ff", "center", "bold");
        if (t < 3) { ctx.globalAlpha = clamp(3 - t, 0, 1); text("Run her down — ride the glowing wake lane to close in. No cannons; this is a chase.", W / 2, H * 0.62, 14, "#f4e7c9", "center", "bold"); ctx.globalAlpha = 1; }
      }
    };
  }

  function SailScene() {
    // longer legs by design (the kids said the voyage flew by) — Full Canvas buys the pace back
    var legTime = rand(10, 14) * legSpeedMul(), t = 0, ease = narrowEase();
    var shore = G.route === "shore", sea = G.route === "sea";
    var lm = mission().legMods;
    if (G.forceLegMod) { lm = Object.assign({}, lm, G.forceLegMod); G.forceLegMod = null; }
    var objs = [], balls = [], pickupT = 0.5, hazT = rand(1.2, 2.0), fireGun = gunner();
    // Sharks are confined to the sea route of the three "hunting ground"
    // missions (Carolina/Virginia/Long Island) — the kids hated them showing
    // up everywhere, so nowhere else in the campaign spawns a real shark.
    var sharksHere = sea && mission().routeVariant;
    var sharkT = sharksHere ? rand(9, 15) : Infinity;
    // Narrows only appear where the mission calls for them (the island maze,
    // the fog-bound Carolina coast) — no longer a flat "early legs" heuristic.
    var narrowsLatest = legTime - (H + 220) / 105 - 0.5;   // wall crosses the ship line before the leg ends
    var narrowsAt = (lm.narrows && narrowsLatest > 1 && chance(0.6)) ? rand(1, narrowsLatest) : -1;
    var narrowsDone = false;
    // never an empty leg: if no narrows rolled, a shark shows up early where they exist at all
    if (narrowsAt < 0 && sharksHere) sharkT = Math.min(sharkT, rand(2, legTime * 0.5));
    var coinArcAt = chance(0.7) ? rand(2, Math.max(3, legTime * 0.5)) : -1;
    var slow = consumeMod("slow") ? 0.75 : 1;
    G.mods.fogNow = !!consumeMod("fog");
    // insane mode: every leg spins the multiverse wheel
    var CHAOS = {
      gravity:   "🌀 LOW GRAVITY — everything drifts!",
      speed:     "⚡ SPEED RUN!",
      tiny:      "🐜 TINY SHIP!",
      gigacoins: "🪙 GIGA COINS!",
      mirror:    "🪞 MIRROR DIMENSION — the helm is reversed!",
      disco:     "🪩 DISCO SEA!",
      upsidegulls: "🙃 UPSIDE-DOWN GULLS!",
      crablegally: "🦀 EVERYTHING IS LEGALLY A CRAB!",
      suddennight: "🌙 SUDDEN NIGHT!"
    };
    var chaos = insane() ? choice(["gravity", "speed", "tiny", "gigacoins", "mirror", "disco", "upsidegulls", "crablegally", "suddennight"]) : null;
    if (chaos === "speed") legTime *= 0.8;
    var hitR = chaos === "tiny" ? 9 : 16, shipScale = chaos === "tiny" ? 1.1 : 1.6;
    var spMul = chaos === "speed" ? 1.35 : 1, discoT = 0;
    // themed leg systems: a scripted waterspout and/or whirlpool, at most one
    // each per leg, plus a constant current push where the mission calls for it
    var waterspoutAt = (lm.waterspout > 0 && chance(lm.waterspout) && legTime > 6) ? rand(3, legTime - 2) : -1;
    var waterspoutDone = false, wspout = null;
    var whirlAt = (lm.whirlpool > 0 && chance(lm.whirlpool) && legTime > 5) ? rand(2, legTime - 3) : -1;
    var whirlDone = false;
    // end-of-leg wind-down: spawns stop early, leftover pickups sweep to the
    // ship, hazards fade out, a LEG CLEAR banner shows, THEN the scene fades —
    // no more hard cuts with coins still on screen
    var legDone = -1;
    function collectPickup(o) {
      if (o.sub === "coin") {
        addScore(10); addGold((sea ? 15 : 10) * (o.giga ? 2 : 1)); SFX.coin(); coinBurst(o.x, o.y);
        G.coinStreak++;
        if (G.coinStreak >= 5) { G.coinStreak = 0; addGold(25); SFX.win(); toast("GOLD BAR! +25 🪙"); spawn(o.x, o.y - 20, { vy: -50, life: 1.0, r: 14, c: "#f7d84a", shape: "txt", txt: "+25 🪙" }); }
      }
      else if (o.sub === "dory") { addGold(10); addScore(5); SFX.coin(); coinBurst(o.x, o.y); }
      else if (o.sub === "crate") { addGold(20); addScore(15); SFX.win(); coinBurst(o.x, o.y); coinBurst(o.x, o.y); spawn(o.x, o.y - 18, { vy: -50, life: 1.0, r: 14, c: "#f7d84a", shape: "txt", txt: "📦 +20 🪙" }); }
      else if (o.sub === "bottle") { addScore(20); SFX.good(); coinBurst(o.x, o.y); spawn(o.x, o.y - 16, { vy: -46, life: 0.9, r: 12, c: "#bfe6ff", shape: "txt", txt: "+20" }); }
      // the treasure tiers — pearls, gems, silver bars, and the great chest.
      // Rarer as they get richer; each has its own look, colour, and payout.
      else if (o.sub === "pearl") { addGold(18); addScore(12); SFX.coin(); coinBurst(o.x, o.y); spawn(o.x, o.y - 16, { vy: -48, life: 0.9, r: 12, c: "#eaf6ff", shape: "txt", txt: "🦪 +18 🪙" }); }
      else if (o.sub === "gem") { addGold(30); addScore(22); SFX.win(); coinBurst(o.x, o.y); for (var gp = 0; gp < 10; gp++) spawn(o.x, o.y, { vx: rand(-70, 70), vy: rand(-110, -20), g: 220, life: rand(0.4, 0.8), r: rand(2, 3.5), c: o.gemc || "#e05c9c" }); spawn(o.x, o.y - 18, { vy: -52, life: 1.0, r: 14, c: o.gemc || "#e05c9c", shape: "txt", txt: "💎 +30 🪙" }); }
      else if (o.sub === "ingot") { addGold(40); addScore(26); SFX.win(); coinBurst(o.x, o.y); coinBurst(o.x, o.y); spawn(o.x, o.y - 18, { vy: -52, life: 1.0, r: 14, c: "#dfe7ee", shape: "txt", txt: "🥈 +40 🪙" }); }
      else if (o.sub === "chest") { addGold(70); addScore(50); SFX.win(); toast("💰 TREASURE CHEST! +70 🪙"); for (var cp = 0; cp < 20; cp++) spawn(o.x, o.y, { vx: rand(-140, 140), vy: rand(-170, -20), g: 240, life: rand(0.5, 1.1), r: rand(2, 4.5), c: choice(["#f7d84a", "#ffcf6a", "#fff", "#e0b25c"]) }); spawn(o.x, o.y - 22, { vy: -56, life: 1.2, r: 17, c: "#f7d84a", shape: "txt", txt: "💰 +70 🪙" }); }
      else if (o.sub === "wind") { addScore(8); SFX.good(); if (legDone < 0) t += 0.6; }
      else if (o.sub === "heart") {
        if (G.hull < G.maxHull) { repair(1); toast("❤ +1 heart"); spawn(o.x, o.y - 18, { vy: -50, life: 1.0, r: 14, c: "#ff8a7a", shape: "txt", txt: "+1 ♥" }); }
        else { addScore(15); }   // already full — a little score instead
        SFX.good(); for (var hb = 0; hb < 8; hb++) spawn(o.x, o.y, { vx: rand(-50, 50), vy: rand(-80, -10), g: 160, life: 0.7, r: 3, c: "#ff8a7a" });
      }
      else if (o.sub === "barrel") { repair(1); SFX.good(); for (var b2 = 0; b2 < 8; b2++) spawn(o.x, o.y, { vx: rand(-40, 40), vy: rand(-70, -10), g: 160, life: 0.7, r: 3, c: "#8fd6a0" }); }
    }
    return {
      enter: function () {
        document.body.classList.add("playing");
        if (lm.night || chaos === "suddennight") G.pal = PALETTES[4];   // moonlit night, forced for the Ghost Light leg (or the chaos roll)
        else if (chance(0.5)) G.pal = choice(insane() ? PALETTES_INSANE : PALETTES);
        G.gullFlip = chaos === "upsidegulls";
        G.chaosNow = chaos;
        if (chance(0.6)) spawnGull();
        if (chaos) { toast(CHAOS[chaos]); SFX.good(); }
      },
      update: function (dt) {
        seaT += dt; t += dt; updateGulls(dt);
        if (window.__FS_DEBUG) { window.__sailObjs = objs.length; window.__sailPeak = Math.max(window.__sailPeak || 0, objs.length); }
        if (chaos === "disco") { discoT -= dt; if (discoT <= 0) { discoT = 2; G.pal = choice(PALETTES_INSANE); } }
        helm(dt, slow, 0.4, chaos === "mirror");
        if (lm.current) G.shipX = clamp(G.shipX + lm.current * 0.09 * dt, steerLo(), steerHi());   // the Gulf Stream fights the helm
        var shipPX = G.shipX * W, shipPY = shipYPx();
        // guns are live on the open sea: blast the wreckage out of your way (hold to keep firing)
        if (fireGun(dt)) { playerShot(shipPX, shipPY - 20, -430).forEach(function (b) { balls.push(b); }); SFX.fire(); smoke(shipPX, shipPY - 18, 2); }
        // ---- PICKUP STREAM: a steady, lively run of things worth grabbing. This
        // is the reward channel — kept busy in every mode (busier the easier you
        // play) so the sea between fights never feels empty. Coins, cargo crates
        // you pop for gold, bottles, wind, repairs, and hearts when you're hurt.
        pickupT -= dt;
        if (pickupT <= 0 && t < legTime - 1.2 && legDone < 0) {
          pickupT = rand(0.5, 1.0) / diff().pickup;
          // common coins, then a spread of richer treasure that gets rarer as it
          // gets more valuable: crate/bottle/pearl (common-ish), gem/ingot (rarer),
          // chest (rare jackpot). Sea route runs a little richer than the shore.
          var picks = ["coin", "coin", "coin", "coin", "crate", "bottle", "pearl", "wind"];
          if (shore) picks.push("dory", "crate", "barrel");
          if (sea) picks.push("coin", "coin", "crate", "pearl");
          if (chance(0.35)) picks.push("gem");
          if (chance(0.22)) picks.push("ingot");
          if (chance(0.10)) picks.push("chest");
          // hearts drift by when you're hurt — the easier the mode, the likelier;
          // when you're desperate they show up in any mode
          if (G.hull < G.maxHull) for (var hw = 0; hw < diff().heart; hw++) picks.push("heart");   // easy 2 / hard 1 / extreme+insane 0 drifting hearts
          if (G.hull <= 2) picks.push("heart", "barrel");   // but when you're desperate, one shows in any mode
          var pk = { kind: "pickup", sub: choice(picks), r: 15, sp: rand(135, 190) * spMul / ease };
          if (pk.sub === "crate" || pk.sub === "chest") { pk.r = 18; }
          if (pk.sub === "gem") { pk.gemc = choice(["#e05c9c", "#5cc7e0", "#7ae05c", "#e0b25c", "#b06ce0"]); }
          if (pk.sub === "coin" && chaos === "gigacoins") { pk.r = 26; pk.giga = true; }
          if (chaos === "gravity") pk.drift2 = rand(-55, 55);
          pk.x = rand(0.12, 0.88) * W; pk.y = -40; pk.a = 0; pk.spin = rand(-2, 2);
          objs.push(pk);
        }
        // ---- HAZARD STREAM: a separate, mode-scaled danger channel (rocks near
        // the coast, drift ice up north, the odd jellyfish). Easy modes get wide
        // gaps and open water; extreme packs it in. Decoupled from pickups so the
        // sea can be lively without being lethal.
        hazT -= dt;
        if (hazT <= 0 && t < legTime - 1.6 && legDone < 0) {
          hazT = rand(1.5, 2.5) * diff().hazGap * (1 + warnBonus() * 0.2) * (G.firstRun ? 1.25 : 1) * ease;
          var north = lm.icy;
          var baseHaz = sea ? 0.6 : (shore ? 1.0 : 0.82);   // open sea runs calmer; the shore is rocky
          var hz;
          if (Math.random() < baseHaz) {
            var hsub = north ? choice(["ice", "rock", "ice"]) : (shore ? "rock" : choice(["rock", "ice"]));
            hz = { kind: "hazard", sub: hsub, r: rand(16, 26), sp: rand(135, 195) * spMul / ease, hp: hsub === "rock" ? 2 : 1 };
          } else {
            // the old shark-fin cue, reskinned as a harmless jellyfish bloom
            hz = { kind: "fin", sub: "jelly", r: 15, sp: rand(90, 130) * spMul / ease, drift: rand(-40, 40) };
          }
          if (chaos === "gravity") hz.drift2 = rand(-55, 55);
          hz.x = rand(0.1, 0.9) * W; hz.y = -40; hz.a = 0; hz.spin = rand(-2, 2);
          objs.push(hz);
        }
        // recurring drifting arcs of coins, worth chasing across the sea
        if (coinArcAt > 0 && t >= coinArcAt) {
          coinArcAt = (t + rand(4, 7) < legTime - 3) ? t + rand(4, 7) : -1;   // another arc later in the leg
          var arcX = rand(0.2, 0.8);
          for (var ca = 0; ca < 5; ca++) objs.push({ kind: "pickup", sub: "coin", r: 15, sp: 175, x: clamp(arcX + Math.sin(ca * 1.1) * 0.12, 0.08, 0.92) * W, y: -40 - ca * 52, a: 0, spin: 0 });
        }
        // breaching sharks — only where the mission's sea route says so, and
        // never so late in the leg that the stalk can't resolve before it ends
        if (sharksHere && t < legTime - 4.5 && legDone < 0) {
          sharkT -= dt;
          if (sharkT <= 0) {
            sharkT = rand(10, 16);   // long intervals — this is a rare, telegraphed threat now
            var easyNoLeap = gameMode() === "easy" && chance(0.5);
            objs.push({ kind: "shark", phase: "stalk", pt: (2.2 + warnBonus() * 0.3) * ease, willLeap: !easyNoLeap, x: clamp(shipPX + rand(-80, 80), 30, W - 30), y: H + 20, r: 20 });
          }
        }
        // a scripted waterspout: a marked column, then a push/hit if you're still in it
        if (waterspoutAt > 0 && !waterspoutDone && t >= waterspoutAt) { waterspoutDone = true; wspout = { x: rand(W * 0.15, W * 0.85), warn: 1.1 + warnBonus() * 0.3 }; }
        if (wspout) {
          wspout.warn -= dt;
          if (wspout.warn <= 0) {
            if (Math.abs(shipPX - wspout.x) < 60) { damage(1); shake(12); } else { addScore(15); SFX.point(); }
            wspout = null;
          }
        }
        // a whirlpool drifting down-screen: dodge it, or fight the pull at the rim
        if (whirlAt > 0 && !whirlDone && t >= whirlAt) {
          whirlDone = true;
          objs.push({ kind: "whirlpool", x: rand(W * 0.3, W * 0.7), y: -110, R: clamp(W * 0.22, 90, 170), k: 0.5, sp: 42 });
        }
        // the narrows: a wall of land with one gap — thread the needle. On the
        // mooncusser coast, a second false-lit gap tries to lure you onto the rocks.
        if (narrowsAt > 0 && !narrowsDone && t >= narrowsAt) {
          narrowsDone = true;
          var narrowsObj = { kind: "narrows", gap: rand(0.25, 0.75), gapW: clamp(W * 0.30, 130, 230), y: -90, sp: 105, r: 0 };
          if (lm.mooncusser && chance(0.7)) narrowsObj.falseGap = clamp(narrowsObj.gap + (chance(0.5) ? 1 : -1) * rand(0.25, 0.4), 0.1, 0.9);
          objs.push(narrowsObj);
        }
        for (var i = objs.length - 1; i >= 0; i--) {
          var o = objs[i];
          if (legDone >= 0) {
            // wind-down: pickups magnet to the ship and auto-collect; anything
            // with teeth fades out harmlessly
            if (o.kind === "pickup") {
              o.x = lerp(o.x, shipPX, 6.5 * dt); o.y = lerp(o.y, shipPY, 6.5 * dt); o.a += o.spin * dt;
              if (Math.hypot(o.x - shipPX, o.y - shipPY) < o.r + hitR + 8) { collectPickup(o); objs.splice(i, 1); }
              continue;
            }
            o.fade = (o.fade == null ? 1 : o.fade) - 2.6 * dt;
            if (o.fade <= 0) objs.splice(i, 1);
            continue;
          }
          if (o.kind === "whirlpool") {
            o.y += o.sp * dt;
            var sucked = applyWhirlpool(dt, o, shipPX, shipPY);
            if (sucked) { damage(1); shake(12); objs.splice(i, 1); continue; }
            if (o.y - o.R > H) { objs.splice(i, 1); continue; }
            continue;
          }
          if (o.kind === "shark") {
            if (o.phase === "stalk") {
              o.y = shipPY + 26; o.x = lerp(o.x, shipPX, 1.2 * dt); o.pt -= dt;
              if (o.pt <= 0) {
                if (!o.willLeap) { splash(o.x, H * 0.92, 8, "#9fb6c9"); objs.splice(i, 1); continue; }   // easy mode: it just sinks away
                o.phase = "leap"; o.vy = -rand(320, 380); o.vx = clamp((shipPX - o.x) * 0.85, -85, 85); splash(o.x, H * 0.9, 12);
              }
            } else {
              o.vy += 480 * dt; o.x += o.vx * dt; o.y += o.vy * dt;
              if (Math.hypot(o.x - shipPX, o.y - shipPY) < o.r + hitR) { splash(o.x, o.y, 10, "#9fb6c9"); damage(1); objs.splice(i, 1); continue; }
              if (o.y > H + 60 && o.vy > 0) { objs.splice(i, 1); continue; }
            }
            continue;
          }
          if (o.kind === "narrows") {
            o.y += o.sp * dt;
            var gx = o.gap * W, half = o.gapW / 2;
            if (Math.abs(o.y - shipPY) < 34 && (shipPX < gx - half + 12 || shipPX > gx + half - 12)) {
              splash(shipPX, shipPY, 12); damage(1); shake(14); objs.splice(i, 1); continue;
            }
            if (o.y > H + 120) { addScore(15); SFX.point(); objs.splice(i, 1); }
            continue;
          }
          o.y += o.sp * dt; o.a += o.spin * dt;
          if (o.kind === "fin") o.x += (o.drift || 0) * dt;
          if (o.drift2) o.x += o.drift2 * dt;   // low gravity: sideways drift
          var d = Math.hypot(o.x - shipPX, o.y - shipPY);
          if (d < o.r + hitR) {
            if (o.kind === "hazard") { splash(o.x, o.y, 8); damage(1); objs.splice(i, 1); continue; }
            if (o.kind === "fin") { splash(o.x, o.y, 6, "rgba(180,140,220,.7)"); addScore(-5); SFX.bad(); objs.splice(i, 1); continue; }
            collectPickup(o);
            objs.splice(i, 1); continue;
          }
          if (o.y > H + 50) { if (o.kind === "hazard") addScore(2); objs.splice(i, 1); }
        }
        // cannonballs vs hazards and sharks — shootable in either phase now,
        // so a spotted shark never HAS to become a leap at all
        var sailTargets = [];
        for (var oi = 0; oi < objs.length; oi++) {
          var ob = objs[oi];
          if (ob.kind === "hazard") {
            (function (o2) { sailTargets.push({ x: o2.x, y: o2.y, r: o2.r, onHit: function (b) {
              o2.hp--; splash(b.x, b.y, 6, o2.sub === "ice" ? "#cfe9f2" : "#cdb98a"); SFX.hit();
              if (o2.hp <= 0) { addScore(5); SFX.point(); splash(o2.x, o2.y, 10); var idx = objs.indexOf(o2); if (idx >= 0) objs.splice(idx, 1); }
            } }); })(ob);
          } else if (ob.kind === "shark") {
            (function (o2) { sailTargets.push({ x: o2.x, y: o2.y, r: o2.r + 2, onHit: function (b) {
              addScore(o2.phase === "stalk" ? 10 : 15); addGold(5); SFX.win(); splash(o2.x, o2.y, 14, "#9fb6c9"); coinBurst(o2.x, o2.y);
              var idx = objs.indexOf(o2); if (idx >= 0) objs.splice(idx, 1);
            } }); })(ob);
          }
        }
        stepBalls(balls, dt, sailTargets);
        if (t >= legTime && legDone < 0) { legDone = 0; wspout = null; addScore(10); SFX.point(); }
        if (legDone >= 0) {
          legDone += dt;
          if (legDone >= 1.15) advance();
        }
      },
      render: function () {
        drawSea(G.pal, seaT * 55, false);
        for (var i = 0; i < objs.length; i++) {
          var o = objs[i];
          ctx.globalAlpha = o.fade != null ? clamp(o.fade, 0, 1) : 1;   // wind-down fade-out
          if (o.kind === "whirlpool") { drawWhirlpool(o); continue; }
          if (o.kind === "fin") { drawJelly(o.x, o.y); continue; }
          if (o.kind === "shark") {
            if (o.phase === "stalk") {
              // dark shadow + a bold pulsing cue up where you're looking, so a
              // shark can't sneak up while you're aiming forward
              ctx.fillStyle = "rgba(20,40,50,.4)"; ctx.beginPath(); ctx.ellipse(o.x, o.y + 6, 30, 10, 0, 0, 7); ctx.fill();
              drawFin(o.x, o.y, 1);
              var fadeA = o.fade != null ? clamp(o.fade, 0, 1) : 1;
              var pulse = 0.55 + 0.45 * Math.sin(seaT * 12);
              ctx.globalAlpha = pulse * fadeA;
              text("🦈 SHARK!", o.x, shipYPx() - 58, clamp(W * 0.045, 15, 20), "#ff8a7a", "center", "bold");
              text("▼ shoot it or dodge", o.x, shipYPx() - 40, 13, "#ff8a7a", "center", "bold");
              ctx.globalAlpha = fadeA;
              var wind = clamp(1 - o.pt, 0, 1);   // ripple grows in the last second before the leap
              if (wind > 0) {
                ctx.strokeStyle = "rgba(255,138,122,.8)"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(o.x, o.y + 4, 18 + wind * 55, 0, 7); ctx.stroke();
              }
            } else drawShark(o.x, o.y, o.vx >= 0 ? 1 : -1);
            continue;
          }
          if (o.kind === "narrows") { drawNarrows(o); continue; }
          if (o.kind === "hazard" && chaos === "crablegally") { drawCrabEnemy(o.x, o.y, o.r / 20, {}); continue; }
          ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a);
          if (o.kind === "hazard") {
            if (o.sub === "rock") { ctx.fillStyle = o.hp < 2 ? "#6e6a62" : "#5b5750"; blob(o.r); ctx.fillStyle = "rgba(255,255,255,.12)"; blob(o.r * 0.6); }
            else if (o.sub === "ice") { ctx.fillStyle = "#cfe9f2"; blob(o.r); ctx.fillStyle = "rgba(255,255,255,.5)"; blob(o.r * 0.5); }
            else { ctx.fillStyle = "#6b4a2a"; ctx.fillRect(-o.r, -5, o.r * 2, 10); }
          } else {
            if (o.sub === "coin" && hasMut("cheese")) { ctx.fillStyle = "#f0c14a"; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 7); ctx.fill(); ctx.fillStyle = "#c9962e"; ctx.beginPath(); ctx.arc(-o.r * 0.3, -o.r * 0.2, o.r * 0.22, 0, 7); ctx.arc(o.r * 0.25, o.r * 0.3, o.r * 0.16, 0, 7); ctx.arc(o.r * 0.1, -o.r * 0.45, o.r * 0.14, 0, 7); ctx.fill(); }
            else if (o.sub === "coin") { ctx.fillStyle = "#f7d84a"; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, 7); ctx.fill(); ctx.fillStyle = "#b98f20"; ctx.font = "14px serif"; ctx.textAlign = "center"; ctx.fillText("$", 0, 5); ctx.textAlign = "left"; }
            else if (o.sub === "wind") { ctx.strokeStyle = "#eafaff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, o.r, 0.6, 5.2); ctx.stroke(); }
            else if (o.sub === "dory") { ctx.fillStyle = "#7a5a34"; ctx.beginPath(); ctx.moveTo(-14, -4); ctx.quadraticCurveTo(0, 10, 14, -4); ctx.lineTo(10, -8); ctx.lineTo(-10, -8); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#4a3520"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.stroke(); }
            else if (o.sub === "heart") { var hs = o.r * 0.9; ctx.fillStyle = "#e05c5c"; ctx.beginPath(); ctx.moveTo(0, hs * 0.75); ctx.bezierCurveTo(hs, 0, hs * 0.55, -hs, 0, -hs * 0.35); ctx.bezierCurveTo(-hs * 0.55, -hs, -hs, 0, 0, hs * 0.75); ctx.closePath(); ctx.fill(); ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.arc(-hs * 0.3, -hs * 0.28, hs * 0.16, 0, 7); ctx.fill(); }
            else if (o.sub === "crate") { ctx.fillStyle = "#a9743a"; ctx.fillRect(-o.r, -o.r, o.r * 2, o.r * 2); ctx.strokeStyle = "#5a3a1e"; ctx.lineWidth = 2.5; ctx.strokeRect(-o.r, -o.r, o.r * 2, o.r * 2); ctx.beginPath(); ctx.moveTo(-o.r, -o.r); ctx.lineTo(o.r, o.r); ctx.moveTo(o.r, -o.r); ctx.lineTo(-o.r, o.r); ctx.stroke(); ctx.fillStyle = "#f7d84a"; ctx.font = "bold 11px serif"; ctx.textAlign = "center"; ctx.fillText("🪙", 0, 4); ctx.textAlign = "left"; }
            else if (o.sub === "bottle") { ctx.fillStyle = "#5a9a6a"; ctx.beginPath(); ctx.ellipse(0, 2, o.r * 0.5, o.r * 0.85, 0, 0, 7); ctx.fill(); ctx.fillStyle = "#3a2a1a"; ctx.fillRect(-o.r * 0.16, -o.r, o.r * 0.32, o.r * 0.6); ctx.fillStyle = "rgba(240,235,210,.85)"; ctx.fillRect(-o.r * 0.34, -o.r * 0.1, o.r * 0.68, o.r * 0.5); }
            else if (o.sub === "pearl") { var pr = o.r * 0.72; ctx.fillStyle = "#eef6fb"; ctx.beginPath(); ctx.arc(0, 0, pr, 0, 7); ctx.fill(); ctx.fillStyle = "rgba(200,225,240,.6)"; ctx.beginPath(); ctx.arc(pr * 0.28, pr * 0.28, pr * 0.55, 0, 7); ctx.fill(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-pr * 0.3, -pr * 0.32, pr * 0.28, 0, 7); ctx.fill(); }
            else if (o.sub === "gem") { var gc = o.gemc || "#e05c9c", gr = o.r * 0.9; ctx.fillStyle = gc; ctx.beginPath(); ctx.moveTo(0, -gr); ctx.lineTo(gr * 0.85, -gr * 0.2); ctx.lineTo(0, gr); ctx.lineTo(-gr * 0.85, -gr * 0.2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-gr * 0.85, -gr * 0.2); ctx.lineTo(gr * 0.85, -gr * 0.2); ctx.moveTo(0, -gr); ctx.lineTo(0, gr); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.moveTo(0, -gr); ctx.lineTo(gr * 0.4, -gr * 0.2); ctx.lineTo(0, -gr * 0.2); ctx.closePath(); ctx.fill(); }
            else if (o.sub === "ingot") { ctx.fillStyle = "#d7dee6"; ctx.beginPath(); ctx.moveTo(-o.r, o.r * 0.45); ctx.lineTo(o.r, o.r * 0.45); ctx.lineTo(o.r * 0.7, -o.r * 0.45); ctx.lineTo(-o.r * 0.7, -o.r * 0.45); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#9aa6b2"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillRect(-o.r * 0.55, -o.r * 0.28, o.r * 1.1, o.r * 0.16); }
            else if (o.sub === "chest") { ctx.fillStyle = "#7a4a24"; ctx.fillRect(-o.r, -o.r * 0.3, o.r * 2, o.r * 1.1); ctx.fillStyle = "#8a5a2e"; ctx.beginPath(); ctx.moveTo(-o.r, -o.r * 0.3); ctx.quadraticCurveTo(0, -o.r * 1.1, o.r, -o.r * 0.3); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#e0b25c"; ctx.lineWidth = 2.5; ctx.strokeRect(-o.r, -o.r * 0.3, o.r * 2, o.r * 1.1); ctx.fillStyle = "#f7d84a"; ctx.fillRect(-o.r * 0.18, -o.r * 0.05, o.r * 0.36, o.r * 0.45); ctx.strokeStyle = "#e0b25c"; ctx.beginPath(); ctx.moveTo(-o.r, 0); ctx.lineTo(o.r, 0); ctx.stroke(); }
            else { ctx.fillStyle = "#8a5a34"; ctx.fillRect(-o.r * 0.7, -o.r, o.r * 1.4, o.r * 2); ctx.strokeStyle = "#5a3a22"; ctx.lineWidth = 2; ctx.strokeRect(-o.r * 0.7, -o.r, o.r * 1.4, o.r * 2); }
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        if (wspout) drawWaterspoutWarn(wspout);
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), shipScale, playerShipOpts());
        drawParts();
        // fog: a radial lantern-circle mask instead of a flat haze; night: a warm glow around the ship
        if (lm.fog) {
          var maskR = clamp(W * 0.24, 100, 170) * (1 + warnBonus() * 0.35);
          var mg = ctx.createRadialGradient(G.shipX * W, shipYPx(), maskR * 0.28, G.shipX * W, shipYPx(), maskR);
          mg.addColorStop(0, "rgba(10,14,18,0)"); mg.addColorStop(1, "rgba(10,14,18,.88)");
          ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
        }
        if (lm.night) {
          var ng = ctx.createRadialGradient(G.shipX * W, shipYPx(), 0, G.shipX * W, shipYPx(), 74);
          ng.addColorStop(0, "rgba(255,210,120,.12)"); ng.addColorStop(1, "rgba(255,210,120,0)");
          ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
        }
        drawHUD();
        for (var n = 0; n < objs.length; n++) if (objs[n].kind === "narrows" && objs[n].y < H * 0.7) {
          var no = objs[n], ngx = no.gap * W;
          text(no.falseGap != null ? "NARROWS — one light lies. Follow the steady flame." : "NARROWS AHEAD — find the gap!", W / 2, H * 0.42, 15, "#ffd24a", "center", "bold");
          text("▼", ngx, Math.max(no.y + 74, 90), 20, "#ffd24a", "center", "bold");
        }
        if (t < 2.0) { ctx.globalAlpha = clamp(2.0 - t, 0, 1); text(missionName() + ". Coins feed the war chest. Shoot or dodge the rest.", W / 2, H * 0.5, 16, "#f4e7c9", "center", "bold"); ctx.globalAlpha = 1; }
        if (legDone >= 0) {
          ctx.globalAlpha = clamp(legDone * 4, 0, 1);
          text("⚓ LEG CLEAR", W / 2, H * 0.44, 26, "#8fd6a0", "center", "bold");
          text("+10  ·  the crew hauls in what's adrift", W / 2, H * 0.44 + 26, 13, "#e0b25c", "center", "bold");
          ctx.globalAlpha = 1;
        }
      }
    };
  }
  function drawShark(x, y, dir) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); ctx.rotate(-0.35 * dir);
    ctx.fillStyle = "#4a5c66";
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a4a54";
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(4, -22, 10, -8); ctx.closePath(); ctx.fill();   // dorsal
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-38, -9); ctx.lineTo(-34, 4); ctx.closePath(); ctx.fill(); // tail
    ctx.fillStyle = "#dfe9ee"; ctx.beginPath(); ctx.ellipse(4, 5, 18, 4.5, 0, 0, 7); ctx.fill();               // belly
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(17, -3, 2.2, 0, 7); ctx.fill();
    if (insane()) { ctx.fillStyle = "#111"; ctx.fillRect(11, -6, 12, 5); ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(12, -5, 4, 2); }   // multiverse sharks wear shades
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(20, 4); ctx.lineTo(24, 6); ctx.moveTo(17, 6); ctx.lineTo(21, 8); ctx.stroke(); // teeth-ish
    ctx.restore();
  }
  function drawNarrows(o) {
    var gx = o.gap * W, half = o.gapW / 2, hh = 42;
    ctx.save();
    [[0, gx - half], [gx + half, W]].forEach(function (side) {
      var x0 = side[0], x1 = side[1]; if (x1 - x0 < 4) return;
      ctx.fillStyle = G.pal.land;
      ctx.beginPath(); ctx.moveTo(x0, o.y - hh);
      for (var x = x0; x <= x1; x += 26) ctx.lineTo(x, o.y - hh + Math.sin(x * 0.08) * 10);
      ctx.lineTo(x1, o.y + hh); ctx.lineTo(x0, o.y + hh); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(x0, o.y + hh - 8, x1 - x0, 8);   // surf line
    });
    // the real gap: a steady lighthouse flame
    ctx.fillStyle = "rgba(223,241,244,.5)";
    ctx.fillRect(gx - half + 4, o.y + hh - 4, 6, 4); ctx.fillRect(gx + half - 10, o.y + hh - 4, 6, 4);
    ctx.fillStyle = "#ffe4a0"; ctx.beginPath(); ctx.arc(gx, o.y - hh - 6, 5, 0, 7); ctx.fill();
    // the mooncusser's false gap: a decoy in the rocks, its wreckers' fire flickering
    if (o.falseGap != null) {
      var fgx = o.falseGap * W;
      ctx.fillStyle = "rgba(120,80,40,.4)";
      ctx.fillRect(fgx - half + 4, o.y + hh - 4, 6, 4); ctx.fillRect(fgx + half - 10, o.y + hh - 4, 6, 4);
      var flick = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 17 + fgx));
      ctx.globalAlpha = flick;
      ctx.fillStyle = "#ff9a3a"; ctx.beginPath(); ctx.arc(fgx, o.y - hh - 6, 5, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function blob(r) { ctx.beginPath(); ctx.moveTo(r, 0); for (var a = 0; a <= 7; a += 0.7) { var rr = r * (0.8 + 0.2 * Math.sin(a * 3)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
  // the passive "fin" hazard, reskinned: a harmless jellyfish bloom drifting
  // by, now that real sharks are confined to their own hunting grounds
  function drawJelly(x, y) {
    ctx.save(); ctx.translate(x, y);
    var pulse = 0.85 + 0.15 * Math.sin(seaT * 3 + x * 0.05);
    ctx.fillStyle = "rgba(200,150,230,.55)";
    ctx.beginPath(); ctx.ellipse(0, 0, 15 * pulse, 10 * pulse, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = "rgba(200,150,230,.4)"; ctx.lineWidth = 2;
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 5, 2);
      ctx.quadraticCurveTo(i * 5 + Math.sin(seaT * 4 + i) * 4, 14, i * 5 + Math.sin(seaT * 4 + i) * 2, 24);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(230,200,250,.7)";
    ctx.beginPath(); ctx.ellipse(0, -2, 9 * pulse, 5 * pulse, 0, Math.PI, 0); ctx.fill();
    ctx.restore();
  }
  // Virginia Capes waterspout: a marked column that warns before it resolves
  function drawWaterspoutWarn(wp) {
    var pulse = 0.5 + 0.5 * Math.sin(seaT * 10);
    ctx.save();
    ctx.strokeStyle = "rgba(200,220,235," + (0.3 + pulse * 0.4) + ")"; ctx.lineWidth = 5;
    ctx.beginPath();
    for (var y = H; y > -20; y -= 14) {
      var wob = Math.sin(y * 0.06 + seaT * 6) * 10;
      if (y === H) ctx.moveTo(wp.x + wob, y); else ctx.lineTo(wp.x + wob, y);
    }
    ctx.stroke();
    ctx.globalAlpha = pulse;
    text("🌪 WATERSPOUT", wp.x, H * 0.3, 15, "#eaf6ff", "center", "bold");
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------------------------------------------------------------- EVENT card
  function EventScene(ev) {
    var t = 0, applied = false, picked = -1, resultLine = "";
    if (!SAVE.seen) SAVE.seen = {};
    if (!SAVE.seen[ev.id]) { SAVE.seen[ev.id] = true; persist(); invalidateSeenCache(); }   // logged in the tales book
    // the steady-hand bar: every plain event is now a timing check. Stop the
    // marker in the green and good news pays double / bad news is halved.
    var hasFx = !ev.choice && ev.fx && (ev.fx.s || ev.fx.g || ev.fx.h);
    var barPos = 0, barDir = 1, barSpd = rand(1.3, 1.7), barDone = !hasFx, steady = false, barT = 0;
    var appliedFx = ev.fx;
    function scaleFx(fx, mul) {
      var out = {};
      for (var k in fx) {
        var v = fx[k];
        if (v > 0) out[k] = Math.round(v * mul);
        else if (k === "h") out[k] = Math.min(0, v + 1);   // steady hands spare a hull point
        else out[k] = Math.round(v / mul);
      }
      return out;
    }
    function apply(fx) {
      fx = fx || {};
      if (fx.s) addScore(fx.s);
      if (fx.g) addGold(fx.g);
      if (fx.h) { if (fx.h > 0) repair(fx.h); else damage(-fx.h); }
      var good = (fx.s || 0) >= 0 && (fx.g || 0) >= 0 && (fx.h || 0) >= 0;
      if (good) SFX.good(); else SFX.bad();
    }
    function applyMod(m) {
      if (!m) return;
      if (m === "fog") G.mods.fog = true;
      else if (m === "drill") G.mods.drill = true;
      else if (m === "chart") G.mods.chart = true;
      else if (m === "slow") G.mods.slow = true;
      else if (m === "warned") G.mods.warned = true;
      else if (m === "navyintel") G.mods.navyintel = true;
      else if (m === "navy") G.mods.navyNext = true;
      else if (m === "blessed") G.mods.blessed = true;
      else if (m === "cursed") G.mods.cursed = true;
    }
    function fxLine(fx) {
      fx = fx || {}; var bits = [];
      if (fx.s) bits.push((fx.s > 0 ? "+" : "") + fx.s + " points");
      if (fx.g) bits.push((fx.g > 0 ? "+" : "") + fx.g + " gold");
      if (fx.h) bits.push((fx.h > 0 ? "+" : "") + fx.h + " hull");
      return bits.join("   ");
    }
    return {
      debugChoose: function (i) { if (ev.choice && picked < 0) { picked = i; var c = ev.choice[i]; apply(c.fx); applyMod(c.mod); resultLine = c.r; } },
      update: function (dt) {
        seaT += dt; t += dt; updateGulls(dt);
        if (hasFx && !barDone) {
          barT += dt;
          barPos += barDir * barSpd * dt;
          if (barPos > 1) { barPos = 1; barDir = -1; } if (barPos < 0) { barPos = 0; barDir = 1; }
          if (t > 0.35 && consumeTap()) {
            steady = Math.abs(barPos - 0.5) < 0.11;
            appliedFx = steady ? scaleFx(ev.fx, 2) : ev.fx;
            barDone = true; applied = true; apply(appliedFx); applyMod(ev.mod);
            if (steady) SFX.point();
          } else if (barT > 6) {   // the moment passes
            appliedFx = ev.fx;
            barDone = true; applied = true; apply(appliedFx); applyMod(ev.mod);
          }
          return;
        }
        if (!ev.choice && !applied && t > 0.2) { applied = true; apply(appliedFx); applyMod(ev.mod); }
        if (ev.choice && picked < 0) {
          if (input.leftPressed) this.debugChoose(0);
          else if (input.rightPressed) this.debugChoose(1);
          return;
        }
        if (t > 0.3 && consumeTap()) advance();
      },
      render: function () {
        drawSea(G.pal, seaT * 40, false);
        drawShip(W / 2, H * 0.74, 1.7, playerShipOpts());
        drawParts(); drawHUD();
        var w = clamp(W * 0.86, 290, 480);
        var isChoice = !!ev.choice && picked < 0;
        var barLive = hasFx && !barDone;
        var h = isChoice ? 236 : (barLive ? 224 : 196);
        var cy = H * 0.42;
        panel(W / 2, cy, w, h);
        var tagTxt = ev.tag === "record" ? "⚓ FROM THE RECORD" : (ev.tag === "yarn" ? "🌀 SEA YARN" : (ev.tag === "multi" ? "🤯 MULTIVERSE" : "LIFE AT SEA"));
        var tagCol = ev.tag === "record" ? "#8fd6a0" : (ev.tag === "yarn" ? "#9fb6d6" : (ev.tag === "multi" ? "#ff9de2" : "#cdb98a"));
        text(tagTxt, W / 2, cy - h / 2 + 24, 11, tagCol, "center", "bold");
        text(ev.t, W / 2, cy - h / 2 + 50, 21, "#e0b25c", "center", "bold");
        var yy = wrapText(ev.b, W / 2, cy - h / 2 + 76, w - 46, 20, 14, "#f4e7c9");
        if (isChoice) {
          var bw = (w - 60) / 2, by = cy + h / 2 - 58;
          for (var i = 0; i < 2; i++) {
            if (uiButton(W / 2 - w / 2 + 20 + i * (bw + 20), by, bw, 44, ev.choice[i].l, { size: 13.5, color: i === 0 ? "#96341f" : "#1f4a5e" })) this.debugChoose(i);
          }
          text("or press ← for the first, → for the second", W / 2, cy + h / 2 - 4, 10.5, "rgba(244,231,201,.55)");
        } else if (barLive) {
          var bw2 = w - 80, bx2 = W / 2 - bw2 / 2, by2 = cy + h / 2 - 52;
          ctx.fillStyle = "rgba(244,231,201,.18)"; roundRect(bx2, by2, bw2, 14, 7); ctx.fill();
          ctx.fillStyle = "rgba(143,214,160,.45)"; ctx.fillRect(bx2 + bw2 * 0.39, by2, bw2 * 0.22, 14);
          ctx.fillStyle = "#ffd24a"; ctx.fillRect(bx2 + bw2 * barPos - 3, by2 - 4, 6, 22);
          text("STEADY HANDS — tap in the green to make the best of it", W / 2, cy + h / 2 - 16, 11.5, "#cdb98a", "center", "bold");
        } else {
          if (picked >= 0 && resultLine) wrapText(resultLine, W / 2, yy + 24, w - 60, 18, 13, "#cdeccf");
          if (hasFx && steady) text("STEADY HANDS! The crew makes the most of it.", W / 2, yy + 24, 12.5, "#8fd6a0", "center", "bold");
          var line = fxLine(picked >= 0 ? ev.choice[picked].fx : (hasFx ? appliedFx : ev.fx));
          if (line) text(line, W / 2, cy + h / 2 - 34, 15, "#e0b25c", "center", "bold");
          text("tap to sail on", W / 2, cy + h / 2 - 12, 11.5, "rgba(244,231,201,.6)");
        }
      }
    };
  }

  // ---------------------------------------------------------------- FORK: inshore or offshore
  function ForkScene() {
    var t = 0, picked = -1;
    var CHOICES = [
      { l: "Hug the shore", route: "shore", r: "Landmarks to steer by and towns to trade with — but shoals, sandbars, and narrow water all the way north." },
      { l: "Stand out to sea", route: "sea", r: "Clean deep water and sea room to run — but sharks, squalls, and no harbor if it goes wrong." }
    ];
    function choose(i) {
      if (picked >= 0) return;
      picked = i;
      G.route = CHOICES[i].route;
      rerollEvents(G.route);
      SFX.good();
    }
    return {
      debugChoose: function (i) { choose(i); },
      update: function (dt) {
        seaT += dt; t += dt; updateGulls(dt);
        if (picked < 0) {
          if (input.leftPressed) choose(0);
          else if (input.rightPressed) choose(1);
          return;
        }
        if (t > 0.3 && consumeTap()) advance();
      },
      render: function () {
        drawSea(G.pal, seaT * 40, false);
        drawShip(W / 2, H * 0.74, 1.7, playerShipOpts());
        drawParts(); drawHUD();
        var w = clamp(W * 0.86, 290, 480), h = picked < 0 ? 240 : 200, cy = H * 0.42;
        panel(W / 2, cy, w, h);
        text("⚓ FROM THE RECORD", W / 2, cy - h / 2 + 24, 11, "#8fd6a0", "center", "bold");
        text("The coast or the deep?", W / 2, cy - h / 2 + 50, 21, "#e0b25c", "center", "bold");
        var yy = wrapText("Every captain running north made this call: coast along the land, or stand out to sea. Bellamy knew both. Choose your water.", W / 2, cy - h / 2 + 76, w - 46, 20, 14, "#f4e7c9");
        if (picked < 0) {
          var bw = (w - 60) / 2, by = cy + h / 2 - 58;
          for (var i = 0; i < 2; i++) {
            if (uiButton(W / 2 - w / 2 + 20 + i * (bw + 20), by, bw, 44, CHOICES[i].l, { size: 13.5, color: i === 0 ? "#2c5e38" : "#1f4a5e" })) choose(i);
          }
          text("or press ← for the shore, → for the sea", W / 2, cy + h / 2 - 4, 10.5, "rgba(244,231,201,.55)");
        } else {
          wrapText(CHOICES[picked].r, W / 2, yy + 24, w - 60, 18, 13, "#cdeccf");
          text("tap to sail on", W / 2, cy + h / 2 - 12, 11.5, "rgba(244,231,201,.6)");
        }
      }
    };
  }

  // ---------------------------------------------------------------- BATTLE
  var ENEMY_TYPES = [
    { id: "sloop", name: "Pirate hunter sloop", hp: 5, speed: 120, fire: [0.8, 1.5], gold: [30, 50], score: 45, hull: "#4a2f2f", deck: "#6a4444", flag: "#7a1f1f", sail: "#e8d3b0" },
    { id: "brig",  name: "Armed merchant brig", hp: 7, speed: 80,  fire: [0.7, 1.3], gold: [50, 80], score: 60, hull: "#3d3a2f", deck: "#5e5a44", flag: "#b98f20", sail: "#efe6cc" },
    { id: "navy",  name: "King's man-of-war",   hp: 9, speed: 100, fire: [0.55, 1.0], gold: [70, 110], score: 90, hull: "#2f3a4a", deck: "#48586e", flag: "#e8e8f0", sail: "#f5f2ea" }
  ];
  // INSANE mode: the enemy fleet stops being ships. Same hp/speed/fire numbers
  // as ENEMY_TYPES — only the visual, name, projectile, and death line change.
  function drawDuckEnemy(x, y, s, opt) {
    ctx.save(); ctx.translate(x, y); if (opt.blink) ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#f7d84a";
    ctx.beginPath(); ctx.ellipse(0, 4 * s, 20 * s, 15 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-10 * s, -10 * s, 10 * s, 9 * s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#e08c2a"; ctx.beginPath(); ctx.moveTo(-20 * s, -10 * s); ctx.lineTo(-32 * s, -7 * s); ctx.lineTo(-20 * s, -4 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(-12 * s, -13 * s, 2 * s, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawToasterEnemy(x, y, s, opt) {
    ctx.save(); ctx.translate(x, y); if (opt.blink) ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#c7ccd1"; roundRect(-18 * s, -10 * s, 36 * s, 24 * s, 6 * s); ctx.fill();
    ctx.fillStyle = "#d9a45c"; ctx.beginPath(); ctx.moveTo(-8 * s, -10 * s); ctx.lineTo(-8 * s, -22 * s); ctx.quadraticCurveTo(-2 * s, -28 * s, 4 * s, -22 * s); ctx.lineTo(4 * s, -10 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8a8f94"; ctx.beginPath(); ctx.arc(10 * s, 4 * s, 3 * s, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawSnowmanEnemy(x, y, s, opt) {
    ctx.save(); ctx.translate(x, y); if (opt.blink) ctx.globalAlpha = 0.35;
    var sk = opt.hpFrac != null ? (0.65 + 0.35 * opt.hpFrac) : 1;   // melts as hp drops
    ctx.fillStyle = "#f0f6fa";
    ctx.beginPath(); ctx.arc(0, 10 * s * sk, 14 * s * sk, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -6 * s * sk, 10 * s * sk, 0, 7); ctx.fill();
    ctx.fillStyle = "#e08c2a"; ctx.beginPath(); ctx.moveTo(0, -6 * s * sk); ctx.lineTo(11 * s * sk, -4 * s * sk); ctx.lineTo(0, -2 * s * sk); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(-3 * s * sk, -9 * s * sk, 1.6 * s, 0, 7); ctx.arc(3 * s * sk, -9 * s * sk, 1.6 * s, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawGnomeEnemy(x, y, s, opt) {
    ctx.save(); ctx.translate(x, y); if (opt.blink) ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#3a6b4a"; ctx.beginPath(); ctx.moveTo(-11 * s, 11 * s); ctx.lineTo(11 * s, 11 * s); ctx.lineTo(0, -6 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8c2a0"; ctx.beginPath(); ctx.arc(0, -10 * s, 6.5 * s, 0, 7); ctx.fill();
    ctx.fillStyle = "#c73a3a"; ctx.beginPath(); ctx.moveTo(-8 * s, -14 * s); ctx.lineTo(8 * s, -14 * s); ctx.lineTo(0, -28 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawPianoEnemy(x, y, s, opt) {
    ctx.save(); ctx.translate(x, y); if (opt.blink) ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#1a1a1a"; roundRect(-20 * s, -12 * s, 40 * s, 24 * s, 4 * s); ctx.fill();
    ctx.fillStyle = "#fff";
    for (var k = -3; k <= 3; k++) ctx.fillRect(k * 5 * s - 2 * s, 2 * s, 4 * s, 8 * s);
    ctx.restore();
  }
  function drawCrabEnemy(x, y, s, opt) {
    ctx.save(); ctx.translate(x, y); if (opt.blink) ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#c73a3a"; ctx.beginPath(); ctx.ellipse(0, 0, 18 * s, 12 * s, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-16 * s, -4 * s, 6 * s, 0, 7); ctx.arc(16 * s, -4 * s, 6 * s, 0, 7); ctx.fill();
    ctx.strokeStyle = "#dfe9ee"; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(-4 * s, -2 * s); ctx.lineTo(6 * s, -14 * s); ctx.stroke();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(-4 * s, -2 * s, 1.6 * s, 0, 7); ctx.arc(4 * s, -2 * s, 1.6 * s, 0, 7); ctx.fill();
    ctx.restore();
  }
  var SKIN_ENEMIES = [
    { id: "duck",     name: "The Colossal Rubber Duck",  draw: drawDuckEnemy,     projStyle: "quack",    deathLine: "It squeaks its last and drifts belly-up." },
    { id: "toaster",  name: "A Belligerent Toaster",     draw: drawToasterEnemy,  projStyle: "toast",    deathLine: "It pops one final slice and goes dark." },
    { id: "snowman",  name: "A Furious Snowman, Lost",   draw: drawSnowmanEnemy,  projStyle: "snowball", deathLine: "It melts into a very confused puddle." },
    { id: "gnome",    name: "The Garden Gnome Flotilla", draw: drawGnomeEnemy,    projStyle: "ball",     deathLine: "The flotilla scatters, pointy hats and all." },
    { id: "piano",    name: "A Haunted Grand Piano",     draw: drawPianoEnemy,    projStyle: "note",     deathLine: "It plays one last discordant chord and sinks." },
    { id: "crab",     name: "Crab With A Sword",         draw: drawCrabEnemy,     projStyle: "bubble",   deathLine: "It scuttles off sideways, sword and all." }
  ];
  function BattleScene() {
    G.battleNum++;
    var tier = G.battleNum + (consumeMod("navyNext") ? 1 : 0);
    var type = ENEMY_TYPES[clamp(tier - 1, 0, 2)];
    if (tier === 2 && chance(0.35)) type = ENEMY_TYPES[0];
    var phase = "intro";
    var ehp = Math.max(2, Math.round(type.hp * diff().hp));
    var enemy = { x: W * 0.5, y: H * 0.2, hp: ehp, max: ehp, dir: 1, fireT: 1.2 };
    var fireMod = consumeMod("navyintel") ? 0.3 : 0;
    var dmgBonus = consumeMod("drill") ? 1 : 0;
    var funSkin = insane() ? choice(SKIN_ENEMIES) : null;
    var enemyName = funSkin ? funSkin.name : type.name;
    var balls = [], t = 0, prompt = null, loot = 0, fireGun = gunner();
    return {
      enter: function () { prompt = Prompt(enemyName + "!", funSkin ? "It wants your ship at the bottom, somehow. Fire when you can. Dodge its shot. Sink it for gold." : "She wants your ship at the bottom. Fire when you can. Dodge her shot. Sink her for gold.", function () { phase = "fight"; }); },
      update: function (dt) {
        seaT += dt; t += dt; updateGulls(dt);
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var shipPX = G.shipX * W, shipPY = shipYPx();
        if (fireGun(dt)) { playerShot(shipPX, shipPY - 20, -420).forEach(function (nb) { balls.push(nb); }); SFX.fire(); smoke(shipPX, shipPY - 18, 3); }
        enemy.x += enemy.dir * type.speed * dt;
        if (enemy.x < W * 0.15 || enemy.x > W * 0.85) enemy.dir *= -1;
        enemy.fireT -= dt;
        if (enemy.fireT <= 0) { enemy.fireT = rand(type.fire[0], type.fire[1]) * diff().fire + fireMod; balls.push({ x: enemy.x, y: enemy.y + 18, vy: 300 + tier * 25, own: 0, style: funSkin ? funSkin.projStyle : undefined }); }
        stepBalls(balls, dt, [{ x: enemy.x, y: enemy.y, r: 20, onHit: function (b) {
          var doubled = chance(shotBonus());
          if (doubled) toast("⛓ Chain shot strikes double!");
          var dmg = 1 + dmgBonus + (doubled ? 1 : 0);
          enemy.hp -= dmg; splash(b.x, b.y, 8, "#e08c6a"); SFX.hit();
          if (enemy.hp <= 0) {
            phase = "done"; loot = randInt(type.gold[0], type.gold[1]); addGold(loot); addScore(type.score); G.shipsBeaten++;
            SFX.win();
            if (funSkin) toast(funSkin.deathLine);
            for (var k = 0; k < 24; k++) spawn(enemy.x, enemy.y, { vx: rand(-120, 120), vy: rand(-160, 40), g: 260, life: rand(0.6, 1.2), r: rand(2, 4), c: choice(["#f7d84a", "#e08c6a", "#fff"]) });
          }
        } }], { x: shipPX, y: shipPY, r: 18 });
      },
      render: function () {
        drawSea(G.pal, seaT * 45, false);
        if (phase !== "intro") {
          var bw = 120, bx = enemy.x - bw / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(bx - 2, 6, bw + 4, 10, 4); ctx.fill();
          ctx.fillStyle = "#7a1f1f"; roundRect(bx, 8, bw * (enemy.hp / enemy.max), 6, 3); ctx.fill();
        }
        if (funSkin) funSkin.draw(enemy.x, enemy.y, 1.7, { hpFrac: enemy.hp / enemy.max });
        else drawShip(enemy.x, enemy.y, 1.7, { rot: Math.PI, flag: type.flag, hull: type.hull, deck: type.deck, sail: type.sail, dmg: enemy.max - enemy.hp });
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.72, 240, 390); panel(W / 2, H / 2, w, 126); text(funSkin ? "Defeated!" : "She strikes her colors!", W / 2, H / 2 - 24, 22, "#8fd6a0", "center", "bold"); text("+" + loot + " gold   +" + type.score + " points", W / 2, H / 2 + 8, 17, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 42, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // ---------------------------------------------------------------- SQUADRON: the wolf pack
  // Hired pirate-hunters converge just before Cape Cod. Three or four sloops, one pack.
  function SquadronScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], loot = 0, fireGun = gunner();
    var count = 3 + (chance(0.5) ? 1 : 0);
    var fireMod = consumeMod("navyintel") ? 0.3 : 0;
    var dmgBonus = consumeMod("drill") ? 1 : 0;
    var ships = [];
    var shp = Math.max(2, Math.round(3 * diff().hp));
    // INSANE: either a conga line of identical ducklings, or a mixed flotilla
    // of the same funny roster the single-ship battles use
    var squadMixed = insane() && chance(0.5);
    for (var i = 0; i < count; i++) {
      ships.push({
        hp: shp, max: shp, alive: true, slot: i,
        x: (i % 2 === 0 ? -60 : W + 60), y: H * (0.14 + (i % 2) * 0.1),
        dir: i % 2 === 0 ? 1 : -1, fireT: rand(1.5, 2.5),
        active: i < 2,                    // second wave holds back
        skin: insane() ? (squadMixed ? choice(SKIN_ENEMIES) : SKIN_ENEMIES[0]) : null
      });
    }
    var wave2T = 4;
    function aliveShips() { return ships.filter(function (s) { return s.alive; }); }
    function slotBand(s) {
      // divide the water into lanes among the living so the pack never stacks
      var alive = aliveShips(), idx = alive.indexOf(s), n = alive.length || 1;
      var lane = (idx + 0.5) / n;
      return [clamp(lane - 0.5 / n, 0.08, 0.92) * W + 30, clamp(lane + 0.5 / n, 0.08, 0.92) * W - 30];
    }
    return {
      enter: function () {
        prompt = insane()
          ? Prompt(squadMixed ? "A MIXED FLOTILLA OF NONSENSE" : "A CONGA LINE OF ANGRY DUCKLINGS", "Reality is still figuring out what a pirate hunter is supposed to look like. Break the pack before the storm breaks you.", function () { phase = "fight"; }, "🐤 MULTIVERSE")
          : Prompt("PRIVATEERS — A WOLF PACK", "The governors put a price on the Whydah, and these sloops mean to collect it. They hunt together. Break the pack before the storm breaks you.", function () { phase = "fight"; });
      },
      update: function (dt) {
        seaT += dt; t += dt; updateGulls(dt);
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        wave2T -= dt;
        if (wave2T <= 0 || aliveShips().filter(function (s) { return s.active; }).length < 2) {
          ships.forEach(function (s) { s.active = true; });
        }
        helm(dt, 1, 0.5);
        var shipPX = G.shipX * W, shipPY = shipYPx();
        if (fireGun(dt)) { playerShot(shipPX, shipPY - 20, -420).forEach(function (nb) { balls.push(nb); }); SFX.fire(); smoke(shipPX, shipPY - 18, 3); }
        ships.forEach(function (s) {
          if (!s.alive || !s.active) return;
          var band = slotBand(s);
          s.x += s.dir * 110 * dt;
          if (s.x < band[0]) { s.x = band[0]; s.dir = 1; }
          if (s.x > band[1]) { s.x = band[1]; s.dir = -1; }
          s.fireT -= dt;
          if (s.fireT <= 0) { s.fireT = rand(1.3, 2.1) * diff().fire + fireMod; balls.push({ x: s.x, y: s.y + 18, vy: 320, own: 0, style: s.skin ? s.skin.projStyle : undefined }); }
        });
        var squadTargets = [];
        ships.forEach(function (s2) {
          if (!s2.alive || !s2.active) return;
          squadTargets.push({ x: s2.x, y: s2.y, r: 18, onHit: function (b) {
            var doubled = chance(shotBonus());
            if (doubled) toast("⛓ Chain shot strikes double!");
            s2.hp -= 1 + dmgBonus + (doubled ? 1 : 0);
            splash(b.x, b.y, 8, "#e08c6a"); SFX.hit();
            if (s2.hp <= 0) {
              s2.alive = false; G.shipsBeaten++;
              var g = randInt(15, 25); loot += g; addGold(g); addScore(40); SFX.win();
              for (var k = 0; k < 18; k++) spawn(s2.x, s2.y, { vx: rand(-110, 110), vy: rand(-150, 40), g: 260, life: rand(0.5, 1.1), r: rand(2, 4), c: choice(["#f7d84a", "#e08c6a", "#fff"]) });
              if (aliveShips().length === 0) { phase = "done"; addScore(120); addGold(40); loot += 40; SFX.win(); }
            }
          } });
        });
        stepBalls(balls, dt, squadTargets, { x: shipPX, y: shipPY, r: 18 });
      },
      render: function () {
        drawSea(G.pal, seaT * 45, false);
        ships.forEach(function (s) {
          if (!s.alive || !s.active) return;
          var bw = 54, bx = s.x - bw / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(bx - 2, s.y - 44, bw + 4, 8, 3); ctx.fill();
          ctx.fillStyle = "#7a1f1f"; roundRect(bx, s.y - 42, bw * (s.hp / s.max), 4, 2); ctx.fill();
          if (s.skin) s.skin.draw(s.x, s.y, 1.1, { hpFrac: s.hp / s.max });
          else drawShip(s.x, s.y, 1.35, { rot: Math.PI, flag: "#c03a2b", hull: "#4a2f2f", deck: "#6a4444", sail: "#e8d3b0", dmg: s.max - s.hp });
        });
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "fight") text("Pack: " + aliveShips().length + " of " + count, W / 2, H - 14, 12, "#e8c1ae", "center", "bold");
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.74, 250, 400); panel(W / 2, H / 2, w, 126); text("The pack is broken!", W / 2, H / 2 - 24, 22, "#8fd6a0", "center", "bold"); text("+" + loot + " gold   +" + (120 + count * 40) + " points", W / 2, H / 2 + 8, 16, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 42, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // ---------------------------------------------------------------- SERPENT (a yarn, and says so)
  function SerpentScene() {
    var phase = "intro", prompt = null;
    var seg = []; for (var i = 0; i < 14; i++) seg.push({ x: W * 0.5, y: -60 - i * 24 });
    var max = Math.max(5, Math.round(8 * diff().hp)), hp = max;
    var t = 0, state = "weave", stateT = rand(1.2, 2.0), lungeX = 0, lungeY = H * 0.7, headOpen = false, flashT = 0, balls = [], spits = [], spitT = rand(1.5, 2.5) * diff().spit, fireGun = gunner();
    var baseY = H * 0.32, rearTime = 0.65 + warnBonus() * 0.3;
    return {
      enter: function () {
        prompt = insane()
          ? Prompt("THE SEA PUG", "Somewhere between dimensions, the serpent legend turned into this. It just wants to play fetch. Dodge the tennis balls, then fire at its head.", function () { phase = "fight"; }, "🐶 MULTIVERSE")
          : Prompt("A SEA SERPENT!", "Sailors in 1717 swore these waters hid monsters. This one is a sea story. Dodge the lunge and the spray it spits, then fire at its head.", function () { phase = "fight"; }, "🌀 SEA YARN");
      },
      update: function (dt) {
        seaT += dt; t += dt; if (flashT > 0) flashT -= dt;
        if (phase === "intro") { prompt.update(dt); moveHead(dt, W * 0.5, baseY); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.55);
        var shipPX = G.shipX * W, shipPY = shipYPx();
        if (fireGun(dt)) { playerShot(shipPX, shipPY - 20, -460).forEach(function (nb) { balls.push(nb); }); SFX.fire(); }
        stateT -= dt;
        if (state === "weave") {
          headOpen = false;
          moveHead(dt, W * 0.5 + Math.sin(t * 2.1) * W * 0.34, baseY + Math.sin(t * 2.4) * 22);
          spitT -= dt;
          if (spitT <= 0) {
            spitT = rand(1.4, 2.4) * diff().spit;   // the kids asked for more venom — it delivers
            var aim = clamp((shipPX - seg[0].x) * 0.9, -170, 170);
            spits.push({ x: seg[0].x, y: seg[0].y, vx: aim, vy: 260 });
            if (diff().spit <= 0.7) {               // extreme+: a spreading fan of three
              spits.push({ x: seg[0].x, y: seg[0].y, vx: aim - 90, vy: 250 });
              spits.push({ x: seg[0].x, y: seg[0].y, vx: aim + 90, vy: 250 });
            }
            SFX.bad();
          }
          if (stateT <= 0) { state = "rear"; stateT = rearTime; lungeX = shipPX; }
        } else if (state === "rear") {
          headOpen = true;
          lungeX = lerp(lungeX, shipPX, 1.6 * dt);   // it tracks you while it rears — keep moving
          moveHead(dt, lungeX, baseY - 30);
          if (stateT <= 0) { state = "lunge"; stateT = 0.38; lungeY = shipPY; }
        } else if (state === "lunge") {
          moveHead(dt, lungeX, lungeY);
          if (Math.hypot(seg[0].x - shipPX, seg[0].y - shipPY) < 46) { damage(2); if (insane()) toast("BOOP!"); state = "recover"; stateT = 1.0; }
          if (stateT <= 0) { state = chance(0.3) ? "rear" : "recover"; stateT = state === "rear" ? rearTime * 0.8 : 0.8; if (state === "rear") lungeX = shipPX; }
        } else {
          headOpen = false;
          moveHead(dt, W * 0.5, baseY);
          if (stateT <= 0) { state = "weave"; stateT = rand(1.1, 2.0); }
        }
        for (var si = spits.length - 1; si >= 0; si--) {
          var sv = spits[si]; sv.x += sv.vx * dt; sv.y += sv.vy * dt;
          if (Math.hypot(sv.x - shipPX, sv.y - shipPY) < 18) { spits.splice(si, 1); damage(1); continue; }
          if (sv.y > H + 30) spits.splice(si, 1);
        }
        stepBalls(balls, dt, [{ x: seg[0].x, y: seg[0].y, r: hasMut("bighead") ? 34 : 24, onHit: function () {
          hp--; flashT = 0.12; SFX.hit(); splash(seg[0].x, seg[0].y, 10, "#8fd6a0");
          if (hp <= 0) {
            phase = "done"; addScore(150); addGold(100); G.serpentBeaten = true; SFX.win(); shake(14); feat(insane() ? "seapug" : "serpent");
            for (var k = 0; k < 50; k++) spawn(seg[0].x, seg[0].y, { vx: rand(-180, 180), vy: rand(-220, 80), g: 240, life: rand(0.6, 1.5), r: rand(2, 6), c: choice(["#8fd6a0", "#f7d84a", "#fff", "#dff1f4"]) });
          }
        } }]);
      },
      render: function () {
        drawSea(G.pal, seaT * 50, false);
        if (phase !== "intro") { var bw = 160, bx = W / 2 - bw / 2; ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(bx - 2, 6, bw + 4, 12, 5); ctx.fill(); ctx.fillStyle = "#2f6b4a"; roundRect(bx, 8, bw * (hp / max), 8, 4); ctx.fill(); text(insane() ? "SEA PUG" : "SERPENT", W / 2, 32, 11, "#cdeccf", "center", "bold"); }
        drawSerpent(seg, headOpen, flashT > 0);
        for (var s2 = 0; s2 < spits.length; s2++) {
          if (insane()) { ctx.fillStyle = "#c6e84a"; ctx.beginPath(); ctx.arc(spits[s2].x, spits[s2].y, 7, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(spits[s2].x, spits[s2].y, 7, 0.3, 2.2); ctx.stroke(); }
          else { ctx.fillStyle = "#8fd6a0"; ctx.beginPath(); ctx.arc(spits[s2].x, spits[s2].y, 6, 0, 7); ctx.fill(); ctx.fillStyle = "rgba(143,214,160,.4)"; ctx.beginPath(); ctx.arc(spits[s2].x, spits[s2].y, 10, 0, 7); ctx.fill(); }
        }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (headOpen && phase === "fight") text(insane() ? "BOOP IT!" : "FIRE!", seg[0].x, seg[0].y - 40, 16, "#ffd24a", "center", "bold");
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.72, 240, 400); panel(W / 2, H / 2, w, 126); text(insane() ? "The Sea Pug is befriended!" : "Serpent driven off!", W / 2, H / 2 - 24, 23, "#8fd6a0", "center", "bold"); text("+150 points   +100 gold", W / 2, H / 2 + 8, 17, "#e0b25c", "center", "bold"); text(insane() ? "it follows at a respectful distance — tap to sail on" : "tap to sail on", W / 2, H / 2 + 42, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
    function moveHead(dt, tx, ty) {
      seg[0].x = lerp(seg[0].x, tx, clamp(6 * dt, 0, 1));
      seg[0].y = lerp(seg[0].y, ty, clamp(6 * dt, 0, 1));
      for (var i = 1; i < seg.length; i++) {
        seg[i].x = lerp(seg[i].x, seg[i - 1].x, clamp(12 * dt, 0, 1));
        seg[i].y = lerp(seg[i].y, seg[i - 1].y + 16, clamp(12 * dt, 0, 1));
      }
    }
  }

  // ==================================================================
  // MISSION BOSSES (v8) — every leg of the coast now ends in a fight
  // ==================================================================
  // M4 Carolina — THE MOONCUSSER. A night-fog gauntlet: three narrows in a
  // row, each with one steady true light and flickering wreckers' fires, while
  // the mooncusser's shore battery throws shot from the dunes. Silence the
  // battery (it can be shot) and the last wall comes clean.
  function MooncusserScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], fireGun = gunner();
    var walls = 0, WALLS = 3, wall = null, wallGapT = 1.4;
    var batHp = Math.max(4, Math.round(6 * diff().hp)), batX = 0, batFireT = 2, batDead = false;
    var done2 = false;
    var easyBoss = bossThreat() < 0.7;
    function nextWall() {
      var w = { kind: "narrows", gap: rand(0.25, 0.75), gapW: clamp(W * (easyBoss ? 0.37 : 0.3), 130, 250), y: -90, sp: easyBoss ? 104 : 118, r: 0 };
      w.falseGap = clamp(w.gap + (chance(0.5) ? 1 : -1) * rand(0.25, 0.4), 0.1, 0.9);
      if (!easyBoss && walls === 2 && !batDead && chance(0.6)) w.falseGap2 = clamp(w.gap - (w.falseGap > w.gap ? 1 : -1) * rand(0.22, 0.35), 0.08, 0.92);
      return w;
    }
    return {
      debugWin: function () { walls = WALLS; wall = null; },
      enter: function () {
        G.pal = PALETTES[4];
        batX = chance(0.5) ? W * 0.06 : W * 0.94;
        prompt = Prompt("THE MOONCUSSER", "Wreckers work this shore — false lights swung on the dunes to walk ships onto the bar, and a stolen gun to finish the job. Three narrows between you and open water. The true light burns steady. Theirs flickers.", function () { phase = "fight"; }, "🌀 SEA YARN — BUT THE WRECKERS WERE REAL");
      },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -430).forEach(function (b) { balls.push(b); }); SFX.fire(); smoke(px, py - 18, 2); }
        // the shore battery: aimed shots from the dunes until it's silenced
        if (!batDead) {
          batFireT -= dt;
          if (batFireT <= 0) {
            batFireT = rand(2.2, 3.2) * diff().fire;
            var bvx = clamp((px - batX) * 0.5, -170, 170);
            balls.push({ x: batX, y: 26, vy: 230, vx: bvx, own: 0 });
            SFX.fire(); smoke(batX, 30, 2);
          }
        }
        // the gauntlet: one wall at a time, a breath between them
        if (!wall) {
          wallGapT -= dt;
          if (wallGapT <= 0 && walls < WALLS) { wall = nextWall(); toast("NARROWS " + (walls + 1) + " OF " + WALLS); }
        } else {
          wall.y += wall.sp * dt;
          var gx = wall.gap * W, half = wall.gapW / 2;
          if (Math.abs(wall.y - py) < 34 && (px < gx - half + 12 || px > gx + half - 12)) {
            splash(px, py, 12); damage(1); shake(14); wall = null; walls++; wallGapT = 1.6;
          } else if (wall.y > H + 120) {
            addScore(25); SFX.point(); wall = null; walls++; wallGapT = 1.6;
          }
        }
        var mTargets = [];
        if (!batDead) mTargets.push({ x: batX, y: 30, r: 26, onHit: function (b) {
          batHp--; splash(b.x, b.y, 8, "#cdb98a"); SFX.hit();
          if (batHp <= 0) { batDead = true; addScore(40); addGold(20); SFX.win(); shake(8); toast("THE BATTERY IS SILENCED! +40"); for (var k = 0; k < 16; k++) spawn(batX, 30, { vx: rand(-90, 90), vy: rand(-40, 90), g: 200, life: rand(0.5, 1), r: rand(2, 4), c: choice(["#ffcf6a", "#e08c6a", "#fff"]) }); }
        } });
        stepBalls(balls, dt, mTargets, { x: px, y: py, r: 18 });
        if (walls >= WALLS && !wall && !done2) {
          done2 = true; phase = "done"; addScore(60); SFX.win(); feat("mooncusser");
        }
      },
      render: function () {
        drawSea(G.pal, seaT * 55, false);
        if (wall) drawNarrows(wall);
        // the battery on the dunes
        if (!batDead) {
          ctx.save(); ctx.translate(batX, 30);
          ctx.fillStyle = "#3a3630"; ctx.fillRect(-16, -8, 32, 14);
          ctx.fillStyle = "#22201c"; ctx.fillRect(batX < W / 2 ? 8 : -22, -4, 14, 6);
          var fl = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 13));
          ctx.globalAlpha = fl; ctx.fillStyle = "#ff9a3a"; ctx.beginPath(); ctx.arc(0, -16, 4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
          ctx.restore();
          var bw2 = 60, bx2 = batX - bw2 / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(clamp(bx2, 4, W - bw2 - 4) - 2, 46, bw2 + 4, 8, 3); ctx.fill();
          ctx.fillStyle = "#7a1f1f"; roundRect(clamp(bx2, 4, W - bw2 - 4), 48, bw2 * clamp(batHp / Math.max(4, Math.round(6 * diff().hp)), 0, 1), 4, 2); ctx.fill();
        }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts();
        // fog closes in around the lantern — the whole fight reads by its lights
        var maskR = clamp(W * 0.3, 130, 210) * (1 + warnBonus() * 0.3);
        var mg = ctx.createRadialGradient(G.shipX * W, shipYPx(), maskR * 0.3, G.shipX * W, shipYPx(), maskR);
        mg.addColorStop(0, "rgba(8,12,18,0)"); mg.addColorStop(1, "rgba(8,12,18,.7)");
        ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H);
        drawHUD();
        text("WALLS CLEARED " + walls + " / " + WALLS + (batDead ? "  ·  battery silenced" : ""), W / 2, H * 0.9, 12, "#cdeccf", "center", "bold");
        if (wall && wall.y < H * 0.7) text("Follow the STEADY flame. Shoot the battery if you can.", W / 2, H * 0.42, 14, "#ffd24a", "center", "bold");
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.76, 250, 420); panel(W / 2, H / 2, w, 130); text("THROUGH THE FALSE LIGHTS", W / 2, H / 2 - 26, 19, "#8fd6a0", "center", "bold"); text("+60 points" + (batDead ? "   (+40 for the battery)" : ""), W / 2, H / 2 + 6, 15, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 38, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // M5 Virginia Capes — THE SHARKNADO. A waterspout wandered over the wrong
  // stretch of sea and now it's throwing sharks. Volleys are telegraphed with
  // landing markers; airborne sharks are shootable for points. Shoot the eye
  // of the column when it opens between volleys, or outlast its whole pass.
  function SharknadoScene() {
    var phase = "intro", prompt = null, t = 0, dur = 32, balls = [], fireGun = gunner();
    var nadoX = W * 0.5, nadoDir = 1, nadoHp = Math.max(8, Math.round(12 * diff().hp)), nadoMax = nadoHp;
    var volleyT = 2.2, marks = [], flungs = [], eyeOpen = 0;
    return {
      debugWin: function () { nadoHp = 0; phase = "done"; addScore(120); addGold(60); },
      enter: function () {
        prompt = Prompt("THE SHARKNADO", "A waterspout crossed the wrong shoal and picked up passengers. Nobody will believe the log entry. Dodge the marked splashes, shoot the sharks out of the air, and put shot into the eye when it opens.", function () { phase = "fight"; }, insane() ? "🤯 MULTIVERSE-ADJACENT, SOMEHOW REAL HERE" : "🌀 SEA YARN — THE TALLEST ONE IN THE BOOK");
      },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -440).forEach(function (b) { balls.push(b); }); SFX.fire(); smoke(px, py - 18, 2); }
        // the column wanders, and shoves anything that touches it
        nadoX += nadoDir * 46 * dt;
        if (nadoX < W * 0.18) nadoDir = 1;
        if (nadoX > W * 0.82) nadoDir = -1;
        if (chance(0.005)) nadoDir *= -1;
        if (Math.abs(px - nadoX) < 46 && py < H * 0.95) { damage(1); shake(12); G.shipX = clamp(G.shipX + (px < nadoX ? -0.14 : 0.14), steerLo(), steerHi()); }
        // volleys: marked landing points, then sharks on ballistic arcs
        if (eyeOpen > 0) eyeOpen -= dt;
        volleyT -= dt;
        if (volleyT <= 0) {
          volleyT = rand(3.2, 4.4) * diff().spit;
          var n = 3 + (diff().spawn < 1 ? 0 : 1) + (chance(0.4) ? 1 : 0);
          for (var v = 0; v < n; v++) {
            var mx = clamp(px + rand(-W * 0.3, W * 0.3), W * 0.08, W * 0.92);
            marks.push({ x: mx, y: clamp(py + rand(-60, 60), H * 0.55, H * 0.92), warn: 1.05 + warnBonus() * 0.3 + v * 0.14 });
          }
          eyeOpen = 1.6;   // between volleys the eye opens — that's your window
          SFX.thunder();
        }
        for (var mi2 = marks.length - 1; mi2 >= 0; mi2--) {
          var mk = marks[mi2]; mk.warn -= dt;
          if (mk.warn <= 0) {
            // launch a shark from the column top on an arc that lands on the mark
            var fT = 0.8;
            flungs.push({ x: nadoX, y: H * 0.18, vx: (mk.x - nadoX) / fT, vy: (mk.y - H * 0.18) / fT - 0.5 * 900 * fT, tx: mk.x, ty: mk.y, r: 18 });
            marks.splice(mi2, 1); SFX.bad();
          }
        }
        for (var fi = flungs.length - 1; fi >= 0; fi--) {
          var f = flungs[fi];
          f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
          if (Math.hypot(f.x - px, f.y - py) < f.r + 15) { damage(1); splash(f.x, f.y, 10, "#9fb6c9"); flungs.splice(fi, 1); continue; }
          if (f.y > f.ty + 24 && f.vy > 0) { splash(f.x, f.y, 8, "#9fb6c9"); flungs.splice(fi, 1); }
        }
        var nTargets = [];
        flungs.forEach(function (f2) {
          nTargets.push({ x: f2.x, y: f2.y, r: f2.r + 2, onHit: function () {
            addScore(12); addGold(4); SFX.win(); splash(f2.x, f2.y, 12, "#9fb6c9"); coinBurst(f2.x, f2.y);
            var idx = flungs.indexOf(f2); if (idx >= 0) flungs.splice(idx, 1);
          } });
        });
        if (eyeOpen > 0) nTargets.push({ x: nadoX, y: H * 0.3, r: 30, onHit: function (b) {
          nadoHp--; splash(b.x, b.y, 10, "#cfe9f2"); SFX.hit(); shake(4);
          if (nadoHp <= 0) {
            phase = "done"; addScore(120); addGold(60); SFX.win(); shake(16); feat("sharknado");
            for (var k = 0; k < 40; k++) spawn(nadoX, H * 0.3, { vx: rand(-200, 200), vy: rand(-100, 240), g: 300, life: rand(0.6, 1.4), r: rand(2, 5), c: choice(["#cfe9f2", "#9fb6c9", "#fff"]) });
          }
        } });
        stepBalls(balls, dt, nTargets);
        if (t >= dur && phase === "fight") { phase = "done"; addScore(80); SFX.win(); toast("It spins itself out over the cape."); }
      },
      render: function () {
        drawSea(G.pal, seaT * 60, false);
        // the column: stacked wobbling ellipses, sharks visible in the swirl
        ctx.save();
        for (var s2 = 0; s2 < 9; s2++) {
          var sy = H * 0.16 + s2 * (H * 0.085), sw = 18 + s2 * 7;
          var wob = Math.sin(seaT * 5 + s2 * 0.9) * (5 + s2 * 2);
          ctx.fillStyle = "rgba(160,190,210," + (0.5 - s2 * 0.035) + ")";
          ctx.beginPath(); ctx.ellipse(nadoX + wob, sy, sw, 12 + s2 * 1.6, 0, 0, 7); ctx.fill();
        }
        for (var sk = 0; sk < 3; sk++) {
          var ang = seaT * (2.2 + sk * 0.4) + sk * 2.1;
          ctx.save(); ctx.translate(nadoX + Math.cos(ang) * (26 + sk * 14), H * (0.28 + sk * 0.14) + Math.sin(ang) * 8);
          ctx.scale(0.6, 0.6); ctx.rotate(Math.sin(ang) * 0.6);
          drawShark(0, 0, Math.cos(ang) >= 0 ? 1 : -1); ctx.restore();
        }
        if (eyeOpen > 0 && phase === "fight") {
          var ep = 0.5 + 0.5 * Math.sin(seaT * 10);
          ctx.strokeStyle = "rgba(255,210,74," + ep + ")"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(nadoX, H * 0.3, 30, 0, 7); ctx.stroke();
          text("THE EYE — FIRE!", nadoX, H * 0.3 - 44, 14, "#ffd24a", "center", "bold");
        }
        ctx.restore();
        // landing marks
        for (var mi3 = 0; mi3 < marks.length; mi3++) {
          var mk2 = marks[mi3], mp = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 10));
          ctx.strokeStyle = "rgba(255,138,122," + mp + ")"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(mk2.x, mk2.y, 20 + clamp(1 - mk2.warn, 0, 1) * 10, 0, 7); ctx.stroke();
        }
        for (var fi2 = 0; fi2 < flungs.length; fi2++) { var f3 = flungs[fi2]; ctx.save(); ctx.translate(f3.x, f3.y); ctx.rotate(Math.atan2(f3.vy, f3.vx) * 0.3); ctx.scale(0.85, 0.85); drawShark(0, 0, f3.vx >= 0 ? 1 : -1); ctx.restore(); }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase !== "intro") {
          var bw = 150, bx = W / 2 - bw / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(bx - 2, 46, bw + 4, 10, 4); ctx.fill();
          ctx.fillStyle = "#5e8aa8"; roundRect(bx, 48, bw * clamp(nadoHp / nadoMax, 0, 1), 6, 3); ctx.fill();
          text("THE SHARKNADO", W / 2, 70, 11, "#cdeccf", "center", "bold");
        }
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.76, 250, 420); panel(W / 2, H / 2, w, 130); text(nadoHp <= 0 ? "THE COLUMN COLLAPSES!" : "IT BLOWS ITSELF OUT", W / 2, H / 2 - 26, 19, "#8fd6a0", "center", "bold"); text(nadoHp <= 0 ? "+120 points   +60 gold" : "+80 points", W / 2, H / 2 + 6, 15, "#e0b25c", "center", "bold"); text("tap to sail on — and good luck with the log entry", W / 2, H / 2 + 38, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // M6 Long Island Sound — THE HUNTER'S FLAGSHIP. The privateers' paymaster:
  // a man-of-war duel in three phases — aimed fire, then sweeping broadsides
  // with one safe gap, then ramming runs down your column.
  function FlagshipScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], fireGun = gunner();
    var hp = Math.max(8, Math.round(16 * diff().hp)), max = hp;
    var fx2 = W * 0.5, fdir = 1, fireT = 1.6, sweepT = threatGap(6), ram = null, ramT = threatGap(9);
    var dmgBonus = consumeMod("drill") ? 1 : 0, loot = 0;
    function stage() { return hp > max * 0.66 ? 1 : (hp > max * 0.33 ? 2 : 3); }
    return {
      debugWin: function () { hp = 0; phase = "done"; loot = 120; addScore(150); addGold(120); },
      enter: function () { prompt = Prompt("THE HUNTER'S FLAGSHIP", "Every privateer in the Sound answers to her — a King's man-of-war flying a hunting pennant with the Whydah's name on it. Sink the paymaster and the hunt goes home.", function () { phase = "fight"; }, "⚓ THE HUNT WAS REAL"); },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -430).forEach(function (b) { balls.push(b); }); SFX.fire(); smoke(px, py - 18, 3); }
        var st = stage();
        // she works the top of the screen, faster as she's hurt
        if (!ram) {
          fx2 += fdir * (95 + st * 25) * dt;
          if (fx2 < W * 0.15) fdir = 1;
          if (fx2 > W * 0.85) fdir = -1;
        }
        // phase 1+: aimed fire (doubles at stage 2)
        fireT -= dt;
        if (fireT <= 0 && !ram) {
          fireT = (st === 1 ? rand(1.1, 1.7) : rand(0.9, 1.4)) * diff().fire;
          var aim = clamp((px - fx2) * 0.6, -160, 160);
          balls.push({ x: fx2, y: H * 0.2 + 16, vy: 300, vx: aim, own: 0 });
          if (st >= 2) balls.push({ x: fx2, y: H * 0.2 + 16, vy: 290, vx: aim + (chance(0.5) ? 70 : -70), own: 0 });
          SFX.fire();
        }
        // phase 2+: the broadside sweep — a wall of shot with one gap
        if (st >= 2 && !ram) {
          sweepT -= dt;
          if (sweepT <= 0) {
            sweepT = threatGap(rand(5.5, 7.5));
            var gapAt = rand(0.2, 0.8);
            for (var sw2 = 0.08; sw2 <= 0.92; sw2 += 0.08) {
              if (Math.abs(sw2 - gapAt) < 0.09) continue;
              balls.push({ x: sw2 * W, y: H * 0.2 + 10, vy: 250, own: 0 });
            }
            toast("BROADSIDE — find the gap!"); SFX.thunder();
          }
        }
        // phase 3: ramming runs — she lines up on your column and charges
        if (st >= 3) {
          if (!ram) {
            ramT -= dt;
            if (ramT <= 0) { ram = { x: px, warn: 0.9 + warnBonus() * 0.3, y: H * 0.2, charging: false, back: false }; SFX.thunder(); }
          } else {
            if (!ram.charging && !ram.back) { ram.warn -= dt; ram.x = lerp(ram.x, px, 1.5 * dt); fx2 = lerp(fx2, ram.x, 4 * dt); if (ram.warn <= 0) ram.charging = true; }
            else if (ram.charging) {
              ram.y += 520 * dt; fx2 = ram.x;
              if (Math.hypot(ram.x - px, ram.y - py) < 42) { damage(2); shake(16); splash(px, py, 14); ram.charging = false; ram.back = true; }
              if (ram.y > H + 60) { ram.charging = false; ram.back = true; }
            } else {
              ram.y -= 380 * dt;
              if (ram.y <= H * 0.2) { ram = null; ramT = threatGap(rand(7, 10)); }
            }
          }
        }
        var shipY2 = ram ? ram.y : H * 0.2;
        stepBalls(balls, dt, [{ x: fx2, y: shipY2, r: 24, onHit: function (b) {
          var doubled = chance(shotBonus());
          if (doubled) toast("⛓ Chain shot strikes double!");
          hp -= 1 + dmgBonus + (doubled ? 1 : 0);
          splash(b.x, b.y, 8, "#e08c6a"); SFX.hit();
          if (hp <= 0) {
            phase = "done"; loot = randInt(90, 140); addGold(loot); addScore(150); G.shipsBeaten++; SFX.win(); shake(14); feat("flagship");
            for (var k = 0; k < 30; k++) spawn(fx2, shipY2, { vx: rand(-140, 140), vy: rand(-180, 60), g: 260, life: rand(0.6, 1.3), r: rand(2, 5), c: choice(["#f7d84a", "#e08c6a", "#fff"]) });
          }
        } }], { x: px, y: py, r: 18 });
      },
      render: function () {
        drawSea(G.pal, seaT * 50, false);
        var st = stage();
        if (phase !== "intro") {
          var bw = 170, bx = W / 2 - bw / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(bx - 2, 6, bw + 4, 12, 5); ctx.fill();
          ctx.fillStyle = "#2f3a4a"; roundRect(bx, 8, bw * clamp(hp / max, 0, 1), 8, 4); ctx.fill();
          text("THE HUNTER'S FLAGSHIP" + (st > 1 ? "  ·  she's angry" : ""), W / 2, 32, 11, "#cdeccf", "center", "bold");
        }
        if (ram && !ram.charging && !ram.back) {
          var rp = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 11));
          ctx.globalAlpha = rp * 0.4; ctx.fillStyle = "#ff8a7a"; ctx.fillRect(ram.x - 26, 0, 52, H); ctx.globalAlpha = 1;
          text("SHE'S CHARGING — MOVE!", ram.x, H * 0.42, 15, "#ff8a7a", "center", "bold");
        }
        drawShip(fx2, ram ? ram.y : H * 0.2, 2.0, { rot: Math.PI, flag: "#e8e8f0", hull: "#2f3a4a", deck: "#48586e", sail: "#f5f2ea", dmg: max - hp });
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.76, 250, 420); panel(W / 2, H / 2, w, 132); text("THE PAYMASTER GOES DOWN", W / 2, H / 2 - 26, 19, "#8fd6a0", "center", "bold"); text("+150 points   +" + loot + " gold — the hunt goes home", W / 2, H / 2 + 6, 14, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 40, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }
  // ---------------------------------------------------------------- NAV MINI-GAMES
  function MiniScene(kind) {
    if (kind === "backstaff") return Backstaff();
    if (kind === "leadline") return LeadLine();
    return LogLine();
  }
  function Backstaff() {
    var phase = "intro", prompt = null, pos = 0, dir = 1, spd = rand(0.85, 1.15), tries = 3, got = 0, res = 0, showT = 0;
    var zone = rand(0.25, 0.75), zoneW = 0.16;
    return {
      enter: function () { prompt = Prompt("Take a sun-sight", "The backstaff finds your latitude from the sun. Real crews used one on this ship. Press SPACE when the sun sits on the horizon band. Three sights.", function () { phase = "play"; }, "⚓ FROM THE RECORD"); },
      update: function (dt) {
        seaT += dt; updateGulls(dt);
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        if (showT > 0) { showT -= dt; return; }
        if (tries <= 0) return;
        pos += dir * spd * dt; if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; }
        if (consumeFire()) {
          var off = Math.abs(pos - zone);
          if (off < zoneW / 2) { var pts = off < 0.03 ? 50 : 30; addScore(pts); addGold(10); got++; res = pts; SFX.point(); }
          else { res = 0; SFX.bad(); }
          showT = 0.8; tries--; zone = rand(0.25, 0.75);
          if (tries <= 0) setTimeout2(function () { phase = "done"; }, 0.85);
        }
      },
      render: function () {
        drawSea(G.pal, seaT * 35, false);
        drawParts(); drawHUD();
        var cx = W / 2, cy = H * 0.55, w = clamp(W * 0.7, 250, 420);
        panel(cx, cy - 90, clamp(W * 0.8, 270, 460), 56);
        text("Sights left: " + tries + "    Good: " + got, cx, cy - 84, 15, "#f4e7c9", "center", "bold");
        ctx.strokeStyle = "rgba(244,231,201,.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - w / 2, cy); ctx.lineTo(cx + w / 2, cy); ctx.stroke();
        ctx.fillStyle = "rgba(143,214,160,.35)"; ctx.fillRect(cx - w / 2 + (zone - zoneW / 2) * w, cy - 24, zoneW * w, 48);
        text("horizon", cx - w / 2 + zone * w, cy + 40, 11, "#8fd6a0");
        var sx = cx - w / 2 + pos * w;
        ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(sx, cy - 24, 12, 0, 7); ctx.fill();
        ctx.strokeStyle = "#ffd24a"; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(sx, cy - 24); ctx.lineTo(sx, cy + 20); ctx.stroke(); ctx.globalAlpha = 1;
        if (phase === "intro") prompt.render();
        else if (showT > 0) text(res > 0 ? "+" + res + (res >= 50 ? "  Dead on!" : "  Good sight") : "Missed", cx, cy - 50, 17, res > 0 ? "#8fd6a0" : "#e08c6a", "center", "bold");
        else text("SPACE or 🔥 on the green band", cx, H * 0.8, 13, "#cdb98a");
        if (phase === "done") { var pw = clamp(W * 0.7, 240, 380); panel(cx, H / 2, pw, 112); text("Sights logged", cx, H / 2 - 18, 21, "#e0b25c", "center", "bold"); text(got + " of 3 on target", cx, H / 2 + 10, 15, "#f4e7c9"); text("tap to sail on", cx, H / 2 + 38, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }
  function LeadLine() {
    var phase = "intro", prompt = null, y = 0, tries = 3, got = 0, showT = 0, res = 0;
    var band = rand(0.3, 0.75), bandW = 0.16, spd = rand(0.7, 1.0);
    return {
      enter: function () { prompt = Prompt("Sound the depth", "A lead weight on a marked rope. It told the crew how much water was under the keel. Press SPACE when the lead is in the band. Three drops.", function () { phase = "play"; }, "⚓ FROM THE RECORD"); },
      update: function (dt) {
        seaT += dt; updateGulls(dt);
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        if (showT > 0) { showT -= dt; return; }
        if (tries <= 0) return;
        y += spd * dt; if (y > 1) y = 0;
        if (consumeFire()) {
          var off = Math.abs(y - band);
          if (off < bandW / 2) { var pts = off < 0.03 ? 50 : 30; addScore(pts); addGold(10); got++; res = pts; SFX.point(); }
          else { res = 0; SFX.bad(); }
          showT = 0.8; tries--; band = rand(0.3, 0.75);
          if (tries <= 0) setTimeout2(function () { phase = "done"; }, 0.85);
        }
      },
      render: function () {
        drawSea(G.pal, seaT * 30, false);
        drawParts(); drawHUD();
        var cx = W / 2, top = H * 0.28, h = clamp(H * 0.42, 190, 380);
        panel(cx, top - 34, clamp(W * 0.8, 270, 460), 44);
        text("Drops left: " + tries + "    Good: " + got, cx, top - 28, 15, "#f4e7c9", "center", "bold");
        ctx.strokeStyle = "rgba(244,231,201,.3)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, top + h); ctx.stroke();
        ctx.fillStyle = "rgba(143,214,160,.35)"; ctx.fillRect(cx - 60, top + (band - bandW / 2) * h, 120, bandW * h);
        text("sounding", cx + 84, top + band * h + 4, 11, "#8fd6a0");
        var ly = top + y * h;
        ctx.strokeStyle = "#cdb98a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, ly); ctx.stroke();
        ctx.fillStyle = "#8a8f96"; ctx.beginPath(); ctx.moveTo(cx - 8, ly); ctx.lineTo(cx + 8, ly); ctx.lineTo(cx, ly + 18); ctx.closePath(); ctx.fill();
        if (phase === "intro") prompt.render();
        else if (showT > 0) text(res > 0 ? "+" + res + (res >= 50 ? "  By the mark!" : "  Good") : "Missed", cx, top + h + 30, 17, res > 0 ? "#8fd6a0" : "#e08c6a", "center", "bold");
        else text("SPACE or 🔥 in the green band", cx, top + h + 30, 13, "#cdb98a");
        if (phase === "done") { var pw = clamp(W * 0.7, 240, 380); panel(cx, H / 2, pw, 112); text("Depths sounded", cx, H / 2 - 18, 21, "#e0b25c", "center", "bold"); text(got + " of 3 on the mark", cx, H / 2 + 10, 15, "#f4e7c9"); text("tap to sail on", cx, H / 2 + 38, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }
  function LogLine() {
    var phase = "intro", prompt = null, knots = [], spawnT = 0, got = 0, missed = 0, total = 8, done2 = 0;
    return {
      enter: function () { prompt = Prompt("Stream the log", "A rope with knots tied at even spaces. Count the knots and you know your speed. That is why ships still measure speed in knots. Press SPACE as each knot crosses the line.", function () { phase = "play"; }, "⚓ FROM THE RECORD"); },
      update: function (dt) {
        seaT += dt; updateGulls(dt);
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        var markY = H * 0.7;
        spawnT -= dt;
        if (done2 < total && spawnT <= 0) { spawnT = rand(0.55, 0.9); knots.push({ y: -20, hit: false }); done2++; }
        for (var i = knots.length - 1; i >= 0; i--) { var k = knots[i]; k.y += 230 * dt; if (k.y > H + 20) { if (!k.hit) missed++; knots.splice(i, 1); } }
        if (consumeFire()) {
          var best = null, bd = 999;
          for (var j = 0; j < knots.length; j++) { if (knots[j].hit) continue; var d = Math.abs(knots[j].y - markY); if (d < bd) { bd = d; best = knots[j]; } }
          if (best && bd < 40) { best.hit = true; var pts = bd < 14 ? 30 : 18; addScore(pts); addGold(5); got++; SFX.point(); for (var s = 0; s < 5; s++) spawn(W / 2, markY, { vx: rand(-40, 40), vy: rand(-60, -10), g: 160, life: 0.5, r: 2, c: "#f7d84a" }); }
          else SFX.bad();
        }
        if (done2 >= total && knots.length === 0) phase = "done";
      },
      render: function () {
        drawSea(G.pal, seaT * 60, false);
        drawParts(); drawHUD();
        var cx = W / 2;
        panel(cx, H * 0.16, clamp(W * 0.8, 270, 460), 44);
        text("Knots caught: " + got + "    Missed: " + missed, cx, H * 0.16 + 5, 15, "#f4e7c9", "center", "bold");
        ctx.strokeStyle = "rgba(205,185,138,.5)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
        ctx.strokeStyle = "#e0b25c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 60, H * 0.7); ctx.lineTo(cx + 60, H * 0.7); ctx.stroke();
        text("press here", cx + 108, H * 0.7 + 4, 11, "#cdb98a");
        for (var i = 0; i < knots.length; i++) { var k = knots[i]; ctx.fillStyle = k.hit ? "#8fd6a0" : "#f4e7c9"; ctx.beginPath(); ctx.arc(cx, k.y, 9, 0, 7); ctx.fill(); ctx.strokeStyle = "#5a3a22"; ctx.lineWidth = 2; ctx.stroke(); }
        if (phase === "intro") prompt.render();
        if (phase === "done") { var pw = clamp(W * 0.7, 240, 380); panel(cx, H / 2, pw, 112); text("Speed logged", cx, H / 2 - 18, 21, "#e0b25c", "center", "bold"); text(got + " of " + total + " knots", cx, H / 2 + 10, 15, "#f4e7c9"); text("tap to sail on", cx, H / 2 + 38, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  var timers = [];
  function setTimeout2(fn, sec) { timers.push({ fn: fn, t: sec }); }
  function updateTimers(dt) { for (var i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { var f = timers[i].fn; timers.splice(i, 1); f(); } } }

  // ---------------------------------------------------------------- STORM finale
  // v9 rebuild: the nor'easter now comes in four named phases that escalate —
  // THE SQUALL LINE (learn the wheel in the wreckage) → THE TEETH (forked
  // lightning, real gusts, the first rogue waves) → THE EYE (a false calm, one
  // breath and a barrel) → THE STORM WALL (wave sets, triple lightning, a
  // wandering storm eddy that drags you off your line). Harder, longer, and it
  // finally feels like the sea that sank her.
  function StormScene() {
    var phase = "intro", prompt = null, chosen = false;
    var beatInfo = G.seq[G.seqIndex] || { m: G.mIndex, mBeatIdx: 0, mBeatCount: 1 };
    // Goody Hallett's curse, set (or lifted) back at Cape Cod
    var blessed = consumeMod("blessed"), cursed = consumeMod("cursed");
    var D = diff().storm, warnedEase = G.mods.warned ? 0.9 : 1;
    // the phase timeline — durations scale with difficulty and the curse
    var PH = [
      { key: "squall", name: "THE SQUALL LINE", sub: "Wreckage on the water",   dur: rand(9, 11) * D * warnedEase },
      { key: "teeth",  name: "THE TEETH",       sub: "The wind finds its edge", dur: rand(10, 12) * D * warnedEase },
      { key: "eye",    name: "THE EYE",         sub: "Too quiet",               dur: rand(4, 5) },
      { key: "wall",   name: "THE STORM WALL",  sub: "Hold on. Hold ON.",       dur: rand(11, 13) * D * (cursed ? 1.15 : 1) }
    ];
    if (blessed) PH[3].dur *= 0.82;
    var survive = 0; for (var pi = 0; pi < PH.length; pi++) survive += PH[pi].dur;
    var t = 0, phIdx = 0, phBannerT = 2.4, curKey = "squall";
    var objs = [], balls = [], spawnT = 0, lightning = 0;
    var bolts = [], boltT = rand(2.5, 4);      // targeted lightning: 1–3 marked columns
    var gust = null, gustT = rand(4, 6);
    var barrelT = rand(7, 9);
    var braceT = 0, fireGun = gunner();
    var waveSet = null, waveT = rand(3, 4.5) * (cursed ? 0.7 : 1);   // a set of 1–3 rogue waves
    var eddy = null;                            // the wandering storm whirlpool, phase 4 only
    var eyeGiven = false;
    var warnLen = 1.35 + warnBonus();
    function phaseAt(tt) { var acc = 0; for (var i = 0; i < PH.length; i++) { acc += PH[i].dur; if (tt < acc) return i; } return PH.length - 1; }
    function goPort() {
      for (var oi = G.seqIndex; oi < G.seq.length; oi++) if (G.seq[oi].kind === "oldsow") { G.seqIndex = oi - 1; advance(); return; }
      endRun(true, false);
    }
    return {
      debugWin: function () { phase = "play"; t = survive; },
      enter: function () {
        G.preStormScore = G.score; G.reachedStorm = true;
        prompt = Prompt("THE NOR'EASTER", "Cape Cod, April 26, 1717 — the storm that sank the real Whydah. It comes in waves: the squall, the teeth, a lying calm, and the wall. Dodge the wreckage, fight the wheel through the gusts, and TAP to brace when the rogue waves rear up. Live through all four.", function () { phase = "play"; }, "⚓ FROM THE RECORD");
      },
      update: function (dt) {
        seaT += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "won") {
          if (chosen) return;
          if (input.leftPressed) { chosen = true; goPort(); return; }
          if (input.rightPressed) { chosen = true; advance(); return; }
          return;
        }
        t += dt;
        G.stormT = clamp(t / survive, 0, 1);
        var fury = G.stormT;
        G.mIndex = beatInfo.m; G.mFrac = clamp((beatInfo.mBeatIdx + fury) / beatInfo.mBeatCount, 0, 1); setProgress();
        // phase bookkeeping
        var np = phaseAt(t);
        if (np !== phIdx) { phIdx = np; curKey = PH[phIdx].key; phBannerT = 2.4; SFX.thunder(); shake(6); if (curKey === "wall") eddy = null; }
        if (phBannerT > 0) phBannerT -= dt;
        var eye = curKey === "eye", wall = curKey === "wall";
        // intensity ramps within teeth/wall and eases to nothing in the eye
        var intensity = eye ? 0.12 : (curKey === "squall" ? 0.55 : (curKey === "teeth" ? 0.9 : 1.25)) + fury * 0.3;

        helm(dt, 1, 0.4);
        G.shipX += Math.sin(t * 1.3) * (eye ? 0.03 : 0.12) * dt;
        if (gust) {
          if (gust.warn > 0) gust.warn -= dt;
          else { G.shipX += gust.push * dt; gust.t -= dt; if (gust.t <= 0) gust = null; }
        }
        // the storm eddy: only in the wall, wanders slowly, drags you toward it
        if (wall && !eddy) eddy = { x: rand(0.3, 0.7) * W, y: H * rand(0.42, 0.6), R: Math.min(W, H) * 0.34, k: 0.5, vx: rand(-24, 24) };
        if (eddy) {
          eddy.x += eddy.vx * dt; if (eddy.x < W * 0.24 || eddy.x > W * 0.76) eddy.vx *= -1;
          applyWhirlpool(dt, eddy, G.shipX * W, shipYPx());
        }
        G.shipX = clamp(G.shipX, 0.06, 0.94);
        var shipPX = G.shipX * W, shipPY = shipYPx();
        if (input.firePressed) braceT = 0.5;
        if (braceT > 0) braceT -= dt;
        if (fireGun(dt)) { playerShot(shipPX, shipPY - 20, -430).forEach(function (nb) { balls.push(nb); }); SFX.fire(); }

        if (lightning > 0) lightning -= dt;
        if (!eye && chance(0.006)) { lightning = 0.12; SFX.thunder(); }
        // targeted strikes: teeth throws 2 columns, the wall throws 3
        boltT -= dt;
        if (!eye && bolts.length === 0 && boltT <= 0) {
          var n = wall ? 3 : (curKey === "teeth" ? 2 : 1);
          for (var bi = 0; bi < n; bi++) {
            var bx = bi === 0 ? clamp(shipPX + rand(-W * 0.1, W * 0.1), W * 0.1, W * 0.9) : clamp(rand(W * 0.1, W * 0.9), W * 0.1, W * 0.9);
            bolts.push({ x: bx, warn: (0.85 - fury * 0.2) + warnBonus() * 0.3, w: 52, hit: false });
          }
          boltT = rand(3.2, 5.2) - fury * 1.6;
        }
        for (var k = bolts.length - 1; k >= 0; k--) {
          var bt = bolts[k]; bt.warn -= dt;
          if (bt.warn <= 0) {
            lightning = 0.16; SFX.thunder(); shake(9);
            for (var lb = 0; lb < 12; lb++) spawn(bt.x + rand(-10, 10), rand(0, H * 0.8), { vx: rand(-30, 30), vy: rand(60, 160), g: 0, life: 0.3, r: rand(1, 3), c: "#fff" });
            if (Math.abs(shipPX - bt.x) < bt.w / 2 + 14) { if (chance(stormShrug() * 0.5)) toast("🪣 The rig holds!"); else damage(1); }
            bolts.splice(k, 1);
          }
        }
        // gusts: stronger and longer as the storm builds; the wall throws crosswinds
        gustT -= dt;
        if (!eye && !gust && gustT <= 0) {
          var mag = 0.26 + intensity * 0.1;
          gust = { push: (chance(0.5) ? 1 : -1) * mag, t: wall ? 2.0 : 1.5, warn: (0.75 - fury * 0.2) + warnBonus() * 0.3 };
          gustT = rand(5, 8) - intensity;
        }
        // wreckage
        spawnT -= dt;
        if (!eye && spawnT <= 0) {
          spawnT = rand(0.24, 0.52) / intensity * narrowEase() * diff().spawn;
          objs.push({ x: rand(0.08, 0.92) * W, y: -30, r: rand(15, 24), sp: (rand(230, 320) + intensity * 70) / Math.max(1, narrowEase() * 0.85), a: 0, spin: rand(-3, 3), sub: choice(["rock", "wood", "wood"]), hp: 1 });
        }
        // barrels: the eye guarantees one, otherwise they're a rare mercy
        barrelT -= dt;
        if (eye && !eyeGiven) { eyeGiven = true; repair(1); objs.push({ x: rand(0.3, 0.7) * W, y: -30, r: 15, sp: 180, a: 0, spin: rand(-1, 1), sub: "barrel" }); toast("🚢 The eye. Catch your breath — and a barrel."); }
        if (!eye && barrelT <= 0) { barrelT = rand(8, 11); objs.push({ x: rand(0.1, 0.9) * W, y: -30, r: 15, sp: rand(200, 260), a: 0, spin: rand(-1, 1), sub: "barrel" }); }
        for (var i = objs.length - 1; i >= 0; i--) {
          var o = objs[i]; o.y += o.sp * dt; o.a += o.spin * dt;
          if (Math.hypot(o.x - shipPX, o.y - shipPY) < o.r + 15) {
            if (o.sub === "barrel") {
              repair(1); SFX.good();
              for (var b4 = 0; b4 < 8; b4++) spawn(o.x, o.y, { vx: rand(-40, 40), vy: rand(-70, -10), g: 160, life: 0.7, r: 3, c: "#8fd6a0" });
              objs.splice(i, 1); continue;
            }
            splash(o.x, o.y, 8);
            if (chance(stormShrug())) { addScore(5); SFX.good(); toast("🪣 The pumps hold!"); }
            else damage(1);
            objs.splice(i, 1); continue;
          }
          if (o.y > H + 40) objs.splice(i, 1);
        }
        var stormTargets = [];
        for (var oj = 0; oj < objs.length; oj++) {
          var ob = objs[oj];
          if (ob.sub === "barrel") continue;
          (function (o2) { stormTargets.push({ x: o2.x, y: o2.y, r: o2.r, onHit: function () {
            addScore(5); SFX.point(); splash(o2.x, o2.y, 10); var idx = objs.indexOf(o2); if (idx >= 0) objs.splice(idx, 1);
          } }); })(ob);
        }
        stepBalls(balls, dt, stormTargets);
        // rogue waves now come in SETS: 1 in the squall, 2 in the teeth, up to 3 in the wall
        waveT -= dt;
        if (!eye && !waveSet && waveT <= 0) {
          var count = wall ? (chance(0.5) ? 3 : 2) : (curKey === "teeth" ? 2 : 1);
          waveSet = { left: count, total: count, warn: warnLen, hit: false };
        }
        if (waveSet) {
          waveSet.warn -= dt;
          if (waveSet.warn <= 0 && !waveSet.hit) {
            waveSet.hit = true;
            if (braceT <= 0) { if (chance(stormShrug())) { shake(8); toast("🪣 The pumps hold!"); } else { damage(wall ? 2 : 1); shake(16); } }
            else { addScore(20); shake(8); }
            waveSet.left--;
            if (waveSet.left > 0) { waveSet.hit = false; waveSet.warn = 0.75 + warnBonus() * 0.2; }   // the next wave in the set, fast
            else { waveSet = null; waveT = rand(4, 6.5) - intensity; }
          }
        }
        if (!eye && chance(0.5)) spawn(rand(0, W), rand(H * 0.2, H), { vx: rand(-40, 40), vy: rand(80, 160), g: 0, life: 0.5, r: rand(1, 2.5), c: "rgba(220,235,240,.7)" });
        if (t >= survive) {
          phase = "won"; G.stormCleared = true; repair(2); SFX.win();
          if (cursed) { addScore(80); toast("THE CURSE IS BROKEN"); }
        }
      },
      render: function () {
        var eye = curKey === "eye";
        drawSea(STORM_PAL, seaT * (eye ? 40 : 90), true);
        // rain — thinner in the eye
        ctx.strokeStyle = "rgba(200,220,230," + (eye ? 0.14 : 0.35) + ")"; ctx.lineWidth = 1;
        var rn = eye ? 22 : 60;
        for (var r = 0; r < rn; r++) { var rx = (r * 173 + (seaT * 900) % W) % W; var ry = (r * 271 + (seaT * 1400) % H) % H; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 6, ry + 16); ctx.stroke(); }
        if (eddy) drawWhirlpool(eddy);
        for (var bk = 0; bk < bolts.length; bk++) {
          var bt = bolts[bk];
          ctx.fillStyle = "rgba(255,240,150," + (0.12 + 0.14 * Math.sin(seaT * 24)) + ")";
          ctx.fillRect(bt.x - bt.w / 2, 0, bt.w, H);
          text("⚡", bt.x, H * 0.2, 26, "#ffd24a", "center", "bold");
        }
        for (var i = 0; i < objs.length; i++) { var o = objs[i]; ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a); if (o.sub === "rock") { ctx.fillStyle = "#4a4740"; blob(o.r); } else if (o.sub === "barrel") { ctx.fillStyle = "#8a5a34"; ctx.fillRect(-o.r * 0.7, -o.r, o.r * 1.4, o.r * 2); ctx.strokeStyle = "#8fd6a0"; ctx.lineWidth = 2; ctx.strokeRect(-o.r * 0.7, -o.r, o.r * 1.4, o.r * 2); } else { ctx.fillStyle = "#6b4a2a"; ctx.fillRect(-o.r, -5, o.r * 2, 10); } ctx.restore(); }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        // progress bar, split into phase ticks
        var sw = clamp(W * 0.6, 200, 400), sx = (W - sw) / 2, sy = H - 28;
        text("HOLD ON", W / 2, sy - 10, 13, "#f4e7c9", "center", "bold");
        ctx.fillStyle = "rgba(0,0,0,.5)"; roundRect(sx - 3, sy - 3, sw + 6, 12, 6); ctx.fill();
        ctx.fillStyle = eye ? "#7fb7c9" : "#e0b25c"; roundRect(sx, sy, sw * clamp(t / survive, 0, 1), 6, 3); ctx.fill();
        var acc = 0; for (var pt = 0; pt < PH.length - 1; pt++) { acc += PH[pt].dur; var tickX = sx + sw * (acc / survive); ctx.fillStyle = "rgba(10,16,22,.8)"; ctx.fillRect(tickX - 1, sy - 1, 2, 8); }
        // phase banner
        if (phBannerT > 0 && phase === "play") {
          var al = clamp(phBannerT / 0.6, 0, 1);
          ctx.globalAlpha = al;
          text(PH[phIdx].name, W / 2, H * 0.24, clamp(W * 0.055, 20, 30), eye ? "#9fd6e2" : "#ffd7a0", "center", "bold");
          text(PH[phIdx].sub, W / 2, H * 0.24 + 26, 13, "rgba(244,231,201,.8)", "center");
          ctx.globalAlpha = 1;
        }
        if (gust) {
          if (gust.warn > 0) text("💨 WIND RISING " + (gust.push > 0 ? "→" : "←") + " — get ready!", W / 2, H * 0.36, 16, "#bfe0ff", "center", "bold");
          else text("💨 GUST! Fight the wheel " + (gust.push > 0 ? "←" : "→"), W / 2, H * 0.36, 17, "#bfe0ff", "center", "bold");
        }
        if (eddy && phBannerT <= 0) text("🌀 THE SEA OPENS — row clear of the pull!", W / 2, H * 0.42, 14, "#a9d4e0", "center", "bold");
        if (waveSet && phase === "play") {
          ctx.fillStyle = "rgba(150,52,40," + (0.3 + 0.3 * Math.sin(seaT * 20)) + ")"; ctx.fillRect(0, 0, W, H);
          var lbl = waveSet.total > 1 ? ("ROGUE WAVE SET — " + (waveSet.total - waveSet.left + 1) + "/" + waveSet.total + " — TAP to brace!") : "ROGUE WAVE — TAP SPACE or 🔥 to brace!";
          text(lbl, W / 2, H * 0.5, clamp(W * 0.042, 14, 22), "#ffe1b0", "center", "bold");
        }
        if (lightning > 0) { ctx.fillStyle = "rgba(255,255,255," + lightning * 3 + ")"; ctx.fillRect(0, 0, W, H); }
        if (phase === "intro") prompt.render();
        if (phase === "won") {
          var w = clamp(W * 0.84, 290, 470); panel(W / 2, H / 2, w, 210);
          text("THE STORM BREAKS!", W / 2, H / 2 - 68, 24, "#8fd6a0", "center", "bold");
          wrapText("All four walls of it, and you're still afloat — further than the real Whydah ever got. The win is yours and the crew patches her up. But something followed you out of the dark. Something with three heads.", W / 2, H / 2 - 40, w - 44, 19, 13.5, "#f4e7c9");
          var bw = (w - 60) / 2, by = H / 2 + 30;
          if (!chosen && uiButton(W / 2 - w / 2 + 20, by, bw, 46, "⚓ MAKE FOR PORT", { size: 13.5, color: "#2c5e38" })) { chosen = true; goPort(); return; }
          if (!chosen && uiButton(W / 2 + 10, by, bw, 46, "🐍 TURN AND FIGHT", { size: 13.5, color: "#96341f" })) { chosen = true; advance(); return; }
          text("← port keeps the win  ·  → risks gold for glory", W / 2, H / 2 + 94, 10.5, "rgba(244,231,201,.6)");
        }
      }
    };
  }
  // ---------------------------------------------------------------- BOSS: the grandfather serpent
  // Three heads, one grudge. Only shows itself to crews that beat the storm.
  function BossScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], spits = [], fireGun = gunner(), dieT = 0, flashW = 0;
    var heads = [], baseY = H * 0.26;
    var headHp = Math.max(3, Math.round(5 * diff().hp));
    [0.22, 0.5, 0.78].forEach(function (bx, hi) {
      var seg = []; for (var i = 0; i < 12; i++) seg.push({ x: bx * W, y: -80 - i * 22 });
      heads.push({ seg: seg, hp: headHp, max: headHp, alive: true, baseX: bx, state: "weave", stateT: rand(1.2, 2.4) + hi * 0.7, lungeX: 0, lungeY: H * 0.72, open: false, flashT: 0, ph: hi * 2.1, spitT: (rand(1.8, 3.2) + hi * 0.6) * diff().spit });
    });
    var tripleT = rand(9, 12), triple = null;
    var rearTime = 0.55 + warnBonus() * 0.25;
    function aliveHeads() { return heads.filter(function (h) { return h.alive; }); }
    return {
      debugWin: function () { heads.forEach(function (h) { h.hp = 0; h.alive = false; }); phase = "dying"; dieT = 0; G.bossBeaten = true; addScore(300); addGold(200); },
      enter: function () {
        prompt = insane()
          ? Prompt("PUGNAROK", "The legend of the grandfather serpent got lost somewhere in the multiverse and came back as this. Three heads. One very good boy. Send it back for belly rubs.", function () { phase = "fight"; }, "🐶 MULTIVERSE")
          : Prompt("THE GRANDFATHER SERPENT", "The old salts say the first one was a pup. This is what it ran home to. Three heads. One ship. Send it back to the deep.", function () { phase = "fight"; }, "🌀 SEA YARN");
      },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); heads.forEach(function (h) { moveChain(h, dt, h.baseX * W, baseY); }); return; }
        if (phase === "dying") {   // the sea takes it back, one head at a time
          dieT += dt; flashW = Math.max(0, flashW - dt);
          heads.forEach(function (h, hi2) {
            if (dieT > hi2 * 0.7) { moveChain(h, dt, h.baseX * W + Math.sin(dieT * 3 + hi2) * 30, H + 300, 3); if (chance(0.2)) splash(h.seg[0].x, Math.min(h.seg[0].y, H * 0.9), 6); }
          });
          shake(4);
          if (chance(0.15)) spawn(rand(0, W), rand(H * 0.3, H * 0.8), { vx: rand(-60, 60), vy: rand(-120, 0), g: 200, life: rand(0.5, 1), r: rand(2, 5), c: choice(["#8fd6a0", "#f7d84a", "#fff"]) });
          if (dieT >= 2.5) phase = "done";
          return;
        }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.55);
        var shipPX = G.shipX * W, shipPY = shipYPx();
        if (fireGun(dt)) { playerShot(shipPX, shipPY - 20, -460).forEach(function (nb) { balls.push(nb); }); SFX.fire(); }
        // triple strike: every living head rears at once — find the open water
        tripleT -= dt;
        if (!triple && tripleT <= 0 && aliveHeads().length >= 2) {
          triple = { warn: rearTime + 0.35, fired: false };
          var lanes = shuffle([0.18, 0.5, 0.82]);
          aliveHeads().forEach(function (h, i2) { h.state = "rear"; h.stateT = triple.warn; h.lungeX = lanes[i2] * W; h.open = true; });
          SFX.thunder();
          if (insane()) toast("TRIPLE BOOP incoming!");
        }
        if (triple) {
          triple.warn -= dt;
          if (triple.warn <= 0 && !triple.fired) { triple.fired = true; aliveHeads().forEach(function (h) { h.state = "lunge"; h.stateT = 0.4; h.lungeY = shipPY; }); }
          if (triple.fired && aliveHeads().every(function (h) { return h.state !== "lunge"; })) { triple = null; tripleT = rand(8, 12); }
        }
        heads.forEach(function (h) {
          if (!h.alive) { moveChain(h, dt, h.baseX * W, H + 300, 3); return; }   // dead heads sink
          if (h.flashT > 0) h.flashT -= dt;
          h.stateT -= dt;
          if (h.state === "weave") {
            h.open = false;
            moveChain(h, dt, h.baseX * W + Math.sin(t * 1.8 + h.ph) * W * 0.14, baseY + Math.sin(t * 2.2 + h.ph) * 20);
            h.spitT -= dt;
            if (h.spitT <= 0) { h.spitT = rand(1.6, 2.8) * diff().spit; spits.push({ x: h.seg[0].x, y: h.seg[0].y, vx: clamp((shipPX - h.seg[0].x) * 0.9, -180, 180), vy: 280 }); SFX.bad(); }
            if (!triple && h.stateT <= 0) { h.state = "rear"; h.stateT = rearTime; h.lungeX = shipPX; h.open = true; }
          } else if (h.state === "rear") {
            if (!triple) h.lungeX = lerp(h.lungeX, shipPX, 1.4 * dt);
            moveChain(h, dt, h.lungeX, baseY - 34);
            if (h.stateT <= 0) { h.state = "lunge"; h.stateT = 0.36; h.lungeY = shipPY; }
          } else if (h.state === "lunge") {
            moveChain(h, dt, h.lungeX, h.lungeY, 9);
            if (Math.hypot(h.seg[0].x - shipPX, h.seg[0].y - shipPY) < 46) { damage(2); h.state = "recover"; h.stateT = 1.0; h.open = false; }
            if (h.stateT <= 0) { h.state = "recover"; h.stateT = rand(0.7, 1.1); h.open = false; }
          } else {
            moveChain(h, dt, h.baseX * W, baseY);
            if (h.stateT <= 0) { h.state = "weave"; h.stateT = rand(1.0, 2.0); }
          }
        });
        for (var si = spits.length - 1; si >= 0; si--) {
          var sv = spits[si]; sv.x += sv.vx * dt; sv.y += sv.vy * dt;
          if (Math.hypot(sv.x - shipPX, sv.y - shipPY) < 18) { spits.splice(si, 1); damage(1); continue; }
          if (sv.y > H + 30) spits.splice(si, 1);
        }
        var headTargets = [];
        heads.forEach(function (h2) {
          if (!h2.alive) return;
          headTargets.push({ x: h2.seg[0].x, y: h2.seg[0].y, r: hasMut("bighead") ? 34 : 24, onHit: function () {
            h2.hp--; h2.flashT = 0.12; SFX.hit(); splash(h2.seg[0].x, h2.seg[0].y, 10, "#8fd6a0");
            if (h2.hp <= 0) {
              h2.alive = false; h2.open = false; addScore(80); SFX.win(); shake(10);
              for (var k = 0; k < 20; k++) spawn(h2.seg[0].x, h2.seg[0].y, { vx: rand(-140, 140), vy: rand(-160, 60), g: 240, life: rand(0.6, 1.2), r: rand(2, 5), c: choice(["#8fd6a0", "#f7d84a", "#fff"]) });
              if (aliveHeads().length === 0) {
                phase = "dying"; dieT = 0; flashW = 0.4; G.bossBeaten = true; addScore(300); addGold(200); SFX.win(); shake(20); feat(insane() ? "pugnarok" : "boss");
                for (var k3 = 0; k3 < 60; k3++) spawn(h2.seg[0].x, h2.seg[0].y, { vx: rand(-220, 220), vy: rand(-260, 80), g: 240, life: rand(0.7, 1.8), r: rand(2, 6), c: choice(["#8fd6a0", "#f7d84a", "#fff", "#dff1f4"]) });
              }
            }
          } });
        });
        stepBalls(balls, dt, headTargets);
      },
      render: function () {
        drawSea(STORM_PAL, seaT * 60, true);
        if (phase !== "intro") {
          for (var hb = 0; hb < heads.length; hb++) {
            var h3 = heads[hb], bw = 90, bx2 = h3.baseX * W - bw / 2;
            ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(bx2 - 2, 6, bw + 4, 10, 4); ctx.fill();
            ctx.fillStyle = h3.alive ? "#2f6b4a" : "#333"; roundRect(bx2, 8, bw * clamp(h3.hp / h3.max, 0, 1), 6, 3); ctx.fill();
            if (insane() && hb !== 1) text("boy " + (hb + 1), h3.baseX * W, 24, 9.5, "#cdeccf", "center", "bold");   // the middle label would collide with the title
          }
          text(insane() ? "PUGNAROK" : "THE GRANDFATHER SERPENT", W / 2, 32, 11, "#cdeccf", "center", "bold");
        }
        heads.forEach(function (h) { if (h.alive || h.seg[0].y < H + 240) drawSerpent(h.seg, h.open, h.flashT > 0); });
        for (var s2 = 0; s2 < spits.length; s2++) {
          if (insane()) { ctx.fillStyle = "#c6e84a"; ctx.beginPath(); ctx.arc(spits[s2].x, spits[s2].y, 7, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(spits[s2].x, spits[s2].y, 7, 0.3, 2.2); ctx.stroke(); }
          else { ctx.fillStyle = "#8fd6a0"; ctx.beginPath(); ctx.arc(spits[s2].x, spits[s2].y, 6, 0, 7); ctx.fill(); }
        }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        heads.forEach(function (h) { if (h.open && phase === "fight") text(insane() ? "BOOP IT!" : "FIRE!", h.seg[0].x, h.seg[0].y - 40, 15, "#ffd24a", "center", "bold"); });
        if (flashW > 0) { ctx.fillStyle = "rgba(255,255,255," + flashW * 1.8 + ")"; ctx.fillRect(0, 0, W, H); }
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.78, 260, 430); panel(W / 2, H / 2, w, 140); text(insane() ? "ALL THREE GOOD BOYS SATISFIED" : "THE DEEP TAKES IT BACK!", W / 2, H / 2 - 28, 21, "#8fd6a0", "center", "bold"); text(insane() ? "+300 points (belly rubs)   +200 gold" : "+300 points   +200 gold", W / 2, H / 2 + 6, 17, "#e0b25c", "center", "bold"); text("tap to make port", W / 2, H / 2 + 44, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
    function moveChain(h, dt, tx, ty, speed) {
      var s = speed || 6;
      h.seg[0].x = lerp(h.seg[0].x, tx, clamp(s * dt, 0, 1));
      h.seg[0].y = lerp(h.seg[0].y, ty, clamp(s * dt, 0, 1));
      for (var i = 1; i < h.seg.length; i++) {
        h.seg[i].x = lerp(h.seg[i].x, h.seg[i - 1].x, clamp(12 * dt, 0, 1));
        h.seg[i].y = lerp(h.seg[i].y, h.seg[i - 1].y + 15, clamp(12 * dt, 0, 1));
      }
    }
  }

  // ==================================================================
  // THE SHIP-BOSS LADDER (v9) — the main game's bosses are all real-world
  // fights that get harder as the voyage runs north: bounty sloop (M2) →
  // the Mooncusser (M4) → powder brig in the squalls (M5) → the Hunter's
  // Flagship (M6) → the King's Blockade (M8). The myths that used to sit
  // in these slots live in INSANE now.
  // ==================================================================
  // M2 — THE BOUNTY SLOOP. The first real fight: fast, light, aimed fire,
  // and a telegraphed raking dash across your row. Learn to lead a target.
  function SloopBossScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], fireGun = gunner();
    var hp = Math.max(4, Math.round(8 * diff().hp)), max = hp;
    var sx2 = W * 0.5, sdir = 1, fireT = 1.6, dash = null, dashT = threatGap(8);
    var loot = 0;
    return {
      debugWin: function () { hp = 0; phase = "done"; loot = 50; addScore(80); addGold(50); feat("sloopboss"); },
      enter: function () { prompt = Prompt("THE BOUNTY SLOOP", "There is a price on every hand aboard, and this sloop means to collect the easy way — from a distance, with nine-pounders. She is faster than you. Be smarter than her.", function () { phase = "fight"; }, "⚓ THE BOUNTIES WERE REAL"); },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -430).forEach(function (b) { balls.push(b); }); SFX.fire(); smoke(px, py - 18, 2); }
        if (!dash) {
          sx2 += sdir * 150 * dt;
          if (sx2 < W * 0.12) sdir = 1;
          if (sx2 > W * 0.88) sdir = -1;
          if (chance(0.006)) sdir *= -1;
          fireT -= dt;
          if (fireT <= 0) {
            fireT = rand(1.3, 1.9) * diff().fire;
            balls.push({ x: sx2, y: H * 0.18 + 14, vy: 290, vx: clamp((px - sx2) * 0.55, -150, 150), own: 0 });
            SFX.fire();
          }
          dashT -= dt;
          if (dashT <= 0) dash = { warn: 0.9 + warnBonus() * 0.3, y: py, from: sx2 < W / 2 ? -60 : W + 60, x: 0, going: false };
        } else {
          if (!dash.going) { dash.warn -= dt; dash.y = lerp(dash.y, py, 1.2 * dt); if (dash.warn <= 0) { dash.going = true; dash.x = dash.from; SFX.thunder(); } }
          else {
            var dvx = dash.from < 0 ? 560 : -560;
            dash.x += dvx * dt;
            if (Math.abs(dash.x - px) < 34 && Math.abs(dash.y - py) < 30) { damage(1); shake(12); splash(px, py, 10); }
            if (dash.x < -80 || dash.x > W + 80) { dash = null; dashT = threatGap(rand(7, 10)); sx2 = clamp(dash ? sx2 : rand(0.2, 0.8) * W, W * 0.12, W * 0.88); }
          }
        }
        var tx = dash && dash.going ? dash.x : sx2, ty = dash && dash.going ? dash.y : H * 0.18;
        stepBalls(balls, dt, [{ x: tx, y: ty, r: 20, onHit: function (b) {
          hp--; splash(b.x, b.y, 8, "#e08c6a"); SFX.hit();
          if (hp <= 0) {
            phase = "done"; loot = randInt(40, 60); addGold(loot); addScore(80); G.shipsBeaten++; SFX.win(); shake(10); feat("sloopboss");
            for (var k = 0; k < 22; k++) spawn(tx, ty, { vx: rand(-120, 120), vy: rand(-160, 40), g: 260, life: rand(0.6, 1.1), r: rand(2, 4), c: choice(["#f7d84a", "#e08c6a", "#fff"]) });
          }
        } }], { x: px, y: py, r: 18 });
      },
      render: function () {
        drawSea(G.pal, seaT * 50, false);
        if (phase !== "intro") {
          var bw = 130, bx = W / 2 - bw / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(bx - 2, 6, bw + 4, 12, 5); ctx.fill();
          ctx.fillStyle = "#7a1f1f"; roundRect(bx, 8, bw * clamp(hp / max, 0, 1), 8, 4); ctx.fill();
          text("THE BOUNTY SLOOP", W / 2, 32, 11, "#cdeccf", "center", "bold");
        }
        if (dash && !dash.going) {
          var dp = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 11));
          ctx.globalAlpha = dp * 0.35; ctx.fillStyle = "#ff8a7a"; ctx.fillRect(0, dash.y - 24, W, 48); ctx.globalAlpha = 1;
          text("SHE'S COMING ACROSS — " + (dash.from < 0 ? "from PORT" : "from STARBOARD"), W / 2, dash.y - 34, 13, "#ff8a7a", "center", "bold");
        }
        if (dash && dash.going) drawShip(dash.x, dash.y, 1.4, { rot: dash.from < 0 ? Math.PI / 2 : -Math.PI / 2, flag: "#7a1f1f", hull: "#4a2f2f", deck: "#6a4444", sail: "#e8d3b0" });
        else drawShip(sx2, H * 0.18, 1.5, { rot: Math.PI, flag: "#7a1f1f", hull: "#4a2f2f", deck: "#6a4444", sail: "#e8d3b0", dmg: max - hp });
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.74, 250, 410); panel(W / 2, H / 2, w, 128); text("SHE STRIKES HER COLORS", W / 2, H / 2 - 24, 20, "#8fd6a0", "center", "bold"); text("+80 points   +" + loot + " gold", W / 2, H / 2 + 8, 15, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 42, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // M5 — THE POWDER BRIG. Slow and mean in bad water: paired aimed shots,
  // powder kegs rolled off her stern, and two live waterspouts working the
  // field while you fight.
  function BrigBossScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], kegs = [], fireGun = gunner();
    var hp = Math.max(6, Math.round(12 * diff().hp)), max = hp;
    var bx2 = W * 0.5, bdir = 1, fireT = 1.6, kegT = threatGap(3);
    // easy sheds a spout entirely — one squall to weave, not a crossfire of two
    var spouts = bossThreat() < 0.7 ? [{ x: W * 0.5, dir: 1 }] : [{ x: W * 0.25, dir: 1 }, { x: W * 0.75, dir: -1 }];
    var loot = 0;
    return {
      debugWin: function () { hp = 0; phase = "done"; loot = 80; addScore(110); addGold(80); feat("brigboss"); },
      enter: function () { prompt = Prompt("THE POWDER BRIG", "An armed merchant out of Hampton Roads, riding low with a hold full of powder — and a captain who would rather sink you in a squall than share the sea. Mind her kegs. Mind the spouts.", function () { phase = "fight"; }, "⚓ ARMED MERCHANTS WERE REAL"); },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -430).forEach(function (b) { balls.push(b); }); SFX.fire(); smoke(px, py - 18, 2); }
        bx2 += bdir * 70 * dt;
        if (bx2 < W * 0.18) bdir = 1;
        if (bx2 > W * 0.82) bdir = -1;
        fireT -= dt;
        if (fireT <= 0) {
          fireT = rand(1.5, 2.1) * diff().fire;
          var aim = clamp((px - bx2) * 0.55, -150, 150);
          if (bossThreat() < 0.7) { fireT += 0.6; balls.push({ x: bx2, y: H * 0.18 + 14, vy: 245, vx: aim * 0.8, own: 0 }); }   // easy: one slower, less-leading aimed shot, with a longer pause
          else { balls.push({ x: bx2 - 12, y: H * 0.18 + 14, vy: 280, vx: aim, own: 0 }); balls.push({ x: bx2 + 12, y: H * 0.18 + 14, vy: 280, vx: aim, own: 0 }); }
          SFX.fire();
        }
        kegT -= dt;
        if (kegT <= 0) { kegT = threatGap(rand(2.6, 3.8)); kegs.push({ x: clamp(bx2 + rand(-40, 40), 30, W - 30), y: H * 0.2, sp: rand(110, 140), r: 13, a: 0, spin: rand(-1, 1) }); }
        for (var ki = kegs.length - 1; ki >= 0; ki--) {
          var kg = kegs[ki]; kg.y += kg.sp * dt; kg.a += kg.spin * dt;
          if (Math.hypot(kg.x - px, kg.y - py) < kg.r + 15) { damage(1); shake(14); splash(kg.x, kg.y, 14, "#ffcf6a"); kegs.splice(ki, 1); continue; }
          if (kg.y > H + 30) kegs.splice(ki, 1);
        }
        // the squall never stops: two wandering waterspouts shove and sting
        for (var si2 = 0; si2 < spouts.length; si2++) {
          var sp2 = spouts[si2];
          sp2.x += sp2.dir * 55 * dt;
          if (sp2.x < W * 0.08) sp2.dir = 1;
          if (sp2.x > W * 0.92) sp2.dir = -1;
          if (chance(0.004)) sp2.dir *= -1;
          if (Math.abs(px - sp2.x) < 38 && py < H * 0.97) { damage(1); shake(10); G.shipX = clamp(G.shipX + (px < sp2.x ? -0.12 : 0.12), steerLo(), steerHi()); }
        }
        var kegTargets = [];
        kegs.forEach(function (kg2) { kegTargets.push({ x: kg2.x, y: kg2.y, r: kg2.r, onHit: function () { addScore(8); splash(kg2.x, kg2.y, 12, "#ffcf6a"); var i2 = kegs.indexOf(kg2); if (i2 >= 0) kegs.splice(i2, 1); } }); });
        kegTargets.push({ x: bx2, y: H * 0.18, r: 22, onHit: function (b) {
          hp--; splash(b.x, b.y, 8, "#e08c6a"); SFX.hit();
          if (hp <= 0) {
            phase = "done"; loot = randInt(60, 90); addGold(loot); addScore(110); G.shipsBeaten++; SFX.win(); shake(14); feat("brigboss");
            for (var k = 0; k < 30; k++) spawn(bx2, H * 0.18, { vx: rand(-160, 160), vy: rand(-200, 60), g: 260, life: rand(0.6, 1.3), r: rand(2, 5), c: choice(["#ffcf6a", "#e08c6a", "#fff"]) });
          }
        } });
        stepBalls(balls, dt, kegTargets, { x: px, y: py, r: 18 });
      },
      render: function () {
        drawSea(G.pal, seaT * 60, false);
        for (var si3 = 0; si3 < spouts.length; si3++) {
          var sp3 = spouts[si3];
          for (var seg2 = 0; seg2 < 7; seg2++) {
            var sy2 = H * 0.14 + seg2 * (H * 0.115), sw2 = 12 + seg2 * 6;
            var wob2 = Math.sin(seaT * 5 + seg2 * 0.9 + si3 * 3) * (4 + seg2 * 2);
            ctx.fillStyle = "rgba(170,200,220," + (0.42 - seg2 * 0.04) + ")";
            ctx.beginPath(); ctx.ellipse(sp3.x + wob2, sy2, sw2, 10 + seg2 * 1.4, 0, 0, 7); ctx.fill();
          }
        }
        if (phase !== "intro") {
          var bw = 140, hx = W / 2 - bw / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(hx - 2, 6, bw + 4, 12, 5); ctx.fill();
          ctx.fillStyle = "#3d3a2f"; roundRect(hx, 8, bw * clamp(hp / max, 0, 1), 8, 4); ctx.fill();
          text("THE POWDER BRIG", W / 2, 32, 11, "#cdeccf", "center", "bold");
        }
        drawShip(bx2, H * 0.18, 1.8, { rot: Math.PI, flag: "#b98f20", hull: "#3d3a2f", deck: "#5e5a44", sail: "#efe6cc", dmg: max - hp });
        for (var ki2 = 0; ki2 < kegs.length; ki2++) {
          var kg3 = kegs[ki2]; ctx.save(); ctx.translate(kg3.x, kg3.y); ctx.rotate(kg3.a);
          ctx.fillStyle = "#6b4a2a"; ctx.fillRect(-9, -12, 18, 24); ctx.strokeStyle = "#3a2414"; ctx.lineWidth = 2; ctx.strokeRect(-9, -12, 18, 24);
          ctx.strokeStyle = "#c9962e"; ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(9, -4); ctx.moveTo(-9, 4); ctx.lineTo(9, 4); ctx.stroke();
          ctx.restore();
        }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.74, 250, 410); panel(W / 2, H / 2, w, 128); text("DOWN WITH ALL HER POWDER", W / 2, H / 2 - 24, 19, "#8fd6a0", "center", "bold"); text("+110 points   +" + loot + " gold", W / 2, H / 2 + 8, 15, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 42, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // M8 — THE KING'S BLOCKADE. The hardest real fight of the ladder: two
  // men-of-war holding the passage, alternating broadside sweeps with offset
  // safe gaps, lobbed mortar fire on marked water, and an enrage when the
  // first one goes down.
  function BlockadeScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], mortars = [], fireGun = gunner();
    var shipHp = Math.max(5, Math.round(8 * diff().hp));
    var ships = [
      { x: W * 0.26, hp: shipHp, max: shipHp, alive: true, fireT: 1.8 },
      { x: W * 0.74, hp: shipHp, max: shipHp, alive: true, fireT: 2.6 }
    ];
    var sweepT = threatGap(5), sweepSide = 0, mortarT = threatGap(3.4), loot = 0;
    function aliveList() { return ships.filter(function (s2) { return s2.alive; }); }
    return {
      debugWin: function () { ships.forEach(function (s2) { s2.hp = 0; s2.alive = false; }); phase = "done"; loot = 120; addScore(180); addGold(120); feat("blockade"); },
      enter: function () { prompt = Prompt("THE KING'S BLOCKADE", "Two men-of-war anchored spring-on-cable across the passage — the Crown's answer to a pirate who will not be caught. Their broadsides alternate. Their mortars mark the water first. There is always one gap.", function () { phase = "fight"; }, "⚓ BLOCKADES WERE REAL"); },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -440).forEach(function (b) { balls.push(b); }); SFX.fire(); smoke(px, py - 18, 3); }
        var enraged = aliveList().length === 1;
        // aimed crossfire from each living ship
        ships.forEach(function (s2) {
          if (!s2.alive) return;
          s2.fireT -= dt;
          if (s2.fireT <= 0) {
            s2.fireT = (enraged ? rand(0.8, 1.2) : rand(1.4, 2.0)) * diff().fire;
            balls.push({ x: s2.x, y: H * 0.16 + 14, vy: 300, vx: clamp((px - s2.x) * 0.6, -170, 170), own: 0 });
            SFX.fire();
          }
        });
        // alternating broadside sweep: a wall of shot with one offset gap
        sweepT -= dt;
        if (sweepT <= 0) {
          sweepT = threatGap(enraged ? rand(3.8, 5) : rand(5, 6.5));
          sweepSide = 1 - sweepSide;
          var gapAt = sweepSide === 0 ? rand(0.15, 0.45) : rand(0.55, 0.85);
          var gapW = bossThreat() < 0.7 ? 0.11 : 0.08;   // easy: a wider, more forgiving gap to thread
          for (var sw3 = 0.06; sw3 <= 0.94; sw3 += 0.07) {
            if (Math.abs(sw3 - gapAt) < gapW) continue;
            balls.push({ x: sw3 * W, y: H * 0.16 + 8, vy: enraged ? 275 : 245, own: 0 });
          }
          toast("BROADSIDE — the gap is " + (gapAt < 0.5 ? "to PORT" : "to STARBOARD") + "!"); SFX.thunder();
        }
        // mortars: marked water, then the ball drops
        mortarT -= dt;
        if (mortarT <= 0) {
          mortarT = threatGap(enraged ? rand(2.2, 3.2) : rand(3.2, 4.4));
          mortars.push({ x: clamp(px + rand(-W * 0.18, W * 0.18), W * 0.08, W * 0.92), y: clamp(py + rand(-50, 50), H * 0.5, H * 0.94), warn: 1.1 + warnBonus() * 0.3 });
        }
        for (var mo = mortars.length - 1; mo >= 0; mo--) {
          var m2 = mortars[mo]; m2.warn -= dt;
          if (m2.warn <= 0) {
            if (Math.hypot(m2.x - px, m2.y - py) < 44) { damage(1); shake(12); }
            splash(m2.x, m2.y, 14); SFX.thunder();
            mortars.splice(mo, 1);
          }
        }
        var targets2 = [];
        ships.forEach(function (s3) {
          if (!s3.alive) return;
          targets2.push({ x: s3.x, y: H * 0.16, r: 24, onHit: function (b) {
            s3.hp--; splash(b.x, b.y, 8, "#e08c6a"); SFX.hit();
            if (s3.hp <= 0) {
              s3.alive = false; addScore(90); addGold(50); loot += 50; SFX.win(); shake(12);
              for (var k = 0; k < 26; k++) spawn(s3.x, H * 0.16, { vx: rand(-150, 150), vy: rand(-180, 60), g: 260, life: rand(0.6, 1.2), r: rand(2, 5), c: choice(["#f7d84a", "#e08c6a", "#fff"]) });
              if (aliveList().length === 0) { phase = "done"; addScore(180); addGold(70); loot += 70; SFX.win(); feat("blockade"); }
              else toast("HER SISTER RUNS OUT HER GUNS — she's angry now!");
            }
          } });
        });
        stepBalls(balls, dt, targets2, { x: px, y: py, r: 18 });
      },
      render: function () {
        drawSea(G.pal, seaT * 50, false);
        if (phase !== "intro") {
          ships.forEach(function (s4) {
            var bw2 = 96, hx2 = s4.x - bw2 / 2;
            ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(hx2 - 2, 6, bw2 + 4, 10, 4); ctx.fill();
            ctx.fillStyle = s4.alive ? "#2f3a4a" : "#333"; roundRect(hx2, 8, bw2 * clamp(s4.hp / s4.max, 0, 1), 6, 3); ctx.fill();
          });
          text("THE KING'S BLOCKADE", W / 2, 32, 11, "#cdeccf", "center", "bold");
        }
        ships.forEach(function (s5) {
          if (!s5.alive) return;
          drawShip(s5.x, H * 0.16, 1.9, { rot: Math.PI, flag: "#e8e8f0", hull: "#2f3a4a", deck: "#48586e", sail: "#f5f2ea", dmg: s5.max - s5.hp });
        });
        for (var mo2 = 0; mo2 < mortars.length; mo2++) {
          var m3 = mortars[mo2], mp2 = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 10));
          ctx.strokeStyle = "rgba(255,138,122," + mp2 + ")"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(m3.x, m3.y, 24 + clamp(1.1 - m3.warn, 0, 1.1) * 12, 0, 7); ctx.stroke();
        }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.78, 260, 430); panel(W / 2, H / 2, w, 132); text("THE PASSAGE IS OPEN", W / 2, H / 2 - 26, 20, "#8fd6a0", "center", "bold"); text("+180 points   +" + loot + " gold — Maine is close now", W / 2, H / 2 + 6, 14, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 40, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // ==================================================================
  // INSANE-ONLY MYTHIC BOSSES (v9) — the multiverse got two new stops
  // ==================================================================
  // THE KEEPER OF THE LOCKER — Davy Jones himself, in the place where the
  // sea keeps what it takes. Chains rise on marked columns, sea chests burst
  // into rings of shot, and drowned fish sweep the water in schools.
  function DavyJonesScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], chests = [], chains = [], fireGun = gunner();
    var hp = Math.max(10, Math.round(14 * diff().hp)), max = hp;
    var jx = W * 0.5, jdir = 1, chainT = 2.5, chestT = 4, sweepT = 7;
    return {
      debugWin: function () { hp = 0; phase = "done"; addScore(200); addGold(120); feat("davyjones"); },
      enter: function () { G.pal = PALETTES[4]; prompt = Prompt("THE KEEPER OF THE LOCKER", "Every ship the sea has ever taken is filed neatly down here, and the clerk does not approve of visitors. Davy Jones rises from between the wrecks, ledger in one hand, chain in the other.", function () { phase = "fight"; }, "🤯 MULTIVERSE"); },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -440).forEach(function (b) { balls.push(b); }); SFX.fire(); }
        var fury = 1 + (1 - hp / max) * 0.8;   // he speeds up as the ledger thins
        jx += jdir * 60 * fury * dt;
        if (jx < W * 0.18) jdir = 1;
        if (jx > W * 0.82) jdir = -1;
        // chains rise from below on marked columns
        chainT -= dt;
        if (chainT <= 0) {
          chainT = rand(2.6, 3.6) / fury;
          chains.push({ x: clamp(px + rand(-W * 0.22, W * 0.22), W * 0.08, W * 0.92), warn: 1.0 + warnBonus() * 0.3, y: H + 40, live: false });
        }
        for (var ci = chains.length - 1; ci >= 0; ci--) {
          var ch = chains[ci];
          if (!ch.live) { ch.warn -= dt; if (ch.warn <= 0) { ch.live = true; SFX.bad(); } }
          else {
            ch.y -= 480 * dt;
            if (Math.abs(ch.x - px) < 24 && ch.y < py + 20) { damage(1); shake(12); splash(px, py, 10, "#8fae7d"); chains.splice(ci, 1); continue; }
            if (ch.y < -60) chains.splice(ci, 1);
          }
        }
        // sea chests lob onto the water and burst into a ring of shot
        chestT -= dt;
        if (chestT <= 0) {
          chestT = rand(3.6, 5) / fury;
          chests.push({ x: clamp(px + rand(-W * 0.2, W * 0.2), W * 0.12, W * 0.88), y: clamp(py + rand(-70, 30), H * 0.45, H * 0.9), warn: 1.2 });
        }
        for (var ce = chests.length - 1; ce >= 0; ce--) {
          var cst = chests[ce]; cst.warn -= dt;
          if (cst.warn <= 0) {
            for (var ang = 0; ang < 6; ang++) {
              var a2 = ang * (Math.PI * 2 / 6);
              balls.push({ x: cst.x, y: cst.y, vx: Math.cos(a2) * 160, vy: Math.sin(a2) * 160, own: 0, style: "bubble" });
            }
            splash(cst.x, cst.y, 10, "#c9b26a"); SFX.thunder();
            chests.splice(ce, 1);
          }
        }
        // a school of the drowned sweeps one row, with a gap
        sweepT -= dt;
        if (sweepT <= 0) {
          sweepT = rand(6.5, 8.5) / fury;
          var gapAt2 = rand(0.15, 0.85);
          for (var f2 = 0.05; f2 <= 0.95; f2 += 0.08) {
            if (Math.abs(f2 - gapAt2) < 0.09) continue;
            balls.push({ x: f2 * W, y: H * 0.12, vy: 235, own: 0, style: "venom" });
          }
          toast("THE DROWNED SWIM IN SCHOOLS — find the gap!"); SFX.thunder();
        }
        stepBalls(balls, dt, [{ x: jx, y: H * 0.17, r: hasMut("bighead") ? 36 : 28, onHit: function (b) {
          hp--; splash(b.x, b.y, 10, "#8fd6a0"); SFX.hit(); shake(3);
          if (hp <= 0) {
            phase = "done"; addScore(200); addGold(120); SFX.win(); shake(18); feat("davyjones");
            for (var k = 0; k < 40; k++) spawn(jx, H * 0.17, { vx: rand(-200, 200), vy: rand(-220, 80), g: 260, life: rand(0.7, 1.5), r: rand(2, 6), c: choice(["#8fae7d", "#c9b26a", "#fff"]) });
          }
        } }], { x: px, y: py, r: 18 });
      },
      render: function () {
        drawSea(G.pal, seaT * 35, false);
        // wreck silhouettes on the seabed of the multiverse
        ctx.fillStyle = "rgba(10,16,22,.5)";
        for (var wr = 0; wr < 3; wr++) { ctx.save(); ctx.translate(W * (0.2 + wr * 0.3), H * 0.05); ctx.rotate((wr % 2 ? 1 : -1) * 0.2); ctx.fillRect(-50, -8, 100, 16); ctx.restore(); }
        // Davy Jones: coat, ledger, chain, beard of tendrils
        ctx.save(); ctx.translate(jx, H * 0.17);
        var big = hasMut("bighead") ? 1.35 : 1;
        ctx.scale(big, big);
        ctx.fillStyle = "#26333d"; ctx.beginPath(); ctx.ellipse(0, 16, 26, 22, 0, 0, 7); ctx.fill();   // coat
        ctx.fillStyle = "#5e7a6a"; ctx.beginPath(); ctx.arc(0, -10, 15, 0, 7); ctx.fill();            // head
        ctx.strokeStyle = "#4a6a58"; ctx.lineWidth = 4; ctx.lineCap = "round";
        for (var td = -2; td <= 2; td++) {                                                             // the beard
          ctx.beginPath(); ctx.moveTo(td * 5, -2);
          ctx.quadraticCurveTo(td * 8 + Math.sin(seaT * 4 + td) * 4, 14, td * 7 + Math.sin(seaT * 4 + td) * 6, 26);
          ctx.stroke();
        }
        ctx.fillStyle = "#f7d84a"; ctx.beginPath(); ctx.arc(-6, -13, 3, 0, 7); ctx.arc(6, -13, 3, 0, 7); ctx.fill();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(-6, -13, 1.4, 0, 7); ctx.arc(6, -13, 1.4, 0, 7); ctx.fill();
        ctx.fillStyle = "#c9b26a"; ctx.fillRect(-34, 6, 12, 16);                                       // the ledger
        ctx.restore();
        if (phase !== "intro") {
          var bw3 = 160, hx3 = W / 2 - bw3 / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(hx3 - 2, 6, bw3 + 4, 12, 5); ctx.fill();
          ctx.fillStyle = "#4a6a58"; roundRect(hx3, 8, bw3 * clamp(hp / max, 0, 1), 8, 4); ctx.fill();
          text("THE KEEPER OF THE LOCKER", W / 2, 32, 11, "#cdeccf", "center", "bold");
        }
        for (var ci2 = 0; ci2 < chains.length; ci2++) {
          var ch2 = chains[ci2];
          if (!ch2.live) { var cp = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 10)); ctx.globalAlpha = cp * 0.5; ctx.fillStyle = "#8fae7d"; ctx.fillRect(ch2.x - 14, 0, 28, H); ctx.globalAlpha = 1; text("⛓", ch2.x, H - 24, 16, "#8fae7d", "center", "bold"); }
          else { ctx.strokeStyle = "#6a7a72"; ctx.lineWidth = 6; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(ch2.x, H + 20); ctx.lineTo(ch2.x, ch2.y); ctx.stroke(); ctx.setLineDash([]); }
        }
        for (var ce2 = 0; ce2 < chests.length; ce2++) {
          var cst2 = chests[ce2], cp2 = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 9));
          ctx.save(); ctx.translate(cst2.x, cst2.y);
          ctx.globalAlpha = cp2; ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.fillStyle = "#7a5a34"; ctx.fillRect(-12, -8, 24, 16); ctx.fillStyle = "#c9962e"; ctx.fillRect(-12, -2, 24, 3);
          ctx.restore();
        }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.78, 260, 430); panel(W / 2, H / 2, w, 132); text("THE LEDGER CLOSES", W / 2, H / 2 - 26, 20, "#8fd6a0", "center", "bold"); text("+200 points   +120 gold — he files you under 'escaped'", W / 2, H / 2 + 6, 13.5, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 40, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // POSEIDON — the old god of the sea, at multiverse scale. Trident bolts on
  // marked columns, summoned wave walls with one gap, and a whirlpool he
  // stirs with his free hand.
  function PoseidonScene() {
    var phase = "intro", prompt = null, t = 0, balls = [], boltList = [], fireGun = gunner();
    var hp = Math.max(12, Math.round(16 * diff().hp)), max = hp;
    var gx2 = W * 0.5, gdir = 1, boltT = 2.2, waveT = 6, whirlT = 9, whirl = null;
    return {
      debugWin: function () { hp = 0; phase = "done"; addScore(250); addGold(150); feat("poseidon"); },
      enter: function () { prompt = Prompt("POSEIDON", "The multiverse kept going and eventually the sea itself objected. He is taller than the weather. He is older than the charts. He would like a word about all the cannonballs you have been leaving in his ocean.", function () { phase = "fight"; }, "🤯 MULTIVERSE"); },
      update: function (dt) {
        seaT += dt; t += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -450).forEach(function (b) { balls.push(b); }); SFX.fire(); }
        var fury = 1 + (1 - hp / max);
        gx2 += gdir * 40 * fury * dt;
        if (gx2 < W * 0.25) gdir = 1;
        if (gx2 > W * 0.75) gdir = -1;
        // trident bolts: marked columns, then the strike
        boltT -= dt;
        if (boltT <= 0) {
          boltT = rand(2.4, 3.4) / fury;
          boltList.push({ x: clamp(px + rand(-W * 0.16, W * 0.16), W * 0.08, W * 0.92), warn: 0.9 + warnBonus() * 0.3 });
        }
        for (var bi2 = boltList.length - 1; bi2 >= 0; bi2--) {
          var bl = boltList[bi2]; bl.warn -= dt;
          if (bl.warn <= 0) {
            if (Math.abs(px - bl.x) < 30) { damage(1); shake(12); }
            for (var lb2 = 0; lb2 < 12; lb2++) spawn(bl.x + rand(-8, 8), rand(H * 0.2, H * 0.9), { vx: rand(-30, 30), vy: rand(60, 160), g: 0, life: 0.3, r: rand(1, 3), c: "#bfe8ff" });
            SFX.thunder(); shake(6);
            boltList.splice(bi2, 1);
          }
        }
        // summoned wave walls with one gap
        waveT -= dt;
        if (waveT <= 0) {
          waveT = rand(5.5, 7) / fury;
          var gapAt3 = rand(0.15, 0.85);
          for (var wv = 0.05; wv <= 0.95; wv += 0.07) {
            if (Math.abs(wv - gapAt3) < 0.09) continue;
            balls.push({ x: wv * W, y: H * 0.14, vy: 250, own: 0, style: "bubble" });
          }
          toast("HE LIFTS THE SEA — find the gap!"); SFX.thunder();
        }
        // he stirs a whirlpool with his free hand
        whirlT -= dt;
        if (!whirl && whirlT <= 0) { whirl = { x: rand(W * 0.3, W * 0.7), y: H * 0.35, R: clamp(W * 0.2, 90, 160), k: 0.55, life: 6 }; toast("THE WATER TURNS UNDER YOU"); }
        if (whirl) {
          whirl.life -= dt;
          if (applyWhirlpool(dt, whirl, px, py)) { damage(1); shake(12); whirl = null; whirlT = rand(8, 11); }
          else if (whirl.life <= 0) { whirl = null; whirlT = rand(8, 11); }
        }
        stepBalls(balls, dt, [{ x: gx2, y: H * 0.16, r: hasMut("bighead") ? 40 : 30, onHit: function (b) {
          hp--; splash(b.x, b.y, 10, "#bfe8ff"); SFX.hit(); shake(3);
          if (hp <= 0) {
            phase = "done"; addScore(250); addGold(150); SFX.win(); shake(20); feat("poseidon");
            for (var k = 0; k < 50; k++) spawn(gx2, H * 0.16, { vx: rand(-240, 240), vy: rand(-260, 100), g: 260, life: rand(0.8, 1.8), r: rand(2, 6), c: choice(["#bfe8ff", "#7fd6ea", "#fff"]) });
          }
        } }], { x: px, y: py, r: 18 });
      },
      render: function () {
        drawSea(G.pal, seaT * 55, true);
        if (whirl) drawWhirlpool(whirl);
        // the god: torso from the horizon, crown, trident
        ctx.save(); ctx.translate(gx2, H * 0.16);
        var big2 = hasMut("bighead") ? 1.3 : 1;
        ctx.scale(big2, big2);
        ctx.fillStyle = "#3e6a7a"; ctx.beginPath(); ctx.ellipse(0, 26, 34, 26, 0, 0, 7); ctx.fill();      // shoulders
        ctx.fillStyle = "#5e8a98"; ctx.beginPath(); ctx.arc(0, -6, 17, 0, 7); ctx.fill();                 // head
        ctx.strokeStyle = "#dfeff4"; ctx.lineWidth = 4; ctx.lineCap = "round";                            // beard of foam
        for (var td2 = -2; td2 <= 2; td2++) { ctx.beginPath(); ctx.moveTo(td2 * 5, 2); ctx.quadraticCurveTo(td2 * 7, 16, td2 * 6 + Math.sin(seaT * 3 + td2) * 4, 26); ctx.stroke(); }
        ctx.fillStyle = "#f7d84a";                                                                        // crown
        ctx.beginPath(); ctx.moveTo(-14, -18); ctx.lineTo(-8, -28); ctx.lineTo(-2, -18); ctx.lineTo(2, -28); ctx.lineTo(8, -18); ctx.lineTo(14, -28); ctx.lineTo(14, -14); ctx.lineTo(-14, -14); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-7, -8, 3, 0, 7); ctx.arc(7, -8, 3, 0, 7); ctx.fill();
        ctx.fillStyle = "#0c3a52"; ctx.beginPath(); ctx.arc(-7, -8, 1.5, 0, 7); ctx.arc(7, -8, 1.5, 0, 7); ctx.fill();
        ctx.strokeStyle = "#c9b26a"; ctx.lineWidth = 5;                                                   // trident
        ctx.beginPath(); ctx.moveTo(30, 34); ctx.lineTo(30, -30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(22, -18); ctx.lineTo(22, -32); ctx.moveTo(30, -22); ctx.lineTo(30, -36); ctx.moveTo(38, -18); ctx.lineTo(38, -32); ctx.stroke();
        ctx.restore();
        if (phase !== "intro") {
          var bw4 = 170, hx4 = W / 2 - bw4 / 2;
          ctx.fillStyle = "rgba(0,0,0,.4)"; roundRect(hx4 - 2, 6, bw4 + 4, 12, 5); ctx.fill();
          ctx.fillStyle = "#3e6a7a"; roundRect(hx4, 8, bw4 * clamp(hp / max, 0, 1), 8, 4); ctx.fill();
          text("POSEIDON", W / 2, 32, 11, "#cdeccf", "center", "bold");
        }
        for (var bi3 = 0; bi3 < boltList.length; bi3++) {
          var bl2 = boltList[bi3], bp2 = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 11));
          ctx.globalAlpha = bp2 * 0.45; ctx.fillStyle = "#bfe8ff"; ctx.fillRect(bl2.x - 16, 0, 32, H); ctx.globalAlpha = 1;
          text("⚡", bl2.x, 44, 18, "#bfe8ff", "center", "bold");
        }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "intro") prompt.render();
        if (phase === "done") { var w = clamp(W * 0.78, 260, 430); panel(W / 2, H / 2, w, 132); text("THE SEA SETTLES", W / 2, H / 2 - 26, 21, "#8fd6a0", "center", "bold"); text("+250 points   +150 gold — he nods, once, and sinks", W / 2, H / 2 + 6, 13.5, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 40, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // ---------------------------------------------------------------- KRAKEN (M2, Windward Passage)
  // A yarn promoted into gameplay: telegraphed tentacles rise from below in
  // random lanes; shoot the arms or keep clear, and outlast the encounter.
  function KrakenScene() {
    var phase = "intro", prompt = null, t = 0, dur = 20, balls = [], fireGun = gunner();
    var tentacles = [], spawnT = 1.2;
    return {
      debugWin: function () { t = dur; tentacles = []; },
      enter: function () { prompt = Prompt("THE KRAKEN", "Sailors swore something vast slept in these straits. This one is a sea story — shoot the arms or keep clear, and outlast it.", function () { phase = "fight"; }, "🌀 SEA YARN"); },
      update: function (dt) {
        seaT += dt;
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        t += dt;
        helm(dt, 1, 0.5);
        var px = G.shipX * W, py = shipYPx();
        if (fireGun(dt)) { playerShot(px, py - 20, -430).forEach(function (b) { balls.push(b); }); SFX.fire(); smoke(px, py - 18, 2); }
        spawnT -= dt;
        if (spawnT <= 0 && tentacles.length < 2 && t < dur - 2) {
          spawnT = rand(2.0, 3.0);
          var lane = clamp(px + rand(-170, 170), W * 0.12, W * 0.88);
          tentacles.push({ x: lane, y: H + 80, target: H * rand(0.4, 0.55), state: "warn", warn: 0.9 + warnBonus() * 0.3, hold: 1.4, hp: 2 });
        }
        for (var i = tentacles.length - 1; i >= 0; i--) {
          var tc = tentacles[i];
          if (tc.state === "warn") { tc.warn -= dt; if (tc.warn <= 0) tc.state = "rise"; }
          else if (tc.state === "rise") { tc.y = lerp(tc.y, tc.target, clamp(3.2 * dt, 0, 1)); if (Math.abs(tc.y - tc.target) < 4) tc.state = "hold"; }
          else if (tc.state === "hold") {
            tc.hold -= dt;
            if (Math.hypot(tc.x - px, tc.y - py) < 34) { damage(1); shake(8); }
            if (tc.hold <= 0) tc.state = "sink";
          } else { tc.y += 160 * dt; if (tc.y > H + 150) { tentacles.splice(i, 1); continue; } }
        }
        var krakenTargets = [];
        tentacles.forEach(function (tc2) {
          if (tc2.state !== "hold" && tc2.state !== "rise") return;
          krakenTargets.push({ x: tc2.x, y: tc2.y, r: 24, onHit: function () {
            tc2.hp--; splash(tc2.x, tc2.y, 8, "#3c7f58"); SFX.hit();
            if (tc2.hp <= 0) { addScore(35); addGold(10); SFX.win(); tc2.state = "sink"; tc2.hold = 0; }
          } });
        });
        stepBalls(balls, dt, krakenTargets);
        if (t >= dur && tentacles.length === 0) { phase = "done"; addScore(60); SFX.win(); }
      },
      render: function () {
        drawSea(G.pal, seaT * 55, false);
        for (var i = 0; i < tentacles.length; i++) {
          var tc = tentacles[i];
          if (tc.state === "warn") {
            var pulse = 0.4 + 0.6 * Math.abs(Math.sin(seaT * 9));
            ctx.strokeStyle = "rgba(60,127,88," + pulse + ")"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(tc.x, H - 30, 22 + (1 - clamp(tc.warn, 0, 1)) * 26, 0, 7); ctx.stroke();
            continue;
          }
          var seg = [];
          for (var s = 0; s < 9; s++) seg.push({ x: tc.x + Math.sin(s * 0.6 + seaT * 3) * 12, y: tc.y + s * 22 });
          drawSerpent(seg, false, false);
        }
        drawBalls(balls);
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "intro") prompt.render();
        if (phase === "fight" && t < 2.4) { ctx.globalAlpha = clamp(2.4 - t, 0, 1); text("Shoot the arms or keep clear. Outlast it.", W / 2, H * 0.5, 15, "#cdeccf", "center", "bold"); ctx.globalAlpha = 1; }
        if (phase === "done") { var w = clamp(W * 0.78, 260, 430); panel(W / 2, H / 2, w, 130); text("IT SLIPS BACK UNDER", W / 2, H / 2 - 26, 19, "#8fd6a0", "center", "bold"); text("+60 points", W / 2, H / 2 + 6, 16, "#e0b25c", "center", "bold"); text("tap to sail on", W / 2, H / 2 + 36, 11.5, "rgba(244,231,201,.6)"); }
      }
    };
  }

  // ---------------------------------------------------------------- THE PALATINE LIGHT (M7, Rhode Island Sound)
  // A burning ghost ship crosses the sea. Keep clear — score for witnessing,
  // damage for getting too close.
  function PalatineScene() {
    var t = 0, dur = 12, ship = null, touched = false;
    return {
      debugWin: function () { t = dur - 0.1; },
      enter: function () {
        document.body.classList.add("playing"); G.pal = PALETTES[4];
        ship = { x: -80, y: H * rand(0.28, 0.48), sp: rand(70, 100) };
        if (chance(0.5)) spawnGull();
      },
      update: function (dt) {
        seaT += dt; t += dt; updateGulls(dt);
        helm(dt, 1, 0.4);
        ship.x += ship.sp * dt;
        if (chance(0.4)) spawn(ship.x + rand(-20, 20), ship.y + rand(-10, 10), { vy: -40, life: 0.6, r: rand(3, 7), c: choice(["#ff9a3a", "#ffcf6a", "#ff5a3a"]), shape: "smoke" });
        var px = G.shipX * W, py = shipYPx();
        if (!touched && Math.hypot(ship.x - px, ship.y - py) < 46) { touched = true; damage(1); shake(10); toast("You got too close to the Light."); }
        if (t >= dur) {
          if (!touched) { addScore(40); feat("palatine"); }
          setScene(Prompt("THE PALATINE LIGHT", "Block Island sailors still see her: a ship afire on the horizon, crewed by no one living. Some say she's the wreck that never stopped burning.", advance, touched ? "you got too close" : "witnessed, and recorded"));
        }
      },
      render: function () {
        drawSea(G.pal, seaT * 40, false);
        var glow = ctx.createRadialGradient(ship.x, ship.y, 4, ship.x, ship.y, 70);
        glow.addColorStop(0, "rgba(255,150,60,.55)"); glow.addColorStop(1, "rgba(255,150,60,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ship.x, ship.y, 70, 0, 7); ctx.fill();
        drawShip(ship.x, ship.y, 1.4, { hull: "#241512", sail: "rgba(255,220,180,.5)", flag: "#000", wake: false });
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (t < 2.4) { ctx.globalAlpha = clamp(2.4 - t, 0, 1); text("Keep clear of the Light. It's not really there. Probably.", W / 2, H * 0.5, 15, "#eafaff", "center", "bold"); ctx.globalAlpha = 1; }
      }
    };
  }

  // ---------------------------------------------------------------- THE OLD SOW (M9 tail, after the boss or "make for port")
  // The real giant whirlpool off Eastport, Maine, guarding the harbor mouth —
  // a full-screen force field on top of the shared helm; out-rowable at the
  // rim, not the core.
  function OldSowScene() {
    var phase = "intro", prompt = null, t = 0, dur = 14, sucked = false;
    var wp = { x: 0, y: 0, R: 0, k: 0.9 }, debris = [], spawnT = 0.6;
    return {
      debugWin: function () { phase = "spin"; t = dur; },
      enter: function () {
        document.body.classList.add("playing"); G.pal = PALETTES[3];
        wp.x = W * 0.5; wp.y = H * 0.4; wp.R = Math.max(W, H) * 0.6;
        prompt = Prompt("THE OLD SOW", "Off Eastport, Maine, the sea turns on itself — the largest whirlpool in the Western Hemisphere, guarding the harbor mouth. Row wide of the core and ride her rim home.", function () { phase = "spin"; }, "🌀 IT'S REAL — RECORDED IN THE LOG");
      },
      update: function (dt) {
        seaT += dt; updateGulls(dt);
        if (phase === "intro") { prompt.update(dt); return; }
        if (phase === "done") { if (consumeTap()) advance(); return; }
        t += dt;
        helm(dt, 0.85, 0.4, false);
        var px = G.shipX * W, py = shipYPx();
        if (!sucked) { if (applyWhirlpool(dt, wp, px, py)) sucked = true; }
        spawnT -= dt;
        if (spawnT <= 0) { spawnT = rand(0.5, 0.9); debris.push({ x: rand(0.1, 0.9) * W, y: -20, sp: rand(50, 90), r: rand(8, 16), a: 0, spin: rand(-2, 2) }); }
        for (var i = debris.length - 1; i >= 0; i--) { var o = debris[i]; o.y += o.sp * dt; o.a += o.spin * dt; if (o.y > H + 50) debris.splice(i, 1); }
        if (t >= dur || sucked) {
          phase = "done";
          if (sucked) { var toll = Math.floor(G.gold * 0.3); G.gold -= toll; toast("Into the harbor mouth."); }
          else { addScore(150); toast("Out-rowed the Old Sow!"); }
        }
      },
      render: function () {
        drawSea(G.pal, seaT * 40, false);
        if (phase !== "intro") drawWhirlpool(wp);
        for (var i = 0; i < debris.length; i++) { var o = debris[i]; ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a); ctx.fillStyle = "#8a5a34"; blob(o.r); ctx.restore(); }
        drawShip(G.shipX * W, shipYPx(), 1.6, playerShipOpts());
        drawParts(); drawHUD();
        if (phase === "intro") prompt.render();
        if (phase === "done") {
          var w = clamp(W * 0.78, 260, 430);
          panel(W / 2, H / 2, w, 150);
          text(sucked ? "THE HARBOR MOUTH" : "RODE THE RIM", W / 2, H / 2 - 30, 21, sucked ? "#e08c6a" : "#8fd6a0", "center", "bold");
          text(sucked ? "The chest is lighter, but you made port." : "+150 points", W / 2, H / 2 + 6, 15, "#e0b25c", "center", "bold");
          text("tap to make port", W / 2, H / 2 + 44, 11.5, "rgba(244,231,201,.6)");
        }
      }
    };
  }

  // ---------------------------------------------------------------- END / RESULTS / HARBOR
  function endRun(reachedEnd, sunk) {
    if (G.ended) return; G.ended = true;
    G.won = G.stormCleared;                            // beat the storm and the win is locked in
    G.sunkAtBoss = sunk && G.stormCleared;
    if (G.sunkAtBoss) G.gold = Math.floor(G.gold / 2); // the serpent takes its toll
    if (G.won) { G.score += 200 + G.hull * 40; addGold(50); }
    else {
      G.capped = true;
      if (G.reachedStorm) G.score = Math.min(G.score, G.preStormScore) + Math.floor(60 * G.stormT);   // storm progress still counts
    }
    G.score = Math.round(G.score * diff().score);      // harder seas pay better
    if (G.won && G.mode === "extreme" && !SAVE.extremeWon) { SAVE.extremeWon = true; G.unlockedInsane = true; }
    if (G.won && !SAVE.bellSeen) { SAVE.bellSeen = true; }   // the epilogue line, once the first career win lands
    G.rank = rankFor(G.score, G.won);
    var banked = G.gold;                               // the crew always saves the chest
    G.bankedGold = banked;
    SAVE.bank += banked;
    SAVE.runs++;
    if (G.won) SAVE.wins++;
    if (G.score > SAVE.best) SAVE.best = G.score;
    persist();
    G.curBeat = G.won ? "win" : "gameover";
    if (G.won) SFX.win(); else SFX.lose();
    setScene(ResultScene(sunk));
  }
  function rankFor(s, won) {
    if (won && G.mode === "insane") return G.bossBeaten ? "Lord of the Multiverse" : "Multiverse Menace";
    if (won && G.bossBeaten) return s >= 1600 ? "Legend of the Whydah" : "Serpent-Slayer";
    if (won) { if (s >= 1300) return "Legend of the Whydah"; if (s >= 950) return "Master Mariner"; return "Storm-Beater"; }
    if (s >= 900) return "Old Salt";
    if (s >= 600) return "Navigator";
    if (s >= 350) return "Able Seaman";
    if (s >= 180) return "Deckhand";
    return "Cabin Boy";
  }
  function ResultScene(sunk) {
    var t = 0;
    return {
      noPause: true,
      enter: function () { document.body.classList.remove("playing"); },
      update: function (dt) { seaT += dt; t += dt; updateGulls(dt); },
      render: function () {
        drawSea(G.won ? PALETTES[2] : STORM_PAL, seaT * 40, !G.won);
        drawParts();
        var w = clamp(W * 0.88, 300, 520), h = 330;
        panel(W / 2, H / 2, w, h);
        var title = G.won ? (G.sunkAtBoss ? "⚓ THE SERPENT'S TOLL" : "⚓ VOYAGE COMPLETE") : (sunk ? "☠ YOUR SHIP WENT DOWN" : "☠ LOST TO THE STORM");
        text(title, W / 2, H / 2 - h / 2 + 38, G.sunkAtBoss ? 21 : 24, G.won ? "#8fd6a0" : "#e08c6a", "center", "bold");
        if (G.won && G.bossBeaten) wrapText("You beat the storm AND the grandfather serpent. You made Maine. No crew in any tavern tale did more.", W / 2, H / 2 - h / 2 + 64, w - 50, 18, 12.5, "#cdeccf");
        else if (G.sunkAtBoss) wrapText("You beat the storm — that win is yours forever — but the serpent took the ship and half your gold at the harbor mouth. The crew rows ashore with the rest.", W / 2, H / 2 - h / 2 + 64, w - 50, 18, 12.5, "#cdeccf");
        else if (G.won) wrapText("You made Maine. The real crew never did. The storm took the Whydah at Cape Cod. Remember them.", W / 2, H / 2 - h / 2 + 64, w - 50, 18, 12.5, "#cdeccf");
        else if (G.reachedStorm) wrapText("The real Whydah sank right here. April 26, 1717. 146 aboard. Two men survived. You nearly had her through. Refit and try again.", W / 2, H / 2 - h / 2 + 64, w - 50, 18, 12.5, "#e8c1ae");
        else wrapText("The sea keeps what it takes. Your gold is banked with the crew ashore. Refit and sail again.", W / 2, H / 2 - h / 2 + 64, w - 50, 18, 12.5, "#e8c1ae");
        text(DIFF[G.mode].label + "  ·  Rank:  " + G.rank, W / 2, H / 2 - 26, 19, "#e0b25c", "center", "bold");
        text(String(G.score), W / 2, H / 2 + 22, 42, "#f4e7c9", "center", "bold");
        if (G.unlockedInsane) { ctx.globalAlpha = 0.7 + 0.3 * Math.sin(seaT * 4); text("🌀 INSANE MODE UNLOCKED — the multiverse calls", W / 2, H / 2 + 48, 13, "#ff9de2", "center", "bold"); ctx.globalAlpha = 1; }
        else if (G.capped) text(G.reachedStorm ? "Capped at the storm — storm progress banked as bonus points." : "Score capped at the storm. Beat it to break the cap.", W / 2, H / 2 + 48, 12, "#e08c6a");
        else if (G.won) text("Survivor bonus added. The cap is broken!", W / 2, H / 2 + 48, 12.5, "#8fd6a0");
        text("🪙 +" + (G.bankedGold || 0) + " banked   ·   Bank " + SAVE.bank + "   ·   Best " + SAVE.best, W / 2, H / 2 + 74, 13, "#f7d84a", "center", "bold");
        var bw = clamp(W * 0.34, 128, 168), by = H / 2 + h / 2 - 46;
        if (uiButton(W / 2 - bw - 8, by, bw, 42, "⚒ HARBOR", { size: 15, color: "#1f4a5e" })) setScene(HarborScene(true));
        if (uiButton(W / 2 + 8, by, bw, 42, "↺ SAIL AGAIN", { size: 15 })) startRun();
        if (t > 0.6 && consumeTap()) setScene(HarborScene(true));
      }
    };
  }
  function HarborScene(fromRun) {
    var msg = "";
    return {
      noPause: true,
      enter: function () { document.body.classList.remove("playing"); },
      update: function (dt) { seaT += dt; updateGulls(dt); },
      render: function () {
        drawSea(PALETTES[2], seaT * 25, false);
        drawShip(W * 0.5, H * 0.87, 1.9, playerShipOpts({ dmg: 0 }));
        var w = clamp(W * 0.92, 300, 560);
        var rows = UPG.length, rowH = clamp(H * 0.075, 44, 56), cols = 1;
        var h = 120 + rows * rowH;
        if (h > H * 0.8) { h = H * 0.8; rowH = (h - 110) / rows; }
        if (rowH < 34) {   // short screen: two columns, four rows
          cols = 2; rows = Math.ceil(UPG.length / 2);
          rowH = clamp((H * 0.8 - 110) / rows, 34, 56);
          h = 116 + rows * rowH;
        }
        var top = clamp(H * 0.08, 10, 60);
        panel(W / 2, top + h / 2, w, h);
        text("⚒  THE HARBOR", W / 2, top + 34, 22, "#e0b25c", "center", "bold");
        text("Bank: 🪙 " + SAVE.bank + (msg ? "   " + msg : ""), W / 2, top + 58, 14, "#f7d84a", "center", "bold");
        var colW = w / cols;
        for (var i = 0; i < UPG.length; i++) {
          var u = UPG[i], lvl = upgLvl(u.id), maxed = lvl >= u.max, cost = maxed ? 0 : u.cost[lvl];
          var col = cols === 2 ? i % 2 : 0, rowIdx = cols === 2 ? Math.floor(i / 2) : i;
          var rx = W / 2 - w / 2 + 16 + col * colW;
          var ry = top + 76 + rowIdx * rowH;
          text(u.icon + " " + u.name, rx + 4, ry + 16, cols === 2 ? 12.5 : 14, "#f4e7c9", "left", "bold");
          // pips
          for (var p = 0; p < u.max; p++) { ctx.fillStyle = p < lvl ? "#e0b25c" : "rgba(244,231,201,.2)"; ctx.beginPath(); ctx.arc(rx + 8 + p * 14, ry + 30, 5, 0, 7); ctx.fill(); }
          if (cols === 1) {
            ctx.font = "11px Georgia, serif"; ctx.fillStyle = "rgba(244,231,201,.7)"; ctx.textAlign = "left";
            var dw = w - 300; if (dw > 120) ctx.fillText(u.desc.length > dw / 5.4 ? u.desc.slice(0, Math.floor(dw / 5.4)) + "…" : u.desc, rx + 110, ry + 31);
            ctx.textAlign = "left";
          }
          var bw2 = cols === 2 ? 78 : 102, bh2 = rowH - 14;
          var bx = rx + colW - bw2 - 28;
          if (maxed) { uiButton(bx, ry + 2, bw2, bh2, "MAXED", { disabled: true, size: 12.5 }); }
          else if (uiButton(bx, ry + 2, bw2, bh2, "🪙 " + cost, { size: cols === 2 ? 12 : 13.5, color: SAVE.bank >= cost ? "#2c5e38" : "#5a4030" })) {
            if (SAVE.bank >= cost) { SAVE.bank -= cost; SAVE.upg[u.id] = lvl + 1; persist(); SFX.buy(); msg = u.name + " improved!"; }
            else { msg = "Not enough gold."; SFX.bad(); }
          }
        }
        var sy = top + h + 14;
        if (sy + 48 > H) sy = H - 54;
        if (uiButton(W / 2 - w / 2 + 6, sy, (w - 24) / 3, 46, "⛵ SKINS", { size: 14, color: "#4a3a5e" })) setScene(SkinScene());
        if (uiButton(W / 2 - (w - 24) / 6, sy, (w - 24) / 3, 46, "⚓ SET SAIL", { size: 15 })) startRun();
        if (uiButton(W / 2 + w / 2 - 6 - (w - 24) / 3, sy, (w - 24) / 3, 46, "📮 IDEAS", { size: 14, color: "#1f4a5e" })) {
          var sug = null;
          try { sug = window.prompt("What should we add to Whydah’s Voyage? Your idea is sent to Mr. Howe's suggestion log."); } catch (e3) {}
          if (sug && sug.trim()) {
            var idea = sug.trim().slice(0, 500);
            // keep a local copy so nothing is lost if the network hiccups, then
            // send it to the class suggestion log on Supabase
            if (!SAVE.suggestions) SAVE.suggestions = [];
            SAVE.suggestions.push({ t: idea, d: new Date().toISOString().slice(0, 10) });
            if (SAVE.suggestions.length > 100) SAVE.suggestions.shift();
            persist();
            msg = "Sending your idea…";
            sendSuggestion(idea, function (ok) {
              if (ok) { SFX.win(); msg = "Idea sent to the crew's log. Thank you! 📮"; }
              else { SFX.good(); msg = "Saved on this ship — we'll send it when the wind's up. 📮"; }
            });
          }
        }
        if (SAVE.suggestions && SAVE.suggestions.length) {
          text(SAVE.suggestions.length + " idea" + (SAVE.suggestions.length === 1 ? "" : "s") + " sent from this ship", W / 2 + w / 2 - 6 - (w - 24) / 6, sy + 58, 10, "rgba(244,231,201,.6)", "center");
        }
      }
    };
  }

  // ---------------------------------------------------------------- MERCHANT HAIL
  // A trading brig heaves to alongside mid-mission. Three deals from a
  // rotating stock — repairs, powder, intel, or cargo that pays out double
  // at the next port (real risk: sink before port and the cargo goes down
  // with the chest). One tap through if you'd rather keep sailing.
  function MerchantScene() {
    var msg = "", bought = {};
    var STOCK = [
      { id: "carpenter", icon: "🔨", name: "Ship's carpenter", desc: "Repair 2 hull", cost: 30, can: function () { return G.hull < G.maxHull; }, buy: function () { repair(2); return "The carpenter knocks her back together."; } },
      { id: "stores",    icon: "🍋", name: "Fresh stores",     desc: "Repair 1 hull", cost: 15, can: function () { return G.hull < G.maxHull; }, buy: function () { repair(1); return "Limes and greens. The crew perks up."; } },
      { id: "powder",    icon: "🧨", name: "Fine powder",      desc: "Next fight: shots hit harder", cost: 30, can: function () { return true; }, buy: function () { G.mods.drill = true; return "Dry, fast-burning, beautiful powder."; } },
      { id: "intel",     icon: "🗺", name: "Weather gossip",   desc: "Shorter storm at the cape", cost: 25, can: function () { return true; }, buy: function () { G.mods.warned = true; return "'Nor'easter brewing. Keep her trim.'"; } },
      { id: "tea",       icon: "📦", name: "Tea cargo",        desc: "Pays 🪙 80 at your next port", cost: 40, can: function () { return true; }, buy: function () { G.cargo += 80; return "Crates of tea below decks."; } },
      { id: "spice",     icon: "🌶", name: "Spice cargo",      desc: "Pays 🪙 130 at your next port", cost: 65, can: function () { return true; }, buy: function () { G.cargo += 130; return "The hold smells incredible."; } },
      { id: "crate",     icon: "❓", name: "A sealed crate",   desc: "Could be anything", cost: 25, can: function () { return true; }, buy: function () {
          var roll = Math.random();
          if (roll < 0.3) { addGold(60); return "Silver plate! +60 🪙"; }
          if (roll < 0.55) { addScore(40); return "Charts of the whole coast. +40 ⚑"; }
          if (roll < 0.8) { repair(1); return "Rum and fresh oakum. +1 ♥"; }
          return "It is full of extremely confident crabs. They leave.";
        } },
      { id: "yarn",      icon: "🍺", name: "Buy a round",      desc: "Hear the news (+15 ⚑)", cost: 10, can: function () { return true; }, buy: function () { addScore(15); return "Half of it is even true."; } }
    ];
    var deals = shuffle(STOCK.slice()).slice(0, 3);
    return {
      noPause: true,
      enter: function () { document.body.classList.remove("playing"); },
      update: function (dt) { seaT += dt; updateGulls(dt); },
      render: function () {
        drawSea(G.pal || PALETTES[1], seaT * 20, false);
        drawShip(W * 0.3, H * 0.85, 1.6, playerShipOpts({ dmg: 0 }));
        drawShip(W * 0.7, H * 0.85, 1.5, { rot: Math.PI * 0.06, hull: "#3d3a2f", deck: "#5e5a44", sail: "#efe6cc", flag: "#b98f20", wake: false, phase: 2 });
        var w = clamp(W * 0.88, 300, 520), rowH = clamp(H * 0.09, 52, 64);
        var h = 128 + 3 * rowH;
        var top = clamp(H * 0.05, 8, 40);
        panel(W / 2, top + h / 2, w, h);
        text("🏳 A MERCHANT HEAVES TO", W / 2, top + 30, 18, "#e0b25c", "center", "bold");
        text(insane() ? "The merchant is a completely ordinary trading brig. Suspicious." : "\"Trade, captain? Coin on the barrel, no questions either way.\"", W / 2, top + 52, 11.5, "rgba(244,231,201,.75)", "center");
        text("🪙 " + G.gold + (G.cargo ? "   📦 cargo aboard: pays " + G.cargo + " at port" : "") + (msg ? "   " + msg : ""), W / 2, top + 72, 12, "#f7d84a", "center", "bold");
        for (var i = 0; i < deals.length; i++) {
          var dl = deals[i], ry = top + 88 + i * rowH;
          var usable = dl.can() && !bought[dl.id];
          text(dl.icon + " " + dl.name, W / 2 - w / 2 + 20, ry + 18, 14, usable ? "#f4e7c9" : "rgba(244,231,201,.4)", "left", "bold");
          text(dl.desc, W / 2 - w / 2 + 20, ry + 36, 11, usable ? "rgba(244,231,201,.7)" : "rgba(244,231,201,.35)", "left");
          var bw2 = 96;
          if (bought[dl.id]) uiButton(W / 2 + w / 2 - bw2 - 16, ry + 6, bw2, rowH - 18, "SOLD", { disabled: true, size: 12 });
          else if (uiButton(W / 2 + w / 2 - bw2 - 16, ry + 6, bw2, rowH - 18, "🪙 " + dl.cost, { size: 13, disabled: !dl.can(), color: G.gold >= dl.cost ? "#2c5e38" : "#5a4030" })) {
            if (G.gold >= dl.cost) { G.gold -= dl.cost; bought[dl.id] = true; msg = dl.buy(); SFX.buy(); }
            else { msg = "Not enough gold aboard."; SFX.bad(); }
          }
        }
        var sy = top + h + 12;
        if (sy + 44 > H) sy = H - 50;
        if (uiButton(W / 2 - 80, sy, 160, 42, "⚓ SAIL ON", { size: 15 })) advance();
      }
    };
  }

  // ---------------------------------------------------------------- SHIP SKINS
  // Cosmetic liveries earned by playing. "auto" keeps the classic behavior
  // (your ship, then the Whydah once she's taken); everything else overrides.
  var SHIP_SKINS = [
    { id: "auto",    name: "The Sultana",       desc: "Your first command — becomes the Whydah when you take her.", unlock: function () { return true; }, opts: {} },
    { id: "gilded",  name: "The Gilded Gally",  desc: "Win a voyage.", unlock: function () { return SAVE.wins >= 1; }, opts: { hull: "#6a4a1a", deck: "#8a6a2a", trim: "#f7d84a", sail: "#fdf2d0", flag: "#f7d84a" } },
    { id: "night",   name: "The Night Runner",  desc: "Beat the Mooncusser's gauntlet.", unlock: function () { return SAVE.feats && SAVE.feats.mooncusser; }, opts: { hull: "#1a2230", deck: "#2a3648", sail: "#3a4a62", flag: "#0e141e", trim: "#7fd6ea" } },
    { id: "tooth",   name: "The Sharktooth",    desc: "Bring down the Sharknado.", unlock: function () { return SAVE.feats && SAVE.feats.sharknado; }, opts: { hull: "#4a5c66", deck: "#5e7280", sail: "#dfe9ee", flag: "#e05c5c" } },
    { id: "crimson", name: "The Crimson Corsair", desc: "Sink the Hunter's Flagship.", unlock: function () { return SAVE.feats && SAVE.feats.flagship; }, opts: { hull: "#5e1a1a", deck: "#7a2a2a", sail: "#e8c1ae", flag: "#c73a3a", trim: "#f7d84a" } },
    { id: "ghost",   name: "The Palatine",      desc: "Witness the ghost light — and keep your distance.", unlock: function () { return SAVE.feats && SAVE.feats.palatine; }, opts: { hull: "#241512", deck: "#3a2a24", sail: "rgba(255,220,180,.55)", flag: "#000" } },
    { id: "serpent", name: "The Serpent's Wake", desc: "Drive off the Cape Cod serpent.", unlock: function () { return SAVE.feats && SAVE.feats.serpent; }, opts: { hull: "#2f6b4a", deck: "#3c7f58", sail: "#d6ffd0", flag: "#245239" } },
    { id: "duck",    name: "The Rubber Ducky",  desc: "Speak the secret word.", unlock: function () { return SAVE.secretUnlock; }, opts: { hull: "#f7d84a", deck: "#ffe27a", sail: "#fff6d6", flag: "#e08c2a" } },
    { id: "goodboy", name: "The Good Boy",      desc: "Befriend PUGNAROK.", unlock: function () { return SAVE.feats && SAVE.feats.pugnarok; }, opts: { hull: "#c9905a", deck: "#e8c087", sail: "#fff3dc", flag: "#ff8a9a", trim: "#4a3020" } }
  ];
  function currentSkin() {
    for (var i = 0; i < SHIP_SKINS.length; i++) if (SHIP_SKINS[i].id === SAVE.skin && SHIP_SKINS[i].unlock()) return SHIP_SKINS[i];
    return SHIP_SKINS[0];
  }
  function SkinScene() {
    var msg = "";
    return {
      noPause: true,
      enter: function () { document.body.classList.remove("playing"); },
      update: function (dt) { seaT += dt; updateGulls(dt); },
      render: function () {
        drawSea(PALETTES[1], seaT * 25, false);
        var w = clamp(W * 0.92, 300, 560);
        var rowH = clamp(H * 0.075, 40, 52), rows = SHIP_SKINS.length;
        var h = 110 + rows * rowH;
        if (h > H * 0.86) { h = H * 0.86; rowH = (h - 100) / rows; }
        var top = clamp(H * 0.05, 8, 40);
        panel(W / 2, top + h / 2, w, h);
        text("⛵  SHIP LIVERIES", W / 2, top + 30, 20, "#e0b25c", "center", "bold");
        text(msg || "earn them by sailing — pick any you've unlocked", W / 2, top + 52, 11.5, "rgba(244,231,201,.7)", "center");
        for (var i = 0; i < SHIP_SKINS.length; i++) {
          var sk = SHIP_SKINS[i], open2 = sk.unlock(), sel = (SAVE.skin || "auto") === sk.id;
          var ry = top + 70 + i * rowH;
          ctx.save(); ctx.translate(W / 2 - w / 2 + 34, ry + rowH / 2 - 4); ctx.scale(0.62, 0.62);
          if (open2) drawShip(0, 0, 1.4, Object.assign({ wake: false, dmg: 0, flag: "#111" }, sk.opts));
          else { ctx.globalAlpha = 0.25; drawShip(0, 0, 1.4, { wake: false, dmg: 0, hull: "#444", deck: "#555", sail: "#666", flag: "#333" }); ctx.globalAlpha = 1; }
          ctx.restore();
          text(open2 ? sk.name : "🔒 ???", W / 2 - w / 2 + 66, ry + rowH / 2 - 4, 13.5, open2 ? "#f4e7c9" : "rgba(244,231,201,.4)", "left", "bold");
          text(sk.desc, W / 2 - w / 2 + 66, ry + rowH / 2 + 12, 10.5, open2 ? "rgba(244,231,201,.65)" : "rgba(244,231,201,.35)", "left");
          var bw2 = 92;
          if (sel) uiButton(W / 2 + w / 2 - bw2 - 16, ry + 4, bw2, rowH - 12, "FLYING", { disabled: true, size: 12 });
          else if (open2 && uiButton(W / 2 + w / 2 - bw2 - 16, ry + 4, bw2, rowH - 12, "HOIST", { size: 12.5, color: "#2c5e38" })) { SAVE.skin = sk.id; persist(); SFX.buy(); msg = sk.name + " hoisted!"; }
        }
        var sy = top + h + 12;
        if (sy + 44 > H) sy = H - 50;
        if (uiButton(W / 2 - 70, sy, 140, 40, "⚒ HARBOR", { size: 14, color: "#1f4a5e" })) setScene(HarborScene(false));
      }
    };
  }

  // ---------------------------------------------------------------- PORT CALLS (between missions)
  // A compact refit stop after every mission but the last. The gold you've
  // earned since the last port banks the moment you arrive — dying later only
  // costs what you've made since. Buying Oak Timbers here helps immediately.
  var PORT_NAMES = ["Nassau", "Eleuthera", "Charles Town Lights", "Ocracoke", "Hampton Roads", "Montauk", "Block Island", "Provincetown", "Race Point"];
  function PortScene() {
    var mi = G.mIndex, portName = PORT_NAMES[clamp(mi, 0, PORT_NAMES.length - 1)];
    var msg = "";
    return {
      noPause: true,
      enter: function () {
        document.body.classList.remove("playing");
        if (G.cargo > 0) { G.gold += G.cargo; toast("📦 Cargo sold at " + portName + "! +" + G.cargo + " 🪙"); SFX.coin(); G.cargo = 0; }   // merchant cargo pays out here
        if (G.gold > 0) { SAVE.bank += G.gold; G.gold = 0; persist(); }   // the purser banks the chest the moment you tie up
      },
      update: function (dt) { seaT += dt; updateGulls(dt); },
      render: function () {
        drawSea(PALETTES[2], seaT * 25, false);
        drawShip(W * 0.5, H * 0.87, 1.7, playerShipOpts({ dmg: 0 }));
        var w = clamp(W * 0.92, 300, 560);
        var rows = UPG.length, rowH = clamp(H * 0.068, 38, 48), cols = 1;
        var h = 106 + rows * rowH;
        if (h > H * 0.76) { h = H * 0.76; rowH = (h - 98) / rows; }
        if (rowH < 30) { cols = 2; rows = Math.ceil(UPG.length / 2); rowH = clamp((H * 0.76 - 98) / rows, 30, 48); h = 102 + rows * rowH; }
        var top = clamp(H * 0.05, 8, 36);
        panel(W / 2, top + h / 2, w, h);
        text("⚓  PUT IN AT " + portName.toUpperCase(), W / 2, top + 28, 18, "#e0b25c", "center", "bold");
        text("Bank: 🪙 " + SAVE.bank + (msg ? "   " + msg : ""), W / 2, top + 49, 12.5, "#f7d84a", "center", "bold");
        var colW = w / cols;
        for (var i = 0; i < UPG.length; i++) {
          var u = UPG[i], lvl = upgLvl(u.id), maxed = lvl >= u.max, cost = maxed ? 0 : u.cost[lvl];
          var col = cols === 2 ? i % 2 : 0, rowIdx = cols === 2 ? Math.floor(i / 2) : i;
          var rx = W / 2 - w / 2 + 16 + col * colW;
          var ry = top + 64 + rowIdx * rowH;
          text(u.icon + " " + u.name, rx + 4, ry + 14, cols === 2 ? 11.5 : 13, "#f4e7c9", "left", "bold");
          for (var p = 0; p < u.max; p++) { ctx.fillStyle = p < lvl ? "#e0b25c" : "rgba(244,231,201,.2)"; ctx.beginPath(); ctx.arc(rx + 8 + p * 12, ry + 26, 4, 0, 7); ctx.fill(); }
          var bw2 = cols === 2 ? 72 : 94, bh2 = rowH - 12;
          var bx = rx + colW - bw2 - 24;
          if (maxed) { uiButton(bx, ry, bw2, bh2, "MAXED", { disabled: true, size: 11 }); }
          else if (uiButton(bx, ry, bw2, bh2, "🪙 " + cost, { size: cols === 2 ? 10.5 : 12, color: SAVE.bank >= cost ? "#2c5e38" : "#5a4030" })) {
            if (SAVE.bank >= cost) {
              SAVE.bank -= cost; SAVE.upg[u.id] = lvl + 1;
              if (u.id === "hull") { G.maxHull++; G.hull++; }   // takes hold immediately, mid-voyage
              persist(); SFX.buy(); msg = u.name + " improved!";
            } else { msg = "Not enough gold."; SFX.bad(); }
          }
        }
        var sy = top + h + 12;
        if (sy + 44 > H) sy = H - 50;
        if (uiButton(W / 2 - 90, sy, 180, 42, "⚓ SAIL ON", { size: 15.5 })) advance();
      }
    };
  }

  // ---------------------------------------------------------------- boot / loop
  function startRun(fromMission) {
    newGame(fromMission);
    if (fromMission) G.score = 80 * fromMission;   // a resumed voyage isn't scored from zero, but never double-counts a prior run
    G.seqIndex = -1; advance();
  }

  var last = 0;
  function loop(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (!paused) {
      stepFade(dt);
      updateTimers(dt);
      if (G && G.iframes > 0) G.iframes -= dt;
      updateCombo(dt);
      // the outgoing scene freezes while fading out — no double-advances, no
      // gameplay happening under a black screen
      if (scene && scene.update && !pendingScene) scene.update(dt);
      updateParts(dt);
    }
    ctx.save();
    if (!paused && shakeAmt > 0) { ctx.translate(rand(-shakeAmt, shakeAmt), rand(-shakeAmt, shakeAmt)); shakeAmt = Math.max(0, shakeAmt - dt * 40); }
    if (scene && scene.render) scene.render();
    if (!paused && redFlash > 0) { redFlash -= dt; ctx.fillStyle = "rgba(200,40,30," + clamp(redFlash * 2.2, 0, 0.33) + ")"; ctx.fillRect(0, 0, W, H); }
    drawFade();
    drawToasts(paused ? 0 : dt);
    if (paused) drawPauseOverlay();
    ctx.restore();
    input.pPressed = false; input.firePressed = false; input.leftPressed = false; input.rightPressed = false;
    requestAnimationFrame(loop);
  }

  var muteBtn = document.getElementById("btn-mute");
  if (muteBtn) muteBtn.addEventListener("click", function () { muted = !muted; muteBtn.textContent = muted ? "🔇" : "🔊"; if (!muted) audio(); });
  var pauseBtn = document.getElementById("btn-pause");
  if (pauseBtn) pauseBtn.addEventListener("click", function () { togglePause(); });

  // boot
  resize(); seedCoast(); newGame(); setScene(TitleScene());

  // ---------------------------------------------------------------- debug API (inert unless the page sets __FS_DEBUG)
  if (window.__FS_DEBUG) {
    window.__fsAPI = {
      state: function () { return G ? { beat: G.curBeat, score: G.score, gold: G.gold, hull: G.hull, maxHull: G.maxHull, prog: +Number(G.progress || 0).toFixed(2), mIndex: G.mIndex, mFrac: +Number(G.mFrac || 0).toFixed(3), shipX: +Number(G.shipX || 0).toFixed(3), shipY: +Number(G.shipY || 0).toFixed(3), mode: G.mode, won: G.won, capped: G.capped, rank: G.rank, bank: SAVE.bank, events: G.events, route: G.route, bossBeaten: G.bossBeaten, stormCleared: G.stormCleared, combo: G.combo, comboBest: G.comboBest, special: +Number(G.special || 0).toFixed(2), blastReady: (G.special || 0) >= 1 } : null; },
      combo: function () { return G ? { combo: G.combo, best: G.comboBest, comboT: +Number(G.comboT || 0).toFixed(2), special: +Number(G.special || 0).toFixed(2), ready: (G.special || 0) >= 1, ships: G.shipsBeaten } : null; },
      charge: function (v) { if (G) { G.special = clamp(v == null ? 1 : v, 0, 1); if (G.special >= 1) G.blastReady = true; } return G ? G.special : 0; },
      blast: function () { if (G) G.blastReq = true; },
      simHits: function (n) { for (var i = 0; i < (n || 1); i++) { comboHit(W / 2, H / 2); addScore(comboMult()); } return { combo: G.combo, special: +Number(G.special).toFixed(2) }; },
      simStep: function () { var landed = 0; var balls = [{ x: 100, y: 100, vy: 0, own: 1 }]; var before = G.combo; stepBalls(balls, 0.016, [{ x: 100, y: 100, r: 30, onHit: function () { landed++; } }], null); return { onHitRan: landed, comboDelta: G.combo - before, culled: balls.length === 0 }; },
      start: function (fromMission) { startRun(fromMission); flushFade(); },
      skip: function () { flushFade(); advance(); flushFade(); },
      toStorm: function () { flushFade(); for (var i = G.seq.length - 1; i >= 0; i--) if (G.seq[i].kind === "storm") { G.seqIndex = i - 1; advance(); flushFade(); return; } },
      toBoss: function () { flushFade(); G.stormCleared = true; G.reachedStorm = true; for (var i = G.seq.length - 1; i >= 0; i--) if (G.seq[i].kind === "boss") { G.seqIndex = i - 1; advance(); flushFade(); return; } },
      toSquadron: function () { flushFade(); for (var i = G.seq.length - 1; i >= 0; i--) if (G.seq[i].kind === "squadron") { G.seqIndex = i - 1; advance(); flushFade(); return; } },
      toMission: function (n) { flushFade(); for (var i = 0; i < G.seq.length; i++) if (G.seq[i].kind === "missionIntro" && G.seq[i].m === n) { G.seqIndex = i - 1; advance(); flushFade(); return; } },
      flushFade: function () { flushFade(); },
      missionState: function () { return { mIndex: G.mIndex, mFrac: +Number(G.mFrac || 0).toFixed(3), name: missionName() }; },
      setRoute: function (r) { G.route = r; rerollEvents(r); },
      setMode: function (m) { if (DIFF[m]) { SAVE.mode = m; persist(); } return SAVE.mode; },
      unlock: function () { SAVE.extremeWon = true; SAVE.secretUnlock = true; persist(); },
      hurt: function (n) { damage(n || 1); },
      winStorm: function () { G.stormCleared = true; endRun(true, false); },
      winScene: function () { if (scene && scene.debugWin) scene.debugWin(); },
      skinInfo: function () { return { insane: insane(), mutators: G ? (G.mutators || []) : [], chaos: G ? G.chaosNow || null : null }; },
      skins: function () { return SHIP_SKINS.map(function (s) { return { id: s.id, name: s.name, open: !!s.unlock() }; }); },
      grantFeat: function (id) { feat(id); },
      setSkin: function (id) { SAVE.skin = id; persist(); return currentSkin().id; },
      suggest: function (txt) { if (!SAVE.suggestions) SAVE.suggestions = []; SAVE.suggestions.push({ t: String(txt).slice(0, 200), d: new Date().toISOString().slice(0, 10) }); persist(); return SAVE.suggestions.length; },
      suggestSend: function (txt) { sendSuggestion(String(txt), function () {}); },
      newRun: function (fromMission) { startRun(fromMission); flushFade(); },
      buildSeq: function (fromMission) { newGame(fromMission); return G.seq.map(function (b) { return "m" + b.m + ":" + b.kind + (b.ev ? ":" + b.ev.id : "") + (b.which ? ":" + b.which : ""); }); },
      choose: function (i) { if (scene && scene.debugChoose) scene.debugChoose(i); },
      gold: function (n) { SAVE.bank += n; persist(); },
      buy: function (id) { var lvl = upgLvl(id); var u = null; for (var i = 0; i < UPG.length; i++) if (UPG[i].id === id) u = UPG[i]; if (!u || lvl >= u.max) return "no"; SAVE.bank -= u.cost[lvl]; SAVE.upg[id] = lvl + 1; persist(); return SAVE.upg[id]; },
      save: function () { return JSON.parse(JSON.stringify(SAVE)); },
      wipe: function () { try { localStorage.removeItem("firstsail-save-v3"); } catch (e) {} SAVE = { bank: 0, best: 0, wins: 0, runs: 0, sndHint: 0, seen: {}, mode: "hard", extremeWon: false, secretUnlock: false, feats: {}, skin: "auto", suggestions: [], furthest: 0, furthestInsane: 0, prologueDone: false, whydahTaken: false, bellSeen: false, upg: { hull: 0, pumps: 0, shot: 0, nest: 0, helm: 0, charm: 0, canvas: 0, guns: 0 } }; },
      toHarbor: function () { setScene(HarborScene(false)); },
      pause: function (v) { setPause(v); return paused; },
      isPaused: function () { return paused; },
      forceLegMod: function (k) {
        var FORCE = {
          fog: { fog: true }, night: { night: true }, current: { current: 1 },
          narrows: { narrows: true, mooncusser: false }, mooncusser: { narrows: true, mooncusser: true },
          waterspout: { waterspout: 1 }, whirlpool: { whirlpool: 1 }
        };
        G.forceLegMod = FORCE[k] || null;
      },
      err: function () { return window.__err ? window.__err.slice(0, 6) : []; }
    };
  }

  requestAnimationFrame(loop);

})();
