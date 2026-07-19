/*
 * Captain Bellamy — Hall of Fame (local scoreboard)
 *
 * Legend Score = Fortune + Skill + Fate + Discovery
 */
(function () {
  "use strict";

  var KEY = "blacksam.board.v2";
  var MAX_RUNS = 12;
  var TOTAL_ENDINGS = 10;

  var ENDING_VALUES = {
    ending_pilot: 1200,
    ending_legend: 1000,
    ending_survivor: 800,
    ending_caribbean: 650,
    ending_wreck: 500,
    ending_gallows: 450,
    ending_mutiny: 400,
    ending_sunk: 380,
    ending_starve: 350,
    ending_farmer: 250
  };

  var ENDING_BADGES = {
    ending_pilot: "Master Pilot",
    ending_legend: "Legend",
    ending_survivor: "Survivor",
    ending_caribbean: "Caribbean King",
    ending_wreck: "Shipwreck",
    ending_gallows: "Caught",
    ending_mutiny: "Mutiny",
    ending_sunk: "Lost Ship",
    ending_starve: "Starved Out",
    ending_farmer: "Quiet Life"
  };

  var SKILL_WEIGHTS = {
    dig: 40, duel: 60, cannon: 60, helm: 3,
    dice: 12, knots: 45, lookout: 45, goatchase: 40
  };

  function loadBoard() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.runs) {
          d.endings = d.endings || {};
          d.lastName = d.lastName || "";
          return d;
        }
      }
    } catch (e) { /* ignore */ }
    return { runs: [], endings: {}, lastName: "" };
  }
  function saveBoard(b) {
    try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) { /* ignore */ }
  }

  function endingBadge(id) {
    if (ENDING_BADGES[id]) return ENDING_BADGES[id];
    var ends = window.CAMPAIGN && window.CAMPAIGN.endings;
    if (ends) {
      for (var k in ends) {
        if (ends[k] && ends[k].id === id) return ends[k].badge || id;
      }
    }
    return "Unknown Fate";
  }

  function computeScore(state, endingId) {
    var s = state.stats || { gold: 0, crew: 0, renown: 0 };
    var fortune = (s.gold + s.crew + s.renown) * 100;
    var skill = 0;
    var scores = state.scores || {};
    for (var g in SKILL_WEIGHTS) {
      if (Object.prototype.hasOwnProperty.call(scores, g) && scores[g] != null) {
        skill += Math.round(scores[g] * SKILL_WEIGHTS[g]);
      }
    }
    var fate = ENDING_VALUES[endingId] || 300;
    var board = loadBoard();
    var discovered = {};
    for (var k in board.endings) discovered[k] = true;
    discovered[endingId] = true;
    var discoveredCount = Object.keys(discovered).length;
    var discovery = discoveredCount * 200;
    return {
      total: fortune + skill + fate + discovery,
      fortune: fortune, skill: skill, fate: fate,
      discovery: discovery, discoveredCount: discoveredCount
    };
  }

  function makeId() {
    return String(Date.now()) + "-" + Math.floor(Math.random() * 1e6);
  }

  function recordRun(state, endingId, endingTitle, name) {
    var board = loadBoard();
    var sc = computeScore(state, endingId);
    var st = (state && state.stats) || {};
    var entry = {
      id: makeId(),
      name: (name || "Black Sam").slice(0, 24),
      endingId: endingId,
      endingTitle: endingTitle || endingId,
      badge: endingBadge(endingId),
      score: sc.total,
      parts: sc,
      stats: { gold: st.gold || 0, crew: st.crew || 0, renown: st.renown || 0 },
      ts: Date.now(),
      date: friendlyDate()
    };
    board.endings[endingId] = (board.endings[endingId] || 0) + 1;
    if (name) board.lastName = entry.name;
    board.runs.push(entry);
    board.runs.sort(function (a, b) { return (b.score - a.score) || (b.ts - a.ts); });
    var rank = 0;
    for (var i = 0; i < board.runs.length; i++) {
      if (board.runs[i].id === entry.id) { rank = i + 1; break; }
    }
    if (board.runs.length > MAX_RUNS) board.runs = board.runs.slice(0, MAX_RUNS);
    saveBoard(board);
    return { entry: entry, rank: rank, totalRuns: board.runs.length, score: sc, board: board };
  }

  function updateEntryName(id, name) {
    var board = loadBoard();
    var clean = (name || "Black Sam").slice(0, 24);
    board.lastName = clean;
    for (var i = 0; i < board.runs.length; i++) {
      if (board.runs[i].id === id) { board.runs[i].name = clean; break; }
    }
    saveBoard(board);
  }

  function clear() { saveBoard({ runs: [], endings: {}, lastName: loadBoard().lastName }); }

  function friendlyDate() {
    try {
      return new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return ""; }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  function scorePanelHtml(scoreObj, rank, totalRuns) {
    var rankLine = rank === 1
      ? "A new personal best — your greatest voyage yet!"
      : "Voyage ranked <strong>#" + rank + "</strong> of " + totalRuns + " in your Hall of Fame.";
    return '<div class="score-panel">' +
      '<p class="score-kicker">Legend Score</p>' +
      '<p class="score-total">' + num(scoreObj.total) + '</p>' +
      '<div class="score-parts">' +
        '<span><strong>' + num(scoreObj.fortune) + '</strong> Fortune</span>' +
        '<span><strong>' + num(scoreObj.skill) + '</strong> Skill</span>' +
        '<span><strong>' + num(scoreObj.fate) + '</strong> Fate</span>' +
        '<span><strong>' + scoreObj.discoveredCount + '/' + TOTAL_ENDINGS + '</strong> Endings</span>' +
      '</div>' +
      '<p class="score-rank">' + rankLine + '</p>' +
    '</div>';
  }

  function renderInto(container) {
    if (!container) return;
    var board = loadBoard();
    var html = "";

    if (board.runs.length) {
      var best = board.runs[0];
      for (var b = 1; b < board.runs.length; b++) {
        if (board.runs[b] && board.runs[b].score > best.score) best = board.runs[b];
      }
      html += '<div class="board-best" style="text-align:center;margin:0 0 16px;padding:10px 14px;border:1px solid rgba(212,175,55,0.4);border-radius:10px;">' +
        '<span style="display:block;font-size:0.72em;letter-spacing:0.14em;text-transform:uppercase;opacity:0.7;">Greatest Legend</span>' +
        '<strong style="font-size:1.3em;">' + num(best.score) + '</strong>' +
        '<span style="display:block;font-size:0.85em;opacity:0.85;">' + esc(best.name) + ' &mdash; ' + esc(best.badge) + '</span>' +
      '</div>';
    }

    var ids = Object.keys(ENDING_VALUES).sort(function (a, b) { return ENDING_VALUES[b] - ENDING_VALUES[a]; });
    var found = ids.filter(function (id) { return board.endings[id]; }).length;
    html += '<div class="board-collection">' +
      '<p class="board-section-title">Endings Discovered — <strong>' + found + ' / ' + TOTAL_ENDINGS + '</strong></p>' +
      '<div class="collection-grid">';
    ids.forEach(function (id) {
      var got = !!board.endings[id];
      html += '<div class="collection-cell' + (got ? " got" : "") + '">' +
        '<span class="collection-mark">' + (got ? "&#9873;" : "&#63;") + '</span>' +
        '<span class="collection-label">' + (got ? esc(endingBadge(id)) : "Undiscovered") + '</span>' +
      '</div>';
    });
    html += '</div></div>';

    html += '<p class="board-section-title">Greatest Voyages</p>';
    if (!board.runs.length) {
      html += '<p class="board-empty">No voyages logged yet. Take command and make history.</p>';
    } else {
      var medals = ["🥇", "🥈", "🥉"];
      html += '<ol class="board-list">';
      board.runs.forEach(function (r, i) {
        var rankLabel = i < 3 ? medals[i] : (i + 1);
        var st = r.stats;
        var statLine = st
          ? '<span style="display:block;font-size:0.76em;font-weight:normal;opacity:0.65;margin-top:1px;">' +
              num(st.gold || 0) + ' gold &middot; ' +
              num(st.crew || 0) + ' crew mood &middot; ' +
              num(st.renown || 0) + ' renown</span>'
          : "";
        var p = r.parts;
        var tip = p
          ? "Fortune " + num(p.fortune || 0) + " + Skill " + num(p.skill || 0) +
            " + Fate " + num(p.fate || 0) + " + Discovery " + num(p.discovery || 0)
          : "";
        html += '<li class="board-row' + (i < 3 ? " board-top" : "") + '"' +
          (tip ? ' title="' + esc(tip) + '"' : "") + '>' +
          '<span class="board-rank">' + rankLabel + '</span>' +
          '<span class="board-name">' + esc(r.name) + statLine + '</span>' +
          '<span class="board-badge">' + esc(r.badge) + '</span>' +
          '<span class="board-score">' + num(r.score) + '</span>' +
          '<span class="board-date">' + esc(r.date) + '</span>' +
        '</li>';
      });
      html += '</ol>';
    }

    container.innerHTML = html;
  }

  window.SCOREBOARD = {
    computeScore: computeScore,
    recordRun: recordRun,
    updateEntryName: updateEntryName,
    loadBoard: loadBoard,
    clear: clear,
    scorePanelHtml: scorePanelHtml,
    renderInto: renderInto,
    TOTAL_ENDINGS: TOTAL_ENDINGS
  };
})();
