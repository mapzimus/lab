---
name: map-poster
description: >-
  Turn a finished analysis into a polished, share-ready map graphic — QGIS print layouts, Instagram/social dimensions, SVG-to-Illustrator handoff, visual hierarchy, typography, and attribution conventions. Use this whenever a map needs to become a deliverable image: "export this map", "make it look good", "Instagram/social post", "poster", print or presentation output, or when reviewing a map image that reads as amateur and needs the design pass. Complements analysis skills (choropleth, census-data) — this one is about the last mile from correct map to striking graphic.
---

# The last mile: map → poster

A correct map and a compelling graphic are different artifacts. This is the
finishing pass — layout, type, color discipline, export settings — that
makes data cartography read as intentional design ("data journalism meets
beautiful cartography") instead of a GIS screenshot.

## Canvas first

Pick the output size before styling — label sizes and line weights only
make sense at a fixed canvas.

| Destination | Pixels | Notes |
|---|---|---|
| Instagram feed (square) | 1080 × 1080 | the default |
| Instagram feed (portrait) | 1080 × 1350 | more room for title + map |
| Story / Reel | 1080 × 1920 | title high, map center, source low |
| Print / poster | size at 300 DPI | 300 DPI; 150 is fine for screen-only |

## QGIS print layout workflow

1. Finish styling in the map canvas (symbology, labels) — the layout
   inherits it.
2. Project → New Print Layout → page size = target pixels (set units to px,
   or mm at the DPI you'll export).
3. Add Map item; lock its extent (Item properties → lock layers + extent)
   so later canvas fiddling doesn't shift the composition.
4. Add title, subtitle/caption, legend (unlink auto-entries; keep only
   classes that appear), scale bar only if distance matters, north arrow
   almost never (everyone knows).
5. Export: **PNG** at target DPI for direct posting; **SVG** ("export map
   layers as SVG groups", disable text-as-path) when finishing in
   Illustrator.

SVG→Illustrator handoff: QGIS groups layers, so restyling strokes/fills in
AI is clean. Fonts must be installed on both sides or exported as outlines.
Expect to redo halos/shadows in AI — SVG filters don't survive the trip.

## Design rules that separate pro from amateur

- **The map is the hero.** Title and legend support it; nothing competes.
  One focal color family on a quiet base — if everything is saturated,
  nothing is.
- **Margins breathe.** Cramped edges read amateur instantly. Leave more
  whitespace than feels necessary — 6–10% of canvas on every side.
- **Typography**: one clean sans for labels (Inter, DM Sans, Barlow,
  IBM Plex); a serif accent for the title is fine; never more than two
  families. Hierarchy by size/weight, not by adding fonts. Labels:
  abbreviate states, drop county names unless zoomed, sentence case beats
  ALL CAPS except tiny eyebrow labels.
- **Dark vs light**: dark backgrounds make colors pop (social-feed
  striking); light feels editorial/print. Pick one identity per series and
  stay consistent — a feed's coherence is part of the design.
- **Legend honesty**: label actual break values, not "low → high"; include
  the no-data class; put units in the legend title.
- **Source line, always**: small, bottom corner — "Data: ACS 2023 5-yr ·
  Map: @yourhandle". It's credibility, attribution compliance (OSM
  requires it), and a signature in one.

## Basemap & layer finishing

- Mute the basemap: desaturate, lighten/darken toward the background, or
  drop it entirely — land/water fills often beat tiles for posters.
- Line weights: hierarchy needs ≥2× jumps (0.2 / 0.5 / 1.2 pt), not
  0.4/0.5/0.6. Casings (dark under light) lift key lines off busy ground.
- Label halos: 1–1.5 pt at ~60% background color, not white-at-100% —
  visible halos are the #1 screenshot tell.
- Simplify geometry to the canvas: 1:500k boundaries for a 1080px national
  map; full-detail TIGER lines just make fuzz.

## Pre-publish checklist

Title says the finding (not "Map of X") · units stated · classification
named somewhere (caption is fine) · no-data visible and labeled · sources
credited · projection sane for the message (equal-area for choropleths) ·
readable at thumbnail size (zoom out to 25% and squint) · exported at the
destination's native pixels, not resized after.
