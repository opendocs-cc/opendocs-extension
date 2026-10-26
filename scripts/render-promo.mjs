// Renders the store's small promo tile (440 x 280) from HTML.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const mark = Buffer.from(readFileSync(new URL("../src/ui/opendocs-mark.svg", import.meta.url))).toString("base64");
const html = `<!doctype html><html><body style="margin:0">
<div style="width:440px;height:280px;box-sizing:border-box;padding:34px 36px;background:#f6f3fd;font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;flex-direction:column;justify-content:space-between;color:#18181b">
  <div style="display:flex;align-items:center;gap:10px">
    <img src="data:image/svg+xml;base64,${mark}" width="34" height="34">
    <span style="font-size:22px;font-weight:700;letter-spacing:-0.02em">OpenDocs</span>
  </div>
  <div>
    <div style="font-size:31px;line-height:1.08;font-weight:700;letter-spacing:-0.035em">Any AI answer,<br>as a link and a PDF</div>
    <div style="margin-top:12px;font-size:15px;color:#52525b">One click on ChatGPT, Claude or Gemini</div>
  </div>
</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 280 } });
await page.setContent(html);
await page.screenshot({ path: "store/promo-440x280.png" });
await browser.close();
console.log("Rendered store/promo-440x280.png");
