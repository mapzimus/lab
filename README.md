# 🗺️ mapzimus

The staging ground for [mapzimus.com](https://mapzimus.com) — a home for in-progress
projects, active tools, fantasy worlds, and games.

## How it's structured

Everything under `public/` is the website, served as plain static files:

```
public/
├── index.html        # the hub homepage
├── 404.html          # shown for any missing page
├── assets/site.css   # shared styles
├── projects/         # 🚧 in-progress builds and experiments
├── tools/            # 🛠️ active tools
├── fantasy/          # 🐉 worldbuilding, maps, lore
└── games/            # 🎮 playable things
```

To stage something new, drop it into a subfolder (e.g. `public/games/snake/`)
with its own `index.html`, then add a link to it from that section's index page.
No build step, no framework — just files.

## Running locally

```sh
npx wrangler dev
```

Then open http://localhost:8787. (Or use any static file server pointed at
`public/`, e.g. `python3 -m http.server -d public`.)

## Deploying to Cloudflare

The site deploys as a [Cloudflare Worker with static assets](https://developers.cloudflare.com/workers/static-assets/),
configured in `wrangler.jsonc`.

### One-time setup

1. `npx wrangler login` (opens a browser to authorize with your Cloudflare account)
2. `npx wrangler deploy`

Since mapzimus.com is already registered through Cloudflare, the zone exists in
your account, and the `custom_domain` routes in `wrangler.jsonc` will
automatically create the DNS records for `mapzimus.com` and `www.mapzimus.com`
on the first deploy. No manual DNS setup needed.

### Deploying updates

```sh
npx wrangler deploy
```

That's it. (Later, this can be wired to a GitHub Action or Cloudflare's Workers
Builds so pushes to `main` deploy automatically.)
