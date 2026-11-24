/**
 * PARALL / 01 — visual QA matrix (real Chromium, WebGL on).
 *
 *   node scripts/qa-visual.mjs --tag before [--base http://localhost:3000] [--vp 1440x900,390x844] [--langs en,ar] [--shots hero,finale]
 *   node scripts/qa-visual.mjs --tag after --reversal
 *
 * Requires the dev server (uses the dev-only hooks window.__parallScrollTo,
 * window.__parallPose and window.__parallProductRect).
 *
 * Output: qa/visual-repair/<tag>/<vp>-<lang>-<shot>.png + report.json + report.md
 * The report flags: text/text overlaps, text vs 3D-product overlaps, headings
 * under the fixed nav or outside the viewport, horizontal overflow.
 */
import { chromium } from "playwright";
import { enterSite } from "./qa-enter.mjs";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);

const TAG = arg("tag", "run");
const BASE = arg("base", "http://localhost:3000");
const EXE =
  process.env.QA_CHROME ??
  path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const VPS = arg(
  "vp",
  "1920x1080,1900x860,1440x900,1280x800,1024x768,768x1024,430x932,390x844,360x800,320x640",
)
  .split(",")
  .map((s) => s.split("x").map(Number));
const LANGS = arg("langs", "en,ar").split(",");
const SHOT_LIST = arg(
  "shots",
  "hero,reveal-front,reveal-explode,reveal-macro,intel-a,intel-b,ar@0.62,shift@0.45,shift@0.9,materials-side,materials-hinge,materials-front,config,finale",
).split(",");
const OUT = path.join("qa", "visual-repair", TAG);
fs.mkdirSync(OUT, { recursive: true });

/** Resolve a shot to a document scroll position. `name` = marker, `section@p` = sticky progress. */
async function shotY(page, shot) {
  return page.evaluate((shot) => {
    const vh = innerHeight;
    if (shot.includes("@")) {
      const [name, p] = shot.split("@");
      const map = { ar: "#experience", shift: ".shift" };
      const el = document.querySelector(map[name] ?? `#${name}`);
      if (!el) return null;
      const top = el.getBoundingClientRect().top + scrollY;
      return top + Number(p) * (el.offsetHeight - vh);
    }
    const m = document.querySelector(`[data-shot="${shot}"]`);
    if (!m) return null;
    return Math.max(0, m.getBoundingClientRect().top + scrollY - vh / 2);
  }, shot);
}

async function audit(page) {
  return page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const nav = document.querySelector(".nav");
    const navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
    const sel = [
      "h1", "h2", "h3", ".lede", ".hero__copy", ".hero__meta", ".eyebrow", ".btn", ".feature", ".intel__desc",
      ".hud__panel", ".ar-card", ".ar-chip", ".ar__controls", ".ar-label", ".option", ".mat-block",
      ".materials__trio", ".anchor-label__text", ".reveal__macro", ".reveal__parts", ".config__hint",
      ".shift__body", ".finale__ctas", ".footer", ".scroll-cue", ".progress",
    ].join(",");
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return null;
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.2) return null;
      // clipped by an ancestor clip-path (e.g. AR compare half)? keep — overlap still matters visually
      return r;
    };
    const label = (el) =>
      (el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "")) +
      ` "${(el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32)}"`;
    const els = Array.from(document.querySelectorAll(sel))
      .map((el) => ({ el, r: vis(el) }))
      .filter((x) => x.r && !x.el.closest(".loader") && !x.el.closest("[aria-hidden='true'] .sr-only"));
    const inter = (a, b) => {
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return w > 0 && h > 0 ? w * h : 0;
    };
    const issues = [];
    // text vs text
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const A = els[i];
        const B = els[j];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        if (A.el.closest(".nav") && B.el.closest(".nav")) continue;
        const a = inter(A.r, B.r);
        const small = Math.min(A.r.width * A.r.height, B.r.width * B.r.height);
        if (a > 40 && a / small > 0.06) issues.push({ type: "text-overlap", a: label(A.el), b: label(B.el), ratio: +(a / small).toFixed(2) });
      }
    }
    // text vs product
    const pr = window.__parallMeasureProduct ? window.__parallMeasureProduct() : window.__parallProductRect;
    if (pr) {
      const P = { left: Math.max(0, pr.left), top: Math.max(0, pr.top), right: Math.min(vw, pr.right), bottom: Math.min(vh, pr.bottom) };
      for (const { el, r } of els) {
        if (el.closest(".nav") || el.closest(".progress") || el.matches(".hud__panel, .anchor-label__text")) continue;
        const a = inter(r, P);
        const ratio = a / (r.width * r.height);
        if (ratio > 0.18) issues.push({ type: "text-over-product-bbox", a: label(el), ratio: +ratio.toFixed(2) });
      }
    }
    // headings under nav / outside viewport
    for (const { el, r } of els) {
      if (!el.matches("h1,h2,h3,.btn,.ar__controls,.finale__ctas")) continue;
      if (r.top < navBottom - 2 && r.bottom > 0) issues.push({ type: "under-nav", a: label(el), top: Math.round(r.top) });
      if (r.bottom > vh + 2) issues.push({ type: "below-fold", a: label(el), bottom: Math.round(r.bottom) });
      if (r.left < -2 || r.right > vw + 2) issues.push({ type: "off-x", a: label(el) });
    }
    const overflowX = document.documentElement.scrollWidth > vw + 1;
    if (overflowX) issues.push({ type: "h-overflow", a: `${document.documentElement.scrollWidth} > ${vw}` });
    return { issues, product: pr, pose: window.__parallPose ? { rot: window.__parallPose.rot, scale: window.__parallPose.scale, pos: window.__parallPose.pos } : null };
  });
}

async function waitReady(page) {
  await enterSite(page);
  await page.waitForTimeout(2200);
}

async function run() {
  const browser = await chromium.launch({
    executablePath: EXE,
    headless: true,
    args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11"],
  });
  const report = [];
  for (const [w, h] of VPS) {
    for (const lang of LANGS) {
      const mobile = w < 820;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: mobile });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await page.goto(`${BASE}/${lang}`, { waitUntil: "domcontentloaded" });
      await waitReady(page);
      if (has("reversal")) {
        report.push(await reversal(page, w, h, lang));
      } else {
        for (const shot of SHOT_LIST) {
          const y = await shotY(page, shot);
          if (y == null) continue;
          await page.evaluate((y) => window.__parallScrollTo(y), y);
          await page.waitForTimeout(2600);
          const file = `${w}x${h}-${lang}-${shot.replace("@", "_")}.png`;
          await page.screenshot({ path: path.join(OUT, file) });
          const a = await audit(page);
          report.push({ vp: `${w}x${h}`, lang, shot, file, ...a });
          process.stdout.write(`${w}x${h} ${lang} ${shot}: ${a.issues.length} issue(s)\n`);
        }
      }
      if (errors.length) report.push({ vp: `${w}x${h}`, lang, shot: "console", issues: errors.map((e) => ({ type: "console-error", a: e.slice(0, 200) })) });
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  const md = ["| viewport | lang | shot | issues |", "|---|---|---|---|"];
  for (const r of report) {
    const list = (r.issues ?? []).map((i) => `${i.type}: ${i.a}${i.b ? " ↔ " + i.b : ""}${i.ratio ? ` (${i.ratio})` : ""}`).join("<br>");
    md.push(`| ${r.vp} | ${r.lang} | ${r.shot} | ${list || "—"} |`);
  }
  fs.writeFileSync(path.join(OUT, "report.md"), md.join("\n"));
  const total = report.reduce((n, r) => n + (r.issues?.length ?? 0), 0);
  console.log(`\n${report.length} captures, ${total} issue(s) → ${OUT}`);
}

/** Fresh hero → wheel to the end → wheel back to 0, three times. Compares poses. */
async function reversal(page, w, h, lang) {
  const pose = () => page.evaluate(() => ({ ...window.__parallPose, marks: undefined, target: window.__parallTarget }));
  await page.mouse.move(w / 2, h / 2);
  const fresh = await pose();
  await page.screenshot({ path: path.join(OUT, `${w}x${h}-${lang}-hero-fresh.png`) });
  const cycles = [];
  for (let c = 0; c < 3; c++) {
    const end = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < end; y += 260) {
      await page.mouse.wheel(0, 260);
      await page.waitForTimeout(18);
    }
    await page.waitForTimeout(1200);
    for (let y = 0; y < end + 2000; y += 520) {
      await page.mouse.wheel(0, -520);
      await page.waitForTimeout(14);
    }
    await page.waitForTimeout(3200);
    cycles.push(await pose());
  }
  await page.screenshot({ path: path.join(OUT, `${w}x${h}-${lang}-hero-after-3-cycles.png`) });
  const d = (a, b) => Math.max(...a.pos.map((v, i) => Math.abs(v - b.pos[i])), ...a.rot.map((v, i) => Math.abs(v - b.rot[i])), Math.abs(a.scale - b.scale));
  // The rendered pose includes the idle float (±0.05 rad yaw, ±0.02 pitch, ±0.025 y) and is informational;
  // the scroll-derived target pose must be identical.
  const deltas = cycles.map((c) => +d(fresh, c).toFixed(3));
  const tDeltas = cycles.map((c) => +d(fresh.target, c.target).toFixed(4));
  const issues = tDeltas.some((x) => x > 0.001) ? [{ type: "target-drift", a: `target deltas ${tDeltas.join(", ")}` }] : [];
  process.stdout.write(`${w}x${h} ${lang} reversal target Δ: ${tDeltas.join(", ")} · rendered Δ incl. float: ${deltas.join(", ")} (scrollY back: ${cycles.map((c) => c.scrollY).join(", ")})\n`);
  return { vp: `${w}x${h}`, lang, shot: "reversal", fresh, cycles, deltas, tDeltas, issues };
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
