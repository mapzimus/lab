#!/usr/bin/env node
// Mapzimus Radar — daily scan of GitHub and Hugging Face for new/trending
// repos, datasets, models, and spaces relevant to the lab's interests
// (maps/GIS, browser data tools, generative design, math viz, teaching,
// small games, Cloudflare/edge, vanilla-JS web tooling).
//
// Zero dependencies. Writes radar/YYYY-MM-DD.md, radar/latest.md, and
// src/data/radar.json (baseline for the /radar/ dashboard; the live layer
// is functions/api/radar.js). Collection logic lives in scripts/radar-lib.mjs.
// Usage: node scripts/radar.mjs [--date YYYY-MM-DD]
// Optional: GITHUB_TOKEN env var raises the GitHub API rate limit.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sweep, sweepGeo } from "./radar-lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "radar");

const argDate = process.argv.indexOf("--date");
const today = argDate > -1 ? process.argv[argDate + 1] : new Date().toISOString().slice(0, 10);

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

const renderHN = (h) =>
  `- [${h.title}](${h.url}) (▲ ${h.points} · [${h.comments} comments](${h.hnUrl})${h.isShow ? " · Show HN" : ""})`;
const renderPaper = (p) => `- [${p.title}](${p.url}) (▲ ${p.upvotes})${p.desc ? ` — ${p.desc}` : ""}`;
const renderOSM = (o) => `- [${o.title}](${o.url})`;

const renderTitled = (i) => `- [${i.title}](${i.url})${i.desc ? ` — ${i.desc}` : ""}`;

async function main() {
  const [data, geo] = await Promise.all([
    sweep(today, process.env.GITHUB_TOKEN, {
      username: process.env.KAGGLE_USERNAME,
      key: process.env.KAGGLE_KEY,
    }),
    sweepGeo(today, process.env.GITHUB_TOKEN),
  ]);
  const { github: gh, huggingface: hf, hackernews: hn, papers } = data;

  const md = [
    `# Mapzimus Radar — ${today}`,
    "",
    "Daily scan of GitHub and Hugging Face, ranked for the lab: maps & GIS, browser data tools, generative design, math viz, teaching tools, games, and the Cloudflare/vanilla-JS stack.",
    "",
    section("GitHub — relevant to the lab", gh.relevant.map(renderRepo)),
    section("GitHub — trending everywhere (new this fortnight)", gh.general.map(renderRepo)),
    section("Hugging Face — models", hf.models.map(renderHF)),
    section("Hugging Face — datasets", hf.datasets.map(renderHF)),
    section("Hugging Face — spaces", hf.spaces.map(renderHF)),
    section("Hugging Face — trending everywhere", hf.general.map(renderHF)),
    section("Hacker News — relevant to the lab", hn.relevant.map(renderHN)),
    section("Hacker News — front page", hn.general.map(renderHN)),
    section("Papers", papers.map(renderPaper)),
    section("arXiv — fresh and relevant", data.arxiv.map(renderTitled)),
    section("Kaggle — hottest datasets", data.kaggle.map(renderTitled)),
    section("itch.io — new browser games", data.itch.map(renderTitled)),
  ].filter(Boolean).join("\n");

  const geoMd = [
    `# Mapzimus Geospatial Radar — ${today}`,
    "",
    "Daily sweep of geospatial news, tools, releases, data, and community.",
    "",
    section("Maps Mania", geo.news.mapsmania.map(renderTitled)),
    section("Geography Realm", geo.news.georealm.map(renderTitled)),
    section("Geospatial World", geo.news.geoworld.map(renderTitled)),
    section("QGIS — new & updated plugins", geo.qgis.map(renderTitled)),
    section("Library releases", geo.releases.map((r) => `- [${r.title}](${r.url}) (${r.publishedAt})${r.desc ? ` — ${r.desc}` : ""}`)),
    section("GIS Stack Exchange — hot questions", geo.gisse.map((q) => `- [${q.title}](${q.url}) (▲ ${q.score} · ${q.answers} answers)`)),
    section("NASA Earthdata — recently updated collections", geo.nasa.map(renderTitled)),
    section("Data.gov — new geodata", geo.datagov.map(renderTitled)),
    section("OSM pulse", geo.osm.map(renderOSM)),
  ].filter(Boolean).join("\n");

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, `${today}.md`), md);
  await writeFile(path.join(OUT_DIR, "latest.md"), md);
  await writeFile(path.join(OUT_DIR, `geo-${today}.md`), geoMd);
  await writeFile(path.join(OUT_DIR, "geo-latest.md"), geoMd);
  await writeFile(path.join(ROOT, "src", "data", "radar.json"), JSON.stringify(data, null, 2) + "\n");
  await writeFile(path.join(ROOT, "src", "data", "geo-radar.json"), JSON.stringify(geo, null, 2) + "\n");
  const relevantHF = hf.models.length + hf.datasets.length + hf.spaces.length;
  console.log(`Wrote radar/${today}.md (${gh.relevant.length + gh.general.length} repos, ${relevantHF} relevant HF items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
