import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src");
const vendor = path.join(root, "vendor");
const output = path.join(root, "dist");

function assertInsideRoot(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Unsafe output path: ${resolved}`);
  return resolved;
}

function requirePath(target, label = target) {
  if (!fs.existsSync(target)) throw new Error(`Missing hosted source: ${label}`);
  return target;
}

function loadCatalog(name) {
  return JSON.parse(fs.readFileSync(path.join(source, "data", name), "utf8"));
}

function decodeText(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

const knownCategories = new Set(["maps", "data", "design", "teaching", "math", "fun", "play", "experiments"]);
const requiredFields = ["slug", "title", "description", "category", "url"];
const hostedProjectUrls = {
  "geopuesto-playground": "/geopuesto/playground/",
  "us-fantasy-transit": "/transit/",
  "concord-civil-war": "/concord-war/",
  "bug-wars": "/bug-wars/",
  "flip-game": "/flip-game/",
  "true-scale": "/true-scale/",
  "interstate-challenge": "/interstate-challenge/",
};

const tools = loadCatalog("tools.json");
const projects = loadCatalog("projects.json");
const featuredSlugs = loadCatalog("featured.json");
const sourceCatalog = [...tools, ...projects];
const problems = [];
const seenSlugs = new Set();

for (const item of sourceCatalog) {
  const label = item.slug || item.title || JSON.stringify(item).slice(0, 60);
  for (const field of requiredFields) {
    if (!item[field]) problems.push(`${label}: missing "${field}"`);
  }
  if (item.slug) {
    if (seenSlugs.has(item.slug)) problems.push(`${label}: duplicate slug`);
    seenSlugs.add(item.slug);
  }
  if (item.category && !knownCategories.has(item.category)) problems.push(`${label}: unknown category "${item.category}"`);
  if (item.url && !/^https:\/\//.test(item.url)) problems.push(`${label}: source url is not https`);
}
for (const slug of featuredSlugs) {
  if (!seenSlugs.has(slug)) problems.push(`featured.json: "${slug}" is not in the catalog`);
}
for (const project of projects) {
  // Entries marked external live elsewhere (e.g. tappymaps.com) and keep
  // their own URL; everything else must have a first-party hosted route.
  if (!project.external && !hostedProjectUrls[project.slug]) {
    problems.push(`${project.slug}: missing hosted project route`);
  }
}
if (problems.length) {
  console.error(`Catalog validation failed:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  process.exit(1);
}

const publicTools = tools.map((item) => ({
  ...item,
  title: decodeText(item.title),
  description: decodeText(item.description),
  url: `/${item.slug}/`,
  sourceUrl: item.url,
  collection: "tool",
}));
const publicProjects = projects.map((item) => ({
  ...item,
  title: decodeText(item.title),
  description: decodeText(item.description),
  url: item.external ? item.url : hostedProjectUrls[item.slug],
  sourceUrl: item.url,
  collection: "project",
}));
const catalog = [...publicTools, ...publicProjects];

const toolCount = publicTools.length;
const labCount = catalog.length;
const newestUpdate = sourceCatalog.map((item) => item.updated || "").sort().at(-1);
const [refreshYear, refreshMonth] = newestUpdate.split("-").map(Number);
const catalogRefresh = new Date(Date.UTC(refreshYear, refreshMonth - 1)).toLocaleString("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

if (fs.existsSync(output)) fs.rmSync(assertInsideRoot(output), { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, output, { recursive: true });
fs.rmSync(path.join(output, "_template.html"));

fs.writeFileSync(path.join(output, "data", "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

const template = fs.readFileSync(path.join(source, "_template.html"), "utf8");
const pages = {
  home: {
    path: "index.html",
    title: "Mapzimus · Maps, tools, and browser experiments",
    description: "Maps, practical browser tools, games, and geographic experiments made by Maxwell Howe.",
    canonical: "https://mapzimus.com/",
    eyebrow: "Maxwell Howe's browser workshop",
    heading: "Maps first. Useful things nearby.",
    intro: "I make maps, small utilities, classroom tools, and the occasional game. This is the shelf where they actually run.",
    catalogHeading: "Recently on the workbench",
    catalogIntro: "A short first pass. Search, choose a section, or open the complete index.",
  },
  tools: {
    path: "tools/index.html",
    title: "Browser tools · Mapzimus",
    description: `A searchable index of ${toolCount} browser tools for maps, data, design, teaching, math, and play.`,
    canonical: "https://mapzimus.com/tools/",
    eyebrow: "The complete tool index",
    heading: "Open it. Use it. Keep moving.",
    intro: "Small, focused tools with no account wall. Most work entirely in your browser, and every one now lives on this site.",
    catalogHeading: "All browser tools",
    catalogIntro: "Search by job, file type, subject, or the word you vaguely remember.",
  },
  maps: {
    path: "maps/index.html",
    title: "Maps and GIS · Mapzimus",
    description: "Map experiments, geographic utilities, and browser-native GIS tools by Maxwell Howe.",
    canonical: "https://mapzimus.com/maps/",
    eyebrow: "Maps and place",
    heading: "The geographic part of the drawer.",
    intro: "Coordinate converters, GeoJSON utilities, projection experiments, and maps that began with an unreasonable question.",
    catalogHeading: "Maps and GIS",
    catalogIntro: "Practical utilities and stranger geographic work, side by side.",
  },
  data: {
    path: "data/index.html",
    title: "Data tools · Mapzimus",
    description: "Browser tools for CSV, JSON, charts, testing data, and privacy.",
    canonical: "https://mapzimus.com/data/",
    eyebrow: "Data and text",
    heading: "For files that need a quick answer.",
    intro: "Inspect, convert, chart, anonymize, and generate data without turning the task into a software project.",
    catalogHeading: "Data tools",
    catalogIntro: "Focused utilities for the formats that keep showing up.",
  },
  design: {
    path: "design/index.html",
    title: "Design and media tools · Mapzimus",
    description: "Small browser studios for color, images, flags, SVG, sound, and pixel art.",
    canonical: "https://mapzimus.com/design/",
    eyebrow: "Design and media",
    heading: "Tiny studios, no installation required.",
    intro: "Make a palette, build a flag, draw a sprite, tune an effect, or export the thing you came for.",
    catalogHeading: "Design and media tools",
    catalogIntro: "Visual and audio workbenches that run where you found them.",
  },
  teaching: {
    path: "teaching/index.html",
    title: "Teaching tools · Mapzimus",
    description: "Simple classroom tools for groups, seating, probability, and timing.",
    canonical: "https://mapzimus.com/teaching/",
    eyebrow: "For the classroom",
    heading: "Utilities built from real classroom friction.",
    intro: "Make groups, arrange seats, time a transition, or put probability on the screen without an account or a setup ritual.",
    catalogHeading: "Teaching tools",
    catalogIntro: "Projector-friendly, quick to explain, and ready when the bell rings.",
  },
  math: {
    path: "math/index.html",
    title: "Math explorers · Mapzimus",
    description: "Interactive math visualizers, practice tools, calculators, and reference pages.",
    canonical: "https://mapzimus.com/math/",
    eyebrow: "Math you can move",
    heading: "Drag the point. Change the number. See why.",
    intro: "Interactive algebra, geometry, statistics, practice, and reference tools built for the moment a static diagram stops helping.",
    catalogHeading: "Math explorers",
    catalogIntro: "Visual models, practice, and dependable calculators.",
  },
  play: {
    path: "play/index.html",
    title: "Games and playful tools · Mapzimus",
    description: "Browser games, sports boards, puzzles, and playful learning experiments.",
    canonical: "https://mapzimus.com/play/",
    eyebrow: "Games and play",
    heading: "A few things made for no practical reason.",
    intro: "Strategy, physics, soccer, brackets, and choices left to a spinning wheel.",
    catalogHeading: "Games and playful tools",
    catalogIntro: "Some are useful. Some are just a good way to lose ten minutes.",
  },
  experiments: {
    path: "experiments/index.html",
    title: "Experiments · Mapzimus",
    description: "Interactive geometry, alternate histories, and exploratory browser projects.",
    canonical: "https://mapzimus.com/experiments/",
    eyebrow: "Longer-running questions",
    heading: "Experiments with enough code to answer back.",
    intro: "Spherical geometry, alternate-history cartography, and projects that are more useful as working demos than polished case studies.",
    catalogHeading: "Experiments",
    catalogIntro: "The larger and stranger work in the lab.",
  },
};

for (const [view, page] of Object.entries(pages)) {
  const html = template
    .replaceAll("{{VIEW}}", view)
    .replaceAll("{{FEATURED_ATTR}}", view === "home" ? "" : " hidden")
    .replaceAll("{{BROWSE_ATTR}}", view === "home" ? "" : " hidden")
    .replaceAll("{{TOOL_COUNT}}", String(toolCount))
    .replaceAll("{{LAB_COUNT}}", String(labCount))
    .replaceAll("{{CATALOG_REFRESH}}", catalogRefresh)
    .replaceAll("{{TITLE}}", page.title)
    .replaceAll("{{DESCRIPTION}}", page.description)
    .replaceAll("{{CANONICAL}}", page.canonical)
    .replaceAll("{{EYEBROW}}", page.eyebrow)
    .replaceAll("{{HEADING}}", page.heading)
    .replaceAll("{{INTRO}}", page.intro)
    .replaceAll("{{CATALOG_HEADING}}", page.catalogHeading)
    .replaceAll("{{CATALOG_INTRO}}", page.catalogIntro);
  const target = path.join(output, page.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
}

const hostedToolSource = requirePath(path.join(vendor, "tools"), "vendor/tools");
for (const item of publicTools) {
  const input = requirePath(path.join(hostedToolSource, `${item.slug}.html`), item.slug);
  let html = fs.readFileSync(input, "utf8");
  html = html
    .replace(/href=(["'])\.\/index\.html\1/g, 'href="/"')
    .replace(/href=(["'])\.\/([a-z0-9-]+)\.html\1/gi, 'href="/$2/"');
  if (!/rel=["']canonical["']/i.test(html)) {
    html = html.replace(/<\/head>/i, `  <link rel="canonical" href="https://mapzimus.com/${item.slug}/">\n</head>`);
  }
  const target = path.join(output, item.slug, "index.html");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
}

const appRoutes = {
  geopuesto: "geopuesto",
  transit: "transit",
  "concord-war": "concord-war",
  "bug-wars": "bug-wars",
  "flip-game": "flip-game",
  "true-scale": "true-scale",
  "interstate-challenge": "interstate-challenge",
};
for (const [sourceName, route] of Object.entries(appRoutes)) {
  const appSource = requirePath(path.join(vendor, "apps", sourceName), `vendor/apps/${sourceName}`);
  fs.cpSync(appSource, path.join(output, route), { recursive: true });
}

const sitemapUrls = [
  ...Object.values(pages).map((page) => page.canonical),
  ...catalog.map((item) => new URL(item.url, "https://mapzimus.com").href),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(sitemapUrls)].map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(output, "sitemap.xml"), sitemap, "utf8");

console.log(`Built ${Object.keys(pages).length} index pages, ${publicTools.length} hosted tools, and ${Object.keys(appRoutes).length} hosted projects in dist/.`);
