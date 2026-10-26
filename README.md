# OpenDocs for Chrome and Edge

Publish any ChatGPT, Claude or Gemini answer, or a whole chat, as a clean
[OpenDocs](https://opendocs.cc) document: a link you can share and a PDF. No
account needed to try it; sign in to keep documents in your workspace, include
images and update them at the same link.

Install it from [opendocs.cc/extension](https://opendocs.cc/extension).

## How it works

- A **Publish** button sits in each answer's action row. It opens a card with
  the title, whether to include your question, where the document goes and
  **Publish**. Switch the card to **Whole chat** to publish the conversation,
  with each question quoted above its answer.
- The toolbar icon opens a side panel: your account, where documents go
  (workspace, project, who can see them), recent publishes, and fallback
  buttons that work even if a site's redesign hides the in-page buttons.
- Without an account, documents are anonymous: anyone with the link can read
  them for 24 hours. Signing in moves this browser's anonymous documents into
  your workspace.

### Reading chats

Each site has a reader in `src/sites/<site>/`:

| Site | Main source | Fallback |
| --- | --- | --- |
| ChatGPT | The conversation data the site itself loads (`/backend-api/conversation/<id>`): the model's own Markdown, the branch on screen, citations, canvases | The rendered page |
| Claude | `/api/organizations/<org>/chat_conversations/<id>`: Markdown blocks and artifacts at their final version | The rendered page |
| Gemini | The rendered page, with math from `data-math` | |

Readers run in the page, with the site's session, and only after a click.
`src/markdown/` turns what they read into the document: LaTeX to `$…$`,
citations to numbered footnotes, images to uploads (signed in) or a note
(signed out), questions as quotes.

When a reader fails, the extension sends OpenDocs a failure ping with the
site, the step and an error code, never content
(`POST /api/v1/extension/events`), so breakage after a site redesign shows up
quickly.

### Talking to OpenDocs

The service worker (`entrypoints/background.ts`) is the only part that holds
tokens or calls OpenDocs. It signs in with OAuth 2.1 and PKCE through
`chrome.identity.launchWebAuthFlow`, using the client metadata document at
`https://opendocs.cc/oauth/clients/browser-extension.json`, and calls
`api.opendocs.cc`, which answers the extension's origin with CORS. The
extension has no host permission for OpenDocs, so the install dialog names
only the three chat sites.

## Permissions

| Permission | Why |
| --- | --- |
| Content scripts on chatgpt.com, claude.ai, gemini.google.com | Show the Publish button and read the chat you publish |
| `identity` | The sign-in window |
| `storage` | Settings, sign-in tokens, recent publishes |
| `sidePanel` | The side panel |

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev          # Chrome with hot reload
npm run build        # .output/chrome-mv3, load it unpacked in chrome://extensions
npm test             # unit tests (Vitest)
npm run test:e2e     # end-to-end (Playwright: builds the extension, runs it in Chromium)
npm run typecheck
```

Development builds carry the `key` in `keys/dev.pub`, so the unpacked
extension always gets the ID `pmpocloilkjljlpelbkngppeaagmaccc`, which
OpenDocs knows (sign-in redirect URL and CORS).

### Against a local OpenDocs stack

Run the OpenDocs web app and API locally, register a sign-in client (Better
Auth only accepts https client metadata URLs, so locally it's a registered
one):

```bash
curl -X POST http://localhost:3150/api/auth/oauth2/register -H 'Content-Type: application/json' \
  -d '{"client_name":"OpenDocs extension (local)","redirect_uris":["https://pmpocloilkjljlpelbkngppeaagmaccc.chromiumapp.org/"],"token_endpoint_auth_method":"none","grant_types":["authorization_code","refresh_token"],"response_types":["code"],"scope":"docs:read docs:write offline_access"}'
```

Copy `.env.example` to `.env.local` with that `client_id`, then `npm run dev`.
`tests/e2e/local-stack.spec.ts` runs the whole flow (anonymous publish, sign
in through the consent page, claim, workspace publish, PDF) against such a
stack.

## Releasing

```bash
npm run release:chrome   # .output/opendocs-extension-<version>-chrome.zip
npm run release:edge     # .output/opendocs-extension-<version>-edge.zip
```

Store packages leave out the development `key`; each store assigns its own
extension ID. When a store ID is new, add it to `EXTENSION_IDS` on the OpenDocs
servers (sign-in redirect and CORS), or to `DEFAULT_EXTENSION_IDS` in
`packages/shared/src/extension/config.ts`. After the first Chrome Web Store
upload, put the store item's public key in `keys/dev.pub` so development builds
share the store ID.

`store/` has the listing text, the privacy answers for each store and the
screenshots (`SCREENSHOTS=1 npx playwright test screenshots`).

## License

MIT
