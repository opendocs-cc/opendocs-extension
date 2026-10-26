/** Shapes shared by the content scripts, the service worker and the pages. */

export type SiteId = "chatgpt" | "claude" | "gemini";

export const SITE_NAMES: Record<SiteId, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
};

export type Scope = "answer" | "chat";

export type Visibility = "private" | "workspace" | "public";

/** An image the document needs uploaded (signed in only). */
export type ImageAsset = {
  /** The placeholder URL in the Markdown, replaced by the uploaded URL. */
  ref: string;
  /** base64 of the bytes (runtime messages carry JSON). */
  data: string;
  contentType: string;
  filename: string;
};

/** A document ready to publish, built in the content script. */
export type DocumentDraft = {
  site: SiteId;
  /** Identifies the chat and, for one answer, the message: the key for "update the same document". */
  sourceKey: string;
  scope: Scope;
  title: string;
  markdown: string;
  images: ImageAsset[];
};

export type Destination = {
  workspace: { id: string; name: string; slug: string };
  project: { id: string; name: string; slug: string } | null;
  visibility: Visibility;
};

export type Account = {
  username: string | null;
  plan: string | null;
};

export type AuthState = { signedIn: false } | { signedIn: true; account: Account; destination: Destination | null };

/** What the extension remembers about a publish (recent list and update in place). */
export type PublishRecord = {
  sourceKey: string;
  site: SiteId;
  scope: Scope;
  title: string;
  url: string;
  publishedAt: string;
} & (
  | { kind: "anonymous"; anonymousId: string; claimToken: string; expiresAt: string }
  | { kind: "workspace"; postId: string; workspaceId: string }
);

export type PublishResult = {
  record: PublishRecord;
  /** True when an existing document was updated rather than created. */
  updated: boolean;
  /** Images left out (signed out) or that failed to upload. */
  imagesSkipped: number;
};

export type Settings = {
  /** The user agreed to the data notice (welcome page or the first card). */
  consented: boolean;
  /** "Include my question" for single answers. */
  includeQuestion: boolean;
};

/** Error codes the card knows how to explain. */
export type PublishErrorCode =
  | "too_long_anonymous"
  | "rate_limited"
  | "document_limit"
  | "signed_out"
  | "network"
  | "read_failed"
  | "unsupported_chat"
  | "pro_only"
  | "unknown";

export class PublishError extends Error {
  constructor(
    readonly code: PublishErrorCode,
    message: string,
  ) {
    super(message);
  }
}
