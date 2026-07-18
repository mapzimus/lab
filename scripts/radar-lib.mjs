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

// weeklyOSM: latest issues from the RSS feed (regex-parsed; no XML dep).
async function collectWeeklyOSM() {
  try {
    const res = await fetch("https://weeklyosm.eu/feed", { headers: { "User-Agent": "mapzimus-radar" } });
    if (!res.ok) return [];
    const xml = (await res.text()).slice(0, 100000);
    const items = [];
    for (const m of xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/g)) {
      items.push({ title: m[1].trim(), url: m[2].trim() });
      if (items.length >= 3) break;
    }
    return items;
  } catch {
    return [];
  }
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
export async function sweep(today, githubToken) {
  const daysAgo = (n) => new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);
  const [gh, hf, hn, papers, osm] = await Promise.all([
    collectGitHub(daysAgo, githubToken),
    collectHuggingFace(),
    collectHackerNews(daysAgo),
    collectPapers(),
    collectWeeklyOSM(),
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
    osm,
  };
}
