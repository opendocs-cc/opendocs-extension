import { describe, expect, test } from "vitest";

import { buildDocument, placeImages, withTitle } from "../../src/markdown/document";
import { chatGptChatId } from "../../src/sites/chatgpt";
import { appendCanvases, parseConversation, visibleBranch, type Conversation } from "../../src/sites/chatgpt/parse";
import { conversation, textdocs } from "../fixtures/chatgpt";

const data = conversation as unknown as Conversation;

describe("ChatGPT", () => {
  test("finds the chat id in every kind of chat URL", () => {
    const id = "6720b1c4-1f2e-8001-a9c3-5d2b8e7f9a10";
    expect(chatGptChatId(`/c/${id}`)).toBe(id);
    expect(chatGptChatId(`/g/g-p-67f1a2b3c4d5-pilot/c/${id}`)).toBe(id);
    expect(chatGptChatId(`/g/g-abc123-writer/c/${id}`)).toBe(id);
    expect(chatGptChatId("/")).toBeNull();
    expect(chatGptChatId("/gpts")).toBeNull();
  });

  test("follows the branch on screen, not the regenerated one", () => {
    const ids = visibleBranch(data).map((m) => m.id);
    expect(ids).toContain("a2a");
    expect(ids).not.toContain("a1");
    expect(ids[ids.length - 1]).toBe("a2b");
  });

  test("one turn: hidden, context and reasoning messages are left out", () => {
    const parsed = parseConversation(data);
    expect(parsed.title).toBe("Pricing the Reykjavík pilot");
    expect(parsed.turns).toHaveLength(1);
    const turn = parsed.turns[0]!;
    expect(turn.question).toBe("What should we charge for the pilot?\nKeep it short.");
    expect(turn.ids).toEqual(["a2a", "a2b"]);
    expect(turn.key).toBe("a2b");
    expect(turn.answer).not.toContain("secret reasoning");
    expect(turn.answer).not.toContain("Old answer");
    expect(parsed.canvasTurn).toBe(0);
  });

  test("builds a clean document with footnotes, math, prices and the image", () => {
    const { turns, title } = parseConversation(data);
    const doc = buildDocument({ scope: "answer", turns, focus: 0, includeQuestion: false, chatTitle: title });
    expect(doc.title).toBe("Pilot pricing");
    expect(doc.markdown).not.toMatch(/^# Pilot pricing/m);
    expect(doc.markdown).toContain("Charge \\$40 a month per seat [^1][^2]. Comparable tools charge \\$35 to \\$60.");
    expect(doc.markdown).toContain("Break-even is at $n = \\frac{F}{p - c}$ seats:");
    expect(doc.markdown).toContain("$$\nn = \\frac{12000}{40 - 8}\n$$");
    expect(doc.markdown).toContain("print(12000 / (40 - 8))  # \\(not math\\)");
    expect(doc.markdown).toContain("A second source agrees [^3], and the first one again [^1].");
    expect(doc.markdown).not.toMatch(/[\uE000-\uF8FF]|【/u);
    expect(doc.markdown).toContain("[^1]: [SaaS pricing benchmarks 2026](https://example.com/benchmarks)");
    expect(doc.markdown).toContain("[^2]: [Pricing survey](https://example.org/survey)");
    expect(doc.markdown).toContain("[^3]: [Nordic SaaS report](https://example.net/nordic)");
    expect(doc.images).toEqual([{ ref: "opendocs-image:0", source: { url: "sediment://file_abc123", alt: "Image" } }]);

    const signedOut = placeImages(doc.markdown, new Map(), "Image not included.");
    expect(signedOut).toContain("*Image not included.*");
    const signedIn = placeImages(doc.markdown, new Map([["opendocs-image:0", "https://assets.opendocs.cc/x.png"]]), "unused");
    expect(signedIn).toContain("![Image](https://assets.opendocs.cc/x.png)");
  });

  test("the published Markdown starts with the title as its heading", () => {
    const { turns, title } = parseConversation(data);
    const doc = buildDocument({ scope: "answer", turns, focus: 0, includeQuestion: false, chatTitle: title });
    expect(withTitle(doc.markdown, "  Pricing  for\nthe pilot ")).toMatch(/^# Pricing for the pilot\n\nCharge/);
  });

  test("the question goes above the answer when asked", () => {
    const { turns, title } = parseConversation(data);
    const doc = buildDocument({ scope: "answer", turns, focus: 0, includeQuestion: true, chatTitle: title });
    expect(doc.markdown.startsWith("> **Question**\n>\n> What should we charge for the pilot?\n> Keep it short.\n\n")).toBe(true);
  });

  test("adds the chat's canvases to the answer that made them", () => {
    const { turns, canvasTurn } = parseConversation(data);
    appendCanvases(turns, canvasTurn, textdocs);
    expect(turns[0]!.answer).toContain("## Pilot terms\n\n## Terms\n\nPay within $30$ days.");
    expect(turns[0]!.answer).toContain("## calc.py\n\n```python\nprint(1)\n```");
  });
});
