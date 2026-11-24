/** Shared QA step: wait for the Enter screen and go in silently (like a visitor). */
export async function enterSite(page, { timeout = 90000 } = {}) {
  const silent = page.locator(".loader__silent");
  await silent.waitFor({ state: "visible", timeout });
  await silent.click();
  await page.waitForFunction(() => !document.querySelector(".loader") && window.__parallPose, null, { timeout: 30000 });
}
