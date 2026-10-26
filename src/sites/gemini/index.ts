import { htmlToMarkdown } from "../../markdown/html";
import { hashKey, type Extracted, type ImageSource, type Turn } from "../../markdown/model";
import { after, besideCopy, pageFetch, type AnswerAnchor, type SiteAdapter } from "../types";

/**
 * Gemini, read from the page: its conversation data is positional arrays
 * that change without notice, so the rendered answer (with math kept in
 * `data-math`) is the steadier source. Older turns load as you scroll up, so
 * a whole chat scrolls to the top first.
 */

const CHAT_ID = /\/app\/(?:c_)?([A-Za-z0-9_-]{8,})/;
const TURN = "div.conversation-container, .conversation-container";
const RESPONSE = "model-response";
const ANSWER_BODY = "message-content .markdown, model-response-content .markdown, .model-response-text .markdown, message-content, model-response-content";
const QUESTION = "user-query .query-text, user-query";
const COPY = 'button[data-test-id="copy-button"], button[aria-label="Copy"], button[mattooltip="Copy response"], copy-button button';
const SCROLLER = '[data-test-id="chat-history-container"], infinite-scroller.chat-history, .chat-history-scroll-container';

const REMOVE = [
  "thought-container",
  "thought-box",
  ".model-thought",
  "follow-up",
  "elicitations",
  "mini-app",
  "[hide-from-message-actions]",
  "immersive-entry-chip",
  "sources-carousel-inline",
  "sources-carousel",
  "source-footnote",
  ".source-footnote",
  "sup.superscript",
  ".code-block-decoration",
  ".code-result-container",
  "message-actions",
];

const CHIP_PLACEHOLDER =
  /https?:\/\/googleusercontent\.com\/(?:immersive_entry_chip|deep_research[\w-]*|image_generation_content|youtube_content|card_content|[a-z_]+_content)\/\d+/g;

export function geminiChatId(pathname: string): string | null {
  return CHAT_ID.exec(pathname)?.[1] ?? null;
}

function codeLanguage(pre: Element): string | null {
  // The header holds the language label and a copy button; read the label only.
  const header = pre.closest("code-block")?.querySelector(".code-block-decoration");
  const label = (header?.querySelector("span") ?? header?.firstChild)?.textContent?.trim().toLowerCase();
  return label && /^[\w+#.-]{1,20}$/.test(label) ? label : null;
}

function questionOf(turn: Element): string {
  const lines = Array.from(turn.querySelectorAll(".query-text-line"));
  if (lines.length) return lines.map((line) => line.textContent?.trim() ?? "").join("\n").trim();
  return turn.querySelector(QUESTION)?.textContent?.trim() ?? "";
}

/** Turn keys from the question, numbered when the same question was asked again. */
function turnKeys(containers: Element[]): Map<Element, string> {
  const seen = new Map<string, number>();
  const keys = new Map<Element, string>();
  for (const container of containers) {
    const hash = hashKey(questionOf(container));
    const n = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, n);
    keys.set(container, `g-${hash}${n > 1 ? `-${n}` : ""}`);
  }
  return keys;
}

function readTurns(): Turn[] {
  const containers = Array.from(document.querySelectorAll<HTMLElement>(TURN));
  const keys = turnKeys(containers);
  const turns: Turn[] = [];
  containers.forEach((container) => {
    const response = container.querySelector(RESPONSE);
    const body = response?.querySelector(ANSWER_BODY);
    if (!body) return;
    const question = questionOf(container);
    const context = { sources: [], images: [] } as Pick<Turn, "sources" | "images">;
    const answer = htmlToMarkdown(body, context, { remove: REMOVE, codeLanguage, stripText: [CHIP_PLACEHOLDER] });
    if (!answer) return;
    turns.push({ key: keys.get(container)!, ids: [], question, answer, ...context });
  });
  return turns;
}

/** Scrolls the chat to the top until no older turns load (or 20 seconds pass). */
async function loadWholeChat(): Promise<void> {
  const scroller = document.querySelector<HTMLElement>(SCROLLER);
  if (!scroller) return;
  const keep = scroller.scrollTop;
  let count = document.querySelectorAll(TURN).length;
  let unchanged = 0;
  const deadline = Date.now() + 20_000;
  while (unchanged < 3 && Date.now() < deadline) {
    scroller.scrollTop = 0;
    await new Promise((resolve) => setTimeout(resolve, 700));
    const now = document.querySelectorAll(TURN).length;
    unchanged = now === count ? unchanged + 1 : 0;
    count = now;
  }
  scroller.scrollTop = keep;
}

function chatTitle(): string | null {
  const title =
    document.querySelector('[data-test-id="conversation-title"]')?.textContent?.trim() ||
    document.title.replace(/\s*[-|]\s*(?:Google\s+)?Gemini\s*$/i, "").trim();
  return title && !/^(?:google\s+)?gemini$/i.test(title) ? title : null;
}

export const gemini: SiteAdapter = {
  id: "gemini",

  chatId: () => geminiChatId(location.pathname),

  hasAnswers: () => document.querySelector(RESPONSE) !== null,

  anchors() {
    const keys = turnKeys(Array.from(document.querySelectorAll(TURN)));
    return Array.from(document.querySelectorAll<HTMLElement>(RESPONSE)).map((answer, index): AnswerAnchor => {
      const copy = answer.querySelector(COPY) ?? answer.parentElement?.querySelector(COPY) ?? null;
      const spot = copy ? besideCopy(copy) : null;
      const body = answer.querySelector(ANSWER_BODY) ?? answer;
      const container = answer.closest(TURN);
      return {
        answer,
        ids: [],
        index,
        key: container ? keys.get(container) : undefined,
        inRow: Boolean(spot?.row),
        place: spot ? spot.place : after(body),
      };
    });
  },

  async read({ wholeChat }) {
    if (wholeChat) await loadWholeChat();
    return { chatTitle: chatTitle(), turns: readTurns(), reader: "dom" };
  },

  async imageBytes(source: ImageSource) {
    try {
      return await (await pageFetch(source.url)).blob();
    } catch {
      return null;
    }
  },
};
