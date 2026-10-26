import { browser } from "wxt/browser";

/**
 * Where the extension talks to. Production by default; a local stack sets
 * WXT_OPENDOCS_* in .env.local (see README). The sign-in client is the
 * Client ID Metadata Document on opendocs.cc; locally, where Better Auth
 * only accepts https metadata URLs, it's a registered client's ID.
 */

const env = import.meta.env as Record<string, string | undefined>;

const webUrl = (env.WXT_OPENDOCS_WEB_URL || "https://opendocs.cc").replace(/\/+$/, "");

export const config = {
  webUrl,
  apiUrl: (env.WXT_OPENDOCS_API_URL || "https://api.opendocs.cc").replace(/\/+$/, ""),
  clientId: env.WXT_OPENDOCS_CLIENT_ID || `${webUrl}/oauth/clients/browser-extension.json`,
  /** Tokens are audience-bound to this resource, which the API accepts. */
  resource: env.WXT_OPENDOCS_RESOURCE || "https://mcp.opendocs.cc/mcp",
  scopes: ["docs:read", "docs:write", "offline_access"],
};

/** The store this build is for (`wxt -b edge` makes Edge's). */
export const STORE = import.meta.env.BROWSER === "edge" ? { id: "edge", name: "Edge Add-ons" } : { id: "chrome", name: "Chrome Web Store" };

/** "Rate it": opendocs.cc sends this to the store listing's reviews. */
export const RATE_URL = `${webUrl}/extension/rate?store=${STORE.id}`;

/** Anonymous documents' limit (FREE_TOOL_LIMITS.anonymousPublish.maxBytes). */
export const ANONYMOUS_MAX_BYTES = 512_000;

export const EXTENSION_VERSION: string = browser.runtime.getManifest().version;
