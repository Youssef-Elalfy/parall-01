/**
 * PARALL / 01 — functional QA (real Chromium, dev server, dev-only probes).
 *
 *   node scripts/qa-interactions.mjs [--base http://localhost:3000] [--tag after]
 *
 * Checks: hero pose determinism across navigation flows, nav underline timing
 * + active section, sound engine output, configurator → live materials,
 * AR compare (keyboard + buttons), locale toggle (lang/dir), mobile menu.
 * Writes qa/visual-repair/<tag>/interactions.json and prints a table.
 */
import { chromium } from "playwright";
import { enterSite } from "./qa-enter.mjs";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3000");
const TAG = arg("tag", "after");
const OUT = path.join("qa", "visual-repair", TAG);
fs.mkdirSync(OUT, { recursive: true });
const EXE =
  process.env.QA_CHROME ??
  path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  process.stdout.write(`${pass ? "PASS" : "FAIL"}  ${name}  ${typeof detail === "string" ? detail : JSON.stringify(detail)}\n`);
};

async function ready(page) {
  await enterSite(page);
  await page.waitForTimeout(3200); // intro (2.6 s) + damping
}
const target = (page) => page.evaluate(() => window.__parallTarget);
const pose = (page) => page.evaluate(() => ({ ...window.__parallPose, marks: undefined }));
const scrollTo = (page, y) => page.evaluate((y) => window.__parallScrollTo(y), y);
const diff = (a, b) =>
  Math.max(...a.pos.map((v, i) => Math.abs(v - b.pos[i])), ...a.rot.map((v, i) => Math.abs(v - b.rot[i])), Math.abs(a.scale - b.scale));
/** settled pose = damped pose compared without the idle float (float only moves y / rot x,y by ≤ 0.05) */
async function settle(page) {
  await page.waitForTimeout(2600);
}

async function poseFlows(browser, w, h, lang) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${lang}`, { waitUntil: "domcontentloaded" });
  await ready(page);
  const fresh = await target(page);
  const freshPose = await pose(page);
  const tag = `${w}x${h} ${lang}`;
  const end = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

  // 1. wheel to the end and back, 3 cycles
  await page.mouse.move(w / 2, h / 2);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < end + 400; y += 300) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(800);
    for (let y = 0; y < end + 2400; y += 600) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(12);
    }
  }
  await settle(page);
  let t = await target(page);
  let p = await pose(page);
  record(`${tag}: hero target after 3 wheel cycles`, diff(fresh, t) < 0.001, `Δtarget ${diff(fresh, t).toFixed(4)}, Δpose ${diff(freshPose, p).toFixed(3)}, scrollY ${p.scrollY}`);
  await page.screenshot({ path: path.join(OUT, `flow-${w}x${h}-${lang}-after-3-cycles.png`) });

  // 2. jump deep (immediate) then back to 0
  await scrollTo(page, end * 0.7);
  await page.waitForTimeout(600);
  await scrollTo(page, 0);
  await settle(page);
  t = await target(page);
  record(`${tag}: hero target after jump deep → top`, diff(fresh, t) < 0.001, `Δ ${diff(fresh, t).toFixed(4)}`);

  // 3. nav link → section, brand → top
  await page.click('.nav__links a[href="#design"]').catch(() => undefined);
  await page.waitForTimeout(2200);
  await page.click(".nav__brand").catch(() => undefined);
  await page.waitForTimeout(2200);
  await settle(page);
  t = await target(page);
  p = await pose(page);
  record(`${tag}: hero target after nav → design → brand`, diff(fresh, t) < 0.001 && p.scrollY < 2, `Δ ${diff(fresh, t).toFixed(4)}, scrollY ${p.scrollY}`);

  // 4. resize mid-page, return to top
  await scrollTo(page, end * 0.45);
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: Math.round(w * 0.8), height: h });
  await page.waitForTimeout(800);
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(800);
  await scrollTo(page, 0);
  await settle(page);
  t = await target(page);
  record(`${tag}: hero target after mid-page resize → top`, diff(fresh, t) < 0.001, `Δ ${diff(fresh, t).toFixed(4)}`);

  // 5. locale switch mid-page, back to top (compare against the other locale's fresh hero)
  await scrollTo(page, end * 0.3);
  await page.waitForTimeout(500);
  await page.click(".nav__lang");
  await page.waitForTimeout(1200);
  await scrollTo(page, 0);
  await settle(page);
  const otherLang = await page.evaluate(() => document.documentElement.lang);
  const tOther = await target(page);
  await page.click(".nav__lang");
  await page.waitForTimeout(1200);
  await settle(page);
  t = await target(page);
  record(`${tag}: hero target after locale round-trip mid-page`, diff(fresh, t) < 0.001, `Δ ${diff(fresh, t).toFixed(4)} (via ${otherLang}, mirrored x ${tOther.pos[0].toFixed(3)} vs ${fresh.pos[0].toFixed(3)})`);

  // 6. reload mid-page then scroll to top
  await scrollTo(page, end * 0.55);
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await scrollTo(page, 0);
  await settle(page);
  t = await target(page);
  record(`${tag}: hero target after reload mid-page → top`, diff(fresh, t) < 0.001, `Δ ${diff(fresh, t).toFixed(4)}`);

  // 7. hash deep link load → top (via about:blank so it is a real page load, not a hash change)
  await page.goto("about:blank");
  await page.goto(`${BASE}/${lang}#technology`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await scrollTo(page, 0);
  await settle(page);
  t = await target(page);
  p = await pose(page);
  record(`${tag}: hero target after #technology load → top`, diff(fresh, t) < 0.001, `Δ ${diff(fresh, t).toFixed(4)}, Δpose ${diff(freshPose, p).toFixed(3)}`);
  await page.screenshot({ path: path.join(OUT, `flow-${w}x${h}-${lang}-hero-after-flows.png`) });
  await ctx.close();
}

async function navAndControls(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/en`, { waitUntil: "domcontentloaded" });
  await ready(page);

  // --- nav underline: sample the painted width after hover
  const link = page.locator('.nav__links a[href="#experience"]');
  const box = await link.boundingBox();
  const before = await link.evaluate((a) => a.getBoundingClientRect().width);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const samples = [];
  for (const ms of [0, 60, 120, 240]) {
    if (ms) await page.waitForTimeout(ms - (samples.at(-1)?.ms ?? 0));
    samples.push({
      ms,
      size: await page.evaluate(() => getComputedStyle(document.querySelector('.nav__links a[href="#experience"] .nav__label')).backgroundSize),
      opacity: await link.evaluate((a) => getComputedStyle(a).opacity),
    });
  }
  const after = await link.evaluate((a) => a.getBoundingClientRect().width);
  const full = samples.at(-1).size.startsWith("100%");
  record("nav underline reaches full width ≤ 240 ms, no layout shift", full && before === after, { samples, widthBefore: before, widthAfter: after });
  await page.screenshot({ path: path.join(OUT, "nav-hover.png"), clip: { x: 0, y: 0, width: 1440, height: 90 } });

  // keyboard focus shows the same underline
  await page.mouse.move(5, 500);
  await page.keyboard.press("Tab");
  let guard = 0;
  while (guard++ < 12 && !(await page.evaluate(() => document.activeElement?.matches(".nav__links a")))) await page.keyboard.press("Tab");
  await page.waitForTimeout(260);
  const focusSize = await page.evaluate(() => getComputedStyle(document.activeElement.querySelector(".nav__label")).backgroundSize);
  const focusOutline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  record("nav focus-visible: underline + outline", focusSize.startsWith("100%") && focusOutline !== "none", { focusSize, focusOutline });

  // active section
  await page.evaluate(() => {
    const el = document.getElementById("technology");
    window.__parallScrollTo(el.getBoundingClientRect().top + scrollY + innerHeight * 0.6);
  });
  await page.waitForTimeout(900);
  const current = await page.evaluate(() => document.querySelector(".nav__links a[aria-current]")?.getAttribute("href"));
  record("nav active section (aria-current)", current === "#technology", { current });
  await page.screenshot({ path: path.join(OUT, "nav-active.png"), clip: { x: 0, y: 0, width: 1440, height: 90 } });

  // --- sound
  const beforeState = await page.evaluate(() => window.__parallSound?.state());
  await page.click(".nav__sound");
  // the soundtrack opens with a swell and a 3.2 s fade-in: measure once it has bloomed
  await page.waitForTimeout(4500);
  const levels = [];
  for (let i = 0; i < 5; i++) {
    levels.push(await page.evaluate(() => window.__parallSound.measureLevel()));
    await page.waitForTimeout(120);
  }
  const s1 = await page.evaluate(() => ({
    state: window.__parallSound.state(),
    on: window.__parallSound.isSoundOn(),
    pressed: document.querySelector(".nav__sound").getAttribute("aria-pressed"),
    label: document.querySelector(".nav__sound").getAttribute("aria-label"),
  }));
  const peak = Math.max(...levels);
  record("sound on: context running, audible output", beforeState === "none" && s1.state === "running" && s1.on && s1.pressed === "true" && peak > 0.02, { beforeState, ...s1, peak: +peak.toFixed(3) });
  await page.click(".nav__sound");
  await page.waitForTimeout(900);
  const s2 = await page.evaluate(() => ({
    state: window.__parallSound.state(),
    on: window.__parallSound.isSoundOn(),
    level: window.__parallSound.measureLevel(),
    pressed: document.querySelector(".nav__sound").getAttribute("aria-pressed"),
  }));
  record("sound off: silent + suspended", !s2.on && s2.pressed === "false" && s2.level < 0.005, s2);

  // --- configurator → live materials
  await page.evaluate(() => document.getElementById("customize").scrollIntoView());
  await page.evaluate(() => window.__parallScrollTo(document.getElementById("customize").getBoundingClientRect().top + scrollY));
  await page.waitForTimeout(1200);
  const matBefore = await page.evaluate(() => window.__parallMats?.frame.color.getHexString());
  await page.getByRole("button", { name: /Onyx/ }).click();
  await page.getByRole("button", { name: /Ocean/ }).click();
  await page.waitForTimeout(900);
  const cfg = await page.evaluate(() => ({
    frame: window.__parallMats?.frame.color.getHexString(),
    summary: document.querySelector(".config__summary strong")?.textContent,
    onyx: document.querySelector(".option.is-selected")?.textContent,
  }));
  record("configurator: Onyx + Ocean update live materials + summary", cfg.frame !== matBefore && /Onyx/.test(cfg.summary ?? "") && /Ocean/.test(cfg.summary ?? ""), { matBefore, ...cfg });
  await page.screenshot({ path: path.join(OUT, "config-onyx-ocean.png") });
  await page.getByRole("button", { name: /Reset/ }).click();
  await page.waitForTimeout(400);
  const reset = await page.evaluate(() => document.querySelector(".config__summary strong")?.textContent);
  record("configurator: reset", /Titanium/.test(reset ?? "") && /Clear/.test(reset ?? ""), { reset });

  // --- AR compare: keyboard on the range input + segmented buttons
  await page.evaluate(() => {
    const el = document.getElementById("experience");
    window.__parallScrollTo(el.getBoundingClientRect().top + scrollY + (el.offsetHeight - innerHeight) * 0.62);
  });
  await page.waitForTimeout(1500);
  const range = page.locator(".ar__controls input[type=range]");
  await range.focus();
  const v0 = Number(await range.inputValue());
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  const v1 = Number(await range.inputValue());
  // the buttons tween the compare (0.8 s), so read after it settles
  await page.locator(".segmented button").first().click();
  await page.waitForTimeout(1100);
  const v2 = Number(await range.inputValue());
  await page.locator(".segmented button").nth(1).click();
  await page.waitForTimeout(1100);
  const v3 = Number(await range.inputValue());
  const cssV = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".ar-world")).getPropertyValue("--v")));
  record("AR compare: arrows, Normal/PARALL buttons, CSS --v", v1 === v0 - 2 && v2 === 0 && v3 === 100 && cssV === 100, { v0, v1, v2, v3, cssV });

  // --- locale toggle
  await page.click(".nav__lang");
  await page.waitForTimeout(800);
  const loc = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, path: location.pathname, h1: document.querySelector("h1")?.textContent }));
  record("locale toggle → ar / rtl / URL", loc.lang === "ar" && loc.dir === "rtl" && loc.path.startsWith("/ar"), loc);
  await page.click(".nav__lang");
  await page.waitForTimeout(600);

  record("no console errors (desktop flow)", errors.length === 0, errors.slice(0, 5));
  await ctx.close();
}

async function mobileMenu(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en`, { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.click(".nav__menu");
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => ({
    expanded: document.querySelector(".nav__menu").getAttribute("aria-expanded"),
    links: document.querySelectorAll(".nav--open .nav__links a").length,
    sound: !!document.querySelector(".nav--open .nav__menu-sound") && getComputedStyle(document.querySelector(".nav__menu-sound")).display !== "none",
  }));
  await page.screenshot({ path: path.join(OUT, "mobile-menu.png") });
  await page.click(".nav__menu-sound");
  await page.waitForTimeout(4500);
  const lvl = await page.evaluate(() => ({ on: window.__parallSound.isSoundOn(), peak: window.__parallSound.measureLevel() }));
  await page.click(".nav__menu-sound");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => document.querySelector(".nav__menu").getAttribute("aria-expanded"));
  record("mobile menu: opens, 5 links, sound toggle works, Esc closes", open.expanded === "true" && open.links === 5 && open.sound && lvl.on && lvl.peak > 0.02 && closed === "false", { ...open, ...lvl, closed });
  await ctx.close();
}

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11", "--autoplay-policy=user-gesture-required"],
});
try {
  const only = arg("only", "all");
  if (only === "all" || only === "pose") {
    await poseFlows(browser, 1900, 860, "en");
    await poseFlows(browser, 390, 844, "en");
    await poseFlows(browser, 1440, 900, "ar");
  }
  if (only === "all" || only === "ui") {
    await navAndControls(browser);
    await mobileMenu(browser);
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, "interactions.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length} checks, ${failed} failed → ${OUT}/interactions.json`);
process.exit(failed ? 1 : 0);
