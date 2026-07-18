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
const fieldNotes = loadCatalog("field-notes.json");
const linkGroups = loadCatalog("links.json");
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
  if (/&(amp|lt|gt|quot|#\d+);/.test(`${item.title} ${item.description}`)) problems.push(`${label}: title/description contains an HTML entity; store plain text`);
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
const viewCategories = {
  home: null,
  lab: ["experiments"],
  tools: ["maps", "data", "design", "teaching", "math", "fun"],
  maps: ["maps"],
  games: ["fun", "play"],
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
    if (view === "lab" && (item.status || "live") !== "live") return true;
    const allowed = viewCategories[view];
    if (allowed && !allowed.includes(item.category)) return false;
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

// ---- Pages ----

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
    title: "Mapzimus · Browser tools, maps, and games by Maxwell Howe",
    description: `${toolCount} free browser tools for maps, data, teaching, and math — plus games and experiments. No accounts, no installs.`,
    canonical: "https://mapzimus.com/",
    eyebrow: "The lab of Maxwell Howe",
    heading: "Useful tools. Maps. Small games.",
    intro: `Everything I build for fun and everyday use, in one place: ${toolCount} browser tools for maps, data, teaching, and math, plus games and experiments. It all runs right in your browser.`,
    catalogHeading: "The whole catalog",
  },
  lab: {
    path: "lab/index.html",
    title: "Lab · Mapzimus",
    description: "Prototypes and experiments in active development at Mapzimus.",
    canonical: "https://mapzimus.com/lab/",
    eyebrow: "In development",
    heading: "Works in progress",
    intro: "Experiments and prototypes that are useful before they're finished. Things here can be rough, half-built, or change without notice.",
    catalogHeading: "Experiments",
  },
  tools: {
    path: "tools/index.html",
    title: "Browser tools · Mapzimus",
    description: `A searchable catalog of ${toolCount} standalone browser tools for maps, data, design, teaching, and math.`,
    canonical: "https://mapzimus.com/tools/",
    eyebrow: "The tool catalog",
    heading: "Every tool, one page each",
    intro: `${toolCount} standalone browser tools for maps, data, design, teaching, and math. Each is a single page that loads fast and does one job.`,
    catalogHeading: "All tools",
  },
  maps: {
    path: "maps/index.html",
    title: "Maps · Mapzimus",
    description: "Map projects and client-side GIS tools from Mapzimus.",
    canonical: "https://mapzimus.com/maps/",
    eyebrow: "Maps & GIS",
    heading: "Map projects and map tools",
    intro: "Client-side GIS utilities next to projection experiments and fantasy transit networks.",
    catalogHeading: "All maps",
  },
  games: {
    path: "games/index.html",
    title: "Games · Mapzimus",
    description: "Free browser games from Mapzimus: strategy, logic, geography, and classroom games.",
    canonical: "https://mapzimus.com/games/",
    eyebrow: "Playable",
    heading: "Games and things to play",
    intro: "Strategy and logic games, geography challenges, and classroom games — free in the browser, nothing to download.",
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
  const featuredItems = key === "home"
    ? featuredSlugs.map((slug) => catalog.find((item) => item.slug === slug)).filter(Boolean)
    : [];
  let html = template
    .replaceAll("{{VIEW}}", view)
    .replaceAll("{{CATEGORY}}", page.category || "")
    .replaceAll("{{FEATURED_ATTR}}", key === "home" ? "" : " hidden")
    .replaceAll("{{TOOL_COUNT}}", String(toolCount))
    .replaceAll("{{CATALOG_REFRESH}}", catalogRefresh)
    .replaceAll("{{TITLE}}", page.title)
    .replaceAll("{{DESCRIPTION}}", page.description)
    .replaceAll("{{CANONICAL}}", page.canonical)
    .replaceAll("{{EYEBROW}}", page.eyebrow)
    .replaceAll("{{HEADING}}", page.heading)
    .replaceAll("{{INTRO}}", page.intro)
    .replaceAll("{{CATALOG_HEADING}}", page.catalogHeading)
    .replaceAll("{{RESULT_COUNT}}", `${items.length} ${items.length === 1 ? "item" : "items"}`)
    .replaceAll("{{FILTERS}}", filtersHtml(view, page.category || ""))
    .replaceAll("{{FEATURED_CARDS}}", featuredItems.map((item) => card(item, { featured: true })).join("\n"))
    .replaceAll("{{CATALOG_CARDS}}", items.map((item) => card(item)).join("\n"));
  for (const [navView, navKey] of Object.entries(navKeys)) {
    html = html.replaceAll(`{{${navKey}}}`, view === navView ? ' aria-current="page"' : "");
  }
  const target = path.join(output, page.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
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

// ---- Sitemap ----

const staticPages = ["field-notes", "radars", "radar", "geo-radar", "skills", "links", "about"];
const urls = [...Object.values(pages).map((page) => page.canonical), ...staticPages.map((s) => `https://mapzimus.com/${s}/`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(output, "sitemap.xml"), sitemap, "utf8");
console.log(`Built ${Object.keys(pages).length + 3} Mapzimus pages in dist/ (${catalog.length} catalog items pre-rendered).`);
