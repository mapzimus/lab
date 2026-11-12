// Mapzimus video stats: followers, views, and per-video numbers for the
// @mapzimus accounts. Shared by the daily snapshot (scripts/video-stats.mjs)
// and the live endpoint (functions/api/video-stats.js).
//
// YouTube: official Data API v3 when YOUTUBE_API_KEY is set (exact counts),
//   otherwise the public channel page (counts over 1K are rounded, e.g. "1.2K").
// TikTok: public profile page. Account totals only; per-video views need
//   TikTok's OAuth Display API.
// Instagram: Graph API only. Needs IG_USER_ID + IG_ACCESS_TOKEN (a Business or
//   Creator account linked to a Facebook Page). Reports "not connected" without.

const HANDLE = "mapzimus";
const YT_CHANNEL_ID = "UCo6MIY_8bA98YXjVCFfXl4A";

// "1.2K views" → 1200, "59 subscribers" → 59, "1,234" → 1234
export function parseCount(text) {
  if (text == null) return null;
  const m = String(text).replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

async function getText(url) {
  const res = await fetch(url, { headers: { "Accept-Language": "en-US,en;q=0.9" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error?.message || `HTTP ${res.status}`);
  return body;
}

// ---- YouTube ----

async function youtubeApi(key) {
  const api = "https://www.googleapis.com/youtube/v3";
  const ch = await getJson(`${api}/channels?part=statistics,contentDetails&id=${YT_CHANNEL_ID}&key=${key}`);
  const c = ch.items[0];
  const uploads = c.contentDetails.relatedPlaylists.uploads;
  const ids = [];
  let page = "";
  do {
    const pl = await getJson(`${api}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}&key=${key}${page ? `&pageToken=${page}` : ""}`);
    ids.push(...pl.items.map((i) => i.contentDetails.videoId));
    page = pl.nextPageToken;
  } while (page && ids.length < 500);
  const items = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await getJson(`${api}/videos?part=snippet,statistics&id=${ids.slice(i, i + 50).join(",")}&key=${key}`);
    for (const x of v.items) {
      items.push({
        id: x.id,
        title: x.snippet.title,
        url: `https://www.youtube.com/shorts/${x.id}`,
        published: x.snippet.publishedAt,
        views: +x.statistics.viewCount || 0,
        likes: x.statistics.likeCount != null ? +x.statistics.likeCount : null,
        comments: x.statistics.commentCount != null ? +x.statistics.commentCount : null,
      });
    }
  }
  return {
    ok: true,
    source: "api",
    exact: true,
    followers: +c.statistics.subscriberCount,
    views: +c.statistics.viewCount,
    videos: +c.statistics.videoCount,
    likes: items.reduce((s, v) => s + (v.likes || 0), 0),
    items,
  };
}

async function youtubePage() {
  const items = new Map();
  let followers = null;
  let videos = null;
  for (const tab of ["shorts", "videos"]) {
    const html = await getText(`https://www.youtube.com/@${HANDLE}/${tab}`);
    followers ??= parseCount(html.match(/"content":"([^"]*subscribers?)"/)?.[1]);
    videos ??= parseCount(html.match(/"content":"([^"]*videos?)"/)?.[1]);
    const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!m) continue;
    (function walk(o) {
      if (!o || typeof o !== "object") return;
      const s = o.shortsLockupViewModel;
      if (s) {
        const id = s.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
        if (id && !items.has(id)) items.set(id, {
          id,
          title: s.overlayMetadata?.primaryText?.content || "",
          url: `https://www.youtube.com/shorts/${id}`,
          views: parseCount(s.overlayMetadata?.secondaryText?.content) || 0,
        });
      }
      const v = o.videoRenderer;
      if (v?.videoId && !items.has(v.videoId)) items.set(v.videoId, {
        id: v.videoId,
        title: v.title?.runs?.[0]?.text || "",
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        views: parseCount(v.viewCountText?.simpleText) || 0,
      });
      for (const k in o) walk(o[k]);
    })(JSON.parse(m[1]));
  }
  const list = [...items.values()];
  return {
    ok: true,
    source: "page",
    exact: false,
    followers,
    videos: videos ?? list.length,
    views: list.reduce((s, v) => s + v.views, 0),
    items: list,
  };
}

export async function youtube(env = {}) {
  if (env.YOUTUBE_API_KEY) {
    try { return await youtubeApi(env.YOUTUBE_API_KEY); } catch (err) { console.warn(`YouTube API failed, using page: ${err.message}`); }
  }
  return youtubePage();
}

// ---- TikTok ----

export async function tiktok() {
  const html = await getText(`https://www.tiktok.com/@${HANDLE}`);
  const num = (key) => {
    // The page carries both a rounded number and an exact string; keep the larger.
    const all = [...html.matchAll(new RegExp(`"${key}":"?(\\d+)`, "g"))].map((m) => +m[1]);
    return all.length ? Math.max(...all) : null;
  };
  const followers = num("followerCount");
  if (followers == null) throw new Error("TikTok profile stats not found in page");
  return {
    ok: true,
    source: "page",
    exact: true,
    followers,
    following: num("followingCount"),
    likes: num("heartCount"),
    videos: num("videoCount"),
    views: null, // not exposed on the public profile
    items: [],
  };
}

// ---- Instagram ----

export async function instagram(env = {}) {
  if (!env.IG_USER_ID || !env.IG_ACCESS_TOKEN) {
    return { ok: false, reason: "Not connected yet (needs IG_USER_ID + IG_ACCESS_TOKEN)." };
  }
  const fields = "followers_count,follows_count,media_count,media.limit(50){id,caption,permalink,timestamp,like_count,comments_count,media_type}";
  const d = await getJson(`https://graph.facebook.com/v21.0/${env.IG_USER_ID}?fields=${encodeURIComponent(fields)}&access_token=${env.IG_ACCESS_TOKEN}`);
  const items = (d.media?.data || []).map((m) => ({
    id: m.id,
    title: (m.caption || "").split("\n")[0].slice(0, 120),
    url: m.permalink,
    published: m.timestamp,
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    views: null,
  }));
  return {
    ok: true,
    source: "api",
    exact: true,
    followers: d.followers_count,
    following: d.follows_count,
    videos: d.media_count,
    likes: items.reduce((s, v) => s + (v.likes || 0), 0),
    views: null,
    items,
  };
}

// ---- All platforms ----

export async function collect(env = {}) {
  const run = async (fn) => {
    try { return await fn(env); } catch (err) { return { ok: false, reason: err.message }; }
  };
  const [yt, tt, ig] = await Promise.all([run(youtube), run(tiktok), run(instagram)]);
  return {
    updated: new Date().toISOString(),
    platforms: {
      youtube: { url: `https://www.youtube.com/@${HANDLE}`, ...yt },
      tiktok: { url: `https://www.tiktok.com/@${HANDLE}`, ...tt },
      instagram: { url: `https://www.instagram.com/${HANDLE}/`, ...ig },
    },
  };
}
