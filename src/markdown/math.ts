/**
 * Chat apps write LaTeX as `\(…\)` and `\[…\]`; OpenDocs renders `$…$` and
 * `$$…$$` (remark-math + KaTeX). Code spans and fences are left alone.
 */

const CODE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]+`)/g;

export type MathOptions = {
  /**
   * Escape `$` before a number ("$40 a month"). ChatGPT writes math with
   * `\(…\)`, so a bare `$` there is money; left alone, two prices on a line
   * would render as a formula.
   */
  escapeCurrency?: boolean;
};

function convert(text: string, options: MathOptions): string {
  let out = text;
  if (options.escapeCurrency) out = out.replace(/(^|[^\\$\w])\$(?=\d)/g, "$1\\$");
  // Display math on its own line(s) becomes a $$ block.
  out = out.replace(/^([ \t]*)\\\[([\s\S]+?)\\\][ \t]*$/gm, (_m, indent: string, body: string) => {
    const lines = body.trim().split("\n").map((line) => line.trim());
    return `${indent}$$\n${lines.map((line) => indent + line).join("\n")}\n${indent}$$`;
  });
  // Display math inside a sentence stays inline.
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `$${body.trim()}$`);
  // Inline math never spans lines, so an unclosed `\(` can't swallow the rest.
  out = out.replace(/\\\(([^\n]+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`);
  return out;
}

export function normalizeMath(markdown: string, options: MathOptions = {}): string {
  return markdown
    .split(CODE)
    .map((part, i) => (i % 2 === 1 ? part : convert(part, options)))
    .join("");
}
