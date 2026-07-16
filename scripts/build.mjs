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

if (fs.existsSync(output)) fs.rmSync(assertInsideRoot(output), { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, output, { recursive: true });
fs.rmSync(path.join(output, "_template.html"));

const template = fs.readFileSync(path.join(source, "_template.html"), "utf8");
const pages = {
  home: {
    path: "index.html",
    title: "Mapzimus · Tools, maps, games, and experiments",
    description: "A creative lab of browser tools, unusual maps, games, and experiments by Maxwell Howe.",
    canonical: "https://mapzimus.com/",
    heading: "Useful tools. Strange maps. Small experiments.",
    intro: "Mapzimus is where I put the things worth building that do not need to behave like portfolio pieces.",
  },
  tools: {
    path: "tools/index.html",
    title: "Browser tools · Mapzimus",
    description: "A searchable catalog of 65 standalone browser tools for maps, data, design, teaching, and math.",
    canonical: "https://mapzimus.com/tools/",
    heading: "Tools that get out of the way.",
    intro: "Converters, viewers, classroom helpers, math utilities, and small data tools. Most run entirely in the browser.",
  },
  maps: {
    path: "maps/index.html",
    title: "Maps and GIS tools · Mapzimus",
    description: "Map experiments and client-side GIS tools from the Mapzimus creative lab.",
    canonical: "https://mapzimus.com/maps/",
    heading: "Maps, minus the dress code.",
    intro: "Useful GIS utilities sit next to projection experiments, fantasy networks, and geographic ideas that followed an interesting question.",
  },
  play: {
    path: "play/index.html",
    title: "Games · Mapzimus",
    description: "Small browser games and playful learning experiments from Mapzimus.",
    canonical: "https://mapzimus.com/play/",
    heading: "Things made to be played.",
    intro: "Strategy games, logic puzzles, geography, and classroom ideas that work better when they are interactive.",
  },
  experiments: {
    path: "experiments/index.html",
    title: "Experiments · Mapzimus",
    description: "Design, data, geometry, and unfinished-but-useful experiments from Mapzimus.",
    canonical: "https://mapzimus.com/experiments/",
    heading: "Questions with working demos.",
    intro: "Geometry sandboxes, design tools, alternate histories, and prototypes that are useful before they are polished.",
  },
};

for (const [view, page] of Object.entries(pages)) {
  const html = template
    .replaceAll("{{VIEW}}", view)
    .replaceAll("{{TITLE}}", page.title)
    .replaceAll("{{DESCRIPTION}}", page.description)
    .replaceAll("{{CANONICAL}}", page.canonical)
    .replaceAll("{{HEADING}}", page.heading)
    .replaceAll("{{INTRO}}", page.intro);
  const target = path.join(output, page.path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
}

const urls = Object.values(pages).map((page) => page.canonical);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
fs.writeFileSync(path.join(output, "sitemap.xml"), sitemap, "utf8");
console.log(`Built ${Object.keys(pages).length} Mapzimus pages in dist/.`);
