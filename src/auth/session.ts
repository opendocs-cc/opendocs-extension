import { browser } from "wxt/browser";
import { config } from "../config";
import { PublishError } from "../types";

/**
 * OAuth 2.1 sign-in with PKCE, run from the service worker (a side panel or
 * popup can close while the sign-in window has focus).
 *
 * - The access token (an hour) lives in storage.session: memory only,
 *   cleared when the browser restarts.
 * - The refresh token lives in storage.local, which the background sets to
 *   trusted contexts only, so content scripts can't read it.
 * - Every refresh goes through one promise. OpenDocs rotates refresh tokens
 *   and treats a reused one as stolen, so two refreshes at once would sign
 *   the user out.
 */

type Tokens = { accessToken: string; expiresAt: number };

const ACCESS_KEY = "auth.access";
const REFRESH_KEY = "auth.refresh";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function redirectUri(): string {
  return browser.identity.getRedirectURL();
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(`${config.webUrl}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, resource: config.resource, ...body }),
      credentials: "omit",
    });
  } catch {
    throw new PublishError("network", "Couldn't reach OpenDocs. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string };
  if (!res.ok || !data.access_token) {
    throw new PublishError(
      data.error === "invalid_grant" ? "signed_out" : "unknown",
      data.error === "invalid_grant" ? "You were signed out. Sign in again." : "Signing in didn't work. Try again.",
    );
  }
  return data as TokenResponse;
}

async function store(tokens: TokenResponse): Promise<string> {
  const access: Tokens = {
    accessToken: tokens.access_token,
    // Refresh a minute early so a request never leaves with a dying token.
    expiresAt: Date.now() + Math.max(60, (tokens.expires_in ?? 3600) - 60) * 1000,
  };
  await browser.storage.session.set({ [ACCESS_KEY]: access });
  if (tokens.refresh_token) await browser.storage.local.set({ [REFRESH_KEY]: tokens.refresh_token });
  return access.accessToken;
}

export async function signIn(): Promise<void> {
  const verifier = randomString(48);
  const state = randomString(16);
  const authorize = new URL(`${config.webUrl}/api/auth/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    scope: config.scopes.join(" "),
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
    resource: config.resource,
    prompt: "consent",
  }).toString();

  let finalUrl: string | undefined;
  try {
    finalUrl = await browser.identity.launchWebAuthFlow({ url: authorize.toString(), interactive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Closing the window is a choice, not a failure.
    if (/did not approve|user cancel|closed/i.test(message)) throw new PublishError("signed_out", "Sign-in was cancelled.");
    throw new PublishError("unknown", "Signing in didn't work. Try again.");
  }
  const params = new URL(finalUrl ?? "").searchParams;
  if (params.get("error")) {
    throw new PublishError("signed_out", params.get("error") === "access_denied" ? "Sign-in was cancelled." : "Signing in didn't work. Try again.");
  }
  const code = params.get("code");
  if (!code || params.get("state") !== state) throw new PublishError("unknown", "Signing in didn't work. Try again.");

  await store(await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier }));
}

let refreshing: Promise<string | null> | null = null;

async function refresh(): Promise<string | null> {
  const { [REFRESH_KEY]: refreshToken } = (await browser.storage.local.get(REFRESH_KEY)) as { [REFRESH_KEY]?: string };
  if (!refreshToken) return null;
  try {
    return await store(await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }));
  } catch (err) {
    if (err instanceof PublishError && err.code === "signed_out") {
      await clearTokens();
      return null;
    }
    throw err;
  }
}

/** A valid access token, refreshing it when needed; null when signed out. */
export async function accessToken(): Promise<string | null> {
  const { [ACCESS_KEY]: access } = (await browser.storage.session.get(ACCESS_KEY)) as { [ACCESS_KEY]?: Tokens };
  if (access && access.expiresAt > Date.now()) return access.accessToken;
  refreshing ??= refresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Drops the access token so the next call refreshes (after a 401). */
export async function expireAccessToken(): Promise<void> {
  await browser.storage.session.remove(ACCESS_KEY);
}

export async function hasSession(): Promise<boolean> {
  const stored = await browser.storage.local.get(REFRESH_KEY);
  return Boolean(stored[REFRESH_KEY]);
}

export async function clearTokens(): Promise<void> {
  await browser.storage.session.remove(ACCESS_KEY);
  await browser.storage.local.remove(REFRESH_KEY);
}

export async function signOut(): Promise<void> {
  const { [REFRESH_KEY]: refreshToken } = (await browser.storage.local.get(REFRESH_KEY)) as { [REFRESH_KEY]?: string };
  await clearTokens();
  if (!refreshToken) return;
  // Best effort: revoke so the connection's token family ends now.
  await fetch(`${config.webUrl}/api/auth/oauth2/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token", client_id: config.clientId }),
    credentials: "omit",
  }).catch(() => undefined);
}
