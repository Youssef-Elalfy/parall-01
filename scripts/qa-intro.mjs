/**
 * Intro QA: prologue → Enter → hero, on the same clock.
 *   node scripts/qa-intro.mjs [--base http://localhost:3000] [--tag intro] [--lang en] [--vp 1440x900]
 *          [--slow] (throttle network to ~4 Mbps / 150 ms) [--reduced] [--silent] [--cached]
 *          [--video] (record a webm of the whole sequence)
 * Reports: % milestones (must be monotonic, reach 100 only when ready), main-thread long
 * tasks before/after Enter, frame gaps during the hero transition, audio state + output level,
 * console errors. Screenshots at key moments.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);
const BASE = arg("base", "http://localhost:3000");
const TAG = arg("tag", "intro");
const LANG = arg("lang", "en");
const [W, H] = arg("vp", "1440x900").split("x").map(Number);
const OUT = path.join("qa", "cinematic", TAG);
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");

const b = await chromium.launch({
  executablePath: exe,
  args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11", "--autoplay-policy=user-gesture-required"],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  reducedMotion: has("reduced") ? "reduce" : "no-preference",
  ...(has("video") ? { recordVideo: { dir: OUT, size: { width: Math.min(W, 1280), height: Math.round((Math.min(W, 1280) * H) / W) } } } : {}),
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

if (has("slow")) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: 1e6 });
}
await page.addInitScript(() => {
  const w = window;
  w.__qa = { long: [], marks: [], frames: [] };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__qa.long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask", buffered: true });
  let last = "";
  let prev = performance.now();
  const poll = (t) => {
    w.__qa.frames.push([Math.round(t), Math.round(t - prev)]);
    prev = t;
    const pct = document.querySelector(".loader__pct")?.textContent ?? (document.querySelector(".enter-btn") ? "ENTER" : "");
    const st = document.querySelector(".loader")?.className.replace(/\s+/g, " ").trim() ?? "gone";
    const key = pct + "|" + st;
    if (key !== last) {
      last = key;
      w.__qa.marks.push([Math.round(t), pct, st]);
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
});

if (has("cached")) {
  await page.goto(`${BASE}/${LANG}`, { waitUntil: "load" });
  await page.waitForSelector(".enter-btn", { timeout: 60000 });
}
const t0 = Date.now();
await page.goto(`${BASE}/${LANG}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(OUT, "1-prologue-drawing.png") });
await page.waitForSelector(".enter-btn", { timeout: 90000 });
const readyAfter = Date.now() - t0;
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(OUT, "2-enter-screen.png") });
// atmosphere is alive: two frames 1.5 s apart must differ
const a1 = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
await page.waitForTimeout(1500);
const a2 = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
const atmosphereMoves = !a1.equals(a2);

// hover state
await page.hover(".enter-btn");
await page.waitForTimeout(700);
const btn = await page.locator(".enter-btn").boundingBox();
await page.screenshot({ path: path.join(OUT, "3-enter-hover.png"), clip: { x: Math.max(0, btn.x - 80), y: Math.max(0, btn.y - 60), width: btn.width + 160, height: btn.height + 180 } });

const tClick = await page.evaluate(() => performance.now());
if (has("silent")) await page.click(".loader__silent");
else await page.click(".enter-btn");
for (const [ms, name] of [[350, "4-transition-0.35s"], [900, "5-transition-0.9s"], [1800, "6-transition-1.8s"], [3600, "7-hero-settled"]]) {
  await page.waitForTimeout(ms - (ms === 350 ? 0 : 0));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}
await page.waitForTimeout(1500);
const audio = await page.evaluate(() => {
  const s = window.__parallSound;
  if (!s) return null;
  const lv = [];
  return new Promise((res) => {
    let n = 0;
    const id = setInterval(() => {
      lv.push(s.measureLevel());
      if (++n >= 8) {
        clearInterval(id);
        res({ state: s.state(), on: s.isSoundOn(), info: s.info(), peak: +Math.max(...lv).toFixed(3), pressed: document.querySelector(".nav__sound")?.getAttribute("aria-pressed") });
      }
    }, 150);
  });
});
const q = await page.evaluate((tc) => {
  const w = window.__qa;
  const after = w.frames.filter(([t]) => t > tc && t < tc + 4000);
  return {
    marks: w.marks,
    longBefore: w.long.filter(([s, d]) => s < tc && d > 50),
    longAfter: w.long.filter(([s, d]) => s >= tc && d > 50),
    transitionFrames: after.length,
    worstGapMs: Math.max(0, ...after.map(([, d]) => d)),
    gapsOver50: after.filter(([, d]) => d > 50).length,
    heroVisible: getComputedStyle(document.querySelector(".story")).visibility,
    loaderGone: !document.querySelector(".loader"),
  };
}, tClick);
const pcts = q.marks.map((m) => m[1]).filter((p) => /^\d+$/.test(p)).map(Number);
const monotonic = pcts.every((v, i) => i === 0 || v >= pcts[i - 1]);
const report = { vp: `${W}x${H}`, lang: LANG, slow: has("slow"), cached: has("cached"), reduced: has("reduced"), silent: has("silent"), readyAfterMs: readyAfter, monotonic, atmosphereMoves, audio, ...q, errors };
fs.writeFileSync(path.join(OUT, "intro.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, marks: report.marks.map((m) => `${m[0]}ms ${m[1]} [${m[2]}]`) }, null, 1));
await ctx.close();
await b.close();
