import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src");
const output = path.join(root, "dist");

function assertInsideRoot(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Unsafe output path: ${resolved}`);
  return resolved;
}

const knownCategories = new Set(["maps", "data", "design", "teaching", "math", "fun", "play", "experiments"]);
const requiredFields = ["slug", "title", "description", "category", "url"];

function loadCatalog(name) {
  return JSON.parse(fs.readFileSync(path.join(source, "data", name), "utf8"));
}

const tools = loadCatalog("tools.json");
const projects = loadCatalog("projects.json");
const featuredSlugs = loadCatalog("featured.json");
const catalog = [...tools, ...projects];

const problems = [];
const seenSlugs = new Set();
for (const item of catalog) {
  const label = item.slug || item.title || JSON.stringify(item).slice(0, 60);
  for (const field of requiredFields) {
    if (!item[field]) problems.push(`${label}: missing "${field}"`);
  }
  if (item.slug) {
    if (seenSlugs.has(item.slug)) problems.push(`${label}: duplicate slug`);
    seenSlugs.add(item.slug);
  }
  if (item.category && !knownCategories.has(item.category)) problems.push(`${label}: unknown category "${item.category}"`);
  if (item.url && !/^https:\/\//.test(item.url)) problems.push(`${label}: url is not https`);
}
for (const slug of featuredSlugs) {
  if (!seenSlugs.has(slug)) problems.push(`featured.json: "${slug}" is not in the catalog`);
}
if (problems.length) {
  console.error(`Catalog validation failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

const toolCount = tools.length;
const newestUpdate = catalog.map((item) => item.updated || "").sort().at(-1);
const [refreshYear, refreshMonth] = newestUpdate.split("-").map(Number);
const catalogRefresh = new Date(Date.UTC(refreshYear, refreshMonth - 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

if (fs.existsSync(output)) fs.rmSync(assertInsideRoot(output), { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, output, { recursive: true });
fs.rmSync(path.join(output, "_template.html"));

const template = fs.readFileSync(path.join(source, "_template.html"), "utf8");
const toolCategories = {
  maps: ["Map tools", "Converters, viewers, geocoders, and other client-side GIS utilities."],
  data: ["Data tools", "CSV wrangling, charts, converters, and small data utilities."],
  design: ["Design tools", "Color, layout, media, and design helpers."],
  teaching: ["Teaching tools", "Classroom helpers and interactive teaching aids."],
  math: ["Math tools", "Calculators, solvers, and math visualizations."],
  fun: ["Fun & learning", "Playful tools and learning experiments."],
};

const pages = {
  home: {
    path: "index.html",
    title: "Mapzimus · Tools, maps, games, and experiments",
    description: "A creative lab of browser tools, unusual maps, games, and experiments by Maxwell Howe.",
    canonical: "https://mapzimus.com/",
    heading: "Useful tools. Strange maps. Small experiments.",
    intro: "Mapzimus is where I put the things worth building that do not need to behave like portfolio pieces.",
  },
  lab: {
    path: "lab/index.html",
    title: "The Lab · Mapzimus",
    description: "Works in progress and experiments from the Mapzimus lab.",
    canonical: "https://mapzimus.com/lab/",
    heading: "Fresh from the workbench.",
    intro: "Things in active development: experiments, prototypes, and ideas that are useful before they are polished.",
  },
  tools: {
    path: "tools/index.html",
    title: "Browser tools · Mapzimus",
    description: `A searchable catalog of ${toolCount} standalone browser tools for maps, data, design, teaching, and math.`,
    canonical: "https://mapzimus.com/tools/",
    heading: "Tools that get out of the way.",
    intro: "Every tool I have made, organized by type. Most run entirely in the browser.",
  },
  maps: {
    path: "maps/index.html",
    title: "Maps · Mapzimus",
    description: "Map projects and client-side GIS tools from the Mapzimus creative lab.",
    canonical: "https://mapzimus.com/maps/",
    heading: "Maps, minus the dress code.",
    intro: "Every map project — useful GIS utilities next to projection experiments, fantasy networks, and portfolio work.",
  },
  games: {
    path: "games/index.html",
    title: "Games · Mapzimus",
    description: "Every browser game and playful learning experiment from Mapzimus.",
    canonical: "https://mapzimus.com/games/",
    heading: "Things made to be played.",
    intro: "Strategy games, logic puzzles, geography, and classroom ideas — with the Whydah Story games and TappyMaps Arcade joining the shelf.",
  },
};

for (const [category, [label, blurb]] of Object.entries(toolCategories)) {
  pages[`tools-${category}`] = {
    path: `tools/${category}/index.html`,
    view: "tools",
    category,
    title: `${label} · Mapzimus`,
    description: blurb,
    canonical: `https://mapzimus.com/tools/${category}/`,
    heading: label + ".",
    intro: blurb,
  };
}

for (const [view, page] of Object.entries(pages)) {
  const html = template
    .replaceAll("{{VIEW}}", page.view || view)
    .replaceAll("{{CATEGORY}}", page.category || "")
    .replaceAll("{{FEATURED_ATTR}}", view === "home" ? "" : " hidden")
    .replaceAll("{{TOOL_COUNT}}", String(toolCount))
    .replaceAll("{{CATALOG_REFRESH}}", catalogRefresh)
    .replaceAll("{{TITLE}}", page.title)
    .replaceAll("{{DESCRIPTION}}", page.description)
    .replaceAll("{{CANONICAL}}", page.canonical)
    .replaceAll("{{HEADING}}", page.heading)
    .replaceAll("{{INTRO}}", page.intro);
  const target = path.join(output, page.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
}

const staticPages = ["field-notes", "radars", "radar", "geo-radar", "links", "about"];
const urls = [...Object.values(pages).map((page) => page.canonical), ...staticPages.map((s) => `https://mapzimus.com/${s}/`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(output, "sitemap.xml"), sitemap, "utf8");
console.log(`Built ${Object.keys(pages).length} Mapzimus pages in dist/.`);
