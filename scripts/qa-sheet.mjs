/**
 * Contact sheet of QA screenshots (for quick visual review).
 *   node scripts/qa-sheet.mjs <dir> <out.png> <cols> <width> file1.png file2.png …
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [dir, out, colsArg, widthArg, ...files] = process.argv.slice(2);
const cols = Number(colsArg) || 4;
const width = Number(widthArg) || 1600;
const exe =
  process.env.QA_CHROME ??
  path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1248", "chrome-win64", "chrome.exe");

const imgs = files
  .map((f) => path.join(dir, f))
  .filter((f) => fs.existsSync(f))
  .map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}"><figcaption>${path.basename(f)}</figcaption></figure>`)
  .join("");
const html = `<!doctype html><style>body{margin:0;background:#222;font:12px sans-serif;color:#ddd}
.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px}
figure{margin:0}img{width:100%;display:block}figcaption{padding:2px 0}</style><div class="g">${imgs}</div>`;

const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width, height: 400 } });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
