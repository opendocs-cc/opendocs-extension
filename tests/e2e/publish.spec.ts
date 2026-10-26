import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { conversation, textdocs } from "../fixtures/chatgpt";
import { expect, test } from "./harness";

const CHAT_ID = "6720b1c4-1f2e-8001-a9c3-5d2b8e7f9a10";
const fixture = (name: string) => readFileSync(resolve(process.cwd(), "tests/fixtures", name), "utf8");

test.beforeEach(async ({ context }) => {
  await context.route("https://chatgpt.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `/c/${CHAT_ID}`) return route.fulfill({ contentType: "text/html", body: fixture("chatgpt.html") });
    if (path === "/api/auth/session") return route.fulfill({ json: { accessToken: "chatgpt-token" } });
    if (path === `/backend-api/conversation/${CHAT_ID}`) return route.fulfill({ json: conversation });
    if (path === `/backend-api/conversation/${CHAT_ID}/textdocs`) return route.fulfill({ json: textdocs });
    return route.fulfill({ status: 404, body: "" });
  });
  await context.route("https://gemini.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: fixture("gemini.html") }),
  );
});

test("publishes a ChatGPT answer without an account, then updates it at the same link", async ({ page, api }) => {
  await page.goto(`https://chatgpt.com/c/${CHAT_ID}`);
  const button = page.getByRole("button", { name: "Publish to OpenDocs" });
  await expect(button).toHaveCount(1);
  // In the answer's action row, right after Copy.
  await expect(page.locator('[data-testid="copy-turn-action-button"] + [data-opendocs="button"]')).toHaveCount(1);

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
