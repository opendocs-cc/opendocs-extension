import { describe, expect, test } from "vitest";

import { normalizeMath } from "../../src/markdown/math";

describe("normalizeMath", () => {
  test("turns \\( \\) and \\[ \\] into dollar math", () => {
    expect(normalizeMath("Area is \\(\\pi r^2\\).")).toBe("Area is $\\pi r^2$.");
    expect(normalizeMath("Then\n\\[\na^2 + b^2 = c^2\n\\]\nholds.")).toBe("Then\n$$\na^2 + b^2 = c^2\n$$\nholds.");
    expect(normalizeMath("Inline \\[x\\] display.")).toBe("Inline $x$ display.");
  });

  test("leaves code alone", () => {
    const md = "Use `\\(x\\)` or\n\n```tex\n\\[ y \\]\n```";
    expect(normalizeMath(md)).toBe(md);
  });

  test("an unclosed \\( doesn't swallow the next lines", () => {
    expect(normalizeMath("Broken \\(x\nnext \\(y\\)")).toBe("Broken \\(x\nnext $y$");
  });

  test("escapes prices when asked", () => {
    expect(normalizeMath("It costs $40, or $35 to $60.", { escapeCurrency: true })).toBe("It costs \\$40, or \\$35 to \\$60.");
    expect(normalizeMath("Already \\$5 and math \\(x\\)", { escapeCurrency: true })).toBe("Already \\$5 and math $x$");
    expect(normalizeMath("Keep $40 as is.")).toBe("Keep $40 as is.");
  });
});
