# Store listing

Copy for the Chrome Web Store and Microsoft Edge Add-ons. Keep each AI app's
name to three mentions or fewer in the description (keyword-spam rules), no
app logos, nothing that suggests the apps endorse OpenDocs.

## Basics

- **Name** (63 of 75 characters): OpenDocs: Publish ChatGPT, Claude & Gemini chats as PDF & links
- **Summary** (118 of 132): Turn any ChatGPT, Claude or Gemini answer or chat into a clean document: a link to share and a PDF. No account needed.
- **Category:** Productivity, Tools
- **Language:** English
- **Homepage:** https://opendocs.cc/extension
- **Support:** https://github.com/opendocs-cc/opendocs-extension/issues (or hello@opendocs.cc)
- **Privacy policy:** https://opendocs.cc/privacy#browser-extension

## Description

Turn an AI answer into a document people can read.

Click Publish under any answer on ChatGPT, Claude or Gemini and you get a clean
OpenDocs page with its own link, and a PDF. No screenshots, no copy and paste,
no broken tables.

WHAT YOU GET
• A link that opens a clean page, not a copy of the chat
• A PDF with the formatting kept, free and without a watermark
• Math rendered properly, on the page and in the PDF
• Tables, code blocks with their language, and headings as they were
• Web sources as numbered footnotes with a list at the end
• One answer, or the whole chat with each of your questions above its answer

NO ACCOUNT NEEDED
Without an account, anyone with the link can read the document for 24 hours.
Sign up free to keep it: the extension moves the documents you published from
this browser into your workspace.

WITH A FREE ACCOUNT
• Documents stay in your workspace, in the project you choose
• Choose who can see them: only you, your workspace, or anyone with the link
• Images come along
• Publish the same answer again to update the document at the same link
• Your logo, colors and font on the PDF
• Word files on Pro

PRIVATE BY DESIGN
• Works only on chatgpt.com, claude.ai and gemini.google.com
• Reads a chat only when you click Publish, and only the chat in that tab
• Sends that answer or chat to OpenDocs to make your document, and nothing else
• Keeps no copies of your chats
• Open source: github.com/opendocs-cc/opendocs-extension

OpenDocs isn't affiliated with OpenAI, Anthropic or Google.

## Edge search terms

ai chat to pdf; save ai answer; share ai chat; export chat to pdf; chat to markdown; ai answer link; publish ai chat

## Privacy practices (Chrome Web Store dashboard)

**Single purpose:**
Publish content from the page you're viewing (an answer or a conversation on an
AI chat site) as an OpenDocs document, with a link and a PDF.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| Host access: chatgpt.com, claude.ai, gemini.google.com (content scripts) | Shows the Publish button under each answer and, when the user clicks it, reads that answer or chat so it can be published. The extension does nothing on any other site. |
| `identity` | Opens the OpenDocs sign-in window (OAuth with PKCE) when the user chooses to sign in. |
| `storage` | Keeps the user's settings, the OpenDocs sign-in tokens and a list of the user's 20 most recent publishes. No chat content is stored. |
| `sidePanel` | The toolbar icon opens a side panel with the account, where documents go, recent publishes and publish buttons. |

**Remote code:** No. All code ships in the package.

**Data the extension collects** (check these):

- **Personal communications:** the chat answer or conversation the user chooses to publish, sent to OpenDocs only when they click Publish.
- **Website content:** the same content, from the chat page.
- **Authentication information:** the OpenDocs sign-in tokens, stored in the extension.
- **Personally identifiable information:** published content may contain it; the side panel shows the OpenDocs username.

Not collected: health, financial and payment information, location, web
history, user activity (clicks, keystrokes), other sites' content.

**Certifications** (check all three):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Assets

| Asset | Size | Status |
| --- | --- | --- |
| Icon | 128 × 128 | `public/icon/128.png` (in the package) |
| Small promo tile | 440 × 280 | `store/promo-440x280.png` |
| Screenshots (up to 5) | 1280 × 800 | Take on the real sites after installing: the button and card on ChatGPT, the whole-chat card on Gemini, the published page, the PDF, the side panel. `store/screenshots/raw/` has drafts of the extension's own UI. |

## Reviewer notes (Chrome "Test instructions")

No account is needed to test. Open a chat on chatgpt.com, claude.ai or
gemini.google.com, click Publish under an answer, then Agree and publish. The
card shows the document's link and a PDF button. Signing in is optional (any
email works; the sign-up page sends a code).
