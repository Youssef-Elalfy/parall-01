/**
 * Material exploration QA: every sample focuses its real 3D component.
 *   node scripts/qa-materials.mjs [--tag materials] [--vp 1440x900,390x844] [--langs en,ar]
 * Per sample: camera settles, the component's projected point (from the rig) is on screen and
 * clear of the text block, pressed state + detail panel, emphasis in the live materials.
 * Then: Back button, Escape, and scrolling away all return to the scroll-driven pose.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { enterSite } from "./qa-enter.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const OUT = path.join("qa", "cinematic", arg("tag", "materials"));
fs.mkdirSync(OUT, { recursive: true });
const VPS = arg("vp", "1440x900,390x844").split(",").map((v) => v.split("x").map(Number));
const LANGS = arg("langs", "en,ar").split(",");
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const PART = { titanium: "frame", composite: "tip", glass: "lensHud", light: "led" };
const results = [];
const rec = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`);
};

const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"] });
for (const [w, h] of VPS) {
  for (const lang of LANGS) {
    const page = await b.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`http://localhost:3000/${lang}`);
    await enterSite(page);
    await page.waitForTimeout(2600);
    const toHinge = () =>
      page.evaluate(() => {
        const m = document.querySelector('[data-shot="materials-hinge"]');
        window.__parallScrollTo(m.getBoundingClientRect().top + scrollY - innerHeight / 2);
      });
    await toHinge();
    await page.waitForTimeout(2600);
    const base = await page.evaluate(() => window.__parallTarget);
    const tag = `${w}x${h} ${lang}`;
    for (const id of Object.keys(PART)) {
      const i = Object.keys(PART).indexOf(id);
      await page.locator(".swatch-btn").nth(i).click();
      await page.waitForTimeout(2400);
      const r = await page.evaluate(
        ({ key }) => {
          const pin = document.querySelector(".focus-pin");
          const cs = getComputedStyle(pin);
          const x = parseFloat(cs.getPropertyValue("--ax"));
          const y = parseFloat(cs.getPropertyValue("--ay"));
          const text = document.querySelector(".mat-block--finish").getBoundingClientRect();
          const pressed = [...document.querySelectorAll(".swatch-btn")].map((b) => b.getAttribute("aria-pressed"));
          const detail = document.querySelector(".mat-focus__detail")?.textContent ?? "";
          const m = window.__parallMats;
          return {
            key,
            pin: [Math.round(x), Math.round(y)],
            onScreen: x > 8 && x < innerWidth - 8 && y > 70 && y < innerHeight - 8,
            clearOfText: !(x > text.left - 10 && x < text.right + 10 && y > text.top - 10 && y < text.bottom + 10),
            pressed,
            hasDetail: detail.length > 20,
            frameLum: +(m.frame.color.r + m.frame.color.g + m.frame.color.b).toFixed(3),
            edge: +m.lensEdge.emissiveIntensity.toFixed(2),
          };
        },
        { key: PART[id] },
      );
      const pressedOk = r.pressed[i] === "true" && r.pressed.filter((p) => p === "true").length === 1;
      rec(`${tag}: ${id} → ${PART[id]} framed, clear of text, detail shown`, r.onScreen && r.clearOfText && pressedOk && r.hasDetail, r);
      await page.screenshot({ path: path.join(OUT, `${w}x${h}-${lang}-${id}.png`) });
    }
    // back button
    await page.locator(".mat-focus__back").click();
    await page.waitForTimeout(2600);
    let t = await page.evaluate(() => window.__parallTarget);
    const d = (a, c) => Math.max(...a.pos.map((v, k) => Math.abs(v - c.pos[k])), Math.abs(a.scale - c.scale));
    rec(`${tag}: Back returns to the scroll pose`, d(base, t) < 0.001, { delta: +d(base, t).toFixed(4) });
    // escape
    await page.locator(".swatch-btn").nth(2).click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2600);
    t = await page.evaluate(() => window.__parallTarget);
    const esc = await page.evaluate(() => document.querySelectorAll('.swatch-btn[aria-pressed="true"]').length);
    rec(`${tag}: Escape releases focus`, esc === 0 && d(base, t) < 0.001, { pressed: esc, delta: +d(base, t).toFixed(4) });
    // keyboard select + scroll release
    await page.locator(".swatch-btn").nth(0).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    const kb = await page.evaluate(() => document.querySelector(".swatch-btn").getAttribute("aria-pressed"));
    await page.mouse.move(w / 2, h / 2);
    for (let k = 0; k < 6; k++) {
      await page.mouse.wheel(0, 220);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1200);
    const rel = await page.evaluate(() => document.querySelectorAll('.swatch-btn[aria-pressed="true"]').length);
    rec(`${tag}: keyboard selects; scrolling away releases`, kb === "true" && rel === 0, { kb, pressedAfterScroll: rel });
    rec(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 3));
    await page.close();
  }
}
await b.close();
fs.writeFileSync(path.join(OUT, "materials.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
