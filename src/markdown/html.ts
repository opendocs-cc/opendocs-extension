import TurndownService from "turndown";
import { gfm } from "@joplin/turndown-plugin-gfm";

import { addSource, citeToken, imageToken, type ImageSource, type Source } from "./model";

/**
 * Rendered chat HTML to Markdown, for Gemini and as the fallback when a
 * site's conversation data can't be read. Math comes back as TeX (KaTeX's
 * annotation, or Gemini's data-math), code keeps its language, and the
 * site's own controls (copy buttons, labels for screen readers, chips) are
 * dropped.
 */

export type HtmlOptions = {
  /** Extra elements to drop, as CSS selectors. */
  remove?: string[];
  /** Element → language name for a code block, when the site labels it outside `<code>`. */
  codeLanguage?: (pre: Element) => string | null;
  /** Text to drop wherever it appears (placeholders, citation markers). */
  stripText?: RegExp[];
};

/** Gemini's inline citation markers. */
const CITATION_TEXT = [/\[cite_start\]/g, /\[cite:\s*[\d,\s]+\]/g];

const ALWAYS_REMOVE = [
  "button",
  "script",
  "style",
  "template",
  "noscript",
  ".sr-only",
  ".cdk-visually-hidden",
  "[data-opendocs]",
];

function texOf(node: Element): { tex: string; display: boolean } | null {
  const dataMath = node.getAttribute("data-math");
  if (dataMath != null) {
    const display = node.classList.contains("math-block") || node.tagName.toLowerCase() === "div";
    return { tex: dataMath, display };
  }
  if (node.classList.contains("katex-display") || node.classList.contains("katex")) {
    const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
    if (!annotation?.textContent) return null;
    return { tex: annotation.textContent, display: node.classList.contains("katex-display") };
  }
  return null;
}

function cleanTex(tex: string): string {
  return tex.replace(/\\Vert\{\}/g, "\\|").replace(/\\vert\{\}/g, "|").trim();
}

function languageFromClass(element: Element | null): string | null {
  const match = element?.className && /(?:^|\s)(?:language|lang)-([\w+#.-]+)/.exec(String(element.className));
  return match ? match[1]!.toLowerCase() : null;
}

export function htmlToMarkdown(
  root: Element,
  context: { sources: Source[]; images: ImageSource[] },
  options: HtmlOptions = {},
): string {
  const clone = root.cloneNode(true) as Element;
  // Math first: KaTeX hides its visual layer from screen readers with aria-hidden.
  for (const node of Array.from(clone.querySelectorAll("[data-math], .katex-display, .katex"))) {
    // A .katex inside a .katex-display that was already replaced.
    if (!clone.contains(node)) continue;
    const math = texOf(node);
    if (!math) continue;
    const marker = node.ownerDocument.createElement(math.display ? "div" : "span");
    marker.setAttribute("data-od-math", math.display ? "block" : "inline");
    marker.textContent = cleanTex(math.tex);
    node.replaceWith(marker);
  }
  // Languages first: the labels sit in headers that are removed next.
  if (options.codeLanguage) {
    for (const pre of Array.from(clone.querySelectorAll("pre"))) {
      const language = options.codeLanguage(pre);
      if (language) pre.setAttribute("data-od-lang", language);
    }
  }
  for (const node of Array.from(clone.querySelectorAll([...ALWAYS_REMOVE, '[aria-hidden="true"]', ...(options.remove ?? [])].join(",")))) {
    node.remove();
  }
  const patterns = [...CITATION_TEXT, ...(options.stripText ?? [])];
  const walker = clone.ownerDocument.createTreeWalker(clone, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest("pre, code")) continue;
    let text = node.textContent ?? "";
    for (const pattern of patterns) text = text.replace(pattern, "");
    if (text !== node.textContent) node.textContent = text;
  }

  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    hr: "---",
  });
  service.use(gfm);

  service.addRule("math", {
    filter: (node) => node.nodeType === 1 && (node as Element).hasAttribute("data-od-math"),
    replacement: (_content, node) => {
      const element = node as Element;
      const tex = element.textContent ?? "";
      return element.getAttribute("data-od-math") === "block" ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
    },
  });

  service.addRule("code-block", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) => {
      const pre = node as Element;
      const code = pre.querySelector("code") ?? pre;
      const language = languageFromClass(code) ?? languageFromClass(pre) ?? pre.getAttribute("data-od-lang") ?? "";
      const text = (code.textContent ?? "").replace(/\n$/, "");
      const fence = text.includes("```") ? "~~~~" : "```";
      return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
    },
  });

  service.addRule("image", {
    filter: "img",
    replacement: (_content, node) => {
      const img = node as HTMLImageElement;
      const src = img.getAttribute("src") ?? "";
      if (!src || src.startsWith("data:image/svg")) return "";
      const alt = (img.getAttribute("alt") ?? "").replace(/[[\]\n]/g, " ").trim();
      context.images.push({ url: new URL(src, root.ownerDocument.baseURI).href, alt });
      return `![${alt}](${imageToken(context.images.length - 1)})`;
    },
  });

  // Links whose text is just a number or a site name next to an answer are
  // citation chips; keep them as footnotes rather than inline links.
  service.addRule("citation-chip", {
    filter: (node) => node.nodeName === "A" && (node as Element).hasAttribute("data-od-cite"),
    replacement: (_content, node) => {
      const a = node as HTMLAnchorElement;
      const url = a.getAttribute("href") ?? "";
      if (!/^https?:/i.test(url)) return "";
      return citeToken(addSource(context.sources, { title: a.getAttribute("data-od-cite") || a.textContent?.trim() || url, url }));
    },
  });

  return service
    .turndown(clone as HTMLElement)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
