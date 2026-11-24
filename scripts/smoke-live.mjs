/**
 * Live smoke test against a deployed URL (no dev hooks; the page is driven like a visitor).
 *   node scripts/smoke-live.mjs --base https://parall-01.vercel.app
 * Web Audio is observed from outside the app: AudioContext state and every
 * AudioBufferSourceNode.start() (with the buffer duration) are recorded by an init script.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://parall-01.vercel.app");
const OUT = path.join("qa", "live");
fs.mkdirSync(OUT, { recursive: true });
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");
const results = [];
const rec = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${JSON.stringify(detail)}`);
};
const b = await chromium.launch({ executablePath: exe, args: ["--ignore-gpu-blocklist", "--use-angle=d3d11", "--autoplay-policy=user-gesture-required"] });

async function session(lang, w, h, mobile = false) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  await page.addInitScript(() => {
    const w = window;
    w.__audio = { contexts: [], starts: [] };
    const AC = w.AudioContext;
    w.AudioContext = class extends AC {
      constructor(...a) {
        super(...a);
        w.__audio.contexts.push(this);
      }
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      w.__audio.starts.push({ dur: this.buffer ? +this.buffer.duration.toFixed(2) : null, loop: this.loop });
      return start.apply(this, a);
    };
  });
  const t0 = Date.now();
  await page.goto(`${BASE}/${lang}`);
  await page.locator(".enter-btn").waitFor({ timeout: 90000 });
  return { ctx, page, errors, failed, readyMs: Date.now() - t0 };
}
const scrollTo = (page, sel, p) =>
  page.evaluate(
    ({ sel, p }) => {
      const el = document.querySelector(sel);
      window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + p * Math.max(0, el.offsetHeight - innerHeight), behavior: "instant" });
    },
    { sel, p },
  );

// ---- desktop EN, with sound ----
{
  const { ctx, page, errors, failed, readyMs } = await session("en", 1440, 900);
  rec("EN: prologue reaches Enter screen", true, { readyMs });
  await page.locator(".enter-btn").click();
  await page.waitForFunction(() => !document.querySelector(".loader"), null, { timeout: 30000 });
  await page.waitForTimeout(5000);
  const audio = await page.evaluate(() => ({
    contexts: window.__audio.contexts.length,
    state: window.__audio.contexts[0]?.state,
    starts: window.__audio.starts.filter((s) => s.dur && s.dur > 5),
    pressed: document.querySelector(".nav__sound")?.getAttribute("aria-pressed"),
  }));
  const loop = audio.starts.find((s) => s.loop && s.dur > 90);
  const swell = audio.starts.find((s) => !s.loop && s.dur > 8 && s.dur < 10);
  rec("EN: Enter starts the soundtrack (1 context, swell + 96 s loop)", audio.contexts === 1 && audio.state === "running" && !!loop && !!swell && audio.pressed === "true", audio);
  await page.screenshot({ path: path.join(OUT, "en-hero.png") });
  // sound toggle
  await page.locator(".nav__sound").click();
  await page.waitForTimeout(1200);
  const off = await page.evaluate(() => ({ state: window.__audio.contexts[0]?.state, pressed: document.querySelector(".nav__sound").getAttribute("aria-pressed") }));
  await page.locator(".nav__sound").click();
  await page.waitForTimeout(1200);
  const on = await page.evaluate(() => ({ state: window.__audio.contexts[0]?.state, contexts: window.__audio.contexts.length, newStarts: window.__audio.starts.length }));
  rec("EN: sound toggle mutes (suspends) and resumes without a new context", off.state === "suspended" && off.pressed === "false" && on.state === "running" && on.contexts === 1, { off, on });
  // GSAP scroll states
  await scrollTo(page, "#vision", 0.5);
  await page.waitForTimeout(3500);
  const reveal = await page.evaluate(() => ({ step: document.getElementById("vision").dataset.step, labels: [...document.querySelectorAll(".callout")].filter((c) => +getComputedStyle(c).opacity > 0.9).length }));
  rec("EN: exploded view reached, callouts visible", reveal.step === "1" && reveal.labels >= 3, reveal);
  await page.screenshot({ path: path.join(OUT, "en-exploded.png") });
  // AR
  await scrollTo(page, "#experience", 0.62);
  await page.waitForTimeout(6000);
  await page.locator(".segmented button").first().click();
  await page.waitForTimeout(1100);
  const v0 = await page.locator(".ar__controls input[type=range]").inputValue();
  await page.locator(".segmented button").nth(1).click();
  await page.waitForTimeout(1100);
  const v1 = await page.locator(".ar__controls input[type=range]").inputValue();
  const cards = await page.evaluate(() => [...document.querySelectorAll(".ar-view--parall .ar-fo--wide .ar-card-wrap")].map((c) => +getComputedStyle(c).opacity));
  rec("EN: AR compare + spatial layer revealed", v0 === "0" && v1 === "100" && cards.every((o) => o > 0.99), { v0, v1, cards });
  await page.screenshot({ path: path.join(OUT, "en-ar.png") });
  // materials
  await page.evaluate(() => {
    const m = document.querySelector('[data-shot="materials-hinge"]');
    window.scrollTo({ top: m.getBoundingClientRect().top + scrollY - innerHeight / 2, behavior: "instant" });
  });
  await page.waitForTimeout(3500);
  await page.locator(".swatch-btn").nth(2).click();
  await page.waitForTimeout(2600);
  const mat = await page.evaluate(() => ({ pressed: document.querySelectorAll('.swatch-btn[aria-pressed="true"]').length, detail: !!document.querySelector(".mat-focus__detail"), pin: document.querySelector(".focus-pin")?.classList.contains("is-on") }));
  rec("EN: material sample focuses (glass)", mat.pressed === 1 && mat.detail && mat.pin, mat);
  await page.screenshot({ path: path.join(OUT, "en-material.png") });
  await page.locator(".mat-focus__back").click();
  // configurator
  await page.evaluate(() => document.getElementById("customize").scrollIntoView());
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: /^Frost/ }).click();
  await page.getByRole("button", { name: /^Ember/ }).click();
  await page.waitForTimeout(1200);
  const summary = await page.locator(".config__summary strong").textContent();
  rec("EN: configurator updates selection", /Frost/.test(summary) && /Ember/.test(summary), { summary });
  await page.screenshot({ path: path.join(OUT, "en-config.png") });
  // back to the top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(2500);
  rec("EN: no console errors / failed requests", errors.length === 0 && failed.length === 0, { errors: errors.slice(0, 4), failed: failed.slice(0, 4) });
  await ctx.close();
}
// ---- Arabic, silent entry ----
{
  const { ctx, page, errors, failed } = await session("ar", 1440, 900);
  const dir = await page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));
  await page.locator(".loader__silent").click();
  await page.waitForFunction(() => !document.querySelector(".loader"), null, { timeout: 30000 });
  await page.waitForTimeout(5000);
  const audio = await page.evaluate(() => ({ contexts: window.__audio.contexts.length }));
  rec("AR: RTL page, silent entry creates no audio", dir.lang === "ar" && dir.dir === "rtl" && audio.contexts === 0, { ...dir, ...audio });
  await page.screenshot({ path: path.join(OUT, "ar-hero.png") });
  rec("AR: no console errors / failed requests", errors.length === 0 && failed.length === 0, { errors: errors.slice(0, 4), failed: failed.slice(0, 4) });
  await ctx.close();
}
// ---- mobile ----
{
  const { ctx, page, errors, failed } = await session("en", 390, 844, true);
  await page.locator(".loader__silent").click();
  await page.waitForFunction(() => !document.querySelector(".loader"), null, { timeout: 30000 });
  await page.waitForTimeout(5000);
  const m = await page.evaluate(() => ({ overflowX: document.documentElement.scrollWidth > innerWidth, menu: getComputedStyle(document.querySelector(".nav__menu")).display }));
  await page.locator(".nav__menu").click();
  await page.waitForTimeout(800);
  const links = await page.evaluate(() => document.querySelectorAll(".nav--open .nav__links a").length);
  await page.screenshot({ path: path.join(OUT, "mobile-menu.png") });
  await page.keyboard.press("Escape");
  rec("Mobile: no horizontal overflow, menu opens with 5 links", !m.overflowX && m.menu !== "none" && links === 5, { ...m, links });
  await page.screenshot({ path: path.join(OUT, "mobile-hero.png") });
  rec("Mobile: no console errors / failed requests", errors.length === 0 && failed.length === 0, { errors: errors.slice(0, 4), failed: failed.slice(0, 4) });
  await ctx.close();
}
await b.close();
fs.writeFileSync(path.join(OUT, "smoke.json"), JSON.stringify({ base: BASE, results }, null, 1));
const failedN = results.filter((r) => !r.pass).length;
console.log(`\n${results.length} checks, ${failedN} failed`);
process.exit(failedN ? 1 : 0);
