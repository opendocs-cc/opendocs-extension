// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";

import { buildDocument } from "../../src/markdown/document";
import { gemini, geminiChatId } from "../../src/sites/gemini";

const html = readFileSync(resolve(process.cwd(), "tests/fixtures/gemini.html"), "utf8");

describe("Gemini (page)", () => {
  beforeEach(() => {
    document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
  });

  test("finds the chat id, including on other accounts", () => {
    expect(geminiChatId("/app/c_8f2a91b0c3d4e5f6")).toBe("8f2a91b0c3d4e5f6");
    expect(geminiChatId("/u/1/app/8f2a91b0c3d4e5f6")).toBe("8f2a91b0c3d4e5f6");
    expect(geminiChatId("/app")).toBeNull();
  });

  test("reads turns with math, tables, code and no interface chrome", async () => {
    const read = await gemini.read({ wholeChat: false, onFallback: () => undefined });
    expect(read.reader).toBe("dom");
    expect(read.chatTitle).toBe("Compound interest explained");
    expect(read.turns).toHaveLength(2);
    const [first, second] = read.turns;
    expect(first!.question).toBe("How does compound interest work?\nGive the formula.");
    expect(first!.answer).toContain("## The formula");
    expect(first!.answer).toContain("The amount after $t$ years is:");
    expect(first!.answer).toContain("$$\nA = P\\left(1 + \\frac{r}{n}\\right)^{nt}\n$$");
    expect(first!.answer).toContain("| Year | Balance |");
    expect(first!.answer).toContain("```python\nbalance = 1000 * (1 + 0.05) ** 2\n```");
    expect(first!.answer).toContain("Banks quote this as APY. Rates vary.");
    for (const junk of ["Thinking about", "+1", "[cite", "googleusercontent.com/immersive", "Copy", "A=P(1+r/n)"]) {
      expect(first!.answer).not.toContain(junk);
    }
    expect(second!.images).toEqual([{ url: "https://lh3.googleusercontent.com/chart.png", alt: "Growth chart" }]);
    expect(second!.answer).toContain("![Growth chart](opendocs-image:0)");
  });

  test("anchors match the turns they belong to", async () => {
    const anchors = gemini.anchors();
    const read = await gemini.read({ wholeChat: false, onFallback: () => undefined });
    expect(anchors.map((a) => a.key)).toEqual(read.turns.map((t) => t.key));
  });

  test("a single answer can carry its question", async () => {
    const { turns, chatTitle } = await gemini.read({ wholeChat: false, onFallback: () => undefined });
    const doc = buildDocument({ scope: "answer", turns, focus: 1, includeQuestion: true, chatTitle });
    expect(doc.title).toBe("And with monthly deposits?");
    expect(doc.markdown).toContain("> **Question**\n>\n> And with monthly deposits?");
    expect(doc.images).toHaveLength(1);
  });
});
