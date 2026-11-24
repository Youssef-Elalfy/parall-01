/**
 * Perception-shift ("VISION IS NOT STATIC.") geometry check across the whole pinned scroll.
 *   node scripts/qa-shift.mjs [--tag after] [--vp 1505x627,1920x1080]
 * For each viewport × language × progress: title lines (base + lens copy) must stay above the
 * caption band, below the nav, and — once settled (p ≥ 0.4) — inside the horizontal edges.
 */
import { chromium } from "playwright";
import { enterSite } from "./qa-enter.mjs";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const TAG = arg("tag", "after");
const OUT = path.join("qa", "refine", TAG);
fs.mkdirSync(OUT, { recursive: true });
const VPS = arg("vp", "1920x1080,1505x627,1440x900,1400x646,1024x768,768x1024,390x844,360x800")
  .split(",")
  .map((s) => s.split("x").map(Number));
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const PS = [0.05, 0.2, 0.35, 0.45, 0.6, 0.75, 0.9, 1];

const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const rows = [];
for (const [w, h] of VPS) {
  for (const lang of ["en", "ar"]) {
    const page = await b.newPage({ viewport: { width: w, height: h } });
    await page.goto(`http://localhost:3000/${lang}`);
    await enterSite(page);
    await page.waitForTimeout(1200);
    for (const p of PS) {
      await page.evaluate((p) => {
        const el = document.querySelector(".shift");
        window.__parallScrollTo(el.getBoundingClientRect().top + scrollY + p * (el.offsetHeight - innerHeight));
      }, p);
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const vw = innerWidth;
        const edge = parseFloat(getComputedStyle(document.querySelector(".wrap") ?? document.body).paddingInlineStart) || 0;
        const nav = document.querySelector(".nav").getBoundingClientRect().bottom;
        const foot = document.querySelector(".shift__foot").getBoundingClientRect();
        const body = document.querySelector(".shift__body").getBoundingClientRect();
        const lines = [...document.querySelectorAll(".shift__line")].map((s) => {
          // tight glyph box (not the line box)
          const r = document.createRange();
          r.selectNodeContents(s);
          const g = r.getBoundingClientRect();
          return { inv: !!s.closest(".shift__lines--inverse"), l: g.left, r: g.right, t: g.top, b: g.bottom };
        });
        const p = parseFloat(getComputedStyle(document.querySelector(".shift")).getPropertyValue("--p"));
        return { vw, edge, nav, footTop: foot.top, body, lines, p, fs: parseFloat(getComputedStyle(document.querySelector(".shift__lines")).fontSize) };
      });
      const issues = [];
      const maxB = Math.max(...m.lines.map((l) => l.b));
      const minT = Math.min(...m.lines.map((l) => l.t));
      if (maxB > m.footTop + 1) issues.push(`title bottom ${maxB.toFixed(0)} > caption band ${m.footTop.toFixed(0)}`);
      if (minT < m.nav - 1) issues.push(`title top ${minT.toFixed(0)} under nav ${m.nav.toFixed(0)}`);
      if (m.p >= 0.4) {
        for (const l of m.lines) if (l.l < -1 || l.r > m.vw + 1) issues.push(`line ${l.inv ? "lens" : "base"} x ${l.l.toFixed(0)}–${l.r.toFixed(0)} outside 0–${m.vw}`);
      }
      // caption vs. title glyphs
      for (const l of m.lines) {
        const ox = Math.min(l.r, m.body.right) - Math.max(l.l, m.body.left);
        const oy = Math.min(l.b, m.body.bottom) - Math.max(l.t, m.body.top);
        if (ox > 0 && oy > 0) issues.push("caption overlaps title");
      }
      rows.push({ vp: `${w}x${h}`, lang, p: +m.p.toFixed(2), fs: Math.round(m.fs), issues: [...new Set(issues)] });
      if (p === 0.9) await page.screenshot({ path: path.join(OUT, `shift-${w}x${h}-${lang}.png`) });
    }
    await page.close();
  }
}
await b.close();
const bad = rows.filter((r) => r.issues.length);
fs.writeFileSync(path.join(OUT, "shift.json"), JSON.stringify(rows, null, 2));
for (const r of bad) console.log(`${r.vp} ${r.lang} p=${r.p} fs=${r.fs}: ${r.issues.join("; ")}`);
console.log(`${rows.length} states, ${bad.length} with issues`);
