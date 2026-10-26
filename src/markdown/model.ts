/**
 * What a site reader produces: the chat's turns on the visible branch, each
 * with its question and its answer as Markdown.
 *
 * Citations and images travel as tokens until the document is built:
 *
 * - `cite:N` points at `turn.sources[N]` and becomes a numbered
 *   footnote, numbered across the whole document;
 * - `![alt](opendocs-image:N)` points at `turn.images[N]`, uploaded when the
 *   user is signed in and replaced by a note otherwise.
 */

export type Source = { title: string; url: string };

export type ImageSource = {
  /** Where the bytes are; fetched in the page, with the site's session. */
  url: string;
  alt: string;
};

export type Turn = {
  /** Stable per answer: the site's message id, or a hash of the question. */
  key: string;
  /** Every site message id in the answer, to match the answer that was clicked. */
  ids: string[];
  question: string;
  answer: string;
  sources: Source[];
  images: ImageSource[];
};

export type Extracted = {
  chatTitle: string | null;
  turns: Turn[];
  /** Which reader produced it ("api" or "dom"), for failure pings. */
  reader: "api" | "dom";
};

export const CITE_OPEN = "cite:";
export const CITE_CLOSE = "";
export const IMAGE_SCHEME = "opendocs-image:";

export function citeToken(index: number): string {
  return `${CITE_OPEN}${index}${CITE_CLOSE}`;
}

export function imageToken(index: number): string {
  return `${IMAGE_SCHEME}${index}`;
}

/** Adds a source to a turn's list, reusing an existing entry for the same URL. */
export function addSource(sources: Source[], source: Source): number {
  const existing = sources.findIndex((s) => s.url === source.url);
  if (existing >= 0) return existing;
  sources.push(source);
  return sources.length - 1;
}

/** A short, stable hash for keys (FNV-1a). */
export function hashKey(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
