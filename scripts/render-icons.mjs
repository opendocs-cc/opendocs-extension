// Renders the toolbar and store icons from the brand mark (src/ui/opendocs-mark.svg).
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync(new URL("../src/ui/opendocs-mark.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 96, 128]) {
  // Store icons are 128 px with the artwork at 96 px and transparent padding.
  const art = size === 128 ? 96 : size;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent;display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${art}" height="${art}"></body></html>`,
  );
  await page.screenshot({ path: `public/icon/${size}.png`, omitBackground: true });
}
await browser.close();
console.log("Rendered public/icon/{16,32,48,96,128}.png");
