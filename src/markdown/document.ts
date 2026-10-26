import { CITE_CLOSE, CITE_OPEN, IMAGE_SCHEME, type ImageSource, type Turn } from "./model";

export type BuildOptions = {
  scope: "answer" | "chat";
  turns: Turn[];
  /** The answer's index in `turns` (answer scope). */
  focus: number;
  /** Put the question above a single answer. Whole chats always show them. */
  includeQuestion: boolean;
  chatTitle: string | null;
};

export type BuiltDocument = {
  title: string;
  markdown: string;
  /** The images the Markdown refers to, by their `opendocs-image:N` reference. */
  images: Array<{ ref: string; source: ImageSource }>;
};

const MAX_TITLE = 120;

/** Plain text of a Markdown heading or line, for titles. */
function plain(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(new RegExp(`${CITE_OPEN}\\d+${CITE_CLOSE}`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(text: string, max = MAX_TITLE): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** A heading on the answer's first line, which then serves as the title. */
function leadingHeading(answer: string): { title: string; rest: string } | null {
  const match = /^\s*(#{1,2})\s+(.+?)\s*#*\s*(?:\n|$)/.exec(answer);
  if (!match) return null;
  const title = plain(match[2]!);
  return title ? { title, rest: answer.slice(match[0].length).replace(/^\s*\n/, "") } : null;
}

function questionTitle(question: string): string | null {
  const firstLine = question.split("\n").map((line) => plain(line)).find(Boolean);
  return firstLine ? shorten(firstLine) : null;
}

function quote(question: string): string {
  const body = question.trim().split("\n").map((line) => (line ? `> ${line}` : ">"));
  return ["> **Question**", ">", ...body].join("\n");
}

/** Top-level headings inside a whole chat become second-level ones. */
function demote(answer: string): string {
  let fence: string | null = null;
  return answer
    .split("\n")
    .map((line) => {
      const marker = /^\s*(```|~~~)/.exec(line)?.[1];
      if (marker) fence = fence === marker ? null : (fence ?? marker);
      return !fence && /^# /.test(line) ? `#${line}` : line;
    })
    .join("\n");
}

type Numbered = { markdown: string; footnotes: string[]; images: BuiltDocument["images"] };

/** Replaces each turn's citation and image tokens with document-wide numbers. */
function resolveTokens(parts: Array<{ text: string; turn: Turn }>): Numbered {
  const footnoteByUrl = new Map<string, number>();
  const footnotes: string[] = [];
  const images: BuiltDocument["images"] = [];
  const imageRefByTurn = new Map<string, string>();
  const citePattern = new RegExp(`${CITE_OPEN}(\\d+)${CITE_CLOSE}`, "g");

  const markdown = parts
    .map(({ text, turn }) => {
      let out = text.replace(citePattern, (_m, index: string) => {
        const source = turn.sources[Number(index)];
        if (!source) return "";
        let number = footnoteByUrl.get(source.url);
        if (!number) {
          number = footnotes.length + 1;
          footnoteByUrl.set(source.url, number);
          const label = source.title.replace(/[[\]]/g, "") || new URL(source.url).hostname;
          footnotes.push(`[^${number}]: [${label}](${source.url})`);
        }
        return `[^${number}]`;
      });
      out = out.replace(new RegExp(`\\(${IMAGE_SCHEME}(\\d+)\\)`, "g"), (_m, index: string) => {
        const source = turn.images[Number(index)];
        if (!source) return "()";
        const key = `${turn.key}:${index}`;
        let ref = imageRefByTurn.get(key);
        if (!ref) {
          ref = `${IMAGE_SCHEME}${images.length}`;
          imageRefByTurn.set(key, ref);
          images.push({ ref, source });
        }
        return `(${ref})`;
      });
      return out;
    })
    .join("\n\n---\n\n");

  return { markdown, footnotes, images };
}

export function buildDocument(options: BuildOptions): BuiltDocument {
  const { turns } = options;
  if (turns.length === 0) throw new Error("No messages to publish.");

  if (options.scope === "answer") {
    const turn = turns[Math.min(Math.max(options.focus, 0), turns.length - 1)]!;
    const heading = leadingHeading(turn.answer);
    const title = heading?.title ?? questionTitle(turn.question) ?? options.chatTitle ?? "Answer";
    const answer = (heading ? heading.rest : turn.answer).trim();
    const text = options.includeQuestion && turn.question.trim() ? `${quote(turn.question)}\n\n${answer}` : answer;
    const numbered = resolveTokens([{ text, turn }]);
    return finish(shorten(title), numbered);
  }

  const title = options.chatTitle?.trim() || questionTitle(turns[0]!.question) || "Chat";
  const parts = turns.map((turn) => ({
    turn,
    text: [turn.question.trim() ? quote(turn.question) : null, demote(turn.answer.trim())].filter(Boolean).join("\n\n"),
  }));
  return finish(shorten(title), resolveTokens(parts));
}

function finish(title: string, numbered: Numbered): BuiltDocument {
  const markdown = [numbered.markdown.trim(), numbered.footnotes.join("\n")].filter(Boolean).join("\n\n") + "\n";
  return { title, markdown, images: numbered.images };
}

/**
 * The Markdown to publish: the title as the first heading, then the body.
 * OpenDocs shows a document's first `#` heading as its title, on the page
 * and in PDF and Word files.
 */
export function withTitle(markdown: string, title: string): string {
  const heading = title.replace(/\s+/g, " ").trim() || "Untitled";
  return `# ${heading}\n\n${markdown}`;
}

/** Swaps image references for uploaded URLs, or for a short note when there's no URL. */
export function placeImages(markdown: string, uploaded: Map<string, string>, note: string): string {
  return markdown.replace(new RegExp(`!\\[([^\\]]*)\\]\\((${IMAGE_SCHEME}\\d+)\\)`, "g"), (_m, alt: string, ref: string) => {
    const url = uploaded.get(ref);
    return url ? `![${alt}](${url})` : `*${note}*`;
  });
}
