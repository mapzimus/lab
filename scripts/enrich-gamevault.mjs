// One-off: enrich Game Vault rows with release year / genre / developer / publisher
// (and blurbs where they exist) from libretro-database's metadat DATs.
//
// Coverage is uneven upstream and that's expected: releaseyear/genre/publisher DATs
// exist mainly for cartridge platforms, developer DATs also cover PS1/PS2/Dreamcast,
// and real description text exists only for the Sony disc platforms.
//
// Writes back into src/lab/game-vault/data/:
//   <id>.json       rows gain y (year), g/dv/pb (indexes into the meta lookup tables)
//   <id>.meta.json  { g: [...genres], dv: [...developers], pb: [...publishers] }
//   <id>.desc.json  { "<exact row title>": "blurb" }  — lazily fetched on hover
//
// Usage: node scripts/enrich-gamevault.mjs [platformId ...]   (default: all)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src", "lab", "game-vault", "data");
const cacheDir = path.join(root, "scripts", ".gamevault-cache", "metadat");
fs.mkdirSync(cacheDir, { recursive: true });

const BASE = "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat";
const FIELDS = [
  { dir: "releaseyear", key: "releaseyear" },
  { dir: "genre", key: "genre" },
  { dir: "developer", key: "developer" },
  { dir: "publisher", key: "publisher" },
  { dir: "developer", key: "description" }, // blurbs ride along in the developer DATs
];

const norm = (title) =>
  title
    .normalize("NFD").replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/, the\b/g, "")
    .replace(/^the /, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// "Sonic the Hedgehog 2 (USA, Europe)" -> "Sonic the Hedgehog 2"
const stripTags = (s) => s.replace(/\s*\([^)]*\)/g, "").replace(/\s*\[[^\]]*\]/g, "").trim();

async function datText(dir, platformName) {
  const cache = path.join(cacheDir, `${dir}__${platformName}.dat`);
  if (fs.existsSync(cache)) return fs.readFileSync(cache, "utf8");
  const url = `${BASE}/${dir}/${encodeURIComponent(platformName)}.dat`;
  const res = await fetch(url);
  if (!res.ok) { fs.writeFileSync(cache, ""); return ""; } // 404 = no DAT for this platform
  const text = await res.text();
  fs.writeFileSync(cache, text);
  return text;
}

// Parse `game ( ... )` blocks into norm(title) -> field value. USA/World entries win;
// otherwise first entry wins, so regional dupes don't clobber a good value.
function parseDat(text, field) {
  const out = new Map();
  for (const block of text.split(/^game \($/m).slice(1)) {
    const titleM = block.match(/^\s*(?:comment|name)\s+"(.*)"\s*$/m);
    if (!titleM) continue;
    const valM = block.match(new RegExp(`^\\s*${field}\\s+"(.*)"\\s*$`, "m"));
    if (!valM || !valM[1]) continue;
    const raw = titleM[1];
    const key = norm(stripTags(raw));
    const isNA = /\((?:[^)]*\b(?:USA|World)\b[^)]*)\)/.test(raw);
    if (!out.has(key) || (isNA && !out.get(key).na)) out.set(key, { v: valM[1], na: isNA });
  }
  return new Map([...out].map(([k, o]) => [k, o.v]));
}

const platforms = JSON.parse(fs.readFileSync(path.join(dataDir, "platforms.json"), "utf8"));
const want = process.argv.slice(2);
const summary = [];

for (const p of platforms) {
  if (want.length && !want.includes(p.id)) continue;
  const platformName = p.repo.replace(/_/g, " ");
  const maps = {};
  for (const { dir, key } of FIELDS) maps[key] = parseDat(await datText(dir, platformName), key);

  const rowsPath = path.join(dataDir, `${p.id}.json`);
  const rows = JSON.parse(fs.readFileSync(rowsPath, "utf8"));

  // interned lookup tables keep the per-row payload to small integers
  const tables = { g: [], dv: [], pb: [] };
  const index = { g: new Map(), dv: new Map(), pb: new Map() };
  const intern = (slot, value) => {
    if (index[slot].has(value)) return index[slot].get(value);
    const i = tables[slot].length;
    tables[slot].push(value); index[slot].set(value, i);
    return i;
  };

  const descs = {};
  const hits = { y: 0, g: 0, dv: 0, pb: 0, desc: 0 };
  for (const r of rows) {
    const k = norm(r.t);
    const year = maps.releaseyear.get(k);
    if (year && /^\d{4}$/.test(year)) { r.y = Number(year); hits.y++; }
    const genre = maps.genre.get(k);
    if (genre) { r.g = intern("g", genre); hits.g++; }
    const dev = maps.developer.get(k);
    if (dev) { r.dv = intern("dv", dev); hits.dv++; }
    const pub = maps.publisher.get(k);
    if (pub) { r.pb = intern("pb", pub); hits.pb++; }
    const desc = maps.description.get(k);
    if (desc && desc.length > 20) {
      descs[r.t] = desc.length > 600 ? desc.slice(0, 597).replace(/\s+\S*$/, "") + "…" : desc;
      hits.desc++;
    }
  }

  fs.writeFileSync(rowsPath, JSON.stringify(rows));
  fs.writeFileSync(path.join(dataDir, `${p.id}.meta.json`), JSON.stringify(tables));
  if (hits.desc) fs.writeFileSync(path.join(dataDir, `${p.id}.desc.json`), JSON.stringify(descs));
  p.years = hits.y; // so the UI can tell whether year sort is meaningful here
  summary.push(`${p.id.padEnd(10)} year ${String(hits.y).padStart(5)}/${String(rows.length).padStart(5)}  genre ${String(hits.g).padStart(5)}  dev ${String(hits.dv).padStart(5)}  pub ${String(hits.pb).padStart(5)}  blurbs ${hits.desc}`);
}

fs.writeFileSync(path.join(dataDir, "platforms.json"), JSON.stringify(platforms, null, 2) + "\n");
console.log(summary.join("\n"));
