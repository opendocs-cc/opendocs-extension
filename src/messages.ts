import { browser } from "wxt/browser";
import type {
  AuthState,
  Destination,
  DocumentDraft,
  PublishErrorCode,
  PublishRecord,
  PublishResult,
  Settings,
  SiteId,
} from "./types";
import { PublishError } from "./types";

/**
 * Messages to the service worker, which holds the tokens and talks to
 * OpenDocs. Content scripts and the extension's pages never see a token.
 */
export type Request =
  | { type: "auth-state" }
  | { type: "sign-in" }
  | { type: "sign-out" }
  | { type: "publish"; draft: DocumentDraft; mode: "new" | "update" }
  | { type: "previous"; sourceKey: string }
  | { type: "recent" }
  | { type: "download"; record: PublishRecord; format: "pdf" | "docx" }
  | { type: "destinations" }
  | { type: "set-destination"; destination: Destination }
  | { type: "settings" }
  | { type: "set-settings"; settings: Partial<Settings> }
  | { type: "open-side-panel" }
  | { type: "rating-answered" }
  | { type: "failure"; site: SiteId; stage: FailureStage; code: string; extractor?: string };

export type FailureStage = "detect" | "anchors" | "extract-api" | "extract-dom" | "publish" | "signin";

export type DestinationChoices = {
  workspaces: Array<{ id: string; name: string; slug: string; projects: Array<{ id: string; name: string; slug: string; isDefault: boolean }> }>;
  current: Destination | null;
};

export type Responses = {
  "auth-state": AuthState;
  "sign-in": AuthState & { claimed: number };
  "sign-out": AuthState;
  publish: PublishResult;
  previous: PublishRecord | null;
  recent: PublishRecord[];
  download: { opened: true };
  destinations: DestinationChoices;
  "set-destination": AuthState;
  settings: Settings;
  "set-settings": Settings;
  "open-side-panel": { opened: boolean };
  "rating-answered": { answered: true };
  failure: { sent: boolean };
};

type Envelope<T> = { ok: true; value: T } | { ok: false; code: PublishErrorCode; message: string };

export async function send<R extends Request>(request: R): Promise<Responses[R["type"]]> {
  const reply = (await browser.runtime.sendMessage(request)) as Envelope<Responses[R["type"]]> | undefined;
  if (!reply) throw new PublishError("unknown", "The extension didn't answer. Reload the page and try again.");
  if (!reply.ok) throw new PublishError(reply.code, reply.message);
  return reply.value;
}

/** Wraps a handler's result (or error) for sendMessage. */
export function envelope<T>(promise: Promise<T>): Promise<Envelope<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (err: unknown) => {
      if (err instanceof PublishError) return { ok: false as const, code: err.code, message: err.message };
      console.error("[opendocs]", err);
      return {
        ok: false as const,
        code: "unknown" as const,
        message: err instanceof Error ? err.message : "Something went wrong. Try again.",
      };
    },
  );
}

/** Messages from the side panel to a chat tab's content script. */
export type TabRequest = { type: "publish-from-panel"; scope: "chat" | "last-answer" } | { type: "ping" };
