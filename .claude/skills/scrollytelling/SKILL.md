---
name: scrollytelling
description: Build scroll-driven map stories ("scrollytelling") the way The Century of Africa (/lab/african-urbanization/) was built — a fixed full-screen MapLibre map driven through narrative chapters by scroll, self-contained with committed GeoJSON and no tiles. Use this whenever a project should tell a story as the reader scrolls — map stories, data narratives, "chapters" over a map or visualization, converting an existing dashboard-style map into a narrative, or when the user mentions scrollytelling, scroll-driven, story map, or narrative map. Also use it to review or debug an existing scroll-driven page (steps firing wrong, state breaking on scroll-up, camera fighting the reader).
---

# Scrollytelling map stories

The reference implementation is `src/lab/african-urbanization/` in this repo
(index.html + app.js + data/). Read it alongside this file when building a new
piece — this skill explains the *why* behind its patterns and the traps it
already paid for. The architecture works for any scroll-driven story, not just
maps: swap MapLibre for a chart, a canvas, or an SVG scene.

## The architecture in one paragraph

A fixed, non-interactive, full-screen map (`position: fixed; inset: 0`) sits
under normal-flow narrative content. The reader scrolls the *document* — never
hijack the wheel. Narrative "step" cards (each ~92vh tall so one step owns the
viewport at a time) carry `data-step` ids. An IntersectionObserver with a
narrow horizontal band (`rootMargin: "-42% 0px -42% 0px"`) fires when a step
crosses mid-viewport and runs that step's function, which sets camera + layer
state. That's the whole engine — no scrollama, no scroll math, ~25 lines.

## Story structure

Hero (full viewport, title + promise of the arc + scroll cue) → chapter heads
(numbered, "Chapter N / M", restate the question) → 3–5 steps per chapter →
sources/method footer. This shape does real work:

- **Chapter heads are full state resets.** Sub-steps mutate only what changes;
  heads set *everything* (camera, every layer group on/off). This makes most
  of the story robust to scrolling in either direction at any speed.
- **End on the ground.** The Africa piece works because it descends from
  planet → continent → corridor → one city. Plan the camera arc like a
  documentary: each chapter should change altitude or subject, not just data.
- **The footer is part of the story.** Sources, licenses, and an honesty note
  about projections belong on the page, not just in a README.

## The step engine (and its one hard-won rule)

Steps are a dictionary of `id → function`; the observer calls them. Every
step function must leave the page correct *whichever direction the reader
arrived from*. The bug class to design against: the last step of chapter N
gets scrolled up to from chapter N+1's head, which had turned N+1's layers on
— so the *boundary* steps (first and last of each chapter) must also clear
the neighboring chapter's layers. Interior steps can stay minimal. When in
doubt, make a step set more state, not less; the calls are cheap no-ops when
nothing changes.

Other engine rules, each learned the annoying way:

- **Add every layer up front at opacity 0; never add/remove layers
  mid-story.** Transitions come free: set `*-opacity-transition` /
  `circle-radius-transition` durations in the paint once, then step functions
  just call `setPaintProperty` and MapLibre animates. Data-driven epoch
  animation = swap the property the style expression reads
  (`circle-radius: k·sqrt(get p2025)` → `p2050`), and the radii tween.
- **Camera via `fitBounds` with responsive padding**, not center/zoom pairs:
  desktop pads left ~480px for the card column, phones pad the bottom ~40% of
  the viewport where the card sits. One bounds constant then works at every
  screen size. Clamp with `maxZoom`.
- **`prefers-reduced-motion` → duration 0** on every camera move (`fly`
  helper checks once). Cards still fade; the map just cuts.
- **The active card is full opacity, inactive ones dim** (CSS class toggled
  by the same observer callback). It tells the reader which text the map is
  currently answering.

## Text labels without a glyph server

A tile-free page has no glyphs endpoint, so MapLibre `symbol` layers can't
render text. Use HTML markers instead — and know that **MapLibre writes
inline `transform` and `opacity` styles onto the marker's root element**, so
any show/hide animation must live on an *inner* wrapper element the library
never touches. (This exact bug shipped once: labels stuck visible in every
chapter.) Markers double as annotation: label only the ~8 cities the copy
mentions, with the value underneath, updated per epoch.

## Self-contained or it isn't done

The repo convention (see detroit-rebuild, train-routes): vendored library in
`vendor/`, all data as committed GeoJSON in `data/`, no tiles, no external
requests. Consequences to design for:

- **Size budget ~2–4 MB total.** The pipeline earns this: simplify geometry
  (`shapely .simplify`, tolerance ~0.05° for world, ~0.0005° for city scale),
  quantize coordinates (3–4 decimals via a rounding pass at write time), drop
  sub-threshold polygons, and put per-feature data in properties rather than
  parallel files.
- **No basemap.** Land = a styled countries fill; water = a polygon you
  fetched; ground at city zoom = plain background. Coarse 1:50m country
  polygons look *wrong* at city zoom (phantom border stripes) — fade them to
  0 when the camera dives and let dedicated local layers take over.
- **Commit the pipeline next to the page** (`pipeline/*.py`, raw downloads
  gitignored). For a portfolio piece the pipeline *is* half the exhibit.

## Two visual tricks worth stealing

- **Growth-vintage rings from epoch rasters:** make each epoch's footprint
  mask *cumulative* (once built, always built), then draw layers newest-first
  so the oldest fabric paints on top. The visible remainder of each layer is
  exactly its growth ring — no differencing needed, and stepping visibility
  epoch-by-epoch animates the city filling in.
- **Honesty encoding:** solid fill for observed/official data, hollow stroke
  for projections beyond it, dashed for plans. Say so in the legend and copy.

## Copy discipline

Every number in the narrative must be checked against the shipped data files
programmatically before it goes in the HTML — write a small script that reads
`data/*.json` and prints the claims, then fix the copy to match. Drafted-from-
memory figures were wrong four times in the reference build ("14M by 2020"
when the dataset said 10.2M). Round to what the data supports, name variants
("UN medium variant"), and attribute projections inline.

## Verification (non-negotiable before pushing)

Drive the real page headless through every step and *look at the frames*:

```
node .claude/skills/scrollytelling/scripts/scroll-shoot.mjs \
  <url> <outdir> 1440 900 desktop   # then again: 390 844 phone
```

The script (playwright-core + the preinstalled Chromium at
`/opt/pw-browsers/chromium`) scrolls each `[data-step]` into view, waits out
the camera flight, screenshots, and reports console errors. Read the images —
layout bugs, stuck labels, and phantom layers are all visible in them and in
nothing else. Test both directions if you touched boundary steps: scroll to
the end, then screenshot a mid-story step again. Zero console errors is the
bar. Then `npm run build && npm run check` as usual.

## Checklist for a new piece

1. Outline chapters as camera moves + the one claim each step makes.
2. Pipeline first: produce final, budget-sized GeoJSON before any HTML.
3. Verify every narrative number against the data files by script.
4. Page: hero → chapter heads (full resets) → steps → sources footer.
5. All layers added at opacity 0 with transitions; steps only set paint.
6. Boundary steps clear the neighboring chapter's layers (scroll-up test).
7. HTML markers with inner wrappers for any text on the map.
8. Reduced-motion, phone padding, dimmed inactive cards.
9. scroll-shoot both widths, read every frame, fix, repeat until clean.
10. Catalog entry + hosted route + README, `npm run check`, PR.
