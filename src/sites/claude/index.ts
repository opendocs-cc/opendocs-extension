import { htmlToMarkdown } from "../../markdown/html";
import { normalizeMath } from "../../markdown/math";
import { hashKey, type Extracted, type ImageSource, type Turn } from "../../markdown/model";
import { after, besideCopy, cookie, COPY_LIKE, pageFetch, ReadError, type AnswerAnchor, type SiteAdapter } from "../types";
import { parseClaude, type ClaudeConversation } from "./parse";

const CHAT_ID = /\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const RESPONSE = '.font-claude-response, .font-claude-message, [data-testid="assistant-message"]';
const USER = '[data-testid="user-message"]';
// Claude dropped the action bar's test ids in October 2026; Copy is found by its label.
const COPY = `button[data-testid="action-bar-copy"], ${COPY_LIKE}`;

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
    const users = Array.from(document.querySelectorAll<HTMLElement>(USER));
    const copies = Array.from(document.querySelectorAll<HTMLElement>(COPY)).filter((button) => !button.closest("pre, code"));
    const within = (start: Element, end: Element | undefined, node: Element) =>
      (start === node || start.contains(node) || start.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (!end || end.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING);
    return answers.map((answer, index): AnswerAnchor => {
      // The answer's own Copy: the last one between the answer and whichever
      // comes first, the next question or the next answer (code blocks and
      // the next question have Copy buttons of their own).
      const nextUser = users.find((user) => answer.compareDocumentPosition(user) & Node.DOCUMENT_POSITION_FOLLOWING && !answer.contains(user));
      const nextAnswer = answers[index + 1];
      const end = [nextUser, nextAnswer]
        .filter((node): node is HTMLElement => Boolean(node))
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
      const copy = copies.filter((button) => within(answer, end, button) && !button.closest(USER)).pop();
      const spot = copy ? besideCopy(copy) : null;
      return { answer, ids: [], index, inRow: Boolean(spot?.row), place: spot ? spot.place : after(answer) };
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
