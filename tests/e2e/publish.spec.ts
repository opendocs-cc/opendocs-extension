import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { conversation, textdocs } from "../fixtures/chatgpt";
import { conversation as claudeConversation } from "../fixtures/claude";
import { expect, test } from "./harness";

const CHAT_ID = "6720b1c4-1f2e-8001-a9c3-5d2b8e7f9a10";
const LEGACY_CHAT_ID = "6720b1c4-1f2e-8001-a9c3-000000000001";
const CLAUDE_CHAT_ID = "0f3e2d1c-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const fixture = (name: string) => readFileSync(resolve(process.cwd(), "tests/fixtures", name), "utf8");

test.beforeEach(async ({ context }) => {
  await context.route("https://chatgpt.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/c/${CHAT_ID}`) return route.fulfill({ contentType: "text/html", body: fixture("chatgpt.html") });
    if (path === `/c/${LEGACY_CHAT_ID}`) return route.fulfill({ contentType: "text/html", body: fixture("chatgpt-legacy.html") });
    if (path === "/api/auth/session") return route.fulfill({ json: { accessToken: "chatgpt-token" } });
    if (path === `/backend-api/conversation/${CHAT_ID}`) return route.fulfill({ json: conversation });
    if (path === `/backend-api/conversation/${CHAT_ID}/textdocs`) return route.fulfill({ json: textdocs });
    return route.fulfill({ status: 404, body: "" });
  });
  await context.route("https://gemini.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: fixture("gemini.html") }),
  );
  await context.route("https://claude.ai/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/chat/${CLAUDE_CHAT_ID}`) return route.fulfill({ contentType: "text/html", body: fixture("claude.html") });
    if (path === "/api/organizations") return route.fulfill({ json: [{ uuid: "org-1", name: "Personal" }] });
    if (path === `/api/organizations/org-1/chat_conversations/${CLAUDE_CHAT_ID}`) return route.fulfill({ json: claudeConversation });
    return route.fulfill({ status: 404, body: "" });
  });
});

test("publishes a ChatGPT answer without an account, then updates it at the same link", async ({ page, api }) => {
  await page.goto(`https://chatgpt.com/c/${CHAT_ID}`);
  const button = page.getByRole("button", { name: "Publish to OpenDocs" });
  // One answer: not the question's row, not the hidden older chat.
  await expect(button).toHaveCount(1);
  // At the end of the answer's action row.
  await expect(page.locator('[data-turn-key="t-2"] .turn-action-controls > [data-opendocs="button"]:last-child')).toHaveCount(1);

  await button.click();
  const card = page.getByRole("dialog");
  await expect(card.getByLabel("Title")).toHaveValue("Pilot pricing");
  await expect(card).toContainText("Anyone with the link can read it for 24 hours.");
  await card.getByRole("button", { name: "Agree and publish" }).click();

  await expect(card).toContainText("Published.");
  await expect(card.getByRole("link", { name: "opendocs.cc/a/anonDoc0000000000001" })).toBeVisible();

  const publish = api.find("POST", "/api/v1/anonymous/publish")!;
  expect(publish.headers["x-opendocs-client"]).toBe("opendocs-extension/chatgpt");
  const { markdown, title } = publish.body as { markdown: string; title: string };
  expect(title).toBe("Pilot pricing");
  expect(markdown.startsWith("# Pilot pricing\n\nCharge \\$40 a month per seat [^1][^2].")).toBe(true);
  expect(markdown).toContain("$$\nn = \\frac{12000}{40 - 8}\n$$");
  expect(markdown).toContain("*Image not included. Sign in to OpenDocs to keep images.*");
  expect(markdown).toContain("## Pilot terms");
  expect(markdown).toContain("[^3]: [Nordic SaaS report](https://example.net/nordic)");
  expect(markdown).not.toContain("secret reasoning");

  await card.getByRole("button", { name: "PDF" }).click();
  await expect.poll(() => api.find("GET", "/api/v1/anonymous/anonDoc0000000000001/export/pdf")).toBeTruthy();

  // Again: the card offers to update the same document.
  await card.getByRole("button", { name: "Close" }).click();
  await button.click();
  await expect(card).toContainText("Published just now.");
  await expect(card.getByLabel("Update it (same link)")).toBeChecked();
  await card.getByRole("button", { name: "Update", exact: true }).click();
  await expect(card).toContainText("Updated.");
  expect(api.find("PUT", "/api/v1/anonymous/anonDoc0000000000001")).toBeTruthy();
});

test("publishes a whole Gemini chat with every question above its answer", async ({ page, api }) => {
  await page.goto("https://gemini.google.com/app/8f2a91b0c3d4e5f6");
  await expect(page.getByRole("button", { name: "Publish to OpenDocs" })).toHaveCount(2);
  // In the icon row, right after Copy's wrapper (not inside it, not at the far end).
  await expect(page.locator('.actions-container-v2 > copy-button + [data-opendocs="button"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Publish to OpenDocs" }).first().click();
  const card = page.getByRole("dialog");
  await card.getByRole("button", { name: "Whole chat" }).click();
  await expect(card.getByLabel("Title")).toHaveValue("Compound interest explained");
  await card.getByRole("button", { name: "Agree and publish" }).click();
  await expect(card).toContainText("Published.");

  const { markdown } = api.find("POST", "/api/v1/anonymous/publish")!.body as { markdown: string };
  expect(markdown).toContain("> **Question**\n>\n> How does compound interest work?\n> Give the formula.");
  expect(markdown).toContain("> And with monthly deposits?");
  expect(markdown).toContain("\n\n---\n\n");
  expect(markdown).toContain("$$\nA = P\\left(1 + \\frac{r}{n}\\right)^{nt}\n$$");
  expect(markdown.indexOf("How does compound interest")).toBeLessThan(markdown.indexOf("monthly deposits"));
});

test("publishes a Claude answer with its artifact at the final version", async ({ page, api }) => {
  await page.goto(`https://claude.ai/chat/${CLAUDE_CHAT_ID}`);
  const buttons = page.getByRole("button", { name: "Publish to OpenDocs" });
  await expect(buttons).toHaveCount(2);
  // Right after Copy in each answer's icon row; never in a code block's header or the question's row.
  await expect(page.locator('[role="group"] > span:has(> button[aria-label="Copy"]) + [data-opendocs="button"]')).toHaveCount(2);
  await expect(page.locator('.code-block [data-opendocs], [data-testid="user-message"] ~ div [data-opendocs]')).toHaveCount(0);

  await buttons.nth(1).click();
  const card = page.getByRole("dialog");
  await expect(card.getByLabel("Title")).toHaveValue("Make the term two years, and add a script to count words.");
  await card.getByRole("button", { name: "Agree and publish" }).click();
  await expect(card).toContainText("Published.");
  const publish = api.find("POST", "/api/v1/anonymous/publish")!;
  expect(publish.headers["x-opendocs-client"]).toBe("opendocs-extension/claude");
  const { markdown } = publish.body as { markdown: string };
  expect(markdown).toContain("Updated, and here's the script.");
  expect(markdown).toContain("Term: two years ($& costs).");
  expect(markdown).not.toContain("private reasoning");
});

test("ChatGPT's older layout still gets a button", async ({ page }) => {
  await page.goto(`https://chatgpt.com/c/${LEGACY_CHAT_ID}`);
  await expect(page.getByRole("button", { name: "Publish to OpenDocs" })).toHaveCount(1);
});

test("the side panel lists recent documents and offers to sign in", async ({ page, api, context, extensionId }) => {
  void api;
  await page.goto(`https://chatgpt.com/c/${CHAT_ID}`);
  await page.getByRole("button", { name: "Publish to OpenDocs" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Agree and publish" }).click();
  await expect(page.getByRole("dialog")).toContainText("Published.");

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole("button", { name: "Sign in or sign up free" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Pilot pricing" })).toBeVisible();
  await expect(panel.getByText(/ChatGPT · just now, expires in/)).toBeVisible();
});

test("the welcome page asks for agreement once", async ({ context, extensionId }) => {
  const welcome = await context.newPage();
  await welcome.goto(`chrome-extension://${extensionId}/welcome.html`);
  await welcome.getByRole("button", { name: "I agree, let's go" }).click();
  await expect(welcome.getByText("You're all set.")).toBeVisible();
  await welcome.reload();
  await expect(welcome.getByText("You're all set.")).toBeVisible();
});

test("starting the page script again in an open chat tab leaves one working button", async ({ page, context, api }) => {
  void api;
  await page.goto(`https://chatgpt.com/c/${CHAT_ID}`);
  const button = page.getByRole("button", { name: "Publish to OpenDocs" });
  await expect(button).toHaveCount(1);
  await page.evaluate(() => document.querySelector('[data-opendocs="button"]')?.setAttribute("data-old", ""));

  // What the service worker does on install and update for chat tabs that are already open.
  const [worker] = context.serviceWorkers();
  const injected = await worker!.evaluate(async () => {
    type Chrome = {
      runtime: { getManifest(): { content_scripts?: Array<{ matches?: string[]; js?: string[] }> } };
      tabs: { query(query: { url?: string[] }): Promise<Array<{ id?: number; url?: string }>> };
      scripting: { executeScript(injection: { target: { tabId: number }; files: string[] }): Promise<unknown> };
    };
    const c = (globalThis as unknown as { chrome: Chrome }).chrome;
    const results: string[] = [];
    for (const script of c.runtime.getManifest().content_scripts ?? []) {
      for (const tab of await c.tabs.query({ url: script.matches })) {
        await c.scripting.executeScript({ target: { tabId: tab.id! }, files: script.js! });
        results.push(tab.url ?? "");
      }
    }
    return results;
  });
  expect(injected).toEqual([`https://chatgpt.com/c/${CHAT_ID}`]);

  // The new copy owns the page: the old button is gone and there's exactly one.
  await expect
    .poll(() => page.evaluate(() => [document.querySelectorAll('[data-opendocs="button"]').length, document.querySelectorAll("[data-old]").length]))
    .toEqual([1, 0]);
  await button.click();
  await expect(page.getByRole("dialog").getByLabel("Title")).toHaveValue("Pilot pricing");
});
