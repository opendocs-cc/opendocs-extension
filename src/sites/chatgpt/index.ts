import { htmlToMarkdown } from "../../markdown/html";
import { normalizeMath } from "../../markdown/math";
import { hashKey, type Extracted, type ImageSource, type Turn } from "../../markdown/model";
import { after, cookie, pageFetch, ReadError, type AnswerAnchor, type SiteAdapter } from "../types";
import { appendCanvases, parseConversation, type Conversation } from "./parse";

const CHAT_ID = /\/(?:c|g\/[^/]+\/c)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const ASSISTANT = '[data-message-author-role="assistant"]';
const USER = '[data-message-author-role="user"]';
const TURN = 'article[data-testid^="conversation-turn"], [data-testid^="conversation-turn"]';
const COPY = 'button[data-testid="copy-turn-action-button"]';

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

function readDom(): Extracted {
  const turns: Turn[] = [];
  let question = "";
  for (const node of Array.from(document.querySelectorAll<HTMLElement>(`${USER}, ${ASSISTANT}`))) {
    if (node.matches(USER)) {
      question = (node.querySelector(".whitespace-pre-wrap") ?? node).textContent?.trim() ?? "";
      continue;
    }
    const content = node.querySelector(".markdown") ?? node;
    const context = { sources: [], images: [] } as Pick<Turn, "sources" | "images">;
    const answer = normalizeMath(htmlToMarkdown(content, context, { codeLanguage }));
    if (!answer) continue;
    const id = node.getAttribute("data-message-id") ?? "";
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

  hasAnswers: () => document.querySelector(ASSISTANT) !== null,

  anchors() {
    const anchors: AnswerAnchor[] = [];
    const turns = Array.from(document.querySelectorAll<HTMLElement>(TURN)).filter((turn) => turn.querySelector(ASSISTANT));
    const containers = turns.length ? turns : Array.from(document.querySelectorAll<HTMLElement>(ASSISTANT));
    containers.forEach((container, index) => {
      const ids = Array.from(container.querySelectorAll(ASSISTANT))
        .concat(container.matches(ASSISTANT) ? [container] : [])
        .map((node) => node.getAttribute("data-message-id"))
        .filter((id): id is string => Boolean(id));
      const copy = container.querySelector(COPY);
      const lastMessage = Array.from(container.querySelectorAll(ASSISTANT)).pop() ?? container;
      anchors.push({ answer: container, ids, index, inRow: Boolean(copy), place: copy ? after(copy) : after(lastMessage) });
    });
    return anchors;
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
