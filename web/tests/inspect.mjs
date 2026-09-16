import fs from "node:fs";
const screenshotRoot=process.env.AEVUM_QA_DIR||"../.runtime/screenshots";
fs.mkdirSync(screenshotRoot,{recursive:true});
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5173");
await page.getByRole("button", { name: "Explore a sample Twin" }).click();
await page
  .getByRole("heading", { name: "Your biology, in perspective." })
  .waitFor();
await page.screenshot({ path: screenshotRoot+"/desktop.png", fullPage: true });
for (const route of [
  "twin/metabolic",
  "biology/metabolic",
  "interventions",
  "ai",
  "data",
  "settings",
]) {
  await page.goto("http://127.0.0.1:5173/#" + route);
  await page.waitForTimeout(600);
  await page.screenshot({
    path: screenshotRoot+"/"+route.replace("/", "-")+".png",
    fullPage: true,
  });
}
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://127.0.0.1:5173/#home");
await page.waitForTimeout(500);
await page.screenshot({ path: screenshotRoot+"/mobile.png", fullPage: true });
console.log(
  JSON.stringify({
    errors,
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  }),
);
await browser.close();
