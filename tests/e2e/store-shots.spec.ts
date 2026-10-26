import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "./harness";

/**
 * The real extension on the demo chat pages (store/studio/out), captured for
 * the store screenshots. Opt-in: build the pages (node store/studio/build-pages.mjs),
 * then STORE_SHOTS=1 npx playwright test store-shots. Writes store/screenshots/capture/.
 */

const OUT = resolve(process.cwd(), "store/screenshots/capture");
const studio = (name: string) => readFileSync(resolve(process.cwd(), "store/studio/out", name), "utf8");
const CHAT = "6720b1c4-1f2e-8001-a9c3-5d2b8e7f9a10";
const CLAUDE_CHAT = "0f3e2d1c-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

test.skip(!process.env.STORE_SHOTS, "Set STORE_SHOTS=1 to capture the store screenshots.");
test.use({ deviceScaleFactor: 2 });
test.setTimeout(120_000);

test("store screenshots", async ({ context, page, extensionId, api }) => {
  mkdirSync(OUT, { recursive: true });
  api.anonymousId = "k3V9pQx2mR7tYw4b";
  // The sites' own data endpoints aren't there, so the extension reads the page.
  await context.route("https://chatgpt.com/**", (route) =>
    new URL(route.request().url()).pathname === `/c/${CHAT}`
      ? route.fulfill({ contentType: "text/html", body: studio("chatgpt.html") })
      : route.fulfill({ status: 401, json: {} }),
  );
  await context.route("https://claude.ai/**", (route) =>
    new URL(route.request().url()).pathname === `/chat/${CLAUDE_CHAT}`
      ? route.fulfill({ contentType: "text/html", body: studio("claude.html") })
      : route.fulfill({ status: 404, json: {} }),
  );
  await context.route("https://gemini.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: studio("gemini.html") }));

  // Agreed once, as on the welcome page.
  const [worker] = context.serviceWorkers();
  await worker!.evaluate(() =>
    (globalThis as unknown as { chrome: { storage: { local: { set(v: object): Promise<void> } } } }).chrome.storage.local.set({
      settings: { consented: true, includeQuestion: false },
    }),
  );

  // 1–2. ChatGPT: the card, then the published result.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`https://chatgpt.com/c/${CHAT}`);
  await page.getByRole("button", { name: "Publish to OpenDocs" }).click();
  const card = page.getByRole("dialog");
  await expect(card.getByLabel("Title")).toHaveValue("Pilot pricing for a 40-seat studio");
  await page.mouse.move(10, 450);
  await page.screenshot({ path: `${OUT}/chatgpt-card.png` });
  await card.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(card).toContainText("Published.");
  await page.screenshot({ path: `${OUT}/chatgpt-done.png` });
  // The document the extension published, for the page and PDF shots.
  writeFileSync(`${OUT}/chatgpt-published.json`, JSON.stringify(api.find("POST", "/api/v1/anonymous/publish")!.body, null, 2));

  // 3. Claude: the whole chat.
  await page.goto(`https://claude.ai/chat/${CLAUDE_CHAT}`);
  await page.getByRole("button", { name: "Publish to OpenDocs" }).last().click();
  await card.getByRole("button", { name: "Whole chat" }).click();
  await expect(card.getByLabel("Title")).toHaveValue("Mutual NDA for the Halvard pilot");
  await page.mouse.move(10, 450);
  await page.screenshot({ path: `${OUT}/claude-whole.png` });

  // 4–5. Signed in (a demo workspace): the card on Gemini and the side panel.
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  await worker!.evaluate(
    ({ records }) => {
      const c = (globalThis as unknown as { chrome: { storage: { local: { set(v: object): Promise<void> }; session: { set(v: object): Promise<void> } } } }).chrome;
      return Promise.all([
        c.storage.local.set({ "auth.refresh": "demo-refresh", visibility: "workspace", publishes: records }),
        c.storage.session.set({ "auth.access": { accessToken: "demo", expiresAt: Date.now() + 3_600_000 } }),
      ]);
    },
    {
      records: [
        ["Pilot pricing for a 40-seat studio", "chatgpt", 6, "pilot-pricing"],
        ["Mutual NDA for the Halvard pilot", "claude", 52, "mutual-nda"],
        ["Compound interest, explained", "gemini", 190, "compound-interest"],
        ["Q3 board memo outline", "claude", 1500, "q3-board-memo"],
      ].map(([title, site, minutes, slug]) => ({
        kind: "workspace",
        postId: `post-${slug}`,
        workspaceId: "ws1",
        sourceKey: `${site}:demo:${slug}`,
        site,
        scope: "answer",
        title,
        url: `https://opendocs.cc/halvard/projects/legal/${slug}`,
        publishedAt: minutesAgo(Number(minutes)),
      })),
    },
  );

  const gemini = await context.newPage();
  await gemini.setViewportSize({ width: 1060, height: 900 });
  await gemini.goto("https://gemini.google.com/app/8f2a91b0c3d4e5f6");
  await gemini.getByRole("button", { name: "Publish to OpenDocs" }).click();
  await expect(gemini.getByRole("dialog")).toContainText("Goes to");
  await gemini.mouse.move(10, 450);
  await gemini.screenshot({ path: `${OUT}/gemini-card-signed-in.png` });
  await gemini.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await gemini.screenshot({ path: `${OUT}/gemini.png` });

  const panel = await context.newPage();
  await panel.emulateMedia({ colorScheme: "dark" });
  await panel.setViewportSize({ width: 380, height: 900 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  // With the chat tab in front, the panel offers to publish it.
  await gemini.bringToFront();
  await expect(panel.getByRole("button", { name: "Publish this chat" })).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByRole("link", { name: "Q3 board memo outline" })).toBeVisible();
  await expect(panel.locator("#od-project")).toHaveValue("p-legal");
  await panel.screenshot({ path: `${OUT}/panel.png` });
});
