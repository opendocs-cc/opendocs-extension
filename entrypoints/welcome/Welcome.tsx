import { useEffect, useState } from "react";
import { CheckCircleIcon, CursorClickIcon, EyeSlashIcon, PushPinIcon, ShieldCheckIcon } from "@phosphor-icons/react";

import { send } from "../../src/messages";
import { Mark } from "../../src/ui/Mark";

/**
 * Opens after install. The store asks extensions that send page content
 * anywhere to say so in their own UI and get agreement first; this page does
 * that (and the first card does it again for anyone who closed this tab).
 */
export function Welcome() {
  const [agreed, setAgreed] = useState<boolean | null>(null);

  useEffect(() => {
    void send({ type: "settings" }).then((s) => setAgreed(s.consented)).catch(() => setAgreed(false));
  }, []);

  const agree = async () => {
    await send({ type: "set-settings", settings: { consented: true } });
    setAgreed(true);
  };

  return (
    <main className="od-welcome">
      <Mark size={40} />
      <h1>Publish AI answers as documents</h1>
      <p className="od-lead">
        Click Publish under any answer on ChatGPT, Claude or Gemini. You get a clean link to share and a PDF.
      </p>

      <section className="od-welcome-card" aria-labelledby="od-data">
        <h2 id="od-data">What the extension reads, and when</h2>
        <ul className="od-points">
          <li>
            <CursorClickIcon size={18} />
            <span>It reads a chat only when you click Publish, and only the chat open in that tab.</span>
          </li>
          <li>
            <ShieldCheckIcon size={18} />
            <span>
              It sends that answer or chat to OpenDocs to make your document, and nothing else. Without an account, the link
              works for 24 hours.
            </span>
          </li>
          <li>
            <EyeSlashIcon size={18} />
            <span>
              It keeps no copies of your chats. If it can&apos;t read a chat, it tells us the site and what failed, never the
              content.
            </span>
          </li>
        </ul>
        {agreed ? (
          <p className="od-done-title" role="status" style={{ display: "flex", gap: 8, alignItems: "center", margin: 0, fontWeight: 600 }}>
            <CheckCircleIcon size={18} weight="fill" style={{ color: "var(--od-accent)" }} />
            You&apos;re all set.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button type="button" className="od-btn od-btn-primary" onClick={agree} disabled={agreed === null}>
              I agree, let&apos;s go
            </button>
            <a className="od-btn od-btn-link" href="https://opendocs.cc/privacy#browser-extension" target="_blank" rel="noreferrer">
              Read the privacy policy
            </a>
          </div>
        )}
      </section>

      <section className="od-welcome-card" aria-labelledby="od-next">
        <h2 id="od-next">Pin it, then try it</h2>
        <ul className="od-points">
          <li>
            <PushPinIcon size={18} />
            <span>
              Click the puzzle icon next to the address bar, then the pin next to OpenDocs. The icon opens a side panel with your
              recent documents and account.
            </span>
          </li>
        </ul>
        <div className="od-sites">
          {[
            ["ChatGPT", "https://chatgpt.com"],
            ["Claude", "https://claude.ai"],
            ["Gemini", "https://gemini.google.com"],
          ].map(([name, url]) => (
            <a key={name} className="od-btn od-btn-secondary" href={url}>
              Open {name}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
