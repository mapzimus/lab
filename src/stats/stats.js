(async function () {
  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat("en-US");
  const n = (v) => (v == null ? "—" : fmt.format(v));
  const signed = (v) => (v == null ? "" : v > 0 ? `+${fmt.format(v)}` : v < 0 ? `−${fmt.format(-v)}` : "±0");
  const el = (tag, cls, text) => {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  };

  // History (daily snapshots) always from the committed file; live numbers from the API.
  let store = { history: [], videos: {} };
  try {
    const r = await fetch("/data/video-stats.json", { cache: "no-cache" });
    if (r.ok) store = await r.json();
  } catch { /* no history yet */ }

  let live = null;
  try {
    const r = await fetch("/api/video-stats", { cache: "no-cache" });
    if (r.ok) live = await r.json();
  } catch { /* fall back to snapshot */ }
  const snap = live || store.latest;
  if (!snap) {
    $("statsUpdated").textContent = "Stats could not be loaded. Try again in a moment.";
    return;
  }

  // Fill a failed live platform from the last snapshot.
  for (const [k, p] of Object.entries(snap.platforms)) {
    if (!p.ok && store.latest?.platforms?.[k]?.ok) snap.platforms[k] = { ...store.latest.platforms[k], stale: true };
  }

  $("statsUpdated").textContent = `Updated ${new Date(snap.updated).toLocaleString()}`;
  $("statsSource").hidden = false;
  $("statsSource").textContent = live ? "Live" : "Daily snapshot";

  const history = store.history || [];
  const today = snap.updated.slice(0, 10);
  const prev = [...history].reverse().find((r) => r.date < today);
  const weekAgo = [...history].reverse().find((r) => r.date <= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));

  const NAMES = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };
  const FOLLOW = { youtube: "Subscribers", tiktok: "Followers", instagram: "Followers" };

  // ---- Platform cards ----
  let totalFollowers = 0;
  for (const [k, p] of Object.entries(snap.platforms)) {
    const card = el("article", `stats-card stats-${k}`);
    const head = el("a", "stats-card-head");
    head.href = p.url; head.target = "_blank"; head.rel = "noopener";
    head.append(el("h3", null, NAMES[k]), el("span", "stats-handle", "@mapzimus ↗"));
    card.append(head);
    if (!p.ok) {
      card.append(el("p", "stats-off", p.reason || "Unavailable"));
      $("statsPlatforms").append(card);
      continue;
    }
    totalFollowers += p.followers || 0;
    const big = el("div", "stats-big");
    big.append(el("span", "stats-num", n(p.followers)), el("span", "stats-label", FOLLOW[k]));
    const dDay = prev?.[k]?.followers != null ? p.followers - prev[k].followers : null;
    const dWeek = weekAgo?.[k]?.followers != null ? p.followers - weekAgo[k].followers : null;
    if (dDay != null) big.append(el("span", "stats-delta", `${signed(dDay)} since ${prev.date}`));
    if (dWeek != null && weekAgo !== prev) big.append(el("span", "stats-delta", `${signed(dWeek)} in 7 days`));
    card.append(big);
    const dl = el("dl", "stats-dl");
    const row = (label, v) => { if (v == null) return; dl.append(el("dt", null, label), el("dd", null, v)); };
    row("Views", p.views != null ? `${n(p.views)}${p.exact ? "" : "≈"}` : null);
    row("Likes", n(p.likes) === "—" ? null : n(p.likes));
    row(k === "instagram" ? "Posts" : "Videos", n(p.videos));
    if (p.views && p.videos) row("Avg views / video", n(Math.round(p.views / p.videos)));
    if (p.likes && p.videos) row("Avg likes / video", n(Math.round(p.likes / p.videos)));
    card.append(dl);
    if (p.stale) card.append(el("p", "stats-off", "Live fetch failed; showing last snapshot."));
    $("statsPlatforms").append(card);
  }

  // ---- Analysis ----
  const notes = [];
  const yt = snap.platforms.youtube;
  const tt = snap.platforms.tiktok;
  notes.push(`${n(totalFollowers)} followers across all connected platforms.`);
  if (yt.ok && yt.items?.length) {
    const vids = [...yt.items].sort((a, b) => b.views - a.views);
    const sorted = vids.map((v) => v.views).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const top5 = vids.slice(0, 5).reduce((s, v) => s + v.views, 0);
    notes.push(`YouTube: median video gets ${n(median)} views; the mean is ${n(Math.round(yt.views / vids.length))}. ${median * 2 < yt.views / vids.length ? "A few hits carry the channel." : "Views are spread fairly evenly."}`);
    notes.push(`Top 5 YouTube videos hold ${Math.round((top5 / yt.views) * 100)}% of all views. Best: “${vids[0].title}” (${n(vids[0].views)}).`);
    notes.push(`YouTube converts about ${(yt.followers / (yt.views / 1000)).toFixed(1)} subscribers per 1,000 views.`);
    const breakouts = vids.filter((v) => v.views >= median * 3).length;
    if (breakouts) notes.push(`${breakouts} of ${vids.length} YouTube videos broke out (3× the median or more).`);
  }
  if (tt.ok && tt.likes && tt.followers) notes.push(`TikTok: ${n(Math.round(tt.likes / tt.videos))} likes per video, ${(tt.likes / tt.followers).toFixed(1)} likes per follower.`);
  if (yt.ok && tt.ok && yt.followers && tt.followers) notes.push(`TikTok audience is ${(tt.followers / yt.followers).toFixed(1)}× YouTube's for the same kind of content.`);
  if (prev) {
    const growth = Object.keys(NAMES)
      .filter((k) => snap.platforms[k].ok && prev[k]?.followers != null)
      .map((k) => [k, snap.platforms[k].followers - prev[k].followers])
      .sort((a, b) => b[1] - a[1]);
    if (growth.length && growth[0][1] > 0) notes.push(`Fastest growing since ${prev.date}: ${NAMES[growth[0][0]]} (${signed(growth[0][1])}).`);
  }
  if (!yt.exact && yt.ok) notes.push("YouTube counts over 1K are rounded until a YouTube API key is added.");
  for (const t of notes) $("statsNotes").append(el("li", null, t));

  // ---- Growth charts (one sparkline per platform metric) ----
  function spark(points) {
    const w = 320, h = 80, pad = 4;
    const ys = points.map((p) => p[1]);
    const min = Math.min(...ys), max = Math.max(...ys);
    const sx = (i) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
    const sy = (v) => h - pad - (max === min ? 0.5 : (v - min) / (max - min)) * (h - pad * 2);
    const d = points.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p[1]).toFixed(1)}`).join("");
    const svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="trend"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>${points.length === 1 ? `<circle cx="${sx(0)}" cy="${sy(ys[0])}" r="3" fill="currentColor"/>` : ""}</svg>`;
    return svg;
  }
  const series = [
    ["youtube", "followers", "YouTube subscribers"],
    ["youtube", "views", "YouTube views"],
    ["tiktok", "followers", "TikTok followers"],
    ["tiktok", "likes", "TikTok likes"],
    ["instagram", "followers", "Instagram followers"],
  ];
  for (const [k, m, label] of series) {
    const pts = history.filter((r) => r[k]?.[m] != null).map((r) => [r.date, r[k][m]]);
    if (!pts.length) continue;
    const box = el("figure", `stats-chart stats-${k}`);
    box.innerHTML = spark(pts);
    const cap = el("figcaption");
    cap.append(el("strong", null, label), el("span", null, `${pts[0][0]} → ${pts.at(-1)[0]} · ${signed(pts.at(-1)[1] - pts[0][1])}`));
    box.append(cap);
    $("statsCharts").append(box);
  }
  if (history.length < 2) $("statsCharts").append(el("p", "stats-off", "Growth lines fill in as daily snapshots accumulate."));

  // ---- Video table ----
  if (yt.ok && yt.items?.length) {
    const body = $("statsVideos").querySelector("tbody");
    const vids = [...yt.items].sort((a, b) => b.views - a.views);
    vids.forEach((v, i) => {
      const h = store.videos?.[v.id] || [];
      const before = [...h].reverse().find((x) => x[0] < today);
      const tr = el("tr");
      const a = el("a", null, v.title || v.id);
      a.href = v.url; a.target = "_blank"; a.rel = "noopener";
      const td = el("td"); td.append(a);
      tr.append(el("td", "num", String(i + 1)), td, el("td", "num", n(v.views)),
        el("td", "num", before ? signed(v.views - before[1]) : ""),
        el("td", "num", `${((v.views / yt.views) * 100).toFixed(1)}%`));
      body.append(tr);
    });
  }
})();
