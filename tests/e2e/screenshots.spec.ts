import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { conversation, textdocs } from "../fixtures/chatgpt";
import { expect, test } from "./harness";

/**
 * Pictures of the extension's UI in each state, for design review and the
 * store listing. Opt-in: SCREENSHOTS=1 npx playwright test screenshots
 * (writes store/screenshots/raw/).
 */

const CHAT_ID = "6720b1c4-1f2e-8001-a9c3-5d2b8e7f9a10";
const OUT = resolve(process.cwd(), "store/screenshots/raw");
const fixture = (name: string) => readFileSync(resolve(process.cwd(), "tests/fixtures", name), "utf8");

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to take screenshots.");
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

test("card states, side panel and welcome page", async ({ page, context, extensionId, api }) => {
  void api;
  await context.route("https://chatgpt.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/c/${CHAT_ID}`) return route.fulfill({ contentType: "text/html", body: fixture("chatgpt.html") });
    if (path === "/api/auth/session") return route.fulfill({ json: { accessToken: "t" } });
    if (path === `/backend-api/conversation/${CHAT_ID}`) return route.fulfill({ json: conversation });
    if (path === `/backend-api/conversation/${CHAT_ID}/textdocs`) return route.fulfill({ json: textdocs });
    return route.fulfill({ status: 404, body: "" });
  });
  await context.route("https://gemini.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: fixture("gemini.html") }));

  const welcome = await context.newPage();
  await welcome.setViewportSize({ width: 1280, height: 800 });
  await welcome.goto(`chrome-extension://${extensionId}/welcome.html`);
  await welcome.getByRole("button", { name: "I agree, let's go" }).waitFor();
  await welcome.screenshot({ path: `${OUT}/welcome.png`, fullPage: true });
  await welcome.close();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`https://chatgpt.com/c/${CHAT_ID}`);
  await page.getByRole("button", { name: "Publish to OpenDocs" }).screenshot({ path: `${OUT}/button-dark.png` });
  await page.getByRole("button", { name: "Publish to OpenDocs" }).click();
  const card = page.getByRole("dialog");
  await card.getByLabel("Title").waitFor();
  await card.screenshot({ path: `${OUT}/card-ready-dark.png` });
  await card.getByRole("button", { name: "Agree and publish" }).click();
  await card.getByText("Published.").waitFor();
  await card.screenshot({ path: `${OUT}/card-done-dark.png` });

  await page.goto("https://gemini.google.com/app/8f2a91b0c3d4e5f6");
  await page.getByRole("button", { name: "Publish to OpenDocs" }).first().click();
  await card.getByRole("button", { name: "Whole chat" }).click();
  await expect(card.getByLabel("Title")).toHaveValue("Compound interest explained");
  await card.screenshot({ path: `${OUT}/card-ready-light.png` });
  await page.screenshot({ path: `${OUT}/page-light.png` });

  const panel = await context.newPage();
  await panel.setViewportSize({ width: 380, height: 760 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByText("Pilot pricing").waitFor();
  await panel.screenshot({ path: `${OUT}/sidepanel.png` });

});
