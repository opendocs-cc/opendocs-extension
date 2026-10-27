import { htmlToMarkdown } from "../../markdown/html";
import { normalizeMath } from "../../markdown/math";
import { hashKey, type Extracted, type ImageSource, type Turn } from "../../markdown/model";
import { actionRow, after, appendTo, cookie, pageFetch, ReadError, type AnswerAnchor, type SiteAdapter } from "../types";
import { appendCanvases, parseConversation, type Conversation } from "./parse";

const CHAT_ID = /\/(?:c|g\/[^/]+\/c)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// The conversation as ChatGPT renders it since its September 2026 redesign:
// a thread of turns, each with message units that carry their message ids,
// user messages in a bubble, and a row of actions under each answer. ChatGPT
// keeps earlier conversations mounted but hidden, so only visible ones count.
const THREAD = "[data-chatgpt-conversation-selection-target]";
const TURN_KEY = "[data-turn-key]";
const UNIT = "[data-chatgpt-search-message-ids]";
const USER_BUBBLE = ".bg-user-message";
const ACTIONS = ".turn-action-controls";

// The layout before the redesign, still used in some views.
const ASSISTANT = '[data-message-author-role="assistant"]';
const USER = '[data-message-author-role="user"]';
const TURN = 'article[data-testid^="conversation-turn"], [data-testid^="conversation-turn"]';
const COPY = 'button[data-testid="copy-turn-action-button"]';

const shown = (element: Element) => (element as HTMLElement).offsetHeight > 0 || (element as HTMLElement).getClientRects().length > 0;

/** An answer on the page: its element, message ids, content and action row. */
type PageAnswer = { element: HTMLElement; ids: string[]; content: HTMLElement; row: Element | null };

function visibleThread(): Element | null {
  return Array.from(document.querySelectorAll(THREAD)).find(shown) ?? null;
}

function outermostUnits(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(UNIT)).filter((unit) => !unit.parentElement?.closest(UNIT));
}

function unitIds(unit: Element): string[] {
  return (unit.getAttribute("data-chatgpt-search-message-ids") ?? "").split(/\s+/).filter(Boolean);
}

function isUserUnit(unit: Element): boolean {
  return unit.matches(USER_BUBBLE) || unit.querySelector(USER_BUBBLE) !== null || unit.closest(USER_BUBBLE) !== null;
}

function redesignedAnswers(thread: Element): PageAnswer[] {
  const turns = Array.from(thread.querySelectorAll<HTMLElement>(TURN_KEY)).filter((turn) => !turn.parentElement?.closest(TURN_KEY));
  if (turns.length === 0) {
    return outermostUnits(thread)
      .filter((unit) => !isUserUnit(unit))
      .map((unit) => ({ element: unit, ids: unitIds(unit), content: unit, row: null }));
  }
  const answers: PageAnswer[] = [];
  for (const turn of turns) {
    const assistant = outermostUnits(turn).filter((unit) => !isUserUnit(unit));
    if (assistant.length === 0) continue;
    // When a turn holds both, the user's row (edit, copy) comes before the
    // answer and the answer's own row after it, once the answer is written.
    const content = assistant[assistant.length - 1]!;
    const row = Array.from(turn.querySelectorAll(ACTIONS))
      .filter((actions) => content.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING)
      .pop() ?? null;
    answers.push({ element: turn, ids: assistant.flatMap(unitIds), content, row });
  }
  return answers;
}

function legacyAnswers(): PageAnswer[] {
  const turns = Array.from(document.querySelectorAll<HTMLElement>(TURN)).filter((turn) => shown(turn) && turn.querySelector(ASSISTANT));
  const containers = turns.length ? turns : Array.from(document.querySelectorAll<HTMLElement>(ASSISTANT)).filter(shown);
  return containers.map((container) => {
    const messages = Array.from(container.querySelectorAll<HTMLElement>(ASSISTANT)).concat(container.matches(ASSISTANT) ? [container] : []);
    const copy = container.querySelector(COPY);
    return {
      element: container,
      ids: messages.map((node) => node.getAttribute("data-message-id")).filter((id): id is string => Boolean(id)),
      content: messages[messages.length - 1] ?? container,
      row: copy ? actionRow(copy) : null,
    };
  });
}

function pageAnswers(): PageAnswer[] {
  const thread = visibleThread();
  const answers = thread ? redesignedAnswers(thread) : [];
  return answers.length ? answers : legacyAnswers();
}

export function chatGptChatId(pathname: string): string | null {
  return CHAT_ID.exec(pathname)?.[1] ?? null;
}

let session: { token: string; account: string | null; at: number } | null = null;

async function auth(): Promise<Record<string, string>> {
  if (!session || Date.now() - session.at > 5 * 60_000) {
    const data = (await (await pageFetch("/api/auth/session")).json()) as { accessToken?: string };
    if (!data.accessToken) throw new ReadError("no_session");
    let account: string | null = null;
    // Team and Enterprise workspaces: the chat lives in the workspace named by the _account cookie.
    const workspace = cookie("_account");
    if (workspace && workspace !== "personal" && workspace !== "default") {
      try {
        const res = await pageFetch("/backend-api/accounts/check/v4-2023-04-27", {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        });
        const accounts = (await res.json()) as { accounts?: Record<string, { account?: { account_id?: string } }> };
        account = accounts.accounts?.[workspace]?.account?.account_id ?? null;
      } catch {
        account = null;
      }
    }
    session = { token: data.accessToken, account, at: Date.now() };
  }
  return {
    Authorization: `Bearer ${session.token}`,
    ...(session.account ? { "Chatgpt-Account-Id": session.account } : {}),
  };
}

async function readApi(chatId: string): Promise<Extracted> {
  const headers = await auth();
  const conversation = (await (await pageFetch(`/backend-api/conversation/${chatId}`, { headers })).json()) as Conversation;
  if (!conversation?.mapping) throw new ReadError("bad_shape");
  const parsed = parseConversation(conversation);
  if (parsed.canvasTurn !== null) {
    try {
      const textdocs = await (await pageFetch(`/backend-api/conversation/${chatId}/textdocs`, { headers })).json();
      appendCanvases(parsed.turns, parsed.canvasTurn, textdocs);
    } catch {
      // The answer is still worth publishing without its canvas.
    }
  }
  return { chatTitle: parsed.title, turns: parsed.turns, reader: "api" };
}

function codeLanguage(pre: Element): string | null {
  // The language label sits in a header above the code.
  const label = pre.querySelector("div > span, .text-token-text-secondary")?.textContent?.trim().toLowerCase();
  return label && /^[\w+#.-]{1,20}$/.test(label) ? label : null;
}

/** The visible messages in order: [isUser, element, ids]. */
function pageMessages(): Array<[boolean, HTMLElement, string[]]> {
  const thread = visibleThread();
  const units = thread ? outermostUnits(thread) : [];
  if (units.length) return units.map((unit) => [isUserUnit(unit), unit, unitIds(unit)]);
  return Array.from(document.querySelectorAll<HTMLElement>(`${USER}, ${ASSISTANT}`))
    .filter(shown)
    .map((node) => [node.matches(USER), node, [node.getAttribute("data-message-id") ?? ""].filter(Boolean)]);
}

function readDom(): Extracted {
  const turns: Turn[] = [];
  let question = "";
  for (const [user, node, ids] of pageMessages()) {
    if (user) {
      question = (node.querySelector(".whitespace-pre-wrap") ?? node.querySelector(USER_BUBBLE) ?? node).textContent?.trim() ?? "";
      continue;
    }
    const content = node.querySelector(".markdown") ?? node;
    const context = { sources: [], images: [] } as Pick<Turn, "sources" | "images">;
    const answer = normalizeMath(htmlToMarkdown(content, context, { codeLanguage, remove: [ACTIONS, "[data-markdown-copy] button"] }));
    if (!answer) continue;
    const id = ids[0] ?? "";
    const last = turns[turns.length - 1];
    if (last && last.question === question && question && last.ids.length) {
      // Several messages in one answer (continuations, tool steps).
      last.answer += `\n\n${answer}`;
      if (id) last.ids.push(id);
      last.sources.push(...context.sources);
      continue;
    }
    turns.push({ key: id || `q-${hashKey(question)}`, ids: id ? [id] : [], question, answer, ...context });
  }
  const title = document.title.replace(/\s*[-|]\s*ChatGPT\s*$/i, "").trim();
  return { chatTitle: title && title !== "ChatGPT" ? title : null, turns, reader: "dom" };
}

export const chatgpt: SiteAdapter = {
  id: "chatgpt",

  chatId: () => chatGptChatId(location.pathname),

  hasAnswers: () => pageAnswers().length > 0,

  anchors() {
    return pageAnswers().map(
      (answer, index): AnswerAnchor => ({
        answer: answer.element,
        ids: answer.ids,
        index,
        row: answer.row,
        place: answer.row ? appendTo(answer.row) : after(answer.content),
      }),
    );
  },

  async read({ onFallback }) {
    const chatId = this.chatId();
    if (chatId) {
      try {
        const extracted = await readApi(chatId);
        if (extracted.turns.length) return extracted;
        onFallback("empty");
      } catch (err) {
        onFallback(err instanceof ReadError ? err.code : "parse_error");
      }
    }
    return readDom();
  },

  async imageBytes(source: ImageSource) {
    try {
      const pointer = /^(?:sediment|file-service):\/\/(.+)$/.exec(source.url);
      if (pointer) {
        const res = await pageFetch(`/backend-api/files/download/${encodeURIComponent(pointer[1]!)}?post_id=&inline=false`, {
          headers: await auth(),
        });
        const data = (await res.json()) as { download_url?: string };
        if (!data.download_url) return null;
        return await (await pageFetch(data.download_url, { credentials: "same-origin" })).blob();
      }
      return await (await pageFetch(source.url)).blob();
    } catch {
      return null;
    }
  },
};
