import { readFileSync } from "node:fs";
import { defineConfig } from "wxt";

/**
 * One codebase for Chrome and Edge (Firefox later). The content scripts'
 * three sites are the only host access the extension has, so the install
 * dialog reads "Read and change your data on chatgpt.com, claude.ai, and
 * gemini.google.com". OpenDocs itself is reached through CORS, not host
 * permissions (adding a fourth site would turn that line into "a number of
 * websites").
 *
 * Local builds carry `key` (keys/dev.pub) so the extension ID, and with it
 * the sign-in redirect URL, stays the same as the one OpenDocs knows. Store
 * packages are built with OPENDOCS_STORE_BUILD=1 and leave it out: the
 * stores assign their own ID.
 */
const devKey = readFileSync(new URL("./keys/dev.pub", import.meta.url), "utf8").trim();

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: () => ({
    name: "OpenDocs: Publish ChatGPT, Claude & Gemini chats as PDF & links",
    short_name: "OpenDocs",
    description:
      "Turn any ChatGPT, Claude or Gemini answer or chat into a clean document: a link to share and a PDF. No account needed.",
    homepage_url: "https://opendocs.cc/extension",
    minimum_chrome_version: "116",
    permissions: ["identity", "storage", "sidePanel"],
    action: { default_title: "OpenDocs" },
    ...(process.env.OPENDOCS_STORE_BUILD === "1" ? {} : { key: devKey }),
  }),
  zip: {
    artifactTemplate: "opendocs-extension-{{version}}-{{browser}}.zip",
  },
});
