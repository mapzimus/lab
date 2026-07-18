// Live geospatial radar endpoint for the /geo-radar/ dashboard. Same shape
// as /api/radar: run the sweep on demand, cache at the edge for an hour,
// fall back client-side to the committed /data/geo-radar.json.

import { sweepGeo } from "../../scripts/radar-lib.mjs";

const CACHE_SECONDS = 3600;

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/geo-radar", request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  let data;
  try {
    data = await sweepGeo(today, env.GITHUB_TOKEN);
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
