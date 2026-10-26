import { startContent } from "../src/content/runtime";
import { chatgpt } from "../src/sites/chatgpt";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",
  main() {
    startContent(chatgpt);
  },
});
