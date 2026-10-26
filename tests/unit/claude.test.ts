import { describe, expect, test } from "vitest";

import { buildDocument } from "../../src/markdown/document";
import { claudeChatId } from "../../src/sites/claude";
import { claudeBranch, parseClaude, type ClaudeConversation } from "../../src/sites/claude/parse";
import { conversation } from "../fixtures/claude";

const data = conversation as unknown as ClaudeConversation;

describe("Claude", () => {
  test("finds the chat id", () => {
    expect(claudeChatId("/chat/0f3e2d1c-4b5a-4c6d-8e7f-9a0b1c2d3e4f")).toBe("0f3e2d1c-4b5a-4c6d-8e7f-9a0b1c2d3e4f");
    expect(claudeChatId("/new")).toBeNull();
  });

  test("follows the branch that ends at the current leaf", () => {
    expect(claudeBranch(data).map((m) => m.uuid)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  test("two turns, thinking left out, math normalized", () => {
    const { turns, title } = parseClaude(data);
    expect(title).toBe("Mutual NDA for the Halvard pilot");
    expect(turns).toHaveLength(2);
    expect(turns[0]!.question).toBe("Draft a one-page mutual NDA.");
    expect(turns[0]!.answer).toContain("The penalty is $2\\%$ per month.");
    expect(turns[0]!.answer).not.toContain("private reasoning");
    expect(turns[0]!.answer).not.toContain("earlier draft");
    expect(turns[1]!.key).toBe("m4");
  });

  test("artifacts end at their final version, with the answer that last changed them", () => {
    const { turns } = parseClaude(data);
    expect(turns[0]!.answer).not.toContain("## Mutual NDA");
    expect(turns[1]!.answer).toContain("## Mutual NDA\n\n# Mutual NDA\n\nTerm: two years ($& costs).");
    expect(turns[1]!.answer).toContain("## count.py\n\n```python\nprint(len(open('nda.md').read().split()))\n```");
    expect(turns[1]!.answer).toContain("## Summary\n\n## Summary\n\nTwo-year term.");
  });

  test("a whole chat quotes every question and keeps answers in order", () => {
    const { turns, title } = parseClaude(data);
    const doc = buildDocument({ scope: "chat", turns, focus: 0, includeQuestion: true, chatTitle: title });
    expect(doc.title).toBe("Mutual NDA for the Halvard pilot");
    const first = doc.markdown.indexOf("> Draft a one-page mutual NDA.");
    const second = doc.markdown.indexOf("> Make the term two years");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
    expect(doc.markdown).toContain("\n\n---\n\n");
    // Top-level headings inside a whole chat drop a level.
    expect(doc.markdown).toContain("## Mutual NDA\n\n## Mutual NDA");
  });
});
