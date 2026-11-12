// Live @mapzimus video stats for /stats/. Edge-cached for 10 minutes.
// Optional Pages secrets: YOUTUBE_API_KEY (exact YouTube counts),
// IG_USER_ID + IG_ACCESS_TOKEN (Instagram Graph API).

import { collect } from "../../scripts/video-stats-lib.mjs";

const SECONDS = 600;

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/video-stats", request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const data = await collect(env);
  const response = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${SECONDS}`,
    },
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
