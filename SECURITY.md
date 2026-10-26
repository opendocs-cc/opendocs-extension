# Security

Please report vulnerabilities privately to hello@opendocs.cc, or through
GitHub's **Report a vulnerability** button on this repository. Don't open a
public issue for a security problem.

Include what you found, how to reproduce it and the extension's version
(chrome://extensions). We'll reply as soon as we can and keep you posted until
it's fixed.

How the extension handles data:

- It runs only on chatgpt.com, claude.ai and gemini.google.com, and reads a
  chat only when you click Publish.
- It reads the chat in the page, with your existing session on that site. Your
  chat site's credentials never leave the page and are never stored or sent to
  OpenDocs.
- OpenDocs sign-in tokens live in the extension's service worker storage
  (`storage.session` for the access token, `storage.local` for the refresh
  token, restricted to the extension's own pages). Content scripts never see
  them.
- It talks only to `opendocs.cc` (sign-in) and `api.opendocs.cc`.
