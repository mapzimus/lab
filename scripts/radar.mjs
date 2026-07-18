#!/usr/bin/env node
// Mapzimus Radar — daily scan of GitHub and Hugging Face for new/trending
// repos, datasets, models, and spaces relevant to the lab's interests
// (maps/GIS, browser data tools, generative design, math viz, teaching,
// small games, Cloudflare/edge, vanilla-JS web tooling).
//
// Zero dependencies. Writes radar/YYYY-MM-DD.md, radar/latest.md, and
// src/data/radar.json (consumed by the /radar/ dashboard on mapzimus.com).
// Usage: node scripts/radar.mjs [--date YYYY-MM-DD]
// Optional: GITHUB_TOKEN env var raises the GitHub API rate limit.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "radar");

const argDate = process.argv.indexOf("--date");
const today = argDate > -1 ? process.argv[argDate + 1] : new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);

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

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------
async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": "mapzimus-radar", ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

const ghHeaders = process.env.GITHUB_TOKEN
  ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
  : {};

async function githubSearch(q, sort = "stars", perPage = 30) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&order=desc&per_page=${perPage}`;
  try {
    const data = await getJSON(url, { ...ghHeaders, Accept: "application/vnd.github+json" });
    return data.items ?? [];
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

// ---------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------
async function collectGitHub() {
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
    for (const r of await githubSearch(q, sort)) {
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

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function renderRepo(r) {
  const bits = [r.lang, `★ ${r.stars}`, r.isNew ? "🆕 new" : null].filter(Boolean).join(" · ");
  return `- [${r.name}](${r.url}) (${bits})${r.desc ? ` — ${r.desc}` : ""}`;
}

function renderHF(h) {
  const bits = [h.pipeline, `♥ ${h.likes}`, h.downloads ? `${h.downloads.toLocaleString("en-US")} dl` : null]
    .filter(Boolean).join(" · ");
  return `- [${h.id}](${h.url}) (${bits})${h.desc ? ` — ${h.desc}` : ""}`;
}

function section(title, lines) {
  return lines.length ? `## ${title}\n\n${lines.join("\n")}\n` : "";
}

async function main() {
  const [gh, hf] = await Promise.all([collectGitHub(), collectHuggingFace()]);

  const ghRelevant = gh.filter((r) => r.relevant).slice(0, 20);
  const ghGeneral = gh.filter((r) => !r.relevant && r.isNew).slice(0, 10);
  const byKind = (k) => hf.filter((h) => h.kind === k && h.relevant).slice(0, 8);
  const hfGeneral = hf.filter((h) => !h.relevant).slice(0, 8);
  await addCaptions([...byKind("models"), ...byKind("datasets"), ...byKind("spaces"), ...hfGeneral]);

  const md = [
    `# Mapzimus Radar — ${today}`,
    "",
    "Daily scan of GitHub and Hugging Face, ranked for the lab: maps & GIS, browser data tools, generative design, math viz, teaching tools, games, and the Cloudflare/vanilla-JS stack.",
    "",
    section("GitHub — relevant to the lab", ghRelevant.map(renderRepo)),
    section("GitHub — trending everywhere (new this fortnight)", ghGeneral.map(renderRepo)),
    section("Hugging Face — models", byKind("models").map(renderHF)),
    section("Hugging Face — datasets", byKind("datasets").map(renderHF)),
    section("Hugging Face — spaces", byKind("spaces").map(renderHF)),
    section("Hugging Face — trending everywhere", hfGeneral.map(renderHF)),
  ].filter(Boolean).join("\n");

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, `${today}.md`), md);
  await writeFile(path.join(OUT_DIR, "latest.md"), md);

  const json = {
    generatedAt: today,
    github: { relevant: ghRelevant, general: ghGeneral },
    huggingface: {
      models: byKind("models"),
      datasets: byKind("datasets"),
      spaces: byKind("spaces"),
      general: hfGeneral,
    },
  };
  await writeFile(path.join(ROOT, "src", "data", "radar.json"), JSON.stringify(json, null, 2) + "\n");
  console.log(`Wrote radar/${today}.md (${ghRelevant.length + ghGeneral.length} repos, ${hf.filter((h) => h.relevant).length} relevant HF items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
