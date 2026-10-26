import { accessToken, expireAccessToken } from "../auth/session";
import { config, EXTENSION_VERSION } from "../config";
import { PublishError, type SiteId } from "../types";

/**
 * The OpenDocs REST API as the extension uses it, from the service worker.
 * Every request says it came from the extension and which chat site
 * (`X-OpenDocs-Client: opendocs-extension/<site>`), which version history
 * and our numbers show. Signed-in calls carry the OAuth access token.
 */

type Options = { site?: SiteId; auth?: boolean; query?: Record<string, string | undefined> };

function errorFor(status: number, body: { error?: string; message?: string }): PublishError {
  const message = body.message || "OpenDocs couldn't do that. Try again in a moment.";
  if (status === 429 || body.error === "rate_limited" || body.error === "service_busy") {
    return new PublishError("rate_limited", "Too many documents for now. Wait a bit and try again, or sign in.");
  }
  if (body.error === "document_limit" || body.error === "plan_limit") return new PublishError("document_limit", message);
  if (status === 401) return new PublishError("signed_out", "You were signed out. Sign in again.");
  if (status === 403 && /pro|team|plan/i.test(message)) return new PublishError("pro_only", message);
  return new PublishError("unknown", message);
}

export async function api<T>(method: string, path: string, body?: unknown, options: Options = {}): Promise<T> {
  const url = new URL(`${config.apiUrl}/api/v1${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) if (value) url.searchParams.set(key, value);

  const send = async (token: string | null) => {
    const headers: Record<string, string> = {
      "X-OpenDocs-Client": `opendocs-extension/${options.site ?? "panel"}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      return await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
      });
    } catch {
      throw new PublishError("network", "Couldn't reach OpenDocs. Check your connection and try again.");
    }
  };

  let token = options.auth ? await accessToken() : null;
  if (options.auth && !token) throw new PublishError("signed_out", "Sign in to OpenDocs first.");
  let res = await send(token);
  if (res.status === 401 && options.auth) {
    // The token may have been revoked or rotated; refresh once.
    await expireAccessToken();
    token = await accessToken();
    if (!token) throw new PublishError("signed_out", "You were signed out. Sign in again.");
    res = await send(token);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw errorFor(res.status, data);
  return data;
}

// ---- Anonymous ----------------------------------------------------------

export type AnonymousDoc = { id: string; title: string; url: string; claimToken: string; claimUrl: string; expiresAt: string };

export function publishAnonymous(site: SiteId, markdown: string, title: string) {
  return api<AnonymousDoc>("POST", "/anonymous/publish", { markdown, title }, { site });
}

export function updateAnonymous(site: SiteId, id: string, claimToken: string, markdown: string, title: string) {
  return api<Omit<AnonymousDoc, "claimToken" | "claimUrl">>("PUT", `/anonymous/${encodeURIComponent(id)}`, { markdown, title, claimToken }, { site });
}

export function anonymousPdfUrl(id: string): string {
  return `${config.apiUrl}/api/v1/anonymous/${encodeURIComponent(id)}/export/pdf`;
}

export function claimAnonymous(claimToken: string, workspaceId: string, projectId: string | undefined, visibility: string) {
  return api<{ postId: string; url: string; publicUrl?: string | null; title: string }>(
    "POST",
    "/anonymous/claim",
    { claimToken, workspaceId, ...(projectId ? { projectId } : {}), visibility: visibility === "public" ? "workspace" : visibility },
    { auth: true },
  );
}

// ---- Signed in ----------------------------------------------------------

export type Me = {
  userId: string;
  onboarding: { username: string | null; workspace: { id: string; name: string; slug: string } | null };
  quota: { documents: { plan: string } | null };
};
export type Workspace = { id: string; name: string; slug: string; role: string };
export type Project = { id: string; workspaceId: string; name: string; slug: string; isDefault: boolean };
export type Connection = {
  workspace: { id: string; name: string; slug: string } | null;
  project: { id: string; name: string; slug: string } | null;
};
export type Published = {
  postId: string;
  slug: string;
  url: string;
  publicUrl?: string | null;
  title: string;
  versionNumber: number;
};

export const me = () => api<Me>("GET", "/me", undefined, { auth: true });
export const workspaces = () => api<{ workspaces: Workspace[] }>("GET", "/workspaces", undefined, { auth: true });
export const projects = (workspaceId: string) =>
  api<{ projects: Project[] }>("GET", "/projects", undefined, { auth: true, query: { workspaceId } });
export const connection = () => api<Connection>("GET", "/mcp/connection", undefined, { auth: true });
export const saveConnection = (workspaceId: string, projectId: string | null) =>
  api<Connection>("PUT", "/mcp/connection", { workspaceId, projectId }, { auth: true });

export function publish(
  site: SiteId,
  input: { markdown: string; title: string; workspaceId: string; projectId?: string; visibility: string },
) {
  return api<Published>(
    "POST",
    "/publish",
    {
      markdown: input.markdown,
      title: input.title,
      workspaceId: input.workspaceId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      visibility: input.visibility,
      ...(input.visibility === "public" ? { confirmPublic: true } : {}),
    },
    { site, auth: true },
  );
}

export function update(site: SiteId, postId: string, workspaceId: string, markdown: string, title: string) {
  return api<Published & { unchanged?: boolean }>(
    "POST",
    `/posts/${encodeURIComponent(postId)}/update`,
    { workspaceId, markdown, title },
    { site, auth: true },
  );
}

export function downloadLink(postId: string, workspaceId: string, format: "pdf" | "docx") {
  return api<{ url: string; filename: string; expiresAt: string }>(
    "POST",
    "/download-links",
    { kind: "post_export", document: postId, workspaceId, format },
    { auth: true },
  );
}

/**
 * Stores an image through the API (POST /storage/images), not a presigned
 * storage URL: storage doesn't answer the extension's origin with CORS.
 */
export async function uploadImage(workspaceId: string, bytes: Uint8Array, contentType: string, filename: string): Promise<string> {
  const token = await accessToken();
  if (!token) throw new PublishError("signed_out", "Sign in to OpenDocs first.");
  const url = new URL(`${config.apiUrl}/api/v1/storage/images`);
  url.search = new URLSearchParams({ workspaceId, filename }).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType, "X-OpenDocs-Client": "opendocs-extension/images" },
    body: new Blob([bytes as BlobPart], { type: contentType }),
    credentials: "omit",
  }).catch(() => null);
  const data = res ? ((await res.json().catch(() => ({}))) as { url?: string }) : {};
  if (!res?.ok || !data.url) throw new PublishError("unknown", "An image didn't upload.");
  return data.url;
}

/** Absolute link to a published document. */
export function documentUrl(post: { url: string; publicUrl?: string | null }): string {
  if (post.publicUrl) return post.publicUrl;
  return /^https?:\/\//.test(post.url) ? post.url : `${config.webUrl}${post.url.startsWith("/") ? "" : "/"}${post.url}`;
}

/** A content-free failure ping (site, step, code, versions). Best effort. */
export async function reportFailure(site: SiteId | "other", stage: string, code: string, extractor?: string): Promise<boolean> {
  try {
    const res = await fetch(`${config.apiUrl}/api/v1/extension/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site, stage, code: code.slice(0, 64), version: EXTENSION_VERSION, ...(extractor ? { extractor } : {}) }),
      credentials: "omit",
    });
    return res.ok;
  } catch {
    return false;
  }
}
