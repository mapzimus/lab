"use strict";

const DATA_URL = "/lab/world-xi/data/clubs.geojson";
const CREST_SIZE = 128; // px, matches the thumbnails baked into clubs.geojson
const STORE_KEY = "worldxi.v3";
const FALLBACK_TOP = ["epl", "laliga", "bundesliga", "seriea", "ligue1"];
const FALLBACK_GROUPS = [
  { key: "top", label: "Top men's leagues" },
  { key: "eu", label: "More Europe — men" },
  { key: "americas", label: "Americas — men" },
  { key: "rest", label: "Asia, Africa & Pacific — men" },
  { key: "women", label: "Women" },
];

const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/* ---------------------------------------------------------------- helpers */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const httpsOnly = (url) => (/^https:\/\//.test(String(url ?? "")) ? String(url) : null);

// NFD strips the combining marks; the map covers letters that do not decompose
// (ø, ł, đ, ß …) which the Scandinavian and central-European leagues need.
const FOLD = { "ø": "o", "œ": "oe", "æ": "ae", "ł": "l", "đ": "d", "ð": "d", "þ": "th", "ß": "ss", "ı": "i", "’": "'", "–": "-", "—": "-" };
const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[øœæłđðþßı’–—]/g, (c) => FOLD[c] ?? c);

function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

const R_KM = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}
const fmtKm = (km) => (km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);
const fmtNum = (n) => Number(n).toLocaleString("en-US");
const coordKey = (coords) => coords.join(","); // pipeline rounds to 5 dp

// localStorage can throw on the property access itself under hardened settings
const store = (() => {
  let mem = null;
  return {
    read() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? "null"); }
      catch { return mem; }
    },
    write(value) {
      mem = value;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch { /* session-only */ }
    },
  };
})();

/* ------------------------------------------------------------------ state */

const state = { activeLeagues: new Set(), collapsed: new Set(), selectedQid: null };

let leagues = [];
let groups = [];
let allFeatures = [];
const byQid = new Map();
const byCoord = new Map();
const featuresByLeague = new Map();
let searchIndex = [];
let ranks = new Map();
let nearest = null;
let stats = null;
let popup = null;
let popupQids = [];

/* -------------------------------------------------------------------- map */

let map;
try {
  map = new maplibregl.Map({
    container: "map",
    center: [10, 30],
    zoom: 1.5,
    minZoom: 1.05,
    maxZoom: 15,
    attributionControl: false,
    style: "https://tiles.openfreemap.org/styles/dark",
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
} catch (err) {
  console.error(err);
  document.body.classList.add("map-failed");
}

const readout = document.getElementById("readout");
const setReadout = (text) => { if (readout) readout.textContent = text; };

const legendEl = document.getElementById("legend");
const statsEl = document.getElementById("stats");
const statsBody = document.getElementById("stats-body");
const statsToggle = document.getElementById("stats-toggle");
const searchInput = document.getElementById("club-search");
const searchResults = document.getElementById("search-results");
const searchClear = document.getElementById("search-clear");
const sheetCount = document.getElementById("sheet-count");

/* ----------------------------------------------------------------- crests */

function circleImage(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const g = c.getContext("2d");
  g.beginPath();
  g.arc(24, 24, 20, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = "#f0ecdf";
  g.stroke();
  return g.getImageData(0, 0, 48, 48);
}

// Crest thumbnails arrive around 250px on their long edge. Left alone that is
// ~4x the texture memory they need and renders the icons at roughly twice the
// intended size, because icon-size is expressed as a fraction of CREST_SIZE.
// Normalising the long edge to CREST_SIZE fixes both.
function fitCrest(source) {
  const w = source.width, h = source.height;
  const scale = Math.min(1, CREST_SIZE / Math.max(w, h));
  if (scale === 1) return source;
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(source, 0, 0, cw, ch);
  return g.getImageData(0, 0, cw, ch);
}

// Symbol tiles cache resolved icons; re-setting the (identical) layout
// expression makes freshly added crest images take effect. Each call re-lays
// out every symbol, so this is throttled on a trailing timer rather than fired
// per image — a bulk league toggle would otherwise re-layout every frame.
let refreshTimer = null;
function refreshIcons() {
  if (refreshTimer || !map?.getLayer("clubs")) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (map?.getLayer("clubs")) {
      map.setLayoutProperty("clubs", "icon-image", map.getLayoutProperty("clubs", "icon-image"));
    }
  }, 200);
}

const crestQueue = [];
const crestsRequested = new Set();
let draining = false;

function ensureCrests(leagueKey) {
  if (crestsRequested.has(leagueKey)) return;
  crestsRequested.add(leagueKey);
  for (const f of featuresByLeague.get(leagueKey) ?? []) {
    if (f.properties.crest) crestQueue.push(f);
  }
  drainCrests();
}

// Hiding a league hands its textures back. Without this every league ever
// opened stays resident, which is what pushed the page into the hundreds of
// megabytes and killed tabs on phones.
function releaseCrests(leagueKey) {
  if (!crestsRequested.has(leagueKey)) return;
  crestsRequested.delete(leagueKey);
  for (let i = crestQueue.length - 1; i >= 0; i--) {
    if (crestQueue[i].properties.leagueKey === leagueKey) crestQueue.splice(i, 1);
  }
  if (!map) return;
  for (const f of featuresByLeague.get(leagueKey) ?? []) {
    const id = `club-${f.properties.qid}`;
    if (map.hasImage(id)) { try { map.removeImage(id); } catch { /* already gone */ } }
  }
  refreshIcons();
}

async function drainCrests() {
  if (draining) return;
  draining = true;
  const worker = async () => {
    for (;;) {
      const f = crestQueue.shift();
      if (!f) return;
      const { qid, crest } = f.properties;
      if (map.hasImage(`club-${qid}`)) continue;
      try {
        const img = await map.loadImage(crest);
        // the league may have been switched off while this was in flight
        if (!crestsRequested.has(f.properties.leagueKey)) continue;
        if (!map.hasImage(`club-${qid}`)) map.addImage(`club-${qid}`, fitCrest(img.data));
        refreshIcons();
      } catch { /* keep the colored-dot fallback */ }
    }
  };
  await Promise.allSettled(Array.from({ length: 6 }, worker));
  draining = false;
  refreshIcons();
  if (crestQueue.length) drainCrests();
}

/* ----------------------------------------------------------------- filter */

const leagueFilter = () => ["in", ["get", "leagueKey"], ["literal", [...state.activeLeagues]]];

function applyFilter() {
  if (map?.getLayer("clubs")) {
    map.setFilter("clubs-ring", leagueFilter());
    map.setFilter("clubs", leagueFilter());

    // a popup whose clubs are all hidden no longer describes anything on screen
    if (popup && popupQids.length) {
      const stillShown = popupQids.some((q) => state.activeLeagues.has(byQid.get(q)?.properties.leagueKey));
      if (!stillShown) closePopup();
    }
  }
  updateShownCount();
}

function shownClubCount() {
  return leagues.filter((l) => state.activeLeagues.has(l.key)).reduce((n, l) => n + l.count, 0);
}

function updateShownCount() {
  const n = shownClubCount();
  if (sheetCount) sheetCount.textContent = String(state.activeLeagues.size);
  setReadout(n ? `${fmtNum(n)} clubs shown` : "No leagues shown — pick one from the list");
  const reset = document.getElementById("legend-reset");
  if (reset) reset.hidden = state.activeLeagues.size > 0;
}

/* ----------------------------------------------------------------- legend */

// clubs.geojson is a committed artifact and can lag app.js, so never trust it
// to carry grouping — fall back to the built-in list and bucket by gender.
function normalizeGroups(meta) {
  const gs = Array.isArray(meta.groups) && meta.groups.length ? meta.groups : FALLBACK_GROUPS;
  const known = new Set(gs.map((g) => g.key));
  for (const lg of meta.leagues) {
    if (!lg.group || !known.has(lg.group)) lg.group = lg.gender === "women" ? "women" : "rest";
  }
  return gs;
}

function defaultOn() {
  const top = leagues.filter((l) => l.group === "top").map((l) => l.key);
  return top.length ? top : FALLBACK_TOP;
}

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    store.write({ v: 3, on: [...state.activeLeagues], collapsed: [...state.collapsed] });
  }, 250);
}

function restoreState() {
  const known = new Set(leagues.map((l) => l.key));
  const groupKeys = new Set(groups.map((g) => g.key));
  const saved = store.read();

  if (saved && saved.v === 3 && Array.isArray(saved.on)) {
    // leagues added since the last visit stay off, per the "off until opened" rule
    state.activeLeagues = new Set(saved.on.filter((k) => known.has(k)));
    const collapsed = Array.isArray(saved.collapsed) ? saved.collapsed.filter((k) => groupKeys.has(k)) : [];
    state.collapsed = new Set(collapsed);
  } else {
    state.activeLeagues = new Set(defaultOn());
    state.collapsed = new Set(groups.map((g) => g.key).filter((k) => k !== "top"));
  }
}

function updateSectionHeader(groupKey) {
  const section = legendEl.querySelector(`[data-group="${groupKey}"]`);
  if (!section) return;
  const inGroup = leagues.filter((l) => l.group === groupKey);
  const on = inGroup.filter((l) => state.activeLeagues.has(l.key)).length;
  section.querySelector(".sec-count").innerHTML = `<b>${on}</b>/${inGroup.length}`;
  const all = section.querySelector(".sec-all");
  const allOn = on === inGroup.length;
  all.textContent = allOn ? "None" : "All";
  all.setAttribute("aria-label", `${allOn ? "Hide" : "Show"} all ${inGroup.length} leagues in ${groups.find((g) => g.key === groupKey)?.label}`);
}

function setLeague(key, on) {
  if (on) state.activeLeagues.add(key);
  else state.activeLeagues.delete(key);
  const row = legendEl.querySelector(`[data-league="${key}"]`);
  if (row) row.setAttribute("aria-pressed", String(on));
  const lg = leagues.find((l) => l.key === key);
  if (lg) updateSectionHeader(lg.group);
  if (on) ensureCrests(key); else releaseCrests(key);
  applyFilter();
  persist();
}

function setGroup(groupKey, on) {
  for (const lg of leagues.filter((l) => l.group === groupKey)) {
    if (on) state.activeLeagues.add(lg.key);
    else state.activeLeagues.delete(lg.key);
    const row = legendEl.querySelector(`[data-league="${lg.key}"]`);
    if (row) row.setAttribute("aria-pressed", String(on));
    if (on) ensureCrests(lg.key); else releaseCrests(lg.key);
  }
  updateSectionHeader(groupKey);
  applyFilter();
  persist();
}

function setCollapsed(groupKey, collapsed) {
  if (collapsed) state.collapsed.add(groupKey);
  else state.collapsed.delete(groupKey);
  const section = legendEl.querySelector(`[data-group="${groupKey}"]`);
  if (section) {
    section.querySelector(".sec-toggle").setAttribute("aria-expanded", String(!collapsed));
    section.querySelector(".sec-body").hidden = collapsed;
  }
  persist();
}

function buildLegend() {
  legendEl.innerHTML = "";

  const reset = document.createElement("button");
  reset.type = "button";
  reset.id = "legend-reset";
  reset.className = "legend-reset";
  reset.textContent = "Show the big five";
  reset.hidden = true;
  reset.addEventListener("click", () => {
    for (const k of defaultOn()) setLeague(k, true);
    setCollapsed("top", false);
  });
  legendEl.appendChild(reset);

  for (const group of groups) {
    const inGroup = leagues.filter((l) => l.group === group.key);
    if (!inGroup.length) continue;

    const section = document.createElement("section");
    section.className = "sec";
    section.dataset.group = group.key;
    const bodyId = `sec-${group.key}`;
    const collapsed = state.collapsed.has(group.key);

    const head = document.createElement("h2");
    head.className = "sec-head";
    head.innerHTML =
      `<button type="button" class="sec-toggle" aria-expanded="${!collapsed}" aria-controls="${bodyId}">` +
      `<span class="caret" aria-hidden="true"></span>` +
      `<span class="sec-name">${esc(group.label)}</span>` +
      `<span class="sec-count"></span></button>` +
      `<button type="button" class="sec-all"></button>`;
    section.appendChild(head);

    const body = document.createElement("div");
    body.className = "sec-body";
    body.id = bodyId;
    body.hidden = collapsed;
    for (const lg of inGroup) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "league";
      btn.dataset.league = lg.key;
      btn.setAttribute("aria-pressed", String(state.activeLeagues.has(lg.key)));
      btn.innerHTML =
        `<span class="swatch" style="background:${esc(lg.color)}"></span>` +
        `<span class="league-name">${esc(lg.label)}<small>${esc(lg.country)}</small></span>` +
        `<span class="count">${lg.count}</span>`;
      btn.addEventListener("click", () => setLeague(lg.key, !state.activeLeagues.has(lg.key)));
      body.appendChild(btn);
    }
    section.appendChild(body);
    legendEl.appendChild(section);

    head.querySelector(".sec-toggle").addEventListener("click", () =>
      setCollapsed(group.key, !state.collapsed.has(group.key)));
    head.querySelector(".sec-all").addEventListener("click", () => {
      const allOn = inGroup.every((l) => state.activeLeagues.has(l.key));
      setGroup(group.key, !allOn);
    });
    updateSectionHeader(group.key);
  }
}

/* ------------------------------------------------------------ index build */

function buildIndexes(features) {
  for (const f of features) {
    const p = f.properties;
    byQid.set(p.qid, f);
    const ck = coordKey(f.geometry.coordinates);
    if (!byCoord.has(ck)) byCoord.set(ck, []);
    byCoord.get(ck).push(f);
    if (!featuresByLeague.has(p.leagueKey)) featuresByLeague.set(p.leagueKey, []);
    featuresByLeague.get(p.leagueKey).push(f);
  }

  searchIndex = features.map((f) => {
    const p = f.properties;
    return {
      qid: p.qid, name: p.name, venue: p.venue, league: p.league, leagueKey: p.leagueKey,
      country: p.country, capacity: p.capacity, coords: f.geometry.coordinates,
      nameFold: fold(p.name),
      haystack: fold(`${p.name} ${p.venue ?? ""} ${p.country ?? ""}`),
    };
  });

  // competition ranking per league (ties share a rank), capacity-less clubs unranked
  for (const feats of featuresByLeague.values()) {
    const withCap = feats.filter((f) => f.properties.capacity).sort((a, b) => b.properties.capacity - a.properties.capacity);
    let rank = 0, prev = null;
    withCap.forEach((f, i) => {
      if (f.properties.capacity !== prev) { rank = i + 1; prev = f.properties.capacity; }
      ranks.set(f.properties.qid, { rank, of: withCap.length, total: feats.length, league: f.properties.league });
    });
  }
}

// ~650 points => ~210k haversine pairs, tens of milliseconds. A spatial grid
// would save little and introduce antimeridian/pole bucketing bugs on a
// dataset that spans both.
function buildNearest() {
  if (nearest) return nearest;
  const pts = allFeatures.map((f) => ({ qid: f.properties.qid, name: f.properties.name, c: f.geometry.coordinates, ck: coordKey(f.geometry.coordinates) }));
  const best = new Map();
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (pts[i].ck === pts[j].ck) continue; // ground-sharers: covered by the shared note
      const km = haversineKm(pts[i].c, pts[j].c);
      const bi = best.get(pts[i].qid);
      if (!bi || km < bi.km) best.set(pts[i].qid, { qid: pts[j].qid, name: pts[j].name, km });
      const bj = best.get(pts[j].qid);
      if (!bj || km < bj.km) best.set(pts[j].qid, { qid: pts[i].qid, name: pts[i].name, km });
    }
  }
  nearest = best;
  return nearest;
}

/* ------------------------------------------------------------------ stats */

function computeStats() {
  const withCap = allFeatures.filter((f) => f.properties.capacity);
  const bySize = [...withCap].sort((a, b) => b.properties.capacity - a.properties.capacity);
  const shared = [...byCoord.values()].filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length ||
      b.reduce((n, f) => n + (f.properties.capacity ?? 0), 0) - a.reduce((n, f) => n + (f.properties.capacity ?? 0), 0));

  const leagueAvg = leagues.map((lg) => {
    const feats = featuresByLeague.get(lg.key) ?? [];
    const caps = feats.map((f) => f.properties.capacity).filter(Boolean);
    return {
      key: lg.key, label: lg.label, color: lg.color, total: feats.length, n: caps.length,
      avg: caps.length ? Math.round(caps.reduce((a, b) => a + b, 0) / caps.length) : 0,
    };
  }).filter((l) => l.n).sort((a, b) => b.avg - a.avg);

  return {
    biggest: bySize.slice(0, 5),
    smallest: bySize.slice(-5).reverse(),
    shared,
    leagueAvg,
    withCapacity: withCap.length,
    totalClubs: allFeatures.length,
  };
}

function clubRow(f, extra) {
  const p = f.properties;
  return `<button type="button" class="stat-row" data-qid="${esc(p.qid)}">` +
    `<span class="swatch" style="background:${esc(leagueColor(p.leagueKey))}"></span>` +
    `<span class="stat-name">${esc(p.name)}<small>${esc(p.venue ?? "")}</small></span>` +
    `<span class="stat-val">${esc(extra)}</span></button>`;
}

function renderStats() {
  stats = computeStats();
  const maxAvg = stats.leagueAvg[0]?.avg || 1;

  const sub = (title, inner) =>
    `<section class="stat-sec"><h3>${esc(title)}</h3><div class="stat-list">${inner}</div></section>`;

  statsBody.innerHTML =
    sub("Biggest grounds", stats.biggest.map((f) => clubRow(f, fmtNum(f.properties.capacity))).join("")) +
    sub("Smallest grounds", stats.smallest.map((f) => clubRow(f, fmtNum(f.properties.capacity))).join("")) +
    sub(`Shared grounds (${stats.shared.length})`, stats.shared.map((g) =>
      `<button type="button" class="stat-row" data-qid="${esc(g[0].properties.qid)}">` +
      `<span class="stat-name">${esc(g.map((f) => f.properties.name).join(" + "))}` +
      `<small>${esc(g[0].properties.venue ?? "")}</small></span></button>`).join("")) +
    sub("Average capacity", stats.leagueAvg.map((l) =>
      `<button type="button" class="stat-row bar-row" data-league="${esc(l.key)}">` +
      `<span class="stat-name">${esc(l.label)}<small>${fmtNum(l.avg)} · ${l.n} of ${l.total} known</small></span>` +
      `<span class="bar" style="width:${Math.round((l.avg / maxAvg) * 100)}%;background:${esc(l.color)}"></span></button>`).join("")) +
    `<p class="stat-note">Across all ${leagues.length} leagues, regardless of filters.</p>`;

  statsBody.querySelectorAll(".stat-row[data-qid]").forEach((el) =>
    el.addEventListener("click", () => selectClub(el.dataset.qid, { zoom: 12 })));
  statsBody.querySelectorAll(".stat-row[data-league]").forEach((el) =>
    el.addEventListener("click", () => {
      const key = el.dataset.league;
      setLeague(key, true);
      const lg = leagues.find((l) => l.key === key);
      if (lg) setCollapsed(lg.group, false);
    }));
}

/* ------------------------------------------------------------------ popup */

const leagueColor = (key) => leagues.find((l) => l.key === key)?.color ?? "#ffffff";

function popupHtml(feats) {
  const near = buildNearest();
  const groupNote = feats.length > 1
    ? `<p class="shared-note">Shared ground — ${feats.length} clubs at ${esc(feats[0].properties.venue ?? "one stadium")}</p>`
    : "";

  const cards = feats.map((f) => {
    const p = f.properties;
    const crest = httpsOnly(p.crest);
    const wd = httpsOnly(p.wikidata);
    const cap = p.capacity ? `${fmtNum(p.capacity)} seats` : "capacity unknown";
    const r = ranks.get(p.qid);
    const rankLine = r
      ? `<p class="rank">${ordinal(r.rank)} largest ${r.of < r.total ? `of ${r.of} ranked ` : ""}in ${esc(r.league)}</p>`
      : "";
    const n = feats.length === 1 ? near.get(p.qid) : null;
    const nearLine = n ? `<p class="near">Nearest: ${esc(n.name)}, ${fmtKm(n.km)}</p>` : "";
    return `<article class="club-card">
      ${crest ? `<img class="club-crest" src="${esc(crest)}" alt="" width="56">` : ""}
      <div>
        <h3>${esc(p.name)}</h3>
        <p><span class="chip" style="background:${esc(leagueColor(p.leagueKey))}"></span>${esc(p.league)}</p>
        <p>${esc(p.venue ?? "Stadium unknown")} · ${cap}</p>
        ${rankLine}${nearLine}
        ${wd ? `<p><a href="${esc(wd)}" target="_blank" rel="noopener">Wikidata ↗</a></p>` : ""}
      </div>
    </article>`;
  }).join("<hr>");

  return groupNote + cards;
}

function closePopup() {
  if (popup) popup.remove();
  popup = null;
  popupQids = [];
  setSelected(null);
}

function openPopupFor(feats) {
  if (!feats.length) return;
  if (popup) popup.remove();
  popupQids = feats.map((f) => f.properties.qid);
  popup = new maplibregl.Popup({ maxWidth: "320px" })
    .setLngLat(feats[0].geometry.coordinates)
    .setHTML(popupHtml(feats))
    .addTo(map);
  popup.on("close", () => { popupQids = []; popup = null; });
}

function setSelected(qid) {
  state.selectedQid = qid;
  if (map?.getLayer("clubs-selected")) {
    map.setFilter("clubs-selected", ["==", ["get", "qid"], qid ?? ""]);
  }
}

/* ----------------------------------------------------------------- search */

function searchClubs(query, limit = 8) {
  const q = fold(query).trim();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const hits = [];
  for (const e of searchIndex) {
    if (!tokens.every((t) => e.haystack.includes(t))) continue;
    let score = 4;
    if (e.nameFold.startsWith(q)) score = 0;
    else if (new RegExp(`(^|[\\s.\\-])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(e.nameFold)) score = 1;
    else if (e.nameFold.includes(q)) score = 2;
    else if (fold(e.venue ?? "").includes(q)) score = 3;
    hits.push({ e, score });
  }
  hits.sort((a, b) => a.score - b.score || (b.e.capacity ?? 0) - (a.e.capacity ?? 0) || a.e.name.localeCompare(b.e.name));
  return hits.slice(0, limit).map((h) => h.e);
}

let activeIndex = -1;
let renderPending = false;

function closeSuggestions() {
  searchResults.hidden = true;
  searchResults.innerHTML = "";
  searchInput.setAttribute("aria-expanded", "false");
  searchInput.removeAttribute("aria-activedescendant");
  activeIndex = -1;
}

function renderSuggestions() {
  const results = searchClubs(searchInput.value);
  if (searchClear) searchClear.hidden = !searchInput.value;
  if (!searchInput.value.trim()) return closeSuggestions();

  searchResults.innerHTML = results.length
    ? results.map((e, i) =>
        `<li role="option" id="sr-${i}" aria-selected="false" class="search-row" data-qid="${esc(e.qid)}">` +
        `<span class="swatch" style="background:${esc(leagueColor(e.leagueKey))}"></span>` +
        `<span class="sr-text"><b>${esc(e.name)}</b><small>${esc(e.venue ?? "")} · ${esc(e.league)}</small></span></li>`).join("")
    : `<li class="search-row is-empty" role="option" aria-selected="false">No clubs match “${esc(searchInput.value.trim())}”</li>`;

  searchResults.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
  activeIndex = -1;
  searchResults.querySelectorAll("[data-qid]").forEach((el) => {
    el.addEventListener("mousedown", (ev) => { ev.preventDefault(); selectClub(el.dataset.qid); });
  });
}

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderSuggestions(); });
}

function moveActive(delta) {
  const rows = [...searchResults.querySelectorAll("[data-qid]")];
  if (!rows.length) return;
  activeIndex += delta;
  if (activeIndex < 0) activeIndex = rows.length - 1;
  if (activeIndex >= rows.length) activeIndex = 0;
  rows.forEach((r, i) => {
    const on = i === activeIndex;
    r.classList.toggle("is-active", on);
    r.setAttribute("aria-selected", String(on));
    if (on) { searchInput.setAttribute("aria-activedescendant", r.id); r.scrollIntoView({ block: "nearest" }); }
  });
}

function selectClub(qid, { zoom = 9 } = {}) {
  const f = byQid.get(qid);
  if (!f) return;
  const key = f.properties.leagueKey;
  if (!state.activeLeagues.has(key)) {
    setLeague(key, true);
    const lg = leagues.find((l) => l.key === key);
    if (lg) setCollapsed(lg.group, false);
  }
  setSelected(qid);
  closeSuggestions();
  if (searchInput && window.matchMedia?.("(hover: none)").matches) searchInput.blur();

  const coords = f.geometry.coordinates;
  if (map) {
    map.flyTo({ center: coords, zoom, essential: true, duration: REDUCED_MOTION ? 0 : 2000 });
    openPopupFor(byCoord.get(coordKey(coords)) ?? [f]);
  }
  setReadout(`${f.properties.name} · ${f.properties.venue ?? "?"} · ${f.properties.league}`);
}

function wireSearch() {
  if (!searchInput) return;
  searchInput.addEventListener("input", scheduleRender);
  searchInput.addEventListener("focus", () => { if (searchInput.value.trim()) renderSuggestions(); });
  searchInput.addEventListener("blur", () => setTimeout(closeSuggestions, 120));
  searchInput.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (searchResults.hidden) renderSuggestions();
      moveActive(ev.key === "ArrowDown" ? 1 : -1);
    } else if (ev.key === "Enter") {
      const rows = [...searchResults.querySelectorAll("[data-qid]")];
      const row = rows[activeIndex] ?? rows[0];
      if (row) { ev.preventDefault(); selectClub(row.dataset.qid); }
    } else if (ev.key === "Escape") {
      if (!searchResults.hidden) closeSuggestions();
      else { searchInput.value = ""; if (searchClear) searchClear.hidden = true; setSelected(null); }
    } else if (ev.key === "Tab") {
      closeSuggestions();
    }
  });
  searchClear?.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.hidden = true;
    closeSuggestions();
    setSelected(null);
    searchInput.focus();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "/" || ev.metaKey || ev.ctrlKey) return;
    const t = ev.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    ev.preventDefault();
    searchInput.focus();
    searchInput.select();
  });
}

/* ------------------------------------------------------------ panels/UI */

function wirePanels() {
  statsToggle?.addEventListener("click", () => {
    const open = statsToggle.getAttribute("aria-expanded") === "true";
    statsToggle.setAttribute("aria-expanded", String(!open));
    statsBody.hidden = open;
  });

  for (const btn of document.querySelectorAll(".sheet-bar button[data-sheet]")) {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.sheet);
      const open = target.classList.contains("is-open");
      for (const el of [legendEl, statsEl]) el?.classList.remove("is-open");
      for (const b of document.querySelectorAll(".sheet-bar button")) b.setAttribute("aria-expanded", "false");
      if (!open) {
        target.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        if (btn.dataset.sheet === "stats" && statsBody.hidden) statsToggle.click();
      }
    });
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      for (const el of [legendEl, statsEl]) el?.classList.remove("is-open");
      for (const b of document.querySelectorAll(".sheet-bar button")) b.setAttribute("aria-expanded", "false");
    }
  });
}

/* ------------------------------------------------------------------- boot */

// The panels are plain DOM and must not wait on the basemap: if the tile host
// is slow, blocked or down, style.load never fires, and gating everything on it
// leaves a page that looks alive but does nothing at all.
async function loadData() {
  const data = await fetch(DATA_URL).then((r) => {
    if (!r.ok) throw new Error("clubs.geojson failed to load");
    return r.json();
  });

  leagues = data.metadata.leagues;
  groups = normalizeGroups(data.metadata);
  allFeatures = data.features;

  buildIndexes(allFeatures);
  restoreState();
  buildLegend();
  renderStats();
  updateShownCount();
  return data;
}

function addMapLayers(data) {
  if (typeof map.setProjection === "function") map.setProjection({ type: "globe" });
  map.setSky({ "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 5, 0.85, 7, 0] });
  map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.55, position: [1.15, 210, 30] });

  // fallback dots exist for every league from the start, so a league switched
  // on mid-session draws immediately while its crests stream in
  for (const lg of leagues) map.addImage(`dot-${lg.key}`, circleImage(lg.color));

  map.addSource("clubs", { type: "geojson", data });

  map.addLayer({
    id: "clubs-selected",
    type: "circle",
    source: "clubs",
    filter: ["==", ["get", "qid"], ""],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.5, 8, 4, 16, 7, 26, 11, 38],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#f0ecdf",
      "circle-stroke-opacity": 0.9,
    },
  });

  // league-colored ring behind each crest; also the visible mark at world zoom
  map.addLayer({
    id: "clubs-ring",
    type: "circle",
    source: "clubs",
    filter: leagueFilter(),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.5, 3.5, 4, 9, 7, 17, 11, 26],
      "circle-color": ["match", ["get", "leagueKey"], ...leagues.flatMap((lg) => [lg.key, lg.color]), "#ffffff"],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.95, 5, 0.7],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#0b1016",
    },
  });

  // crest icons resolve once you're close enough for them to be readable
  map.addLayer({
    id: "clubs",
    type: "symbol",
    source: "clubs",
    filter: leagueFilter(),
    layout: {
      "icon-image": ["coalesce", ["image", ["concat", "club-", ["get", "qid"]]],
        ["image", ["concat", "dot-", ["get", "leagueKey"]]]],
      // Crests are normalised to a CREST_SIZE long edge (see fitCrest), where
      // they previously arrived at ~250px. These stops are scaled by that same
      // ratio so the on-screen size is unchanged — and now consistent, since
      // the handful of small raw logos used to render smaller than the rest.
      "icon-size": ["interpolate", ["linear"], ["zoom"],
        3, 16 / CREST_SIZE, 5, 43 / CREST_SIZE, 7, 59 / CREST_SIZE, 11, 90 / CREST_SIZE],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0, 4, 1] },
  });

  for (const layer of ["clubs", "clubs-ring"]) {
    map.on("click", layer, (e) => {
      if (e.defaultPrevented) return; // both club layers hit on the same click
      e.preventDefault();
      const pad = 6;
      const box = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
      const feats = map.queryRenderedFeatures(box, { layers: ["clubs", "clubs-ring"] });
      const seen = new Set();
      const unique = feats.filter((f) => !seen.has(f.properties.qid) && seen.add(f.properties.qid))
        .map((f) => byQid.get(f.properties.qid) ?? f);
      if (!unique.length) return;
      setSelected(unique[0].properties.qid);
      openPopupFor(unique);
    });
  }
  map.on("click", (e) => { if (!e.defaultPrevented) closePopup(); });
  map.on("mousemove", "clubs-ring", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const p = e.features[0].properties;
    setReadout(`${p.name} · ${p.venue ?? "?"} · ${p.league}`);
  });
  map.on("mouseleave", "clubs-ring", () => { map.getCanvas().style.cursor = ""; });

  applyFilter();
  for (const key of state.activeLeagues) ensureCrests(key);

  if (!REDUCED_MOTION) map.easeTo({ center: [0, 40], zoom: 2.6, duration: 2500 });
  else map.jumpTo({ center: [0, 40], zoom: 2.6 });

  // the nearest-club table is only needed when a card opens
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 0));
  idle(() => buildNearest());
}

wireSearch();
wirePanels();

(async () => {
  let data;
  try {
    data = await loadData();
  } catch (err) {
    console.error(err);
    setReadout("Club data failed to load — try reloading.");
    return;
  }
  if (!map) return; // WebGL unavailable: the legend, search and Numbers still work

  let layered = false;
  const startLayers = () => {
    if (layered) return;
    layered = true;
    try {
      addMapLayers(data);
    } catch (err) {
      console.error(err);
      setReadout("The map layers failed to initialise.");
    }
  };
  if (map.isStyleLoaded()) startLayers();
  else map.once("style.load", startLayers);

  // a basemap that never arrives should not leave the globe silently empty
  setTimeout(() => {
    if (!layered) setReadout("Basemap is taking a while — the league list and search still work.");
  }, 12000);
})();

// read-only surface for the headless test suite
window.__worldxi = {
  get state() {
    return { on: [...state.activeLeagues], collapsed: [...state.collapsed], selected: state.selectedQid };
  },
  get leagues() { return leagues; },
  get stats() { return stats; },
  searchClubs,
  selectClub,
  nearestOf: (qid) => buildNearest().get(qid),
  imageOf: (qid) => { const i = map?.getImage(`club-${qid}`); return i ? { width: i.data.width, height: i.data.height } : null; },
  capacityRankOf: (qid) => ranks.get(qid),
  shownClubCount,
};
