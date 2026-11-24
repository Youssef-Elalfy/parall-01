/**
 * Showcase captures of the finished site (production build, real browser, WebGL on).
 *   node scripts/showcase-capture.mjs [--base http://localhost:3100]
 * Writes PNGs to qa/showcase/raw (converted to WebP for docs/media separately).
 * No dev hooks: navigation is the visitor's — the Enter screen, then window scrolling.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3100");
const OUT = path.join("qa", "showcase", "raw");
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11"] });

async function open(lang, w, h, dpr = 1) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 820 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/${lang}`);
  await page.locator(".enter-btn").waitFor({ timeout: 90000 });
  return { ctx, page, errors };
}
const enter = async (page) => {
  await page.locator(".loader__silent").click();
  await page.waitForFunction(() => !document.querySelector(".loader"), null, { timeout: 30000 });
  await page.mouse.move(-10, -10); // keep any pointer reticle out of frame
};
/** scroll so a shot marker (or section progress) is centred, then let the film settle */
async function goShot(page, shot, settle = 3600) {
  await page.evaluate((shot) => {
    let y;
    if (shot.includes("@")) {
      const [sel, p] = shot.split("@");
      const el = document.querySelector(sel);
      y = el.getBoundingClientRect().top + scrollY + Number(p) * (el.offsetHeight - innerHeight);
    } else {
      const m = document.querySelector(`[data-shot="${shot}"]`);
      y = m.getBoundingClientRect().top + scrollY - innerHeight / 2;
    }
    window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
  }, shot);
  await page.waitForTimeout(settle);
}
const snap = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

// ---------- desktop EN ----------
{
  const { ctx, page, errors } = await open("en", 1920, 1080);
  await page.waitForTimeout(2600);
  await snap(page, "enter");
  await enter(page);
  await page.waitForTimeout(6000);
  await snap(page, "hero");
  await goShot(page, "reveal-explode", 4200);
  await snap(page, "exploded-view");
  await goShot(page, "intel-a", 4000);
  await snap(page, "intelligence");
  await goShot(page, "#experience@0.62", 7000);
  await snap(page, "ar-experience");
  await goShot(page, ".shift@0.3", 1200); // arrive like a scroll does (theme switches in order)
  await goShot(page, ".shift@0.93", 2500);
  await snap(page, "vision");
  await goShot(page, "materials-hinge", 4000);
  await snap(page, "materials");
  await page.locator(".swatch-btn").nth(0).click();
  await page.waitForTimeout(3200);
  await snap(page, "materials-focus");
  await page.locator(".mat-focus__back").click();
  await goShot(page, "config", 3600);
  await page.getByRole("button", { name: /^Onyx/ }).click();
  await page.getByRole("button", { name: /^Ocean/ }).click();
  await page.waitForTimeout(2200);
  await snap(page, "configurator");
  await goShot(page, "finale", 5000);
  await snap(page, "finale");
  console.log("desktop en errors:", errors.length ? errors : "none");
  await ctx.close();
}
// ---------- desktop AR ----------
{
  const { ctx, page, errors } = await open("ar", 1920, 1080);
  await enter(page);
  await page.waitForTimeout(6000);
  await snap(page, "arabic-hero");
  await goShot(page, "reveal-explode", 4200);
  await snap(page, "arabic-exploded");
  await goShot(page, "#experience@0.62", 7000);
  await snap(page, "arabic-ar");
  console.log("desktop ar errors:", errors.length ? errors : "none");
  await ctx.close();
}
// ---------- mobile ----------
for (const lang of ["en", "ar"]) {
  const { ctx, page, errors } = await open(lang, 390, 844, 2);
  await enter(page);
  await page.waitForTimeout(6000);
  await snap(page, `mobile-${lang}-hero`);
  await goShot(page, "reveal-explode", 4200);
  await snap(page, `mobile-${lang}-exploded`);
  await goShot(page, "#experience@0.62", 7000);
  await snap(page, `mobile-${lang}-ar`);
  await goShot(page, "config", 3600);
  await snap(page, `mobile-${lang}-configurator`);
  console.log(`mobile ${lang} errors:`, errors.length ? errors : "none");
  await ctx.close();
}
await b.close();
console.log("→", OUT);
