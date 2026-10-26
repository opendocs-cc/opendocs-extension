import { startContent } from "../src/content/runtime";
import { gemini } from "../src/sites/gemini";

export default defineContentScript({
  matches: ["https://gemini.google.com/*"],
  runAt: "document_idle",
  main() {
    startContent(gemini);
  },
});
