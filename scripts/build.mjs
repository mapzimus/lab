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

/** First-party routes for projects that are snapshotted under vendor/apps/. */
const hostedProjectRoutes = {
  "geopuesto-playground": "/geopuesto/playground/",
  "us-fantasy-transit": "/transit/",
  "concord-civil-war": "/concord-war/",
  "bug-wars": "/bug-wars/",
  "flip-game": "/flip-game/",
  "grog-flip": "/grog-flip/",
  "whydah-voyage": "/whydah-voyage/",
  "black-sam": "/black-sam/",
  "true-scale": "/true-scale/",
  "interstate-challenge": "/interstate-challenge/",
  "mapzimus-board": "/mapzimus-board/",
  "train-route-atlas": "/lab/train-routes/",
  "predicting-housing-crisis": "/lab/housing-crisis/",
};

/** vendor/apps/<dir> → public route */
const appRoutes = {
  geopuesto: "geopuesto",
  transit: "transit",
  "concord-war": "concord-war",
  "bug-wars": "bug-wars",
  "flip-game": "flip-game",
  "grog-flip": "grog-flip",
  "whydah-voyage": "whydah-voyage",
  "black-sam": "black-sam",
  "true-scale": "true-scale",
  "interstate-challenge": "interstate-challenge",
  "mapzimus-board": "mapzimus-board",
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
  if (item.category && !knownCategories.has(item.category)) {
    problems.push(`${label}: unknown category "${item.category}"`);
  }
  if (item.url && !/^https:\/\//.test(item.url)) {
    problems.push(`${label}: source url is not https`);
  }
}
for (const slug of featuredSlugs) {
  if (!seenSlugs.has(slug)) problems.push(`featured.json: "${slug}" is not in the catalog`);
}
for (const project of projects) {
  if (!project.external && !hostedProjectRoutes[project.slug]) {
    problems.push(`${project.slug}: missing hosted project route`);
  }
}
if (problems.length) {
  console.error(`Catalog validation failed:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  process.exit(1);
}

const hostedToolSource = path.join(vendor, "tools");
const publicTools = tools.map((item) => {
  const hasSnapshot = fs.existsSync(path.join(hostedToolSource, `${item.slug}.html`));
  return {
    ...item,
    title: decodeText(item.title),
    description: decodeText(item.description),
    url: `/${item.slug}/`,
    sourceUrl: item.url,
    collection: "tool",
    status: hasSnapshot ? item.status || "live" : "in-progress",
    hosted: hasSnapshot,
  };
});

const publicProjects = projects.map((item) => ({
  ...item,
  title: decodeText(item.title),
  description: decodeText(item.description),
  url: item.external ? item.url : hostedProjectRoutes[item.slug],
  sourceUrl: item.url,
  collection: "project",
}));

const catalog = [...publicTools, ...publicProjects];
const toolCount = publicTools.length;
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

// Public catalog JSON uses first-party routes so the front door never deep-links off-site.
fs.writeFileSync(path.join(output, "data", "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
fs.writeFileSync(
  path.join(output, "data", "tools.json"),
  `${JSON.stringify(publicTools.map(({ sourceUrl, collection, hosted, ...rest }) => rest), null, 2)}\n`,
  "utf8",
);
fs.writeFileSync(
  path.join(output, "data", "projects.json"),
  `${JSON.stringify(publicProjects.map(({ sourceUrl, collection, ...rest }) => rest), null, 2)}\n`,
  "utf8",
);

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
    intro: "Every tool I have made, organized by type. Most run entirely in the browser — and every one is hosted here.",
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
    intro: "Strategy games, logic puzzles, bottle flips, and the Whydah voyage games — all running on this site.",
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

requirePath(hostedToolSource, "vendor/tools");
const placeholderTemplate = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{{TITLE}} · Mapzimus</title>
  <meta name="robots" content="noindex">
  <link rel="canonical" href="https://mapzimus.com/{{SLUG}}/">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow">Coming soon</span>
      <h1>{{TITLE}}</h1>
      <p>{{DESCRIPTION}}</p>
      <p>This tool is cataloged but the source HTML has not landed in the private <code>mapzimus/max</code> shelf yet. When it ships there, it will be mirrored here automatically.</p>
      <p><a href="/tools/">← Back to tools</a></p>
    </section>
  </main>
</body>
</html>
`;

for (const item of publicTools) {
  const input = path.join(hostedToolSource, `${item.slug}.html`);
  let html;
  if (fs.existsSync(input)) {
    html = fs.readFileSync(input, "utf8");
    html = html
      .replace(/href=(["'])\.\/index\.html\1/g, 'href="/"')
      .replace(/href=(["'])\.\/([a-z0-9-]+)\.html\1/gi, 'href="/$2/"');
    if (!/rel=["']canonical["']/i.test(html)) {
      html = html.replace(/<\/head>/i, `  <link rel="canonical" href="https://mapzimus.com/${item.slug}/">\n</head>`);
    }
  } else {
    html = placeholderTemplate
      .replaceAll("{{TITLE}}", item.title)
      .replaceAll("{{DESCRIPTION}}", item.description)
      .replaceAll("{{SLUG}}", item.slug);
  }
  const target = path.join(output, item.slug, "index.html");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
}

for (const [sourceName, route] of Object.entries(appRoutes)) {
  const appSource = requirePath(path.join(vendor, "apps", sourceName), `vendor/apps/${sourceName}`);
  fs.cpSync(appSource, path.join(output, route), { recursive: true });
}

const staticPages = ["field-notes", "radars", "radar", "geo-radar", "skills", "links", "about"];
const sitemapUrls = [
  ...Object.values(pages).map((page) => page.canonical),
  ...staticPages.map((s) => `https://mapzimus.com/${s}/`),
  ...catalog.filter((item) => !item.external).map((item) => new URL(item.url, "https://mapzimus.com").href),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(sitemapUrls)].map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(output, "sitemap.xml"), sitemap, "utf8");

const missingTools = publicTools.filter((item) => !item.hosted).map((item) => item.slug);
console.log(
  `Built ${Object.keys(pages).length} Mapzimus pages, ${publicTools.filter((t) => t.hosted).length} hosted tools` +
    (missingTools.length ? ` (${missingTools.length} placeholders: ${missingTools.join(", ")})` : "") +
    `, and ${Object.keys(appRoutes).length} hosted apps in dist/.`,
);
