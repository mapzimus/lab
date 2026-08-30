# World XI (hosted copy)

Hosted copy of [mapzimus/world-xi-map](https://github.com/mapzimus/world-xi-map)
at https://mapzimus.com/lab/world-xi/ — an interactive 3D globe of every club of
158 leagues, men's and women's — the top flight of 120 nations (5,094 clubs) —
each at its home stadium, searchable and filterable by league, gender and
country. That includes the whole United States pyramid, MLS down through the
open amateur tiers, and all 1,789 NCAA soccer programmes across Divisions I,
II and III.
Every nation's top flight is shown at first; the lower tiers, college and
amateur leagues wait behind one checkbox, and search can fly to a continent,
nation, US state or metro area as well as to a club.

That repo is the source of truth: the data pipeline (`scripts/build-data.mjs`,
hand-curated rosters, overrides) lives there, and `data/clubs.geojson` here is
its committed output. To update this copy, regenerate in the source repo and
re-copy `index.html`, `app.js`, `styles.css`, and `data/clubs.geojson`, then
re-apply the four adaptations this copy carries: the `<title>`, the canonical
link and site favicon, absolute `/lab/world-xi/...` asset paths plus the
`← Lab` backlink in `index.html`, the `.backlink` rules in `styles.css`, and
`DATA_URL` in `app.js`. Nothing else should differ — `diff` against the source
after copying.

Data: Wikidata (CC0) plus club rosters, grounds and towns read from Wikipedia.
2,810 clubs — the lower US tiers and most NCAA programmes — have no Wikidata
item. 2,826 clubs sit on their ground; 1,415 are placed on a college campus and
798 on their town, and the map labels both of those as approximate. 215 grounds
come from OpenStreetMap and 46 US addresses from the US Census Bureau geocoder
(public domain), neither of which Wikidata or Wikipedia carry — so
clubs.geojson is a derived database under ODbL 1.0 and must credit
"© OpenStreetMap contributors" (https://www.openstreetmap.org/copyright). Each
club's `source` field says which coordinates those are.
3,755 crests are hotlinked from Wikipedia/Commons at runtime and 435 are
committed under `data/crests/`, taken from the leagues' and colleges' own sites;
all remain trademarks of their clubs. 849 clubs have no crest and draw a
league-coloured dot instead — 597 of those are UPSL and NPSL clubs whose only
published marks sit behind a bot challenge.
Basemap: OpenFreeMap. MapLibre GL JS 5.6.1 vendored (see `vendor/README.md`).
