"use strict";

const DATA_URL = "/lab/world-xi/data/clubs.geojson";
const CREST_SIZE = 128; // px, matches the thumbnails baked into clubs.geojson
const STORE_KEY = "worldxi.v3"; // key name kept; the payload carries its own v
const FALLBACK_TOP = ["epl", "laliga", "bundesliga", "seriea", "ligue1"];
// Only used if a stale clubs.geojson arrives with no metadata.groups; the
// pipeline is the source of truth. Kept in step with GROUPS in build-data.mjs.
const FALLBACK_GROUPS = [
  { key: "top", label: "Start here — the big five" },
  { key: "england", label: "England" },
  { key: "eu", label: "Europe" },
  { key: "usa", label: "United States & Canada" },
  { key: "ncaa", label: "NCAA college soccer" },
  { key: "americas", label: "Latin America" },
  { key: "asia", label: "Asia & Pacific" },
  { key: "africa", label: "Africa" },
];
const OTHER_GROUP = { key: "other", label: "Everything else" };

const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/* ---------------------------------------------------------------- helpers */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const httpsOnly = (url) => (/^https:\/\//.test(String(url ?? "")) ? String(url) : null);

// Crests are either an absolute https URL (hotlinked from Wikimedia) or a path
// relative to the data file, for the ones committed alongside it. Resolving
// against DATA_URL rather than the page keeps the hosted copy working, where
// the page lives at /lab/world-xi/ but the data is addressed absolutely.
const crestUrl = (crest) => {
  const v = String(crest ?? "");
  if (!v) return null;
  if (/^https:\/\//.test(v)) return v;
  if (/^(?:[a-z]+:|\/\/)/i.test(v)) return null;      // no http:, data:, javascript:
  try { return new URL(v, new URL(DATA_URL, location.href)).href; } catch { return null; }
};

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

// Three filters, two of which reach the map. `activeLeagues` is what the user
// switched on; `gender` and `country` are facets that narrow both the list and
// the globe, so what the legend shows is always what the globe draws. `query`
// is transient typing and narrows the list only — it would be a nasty surprise
// for the map to empty out while you were still spelling a word.
const state = {
  activeLeagues: new Set(), collapsed: new Set(), selectedId: null,
  gender: "all", country: "", query: "", tiers: "top",
};

let leagues = [];
let groups = [];
let countries = [];
let places = [];
let allFeatures = [];
const byId = new Map();
const byCoord = new Map();
const featuresByLeague = new Map();
let searchIndex = [];
let ranks = new Map();
let nearest = null;
let stats = null;
let popup = null;
let popupIds = [];

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

// Two elements, deliberately: `legendPanel` is the sheet the mobile bar opens
// and closes, `legendEl` is the list inside it that buildLegend() rewrites.
const legendPanel = document.getElementById("legend");
const legendEl = document.getElementById("legend-list");
const countrySelect = document.getElementById("country-filter");
const tierToggle = document.getElementById("tier-filter");
const listFilter = document.getElementById("league-filter");
const facetSummary = document.getElementById("facet-summary");
const statsEl = document.getElementById("stats");
const statsBody = document.getElementById("stats-body");
const statsToggle = document.getElementById("stats-toggle");
const searchInput = document.getElementById("club-search");
const searchResults = document.getElementById("search-results");
const searchClear = document.getElementById("search-clear");
const sheetCount = document.getElementById("sheet-count");

/* ----------------------------------------------------------------- crests */

// Drawn arithmetically rather than on a canvas, because reading a canvas back
// is exactly what browser fingerprinting defences block — Brave's shield,
// Firefox's resistFingerprinting, a number of privacy extensions. getImageData
// then throws a SecurityError, and since these fallback dots are registered
// before the club source and layers are added, the throw took the whole map
// down with it: the globe still drew, the legend still built, and not one club
// ever appeared. A circle needs no canvas, so this asks for nothing that can be
// refused.
const DOT = 48, DOT_R = 20, DOT_RING = 2, RING_RGB = [240, 236, 223]; // #f0ecdf

function parseRgb(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const short = /^#?([0-9a-f]{3})$/i.exec(String(color).trim());
  if (short) return [...short[1]].map((h) => parseInt(h + h, 16));
  return [136, 136, 136];
}

function circleImage(color) {
  const [r, g, b] = parseRgb(color);
  const px = new Uint8ClampedArray(DOT * DOT * 4);
  const c = (DOT - 1) / 2;
  const outer = DOT_R + DOT_RING, inner = DOT_R - DOT_RING;
  for (let y = 0; y < DOT; y++) {
    for (let x = 0; x < DOT; x++) {
      const d = Math.hypot(x - c, y - c);
      // one-pixel feather on each edge, so the dot is not visibly stair-stepped
      const alpha = Math.min(1, Math.max(0, outer + 0.5 - d));
      if (alpha <= 0) continue;
      const ring = Math.min(1, Math.max(0, d - (inner - 0.5)));
      const i = (y * DOT + x) * 4;
      px[i]     = r + (RING_RGB[0] - r) * ring;
      px[i + 1] = g + (RING_RGB[1] - g) * ring;
      px[i + 2] = b + (RING_RGB[2] - b) * ring;
      px[i + 3] = alpha * 255;
    }
  }
  return { width: DOT, height: DOT, data: px };
}

// A handful of crests are stored as JPEGs, or as PNGs flattened onto a solid
// background. Left alone they render as an opaque rectangle sitting on the
// globe while every other crest blends into it — New England Revolution II is
// the obvious one. Where the border is a single flat colour we can lift it back
// out, so the crest reads the same as the transparent ones.
//
// The guards matter more than the fill. A crest is only de-boxed when its
// entire 1px border is opaque AND overwhelmingly one colour, and the fill only
// spreads through pixels matching that colour — so a logo that genuinely bleeds
// to its edge (Blau-Weiß Linz) is left alone, and a crest whose own artwork is
// mostly white (QPR's hoops, Galatasaray) is never touched, because its border
// is transparent and it never enters this path at all.
const BOX_TOLERANCE = 26;     // per-channel distance still counted as background
const BOX_BORDER_PURITY = 0.8; // share of the opaque border that must be one colour

function deboxCrest(img) {
  const { width: w, height: h, data: d } = img;
  if (w < 8 || h < 8) return img;
  const at = (x, y) => (y * w + x) * 4;

  const border = [];
  for (let x = 0; x < w; x++) { border.push(at(x, 0)); border.push(at(x, h - 1)); }
  for (let y = 1; y < h - 1; y++) { border.push(at(0, y)); border.push(at(w - 1, y)); }
  const opaque = border.filter((o) => d[o + 3] > 240);
  if (opaque.length / border.length < 0.9) return img;   // already blends

  // Modal border colour, quantised so anti-aliasing does not split the vote.
  const bucket = new Map();
  for (const o of opaque) {
    const k = `${d[o] >> 5},${d[o + 1] >> 5},${d[o + 2] >> 5}`;
    bucket.set(k, (bucket.get(k) ?? 0) + 1);
  }
  const top = [...bucket.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const inTop = opaque.filter((o) => `${d[o] >> 5},${d[o + 1] >> 5},${d[o + 2] >> 5}` === top);
  if (inTop.length / opaque.length < BOX_BORDER_PURITY) return img;  // busy edge, not a flat plate
  const bg = [0, 1, 2].map((c) => Math.round(inTop.reduce((s, o) => s + d[o + c], 0) / inTop.length));

  const matches = (o) =>
    Math.abs(d[o] - bg[0]) <= BOX_TOLERANCE &&
    Math.abs(d[o + 1] - bg[1]) <= BOX_TOLERANCE &&
    Math.abs(d[o + 2] - bg[2]) <= BOX_TOLERANCE;

  // Flood from the border only: a white letter enclosed by the logo keeps its
  // white, because the fill cannot reach it. Only alpha is touched, so undoing
  // a fill that turns out to have eaten the logo means restoring that one plane.
  const alpha0 = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha0[i] = d[i * 4 + 3];
  const restore = () => { for (let i = 0; i < w * h; i++) d[i * 4 + 3] = alpha0[i]; return img; };
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (const o of border) { const i = o / 4; if (!seen[i] && matches(o)) { seen[i] = 1; stack.push(i); } }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    d[i * 4 + 3] = 0;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni]) continue;
      if (!matches(ni * 4)) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }

  // A flat plate behind a logo and the white *inside* a piece of line art look
  // identical to the flood: Minneapolis City's crow and Orbit College's badge
  // are drawn as dark strokes over white that reaches the edge, so lifting the
  // background lifts the artwork with it and leaves a scatter of specks.
  //
  // What separates the two cases is what survives. Removing a true background
  // leaves the crest whole — one dominant mass of ink. Eating through line art
  // shatters it. So measure the largest surviving connected component: if the
  // ink no longer holds together, this was not a background, and the original
  // (boxed, but legible) crest is the better answer.
  const alive = (i) => d[i * 4 + 3] > 128;
  let remaining = 0;
  for (let i = 0; i < w * h; i++) if (alive(i)) remaining++;
  if (remaining < w * h * 0.02) return restore();
  const comp = new Uint8Array(w * h);
  let largest = 0;
  for (let i0 = 0; i0 < w * h; i0++) {
    if (comp[i0] || !alive(i0)) continue;
    let size = 0;
    const q = [i0];
    comp[i0] = 1;
    while (q.length) {
      const i = q.pop();
      size++;
      const x = i % w, y = (i / w) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (comp[ni] || !alive(ni)) continue;
        comp[ni] = 1;
        q.push(ni);
      }
    }
    if (size > largest) largest = size;
  }
  if (largest / remaining < 0.5) return restore();

  // Some crests are drawn *for* their white plate: Minneapolis City is a black
  // crow and black lettering, legible on white and all but invisible once the
  // white is gone and the dark globe shows through. Where nearly all the
  // surviving ink is dark, the plate is doing real work — keep it.
  let dark = 0;
  for (let i = 0; i < w * h; i++) {
    if (!alive(i)) continue;
    const o = i * 4;
    if (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2] < 70) dark++;
  }
  if (dark / remaining > 0.85) return restore();

  // Anti-aliased edges leave a halo of part-background pixels the flood cannot
  // claim. Fade any surviving pixel that still sits close to the background and
  // touches a hole, so the silhouette does not come out with a hard fringe.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4;
      if (seen[i] || d[o + 3] === 0) continue;
      const near = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h && seen[ny * w + nx]);
      if (!near) continue;
      const dist = Math.max(Math.abs(d[o] - bg[0]), Math.abs(d[o + 1] - bg[1]), Math.abs(d[o + 2] - bg[2]));
      if (dist < BOX_TOLERANCE * 2) d[o + 3] = Math.round(d[o + 3] * (dist / (BOX_TOLERANCE * 2)));
    }
  }
  return img;
}

// Crest thumbnails arrive around 250px on their long edge. Left alone that is
// ~4x the texture memory they need and renders the icons at roughly twice the
// intended size, because icon-size is expressed as a fraction of CREST_SIZE.
// Normalising the long edge to CREST_SIZE fixes both.
function fitCrest(source) {
  const w = source.width, h = source.height;
  const scale = Math.min(1, CREST_SIZE / Math.max(w, h));
  if (scale === 1) return deboxCrest(source);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(source, 0, 0, cw, ch);
  return deboxCrest(g.getImageData(0, 0, cw, ch));
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
    const id = `club-${f.properties.id}`;
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
      const { id } = f.properties;
      const crest = crestUrl(f.properties.crest);
      if (!crest || map.hasImage(`club-${id}`)) continue;
      try {
        const img = await map.loadImage(crest);
        // the league may have been switched off while this was in flight
        if (!crestsRequested.has(f.properties.leagueKey)) continue;
        if (!map.hasImage(`club-${id}`)) map.addImage(`club-${id}`, fitCrest(img.data));
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

// Every league carries exactly one gender and one country, so a facet is a
// predicate over leagues rather than over 4,182 features — which is why the
// club counts below can come straight from the metadata and still be exact.
function matchesFacets(lg) {
  if (state.tiers !== "all" && !lg.topFlight) return false;
  if (state.gender !== "all" && lg.gender !== state.gender) return false;
  if (state.country && lg.country !== state.country) return false;
  return true;
}

// What the globe draws: switched on AND surviving the facets. A league hidden
// by a facet keeps its own on/off state, so clearing the facet brings it back
// exactly as the user left it.
function visibleLeagues() {
  return leagues.filter((l) => state.activeLeagues.has(l.key) && matchesFacets(l));
}

const leagueFilter = () =>
  ["in", ["get", "leagueKey"], ["literal", visibleLeagues().map((l) => l.key)]];

function applyFilter() {
  const shown = new Set(visibleLeagues().map((l) => l.key));
  if (map?.getLayer("clubs")) {
    map.setFilter("clubs-ring", leagueFilter());
    map.setFilter("clubs", leagueFilter());

    // a popup whose clubs are all hidden no longer describes anything on screen
    if (popup && popupIds.length) {
      const stillShown = popupIds.some((q) => shown.has(byId.get(q)?.properties.leagueKey));
      if (!stillShown) closePopup();
    }
  }
  updateShownCount();
}

function shownClubCount() {
  return visibleLeagues().reduce((n, l) => n + l.count, 0);
}

// The facets are the one piece of state that can empty the globe without the
// user having switched anything off, so they have to be legible from the
// readout alone — otherwise "no clubs" reads as a bug rather than a filter.
function facetWords() {
  const bits = [];
  if (state.gender !== "all") bits.push(state.gender === "women" ? "women's" : "men's");
  if (state.country) bits.push(state.country);
  return bits;
}

function updateShownCount() {
  const n = shownClubCount();
  const on = visibleLeagues().length;
  if (sheetCount) sheetCount.textContent = String(on);
  const words = facetWords();
  const suffix = words.length ? ` · ${words.join(" · ")}` : "";
  if (n) setReadout(`${fmtNum(n)} clubs shown${suffix}`);
  else if (words.length && state.activeLeagues.size) setReadout(`Nothing matches ${words.join(" + ")} — clear a filter`);
  else setReadout("No leagues shown — pick one from the list");
  const reset = document.getElementById("legend-reset");
  if (reset) reset.hidden = state.activeLeagues.size > 0;
}

/* ----------------------------------------------------------------- legend */

// clubs.geojson is a committed artifact and can lag app.js, so never trust it
// to carry grouping — fall back to the built-in list and bucket by gender.
function normalizeGroups(meta) {
  const gs = Array.isArray(meta.groups) && meta.groups.length ? meta.groups : FALLBACK_GROUPS;
  const known = new Set(gs.map((g) => g.key));
  // A league whose group this build has never heard of still has to be listed.
  // Bucketing it by gender used to hide that; a visible "Everything else"
  // section says plainly that something arrived the frontend does not know.
  const orphans = meta.leagues.filter((lg) => !lg.group || !known.has(lg.group));
  for (const lg of orphans) lg.group = OTHER_GROUP.key;
  return orphans.length ? [...gs, OTHER_GROUP] : gs;
}

function defaultOn() {
  // The opening view is every nation's top flight; the lower tiers, college
  // and amateur leagues wait behind the tiers toggle.
  const top = leagues.filter((l) => l.topFlight).map((l) => l.key);
  return top.length ? top : FALLBACK_TOP;
}

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    store.write({
      v: 4, on: [...state.activeLeagues], collapsed: [...state.collapsed],
      gender: state.gender, country: state.country, tiers: state.tiers,
    });
  }, 250);
}

function restoreState() {
  const known = new Set(leagues.map((l) => l.key));
  const groupKeys = new Set(groups.map((g) => g.key));
  const saved = store.read();

  // v3 carried no facets; its on/collapsed sets are still valid, so read it
  // rather than throwing the user's league choices away over a version bump.
  if (saved && (saved.v === 3 || saved.v === 4) && Array.isArray(saved.on)) {
    // leagues added since the last visit stay off, per the "off until opened" rule
    state.activeLeagues = new Set(saved.on.filter((k) => known.has(k)));
    const collapsed = Array.isArray(saved.collapsed) ? saved.collapsed.filter((k) => groupKeys.has(k)) : [];
    state.collapsed = new Set(collapsed);
    state.gender = ["men", "women"].includes(saved.gender) ? saved.gender : "all";
    // a country that no longer exists in the data would hide every league with
    // no way to tell why, so drop it rather than restore an unexplainable empty
    state.country = countries.some((c) => c.name === saved.country) ? saved.country : "";
    // Payloads saved before the tiers toggle existed carry no `tiers`. A
    // returning visitor with, say, NCAA switched on must not find it silently
    // hidden — so an old payload keeps everything eligible, and only a payload
    // that actually chose "top" gets the narrowed default.
    state.tiers = saved.tiers === "top" || saved.tiers === "all"
      ? saved.tiers
      : ([...state.activeLeagues].some((k) => leagues.some((l) => l.key === k && !l.topFlight)) ? "all" : "top");
  } else {
    state.activeLeagues = new Set(defaultOn());
    // Open the top section and the US pyramid: the pyramid is the reason most
    // of this map exists now, and a collapsed section is a section nobody finds.
    // Expanded, not enabled — the big five are still the only leagues switched on.
    state.collapsed = new Set(groups.map((g) => g.key).filter((k) => k !== "top" && k !== "usa"));
  }
}

function updateSectionHeader(groupKey) {
  const section = legendEl.querySelector(`[data-group="${groupKey}"]`);
  if (!section) return;
  // Count what the section is showing, not what it contains: "3/5" beside a
  // list of two rows is the kind of number that makes people distrust the rest.
  const inGroup = leagues.filter((l) => l.group === groupKey && listable(l));
  if (!inGroup.length) return;
  const on = inGroup.filter((l) => state.activeLeagues.has(l.key)).length;
  section.querySelector(".sec-count").innerHTML = `<b>${on}</b>/${inGroup.length}`;
  const all = section.querySelector(".sec-all");
  const allOn = on === inGroup.length;
  all.textContent = allOn ? "None" : "All";
  all.setAttribute("aria-label", `${allOn ? "Hide" : "Show"} all ${inGroup.length} leagues in ${groups.find((g) => g.key === groupKey)?.label}`);
}

function updateAllSectionHeaders() {
  for (const g of groups) updateSectionHeader(g.key);
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

// Acts on the rows the section is currently showing. With "Women" and Spain
// set, All means "every Spanish women's league here", which is the whole point
// of pairing the facets with a per-section All.
function setGroup(groupKey, on) {
  for (const lg of leagues.filter((l) => l.group === groupKey && listable(l))) {
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

/* ----------------------------------------------------------------- facets */

// The list filter is matched against the same folded text as club search, so
// "turkiye", "cordoba" and "dusseldorf" all find their leagues.
function listable(lg) {
  if (!matchesFacets(lg)) return false;
  if (!state.query) return true;
  const hay = fold(`${lg.label} ${lg.country} ${lg.tier ?? ""}`);
  return state.query.split(/\s+/).every((t) => hay.includes(t));
}

// Narrowing to a handful of rows and then leaving them behind a collapsed
// header would defeat the filter, so while any facet is set every section that
// still has rows is open. The user's own collapse choices are untouched
// underneath and come back when the filters clear.
const narrowing = () => state.gender !== "all" || !!state.country || !!state.query;

function buildCountryOptions() {
  const counts = new Map();
  for (const lg of leagues) counts.set(lg.country, (counts.get(lg.country) ?? 0) + lg.count);
  countries = [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  if (!countrySelect) return;
  for (const c of countries) {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = `${c.name} (${fmtNum(c.count)})`;
    countrySelect.appendChild(opt);
  }
}

function updateFacetControls() {
  for (const btn of document.querySelectorAll("[data-gender]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.gender === state.gender));
  }
  if (countrySelect) countrySelect.value = state.country;
  if (tierToggle) tierToggle.checked = state.tiers === "all";
  if (listFilter && listFilter.value !== state.query) listFilter.value = state.query;
  if (facetSummary) {
    const rows = leagues.filter(listable);
    const clubs = rows.reduce((n, l) => n + l.count, 0);
    facetSummary.textContent = narrowing()
      ? `${rows.length} of ${leagues.length} leagues · ${fmtNum(clubs)} clubs`
      : `${leagues.length} leagues · ${fmtNum(clubs)} clubs`;
  }
}

// One mutation point for all three facets, mirroring setLeague.
function setFacet(patch) {
  Object.assign(state, patch);
  updateFacetControls();
  buildLegend();
  // A facet change can hide the league a crest batch was fetched for, but it
  // never changes which leagues are switched on — so crest loading follows
  // setLeague, not this, and nothing needs releasing here.
  applyFilter();
  persist();
}

function clearFacets() {
  // "Clear the filters" means every filter, the tiers toggle included —
  // search and stat rows rely on this to reveal a lower-tier club.
  setFacet({ gender: "all", country: "", query: "", tiers: "all" });
}

function wireFacets() {
  for (const btn of document.querySelectorAll("[data-gender]")) {
    btn.addEventListener("click", () => setFacet({ gender: btn.dataset.gender }));
  }
  tierToggle?.addEventListener("change", () =>
    setFacet({ tiers: tierToggle.checked ? "all" : "top" }));
  countrySelect?.addEventListener("change", () => {
    const name = countrySelect.value;
    setFacet({ country: name });
    if (!name) return;
    // Picking a country is a statement of intent: frame its clubs, and if
    // none of its leagues are switched on, switch its top flight on so the
    // camera does not land on an empty patch of globe.
    const lgs = leagues.filter((l) => l.country === name);
    if (!lgs.some((l) => state.activeLeagues.has(l.key))) {
      for (const l of lgs.filter((x) => x.topFlight)) setLeague(l.key, true);
    }
    const place = places.find((pl) => pl.kind === "country" && pl.name === name);
    if (place) flyToPlace(place, { announce: false });
  });
  listFilter?.addEventListener("input", () => setFacet({ query: fold(listFilter.value).trim() }));
  listFilter?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && listFilter.value) { ev.stopPropagation(); setFacet({ query: "" }); }
  });
}

/* ----------------------------------------------------------------- legend */

function buildLegend() {
  legendEl.innerHTML = "";

  const reset = document.createElement("button");
  reset.type = "button";
  reset.id = "legend-reset";
  reset.className = "legend-reset";
  reset.textContent = "Show every top flight";
  reset.hidden = true;
  reset.addEventListener("click", () => {
    setFacet({ gender: "all", country: "", query: "", tiers: "top" });
    for (const k of defaultOn()) setLeague(k, true);
    setCollapsed("top", false);
  });
  legendEl.appendChild(reset);

  let rows = 0;
  for (const group of groups) {
    const inGroup = leagues.filter((l) => l.group === group.key && listable(l));
    if (!inGroup.length) continue;
    rows += inGroup.length;

    const section = document.createElement("section");
    section.className = "sec";
    section.dataset.group = group.key;
    const bodyId = `sec-${group.key}`;
    const collapsed = state.collapsed.has(group.key) && !narrowing();

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
        `<span class="league-name">${esc(lg.label)}<small>${esc(lg.tier ? `${lg.tier} · ${lg.country}` : lg.country)}</small></span>` +
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

  if (!rows) {
    const empty = document.createElement("p");
    empty.className = "legend-empty";
    empty.textContent = "No leagues match these filters.";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "legend-reset";
    clear.textContent = "Clear the filters";
    clear.addEventListener("click", clearFacets);
    legendEl.append(empty, clear);
  }
}

/* ------------------------------------------------------------ index build */

// Anything that is not "venue" is a stand-in for a ground we could not find:
// "city" is the club's town, "campus" is a college's campus centroid. Neither
// is a place two clubs genuinely share, and both have to say so in the popup.
const APPROXIMATE = {
  city: "the club's town",
  campus: "the campus",
  club: "the club's own map point, not a named ground",
};
const isApproximate = (p) => p.precision in APPROXIMATE;

function buildIndexes(features) {
  for (const f of features) {
    const p = f.properties;
    byId.set(p.id, f);
    if (!isApproximate(p)) {
      const ck = coordKey(f.geometry.coordinates);
      if (!byCoord.has(ck)) byCoord.set(ck, []);
      byCoord.get(ck).push(f);
    }
    if (!featuresByLeague.has(p.leagueKey)) featuresByLeague.set(p.leagueKey, []);
    featuresByLeague.get(p.leagueKey).push(f);
  }

  searchIndex = features.map((f) => {
    const p = f.properties;
    return {
      id: p.id, name: p.name, venue: p.venue, league: p.league, leagueKey: p.leagueKey,
      country: p.country, capacity: p.capacity, coords: f.geometry.coordinates,
      nameFold: fold(p.name),
      haystack: fold(`${p.name} ${(p.aka ?? []).join(" ")} ${p.venue ?? ""} ${p.country ?? ""}`),
    };
  });

  // competition ranking per league (ties share a rank), capacity-less clubs unranked
  for (const feats of featuresByLeague.values()) {
    const withCap = feats.filter((f) => f.properties.capacity).sort((a, b) => b.properties.capacity - a.properties.capacity);
    let rank = 0, prev = null;
    withCap.forEach((f, i) => {
      if (f.properties.capacity !== prev) { rank = i + 1; prev = f.properties.capacity; }
      ranks.set(f.properties.id, { rank, of: withCap.length, total: feats.length, league: f.properties.league });
    });
  }
}

// ~650 points => ~210k haversine pairs, tens of milliseconds. A spatial grid
// would save little and introduce antimeridian/pole bucketing bugs on a
// dataset that spans both.
function buildNearest() {
  if (nearest) return nearest;
  const pts = allFeatures.map((f) => ({ id: f.properties.id, name: f.properties.name, c: f.geometry.coordinates, ck: coordKey(f.geometry.coordinates) }));
  const best = new Map();
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (pts[i].ck === pts[j].ck) continue; // ground-sharers: covered by the shared note
      const km = haversineKm(pts[i].c, pts[j].c);
      const bi = best.get(pts[i].id);
      if (!bi || km < bi.km) best.set(pts[i].id, { id: pts[j].id, name: pts[j].name, km });
      const bj = best.get(pts[j].id);
      if (!bj || km < bj.km) best.set(pts[j].id, { id: pts[i].id, name: pts[i].name, km });
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
  return `<button type="button" class="stat-row" data-club="${esc(p.id)}">` +
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
      `<button type="button" class="stat-row" data-club="${esc(g[0].properties.id)}">` +
      `<span class="stat-name">${esc(g.map((f) => f.properties.name).join(" + "))}` +
      `<small>${esc(g[0].properties.venue ?? "")}</small></span></button>`).join("")) +
    sub("Average capacity", stats.leagueAvg.map((l) =>
      `<button type="button" class="stat-row bar-row" data-league="${esc(l.key)}">` +
      `<span class="stat-name">${esc(l.label)}<small>${fmtNum(l.avg)} · ${l.n} of ${l.total} known</small></span>` +
      `<span class="bar" style="width:${Math.round((l.avg / maxAvg) * 100)}%;background:${esc(l.color)}"></span></button>`).join("")) +
    `<p class="stat-note">Across all ${leagues.length} leagues, regardless of filters.</p>`;

  statsBody.querySelectorAll(".stat-row[data-club]").forEach((el) =>
    el.addEventListener("click", () => selectClub(el.dataset.club, { zoom: 12 })));
  statsBody.querySelectorAll(".stat-row[data-league]").forEach((el) =>
    el.addEventListener("click", () => {
      const key = el.dataset.league;
      const lg = leagues.find((l) => l.key === key);
      if (lg && !matchesFacets(lg)) clearFacets();
      setLeague(key, true);
      if (lg) setCollapsed(lg.group, false);
    }));
}

/* ------------------------------------------------------------------ popup */

const leagueColor = (key) => leagues.find((l) => l.key === key)?.color ?? "#ffffff";

function popupHtml(feats) {
  const near = buildNearest();
  // Only venue-precision clubs actually share a stadium. Clubs placed on a town
  // can land on one point too, and calling that a shared ground would invent a
  // fact — so decide here rather than trusting whoever assembled the group.
  const sharesGround = feats.length > 1 && feats.every((f) => !isApproximate(f.properties));
  const groupNote = feats.length < 2
    ? ""
    : sharesGround
      ? `<p class="shared-note">Shared ground — ${feats.length} clubs at ${esc(feats[0].properties.venue ?? "one stadium")}</p>`
      : `<p class="shared-note">${feats.length} clubs placed on the same town</p>`;

  const cards = feats.map((f) => {
    const p = f.properties;
    const crest = crestUrl(p.crest);
    const wd = httpsOnly(p.wikidata);
    const cap = p.capacity ? `${fmtNum(p.capacity)} seats` : "capacity unknown";
    // A city-precision club sits on its town, not its ground: say so rather
    // than letting the marker imply a stadium location we do not have.
    const approxLine = isApproximate(p)
      ? `<p class="approx">Approximate — placed on ${APPROXIMATE[p.precision]}${
          // `spread` means the pipeline nudged this club off the town centre so
          // the clubs sharing it could be told apart. Saying "approximate" alone
          // would leave the offset looking like a real position.
          p.spread ? ", and moved a few hundred metres off it so the clubs sharing that town can be told apart" : ""
        }${p.venue ? `; ${esc(p.venue)} is not mapped` : ""}</p>`
      : "";
    const r = ranks.get(p.id);
    const rankLine = r
      ? `<p class="rank">${ordinal(r.rank)} largest ${r.of < r.total ? `of ${r.of} ranked ` : ""}in ${esc(r.league)}</p>`
      : "";
    const n = feats.length === 1 ? near.get(p.id) : null;
    const nearLine = n ? `<p class="near">Nearest: ${esc(n.name)}, ${fmtKm(n.km)}</p>` : "";
    return `<article class="club-card">
      ${crest ? `<img class="club-crest" src="${esc(crest)}" alt="" width="56">` : ""}
      <div>
        <h3>${esc(p.name)}</h3>
        <p><span class="chip" style="background:${esc(leagueColor(p.leagueKey))}"></span>${esc(p.league)}</p>
        <p>${esc(p.venue ?? "Stadium unknown")} · ${cap}</p>
        ${rankLine}${nearLine}${approxLine}
        ${wd ? `<p><a href="${esc(wd)}" target="_blank" rel="noopener">Wikidata ↗</a></p>` : ""}
      </div>
    </article>`;
  }).join("<hr>");

  return groupNote + cards;
}

function closePopup() {
  if (popup) popup.remove();
  popup = null;
  popupIds = [];
  setSelected(null);
}

function openPopupFor(feats) {
  if (!feats.length) return;
  if (popup) popup.remove();
  popupIds = feats.map((f) => f.properties.id);
  popup = new maplibregl.Popup({ maxWidth: "320px" })
    .setLngLat(feats[0].geometry.coordinates)
    .setHTML(popupHtml(feats))
    .addTo(map);
  popup.on("close", () => { popupIds = []; popup = null; });
}

function setSelected(id) {
  state.selectedId = id;
  if (map?.getLayer("clubs-selected")) {
    map.setFilter("clubs-selected", ["==", ["get", "id"], id ?? ""]);
  }
}

/* ------------------------------------------------------------------ places */

// One chip per continent. The container is static markup (see index.html);
// only its contents are built here, and only when the data carries places.
function buildFocusChips() {
  const row = document.getElementById("focus-chips");
  if (!row) return;
  const continents = places.filter((pl) => pl.kind === "continent").sort((a, b) => b.count - a.count);
  if (!continents.length) return;
  row.hidden = false;
  for (const pl of continents) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "focus-chip";
    btn.textContent = pl.name;
    btn.addEventListener("click", () => flyToPlace(pl));
    row.appendChild(btn);
  }
}


// A place is a camera move, nothing more: it never switches a league on or
// off, so what you see inside the frame is whatever your filters already
// allow. The one exception is the country picker, which speaks for itself.
function flyToPlace(place, { announce = true } = {}) {
  if (!map) return;
  const [w, so, e, n] = place.bbox;
  map.fitBounds([[w, so], [e, n]], {
    padding: 40, essential: true, duration: REDUCED_MOTION ? 0 : 2000,
  });
  if (announce) setReadout(`${place.name} · ${fmtNum(place.count)} clubs in the data here`);
}

const PLACE_KIND = { continent: "Continent", country: "Country", state: "US state", metro: "Metro area" };

function searchPlaces(query, limit = 3) {
  const q = fold(query).trim();
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const hits = [];
  for (const pl of places) {
    const hay = fold(`${pl.name} ${PLACE_KIND[pl.kind] ?? pl.kind}`);
    if (!tokens.every((t) => hay.includes(t))) continue;
    hits.push({ pl, score: fold(pl.name).startsWith(q) ? 0 : 1 });
  }
  hits.sort((a, b) => a.score - b.score || b.pl.count - a.pl.count);
  return hits.slice(0, limit).map((h) => h.pl);
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
  const placeHits = searchPlaces(searchInput.value);
  const results = searchClubs(searchInput.value, 8 - placeHits.length);
  if (searchClear) searchClear.hidden = !searchInput.value;
  if (!searchInput.value.trim()) return closeSuggestions();

  // Places ride above the clubs: "london" should offer Greater London before
  // eight clubs whose names merely contain it.
  const placeRows = placeHits.map((pl, i) =>
    `<li role="option" id="sr-p${i}" aria-selected="false" class="search-row search-place" data-place="${esc(pl.name)}" data-place-kind="${esc(pl.kind)}">` +
    `<span class="swatch swatch-place" aria-hidden="true">◎</span>` +
    `<span class="sr-text"><b>${esc(pl.name)}</b><small>${esc(PLACE_KIND[pl.kind] ?? pl.kind)} · ${fmtNum(pl.count)} clubs</small></span></li>`).join("");
  const clubRows = results.map((e, i) =>
    `<li role="option" id="sr-${i}" aria-selected="false" class="search-row" data-club="${esc(e.id)}">` +
    `<span class="swatch" style="background:${esc(leagueColor(e.leagueKey))}"></span>` +
    `<span class="sr-text"><b>${esc(e.name)}</b><small>${esc(e.venue ?? "")} · ${esc(e.league)}</small></span></li>`).join("");
  searchResults.innerHTML = placeRows + clubRows ||
    `<li class="search-row is-empty" role="option" aria-selected="false">No clubs match “${esc(searchInput.value.trim())}”</li>`;

  searchResults.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
  activeIndex = -1;
  searchResults.querySelectorAll("[data-club]").forEach((el) => {
    el.addEventListener("mousedown", (ev) => { ev.preventDefault(); selectClub(el.dataset.club); });
  });
  searchResults.querySelectorAll("[data-place]").forEach((el) => {
    el.addEventListener("mousedown", (ev) => { ev.preventDefault(); selectPlace(el.dataset.place, el.dataset.placeKind); });
  });
}

function selectPlace(name, kind) {
  const pl = places.find((x) => x.name === name && x.kind === kind);
  if (!pl) return;
  closeSuggestions();
  if (searchInput && window.matchMedia?.("(hover: none)").matches) searchInput.blur();
  flyToPlace(pl);
}

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderSuggestions(); });
}

function moveActive(delta) {
  const rows = [...searchResults.querySelectorAll("[data-club], [data-place]")];
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

function selectClub(id, { zoom = 9 } = {}) {
  const f = byId.get(id);
  if (!f) return;
  const key = f.properties.leagueKey;
  const lg = leagues.find((l) => l.key === key);
  // Flying to a club the facets are hiding would land the camera on an empty
  // patch of globe. Search is a direct instruction, so it wins over the facets.
  if (lg && !matchesFacets(lg)) clearFacets();
  if (!state.activeLeagues.has(key)) {
    setLeague(key, true);
    if (lg) setCollapsed(lg.group, false);
  }
  setSelected(id);
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
      const rows = [...searchResults.querySelectorAll("[data-club], [data-place]")];
      const row = rows[activeIndex] ?? rows[0];
      if (row) {
        ev.preventDefault();
        if (row.dataset.club) selectClub(row.dataset.club);
        else selectPlace(row.dataset.place, row.dataset.placeKind);
      }
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

  // One way in and one way out. Closing used to be possible only by pressing
  // the same pill again, which is not discoverable, and the sheet covered 59%
  // of a phone screen while it was up — so the map you were filtering was the
  // thing you could no longer see.
  const sheetHead = document.getElementById("sheet-head");
  const sheetTitle = document.getElementById("sheet-title");
  const sheetClose = document.getElementById("sheet-close");

  function closeSheets() {
    let wasOpen = false;
    for (const el of [legendPanel, statsEl]) {
      if (el?.classList.contains("is-open")) wasOpen = true;
      el?.classList.remove("is-open");
    }
    for (const b of document.querySelectorAll(".sheet-bar button")) b.setAttribute("aria-expanded", "false");
    if (sheetHead) sheetHead.hidden = true;
    return wasOpen;
  }

  function openSheet(name) {
    closeSheets();
    const target = document.getElementById(name);
    if (!target) return;
    target.classList.add("is-open");
    document.querySelector(`.sheet-bar button[data-sheet="${name}"]`)?.setAttribute("aria-expanded", "true");
    if (sheetHead) {
      sheetHead.hidden = false;
      if (sheetTitle) sheetTitle.textContent = name === "stats" ? "Numbers" : "Leagues";
    }
    if (name === "stats" && statsBody.hidden) statsToggle.click();
  }

  for (const btn of document.querySelectorAll(".sheet-bar button[data-sheet]")) {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.sheet);
      if (target?.classList.contains("is-open")) closeSheets();
      else openSheet(btn.dataset.sheet);
    });
  }

  sheetClose?.addEventListener("click", closeSheets);

  // Reaching for the map is the clearest possible "I am done with this panel".
  // Both are needed: a tap on the canvas, and the drag that starts a pan — the
  // latter is what makes the map usable while a sheet is up.
  map.on("dragstart", closeSheets);
  map.on("zoomstart", closeSheets);
  document.getElementById("map")?.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest(".panel, .sheet-bar, .sheet-head, .maplibregl-popup, .maplibregl-ctrl")) return;
    closeSheets();
  });

  // A grabber that cannot be dragged is a lie about the affordance.
  if (sheetHead) {
    let startY = null;
    sheetHead.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".sheet-close")) return;
      startY = ev.clientY;
      sheetHead.setPointerCapture?.(ev.pointerId);
    });
    sheetHead.addEventListener("pointerup", (ev) => {
      if (startY !== null && ev.clientY - startY > 48) closeSheets();
      startY = null;
    });
    sheetHead.addEventListener("pointercancel", () => { startY = null; });
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeSheets();
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
  // clubs.geojson is a committed artifact and can lag app.js. Without the
  // topFlight flag the tiers toggle would silently hide every league, so a
  // file that does not carry it makes everything eligible and the toggle
  // becomes a no-op instead of a blackout.
  if (!leagues.some((l) => l.topFlight)) for (const l of leagues) l.topFlight = true;
  places = Array.isArray(data.metadata.places) ? data.metadata.places : [];
  groups = normalizeGroups(data.metadata);
  allFeatures = data.features;

  buildIndexes(allFeatures);
  buildFocusChips();
  buildCountryOptions();   // before restoreState: it vets a saved country against this
  restoreState();
  wireFacets();
  updateFacetControls();
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
  // Defence in depth: even if an icon cannot be built, the source and layers
  // below must still be added. A map with no fallback dots is degraded; a map
  // with no layers shows nothing at all.
  for (const lg of leagues) {
    try { map.addImage(`dot-${lg.key}`, circleImage(lg.color)); }
    catch (err) { console.warn(`fallback dot for ${lg.key} failed:`, err); }
  }

  map.addSource("clubs", { type: "geojson", data });

  map.addLayer({
    id: "clubs-selected",
    type: "circle",
    source: "clubs",
    filter: ["==", ["get", "id"], ""],
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
      "icon-image": ["coalesce", ["image", ["concat", "club-", ["get", "id"]]],
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
      const unique = feats.filter((f) => !seen.has(f.properties.id) && seen.add(f.properties.id))
        .map((f) => byId.get(f.properties.id) ?? f);
      if (!unique.length) return;
      setSelected(unique[0].properties.id);
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
  // `on`, not `once`: the fallback below replaces the style, and that second
  // style.load is the one that has to draw the clubs.
  map.on("style.load", startLayers);
  if (map.isStyleLoaded()) startLayers();

  // Every club layer lives inside the map's style, so until a style loads there
  // is nothing on the globe at all. That made the whole map a hostage of one
  // free third-party tile service: when tiles.openfreemap.org is unreachable —
  // an outage, a filtered network, a DNS block — the page rendered no globe and
  // no clubs, only a line of small text. The clubs are ours and do not need
  // anybody's basemap, so if it has not arrived in time, draw them on a plain
  // globe instead of nothing.
  const BASEMAP_GRACE_MS = 8000;
  setTimeout(() => {
    if (layered) return;
    setReadout("Basemap unavailable — showing the clubs on a plain globe.");
    try {
      map.setStyle({
        version: 8,
        sources: {},
        layers: [{ id: "backdrop", type: "background", paint: { "background-color": "#0d1424" } }],
      });
    } catch (err) {
      console.error(err);
      setReadout("The map layers failed to initialise.");
    }
  }, BASEMAP_GRACE_MS);
})();

// read-only surface for the headless test suite
window.__worldxi = {
  get state() {
    return {
      on: [...state.activeLeagues], collapsed: [...state.collapsed], selected: state.selectedId,
      gender: state.gender, country: state.country, query: state.query, tiers: state.tiers,
      visible: visibleLeagues().map((l) => l.key),
    };
  },
  get leagues() { return leagues; },
  get countries() { return countries; },
  get places() { return places; },
  searchPlaces,
  flyToPlace,
  setFacet,
  setLeague,
  mapFilter: () => leagueFilter(),
  get stats() { return stats; },
  searchClubs,
  selectClub,
  nearestOf: (id) => buildNearest().get(id),
  imageOf: (id) => { const i = map?.getImage(`club-${id}`); return i ? { width: i.data.width, height: i.data.height } : null; },
  capacityRankOf: (id) => ranks.get(id),
  features: () => allFeatures,
  popupHtmlFor: (feats) => popupHtml(feats),
  shownClubCount,
  // What is actually on the map, as opposed to what the data says. The two
  // came apart once — layers absent, readout still counting clubs — so the
  // browser check needs to be able to tell the difference.
  mapCenter: () => { const c = map?.getCenter?.(); return c ? [c.lng, c.lat] : null; },
  mapLayers: () => {
    try { return (map?.getStyle?.()?.layers ?? []).map((l) => l.id).filter((id) => id.startsWith("clubs")); }
    catch { return []; }
  },
};
