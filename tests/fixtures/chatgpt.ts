/**
 * A ChatGPT conversation in the shape of GET /backend-api/conversation/<id>
 * (fields as ChatGPT returned them in October 2026), written for these tests:
 * a regenerated answer (the visible branch is the second one), hidden system
 * and context messages, reasoning, web citations, LaTeX, prices, code, an
 * image the model made, and a canvas.
 */

const cite = (...refs: string[]) => `cite${refs.map((r) => `${r}`).join("")}`;

export const conversation = {
  title: "Pricing the Reykjavík pilot",
  current_node: "a2b",
  mapping: {
    root: { id: "root", children: ["sys"] },
    sys: {
      id: "sys",
      parent: "root",
      children: ["ctx"],
      message: {
        id: "sys",
        author: { role: "system" },
        recipient: "all",
        content: { content_type: "text", parts: [""] },
        metadata: { is_visually_hidden_from_conversation: true },
      },
    },
    ctx: {
      id: "ctx",
      parent: "sys",
      children: ["u1"],
      message: {
        id: "ctx",
        author: { role: "user" },
        recipient: "all",
        content: { content_type: "user_editable_context", user_profile: "Lives in Iceland" },
      },
    },
    u1: {
      id: "u1",
      parent: "ctx",
      children: ["t1"],
      message: {
        id: "u1",
        author: { role: "user" },
        recipient: "all",
        content: { content_type: "text", parts: ["What should we charge for the pilot?\nKeep it short."] },
      },
    },
    t1: {
      id: "t1",
      parent: "u1",
      children: ["a1"],
      message: {
        id: "t1",
        author: { role: "assistant" },
        recipient: "all",
        content: { content_type: "thoughts", thoughts: [{ summary: "Pricing", content: "secret reasoning" }] },
      },
    },
    a1: {
      id: "a1",
      parent: "t1",
      children: [],
      message: {
        id: "a1",
        author: { role: "assistant" },
        recipient: "all",
        content: { content_type: "text", parts: ["Old answer that was regenerated."] },
      },
    },
    a2a: {
      id: "a2a",
      parent: "t1",
      children: ["a2b"],
      message: {
        id: "a2a",
        author: { role: "assistant" },
        recipient: "all",
        channel: "final",
        content: {
          content_type: "text",
          parts: [
            `# Pilot pricing\n\nCharge $40 a month per seat ${cite("turn0search3", "turn0search5")}. Comparable tools charge $35 to $60.\n\nBreak-even is at \\(n = \\frac{F}{p - c}\\) seats:\n\n\\[\nn = \\frac{12000}{40 - 8}\n\\]\n\n\`\`\`python\nprint(12000 / (40 - 8))  # \\(not math\\)\n\`\`\``,
          ],
        },
        metadata: {
          content_references: [
            {
              type: "grouped_webpages",
              matched_text: cite("turn0search3", "turn0search5"),
              items: [
                {
                  title: "SaaS pricing benchmarks 2026",
                  url: "https://example.com/benchmarks",
                  supporting_websites: [{ title: "Pricing survey", url: "https://example.org/survey" }],
                },
              ],
            },
            { type: "sources_footnote", sources: [{ title: "ignored", url: "https://ignored.example" }] },
          ],
        },
      },
    },
    a2b: {
      id: "a2b",
      parent: "img",
      children: [],
      message: {
        id: "a2b",
        author: { role: "assistant" },
        recipient: "all",
        content: {
          content_type: "text",
          parts: [`A second source agrees ${cite("turn1search0")}, and the first one again ${cite("turn0search3", "turn0search5")}.【7†(old style)】`],
        },
        metadata: {
          content_references: [
            {
              type: "grouped_webpages",
              matched_text: cite("turn1search0"),
              items: [{ title: "Nordic SaaS report", url: "https://example.net/nordic" }],
            },
            {
              type: "grouped_webpages",
              matched_text: cite("turn0search3", "turn0search5"),
              items: [{ title: "SaaS pricing benchmarks 2026", url: "https://example.com/benchmarks" }],
            },
          ],
        },
      },
    },
    canvas: {
      id: "canvas",
      parent: "a2a",
      children: ["img"],
      message: {
        id: "canvas",
        author: { role: "assistant" },
        recipient: "canmore.create_textdoc",
        content: { content_type: "code", text: '{"name":"Pilot terms","type":"document","content":"..."}' },
      },
    },
    img: {
      id: "img",
      parent: "canvas",
      children: ["a2b"],
      message: {
        id: "img",
        author: { role: "tool", name: "image_gen" },
        recipient: "all",
        content: {
          content_type: "multimodal_text",
          parts: [{ content_type: "image_asset_pointer", asset_pointer: "sediment://file_abc123", width: 1024, height: 1024 }],
        },
      },
    },
  },
};

// The regenerated sibling hangs off the thoughts node; wire the visible branch.
conversation.mapping.t1.children = ["a1", "a2a"];
conversation.mapping.a2a.children = ["canvas"];

export const textdocs = [
  { id: "doc1", title: "Pilot terms", textdoc_type: "document", content: "## Terms\n\nPay within \\(30\\) days.", version: 3 },
  { id: "doc2", title: "calc.py", textdoc_type: "code/python", content: "print(1)", version: 1 },
];
