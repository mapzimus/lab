// Game Vault data generator — one-off, run manually (not part of the site build).
// Pulls Named_Boxarts listings from libretro-thumbnails via `gh api` (authenticated),
// filters to NA releases, dedups variants, merges curated tags + extras, and emits
// per-platform JSON into src/lab/game-vault/data/.
//
// Usage: node scripts/build-gamevault.mjs [--offline]
//   --offline reuses scripts/.gamevault-cache/*.json instead of hitting the API.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src", "lab", "game-vault", "data");
const cacheDir = path.join(root, "scripts", ".gamevault-cache");
const offline = process.argv.includes("--offline");

// id, label, libretro repo, avg compressed MB per game, era note
// Tab order = North American launch date, oldest first. Arcade has no single launch
// date (its sets span the 1970s-2000s), so it sits at the end rather than in sequence.
const PLATFORMS = [
  { id: "nes", label: "NES", repo: "Nintendo_-_Nintendo_Entertainment_System", avgMB: 0.2 },              // Oct 1985
  { id: "gb", label: "Game Boy", repo: "Nintendo_-_Game_Boy", avgMB: 0.5 },                               // Jul 1989
  { id: "genesis", label: "Genesis", repo: "Sega_-_Mega_Drive_-_Genesis", avgMB: 1.5 },                   // Aug 1989
  { id: "neogeo", label: "Neo Geo", repo: "SNK_-_Neo_Geo", avgMB: 30, splitDual: true },                  // 1990
  { id: "snes", label: "SNES", repo: "Nintendo_-_Super_Nintendo_Entertainment_System", avgMB: 1.5 },      // Aug 1991
  { id: "saturn", label: "Saturn", repo: "Sega_-_Saturn", avgMB: 450 },                                   // May 1995
  { id: "ps1", label: "PlayStation", repo: "Sony_-_PlayStation", avgMB: 350 },                            // Sep 1995
  { id: "n64", label: "Nintendo 64", repo: "Nintendo_-_Nintendo_64", avgMB: 30 },                         // Sep 1996
  { id: "gbc", label: "Game Boy Color", repo: "Nintendo_-_Game_Boy_Color", avgMB: 1 },                    // Nov 1998
  { id: "dreamcast", label: "Dreamcast", repo: "Sega_-_Dreamcast", avgMB: 700 },                          // Sep 1999
  { id: "ps2", label: "PlayStation 2", repo: "Sony_-_PlayStation_2", avgMB: 2800 },                       // Oct 2000
  { id: "gba", label: "Game Boy Advance", repo: "Nintendo_-_Game_Boy_Advance", avgMB: 8 },                // Jun 2001
  { id: "xbox", label: "Xbox", repo: "Microsoft_-_Xbox", avgMB: 2500 },                                   // Nov 15 2001
  { id: "gamecube", label: "GameCube", repo: "Nintendo_-_GameCube", avgMB: 1000 },                        // Nov 18 2001
  { id: "ds", label: "Nintendo DS", repo: "Nintendo_-_Nintendo_DS", avgMB: 45 },                          // Nov 2004
  // libretro-thumbnails only carries ~330 USA PSP covers, so the release list comes
  // from the Redump DAT instead and thumbnails are matched in for art where they exist.
  { id: "psp", label: "PSP", repo: "Sony_-_PlayStation_Portable", avgMB: 800, dat: "redump/Sony - PlayStation Portable", artAnyRegion: true }, // Mar 2005
  { id: "wii", label: "Wii", repo: "Nintendo_-_Wii", avgMB: 3000 },                                       // Nov 2006
  { id: "3ds", label: "Nintendo 3DS", repo: "Nintendo_-_Nintendo_3DS", avgMB: 350 },                      // Mar 2011
  { id: "arcade", label: "Arcade", repo: "FBNeo_-_Arcade_Games", avgMB: 5, noRegionFilter: true },        // spans eras
];

// Variants that aren't real retail NA releases (or duplicate other tabs).
const EXCLUDE = /\((?:[^)]*\b(?:Demo|Beta|Proto|Sample|Kiosk|Aftermarket|Pirate|Program|Test|Debug|Promo|Competition Cart|bootleg|prototype|Korean|Unl)\b[^)]*|Virtual Console[^)]*)\)|\[[^\]]*\]/i;

// Known giant games where the platform average is way off (MB, per full game).
const BIG_GAMES = {
  ps2: { "gran turismo 4": 6500, "god of war ii": 6000, "god of war": 4600, "final fantasy xii": 5600, "metal gear solid 3 - subsistence": 7000, "grand theft auto - san andreas": 4300, "shadow of the colossus": 4200, "kingdom hearts ii": 4500, "rogue galaxy": 6900 },
  xbox: { "doom 3": 4800, "half-life 2": 5600, "conker - live & reloaded": 5900, "ninja gaiden black": 5500, "fable": 4700 },
  wii: { "super smash bros. brawl": 7900, "metroid prime trilogy": 7500, "xenoblade chronicles": 6900 },
  gamecube: {},
  psp: {},
  "3ds": {},
};

function ghTree(repo) {
  const cache = path.join(cacheDir, `${repo}.json`);
  if (offline || fs.existsSync(cache)) {
    if (!fs.existsSync(cache)) throw new Error(`--offline but no cache for ${repo}`);
    return JSON.parse(fs.readFileSync(cache, "utf8"));
  }
  let raw;
  try {
    raw = execFileSync("gh", ["api", `repos/libretro-thumbnails/${repo}/git/trees/master?recursive=1`], {
      maxBuffer: 256 * 1024 * 1024,
      encoding: "utf8",
    });
  } catch {
    // gh occasionally truncates very large responses — plain curl handles them fine
    raw = execFileSync("curl", ["-s", `https://api.github.com/repos/libretro-thumbnails/${repo}/git/trees/master?recursive=1`], {
      maxBuffer: 256 * 1024 * 1024,
      encoding: "utf8",
    });
  }
  const json = JSON.parse(raw);
  if (json.truncated) throw new Error(`${repo}: tree truncated`);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cache, raw, "utf8");
  return json;
}

// "Legend of Zelda, The - Ocarina of Time" and "The Legend of Zelda: Ocarina of Time"
// both -> "legend of zelda ocarina of time" (for tag matching)
export function norm(title) {
  return title
    .toLowerCase()
    .replace(/, the\b/g, "")
    .replace(/^the /, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function baseTitle(file) {
  // strip extension then everything from first " (" — region/lang/rev/disc tags
  return file.replace(/\.png$/i, "").replace(/ \(.*$/, "");
}

// Filenames escape & : / as "_" — undo for display. " _ " → " & ", "word_ " → ": ", rest → "/"
function displayTitle(t) {
  return t.replace(/ _ /g, " & ").replace(/_ /g, ": ").replace(/_/g, "/");
}

// Pull the canonical release list out of a libretro-database ClrMamePro .dat
function datNames(datPath) {
  const cache = path.join(cacheDir, datPath.replace(/[\\/ ]/g, "_") + ".dat");
  if (!fs.existsSync(cache)) {
    if (offline) throw new Error(`--offline but no cache for ${datPath}`);
    fs.mkdirSync(cacheDir, { recursive: true });
    const url = `https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/${datPath.split("/").map(encodeURIComponent).join("/")}.dat`;
    execFileSync("curl", ["-sL", url, "-o", cache], { encoding: "utf8" });
  }
  const txt = fs.readFileSync(cache, "utf8");
  return [...txt.matchAll(/^\s*name\s+"([^"]+)"/gm)].map((m) => m[1]);
}

const tags = JSON.parse(fs.readFileSync(path.join(root, "scripts", "gamevault-tags.json"), "utf8"));
const extras = JSON.parse(fs.readFileSync(path.join(root, "scripts", "gamevault-extras.json"), "utf8"));

fs.mkdirSync(outDir, { recursive: true });
const meta = [];
let grandTotal = 0;

for (const p of PLATFORMS) {
  const tree = ghTree(p.repo);
  let files = tree.tree
    .filter((e) => e.type === "blob" && e.path.startsWith("Named_Boxarts/") && e.path.endsWith(".png"))
    .map((e) => e.path.slice("Named_Boxarts/".length));

  // NA release = region tag containing USA or World ("(USA)", "(USA, Europe)",
  // "(Japan, USA)", "(World)" are all NA carts in No-Intro/Redump naming)
  const NA = /\([^)]*\b(?:USA|World)\b[^)]*\)/;
  files = files.filter((f) => !EXCLUDE.test(f));
  const allRegions = files; // kept for art fallback on DAT-backed platforms
  const hasRegion = !p.noRegionFilter && files.some((f) => NA.test(f));
  if (hasRegion) files = files.filter((f) => NA.test(f));

  // group variants by normalized base title (also merges "_"-escape spelling variants)
  const games = new Map();
  for (const f of files) {
    let t = baseTitle(f);
    // Neo Geo MVS sets are named "English Title _ Japanese Title" — keep the English half
    if (p.splitDual) t = t.split(" _ ")[0];
    const key = norm(t);
    if (!key) continue;
    const g = games.get(key) || { t, variants: [] };
    if (t.length < g.t.length) g.t = t;
    g.variants.push(f);
    games.set(key, g);
  }

  // DAT-backed platform: the release list is the DAT, thumbnails are art only.
  // Titles with no matching cover keep f:null and render as blank-but-selectable tiles.
  if (p.dat) {
    const art = games; // what we just built from thumbnails, keyed by norm title
    const fromDat = new Map();
    for (const raw of datNames(p.dat)) {
      if (!NA.test(raw) || EXCLUDE.test(raw)) continue;
      const t = baseTitle(raw + ".png");
      const key = norm(t);
      if (!key) continue;
      const g = fromDat.get(key) || { t, variants: [] };
      if (t.length < g.t.length) g.t = t;
      const m = raw.match(/\(Disc (\d+)\)/i);
      if (m) g.discs = Math.max(g.discs || 1, Number(m[1]));
      fromDat.set(key, g);
    }
    // NA cover if one exists, otherwise any region's cover for the same game
    let fallback = null;
    if (p.artAnyRegion) {
      fallback = new Map();
      for (const f of allRegions) {
        const key = norm(baseTitle(f));
        if (!key) continue;
        if (!fallback.has(key)) fallback.set(key, []);
        fallback.get(key).push(f);
      }
    }
    for (const [key, g] of fromDat) {
      g.variants = art.get(key)?.variants || fallback?.get(key) || [];
    }
    games.clear();
    for (const [key, g] of fromDat) games.set(key, g);
  }

  const platTags = tags[p.id] || {};
  const taggedNorms = new Map(Object.entries(platTags).map(([k, v]) => [norm(k), v]));
  const usedTags = new Set();

  const rows = [];
  for (const g of games.values()) {
    // canonical art = shortest variant name (fewest qualifier tags), stable tiebreak
    const art = g.variants.sort((a, b) => a.length - b.length || a.localeCompare(b))[0] || null;
    // disc count = highest (Disc N) seen among variants (or carried from the DAT)
    let discs = g.discs || 1;
    for (const v of g.variants) {
      const m = v.match(/\(Disc (\d+)\)/i);
      if (m) discs = Math.max(discs, Number(m[1]));
    }
    const n = norm(g.t);
    const tag = taggedNorms.get(n) || null;
    if (tag) usedTags.add(n);
    const big = (BIG_GAMES[p.id] || {})[n];
    const sizeMB = big || Math.round(p.avgMB * discs * 10) / 10;
    rows.push({ t: displayTitle(g.t), f: art, s: sizeMB, d: discs, h: tag });
  }

  // extras: add notable titles the source list misses, and refine sizes on ones it has
  for (const ex of extras[p.id] || []) {
    const n = norm(ex.t);
    const hit = rows.find((r) => norm(r.t) === n);
    if (hit) {
      if (ex.s) hit.s = ex.s * (hit.d || 1); // hand-measured size beats the platform average
      if (!hit.h && ex.h) hit.h = ex.h;
      continue;
    }
    rows.push({ t: ex.t, f: null, s: ex.s || p.avgMB, d: ex.d || 1, h: taggedNorms.get(n) || ex.h || null });
    if (taggedNorms.has(n)) usedTags.add(n);
  }

  rows.sort((a, b) => a.t.localeCompare(b.t, "en", { sensitivity: "base" }));
  fs.writeFileSync(path.join(outDir, `${p.id}.json`), JSON.stringify(rows), "utf8");

  const missedTags = [...taggedNorms.keys()].filter((k) => !usedTags.has(k));
  if (missedTags.length) console.warn(`  ! ${p.id}: ${missedTags.length} tag(s) matched nothing: ${missedTags.slice(0, 8).join("; ")}${missedTags.length > 8 ? " …" : ""}`);

  meta.push({ id: p.id, label: p.label, repo: p.repo, avgMB: p.avgMB, count: rows.length, tagged: rows.filter((r) => r.h).length });
  grandTotal += rows.length;
  console.log(`${p.label.padEnd(18)} ${String(rows.length).padStart(5)} games, ${rows.filter((r) => r.h).length} tagged`);
}

fs.writeFileSync(path.join(outDir, "platforms.json"), JSON.stringify(meta, null, 2), "utf8");
console.log(`\nTotal: ${grandTotal} games across ${PLATFORMS.length} platforms → ${path.relative(root, outDir)}`);
