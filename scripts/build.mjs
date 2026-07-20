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

/** First-party routes for projects hosted on-site (snapshotted under vendor/
    apps/ or copied under src/). Projects with a canonical home elsewhere are
    marked `external: true` in projects.json instead and link straight there. */
const hostedProjectRoutes = {
  "geopuesto-playground": "/geopuesto/playground/",
  "us-fantasy-transit": "/transit/",
  "concord-civil-war": "/concord-war/",
  "bug-wars": "/bug-wars/",
  "flip-game": "/flip-game/",
  "whydah-voyage": "/whydah-voyage/",
  "black-sam": "/black-sam/",
  "true-scale": "/true-scale/",
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
  "whydah-voyage": "whydah-voyage",
  "black-sam": "black-sam",
  "true-scale": "true-scale",
};

const tools = loadCatalog("tools.json");
const projects = loadCatalog("projects.json");
const featuredSlugs = loadCatalog("featured.json");
const sourceCatalog = [...tools, ...projects];
const fieldNotes = loadCatalog("field-notes.json");
const linkGroups = loadCatalog("links.json");
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
  if (item.url && !/^https:\/\//.test(item.url)) problems.push(`${label}: url is not https`);
  if (/&(amp|lt|gt|quot|#\d+);/.test(`${item.title} ${item.description}`)) problems.push(`${label}: title/description contains an HTML entity; store plain text`);
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
    source: "tools",
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
  source: "projects",
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

// ---- Rendering helpers (card markup mirrors app.js, which re-renders the
// same structures client-side for search/filter/favorites) ----

const categoryLabels = {
  maps: "Maps & GIS",
  data: "Data",
  design: "Design & Media",
  teaching: "Teaching",
  math: "Math",
  fun: "Fun & Learning",
  play: "Games",
  experiments: "Experiments",
};
// One home per item: map things → Maps, playable things → Games, utility
// tools → Tools. Lab is source-based (all projects + anything unfinished).
const viewCategories = {
  home: null,
  tools: ["data", "design", "teaching", "math", "fun"],
  maps: ["maps"],
  games: ["play"],
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function card(item, { featured = false, star = true } = {}) {
  const tags = (item.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const status = item.status || "live";
  return `<article class="card${featured ? " featured" : ""}" data-slug="${escapeHtml(item.slug)}" data-category="${escapeHtml(item.category)}">
      ${star ? `<button class="star" type="button" aria-label="Add to favorites" aria-pressed="false">☆</button>` : ""}
      <a class="card-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
        <div class="card-meta"><span class="cat-tick" aria-hidden="true"></span><span class="card-type">${escapeHtml(categoryLabels[item.category] || item.category)}</span><span class="card-icon" aria-hidden="true">${escapeHtml(item.icon || "")}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="card-copy">${escapeHtml(item.description)}</p>
        ${featured ? "" : `<div class="card-tags">${tags}</div>`}
        <div class="card-foot">${status === "live" ? "<span></span>" : `<span class="status">${escapeHtml(status)}</span>`}<span class="open-cue">Open ↗</span></div>
      </a>
    </article>`;
}

function itemsForView(view, category) {
  return catalog.filter((item) => {
    if (view === "lab") {
      if (item.source !== "projects" && (item.status || "live") === "live") return false;
    } else {
      if (view === "tools" && item.source !== "tools") return false;
      const allowed = viewCategories[view];
      if (allowed && !allowed.includes(item.category)) return false;
    }
    return !category || item.category === category;
  });
}

function filtersHtml(view, activeCategory) {
  const categories = [...new Set(itemsForView(view, "").map((item) => item.category))];
  if (categories.length < 2) return "";
  return [`<button class="filter" type="button" data-category="" aria-pressed="${!activeCategory}">All</button>`]
    .concat(categories.map((c) => `<button class="filter" type="button" data-category="${c}" aria-pressed="${activeCategory === c}">${escapeHtml(categoryLabels[c] || c)}</button>`))
    .join("");
}

// Canonical order for grouped subsections.
const catOrder = ["maps", "data", "design", "teaching", "math", "fun", "play", "experiments"];

/** Split a view's items into labelled groups so a long list reads as a few
    scannable shelves instead of one wall. Maps splits tools vs projects;
    everything else groups by category. */
function groupsForView(view) {
  const items = itemsForView(view, "");
  if (view === "maps") {
    return [
      { key: "map-tools", label: "Map tools", items: items.filter((i) => i.source === "tools") },
      { key: "map-projects", label: "Map projects", items: items.filter((i) => i.source === "projects") },
    ].filter((g) => g.items.length);
  }
  return catOrder
    .map((cat) => ({ key: cat, label: categoryLabels[cat] || cat, items: items.filter((i) => i.category === cat) }))
    .filter((g) => g.items.length);
}

function groupedBrowseHtml(view) {
  const groups = groupsForView(view);
  if (groups.length <= 1) {
    const items = groups[0] ? groups[0].items : [];
    return `<div class="catalog-grid">${items.map((item) => card(item)).join("\n")}</div>`;
  }
  return groups
    .map((g) => `<section class="cat-group" data-group="${escapeHtml(g.key)}">
      <div class="group-head"><h3>${escapeHtml(g.label)}</h3><span class="group-count">${g.items.length}</span></div>
      <div class="catalog-grid">${g.items.map((item) => card(item)).join("\n")}</div>
    </section>`)
    .join("\n");
}

// ---- Pages ----

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
  data: ["Data tools", "CSV wrangling, charts, converters, and small data utilities."],
  design: ["Design tools", "Color, layout, media, and design helpers."],
  teaching: ["Teaching tools", "Classroom helpers and interactive teaching aids."],
  math: ["Math tools", "Calculators, solvers, and math visualizations."],
  fun: ["Fun & learning", "Playful tools and learning experiments."],
};

const utilityCount = itemsForView("tools", "").length;
const mapCount = itemsForView("maps", "").length;
const gamesCount = itemsForView("games", "").length;
const projectCount = itemsForView("lab", "").length;

/** Home "browse by section" cards — four doors instead of the whole catalog. */
function sectionCardsHtml() {
  const sections = [
    { href: "/tools/", label: "Tools", category: "data", n: utilityCount, desc: "Single-page browser utilities for data, design, teaching, and math." },
    { href: "/maps/", label: "Maps", category: "maps", n: mapCount, desc: "GIS converters and viewers, plus projection experiments and transit maps." },
    { href: "/games/", label: "Games", category: "play", n: gamesCount, desc: "Strategy and logic games, free in the browser." },
    { href: "/lab/", label: "Lab", category: "experiments", n: projectCount, desc: "The bigger projects, apps, and works in progress." },
  ];
  return sections
    .map((s) => `<a class="section-card" href="${s.href}" data-category="${s.category}">
      <div class="card-meta"><span class="cat-tick" aria-hidden="true"></span><span class="card-type">${s.n} ${s.n === 1 ? "item" : "items"}</span></div>
      <h3>${escapeHtml(s.label)}</h3>
      <p class="card-copy">${escapeHtml(s.desc)}</p>
      <div class="card-foot"><span></span><span class="open-cue">Browse →</span></div>
    </a>`)
    .join("\n");
}

const pages = {
  home: {
    path: "index.html",
    title: "Mapzimus · Browser tools, maps, and games by Maxwell Howe",
    description: `${toolCount} free browser tools for maps, data, teaching, and math — plus games and experiments. No accounts, no installs.`,
    canonical: "https://mapzimus.com/",
    eyebrow: "The lab of Maxwell Howe",
    heading: "Useful tools. Maps. Small games.",
    intro: `Everything I build for fun and everyday use, in one place: ${toolCount} browser tools for maps, data, teaching, and math, plus games and experiments. It all runs right in your browser.`,
    catalogHeading: "Browse by section",
  },
  lab: {
    path: "lab/index.html",
    title: "Lab · Mapzimus",
    description: `The ${projectCount} projects of the Mapzimus lab: map apps, games, and experiments, including works in progress.`,
    canonical: "https://mapzimus.com/lab/",
    eyebrow: "The lab",
    heading: "Projects and experiments",
    intro: `The ${projectCount} bigger builds: map apps, games, and experiments — everything beyond the single-page tools, including works in progress.`,
    catalogHeading: "All projects",
  },
  tools: {
    path: "tools/index.html",
    title: "Browser tools · Mapzimus",
    description: `A searchable catalog of ${utilityCount} standalone browser tools for data, design, teaching, and math.`,
    canonical: "https://mapzimus.com/tools/",
    eyebrow: "The tool catalog",
    heading: "Every tool, one page each",
    intro: `${utilityCount} standalone browser tools for data, design, teaching, math, and fun. Each is a single page that loads fast and does one job. Map tools have their own shelf under Maps.`,
    catalogHeading: "All tools",
  },
  maps: {
    path: "maps/index.html",
    title: "Maps · Mapzimus",
    description: `All ${mapCount} map tools and map projects from Mapzimus: converters, GIS utilities, projection experiments, transit networks, and atlases.`,
    canonical: "https://mapzimus.com/maps/",
    eyebrow: "Maps & GIS",
    heading: "Everything maps",
    intro: `All ${mapCount} map things in one place — converters and GIS utilities alongside projection experiments, transit networks, and atlases.`,
    catalogHeading: "All maps",
  },
  games: {
    path: "games/index.html",
    title: "Games · Mapzimus",
    description: "Free browser games from Mapzimus — strategy and logic, no downloads.",
    canonical: "https://mapzimus.com/games/",
    eyebrow: "Playable",
    heading: "Games",
    intro: "Actual games, made to be played — free in the browser, nothing to download.",
    catalogHeading: "All games",
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
    eyebrow: "Tool category",
    heading: label,
    intro: blurb,
    catalogHeading: label,
  };
}

const navKeys = { tools: "NAV_TOOLS", maps: "NAV_MAPS", games: "NAV_GAMES", lab: "NAV_LAB" };

for (const [key, page] of Object.entries(pages)) {
  const view = page.view || key;
  const items = itemsForView(view, page.category || "");
  const isHome = key === "home";
  const featuredItems = isHome
    ? featuredSlugs.map((slug) => catalog.find((item) => item.slug === slug)).filter(Boolean)
    : [];
  // Home browses via section cards; a single-category page shows a flat grid;
  // the main section pages browse via grouped shelves.
  const browseHtml = isHome
    ? `<div class="section-cards">${sectionCardsHtml()}</div>`
    : page.category
      ? `<div class="catalog-grid">${itemsForView(view, page.category).map((item) => card(item)).join("\n")}</div>`
      : groupedBrowseHtml(view);
  const browseClass = isHome ? "browse browse-home" : "browse";
  let html = template
    .replaceAll("{{VIEW}}", view)
    .replaceAll("{{CATEGORY}}", page.category || "")
    .replaceAll("{{FEATURED_ATTR}}", isHome ? "" : " hidden")
    .replaceAll("{{TOOL_COUNT}}", String(toolCount))
    .replaceAll("{{CATALOG_REFRESH}}", catalogRefresh)
    .replaceAll("{{TITLE}}", page.title)
    .replaceAll("{{DESCRIPTION}}", page.description)
    .replaceAll("{{CANONICAL}}", page.canonical)
    .replaceAll("{{EYEBROW}}", page.eyebrow)
    .replaceAll("{{HEADING}}", page.heading)
    .replaceAll("{{INTRO}}", page.intro)
    .replaceAll("{{CATALOG_HEADING}}", page.catalogHeading)
    .replaceAll("{{RESULT_COUNT}}", isHome ? "" : `${items.length} ${items.length === 1 ? "item" : "items"}`)
    .replaceAll("{{FILTERS}}", isHome ? "" : filtersHtml(view, page.category || ""))
    .replaceAll("{{BROWSE_CLASS}}", browseClass)
    .replaceAll("{{BROWSE}}", browseHtml)
    .replaceAll("{{FEATURED_CARDS}}", featuredItems.map((item) => card(item, { featured: true })).join("\n"));
  for (const [navView, navKey] of Object.entries(navKeys)) {
    html = html.replaceAll(`{{${navKey}}}`, view === navView ? ' aria-current="page"' : "");
  }
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

// ---- Static pages that carry pre-rendered blocks ----

function fillStatic(relPath, replacements) {
  const target = path.join(output, relPath);
  let html = fs.readFileSync(target, "utf8");
  for (const [token, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${token}}}`, value);
  }
  fs.writeFileSync(target, html, "utf8");
}

const miniCards = featuredSlugs
  .map((slug) => catalog.find((item) => item.slug === slug))
  .filter(Boolean)
  .map((item) => card(item, { featured: true, star: false }))
  .join("\n");
fillStatic("about/index.html", { MINI_CARDS: miniCards, TOOL_COUNT: String(toolCount) });

const linksHtml = linkGroups.map((group) => `<section class="link-group">
  <h2>${escapeHtml(group.group)}</h2>
  ${group.links.map((link) => `<a class="link-row" href="${escapeHtml(link.url)}"><h3>${escapeHtml(link.title)}</h3><p class="card-copy">${escapeHtml(link.note)}</p></a>`).join("\n  ")}
</section>`).join("\n");
fillStatic("links/index.html", { LINK_GROUPS: linksHtml });

const radars = loadCatalog("radars.json");
const radarCards = radars.map((radar) => `<article class="card featured" data-category="experiments">
      <a class="card-link" href="${escapeHtml(radar.url)}">
        <div class="card-meta"><span class="cat-tick" aria-hidden="true"></span><span class="card-type">Daily digest</span><span class="card-icon" aria-hidden="true">${escapeHtml(radar.icon || "")}</span></div>
        <h3>${escapeHtml(radar.title)}</h3>
        <p class="card-copy">${escapeHtml(radar.description)}</p>
        <div class="card-foot"><span></span><span class="open-cue">Open →</span></div>
      </a>
    </article>`).join("\n");
fillStatic("radars/index.html", { RADAR_CARDS: radarCards });

const publishedNotes = fieldNotes.filter((note) => note.status === "published");
const notesHtml = publishedNotes.map((note) => `<article class="note">
  <div class="note-meta"><time datetime="${escapeHtml(note.date)}">${escapeHtml(note.date)}</time>${(note.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
  <h2>${escapeHtml(note.title)}</h2>
  ${note.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n  ")}
</article>`).join("\n");
fillStatic("field-notes/index.html", { NOTES: notesHtml || `<p class="empty">No notes yet.</p>` });

const skills = loadCatalog("skills.json");
const skillCards = skills.map((skill) => `<article class="skill-card">
  <div class="card-top">
    <div>
      <span class="tagline">${escapeHtml(skill.tagline)}</span>
      <h2>${escapeHtml(skill.title)}</h2>
    </div>
    <span class="meta">v${escapeHtml(skill.version)} · ${escapeHtml(skill.updated)} · ${escapeHtml(skill.sizeKb)} KB</span>
  </div>
  <p>${escapeHtml(skill.description)}</p>
  <ul>${skill.teaches.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
  <div class="skill-actions">
    <a class="download-button" href="${escapeHtml(skill.file)}" download>Download ${escapeHtml(skill.slug)}.skill</a>
    <a class="source-link" href="${escapeHtml(skill.source)}">Read the source ↗</a>
  </div>
</article>`).join("\n");
fillStatic("skills/index.html", { SKILL_CARDS: skillCards });

// ---- Sitemap ----

const staticPages = ["field-notes", "radars", "radar", "geo-radar", "soccer-radar", "stocks-radar", "politics-radar", "skills", "links", "about"];
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

console.log(`Built ${Object.keys(pages).length + 3} Mapzimus pages in dist/ (${catalog.length} catalog items pre-rendered).`);
