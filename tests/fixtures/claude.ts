/**
 * A Claude conversation in the shape of
 * GET /api/organizations/<org>/chat_conversations/<id>?tree=true&rendering_mode=messages&render_all_tools=true
 * (October 2026), written for these tests: a regenerated answer, thinking,
 * LaTeX, an artifact created then updated (with "$&" in the new text), a
 * created file, and the newer Write + Artifact flow.
 */
export const conversation = {
  uuid: "conv-1",
  name: "Mutual NDA for the Halvard pilot",
  current_leaf_message_uuid: "m4",
  chat_messages: [
    {
      uuid: "m1",
      parent_message_uuid: "00000000-0000-4000-8000-000000000000",
      index: 0,
      sender: "human",
      text: "",
      content: [{ type: "text", text: "Draft a one-page mutual NDA." }],
    },
    {
      uuid: "m2-old",
      parent_message_uuid: "m1",
      index: 1,
      sender: "assistant",
      content: [{ type: "text", text: "An earlier draft nobody wanted." }],
    },
    {
      uuid: "m2",
      parent_message_uuid: "m1",
      index: 1,
      sender: "assistant",
      content: [
        { type: "thinking", thinking: "private reasoning" },
        { type: "text", text: "Here is the draft. The penalty is \\(2\\%\\) per month." },
        {
          type: "tool_use",
          name: "artifacts",
          input: { command: "create", id: "nda", type: "text/markdown", title: "Mutual NDA", content: "# Mutual NDA\n\nTerm: one year." },
        },
      ],
    },
    {
      uuid: "m3",
      parent_message_uuid: "m2",
      index: 2,
      sender: "human",
      content: [{ type: "text", text: "Make the term two years, and add a script to count words." }],
    },
    {
      uuid: "m4",
      parent_message_uuid: "m3",
      index: 3,
      sender: "assistant",
      content: [
        { type: "text", text: "Updated, and here's the script. The pilot costs $600 a month, or $480 on an annual plan." },
        { type: "tool_use", name: "artifacts", input: { command: "update", id: "nda", old_str: "one year", new_str: "two years ($& costs)" } },
        { type: "tool_use", name: "create_file", input: { path: "/mnt/user-data/outputs/count.py", file_text: "print(len(open('nda.md').read().split()))\n" } },
        { type: "tool_use", name: "Write", input: { file_path: "/home/claude/summary.md", content: "## Summary\n\nTwo-year term." } },
        { type: "tool_use", name: "Artifact", input: { file_path: "/home/claude/summary.md", description: "Summary" } },
        { type: "tool_result", name: "Artifact", content: [{ type: "text", text: "Published" }] },
      ],
    },
  ],
};
