/**
 * Composes the GitHub cover, Open Graph image and mobile showcase from REAL captures
 * (qa/showcase/raw). Layout is HTML/CSS rendered by Chromium; every pixel of product,
 * wordmark and UI comes from screenshots of the running site.
 *   node scripts/showcase-compose.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RAW = path.join("qa", "showcase", "raw");
const OUT = path.join("qa", "showcase", "composed");
fs.mkdirSync(OUT, { recursive: true });
const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(RAW, f)).toString("base64")}`;
/** the site's own vector wordmark (exported from the running page by the capture step) */
const WM = fs.readFileSync(path.join("qa", "showcase", "wordmark.svg"), "utf8");
const exe = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Syne:wght@600;700&display=block');`;
const base = `
${FONTS}
*{box-sizing:border-box;margin:0}
body{background:#0b0e14;color:#f3f1eb;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
.crop{position:absolute;background-repeat:no-repeat}
.soft{mask-image:radial-gradient(closest-side,#000 62%,transparent 100%);-webkit-mask-image:radial-gradient(closest-side,#000 62%,transparent 100%)}
.band{filter:brightness(.92) contrast(1.18);
  mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent),linear-gradient(180deg,transparent,#000 18%,#000 82%,transparent);
  mask-composite:intersect;-webkit-mask-composite:source-in;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent),linear-gradient(180deg,transparent,#000 18%,#000 82%,transparent)}
.k{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#bfc7d1}
.rule{height:1px;background:linear-gradient(90deg,#8fe7ff,rgba(143,231,255,0))}
`;

/** cover 1600×900 */
const cover = `<!doctype html><style>${base}
.stage{position:relative;width:1600px;height:900px;overflow:hidden;
  background:radial-gradient(60% 70% at 72% 40%,rgba(143,231,255,.07),transparent 70%),radial-gradient(80% 60% at 20% 110%,rgba(191,199,209,.06),transparent 70%),#0b0e14}
.product{left:560px;top:50px;width:1060px;height:470px;
  background-image:url(${img("hero.png")});background-size:1632px auto;background-position:-315px -95px}
.wm{position:absolute;left:92px;top:236px;width:540px}
.wm svg{width:100%;height:auto;display:block;filter:drop-shadow(0 0 18px rgba(143,231,255,.08))}
.wm .wm__glyph--slash{filter:drop-shadow(0 0 6px rgba(255,91,67,.6))}
.wmsub{position:absolute;left:96px;top:330px;font-size:11px;letter-spacing:.46em;color:#bfc7d1}
.copy{position:absolute;left:96px;top:120px}
.tag{position:absolute;left:96px;top:376px;font-family:Syne,sans-serif;font-weight:700;font-size:46px;letter-spacing:-.02em;line-height:1}
.sub{position:absolute;left:98px;top:440px;font-size:17px;color:#bfc7d1;letter-spacing:.01em}
.meta{position:absolute;left:98px;top:516px;display:flex;gap:26px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#6e7480}
.meta b{color:#8fe7ff;font-weight:600;margin-inline-end:8px}
.strip{position:absolute;left:96px;right:96px;bottom:70px;display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.shot{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;border:1px solid rgba(191,199,209,.16);box-shadow:0 20px 50px rgba(0,0,0,.45)}
.shot img{width:100%;height:100%;object-fit:cover;display:block}
.shot span{position:absolute;left:10px;bottom:8px;font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:#f3f1eb;background:rgba(11,14,20,.72);padding:4px 8px;border-radius:999px}
.ruleA{position:absolute;left:98px;top:492px;width:300px}
</style><div class="stage">
<div class="crop soft product"></div>
<p class="copy k">Creative development &nbsp;·&nbsp; Interactive 3D &nbsp;·&nbsp; WebGL</p>
<div class="wm">${WM}</div>
<p class="wmsub">AI SMART EYEWEAR</p>
<p class="tag">See Beyond Reality.</p>
<p class="sub">Immersive Smart Eyewear Experience — an original product concept</p>
<div class="rule ruleA"></div>
<div class="meta"><span><b>01</b>Next.js</span><span><b>02</b>React Three Fiber</span><span><b>03</b>GSAP</span><span><b>04</b>EN / AR</span></div>
<div class="strip">
 <div class="shot"><img src="${img("exploded-view.png")}"><span>Exploded view</span></div>
 <div class="shot"><img src="${img("ar-experience.png")}"><span>AR concept</span></div>
 <div class="shot"><img src="${img("materials-focus.png")}"><span>Materials</span></div>
 <div class="shot"><img src="${img("configurator.png")}"><span>Configurator</span></div>
</div></div>`;

/** Open Graph 1200×630 */
const og = `<!doctype html><style>${base}
.stage{position:relative;width:1200px;height:630px;overflow:hidden;background:radial-gradient(60% 70% at 70% 45%,rgba(143,231,255,.08),transparent 70%),#0b0e14}
.product{left:250px;top:40px;width:940px;height:420px;background-image:url(${img("hero.png")});background-size:1536px auto;background-position:-300px -100px}
.wm{position:absolute;left:74px;top:428px;width:440px}
.wm svg{width:100%;height:auto;display:block}
.tag{position:absolute;left:72px;top:528px;font-family:Syne,sans-serif;font-weight:700;font-size:30px;letter-spacing:-.01em}
.k{position:absolute;left:74px;top:70px}
</style><div class="stage"><p class="k">Immersive smart eyewear concept</p><div class="crop soft product"></div><div class="wm">${WM}</div><p class="tag">See Beyond Reality.</p></div>`;

/** mobile showcase 1600×1000: three real phone captures */
const phone = (f, label) => `<figure><div class="ph"><img src="${img(f)}"></div><figcaption>${label}</figcaption></figure>`;
const mobile = `<!doctype html><style>${base}
.stage{width:1600px;height:1000px;display:flex;align-items:center;justify-content:center;gap:56px;background:radial-gradient(70% 70% at 50% 40%,rgba(143,231,255,.06),transparent 70%),#0b0e14}
figure{display:grid;gap:18px;justify-items:center}
.ph{width:340px;height:736px;border-radius:44px;padding:10px;background:#1a1f27;box-shadow:0 0 0 1px rgba(191,199,209,.2),0 40px 80px rgba(0,0,0,.5)}
.ph img{width:100%;height:100%;object-fit:cover;border-radius:34px;display:block}
figcaption{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#bfc7d1}
</style><div class="stage">${phone("mobile-en-hero.png", "Hero")}${phone("mobile-en-exploded.png", "Exploded view · legend")}${phone("mobile-ar-ar.png", "AR concept · Arabic RTL")}</div>`;

const b = await chromium.launch({ executablePath: exe });
for (const [name, html, w, h] of [
  ["cover", cover, 1600, 900],
  ["og", og, 1200, 630],
  ["mobile", mobile, 1600, 1000],
]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  await p.close();
}
await b.close();
console.log("→", OUT);
