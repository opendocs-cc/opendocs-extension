import { browser } from "wxt/browser";
import { createRoot, type Root } from "react-dom/client";

import { send, type TabRequest } from "../messages";
import type { AnswerAnchor, SiteAdapter } from "../sites/types";
import type { Scope } from "../types";
import { Card } from "../ui/Card";
import cardCss from "../ui/card.css?inline";
import { MARK_DATA_URL } from "../ui/Mark";
import themeCss from "../ui/theme.css?inline";

/**
 * Runs on a chat site: puts a Publish button in every answer's action row
 * (again when the site re-renders it), opens the card, and answers the side
 * panel. Nothing is read from the chat until someone clicks.
 */

const BUTTON_CSS = `
:host { display: inline-flex; vertical-align: middle; }
button {
  all: unset;
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 8px; border-radius: 8px;
  color: inherit; opacity: 0.78; cursor: pointer;
  font: 500 13px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  transition: background-color 120ms ease, opacity 120ms ease;
}
button:hover { opacity: 1; background: rgba(127, 127, 127, 0.14); }
button:focus-visible { outline: 2px solid #7f56d9; outline-offset: 1px; opacity: 1; }
img { width: 15px; height: 15px; display: block; }
`;

function hostIsDark(): boolean {
  for (const element of [document.body, document.documentElement]) {
    if (!element) continue;
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(element).backgroundColor);
    if (!match || match[4] === "0") continue;
    const [r, g, b] = [match[1], match[2], match[3]].map(Number) as [number, number, number];
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

let cardHost: HTMLElement | null = null;
let cardRoot: Root | null = null;

function closeCard(): void {
  cardRoot?.unmount();
  cardHost?.remove();
  cardRoot = null;
  cardHost = null;
}

function openCard(site: SiteAdapter, anchor: AnswerAnchor | null, scope: Scope, trigger: Element | null): void {
  closeCard();
  cardHost = document.createElement("div");
  cardHost.setAttribute("data-opendocs", "card");
  const shadow = cardHost.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${themeCss}\n${cardCss}`;
  const container = document.createElement("div");
  container.className = "od-root od-card";
  container.setAttribute("data-theme", hostIsDark() ? "dark" : "light");
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-labelledby", "od-card-title");

  // Next to the button: below it when there's room, otherwise above.
  const rect = trigger?.getBoundingClientRect();
  if (rect) {
    container.style.left = `${Math.max(12, Math.min(rect.right - 340, window.innerWidth - 352))}px`;
    if (window.innerHeight - rect.bottom > 420) container.style.top = `${rect.bottom + 8}px`;
    else container.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
  } else {
    container.style.top = "16px";
    container.style.right = "16px";
  }

  shadow.append(style, container);
  document.documentElement.append(cardHost);
  cardRoot = createRoot(container);
  cardRoot.render(<Card site={site} anchor={anchor} initialScope={scope} onClose={closeCard} />);
}

function makeButton(site: SiteAdapter, answer: HTMLElement, anchorFor: () => AnswerAnchor | undefined): HTMLElement {
  const host = document.createElement("span");
  host.setAttribute("data-opendocs", "button");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = BUTTON_CSS;
  const button = document.createElement("button");
  button.type = "button";
  button.title = "Publish to OpenDocs: a link and a PDF";
  button.setAttribute("aria-label", "Publish to OpenDocs");
  const mark = document.createElement("img");
  mark.src = MARK_DATA_URL;
  mark.alt = "";
  button.append(mark, document.createTextNode("Publish"));
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const anchor = anchorFor() ?? { answer, ids: [], index: 0, inRow: false, place: () => undefined };
    openCard(site, anchor, "answer", host);
  });
  shadow.append(style, button);
  return host;
}

/**
 * The copy of this script that owns the page. After an update the extension
 * starts a new copy in tabs that were already open; the newest one marks the
 * page as its own, and any older copy (orphaned by the update, or started
 * twice) sees that on its next scan and removes its own buttons.
 */
const OWNER = "data-opendocs-owner";

export function startContent(site: SiteAdapter): void {
  const instance = Math.random().toString(36).slice(2);
  document.documentElement.setAttribute(OWNER, instance);
  for (const stale of Array.from(document.querySelectorAll("[data-opendocs]"))) stale.remove();
  const owned = () => document.documentElement.getAttribute(OWNER) === instance;
  const created = new Set<HTMLElement>();

  const buttons = new WeakMap<HTMLElement, HTMLElement>();
  let anchors: AnswerAnchor[] = [];
  let reportedAnchors = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const scan = () => {
    // Updated, removed or replaced by a newer copy: stop and take this copy's buttons along.
    if (!browser.runtime?.id || !owned()) {
      observer.disconnect();
      clearTimeout(settleTimer);
      for (const node of created) node.remove();
      created.clear();
      return;
    }
    anchors = site.anchors();
    for (const anchor of anchors) {
      const existing = buttons.get(anchor.answer);
      // Placed after the answer earlier, and the row has appeared since (some
      // sites render it on hover): move it into the row.
      if (existing?.isConnected && (existing.dataset.placed === "row" || !anchor.inRow)) continue;
      const button = existing ?? makeButton(site, anchor.answer, () => anchors.find((a) => a.answer === anchor.answer));
      buttons.set(anchor.answer, button);
      created.add(button);
      try {
        anchor.place(button);
        button.dataset.placed = anchor.inRow ? "row" : "after";
      } catch {
        // The row moved under us; the next scan places it.
      }
    }
    // Once the page settles: answers without an action row mean the site changed.
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const settled = anchors.slice(0, -1);
      if (!reportedAnchors && settled.length > 0 && settled.every((a) => !a.inRow)) {
        reportedAnchors = true;
        void send({ type: "failure", site: site.id, stage: "anchors", code: "no_action_row" }).catch(() => undefined);
      }
    }, 8_000);
  };

  let queued = false;
  const observer = new MutationObserver((records) => {
    // Our own buttons and card don't need a rescan.
    if (records.every((r) => (r.target as Element).closest?.("[data-opendocs]"))) return;
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      scan();
    }, 300);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();

  browser.runtime.onMessage.addListener((request: TabRequest, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !owned()) return false;
    if (request.type === "ping") {
      sendResponse({ site: site.id, chat: site.chatId() !== null, answers: site.hasAnswers() });
      return false;
    }
    if (request.type === "publish-from-panel") {
      if (!site.hasAnswers()) {
        sendResponse({ opened: false });
        return false;
      }
      openCard(site, null, request.scope === "chat" ? "chat" : "answer", null);
      sendResponse({ opened: true });
    }
    return false;
  });
}
