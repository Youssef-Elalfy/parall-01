/**
 * AR entrance close-up: EN/AR × PARALL/Normal view, same scroll state as the AR QA.
 *   node scripts/qa-entrance.mjs --tag before|after [--vp 1440x900]
 * Crops around the entrance (from the tracking-bracket box) and a full frame per state.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { enterSite } from "./qa-enter.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const TAG = arg("tag", "after");
const [W, H] = arg("vp", "1440x900").split("x").map(Number);
const OUT = path.join("qa", "entrance", TAG);
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"] });
for (const lang of ["en", "ar"]) {
  const page = await b.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://localhost:3000/${lang}`);
  await enterSite(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const el = document.getElementById("experience");
    window.__parallScrollTo(el.getBoundingClientRect().top + scrollY + 0.62 * (el.offsetHeight - innerHeight));
  });
  await page.waitForTimeout(5200);
  for (const view of ["parall", "normal"]) {
    await page.locator(".segmented button").nth(view === "parall" ? 1 : 0).click();
    await page.waitForTimeout(1300);
    const r = await page.evaluate(() => {
      const t = document.querySelector(".ar-view--parall .ar-track--entrance").getBoundingClientRect();
      return { x: t.left, y: t.top, w: t.width, h: t.height };
    });
    const pad = 70;
    const clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(W - Math.max(0, r.x - pad), r.w + pad * 2), height: Math.min(H - Math.max(0, r.y - pad), r.h + pad * 2 + 20) };
    await page.screenshot({ path: path.join(OUT, `${lang}-${view}-crop.png`), clip });
    await page.screenshot({ path: path.join(OUT, `${lang}-${view}-full.png`) });
  }
  if (errors.length) console.log(lang, "console errors:", errors);
  await page.close();
}
await b.close();
console.log("→", OUT);
