/*
 * Captain Bellamy — ship management engine
 *
 * Day loop: (maybe event) → pick one order → resolve → night tick → check end.
 * Short text only. Crew moods + ship bars drive outcomes.
 */
(function () {
  "use strict";

  var SAVE_KEY = "blacksam.captain.v1";

  var el = {
    titleCard: document.getElementById("titleCard"),
    gameCard: document.getElementById("gameCard"),
    boardCard: document.getElementById("boardCard"),
    startBtn: document.getElementById("startBtn"),
    continueBtn: document.getElementById("continueBtn"),
    boardBtn: document.getElementById("boardBtn"),
    boardBackBtn: document.getElementById("boardBackBtn"),
    boardClearBtn: document.getElementById("boardClearBtn"),
    boardBody: document.getElementById("boardBody"),
    boardTitle: document.getElementById("boardTitle"),
    restartBtn: document.getElementById("restartBtn"),
    muteBtn: document.getElementById("muteBtn"),
    art: document.getElementById("sceneArt"),
    phaseLabel: document.getElementById("phaseLabel"),
    shipLabel: document.getElementById("shipLabel"),
    dayLabel: document.getElementById("dayLabel"),
    prompt: document.getElementById("prompt"),
    log: document.getElementById("captainLog"),
    actions: document.getElementById("actions"),
    crewRow: document.getElementById("crewRow"),
    footerNote: document.getElementById("footerNote"),
    endingPanel: document.getElementById("endingPanel"),
    bars: {
      gold: document.getElementById("barGold"),
      food: document.getElementById("barFood"),
      morale: document.getElementById("barMorale"),
      hull: document.getElementById("barHull"),
      renown: document.getElementById("barRenown")
    },
    vals: {
      gold: document.getElementById("valGold"),
      food: document.getElementById("valFood"),
      morale: document.getElementById("valMorale"),
      hull: document.getElementById("valHull"),
      renown: document.getElementById("valRenown")
    }
  };

  var activeMinigame = null;
  var lastRecorded = null;
  var state = freshState();
  var pendingAfterMinigame = null;

  function freshState() {
    var C = window.CAMPAIGN;
    var crew = (C.crew || []).map(function (c) {
      return {
        id: c.id,
        name: c.name,
        role: c.role,
        skill: c.skill,
        mood: c.mood,
        tip: c.tip,
        joinPhase: c.joinPhase || null,
        leavePhase: c.leavePhase || null,
        aboard: !c.joinPhase
      };
    });
    return {
      phase: C.startPhase,
      day: 1,
      phaseDay: 0,
      ship: C.phases[C.startPhase].ship || "No ship yet",
      stats: { gold: 6, food: 22, morale: 55, hull: 70, renown: 2 },
      flags: {},
      scores: {},
      usedActions: {},
      usedEvents: {},
      log: [],
      mode: "orders", // orders | event | ending | minigame
      event: null,
      sound: false,
      recorded: false,
      crew: crew
    };
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.phase && window.CAMPAIGN.phases[data.phase]) {
        data.scores = data.scores || {};
        data.flags = data.flags || {};
        data.usedActions = data.usedActions || {};
        data.usedEvents = data.usedEvents || {};
        data.log = data.log || [];
        return data;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function sfx(name) {
    if (window.SFX && window.SFX[name]) window.SFX[name]();
  }

  function setNote(t) {
    if (el.footerNote) el.footerNote.textContent = t || "";
  }

  function pushLog(line) {
    if (!line) return;
    state.log.unshift(line);
    if (state.log.length > 6) state.log.length = 6;
  }

  function phase() {
    return window.CAMPAIGN.phases[state.phase];
  }

  function crewById(id) {
    for (var i = 0; i < state.crew.length; i++) {
      if (state.crew[i].id === id) return state.crew[i];
    }
    return null;
  }

  function syncCrewAboard() {
    var order = ["ashore", "florida", "hornigold", "captain", "whydah", "north", "storm"];
    var idx = order.indexOf(state.phase);
    state.crew.forEach(function (c) {
      var joinIdx = c.joinPhase ? order.indexOf(c.joinPhase) : 0;
      var leaveIdx = c.leavePhase ? order.indexOf(c.leavePhase) : 999;
      c.aboard = idx >= joinIdx && idx < leaveIdx;
    });
  }

  function applyEffects(effects) {
    if (!effects) return [];
    var bumped = [];
    for (var k in effects) {
      if (!Object.prototype.hasOwnProperty.call(effects, k)) continue;
      if (typeof state.stats[k] === "number") {
        state.stats[k] = clamp(state.stats[k] + effects[k], 0, k === "gold" || k === "renown" ? 99 : 100);
        bumped.push(k);
      }
    }
    return bumped;
  }

  function applyCrewBoost(boost) {
    if (!boost) return;
    for (var id in boost) {
      if (!Object.prototype.hasOwnProperty.call(boost, id)) continue;
      var c = crewById(id);
      if (c && c.aboard) c.mood = clamp(c.mood + boost[id], 0, 100);
    }
  }

  function meetsRequires(req) {
    if (!req) return true;
    for (var k in req) {
      if (!Object.prototype.hasOwnProperty.call(req, k)) continue;
      if ((state.stats[k] || 0) < req[k]) return false;
    }
    return true;
  }

  function avgCrewMood() {
    var n = 0, t = 0;
    state.crew.forEach(function (c) {
      if (!c.aboard) return;
      n++; t += c.mood;
    });
    return n ? Math.round(t / n) : 50;
  }

  function cancelMinigame() {
    if (activeMinigame) {
      activeMinigame.cancel();
      activeMinigame = null;
    }
    pendingAfterMinigame = null;
  }

  /* ---------- Render ---------- */

  function renderBars(bumpKeys) {
    var caps = { gold: 99, food: 100, morale: 100, hull: 100, renown: 99 };
    ["gold", "food", "morale", "hull", "renown"].forEach(function (k) {
      var v = state.stats[k];
      if (el.vals[k]) el.vals[k].textContent = v;
      if (el.bars[k]) {
        var pct = Math.round((v / caps[k]) * 100);
        el.bars[k].style.width = clamp(pct, 0, 100) + "%";
        el.bars[k].parentElement.classList.toggle("is-low", v <= 20);
        el.bars[k].parentElement.classList.toggle("is-crit", v <= 8);
      }
    });
    (bumpKeys || []).forEach(function (k) {
      var node = el.vals[k];
      if (!node) return;
      node.classList.remove("bump");
      void node.offsetWidth;
      node.classList.add("bump");
      setTimeout(function () { node.classList.remove("bump"); }, 320);
    });
  }

  function renderArt(key) {
    if (!el.art) return;
    if (key && window.ART && window.ART[key]) {
      el.art.innerHTML = window.ART[key]();
      el.art.hidden = false;
      el.art.classList.remove("art-reveal");
      void el.art.offsetWidth;
      el.art.classList.add("art-reveal");
    } else {
      el.art.hidden = true;
      el.art.innerHTML = "";
    }
  }

  function renderLog() {
    if (!el.log) return;
    if (!state.log.length) {
      el.log.innerHTML = '<li class="log-empty">Orders appear here.</li>';
      return;
    }
    el.log.innerHTML = state.log.map(function (line) {
      return "<li>" + escapeHtml(line) + "</li>";
    }).join("");
  }

  function renderCrew() {
    if (!el.crewRow) return;
    syncCrewAboard();
    var html = "";
    state.crew.forEach(function (c) {
      if (!c.aboard) return;
      var moodCls = c.mood >= 70 ? "mood-high" : c.mood <= 35 ? "mood-low" : "mood-mid";
      html +=
        '<button type="button" class="crew-chip ' + moodCls + '" data-crew="' + c.id + '" title="' +
        escapeHtml(c.tip) + '">' +
        '<span class="crew-name">' + escapeHtml(c.name) + "</span>" +
        '<span class="crew-role">' + escapeHtml(c.role) + "</span>" +
        '<span class="crew-mood">♥ ' + c.mood + "</span>" +
        "</button>";
    });
    el.crewRow.innerHTML = html || '<p class="crew-empty">No crew aboard yet.</p>';
    var chips = el.crewRow.querySelectorAll("[data-crew]");
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener("click", onCrewTap);
    }
  }

  function onCrewTap(ev) {
    if (state.mode !== "orders") return;
    var id = ev.currentTarget.getAttribute("data-crew");
    var c = crewById(id);
    if (!c) return;
    sfx("click");
    // Quick crew orders — management without reading
    var specials = {
      williams: {
        text: "Williams: recount the shares?",
        choices: [
          { text: "Do it", effects: { gold: -3, morale: 10 }, crewBoost: { williams: 8 }, log: "Shares feel fair again." },
          { text: "Not now", effects: {}, log: "Williams nods and waits." }
        ]
      },
      julian: {
        text: "Julian: trim the sails his way?",
        choices: [
          { text: "Trust him", effects: { food: -1, hull: 4, renown: 1 }, crewBoost: { julian: 10 }, flag: "trustedJulian", log: "Smoother water. Faster miles." },
          { text: "Hold course", effects: {}, log: "You keep the wheel." }
        ]
      },
      davis: {
        text: "Davis: patch the worst leak now?",
        choices: [
          { text: "Repair", effects: { hull: 10, food: -1 }, crewBoost: { davis: 10 }, log: "Fresh oakum. Hull sighs." },
          { text: "Later", effects: { hull: -3 }, log: "The drip continues." }
        ]
      },
      teach: {
        text: "Teach: live powder drill?",
        choices: [
          { text: "Fire!", effects: { renown: 2, hull: -3, morale: -2 }, crewBoost: { teach: 12 }, flag: "drilled", log: "Boom. Ears ring. Guns ready." },
          { text: "Save powder", effects: { morale: 2 }, crewBoost: { teach: -6 }, log: "Teach sulks with a fuse." }
        ]
      },
      goat: {
        text: "Bartholomew stares. He wants a chase.",
        choices: [
          {
            text: "Chase!",
            minigame: "goatchase",
            onWin: { morale: 10, food: 1 },
            onLose: { morale: 3, food: -1 }
          },
          { text: "Scratch his head", effects: { morale: 5 }, crewBoost: { goat: 6 }, log: "The goat forgives you. For now." }
        ]
      }
    };
    var evtdef = specials[id];
    if (!evtdef) return;
    state.mode = "event";
    state.event = {
      id: "crew_" + id,
      art: phase().art,
      text: evtdef.text,
      choices: evtdef.choices
    };
    renderAll();
  }

  function availableActions() {
    var list = window.CAMPAIGN.actions || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.phases && a.phases.indexOf(state.phase) === -1) continue;
      if (a.once && state.usedActions[a.id]) continue;
      out.push(a);
    }
    return out;
  }

  function renderActions() {
    if (!el.actions) return;
    el.actions.innerHTML = "";
    el.actions.classList.remove("mg-active");

    if (state.mode === "ending") {
      renderEndingActions();
      return;
    }

    if (state.mode === "event" && state.event) {
      renderEventChoices(state.event);
      return;
    }

    if (state.mode === "minigame") return;

    var acts = availableActions();
    var n = 0;
    acts.forEach(function (a) {
      var ok = meetsRequires(a.requires);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "order-btn" + (ok ? "" : " is-locked");
      btn.disabled = !ok;
      n++;
      var key = n <= 9 ? n : "";
      btn.innerHTML =
        (key ? '<span class="order-key" aria-hidden="true">' + key + "</span>" : "") +
        '<span class="order-icon" aria-hidden="true">' + (a.icon || "•") + "</span>" +
        '<span class="order-body"><span class="order-label">' + escapeHtml(a.label) + "</span>" +
        '<span class="order-hint">' + escapeHtml(a.hint || "") + "</span></span>";
      if (ok) {
        btn.setAttribute("data-choice-key", String(key));
        btn.addEventListener("click", function () {
          sfx("click");
          runAction(a);
        });
      } else {
        btn.title = "Need better ship stats for this.";
      }
      el.actions.appendChild(btn);
    });

    // Escape hatch mid-campaign
    if (state.phase === "captain" || state.phase === "whydah") {
      var retire = document.createElement("button");
      retire.type = "button";
      retire.className = "order-btn order-soft";
      retire.innerHTML = '<span class="order-body"><span class="order-label">Retire with your gold</span><span class="order-hint">Quit the pirate life.</span></span>';
      retire.addEventListener("click", function () {
        state.flags.retire = true;
        endRun("farmer");
      });
      el.actions.appendChild(retire);
    }
    if (state.phase === "north") {
      var stay = document.createElement("button");
      stay.type = "button";
      stay.className = "order-btn order-soft";
      stay.innerHTML = '<span class="order-body"><span class="order-label">Turn south instead</span><span class="order-hint">Skip Cape Cod. Keep raiding.</span></span>';
      stay.addEventListener("click", function () {
        state.flags.staySouth = true;
        endRun("caribbean");
      });
      el.actions.appendChild(stay);
    }

    setNote("Pick one order. Tap a crew face for a quick call.");
  }

  function renderEventChoices(ev) {
    el.prompt.textContent = ev.text;
    renderArt(ev.art || phase().art);
    (ev.choices || []).forEach(function (ch, idx) {
      var locked = false;
      if (ch.requires && !meetsRequires(ch.requires)) locked = true;
      if (ch.requiresCrew && (!crewById(ch.requiresCrew) || !crewById(ch.requiresCrew).aboard)) locked = true;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "order-btn" + (locked ? " is-locked" : "");
      btn.disabled = locked;
      var num = idx + 1;
      btn.innerHTML =
        '<span class="order-key" aria-hidden="true">' + num + "</span>" +
        '<span class="order-body"><span class="order-label">' + escapeHtml(ch.text) + "</span>" +
        (ch.note ? '<span class="order-hint">' + escapeHtml(ch.note) + "</span>" : "") +
        "</span>";
      if (!locked) {
        btn.setAttribute("data-choice-key", String(num));
        btn.addEventListener("click", function () {
          sfx("click");
          resolveChoice(ch);
        });
      }
      el.actions.appendChild(btn);
    });
    setNote("Decision time.");
  }

  function renderEndingActions() {
    var again = document.createElement("button");
    again.type = "button";
    again.className = "order-btn";
    again.innerHTML = '<span class="order-body"><span class="order-label">New voyage</span><span class="order-hint">Try different orders.</span></span>';
    again.addEventListener("click", restart);
    el.actions.appendChild(again);

    var hof = document.createElement("button");
    hof.type = "button";
    hof.className = "order-btn order-soft";
    hof.innerHTML = '<span class="order-body"><span class="order-label">Hall of Fame</span><span class="order-hint">See your legend score.</span></span>';
    hof.addEventListener("click", openBoard);
    el.actions.appendChild(hof);
    setNote("Voyage over.");
  }

  function renderPrompt() {
    if (state.mode === "ending") return;
    if (state.mode === "event" && state.event) {
      el.prompt.textContent = state.event.text;
      return;
    }
    var intro = window.CAMPAIGN.intros[state.phase] || "";
    var p = phase();
    el.prompt.textContent = intro + (p.blurb ? " " + p.blurb : "");
  }

  function renderHeader() {
    var p = phase();
    if (el.phaseLabel) el.phaseLabel.textContent = p.title;
    if (el.shipLabel) el.shipLabel.textContent = state.ship;
    if (el.dayLabel) el.dayLabel.textContent = "Day " + state.day;
  }

  function renderAll(bumpKeys) {
    if (el.gameCard) el.gameCard.classList.toggle("is-ending", state.mode === "ending");
    renderHeader();
    renderBars(bumpKeys);
    renderCrew();
    renderLog();
    if (state.mode !== "ending") {
      if (el.endingPanel) el.endingPanel.hidden = true;
      renderArt((state.event && state.event.art) || phase().art);
      renderPrompt();
    }
    renderActions();
  }

  /* ---------- Action / event resolution ---------- */

  function runAction(a) {
    if (state.mode !== "orders") return;
    if (!meetsRequires(a.requires)) return;

    if (a.minigame && Math.random() < (a.minigameChance == null ? 1 : a.minigameChance)) {
      startMinigame(a.minigame, {
        onWin: function () {
          finishAction(a, true);
        },
        onLose: function () {
          // Weaker payoff on a flub
          var e = {};
          var src = a.effects || {};
          for (var k in src) {
            if (Object.prototype.hasOwnProperty.call(src, k)) e[k] = src[k];
          }
          if (e.gold) e.gold = Math.max(1, Math.floor(e.gold / 2));
          if (e.renown) e.renown = Math.max(0, e.renown - 1);
          var weak = {
            id: a.id,
            effects: e,
            crewBoost: a.crewBoost,
            flag: a.flag,
            once: a.once,
            advance: a.advance,
            forceAdvancePhase: a.forceAdvancePhase,
            forceEnding: a.forceEnding,
            log: (a.log || "Done.") + " (Rough work.)"
          };
          finishAction(weak, false);
        }
      }, a);
      return;
    }
    finishAction(a, true);
  }

  function finishAction(a, success) {
    var bumped = applyEffects(a.effects);
    applyCrewBoost(a.crewBoost);
    if (a.flag) state.flags[a.flag] = true;
    if (a.once) state.usedActions[a.id] = true;
    pushLog(a.log || "Order carried out.");
    if (success) sfx("victory");
    else sfx("loss");

    var advance = a.advance == null ? 1 : a.advance;
    if (a.forceAdvancePhase) {
      nightTick(false);
      advancePhase();
    } else if (a.forceEnding) {
      resolveStormEnding(success);
      return;
    } else {
      nightTick(advance > 0);
      if (advance > 0) maybeAdvancePhase();
    }

    if (checkFailEndings()) return;
    maybeTriggerEvent();
    save();
    renderAll(bumped);
  }

  function resolveChoice(ch) {
    if (ch.minigame) {
      startMinigame(ch.minigame, {
        onWin: function () {
          state.flags._lastMgWin = true;
          applyEffects(ch.onWin);
          applyCrewBoost(ch.crewBoost);
          if (ch.flag) state.flags[ch.flag] = true;
          pushLog(ch.log || "Nice work.");
          sfx("victory");
          afterEvent(ch.advance == null ? 1 : ch.advance);
        },
        onLose: function () {
          state.flags._lastMgWin = false;
          applyEffects(ch.onLose);
          pushLog("That went sideways.");
          sfx("loss");
          afterEvent(ch.advance == null ? 1 : ch.advance);
        }
      });
      return;
    }
    var bumped = applyEffects(ch.effects);
    applyCrewBoost(ch.crewBoost);
    if (ch.flag) state.flags[ch.flag] = true;
    pushLog(ch.log || "Decided.");
    afterEvent(ch.advance == null ? 1 : ch.advance, bumped);
  }

  function afterEvent(advanceDays, bumped) {
    var stormGate = state.flags._stormGate;
    state.mode = "orders";
    state.event = null;
    if (stormGate) {
      delete state.flags._stormGate;
      resolveStormEnding(!!state.flags._lastMgWin);
      return;
    }
    nightTick(advanceDays > 0);
    if (advanceDays > 0) maybeAdvancePhase();
    if (checkFailEndings()) return;
    save();
    renderAll(bumped || []);
  }

  function nightTick(advanceDay) {
    // Passive drain — management pressure
    if (advanceDay) {
      state.day += 1;
      state.phaseDay += 1;
      state.stats.food = clamp(state.stats.food - 2, 0, 100);
      // Hungry crew get grumpy
      if (state.stats.food < 10) state.stats.morale = clamp(state.stats.morale - 6, 0, 100);
      else state.stats.morale = clamp(state.stats.morale - 1, 0, 100);
      // Happy crew patch small leaks; angry crew don't
      var mood = avgCrewMood();
      if (mood >= 70) state.stats.hull = clamp(state.stats.hull + 1, 0, 100);
      else if (mood <= 35) state.stats.hull = clamp(state.stats.hull - 2, 0, 100);
      // Sync morale toward crew average a bit
      state.stats.morale = clamp(Math.round(state.stats.morale * 0.7 + mood * 0.3), 0, 100);
    }
  }

  function maybeAdvancePhase() {
    var p = phase();
    if (!p) return;
    if (p.final) {
      // Storm can't wait forever — shove the player to the wheel.
      if (state.phaseDay >= (p.days || 3) && !state.flags.stormTried && state.mode === "orders") {
        state.mode = "event";
        state.event = {
          id: "storm_must_helm",
          art: "storm",
          text: "The sea won't wait. Take the wheel — now.",
          choices: [
            {
              text: "Take the wheel",
              minigame: "helm",
              onWin: { renown: 5 },
              onLose: { hull: -20, morale: -8 },
              log: "Into the black water."
            }
          ]
        };
        // Mark so resolveChoice storm path still ends the run
        state.flags._stormGate = true;
      }
      return;
    }
    if (state.phaseDay >= (p.days || 4)) advancePhase();
  }

  function advancePhase() {
    var p = phase();
    if (!p || !p.next) return;
    state.phase = p.next;
    state.phaseDay = 0;
    var np = phase();
    if (np.setShip) state.ship = np.setShip;
    else if (np.ship) state.ship = np.ship;
    syncCrewAboard();
    // Boarding gifts
    if (state.phase === "hornigold") {
      state.stats.gold += 4;
      state.stats.food += 6;
      pushLog("Hornigold's crew takes you in.");
    }
    if (state.phase === "captain") {
      state.stats.renown += 5;
      state.stats.morale += 8;
      pushLog("They cheer: Captain Bellamy!");
    }
    if (state.phase === "whydah") {
      pushLog("Whydah sighted. Make your move.");
    }
    if (state.phase === "north") {
      state.ship = "Whydah Gally";
      state.stats.gold += 10;
      pushLog("Holds full. Point her north.");
    }
    if (state.phase === "storm") {
      pushLog("Wind screams. No more easy days.");
      state.mode = "orders";
    }
    // Show phase blurb as a soft event once
    state.mode = "event";
    state.event = {
      id: "phase_" + state.phase,
      art: np.art,
      text: (window.CAMPAIGN.intros[state.phase] || np.blurb),
      choices: [
        { text: "Aye", effects: {}, log: np.title + ".", advance: 0 }
      ]
    };
  }

  function maybeTriggerEvent() {
    if (state.mode !== "orders") return;
    if (Math.random() > 0.42) return;
    var pool = (window.CAMPAIGN.events || []).filter(function (ev) {
      if (ev.phases && ev.phases.indexOf(state.phase) === -1) return false;
      if (state.usedEvents[ev.id]) return false;
      if (ev.requiresFlag && !state.flags[ev.requiresFlag]) return false;
      if (typeof ev.when === "function" && !ev.when(state)) return false;
      return true;
    });
    if (!pool.length) return;
    var ev = pool[Math.floor(Math.random() * pool.length)];
    state.usedEvents[ev.id] = true;
    state.mode = "event";
    state.event = ev;
  }

  function checkFailEndings() {
    if (state.stats.morale <= 0) { endRun("mutiny"); return true; }
    if (state.stats.hull <= 0) { endRun("sunk"); return true; }
    if (state.stats.food <= 0 && state.stats.morale <= 15) { endRun("starve"); return true; }
    // Random Navy catch if renown high and hull low in open water
    if (!state.flags.caught && (state.phase === "captain" || state.phase === "north") &&
        state.stats.renown >= 30 && state.stats.hull <= 15 && Math.random() < 0.15) {
      state.flags.caught = true;
      endRun("gallows");
      return true;
    }
    return false;
  }

  function resolveStormEnding(success) {
    state.flags.stormTried = true;
    if (success) {
      state.flags.stormHero = true;
      state.stats.renown = clamp(state.stats.renown + 8, 0, 99);
      state.stats.hull = clamp(state.stats.hull - 10, 0, 100);
    } else {
      state.stats.hull = clamp(state.stats.hull - 25, 0, 100);
      state.stats.morale = clamp(state.stats.morale - 10, 0, 100);
    }
    // Pick best matching ending
    var order = ["legend", "pilot", "survivor", "wreck"];
    for (var i = 0; i < order.length; i++) {
      var e = window.CAMPAIGN.endings[order[i]];
      if (e && e.when(state)) {
        endRun(order[i]);
        return;
      }
    }
    endRun("wreck");
  }

  function endRun(key) {
    cancelMinigame();
    var ending = window.CAMPAIGN.endings[key];
    if (!ending) ending = window.CAMPAIGN.endings.wreck;
    state.mode = "ending";
    state.event = null;
    state.endingId = ending.id;
    state.endingKey = key;
    sfx("bell");
    renderArt(ending.art);
    if (el.prompt) el.prompt.textContent = ending.title;
    if (el.endingPanel) {
      el.endingPanel.hidden = false;
      el.endingPanel.innerHTML =
        '<span class="ending-badge">' + escapeHtml(ending.badge) + "</span>" +
        "<h2>" + escapeHtml(ending.title) + "</h2>" +
        "<p>" + escapeHtml(ending.text) + "</p>" +
        '<p class="epilogue">' + escapeHtml(ending.epilogue) + "</p>";
      attachScore(ending);
    }
    pushLog(ending.title);
    save();
    renderAll([]);
  }

  function attachScore(ending) {
    if (!window.SCOREBOARD || !el.endingPanel) return;
    // Adapt stats for scoreboard (expects gold/crew/renown)
    var scoreState = {
      stats: {
        gold: state.stats.gold,
        crew: Math.round(avgCrewMood() / 5),
        renown: state.stats.renown
      },
      scores: state.scores,
      flags: state.flags
    };
    var panel = document.createElement("div");
    panel.className = "score-wrap";
    var endingId = ending.id;
    var title = ending.title;
    var scoreObj, rank, totalRuns, entryId, defaultName;
    if (!state.recorded) {
      var board = window.SCOREBOARD.loadBoard();
      defaultName = board.lastName || "Black Sam";
      var rec = window.SCOREBOARD.recordRun(scoreState, endingId, title, defaultName);
      lastRecorded = rec;
      scoreObj = rec.score; rank = rec.rank; totalRuns = rec.totalRuns; entryId = rec.entry.id;
      state.recorded = true;
      save();
    } else {
      scoreObj = window.SCOREBOARD.computeScore(scoreState, endingId);
      rank = 0; totalRuns = 0;
      defaultName = (lastRecorded && lastRecorded.entry && lastRecorded.entry.name) || "Black Sam";
      entryId = lastRecorded && lastRecorded.entry && lastRecorded.entry.id;
    }
    panel.innerHTML = window.SCOREBOARD.scorePanelHtml(scoreObj, rank || 1, totalRuns || 1);
    if (entryId) {
      var nameRow = document.createElement("label");
      nameRow.className = "score-name-row";
      nameRow.innerHTML = "<span>Captain name:</span>";
      var input = document.createElement("input");
      input.className = "score-name-input";
      input.type = "text";
      input.maxLength = 24;
      input.value = defaultName;
      input.addEventListener("input", function () {
        window.SCOREBOARD.updateEntryName(entryId, input.value.trim() || "Black Sam");
      });
      nameRow.appendChild(input);
      panel.appendChild(nameRow);
    }
    el.endingPanel.appendChild(panel);
  }

  function startMinigame(name, handlers, actionRef) {
    cancelMinigame();
    var game = window.MINIGAMES && window.MINIGAMES[name];
    if (!game) {
      if (handlers && handlers.onWin) handlers.onWin();
      return;
    }
    state.mode = "minigame";
    el.actions.innerHTML = "";
    el.actions.classList.add("mg-active");
    el.prompt.textContent = "Your hands on the work — go!";
    setNote("Mini-game");
    pendingAfterMinigame = handlers;
    var opts = {};
    if (name === "helm") {
      var julianHelp = !!state.flags.trustedJulian ||
        (crewById("julian") && crewById("julian").aboard && crewById("julian").mood >= 60);
      opts = { drift: julianHelp ? 0.65 : 1.15, duration: julianHelp ? 18 : 22 };
    }
    activeMinigame = game.mount(el.actions, opts, function (result) {
      activeMinigame = null;
      state.scores[name] = result.score || 0;
      var h = pendingAfterMinigame;
      pendingAfterMinigame = null;
      state.mode = "orders";
      if (result.success) {
        if (h && h.onWin) h.onWin(result);
      } else {
        if (h && h.onLose) h.onLose(result);
      }
    }) || null;
  }

  /* ---------- Shell ---------- */

  function startGame(fromSave) {
    cancelMinigame();
    if (!fromSave) {
      var keep = state.sound;
      state = freshState();
      state.sound = keep;
      pushLog("Voyage begins.");
      // Opening beat
      state.mode = "event";
      state.event = {
        id: "boot",
        art: "shore",
        text: "Cape Cod, 1715. Spanish gold sank off Florida. What's first?",
        choices: [
          { text: "Find Williams", effects: { renown: 1 }, log: "Williams shakes your hand. Partnership on.", flag: "metWilliams" },
          { text: "See Maria first", effects: { morale: 8, renown: 1 }, log: "Orchard promise. Then the sea.", flag: "promisedMaria" },
          { text: "Straight to a ship", effects: { gold: -2, food: 4 }, log: "You ship out hungry for silver." }
        ]
      };
      save();
    }
    if (el.titleCard) el.titleCard.hidden = true;
    if (el.boardCard) el.boardCard.hidden = true;
    if (el.gameCard) el.gameCard.hidden = false;
    if (window.SFX && state.sound) window.SFX.startSea();
    syncCrewAboard();
    renderAll([]);
  }

  function restart() {
    cancelMinigame();
    var keep = state.sound;
    clearSave();
    state = freshState();
    state.sound = keep;
    if (el.gameCard) el.gameCard.hidden = true;
    if (el.boardCard) el.boardCard.hidden = true;
    if (el.titleCard) el.titleCard.hidden = false;
    refreshContinue();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function refreshContinue() {
    var saved = load();
    var mid = saved && saved.mode !== "ending" && saved.day > 1;
    if (el.continueBtn) el.continueBtn.hidden = !mid;
  }

  function openBoard() {
    cancelMinigame();
    if (window.SCOREBOARD && el.boardBody) window.SCOREBOARD.renderInto(el.boardBody);
    if (el.titleCard) el.titleCard.hidden = true;
    if (el.gameCard) el.gameCard.hidden = true;
    if (el.boardCard) el.boardCard.hidden = false;
    if (el.boardTitle && el.boardTitle.focus) {
      try { el.boardTitle.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }
  function closeBoard() {
    if (el.boardCard) el.boardCard.hidden = true;
    if (el.gameCard) el.gameCard.hidden = true;
    if (el.titleCard) el.titleCard.hidden = false;
    refreshContinue();
  }
  function clearBoard() {
    if (!window.SCOREBOARD) return;
    var ok = true;
    try { ok = window.confirm("Erase the Hall of Fame?"); } catch (e) { /* ignore */ }
    if (!ok) return;
    window.SCOREBOARD.clear();
    lastRecorded = null;
    if (el.boardBody) window.SCOREBOARD.renderInto(el.boardBody);
  }

  function refreshMute() {
    if (!el.muteBtn) return;
    el.muteBtn.textContent = state.sound ? "♫ Sound On" : "♪ Sound Off";
    el.muteBtn.setAttribute("aria-pressed", state.sound ? "true" : "false");
  }
  function toggleSound() {
    state.sound = !state.sound;
    if (window.SFX) {
      window.SFX.setMuted(!state.sound);
      if (state.sound) { window.SFX.startSea(); window.SFX.click(); }
    }
    refreshMute();
    save();
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Keys 1-9
  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    var key = e.key;
    if (typeof key !== "string" || key.length !== 1 || key < "1" || key > "9") return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (!el.gameCard || el.gameCard.hidden) return;
    if (activeMinigame || (el.actions && el.actions.classList.contains("mg-active"))) return;
    var btn = el.actions && el.actions.querySelector('[data-choice-key="' + key + '"]');
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  });

  if (el.startBtn) el.startBtn.addEventListener("click", function () { startGame(false); });
  if (el.continueBtn) el.continueBtn.addEventListener("click", function () {
    var saved = load();
    if (saved) {
      state = saved;
      if (window.SFX) window.SFX.setMuted(!state.sound);
      refreshMute();
      startGame(true);
    } else startGame(false);
  });
  if (el.restartBtn) el.restartBtn.addEventListener("click", restart);
  if (el.muteBtn) el.muteBtn.addEventListener("click", toggleSound);
  if (el.boardBtn) el.boardBtn.addEventListener("click", openBoard);
  if (el.boardBackBtn) el.boardBackBtn.addEventListener("click", closeBoard);
  if (el.boardClearBtn) el.boardClearBtn.addEventListener("click", clearBoard);

  (function init() {
    var saved = load();
    if (saved && typeof saved.sound === "boolean") state.sound = saved.sound;
    if (window.SFX) window.SFX.setMuted(!state.sound);
    refreshMute();
    refreshContinue();
  })();
})();
