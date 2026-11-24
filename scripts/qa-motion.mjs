/**
 * Reversible scroll typography QA.
 *   node scripts/qa-motion.mjs [--tag motion] [--vp 1440x900] [--lang en] [--reduced]
 * For every [data-motion] toggle element: scroll past its start → revealed; back above its
 * start → reversed (hidden); down again → revealed. Then a fast fling to the bottom and back
 * to the top: the hero must be fully visible and no element may be stuck half-way.
 * With --reduced: every element must simply be visible (no motion, nothing hidden).
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { enterSite } from "./qa-enter.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);
const OUT = path.join("qa", "cinematic", arg("tag", "motion"));
fs.mkdirSync(OUT, { recursive: true });
const [W, H] = arg("vp", "1440x900").split("x").map(Number);
const LANG = arg("lang", "en");
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");

const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--use-angle=d3d11"] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, reducedMotion: has("reduced") ? "reduce" : "no-preference" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`http://localhost:3000/${LANG}`);
await enterSite(page);
await page.waitForTimeout(3000);

/** state of element i: 1 = revealed, 0 = hidden, between = mid */
const measure = (i) =>
  page.evaluate((i) => {
    const el = document.querySelectorAll("[data-motion]")[i];
    const kind = el.dataset.motion.split(" ")[0];
    const ty = (n) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(n).transform);
      return m.m42;
    };
    const op = (n) => +getComputedStyle(n).opacity;
    let v = 1;
    if (kind === "rise") {
      const n = el.querySelector(".split__inner");
      v = 1 - Math.min(1, Math.abs(ty(n)) / n.offsetHeight);
    } else if (kind === "chars") v = op(el.querySelector(".c") ?? el.querySelector(".w"));
    else if (kind === "words") v = op(el.querySelector(".w"));
    else if (kind === "track") v = Math.min(1, op(el) / 0.78); // eyebrows are designed at 0.78
    else if (kind === "stagger") v = op(el.firstElementChild);
    return { kind, v: +v.toFixed(2) };
  }, i);
const info = await page.evaluate(() =>
  [...document.querySelectorAll("[data-motion]")].map((el) => {
    const kind = el.dataset.motion.split(" ")[0];
    const scene = el.closest(".sticky-scene .stage") || el.dataset.motionTrigger === "scene" ? el.closest("[data-scene]") : null;
    const trig = scene ?? el;
    const top = trig.getBoundingClientRect().top + scrollY;
    const startPct = parseFloat((el.dataset.motionStart ?? (scene ? "top 62%" : "top 86%")).split(" ")[1]) / 100;
    return { kind, id: (el.closest("[data-scene]")?.id || el.closest("[data-scene]")?.className.split(" ")[1]) + ":" + (el.className || el.tagName).toString().split(" ")[0], start: top - innerHeight * startPct };
  }),
);
const to = async (y, wait = 1700) => {
  await page.evaluate((y) => window.__parallScrollTo(Math.max(0, y)), y);
  await page.waitForTimeout(wait);
};
const rows = [];
for (let i = 0; i < info.length; i++) {
  const it = info[i];
  if (!["rise", "chars", "words", "track", "stagger"].includes(it.kind)) continue;
  if (has("reduced")) {
    await to(it.start + H * 0.5, 400);
    const m = await measure(i);
    rows.push({ ...it, reduced: m.v, pass: m.v > 0.98 });
    continue;
  }
  await to(it.start + H * 0.25);
  const down = await measure(i);
  await to(it.start - H * 0.4);
  const up = await measure(i);
  await to(it.start + H * 0.25);
  const again = await measure(i);
  const pass = down.v > 0.98 && up.v < 0.05 && again.v > 0.98;
  rows.push({ ...it, down: down.v, up: up.v, again: again.v, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${it.id} [${it.kind}] down ${down.v} → up ${up.v} → down ${again.v}`);
}
// fling to the bottom and back to the hero
await page.mouse.move(W / 2, H / 2);
const end = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < end; y += 900) {
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(10);
}
await page.waitForTimeout(800);
for (let y = 0; y < end + 2000; y += 1200) {
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(10);
}
await page.waitForTimeout(3000);
const hero = await page.evaluate(() => ({
  y: scrollY,
  inner: +getComputedStyle(document.querySelector(".hero__inner")).opacity,
  title: getComputedStyle(document.querySelector(".hero__title .split__inner")).transform,
}));
const heroOk = hero.y < 2 && hero.inner > 0.98 && (hero.title === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(hero.title));
console.log(`${heroOk ? "PASS" : "FAIL"}  fling down/up → hero restored ${JSON.stringify(hero)}`);
await page.screenshot({ path: path.join(OUT, `${W}x${H}-${LANG}${has("reduced") ? "-reduced" : ""}-after-fling.png`) });
const failed = rows.filter((r) => !r.pass).length + (heroOk ? 0 : 1);
fs.writeFileSync(path.join(OUT, `motion-${W}x${H}-${LANG}${has("reduced") ? "-reduced" : ""}.json`), JSON.stringify({ rows, hero, heroOk, errors }, null, 1));
console.log(`\n${rows.length + 1} checks, ${failed} failed, console errors: ${errors.length}`);
await b.close();
process.exit(failed ? 1 : 0);
