import { normalizeMath } from "../../markdown/math";
import { addSource, citeToken, type Turn } from "../../markdown/model";

/**
 * Claude's conversation data
 * (GET /api/organizations/<org>/chat_conversations/<id>?tree=true&rendering_mode=messages&render_all_tools=true)
 * to turns.
 *
 * Messages form a tree through `parent_message_uuid`; the branch on screen
 * ends at `current_leaf_message_uuid`. Assistant messages are typed blocks:
 * `text` (Markdown), `thinking` (left out) and tool calls. Artifacts are
 * rebuilt from their create/update/rewrite calls; the final version goes
 * with the answer that last changed it.
 */

type Block = {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  citations?: Array<{ url?: string; title?: string }>;
};

type ChatMessage = {
  uuid: string;
  parent_message_uuid?: string | null;
  index?: number;
  sender: "human" | "assistant" | string;
  text?: string;
  content?: Block[];
};

export type ClaudeConversation = {
  name?: string | null;
  current_leaf_message_uuid?: string | null;
  chat_messages: ChatMessage[];
};

const ROOT = "00000000-0000-4000-8000-000000000000";

export function claudeBranch(conversation: ClaudeConversation): ChatMessage[] {
  const byId = new Map(conversation.chat_messages.map((m) => [m.uuid, m]));
  const leaf = conversation.current_leaf_message_uuid;
  if (!leaf || !byId.has(leaf)) {
    return [...conversation.chat_messages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }
  const path: ChatMessage[] = [];
  const seen = new Set<string>();
  let id: string | null | undefined = leaf;
  while (id && id !== ROOT && byId.has(id) && !seen.has(id)) {
    seen.add(id);
    const message: ChatMessage = byId.get(id)!;
    path.unshift(message);
    id = message.parent_message_uuid;
  }
  return path;
}

const FENCE_LANGUAGE: Record<string, string> = {
  "application/vnd.ant.react": "jsx",
  "text/html": "html",
  "image/svg+xml": "svg",
  "application/vnd.ant.mermaid": "mermaid",
};

const EXTENSION_LANGUAGE: Record<string, string> = {
  py: "python", js: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx", html: "html", css: "css",
  json: "json", md: "markdown", sh: "bash", sql: "sql", go: "go", rs: "rust", java: "java", rb: "ruby",
  yml: "yaml", yaml: "yaml", svg: "svg", csv: "csv", txt: "",
};

type Artifact = { title: string; type: string; language: string; content: string; turn: number };

function fence(content: string, language: string): string {
  const marker = content.includes("```") ? "~~~~" : "```";
  return `${marker}${language}\n${content.replace(/\n$/, "")}\n${marker}`;
}

function renderArtifact(artifact: Artifact): string {
  const heading = `## ${artifact.title || "Artifact"}`;
  if (artifact.type === "text/markdown") return `${heading}\n\n${normalizeMath(artifact.content.trim())}`;
  const language = artifact.type === "application/vnd.ant.code" ? artifact.language : (FENCE_LANGUAGE[artifact.type] ?? artifact.language ?? "");
  return `${heading}\n\n${fence(artifact.content, language)}`;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseClaude(conversation: ClaudeConversation): { title: string | null; turns: Turn[] } {
  const turns: Array<Turn & { pieces: string[] }> = [];
  const artifacts = new Map<string, Artifact>();
  const written = new Map<string, string>();
  let current: (Turn & { pieces: string[] }) | null = null;

  for (const message of claudeBranch(conversation)) {
    const blocks = message.content?.length ? message.content : [{ type: "text", text: message.text ?? "" }];
    if (message.sender === "human") {
      const question = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n\n").trim();
      current = { key: "", ids: [], question, answer: "", sources: [], images: [], pieces: [] };
      turns.push(current);
      continue;
    }
    if (message.sender !== "assistant") continue;
    if (!current) {
      current = { key: "", ids: [], question: "", answer: "", sources: [], images: [], pieces: [] };
      turns.push(current);
    }
    const turn = current;
    turn.ids.push(message.uuid);
    const turnIndex = turns.length - 1;

    for (const block of blocks) {
      if (block.type === "text" && block.text?.trim()) {
        // Claude writes math as $$…$$ or \(…\), so a $ before a number is money.
        let text = normalizeMath(block.text.trim(), { escapeCurrency: true });
        const cites = (block.citations ?? []).filter((c) => c.url && /^https?:/i.test(c.url));
        if (cites.length) text += cites.map((c) => citeToken(addSource(turn.sources, { url: c.url!, title: c.title || c.url! }))).join("");
        turn.pieces.push(text);
        continue;
      }
      if (block.type !== "tool_use" || !block.input) continue;
      const input = block.input;
      if (block.name === "artifacts") {
        const id = str(input.id) || "artifact";
        const previous = artifacts.get(id);
        const command = str(input.command) || "create";
        const artifact: Artifact = {
          title: str(input.title) || previous?.title || "Artifact",
          type: str(input.type) || previous?.type || "",
          language: str(input.language) || previous?.language || "",
          content: previous?.content ?? "",
          turn: turnIndex,
        };
        if (command === "update" && previous) {
          const oldStr = str(input.old_str);
          const at = artifact.content.indexOf(oldStr);
          if (oldStr && at >= 0) artifact.content = artifact.content.slice(0, at) + str(input.new_str) + artifact.content.slice(at + oldStr.length);
        } else if (typeof input.content === "string") {
          artifact.content = input.content;
        }
        artifacts.set(id, artifact);
      } else if (block.name === "create_file" && typeof input.file_text === "string") {
        const path = str(input.path);
        const name = path.split("/").pop() || "file";
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        turn.pieces.push(`## ${name}\n\n${ext === "md" ? input.file_text.trim() : fence(input.file_text, EXTENSION_LANGUAGE[ext] ?? "")}`);
      } else if (block.name === "Write" && typeof input.content === "string") {
        written.set(str(input.file_path), input.content);
      } else if (block.name === "Artifact" && written.has(str(input.file_path))) {
        const path = str(input.file_path);
        const name = path.split("/").pop() || "artifact";
        const ext = name.split(".").pop()?.toLowerCase() ?? "";
        artifacts.set(`file:${path}`, {
          title: str(input.description) || name,
          type: ext === "md" ? "text/markdown" : "application/vnd.ant.code",
          language: EXTENSION_LANGUAGE[ext] ?? "",
          content: written.get(path)!,
          turn: turnIndex,
        });
      }
    }
  }

  for (const artifact of artifacts.values()) {
    if (artifact.content.trim()) turns[artifact.turn]?.pieces.push(renderArtifact(artifact));
  }

  const result: Turn[] = [];
  turns.forEach(({ pieces, ...turn }, index) => {
    const answer = pieces.join("\n\n");
    if (!answer.trim()) return;
    result.push({ ...turn, answer, key: turn.ids[turn.ids.length - 1] ?? `q-${index}` });
  });
  return { title: conversation.name?.trim() || null, turns: result };
}
