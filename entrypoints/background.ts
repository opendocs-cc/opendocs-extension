import { browser, type Browser } from "wxt/browser";
import { reportFailure } from "../src/api/opendocs";
import { authState, chooseDestination, destinationChoices, signInAndClaim, signOutEverywhere } from "../src/background/account";
import { openDownload, publishDraft } from "../src/background/publish";
import { config } from "../src/config";
import { envelope, type Request, type Responses } from "../src/messages";
import { findRecord, getRecords, getSettings, setSettings } from "../src/store/local";

/**
 * The service worker: the only part of the extension that holds tokens or
 * talks to OpenDocs. Content scripts and pages ask it through messages.
 */

/** Failure pings sent recently (site:stage:code), so a broken site sends one, not one per click. */
const recentFailures = new Map<string, number>();

async function handle(request: Request, sender: Browser.runtime.MessageSender): Promise<Responses[Request["type"]]> {
  switch (request.type) {
    case "auth-state":
      return authState();
    case "sign-in":
      return signInAndClaim();
    case "sign-out":
      return signOutEverywhere();
    case "publish":
      return publishDraft(request.draft, request.mode);
    case "previous":
      return findRecord(request.sourceKey);
    case "recent":
      return getRecords();
    case "download":
      await openDownload(request.record, request.format);
      return { opened: true };
    case "destinations":
      return destinationChoices();
    case "set-destination":
      return chooseDestination(request.destination);
    case "settings":
      return getSettings();
    case "set-settings":
      return setSettings(request.settings);
    case "open-side-panel": {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return { opened: false };
      try {
        await browser.sidePanel.open({ tabId });
        return { opened: true };
      } catch {
        return { opened: false };
      }
    }
    case "failure": {
      const key = `${request.site}:${request.stage}:${request.code}`;
      const last = recentFailures.get(key) ?? 0;
      if (Date.now() - last < 10 * 60_000) return { sent: false };
      recentFailures.set(key, Date.now());
      return { sent: await reportFailure(request.site, request.stage, request.code, request.extractor) };
    }
  }
}

/**
 * Chrome runs declared content scripts only in pages loaded after the
 * extension is installed or updated. Chat tabs that were already open get
 * them here, so the Publish button shows up without a reload.
 */
async function startInOpenTabs(): Promise<void> {
  for (const script of browser.runtime.getManifest().content_scripts ?? []) {
    if (!script.js?.length || !script.matches?.length) continue;
    const tabs = await browser.tabs.query({ url: script.matches }).catch(() => []);
    for (const tab of tabs) {
      if (tab.id === undefined || tab.discarded) continue;
      await browser.scripting
        .executeScript({ target: { tabId: tab.id }, files: script.js } as Parameters<typeof browser.scripting.executeScript>[0])
        .catch(() => undefined);
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
    // Only this extension's own pages and content scripts.
    if (sender.id !== browser.runtime.id) return false;
    void envelope(handle(request, sender)).then(sendResponse);
    return true;
  });

  // The toolbar icon opens the side panel.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

  browser.runtime.onInstalled.addListener((details) => {
    // Tokens stay out of reach of content scripts.
    void browser.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" })?.catch(() => undefined);
    void browser.runtime.setUninstallURL(`${config.webUrl}/extension/uninstalled`).catch(() => undefined);
    if (details.reason === "install" || details.reason === "update") void startInOpenTabs();
    if (details.reason === "install") void browser.tabs.create({ url: browser.runtime.getURL("/welcome.html") });
  });
});
