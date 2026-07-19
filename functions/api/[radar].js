// Live radar endpoints, one dynamic route for the whole array:
// /api/radar, /api/geo-radar, /api/soccer-radar, /api/stocks-radar,
// /api/politics-radar. Each runs its sweep on demand and caches the result
// at the edge; dashboards fall back to the committed /data/*.json baseline.
//
// Optional Pages secrets: GITHUB_TOKEN (GitHub search + releases rate
// limits), KAGGLE_USERNAME/KAGGLE_KEY (dev radar's Kaggle section).

import { sweep, sweepGeo, sweepSoccer, sweepStocks, sweepPolitics } from "../../scripts/radar-lib.mjs";

const SWEEPS = {
  "radar": { seconds: 3600, run: (today, env) => sweep(today, env.GITHUB_TOKEN, { username: env.KAGGLE_USERNAME, key: env.KAGGLE_KEY }) },
  "geo-radar": { seconds: 3600, run: (today, env) => sweepGeo(today, env.GITHUB_TOKEN) },
  "soccer-radar": { seconds: 900, run: (today) => sweepSoccer(today) }, // scores go stale fast
  "stocks-radar": { seconds: 900, run: (today) => sweepStocks(today) },
  "politics-radar": { seconds: 1800, run: (today) => sweepPolitics(today) },
};

export async function onRequestGet({ request, env, params, waitUntil }) {
  const config = SWEEPS[params.radar];
  if (!config) return new Response("Not found", { status: 404 });

  const cache = caches.default;
  const cacheKey = new Request(new URL(`/api/${params.radar}`, request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  let data;
  try {
    data = await config.run(today, env);
  } catch (err) {
    return new Response(JSON.stringify({ error: `sweep failed: ${err.message}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const response = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=300, s-maxage=${config.seconds}`,
    },
  });
  waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
