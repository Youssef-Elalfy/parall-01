/**
 * AR compare — interaction responsiveness + animated states (real Chromium, dev server).
 *   node scripts/qa-ar.mjs [--tag after]
 * - divider follows the pointer: position read in the same frame as the move
 * - parallax follow time (pointer move → layer within 5 % of target)
 * - reveal plays on entering, reverses on scrolling back, replays on re-entry
 * - buttons animate the compare; keyboard arrows; touch drag on the divider
 * - hover a card → its object is highlighted
 */
import { chromium } from "playwright";
import { enterSite } from "./qa-enter.mjs";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const OUT = path.join("qa", "refine", arg("tag", "after"));
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const results = [];
const rec = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`);
};

const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"] });

for (const lang of ["en", "ar"]) {
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`http://localhost:3000/${lang}`);
  await enterSite(page);
  const toAr = (p) =>
    page.evaluate((p) => {
      const el = document.getElementById("experience");
      window.__parallScrollTo(el.getBoundingClientRect().top + scrollY + p * (el.offsetHeight - innerHeight));
    }, p);
  const cardOpacity = () => page.evaluate(() => [...document.querySelectorAll(".ar-view--parall .ar-fo--wide .ar-card-wrap")].map((c) => +getComputedStyle(c).opacity));

  // ---- reveal: enter → plays
  await toAr(0.62);
  await page.waitForTimeout(400);
  const early = await cardOpacity();
  await page.waitForTimeout(3600);
  const settled = await cardOpacity();
  const route = await page.evaluate(() => getComputedStyle(document.querySelector(".ar-view--parall .ar-route-core")).strokeDashoffset);
  const status = await page.evaluate(() => +getComputedStyle(document.querySelector(".ar__status-done")).opacity);
  rec(`${lang}: reveal plays on entry (cards, route drawn, status)`, settled.every((o) => o > 0.99) && parseFloat(route) < 0.01 && status > 0.99, { early, settled, route, status });
  await page.screenshot({ path: path.join(OUT, `ar-${lang}-settled.png`) });

  // ---- reverse: back above the iris → spatial layer hidden; re-enter → replays
  await toAr(0.1);
  await page.waitForTimeout(1800);
  const back = await cardOpacity();
  await toAr(0.62);
  await page.waitForTimeout(3400);
  const again = await cardOpacity();
  rec(`${lang}: reverses on scroll back, replays on re-entry`, back.every((o) => o < 0.01) && again.every((o) => o > 0.99), { back, again });

  // ---- divider follows the pointer in the same frame
  const handle = await page.locator(".ar-handle").boundingBox();
  const W = 1440;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  const lags = [];
  for (const x of [300, 520, 900, 1200, 700]) {
    await page.mouse.move(x, handle.y + handle.height / 2);
    // read in the same task as the move: no rAF / no transition allowed
    const line = await page.evaluate(() => {
      const r = document.querySelector(".ar-divider__line").getBoundingClientRect();
      return r.left + r.width / 2;
    });
    lags.push(Math.round(Math.abs(line - x)));
  }
  await page.mouse.up();
  const committed = await page.evaluate(() => +document.querySelector(".ar__controls input[type=range]").value);
  const expectV = Math.round((lang === "ar" ? 1 - 700 / W : 700 / W) * 100);
  rec(`${lang}: divider tracks pointer 1:1 (px error per move)`, lags.every((l) => l <= 2) && Math.abs(committed - expectV) <= 1, { lags, committed, expectV });

  // ---- parallax follow time
  const t = await page.evaluate(async () => {
    const world = document.querySelector(".ar-world");
    const layer = world.querySelector('.ar-view--parall [data-depth="18"]');
    const r = world.getBoundingClientRect();
    const ev = (x) => world.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: r.top + r.height / 2, pointerType: "mouse", bubbles: true }));
    ev(r.left + r.width / 2);
    await new Promise((res) => setTimeout(res, 600));
    const read = () => {
      const m = /translate\(([-\d.]+)/.exec(layer.getAttribute("transform") ?? "");
      return m ? Math.abs(parseFloat(m[1])) : 0;
    };
    const t0 = performance.now();
    ev(r.right - 2); // full deflection → target ≈ 18 px
    const target = 18 * (1 - 4 / r.width);
    let at = null;
    while (performance.now() - t0 < 1500) {
      await new Promise((res) => requestAnimationFrame(res));
      if (read() >= target * 0.95) {
        at = performance.now() - t0;
        break;
      }
    }
    return { reached95ms: at && Math.round(at), offset: +read().toFixed(2), target: +target.toFixed(2) };
  });
  rec(`${lang}: parallax reaches 95 % of pointer target quickly`, t.reached95ms !== null && t.reached95ms < 300, t);

  // ---- buttons animate, keyboard arrows step
  await page.locator(".segmented button").first().click();
  await page.waitForTimeout(250);
  const mid = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".ar-world")).getPropertyValue("--v")));
  await page.waitForTimeout(800);
  const v0 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".ar-world")).getPropertyValue("--v")));
  await page.locator(".segmented button").nth(1).click();
  await page.waitForTimeout(1100);
  const v100 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".ar-world")).getPropertyValue("--v")));
  const pressed = await page.evaluate(() => [...document.querySelectorAll(".segmented button")].map((b) => b.getAttribute("aria-pressed")));
  const range = page.locator(".ar__controls input[type=range]");
  await range.focus();
  // native range inputs mirror in RTL: the "towards normal" key is ArrowRight there
  const towardsNormal = lang === "ar" ? "ArrowRight" : "ArrowLeft";
  await page.keyboard.press(towardsNormal);
  await page.keyboard.press(towardsNormal);
  const vk = await range.inputValue();
  rec(`${lang}: Normal/PARALL buttons tween the compare; arrows step`, mid > 0 && mid < 100 && v0 === 0 && v100 === 100 && pressed[1] === "true" && vk === "98", { mid, v0, v100, pressed, vk });

  // ---- hover a card → object highlighted
  await page.locator(".segmented button").nth(1).click();
  await page.waitForTimeout(1000);
  const card = page.locator(".ar-view--parall .ar-fo--wide .ar-card-wrap[data-link='route']");
  await card.hover();
  await page.waitForTimeout(300);
  const focus = await page.evaluate(() => ({
    focus: document.querySelector(".ar-view--parall .ar-overlay")?.dataset.focus,
    stroke: getComputedStyle(document.querySelector(".ar-view--parall .ar-track--entrance")).stroke,
  }));
  rec(`${lang}: hovering a card highlights its object`, focus.focus === "route" && /255, 255, 255/.test(focus.stroke), focus);
  await page.screenshot({ path: path.join(OUT, `ar-${lang}-hover.png`) });
  rec(`${lang}: no console errors`, errors.length === 0, errors.slice(0, 3));
  await page.close();
}

// ---- touch drag on a phone
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/en");
  await enterSite(page);
  await page.evaluate(() => {
    const el = document.getElementById("experience");
    window.__parallScrollTo(el.getBoundingClientRect().top + scrollY + 0.62 * (el.offsetHeight - innerHeight));
  });
  await page.waitForTimeout(4200);
  const h = await page.locator(".ar-handle").boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const y = h.y + h.height / 2;
  const touch = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", h.x + h.width / 2);
  for (const x of [220, 160, 100]) await touch("touchMove", x);
  await touch("touchEnd", 100);
  await page.waitForTimeout(200);
  const v = await page.locator(".ar__controls input[type=range]").inputValue();
  rec("touch: dragging the divider on a phone", Math.abs(Number(v) - Math.round((100 / 390) * 100)) <= 2, { v, expect: Math.round((100 / 390) * 100) });
  await page.screenshot({ path: path.join(OUT, "ar-touch-390.png") });
  await ctx.close();
}

await b.close();
fs.writeFileSync(path.join(OUT, "ar-interactions.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length} checks, ${failed} failed`);
process.exit(failed ? 1 : 0);
