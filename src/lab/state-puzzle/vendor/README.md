# Vendored libraries

Self-hosted rather than pulled from a CDN, so the page depends on nothing at run
time but its own origin. r147 is the last three.js release that ships the
classic (non-module) `examples/js` controls, which lets the page load with plain
`<script defer>` tags and no bundler.

| File | Library | Version | Source | License |
|---|---|---|---|---|
| `three.min.js` | three.js | 0.147.0 | `https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js` | MIT © three.js authors |
| `OrbitControls.js` | three.js | 0.147.0 | `https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js` | MIT © three.js authors |
