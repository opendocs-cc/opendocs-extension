import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, test, type BrowserContext } from "@playwright/test";

import { conversation, textdocs } from "../fixtures/chatgpt";

/**
 * Against a real OpenDocs stack on this machine (web, API, Postgres; see the
 * README): signs in through the consent page, claims an anonymous document,
 * publishes to the workspace and downloads a PDF. Opt-in:
 *
 *   OPENDOCS_LOCAL_WEB=http://localhost:3150 OPENDOCS_LOCAL_API=http://localhost:4150 \
 *   OPENDOCS_LOCAL_CLIENT_ID=<a registered client> OPENDOCS_LOCAL_RESOURCE=http://localhost:4160/mcp \
 *   npx playwright test local-stack
 */

const WEB = process.env.OPENDOCS_LOCAL_WEB;
const API = process.env.OPENDOCS_LOCAL_API;
const CLIENT_ID = process.env.OPENDOCS_LOCAL_CLIENT_ID;
const RESOURCE = process.env.OPENDOCS_LOCAL_RESOURCE;
const CHAT_ID = "6720b1c4-1f2e-8001-a9c3-5d2b8e7f9a10";
const EXTENSION_PATH = resolve(process.cwd(), ".output/chrome-mv3-stack");

test.skip(!WEB || !API || !CLIENT_ID || !RESOURCE, "Set OPENDOCS_LOCAL_* to run against a local stack.");

let context: BrowserContext;

test.beforeAll(async () => {
  execSync("npx wxt build --mode stack", {
    stdio: "inherit",
    env: {
      ...process.env,
      WXT_OPENDOCS_WEB_URL: WEB,
      WXT_OPENDOCS_API_URL: API,
      WXT_OPENDOCS_CLIENT_ID: CLIENT_ID,
      WXT_OPENDOCS_RESOURCE: RESOURCE,
    },
  });
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  await context.route("https://chatgpt.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/c/${CHAT_ID}`) {
      return route.fulfill({ contentType: "text/html", body: readFileSync(resolve(process.cwd(), "tests/fixtures/chatgpt.html"), "utf8") });
    }
    if (path === "/api/auth/session") return route.fulfill({ json: { accessToken: "chatgpt-token" } });
    if (path === `/backend-api/conversation/${CHAT_ID}`) return route.fulfill({ json: conversation });
    if (path === `/backend-api/conversation/${CHAT_ID}/textdocs`) return route.fulfill({ json: textdocs });
    return route.fulfill({ status: 404, body: "" });
  });

  // A fresh account, signed in on the web, so the consent page shows straight away.
  const email = `extension-${Date.now()}@example.com`;
  const signUp = await context.request.post(`${WEB}/api/auth/sign-up/email`, {
    headers: { Origin: WEB! },
    data: { email, password: "extension-test-password-1", name: "Extension Tester" },
  });
  expect(signUp.ok()).toBe(true);
});

test.afterAll(async () => {
  await context?.close();
});

test("anonymous, then signed in: claim, publish to the workspace, PDF", async () => {
  const page = await context.newPage();
  await page.goto(`https://chatgpt.com/c/${CHAT_ID}`);
  const card = page.getByRole("dialog");

  // 1. Without an account.
  await page.getByRole("button", { name: "Publish to OpenDocs" }).click();
  await card.getByRole("button", { name: "Agree and publish" }).click();
  await expect(card).toContainText("Published.");
  const anonymousLink = await card.locator(".od-link a").getAttribute("href");
  expect(anonymousLink).toMatch(/\/a\/[A-Za-z0-9_-]+$/);

  // 2. "Keep it": sign in through the real consent page, which claims it.
  const consentPage = context.waitForEvent("page", (p) => p.url().includes("/oauth/consent"));
  await card.getByRole("button", { name: "Keep it: sign up free" }).click();
  const consent = await consentPage;
  await consent.waitForLoadState();
  await expect(consent.getByRole("heading", { name: /^OpenDocs extension.* wants to use your OpenDocs account$/ })).toBeVisible();
  await consent.getByRole("button", { name: "Allow" }).click();
  await expect(card).toContainText("Your document moved to your workspace.", { timeout: 30_000 });
  const claimedLink = await card.locator(".od-link a").getAttribute("href");
  expect(claimedLink).not.toBe(anonymousLink);
  expect(claimedLink).toContain(WEB!);

  // 3. A new document straight to the workspace.
  await card.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Publish to OpenDocs" }).click();
  await expect(card).toContainText("Goes to");
  await card.getByLabel("New document").check();
  await card.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(card).toContainText("Published.");
  const workspaceLink = await card.locator(".od-link a").getAttribute("href");
  expect(workspaceLink).toContain(WEB!);
  expect(workspaceLink).not.toBe(claimedLink);

  // The PDF opens as an hour-long download link in a new tab, which turns into a download.
  // Chrome closes that tab as soon as the download starts, before a test can
  // attach to it; the API's log shows the PDF being served.
  const tab = context.waitForEvent("page");
  await card.getByRole("button", { name: "PDF" }).click();
  await tab;
  await expect(card).not.toContainText("didn't start");
});
