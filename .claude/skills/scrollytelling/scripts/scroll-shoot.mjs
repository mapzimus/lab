/* Drive a scroll-driven story page headless and screenshot every step.
   Usage: node scroll-shoot.mjs <url> <outdir> [width] [height] [tag] [steps]
     url    — page to test, e.g. http://localhost:8901/lab/my-story/
     outdir — where PNGs land
     steps  — optional comma-separated data-step ids; default: every [data-step]
   Requires playwright-core (npm i playwright-core) and a Chromium binary
   (defaults to the preinstalled /opt/pw-browsers/chromium; override with
   CHROMIUM_PATH). Exits 1 if the page logged any console error. */
// Resolve playwright-core from the invoking directory, not this script's home
// (skills live outside any node_modules tree).
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(pathToFileURL(process.cwd() + "/"));
const { chromium } = require("playwright-core");

const [, , url, outdir, width = "1440", height = "900", tag = "desktop", only] = process.argv;
if (!url || !outdir) {
  console.error("usage: node scroll-shoot.mjs <url> <outdir> [width] [height] [tag] [steps]");
  process.exit(2);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: +width, height: +height } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(3500); // map + fonts settle

const steps = await page.evaluate(() =>
  [...document.querySelectorAll("[data-step]")].map((el) => el.dataset.step));
const shoot = only ? only.split(",") : steps;

for (const s of steps) {
  await page.evaluate((sel) => {
    document.querySelector(`[data-step="${sel}"]`)
      .scrollIntoView({ block: "center", behavior: "instant" });
  }, s);
  await page.waitForTimeout(2800); // outlast the longest camera flight
  if (shoot.includes(s)) {
    await page.screenshot({ path: `${outdir}/${tag}-${s}.png` });
    console.log(`shot ${tag}-${s}.png`);
  }
}

// Scroll-up spot check: revisit a mid-story step after reaching the end,
// so boundary-step state bugs (layers left on) show in the frame.
const mid = steps[Math.floor(steps.length / 2)];
if (mid) {
  await page.evaluate((sel) => {
    document.querySelector(`[data-step="${sel}"]`)
      .scrollIntoView({ block: "center", behavior: "instant" });
  }, mid);
  await page.waitForTimeout(2800);
  await page.screenshot({ path: `${outdir}/${tag}-scrollback-${mid}.png` });
  console.log(`shot ${tag}-scrollback-${mid}.png`);
}

console.log("console errors:", errors.length ? errors : "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
