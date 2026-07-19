/* Whydah unit: day banner config + renderer.
   Loaded by whydah-dashboard.html and every dayN.html page.

   HOW TO USE (teacher notes):
   - Normally touch nothing. The banner picks today's entry by date (Eastern time).
   - To FORCE one day for everyone: set WHYDAH_FORCE to a day number, push both repos.
   - To override on THIS DEVICE only: Crew Quarters > Teacher Toolkit > Banner Control.
*/

window.WHYDAH_FORCE = null; /* e.g. 6 forces Day 6 for everyone. null = automatic. */

window.WHYDAH_DAYS = [
  { day: 2,  date: '2026-07-07', title: 'What Is a Map?',             url: 'day2.html' },
  { day: 3,  date: '2026-07-08', title: 'Reading the 1719 World Map', url: 'day3.html' },
  { day: 4,  date: '2026-07-13', title: 'Adopt a Ship',               url: 'day4.html' },
  { day: 5,  date: '2026-07-14', title: 'Out of the Machine',            url: 'day5.html' },
  { day: 6,  date: '2026-07-15', title: 'Real Pirates + Salem Maritime', url: 'day6.html', kind: 'trip' },
  { day: 7,  date: '2026-07-16', title: 'Life at Sea: Kayak Day',     url: 'day7.html', kind: 'trip' },
  { day: 8,  date: '2026-07-20', title: 'The Vote',                   url: 'day8.html' },
  { day: 9,  date: '2026-07-21', title: 'Sign the Articles',          url: 'day9.html' },
  { day: 10, date: '2026-07-22', title: 'The Wreck',                  url: 'day10.html' },
  { day: 11, date: '2026-07-23', title: 'Georges Island',             url: 'day11.html', kind: 'trip' },
  { day: 12, date: '2026-07-27', title: 'Lost and Found',             url: 'day12.html' },
  { day: 13, date: '2026-07-28', title: 'Chokepoints: Then and Now',  url: 'day13.html' },
  { day: 14, date: '2026-07-29', title: 'Salem Then and Now',         url: 'day14.html' },
  { day: 15, date: '2026-07-30', title: 'Pitch Day',                  url: 'day15.html' },
  { day: 16, date: '2026-08-03', title: 'Synthesis Studio',           url: 'day16.html' },
  { day: 17, date: '2026-08-04', title: 'Build Day 1',                url: 'day17.html' },
  { day: 18, date: '2026-08-05', title: 'Build Day 2',                url: 'day18.html' },
  { day: 19, date: '2026-08-06', title: 'The Showcase',               url: 'day19.html', kind: 'showcase' }
];

/* ===================== EDIT ABOVE THIS LINE ONLY ===================== */

(function () {
  'use strict';

  var OVERRIDE_KEY = 'whydah-banner-override-v1';
  var POINTS_KEY = 'whydah-crew-points-v1';

  function todayET() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    } catch (_) {
      var d = new Date();
      var m = ('0' + (d.getMonth() + 1)).slice(-2);
      var day = ('0' + d.getDate()).slice(-2);
      return d.getFullYear() + '-' + m + '-' + day;
    }
  }

  function getOverride() {
    try { return localStorage.getItem(OVERRIDE_KEY); } catch (_) { return null; }
  }
  function setOverride(v) {
    try {
      if (v && v !== 'auto') localStorage.setItem(OVERRIDE_KEY, v);
      else localStorage.removeItem(OVERRIDE_KEY);
    } catch (_) {}
  }

  function byDay(n) {
    for (var i = 0; i < window.WHYDAH_DAYS.length; i++) {
      if (window.WHYDAH_DAYS[i].day === n) return window.WHYDAH_DAYS[i];
    }
    return null;
  }

  /* Returns { entry, mode } where mode is 'today' | 'next' | 'none'. Pure; testable. */
  function pickBanner(days, today, force, override) {
    if (override === 'off') return { entry: null, mode: 'none' };
    if (override && override.indexOf('day') === 0) {
      var n = parseInt(override.slice(3), 10);
      var e = byDay(n);
      if (e) return { entry: e, mode: 'today' };
    }
    if (force != null) {
      var f = byDay(force);
      if (f) return { entry: f, mode: 'today' };
    }
    var next = null;
    for (var i = 0; i < days.length; i++) {
      if (days[i].date === today) return { entry: days[i], mode: 'today' };
      if (days[i].date > today && (next === null || days[i].date < next.date)) next = days[i];
    }
    if (next) return { entry: next, mode: 'next' };
    return { entry: null, mode: 'none' };
  }

  function prettyDate(iso) {
    try {
      var parts = iso.split('-');
      var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12));
      return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d);
    } catch (_) { return iso; }
  }

  var BANNER_STYLE = 'display:block; background:#8C2C1E; color:#F3E8CE; text-align:center; padding:0.85em 1em; font-weight:700; font-size:1.08em; text-decoration:none; letter-spacing:0.02em; border-bottom:2px solid #D8B25A;';
  var NEXT_STYLE = 'display:block; background:#1C3743; color:#C7BCA0; text-align:center; padding:0.7em 1em; font-weight:700; font-size:1em; text-decoration:none; letter-spacing:0.02em; border-bottom:2px solid #A9781F;';

  function prefixFor(entry) {
    if (entry.kind === 'trip') return '⚓ FIELD TRIP';
    if (entry.kind === 'showcase') return '🏴‍☠️ SHOWCASE DAY';
    return '📍 TODAY';
  }

  function onOwnPage(entry) {
    if (!entry || !entry.url) return false;
    var path = (window.location.pathname || '').split('/').pop();
    return path === entry.url;
  }

  function renderBanner() {
    var slot = document.getElementById('today-banner');
    if (!slot) return;
    var pick = pickBanner(window.WHYDAH_DAYS, todayET(), window.WHYDAH_FORCE, getOverride());
    slot.innerHTML = '';
    if (!pick.entry) return;
    var e = pick.entry;
    var el;
    if (pick.mode === 'today') {
      if (onOwnPage(e)) {
        el = document.createElement('div');
        el.setAttribute('style', BANNER_STYLE);
        el.textContent = '⚓ You’re aboard · Day ' + e.day + ': ' + e.title;
      } else if (e.url) {
        el = document.createElement('a');
        el.href = e.url;
        el.setAttribute('style', BANNER_STYLE);
        el.innerHTML = prefixFor(e) + ' · Day ' + e.day + ': ' + e.title + ' · <u>tap here to start</u>';
      } else {
        el = document.createElement('div');
        el.setAttribute('style', BANNER_STYLE);
        el.textContent = prefixFor(e) + ' · Day ' + e.day + ': ' + e.title;
      }
    } else { /* next */
      el = document.createElement(e.url ? 'a' : 'div');
      if (e.url) el.href = e.url;
      el.setAttribute('style', NEXT_STYLE);
      el.textContent = 'Next voyage · Day ' + e.day + ': ' + e.title + ' (' + prettyDate(e.date) + ')';
    }
    slot.appendChild(el);
  }

  function renderCountdown() {
    var span = document.getElementById('showcase-countdown');
    if (!span) return;
    var today = todayET();
    var remaining = 0;
    for (var i = 0; i < window.WHYDAH_DAYS.length; i++) {
      if (window.WHYDAH_DAYS[i].date >= today) remaining++;
    }
    if (remaining > 0) {
      span.textContent = remaining === 1
        ? 'The Showcase is TODAY.'
        : remaining + ' class days until the Showcase.';
    }
  }

  /* ---- Banner Control panel (only exists in Crew Quarters) ---- */
  function wireOverridePanel() {
    var panel = document.getElementById('banner-override-panel');
    if (!panel) return;
    var select = panel.querySelector('select');
    var status = panel.querySelector('[data-role="status"]');
    if (!select) return;

    select.innerHTML = '';
    var optAuto = document.createElement('option');
    optAuto.value = 'auto'; optAuto.textContent = 'Automatic (by date)';
    select.appendChild(optAuto);
    window.WHYDAH_DAYS.forEach(function (d) {
      var o = document.createElement('option');
      o.value = 'day' + d.day;
      o.textContent = 'Day ' + d.day + ': ' + d.title + ' (' + d.date + ')';
      select.appendChild(o);
    });
    var optOff = document.createElement('option');
    optOff.value = 'off'; optOff.textContent = 'Hide the banner (this device)';
    select.appendChild(optOff);

    var current = getOverride() || 'auto';
    select.value = current;

    function refreshStatus() {
      if (!status) return;
      var pick = pickBanner(window.WHYDAH_DAYS, todayET(), window.WHYDAH_FORCE, getOverride());
      var showing = pick.entry ? ('Day ' + pick.entry.day + ' (' + pick.mode + ')') : 'nothing';
      var mode = getOverride() ? 'OVERRIDE: ' + getOverride() : 'AUTO';
      status.textContent = 'This device: ' + mode + ' · currently showing ' + showing + '.';
    }

    select.addEventListener('change', function () {
      setOverride(select.value);
      renderBanner();
      refreshStatus();
    });
    refreshStatus();
  }

  /* ---- Crew Points (teacher device only; the class sees the projector) ---- */
  function loadPoints() {
    try {
      var raw = localStorage.getItem(POINTS_KEY);
      if (raw) { var p = JSON.parse(raw); if (p && p.crews) return p; }
    } catch (_) {}
    return { crews: [] };
  }
  function savePoints(p) {
    try { localStorage.setItem(POINTS_KEY, JSON.stringify(p)); } catch (_) {}
  }

  function wireCrewPoints() {
    var panel = document.getElementById('crew-points-panel');
    if (!panel) return;
    var listEl = panel.querySelector('[data-role="crew-list"]');
    var addBtn = panel.querySelector('[data-role="add-crew"]');
    var nameInput = panel.querySelector('[data-role="crew-name"]');
    var projectBtn = panel.querySelector('[data-role="project-board"]');
    if (!listEl) return;

    function render() {
      var p = loadPoints();
      listEl.innerHTML = '';
      if (!p.crews.length) {
        var empty = document.createElement('p');
        empty.style.cssText = 'font-style:italic; opacity:.75; margin:.4em 0;';
        empty.textContent = 'No crews yet. Add one below.';
        listEl.appendChild(empty);
      }
      p.crews.forEach(function (crew, idx) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:.5em; padding:.35em 0; border-bottom:1px dashed #c4b590;';
        var name = document.createElement('strong');
        name.textContent = crew.name;
        name.style.cssText = 'flex:1;';
        var pts = document.createElement('span');
        pts.textContent = crew.points;
        pts.style.cssText = 'min-width:2.5em; text-align:right; font-variant-numeric:tabular-nums; font-weight:700;';
        row.appendChild(name); row.appendChild(pts);
        [['-1', -1], ['+1', 1], ['+5', 5]].forEach(function (pair) {
          var b = document.createElement('button');
          b.type = 'button'; b.textContent = pair[0];
          b.style.cssText = 'padding:.15em .6em; cursor:pointer;';
          b.addEventListener('click', function () {
            var cur = loadPoints();
            cur.crews[idx].points += pair[1];
            savePoints(cur); render();
          });
          row.appendChild(b);
        });
        var del = document.createElement('button');
        del.type = 'button'; del.textContent = '×';
        del.title = 'Remove crew';
        del.style.cssText = 'padding:.15em .5em; cursor:pointer; opacity:.6;';
        del.addEventListener('click', function () {
          if (!window.confirm('Remove crew "' + crew.name + '"?')) return;
          var cur = loadPoints();
          cur.crews.splice(idx, 1);
          savePoints(cur); render();
        });
        row.appendChild(del);
        listEl.appendChild(row);
      });
    }

    if (addBtn && nameInput) {
      addBtn.addEventListener('click', function () {
        var name = (nameInput.value || '').trim();
        if (!name) return;
        var p = loadPoints();
        p.crews.push({ name: name, points: 0 });
        savePoints(p); nameInput.value = ''; render();
      });
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
      });
    }

    if (projectBtn) {
      projectBtn.addEventListener('click', function () {
        var p = loadPoints();
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; background:#12222B; color:#F3E8CE; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:Georgia,serif; cursor:pointer;';
        var h = document.createElement('div');
        h.textContent = '⚓ CREW POINTS';
        h.style.cssText = 'font-size:3em; font-weight:700; color:#D8B25A; margin-bottom:.5em; letter-spacing:.08em;';
        overlay.appendChild(h);
        var sorted = p.crews.slice().sort(function (a, b) { return b.points - a.points; });
        sorted.forEach(function (crew, i) {
          var row = document.createElement('div');
          row.style.cssText = 'font-size:2.2em; padding:.15em 0; display:flex; gap:1em; min-width:60%; justify-content:space-between;' + (i === 0 ? 'color:#D8B25A;' : '');
          var n = document.createElement('span');
          n.textContent = (i === 0 && crew.points > 0 ? '🏴‍☠️ ' : '') + crew.name;
          var v = document.createElement('span');
          v.textContent = crew.points;
          v.style.cssText = 'font-variant-numeric:tabular-nums; font-weight:700;';
          row.appendChild(n); row.appendChild(v);
          overlay.appendChild(row);
        });
        var hint = document.createElement('div');
        hint.textContent = 'click anywhere or press Esc to close';
        hint.style.cssText = 'margin-top:1.5em; font-size:.9em; opacity:.6;';
        overlay.appendChild(hint);
        function close() {
          overlay.remove();
          document.removeEventListener('keydown', onKey);
        }
        function onKey(e) { if (e.key === 'Escape') close(); }
        overlay.addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
      });
    }

    render();
  }

  function init() {
    renderBanner();
    renderCountdown();
    wireOverridePanel();
    wireCrewPoints();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* exposed for tests */
  window.WHYDAH_PICK_BANNER = pickBanner;
})();
