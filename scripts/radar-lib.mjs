// Shared radar collection logic. Runs in Node (scripts/radar.mjs) and in
// Cloudflare Pages Functions (functions/api/radar.js), so: fetch only, no fs.

// ---------------------------------------------------------------------------
// Interest profile. Keyword -> weight. Matched against name + description +
// topics/tags, case-insensitive. Tune freely; this is the "think about me".
// ---------------------------------------------------------------------------
const INTERESTS = [
  // maps & GIS (core)
  [/\b(gis|geospatial|geojson|geocod|cartograph|choropleth|projection|shapefile|geotiff|raster|vector tiles?|maplibre|openstreetmap|\bosm\b|leaflet|basemap|dem\b|elevation|satellite imagery|remote sensing|h3\b|s2 geometry|postgis|overture)\b/i, 5],
  [/\b(map|maps|mapping|terrain|globe|atlas|coordinates?|lat\/?lon)\b/i, 3],
  // browser data tools
  [/\b(csv|parquet|duckdb|dataset explorer|data (cleaning|wrangl|viz|visuali[sz])|d3\b|observable|chart|plot|svg)\b/i, 3],
  // creative coding / design / math
  [/\b(generative|procedural|creative coding|p5\.?js|shader|webgl|webgpu|three\.?js|canvas|fractal|voronoi|noise|simulation|cellular automat|math visuali[sz]|geometry)\b/i, 3],
  // teaching & fun
  [/\b(interactive (explainer|demo|textbook)|educational|teaching|puzzle|browser game|wordle|daily game)\b/i, 3],
  // stack
  [/\b(cloudflare|workers?\b|wasm|webassembly|no.?build|vanilla js|static site|single.?file|client.?side|offline.?first|local.?first)\b/i, 2],
  // AI that's useful for the lab, not generic
  [/\b(text.?to.?(svg|map|geo)|image segmentation|ocr|vision model|embedding|small (llm|model)|on.?device|transformers\.?js)\b/i, 2],
];

const score = (text) => INTERESTS.reduce((s, [re, w]) => s + (re.test(text) ? w : 0), 0);

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": "mapzimus-radar", ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function githubSearch(q, sort, token) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&order=desc&per_page=30`;
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return (await getJSON(url, headers)).items ?? [];
  } catch (err) {
    console.error(`GitHub search failed (${q}): ${err.message}`);
    return [];
  }
}

async function hfList(kind, params) {
  const url = `https://huggingface.co/api/${kind}?${new URLSearchParams(params)}`;
  try {
    return await getJSON(url);
  } catch (err) {
    console.error(`HF ${kind} failed: ${err.message}`);
    return [];
  }
}

async function collectGitHub(daysAgo, token) {
  const recent = `created:>${daysAgo(14)}`;
  const active = `pushed:>${daysAgo(7)}`;
  const queries = [
    // fresh & hot generally (trending proxy: new repos gathering stars fast)
    [`${recent} stars:>100`, "stars"],
    // topic sweeps matched to the lab
    [`topic:gis ${active} stars:>20`, "updated"],
    [`topic:maps ${active} stars:>20`, "updated"],
    [`topic:cartography ${active} stars:>5`, "updated"],
    [`topic:geospatial ${active} stars:>20`, "updated"],
    [`topic:data-visualization ${active} stars:>50`, "updated"],
    [`topic:generative-art ${active} stars:>10`, "updated"],
    [`topic:webgl ${active} stars:>30`, "updated"],
    [`topic:cloudflare-workers ${active} stars:>10`, "updated"],
    [`browser game ${recent} stars:>20 in:name,description`, "stars"],
  ];
  const seen = new Map();
  for (const [q, sort] of queries) {
    for (const r of await githubSearch(q, sort, token)) {
      if (!seen.has(r.full_name)) seen.set(r.full_name, r);
    }
  }
  return [...seen.values()]
    .map((r) => {
      const text = `${r.full_name} ${r.description ?? ""} ${(r.topics ?? []).join(" ")}`;
      const isNew = r.created_at >= daysAgo(14);
      return {
        name: r.full_name,
        url: r.html_url,
        desc: (r.description ?? "").trim(),
        stars: r.stargazers_count,
        lang: r.language,
        isNew,
        // relevance + log-star momentum; brand-new repos get a boost
        rank: score(text) * 10 + Math.log10(1 + r.stargazers_count) * 2 + (isNew ? 3 : 0),
        relevant: score(text) > 0,
      };
    })
    .sort((a, b) => b.rank - a.rank);
}

async function collectHuggingFace() {
  const common = { sort: "trendingScore", direction: "-1", limit: "40" };
  const [models, datasets, spaces] = await Promise.all([
    hfList("models", { ...common, full: "true" }),
    hfList("datasets", { ...common, full: "true" }),
    hfList("spaces", common),
  ]);
  const wrap = (items, kind) =>
    items.map((it) => {
      const id = it.id ?? it.modelId;
      const tags = (it.tags ?? []).join(" ");
      const card = it.cardData ?? {};
      const text = `${id} ${tags} ${it.pipeline_tag ?? ""} ${card.title ?? ""} ${card.short_description ?? ""}`;
      return {
        kind,
        id,
        url: `https://huggingface.co/${kind === "models" ? "" : kind + "/"}${id}`,
        likes: it.likes ?? 0,
        downloads: it.downloads,
        pipeline: it.pipeline_tag,
        rank: score(text) * 10 + Math.log10(1 + (it.likes ?? 0)) * 2 + (it.trendingScore ?? 0) / 10,
        relevant: score(text) > 0,
      };
    });
  return [...wrap(models, "models"), ...wrap(datasets, "datasets"), ...wrap(spaces, "spaces")]
    .sort((a, b) => b.rank - a.rank);
}

// Hacker News via the Algolia API: current front page plus recent Show HN.
async function collectHackerNews(daysAgo) {
  const base = "https://hn.algolia.com/api/v1";
  const since = Math.floor(Date.parse(daysAgo(3)) / 1000);
  const [front, show] = await Promise.all([
    getJSON(`${base}/search?tags=front_page&hitsPerPage=30`).catch(() => ({ hits: [] })),
    getJSON(`${base}/search_by_date?tags=show_hn&numericFilters=points>20,created_at_i>${since}&hitsPerPage=30`).catch(() => ({ hits: [] })),
  ]);
  const seen = new Map();
  for (const h of [...front.hits, ...show.hits]) {
    if (!seen.has(h.objectID)) seen.set(h.objectID, h);
  }
  return [...seen.values()]
    .map((h) => {
      const isShow = /^show hn/i.test(h.title ?? "");
      const text = `${h.title ?? ""} ${h.url ?? ""}`;
      return {
        title: (h.title ?? "").replace(/^show hn:\s*/i, ""),
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
        points: h.points ?? 0,
        comments: h.num_comments ?? 0,
        isShow,
        rank: score(text) * 10 + Math.log10(1 + (h.points ?? 0)) * 2 + (isShow ? 2 : 0),
        relevant: score(text) > 0,
      };
    })
    .sort((a, b) => b.rank - a.rank);
}

// Hugging Face Daily Papers: curated trending ML papers.
async function collectPapers() {
  const items = await getJSON("https://huggingface.co/api/daily_papers?limit=50").catch(() => []);
  return items
    .map((it) => {
      const p = it.paper ?? it;
      const summary = (p.summary ?? "").replace(/\s+/g, " ").trim();
      const text = `${p.title ?? ""} ${summary}`;
      const firstSentence = summary.match(/^.{25,220}?[.!?](\s|$)/)?.[0].trim() ?? summary.slice(0, 200);
      return {
        title: p.title ?? "",
        url: `https://huggingface.co/papers/${p.id}`,
        desc: firstSentence,
        upvotes: p.upvotes ?? 0,
        rank: score(text) * 10 + Math.log10(1 + (p.upvotes ?? 0)) * 2,
        relevant: score(text) > 0,
      };
    })
    .sort((a, b) => b.rank - a.rank);
}

// Generic RSS/Atom collector, regex-parsed (no XML dep, Workers-safe).
const decodeEntities = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ");

function cleanText(s, max = 160) {
  const t = decodeEntities((s ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const sentence = t.match(/^.{25,}?[.!?](\s|$)/)?.[0].trim() ?? t;
  return sentence.length > max ? sentence.slice(0, max - 3).trimEnd() + "…" : sentence;
}

async function collectRSS(url, limit = 6) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "mapzimus-radar" } });
    if (!res.ok) return [];
    const xml = (await res.text()).slice(0, 400000);
    const field = (block, tag) =>
      block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "";
    const items = [];
    // Field order varies per generator (Blogspot puts <link> last), so grab
    // each item/entry block and extract fields independently.
    for (const m of xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)) {
      const block = m[0];
      const link = field(block, "link").trim() ||
        block.match(/<link[^>]*?rel=['"]alternate['"][^>]*?href=['"]([^'"]+)['"]/)?.[1] ||
        block.match(/<link[^>]*?href=['"]([^'"]+)['"][^>]*?rel=['"]alternate['"]/)?.[1] ||
        block.match(/<link[^>]*?href=['"]([^'"]+)['"]/)?.[1] || "";
      const title = cleanText(field(block, "title"), 120);
      if (!title || !link) continue;
      items.push({
        title,
        url: decodeEntities(link),
        desc: cleanText(field(block, "description") || field(block, "summary")),
      });
      if (items.length >= limit) break;
    }
    return items;
  } catch {
    return [];
  }
}

// weeklyOSM: latest issues from the RSS feed.
async function collectWeeklyOSM() {
  return (await collectRSS("https://weeklyosm.eu/feed", 3)).map(({ title, url }) => ({ title, url }));
}

// arXiv: newest submissions in vision/graphics/HCI, Atom XML regex-parsed.
async function collectArxiv() {
  const q = "cat:cs.CV+OR+cat:cs.GR+OR+cat:cs.HC";
  const url = `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=50`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "mapzimus-radar" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    for (const m of xml.matchAll(/<entry>[\s\S]*?<id>([\s\S]*?)<\/id>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<summary>([\s\S]*?)<\/summary>[\s\S]*?<\/entry>/g)) {
      const title = m[2].replace(/\s+/g, " ").trim();
      const summary = m[3].replace(/\s+/g, " ").trim();
      const s = score(`${title} ${summary}`);
      if (s <= 0) continue;
      items.push({
        title,
        url: m[1].trim(),
        desc: summary.match(/^.{25,220}?[.!?](\s|$)/)?.[0].trim() ?? summary.slice(0, 200),
        rank: s * 10,
      });
    }
    return items.sort((a, b) => b.rank - a.rank).slice(0, 8);
  } catch {
    return [];
  }
}

// itch.io: new & popular free browser (HTML5) games, RSS regex-parsed.
// The filtered feed sits behind bot protection on some networks; fall back
// to the global new-games feed.
async function collectItch() {
  try {
    let xml = "";
    for (const feed of ["https://itch.io/games/new-and-popular/free/html5.xml", "https://itch.io/feed/new.xml"]) {
      const res = await fetch(feed, { headers: { "User-Agent": "mapzimus-radar" } });
      if (!res.ok) continue;
      const body = (await res.text()).slice(0, 200000);
      if (body.includes("<rss")) { xml = body; break; }
    }
    if (!xml) return [];
    const items = [];
    for (const m of xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?(?:<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>)?[\s\S]*?<\/item>/g)) {
      const decode = (s) => s
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
      const desc = decode((m[3] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
      items.push({
        title: decode(m[1].trim()),
        url: m[2].trim(),
        desc: desc.length > 160 ? desc.slice(0, 157).trimEnd() + "…" : desc,
      });
      if (items.length >= 9) break;
    }
    return items;
  } catch {
    return [];
  }
}

// Data.gov: recently modified datasets matching geo/data themes, via the
// catalog's Solr-backed JSON search (the CKAN API was retired in 2025).
async function collectDataGov() {
  const params = new URLSearchParams({ _q: "geospatial", _sort: "-modified", _format: "json" });
  try {
    const data = await getJSON(`https://catalog.data.gov/search?${params}`);
    return (data.results ?? [])
      .map((d) => {
        const notes = (d.description ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        return {
          title: d.title ?? d.slug,
          url: `https://catalog.data.gov/dataset/${d.slug}`,
          desc: notes.match(/^.{25,180}?[.!?](\s|$)/)?.[0].trim() ?? notes.slice(0, 160),
          org: d.organization?.name ?? "",
          rank: score(`${d.title ?? ""} ${notes} ${(d.keyword ?? []).join(" ")}`) + (d.has_spatial ? 2 : 0),
        };
      })
      .filter((d) => d.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8);
  } catch (err) {
    console.error(`Data.gov failed: ${err.message}`);
    return [];
  }
}

// Kaggle: hottest datasets. Needs KAGGLE_USERNAME + KAGGLE_KEY credentials
// (Pages project secrets / Actions secrets); silently skipped without them.
async function collectKaggle(username, key) {
  if (!username || !key) return [];
  try {
    const auth = btoa(`${username}:${key}`);
    const items = await getJSON("https://www.kaggle.com/api/v1/datasets/list?sortBy=hottest&pageSize=40", {
      Authorization: `Basic ${auth}`,
    });
    return (Array.isArray(items) ? items : [])
      .map((d) => ({
        title: d.title ?? d.ref,
        url: d.url ?? `https://www.kaggle.com/datasets/${d.ref}`,
        desc: (d.subtitle ?? "").trim(),
        votes: d.voteCount ?? 0,
        rank: score(`${d.title ?? ""} ${d.subtitle ?? ""}`) * 10 + Math.log10(1 + (d.voteCount ?? 0)) * 2,
        relevant: score(`${d.title ?? ""} ${d.subtitle ?? ""}`) > 0,
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8);
  } catch (err) {
    console.error(`Kaggle failed: ${err.message}`);
    return [];
  }
}

// QGIS new plugins: the modern plugin repository exposes no feed, so scrape
// the "fresh" (created in the last 30 days) listing page.
async function collectQgisPlugins(limit = 8) {
  try {
    const res = await fetch("https://plugins.qgis.org/plugins/fresh/", { headers: { "User-Agent": "mapzimus-radar" } });
    if (!res.ok) return [];
    const html = await res.text();
    const NON_PLUGIN = new Set(["stable", "server", "popular", "new_qgis_ready", "most_voted", "most_downloaded", "latest", "fresh", "experimental", "deprecated", "best_rated", "author", "tags", "user"]);
    const seen = new Set();
    const items = [];
    for (const m of html.matchAll(/<a href="\/plugins\/([a-zA-Z0-9_.-]+)\/"[^>]*>\s*([^<>{}][^<>]{1,80}?)\s*<\/a>/g)) {
      const slug = m[1];
      if (NON_PLUGIN.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      items.push({ title: cleanText(m[2], 100), url: `https://plugins.qgis.org/plugins/${slug}/` });
      if (items.length >= limit) break;
    }
    return items;
  } catch {
    return [];
  }
}

// Geospatial library releases via the GitHub releases API.
const GEO_RELEASE_REPOS = [
  "maplibre/maplibre-gl-js",
  "Leaflet/Leaflet",
  "Turfjs/turf",
  "OSGeo/gdal",
  "postgis/postgis",
  "qgis/QGIS",
  "visgl/deck.gl",
  "duckdb/duckdb",
  "felt/tippecanoe",
  "protomaps/PMTiles",
];

async function collectGeoReleases(daysAgo, token) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const results = await Promise.all(GEO_RELEASE_REPOS.map(async (repo) => {
    try {
      const r = await getJSON(`https://api.github.com/repos/${repo}/releases/latest`, headers);
      return {
        repo,
        title: `${repo.split("/")[1]} ${r.tag_name ?? r.name ?? ""}`.trim(),
        url: r.html_url,
        desc: cleanText(r.body ?? "", 160),
        publishedAt: (r.published_at ?? "").slice(0, 10),
        isFresh: (r.published_at ?? "") >= daysAgo(30),
      };
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean).sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1));
}

// GIS Stack Exchange hot questions (Stack Exchange API, keyless).
async function collectGisSE() {
  try {
    const data = await getJSON("https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=gis&pagesize=10");
    return (data.items ?? []).map((q) => ({
      title: cleanText(q.title, 140),
      url: q.link,
      score: q.score ?? 0,
      answers: q.answer_count ?? 0,
    }));
  } catch {
    return [];
  }
}

// NASA Earthdata CMR: recently updated earth-observation collections.
async function collectNasaCMR() {
  try {
    const data = await getJSON("https://cmr.earthdata.nasa.gov/search/collections.json?sort_key=-revision_date&page_size=10&has_granules=true");
    return (data.feed?.entry ?? []).map((c) => ({
      title: cleanText(c.title ?? c.dataset_id ?? "", 140),
      url: `https://search.earthdata.nasa.gov/search?q=${encodeURIComponent(c.short_name ?? c.title ?? "")}`,
      desc: cleanText(c.summary ?? "", 160),
      org: c.data_center ?? "",
    }));
  } catch {
    return [];
  }
}

// Run the geospatial sweep: geo news, tools, releases, data, and community.
export async function sweepGeo(today, githubToken) {
  const daysAgo = (n) => new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);
  const [mapsmania, georealm, geoworld, qgis, releases, gisse, nasa, datagov, osm] = await Promise.all([
    collectRSS("https://googlemapsmania.blogspot.com/feeds/posts/default?alt=rss", 8),
    collectRSS("https://www.geographyrealm.com/feed/", 6),
    collectRSS("https://geospatialworld.net/feed/", 6),
    collectQgisPlugins(8),
    collectGeoReleases(daysAgo, githubToken),
    collectGisSE(),
    collectNasaCMR(),
    collectDataGov(),
    collectWeeklyOSM(),
  ]);
  return {
    generatedAt: today,
    news: { mapsmania, georealm, geoworld },
    qgis,
    releases,
    gisse,
    nasa,
    datagov,
    osm,
  };
}

// ---------------------------------------------------------------------------
// Soccer radar: news + transfers (RSS), scores + ESPN news (public JSON API).
// ---------------------------------------------------------------------------
const SOCCER_LEAGUES = [
  ["eng.1", "Premier League"],
  ["esp.1", "La Liga"],
  ["usa.1", "MLS"],
  ["uefa.champions", "Champions League"],
];

async function collectScores() {
  const results = await Promise.all(SOCCER_LEAGUES.map(async ([code, league]) => {
    try {
      const data = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard`);
      return (data.events ?? []).map((e) => {
        const comp = e.competitions?.[0];
        const [home, away] = comp?.competitors ?? [];
        return {
          league,
          title: e.shortName ?? e.name,
          url: `https://www.espn.com/soccer/match/_/gameId/${e.id}`,
          status: comp?.status?.type?.shortDetail ?? "",
          score: home && away ? `${home.team?.abbreviation ?? ""} ${home.score ?? ""}–${away.score ?? ""} ${away.team?.abbreviation ?? ""}` : "",
        };
      });
    } catch {
      return [];
    }
  }));
  return results.flat().slice(0, 18);
}

async function collectEspnSoccerNews() {
  try {
    const data = await getJSON("https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/news");
    return (data.articles ?? []).slice(0, 10).map((a) => ({
      title: cleanText(a.headline ?? "", 120),
      url: a.links?.web?.href ?? "",
      desc: cleanText(a.description ?? ""),
    })).filter((a) => a.url);
  } catch {
    return [];
  }
}

const TRANSFER_RE = /\b(transfer|sign(s|ing|ed)?|bid|fee|loan|move to|swoop|deal|contract talks|release clause|gossip)\b/i;

export async function sweepSoccer(today) {
  const [bbc, guardian, espn, scores] = await Promise.all([
    collectRSS("https://feeds.bbci.co.uk/sport/football/rss.xml", 20),
    collectRSS("https://www.theguardian.com/football/rss", 20),
    collectEspnSoccerNews(),
    collectScores(),
  ]);
  const news = [...bbc, ...guardian, ...espn];
  const isTransfer = (i) => TRANSFER_RE.test(`${i.title} ${i.desc}`);
  return {
    generatedAt: today,
    scores,
    transfers: news.filter(isTransfer).slice(0, 12),
    news: news.filter((i) => !isTransfer(i)).slice(0, 15),
  };
}

// ---------------------------------------------------------------------------
// Stocks radar: trending tickers and movers. Signals, not financial advice.
// ---------------------------------------------------------------------------
async function collectYahooTrending() {
  try {
    const data = await getJSON("https://query1.finance.yahoo.com/v1/finance/trending/US?count=15");
    return (data.finance?.result?.[0]?.quotes ?? []).map((q) => q.symbol).filter(Boolean);
  } catch {
    return [];
  }
}

async function collectStocktwits() {
  try {
    const data = await getJSON("https://api.stocktwits.com/api/2/trending/symbols.json");
    return (data.symbols ?? []).map((s) => ({ symbol: s.symbol, title: s.title })).slice(0, 15);
  } catch {
    return [];
  }
}

async function quote(symbol) {
  try {
    const data = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    return {
      symbol,
      name: meta.longName ?? meta.shortName ?? symbol,
      price,
      changePct: price && prev ? ((price - prev) / prev) * 100 : null,
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
    };
  } catch {
    return null;
  }
}

export async function sweepStocks(today) {
  const [trendingSymbols, stocktwits] = await Promise.all([collectYahooTrending(), collectStocktwits()]);
  const seen = new Set();
  const ordered = [];
  for (const s of [...trendingSymbols, ...stocktwits.map((t) => t.symbol)]) {
    if (s && !seen.has(s) && !/\.[A-Z]+$/.test(s)) { seen.add(s); ordered.push(s); }
    if (ordered.length >= 16) break;
  }
  const quotes = (await Promise.all(ordered.map(quote))).filter(Boolean);
  const stName = new Map(stocktwits.map((t) => [t.symbol, t.title]));
  for (const q of quotes) if (!q.name || q.name === q.symbol) q.name = stName.get(q.symbol) ?? q.symbol;
  return {
    generatedAt: today,
    disclaimer: "Trend signals from public data — not financial advice.",
    trending: quotes,
    gainers: [...quotes].filter((q) => q.changePct != null).sort((a, b) => b.changePct - a.changePct).slice(0, 8),
    social: stocktwits.slice(0, 10).map((t) => ({
      title: `${t.symbol} — ${t.title}`,
      url: `https://stocktwits.com/symbol/${encodeURIComponent(t.symbol)}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// Politics radar: progressive news and accountability journalism (RSS).
// ---------------------------------------------------------------------------
const POLITICS_FEEDS = [
  ["guardian", "The Guardian — US politics", "https://www.theguardian.com/us-news/us-politics/rss"],
  ["motherjones", "Mother Jones", "https://www.motherjones.com/feed/"],
  ["nation", "The Nation", "https://www.thenation.com/feed/?post_type=article"],
  ["propublica", "ProPublica", "https://www.propublica.org/feeds/propublica/main"],
  ["intercept", "The Intercept", "https://theintercept.com/feed/?rss"],
  ["commondreams", "Common Dreams", "https://www.commondreams.org/feeds/news.rss"],
];

export async function sweepPolitics(today) {
  const feeds = await Promise.all(POLITICS_FEEDS.map(async ([key, label, url]) => ({
    key,
    label,
    items: await collectRSS(url, 6),
  })));
  return { generatedAt: today, feeds: feeds.filter((f) => f.items.length) };
}

// Fetch a one-line caption for a Hugging Face item from its card README:
// first meaningful prose line after the YAML frontmatter, markdown stripped.
async function hfCaption(kind, id) {
  const prefix = kind === "models" ? "" : `${kind}/`;
  const url = `https://huggingface.co/${prefix}${id}/raw/main/README.md`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "mapzimus-radar" } });
    if (!res.ok) return "";
    let text = (await res.text()).slice(0, 20000).replace(/^---\n[\s\S]*?\n---/, "");
    for (let line of text.split("\n")) {
      line = line
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
        .replace(/<[^>]+>/g, "") // html tags
        .replace(/[*_`#>|]/g, "")
        .replace(/&[a-z]+;|&#\d+;/g, " ") // html entities
        .replace(/\s+/g, " ")
        .trim();
      // skip headings-turned-empty, badges, separators, and boilerplate
      if (line.length < 25 || /^(:?-|=|\||!)/.test(line)) continue;
      if (/configuration reference|join our (wechat|discord)|^path\s*:|license\s*:|huggingface\.co\/docs/i.test(line)) continue;
      const sentence = line.match(/^.{25,180}?[.!?](\s|$)/)?.[0].trim() ?? line;
      return sentence.length > 180 ? sentence.slice(0, 177).trimEnd() + "…" : sentence;
    }
  } catch { /* caption is best-effort */ }
  return "";
}

async function addCaptions(items) {
  await Promise.all(items.map(async (it) => {
    it.desc = await hfCaption(it.kind, it.id);
  }));
}

// Run the full sweep and return the structured radar payload.
// `today` is a YYYY-MM-DD string; `githubToken` is optional.
export async function sweep(today, githubToken, kaggle = {}) {
  const daysAgo = (n) => new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);
  const [gh, hf, hn, papers, arxiv, itch, kaggleSets] = await Promise.all([
    collectGitHub(daysAgo, githubToken),
    collectHuggingFace(),
    collectHackerNews(daysAgo),
    collectPapers(),
    collectArxiv(),
    collectItch(),
    collectKaggle(kaggle.username, kaggle.key),
  ]);

  const ghRelevant = gh.filter((r) => r.relevant).slice(0, 20);
  const ghGeneral = gh.filter((r) => !r.relevant && r.isNew).slice(0, 10);
  const byKind = (k) => hf.filter((h) => h.kind === k && h.relevant).slice(0, 8);
  const hfGeneral = hf.filter((h) => !h.relevant).slice(0, 8);
  // Cap caption fetches to stay well under the Workers subrequest limit.
  await addCaptions([...byKind("models"), ...byKind("datasets"), ...byKind("spaces"), ...hfGeneral].slice(0, 20));

  return {
    generatedAt: today,
    github: { relevant: ghRelevant, general: ghGeneral },
    huggingface: {
      models: byKind("models"),
      datasets: byKind("datasets"),
      spaces: byKind("spaces"),
      general: hfGeneral,
    },
    hackernews: {
      relevant: hn.filter((h) => h.relevant).slice(0, 12),
      general: hn.filter((h) => !h.relevant).slice(0, 10),
    },
    papers: papers.filter((p) => p.relevant).slice(0, 10),
    arxiv,
    itch,
    kaggle: kaggleSets,
  };
}
