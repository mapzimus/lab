#!/usr/bin/env node
/* Accessibility, contrast, device-range and performance audit for a
   scroll-driven page. Complements scroll-shoot.mjs: that one shows you what
   the page looks like, this one catches what you cannot see by looking.
   Every finding here came from a real defect in the reference build.

   Usage:
     node audit.mjs <url> [--widths 320x568,390x844,768x1024,1440x900,2560x1440]

   Conventions it knows about (all optional, skipped when absent):
     [data-step]  step elements        .card       narrative card
     #map-legend  floating key         #epoch-hud  floating readout

   Exits non-zero if anything fails, so it can gate a commit. */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

const url = process.argv[2];
if (!url) {
  console.error("usage: node audit.mjs <url> [--widths WxH,WxH]");
  process.exit(2);
}
const widthArg = process.argv.indexOf("--widths");
const VIEWPORTS = (widthArg > -1 ? process.argv[widthArg + 1] : "320x568,390x844,768x1024,1440x900,2560x1440")
  .split(",").map((s) => s.split("x").map(Number));

const CHROME = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
let fails = 0, warns = 0;
const pass = (m, d = "") => console.log(`  PASS  ${m}${d ? "   " + d : ""}`);
const fail = (m, d = "") => { fails++; console.log(`  FAIL  ${m}${d ? "   " + d : ""}`); };
const warn = (m, d = "") => { warns++; console.log(`  WARN  ${m}${d ? "   " + d : ""}`); };
const info = (m, d = "") => console.log(`  ....  ${m}${d ? "   " + d : ""}`);

const browser = await chromium.launch({ executablePath: CHROME });

/* ---------------------------------------------------------- structure */
console.log("\n=== structure and accessible names ===");
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  const a = await p.evaluate(() => {
    const nameOf = (el) =>
      (el.getAttribute("aria-label") || el.textContent || "").trim()
      || (el.labels?.length ? [...el.labels].map((l) => l.textContent).join(" ").trim() : "")
      || el.getAttribute("title") || "";
    const controls = [...document.querySelectorAll("button, a[href], select, input, [role=button]")];
    return {
      lang: document.documentElement.lang,
      title: document.title,
      h1: document.querySelectorAll("h1").length,
      headings: [...document.querySelectorAll("h1,h2,h3,h4")].map((e) => +e.tagName[1]),
      imgsNoAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
      nameless: controls.filter((el) => el.offsetParent !== null && !nameOf(el))
        .map((el) => el.tagName + (el.id ? "#" + el.id : "")),
      landmarks: ["main", "nav", "footer"].filter((t) => document.querySelector(t)),
      skip: !!document.querySelector('a[href^="#"]'),
      svgsUnlabelled: [...document.querySelectorAll("svg")]
        .filter((s) => s.querySelector("polyline,rect,circle,path,polygon"))
        .filter((s) => !(s.getAttribute("role") && s.getAttribute("aria-label"))).length,
      steps: document.querySelectorAll("[data-step]").length,
    };
  });

  a.lang ? pass(`html lang="${a.lang}"`) : fail("html lang is missing");
  a.h1 === 1 ? pass("exactly one h1") : fail(`h1 count is ${a.h1}`);
  // A heading must not skip a level on the way down.
  const skipped = a.headings.some((h, i) => i && h > a.headings[i - 1] + 1);
  skipped ? fail("heading level skipped", a.headings.join(">")) : pass("heading order is sequential");
  a.imgsNoAlt === 0 ? pass("every img has alt") : fail(`${a.imgsNoAlt} img without alt`);
  a.nameless.length === 0
    ? pass("every visible control has an accessible name")
    : fail(`${a.nameless.length} control(s) with no accessible name`, a.nameless.join(", "));
  a.landmarks.length >= 2 ? pass("landmarks", a.landmarks.join(", ")) : warn("few landmarks", a.landmarks.join(", "));
  a.skip ? pass("an in-page anchor exists (skip link or nav)") : warn("no skip link: long scroll pages need one");
  a.svgsUnlabelled === 0
    ? pass("charts carry role + aria-label")
    : fail(`${a.svgsUnlabelled} chart svg(s) without role+aria-label`);
  info(`steps found`, String(a.steps));

  // A focus ring the keyboard user can actually see.
  const ring = await p.evaluate(() => {
    const el = document.querySelector("button, a[href]");
    if (!el) return null;
    el.focus();
    const cs = getComputedStyle(el);
    return { outline: cs.outlineStyle, width: cs.outlineWidth, shadow: cs.boxShadow };
  });
  if (!ring) warn("no focusable control found to test");
  else if (ring.outline !== "none" || ring.shadow !== "none") pass("visible focus indicator");
  else fail("no visible focus indicator on the first control");
  await p.close();
}

/* ----------------------------------------------------------- contrast */
console.log("\n=== contrast (WCAG AA: 4.5:1 body, 3:1 large) ===");
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  const results = await p.evaluate(() => {
    const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
    const nums = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    // Walk up for the first non-transparent background actually painted.
    const bgOf = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        const p = nums(c);
        const alpha = (c.match(/[\d.]+/g) || [])[3];
        if (p.length === 3 && (alpha === undefined || Number(alpha) > 0.5)) return p;
      }
      return nums(getComputedStyle(document.body).backgroundColor);
    };
    const seen = new Set(), out = [];
    for (const el of document.querySelectorAll("p, li, span, h1, h2, h3, h4, a, button, label, output, figcaption")) {
      if (!el.offsetParent && el.tagName !== "BODY") continue;
      const text = (el.textContent || "").trim();
      if (text.length < 8) continue;
      if ([...el.children].some((c) => (c.textContent || "").trim().length > 8)) continue; // leaf text only
      const cs = getComputedStyle(el);
      const key = cs.color + "|" + cs.fontSize + "|" + cs.fontWeight;
      if (seen.has(key)) continue;
      seen.add(key);
      const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
      const a = lum(nums(cs.color)), b = lum(bgOf(el));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      out.push({
        ratio: +ratio.toFixed(2), size, weight,
        large: size >= 24 || (size >= 18.66 && weight >= 700),
        sample: text.slice(0, 32).replace(/\s+/g, " "),
        sel: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
      });
    }
    return out;
  });
  for (const r of results) {
    const need = r.large ? 3 : 4.5;
    const line = `${r.sel} ${r.size}px  "${r.sample}"`;
    r.ratio >= need ? pass(`${r.ratio}:1`, line) : fail(`${r.ratio}:1 needs ${need}`, line);
  }
  if (!results.length) warn("no text samples measured");
  await p.close();
}

/* -------------------------------------------------------- device range */
console.log("\n=== device range ===");
for (const [w, h] of VIEWPORTS) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  // Land on the densest step: the one whose card has the most content.
  await p.evaluate(() => {
    const steps = [...document.querySelectorAll("[data-step]")];
    if (steps.length) steps[0].scrollIntoView({ behavior: "instant", block: "center" });
  });
  await p.waitForTimeout(1200);
  // Every step, not the wordiest one. Card height is driven by rendered
  // content, and a step whose bulk is a chart or an image carries almost no
  // text: picking the longest string sailed straight past a card tall enough
  // to slide under the floating legend.
  const m = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const measureOne = () => {
      const card = [...document.querySelectorAll("[data-step] .card")]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.top < innerHeight && r.bottom > 0)
      .sort((a, b) => b.height - a.height)[0];
    const overlays = ["#map-legend", "#epoch-hud"]
      .map((s) => ({ s, el: document.querySelector(s) }))
      .filter((o) => o.el && getComputedStyle(o.el).display !== "none"
        && o.el.getBoundingClientRect().width > 0)
      .map((o) => ({ s: o.s, r: o.el.getBoundingClientRect() }));
    const hits = card ? overlays.filter((o) =>
      !(card.right < o.r.left || card.left > o.r.right
        || card.bottom < o.r.top || card.top > o.r.bottom)
      // A few pixels of touching is fine; real trouble is covering the heading.
      && Math.min(card.bottom, o.r.bottom) - Math.max(card.top, o.r.top) > 24
      && Math.min(card.right, o.r.right) - Math.max(card.left, o.r.left) > 24
    ).map((o) => o.s) : [];
      return {
        card: card ? { w: Math.round(card.width), h: Math.round(card.height), top: Math.round(card.top) } : null,
        offscreen: card ? (card.right > innerWidth + 1 || card.left < -1) : false,
        clippedTop: card ? card.top < -1 : false,
        hits,
      };
    };

    const steps = [...document.querySelectorAll("[data-step]")];
    let worst = null;
    for (const step of steps.length ? steps : [document.body]) {
      step.scrollIntoView({ behavior: "instant", block: "center" });
      await sleep(220);
      const r = measureOne();
      r.step = step.dataset.step || "(page)";
      // A collision beats a merely tall card; otherwise the tallest wins.
      const score = (x) => (x.hits.length ? 1e6 : 0) + (x.offscreen ? 5e5 : 0)
        + (x.card ? x.card.h : 0);
      if (!worst || score(r) > score(worst)) worst = r;
    }
    return {
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      steps: steps.length,
      ...worst,
    };
  });
  const label = `${w}x${h}`.padEnd(10);
  if (m.overflowX) fail(`${label} horizontal overflow`);
  else if (m.offscreen) fail(`${label} card runs off screen`, JSON.stringify(m.card));
  else if (m.hits.length) fail(`${label} overlay covers the card at "${m.step}"`, m.hits.join(", ") + " " + JSON.stringify(m.card));
  else if (errs.length) fail(`${label} page error`, errs[0].slice(0, 80));
  else pass(`${label} ${m.steps} steps, worst "${m.step}" ${m.card ? m.card.w + "x" + m.card.h : "n/a"}, no overflow, no overlay collision`);
  await p.close();
}

/* ------------------------------------------------------ reduced motion */
console.log("\n=== reduced motion ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await p.evaluate(() => {
    const s = [...document.querySelectorAll("[data-step]")];
    s[Math.floor(s.length * 0.75)]?.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await p.waitForTimeout(1500);
  errs.length === 0 ? pass("runs clean with prefers-reduced-motion")
    : fail("errors under reduced motion", errs[0].slice(0, 100));
  await ctx.close();
}

/* --------------------------------------------------------- performance */
console.log("\n=== performance (cold cache) ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  let bytes = 0, reqs = 0;
  p.on("response", async (r) => {
    reqs++;
    // Content-Length first: r.body() throws on some responses and silently
    // under-counts the payload, which is the one number this section is for.
    try {
      const len = Number(await r.headerValue("content-length"));
      bytes += len || (await r.body().catch(() => Buffer.alloc(0))).length;
    } catch {}
  });
  await p.goto(url, { waitUntil: "load", timeout: 60000 });
  const nav = await p.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByType("paint").find((x) => x.name === "first-contentful-paint");
    return { fcp: Math.round(fcp?.startTime || 0), load: Math.round(n.loadEventEnd) };
  });
  const critical = bytes;
  await p.waitForTimeout(5000);
  nav.fcp > 0 && nav.fcp < 2000
    ? pass(`first contentful paint ${nav.fcp} ms`)
    : warn(`first contentful paint ${nav.fcp} ms`);
  info("load event", nav.load + " ms");
  info("transfer before load", (critical / 1e6).toFixed(2) + " MB");
  info("transfer after deferred wave", `${(bytes / 1e6).toFixed(2)} MB over ${reqs} requests`);
  if (critical / 1e6 > 4) warn("critical path over 4 MB: consider a deferred second wave");
  await ctx.close();
}

await browser.close();
console.log(`\n${fails ? fails + " FAILURES" : "no failures"}${warns ? ", " + warns + " warnings" : ""}`);
process.exit(fails ? 1 : 0);
