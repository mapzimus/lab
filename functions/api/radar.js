// Live radar endpoint for the /radar/ dashboard, served by Cloudflare Pages
// Functions. Runs the same sweep as scripts/radar.mjs and caches the result
// at the edge for an hour, so upstream APIs see at most ~24 sweeps a day.
// The dashboard falls back to the committed /data/radar.json if this fails.
//
// Optional: set a GITHUB_TOKEN secret on the Pages project so GitHub search
// isn't subject to the low unauthenticated per-IP rate limit at the edge.

import { sweep } from "../../scripts/radar-lib.mjs";

const CACHE_SECONDS = 3600;

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/radar", request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  let data;
  try {
    data = await sweep(today, env.GITHUB_TOKEN, { username: env.KAGGLE_USERNAME, key: env.KAGGLE_KEY });
  } catch (err) {
    return new Response(JSON.stringify({ error: `sweep failed: ${err.message}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const response = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=300, s-maxage=${CACHE_SECONDS}`,
    },
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
