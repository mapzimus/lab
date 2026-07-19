/*
 * Black Sam & the Whydah — mini-games
 *
 * window.MINIGAMES maps a game name to { mount(container, opts, onDone) }.
 * Each game renders into `container`, runs self-contained (keyboard, mouse
 * and touch all work), and calls onDone({ success, score }) exactly once.
 * The engine routes the story on that result. Games are short (20–40s).
 *
 * mount() returns { cancel() } so the caller can abandon a game in
 * progress (e.g. the player hits "Start Over" mid-round) without a
 * stray requestAnimationFrame loop, timer or global key/pointer listener
 * surviving to fire onDone() later against a completely different game
 * session. cancel() tears down all of that and guarantees onDone never
 * fires again for that mount.
 */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function sfx(name) {
    if (window.SFX && window.SFX[name]) window.SFX[name]();
  }

  function pickFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Guards a game's onDone so it fires at most once, and never after cancel().
  function makeDone(onDone) {
    var fired = false;
    var cancelled = false;
    var wrapped = function (r) {
      if (fired || cancelled) return;
      fired = true;
      onDone(r);
    };
    wrapped.cancel = function () { cancelled = true; };
    return wrapped;
  }

  window.MINIGAMES = {

    /* ------------------------------------------------------------------
     * TREASURE DIG — 5×5 grid, limited shovels, find buried silver.
     * Misses tell you if you're getting warm (a treasure is in one of
     * the 8 neighbouring cells), so sharp players can hunt instead of
     * guessing blindly.
     * opts: { targets: 5, shovels: 9, winAt: 3 }
     * ---------------------------------------------------------------- */
    dig: {
      mount: function (container, opts, onDone) {
        opts = opts || {};
        var SIZE = 5;
        var targets = opts.targets || 5;
        var shovels = opts.shovels || 9;
        var winAt = opts.winAt || 3;
        var found = 0, used = 0, findStreak = 0;
        var done = makeDone(onDone);
        var timers = [];

        // Scatter treasure cells. Re-scatter until the caches spread across
        // at least 3 rows AND 3 columns — one cruel clump in a corner makes
        // the warm-sand trail useless, and that's luck, not skill.
        var treasure = {};
        (function scatter() {
          for (var attempt = 0; attempt < 24; attempt++) {
            treasure = {};
            var cells = [];
            for (var i = 0; i < SIZE * SIZE; i++) cells.push(i);
            var rows = {}, cols = {}, nRows = 0, nCols = 0;
            for (var t = 0; t < targets; t++) {
              var pick = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
              treasure[pick] = true;
              var rr = Math.floor(pick / SIZE), cc = pick % SIZE;
              if (!rows[rr]) { rows[rr] = true; nRows++; }
              if (!cols[cc]) { cols[cc] = true; nCols++; }
            }
            if (targets < 3 || (nRows >= 3 && nCols >= 3)) return;
          }
        })();

        // How many treasures lie in the 8 cells around idx?
        function warmth(idx) {
          var r = Math.floor(idx / SIZE), c = idx % SIZE;
          var n = 0;
          for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
              if (!dr && !dc) continue;
              var rr = r + dr, cc = c + dc;
              if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
              if (treasure[rr * SIZE + cc]) n++;
            }
          }
          return n;
        }

        var COLD_FINDS = [
          "You dig up a very old boot. The sand here is cold.",
          "You find an extremely surprised clam. Cold sand.",
          "A crab glares at you and scuttles off. Nothing here.",
          "You unearth somebody's lost spoon. Not silver. Just a spoon.",
          "Sand, sand, and more sand. Cold as a fish's handshake."
        ];

        var wrap = el("div", "mg mg-dig");
        wrap.appendChild(el("p", "mg-instructions",
          "The sand hides what the Spanish divers missed. You have <strong>" + shovels +
          "</strong> shovel-strokes to raise <strong>" + winAt + "</strong> caches of silver. " +
          "Misses aren't wasted — <strong>warm sand</strong> means treasure is buried right next door!"));
        var hud = el("div", "mg-hud");
        var hudShovels = el("span", "mg-stat", "");
        var hudFound = el("span", "mg-stat", "");
        hud.appendChild(hudShovels); hud.appendChild(hudFound);
        wrap.appendChild(hud);
        var grid = el("div", "mg-grid");
        wrap.appendChild(grid);
        var msg = el("p", "mg-msg", "");
        wrap.appendChild(msg);
        container.appendChild(wrap);

        function refreshHud() {
          hudShovels.innerHTML = "&#9935; Shovels: <strong>" + (shovels - used) + "</strong>";
          hudFound.innerHTML = "&#9863; Silver: <strong>" + found + "/" + winAt + "</strong>";
        }
        refreshHud();

        function finish(success) {
          grid.classList.add("mg-locked");
          var left = shovels - used;
          if (success) {
            msg.textContent = left >= 2
              ? "All " + winAt + " caches with strokes to spare! Try to look casual on the way back to the boat."
              : left === 1
                ? "Silver! Actual silver! Try to look casual on the way back to the boat."
                : "The very last stroke of the very last shovel — and there it is. Silver!";
          } else {
            msg.textContent = found === winAt - 1
              ? "One cache short! It's down there somewhere — but the tide and the sentries are coming."
              : found > 0
                ? "The tide is coming in, and so are the sentries. Time to go."
                : "Nothing tonight but boots and indignant clams. The tide is coming in — time to go.";
          }
          timers.push(setTimeout(function () { done({ success: success, score: found }); }, 1000));
        }

        for (var c = 0; c < SIZE * SIZE; c++) {
          (function (idx) {
            var cell = el("button", "mg-cell", "");
            cell.setAttribute("aria-label", "Dig here");
            cell.addEventListener("click", function () {
              if (cell.disabled || used >= shovels) return;
              cell.disabled = true;
              used++;
              if (treasure[idx]) {
                found++;
                cell.classList.add("mg-cell-hit");
                cell.innerHTML = "&#9863;";
                msg.textContent = findStreak >= 1
                  ? "ANOTHER one! Two strikes running — your shovel has the scent now."
                  : "CLUNK. That is the beautiful sound of not-a-rock.";
                findStreak++;
                sfx("coins");
              } else {
                findStreak = 0;
                var w = warmth(idx);
                if (w >= 2) {
                  cell.classList.add("mg-cell-warm");
                  cell.innerHTML = "&#9832;&#9832;";
                  msg.textContent = "The sand here is downright HOT — silver on more than one side!";
                  sfx("dig");
                } else if (w === 1) {
                  cell.classList.add("mg-cell-warm");
                  cell.innerHTML = "&#9832;";
                  msg.textContent = "The sand feels warm here... something is buried right next door!";
                  sfx("dig");
                } else {
                  cell.classList.add("mg-cell-miss");
                  cell.innerHTML = "&#183;";
                  msg.textContent = pickFrom(COLD_FINDS);
                  sfx("dig");
                }
              }
              refreshHud();
              if (found >= winAt) return finish(true);
              if (used >= shovels) return finish(false);
              if (shovels - used === 1) {
                msg.textContent += " One stroke left — make it count!";
                hudShovels.style.color = "#a03322";
                sfx("bell");
              }
            });
            grid.appendChild(cell);
          })(c);
        }

        return {
          cancel: function () {
            done.cancel();
            timers.forEach(clearTimeout);
          }
        };
      }
    },

    /* ------------------------------------------------------------------
     * SWORD FIGHT — timing bar; land the strike inside the gold window.
     * The bar speeds up every round, the very centre of the gold counts
     * as a PERFECT hit, and the enemy mate taunts you when you miss.
     * opts: { rounds: 3, winAt: 2, speed: 1 }
     * ---------------------------------------------------------------- */
    duel: {
      mount: function (container, opts, onDone) {
        opts = opts || {};
        var rounds = opts.rounds || 3;
        var winAt = opts.winAt || 2;
        var baseSpeed = (opts.speed || 1) * 1.35; // bar sweeps per second
        var speed = baseSpeed;
        var round = 0, hits = 0, perfects = 0, perfectStreak = 0;
        var done = makeDone(onDone);
        var timers = [];
        var raf = null, dir = 1, pos = 0, lastTs = null, live = false;

        var TAUNTS = [
          "“My grandmother swings harder, and she’s a librarian!” the mate laughs.",
          "“Is that a sword or a butter knife?” he hoots.",
          "“You fight like a farmer!” he cries. (Rude. Farmers work hard.)",
          "“I’ve been threatened by angrier seagulls!” he cackles."
        ];
        var GRUDGES = [
          "The mate stops laughing. That one stung.",
          "“Lucky swing,” the mate mutters, checking his sleeve.",
          "The mate’s grin is starting to look like hard work."
        ];

        var wrap = el("div", "mg mg-duel");
        wrap.appendChild(el("p", "mg-instructions",
          "Steel rings on steel! Strike when the blade crosses the <strong>gold</strong> — " +
          winAt + " clean hits out of " + rounds + " win the deck. Nail the very centre for a <strong>PERFECT</strong> hit. " +
          "And be quick: he gets faster every round. <em>(Tap, click, or press Space.)</em>"));
        var hud = el("div", "mg-hud");
        var hudRound = el("span", "mg-stat", "");
        var hudHits = el("span", "mg-stat", "");
        hud.appendChild(hudRound); hud.appendChild(hudHits);
        wrap.appendChild(hud);

        var bar = el("div", "mg-bar");
        var zone = el("div", "mg-bar-zone");
        var perfect = el("div", "mg-bar-perfect");
        var needle = el("div", "mg-bar-needle");
        bar.appendChild(zone); bar.appendChild(perfect); bar.appendChild(needle);
        wrap.appendChild(bar);
        var btn = el("button", "mg-action", "Strike!");
        wrap.appendChild(btn);
        var msg = el("p", "mg-msg", "");
        wrap.appendChild(msg);
        container.appendChild(wrap);

        // Gold window: random slice 18% wide; perfect zone is its middle 40%.
        var zoneStart = 0, zoneWidth = 18, prevCenter = -100;
        function newRound() {
          round++;
          speed = baseSpeed * (1 + (round - 1) * 0.18); // he gets faster
          // Keep the gold clear of the bounce edges (where the needle
          // double-passes and timing turns to luck), pushing it further in
          // as he speeds up — and never re-deal it in last round's spot.
          var margin = 22 + Math.min(6, (round - 1) * 3);
          for (var a = 0; a < 12; a++) {
            zoneStart = margin + Math.random() * (100 - 2 * margin - zoneWidth);
            if (Math.abs((zoneStart + zoneWidth / 2) - prevCenter) >= 14) break;
          }
          prevCenter = zoneStart + zoneWidth / 2;
          zone.style.left = zoneStart + "%";
          zone.style.width = zoneWidth + "%";
          perfect.style.left = (zoneStart + zoneWidth * 0.3) + "%";
          perfect.style.width = (zoneWidth * 0.4) + "%";
          pos = 0; dir = 1; lastTs = null; live = true;
          hudRound.innerHTML = "&#9876; Round <strong>" + round + "/" + rounds + "</strong>";
          hudHits.innerHTML = "&#10004; Hits: <strong>" + hits + "</strong>";
          if (round > 1) {
            var lead = "He speeds up! Round " + round + "!";
            if (hits === winAt - 1) {
              lead += " One clean hit takes the deck!";
            } else if (rounds - round + 1 === winAt - hits) {
              lead += " No misses left to spare!";
              sfx("bell");
            }
            msg.textContent = lead;
          }
        }

        function tick(ts) {
          if (lastTs == null) lastTs = ts;
          var dt = (ts - lastTs) / 1000; lastTs = ts;
          if (live) {
            pos += dir * speed * 100 * dt;
            if (pos >= 100) { pos = 100; dir = -1; }
            if (pos <= 0) { pos = 0; dir = 1; }
            needle.style.left = pos + "%";
          }
          raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);

        function strike() {
          if (!live) return;
          live = false;
          var hit = pos >= zoneStart && pos <= zoneStart + zoneWidth;
          var perfectHit = hit &&
            pos >= zoneStart + zoneWidth * 0.3 &&
            pos <= zoneStart + zoneWidth * 0.7;
          if (perfectHit) {
            hits++; perfects++; perfectStreak++;
            msg.textContent = perfectStreak >= 2
              ? "PERFECT again! The mate glances at the rail, measuring the swim home."
              : "PERFECT! Right on the button — the whole boarding party cheers!";
            bar.classList.add("mg-bar-flash");
            timers.push(setTimeout(function () { bar.classList.remove("mg-bar-flash"); }, 400));
            sfx("clash");
          } else if (hit) {
            hits++; perfectStreak = 0;
            msg.textContent = pickFrom(GRUDGES);
            sfx("clash");
          } else {
            perfectStreak = 0;
            // Near-miss feedback: tell the player HOW they missed.
            var gap = pos < zoneStart ? zoneStart - pos : pos - (zoneStart + zoneWidth);
            msg.textContent = gap < 5
              ? (pos < zoneStart
                ? "A hand's breadth early! Your blade whistles past his ear."
                : "A hand's breadth late! Even the mate flinches before he laughs.")
              : pickFrom(TAUNTS);
            sfx("loss");
          }
          hudHits.innerHTML = "&#10004; Hits: <strong>" + hits + "</strong>";
          var willEnd = round >= rounds || hits >= winAt;
          if (willEnd) {
            // Verdict line tied to how the duel actually went.
            if (hits >= winAt) {
              msg.textContent = perfects >= winAt
                ? "Every strike PERFECT! The mate hands over his sword, his hat, and his opinion of farmers."
                : "That settles it — the mate lowers his blade. The deck is yours!";
            } else {
              msg.textContent = hits === winAt - 1
                ? "A whisker from victory — one more clean hit would have done it. He knows it too."
                : "He shrugs and twirls his blade. Not your day on this deck.";
            }
          }
          timers.push(setTimeout(function () {
            if (willEnd) {
              teardown();
              done({ success: hits >= winAt, score: hits });
            } else {
              newRound();
            }
          }, willEnd ? 1150 : 950));
        }

        function onKey(e) {
          if (e.code === "Space" || e.key === " ") { e.preventDefault(); strike(); }
        }
        btn.addEventListener("click", strike);
        document.addEventListener("keydown", onKey);

        function teardown() {
          cancelAnimationFrame(raf);
          document.removeEventListener("keydown", onKey);
          btn.disabled = true;
        }
        newRound();

        return {
          cancel: function () {
            done.cancel();
            teardown();
            timers.forEach(clearTimeout);
          }
        };
      }
    },

    /* ------------------------------------------------------------------
     * CANNON DUEL — fire broadsides when the drifting ship crosses your
     * aim line. Each pass she changes speed, hitting twice in a row earns
     * a cheer, and a supremely unbothered seagull patrols the battle.
     * opts: { shots: 4, winAt: 2, speed: 1 }
     * ---------------------------------------------------------------- */
    cannon: {
      mount: function (container, opts, onDone) {
        opts = opts || {};
        var shots = opts.shots || 4;
        var winAt = opts.winAt || 2;
        var baseSpeed = (opts.speed || 1) * 34; // % of width per second
        var speed = baseSpeed;
        var fired = 0, hitCount = 0, lastWasHit = false, missStreak = 0;
        var done = makeDone(onDone);
        var timers = [];
        var raf = null, x = -18, lastTs = null, running = true;
        var gullX = -10, gullDir = 1;

        var wrap = el("div", "mg mg-cannon");
        wrap.appendChild(el("p", "mg-instructions",
          "She crosses your broadside! Fire as she passes the <strong>aim line</strong> — " +
          winAt + " hits out of " + shots + " shots bring down her rigging. She changes speed on every pass, " +
          "so watch her bow, not your boots. <em>(Tap, click, or press Space.)</em>"));
        var hud = el("div", "mg-hud");
        var hudShots = el("span", "mg-stat", "");
        var hudHits = el("span", "mg-stat", "");
        hud.appendChild(hudShots); hud.appendChild(hudHits);
        wrap.appendChild(hud);

        var seaBox = el("div", "mg-sea");
        var aim = el("div", "mg-aim");
        var target = el("div", "mg-target",
          '<svg viewBox="0 0 120 70" aria-hidden="true"><g><path d="M10 44 L110 44 L98 58 Q60 68 22 58 Z" fill="#241a10"/><rect x="42" y="6" width="4" height="38" fill="#241a10"/><path d="M44 10 q -20 12 0 26 q 14 -13 0 -26" fill="#c9b78f"/></g></svg>');
        var gull = el("div", "mg-gull",
          '<svg viewBox="0 0 40 20" aria-hidden="true"><path d="M2 12 Q 10 2 20 10 Q 30 2 38 12" fill="none" stroke="#e9dcc0" stroke-width="2.6" stroke-linecap="round"/></svg>');
        var splash = el("div", "mg-splash", "");
        seaBox.appendChild(aim); seaBox.appendChild(target); seaBox.appendChild(gull); seaBox.appendChild(splash);
        wrap.appendChild(seaBox);
        var btn = el("button", "mg-action", "Fire!");
        wrap.appendChild(btn);
        var msg = el("p", "mg-msg", "");
        wrap.appendChild(msg);
        container.appendChild(wrap);

        function refreshHud() {
          hudShots.innerHTML = "&#128293; Shots: <strong>" + (shots - fired) + "</strong>";
          hudHits.innerHTML = "&#9873; Hits: <strong>" + hitCount + "/" + winAt + "</strong>";
        }
        refreshHud();

        function tick(ts) {
          if (lastTs == null) lastTs = ts;
          var dt = (ts - lastTs) / 1000; lastTs = ts;
          if (running) {
            x += speed * dt;
            if (x > 112) {
              x = -18; // wrap for another pass...
              // ...at a new speed. After a couple of misses she runs a
              // touch slower — the sea evens the odds, quietly.
              speed = baseSpeed * (0.85 + Math.random() * 0.4 - Math.min(missStreak, 2) * 0.07);
            }
            target.style.left = x + "%";
            // The seagull glides back and forth, entirely unbothered by the battle.
            gullX += gullDir * 9 * dt;
            if (gullX > 104) gullDir = -1;
            if (gullX < -6) gullDir = 1;
            gull.style.left = gullX + "%";
          }
          raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);

        function fire() {
          if (!running || fired >= shots) return;
          fired++;
          sfx("cannon");
          // Aim line sits at 50%; ship sprite is ~18% wide.
          var hit = x > 34 && x < 56;
          if (hit) {
            hitCount++;
            missStreak = 0;
            msg.textContent = lastWasHit
              ? "Two in a row! A devastating broadside — the crew is roaring!"
              : "A hit! Timber flies from her rail!";
            lastWasHit = true;
            target.classList.add("mg-target-hit");
            timers.push(setTimeout(function () { target.classList.remove("mg-target-hit"); }, 420));
          } else {
            missStreak++;
            var gullNearby = Math.abs(gullX - 50) < 22;
            // Near-miss feedback: a splash right off her hull, and word of
            // whether the shot was early or late.
            if (x > 26 && x < 64) {
              msg.textContent = x <= 34
                ? "A hand's breadth early — the ball skips across her bow wave!"
                : "A hand's breadth late — you parted the air behind her stern!";
              splash.style.left = Math.max(4, Math.min(90, x <= 34 ? x + 19 : x + 1)) + "%";
            } else {
              msg.textContent = gullNearby
                ? "A towering splash — and the seagull, dead ahead, remains completely unimpressed."
                : "Nothing but empty ocean out there. Wait for her bow to touch the line!";
              splash.style.left = "48%";
            }
            lastWasHit = false;
            splash.classList.add("mg-splash-show");
            timers.push(setTimeout(function () { splash.classList.remove("mg-splash-show"); }, 500));
          }
          refreshHud();
          if (hitCount >= winAt || fired >= shots) {
            running = false;
            teardown();
            // Verdict line tied to the gunnery you actually delivered.
            msg.textContent = hitCount >= winAt
              ? (hitCount === fired
                ? "Every ball told! Old Noland will be asking YOU for gunnery lessons."
                : "Her rigging comes down in a tangle — the day is yours!")
              : (hitCount === winAt - 1
                ? "One hit shy — her rigging holds by a thread as she slips out of range."
                : "She sails on untouched. The gun crew studies its boots.");
            timers.push(setTimeout(function () { done({ success: hitCount >= winAt, score: hitCount }); }, 1100));
          } else if (shots - fired === 1) {
            msg.textContent += " Last ball in the locker — make it count!";
            sfx("bell");
          }
        }

        function onKey(e) {
          if (e.code === "Space" || e.key === " ") { e.preventDefault(); fire(); }
        }
        btn.addEventListener("click", fire);
        document.addEventListener("keydown", onKey);
        function teardown() {
          cancelAnimationFrame(raf);
          document.removeEventListener("keydown", onKey);
          btn.disabled = true;
        }

        return {
          cancel: function () {
            done.cancel();
            teardown();
            timers.forEach(clearTimeout);
          }
        };
      }
    },

    /* ------------------------------------------------------------------
     * STORM HELM — hold the wheel: keep the ship marker inside the safe
     * channel as it drifts for `duration` seconds. Big gusts announce
     * themselves with a GUST! warning a beat before they shove you, so a
     * sharp helmsman can brace for them.
     * opts: { duration: 22, drift: 1 } — score is % of time in-channel.
     * ---------------------------------------------------------------- */
    helm: {
      mount: function (container, opts, onDone) {
        opts = opts || {};
        var duration = opts.duration || 22;
        var drift = (opts.drift || 1);
        var done = makeDone(onDone);
        var timers = [];
        var raf = null, lastTs = null;
        var shipX = 50, chanCenter = 50, chanHalf = 16;
        var t = 0, inTime = 0, gustT = 0, gustF = 0;
        var pendingGust = 0, warnT = 0;
        var left = false, right = false;
        var finished = false, urgent = false, praised = false, holdStreak = 0;
        var flavorShown = {};

        var FLAVOR = [
          { at: 7, text: "The ship's cat yowls below decks. It has strong opinions about this weather." },
          { at: 14, text: "Somewhere below, a barrel breaks loose, rolls the length of the hold, and apologizes to no one." }
        ];

        var wrap = el("div", "mg mg-helm");
        wrap.appendChild(el("p", "mg-instructions",
          "The nor'easter has you! Hold her in the <strong>safe water</strong> between the sandbars until the timer runs out. " +
          "When you see <strong>GUST!</strong> flash, brace — a big shove is a heartbeat away. " +
          "<em>(Hold &#8592;/&#8594; keys, or press the port/starboard buttons.)</em>"));
        var hud = el("div", "mg-hud");
        var hudTime = el("span", "mg-stat", "");
        var hudHold = el("span", "mg-stat", "");
        hud.appendChild(hudTime); hud.appendChild(hudHold);
        wrap.appendChild(hud);

        var seaBox = el("div", "mg-helm-sea");
        var chan = el("div", "mg-channel");
        var shipMark = el("div", "mg-helm-ship",
          '<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 4 L44 40 Q30 52 16 40 Z" fill="#e9dcc0" stroke="#241a10" stroke-width="3"/></svg>');
        var gustWarn = el("div", "mg-gust-warning", "GUST!");
        seaBox.appendChild(chan); seaBox.appendChild(shipMark); seaBox.appendChild(gustWarn);
        wrap.appendChild(seaBox);

        var controls = el("div", "mg-helm-controls");
        var btnL = el("button", "mg-action mg-action-half", "&#8592; Port");
        var btnR = el("button", "mg-action mg-action-half", "Starboard &#8594;");
        controls.appendChild(btnL); controls.appendChild(btnR);
        wrap.appendChild(controls);
        var msg = el("p", "mg-msg", "");
        wrap.appendChild(msg);
        container.appendChild(wrap);

        sfx("wind");

        var cleanupFns = [];

        function press(btn, setter) {
          function down(e) { e.preventDefault(); setter(true); }
          function up() { setter(false); }
          btn.addEventListener("mousedown", down);
          btn.addEventListener("touchstart", down, { passive: false });
          // Release must be caught globally (and on touchcancel) — a pointer
          // that lifts or is interrupted off the button must not leave the
          // ship "stuck" drifting for the rest of the mini-game.
          document.addEventListener("mouseup", up);
          document.addEventListener("touchend", up);
          document.addEventListener("touchcancel", up);
          cleanupFns.push(function () {
            document.removeEventListener("mouseup", up);
            document.removeEventListener("touchend", up);
            document.removeEventListener("touchcancel", up);
          });
        }
        press(btnL, function (v) { left = v; });
        press(btnR, function (v) { right = v; });

        function onKey(e) {
          if (e.key === "ArrowLeft") { e.preventDefault(); left = e.type === "keydown"; }
          if (e.key === "ArrowRight") { e.preventDefault(); right = e.type === "keydown"; }
        }
        document.addEventListener("keydown", onKey);
        document.addEventListener("keyup", onKey);
        cleanupFns.push(function () {
          document.removeEventListener("keydown", onKey);
          document.removeEventListener("keyup", onKey);
        });

        // If the window/tab loses focus while a key or button is held, the
        // matching keyup/mouseup/touchend may never arrive — release both
        // controls so the ship doesn't drift uncontrollably in the background.
        function onBlur() { left = false; right = false; }
        window.addEventListener("blur", onBlur);
        cleanupFns.push(function () { window.removeEventListener("blur", onBlur); });

        function teardown() {
          cleanupFns.forEach(function (f) { f(); });
          cancelAnimationFrame(raf);
          btnL.disabled = btnR.disabled = true;
        }

        function tick(ts) {
          if (lastTs == null) lastTs = ts;
          var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
          t += dt;

          // Channel wanders; gusts shove the ship. Big gusts telegraph
          // themselves with a warning flash before they land.
          chanCenter = 50 + Math.sin(t * 0.55) * 22 + Math.sin(t * 1.3) * 8;
          gustT -= dt;
          if (gustT <= 0 && !warnT) {
            gustT = 1.2 + Math.random() * 1.6;
            var force = (Math.random() * 2 - 1) * 26 * drift;
            // Never let a gust pin the ship against a rail she's already
            // touching — that's a drowning trap, not a challenge.
            if (shipX < 18) force = Math.abs(force);
            if (shipX > 82) force = -Math.abs(force);
            if (Math.abs(force) > 18) {
              // Strong gust: warn first, apply after a beat.
              pendingGust = force;
              warnT = 0.55;
              gustWarn.classList.add("mg-gust-show");
              gustF = 0;
              sfx("creak");
            } else {
              gustF = force;
            }
          }
          if (warnT > 0) {
            warnT -= dt;
            if (warnT <= 0) {
              warnT = 0;
              gustF = pendingGust;
              pendingGust = 0;
              gustWarn.classList.remove("mg-gust-show");
            }
          }

          shipX += gustF * dt;
          if (left) shipX -= 42 * dt;
          if (right) shipX += 42 * dt;
          shipX = Math.max(4, Math.min(96, shipX));

          var inChan = Math.abs(shipX - chanCenter) <= chanHalf;
          if (inChan) {
            inTime += dt;
            holdStreak += dt;
            if (!praised && holdStreak >= 6) {
              praised = true;
              msg.textContent = "Steady as she goes! The crew starts to believe.";
            }
          } else {
            holdStreak = 0;
          }

          chan.style.left = (chanCenter - chanHalf) + "%";
          chan.style.width = (chanHalf * 2) + "%";
          shipMark.style.left = shipX + "%";
          shipMark.classList.toggle("mg-helm-danger", !inChan);

          FLAVOR.forEach(function (f) {
            if (t >= f.at && !flavorShown[f.at]) {
              flavorShown[f.at] = true;
              msg.textContent = f.text;
            }
          });

          if (!urgent && duration - t <= 5) {
            urgent = true;
            hudTime.style.color = "#a03322";
            msg.textContent = "Nearly through the worst of it — five more seconds. Hold her!";
            sfx("bell");
          }
          hudTime.innerHTML = "&#8987; <strong>" + Math.max(0, Math.ceil(duration - t)) + "s</strong>";
          var pct = t > 0 ? Math.round((inTime / t) * 100) : 100;
          hudHold.innerHTML = "&#9875; Held: <strong>" + pct + "%</strong>";

          if (t >= duration) {
            finished = true;
            teardown();
            gustWarn.classList.remove("mg-gust-show");
            var score = Math.round((inTime / duration) * 100);
            msg.textContent = score >= 90
              ? "You held her like the wheel was part of your arms. The helmsman just stares."
              : score >= 75
                ? "You held her through the worst of it. Even the cat is impressed."
                : score >= 60
                  ? "Ragged and soaked, but you kept her in the deep water. That will do."
                  : score >= 45
                    ? "So close — five more good seconds and you would have had her."
                    : "The sea had her more than you did.";
            timers.push(setTimeout(function () { done({ success: score >= 60, score: score }); }, 1100));
            return;
          }
          raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);

        return {
          cancel: function () {
            done.cancel();
            if (!finished) teardown();
            timers.forEach(clearTimeout);
          }
        };
      }
    },

    /* ------------------------------------------------------------------
     * DICE (Teach's wager) — a TIMING skill. The die face cycles fast;
     * lock it on a high number. Best total over N rolls beats Teach.
     * opts: { rounds: 3 }
     * ---------------------------------------------------------------- */
    dice: {
      mount: function (container, opts, onDone) {
        opts = opts || {};
        var rounds = opts.rounds || 3;
        var done = makeDone(onDone);
        var timers = [];
        var raf = null, cycling = false, face = 1, lastCyc = 0;
        var faceInterval = 0.11; // seconds between face flips — shrinks each round
        var round = 0, yourTotal = 0, teachTotal = 0, highStreak = 0;
        var FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

        var wrap = el("div", "mg mg-dice");
        wrap.appendChild(el("p", "mg-instructions",
          "Teach rattles the bone dice. Stop yours on a <strong>high number</strong> — " +
          "the best total over " + rounds + " rolls takes the pile. <em>(Tap, click, or press Space to lock.)</em>"));
        var hud = el("div", "mg-hud");
        var hudRound = el("span", "mg-stat", "");
        var hudScore = el("span", "mg-stat", "");
        hud.appendChild(hudRound); hud.appendChild(hudScore);
        wrap.appendChild(hud);
        var arena = el("div", "mg-dice-arena");
        var yourDie = el("div", "mg-die mg-die-you", FACES[0]);
        arena.appendChild(el("div", "mg-die-vs", "you"));
        arena.appendChild(yourDie);
        arena.appendChild(el("div", "mg-die-vs", "Teach"));
        var teachDie = el("div", "mg-die mg-die-teach", "?");
        arena.appendChild(teachDie);
        wrap.appendChild(arena);
        var btn = el("button", "mg-action", "Lock it!");
        wrap.appendChild(btn);
        var msg = el("p", "mg-msg", "");
        wrap.appendChild(msg);
        container.appendChild(wrap);

        function refreshHud() {
          hudRound.innerHTML = "🎲 Roll <strong>" + Math.min(round, rounds) + "/" + rounds + "</strong>";
          hudScore.innerHTML = "You <strong>" + yourTotal + "</strong> &middot; Teach <strong>" + teachTotal + "</strong>";
        }

        function newRound() {
          round++; cycling = true; lastCyc = 0;
          // The bones rattle a little faster every round.
          faceInterval = Math.max(0.06, 0.11 - (round - 1) * 0.02);
          teachDie.textContent = "?";
          if (round === rounds && rounds > 1) {
            var diff = yourTotal - teachTotal;
            msg.textContent = diff < 0
              ? "Last roll — you're down by " + (-diff) + ". Lock a big one!"
              : diff > 0
                ? "Last roll — you're up by " + diff + ". Don't get cocky."
                : "Last roll — dead even. The whole fire goes quiet.";
            sfx("bell");
          } else {
            msg.textContent = "";
          }
          refreshHud();
        }

        function tick(ts) {
          if (!lastCyc) lastCyc = ts;
          if (cycling && (ts - lastCyc) / 1000 >= faceInterval) {
            lastCyc = ts;
            // Never show the same face twice running — every flip is a real
            // change, so quick eyes get a fair read.
            var next = 1 + Math.floor(Math.random() * 5);
            face = next >= face ? next + 1 : next;
            yourDie.textContent = FACES[face - 1];
          }
          raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);

        function lock() {
          if (!cycling) return;
          cycling = false;
          yourDie.classList.add("mg-die-lock");
          timers.push(setTimeout(function () { yourDie.classList.remove("mg-die-lock"); }, 300));
          yourTotal += face;
          var teach = 2 + Math.floor(Math.random() * 4); // Teach rolls 2..5 — beatable with skill
          teachTotal += teach;
          teachDie.textContent = FACES[teach - 1];
          sfx("click");
          if (face >= 5) highStreak++; else highStreak = 0;
          msg.textContent = highStreak >= 2 ? "Another high one — that's " + highStreak + " running! The pirates start whooping."
            : face === 6 ? "A SIX! The bones love you tonight."
            : face >= 5 ? "A high roll! Teach grunts."
            : face <= 2 ? "“Is that all?” Teach grins." : "Not bad.";
          refreshHud();
          timers.push(setTimeout(function () {
            if (round >= rounds) {
              teardown();
              var margin = yourTotal - teachTotal;
              var win = margin >= 0;
              // Verdict by margin — a squeaker should feel like a squeaker.
              msg.textContent = margin >= 4 ? "You clean him out! The whole fire roars."
                : margin > 0 ? "By a whisker! Teach squints at the dice like they owe him money."
                : margin === 0 ? "Dead even — and a tie, the crew rules loudly, goes to the challenger."
                : margin >= -2 ? "So close — " + (-margin) + (margin === -1 ? " pip" : " pips") + " short. Teach rakes in the pile, cackling."
                : "Teach rakes in the pile, chuckling.";
              timers.push(setTimeout(function () { done({ success: win, score: yourTotal }); }, 950));
            } else { newRound(); }
          }, 850));
        }

        function onKey(e) { if (e.code === "Space" || e.key === " ") { e.preventDefault(); lock(); } }
        btn.addEventListener("click", lock);
        document.addEventListener("keydown", onKey);
        function teardown() {
          cancelAnimationFrame(raf);
          document.removeEventListener("keydown", onKey);
          btn.disabled = true;
        }
        newRound();

        return { cancel: function () { done.cancel(); teardown(); timers.forEach(clearTimeout); } };
      }
    },

    /* ------------------------------------------------------------------
     * KNOTS (rigging) — a MEMORY skill (Simon-says). Repeat the bosun's
     * growing sequence of rope orders. Survive N rounds.
     * opts: { rounds: 4, startLen: 3 }
     * ---------------------------------------------------------------- */
    knots: {
      mount: function (container, opts, onDone) {
        opts = opts || {};
        var rounds = opts.rounds || 4;
        var startLen = opts.startLen || 3;
        var done = makeDone(onDone);
        var timers = [];
        var LABELS = ["Haul", "Belay", "Cleat"];
        var seq = [], inputIdx = 0, round = 0, accepting = false, best = 0, finished = false;

        var wrap = el("div", "mg mg-knots");
        wrap.appendChild(el("p", "mg-instructions",
          "Watch the bosun call the rigging, then repeat the order back. It grows each round — " +
          "survive " + rounds + " to make her fast. <em>(Click the ropes or press 1 / 2 / 3.)</em>"));
        var hud = el("div", "mg-hud");
        var hudRound = el("span", "mg-stat", "");
        var hudBest = el("span", "mg-stat", "");
        hud.appendChild(hudRound); hud.appendChild(hudBest);
        wrap.appendChild(hud);
        var padWrap = el("div", "mg-knot-pads");
        var padEls = LABELS.map(function (label, i) {
          var b = el("button", "mg-knot-pad", label + '<span class="mg-knot-key">' + (i + 1) + '</span>');
          b.setAttribute("data-idx", i);
          padWrap.appendChild(b);
          return b;
        });
        wrap.appendChild(padWrap);
        var msg = el("p", "mg-msg", "Watch closely...");
        wrap.appendChild(msg);
        container.appendChild(wrap);

        function refreshHud() {
          hudRound.innerHTML = "🪢 Round <strong>" + Math.min(round, rounds) + "/" + rounds + "</strong>";
          hudBest.innerHTML = "&#9881; Longest <strong>" + best + "</strong>";
        }
        function flash(i, cls) {
          padEls[i].classList.add(cls || "mg-knot-flash");
          timers.push(setTimeout(function () { padEls[i].classList.remove(cls || "mg-knot-flash"); }, 340));
        }
        function playSeq() {
          accepting = false;
          msg.textContent = round === rounds
            ? "Final order — the whole crew is watching..."
            : "Watch the bosun...";
          if (round === rounds) sfx("bell");
          var d = 0;
          // The bosun calls faster as the rounds go on.
          var gap = Math.max(420, 580 - (round - 1) * 45);
          seq.forEach(function (i) {
            timers.push(setTimeout(function () { flash(i); sfx("click"); }, 450 + d));
            d += gap;
          });
          timers.push(setTimeout(function () {
            accepting = true; inputIdx = 0; msg.textContent = "Your turn — repeat it!";
          }, 450 + d));
        }
        function newRound() {
          round++;
          var len = startLen + (round - 1);
          seq = [];
          for (var k = 0; k < len; k++) {
            var nxt = Math.floor(Math.random() * 3);
            // Never call the same rope three times running — back-to-back
            // flashes blur together, and that's a trick, not a test.
            while (k >= 2 && seq[k - 1] === nxt && seq[k - 2] === nxt) {
              nxt = Math.floor(Math.random() * 3);
            }
            seq.push(nxt);
          }
          refreshHud();
          playSeq();
        }
        function finish(win) {
          if (finished) return; finished = true;
          teardown();
          timers.push(setTimeout(function () { done({ success: win, score: best }); }, 950));
        }
        function input(i) {
          if (!accepting || finished) return;
          flash(i, "mg-knot-press");
          if (seq[inputIdx] === i) {
            inputIdx++;
            sfx("click");
            if (inputIdx >= seq.length) {
              accepting = false;
              best = Math.max(best, seq.length);
              refreshHud();
              if (round >= rounds) {
                msg.textContent = "Every line fast and true. The bosun nods — rare praise.";
                finish(true);
              } else {
                msg.textContent = "Aye! Next order...";
                timers.push(setTimeout(newRound, 820));
              }
            } else {
              msg.textContent = "Aye — " + inputIdx + " of " + seq.length + "...";
            }
          } else {
            accepting = false;
            best = Math.max(best, seq.length - 1);
            refreshHud();
            flash(i, "mg-knot-wrong");
            // Show which rope it should have been, so the lesson lands.
            var right = seq[inputIdx];
            timers.push(setTimeout(function () { flash(right); }, 380));
            msg.textContent = inputIdx >= seq.length - 1
              ? "Fouled the very LAST hitch of the order! The bosun stares at the sky."
              : "Fouled the line! It was “" + LABELS[right] + "” — the bosun winces.";
            finish(false);
          }
        }
        padEls.forEach(function (b) {
          b.addEventListener("click", function () { input(+b.getAttribute("data-idx")); });
        });
        function onKey(e) {
          var idx = "123".indexOf(e.key);
          if (idx >= 0) { e.preventDefault(); input(idx); }
        }
        document.addEventListener("keydown", onKey);
        function teardown() { document.removeEventListener("keydown", onKey); }

        refreshHud();
        timers.push(setTimeout(newRound, 650));

        return { cancel: function () { done.cancel(); finished = true; teardown(); timers.forEach(clearTimeout); } };
      }
    },

    /* ------------------------------------------------------------------
     * LOOKOUT — a REACTION + discrimination skill. Shapes loom out of the
     * fog; click the enemy SAIL fast, ignore gull/cloud decoys.
     * opts: { rounds: 5, winAt: 3, showMs: 1100 }
     * ---------------------------------------------------------------- */
    lookout: {
      mount: function (container, opts, onDone) {
        opts = opts || {};
        var rounds = opts.rounds || 5;
        var winAt = opts.winAt || 3;
        var showMs = opts.showMs || 1150;
        var done = makeDone(onDone);
        var timers = [];
        var round = 0, hits = 0, roundActive = false, finished = false;
        var mistakes = 0, sightStreak = 0, spawnAt = 0, roundShow = showMs;

        var SHAPES = {
          sail: '<svg viewBox="0 0 60 60" aria-hidden="true"><rect x="28" y="8" width="3" height="46" fill="#241a10"/><path d="M31 10 L49 46 Q31 54 31 54 Z" fill="#e9dcc0" stroke="#241a10" stroke-width="2"/><path d="M28 10 L11 46 Q28 54 28 54 Z" fill="#c9b78f" stroke="#241a10" stroke-width="2"/></svg>',
          gull: '<svg viewBox="0 0 60 40" aria-hidden="true"><path d="M4 26 Q16 8 30 22 Q44 8 56 26" fill="none" stroke="#c9b78f" stroke-width="4" stroke-linecap="round"/></svg>',
          cloud: '<svg viewBox="0 0 70 40" aria-hidden="true"><ellipse cx="35" cy="24" rx="30" ry="12" fill="#6a7b84"/><ellipse cx="20" cy="26" rx="16" ry="9" fill="#6a7b84"/><ellipse cx="48" cy="26" rx="16" ry="9" fill="#6a7b84"/></svg>'
        };
        var DECOY_MSGS = ["That was a gull. It judged you.", "A cloud. Not every shadow is a Spaniard.", "Just a floating barrel. Steady on."];

        var wrap = el("div", "mg mg-lookout");
        wrap.appendChild(el("p", "mg-instructions",
          "Fog everywhere! Shapes loom and fade — click the <strong>enemy sail</strong> the moment you see it, " +
          "but do NOT click gulls or clouds. " + winAt + " good sightings of " + rounds + " wins. <em>(Tap or click.)</em>"));
        var hud = el("div", "mg-hud");
        var hudRound = el("span", "mg-stat", "");
        var hudHits = el("span", "mg-stat", "");
        hud.appendChild(hudRound); hud.appendChild(hudHits);
        wrap.appendChild(hud);
        var fog = el("div", "mg-fog");
        wrap.appendChild(fog);
        var msg = el("p", "mg-msg", "Keep your eyes peeled...");
        wrap.appendChild(msg);
        container.appendChild(wrap);

        function refreshHud() {
          hudRound.innerHTML = "🔭 Watch <strong>" + Math.min(round, rounds) + "/" + rounds + "</strong>";
          hudHits.innerHTML = "&#10003; Sighted <strong>" + hits + "/" + winAt + "</strong>";
        }
        function clearShapes() { fog.innerHTML = ""; }
        function resolveRound(wasHit) {
          if (!roundActive) return;
          roundActive = false;
          clearShapes();
          if (hits >= winAt) finish(true);
          // End honestly the moment the watch can no longer be won — no
          // pointless rounds after the game is already lost.
          else if (round >= rounds || rounds - round < winAt - hits) finish(false);
          else timers.push(setTimeout(newRound, 450 + Math.random() * 450));
        }
        function spawn(type, onHit, placed) {
          var s = el("div", "mg-shape mg-shape-" + type, SHAPES[type]);
          // Keep shapes well apart — a sail lurking under a decoy is a
          // misclick trap, not a fair test of the eye.
          var lft = 8 + Math.random() * 74, top = 8 + Math.random() * 56;
          for (var a = 0; a < 16; a++) {
            var clear = true;
            for (var p = 0; p < placed.length; p++) {
              if (Math.abs(lft - placed[p][0]) < 20 && Math.abs(top - placed[p][1]) < 26) { clear = false; break; }
            }
            if (clear) break;
            lft = 8 + Math.random() * 74; top = 8 + Math.random() * 56;
          }
          placed.push([lft, top]);
          s.style.left = lft + "%";
          s.style.top = top + "%";
          s.addEventListener("click", function (ev) { ev.stopPropagation(); onHit(); });
          fog.appendChild(s);
          timers.push(setTimeout(function () { s.classList.add("mg-shape-show"); }, 20));
          return s;
        }
        function newRound() {
          round++; refreshHud(); roundActive = true;
          // The fog closes in — each watch, she shows herself a bit less.
          roundShow = Math.max(showMs * 0.62, showMs - (round - 1) * 90);
          msg.textContent = hits === winAt - 1
            ? "One more sighting wins the watch!"
            : (round > 1 && winAt - hits === rounds - round + 1)
              ? "No misses left to spare — eyes sharp!"
              : round === 3 ? "The fog thickens..." : "";
          spawnAt = Date.now();
          var placed = [];
          spawn("sail", function () {
            if (!roundActive) return;
            hits++; sightStreak++; refreshHud();
            msg.textContent = (Date.now() - spawnAt) < roundShow * 0.45
              ? "Lightning eyes! You had her the instant she showed."
              : sightStreak >= 2
                ? "Sail ho! That's " + sightStreak + " running — well spotted."
                : "Sail ho! Well spotted.";
            sfx("bell");
            resolveRound(true);
          }, placed);
          var decoys = Math.floor(Math.random() * 3);
          for (var d = 0; d < decoys; d++) {
            spawn(Math.random() < 0.5 ? "gull" : "cloud", function () {
              if (!roundActive) return;
              mistakes++; sightStreak = 0;
              msg.textContent = pickFrom(DECOY_MSGS);
              resolveRound(false);
            }, placed);
          }
          timers.push(setTimeout(function () {
            if (roundActive) {
              mistakes++; sightStreak = 0;
              msg.textContent = "Gone in the fog... too slow.";
              resolveRound(false);
            }
          }, roundShow));
        }
        function finish(win) {
          if (finished) return; finished = true;
          clearShapes();
          msg.textContent = win
            ? (mistakes === 0
              ? "A perfect watch — not one false cry. You've the sharpest eyes aboard."
              : "You've the sharpest eyes aboard.")
            : (hits === winAt - 1
              ? "One sighting short — she melted into the murk."
              : "She slipped away in the murk.");
          timers.push(setTimeout(function () { done({ success: win, score: hits }); }, 900));
        }

        refreshHud();
        timers.push(setTimeout(newRound, 700));

        return { cancel: function () { done.cancel(); finished = true; roundActive = false; timers.forEach(clearTimeout); } };
      }
    },

    /* ------------------------------------------------------------------
     * GOATCHASE — a PURSUIT-clicking skill. Bartholomew the ship's goat
     * darts around the deck (and speeds up); catch him enough times
     * before the timer runs out.
     * opts: { need: 5, duration: 15 }
     * ---------------------------------------------------------------- */
    goatchase: {
      mount: function (container, opts, onDone) {
        opts = opts || {};
        var need = opts.need || 5;
        var duration = opts.duration || 15;
        var done = makeDone(onDone);
        var timers = [];
        var caught = 0, t = 0, lastTs = null, raf = null;
        var hopEvery = 0.85, hopT = 0, finished = false, urgent = false;
        var lastLeft = 46, lastTop = 40, catchTimes = [];

        var BLEATS = ["“Me-e-eh!”", "Got him! ...no, that was his tail.", "He spits out a brass button.", "So much goat. So little time."];
        var WHIFFS = ["Whiff! He skips aside, extremely pleased with himself.", "You grab a fistful of sea air. The goat is elsewhere.", "He feints left. You fall for it. Everyone saw."];

        var wrap = el("div", "mg mg-goat");
        wrap.appendChild(el("p", "mg-instructions",
          "Bartholomew the ship's goat has the captain's hat AGAIN. Catch him <strong>" + need +
          "</strong> times before the sand runs out — he's quick, and getting quicker. <em>(Tap or click the goat.)</em>"));
        var hud = el("div", "mg-hud");
        var hudTime = el("span", "mg-stat", "");
        var hudCaught = el("span", "mg-stat", "");
        hud.appendChild(hudTime); hud.appendChild(hudCaught);
        wrap.appendChild(hud);
        var deck = el("div", "mg-goat-deck");
        var goat = el("button", "mg-goat-target", "🐐");
        deck.appendChild(goat);
        wrap.appendChild(deck);
        var msg = el("p", "mg-msg", "");
        wrap.appendChild(msg);
        container.appendChild(wrap);

        function caughtHtml() { return "🐐 Caught <strong>" + caught + "/" + need + "</strong>"; }
        function timeHtml() { return "⌛ <strong>" + Math.max(0, Math.ceil(duration - t)) + "s</strong>"; }
        function hop() {
          // Never a lazy hop — he always clears real deck, so a catch is
          // never handed to you and a chase never stalls in one corner.
          var nl, nt, tries = 0;
          do {
            nl = 6 + Math.random() * 80;
            nt = 10 + Math.random() * 60;
            tries++;
          } while (tries < 12 && Math.abs(nl - lastLeft) + Math.abs(nt - lastTop) < 34);
          lastLeft = nl; lastTop = nt;
          goat.style.left = nl + "%";
          goat.style.top = nt + "%";
        }

        goat.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (finished) return;
          caught++;
          catchTimes.push(t);
          hudCaught.innerHTML = caughtHtml();
          if (catchTimes.length >= 3 && t - catchTimes[catchTimes.length - 3] < 3.5) {
            msg.textContent = "Three grabs in a blink! Bartholomew is impressed AND furious.";
          } else if (caught % 2 === 0) {
            msg.textContent = pickFrom(BLEATS);
          }
          goat.classList.add("mg-goat-bounce");
          timers.push(setTimeout(function () { goat.classList.remove("mg-goat-bounce"); }, 200));
          sfx("click");
          hop();
          hopEvery = Math.max(0.4, hopEvery - 0.04); // he speeds up each catch
          hopT = 0;
          if (caught >= need) finish(true);
        });

        // A grab at empty deck isn't free: he dodges away from it.
        deck.addEventListener("click", function () {
          if (finished) return;
          msg.textContent = pickFrom(WHIFFS);
          hop();
          hopT = 0;
        });

        function tick(ts) {
          if (lastTs == null) lastTs = ts;
          var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
          t += dt; hopT += dt;
          if (hopT >= hopEvery) { hopT = 0; hop(); }
          if (!urgent && duration - t <= 5 && caught < need) {
            urgent = true;
            hudTime.style.color = "#a03322";
            msg.textContent = "The last of the sand is running — GO!";
            sfx("bell");
          }
          hudTime.innerHTML = timeHtml();
          if (t >= duration) { finish(caught >= need); return; }
          raf = requestAnimationFrame(tick);
        }
        function finish(win) {
          if (finished) return; finished = true;
          cancelAnimationFrame(raf);
          goat.disabled = true;
          msg.textContent = win
            ? (duration - t > 4
              ? "Got him with time to spare! The hat is rescued (only slightly chewed)."
              : "Snagged him as the very last grains fell! The hat is rescued (only slightly chewed).")
            : (caught === need - 1
              ? "ONE grab short! He watches from the rigging, wearing the hat at a jaunty angle."
              : "Bartholomew wins. Bartholomew always wins.");
          timers.push(setTimeout(function () { done({ success: win, score: caught }); }, 900));
        }

        hudCaught.innerHTML = caughtHtml();
        hudTime.innerHTML = timeHtml();
        hop();
        raf = requestAnimationFrame(tick);

        return { cancel: function () { done.cancel(); finished = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); } };
      }
    }
  };
})();
