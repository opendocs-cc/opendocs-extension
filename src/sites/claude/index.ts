import { htmlToMarkdown } from "../../markdown/html";
import { normalizeMath } from "../../markdown/math";
import { hashKey, type Extracted, type ImageSource, type Turn } from "../../markdown/model";
import { after, cookie, pageFetch, ReadError, type AnswerAnchor, type SiteAdapter } from "../types";
import { parseClaude, type ClaudeConversation } from "./parse";

const CHAT_ID = /\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const RESPONSE = '.font-claude-response, .font-claude-message, [data-testid="assistant-message"]';
const USER = '[data-testid="user-message"]';
const COPY = 'button[data-testid="action-bar-copy"]';

export function claudeChatId(pathname: string): string | null {
  return CHAT_ID.exec(pathname)?.[1] ?? null;
}

async function organization(): Promise<string> {
  const fromCookie = cookie("lastActiveOrg");
  if (fromCookie) return fromCookie;
  const orgs = (await (await pageFetch("/api/organizations")).json()) as Array<{ uuid?: string }>;
  const uuid = orgs.find((org) => org.uuid)?.uuid;
  if (!uuid) throw new ReadError("no_org");
  return uuid;
}

async function readApi(chatId: string): Promise<Extracted> {
  const org = await organization();
  const url = `/api/organizations/${encodeURIComponent(org)}/chat_conversations/${chatId}?tree=true&rendering_mode=messages&render_all_tools=true`;
  const conversation = (await (await pageFetch(url)).json()) as ClaudeConversation;
  if (!Array.isArray(conversation?.chat_messages)) throw new ReadError("bad_shape");
  const parsed = parseClaude(conversation);
  return { chatTitle: parsed.title, turns: parsed.turns, reader: "api" };
}

/** The answers on the page, each with its message container. */
function responses(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>(RESPONSE));
  // Keep the outermost match (some layouts nest the classes).
  return all.filter((node) => !all.some((other) => other !== node && other.contains(node)));
}

function readDom(): Extracted {
  const turns: Turn[] = [];
  let question = "";
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`${USER}, ${RESPONSE}`)).filter(
    (node) => node.matches(USER) || responses().includes(node),
  );
  for (const node of nodes) {
    if (node.matches(USER)) {
      question = node.textContent?.trim() ?? "";
      continue;
    }
    const context = { sources: [], images: [] } as Pick<Turn, "sources" | "images">;
    const answer = normalizeMath(htmlToMarkdown(node, context, { remove: ['[data-testid="action-bar"]', "[data-is-streaming] > .absolute"] }));
    if (answer) turns.push({ key: `q-${hashKey(question)}`, ids: [], question, answer, ...context });
  }
  const title = document.title.replace(/\s*[-|]\s*Claude\s*$/i, "").trim();
  return { chatTitle: title && title !== "Claude" ? title : null, turns, reader: "dom" };
}

export const claude: SiteAdapter = {
  id: "claude",

  chatId: () => claudeChatId(location.pathname),

  hasAnswers: () => document.querySelector(RESPONSE) !== null,

  anchors() {
    const answers = responses();
    const copies = Array.from(document.querySelectorAll<HTMLElement>(COPY));
    return answers.map((answer, index): AnswerAnchor => {
      // The copy button that follows this answer, before the next answer starts.
      const next = answers[index + 1];
      const copy = copies.find(
        (button) =>
          answer.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING &&
          (!next || next.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING) &&
          !button.closest(USER),
      );
      return { answer, ids: [], index, inRow: Boolean(copy), place: copy ? after(copy) : after(answer) };
    });
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
      return await (await pageFetch(source.url)).blob();
    } catch {
      return null;
    }
  },
};
