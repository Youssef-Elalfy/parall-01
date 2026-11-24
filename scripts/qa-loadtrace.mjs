/**
 * Load trace: long tasks (>50 ms) on the main thread from navigation to the end of
 * the prologue, with the loader's displayed % and app milestones on the same clock.
 *   node scripts/qa-loadtrace.mjs [--base http://localhost:3000] [--out qa/x.json]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3000");
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.addInitScript(() => {
  const w = window;
  w.__trace = { long: [], marks: [] };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__trace.long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask", buffered: true });
  let last = "";
  const poll = () => {
    const pct = document.querySelector(".loader__pct")?.textContent ?? "";
    const st = document.querySelector(".loader")?.className ?? "gone";
    const key = pct + "|" + st;
    if (key !== last) { last = key; w.__trace.marks.push([Math.round(performance.now()), pct, st]); }
    if (st !== "gone") requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
});
await p.goto(`${BASE}/en`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(12000);
const t = await p.evaluate(() => window.__trace);
fs.mkdirSync("qa/perf", { recursive: true });
const out = arg("out", "qa/perf/loadtrace.json");
fs.writeFileSync(out, JSON.stringify(t, null, 1));
console.log("milestones (ms, pct, loader state):");
t.marks.forEach((m) => console.log("  ", m.join("  ")));
console.log("long tasks (start ms, duration ms):", t.long.filter((x) => x[1] > 50).map((x) => x.join("/")).join("  "));
await b.close();
