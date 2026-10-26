import { startContent } from "../src/content/runtime";
import { claude } from "../src/sites/claude";

export default defineContentScript({
  matches: ["https://claude.ai/*"],
  runAt: "document_idle",
  main() {
    startContent(claude);
  },
});
