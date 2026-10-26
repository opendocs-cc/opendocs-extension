import { createServer, type IncomingMessage, type Server } from "node:http";
import { resolve } from "node:path";
import { chromium, test as base, type BrowserContext, type Page } from "@playwright/test";

export const MOCK_API_PORT = 4719;
const EXTENSION_PATH = resolve(process.cwd(), ".output/chrome-mv3-e2e");

export type ApiCall = { method: string; path: string; body: unknown; headers: IncomingMessage["headers"] };

/** A stand-in for api.opendocs.cc: records calls and answers like OpenDocs. */
export class MockApi {
  calls: ApiCall[] = [];
  /** The id anonymous documents get (screenshots use a realistic one). */
  anonymousId = "anonDoc0000000000001";
  private server: Server | null = null;

  async start() {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-OpenDocs-Client");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
        if (req.method === "OPTIONS") {
          res.writeHead(204).end();
          return;
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        let body: unknown = raw;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          // not JSON
        }
        const path = (req.url ?? "/").split("?")[0]!;
        this.calls.push({ method: req.method ?? "GET", path, body, headers: req.headers });
        const json = (status: number, data: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(data));

        if (req.method === "POST" && path === "/api/v1/anonymous/publish") {
          const title = (body as { title?: string })?.title ?? "Untitled";
          json(201, {
            id: this.anonymousId,
            title,
            url: `https://opendocs.cc/a/${this.anonymousId}`,
            claimToken: "odc_test",
            claimUrl: "https://opendocs.cc/claim/odc_test",
            expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
          });
          return;
        }
        if (req.method === "PUT" && path.startsWith("/api/v1/anonymous/")) {
          json(200, { id: "anonDoc0000000000001", title: (body as { title?: string })?.title, url: "https://opendocs.cc/a/anonDoc0000000000001", expiresAt: new Date(Date.now() + 20 * 3600_000).toISOString() });
          return;
        }
        if (req.method === "GET" && path.endsWith("/export/pdf")) {
          res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="doc.pdf"' }).end("%PDF-1.4 test");
          return;
        }
        // A signed-in demo account (the side panel's workspace and project).
        if (req.method === "GET" && path === "/api/v1/me") {
          json(200, {
            userId: "u1",
            onboarding: { username: "halvard", workspace: { id: "ws1", name: "Halvard Studio", slug: "halvard" } },
            quota: { documents: { plan: "pro" } },
          });
          return;
        }
        if (req.method === "GET" && path === "/api/v1/mcp/connection") {
          json(200, { workspace: { id: "ws1", name: "Halvard Studio", slug: "halvard" }, project: { id: "p-legal", name: "Legal", slug: "legal" } });
          return;
        }
        if (req.method === "GET" && path === "/api/v1/workspaces") {
          json(200, { workspaces: [{ id: "ws1", name: "Halvard Studio", slug: "halvard", role: "owner" }] });
          return;
        }
        if (req.method === "GET" && path === "/api/v1/projects") {
          json(200, {
            projects: [
              { id: "p-default", workspaceId: "ws1", name: "Default", slug: "default", isDefault: true },
              { id: "p-legal", workspaceId: "ws1", name: "Legal", slug: "legal", isDefault: false },
              { id: "p-research", workspaceId: "ws1", name: "Research", slug: "research", isDefault: false },
            ],
          });
          return;
        }
        if (path === "/api/v1/extension/events") {
          res.writeHead(204).end();
          return;
        }
        json(404, { error: "not_found" });
      });
    });
    await new Promise<void>((done) => this.server!.listen(MOCK_API_PORT, "127.0.0.1", done));
  }

  async stop() {
    await new Promise<void>((done) => this.server?.close(() => done()));
  }

  find(method: string, path: string): ApiCall | undefined {
    return this.calls.find((c) => c.method === method && c.path === path);
  }
}

type Fixtures = { api: MockApi; context: BrowserContext; extensionId: string; page: Page };

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  api: async ({}, use) => {
    const api = new MockApi();
    await api.start();
    await use(api);
    await api.stop();
  },
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).host);
  },
  page: async ({ context, extensionId }, use) => {
    void extensionId;
    // The welcome tab opens on install; work in a fresh one.
    const page = await context.newPage();
    await use(page);
  },
});

export { expect } from "@playwright/test";
