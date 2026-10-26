import { browser } from "wxt/browser";
import { useCallback, useEffect, useState } from "react";
import { FilePdfIcon, SignOutIcon } from "@phosphor-icons/react";

import { send, type DestinationChoices, type TabRequest } from "../../src/messages";
import { PublishError, SITE_NAMES, type AuthState, type PublishRecord, type Visibility } from "../../src/types";
import { Mark } from "../../src/ui/Mark";

type TabInfo = { tabId: number; chat: boolean; answers: boolean; needsReload?: boolean } | null;

const CHAT_SITE = /^https:\/\/(?:chatgpt\.com|claude\.ai|gemini\.google\.com)\//;
const SITE_ORIGINS = ["https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*"];

const SITES = [
  { name: "ChatGPT", url: "https://chatgpt.com" },
  { name: "Claude", url: "https://claude.ai" },
  { name: "Gemini", url: "https://gemini.google.com" },
];

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

function expiry(record: PublishRecord): string | null {
  if (record.kind !== "anonymous") return null;
  const hours = Math.max(0, Math.round((new Date(record.expiresAt).getTime() - Date.now()) / 3_600_000));
  return hours <= 1 ? "expires within the hour" : `expires in ${hours} h`;
}

async function activeChat(): Promise<TabInfo> {
  // The panel's own window: "currentWindow" can come back empty from a side panel.
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return null;
  try {
    const reply = (await browser.tabs.sendMessage(tab.id, { type: "ping" } satisfies TabRequest)) as { chat: boolean; answers: boolean };
    return { tabId: tab.id, ...reply };
  } catch {
    // A chat site where the extension isn't running yet (open since before it was installed).
    return tab.url && CHAT_SITE.test(tab.url) ? { tabId: tab.id, chat: true, answers: false, needsReload: true } : null;
  }
}

export function Panel() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [choices, setChoices] = useState<DestinationChoices | null>(null);
  const [recent, setRecent] = useState<PublishRecord[]>([]);
  const [tab, setTab] = useState<TabInfo>(null);
  const [busy, setBusy] = useState(false);
  // Chrome's Site access can be set to "On click"; then nothing runs on the chat sites.
  const [siteAccess, setSiteAccess] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    void browser.permissions.contains({ origins: SITE_ORIGINS }).then(setSiteAccess).catch(() => undefined);
    const [state, records, info] = await Promise.all([
      send({ type: "auth-state" }).catch(() => ({ signedIn: false }) as AuthState),
      send({ type: "recent" }).catch(() => []),
      activeChat(),
    ]);
    setAuth(state);
    setRecent(records);
    setTab(info);
    setChoices(state.signedIn ? await send({ type: "destinations" }).catch(() => null) : null);
  }, []);

  useEffect(() => {
    void refresh();
    const onTab = () => void activeChat().then(setTab);
    browser.tabs.onActivated.addListener(onTab);
    browser.tabs.onUpdated.addListener(onTab);
    const onStorage = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && "publishes" in changes) void send({ type: "recent" }).then(setRecent).catch(() => undefined);
    };
    browser.storage.onChanged.addListener(onStorage);
    return () => {
      browser.tabs.onActivated.removeListener(onTab);
      browser.tabs.onUpdated.removeListener(onTab);
      browser.storage.onChanged.removeListener(onStorage);
    };
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      if (!(err instanceof PublishError && err.message === "Sign-in was cancelled.")) {
        setMessage(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const signIn = () =>
    run(async () => {
      const state = await send({ type: "sign-in" });
      if (state.claimed > 0) setMessage(`${state.claimed === 1 ? "1 document" : `${state.claimed} documents`} moved to your workspace.`);
      await refresh();
    });

  const signOut = () =>
    run(async () => {
      setAuth(await send({ type: "sign-out" }));
      setChoices(null);
    });

  const publishFromPanel = (scope: "chat" | "last-answer") =>
    run(async () => {
      if (!tab) return;
      const reply = (await browser.tabs.sendMessage(tab.tabId, { type: "publish-from-panel", scope } satisfies TabRequest)) as { opened: boolean };
      if (!reply?.opened) setMessage("Open a chat with at least one answer first.");
    });

  const destination = auth?.signedIn ? auth.destination : null;
  const workspace = choices?.workspaces.find((w) => w.id === destination?.workspace.id) ?? null;

  const choose = (patch: { workspaceId?: string; projectId?: string | null; visibility?: Visibility }) =>
    run(async () => {
      if (!choices || !destination) return;
      const ws = choices.workspaces.find((w) => w.id === (patch.workspaceId ?? destination.workspace.id));
      if (!ws) return;
      const projectId = patch.workspaceId ? null : patch.projectId !== undefined ? patch.projectId : (destination.project?.id ?? null);
      const project = ws.projects.find((p) => p.id === projectId) ?? null;
      const state = await send({
        type: "set-destination",
        destination: {
          workspace: { id: ws.id, name: ws.name, slug: ws.slug },
          project: project && !project.isDefault ? { id: project.id, name: project.name, slug: project.slug } : null,
          visibility: patch.visibility ?? destination.visibility,
        },
      });
      setAuth(state);
    });

  return (
    <div className="od-panel">
      <header className="od-panel-head">
        <Mark size={24} />
        <div>
          <h1>OpenDocs</h1>
          <p>Publish AI answers as documents</p>
        </div>
      </header>

      <section className="od-section" aria-labelledby="od-tab">
        <h2 id="od-tab">This tab</h2>
        {!siteAccess ? (
          <>
            <p className="od-muted">OpenDocs needs your permission to show Publish on ChatGPT, Claude and Gemini.</p>
            <button
              type="button"
              className="od-btn od-btn-primary"
              onClick={() =>
                void browser.permissions.request({ origins: SITE_ORIGINS }).then(async (granted) => {
                  setSiteAccess(granted);
                  if (granted && tab) await browser.tabs.reload(tab.tabId);
                  setTimeout(() => void activeChat().then(setTab), 1500);
                })
              }
            >
              Allow on these sites
            </button>
          </>
        ) : tab?.needsReload ? (
          <>
            <p className="od-muted">OpenDocs isn&apos;t running in this tab yet. Reload it to see Publish under each answer.</p>
            <button
              type="button"
              className="od-btn od-btn-primary"
              onClick={() => void browser.tabs.reload(tab.tabId).then(() => setTimeout(() => void activeChat().then(setTab), 1500))}
            >
              Reload this tab
            </button>
          </>
        ) : tab?.answers ? (
          <div className="od-buttons">
            <button type="button" className="od-btn od-btn-primary" disabled={busy} onClick={() => publishFromPanel("chat")}>
              Publish this chat
            </button>
            <button type="button" className="od-btn od-btn-secondary" disabled={busy} onClick={() => publishFromPanel("last-answer")}>
              Publish the last answer
            </button>
          </div>
        ) : (
          <>
            <p className="od-muted">Open a chat, then click Publish under an answer.</p>
            <div className="od-buttons" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {SITES.map((site) => (
                <a key={site.name} className="od-btn od-btn-secondary" href={site.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  {site.name}
                </a>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="od-section" aria-labelledby="od-account">
        <h2 id="od-account">Account</h2>
        {auth === null ? (
          <p className="od-faint">Loading…</p>
        ) : auth.signedIn ? (
          <>
            <div className="od-account">
              <span>
                Signed in{auth.account.username ? <> as <strong>@{auth.account.username}</strong></> : null}
                {auth.account.plan ? <span className="od-faint"> · {auth.account.plan}</span> : null}
              </span>
              <button type="button" className="od-btn od-btn-link" onClick={signOut} disabled={busy}>
                <SignOutIcon size={14} /> Sign out
              </button>
            </div>
            {choices && destination ? (
              <>
                <div>
                  <label className="od-label" htmlFor="od-ws">
                    Workspace
                  </label>
                  <select id="od-ws" className="od-field" value={destination.workspace.id} disabled={busy} onChange={(e) => choose({ workspaceId: e.target.value })}>
                    {choices.workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="od-label" htmlFor="od-project">
                    Project
                  </label>
                  <select
                    id="od-project"
                    className="od-field"
                    value={destination.project?.id ?? workspace?.projects.find((p) => p.isDefault)?.id ?? ""}
                    disabled={busy || !workspace}
                    onChange={(e) => choose({ projectId: e.target.value })}
                  >
                    {(workspace?.projects ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="od-label" htmlFor="od-visibility">
                    Who can see new documents
                  </label>
                  <select
                    id="od-visibility"
                    className="od-field"
                    value={destination.visibility}
                    disabled={busy}
                    onChange={(e) => choose({ visibility: e.target.value as Visibility })}
                  >
                    <option value="workspace">Workspace members</option>
                    <option value="private">Only me</option>
                    <option value="public">Anyone with the link</option>
                  </select>
                </div>
              </>
            ) : (
              <p className="od-faint">Loading your workspaces…</p>
            )}
          </>
        ) : (
          <>
            <p className="od-muted">
              Without an account, links last 24 hours. Sign in to keep documents in your workspace, include images and update them later.
            </p>
            <button type="button" className="od-btn od-btn-primary" onClick={signIn} disabled={busy}>
              Sign in or sign up free
            </button>
          </>
        )}
        {message ? (
          <p className="od-note" role="status" style={{ margin: 0, padding: "9px 10px", borderRadius: 8, background: "var(--od-bg-muted)" }}>
            {message}
          </p>
        ) : null}
      </section>

      <section className="od-section" aria-labelledby="od-recent">
        <h2 id="od-recent">Recent</h2>
        {recent.length === 0 ? (
          <p className="od-faint">Documents you publish from this browser show up here.</p>
        ) : (
          <ul className="od-recent">
            {recent.map((record) => (
              <li key={record.sourceKey}>
                <div style={{ minWidth: 0 }}>
                  <a href={record.url} target="_blank" rel="noreferrer">
                    {record.title}
                  </a>
                  <small>
                    {SITE_NAMES[record.site]} · {ago(record.publishedAt)}
                    {expiry(record) ? `, ${expiry(record)}` : ""}
                  </small>
                </div>
                <button
                  type="button"
                  className="od-icon-btn"
                  aria-label={`Download ${record.title} as PDF`}
                  title="Download PDF"
                  onClick={() => run(async () => void (await send({ type: "download", record, format: "pdf" })))}
                >
                  <FilePdfIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="od-panel-foot">
        <a href="https://docs.opendocs.cc/integrations/browser-extension" target="_blank" rel="noreferrer">
          Help
        </a>
        <a href="https://opendocs.cc/privacy#browser-extension" target="_blank" rel="noreferrer">
          Privacy
        </a>
        <a href="https://opendocs.cc/dashboard" target="_blank" rel="noreferrer">
          Your documents
        </a>
      </footer>
    </div>
  );
}
