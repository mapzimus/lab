/* Game Vault — browse NA release libraries, pick games, budget the drive. */
(() => {
  "use strict";

  const LS_KEY = "gamevault-picks-v1";
  const BATCH = 220; // tiles rendered per scroll batch
  const $ = (id) => document.getElementById(id);

  const TAG_CLASS = { "top-seller": "tag-ts", "classic": "tag-cl", "hidden-gem": "tag-hg" };
  const TAG_BADGE = { "top-seller": "★ TOP", "classic": "◆ CLASSIC", "hidden-gem": "◈ GEM" };

  const state = {
    platforms: [],           // [{id,label,repo,avgMB,count,tagged}]
    data: {},                // id -> rows [{t,f,s,d,h,y,g,dv,pb}]
    meta: {},                // id -> {g:[],dv:[],pb:[]} lookup tables
    descs: {},               // id -> Promise<{title: blurb}>, lazily fetched
    active: null,            // platform id
    filter: "all",
    sort: "az",
    letter: null,
    query: "",
    budgetGB: 3600,
    picks: {},               // id -> Set(title)
    visible: [],             // filtered rows of active tab
    rendered: 0,
  };

  /* ---------- persistence ---------- */
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      if (raw.budgetGB > 0) state.budgetGB = raw.budgetGB;
      for (const [k, arr] of Object.entries(raw.picks || {})) state.picks[k] = new Set(arr);
    } catch { /* fresh start */ }
  }
  function save() {
    const picks = {};
    for (const [k, set] of Object.entries(state.picks)) if (set.size) picks[k] = [...set];
    localStorage.setItem(LS_KEY, JSON.stringify({ budgetGB: state.budgetGB, picks }));
  }

  const picksFor = (id) => state.picks[id] || (state.picks[id] = new Set());

  /* ---------- data ---------- */
  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }
  async function platformRows(id) {
    if (!state.data[id]) state.data[id] = await fetchJSON(`data/${id}.json`);
    return state.data[id];
  }
  // genre/developer/publisher lookup tables (rows store indexes into these)
  async function platformMeta(id) {
    if (!state.meta[id]) {
      state.meta[id] = await fetchJSON(`data/${id}.meta.json`).catch(() => ({ g: [], dv: [], pb: [] }));
    }
    return state.meta[id];
  }
  // blurbs are a separate file so the grid isn't waiting on them
  async function platformDescs(id) {
    if (!state.descs[id]) {
      state.descs[id] = fetchJSON(`data/${id}.desc.json`).catch(() => ({}));
    }
    return state.descs[id];
  }
  const artURL = (p, f) =>
    `https://raw.githubusercontent.com/libretro-thumbnails/${p.repo}/master/Named_Boxarts/${encodeURIComponent(f)}`;

  /* ---------- stats ---------- */
  const fmtGB = (gb) => gb >= 1024 ? `${(gb / 1024).toFixed(2)} TB` : `${gb >= 100 ? Math.round(gb) : gb.toFixed(1)} GB`;
  // 2600/Intellivision carts are kilobytes — rounding those to MB just prints "0 MB"
  const fmtSize = (mb) =>
    mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" :
    mb >= 1 ? Math.round(mb * 10) / 10 + " MB" :
    Math.max(1, Math.round(mb * 1024)) + " KB";

  function totals() {
    let games = 0, mb = 0;
    const tags = { "top-seller": 0, "classic": 0, "hidden-gem": 0 };
    const byPlat = {};
    for (const p of state.platforms) {
      const set = state.picks[p.id];
      if (!set || !set.size) continue;
      const rows = state.data[p.id];
      let pmb = 0, pn = 0;
      if (rows) {
        for (const r of rows) {
          if (!set.has(r.t)) continue;
          pn++; pmb += r.s;
          if (r.h) tags[r.h]++;
        }
      } else {
        pn = set.size; pmb = set.size * p.avgMB; // tab not loaded yet — estimate
      }
      games += pn; mb += pmb;
      byPlat[p.id] = { games: pn, gb: pmb / 1024 };
    }
    return { games, gb: mb / 1024, tags, byPlat };
  }

  function renderStats() {
    const { games, gb, tags, byPlat } = totals();
    const cap = state.budgetGB;
    const pct = Math.min(100, (gb / cap) * 100);
    const fill = $("budget-fill");
    fill.style.width = pct + "%";
    fill.className = "gv-bar-fill" + (gb > cap ? " over" : pct > 85 ? " warn" : "");
    $("budget-text").textContent = `${fmtGB(gb)} / ${fmtGB(cap)}${gb > cap ? " — OVER BUDGET" : ""}`;
    $("stat-games").textContent = games.toLocaleString();
    $("stat-used").textContent = fmtGB(gb);
    $("stat-left").textContent = gb > cap ? "−" + fmtGB(gb - cap) : fmtGB(cap - gb);
    $("stat-ts").textContent = tags["top-seller"];
    $("stat-cl").textContent = tags["classic"];
    $("stat-hg").textContent = tags["hidden-gem"];
    for (const p of state.platforms) {
      const el = document.getElementById(`tab-${p.id}`);
      if (!el) continue;
      const n = byPlat[p.id]?.games || 0;
      el.querySelector(".t-count").textContent = `${n ? n + " / " : ""}${p.count.toLocaleString()}`;
      el.querySelector(".t-bar i").style.width = Math.min(100, ((byPlat[p.id]?.gb || 0) / cap) * 100 * 4) + "%";
    }
  }

  /* ---------- tabs ---------- */
  function renderTabs() {
    const nav = $("tabs");
    nav.innerHTML = "";
    for (const p of state.platforms) {
      const b = document.createElement("button");
      b.className = "gv-tab";
      b.id = `tab-${p.id}`;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(p.id === state.active));
      b.innerHTML = `<span class="t-name">${p.label}</span><span class="t-count">${p.count.toLocaleString()}</span><span class="t-bar"><i></i></span>`;
      b.addEventListener("click", () => selectPlatform(p.id));
      nav.appendChild(b);
    }
  }

  async function selectPlatform(id) {
    state.active = id;
    state.letter = null;
    syncHash();
    document.querySelectorAll(".gv-tab").forEach((t) => t.setAttribute("aria-selected", String(t.id === `tab-${id}`)));
    hideTip();
    $("grid").innerHTML = `<p class="gv-empty">Loading ${id}…</p>`;
    try {
      await Promise.all([platformRows(id), platformMeta(id)]);
    } catch (e) {
      $("grid").innerHTML = `<p class="gv-empty">Could not load data (${e.message}). Reload to retry.</p>`;
      return;
    }
    renderLetters();
    applyFilters();
    renderStats(); // exact sizes now that rows are loaded
  }

  /* ---------- letters ---------- */
  function renderLetters() {
    const rows = state.data[state.active] || [];
    const present = new Set(rows.map((r) => letterOf(r.t)));
    const wrap = $("letters");
    wrap.innerHTML = "";
    for (const L of ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]) {
      const b = document.createElement("button");
      b.textContent = L;
      b.disabled = !present.has(L);
      b.setAttribute("aria-pressed", String(state.letter === L));
      b.addEventListener("click", () => {
        state.letter = state.letter === L ? null : L;
        wrap.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.textContent === state.letter)));
        applyFilters();
      });
      wrap.appendChild(b);
    }
  }
  const letterOf = (t) => { const c = t[0].toUpperCase(); return c >= "A" && c <= "Z" ? c : "#"; };

  /* ---------- grid ---------- */
  function applyFilters() {
    const rows = state.data[state.active] || [];
    const q = state.query.trim().toLowerCase();
    const set = picksFor(state.active);
    state.visible = rows.filter((r) => {
      if (q && !r.t.toLowerCase().includes(q)) return false;
      if (state.letter && letterOf(r.t) !== state.letter) return false;
      switch (state.filter) {
        case "top-seller": case "classic": case "hidden-gem": return r.h === state.filter;
        case "tagged": return !!r.h;
        case "selected": return set.has(r.t);
        case "unselected": return !set.has(r.t);
        default: return true;
      }
    });
    if (state.sort === "year" || state.sort === "year-desc") {
      // year data is patchy upstream (cartridge platforms mostly), so undated games
      // always sink to the bottom instead of pretending to be year zero
      const dir = state.sort === "year" ? 1 : -1;
      state.visible = [...state.visible].sort((a, b) => {
        if (!a.y && !b.y) return a.t.localeCompare(b.t);
        if (!a.y) return 1;
        if (!b.y) return -1;
        return (a.y - b.y) * dir || a.t.localeCompare(b.t);
      });
    } else if (state.sort === "size") {
      state.visible = [...state.visible].sort((a, b) => b.s - a.s || a.t.localeCompare(b.t));
    } else if (state.sort === "tagged") {
      const rank = { "top-seller": 0, "classic": 1, "hidden-gem": 2 };
      state.visible = [...state.visible].sort((a, b) => (a.h ? rank[a.h] : 3) - (b.h ? rank[b.h] : 3) || a.t.localeCompare(b.t));
    }
    state.rendered = 0;
    $("grid").innerHTML = "";
    renderMeta();
    if (!state.visible.length) $("grid").innerHTML = `<p class="gv-empty">Nothing matches.</p>`;
    else renderBatch();
  }

  function renderMeta() {
    const p = state.platforms.find((x) => x.id === state.active);
    if (!p) return;
    const rows = state.data[state.active] || [];
    const picked = picksFor(state.active).size;
    $("grid-meta").textContent =
      `${p.label} — showing ${state.visible.length.toLocaleString()} of ${rows.length.toLocaleString()} games` +
      (picked ? ` · ${picked.toLocaleString()} selected` : "");
  }

  // URL hash tracks platform + filter (#ps2/hidden-gem) so views are shareable
  function syncHash() {
    const h = "#" + state.active + (state.filter !== "all" ? "/" + state.filter : "");
    history.replaceState(null, "", h);
  }
  function parseHash() {
    const [plat, filter] = location.hash.replace(/^#/, "").split("/");
    return {
      plat: state.platforms.some((p) => p.id === plat) ? plat : null,
      filter: ["top-seller", "classic", "hidden-gem", "tagged", "selected", "unselected"].includes(filter) ? filter : null,
    };
  }

  function renderBatch() {
    const p = state.platforms.find((x) => x.id === state.active);
    const set = picksFor(state.active);
    const frag = document.createDocumentFragment();
    const end = Math.min(state.rendered + BATCH, state.visible.length);
    for (let i = state.rendered; i < end; i++) {
      const r = state.visible[i];
      const tile = document.createElement("button");
      tile.className = "gv-tile" + (r.h ? " " + TAG_CLASS[r.h] : "");
      tile.setAttribute("aria-pressed", String(set.has(r.t)));
      tile.dataset.title = r.t;
      const sizeTxt = fmtSize(r.s);
      // No cover in the thumbnail set: leave the art area blank but keep the tile
      // fully selectable — the title still reads from the caption below.
      const cover = r.f
        ? `<img loading="lazy" decoding="async" src="${artURL(p, r.f)}" alt="">`
        : `<span class="no-art" aria-hidden="true"></span>`;
      tile.innerHTML =
        `${r.h ? `<span class="badge">${TAG_BADGE[r.h]}</span>` : ""}` +
        `<span class="check">✓</span>` +
        `<span class="cover">${cover}</span>` +
        `<span class="label"><span class="name">${escapeHTML(r.t)}</span><span class="size">${r.y ? r.y + " · " : ""}${sizeTxt}${r.d > 1 ? ` · ${r.d} discs` : ""}</span></span>`;
      tile.addEventListener("pointerenter", () => showTip(r, tile));
      tile.addEventListener("focus", () => showTip(r, tile));
      tile.addEventListener("pointerleave", hideTip);
      tile.addEventListener("blur", hideTip);
      const img = tile.querySelector("img");
      if (img) img.addEventListener("error", () => { tile.querySelector(".cover").innerHTML = `<span class="no-art" aria-hidden="true"></span>`; }, { once: true });
      tile.addEventListener("click", () => { toggle(r.t, tile); renderMeta(); });
      frag.appendChild(tile);
    }
    $("grid").appendChild(frag);
    state.rendered = end;
  }

  const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- hover detail ---------- */
  const TAG_WORD = { "top-seller": "★ Top seller", "classic": "◆ Classic", "hidden-gem": "◈ Hidden gem" };
  let tipToken = 0;

  async function showTip(r, tile) {
    const tip = $("tip");
    const token = ++tipToken;
    const forPlatform = state.active;
    const meta = await platformMeta(forPlatform);
    // bail if the pointer moved on, or the tab changed, while we were awaiting
    if (token !== tipToken || forPlatform !== state.active || !tile.isConnected) return;

    const facts = [];
    if (r.y) facts.push(String(r.y));
    if (r.g != null && meta.g?.[r.g]) facts.push(meta.g[r.g]);
    const maker = (r.dv != null && meta.dv?.[r.dv]) || (r.pb != null && meta.pb?.[r.pb]);
    if (maker) facts.push(maker);
    facts.push(fmtSize(r.s) + (r.d > 1 ? ` · ${r.d} discs` : ""));

    tip.innerHTML =
      `<strong>${escapeHTML(r.t)}</strong>` +
      `<span class="tip-facts">${escapeHTML(facts.join("  ·  "))}</span>` +
      (r.h ? `<span class="tip-tag ${TAG_CLASS[r.h]}">${TAG_WORD[r.h]}</span>` : "") +
      `<span class="tip-desc" id="tip-desc"></span>`;
    tip.hidden = false;
    placeTip(tile);

    // blurbs live in a separate lazily-fetched file; only PS1/PS2 have them upstream
    const descs = await platformDescs(forPlatform).then((d) => d).catch(() => ({}));
    if (token !== tipToken || forPlatform !== state.active || !tile.isConnected) return;
    const blurb = descs?.[r.t];
    const slot = document.getElementById("tip-desc");
    if (blurb && slot) { slot.textContent = blurb; placeTip(tile); }
  }

  function placeTip(tile) {
    const tip = $("tip");
    const box = tile.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    // prefer right of the tile, flip left near the edge; clamp vertically to the viewport
    let left = box.right + 10;
    if (left + w > innerWidth - 8) left = Math.max(8, box.left - w - 10);
    let top = box.top;
    if (top + h > innerHeight - 8) top = Math.max(8, innerHeight - h - 8);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function hideTip() {
    tipToken++;
    $("tip").hidden = true;
  }

  function toggle(title, tile) {
    const set = picksFor(state.active);
    set.has(title) ? set.delete(title) : set.add(title);
    tile.setAttribute("aria-pressed", String(set.has(title)));
    save();
    renderStats();
  }

  /* ---------- bulk + controls ---------- */
  function wireControls() {
    $("search").addEventListener("input", (e) => { state.query = e.target.value; applyFilters(); });

    $("filters").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-filter]");
      if (!b) return;
      state.filter = b.dataset.filter;
      document.querySelectorAll("#filters button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      syncHash();
      applyFilters();
    });

    $("sort").addEventListener("change", (e) => { state.sort = e.target.value; applyFilters(); });

    // back/forward and pasted #platform/filter links are same-document navigations,
    // so the grid has to be rebuilt explicitly
    addEventListener("hashchange", () => {
      const { plat, filter } = parseHash();
      const nextFilter = filter || "all";
      if (nextFilter !== state.filter) {
        state.filter = nextFilter;
        document.querySelectorAll("#filters button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.filter === nextFilter)));
      }
      if (plat && plat !== state.active) selectPlatform(plat);
      else applyFilters();
    });

    // "/" jumps to search, Esc clears it
    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
      if (e.key === "/" && !typing) { e.preventDefault(); $("search").focus(); }
      else if (e.key === "Escape" && state.query) { $("search").value = ""; state.query = ""; applyFilters(); }
    });

    $("select-tagged").addEventListener("click", () => {
      const set = picksFor(state.active);
      for (const r of state.data[state.active] || []) if (r.h) set.add(r.t);
      save(); applyFilters(); renderStats();
    });

    $("select-platform").addEventListener("click", () => {
      const p = state.platforms.find((x) => x.id === state.active);
      const rows = state.data[state.active] || [];
      if (!rows.length || !confirm(`Select all ${rows.length.toLocaleString()} games on ${p.label}?`)) return;
      const set = picksFor(state.active);
      for (const r of rows) set.add(r.t);
      save(); applyFilters(); renderStats();
    });

    $("clear-all").addEventListener("click", () => {
      const n = Object.values(state.picks).reduce((a, s) => a + s.size, 0);
      if (!n || !confirm(`Delete ALL ${n.toLocaleString()} picks across every platform? This can't be undone.`)) return;
      for (const set of Object.values(state.picks)) set.clear();
      save(); applyFilters(); renderStats();
    });

    $("clear-platform").addEventListener("click", () => {
      const p = state.platforms.find((x) => x.id === state.active);
      const set = picksFor(state.active);
      if (!set.size || !confirm(`Clear all ${set.size} picks on ${p.label}?`)) return;
      set.clear();
      save(); applyFilters(); renderStats();
    });

    $("budget").addEventListener("change", (e) => {
      const v = Number(e.target.value);
      if (v > 0) { state.budgetGB = v; save(); renderStats(); }
    });

    $("export-btn").addEventListener("click", openDrawer);
    $("drawer-close").addEventListener("click", () => { $("drawer").hidden = true; });
    $("drawer").addEventListener("click", (e) => { if (e.target === $("drawer")) $("drawer").hidden = true; });
    document.querySelectorAll("[data-export]").forEach((b) => b.addEventListener("click", () => doExport(b.dataset.export)));

    $("import-btn").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", importJSON);
  }

  /* ---------- export / import ---------- */
  async function ensureAllPickedLoaded() {
    for (const p of state.platforms) if (state.picks[p.id]?.size) await platformRows(p.id);
  }

  async function buildExport() {
    await ensureAllPickedLoaded();
    const { games, gb, byPlat } = totals();
    const picks = [];
    for (const p of state.platforms) {
      const set = state.picks[p.id];
      if (!set?.size) continue;
      for (const r of state.data[p.id]) {
        if (!set.has(r.t)) continue;
        picks.push({
          platform: p.id,
          platformLabel: p.label,
          title: r.t,
          romName: r.f ? r.f.replace(/\.png$/i, "") : r.t,
          discs: r.d,
          estMB: r.s,
          tag: r.h,
        });
      }
    }
    return { generated: new Date().toISOString(), budgetGB: state.budgetGB, usedGB: Math.round(gb * 10) / 10, totalGames: games, byPlatform: byPlat, picks };
  }

  async function openDrawer() {
    const { games, gb } = totals();
    $("export-summary").textContent = `${games.toLocaleString()} games · ${fmtGB(gb)} of ${fmtGB(state.budgetGB)}.`;
    $("drawer").hidden = false;
  }

  async function doExport(kind) {
    const data = await buildExport();
    let blob, name;
    if (kind === "json") {
      blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      name = "game-vault-picks.json";
    } else if (kind === "csv") {
      const rows = [["platform", "title", "romName", "discs", "estMB", "tag"]];
      for (const p of data.picks) rows.push([p.platform, p.title, p.romName, p.discs, p.estMB, p.tag || ""]);
      blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv" });
      name = "game-vault-picks.csv";
    } else {
      const lines = [`# Game Vault picks — ${data.totalGames} games, ~${fmtGB(data.usedGB)}`, ""];
      for (const p of state.platforms) {
        const mine = data.picks.filter((x) => x.platform === p.id);
        if (!mine.length) continue;
        lines.push(`## ${p.label} (${mine.length})`, "");
        for (const g of mine) lines.push(`- [ ] ${g.title}${g.discs > 1 ? ` (${g.discs} discs)` : ""}`);
        lines.push("");
      }
      blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      name = "game-vault-picks.md";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  function importJSON(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.picks)) throw new Error("no picks array");
        const known = new Set(state.platforms.map((p) => p.id));
        let n = 0;
        for (const g of data.picks) {
          if (!known.has(g.platform) || typeof g.title !== "string") continue;
          picksFor(g.platform).add(g.title);
          n++;
        }
        if (data.budgetGB > 0) { state.budgetGB = data.budgetGB; $("budget").value = data.budgetGB; }
        save(); applyFilters(); renderStats();
        alert(`Imported ${n} picks.`);
      } catch (err) {
        alert("Import failed: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  /* ---------- infinite scroll ---------- */
  function wireSentinel() {
    new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && state.rendered < state.visible.length) renderBatch();
    }, { rootMargin: "1200px" }).observe($("sentinel"));
  }

  /* ---------- boot ---------- */
  async function boot() {
    load();
    $("budget").value = state.budgetGB;
    try {
      state.platforms = await fetchJSON("data/platforms.json");
    } catch (e) {
      $("grid").innerHTML = `<p class="gv-empty">Could not load platform list (${e.message}).</p>`;
      return;
    }
    $("total-count").textContent = state.platforms.reduce((a, p) => a + p.count, 0).toLocaleString();
    $("total-platforms").textContent = state.platforms.length;
    renderTabs();
    wireControls();
    wireSentinel();
    renderStats();
    const { plat, filter } = parseHash();
    if (filter) {
      state.filter = filter;
      document.querySelectorAll("#filters button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.filter === filter)));
    }
    selectPlatform(plat || state.platforms[0].id);
  }
  boot();
})();
