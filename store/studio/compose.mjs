// Composes the store screenshots (1280x800) and the marquee tile (1400x560)
// from the captures in store/screenshots/capture: real extension UI on the
// demo pages, and a real OpenDocs page and PDF. JPEG, as the store accepts.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const capture = (name) => `data:image/png;base64,${readFileSync(new URL(`../screenshots/capture/${name}`, import.meta.url)).toString("base64")}`;
const mark = `data:image/svg+xml;base64,${readFileSync(new URL("../../src/ui/opendocs-mark.svg", import.meta.url)).toString("base64")}`;

const base = `*{box-sizing:border-box;margin:0}body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;color:#18181b}
.frame{position:relative;overflow:hidden;background:linear-gradient(180deg,#f6f3fd 0%,#efe9fc 100%)}
.brand{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:600;color:#3f3f46}.brand img{width:22px;height:22px}
h1{font-weight:650;letter-spacing:-0.025em;color:#18181b}.sub{color:#52525b}
.window{position:absolute;overflow:hidden;border-radius:14px 14px 0 0;box-shadow:0 30px 60px -20px rgba(46,28,92,.35),0 0 0 1px rgba(24,24,27,.08)}
.bar{height:34px;display:flex;align-items:center;gap:7px;padding:0 14px}.bar i{width:11px;height:11px;border-radius:50%;display:block}
.bar span{margin-left:14px;flex:1;max-width:420px;height:22px;border-radius:7px;font-size:12px;line-height:22px;padding:0 12px;white-space:nowrap;overflow:hidden}
.dark .bar{background:#1c1c1f}.dark .bar i{background:#3f3f46}.dark .bar span{background:#2a2a2e;color:#a1a1aa}
.light .bar{background:#ececef}.light .bar i{background:#d4d4d8}.light .bar span{background:#fff;color:#71717a}
.shot{display:block;width:100%}`;

function frame({ title, sub, url, theme, image, extra = "" }) {
  return `<div class="frame" style="width:1280px;height:800px">
  <div style="position:absolute;left:64px;top:44px;right:64px">
    <div class="brand"><img src="${mark}" alt="">OpenDocs for Chrome</div>
    <h1 style="font-size:38px;line-height:1.1;margin-top:18px">${title}</h1>
    <p class="sub" style="font-size:18px;margin-top:10px">${sub}</p>
  </div>
  <div class="window ${theme}" style="left:64px;top:196px;width:1152px;height:640px">
    <div class="bar"><i></i><i></i><i></i><span>${url}</span></div>${image}
  </div>${extra}</div>`;
}

const FRAMES = [
  {
    file: "1-publish-in-one-click.jpg",
    title: "Publish any AI answer in one click",
    sub: "A Publish button sits under every answer on ChatGPT, Claude and Gemini.",
    url: "chatgpt.com/c/6720b1c4-1f2e-8001-a9c3-5d2b8e7f9a10",
    theme: "dark",
    image: `<img class="shot" src="${capture("chatgpt-card.png")}">`,
  },
  {
    file: "2-link-and-pdf.jpg",
    title: "Get a clean link and a PDF",
    sub: "The link is copied for you. Free, with no watermark and no account needed.",
    url: "chatgpt.com/c/6720b1c4-1f2e-8001-a9c3-5d2b8e7f9a10",
    theme: "dark",
    image: `<img class="shot" src="${capture("chatgpt-done.png")}">`,
  },
  {
    file: "3-a-real-document.jpg",
    title: "A real document, not a copy of the chat",
    sub: "Your answer as a page you can share and a PDF, with the formatting kept.",
    url: "opendocs.cc/a/k3V9pQx2mR7tYw4b",
    theme: "light",
    // The page without the edges (and the dev server's badge in the corner).
    image: `<div style="height:606px;overflow:hidden;background:#fff"><img src="${capture("document-page.png")}" style="width:1455px;margin-left:-191px;display:block"></div>`,
    // The top of the PDF, large enough to read.
    extra: `<div style="position:absolute;right:84px;top:566px;width:440px;height:222px;overflow:hidden;background:#fff;border-radius:8px;box-shadow:0 30px 60px -18px rgba(46,28,92,.45),0 0 0 1px rgba(24,24,27,.1)">
      <img src="${capture("document.pdf.png")}" style="width:560px;margin:-36px 0 0 -58px;display:block"></div>
      <div style="position:absolute;right:84px;top:532px;font-size:13px;font-weight:600;color:#5b33b0;background:#fff;border-radius:999px;padding:5px 12px;box-shadow:0 6px 16px -6px rgba(46,28,92,.35)">The PDF</div>`,
  },
  {
    file: "4-one-answer-or-the-whole-chat.jpg",
    title: "One answer, or the whole chat",
    sub: "Publish a whole conversation with each question above its answer.",
    url: "claude.ai/chat/0f3e2d1c-4b5a-4c6d-8e7f-9a0b1c2d3e4f",
    theme: "dark",
    image: `<img class="shot" src="${capture("claude-whole.png")}">`,
  },
  {
    file: "5-keep-it-in-your-workspace.jpg",
    title: "Keep it in your workspace",
    sub: "Sign in free to choose the project, include images and update documents later.",
    url: "gemini.google.com/app/8f2a91b0c3d4e5f6",
    theme: "dark",
    image: `<div style="display:flex;background:#131314"><img src="${capture("gemini-card-signed-in.png")}" style="width:848px;display:block"><img src="${capture("panel.png")}" style="width:304px;display:block;border-left:1px solid #2e2e33"></div>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const f of FRAMES) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<!doctype html><html><head><style>${base}</style></head><body>${frame(f)}</body></html>`);
  await page.waitForLoadState("load");
  await page.screenshot({ path: `store/screenshots/${f.file}`, type: "jpeg", quality: 92, clip: { x: 0, y: 0, width: 1280, height: 800 } });
  console.log("store/screenshots/" + f.file);
}

// Marquee promo tile, 1400 x 560.
await page.setViewportSize({ width: 1400, height: 560 });
await page.setContent(`<!doctype html><html><head><style>${base}</style></head><body>
<div class="frame" style="width:1400px;height:560px">
  <div style="position:absolute;left:76px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center">
    <div class="brand" style="font-size:16px"><img src="${mark}" alt="" style="width:28px;height:28px">OpenDocs for Chrome</div>
    <h1 style="font-size:52px;line-height:1.05;margin-top:22px">Any AI answer, as a link and a PDF</h1>
    <p class="sub" style="font-size:20px;margin-top:16px">One click on ChatGPT, Claude and Gemini.</p>
  </div>
  <div class="window dark" style="left:660px;top:64px;width:680px;height:540px">
    <div class="bar"><i></i><i></i><i></i><span>chatgpt.com</span></div>
    <div style="height:506px;overflow:hidden;background:#212121"><img src="${capture("chatgpt-done.png")}" style="width:1300px;margin-left:-250px;margin-top:-60px;display:block"></div>
  </div>
</div></body></html>`);
await page.waitForLoadState("load");
await page.screenshot({ path: "store/marquee-1400x560.jpg", type: "jpeg", quality: 92, clip: { x: 0, y: 0, width: 1400, height: 560 } });
console.log("store/marquee-1400x560.jpg");
await browser.close();
