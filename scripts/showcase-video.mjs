/**
 * Records a real visitor journey through the production site (Playwright video).
 *   node scripts/showcase-video.mjs [--base http://localhost:3100]
 * Enter screen → Enter → hero → wheel scroll through the exploded view → AR compare drag →
 * material sample focus → configurator finishes → finale. Output: qa/showcase/video/*.webm
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3100");
const OUT = path.join("qa", "showcase", "video");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const t0 = Date.now();
const marks = [];
const mark = (name) => marks.push([name, ((Date.now() - t0) / 1000).toFixed(1)]);

await page.goto(`${BASE}/en`);
await page.locator(".enter-btn").waitFor({ timeout: 90000 });
mark("enter-screen");
await page.waitForTimeout(2200);
await page.mouse.move(640, 600, { steps: 12 });
await page.hover(".enter-btn");
await page.waitForTimeout(900);
await page.locator(".loader__silent").click();
mark("enter");
await page.mouse.move(1279, 719);
await page.waitForTimeout(5200);

/** smooth wheel travel to a target scrollY */
async function travel(target, step = 70, pause = 22) {
  for (let i = 0; i < 400; i++) {
    const y = await page.evaluate(() => scrollY);
    if (Math.abs(target - y) < step) break;
    await page.mouse.wheel(0, Math.sign(target - y) * step);
    await page.waitForTimeout(pause);
  }
}
const yOf = (sel, p) =>
  page.evaluate(
    ({ sel, p }) => {
      const el = document.querySelector(sel);
      return el.getBoundingClientRect().top + scrollY + p * Math.max(0, el.offsetHeight - innerHeight);
    },
    { sel, p },
  );
await page.mouse.move(640, 360);
mark("reveal");
await travel(await yOf("#vision", 0.5));
await page.waitForTimeout(2200);
mark("intelligence");
await travel(await yOf("#technology", 0.2));
await page.waitForTimeout(1600);
mark("ar");
await travel(await yOf("#experience", 0.62), 90);
await page.waitForTimeout(4200);
// drag the compare divider
const h = await page.locator(".ar-handle").boundingBox();
await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2, { steps: 8 });
await page.mouse.down();
for (const x of [520, 360, 300, 700, 1000, 860]) await page.mouse.move(x, h.y + h.height / 2, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(800);
mark("vision");
await travel(await yOf(".shift", 0.95), 110);
await page.waitForTimeout(1200);
mark("materials");
await travel(await yOf("#design", 0.5), 90);
await page.waitForTimeout(2000);
await page.locator(".swatch-btn").nth(0).click();
await page.waitForTimeout(2600);
await page.locator(".swatch-btn").nth(2).click();
await page.waitForTimeout(2600);
await page.locator(".mat-focus__back").click();
await page.waitForTimeout(1600);
mark("configurator");
await travel(await yOf("#customize", 0), 110);
await page.waitForTimeout(1800);
await page.getByRole("button", { name: /^Onyx/ }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /^Ember/ }).click();
await page.waitForTimeout(1200);
const st = await page.locator(".config__stage").boundingBox();
await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
await page.mouse.down();
await page.mouse.move(st.x + st.width / 2 + 220, st.y + st.height / 2 + 20, { steps: 30 });
await page.mouse.move(st.x + st.width / 2 - 120, st.y + st.height / 2, { steps: 30 });
await page.mouse.up();
await page.waitForTimeout(1600);
mark("finale");
await travel(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight - 260), 110);
await page.waitForTimeout(3500);
mark("end");
const video = page.video();
await ctx.close();
await b.close();
const src = await video.path();
fs.renameSync(src, path.join(OUT, "journey.webm"));
fs.writeFileSync(path.join(OUT, "marks.json"), JSON.stringify(marks, null, 1));
console.log(marks.map((m) => m.join(" @ ")).join("\n"));
