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
- **Any always-open control panel needs a way to close it.** The reference
  build shipped a free-explore panel that could not be dismissed: on a phone it
  covered 50% of the viewport, in the mode built for looking at the map, and
  the only exit left explore mode entirely. Collapse to a pill, default
  collapsed on phones, and add a reset. While you are there, clear the story's
  HUD chips on entry: an annotation about a step the reader has left is a
  stale assertion sitting on their map.
- **The escape hatch must live outside the part that collapses.** The fix
  above shipped with "back to the story" inside the collapsible body, so
  putting the filters away hid the only way out, and phones (which open
  collapsed) landed readers in explore mode with no exit at all. A control
  that dismisses a mode never belongs inside the region that mode can hide.
- **Clear active state by the attribute you observe, not by a class.** The
  observer watched `[data-step]` but cleared `.step.is-active`. Chapter heads
  carry `data-step` and the class `.chapter-head`, so they were marked active
  on the way past and kept it forever. Symptomless until something else keys
  off `.is-active`, and then baffling.

## Text labels without a glyph server

A tile-free page has no glyphs endpoint, so MapLibre `symbol` layers can't
render text. Use HTML markers instead — and know that **MapLibre writes
inline `transform` and `opacity` styles onto the marker's root element**, so
any show/hide animation must live on an *inner* wrapper element the library
never touches. (This exact bug shipped once: labels stuck visible in every
chapter.) Markers double as annotation. Label the cities the copy names, with the value
underneath, updated per epoch, and give the reader place context at every
zoom: country names across continental chapters (dimmed where they are not the
subject, and suppressed where a city label already names the same spot), and
named landmarks once the camera is inside one city.

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

## Deriving a finding, not just a picture

A chapter that shows the same shape at six dates is a slideshow. The steps
that earn their place state something the reader could not see, and the
pipeline is where that gets computed:

- **Measure the increment, not the total.** Per-epoch stats on a cumulative
  footprint are swamped by whatever already existed, so they barely move. The
  question is almost always what *each* period added: in the reference build,
  slope on the cumulative built area crept from 20% to 25% and said nothing,
  while slope on each decade's new ground showed the flat land running out.
- **Derive at the resolution of the thing you are explaining.** A 30 m slope
  raster thresholded against a 92 m built-up grid produced hundreds of
  thousands of speckle polygons: 35+ minutes of dissolving, a 1.3 MB file, and
  false precision. Block-averaging to the coarser grid first ran in 90 seconds
  and made a better map.
- **Let the number kill your premise.** The slope step was planned around "the
  old city avoided the hills". The data said the old city sits at a median 2°
  and every later decade built steeper, which is a better story, but only
  because the copy was written after the numbers, not before.
- **A backdrop layer's edge must fall outside every camera it appears under**,
  or the study-window rectangle draws a hard line across the frame. Derive
  context layers on a wider bounding box than the story window.
- **Measure it or do not claim it.** "The road network is still the one drawn
  for a city a tenth the size" sat in the copy for weeks as an impression.
  Measuring it (street length inside each epoch's footprint, per resident) both
  proved it and surfaced the caveat that mattered: OSM has no history, so the
  early years are generous and the real decline is steeper.

## Accessibility and device range

None of this shows up in a screenshot, and all of it showed up in an audit of
the reference build after it was "finished":

- **Dim text is where contrast dies.** The muted token used for fine print and
  hints measured 3.94:1 against the background, under the 4.5:1 that WCAG AA
  asks for body text. Headings and body copy were fine; it is always the
  quiet grey. Measure it, do not eyeball it.
- **Short viewports break differently from narrow ones.** A phone-width test
  at 390x844 passed while 320x568 was broken: the chart cards are taller than
  the gap between the bottom padding and the top of the step, so they grew
  upward under the fixed legend, which covered their own heading. Test a
  *short* viewport, and when there is genuinely no room, let the card scroll
  internally and stand the floating overlays down.
- **Give every chart `role="img"` and an `aria-label`**, a long scrolling page
  a skip link, and every control a real accessible name (a styled `div` above
  a `select` is not a label; use `<label for>`).
- **Say what the map cannot.** Colour alone carries the meaning in a
  choropleth. The legend, the card text and the popup rows are what make it
  reachable without it.

## Keep the sources footer honest as you go

The footer is the part that quietly goes stale. Four layers were added to the
reference build in one round and the sources list was not touched: the
Copernicus DEM behind the slope layer went unattributed for two merges, which
is a licence condition rather than a nicety, and the payload was still
described as "about 3 MB" when it had grown to 4. **Update the footer in the
same commit as the layer**, and once in a while grep the source list against
what `data/` actually contains.

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
programmatically before it goes in the HTML. Drafted-from-memory figures were
wrong four times in the reference build ("14M by 2020" when the dataset said
10.2M). Round to what the data supports, name variants ("UN medium variant"),
and attribute projections inline.

Do not write a script that *prints* the numbers for you to eyeball. Write one
that **re-derives each claim from `data/` and asserts it**, one line per claim,
PASS or FAIL, non-zero exit on any mismatch:

```python
check("83% on ground built by 1975", round(s["share_added_on_old_ground"]) == 83, f'{s["share_added_on_old_ground"]}%')
check("2050: 129 cities over a million", sum(1 for c in cities if (c.get("p2050") or 0) >= 1) == 129, ...)
```

The reference build has 45 of these. They cost an hour once and then catch
every later edit, including the ones where the *data* moves under fixed copy:
filtering four cities out of `cities.geojson` silently changes three counts the
narrative quotes, and only an assertion notices.

## Verification (non-negotiable before pushing)

Two scripts, and they catch different things.

**Look at the frames.** `scroll-shoot.mjs` scrolls each `[data-step]` into
view, waits out the camera flight, screenshots, and reports console errors:

```
node .claude/skills/scrollytelling/scripts/scroll-shoot.mjs \
  <url> <outdir> 1440 900 desktop   # then again: 390 844 phone
```

Read the images. Layout bugs, stuck labels and phantom layers are visible in
them and in nothing else. Test both directions if you touched boundary steps.

**Then audit what a screenshot cannot show.** `audit.mjs` checks structure and
accessible names, measures the contrast of every distinct text style, renders
at five viewports from 320 to 2560 looking for overflow and overlays covering
the card, runs the page under `prefers-reduced-motion`, and reports cold-cache
paint and transfer. It exits non-zero on any failure:

```
node .claude/skills/scrollytelling/scripts/audit.mjs <url>
```

Both need `playwright-core` on `NODE_PATH` and use the preinstalled Chromium
at `/opt/pw-browsers/chromium` (override with `CHROMIUM_PATH`).

Zero console errors is the bar. Then `npm run build && npm run check`.

### Writing your own probes: three traps

- **`scroll-behavior: smooth` breaks `scrollIntoView()` assertions.** The page
  is still animating when the assertion reads state, so it reads the wrong
  step. Use `scrollIntoView({ behavior: "instant", block: "center" })` in
  tests; the smooth scrolling is for readers, not for you.
- **Never toggle a control blind inside a loop.** Clicking a collapse button
  once per iteration just flips it back and forth. Write `setPanel(true|false)`
  that reads current state first, then set it.
- **A test that fails is not automatically a bug in the page.** Three of the
  failures in the reference build's audit were the harness fighting the page.
  Confirm the cause before you "fix" anything, and when it *is* real, add the
  assertion that would have caught it.

## Delivery on a static host

Self-contained is not the same as delivered. Two things bit the reference
build after it was already live:

- **Fingerprint asset URLs at build time.** `mapzimus.com` sets a zone-level
  Browser Cache TTL that raises any shorter `max-age` the origin sends, so the
  `must-revalidate` on `app.js` arrived at browsers as four hours and deploys
  looked like nothing had changed. A build pass that appends a content hash
  (`app.js?v=8f3a1c2b`) to every local script and stylesheet in the built HTML
  fixes it whatever the CDN does, because a changed file is a new URL and the
  HTML itself is not cached. Skip absolute URLs, anything already carrying a
  query, and framework bundles that are already content-hashed.
- **That also gives you a way to verify a deploy you cannot drive.** When the
  browser cannot reach the live host (proxied sandbox, private preview), fetch
  each asset and hash it against your tested build. Byte equality proves the
  deployed page behaves identically without loading it, which is stronger than
  re-driving it anyway.

Also: pipe pipeline scripts through `python3 -u`. Buffered stdout makes a slow
script indistinguishable from a hung one, and one polygonising step in the
reference build looked dead for 35 minutes when it was merely too slow.

## Checklist for a new piece

1. Outline chapters as camera moves + the one claim each step makes.
2. Pipeline first: produce final, budget-sized GeoJSON before any HTML.
3. Make each step *derive* something, not just redraw the same shape at a new
   date. Measure the increment, and write the copy after the numbers.
4. Assert every narrative number against the shipped data, PASS/FAIL, in a
   script you rerun after every edit.
5. Page: hero → chapter heads (full resets) → steps → sources footer.
6. All layers added at opacity 0 with transitions; steps only set paint.
7. Boundary steps clear the neighboring chapter's layers (scroll-up test).
8. HTML markers with inner wrappers for any text on the map.
9. Reduced-motion, phone padding, dimmed inactive cards, and a mode's exit
   outside anything that mode can collapse.
10. Sources footer updated in the same commit as the layer, licence included.
11. `scroll-shoot` both widths, read every frame; `audit.mjs` for contrast,
    accessible names, 320-to-2560 layout and reduced motion.
12. Fingerprint built asset URLs; verify the deploy by hashing it against the
    build you tested.
13. Catalog entry + hosted route + README, `npm run check`, PR.
