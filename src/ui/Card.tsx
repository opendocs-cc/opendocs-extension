import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowSquareOutIcon, CheckCircleIcon, CopyIcon, FileDocIcon, FilePdfIcon, XIcon } from "@phosphor-icons/react";

import { ANONYMOUS_MAX_BYTES, RATE_URL, STORE } from "../config";
import { buildDocument, withTitle, type BuiltDocument } from "../markdown/document";
import type { Extracted } from "../markdown/model";
import { send } from "../messages";
import type { AnswerAnchor, SiteAdapter } from "../sites/types";
import {
  PublishError,
  SITE_NAMES,
  type AuthState,
  type PublishErrorCode,
  type PublishRecord,
  type PublishResult,
  type Scope,
  type Settings,
  type Visibility,
} from "../types";
import { Mark } from "./Mark";
import { collectImages } from "../content/images";

export type CardProps = {
  site: SiteAdapter;
  /** The answer that was clicked; null when opened from the side panel. */
  anchor: AnswerAnchor | null;
  initialScope: Scope;
  onClose: () => void;
};

type Phase =
  | { name: "reading" }
  | { name: "ready" }
  | { name: "working"; step: string }
  | { name: "done"; result: PublishResult; copied: boolean; rateAnswered?: boolean }
  | { name: "error"; code: PublishErrorCode; message: string };

const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "only you",
  workspace: "workspace members",
  public: "anyone with the link",
};

function timeLeft(expiresAt: string): string {
  const hours = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3_600_000));
  return hours <= 1 ? "the next hour" : `${hours} hours`;
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** Which turn the clicked answer is: by message id, by key, then by position. */
function focusIndex(extracted: Extracted, anchor: AnswerAnchor | null, site: SiteAdapter): number {
  const { turns } = extracted;
  if (!anchor) return turns.length - 1;
  if (anchor.ids.length) {
    const byId = turns.findIndex((turn) => turn.ids.some((id) => anchor.ids.includes(id)));
    if (byId >= 0) return byId;
  }
  if (anchor.key) {
    const byKey = turns.findIndex((turn) => turn.key === anchor.key);
    if (byKey >= 0) return byKey;
  }
  // The page may show only the latest answers of a long chat: count from the end.
  const onPage = site.anchors().length;
  return Math.min(turns.length - 1, Math.max(0, anchor.index + Math.max(0, turns.length - onPage)));
}

function errorMessage(code: string): string {
  switch (code) {
    case "unsupported_chat":
      return "This kind of chat isn't supported yet. We've been told and will look at it.";
    case "read_failed":
      return "Couldn't read this chat. We've been told and will fix it. Reloading the page can help.";
    default:
      return "Something went wrong. Try again.";
  }
}

export function Card({ site, anchor, initialScope, onClose }: CardProps) {
  const [phase, setPhase] = useState<Phase>({ name: "reading" });
  const [scope, setScope] = useState<Scope>(initialScope);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [previous, setPrevious] = useState<PublishRecord | null>(null);
  const [mode, setMode] = useState<"update" | "new">("update");
  const [notice, setNotice] = useState<string | null>(null);
  const readFor = useRef<Scope | null>(null);

  const focus = useMemo(() => (extracted ? focusIndex(extracted, anchor, site) : 0), [extracted, anchor, site]);
  const includeQuestion = scope === "chat" || Boolean(settings?.includeQuestion);

  const doc: BuiltDocument | null = useMemo(() => {
    if (!extracted?.turns.length) return null;
    return buildDocument({ scope, turns: extracted.turns, focus, includeQuestion, chatTitle: extracted.chatTitle });
  }, [extracted, scope, focus, includeQuestion]);

  const sourceKey = useMemo(() => {
    if (!extracted?.turns.length) return null;
    const chat = site.chatId() ?? location.pathname;
    return `${site.id}:${chat}:${scope === "chat" ? "chat" : extracted.turns[focus]!.key}`;
  }, [extracted, scope, focus, site]);

  // Read the chat (only now, because the user clicked), plus account and settings.
  useEffect(() => {
    let cancelled = false;
    if (readFor.current === scope && extracted) return;
    setPhase({ name: "reading" });
    const wholeChat = scope === "chat";
    Promise.all([
      site.read({
        wholeChat,
        onFallback: (code) => void send({ type: "failure", site: site.id, stage: "extract-api", code }).catch(() => undefined),
      }),
      settings ? Promise.resolve(settings) : send({ type: "settings" }),
      auth ? Promise.resolve(auth) : send({ type: "auth-state" }).catch(() => ({ signedIn: false }) as AuthState),
    ])
      .then(([read, loadedSettings, loadedAuth]) => {
        if (cancelled) return;
        setSettings(loadedSettings);
        setAuth(loadedAuth);
        readFor.current = scope;
        if (!read.turns.length) {
          void send({ type: "failure", site: site.id, stage: "extract-dom", code: "empty", extractor: read.reader }).catch(() => undefined);
          setPhase({ name: "error", code: "read_failed", message: errorMessage("read_failed") });
          return;
        }
        setExtracted(read);
        setPhase({ name: "ready" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const code = err instanceof Error ? err.message.slice(0, 60) : "unknown";
        void send({ type: "failure", site: site.id, stage: "extract-dom", code: code.replace(/[^\w.:-]/g, "_") || "error" }).catch(() => undefined);
        setPhase({ name: "error", code: "read_failed", message: errorMessage("read_failed") });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    if (doc && !titleEdited) setTitle(doc.title);
  }, [doc, titleEdited]);

  useEffect(() => {
    if (!sourceKey) return;
    void send({ type: "previous", sourceKey })
      .then((record) => {
        setPrevious(record);
        setMode(record ? "update" : "new");
      })
      .catch(() => setPrevious(null));
  }, [sourceKey]);

  // Escape closes, except while publishing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase.name !== "working") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase.name, onClose]);

  const signedIn = auth?.signedIn === true;
  const tooLong = !signedIn && doc ? new TextEncoder().encode(withTitle(doc.markdown, title)).byteLength > ANONYMOUS_MAX_BYTES : false;

  const copy = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, []);

  const publish = useCallback(async () => {
    if (!doc || !sourceKey || !settings) return;
    try {
      if (!settings.consented) setSettings(await send({ type: "set-settings", settings: { consented: true } }));
      let images: Awaited<ReturnType<typeof collectImages>> = [];
      if (signedIn && doc.images.length) {
        setPhase({ name: "working", step: "Getting the images…" });
        images = await collectImages(site, doc.images);
      }
      setPhase({ name: "working", step: mode === "update" && previous ? "Updating the document…" : "Publishing…" });
      const result = await send({
        type: "publish",
        mode: previous && mode === "update" ? "update" : "new",
        draft: {
          site: site.id,
          sourceKey,
          scope,
          title: title.trim() || doc.title,
          markdown: withTitle(doc.markdown, title.trim() || doc.title),
          images,
        },
      });
      setPrevious(result.record);
      const copied = await copy(result.record.url);
      setPhase({ name: "done", result, copied });
    } catch (err) {
      const error = err instanceof PublishError ? err : new PublishError("unknown", "Something went wrong. Try again.");
      if (error.code === "signed_out") setAuth({ signedIn: false });
      if (error.code === "unknown" || error.code === "network") {
        void send({ type: "failure", site: site.id, stage: "publish", code: error.code }).catch(() => undefined);
      }
      setPhase({ name: "error", code: error.code, message: error.message });
    }
  }, [doc, sourceKey, settings, signedIn, site, mode, previous, scope, title, copy]);

  const signIn = useCallback(async () => {
    setNotice(null);
    try {
      const state = await send({ type: "sign-in" });
      setAuth(state);
      if (state.claimed > 0) {
        setNotice(`Signed in. ${state.claimed === 1 ? "Your document moved" : `${state.claimed} documents moved`} to your workspace.`);
      } else {
        setNotice("Signed in.");
      }
      if (sourceKey) {
        const record = await send({ type: "previous", sourceKey });
        setPrevious(record);
        if (phase.name === "done" && record) setPhase({ ...phase, result: { ...phase.result, record } });
      }
      if (phase.name === "error") setPhase({ name: "ready" });
    } catch (err) {
      if (err instanceof PublishError && err.message !== "Sign-in was cancelled.") setNotice(err.message);
    }
  }, [sourceKey, phase]);

  const download = useCallback(async (record: PublishRecord, format: "pdf" | "docx") => {
    try {
      await send({ type: "download", record, format });
    } catch (err) {
      setNotice(err instanceof PublishError ? err.message : "The download didn't start. Try again.");
    }
  }, []);

  const answerRating = useCallback(() => {
    void send({ type: "rating-answered" }).catch(() => undefined);
    setPhase((current) => (current.name === "done" ? { ...current, rateAnswered: true } : current));
  }, []);

  const changeDestination = useCallback(async () => {
    const { opened } = await send({ type: "open-side-panel" }).catch(() => ({ opened: false }));
    if (!opened) setNotice("Click the OpenDocs icon in your browser's toolbar to choose where documents go.");
  }, []);

  const head = (
    <div className="od-card-head">
      <Mark />
      <h2 id="od-card-title">Publish to OpenDocs</h2>
      <button type="button" className="od-icon-btn" onClick={onClose} aria-label="Close" disabled={phase.name === "working"}>
        <XIcon size={16} weight="bold" />
      </button>
    </div>
  );

  if (phase.name === "reading") {
    return (
      <div className="od-stack" aria-busy="true">
        {head}
        <div className="od-skeleton" aria-label={`Reading the ${SITE_NAMES[site.id]} chat`}>
          <span style={{ width: "40%" }} />
          <span />
          <span style={{ width: "85%" }} />
          <span style={{ width: "60%" }} />
        </div>
      </div>
    );
  }

  if (phase.name === "error") {
    const canSignIn = !signedIn && (phase.code === "too_long_anonymous" || phase.code === "rate_limited" || phase.code === "signed_out");
    return (
      <div className="od-stack">
        {head}
        <p className="od-error" role="alert">
          <strong>Not published</strong>
          {phase.message}
        </p>
        {notice ? <p className="od-note">{notice}</p> : null}
        <div className="od-actions">
          {canSignIn ? (
            <button type="button" className="od-btn od-btn-primary" onClick={signIn}>
              Sign in
            </button>
          ) : null}
          {phase.code !== "read_failed" ? (
            <button type="button" className={`od-btn ${canSignIn ? "od-btn-secondary" : "od-btn-primary"}`} onClick={() => setPhase({ name: "ready" })}>
              Back
            </button>
          ) : (
            <button type="button" className="od-btn od-btn-secondary" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase.name === "done") {
    const { record, updated, imagesSkipped } = phase.result;
    return (
      <div className="od-stack">
        {head}
        <p className="od-done-title" role="status">
          <CheckCircleIcon size={18} weight="fill" />
          {updated ? "Updated" : "Published"}.{phase.copied ? " Link copied." : ""}
        </p>
        <div className="od-link">
          <a href={record.url} target="_blank" rel="noreferrer">
            {shortUrl(record.url)}
          </a>
          <button
            type="button"
            className="od-icon-btn"
            aria-label="Copy link"
            onClick={async () => setPhase({ ...phase, copied: await copy(record.url) })}
          >
            <CopyIcon size={15} />
          </button>
        </div>
        <div className="od-actions">
          <a className="od-btn od-btn-primary" href={record.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <ArrowSquareOutIcon size={15} weight="bold" />
            Open
          </a>
          <button type="button" className="od-btn od-btn-secondary" onClick={() => download(record, "pdf")}>
            <FilePdfIcon size={15} />
            PDF
          </button>
          {record.kind === "workspace" ? (
            <button type="button" className="od-btn od-btn-secondary" onClick={() => download(record, "docx")}>
              <FileDocIcon size={15} />
              Word
            </button>
          ) : null}
        </div>
        {record.kind === "anonymous" ? (
          <p className="od-note">
            Anyone with the link can read it for {timeLeft(record.expiresAt)}.{" "}
            <button type="button" className="od-btn od-btn-link" onClick={signIn}>
              Keep it: sign up free
            </button>
          </p>
        ) : null}
        {imagesSkipped > 0 ? (
          <p className="od-small">
            {imagesSkipped === 1 ? "One image was" : `${imagesSkipped} images were`} left out
            {record.kind === "anonymous" ? ". Sign in to keep images." : " because they couldn't be read."}
          </p>
        ) : null}
        {notice ? <p className="od-small">{notice}</p> : null}
        {phase.result.askToRate && !phase.rateAnswered ? (
          <p className="od-rate">
            <span>
              Finding it useful?{" "}
              <a className="od-btn-link" href={RATE_URL} target="_blank" rel="noreferrer" onClick={answerRating}>
                Rate it in the {STORE.name}
              </a>
            </span>
            <button type="button" className="od-icon-btn" aria-label="Don't ask again" title="Don't ask again" onClick={answerRating}>
              <XIcon size={13} weight="bold" />
            </button>
          </p>
        ) : null}
      </div>
    );
  }

  const working = phase.name === "working";
  const destination = auth?.signedIn ? auth.destination : null;
  const consentNeeded = settings ? !settings.consented : false;

  return (
    <div className="od-stack">
      {head}
      <div className="od-seg" role="group" aria-label="What to publish">
        <button type="button" aria-pressed={scope === "answer"} disabled={working} onClick={() => setScope("answer")}>
          {anchor ? "This answer" : "Last answer"}
        </button>
        <button type="button" aria-pressed={scope === "chat"} disabled={working} onClick={() => setScope("chat")}>
          Whole chat
        </button>
      </div>

      <div>
        <label className="od-label" htmlFor="od-title">
          Title
        </label>
        <input
          id="od-title"
          className="od-field"
          value={title}
          maxLength={255}
          disabled={working}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleEdited(true);
          }}
        />
      </div>

      {scope === "answer" ? (
        <div className="od-row">
          <span id="od-question-label">Include my question</span>
          <button
            type="button"
            role="switch"
            className="od-switch"
            aria-labelledby="od-question-label"
            aria-checked={includeQuestion}
            disabled={working}
            onClick={async () => setSettings(await send({ type: "set-settings", settings: { includeQuestion: !includeQuestion } }))}
          />
        </div>
      ) : (
        <p className="od-small">Each question appears above its answer.</p>
      )}

      {destination ? (
        <p className="od-note">
          Goes to <strong>{destination.project ? `${destination.workspace.name} / ${destination.project.name}` : destination.workspace.name}</strong>, seen
          by {VISIBILITY_LABEL[destination.visibility]}.{" "}
          <button type="button" className="od-btn od-btn-link" onClick={changeDestination}>
            Change
          </button>
        </p>
      ) : (
        <p className="od-note">
          Anyone with the link can read it for 24 hours.{" "}
          <button type="button" className="od-btn od-btn-link" onClick={signIn} disabled={working}>
            Sign in
          </button>{" "}
          to keep it in your workspace.
        </p>
      )}

      {previous ? (
        <div className="od-choice" role="radiogroup" aria-label="Published before">
          <p>Published {ago(previous.publishedAt)}.</p>
          <label>
            <input type="radio" name="od-mode" checked={mode === "update"} disabled={working} onChange={() => setMode("update")} />
            Update it (same link)
          </label>
          <label>
            <input type="radio" name="od-mode" checked={mode === "new"} disabled={working} onChange={() => setMode("new")} />
            New document
          </label>
        </div>
      ) : null}

      {tooLong ? (
        <p className="od-error" role="alert">
          <strong>Too long without an account</strong>
          Sign in (it&apos;s free) to publish this.
        </p>
      ) : null}

      {working ? (
        <div className="od-stack" style={{ gap: 6 }} aria-live="polite">
          <div className="od-progress" />
          <p className="od-small">{phase.step}</p>
        </div>
      ) : tooLong ? (
        <button type="button" className="od-btn od-btn-primary" onClick={signIn}>
          Sign in to publish
        </button>
      ) : (
        <button type="button" className="od-btn od-btn-primary" onClick={publish} disabled={!doc}>
          {consentNeeded ? "Agree and publish" : previous && mode === "update" ? "Update" : "Publish"}
        </button>
      )}

      {consentNeeded && !working ? (
        <p className="od-small">
          Publishing sends this {scope === "chat" ? "chat" : "answer"} to OpenDocs to make your document. The extension reads a chat
          only when you click.{" "}
          <a href="https://opendocs.cc/privacy#browser-extension" target="_blank" rel="noreferrer">
            Privacy
          </a>
        </p>
      ) : null}
      {notice ? <p className="od-small">{notice}</p> : null}
    </div>
  );
}
