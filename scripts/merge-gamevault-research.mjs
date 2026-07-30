// One-off: merge researched tag lists (top-100s / sales charts / Reddit essentials)
// into gamevault-tags.json AND the emitted data/*.json, without a full rebuild.
// Hand-curated tags already in gamevault-tags.json win over researched ones.
//
// Usage: node scripts/merge-gamevault-research.mjs <research1.json> [research2.json ...]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src", "lab", "game-vault", "data");
const tagsPath = path.join(root, "scripts", "gamevault-tags.json");

// same as build-gamevault.mjs norm(), plus accent folding so "Pokémon" matches "Pokemon"
const norm = (title) =>
  title
    .normalize("NFD").replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/, the\b/g, "")
    .replace(/^the /, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const deent = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const tags = JSON.parse(fs.readFileSync(tagsPath, "utf8"));
const research = {};
for (const file of process.argv.slice(2)) {
  for (const [plat, list] of Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))) {
    research[plat] = Object.assign(research[plat] || {}, list);
  }
}

const platforms = JSON.parse(fs.readFileSync(path.join(dataDir, "platforms.json"), "utf8"));
const unmatched = {};

for (const p of platforms) {
  const list = research[p.id];
  if (!list) continue;
  const rowsPath = path.join(dataDir, `${p.id}.json`);
  const rows = JSON.parse(fs.readFileSync(rowsPath, "utf8"));
  const byNorm = new Map(rows.map((r) => [norm(r.t), r]));
  const curated = new Set(Object.keys(tags[p.id] || {}).map(norm));
  tags[p.id] = tags[p.id] || {};

  let added = 0;
  for (const [rawTitle, tag] of Object.entries(list)) {
    const title = deent(rawTitle);
    const row = byNorm.get(norm(title));
    if (!row) {
      (unmatched[p.id] = unmatched[p.id] || []).push(title);
      continue;
    }
    if (curated.has(norm(title)) || row.h) continue; // hand-curated wins
    row.h = tag;
    tags[p.id][row.t] = tag; // key by exact data title so rebuilds stay stable
    added++;
  }
  p.tagged = rows.filter((r) => r.h).length;
  fs.writeFileSync(rowsPath, JSON.stringify(rows));
  console.log(`${p.id.padEnd(10)} +${String(added).padStart(3)} tagged, now ${p.tagged}/${p.count} (${(unmatched[p.id] || []).length} unmatched)`);
}

fs.writeFileSync(path.join(dataDir, "platforms.json"), JSON.stringify(platforms, null, 2) + "\n");
fs.writeFileSync(tagsPath, JSON.stringify(tags, null, 2) + "\n");

if (Object.keys(unmatched).length) {
  console.log("\nUNMATCHED (fix titles or ignore):");
  for (const [plat, list] of Object.entries(unmatched)) console.log(` ${plat}: ${list.join(" | ")}`);
}
