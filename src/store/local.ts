import { browser } from "wxt/browser";
import type { PublishRecord, Settings, Visibility } from "../types";

/**
 * What the extension keeps in the browser (storage.local): settings, the 20
 * most recent publishes (which also let "update the same document" find the
 * document, and hold the claim tokens of anonymous ones), and a count of
 * publishes for the rating prompt. Never chat content.
 */

const SETTINGS_KEY = "settings";
const RECORDS_KEY = "publishes";
const VISIBILITY_KEY = "visibility";
const RATING_KEY = "rating";
const MAX_RECORDS = 20;
/** The card asks for a store rating from this publish on. */
const ASK_TO_RATE_FROM = 3;

const DEFAULT_SETTINGS: Settings = { consented: false, includeQuestion: false };

export async function getSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getVisibility(): Promise<Visibility> {
  const stored = (await browser.storage.local.get(VISIBILITY_KEY))[VISIBILITY_KEY];
  return stored === "private" || stored === "public" ? stored : "workspace";
}

export async function setVisibility(visibility: Visibility): Promise<void> {
  await browser.storage.local.set({ [VISIBILITY_KEY]: visibility });
}

function isLive(record: PublishRecord): boolean {
  return record.kind !== "anonymous" || new Date(record.expiresAt).getTime() > Date.now();
}

export async function getRecords(): Promise<PublishRecord[]> {
  const stored = ((await browser.storage.local.get(RECORDS_KEY))[RECORDS_KEY] as PublishRecord[] | undefined) ?? [];
  return stored.filter(isLive);
}

export async function saveRecord(record: PublishRecord): Promise<void> {
  const others = (await getRecords()).filter((r) => r.sourceKey !== record.sourceKey);
  await browser.storage.local.set({ [RECORDS_KEY]: [record, ...others].slice(0, MAX_RECORDS) });
}

export async function replaceRecords(records: PublishRecord[]): Promise<void> {
  await browser.storage.local.set({ [RECORDS_KEY]: records.slice(0, MAX_RECORDS) });
}

export async function findRecord(sourceKey: string): Promise<PublishRecord | null> {
  return (await getRecords()).find((r) => r.sourceKey === sourceKey) ?? null;
}

type RatingPrompt = { publishes: number; answered: boolean };

async function getRatingPrompt(): Promise<RatingPrompt> {
  const stored = (await browser.storage.local.get(RATING_KEY))[RATING_KEY] as Partial<RatingPrompt> | undefined;
  return { publishes: 0, answered: false, ...stored };
}

/** Counts a publish. True when the card should ask for a rating. */
export async function countPublish(): Promise<boolean> {
  const prompt = await getRatingPrompt();
  const next = { ...prompt, publishes: prompt.publishes + 1 };
  await browser.storage.local.set({ [RATING_KEY]: next });
  return !next.answered && next.publishes >= ASK_TO_RATE_FROM;
}

/** The user rated or said no: don't ask again. */
export async function answerRatingPrompt(): Promise<void> {
  await browser.storage.local.set({ [RATING_KEY]: { ...(await getRatingPrompt()), answered: true } });
}
