/**
 * Production performance: frame pacing per scene via real wheel scrolling (no dev hooks).
 *   node scripts/qa-perf.mjs [--base http://localhost:3100] [--vp 1440x900]
 * Reports per scene: avg fps over 3 s idle + p95 frame time, and fps while scrolling through.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3100");
const [W, H] = arg("vp", "1440x900").split("x").map(Number);
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11"] });
const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${BASE}/en`);
await page.locator(".loader__silent").waitFor({ timeout: 90000 });
await page.locator(".loader__silent").click();
await page.waitForFunction(() => !document.querySelector(".loader"), null, { timeout: 30000 });
await page.waitForTimeout(3000);
const sample = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((res) => {
        const d = [];
        let last = performance.now();
        const t0 = last;
        const f = (t) => {
          d.push(t - last);
          last = t;
          if (t - t0 < ms) requestAnimationFrame(f);
          else {
            d.sort((a, b) => a - b);
            res({ fps: +((d.length / (t - t0)) * 1000).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1) });
          }
        };
        requestAnimationFrame(f);
      }),
    ms,
  );
const scenes = ["top", "vision", "technology", "experience", "shift", "design", "customize", "finale"];
const out = [];
await page.mouse.move(W / 2, H / 2);
for (const s of scenes) {
  const y = await page.evaluate((s) => {
    const el = document.getElementById(s) || document.querySelector(`.${s}`);
    return el ? el.getBoundingClientRect().top + scrollY + Math.min(el.offsetHeight * 0.45, el.offsetHeight - innerHeight * 0.6) : null;
  }, s);
  if (y == null) continue;
  // real wheel travel to the scene (measured while moving)
  const moving = page.evaluate(() => new Promise((res) => setTimeout(res, 0)));
  await moving;
  const cur = await page.evaluate(() => scrollY);
  const steps = Math.max(1, Math.round(Math.abs(y - cur) / 240));
  const scrollStats = sample(steps * 40 + 600);
  for (let k = 0; k < steps; k++) {
    await page.mouse.wheel(0, Math.sign(y - cur) * 240);
    await page.waitForTimeout(35);
  }
  const moveFps = await scrollStats;
  await page.waitForTimeout(1500);
  const idle = await sample(3000);
  out.push({ scene: s, idleFps: idle.fps, idleP95ms: idle.p95, scrollFps: moveFps.fps, scrollP95ms: moveFps.p95 });
  console.log(JSON.stringify(out.at(-1)));
}
fs.mkdirSync("qa/perf", { recursive: true });
fs.writeFileSync(`qa/perf/perf-${W}x${H}.json`, JSON.stringify({ vp: `${W}x${H}`, out, errors }, null, 1));
console.log("console errors:", errors.length);
await b.close();
