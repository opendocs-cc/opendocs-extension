import { execSync } from "node:child_process";

import { MOCK_API_PORT } from "./harness";

/** Builds the extension pointed at the mock API (into .output/chrome-mv3-e2e). */
export default function globalSetup() {
  execSync("npx wxt build --mode e2e", {
    stdio: "inherit",
    env: {
      ...process.env,
      WXT_OPENDOCS_API_URL: `http://127.0.0.1:${MOCK_API_PORT}`,
      WXT_OPENDOCS_WEB_URL: `http://127.0.0.1:${MOCK_API_PORT}`,
    },
  });
}
