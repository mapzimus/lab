#!/usr/bin/env node
// Daily snapshot of the @mapzimus video stats. Appends one row per day to
// src/data/video-stats.json so /stats/ can show growth over time; the live
// numbers come from functions/api/video-stats.js.
// Optional env: YOUTUBE_API_KEY, IG_USER_ID, IG_ACCESS_TOKEN.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "./video-stats-lib.mjs";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "video-stats.json");
const KEEP_DAYS = 400;

let store = { latest: null, history: [], videos: {} };
try { store = JSON.parse(await readFile(FILE, "utf8")); } catch { /* first run */ }

const snap = await collect(process.env);
const date = snap.updated.slice(0, 10);

const row = { date };
for (const [name, p] of Object.entries(snap.platforms)) {
  if (!p.ok) continue;
  row[name] = { followers: p.followers ?? null, views: p.views ?? null, likes: p.likes ?? null, videos: p.videos ?? null };
}

// A platform that failed today keeps yesterday's numbers out of the row rather
// than recording a fake zero.
store.history = store.history.filter((r) => r.date !== date);
store.history.push(row);
store.history = store.history.slice(-KEEP_DAYS);

// Per-video view history (YouTube), so the page can show what moved today.
store.videos ||= {};
for (const v of snap.platforms.youtube.items || []) {
  const h = (store.videos[v.id] ||= []);
  const last = h.at(-1);
  if (last && last[0] === date) last[1] = v.views;
  else h.push([date, v.views]);
  if (h.length > 90) h.splice(0, h.length - 90);
}

store.latest = snap;
await writeFile(FILE, JSON.stringify(store) + "\n");

const s = snap.platforms;
console.log(`video stats ${date}: YT ${s.youtube.ok ? `${s.youtube.followers} subs / ${s.youtube.views} views (${s.youtube.source})` : s.youtube.reason}; ` +
  `TT ${s.tiktok.ok ? `${s.tiktok.followers} followers / ${s.tiktok.likes} likes` : s.tiktok.reason}; ` +
  `IG ${s.instagram.ok ? `${s.instagram.followers} followers` : s.instagram.reason}`);
