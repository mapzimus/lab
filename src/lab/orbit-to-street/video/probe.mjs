// Speed and look test: a few stills from key views.  node video/probe.mjs OUTDIR
import { open } from "./rig.mjs";
const out = process.argv[2] || ".";
const { browser, page } = await open();
const views = {
  home: "HOME",
    ne: "PLACES[3].go()",
  mid: "({ ...toGeoXZ(0, 0, 0), range: 6e4, heading: 0.3, tilt: 0.8 })",
  airliner: "airliner",
  backbay: "backBay",
};
for (const [name, expr] of Object.entries(views)) {
  await page.evaluate(e => { const r = window.__rig; const v = new Function("r", "with (r) return " + e)(r); r.stop(); Object.assign(r.view, v); Object.assign(r.goal, v); }, expr);
  for (let i = 0; i < 20; i++) await page.evaluate(() => __tick(33.3));
  const t = Date.now();
  for (let i = 0; i < 2; i++) { await page.evaluate(() => __tick(33.3)); await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 90, timeout: 120000 }); }
  console.log(name, ((Date.now() - t) / 2).toFixed(0), "ms/frame", await page.evaluate(() => Math.round(__rig.alt)));
}
await browser.close();
