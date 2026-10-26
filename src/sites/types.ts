import type { Extracted, ImageSource } from "../markdown/model";
import type { SiteId } from "../types";

/** An answer on the page, and where its Publish button goes. */
export type AnswerAnchor = {
  /** The answer's element (the button is tied to it). */
  answer: HTMLElement;
  /** Puts the button in the answer's action row, or right after the answer. */
  place: (button: HTMLElement) => void;
  /** The site's ids for the messages in this answer, when the page shows them. */
  ids: string[];
  /** The answer's turn key, for readers that key turns by their question. */
  key?: string;
  /** Position among the answers on the page. */
  index: number;
  /** False when the action row wasn't found and the button went after the answer instead. */
  inRow: boolean;
};

/**
 * One chat site. Readers try the site's own conversation data first (the
 * model's original Markdown, the whole chat even when the page shows part of
 * it) and fall back to the rendered page.
 */
export interface SiteAdapter {
  id: SiteId;
  /** The open chat's id, or null when the page isn't a chat. */
  chatId(): string | null;
  /** The answers currently on the page. */
  anchors(): AnswerAnchor[];
  /** True when answers are visible, whether or not their action rows were found. */
  hasAnswers(): boolean;
  /** Reads the chat. `onFallback` hears why the data reader failed, for the failure ping. */
  read(options: { wholeChat: boolean; onFallback: (code: string) => void }): Promise<Extracted>;
  /** The bytes of an image in the chat, fetched with the site's session. */
  imageBytes(source: ImageSource): Promise<Blob | null>;
}

export class ReadError extends Error {
  constructor(readonly code: string, message = code) {
    super(message);
  }
}

/** fetch in the page (the site's origin and session), with a timeout and a readable failure. */
export async function pageFetch(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include", ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new ReadError((err as Error)?.name === "TimeoutError" ? "timeout" : "network");
  }
  if (!res.ok) throw new ReadError(`http_${res.status}`);
  return res;
}

export function cookie(name: string): string | null {
  const match = new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`).exec(document.cookie);
  return match ? decodeURIComponent(match[1]!) : null;
}

/** Inserts the button right after `reference` (for action rows). */
export function after(reference: Element): (button: HTMLElement) => void {
  return (button) => reference.insertAdjacentElement("afterend", button);
}
