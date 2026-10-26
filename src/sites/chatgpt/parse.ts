import { normalizeMath } from "../../markdown/math";
import { addSource, citeToken, imageToken, type Source, type Turn } from "../../markdown/model";

/**
 * ChatGPT's conversation data (GET /backend-api/conversation/<id>) to turns.
 *
 * The conversation is a tree (`mapping`): edits and regenerations are
 * sibling branches. The branch on screen is the path from `current_node` up
 * to the root. Text parts are the model's own Markdown, with LaTeX as
 * `\(…\)` and citations as private-use markers explained in each message's
 * `metadata.content_references`.
 */

type Part = string | { content_type?: string; asset_pointer?: string; text?: string };

type Message = {
  id: string;
  author: { role: string; name?: string | null };
  recipient?: string;
  channel?: string | null;
  content: {
    content_type: string;
    parts?: Part[];
    text?: string;
    language?: string;
  };
  metadata?: {
    is_visually_hidden_from_conversation?: boolean;
    content_references?: ContentReference[];
    model_dil_v2?: { fallbackMarkdown?: string };
    aggregate_result?: { messages?: Array<{ message_type?: string; image_url?: string }> };
  };
};

type ContentReference = {
  type?: string;
  matched_text?: string;
  alt?: string;
  url?: string;
  title?: string;
  attribution?: string;
  safe_urls?: string[];
  items?: Array<{ title?: string; url?: string; attribution?: string; supporting_websites?: Array<{ title?: string; url?: string }> }>;
  fallback_items?: Array<{ title?: string; url?: string }>;
};

type Node = { id: string; parent?: string | null; children?: string[]; message?: Message | null };

export type Conversation = {
  title?: string | null;
  current_node?: string | null;
  mapping: Record<string, Node>;
};

const CITATION_MARKER = /cite(?:[^]*)+/gu;
const LEGACY_CITATION = /【[^】]*】/g;
const SKIPPED_TYPES = new Set(["thoughts", "reasoning_recap", "user_editable_context", "model_editable_context", "system_error"]);

function normalizeCitationText(input: string): string {
  return input
    .replace(/[   ⁠]/gu, " ")
    .replace(/[‐-―−]/gu, "-")
    .replace(/[]/gu, "");
}

function referenceSources(ref: ContentReference): Source[] {
  const found: Source[] = [];
  const add = (url?: string, title?: string) => {
    if (url && /^https?:\/\//i.test(url) && !found.some((s) => s.url === url)) found.push({ url, title: title || url });
  };
  for (const item of ref.items ?? []) {
    add(item.url, item.title || item.attribution);
    for (const site of item.supporting_websites ?? []) add(site.url, site.title);
  }
  for (const item of ref.fallback_items ?? []) add(item.url, item.title);
  add(ref.url, ref.title || ref.attribution);
  for (const url of ref.safe_urls ?? []) add(url);
  return found;
}

/** Replaces citation markers with tokens pointing at the turn's sources. */
export function applyCitations(text: string, refs: ContentReference[] | undefined, sources: Source[]): string {
  let out = normalizeCitationText(text);
  const ordered = [...(refs ?? [])]
    .filter((ref) => ref.matched_text && ref.type !== "sources_footnote")
    .sort((a, b) => b.matched_text!.length - a.matched_text!.length);
  for (const ref of ordered) {
    const marker = normalizeCitationText(ref.matched_text!);
    if (!out.includes(marker)) continue;
    const isImage = ref.type === "image_group" || ref.type === "image_v2";
    const replacement = isImage ? "" : referenceSources(ref).map((source) => citeToken(addSource(sources, source))).join("");
    out = out.split(marker).join(replacement);
  }
  return out.replace(CITATION_MARKER, "").replace(LEGACY_CITATION, "");
}

/** The messages on the visible branch, oldest first. */
export function visibleBranch(conversation: Conversation): Message[] {
  const { mapping } = conversation;
  let id = conversation.current_node ?? Object.values(mapping).find((node) => !node.children?.length)?.id ?? null;
  const path: Message[] = [];
  const seen = new Set<string>();
  while (id && mapping[id] && !seen.has(id)) {
    seen.add(id);
    const node = mapping[id]!;
    if (node.message) path.unshift(node.message);
    id = node.parent ?? null;
  }
  return path;
}

function isShown(message: Message): boolean {
  if (message.author.role === "system") return false;
  if (message.recipient && message.recipient !== "all") return false;
  if (message.metadata?.is_visually_hidden_from_conversation) return false;
  return !SKIPPED_TYPES.has(message.content.content_type);
}

function imagePointer(part: Part): string | null {
  return typeof part === "object" && part.content_type === "image_asset_pointer" && part.asset_pointer ? part.asset_pointer : null;
}

function textOf(message: Message): string {
  const fallback = message.metadata?.model_dil_v2?.fallbackMarkdown;
  if (fallback) return fallback.replace(/<escape>([\s\S]*?)<\/escape>/g, "$1");
  return (message.content.parts ?? []).filter((part): part is string => typeof part === "string").join("\n");
}

export type ParsedChatGpt = { title: string | null; turns: Turn[]; canvasTurn: number | null };

type Draft = Turn & { pieces: string[] };

export function parseConversation(conversation: Conversation): ParsedChatGpt {
  const drafts: Draft[] = [];
  let current: Draft | null = null;
  let canvasTurn: number | null = null;

  const start = (question: string): Draft => {
    const turn: Draft = { key: "", ids: [], question, answer: "", sources: [], images: [], pieces: [] };
    drafts.push(turn);
    return turn;
  };

  for (const message of visibleBranch(conversation)) {
    if (message.recipient?.startsWith("canmore.") && current) canvasTurn = drafts.length - 1;
    if (!isShown(message)) continue;
    const role = message.author.role;
    const type = message.content.content_type;

    if (role === "user") {
      current = start(textOf(message).trim());
      continue;
    }
    current ??= start("");

    if (role === "tool") {
      // Tools are shown only for the images they made (image generation, charts).
      const pointers = (message.content.parts ?? []).map(imagePointer).filter((p): p is string => Boolean(p));
      const charts = (message.metadata?.aggregate_result?.messages ?? [])
        .filter((m) => m.message_type === "image" && m.image_url)
        .map((m) => m.image_url!);
      for (const url of [...pointers, ...charts]) {
        current.images.push({ url, alt: "Image" });
        current.pieces.push(`![Image](${imageToken(current.images.length - 1)})`);
      }
      continue;
    }

    if (role !== "assistant") continue;
    current.ids.push(message.id);
    if (type === "text" || type === "multimodal_text") {
      const text = applyCitations(textOf(message), message.metadata?.content_references, current.sources);
      if (text.trim()) current.pieces.push(normalizeMath(text.trim(), { escapeCurrency: true }));
      for (const part of message.content.parts ?? []) {
        const pointer = imagePointer(part);
        if (!pointer) continue;
        current.images.push({ url: pointer, alt: "Image" });
        current.pieces.push(`![Image](${imageToken(current.images.length - 1)})`);
      }
    } else if (type === "code" && message.content.text) {
      current.pieces.push(`\`\`\`${message.content.language && message.content.language !== "unknown" ? message.content.language : ""}\n${message.content.text}\n\`\`\``);
    } else if (type === "tether_quote" && message.content.text) {
      current.pieces.push(message.content.text.split("\n").map((line) => `> ${line}`).join("\n"));
    }
  }

  const turns: Turn[] = [];
  let canvasIndex: number | null = null;
  drafts.forEach(({ pieces, ...turn }, index) => {
    const answer = pieces.join("\n\n");
    if (!answer.trim()) return;
    if (index === canvasTurn) canvasIndex = turns.length;
    turns.push({ ...turn, answer, key: turn.ids[turn.ids.length - 1] ?? `q-${index}` });
  });
  return { title: conversation.title?.trim() || null, turns, canvasTurn: canvasIndex };
}

type Textdoc = { id?: string; title?: string; textdoc_type?: string; content?: string };

/** Appends a chat's canvases (their latest versions) to the answer that made them. */
export function appendCanvases(turns: Turn[], canvasTurn: number | null, textdocs: unknown): void {
  const list = (Array.isArray(textdocs) ? textdocs : (textdocs as { textdocs?: unknown })?.textdocs) as Textdoc[] | undefined;
  if (!Array.isArray(list) || turns.length === 0) return;
  const target = turns[Math.min(canvasTurn ?? turns.length - 1, turns.length - 1)]!;
  for (const doc of list) {
    if (typeof doc?.content !== "string" || !doc.content.trim()) continue;
    const title = doc.title?.trim() || "Canvas";
    const language = /^code\/(.+)$/.exec(doc.textdoc_type ?? "")?.[1];
    const body = language ? `\`\`\`${language === "other" ? "" : language}\n${doc.content.trim()}\n\`\`\`` : normalizeMath(doc.content.trim());
    target.answer += `\n\n## ${title}\n\n${body}`;
  }
}
